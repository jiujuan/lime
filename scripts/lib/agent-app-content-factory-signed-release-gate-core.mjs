import fs from "node:fs";
import path from "node:path";

const APP_ID = "content-factory-app";
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

function firstBoolAtPaths(root, paths) {
  for (const parts of paths) {
    const value = valueAtPath(root, parts);
    if (typeof value === "boolean") return value;
  }
  return false;
}

function firstOptionalBoolAtPaths(root, paths) {
  for (const parts of paths) {
    const value = valueAtPath(root, parts);
    if (typeof value === "boolean") return value;
  }
  return undefined;
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
    present: Boolean(publicKeyId && algorithm && payloadHash && signature && signedAt),
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
    sourceKindReady: sourceKind === "cloud_release" || sourceKind === "remote",
    version: version || null,
    versionMatches: expectedVersion ? version === expectedVersion : Boolean(version),
  };
}

function trustRootMatches(root, signatureProof, appId) {
  const publicKeyId = firstStringAtPaths(root, [["publicKeyId"], ["public_key_id"]]);
  const algorithm = firstStringAtPaths(root, [["algorithm"], ["alg"]]);
  const revoked = root?.revoked === true;
  const appIds = firstArrayAtPaths(root, [["appIds"], ["app_ids"]]).filter(
    (item) => typeof item === "string" && item.trim(),
  );
  const signedAtTime = Date.parse(signatureProof.signedAt || "");
  const notBefore = firstStringAtPaths(root, [["notBefore"], ["not_before"]]);
  const notAfter = firstStringAtPaths(root, [["notAfter"], ["not_after"]]);
  const afterStart =
    !notBefore || Number.isNaN(signedAtTime) || signedAtTime >= Date.parse(notBefore);
  const beforeEnd =
    !notAfter || Number.isNaN(signedAtTime) || signedAtTime <= Date.parse(notAfter);
  return (
    publicKeyId === signatureProof.publicKeyId &&
    (!algorithm || algorithm === signatureProof.algorithm) &&
    !revoked &&
    (appIds.length === 0 || appIds.includes(appId)) &&
    afterStart &&
    beforeEnd
  );
}

function summarizeBootstrap(bootstrap, signatureProof, appId) {
  const directTrustRoots = firstArrayAtPaths(bootstrap || {}, [
    ["agentAppSignatureTrustRoots"],
    ["agentApps", "signatureTrustRoots"],
    ["agent_apps", "signature_trust_roots"],
    ["signatureTrustRoots"],
    ["signature_trust_roots"],
  ]);
  const trustRoots =
    directTrustRoots.length > 0
      ? directTrustRoots
      : recursiveArrayByKey(bootstrap || {}, [
      "agentAppSignatureTrustRoots",
      "signatureTrustRoots",
      "signature_trust_roots",
        ]);
  const matchingTrustRoot = trustRoots.find((root) =>
    trustRootMatches(root, signatureProof, appId),
  );
  return {
    matchingTrustRoot: Boolean(matchingTrustRoot),
    ready: trustRoots.length > 0 && Boolean(matchingTrustRoot),
    trustRootCount: trustRoots.length,
  };
}

function summarizeFetchCloud(fetchCloud) {
  const sourceKind = firstStringAtPaths(fetchCloud || {}, [
    ["sourceKind"],
    ["source_kind"],
    ["identity", "sourceKind"],
    ["identity", "source_kind"],
    ["installedState", "sourceKind"],
    ["installed_state", "source_kind"],
    ["cloudReleaseFixture", "sourceKind"],
  ]);
  const status = firstStringAtPaths(fetchCloud || {}, [
    ["status"],
    ["evidenceStatus"],
    ["evidence_status"],
    ["cloudReleaseEvidence", "status"],
    ["setup", "cloudReleaseEvidence", "status"],
    ["cloudReleaseFixture", "evidenceStatus"],
  ]);
  const signatureVerificationStatus = firstStringAtPaths(fetchCloud || {}, [
    ["signatureVerificationStatus"],
    ["signature_verification_status"],
    ["cloudReleaseEvidence", "signatureVerificationStatus"],
    ["setup", "cloudReleaseEvidence", "signatureVerificationStatus"],
    ["cloudReleaseFixture", "signatureVerificationStatus"],
  ]);
  const packageVerificationStatus = firstStringAtPaths(fetchCloud || {}, [
    ["packageVerificationStatus"],
    ["package_verification_status"],
    ["cloudReleaseEvidence", "packageVerificationStatus"],
    ["setup", "cloudReleaseEvidence", "packageVerificationStatus"],
    ["cloudReleaseFixture", "packageVerificationStatus"],
  ]);
  const packageHashMatched = firstOptionalBoolAtPaths(fetchCloud || {}, [
    ["packageHashMatched"],
    ["package_hash_matched"],
    ["cloudReleaseEvidence", "packageHashMatched"],
    ["setup", "cloudReleaseEvidence", "packageHashMatched"],
  ]);
  const manifestHashMatched = firstOptionalBoolAtPaths(fetchCloud || {}, [
    ["manifestHashMatched"],
    ["manifest_hash_matched"],
    ["cloudReleaseEvidence", "manifestHashMatched"],
    ["setup", "cloudReleaseEvidence", "manifestHashMatched"],
  ]);
  return {
    fixtureLike: isFixtureText(JSON.stringify(fetchCloud || {})),
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
    status: status || "missing",
  };
}

function acceptedStatus(status) {
  return new Set(["ready", "passed", "success", "ok", "completed"]).has(status);
}

function summarizeGuiEvidence(guiEvidence) {
  const json = JSON.stringify(guiEvidence || {});
  const status = firstStringAtPaths(guiEvidence || {}, [["status"], ["gui", "status"]]);
  const sourceKind = firstStringAtPaths(guiEvidence || {}, [
    ["installedState", "sourceKind"],
    ["installed_state", "source_kind"],
    ["cloudRelease", "sourceKind"],
    ["cloudReleaseFixture", "sourceKind"],
  ]);
  const signatureVerificationStatus = firstStringAtPaths(guiEvidence || {}, [
    ["signatureVerificationStatus"],
    ["cloudRelease", "signatureVerificationStatus"],
    ["cloudReleaseFixture", "signatureVerificationStatus"],
    ["installedState", "signatureVerificationStatus"],
  ]);
  const hostManagedGenerationStatus = firstStringAtPaths(guiEvidence || {}, [
    ["readModel", "hostManagedGenerationStatus"],
    ["currentTurn", "hostManagedGenerationStatus"],
    ["threadRead", "hostManagedGenerationStatus"],
    ["contentFactoryArticleWorkspaceReadModel", "workerArticleObject", "hostManagedGenerationStatus"],
  ]);
  const workflowFactsHidden =
    firstOptionalBoolAtPaths(guiEvidence || {}, [
      ["contentFactoryArticleWorkspaceWorkflowFactsHidden"],
      ["assertions", "contentFactoryArticleWorkspaceWorkflowFactsHidden"],
    ]) !== false;
  const workflowJsonlPresent = Boolean(
    firstStringAtPaths(guiEvidence || {}, [
      ["eventLogs", "workflowJsonl"],
      ["workflowJsonl"],
      ["workflowJsonlPath"],
    ]) || json.includes("workflow-events.jsonl"),
  );
  const articleDraftDocumentPresent =
    json.includes("article-draft-document") ||
    firstBoolAtPaths(guiEvidence || {}, [
      ["readModel", "articleDraftDocumentPresent"],
      ["assertions", "articleDraftDocumentPresent"],
    ]);
  const liveProviderUsed =
    firstBoolAtPaths(guiEvidence || {}, [
      ["liveProviderUsed"],
      ["providerEvidence", "liveProviderUsed"],
      ["assertions", "liveProviderUsed"],
    ]) ||
    (firstBoolAtPaths(guiEvidence || {}, [["providerEvidence", "productionRoute"]]) &&
      !json.includes("hostGenerationFixture"));
  return {
    articleDraftDocumentPresent,
    fixtureLike: isFixtureText(json),
    hostManagedGenerationStatus: hostManagedGenerationStatus || null,
    liveProviderUsed,
    ready:
      acceptedStatus(status) &&
      sourceKind === "cloud_release" &&
      signatureVerificationStatus === "verified" &&
      hostManagedGenerationStatus === "completed" &&
      articleDraftDocumentPresent &&
      workflowFactsHidden &&
      workflowJsonlPresent &&
      liveProviderUsed &&
      !isFixtureText(json),
    signatureVerificationStatus: signatureVerificationStatus || null,
    sourceKind: sourceKind || null,
    status: status || "missing",
    statusReady: acceptedStatus(status),
    workflowFactsHidden,
    workflowJsonlPresent,
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
  const missingRequirements = [];

  if (!catalog.appFound) add(missingRequirements, "production_catalog_missing", "Production catalog must include content-factory-app.");
  if (!catalog.versionMatches) add(missingRequirements, "production_version_mismatch", "Production catalog version must match expected content-factory-app version.");
  if (!catalog.sourceKindReady) add(missingRequirements, "production_catalog_not_remote_release", "Catalog sourceKind must be cloud_release/remote.");
  if (!catalog.packageUrlProductionHttps) add(missingRequirements, "production_package_url_not_https", "Catalog packageUrl must be non-fixture HTTPS.");
  if (!catalog.packageHashValid) add(missingRequirements, "production_package_hash_missing", "Catalog packageHash must be sha256:<64 hex>.");
  if (!catalog.manifestHashValid) add(missingRequirements, "production_manifest_hash_missing", "Catalog manifestHash must be sha256:<64 hex>.");
  if (!catalog.signatureRef) add(missingRequirements, "production_signature_ref_missing", "Catalog identity must include signatureRef.");
  if (!catalog.signatureProof.present) add(missingRequirements, "production_signature_proof_missing", "Catalog must include signatureProof with publicKeyId, algorithm, payloadHash, signature, and signedAt.");
  if (catalog.signatureProof.algorithm && !catalog.signatureProof.supportedAlgorithm) add(missingRequirements, "production_signature_algorithm_unsupported", "signatureProof algorithm is not supported by the Host verifier.");
  if (!bootstrap.trustRootCount) add(missingRequirements, "production_trust_roots_missing", "Bootstrap must include Agent App signature trust roots.");
  if (bootstrap.trustRootCount && !bootstrap.matchingTrustRoot) add(missingRequirements, "production_signature_trust_root_missing", "Bootstrap trust roots must match signatureProof publicKeyId/algorithm/appId/time window.");
  if (!input.fetchCloud) add(missingRequirements, "production_fetch_cloud_evidence_missing", "agentAppPackage/fetchCloud or package verification evidence is required.");
  if (input.fetchCloud && !fetchCloud.ready) add(missingRequirements, "production_release_evidence_not_ready", "fetchCloud evidence must prove cloud_release, verified hashes, verified signature, and ready status.");
  if (fetchCloud.fixtureLike) add(missingRequirements, "fixture_cloud_release_not_allowed", "Fixture cloud_release evidence is not production evidence.");
  if (!input.guiEvidence) add(missingRequirements, "production_gui_evidence_missing", "Real Lime Desktop GUI install/run evidence is required.");
  if (input.guiEvidence && !guiEvidence.statusReady) add(missingRequirements, "production_gui_evidence_not_ready", "GUI evidence status must be passed/ready/completed.");
  if (input.guiEvidence && guiEvidence.sourceKind !== "cloud_release") add(missingRequirements, "production_gui_not_cloud_release", "GUI evidence must run the cloud_release installed app.");
  if (input.guiEvidence && guiEvidence.signatureVerificationStatus !== "verified") add(missingRequirements, "production_gui_signature_not_verified", "GUI evidence must prove signature verification status is verified.");
  if (input.guiEvidence && guiEvidence.hostManagedGenerationStatus !== "completed") add(missingRequirements, "production_host_generation_not_completed", "GUI/read model must show hostManagedGeneration completed.");
  if (input.guiEvidence && (!guiEvidence.liveProviderUsed || guiEvidence.fixtureLike)) add(missingRequirements, "production_host_generation_not_live", "Production evidence must prove live Provider generation, not a localhost fixture.");
  if (input.guiEvidence && guiEvidence.fixtureLike) add(missingRequirements, "fixture_cloud_release_not_allowed", "GUI evidence contains fixture/localhost markers and cannot close production.");
  if (input.guiEvidence && !guiEvidence.workflowJsonlPresent) add(missingRequirements, "production_workflow_jsonl_missing", "GUI evidence must point to workflow-events.jsonl audit output.");
  if (input.guiEvidence && !guiEvidence.workflowFactsHidden) add(missingRequirements, "production_workflow_facts_visible", "Right-side Article Editor must not display workflow steps.");
  if (input.guiEvidence && !guiEvidence.articleDraftDocumentPresent) add(missingRequirements, "production_article_draft_document_missing", "GUI/read model must include article-draft-document output.");

  const ready =
    missingRequirements.length === 0 &&
    catalog.signatureProof.present &&
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
    bootstrap,
    fetchCloud,
    guiEvidence,
    missingRequirements,
    note:
      "This gate accepts only production signed cloud_release + trust roots + fetchCloud verification + GUI live Provider evidence. Localhost fixtures remain blocked.",
  };
}

export function readOptionalJsonFile(filePath) {
  if (!filePath) return null;
  const resolvedPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolvedPath)) return null;
  return JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
}

export function writeJsonFile(filePath, value) {
  const resolvedPath = path.resolve(process.cwd(), filePath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
