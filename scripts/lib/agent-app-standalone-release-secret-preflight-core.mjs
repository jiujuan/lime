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

function baseRules({ channel, remoteUpload, updaterEnabled }) {
  const rules = [];
  if (updaterEnabled) {
    rules.push(
      secretRule({
        key: "TAURI_SIGNING_PRIVATE_KEY",
        aliases: ["TAURI_SIGNING_PRIVATE_KEY_RAW"],
        category: "updater_signing",
        reason: "Updater artifacts must be signed before publishing manifests.",
      }),
      secretRule({
        key: "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
        category: "updater_signing",
        reason: "Updater signing private key must be unlocked in CI.",
      }),
    );
  }
  if (channel === "stable") {
    rules.push(
      secretRule({
        key: "LIME_AGENT_APP_PREVIOUS_RELEASE_REF",
        category: "rollback",
        reason: "Stable channel release requires a previous release ref for rollback.",
      }),
    );
  }
  if (remoteUpload) {
    rules.push(
      secretRule({
        key: "LIME_AGENT_APP_RELEASE_UPLOAD_TOKEN",
        category: "remote_upload",
        reason: "Remote updater/artifact upload requires an explicit upload token.",
      }),
    );
  }
  return rules;
}

function macosRules({ packageFormat }) {
  const rules = [
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
      reason: "notarytool authentication requires an Apple ID or equivalent profile.",
    }),
    secretRule({
      key: "APPLE_PASSWORD",
      category: "macos_notarization",
      reason: "notarytool authentication requires an app-specific password or equivalent profile.",
    }),
    secretRule({
      key: "APPLE_TEAM_ID",
      category: "macos_notarization",
      reason: "notarytool authentication must be scoped to the Apple Developer Team.",
    }),
  ];
  if (packageFormat === "pkg") {
    rules.push(
      secretRule({
        key: "APPLE_INSTALLER_SIGNING_IDENTITY",
        aliases: ["APPLE_SIGNING_IDENTITY_INSTALLER"],
        category: "macos_installer_signing",
        reason: "pkg release requires a Developer ID Installer identity ref.",
      }),
    );
  }
  return rules;
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
  const packageFormat = input.packageFormat ?? "app";
  const channel = input.channel ?? "stable";
  const remoteUpload = Boolean(input.remoteUpload);
  const updaterEnabled = input.updaterEnabled !== false;
  const rules = baseRules({ channel, remoteUpload, updaterEnabled });
  if (platform === "macos" || platform === "all") {
    rules.push(...macosRules({ packageFormat }));
  }
  if (platform === "windows" || platform === "all") {
    rules.push(...windowsRules());
  }
  return rules;
}

export function buildStandaloneReleaseSecretPreflight(input = {}) {
  const env = input.env ?? process.env;
  const rules = rulesFor(input);
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
    status: missingSecrets.length === 0 ? "ready" : "blocked",
    ready: missingSecrets.length === 0,
    platform: input.platform ?? "macos",
    packageFormat: input.packageFormat ?? "app",
    channel: input.channel ?? "stable",
    updaterEnabled: input.updaterEnabled !== false,
    remoteUpload: Boolean(input.remoteUpload),
    presentSecretKeys,
    missingSecrets,
    checkedSecretCount: rules.length,
    note:
      "This preflight records only secret names and categories. It never serializes secret values.",
  };
}

export function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
