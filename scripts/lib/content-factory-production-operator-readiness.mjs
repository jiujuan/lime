import fs from "node:fs";
import path from "node:path";

function firstConfiguredEnv(env, names) {
  return names.find((name) => Boolean(String(env[name] || "").trim())) || "";
}

function inputPathStatus(value, resolvedPath = "") {
  const pathValue = value ? path.resolve(process.cwd(), value) : resolvedPath;
  return {
    configured: Boolean(value || resolvedPath),
    path: pathValue || null,
    present: Boolean(pathValue && fs.existsSync(pathValue)),
  };
}

function isRemoteHttpsUrl(value) {
  try {
    const url = new URL(String(value || ""));
    const host = url.hostname.toLowerCase();
    return (
      url.protocol === "https:" &&
      !["localhost", "127.0.0.1", "::1"].includes(host)
    );
  } catch {
    return false;
  }
}

function commandQuote(value) {
  const text = String(value || "");
  if (!text) return '""';
  return `"${text.replace(/(["\\$`])/g, "\\$1")}"`;
}

function buildOperatorCommandHint({ channel, expectedVersion }) {
  const args = [
    "npm run plugin:content-factory-production-readiness-pipeline --",
    "--expected-version",
    expectedVersion || "<version>",
    "--channel",
    channel || "stable",
    "--app-signature",
    "<app.signature.yaml>",
    "--trust-root",
    "<plugin-signature-trust-root.json>",
    "--package-url",
    "<https-url>",
    "--release-id",
    "<release-id>",
    "--public-key-id",
    "<public-key-id>",
    "--tenant-id",
    "<tenant-id>",
    "--api-base",
    "<api-base>",
    "--studio-token-env",
    "LIME_AGENT_APP_STUDIO_TOKEN",
    "--fetch-production-release-evidence",
    "--fetch-cloud-from-catalog",
    "--gui-evidence",
    "<gui-evidence.json>",
  ];
  return `LIME_AGENT_APP_STUDIO_TOKEN=<token> ${args.join(" ")}`;
}

function operatorMissingKeys(inputs) {
  const missing = [];
  if (!inputs.appSignature.present) missing.push("appSignature");
  if (!inputs.appSignature.present && !inputs.signingPrivateKey.configured) {
    missing.push("signingPrivateKey");
  }
  if (!inputs.appSignature.present && !inputs.releaseId.configured) {
    missing.push("releaseId");
  }
  if (!inputs.appSignature.present && !inputs.publicKeyId.configured) {
    missing.push("publicKeyId");
  }
  if (!inputs.trustRoot.present) missing.push("trustRoot");
  if (!inputs.packageUrl.remoteHttps) missing.push("packageUrl");
  if (!inputs.tenantId.configured) missing.push("tenantId");
  if (!inputs.apiBase.configured) missing.push("apiBase");
  if (!inputs.studioToken.configured) missing.push("studioToken");
  if (!inputs.catalog.present) missing.push("catalog");
  if (!inputs.bootstrap.present) missing.push("bootstrap");
  if (!inputs.fetchCloudEvidence.present) missing.push("fetchCloudEvidence");
  if (!inputs.guiEvidence.present) missing.push("guiEvidence");
  return missing;
}

function operatorMissingAction(key) {
  const actions = {
    apiBase:
      "Pass --api-base <api-base> or set LIME_AGENT_APP_STUDIO_API_BASE / LIMECORE_API_BASE_URL / LIMECORE_API_BASE.",
    appSignature:
      "Generate app.signature.yaml with content-factory-app/scripts/sign-release.mjs using a production private key, package hashes, and the final HTTPS package URL.",
    bootstrap:
      "Run --fetch-production-release-evidence after bulk publish, or provide production bootstrap JSON with pluginSignatureTrustRoots.",
    catalog:
      "Run --fetch-production-release-evidence after current bulk publish, or provide real production catalog/client plugins JSON.",
    fetchCloudEvidence:
      "Run the pipeline with --fetch-production-release-evidence --fetch-cloud-from-catalog so current App Server pluginPackage/fetchCloud writes verified evidence.",
    guiEvidence:
      "Install the production cloud_release in real Lime Desktop and run content-factory-production-gui-evidence with Electron CDP.",
    packageUrl:
      "Upload the .lapp to production HTTPS storage/CDN and pass --package-url <https-url>.",
    publicKeyId:
      "Pass --public-key-id <public-key-id>; it must match the production trust root that verifies app.signature.yaml.",
    releaseId:
      "Pass --release-id <release-id>; it must be bound into app.signature.yaml and production catalog signatureProof.",
    signingPrivateKey:
      "Set PLUGIN_SIGNING_PRIVATE_KEY_PEM or AGENT_APP_SIGNING_PRIVATE_KEY_PEM only in the local shell when generating app.signature.yaml; never write the key to evidence.",
    studioToken:
      "Set a local token env var and pass --studio-token-env <ENV_NAME>; the token value is only forwarded to child commands.",
    tenantId:
      "Pass --tenant-id <tenant-id> or set LIMECORE_TENANT_ID / LIME_CLOUD_TENANT_ID.",
    trustRoot:
      "Generate plugin-signature-trust-root.json from the same signing command and publish its publicKey through production bootstrap trust roots.",
  };
  return (
    actions[key] ||
    "Provide the missing production input and rerun the read-only pipeline."
  );
}

function buildSigningCommandHint({
  channel,
  contentFactoryDir,
  expectedVersion,
  preflight,
  publicKeyId,
  releaseId,
}) {
  const signScript = path.join(
    contentFactoryDir,
    "scripts",
    "sign-release.mjs",
  );
  const appId = preflight?.appId || "content-factory-app";
  const version = preflight?.package?.version || expectedVersion || "<version>";
  const packageHash =
    preflight?.package?.packageHash || "sha256:<package-sha256>";
  const manifestHash =
    preflight?.package?.manifestHash ||
    preflight?.appServerInspect?.manifestHash ||
    "sha256:<manifest-sha256>";
  const normalizedReleaseId = String(releaseId || "").trim();
  const normalizedPublicKeyId = String(publicKeyId || "").trim();
  const releaseIdValue = normalizedReleaseId || "<release-id>";
  const publicKeyIdValue = normalizedPublicKeyId || "<public-key-id>";
  const signatureRef = `sigstore:${appId}@${version}:${releaseIdValue}`;
  const command = [
    "PLUGIN_SIGNING_PRIVATE_KEY_PEM=<private-key>",
    "node",
    commandQuote(signScript),
    "--root",
    commandQuote(contentFactoryDir),
    "--package-url",
    "<https-url>",
    "--package-hash",
    packageHash,
    "--manifest-hash",
    manifestHash,
    "--release-id",
    releaseIdValue,
    "--signature-ref",
    signatureRef,
    "--public-key-id",
    publicKeyIdValue,
    "--channel",
    channel || "stable",
    "--out",
    commandQuote(path.join(contentFactoryDir, "app.signature.yaml")),
    "--trust-root-out",
    commandQuote(
      path.join(contentFactoryDir, "plugin-signature-trust-root.json"),
    ),
  ];
  return {
    appId,
    command: command.join(" "),
    hasCurrentHashes:
      /^sha256:[a-f0-9]{64}$/.test(packageHash) &&
      /^sha256:[a-f0-9]{64}$/.test(manifestHash),
    manifestHash,
    packageHash,
    publicKeyId: normalizedPublicKeyId || null,
    releaseId: normalizedReleaseId || null,
    scriptPath: signScript,
    scriptPresent: fs.existsSync(signScript),
    version,
  };
}

function signingPrivateKeyInputStatus(input, baseEnv) {
  const envName =
    input.signingPrivateKeyEnv ||
    firstConfiguredEnv(baseEnv, [
      "PLUGIN_SIGNING_PRIVATE_KEY_PEM",
      "AGENT_APP_SIGNING_PRIVATE_KEY_PEM",
    ]);
  const fileEnvName = firstConfiguredEnv(baseEnv, [
    "PLUGIN_SIGNING_PRIVATE_KEY_FILE",
    "AGENT_APP_SIGNING_PRIVATE_KEY_FILE",
  ]);
  const filePath = input.signingPrivateKeyFile || baseEnv[fileEnvName] || "";
  const filePresent = Boolean(filePath && fs.existsSync(filePath));
  const envConfigured = Boolean(
    envName && String(baseEnv[envName] || "").trim(),
  );
  return {
    configured: envConfigured || filePresent,
    envConfigured,
    envName: envName || null,
    fileEnvName: fileEnvName || null,
    filePathConfigured: Boolean(filePath),
    filePresent,
  };
}

export function buildOperatorReadiness({
  appSignaturePath,
  baseEnv,
  bootstrapPath,
  catalogPath,
  channel,
  expectedVersion,
  fetchCloudPath,
  guiEvidencePath,
  input,
  preflight,
  trustRootPath,
  contentFactoryDir,
}) {
  const packageUrlValue =
    input.packageUrl || baseEnv.CONTENT_FACTORY_PACKAGE_URL || "";
  const studioTokenEnvName =
    input.studioTokenEnv ||
    firstConfiguredEnv(baseEnv, ["LIME_AGENT_APP_STUDIO_TOKEN"]);
  const tenantEnvName = firstConfiguredEnv(baseEnv, [
    "LIMECORE_TENANT_ID",
    "LIME_CLOUD_TENANT_ID",
  ]);
  const apiBaseEnvName = firstConfiguredEnv(baseEnv, [
    "LIME_AGENT_APP_STUDIO_API_BASE",
    "LIMECORE_API_BASE_URL",
    "LIMECORE_API_BASE",
  ]);
  const signingPrivateKey = signingPrivateKeyInputStatus(input, baseEnv);
  const inputs = {
    apiBase: {
      configured: Boolean(input.apiBase || apiBaseEnvName),
      envName: input.apiBase ? null : apiBaseEnvName || null,
    },
    bootstrap: inputPathStatus(input.bootstrapPath, bootstrapPath),
    catalog: inputPathStatus(input.catalogPath, catalogPath),
    fetchCloudEvidence: inputPathStatus(input.fetchCloudPath, fetchCloudPath),
    guiEvidence: inputPathStatus(input.guiEvidencePath, guiEvidencePath),
    packageUrl: {
      configured: Boolean(String(packageUrlValue).trim()),
      remoteHttps: isRemoteHttpsUrl(packageUrlValue),
    },
    publicKeyId: {
      configured: Boolean(String(input.publicKeyId || "").trim()),
    },
    releaseId: {
      configured: Boolean(String(input.releaseId || "").trim()),
    },
    signingPrivateKey,
    studioToken: {
      configured: Boolean(
        studioTokenEnvName && String(baseEnv[studioTokenEnvName] || "").trim(),
      ),
      envName: studioTokenEnvName || null,
    },
    tenantId: {
      configured: Boolean(input.tenantId || tenantEnvName),
      envName: input.tenantId ? null : tenantEnvName || null,
    },
    appSignature: inputPathStatus(input.appSignaturePath, appSignaturePath),
    trustRoot: inputPathStatus(input.trustRootPath, trustRootPath),
  };
  const missingKeys = operatorMissingKeys(inputs);
  return {
    commandHint: buildOperatorCommandHint({ channel, expectedVersion }),
    inputs,
    missingActions: missingKeys.map((key) => ({
      action: operatorMissingAction(key),
      key,
    })),
    missingKeys,
    note: "Operator readiness only records configured booleans, env names, and local evidence file presence. It never copies package URLs, tokens, private keys, public keys, signatures, or production API responses.",
    ready: missingKeys.length === 0,
    signingCommandHint: buildSigningCommandHint({
      channel,
      contentFactoryDir,
      expectedVersion,
      preflight,
      publicKeyId: input.publicKeyId || "",
      releaseId: input.releaseId || "",
    }),
  };
}
