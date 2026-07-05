import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

import {
  SIGNATURE_PROOF_SCHEMA,
  SUPPORTED_SIGNATURE_ALGORITHMS,
  sha256Digest,
  verifyReleaseSignature,
} from "./content-factory-production-signature-verifier.mjs";

const APP_ID = "content-factory-app";
const HASH_RE = /^sha256:[a-f0-9]{64}$/;
const PUBLISH_ENV_REQUIREMENTS = [
  {
    key: "signingPrivateKey",
    env: [
      "PLUGIN_SIGNING_PRIVATE_KEY_PEM",
      "AGENT_APP_SIGNING_PRIVATE_KEY_PEM",
    ],
  },
  {
    key: "studioToken",
    env: ["LIME_AGENT_APP_STUDIO_TOKEN"],
  },
  {
    key: "tenantId",
    env: ["LIMECORE_TENANT_ID", "LIME_CLOUD_TENANT_ID"],
  },
  {
    key: "apiBase",
    env: [
      "LIME_AGENT_APP_STUDIO_API_BASE",
      "LIMECORE_API_BASE_URL",
      "LIMECORE_API_BASE",
    ],
  },
  {
    key: "packageUrl",
    env: ["CONTENT_FACTORY_PACKAGE_URL"],
  },
];
const REQUIRED_RELEASE_FILES = [
  "plugin.json",
  "app.runtime.yaml",
  "app.workbench.yaml",
  "app.operations.yaml",
  "app.requirements.yaml",
  "app.boundary.yaml",
  "app.install.yaml",
  "src/runtime/content-factory-worker.mjs",
  "artifacts/content-factory-workspace-patch.schema.json",
  "examples/workspace-patch.sample.json",
  "examples/runtime-request.sample.json",
  "locales/zh-CN.json",
  "locales/zh-TW.json",
  "locales/en-US.json",
  "locales/ja-JP.json",
  "locales/ko-KR.json",
  "resources/icons/icon.svg",
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function resolveDefaultContentFactoryDir() {
  if (process.env.CONTENT_FACTORY_APP_DIR) {
    return path.resolve(process.env.CONTENT_FACTORY_APP_DIR);
  }
  return path.resolve(
    process.cwd(),
    "..",
    "..",
    "limecloud",
    "content-factory-app",
  );
}

function findEndOfCentralDirectory(buffer) {
  const minOffset = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }
  throw new Error("zip end of central directory not found");
}

function readZipEntries(buffer) {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries = [];
  let offset = centralDirectoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    assert(
      buffer.readUInt32LE(offset) === 0x02014b50,
      "invalid zip central directory",
    );
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const name = buffer
      .subarray(nameStart, nameStart + fileNameLength)
      .toString("utf8")
      .replace(/\\/g, "/");
    entries.push({
      name,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });
    offset = nameStart + fileNameLength + extraLength + commentLength;
  }
  return entries;
}

function findZipEntry(entries, expectedName) {
  return (
    entries.find((entry) => entry.name === expectedName) ??
    entries.find((entry) => entry.name.endsWith(`/${expectedName}`)) ??
    null
  );
}

function extractZipEntry(buffer, entry) {
  const offset = entry.localHeaderOffset;
  assert(
    buffer.readUInt32LE(offset) === 0x04034b50,
    `invalid local header for ${entry.name}`,
  );
  const fileNameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + fileNameLength + extraLength;
  const compressed = buffer.subarray(
    dataStart,
    dataStart + entry.compressedSize,
  );
  if (entry.compressionMethod === 0) return compressed;
  if (entry.compressionMethod === 8) return zlib.inflateRawSync(compressed);
  throw new Error(
    `unsupported zip compression method ${entry.compressionMethod} for ${entry.name}`,
  );
}

function extractZipText(buffer, entries, expectedName) {
  const entry = findZipEntry(entries, expectedName);
  assert(entry, `.lapp missing ${expectedName}`);
  return extractZipEntry(buffer, entry).toString("utf8");
}

function safeZipOutputPath(outputDir, entryName) {
  const outputPath = path.resolve(outputDir, entryName);
  const outputRoot = path.resolve(outputDir);
  if (
    outputPath !== outputRoot &&
    !outputPath.startsWith(`${outputRoot}${path.sep}`)
  ) {
    throw new Error(`unsafe zip entry path: ${entryName}`);
  }
  return outputPath;
}

export function inspectContentFactoryPackageFile(packageFile) {
  const packageBuffer = fs.readFileSync(packageFile);
  const entries = readZipEntries(packageBuffer);
  const pluginJson = JSON.parse(
    extractZipText(packageBuffer, entries, "plugin.json"),
  );
  return {
    appId: pluginJson.id || "",
    entryCount: entries.length,
    missingEntries: REQUIRED_RELEASE_FILES.filter(
      (entry) => !findZipEntry(entries, entry),
    ),
    packageHash: sha256Digest(packageBuffer),
    pluginManifest: pluginJson,
    validZip: true,
    version: pluginJson.version || "",
  };
}

export function extractContentFactoryPackageFile(packageFile, outputDir) {
  const packageBuffer = fs.readFileSync(packageFile);
  const entries = readZipEntries(packageBuffer);
  fs.mkdirSync(outputDir, { recursive: true });
  for (const entry of entries) {
    const outputPath = safeZipOutputPath(outputDir, entry.name);
    if (entry.name.endsWith("/")) {
      fs.mkdirSync(outputPath, { recursive: true });
      continue;
    }
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, extractZipEntry(packageBuffer, entry));
  }
  if (fs.existsSync(path.join(outputDir, "plugin.json"))) {
    return outputDir;
  }
  const matches = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const entryPath = path.join(dir, entry.name);
      if (!entry.isDirectory()) continue;
      if (fs.existsSync(path.join(entryPath, "plugin.json"))) {
        matches.push(entryPath);
      }
      walk(entryPath);
    }
  }
  walk(outputDir);
  if (matches.length !== 1) {
    throw new Error(
      `expected exactly one plugin.json root in .lapp, got ${matches.length}`,
    );
  }
  return matches[0];
}

function defaultPackageFile(contentFactoryDir, version) {
  return path.join(
    contentFactoryDir,
    "dist-package",
    `${APP_ID}-${version}.lapp`,
  );
}

function fileStatus(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return { exists: true, isFile: stat.isFile(), size: stat.size };
  } catch {
    return { exists: false, isFile: false, size: 0 };
  }
}

function readOptionalJson(filePath) {
  if (!filePath) return null;
  if (!fs.existsSync(filePath)) return null;
  return readJsonFile(filePath);
}

function isRemoteHttps(value) {
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

function summarizePublishReadiness(env = process.env) {
  const requirements = PUBLISH_ENV_REQUIREMENTS.map((item) => {
    const configuredEnv = item.env.find((name) =>
      Boolean(String(env[name] || "").trim()),
    );
    const record = {
      configured: Boolean(configuredEnv),
      env: item.env,
      key: item.key,
    };
    if (item.key === "packageUrl") {
      record.remoteHttps = configuredEnv
        ? isRemoteHttps(env[configuredEnv])
        : false;
    }
    return record;
  });
  return {
    configured: requirements.every((item) => {
      if (item.key === "packageUrl") return item.remoteHttps === true;
      return item.configured === true;
    }),
    note: "Non-sensitive operator readiness only. Values are never written to evidence and do not replace catalog/bootstrap/fetchCloud proof.",
    requirements,
  };
}

function parseSignatureYaml(text) {
  if (!text.trim()) return null;
  const field = (name) => {
    const match = text.match(
      new RegExp(`(?:^|\\n)\\s*${name}:[ \\t]*\"?([^\"\\n]+)\"?`),
    );
    return match?.[1]?.trim() || "";
  };
  const proof = {
    algorithm: field("algorithm"),
    payloadHash: field("payloadHash"),
    publicKeyId: field("publicKeyId"),
    schemaVersion: field("schemaVersion"),
    signature: field("signature"),
    signatureRef: field("signatureRef"),
    signedAt: field("signedAt"),
  };
  return Object.values(proof).some(Boolean) ? proof : null;
}

function stringField(root, keys) {
  for (const key of keys) {
    const value = root?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function validIsoDate(value) {
  return Boolean(value) && !Number.isNaN(Date.parse(value));
}

function signatureRefMatchesReleaseId(signatureRef, releaseId) {
  const signatureRefText = String(signatureRef || "").trim();
  const releaseIdText = String(releaseId || "").trim();
  return Boolean(
    signatureRefText &&
    releaseIdText &&
    signatureRefText.endsWith(`:${releaseIdText}`),
  );
}

function summarizeTrustRoot(root) {
  return {
    algorithm: stringField(root, ["algorithm", "alg"]) || null,
    publicKeyPresent: Boolean(
      stringField(root, [
        "publicKey",
        "public_key",
        "publicKeyPem",
        "public_key_pem",
      ]),
    ),
    publicKeyId:
      stringField(root, ["publicKeyId", "public_key_id", "keyId", "key_id"]) ||
      null,
  };
}

function verifierReleaseFromResult(result) {
  return {
    appId: result.package.appId || APP_ID,
    channel: result.catalog.channel,
    manifestHash: result.package.manifestHash,
    packageHash: result.package.packageHash,
    packageUrl: result.catalog.packageUrl,
    releaseId: result.catalog.releaseId,
    signatureRef: result.signature.signatureRef,
    tenantEnablementRef: result.catalog.tenantEnablementRef,
    tenantId: result.catalog.tenantId,
    version: result.package.version || result.expectedVersion,
  };
}

function buildMissing(result) {
  const missing = [];
  const add = (code, detail) => missing.push({ code, detail });
  const addMismatchWhenBoth = (left, right, code, detail) => {
    if (left && right && left !== right) add(code, detail);
  };

  if (!result.package.exists) {
    add("production_package_missing", "dist-package .lapp package is missing.");
  }
  if (result.package.exists && !result.package.validZip) {
    add(
      "production_package_not_readable",
      ".lapp package must be readable ZIP.",
    );
  }
  if (result.package.missingEntries.length > 0) {
    add(
      "production_package_entries_missing",
      `Package is missing required entries: ${result.package.missingEntries.join(", ")}.`,
    );
  }
  if (result.package.appId !== APP_ID) {
    add(
      "production_package_app_id_mismatch",
      `Package plugin.json id must be ${APP_ID}.`,
    );
  }
  if (result.package.version !== result.expectedVersion) {
    add(
      "production_package_version_mismatch",
      "Package plugin.json version must match expected version.",
    );
  }
  if (!HASH_RE.test(result.package.packageHash || "")) {
    add(
      "production_package_hash_invalid",
      "Package hash must be sha256:<64 hex>.",
    );
  }
  if (!HASH_RE.test(result.package.manifestHash || "")) {
    add(
      "production_manifest_hash_invalid",
      "Manifest hash must come from App Server pluginLocalPackage/inspect and use sha256:<64 hex>.",
    );
  }
  if (!result.appServerInspect.present) {
    add(
      "production_app_server_manifest_inspect_missing",
      "Preflight must inspect the extracted .lapp through current App Server pluginLocalPackage/inspect.",
    );
  }
  if (!result.signature.appSignatureYamlPresent) {
    add(
      "production_app_signature_yaml_missing",
      "app.signature.yaml is required before cloud_release can be signed.",
    );
  } else {
    if (!result.signature.signatureRef) {
      add(
        "production_signature_ref_missing",
        "app.signature.yaml must include signatureRef.",
      );
    }
    if (!result.signature.publicKeyId) {
      add(
        "production_signature_public_key_id_missing",
        "app.signature.yaml must include publicKeyId.",
      );
    }
    if (!result.signature.algorithm) {
      add(
        "production_signature_algorithm_missing",
        "app.signature.yaml must include algorithm.",
      );
    } else if (!result.signature.algorithmSupported) {
      add(
        "production_signature_algorithm_unsupported",
        "app.signature.yaml algorithm must be supported by the Host verifier.",
      );
    }
    if (!result.signature.signaturePresent) {
      add(
        "production_signature_value_missing",
        "app.signature.yaml must include a detached signature value.",
      );
    }
    if (!result.signature.schemaVersion) {
      add(
        "production_signature_schema_version_missing",
        "app.signature.yaml must include signature.package.schemaVersion.",
      );
    } else if (result.signature.schemaVersion !== SIGNATURE_PROOF_SCHEMA) {
      add(
        "production_signature_schema_version_unsupported",
        "app.signature.yaml signature.package.schemaVersion is not supported.",
      );
    }
    if (!result.signature.payloadHashValid) {
      add(
        "production_signature_payload_hash_invalid",
        "app.signature.yaml payloadHash must be sha256:<64 hex>.",
      );
    }
    if (!result.signature.signedAtValid) {
      add(
        "production_signature_signed_at_invalid",
        "app.signature.yaml signedAt must be a valid timestamp.",
      );
    }
  }
  if (!result.signature.trustRootPresent) {
    add(
      "production_trust_root_missing",
      "plugin-signature-trust-root.json is required for Host bootstrap/OEM trust roots.",
    );
  } else {
    if (!result.signature.trustRootPublicKeyId) {
      add(
        "production_trust_root_public_key_id_missing",
        "plugin-signature-trust-root.json must include publicKeyId.",
      );
    }
    if (!result.signature.trustRootAlgorithm) {
      add(
        "production_trust_root_algorithm_missing",
        "plugin-signature-trust-root.json must include algorithm.",
      );
    } else if (!result.signature.trustRootAlgorithmSupported) {
      add(
        "production_trust_root_algorithm_unsupported",
        "plugin-signature-trust-root.json algorithm must be supported by the Host verifier.",
      );
    }
    if (!result.signature.trustRootPublicKeyPresent) {
      add(
        "production_signature_trust_root_public_key_missing",
        "plugin-signature-trust-root.json must include the verifier publicKey.",
      );
    }
  }
  if (
    result.signature.appSignatureYamlPresent &&
    result.signature.trustRootPresent &&
    result.signature.publicKeyId &&
    result.signature.trustRootPublicKeyId &&
    result.signature.publicKeyId !== result.signature.trustRootPublicKeyId
  ) {
    add(
      "production_signature_trust_root_mismatch",
      "app.signature.yaml publicKeyId must match plugin-signature-trust-root.json.",
    );
  }
  if (
    result.signature.appSignatureYamlPresent &&
    result.signature.trustRootPresent &&
    result.signature.algorithm &&
    result.signature.trustRootAlgorithm &&
    result.signature.algorithm !== result.signature.trustRootAlgorithm
  ) {
    add(
      "production_signature_trust_root_algorithm_mismatch",
      "app.signature.yaml algorithm must match plugin-signature-trust-root.json.",
    );
  }
  if (
    result.catalog.present &&
    result.signature.appSignatureYamlPresent &&
    result.signature.trustRootPresent
  ) {
    if (result.signature.signaturePayloadHashMatched === false) {
      add(
        "production_signature_payload_hash_mismatch",
        "app.signature.yaml payloadHash must match the canonical cloud_release payload.",
      );
    }
    if (
      result.signature.signatureCryptographicVerificationStatus === "failed"
    ) {
      add(
        "production_signature_cryptographic_verification_failed",
        "app.signature.yaml detached signature must verify against the production trust root public key.",
      );
    }
  }
  if (!result.catalog.present) {
    add(
      "production_catalog_missing",
      "Production catalog/client plugins JSON is required.",
    );
  } else {
    if (result.catalog.sourceKind !== "cloud_release") {
      add(
        "production_catalog_not_cloud_release",
        "Production catalog sourceKind must be cloud_release.",
      );
    }
    if (!isRemoteHttps(result.catalog.packageUrl)) {
      add(
        "production_catalog_package_url_not_remote_https",
        "Production catalog packageUrl must be non-local HTTPS.",
      );
    }
    if (result.catalog.packageHash !== result.package.packageHash) {
      add(
        "production_catalog_package_hash_mismatch",
        "Production catalog packageHash must match the .lapp sha256.",
      );
    }
    if (result.catalog.manifestHash !== result.package.manifestHash) {
      add(
        "production_catalog_manifest_hash_mismatch",
        "Production catalog manifestHash must match the preflight manifest sha256.",
      );
    }
    if (!result.catalog.signatureRef) {
      add(
        "production_catalog_signature_ref_missing",
        "Production catalog must include signatureRef.",
      );
    }
    if (!result.catalog.releaseId) {
      add(
        "production_catalog_release_id_missing",
        "Production catalog must include releaseId so signatureRef and signature payload are bound to a concrete release.",
      );
    } else if (
      result.catalog.signatureRef &&
      !signatureRefMatchesReleaseId(
        result.catalog.signatureRef,
        result.catalog.releaseId,
      )
    ) {
      add(
        "production_catalog_signature_ref_release_id_mismatch",
        "Production catalog signatureRef must end with :<releaseId>.",
      );
    }
    if (!result.catalog.signatureProofPresent) {
      add(
        "production_catalog_signature_proof_missing",
        "Production catalog must include signatureProof.",
      );
    }
    if (
      result.signature.appSignatureYamlPresent &&
      result.catalog.signatureProofPresent
    ) {
      addMismatchWhenBoth(
        result.signature.signatureRef,
        result.catalog.signatureRef,
        "production_signature_catalog_signature_ref_mismatch",
        "app.signature.yaml signatureRef must match production catalog signatureRef.",
      );
      addMismatchWhenBoth(
        result.signature.publicKeyId,
        result.catalog.signatureProofPublicKeyId,
        "production_signature_catalog_public_key_id_mismatch",
        "app.signature.yaml publicKeyId must match production catalog signatureProof.",
      );
      addMismatchWhenBoth(
        result.signature.algorithm,
        result.catalog.signatureProofAlgorithm,
        "production_signature_catalog_algorithm_mismatch",
        "app.signature.yaml algorithm must match production catalog signatureProof.",
      );
      addMismatchWhenBoth(
        result.signature.payloadHash,
        result.catalog.signatureProofPayloadHash,
        "production_signature_catalog_payload_hash_mismatch",
        "app.signature.yaml payloadHash must match production catalog signatureProof.",
      );
      addMismatchWhenBoth(
        result.signature.signedAt,
        result.catalog.signatureProofSignedAt,
        "production_signature_catalog_signed_at_mismatch",
        "app.signature.yaml signedAt must match production catalog signatureProof.",
      );
    }
  }
  if (!result.bootstrap.present) {
    add(
      "production_bootstrap_missing",
      "Production bootstrap JSON with pluginSignatureTrustRoots is required.",
    );
  } else if (!result.bootstrap.trustRootCount) {
    add(
      "production_bootstrap_trust_roots_missing",
      "Bootstrap must include pluginSignatureTrustRoots.",
    );
  }
  if (!result.fetchCloud.present) {
    add(
      "production_fetch_cloud_evidence_missing",
      "pluginPackage/fetchCloud verification evidence is required.",
    );
  } else if (!result.fetchCloud.ready) {
    add(
      "production_fetch_cloud_evidence_not_ready",
      "fetchCloud evidence must prove cloud_release, verified signature, verified package hash, and verified manifest hash.",
    );
  }
  return missing;
}

function summarizeCatalog(catalog) {
  const apps = Array.isArray(catalog?.apps) ? catalog.apps : [];
  const record =
    apps.find((item) => item?.appId === APP_ID || item?.id === APP_ID) ??
    catalog?.[APP_ID] ??
    null;
  const identity = record?.identity ?? record ?? {};
  const signatureProof = record?.signatureProof ?? record?.signature_proof;
  return {
    channel:
      identity.channel ||
      identity.releaseChannel ||
      identity.release_channel ||
      record?.channel ||
      record?.releaseChannel ||
      record?.release_channel ||
      null,
    present: Boolean(record),
    packageHash: identity.packageHash || identity.package_hash || "",
    manifestHash: identity.manifestHash || identity.manifest_hash || "",
    packageUrl:
      identity.packageUrl ||
      identity.package_url ||
      identity.sourceUri ||
      identity.source_uri ||
      record?.packageUrl ||
      record?.sourceUri ||
      "",
    releaseId:
      identity.releaseId ||
      identity.release_id ||
      record?.releaseId ||
      record?.release_id ||
      null,
    signatureProofPresent: Boolean(signatureProof),
    signatureProofAlgorithm: stringField(signatureProof, ["algorithm", "alg"]),
    signatureProofPayloadHash: stringField(signatureProof, [
      "payloadHash",
      "payload_hash",
    ]),
    signatureProofPublicKeyId: stringField(signatureProof, [
      "publicKeyId",
      "public_key_id",
      "keyId",
      "key_id",
    ]),
    signatureProofSignedAt: stringField(signatureProof, [
      "signedAt",
      "signed_at",
    ]),
    signatureRef: identity.signatureRef || identity.signature_ref || "",
    sourceKind: identity.sourceKind || identity.source_kind || "",
    tenantEnablementRef:
      identity.tenantEnablementRef ||
      identity.tenant_enablement_ref ||
      record?.tenantEnablementRef ||
      record?.tenant_enablement_ref ||
      null,
    tenantId:
      identity.tenantId || identity.tenant_id || record?.tenantId || null,
    version:
      record?.appVersion ||
      record?.app_version ||
      identity.appVersion ||
      identity.app_version ||
      record?.version ||
      "",
  };
}

function summarizeBootstrap(bootstrap) {
  const trustRoots =
    bootstrap?.pluginSignatureTrustRoots ??
    bootstrap?.plugins?.signatureTrustRoots ??
    bootstrap?.plugins?.signature_trust_roots ??
    bootstrap?.signatureTrustRoots ??
    bootstrap?.signature_trust_roots ??
    [];
  return {
    present: Boolean(bootstrap),
    trustRootCount: Array.isArray(trustRoots) ? trustRoots.length : 0,
  };
}

function summarizeFetchCloud(fetchCloud) {
  const sourceKind =
    fetchCloud?.sourceKind ??
    fetchCloud?.source_kind ??
    fetchCloud?.identity?.sourceKind ??
    fetchCloud?.installedState?.sourceKind ??
    "";
  const signatureVerificationStatus =
    fetchCloud?.signatureVerificationStatus ??
    fetchCloud?.signature_verification_status ??
    fetchCloud?.cloudReleaseEvidence?.signatureVerificationStatus ??
    "";
  const packageVerificationStatus =
    fetchCloud?.packageVerificationStatus ??
    fetchCloud?.package_verification_status ??
    fetchCloud?.cloudReleaseEvidence?.packageVerificationStatus ??
    "";
  const packageHashMatched =
    fetchCloud?.packageHashMatched ??
    fetchCloud?.package_hash_matched ??
    fetchCloud?.cloudReleaseEvidence?.packageHashMatched;
  const manifestHashMatched =
    fetchCloud?.manifestHashMatched ??
    fetchCloud?.manifest_hash_matched ??
    fetchCloud?.cloudReleaseEvidence?.manifestHashMatched;
  const status =
    fetchCloud?.status ??
    fetchCloud?.evidenceStatus ??
    fetchCloud?.evidence_status ??
    "missing";
  return {
    present: Boolean(fetchCloud),
    manifestHashMatched: manifestHashMatched === true,
    packageHashMatched: packageHashMatched === true,
    packageVerificationStatus: packageVerificationStatus || null,
    ready:
      sourceKind === "cloud_release" &&
      status === "ready" &&
      signatureVerificationStatus === "verified" &&
      packageVerificationStatus === "verified" &&
      packageHashMatched === true &&
      manifestHashMatched === true,
    signatureVerificationStatus: signatureVerificationStatus || null,
    sourceKind: sourceKind || null,
    status,
  };
}

export function buildContentFactoryProductionPreflight(input = {}) {
  const contentFactoryDir = path.resolve(
    input.contentFactoryDir || resolveDefaultContentFactoryDir(),
  );
  const packageJson = readJsonFile(
    path.join(contentFactoryDir, "package.json"),
  );
  const expectedVersion = input.expectedVersion || packageJson.version || "";
  const packageFile = path.resolve(
    input.packageFile || defaultPackageFile(contentFactoryDir, expectedVersion),
  );
  const packageStatus = fileStatus(packageFile);
  const appSignaturePath = path.resolve(
    input.appSignaturePath ||
      path.join(contentFactoryDir, "app.signature.yaml"),
  );
  const trustRootPath = path.resolve(
    input.trustRootPath ||
      path.join(contentFactoryDir, "plugin-signature-trust-root.json"),
  );
  const catalog = summarizeCatalog(readOptionalJson(input.catalogPath));
  const bootstrap = summarizeBootstrap(readOptionalJson(input.bootstrapPath));
  const fetchCloud = summarizeFetchCloud(
    input.fetchCloudEvidence ?? readOptionalJson(input.fetchCloudPath),
  );
  const publishReadiness = summarizePublishReadiness(input.env ?? process.env);
  let packageSummary = {
    appId: "",
    entryCount: 0,
    exists: packageStatus.exists,
    file: packageFile,
    manifestHash: "",
    missingEntries: [...REQUIRED_RELEASE_FILES],
    packageHash: "",
    localFolderPackageHash: "",
    size: packageStatus.size,
    validZip: false,
    version: "",
  };
  if (packageStatus.exists && packageStatus.isFile) {
    const inspectedPackage = inspectContentFactoryPackageFile(packageFile);
    const appServerInspect = input.appServerInspect ?? null;
    packageSummary = {
      ...packageSummary,
      appId: inspectedPackage.appId,
      entryCount: inspectedPackage.entryCount,
      manifestHash: appServerInspect?.manifestHash || "",
      missingEntries: inspectedPackage.missingEntries,
      packageHash: inspectedPackage.packageHash,
      localFolderPackageHash: appServerInspect?.packageHash || "",
      validZip: inspectedPackage.validZip,
      version: inspectedPackage.version,
    };
  }

  const appSignatureStatus = fileStatus(appSignaturePath);
  const appSignatureProof = appSignatureStatus.exists
    ? parseSignatureYaml(fs.readFileSync(appSignaturePath, "utf8"))
    : null;
  const trustRootStatus = fileStatus(trustRootPath);
  const trustRoot = readOptionalJson(
    trustRootStatus.exists ? trustRootPath : "",
  );
  const trustRootSummary = summarizeTrustRoot(trustRoot);
  const appServerInspect = input.appServerInspect ?? null;
  const result = {
    schemaVersion: 1,
    appId: APP_ID,
    status: "blocked",
    ready: false,
    expectedVersion,
    generatedAt: new Date().toISOString(),
    contentFactoryDir,
    package: packageSummary,
    appServerInspect: {
      appDir: appServerInspect?.appDir || appServerInspect?.app_dir || null,
      manifestHash: appServerInspect?.manifestHash || null,
      packageHash: appServerInspect?.packageHash || null,
      present: Boolean(appServerInspect),
      sourceKind:
        appServerInspect?.sourceKind || appServerInspect?.source_kind || null,
    },
    signature: {
      algorithm: appSignatureProof?.algorithm || null,
      algorithmSupported: SUPPORTED_SIGNATURE_ALGORITHMS.has(
        appSignatureProof?.algorithm || "",
      ),
      appSignatureYamlPath: appSignaturePath,
      appSignatureYamlPresent: appSignatureStatus.exists,
      payloadHash: appSignatureProof?.payloadHash || null,
      payloadHashValid: HASH_RE.test(appSignatureProof?.payloadHash || ""),
      publicKeyId: appSignatureProof?.publicKeyId || null,
      schemaVersion: appSignatureProof?.schemaVersion || null,
      signaturePresent: Boolean(appSignatureProof?.signature),
      signatureRef: appSignatureProof?.signatureRef || null,
      signedAt: appSignatureProof?.signedAt || null,
      signedAtValid: validIsoDate(appSignatureProof?.signedAt || ""),
      signatureCryptographicVerificationStatus: "not_attempted",
      signaturePayloadHashMatched: null,
      signatureVerificationFailureCodes: [],
      trustRootPath,
      trustRootAlgorithm: trustRootSummary.algorithm,
      trustRootAlgorithmSupported: SUPPORTED_SIGNATURE_ALGORITHMS.has(
        trustRootSummary.algorithm || "",
      ),
      trustRootPresent: trustRootStatus.exists,
      trustRootPublicKeyPresent: trustRootSummary.publicKeyPresent,
      trustRootPublicKeyId: trustRootSummary.publicKeyId,
    },
    catalog,
    bootstrap,
    fetchCloud,
    publishReadiness,
    signingCommand:
      "PLUGIN_SIGNING_PRIVATE_KEY_PEM=$PRIVATE_KEY_PEM npm run release:sign -- --package-url <https-url> --package-hash <packageHash> --manifest-hash <manifestHash> --release-id <release-id> --signature-ref <signature-ref> --public-key-id <public-key-id> --out app.signature.yaml --trust-root-out plugin-signature-trust-root.json",
    note: "This preflight is fail-closed. It computes local package facts and release gaps only; it does not mark cloud_release ready without real catalog, bootstrap trust roots, fetchCloud verification, and production GUI evidence.",
  };
  if (
    result.signature.appSignatureYamlPresent &&
    result.signature.trustRootPresent
  ) {
    const signatureVerification = verifyReleaseSignature({
      proof: appSignatureProof,
      release: verifierReleaseFromResult(result),
      trustRoot,
    });
    result.signature.signatureCryptographicVerificationStatus =
      signatureVerification.status;
    result.signature.signaturePayloadHashMatched =
      signatureVerification.payloadHash === null
        ? null
        : signatureVerification.payloadHashMatched;
    result.signature.signatureVerificationFailureCodes =
      signatureVerification.failureCodes;
  }
  result.missingRequirements = buildMissing(result);
  result.ready = result.missingRequirements.length === 0;
  result.status = result.ready ? "ready" : "blocked";
  return result;
}

export function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
