import { APP_ID } from "./plugin-content-factory-signed-release-gate-constants.mjs";
import {
  appendFetchCloudRequirements,
  summarizeFetchCloud,
} from "./plugin-content-factory-signed-release-gate-fetch-cloud.mjs";
import {
  appendGuiEvidenceRequirements,
  summarizeGuiEvidence,
} from "./plugin-content-factory-signed-release-gate-gui.mjs";
import {
  appendPreflightRequirements,
  summarizePreflight,
} from "./plugin-content-factory-signed-release-gate-preflight.mjs";
import {
  appendPlaceholderRequirement,
  appendSecretScanRequirement,
  summarizePlaceholders,
  summarizeSecretScan,
} from "./plugin-content-factory-signed-release-gate-safety.mjs";

export {
  CONTENT_FACTORY_SIGNED_RELEASE_GATE_RESULT_FILE_NAME,
  CONTENT_FACTORY_SIGNED_RELEASE_GATE_TEMPLATE_FILE_NAMES,
} from "./plugin-content-factory-signed-release-gate-constants.mjs";
export {
  readOptionalJsonFile,
  writeJsonFile,
} from "./plugin-content-factory-signed-release-gate-io.mjs";
export {
  buildContentFactorySignedReleaseEvidenceTemplate,
  writeContentFactorySignedReleaseEvidenceTemplateDir,
} from "./plugin-content-factory-signed-release-gate-template.mjs";

const HASH_RE = /^sha256:[a-f0-9]{64}$/i;
const SUPPORTED_SIGNATURE_ALGORITHMS = new Set([
  "RSASSA-PKCS1-v1_5-SHA256",
  "RSA-PSS-SHA256",
  "ECDSA-P256-SHA256",
  "Ed25519",
]);

function valueAtPath(root, parts) {
  let current = root;
  for (const part of parts) {
    if (!current || typeof current !== "object") return undefined;
    current = current[part];
  }
  return current;
}

function firstStringAtPaths(root, paths) {
  for (const parts of paths) {
    const value = valueAtPath(root, parts);
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function firstObjectAtPaths(root, paths) {
  for (const parts of paths) {
    const value = valueAtPath(root, parts);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value;
    }
  }
  return null;
}

function firstArrayAtPaths(root, paths) {
  for (const parts of paths) {
    const value = valueAtPath(root, parts);
    if (Array.isArray(value)) return value;
  }
  return [];
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

function visit(root, fn, seen = new Set()) {
  if (!root || typeof root !== "object") return null;
  if (seen.has(root)) return null;
  seen.add(root);
  if (fn(root)) return root;
  if (Array.isArray(root)) {
    for (const item of root) {
      const found = visit(item, fn, seen);
      if (found) return found;
    }
    return null;
  }
  for (const value of Object.values(root)) {
    const found = visit(value, fn, seen);
    if (found) return found;
  }
  return null;
}

function findAppRecord(root, appId) {
  return visit(root, (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    const id = firstStringAtPaths(value, [
      ["appId"],
      ["app_id"],
      ["id"],
      ["manifest", "appId"],
      ["identity", "appId"],
    ]);
    return id === appId;
  });
}

function recursiveArrayByKey(root, keys, seen = new Set()) {
  if (!root || typeof root !== "object") return [];
  if (seen.has(root)) return [];
  seen.add(root);
  if (!Array.isArray(root)) {
    for (const key of keys) {
      if (Array.isArray(root[key])) return root[key];
    }
  }
  const values = Array.isArray(root) ? root : Object.values(root);
  for (const value of values) {
    const found = recursiveArrayByKey(value, keys, seen);
    if (found.length > 0) return found;
  }
  return [];
}

function validSha256(value) {
  return HASH_RE.test(value || "");
}

function isFixtureText(value) {
  return /fixture|localhost|127\.0\.0\.1|hostGenerationFixture|cloudReleaseFixture/i.test(
    String(value || ""),
  );
}

function packageUrlIsProductionHttps(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !isFixtureText(url.href);
  } catch {
    return false;
  }
}

function summarizeSignatureProof(appRecord) {
  const proof =
    firstObjectAtPaths(appRecord, [
      ["signatureProof"],
      ["signature_proof"],
      ["identity", "signatureProof"],
      ["identity", "signature_proof"],
      ["release", "signatureProof"],
      ["release", "signature_proof"],
      ["setup", "cloudReleaseEvidence", "signatureProof"],
    ]) || {};
  const algorithm = firstStringAtPaths(proof, [["algorithm"], ["alg"]]);
  const publicKeyId = firstStringAtPaths(proof, [
    ["publicKeyId"],
    ["public_key_id"],
    ["keyId"],
    ["key_id"],
  ]);
  const payloadHash = firstStringAtPaths(proof, [
    ["payloadHash"],
    ["payload_hash"],
  ]);
  const signature = firstStringAtPaths(proof, [["signature"], ["sig"]]);
  const signedAt = firstStringAtPaths(proof, [["signedAt"], ["signed_at"]]);
  return {
    algorithm: algorithm || null,
    present: Boolean(
      publicKeyId && algorithm && payloadHash && signature && signedAt,
    ),
    publicKeyId: publicKeyId || null,
    payloadHash: payloadHash || null,
    signaturePresent: Boolean(signature),
    signedAt: signedAt || null,
    supportedAlgorithm: SUPPORTED_SIGNATURE_ALGORITHMS.has(algorithm),
  };
}

function summarizeCatalog(catalog, expectedVersion, appId) {
  const appRecord = findAppRecord(catalog, appId);
  const signatureProof = summarizeSignatureProof(appRecord || {});
  const packageUrl = firstStringAtPaths(appRecord || {}, [
    ["packageUrl"],
    ["package_url"],
    ["sourceUri"],
    ["source_uri"],
    ["identity", "sourceUri"],
    ["identity", "source_uri"],
  ]);
  const packageHash = firstStringAtPaths(appRecord || {}, [
    ["packageHash"],
    ["package_hash"],
    ["identity", "packageHash"],
    ["identity", "package_hash"],
  ]);
  const manifestHash = firstStringAtPaths(appRecord || {}, [
    ["manifestHash"],
    ["manifest_hash"],
    ["identity", "manifestHash"],
    ["identity", "manifest_hash"],
  ]);
  const sourceKind = firstStringAtPaths(appRecord || {}, [
    ["sourceKind"],
    ["source_kind"],
    ["identity", "sourceKind"],
    ["identity", "source_kind"],
    ["source", "kind"],
  ]);
  const version = firstStringAtPaths(appRecord || {}, [
    ["version"],
    ["appVersion"],
    ["app_version"],
    ["identity", "appVersion"],
    ["identity", "app_version"],
    ["manifest", "version"],
  ]);
  const signatureRef = firstStringAtPaths(appRecord || {}, [
    ["signatureRef"],
    ["signature_ref"],
    ["identity", "signatureRef"],
    ["identity", "signature_ref"],
  ]);
  const releaseId = firstStringAtPaths(appRecord || {}, [
    ["releaseId"],
    ["release_id"],
    ["identity", "releaseId"],
    ["identity", "release_id"],
  ]);
  const channel = firstStringAtPaths(appRecord || {}, [
    ["channel"],
    ["releaseChannel"],
    ["release_channel"],
  ]);
  return {
    appFound: Boolean(appRecord),
    channel: channel || null,
    expectedVersion: expectedVersion || null,
    manifestHash: manifestHash || null,
    manifestHashValid: validSha256(manifestHash),
    packageHash: packageHash || null,
    packageHashValid: validSha256(packageHash),
    packageUrl: packageUrl || null,
    packageUrlProductionHttps: packageUrlIsProductionHttps(packageUrl),
    releaseId: releaseId || null,
    signatureProof,
    signatureRef: signatureRef || null,
    sourceKind: sourceKind || null,
    sourceKindReady: sourceKind === "cloud_release",
    version: version || null,
    versionMatches: expectedVersion
      ? version === expectedVersion
      : Boolean(version),
  };
}

function trustRootMatches(root, signatureProof, appId) {
  const publicKeyId = firstStringAtPaths(root, [
    ["publicKeyId"],
    ["public_key_id"],
  ]);
  const algorithm = firstStringAtPaths(root, [["algorithm"], ["alg"]]);
  const revoked = root?.revoked === true;
  const appIds = firstArrayAtPaths(root, [["appIds"], ["app_ids"]]).filter(
    (item) => typeof item === "string" && item.trim(),
  );
  const signedAtTime = Date.parse(signatureProof.signedAt || "");
  const notBefore = firstStringAtPaths(root, [["notBefore"], ["not_before"]]);
  const notAfter = firstStringAtPaths(root, [["notAfter"], ["not_after"]]);
  const afterStart =
    !notBefore ||
    Number.isNaN(signedAtTime) ||
    signedAtTime >= Date.parse(notBefore);
  const beforeEnd =
    !notAfter ||
    Number.isNaN(signedAtTime) ||
    signedAtTime <= Date.parse(notAfter);
  return (
    publicKeyId === signatureProof.publicKeyId &&
    (!algorithm || algorithm === signatureProof.algorithm) &&
    !revoked &&
    (appIds.length === 0 || appIds.includes(appId)) &&
    afterStart &&
    beforeEnd
  );
}

function trustRootPublicKeyPresent(root) {
  return Boolean(
    firstStringAtPaths(root, [
      ["publicKey"],
      ["public_key"],
      ["publicKeyPem"],
      ["public_key_pem"],
    ]),
  );
}

function summarizeBootstrap(bootstrap, signatureProof, appId) {
  const directTrustRoots = firstArrayAtPaths(bootstrap || {}, [
    ["pluginSignatureTrustRoots"],
    ["plugins", "signatureTrustRoots"],
    ["plugins", "signature_trust_roots"],
    ["signatureTrustRoots"],
    ["signature_trust_roots"],
  ]);
  const trustRoots =
    directTrustRoots.length > 0
      ? directTrustRoots
      : recursiveArrayByKey(bootstrap || {}, [
          "pluginSignatureTrustRoots",
          "signatureTrustRoots",
          "signature_trust_roots",
        ]);
  const matchingTrustRoot = trustRoots.find((root) =>
    trustRootMatches(root, signatureProof, appId),
  );
  const matchingTrustRootPublicKeyPresent =
    Boolean(matchingTrustRoot) && trustRootPublicKeyPresent(matchingTrustRoot);
  return {
    matchingTrustRoot: Boolean(matchingTrustRoot),
    matchingTrustRootPublicKeyPresent,
    ready:
      trustRoots.length > 0 &&
      Boolean(matchingTrustRoot) &&
      matchingTrustRootPublicKeyPresent,
    trustRootCount: trustRoots.length,
  };
}

function add(missingRequirements, code, detail) {
  missingRequirements.push({ code, detail });
}

export function buildContentFactorySignedReleaseGate(input = {}) {
  const appId = input.appId || APP_ID;
  const expectedVersion = input.expectedVersion || "";
  const catalog = summarizeCatalog(input.catalog || {}, expectedVersion, appId);
  const bootstrap = summarizeBootstrap(
    input.bootstrap || {},
    catalog.signatureProof,
    appId,
  );
  const fetchCloud = summarizeFetchCloud(input.fetchCloud || {});
  const guiEvidence = summarizeGuiEvidence(input.guiEvidence || {});
  const preflight = summarizePreflight(
    input.preflight || null,
    expectedVersion,
  );
  const placeholders = summarizePlaceholders(input);
  const secretScan = summarizeSecretScan(input);
  const missingRequirements = [];
  appendPlaceholderRequirement(missingRequirements, placeholders);
  appendSecretScanRequirement(missingRequirements, secretScan);
  appendPreflightRequirements(missingRequirements, preflight, catalog);
  appendFetchCloudRequirements(
    missingRequirements,
    input.fetchCloud,
    fetchCloud,
    catalog,
    preflight,
  );
  const { packageUrl: _fetchCloudPackageUrl, ...fetchCloudSummary } =
    fetchCloud;

  if (!catalog.appFound)
    add(
      missingRequirements,
      "production_catalog_missing",
      "Production catalog must include content-factory-app.",
    );
  if (!catalog.versionMatches)
    add(
      missingRequirements,
      "production_version_mismatch",
      "Production catalog version must match expected content-factory-app version.",
    );
  if (!catalog.sourceKindReady)
    add(
      missingRequirements,
      "production_catalog_not_cloud_release",
      "Catalog sourceKind must be cloud_release.",
    );
  if (!catalog.packageUrlProductionHttps)
    add(
      missingRequirements,
      "production_package_url_not_https",
      "Catalog packageUrl must be non-fixture HTTPS.",
    );
  if (!catalog.packageHashValid)
    add(
      missingRequirements,
      "production_package_hash_missing",
      "Catalog packageHash must be sha256:<64 hex>.",
    );
  if (!catalog.manifestHashValid)
    add(
      missingRequirements,
      "production_manifest_hash_missing",
      "Catalog manifestHash must be sha256:<64 hex>.",
    );
  if (!catalog.signatureRef)
    add(
      missingRequirements,
      "production_signature_ref_missing",
      "Catalog identity must include signatureRef.",
    );
  if (!catalog.releaseId)
    add(
      missingRequirements,
      "production_release_id_missing",
      "Catalog identity must include releaseId so signatureRef and signature payload are bound to a concrete release.",
    );
  if (
    catalog.releaseId &&
    catalog.signatureRef &&
    !signatureRefMatchesReleaseId(catalog.signatureRef, catalog.releaseId)
  )
    add(
      missingRequirements,
      "production_signature_ref_release_id_mismatch",
      "Catalog signatureRef must end with :<releaseId>.",
    );
  if (!catalog.signatureProof.present)
    add(
      missingRequirements,
      "production_signature_proof_missing",
      "Catalog must include signatureProof with publicKeyId, algorithm, payloadHash, signature, and signedAt.",
    );
  if (
    catalog.signatureProof.algorithm &&
    !catalog.signatureProof.supportedAlgorithm
  )
    add(
      missingRequirements,
      "production_signature_algorithm_unsupported",
      "signatureProof algorithm is not supported by the Host verifier.",
    );
  if (!bootstrap.trustRootCount)
    add(
      missingRequirements,
      "production_trust_roots_missing",
      "Bootstrap must include Plugin signature trust roots.",
    );
  if (bootstrap.trustRootCount && !bootstrap.matchingTrustRoot)
    add(
      missingRequirements,
      "production_signature_trust_root_missing",
      "Bootstrap trust roots must match signatureProof publicKeyId/algorithm/appId/time window.",
    );
  if (
    bootstrap.matchingTrustRoot &&
    !bootstrap.matchingTrustRootPublicKeyPresent
  )
    add(
      missingRequirements,
      "production_signature_trust_root_public_key_missing",
      "Bootstrap matching trust root must include a verifier publicKey.",
    );
  appendGuiEvidenceRequirements(
    missingRequirements,
    input.guiEvidence,
    guiEvidence,
    catalog,
    preflight,
    fetchCloud,
  );

  const ready =
    missingRequirements.length === 0 &&
    catalog.signatureProof.present &&
    preflight.ready &&
    bootstrap.ready &&
    fetchCloud.ready &&
    guiEvidence.ready;
  return {
    schemaVersion: "content-factory-signed-release-gate.v1",
    appId,
    expectedVersion: expectedVersion || null,
    ready,
    status: ready ? "ready" : "blocked",
    catalog,
    preflight,
    bootstrap,
    fetchCloud: fetchCloudSummary,
    guiEvidence,
    placeholders,
    secretScan,
    missingRequirements,
    note: "This gate accepts only production preflight + signed cloud_release + trust roots + fetchCloud verification + GUI live Provider evidence + workflow resume lifecycle metadata/audit evidence. Localhost fixtures remain blocked.",
  };
}
