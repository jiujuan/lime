import fs from "node:fs";
import path from "node:path";

const HASH_RE = /^sha256:[a-f0-9]{64}$/;

const PRIVATE_KEY_ENV_NAMES = [
  "PLUGIN_SIGNING_PRIVATE_KEY_PEM",
  "AGENT_APP_SIGNING_PRIVATE_KEY_PEM",
];

const PRIVATE_KEY_FILE_ENV_NAMES = [
  "PLUGIN_SIGNING_PRIVATE_KEY_FILE",
  "AGENT_APP_SIGNING_PRIVATE_KEY_FILE",
];

function firstConfiguredEnv(env, names) {
  return names.find((name) => Boolean(String(env[name] || "").trim())) || "";
}

function configuredPrivateKeyFile(input, env) {
  if (input.signingPrivateKeyFile) {
    return {
      envName: null,
      path: path.resolve(process.cwd(), input.signingPrivateKeyFile),
    };
  }
  const envName = firstConfiguredEnv(env, PRIVATE_KEY_FILE_ENV_NAMES);
  const filePath = envName ? String(env[envName] || "").trim() : "";
  return {
    envName: envName || null,
    path: filePath ? path.resolve(process.cwd(), filePath) : "",
  };
}

function configuredPrivateKey(input, env) {
  const envName =
    input.signingPrivateKeyEnv ||
    firstConfiguredEnv(env, PRIVATE_KEY_ENV_NAMES);
  const file = configuredPrivateKeyFile(input, env);
  return {
    envName: envName || null,
    envConfigured: Boolean(envName && String(env[envName] || "").trim()),
    fileEnvName: file.envName,
    filePath: file.path || null,
    filePresent: Boolean(file.path && fs.existsSync(file.path)),
  };
}

function studioReleaseReadiness(studioDryRun) {
  return studioDryRun?.releaseReadiness || {};
}

function studioChecks(studioDryRun) {
  return studioReleaseReadiness(studioDryRun).checks || {};
}

function studioPackage(studioDryRun) {
  return studioChecks(studioDryRun).package || {};
}

function studioManifest(studioDryRun) {
  return studioChecks(studioDryRun).manifest || {};
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

function pathStatus(filePath) {
  return {
    path: filePath || null,
    present: Boolean(filePath && fs.existsSync(filePath)),
  };
}

export function buildContentFactoryProductionSigningProofPlan(input = {}) {
  const requested = input.generateSignatureProof === true;
  const contentFactoryDir = path.resolve(input.contentFactoryDir || ".");
  const packageUrl =
    input.packageUrl || input.env?.CONTENT_FACTORY_PACKAGE_URL || "";
  const releaseReadiness = studioReleaseReadiness(input.studioDryRun);
  const packageCheck = studioPackage(input.studioDryRun);
  const manifestCheck = studioManifest(input.studioDryRun);
  const appId =
    releaseReadiness.appId ||
    input.studioDryRun?.plan?.appId ||
    input.appId ||
    "content-factory-app";
  const version =
    packageCheck.version ||
    input.studioDryRun?.plan?.version ||
    input.expectedVersion ||
    "";
  const packageHash = String(packageCheck.packageHash || "").toLowerCase();
  const manifestHash = String(manifestCheck.manifestHash || "").toLowerCase();
  const releaseId = String(input.releaseId || "").trim();
  const publicKeyId = String(input.publicKeyId || "").trim();
  const signatureRef =
    input.signatureRef || `sigstore:${appId}@${version}:${releaseId}`;
  const scriptPath = path.join(
    contentFactoryDir,
    "scripts",
    "sign-release.mjs",
  );
  const appSignaturePath = path.resolve(
    input.appSignaturePath ||
      path.join(contentFactoryDir, "app.signature.yaml"),
  );
  const trustRootPath = path.resolve(
    input.trustRootPath ||
      path.join(contentFactoryDir, "plugin-signature-trust-root.json"),
  );
  const privateKey = configuredPrivateKey(input, input.env || process.env);

  const missingKeys = [];
  if (!fs.existsSync(scriptPath)) missingKeys.push("signScript");
  if (!packageUrl || !isRemoteHttpsUrl(packageUrl))
    missingKeys.push("packageUrl");
  if (!releaseId) missingKeys.push("releaseId");
  if (!publicKeyId) missingKeys.push("publicKeyId");
  if (!HASH_RE.test(packageHash)) missingKeys.push("packageHash");
  if (!HASH_RE.test(manifestHash)) missingKeys.push("manifestHash");
  if (!version) missingKeys.push("version");
  if (releaseId && !signatureRef.endsWith(`:${releaseId}`)) {
    missingKeys.push("signatureRefReleaseBinding");
  }
  if (!privateKey.envConfigured && !privateKey.filePresent) {
    missingKeys.push("signingPrivateKey");
  }

  const base = {
    appId,
    inputs: {
      packageHashPresent: HASH_RE.test(packageHash),
      packageUrlRemoteHttps: isRemoteHttpsUrl(packageUrl),
      privateKey: {
        envName: privateKey.envName,
        envConfigured: privateKey.envConfigured,
        fileEnvName: privateKey.fileEnvName,
        filePathConfigured: Boolean(privateKey.filePath),
        filePresent: privateKey.filePresent,
      },
      publicKeyIdConfigured: Boolean(publicKeyId),
      releaseIdConfigured: Boolean(releaseId),
      manifestHashPresent: HASH_RE.test(manifestHash),
      signScriptPresent: fs.existsSync(scriptPath),
      versionConfigured: Boolean(version),
    },
    missingKeys,
    outputs: {
      appSignature: pathStatus(appSignaturePath),
      trustRoot: pathStatus(trustRootPath),
    },
    packageHash: HASH_RE.test(packageHash) ? packageHash : null,
    requested,
    releaseId: releaseId || null,
    publicKeyId: publicKeyId || null,
    scriptPath,
    signatureRef: releaseId ? signatureRef : null,
    status: requested ? "blocked" : "skipped",
    version: version || null,
  };

  if (!requested) {
    return {
      ...base,
      executable: false,
      skippedReason: "not_requested",
    };
  }

  if (missingKeys.length > 0) {
    return {
      ...base,
      executable: false,
      skippedReason: "missing_inputs",
    };
  }

  const args = [
    scriptPath,
    "--root",
    contentFactoryDir,
    "--package-url",
    packageUrl,
    "--package-hash",
    packageHash,
    "--manifest-hash",
    manifestHash,
    "--release-id",
    releaseId,
    "--signature-ref",
    signatureRef,
    "--public-key-id",
    publicKeyId,
    "--channel",
    input.channel || "stable",
    "--out",
    appSignaturePath,
    "--trust-root-out",
    trustRootPath,
  ];
  if (input.signatureAlgorithm) {
    args.push("--algorithm", input.signatureAlgorithm);
  }
  if (input.signedAt) {
    args.push("--signed-at", input.signedAt);
  }
  if (privateKey.filePresent) {
    args.push("--private-key-file", privateKey.filePath);
  } else {
    args.push("--private-key-env", privateKey.envName);
  }

  return {
    ...base,
    args,
    executable: true,
    skippedReason: null,
    status: "ready_to_run",
  };
}

export function completeContentFactoryProductionSigningProofPlan(plan, step) {
  if (!plan.requested || !plan.executable) return plan;
  const appSignature = pathStatus(plan.outputs.appSignature.path);
  const trustRoot = pathStatus(plan.outputs.trustRoot.path);
  const outputsReady = appSignature.present && trustRoot.present;
  const commandOk = Boolean(step?.ok);
  return {
    ...plan,
    commandOk,
    executed: true,
    outputs: {
      appSignature,
      trustRoot,
    },
    status: commandOk && outputsReady ? "ready" : "blocked",
  };
}
