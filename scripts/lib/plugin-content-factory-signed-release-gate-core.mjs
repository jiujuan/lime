import { APP_ID } from "./plugin-content-factory-signed-release-gate-constants.mjs";
import {
  appendFetchCloudRequirements,
  summarizeFetchCloud,
} from "./plugin-content-factory-signed-release-gate-fetch-cloud.mjs";
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

function stringField(root, keys) {
  for (const key of keys) {
    const value = root?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
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

function stringValuesContainFixtureText(root, seen = new Set()) {
  if (typeof root === "string") {
    return isFixtureText(root);
  }
  if (!root || typeof root !== "object" || seen.has(root)) {
    return false;
  }
  seen.add(root);
  const values = Array.isArray(root) ? root : Object.values(root);
  return values.some((value) => stringValuesContainFixtureText(value, seen));
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

function acceptedStatus(status) {
  return new Set(["ready", "passed", "success", "ok", "completed"]).has(status);
}

function workflowResumeCandidates(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return [];
  }
  return [
    metadata,
    metadata.workflowResume,
    metadata.workflow_resume,
    metadata.workflowResumeLifecycle,
    metadata.workflow_resume_lifecycle,
    metadata.workerLifecycle,
    metadata.worker_lifecycle,
    metadata.pluginWorkflow,
    metadata.plugin_workflow,
  ].filter(
    (value) => value && typeof value === "object" && !Array.isArray(value),
  );
}

function workflowResumeContractBindingFromObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const actionId = stringField(value, ["actionId", "action_id"]);
  const decision = stringField(value, ["decision"]);
  if (!value.metadata || typeof value.metadata !== "object") {
    return null;
  }
  for (const candidate of workflowResumeCandidates(value.metadata)) {
    const workflowRunId = stringField(candidate, [
      "workflowRunId",
      "workflow_run_id",
      "runId",
      "run_id",
    ]);
    const workflowKey = stringField(candidate, [
      "workflowKey",
      "workflow_key",
      "key",
      "workflow",
    ]);
    const stepId = stringField(candidate, ["stepId", "step_id", "id"]);
    if (workflowRunId && workflowKey && stepId) {
      return {
        actionId: actionId || null,
        decision: decision || null,
        stepId,
        workflowKey,
        workflowRunId,
      };
    }
  }
  return null;
}

function workflowResumeActionResponseBindingFromObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const actionId = stringField(value, [
    "actionId",
    "action_id",
    "requestId",
    "request_id",
  ]);
  const confirmed = value.confirmed ?? value.approved;
  const explicitDecision = stringField(value, ["decision"]);
  const decision =
    explicitDecision ||
    (confirmed === true ? "approved" : confirmed === false ? "rejected" : "");
  if (!value.metadata || typeof value.metadata !== "object") {
    return null;
  }
  for (const candidate of workflowResumeCandidates(value.metadata)) {
    const workflowRunId = stringField(candidate, [
      "workflowRunId",
      "workflow_run_id",
      "runId",
      "run_id",
    ]);
    const workflowKey = stringField(candidate, [
      "workflowKey",
      "workflow_key",
      "key",
      "workflow",
    ]);
    const stepId = stringField(candidate, ["stepId", "step_id", "id"]);
    if (workflowRunId && workflowKey && stepId) {
      return {
        actionId: actionId || null,
        decision: decision || null,
        stepId,
        workflowKey,
        workflowRunId,
      };
    }
  }
  return null;
}

function eventTypeFromRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }
  return (
    stringField(value, ["eventType", "event_type", "type", "kind"]) ||
    stringField(value.event, ["eventType", "event_type", "type", "kind"])
  );
}

function eventPayloadFromRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  if (value.payload && typeof value.payload === "object") return value.payload;
  if (value.event?.payload && typeof value.event.payload === "object") {
    return value.event.payload;
  }
  return value;
}

function workflowResumeEventBinding(value) {
  const eventType = eventTypeFromRecord(value);
  if (
    eventType !== "workflow.step.resuming" &&
    eventType !== "workflow.run.resuming"
  ) {
    return null;
  }
  const payload = eventPayloadFromRecord(value);
  const workflowRunId = stringField(payload, [
    "workflowRunId",
    "workflow_run_id",
    "runId",
    "run_id",
  ]);
  const workflowKey = stringField(payload, [
    "workflowKey",
    "workflow_key",
    "key",
    "workflow",
  ]);
  const stepId = stringField(payload, ["stepId", "step_id", "id"]);
  const actionId = stringField(payload, ["actionId", "action_id"]);
  const decision = stringField(payload, ["decision"]);
  if (!workflowRunId || !workflowKey || !stepId || !actionId || !decision) {
    return null;
  }
  return {
    actionId,
    decision,
    eventType,
    stepId,
    workflowKey,
    workflowRunId,
  };
}

function collectWorkflowResumeEventBindings(root) {
  const bindings = [];
  const seen = new Set();
  function walk(value) {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    const binding = workflowResumeEventBinding(value);
    if (binding) bindings.push(binding);
    const values = Array.isArray(value) ? value : Object.values(value);
    for (const item of values) {
      walk(item);
    }
  }
  walk(root);
  return bindings;
}

function collectWorkflowResumeMetadataBindings(root) {
  const bindings = [];
  const seen = new Set();
  function walk(value) {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    for (const binding of [
      workflowResumeContractBindingFromObject(value),
      workflowResumeActionResponseBindingFromObject(value),
    ]) {
      if (binding?.actionId && binding?.decision) bindings.push(binding);
    }
    const values = Array.isArray(value) ? value : Object.values(value);
    for (const item of values) {
      walk(item);
    }
  }
  walk(root);
  return bindings;
}

function workflowResumeEventBindingsForContract(
  contractBinding,
  eventBindings,
) {
  if (!contractBinding) return [];
  return eventBindings.filter(
    (binding) =>
      binding.actionId === contractBinding.actionId &&
      binding.decision === contractBinding.decision &&
      binding.stepId === contractBinding.stepId &&
      binding.workflowKey === contractBinding.workflowKey &&
      binding.workflowRunId === contractBinding.workflowRunId,
  );
}

function workflowResumeAuditEventsPresent(bindings) {
  const hasStepResuming = bindings.some(
    (binding) => binding.eventType === "workflow.step.resuming",
  );
  const hasRunResuming = bindings.some(
    (binding) => binding.eventType === "workflow.run.resuming",
  );
  return hasStepResuming && hasRunResuming;
}

function summarizeWorkflowResumeLifecycle(guiEvidence) {
  const contractBindings = collectWorkflowResumeMetadataBindings(guiEvidence);
  const eventBindings = collectWorkflowResumeEventBindings(guiEvidence);
  const matchedContractBinding =
    contractBindings.find((binding) =>
      workflowResumeAuditEventsPresent(
        workflowResumeEventBindingsForContract(binding, eventBindings),
      ),
    ) || contractBindings[0];
  const matchingEventBindings = workflowResumeEventBindingsForContract(
    matchedContractBinding,
    eventBindings,
  );
  const auditEventsPresent = workflowResumeAuditEventsPresent(
    matchingEventBindings,
  );
  return {
    actionId: matchedContractBinding?.actionId || null,
    auditEventsPresent,
    contractMetadataPresent: contractBindings.length > 0,
    decision: matchedContractBinding?.decision || null,
    stepId: matchedContractBinding?.stepId || null,
    workflowKey: matchedContractBinding?.workflowKey || null,
    workflowRunId: matchedContractBinding?.workflowRunId || null,
  };
}

function summarizeGuiEvidence(guiEvidence) {
  const json = JSON.stringify(guiEvidence || {});
  const status = firstStringAtPaths(guiEvidence || {}, [
    ["status"],
    ["gui", "status"],
  ]);
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
    [
      "contentFactoryArticleWorkspaceReadModel",
      "workerArticleObject",
      "hostManagedGenerationStatus",
    ],
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
    (firstBoolAtPaths(guiEvidence || {}, [
      ["providerEvidence", "productionRoute"],
    ]) &&
      !json.includes("hostGenerationFixture"));
  const turnStartViaElectronIpc = firstBoolAtPaths(guiEvidence || {}, [
    ["assertions", "turnStartViaElectronIpc"],
    ["runtime", "turnStartViaElectronIpc"],
    ["trace", "turnStartViaElectronIpc"],
  ]);
  const appServerHandleJsonLinesSeen = firstBoolAtPaths(guiEvidence || {}, [
    ["trace", "appServerHandleJsonLinesSeen"],
    ["assertions", "appServerHandleJsonLinesSeen"],
  ]);
  const hostGenerationFixture = firstObjectAtPaths(guiEvidence || {}, [
    ["hostGenerationFixture"],
    ["host_generation_fixture"],
  ]);
  const cloudReleaseFixture = firstObjectAtPaths(guiEvidence || {}, [
    ["cloudReleaseFixture"],
    ["cloud_release_fixture"],
  ]);
  const fixtureLike = Boolean(
    hostGenerationFixture ||
    cloudReleaseFixture ||
    stringValuesContainFixtureText(guiEvidence || {}),
  );
  const workflowResumeLifecycle = summarizeWorkflowResumeLifecycle(guiEvidence);
  return {
    articleDraftDocumentPresent,
    fixtureLike,
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
      workflowResumeLifecycle.contractMetadataPresent &&
      workflowResumeLifecycle.auditEventsPresent &&
      liveProviderUsed &&
      turnStartViaElectronIpc &&
      appServerHandleJsonLinesSeen &&
      !fixtureLike,
    appServerHandleJsonLinesSeen,
    signatureVerificationStatus: signatureVerificationStatus || null,
    sourceKind: sourceKind || null,
    status: status || "missing",
    statusReady: acceptedStatus(status),
    turnStartViaElectronIpc,
    workflowFactsHidden,
    workflowJsonlPresent,
    workflowResumeLifecycle,
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
  if (!input.guiEvidence)
    add(
      missingRequirements,
      "production_gui_evidence_missing",
      "Real Lime Desktop GUI install/run evidence is required.",
    );
  if (input.guiEvidence && !guiEvidence.statusReady)
    add(
      missingRequirements,
      "production_gui_evidence_not_ready",
      "GUI evidence status must be passed/ready/completed.",
    );
  if (input.guiEvidence && guiEvidence.sourceKind !== "cloud_release")
    add(
      missingRequirements,
      "production_gui_not_cloud_release",
      "GUI evidence must run the cloud_release installed app.",
    );
  if (
    input.guiEvidence &&
    guiEvidence.signatureVerificationStatus !== "verified"
  )
    add(
      missingRequirements,
      "production_gui_signature_not_verified",
      "GUI evidence must prove signature verification status is verified.",
    );
  if (
    input.guiEvidence &&
    guiEvidence.hostManagedGenerationStatus !== "completed"
  )
    add(
      missingRequirements,
      "production_host_generation_not_completed",
      "GUI/read model must show hostManagedGeneration completed.",
    );
  if (
    input.guiEvidence &&
    (!guiEvidence.liveProviderUsed || guiEvidence.fixtureLike)
  )
    add(
      missingRequirements,
      "production_host_generation_not_live",
      "Production evidence must prove live Provider generation, not a localhost fixture.",
    );
  if (input.guiEvidence && guiEvidence.fixtureLike)
    add(
      missingRequirements,
      "fixture_cloud_release_not_allowed",
      "GUI evidence contains fixture/localhost markers and cannot close production.",
    );
  if (input.guiEvidence && !guiEvidence.workflowJsonlPresent)
    add(
      missingRequirements,
      "production_workflow_jsonl_missing",
      "GUI evidence must point to workflow-events.jsonl audit output.",
    );
  if (
    input.guiEvidence &&
    (!guiEvidence.workflowResumeLifecycle.contractMetadataPresent ||
      !guiEvidence.workflowResumeLifecycle.auditEventsPresent)
  )
    add(
      missingRequirements,
      "production_workflow_resume_lifecycle_missing",
      "GUI evidence must prove runtime response/resume decision metadata with workflowResume and workflow.step/run.resuming audit events.",
    );
  if (input.guiEvidence && !guiEvidence.workflowFactsHidden)
    add(
      missingRequirements,
      "production_workflow_facts_visible",
      "Right-side Article Editor must not display workflow steps.",
    );
  if (input.guiEvidence && !guiEvidence.turnStartViaElectronIpc)
    add(
      missingRequirements,
      "production_gui_turn_start_not_electron_ipc",
      "GUI evidence must prove agentSession/turn/start went through Electron IPC.",
    );
  if (input.guiEvidence && !guiEvidence.appServerHandleJsonLinesSeen)
    add(
      missingRequirements,
      "production_gui_app_server_json_rpc_missing",
      "GUI evidence must prove app_server_handle_json_lines was used for current App Server JSON-RPC.",
    );
  if (input.guiEvidence && !guiEvidence.articleDraftDocumentPresent)
    add(
      missingRequirements,
      "production_article_draft_document_missing",
      "GUI/read model must include article-draft-document output.",
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
