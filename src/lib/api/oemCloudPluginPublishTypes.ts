import type { OemCloudPluginSignatureAlgorithm } from "./oemCloudRuntime";

export type PluginCatalogStatus = "draft" | "active" | "hidden" | "archived";
export type PluginReleaseStatus = "draft" | "ready" | "revoked" | "archived";
export type TenantPluginEnablementStatus =
  | "draft"
  | "gray"
  | "published"
  | "paused";
export type TenantPluginVisibility =
  | "all_users"
  | "whitelist"
  | "role_gated"
  | "plan_gated";
export type PluginLicenseState =
  | "active"
  | "trial"
  | "expired"
  | "revoked"
  | "unknown";
export type PluginRegistrationState =
  | "not_required"
  | "required"
  | "active"
  | "expired"
  | "revoked";
export type PluginBulkPublishTargetAction = "created" | "updated";
export type PluginReleaseSignatureVerificationStatus =
  | "verified"
  | "failed"
  | "unknown";
export type PluginPublishPreflightIssueSeverity = "blocker" | "warning";
export type PluginPackageUploadSessionStatus =
  | "created"
  | "uploaded"
  | "verified"
  | "rejected"
  | "expired";
export type PluginPackageScanReportStatus =
  | "passed"
  | "blocked"
  | "warning_only";
export type PluginReleaseSubmissionStatus =
  | "pending_review"
  | "blocked"
  | "rejected"
  | "published";
export type PluginAuditAction =
  | "catalog_created"
  | "catalog_updated"
  | "release_created"
  | "release_updated"
  | "release_revoked"
  | "enablement_created"
  | "enablement_updated"
  | "enablement_rollback"
  | "package_upload_created"
  | "package_upload_completed"
  | "package_upload_rejected"
  | "release_submission_created"
  | "release_submission_approved"
  | "release_submission_blocked"
  | "release_submission_rejected"
  | "release_submission_published"
  | "registration_activated"
  | "registration_failed"
  | "client_install_state_reported"
  | (string & {});

export interface PluginReleaseSignatureProof {
  schemaVersion?: "plugin-cloud-release-signature/v1";
  publicKeyId: string;
  algorithm: OemCloudPluginSignatureAlgorithm;
  signature: string;
  payloadHash: string;
  signedAt: string;
}

export interface PluginReleaseSignatureVerification {
  status: PluginReleaseSignatureVerificationStatus;
  verifiedAt?: string;
  evidenceRef?: string;
  transparencyLogRef?: string;
  failureReason?: string;
}

export interface BulkPublishPluginCatalogPayload {
  pluginName: string;
  marketplaceName?: string;
  displayName: string;
  description?: string;
  latestVersion?: string;
  status?: PluginCatalogStatus;
  categories?: string[];
  keywords?: string[];
  capabilities?: string[];
  manifestSummary?: Record<string, unknown>;
  sort?: number;
}

export interface BulkPublishPluginReleasePayload {
  version: string;
  packageUrl: string;
  packageHash: string;
  manifestHash: string;
  signatureRef?: string;
  signatureProof?: PluginReleaseSignatureProof;
  manifestSummary?: Record<string, unknown>;
  status?: PluginReleaseStatus;
}

export interface BulkPublishPluginTenantTargetPayload {
  tenantId: string;
  enablementStatus?: TenantPluginEnablementStatus;
  visibility?: TenantPluginVisibility;
  whitelistUserIds?: string[];
  roleBindings?: string[];
  planBindings?: string[];
  rolloutPercent?: number;
  enabled?: boolean;
  disabledReason?: string;
  licenseState?: PluginLicenseState;
  registrationRequired?: boolean;
  registrationState?: PluginRegistrationState;
  registrationCode?: string;
  registrationHint?: string;
  registrationExpiresAt?: string;
  displayOrder?: number;
}

export interface BulkPublishPluginPayload {
  catalog: BulkPublishPluginCatalogPayload;
  release: BulkPublishPluginReleasePayload;
  targets: BulkPublishPluginTenantTargetPayload[];
}

export interface PluginPublishPreflightIssue {
  code: string;
  field?: string;
  severity: PluginPublishPreflightIssueSeverity;
  message: string;
}

export interface BulkPublishPluginPreflightTargetImpact {
  tenantId: string;
  action: PluginBulkPublishTargetAction;
}

export interface BulkPublishPluginPreflightResponse {
  valid: boolean;
  blockers: PluginPublishPreflightIssue[];
  warnings?: PluginPublishPreflightIssue[];
  normalizedPayload?: BulkPublishPluginPayload;
  targetImpact?: BulkPublishPluginPreflightTargetImpact[];
  signatureVerification?: PluginReleaseSignatureVerification;
  checkedAt: string;
}

export interface BulkPublishPluginTargetResult {
  tenantId: string;
  action: PluginBulkPublishTargetAction;
  enablement: Record<string, unknown>;
}

export interface BulkPublishPluginResponse {
  catalog: Record<string, unknown>;
  release: Record<string, unknown>;
  targets: BulkPublishPluginTargetResult[];
}

export interface CreatePluginPackageUploadSessionPayload {
  tenantId: string;
  pluginName: string;
  marketplaceName?: string;
  version: string;
  expectedPackageHash: string;
  expectedManifestHash: string;
  sizeBytes: number;
  contentType?: string;
}

export interface CreateClientPluginPackageUploadSessionPayload extends Omit<
  CreatePluginPackageUploadSessionPayload,
  "tenantId"
> {
  tenantId?: string;
}

export interface PluginPackageUploadSession {
  id: string;
  tenantId: string;
  developerUserId?: string;
  pluginName: string;
  marketplaceName: string;
  version: string;
  expectedPackageHash: string;
  expectedManifestHash: string;
  objectKey: string;
  uploadUrl: string;
  packageUrl?: string;
  contentType: string;
  sizeBytes: number;
  status: PluginPackageUploadSessionStatus;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface UploadPluginPackageContentResponse {
  sessionId: string;
  status: PluginPackageUploadSessionStatus;
  sizeBytes: number;
}

export interface PluginPackageScanReport {
  id: string;
  sessionId: string;
  packageHash: string;
  manifestHash: string;
  sizeBytes: number;
  fileCount: number;
  status: PluginPackageScanReportStatus;
  blockers?: PluginPublishPreflightIssue[];
  warnings?: PluginPublishPreflightIssue[];
  evidenceRef: string;
  createdAt: string;
}

export interface CompletePluginPackageUploadSessionResponse {
  session: PluginPackageUploadSession;
  scanReport: PluginPackageScanReport;
}

export interface CreatePluginReleaseSubmissionPayload {
  uploadSessionId: string;
  payload: BulkPublishPluginPayload;
  notes?: string;
}

export interface PluginReleaseSubmission {
  id: string;
  tenantId: string;
  developerUserId: string;
  developerId?: string;
  pluginName: string;
  marketplaceName: string;
  version: string;
  uploadSessionId: string;
  packageUrl: string;
  packageHash: string;
  manifestHash: string;
  payload: BulkPublishPluginPayload;
  payloadHash: string;
  preflight?: BulkPublishPluginPreflightResponse;
  scanEvidenceRef?: string;
  status: PluginReleaseSubmissionStatus;
  developerNotes?: string;
  reviewer?: string;
  reviewNotes?: string;
  reviewDecisionAt?: string;
  publishedReleaseId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PluginReleaseSubmissionListResponse {
  items: PluginReleaseSubmission[];
}

export interface ReviewPluginReleaseSubmissionPayload {
  notes?: string;
}

export interface RejectPluginReleaseSubmissionPayload {
  reason: string;
}

export interface PluginReleaseSubmissionReviewResponse {
  submission: PluginReleaseSubmission;
  publish?: BulkPublishPluginResponse;
}

export interface PluginAuditLog {
  id: string;
  tenantId?: string;
  pluginName: string;
  marketplaceName: string;
  releaseId?: string;
  operator?: string;
  action: PluginAuditAction;
  summary?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface PluginAuditLogListResponse {
  items: PluginAuditLog[];
}
