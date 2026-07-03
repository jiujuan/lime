import fs from "node:fs";
import path from "node:path";

const CONNECTOR_RULES = {
  notion: [
    {
      category: "oauth_handshake",
      key: "LIME_PLUGIN_NOTION_OAUTH_CLIENT_ID",
      aliases: ["NOTION_OAUTH_CLIENT_ID"],
      reason: "Notion production delivery needs a Host-owned OAuth client id.",
    },
    {
      category: "oauth_handshake",
      key: "LIME_PLUGIN_NOTION_OAUTH_CLIENT_SECRET",
      aliases: ["NOTION_OAUTH_CLIENT_SECRET"],
      reason: "Notion OAuth must keep the client secret in Host/CI secrets.",
    },
    {
      category: "production_delivery",
      key: "LIME_PLUGIN_NOTION_WORKSPACE_ID",
      aliases: ["NOTION_WORKSPACE_ID"],
      reason: "Notion delivery proof must target a real workspace, not a local webhook.",
    },
  ],
  slack: [
    {
      category: "oauth_handshake",
      key: "LIME_PLUGIN_SLACK_OAUTH_CLIENT_ID",
      aliases: ["SLACK_CLIENT_ID", "SLACK_OAUTH_CLIENT_ID"],
      reason: "Slack production delivery needs a Host-owned OAuth client id.",
    },
    {
      category: "oauth_handshake",
      key: "LIME_PLUGIN_SLACK_OAUTH_CLIENT_SECRET",
      aliases: ["SLACK_CLIENT_SECRET", "SLACK_OAUTH_CLIENT_SECRET"],
      reason: "Slack OAuth must keep the client secret in Host/CI secrets.",
    },
    {
      category: "production_delivery",
      key: "LIME_PLUGIN_SLACK_BOT_TOKEN",
      aliases: ["SLACK_BOT_TOKEN"],
      reason: "Slack delivery proof needs a bot token or equivalent Host-managed lease.",
    },
  ],
  feishu: [
    {
      category: "oauth_handshake",
      key: "LIME_PLUGIN_FEISHU_APP_ID",
      aliases: ["FEISHU_APP_ID", "LARK_APP_ID"],
      reason: "Feishu/Lark production delivery needs a Host-owned app id.",
    },
    {
      category: "oauth_handshake",
      key: "LIME_PLUGIN_FEISHU_APP_SECRET",
      aliases: ["FEISHU_APP_SECRET", "LARK_APP_SECRET"],
      reason: "Feishu/Lark app secret must stay in Host/CI secrets.",
    },
    {
      category: "production_delivery",
      key: "LIME_PLUGIN_FEISHU_TENANT_KEY",
      aliases: ["FEISHU_TENANT_KEY", "LARK_TENANT_KEY"],
      reason: "Feishu/Lark delivery proof must target a real tenant.",
    },
  ],
  webhook: [
    {
      category: "production_delivery",
      key: "LIME_PLUGIN_CONNECTOR_WEBHOOK_URL",
      aliases: ["LIME_PLUGIN_CONNECTOR_WEBHOOK_URL_FILE"],
      valueKind: "remote_webhook_url",
      reason: "Remote webhook proof needs an env/file secret source, never a raw CLI URL.",
    },
  ],
};

function valuePresent(value) {
  return String(value ?? "").trim().length > 0;
}

function safeReadSecretSourceFile(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      return { ok: false, reason: "file_source_not_file" };
    }
    return { ok: true, value: fs.readFileSync(filePath, "utf8") };
  } catch {
    return { ok: false, reason: "file_source_unreadable" };
  }
}

function isRemoteWebhookUrl(value) {
  try {
    const url = new URL(String(value ?? "").trim());
    if (url.protocol !== "https:") return false;
    const host = String(url.hostname || "").trim().toLowerCase();
    return !["localhost", "127.0.0.1", "::1"].includes(host);
  } catch {
    return false;
  }
}

function validateRuleSecretSource(rule, key, env) {
  const rawValue = env[key];
  if (!valuePresent(rawValue)) return { present: false };
  const sourceType = key.endsWith("_FILE") ? "file" : "env";
  let value = String(rawValue).trim();
  if (sourceType === "file") {
    const fileSource = safeReadSecretSourceFile(value);
    if (!fileSource.ok) {
      return {
        present: false,
        invalidSource: {
          key,
          reason: fileSource.reason,
          sourceType,
        },
      };
    }
    value = fileSource.value;
  }
  if (rule.valueKind === "remote_webhook_url" && !isRemoteWebhookUrl(value)) {
    return {
      present: false,
      invalidSource: {
        key,
        reason: "remote_webhook_url_must_be_https_and_non_local",
        sourceType,
      },
    };
  }
  return { present: true, key, sourceType };
}

function firstValidSecretSource(env, rule) {
  const invalidSources = [];
  for (const key of [rule.key, ...(rule.aliases ?? [])]) {
    const validation = validateRuleSecretSource(rule, key, env);
    if (validation.present) return { ...validation, invalidSources };
    if (validation.invalidSource) invalidSources.push(validation.invalidSource);
  }
  return { present: false, invalidSources };
}

function normalizeConnector(value) {
  return String(value ?? "").trim().toLowerCase();
}

function requestedConnectors(connector) {
  const normalized = normalizeConnector(connector || "all");
  if (normalized === "all") return Object.keys(CONNECTOR_RULES);
  if (!CONNECTOR_RULES[normalized]) {
    throw new Error(
      `Unsupported connector: ${connector}. Supported: ${Object.keys(CONNECTOR_RULES).join(", ")}, all`,
    );
  }
  return [normalized];
}

function buildRules(connector) {
  return requestedConnectors(connector).flatMap((name) =>
    CONNECTOR_RULES[name].map((rule) => ({ ...rule, connector: name })),
  );
}

function summarizeByConnector(items) {
  const summary = {};
  for (const item of items) {
    summary[item.connector] ??= { missing: 0, present: 0 };
    if (item.present) summary[item.connector].present += 1;
    else summary[item.connector].missing += 1;
  }
  return summary;
}

export function buildConnectorProductionPreflight(input = {}) {
  const env = input.env ?? process.env;
  const connector = normalizeConnector(input.connector || "all");
  const rules = buildRules(connector);
  const checked = [];
  const missingSecrets = [];
  const presentSecretKeys = [];

  for (const rule of rules) {
    const present = firstValidSecretSource(env, rule);
    const base = {
      aliases: rule.aliases ?? [],
      category: rule.category,
      connector: rule.connector,
      key: rule.key,
      reason: rule.reason,
      valueKind: rule.valueKind || "secret_name_presence",
    };
    if (present.present) {
      checked.push({ ...base, present: true });
      presentSecretKeys.push({
        canonicalKey: rule.key,
        category: rule.category,
        connector: rule.connector,
        key: present.key,
        sourceType: present.sourceType,
      });
      continue;
    }
    const missing = {
      ...base,
      invalidSources: present.invalidSources,
      present: false,
    };
    checked.push(missing);
    missingSecrets.push(missing);
  }

  return {
    schemaVersion: 1,
    connector,
    status: missingSecrets.length === 0 ? "ready" : "blocked",
    ready: missingSecrets.length === 0,
    productionPlatformDeliveryReady: missingSecrets.length === 0,
    checkedSecretCount: rules.length,
    connectorSummary: summarizeByConnector(checked),
    presentSecretKeys,
    missingSecrets,
    note:
      "This preflight records only secret names and categories. It never serializes secret values, endpoint URLs, tokens, or credential material.",
  };
}

export function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
