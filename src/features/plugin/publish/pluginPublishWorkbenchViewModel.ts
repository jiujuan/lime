import type { PluginInstallReviewResult } from "@/lib/api/plugins";
import type {
  BulkPublishPluginPayload,
  BulkPublishPluginPreflightResponse,
  BulkPublishPluginTenantTargetPayload,
  PluginReleaseSignatureProof,
} from "@/lib/api/oemCloudPluginPublish";
import type { NormalizedAppManifest } from "../types";

export type PluginPublishDraftBlockerCode =
  | "package_missing"
  | "cloud_upload_missing"
  | "manifest_summary_sensitive"
  | "plugin_identity_invalid"
  | "package_url_invalid"
  | "package_hash_invalid"
  | "manifest_hash_invalid"
  | "target_tenant_missing"
  | "signature_ref_missing"
  | "signature_public_key_missing"
  | "signature_missing"
  | "signature_payload_hash_invalid"
  | "signature_signed_at_invalid";

export interface PluginPublishDraftBlocker {
  code: PluginPublishDraftBlockerCode;
  field: string;
}

export interface PluginPublishDraft {
  marketplaceName: string;
  packageUrl: string;
  signatureRef: string;
  signaturePublicKeyId: string;
  signatureAlgorithm: PluginReleaseSignatureProof["algorithm"];
  signature: string;
  signaturePayloadHash: string;
  signatureSignedAt: string;
  targetTenantId: string;
  registrationRequired: boolean;
  registrationCode: string;
  registrationHint: string;
  categoriesText: string;
  keywordsText: string;
}

export interface PluginPublishPackageArtifact {
  packageUrl: string;
  packageHash: string;
  manifestHash: string;
}

export interface PluginPublishStageState {
  packageSelected: boolean;
  releaseReady: boolean;
  signatureReady: boolean;
  targetReady: boolean;
  preflightPassed: boolean;
  publishReady: boolean;
}

const STRICT_SHA256_PATTERN = /^sha256:[a-fA-F0-9]{64}$/;
const PLUGIN_SEGMENT_PATTERN = /^[A-Za-z0-9_-]+$/;
const SENSITIVE_VALUE_PATTERNS = [
  /(?:api[_-]?key|access[_-]?token|refresh[_-]?token|secret|credential)\s*[:=]\s*[^\s,;]+/i,
  /bearer\s+[a-z0-9._~+/=-]{16,}/i,
  /sk-[a-z0-9_-]{16,}/i,
  /akia[0-9a-z]{16}/i,
  /-----begin [a-z0-9 ]*private key-----/i,
];

export function createDefaultPluginPublishDraft(
  params: {
    tenantId?: string;
    signedAt?: string;
  } = {},
): PluginPublishDraft {
  return {
    marketplaceName: "limecloud",
    packageUrl: "",
    signatureRef: "",
    signaturePublicKeyId: "",
    signatureAlgorithm: "Ed25519",
    signature: "",
    signaturePayloadHash: "",
    signatureSignedAt: params.signedAt ?? new Date().toISOString(),
    targetTenantId: params.tenantId ?? "",
    registrationRequired: false,
    registrationCode: "",
    registrationHint: "",
    categoriesText: "",
    keywordsText: "",
  };
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOptionalText(value: unknown): string | undefined {
  const normalized = normalizeText(value);
  return normalized ? normalized : undefined;
}

function normalizeTextList(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function isRFC3339(value: string): boolean {
  return Boolean(value) && Number.isFinite(Date.parse(value));
}

function isStrictSha256(value: string): boolean {
  return STRICT_SHA256_PATTERN.test(value.trim());
}

function isPluginSegment(value: string): boolean {
  return PLUGIN_SEGMENT_PATTERN.test(value.trim());
}

function resolveManifestDisplayName(manifest: NormalizedAppManifest): string {
  return normalizeOptionalText(manifest.displayName) ?? manifest.appId;
}

function resolveManifestCapabilities(
  review: PluginInstallReviewResult,
): string[] {
  const fromRequires = Object.keys(review.state.manifest.requires.capabilities);
  const fromProjection = review.state.projection.requiredCapabilities.map(
    (item) => item.capability,
  );
  return Array.from(new Set([...fromRequires, ...fromProjection])).filter(
    Boolean,
  );
}

function buildManifestSummary(
  manifest: NormalizedAppManifest,
  capabilities: string[],
): Record<string, unknown> {
  return {
    schemaVersion: "plugin-publish-summary/v1",
    manifestVersion: manifest.manifestVersion,
    name: manifest.appId,
    version: manifest.version,
    displayName: resolveManifestDisplayName(manifest),
    description: normalizeOptionalText(manifest.description),
    appType: normalizeOptionalText(manifest.appType),
    status: normalizeOptionalText(manifest.status),
    runtimeTargets: manifest.runtimeTargets,
    capabilities,
    entryCount: Array.isArray(manifest.entries) ? manifest.entries.length : 0,
    permissionCount: Array.isArray(manifest.permissions)
      ? manifest.permissions.length
      : 0,
    serviceCount: Array.isArray(manifest.services)
      ? manifest.services.length
      : 0,
    workflowCount: Array.isArray(manifest.workflows)
      ? manifest.workflows.length
      : 0,
  };
}

function hasSensitiveStringValue(value: string): boolean {
  return SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

function containsSensitiveManifestSummaryValue(value: unknown): boolean {
  if (typeof value === "string") {
    return hasSensitiveStringValue(value);
  }
  if (Array.isArray(value)) {
    return value.some(containsSensitiveManifestSummaryValue);
  }
  if (value && typeof value === "object") {
    return Object.values(value).some(containsSensitiveManifestSummaryValue);
  }
  return false;
}

export function validatePluginPublishDraft(params: {
  review: PluginInstallReviewResult | null;
  draft: PluginPublishDraft;
  packageArtifact?: PluginPublishPackageArtifact | null;
}): PluginPublishDraftBlocker[] {
  const { review, draft } = params;
  const blockers: PluginPublishDraftBlocker[] = [];
  const manifest = review?.state.manifest;
  const packageHash =
    params.packageArtifact?.packageHash ?? review?.state.identity.packageHash ?? "";
  const manifestHash =
    params.packageArtifact?.manifestHash ?? review?.state.identity.manifestHash ?? "";

  if (!review || !manifest) {
    blockers.push({ code: "package_missing", field: "package" });
    return blockers;
  }
  if (!params.packageArtifact) {
    blockers.push({
      code: "cloud_upload_missing",
      field: "release.packageUrl",
    });
  }
  if (
    !isPluginSegment(manifest.appId) ||
    !isPluginSegment(normalizeText(draft.marketplaceName))
  ) {
    blockers.push({
      code: "plugin_identity_invalid",
      field: "catalog.pluginName",
    });
  }
  if (
    containsSensitiveManifestSummaryValue(
      buildManifestSummary(manifest, resolveManifestCapabilities(review)),
    )
  ) {
    blockers.push({
      code: "manifest_summary_sensitive",
      field: "catalog.manifestSummary",
    });
  }
  if (!isHttpsUrl(normalizeText(draft.packageUrl))) {
    blockers.push({ code: "package_url_invalid", field: "release.packageUrl" });
  }
  if (!isStrictSha256(packageHash)) {
    blockers.push({
      code: "package_hash_invalid",
      field: "release.packageHash",
    });
  }
  if (!isStrictSha256(manifestHash)) {
    blockers.push({
      code: "manifest_hash_invalid",
      field: "release.manifestHash",
    });
  }
  if (!normalizeText(draft.targetTenantId)) {
    blockers.push({
      code: "target_tenant_missing",
      field: "targets[0].tenantId",
    });
  }
  if (!normalizeText(draft.signatureRef)) {
    blockers.push({
      code: "signature_ref_missing",
      field: "release.signatureRef",
    });
  }
  if (!normalizeText(draft.signaturePublicKeyId)) {
    blockers.push({
      code: "signature_public_key_missing",
      field: "release.signatureProof.publicKeyId",
    });
  }
  if (!normalizeText(draft.signature)) {
    blockers.push({
      code: "signature_missing",
      field: "release.signatureProof.signature",
    });
  }
  if (!isStrictSha256(normalizeText(draft.signaturePayloadHash))) {
    blockers.push({
      code: "signature_payload_hash_invalid",
      field: "release.signatureProof.payloadHash",
    });
  }
  if (!isRFC3339(normalizeText(draft.signatureSignedAt))) {
    blockers.push({
      code: "signature_signed_at_invalid",
      field: "release.signatureProof.signedAt",
    });
  }
  return blockers;
}

export function buildBulkPublishPluginPayload(params: {
  review: PluginInstallReviewResult;
  draft: PluginPublishDraft;
  packageArtifact?: PluginPublishPackageArtifact | null;
}): BulkPublishPluginPayload {
  const { review, draft } = params;
  const manifest = review.state.manifest;
  const capabilities = resolveManifestCapabilities(review);
  const manifestSummary = buildManifestSummary(manifest, capabilities);
  const categories = normalizeTextList(draft.categoriesText);
  const keywords = normalizeTextList(draft.keywordsText);
  const target: BulkPublishPluginTenantTargetPayload = {
    tenantId: normalizeText(draft.targetTenantId),
    enablementStatus: "published",
    visibility: "all_users",
    enabled: true,
    licenseState: "active",
    registrationRequired: draft.registrationRequired,
    registrationState: draft.registrationRequired ? "required" : "not_required",
    registrationHint: normalizeOptionalText(draft.registrationHint),
    displayOrder: 0,
  };

  return {
    catalog: {
      pluginName: manifest.appId,
      marketplaceName: normalizeText(draft.marketplaceName),
      displayName: resolveManifestDisplayName(manifest),
      description: normalizeOptionalText(manifest.description),
      latestVersion: manifest.version,
      status: "active",
      categories: categories.length > 0 ? categories : undefined,
      keywords: keywords.length > 0 ? keywords : undefined,
      capabilities: capabilities.length > 0 ? capabilities : undefined,
      manifestSummary,
    },
    release: {
      version: manifest.version,
      packageUrl:
        normalizeOptionalText(params.packageArtifact?.packageUrl) ??
        normalizeText(draft.packageUrl),
      packageHash:
        params.packageArtifact?.packageHash ?? review.state.identity.packageHash,
      manifestHash:
        params.packageArtifact?.manifestHash ?? review.state.identity.manifestHash,
      signatureRef: normalizeText(draft.signatureRef),
      signatureProof: {
        schemaVersion: "plugin-cloud-release-signature/v1",
        publicKeyId: normalizeText(draft.signaturePublicKeyId),
        algorithm: draft.signatureAlgorithm,
        signature: normalizeText(draft.signature),
        payloadHash: normalizeText(draft.signaturePayloadHash),
        signedAt: normalizeText(draft.signatureSignedAt),
      },
      manifestSummary,
      status: "ready",
    },
    targets: [target],
  };
}

export function buildPluginPublishStageState(params: {
  review: PluginInstallReviewResult | null;
  draft: PluginPublishDraft;
  preflight: BulkPublishPluginPreflightResponse | null;
  packageArtifact?: PluginPublishPackageArtifact | null;
}): PluginPublishStageState {
  const blockers = validatePluginPublishDraft({
    review: params.review,
    draft: params.draft,
    packageArtifact: params.packageArtifact,
  });
  const blockerCodes = new Set(blockers.map((item) => item.code));
  const packageSelected = Boolean(params.review);
  const releaseReady =
    packageSelected &&
    !blockerCodes.has("package_url_invalid") &&
    !blockerCodes.has("package_hash_invalid") &&
    !blockerCodes.has("manifest_hash_invalid");
  const signatureReady =
    !blockerCodes.has("signature_ref_missing") &&
    !blockerCodes.has("signature_public_key_missing") &&
    !blockerCodes.has("signature_missing") &&
    !blockerCodes.has("signature_payload_hash_invalid") &&
    !blockerCodes.has("signature_signed_at_invalid");
  const targetReady =
    !blockerCodes.has("target_tenant_missing");
  const preflightPassed = params.preflight?.valid === true;

  return {
    packageSelected,
    releaseReady,
    signatureReady,
    targetReady,
    preflightPassed,
    publishReady: blockers.length === 0,
  };
}
