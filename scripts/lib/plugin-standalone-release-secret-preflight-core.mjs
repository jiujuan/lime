import fs from "node:fs";
import path from "node:path";

function valuePresent(value) {
  return String(value ?? "").trim().length > 0;
}

function firstPresentKey(env, keys) {
  return keys.find((key) => valuePresent(env[key]));
}

function secretRule({ aliases = [], category, key, reason }) {
  return { aliases, category, key, reason };
}

function baseRules({ channel, remoteUpload }) {
  const rules = [];
  if (channel === "stable") {
    rules.push(
      secretRule({
        key: "LIME_PLUGIN_PREVIOUS_RELEASE_REF",
        category: "rollback",
        reason:
          "Stable channel release requires a previous release ref for rollback.",
      }),
    );
  }
  if (remoteUpload) {
    rules.push(
      secretRule({
        key: "LIME_PLUGIN_RELEASE_UPLOAD_TOKEN",
        category: "remote_upload",
        reason:
          "Remote updater/artifact upload requires an explicit upload token.",
      }),
    );
  }
  return rules;
}

function macosRules() {
  return [
    secretRule({
      key: "APPLE_CERTIFICATE",
      category: "macos_signing",
      reason: "CI must import a Developer ID certificate before codesign.",
    }),
    secretRule({
      key: "APPLE_CERTIFICATE_PASSWORD",
      category: "macos_signing",
      reason: "CI must unlock the imported Apple certificate.",
    }),
    secretRule({
      key: "APPLE_SIGNING_IDENTITY",
      category: "macos_signing",
      reason: "codesign requires a Developer ID Application identity ref.",
    }),
    secretRule({
      key: "APPLE_ID",
      category: "macos_notarization",
      reason:
        "notarytool authentication requires an Apple ID or equivalent profile.",
    }),
    secretRule({
      key: "APPLE_PASSWORD",
      category: "macos_notarization",
      reason:
        "notarytool authentication requires an app-specific password or equivalent profile.",
    }),
    secretRule({
      key: "APPLE_TEAM_ID",
      category: "macos_notarization",
      reason:
        "notarytool authentication must be scoped to the Apple Developer Team.",
    }),
  ];
}

function windowsRules() {
  return [
    secretRule({
      key: "WINDOWS_SIGNING_CERTIFICATE",
      category: "windows_signing",
      reason: "Windows installer release requires a code signing certificate.",
    }),
    secretRule({
      key: "WINDOWS_SIGNING_CERTIFICATE_PASSWORD",
      category: "windows_signing",
      reason: "Windows signing certificate must be unlocked in CI.",
    }),
  ];
}

function rulesFor(input) {
  const platform = input.platform ?? "macos";
  const channel = input.channel ?? "stable";
  const remoteUpload = Boolean(input.remoteUpload);
  const rules = baseRules({ channel, remoteUpload });
  if (platform === "macos" || platform === "all") {
    rules.push(...macosRules());
  }
  if (platform === "windows" || platform === "all") {
    rules.push(...windowsRules());
  }
  return rules;
}

function configurationIssuesFor(input) {
  const platform = input.platform ?? "macos";
  const packageFormat = input.packageFormat ?? "app";
  if (
    (platform === "macos" || platform === "all") &&
    !["app", "dmg"].includes(packageFormat)
  ) {
    return [
      {
        code: "PACKAGE_FORMAT_UNSUPPORTED",
        message:
          "macOS Forge release preflight only supports app or dmg package formats.",
        details: { packageFormat },
      },
    ];
  }
  return [];
}

export function buildStandaloneReleaseSecretPreflight(input = {}) {
  const env = input.env ?? process.env;
  const rules = rulesFor(input);
  const configurationIssues = configurationIssuesFor(input);
  const missingSecrets = [];
  const presentSecretKeys = [];

  for (const rule of rules) {
    const keys = [rule.key, ...rule.aliases];
    const present = firstPresentKey(env, keys);
    if (present) {
      presentSecretKeys.push({
        key: present,
        canonicalKey: rule.key,
        category: rule.category,
      });
      continue;
    }
    missingSecrets.push({
      key: rule.key,
      aliases: rule.aliases,
      category: rule.category,
      reason: rule.reason,
    });
  }

  return {
    schemaVersion: 1,
    status:
      missingSecrets.length === 0 && configurationIssues.length === 0
        ? "ready"
        : "blocked",
    ready: missingSecrets.length === 0 && configurationIssues.length === 0,
    platform: input.platform ?? "macos",
    packageFormat: input.packageFormat ?? "app",
    channel: input.channel ?? "stable",
    remoteUpload: Boolean(input.remoteUpload),
    presentSecretKeys,
    missingSecrets,
    configurationIssues,
    checkedSecretCount: rules.length,
    note: "This preflight records only secret names and categories. It never serializes secret values.",
  };
}

export function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
