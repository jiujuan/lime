import { access, copyFile, cp, mkdir } from "node:fs/promises";
import fs from "node:fs";
import { webcrypto } from "node:crypto";
import os from "node:os";
import path from "node:path";

const APP_ID = "content-factory-app";
const CLOUD_RELEASE_FIXTURE_SIGNATURE_PAYLOAD_SCHEMA =
  "plugin-cloud-release-signature-payload/v2";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function stringField(value, pathSegments) {
  let current = value;
  for (const segment of pathSegments) {
    current = current?.[segment];
  }
  return typeof current === "string" && current.trim() ? current.trim() : "";
}

export async function assertFile(filePath, label) {
  try {
    await access(filePath);
  } catch {
    throw new Error(
      [
        `${label} missing: ${filePath}`,
        label === "app-server binary"
          ? 'Build it first: cargo build --manifest-path "lime-rs/Cargo.toml" -p app-server --bin app-server'
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
}

export async function assertDirectory(dirPath, label) {
  const stat = await fs.promises.stat(dirPath).catch(() => null);
  if (!stat?.isDirectory()) {
    throw new Error(`${label} missing: ${dirPath}`);
  }
}

export function createTempRuntimeEnv() {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "content-factory-current-turn-"),
  );
  const home = path.join(tempRoot, "home");
  const xdgDataHome = path.join(tempRoot, "xdg-data");
  const localAppData = path.join(tempRoot, "local-app-data");
  const roamingAppData = path.join(tempRoot, "roaming-app-data");
  for (const dir of [home, xdgDataHome, localAppData, roamingAppData]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const preferredDataDir = resolveTempPreferredDataDir({
    home,
    xdgDataHome,
    localAppData,
    platform: process.platform,
  });
  const appServerDataDir = path.join(preferredDataDir, "app-server");
  fs.mkdirSync(appServerDataDir, { recursive: true });
  return {
    tempRoot,
    preferredDataDir,
    appServerDataDir,
    env: {
      ...process.env,
      HOME: home,
      XDG_DATA_HOME: xdgDataHome,
      APPDATA: roamingAppData,
      LOCALAPPDATA: localAppData,
    },
  };
}

function resolveTempPreferredDataDir({
  home,
  xdgDataHome,
  localAppData,
  platform,
}) {
  if (platform === "win32") {
    return path.join(localAppData, "lime");
  }
  if (platform === "darwin") {
    return path.join(home, "Library", "Application Support", "lime");
  }
  return path.join(xdgDataHome, "lime");
}

export function buildInstalledState(inspected) {
  const now = new Date().toISOString();
  const appId =
    stringField(inspected.manifest, ["appId"]) ||
    stringField(inspected.manifest, ["name"]) ||
    APP_ID;
  const appVersion =
    stringField(inspected.manifest, ["version"]) ||
    stringField(inspected.pluginManifest, ["version"]) ||
    "0.0.0";
  return {
    schemaVersion: "plugin.installed-state.v1",
    appId,
    installMode: "runtime_backed",
    disabled: false,
    identity: {
      appId,
      appVersion,
      sourceKind: inspected.sourceKind || "local_folder",
      sourceUri: inspected.appDir || inspected.sourceUri,
      packageHash: inspected.packageHash,
      manifestHash: inspected.manifestHash,
      loadedAt: inspected.inspectedAt || now,
    },
    manifest: inspected.manifest,
    setup: {},
    installedAt: now,
    updatedAt: now,
  };
}

export async function buildCloudReleaseFixture(inspected) {
  const now = new Date().toISOString();
  const appId =
    stringField(inspected.manifest, ["appId"]) ||
    stringField(inspected.manifest, ["name"]) ||
    APP_ID;
  const appVersion =
    stringField(inspected.manifest, ["version"]) ||
    stringField(inspected.pluginManifest, ["version"]) ||
    "0.0.0";
  const releaseId = `content-factory-fixture-${appVersion}`;
  const tenantId = "tenant-content-factory-fixture";
  const tenantEnablementRef = "tenant-enable-content-factory-fixture";
  const channel = "fixture";
  const signatureRef = `sigstore:${appId}@${appVersion}:fixture`;
  const packageUrl = `https://updates.limeai.run/plugins/${appId}/fixture/${appId}-${appVersion}.lapp`;
  const proofDraft = {
    schemaVersion: "plugin-cloud-release-signature/v1",
    publicKeyId: "plugin-fixture-root-2026",
    algorithm: "RSASSA-PKCS1-v1_5-SHA256",
    signature: "",
    signedAt: now,
  };
  const keyPair = await webcrypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const publicKey = await webcrypto.subtle.exportKey("spki", keyPair.publicKey);
  const signaturePayload = cloudReleaseSignaturePayload({
    appId,
    appVersion,
    releaseId,
    tenantId,
    tenantEnablementRef,
    channel,
    packageUrl,
    packageHash: inspected.packageHash,
    manifestHash: inspected.manifestHash,
    signatureRef,
    proof: proofDraft,
  });
  const signature = await webcrypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    keyPair.privateKey,
    new TextEncoder().encode(signaturePayload),
  );
  const proof = {
    ...proofDraft,
    signature: Buffer.from(signature).toString("base64"),
  };
  const trustRoot = {
    publicKeyId: proof.publicKeyId,
    algorithm: proof.algorithm,
    publicKey: Buffer.from(publicKey).toString("base64"),
    appIds: [appId],
    notBefore: "2026-01-01T00:00:00.000Z",
    notAfter: "2026-12-31T23:59:59.999Z",
  };
  const verified = await webcrypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    keyPair.publicKey,
    signature,
    new TextEncoder().encode(
      cloudReleaseSignaturePayload({
        appId,
        appVersion,
        releaseId,
        tenantId,
        tenantEnablementRef,
        channel,
        packageUrl,
        packageHash: inspected.packageHash,
        manifestHash: inspected.manifestHash,
        signatureRef,
        proof,
      }),
    ),
  );
  assert(verified, "cloud release fixture signature verification failed");
  return {
    appId,
    appVersion,
    releaseId,
    tenantId,
    tenantEnablementRef,
    channel,
    packageUrl,
    signatureRef,
    signatureProof: proof,
    trustRoot,
    loadedAt: inspected.inspectedAt || now,
  };
}

function cloudReleaseSignaturePayload({
  appId,
  appVersion,
  releaseId,
  tenantId,
  tenantEnablementRef,
  channel,
  packageUrl,
  packageHash,
  manifestHash,
  signatureRef,
  proof,
}) {
  return JSON.stringify({
    schemaVersion: CLOUD_RELEASE_FIXTURE_SIGNATURE_PAYLOAD_SCHEMA,
    appId,
    version: appVersion,
    releaseId,
    tenantId,
    tenantEnablementRef,
    channel,
    packageUrl,
    packageHash: packageHash.toLowerCase(),
    manifestHash: manifestHash.toLowerCase(),
    signatureRef,
    signatureProof: {
      schemaVersion: proof.schemaVersion ?? null,
      publicKeyId: proof.publicKeyId,
      algorithm: proof.algorithm,
      signedAt: proof.signedAt ?? null,
    },
  });
}

export function buildCloudReleaseInstalledState(inspected, cloudRelease) {
  const now = new Date().toISOString();
  return {
    schemaVersion: "plugin.installed-state.v1",
    appId: cloudRelease.appId,
    installMode: "runtime_backed",
    disabled: false,
    identity: {
      appId: cloudRelease.appId,
      appVersion: cloudRelease.appVersion,
      sourceKind: "cloud_release",
      sourceUri: cloudRelease.packageUrl,
      packageHash: inspected.packageHash,
      manifestHash: inspected.manifestHash,
      loadedAt: cloudRelease.loadedAt,
      releaseId: cloudRelease.releaseId,
      tenantId: cloudRelease.tenantId,
      tenantEnablementRef: cloudRelease.tenantEnablementRef,
      channel: cloudRelease.channel,
      signatureRef: cloudRelease.signatureRef,
    },
    manifest: inspected.manifest,
    setup: {
      cloudReleaseEvidence: {
        appId: cloudRelease.appId,
        version: cloudRelease.appVersion,
        catalogSource: "remote",
        sourceKind: "verified_cache",
        packageHashDeclared: true,
        manifestHashDeclared: true,
        signatureDeclared: true,
        declaredPackageHash: inspected.packageHash,
        declaredManifestHash: inspected.manifestHash,
        actualPackageHash: inspected.packageHash,
        actualManifestHash: inspected.manifestHash,
        packageHashMatched: true,
        manifestHashMatched: true,
        signatureRef: cloudRelease.signatureRef,
        signaturePolicy: "required",
        signatureVerificationStatus: "verified",
        packageVerificationStatus: "verified",
        status: "ready",
        blockerCodes: [],
        warningCodes: [],
      },
      cloudReleaseSignature: {
        signatureRef: cloudRelease.signatureRef,
        signatureProof: cloudRelease.signatureProof,
        trustRoot: cloudRelease.trustRoot,
      },
    },
    installedAt: now,
    updatedAt: now,
  };
}

export async function materializeCloudReleasePackageCache({
  sourceDir,
  preferredDataDir,
  packageHash,
}) {
  const cacheDir = path.join(
    preferredDataDir,
    "plugins",
    "packages",
    safeHashPathSegment(packageHash),
  );
  await mkdir(cacheDir, { recursive: true });
  const entries = [
    "package.json",
    "plugin.json",
    "app.boundary.yaml",
    "app.install.yaml",
    "app.operations.yaml",
    "app.requirements.yaml",
    "app.runtime.yaml",
    "app.workbench.yaml",
    "artifacts",
    "cli",
    "clis",
    "connectors",
    "docs",
    "examples",
    "hooks",
    "locales",
    "resources",
    "scripts",
    "skills",
    "src",
    "subagents",
    "workflows",
  ];
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry);
    if (!fs.existsSync(sourcePath)) {
      continue;
    }
    const targetPath = path.join(cacheDir, entry);
    const stat = await fs.promises.stat(sourcePath);
    if (stat.isDirectory()) {
      await cp(sourcePath, targetPath, {
        recursive: true,
        filter: (source) => !isIgnoredPackageCacheSource(source, sourceDir),
      });
    } else {
      await mkdir(path.dirname(targetPath), { recursive: true });
      await copyFile(sourcePath, targetPath);
    }
  }
  return cacheDir;
}

function isIgnoredPackageCacheSource(source, sourceRoot) {
  const relative = path.relative(sourceRoot, source).replace(/\\/g, "/");
  return (
    relative === ".git" ||
    relative.startsWith(".git/") ||
    relative === "dist-package" ||
    relative.startsWith("dist-package/") ||
    relative === "node_modules" ||
    relative.startsWith("node_modules/")
  );
}

function safeHashPathSegment(hash) {
  return String(hash).replace(/:/g, "_");
}

export function evidencePrefixForOptions(options) {
  const suffixes = [];
  if (options.cloudReleaseFixture) {
    suffixes.push("cloud-release");
  }
  if (options.hostGenerationFixture) {
    suffixes.push("host-generation");
  }
  return suffixes.length
    ? `${options.prefix}-${suffixes.join("-")}`
    : options.prefix;
}
