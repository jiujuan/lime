import fs from "node:fs";
import path from "node:path";

export const CONTENT_FACTORY_PRODUCTION_RELEASE_EVIDENCE_FILE_NAME =
  "content-factory-production-release-evidence.json";

const API_BASE_ENV_NAMES = [
  "LIME_AGENT_APP_STUDIO_API_BASE",
  "LIMECORE_API_BASE_URL",
  "LIMECORE_API_BASE",
];
const TENANT_ENV_NAMES = ["LIMECORE_TENANT_ID", "LIME_CLOUD_TENANT_ID"];
const TOKEN_ENV_NAMES = ["LIME_AGENT_APP_STUDIO_TOKEN"];

const MISSING_REQUIREMENT_BLOCKER_CODES = {
  bootstrapMatchingTrustRoot:
    "production_release_evidence_bootstrap_matching_trust_root_missing",
  bootstrapMatchingTrustRootAlgorithm:
    "production_release_evidence_bootstrap_matching_trust_root_algorithm_missing",
  bootstrapMatchingTrustRootPublicKey:
    "production_release_evidence_bootstrap_matching_trust_root_public_key_missing",
  bootstrapRequest: "production_release_evidence_bootstrap_request_failed",
  bootstrapTrustRoots:
    "production_release_evidence_bootstrap_trust_roots_missing",
  catalogApp: "production_release_evidence_catalog_app_missing",
  catalogManifestHash:
    "production_release_evidence_catalog_manifest_hash_missing",
  catalogPackageHash:
    "production_release_evidence_catalog_package_hash_missing",
  catalogPackageUrl: "production_release_evidence_catalog_package_url_missing",
  catalogPackageUrlRemoteHttps:
    "production_release_evidence_catalog_package_url_not_https",
  catalogReleaseId: "production_release_evidence_catalog_release_id_missing",
  catalogSignatureProof:
    "production_release_evidence_catalog_signature_proof_missing",
  catalogSignatureProofAlgorithm:
    "production_release_evidence_catalog_signature_proof_algorithm_missing",
  catalogSignatureProofPayloadHash:
    "production_release_evidence_catalog_signature_proof_payload_hash_missing",
  catalogSignatureProofPublicKeyId:
    "production_release_evidence_catalog_signature_proof_public_key_id_missing",
  catalogSignatureProofSignedAt:
    "production_release_evidence_catalog_signature_proof_signed_at_missing",
  catalogSignatureRef:
    "production_release_evidence_catalog_signature_ref_missing",
  catalogSourceKindCloudRelease:
    "production_release_evidence_catalog_not_cloud_release",
  marketplaceRequest: "production_release_evidence_marketplace_request_failed",
};

function firstConfiguredEnv(env, names) {
  return names.find((name) => Boolean(String(env[name] || "").trim())) || "";
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function firstText(record, keys) {
  for (const key of keys) {
    const value = text(record?.[key]);
    if (value) return value;
  }
  return "";
}

function arrayAt(record, keys) {
  for (const key of keys) {
    const value = record?.[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function pathStatus(filePath) {
  return {
    path: filePath || null,
    present: Boolean(filePath && fs.existsSync(filePath)),
  };
}

function resolveInputs(input = {}, env = process.env) {
  const apiBaseEnvName = firstConfiguredEnv(env, API_BASE_ENV_NAMES);
  const tenantEnvName = firstConfiguredEnv(env, TENANT_ENV_NAMES);
  const tokenEnvName =
    input.studioTokenEnv || firstConfiguredEnv(env, TOKEN_ENV_NAMES);
  const apiBase = trimTrailingSlash(input.apiBase || env[apiBaseEnvName] || "");
  const tenantId = text(input.tenantId || env[tenantEnvName] || "");
  const token = tokenEnvName ? text(env[tokenEnvName] || "") : "";
  return {
    apiBase,
    tenantId,
    token,
    summary: {
      apiBase: {
        configured: Boolean(apiBase),
        envName: input.apiBase ? null : apiBaseEnvName || null,
      },
      studioToken: {
        configured: Boolean(token),
        envName: tokenEnvName || null,
      },
      tenantId: {
        configured: Boolean(tenantId),
        envName: input.tenantId ? null : tenantEnvName || null,
      },
    },
  };
}

function missingInputKeys(inputSummary) {
  const missing = [];
  if (!inputSummary.apiBase.configured) missing.push("apiBase");
  if (!inputSummary.tenantId.configured) missing.push("tenantId");
  if (!inputSummary.studioToken.configured) missing.push("studioToken");
  return missing;
}

export function buildContentFactoryProductionReleaseEvidencePlan({
  appId = "content-factory-app",
  bootstrapOutputPath = "",
  catalogOutputPath = "",
  env = process.env,
  input = {},
  marketplaceName = "limecloud",
  outputPath = "",
} = {}) {
  const requested = input.fetchProductionReleaseEvidence === true;
  const resolved = resolveInputs(input, env);
  const missingKeys = requested ? missingInputKeys(resolved.summary) : [];
  const tenantSegment = "<tenantId>";
  const query = new URLSearchParams({ query: appId });
  const endpoints = {
    bootstrapPath: `/v1/public/tenants/${tenantSegment}/client/bootstrap`,
    marketplacePath: `/v1/public/tenants/${tenantSegment}/client/plugins/marketplace?${query.toString()}`,
  };
  return {
    appId,
    endpoints,
    executable: requested && missingKeys.length === 0,
    inputs: resolved.summary,
    marketplaceName,
    missingKeys,
    outputs: {
      bootstrap: pathStatus(bootstrapOutputPath),
      catalog: pathStatus(catalogOutputPath),
      summary: pathStatus(outputPath),
    },
    requested,
    skippedReason: requested
      ? missingKeys.length > 0
        ? "missing_inputs"
        : null
      : "not_requested",
    status: requested
      ? missingKeys.length > 0
        ? "blocked"
        : "ready_to_run"
      : "skipped",
  };
}

function unwrap(payload) {
  if (payload && typeof payload === "object" && "data" in payload) {
    return payload.data;
  }
  return payload;
}

async function requestJson(url, { fetcher, timeoutMs, token }) {
  const controller = new AbortController();
  const timer =
    timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const headers = { Accept: "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetcher(url, {
      headers,
      method: "GET",
      signal: controller.signal,
    });
    const contentType =
      typeof response.headers?.get === "function"
        ? response.headers.get("content-type") || ""
        : "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : await response.text();
    if (!response.ok) {
      const message =
        payload && typeof payload === "object"
          ? payload.message || payload.error
          : payload;
      throw new Error(`${response.status} ${message || response.statusText}`);
    }
    return unwrap(payload);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(
        `request timed out after ${Math.round(timeoutMs / 1000)}s`,
      );
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function marketplaceItems(marketplace) {
  if (!marketplace || typeof marketplace !== "object") return [];
  return arrayAt(marketplace, ["items", "apps", "plugins"]);
}

function findAppItem(marketplace, appId) {
  return (
    marketplaceItems(marketplace).find((item) =>
      [
        item?.appId,
        item?.app_id,
        item?.pluginName,
        item?.plugin_name,
        item?.id,
        item?.key,
      ].includes(appId),
    ) || null
  );
}

function packageRef(item) {
  return item?.package || item?.packageRef || item?.package_ref || {};
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

export function normalizeMarketplaceCatalogEvidence({
  appId = "content-factory-app",
  marketplace,
  marketplaceName = "limecloud",
} = {}) {
  const item = findAppItem(marketplace, appId);
  const pkg = packageRef(item);
  const packageUrl = firstText(pkg, [
    "packageUrl",
    "package_url",
    "sourceUri",
    "source_uri",
  ]);
  const record = item
    ? {
        appId: firstText(item, ["appId", "app_id", "pluginName"]) || appId,
        appVersion:
          firstText(item, ["version", "appVersion", "app_version"]) ||
          firstText(pkg, ["version", "appVersion", "app_version"]),
        identity: {
          manifestHash: firstText(pkg, ["manifestHash", "manifest_hash"]),
          packageHash: firstText(pkg, ["packageHash", "package_hash"]),
          packageUrl,
          releaseId: firstText(pkg, ["releaseId", "release_id"]),
          signatureRef: firstText(pkg, ["signatureRef", "signature_ref"]),
          sourceKind: packageUrl ? "cloud_release" : "",
          sourceUri: packageUrl,
        },
        marketplace: {
          activationState: firstText(item, [
            "activationState",
            "activation_state",
          ]),
          enabled: item.enabled === true,
          installState: firstText(item, ["installState", "install_state"]),
          marketplaceName:
            firstText(item, ["marketplaceName", "marketplace_name"]) ||
            marketplaceName,
          pluginName: firstText(item, ["pluginName", "plugin_name"]),
          sourceKind: firstText(item, ["sourceKind", "source_kind"]),
        },
        signatureProof:
          pkg.signatureProof ||
          pkg.signature_proof ||
          item.signatureProof ||
          item.signature_proof ||
          null,
      }
    : null;
  return {
    schemaVersion: "content-factory-production-catalog-evidence.v1",
    appId,
    apps: record ? [record] : [],
    generatedAt: new Date().toISOString(),
    source: {
      appFound: Boolean(record),
      kind: "limecore_client_plugin_marketplace",
      marketplaceName,
    },
  };
}

export function normalizeBootstrapTrustRootEvidence({ bootstrap } = {}) {
  const roots =
    bootstrap?.pluginSignatureTrustRoots ||
    bootstrap?.plugins?.signatureTrustRoots ||
    bootstrap?.plugins?.signature_trust_roots ||
    bootstrap?.signatureTrustRoots ||
    bootstrap?.signature_trust_roots ||
    [];
  return {
    schemaVersion: "content-factory-production-bootstrap-evidence.v1",
    generatedAt: new Date().toISOString(),
    pluginSignatureTrustRoots: Array.isArray(roots) ? roots : [],
    source: {
      kind: "limecore_client_bootstrap",
    },
  };
}

function catalogSummary(catalog) {
  const app = catalog?.apps?.[0] || null;
  const signatureProof = app?.signatureProof || null;
  return {
    appFound: Boolean(app),
    manifestHashPresent: Boolean(app?.identity?.manifestHash),
    packageHashPresent: Boolean(app?.identity?.packageHash),
    packageUrlPresent: Boolean(app?.identity?.packageUrl),
    packageUrlRemoteHttps: isRemoteHttpsUrl(app?.identity?.packageUrl),
    releaseIdPresent: Boolean(app?.identity?.releaseId),
    signatureProofAlgorithmPresent: Boolean(signatureProof?.algorithm),
    signatureProofPayloadHashPresent: Boolean(signatureProof?.payloadHash),
    signatureProofPresent: Boolean(signatureProof),
    signatureProofPublicKeyId: text(signatureProof?.publicKeyId) || null,
    signatureProofPublicKeyIdPresent: Boolean(
      text(signatureProof?.publicKeyId),
    ),
    signatureProofSignedAtPresent: Boolean(signatureProof?.signedAt),
    signatureRefPresent: Boolean(app?.identity?.signatureRef),
    sourceKind: app?.identity?.sourceKind || null,
    sourceKindCloudRelease: app?.identity?.sourceKind === "cloud_release",
  };
}

function bootstrapSummary(bootstrap, catalogInfo = {}) {
  const roots = Array.isArray(bootstrap?.pluginSignatureTrustRoots)
    ? bootstrap.pluginSignatureTrustRoots
    : [];
  const expectedPublicKeyId = catalogInfo.signatureProofPublicKeyId;
  const matchingRoot = expectedPublicKeyId
    ? roots.find((root) => text(root?.publicKeyId) === expectedPublicKeyId) ||
      null
    : null;
  return {
    matchingTrustRootAlgorithmPresent: Boolean(matchingRoot?.algorithm),
    matchingTrustRootPresent: Boolean(matchingRoot),
    matchingTrustRootPublicKeyPresent: Boolean(matchingRoot?.publicKey),
    trustRootCount: roots.length,
  };
}

function releaseEvidenceMissingRequirements({
  bootstrapInfo,
  catalogInfo,
  requests,
}) {
  const missing = [];
  if (!requests.marketplace.ok) missing.push("marketplaceRequest");
  if (!requests.bootstrap.ok) missing.push("bootstrapRequest");
  if (!catalogInfo.appFound) missing.push("catalogApp");
  if (!catalogInfo.sourceKindCloudRelease)
    missing.push("catalogSourceKindCloudRelease");
  if (!catalogInfo.packageUrlPresent) missing.push("catalogPackageUrl");
  if (catalogInfo.packageUrlPresent && !catalogInfo.packageUrlRemoteHttps) {
    missing.push("catalogPackageUrlRemoteHttps");
  }
  if (!catalogInfo.packageHashPresent) missing.push("catalogPackageHash");
  if (!catalogInfo.manifestHashPresent) missing.push("catalogManifestHash");
  if (!catalogInfo.releaseIdPresent) missing.push("catalogReleaseId");
  if (!catalogInfo.signatureRefPresent) missing.push("catalogSignatureRef");
  if (!catalogInfo.signatureProofPresent) {
    missing.push("catalogSignatureProof");
  } else {
    if (!catalogInfo.signatureProofPublicKeyIdPresent) {
      missing.push("catalogSignatureProofPublicKeyId");
    }
    if (!catalogInfo.signatureProofAlgorithmPresent) {
      missing.push("catalogSignatureProofAlgorithm");
    }
    if (!catalogInfo.signatureProofPayloadHashPresent) {
      missing.push("catalogSignatureProofPayloadHash");
    }
    if (!catalogInfo.signatureProofSignedAtPresent) {
      missing.push("catalogSignatureProofSignedAt");
    }
  }
  if (bootstrapInfo.trustRootCount <= 0) {
    missing.push("bootstrapTrustRoots");
  }
  if (
    catalogInfo.signatureProofPublicKeyIdPresent &&
    !bootstrapInfo.matchingTrustRootPresent
  ) {
    missing.push("bootstrapMatchingTrustRoot");
  }
  if (
    bootstrapInfo.matchingTrustRootPresent &&
    !bootstrapInfo.matchingTrustRootPublicKeyPresent
  ) {
    missing.push("bootstrapMatchingTrustRootPublicKey");
  }
  if (
    bootstrapInfo.matchingTrustRootPresent &&
    !bootstrapInfo.matchingTrustRootAlgorithmPresent
  ) {
    missing.push("bootstrapMatchingTrustRootAlgorithm");
  }
  return missing;
}

export function productionReleaseEvidenceMissingRequirementBlockers(
  releaseEvidence = {},
) {
  const requirements = Array.isArray(releaseEvidence?.missingRequirements)
    ? releaseEvidence.missingRequirements
    : [];
  return requirements
    .map((requirement) => {
      const code = MISSING_REQUIREMENT_BLOCKER_CODES[requirement];
      return code
        ? {
            code,
            detail: `Production release evidence missing requirement: ${requirement}.`,
          }
        : null;
    })
    .filter(Boolean);
}

function publicRequestResult(result) {
  return {
    error: result.error || null,
    ok: result.ok === true,
    status: result.status || "blocked",
  };
}

export async function fetchContentFactoryProductionReleaseEvidence({
  appId = "content-factory-app",
  bootstrapOutputPath = "",
  catalogOutputPath = "",
  env = process.env,
  fetcher = globalThis.fetch,
  input = {},
  marketplaceName = "limecloud",
  outputPath = "",
  timeoutMs = 30_000,
} = {}) {
  const plan = buildContentFactoryProductionReleaseEvidencePlan({
    appId,
    bootstrapOutputPath,
    catalogOutputPath,
    env,
    input,
    marketplaceName,
    outputPath,
  });
  if (!plan.requested || !plan.executable) {
    let summary = {
      ...plan,
      generatedAt: new Date().toISOString(),
    };
    if (outputPath) {
      writeJsonFile(outputPath, summary);
      summary = {
        ...summary,
        outputs: {
          ...summary.outputs,
          summary: pathStatus(outputPath),
        },
      };
      writeJsonFile(outputPath, summary);
    }
    return summary;
  }
  if (typeof fetcher !== "function") {
    throw new Error("fetch is not available in this Node runtime");
  }
  const resolved = resolveInputs(input, env);
  const tenantId = encodeURIComponent(resolved.tenantId);
  const query = new URLSearchParams({ query: appId });
  const marketplaceUrl = `${resolved.apiBase}/v1/public/tenants/${tenantId}/client/plugins/marketplace?${query.toString()}`;
  const bootstrapUrl = `${resolved.apiBase}/v1/public/tenants/${tenantId}/client/bootstrap`;
  const requests = {
    bootstrap: { ok: false, status: "blocked", error: null },
    marketplace: { ok: false, status: "blocked", error: null },
  };
  let catalog = null;
  let bootstrap = null;
  try {
    const marketplace = await requestJson(marketplaceUrl, {
      fetcher,
      timeoutMs,
      token: resolved.token,
    });
    catalog = normalizeMarketplaceCatalogEvidence({
      appId,
      marketplace,
      marketplaceName,
    });
    requests.marketplace = { ok: true, status: "ready", error: null };
    if (catalogOutputPath) writeJsonFile(catalogOutputPath, catalog);
  } catch (error) {
    requests.marketplace = {
      ok: false,
      status: "blocked",
      error: error instanceof Error ? error.message : String(error),
    };
  }
  try {
    const bootstrapPayload = await requestJson(bootstrapUrl, {
      fetcher,
      timeoutMs,
      token: resolved.token,
    });
    bootstrap = normalizeBootstrapTrustRootEvidence({
      bootstrap: bootstrapPayload,
    });
    requests.bootstrap = { ok: true, status: "ready", error: null };
    if (bootstrapOutputPath) writeJsonFile(bootstrapOutputPath, bootstrap);
  } catch (error) {
    requests.bootstrap = {
      ok: false,
      status: "blocked",
      error: error instanceof Error ? error.message : String(error),
    };
  }
  const catalogInfo = catalogSummary(catalog);
  const bootstrapInfo = bootstrapSummary(bootstrap, catalogInfo);
  const missingRequirements = releaseEvidenceMissingRequirements({
    bootstrapInfo,
    catalogInfo,
    requests,
  });
  const ready = missingRequirements.length === 0;
  let summary = {
    ...plan,
    catalog: catalogInfo,
    bootstrap: bootstrapInfo,
    generatedAt: new Date().toISOString(),
    missingRequirements,
    outputs: {
      bootstrap: pathStatus(bootstrapOutputPath),
      catalog: pathStatus(catalogOutputPath),
      summary: pathStatus(outputPath),
    },
    ready,
    requests: {
      bootstrap: publicRequestResult(requests.bootstrap),
      marketplace: publicRequestResult(requests.marketplace),
    },
    status: ready ? "ready" : "blocked",
  };
  if (outputPath) {
    writeJsonFile(outputPath, summary);
    summary = {
      ...summary,
      outputs: {
        ...summary.outputs,
        summary: pathStatus(outputPath),
      },
    };
    writeJsonFile(outputPath, summary);
  }
  return summary;
}
