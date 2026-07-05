import { resolveOemCloudRuntimeContext } from "./oemCloudRuntime";
import { OemCloudControlPlaneError } from "./oemCloudControlPlane";
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

interface ControlPlaneEnvelope<T> {
  code?: number;
  message?: string;
  data?: T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function normalizeBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => normalizeText(item))
    .filter((item): item is string => Boolean(item));
}

function parseIssueSeverity(
  value: unknown,
): PluginPublishPreflightIssueSeverity {
  return value === "warning" ? "warning" : "blocker";
}

function parseTargetAction(value: unknown): PluginBulkPublishTargetAction {
  return value === "updated" ? "updated" : "created";
}

function parseSignatureVerificationStatus(
  value: unknown,
): PluginReleaseSignatureVerificationStatus {
  if (value === "verified" || value === "failed") {
    return value;
  }
  return "unknown";
}

function parseUploadSessionStatus(
  value: unknown,
): PluginPackageUploadSessionStatus {
  if (
    value === "created" ||
    value === "uploaded" ||
    value === "verified" ||
    value === "rejected" ||
    value === "expired"
  ) {
    return value;
  }
  throw new OemCloudControlPlaneError("Plugin package 上传会话状态非法。");
}

function parseScanReportStatus(value: unknown): PluginPackageScanReportStatus {
  if (value === "passed" || value === "blocked" || value === "warning_only") {
    return value;
  }
  throw new OemCloudControlPlaneError("Plugin package 扫描状态非法。");
}

function parseReleaseSubmissionStatus(
  value: unknown,
): PluginReleaseSubmissionStatus {
  if (
    value === "pending_review" ||
    value === "blocked" ||
    value === "rejected" ||
    value === "published"
  ) {
    return value;
  }
  throw new OemCloudControlPlaneError("Plugin 发布审核单状态非法。");
}

function unwrapEnvelope<T>(payload: unknown): {
  data: T | undefined;
  message: string;
  code: number | undefined;
} {
  if (!isRecord(payload)) {
    return {
      data: payload as T,
      message: "",
      code: undefined,
    };
  }
  return {
    data: payload.data as T | undefined,
    message: normalizeText(payload.message) ?? "",
    code: typeof payload.code === "number" ? payload.code : undefined,
  };
}

function ensureRuntime() {
  const runtime = resolveOemCloudRuntimeContext();
  if (!runtime) {
    throw new OemCloudControlPlaneError(
      "缺少品牌云端配置，请先配置域名与租户。",
    );
  }
  return runtime;
}

function buildControlPlaneUrl(path: string): string {
  const runtime = ensureRuntime();
  const normalizedPath = normalizeText(path);
  if (!normalizedPath) {
    throw new OemCloudControlPlaneError("请求路径不能为空。");
  }
  if (/^https:\/\//i.test(normalizedPath)) {
    return normalizedPath;
  }
  if (normalizedPath.startsWith("/api/")) {
    return `${runtime.baseUrl}${normalizedPath}`;
  }
  return `${runtime.controlPlaneBaseUrl}${
    normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`
  }`;
}

function shouldAttachControlPlaneAuthorization(url: string): boolean {
  const runtime = ensureRuntime();
  try {
    return new URL(url).origin === new URL(runtime.baseUrl).origin;
  } catch {
    return false;
  }
}

function requireSessionToken(): string {
  const token = normalizeText(ensureRuntime().sessionToken);
  if (!token) {
    throw new OemCloudControlPlaneError(
      "缺少品牌云端 Session Token，请先完成登录。",
    );
  }
  return token;
}

async function requestPluginPublishControlPlane<T>(
  path: string,
  options:
    | {
        method: "GET";
      }
    | {
        method: "POST";
        payload?: unknown;
      },
): Promise<T> {
  const token = requireSessionToken();
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
  };
  const init: RequestInit = {
    method: options.method,
    headers,
  };
  if (options.method === "POST") {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(options.payload ?? {});
  }

  const response = await fetch(buildControlPlaneUrl(path), init);

  let payload: ControlPlaneEnvelope<T> | unknown = null;
  try {
    payload = (await response.json()) as ControlPlaneEnvelope<T>;
  } catch {
    payload = null;
  }

  const { data, message, code } = unwrapEnvelope<T>(payload);
  if (!response.ok) {
    throw new OemCloudControlPlaneError(
      message || `请求失败 (${response.status})`,
      {
        status: response.status,
        code,
      },
    );
  }
  if (data === undefined) {
    throw new OemCloudControlPlaneError(message || "响应缺少 data 字段", {
      status: response.status,
      code,
    });
  }
  return data;
}

function resolveClientTenantId(value?: string): string {
  const tenantId =
    normalizeText(value) ?? normalizeText(ensureRuntime().tenantId);
  if (!tenantId) {
    throw new OemCloudControlPlaneError("缺少目标租户 ID。");
  }
  return tenantId;
}

function resolveClientSubmissionRegistrationState(
  target: BulkPublishPluginTenantTargetPayload,
): PluginRegistrationState {
  if (!target.registrationRequired) {
    return target.registrationState ?? "not_required";
  }
  if (target.registrationState && target.registrationState !== "active") {
    return target.registrationState;
  }
  return "required";
}

function sanitizeClientReleaseSubmissionPayload(
  payload: BulkPublishPluginPayload,
): BulkPublishPluginPayload {
  return {
    ...payload,
    targets: payload.targets.map((target) => {
      const { registrationCode: _registrationCode, ...sanitizedTarget } =
        target;
      return {
        ...sanitizedTarget,
        registrationState:
          resolveClientSubmissionRegistrationState(sanitizedTarget),
      };
    }),
  };
}

function buildClientPluginPath(tenantId: string, path: string): string {
  return `/v1/public/tenants/${encodeURIComponent(
    tenantId,
  )}/client/plugins${path.startsWith("/") ? path : `/${path}`}`;
}

function resolveClientPluginPackageUploadPath(
  tenantId: string,
  sessionId: string,
  uploadUrl?: string,
): string {
  const normalizedUploadUrl = normalizeText(uploadUrl);
  if (/^https:\/\//i.test(normalizedUploadUrl ?? "")) {
    return normalizedUploadUrl ?? "";
  }
  if (
    normalizedUploadUrl?.startsWith(
      `/api/v1/public/tenants/${tenantId}/client/plugins/`,
    ) ||
    normalizedUploadUrl?.startsWith(
      `/v1/public/tenants/${tenantId}/client/plugins/`,
    )
  ) {
    return normalizedUploadUrl;
  }
  return buildClientPluginPath(
    tenantId,
    `/package-upload-sessions/${encodeURIComponent(sessionId)}/content`,
  );
}

async function requestPluginPackageUploadContent<T>(
  path: string,
  options: {
    method: "PUT";
    contentBase64: string;
    contentType: string;
  },
): Promise<T> {
  const token = requireSessionToken();
  const url = buildControlPlaneUrl(path);
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": options.contentType,
  };
  if (shouldAttachControlPlaneAuthorization(url)) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(url, {
    method: options.method,
    headers,
    body: decodeBase64ToArrayBuffer(options.contentBase64),
  });

  let payload: ControlPlaneEnvelope<T> | unknown = null;
  try {
    payload = (await response.json()) as ControlPlaneEnvelope<T>;
  } catch {
    payload = null;
  }

  const { data, message, code } = unwrapEnvelope<T>(payload);
  if (!response.ok) {
    throw new OemCloudControlPlaneError(
      message || `请求失败 (${response.status})`,
      {
        status: response.status,
        code,
      },
    );
  }
  if (data === undefined) {
    throw new OemCloudControlPlaneError(message || "响应缺少 data 字段", {
      status: response.status,
      code,
    });
  }
  return data;
}

function decodeBase64ToArrayBuffer(value: string): ArrayBuffer {
  const normalized = value.trim();
  let binary = "";
  if (typeof atob === "function") {
    binary = atob(normalized);
  } else {
    const bufferCtor = (
      globalThis as typeof globalThis & {
        Buffer?: { from(input: string, encoding: "base64"): Uint8Array };
      }
    ).Buffer;
    if (!bufferCtor) {
      throw new OemCloudControlPlaneError("当前环境不支持 base64 解码。");
    }
    binary = Array.from(bufferCtor.from(normalized, "base64"))
      .map((byte) => String.fromCharCode(byte))
      .join("");
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function parsePreflightIssue(value: unknown): PluginPublishPreflightIssue {
  if (!isRecord(value)) {
    throw new OemCloudControlPlaneError("Plugin 发布预检 issue 格式非法。");
  }
  const code = normalizeText(value.code);
  const message = normalizeText(value.message);
  if (!code || !message) {
    throw new OemCloudControlPlaneError("Plugin 发布预检 issue 缺少必要字段。");
  }
  return {
    code,
    field: normalizeText(value.field),
    severity: parseIssueSeverity(value.severity),
    message,
  };
}

function parseSignatureVerification(
  value: unknown,
): PluginReleaseSignatureVerification | undefined {
  if (value == null) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new OemCloudControlPlaneError("Plugin 发布签名验证结果格式非法。");
  }
  return {
    status: parseSignatureVerificationStatus(value.status),
    verifiedAt: normalizeText(value.verifiedAt),
    evidenceRef: normalizeText(value.evidenceRef),
    transparencyLogRef: normalizeText(value.transparencyLogRef),
    failureReason: normalizeText(value.failureReason),
  };
}

function parseTargetImpact(
  value: unknown,
): BulkPublishPluginPreflightTargetImpact {
  if (!isRecord(value)) {
    throw new OemCloudControlPlaneError("Plugin 发布影响目标格式非法。");
  }
  const tenantId = normalizeText(value.tenantId);
  if (!tenantId) {
    throw new OemCloudControlPlaneError("Plugin 发布影响目标缺少 tenantId。");
  }
  return {
    tenantId,
    action: parseTargetAction(value.action),
  };
}

function parsePreflightResponse(
  value: unknown,
): BulkPublishPluginPreflightResponse {
  if (!isRecord(value)) {
    throw new OemCloudControlPlaneError("Plugin 发布预检响应格式非法。");
  }
  const checkedAt = normalizeText(value.checkedAt);
  if (!checkedAt) {
    throw new OemCloudControlPlaneError("Plugin 发布预检响应缺少 checkedAt。");
  }
  return {
    valid: normalizeBoolean(value.valid),
    blockers: Array.isArray(value.blockers)
      ? value.blockers.map(parsePreflightIssue)
      : [],
    warnings: Array.isArray(value.warnings)
      ? value.warnings.map(parsePreflightIssue)
      : undefined,
    normalizedPayload: isRecord(value.normalizedPayload)
      ? (value.normalizedPayload as unknown as BulkPublishPluginPayload)
      : undefined,
    targetImpact: Array.isArray(value.targetImpact)
      ? value.targetImpact.map(parseTargetImpact)
      : undefined,
    signatureVerification: parseSignatureVerification(
      value.signatureVerification,
    ),
    checkedAt,
  };
}

function parseTargetResult(value: unknown): BulkPublishPluginTargetResult {
  if (!isRecord(value)) {
    throw new OemCloudControlPlaneError("Plugin 发布目标结果格式非法。");
  }
  const tenantId = normalizeText(value.tenantId);
  if (!tenantId || !isRecord(value.enablement)) {
    throw new OemCloudControlPlaneError("Plugin 发布目标结果缺少必要字段。");
  }
  return {
    tenantId,
    action: parseTargetAction(value.action),
    enablement: value.enablement,
  };
}

function parsePublishResponse(value: unknown): BulkPublishPluginResponse {
  if (
    !isRecord(value) ||
    !isRecord(value.catalog) ||
    !isRecord(value.release)
  ) {
    throw new OemCloudControlPlaneError("Plugin 发布响应格式非法。");
  }
  return {
    catalog: value.catalog,
    release: value.release,
    targets: Array.isArray(value.targets)
      ? value.targets.map(parseTargetResult)
      : [],
  };
}

function parsePluginPackageUploadSession(
  value: unknown,
): PluginPackageUploadSession {
  if (!isRecord(value)) {
    throw new OemCloudControlPlaneError("Plugin package 上传会话格式非法。");
  }
  const id = normalizeText(value.id);
  const tenantId = normalizeText(value.tenantId);
  const pluginName = normalizeText(value.pluginName);
  const marketplaceName = normalizeText(value.marketplaceName);
  const version = normalizeText(value.version);
  const expectedPackageHash = normalizeText(value.expectedPackageHash);
  const expectedManifestHash = normalizeText(value.expectedManifestHash);
  const objectKey = normalizeText(value.objectKey);
  const uploadUrl = normalizeText(value.uploadUrl);
  const contentType = normalizeText(value.contentType);
  const expiresAt = normalizeText(value.expiresAt);
  const createdAt = normalizeText(value.createdAt);
  const updatedAt = normalizeText(value.updatedAt);
  if (
    !id ||
    !tenantId ||
    !pluginName ||
    !marketplaceName ||
    !version ||
    !expectedPackageHash ||
    !expectedManifestHash ||
    !objectKey ||
    !uploadUrl ||
    !contentType ||
    !expiresAt ||
    !createdAt ||
    !updatedAt ||
    typeof value.sizeBytes !== "number"
  ) {
    throw new OemCloudControlPlaneError(
      "Plugin package 上传会话缺少必要字段。",
    );
  }
  return {
    id,
    tenantId,
    developerUserId: normalizeText(value.developerUserId),
    pluginName,
    marketplaceName,
    version,
    expectedPackageHash,
    expectedManifestHash,
    objectKey,
    uploadUrl,
    packageUrl: normalizeText(value.packageUrl),
    contentType,
    sizeBytes: value.sizeBytes,
    status: parseUploadSessionStatus(value.status),
    expiresAt,
    createdAt,
    updatedAt,
  };
}

function parseUploadContentResponse(
  value: unknown,
): UploadPluginPackageContentResponse {
  if (!isRecord(value)) {
    throw new OemCloudControlPlaneError("Plugin package 上传响应格式非法。");
  }
  const sessionId = normalizeText(value.sessionId);
  if (!sessionId || typeof value.sizeBytes !== "number") {
    throw new OemCloudControlPlaneError(
      "Plugin package 上传响应缺少必要字段。",
    );
  }
  return {
    sessionId,
    status: parseUploadSessionStatus(value.status),
    sizeBytes: value.sizeBytes,
  };
}

function parsePluginPackageScanReport(value: unknown): PluginPackageScanReport {
  if (!isRecord(value)) {
    throw new OemCloudControlPlaneError("Plugin package 扫描报告格式非法。");
  }
  const id = normalizeText(value.id);
  const sessionId = normalizeText(value.sessionId);
  const packageHash = normalizeText(value.packageHash);
  const manifestHash = normalizeText(value.manifestHash);
  const evidenceRef = normalizeText(value.evidenceRef);
  const createdAt = normalizeText(value.createdAt);
  if (
    !id ||
    !sessionId ||
    !packageHash ||
    !evidenceRef ||
    !createdAt ||
    typeof value.sizeBytes !== "number" ||
    typeof value.fileCount !== "number"
  ) {
    throw new OemCloudControlPlaneError(
      "Plugin package 扫描报告缺少必要字段。",
    );
  }
  return {
    id,
    sessionId,
    packageHash,
    manifestHash: manifestHash ?? "",
    sizeBytes: value.sizeBytes,
    fileCount: value.fileCount,
    status: parseScanReportStatus(value.status),
    blockers: Array.isArray(value.blockers)
      ? value.blockers.map(parsePreflightIssue)
      : undefined,
    warnings: Array.isArray(value.warnings)
      ? value.warnings.map(parsePreflightIssue)
      : undefined,
    evidenceRef,
    createdAt,
  };
}

function parseCompleteUploadResponse(
  value: unknown,
): CompletePluginPackageUploadSessionResponse {
  if (!isRecord(value)) {
    throw new OemCloudControlPlaneError(
      "Plugin package complete 响应格式非法。",
    );
  }
  return {
    session: parsePluginPackageUploadSession(value.session),
    scanReport: parsePluginPackageScanReport(value.scanReport),
  };
}

function parsePluginReleaseSubmission(value: unknown): PluginReleaseSubmission {
  if (!isRecord(value)) {
    throw new OemCloudControlPlaneError("Plugin 发布审核单格式非法。");
  }
  const id = normalizeText(value.id);
  const tenantId = normalizeText(value.tenantId);
  const developerUserId = normalizeText(value.developerUserId);
  const pluginName = normalizeText(value.pluginName);
  const marketplaceName = normalizeText(value.marketplaceName);
  const version = normalizeText(value.version);
  const uploadSessionId = normalizeText(value.uploadSessionId);
  const packageUrl = normalizeText(value.packageUrl);
  const packageHash = normalizeText(value.packageHash);
  const manifestHash = normalizeText(value.manifestHash);
  const payloadHash = normalizeText(value.payloadHash);
  const createdAt = normalizeText(value.createdAt);
  const updatedAt = normalizeText(value.updatedAt);
  if (
    !id ||
    !tenantId ||
    !developerUserId ||
    !pluginName ||
    !marketplaceName ||
    !version ||
    !uploadSessionId ||
    !packageUrl ||
    !packageHash ||
    !manifestHash ||
    !isRecord(value.payload) ||
    !payloadHash ||
    !createdAt ||
    !updatedAt
  ) {
    throw new OemCloudControlPlaneError("Plugin 发布审核单缺少必要字段。");
  }
  return {
    id,
    tenantId,
    developerUserId,
    developerId: normalizeText(value.developerId),
    pluginName,
    marketplaceName,
    version,
    uploadSessionId,
    packageUrl,
    packageHash,
    manifestHash,
    payload: value.payload as unknown as BulkPublishPluginPayload,
    payloadHash,
    preflight: isRecord(value.preflight)
      ? parsePreflightResponse(value.preflight)
      : undefined,
    scanEvidenceRef: normalizeText(value.scanEvidenceRef),
    status: parseReleaseSubmissionStatus(value.status),
    developerNotes: normalizeText(value.developerNotes),
    reviewer: normalizeText(value.reviewer),
    reviewNotes: normalizeText(value.reviewNotes),
    reviewDecisionAt: normalizeText(value.reviewDecisionAt),
    publishedReleaseId: normalizeText(value.publishedReleaseId),
    createdAt,
    updatedAt,
  };
}

function parsePluginReleaseSubmissionList(
  value: unknown,
): PluginReleaseSubmissionListResponse {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    throw new OemCloudControlPlaneError("Plugin 发布审核单列表格式非法。");
  }
  return {
    items: value.items.map(parsePluginReleaseSubmission),
  };
}

function parsePluginReleaseSubmissionReviewResponse(
  value: unknown,
): PluginReleaseSubmissionReviewResponse {
  if (!isRecord(value)) {
    throw new OemCloudControlPlaneError("Plugin 发布审核响应格式非法。");
  }
  return {
    submission: parsePluginReleaseSubmission(value.submission),
    publish: isRecord(value.publish)
      ? parsePublishResponse(value.publish)
      : undefined,
  };
}

function parsePluginAuditLog(value: unknown): PluginAuditLog {
  if (!isRecord(value)) {
    throw new OemCloudControlPlaneError("Plugin 审计记录格式非法。");
  }
  const id = normalizeText(value.id);
  const pluginName = normalizeText(value.pluginName);
  const marketplaceName = normalizeText(value.marketplaceName);
  const action = normalizeText(value.action);
  const createdAt = normalizeText(value.createdAt);
  if (!id || !pluginName || !marketplaceName || !action || !createdAt) {
    throw new OemCloudControlPlaneError("Plugin 审计记录缺少必要字段。");
  }
  return {
    id,
    tenantId: normalizeText(value.tenantId),
    pluginName,
    marketplaceName,
    releaseId: normalizeText(value.releaseId),
    operator: normalizeText(value.operator),
    action: action as PluginAuditAction,
    summary: normalizeText(value.summary),
    metadata: isRecord(value.metadata) ? value.metadata : undefined,
    createdAt,
  };
}

function parsePluginAuditLogList(value: unknown): PluginAuditLogListResponse {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    throw new OemCloudControlPlaneError("Plugin 审计记录列表格式非法。");
  }
  return {
    items: value.items.map(parsePluginAuditLog),
  };
}

export async function preflightBulkPublishPlugin(
  payload: BulkPublishPluginPayload,
): Promise<BulkPublishPluginPreflightResponse> {
  return parsePreflightResponse(
    await requestPluginPublishControlPlane<unknown>(
      "/v1/platform/plugins/bulk-publish/preflight",
      {
        method: "POST",
        payload,
      },
    ),
  );
}

export async function createPluginPackageUploadSession(
  payload: CreatePluginPackageUploadSessionPayload,
): Promise<PluginPackageUploadSession> {
  return parsePluginPackageUploadSession(
    await requestPluginPublishControlPlane<unknown>(
      "/v1/platform/plugins/package-upload-sessions",
      {
        method: "POST",
        payload,
      },
    ),
  );
}

export async function createClientPluginPackageUploadSession(
  payload: CreateClientPluginPackageUploadSessionPayload,
): Promise<PluginPackageUploadSession> {
  const tenantId = resolveClientTenantId(payload.tenantId);
  const { tenantId: _tenantId, ...body } = payload;
  return parsePluginPackageUploadSession(
    await requestPluginPublishControlPlane<unknown>(
      buildClientPluginPath(tenantId, "/package-upload-sessions"),
      {
        method: "POST",
        payload: body,
      },
    ),
  );
}

export async function uploadPluginPackageContent(params: {
  sessionId: string;
  uploadUrl?: string;
  contentBase64: string;
  contentType: string;
}): Promise<UploadPluginPackageContentResponse> {
  const uploadPath =
    normalizeText(params.uploadUrl) ??
    `/v1/platform/plugins/package-upload-sessions/${encodeURIComponent(
      params.sessionId,
    )}/content`;
  return parseUploadContentResponse(
    await requestPluginPackageUploadContent<unknown>(uploadPath, {
      method: "PUT",
      contentBase64: params.contentBase64,
      contentType: params.contentType,
    }),
  );
}

export async function uploadClientPluginPackageContent(params: {
  tenantId?: string;
  sessionId: string;
  uploadUrl?: string;
  contentBase64: string;
  contentType: string;
}): Promise<UploadPluginPackageContentResponse> {
  const tenantId = resolveClientTenantId(params.tenantId);
  const uploadPath = resolveClientPluginPackageUploadPath(
    tenantId,
    params.sessionId,
    params.uploadUrl,
  );
  return parseUploadContentResponse(
    await requestPluginPackageUploadContent<unknown>(uploadPath, {
      method: "PUT",
      contentBase64: params.contentBase64,
      contentType: params.contentType,
    }),
  );
}

export async function completePluginPackageUploadSession(
  sessionId: string,
): Promise<CompletePluginPackageUploadSessionResponse> {
  return parseCompleteUploadResponse(
    await requestPluginPublishControlPlane<unknown>(
      `/v1/platform/plugins/package-upload-sessions/${encodeURIComponent(
        sessionId,
      )}/complete`,
      {
        method: "POST",
        payload: {},
      },
    ),
  );
}

export async function completeClientPluginPackageUploadSession(params: {
  tenantId?: string;
  sessionId: string;
}): Promise<CompletePluginPackageUploadSessionResponse> {
  const tenantId = resolveClientTenantId(params.tenantId);
  return parseCompleteUploadResponse(
    await requestPluginPublishControlPlane<unknown>(
      buildClientPluginPath(
        tenantId,
        `/package-upload-sessions/${encodeURIComponent(
          params.sessionId,
        )}/complete`,
      ),
      {
        method: "POST",
      },
    ),
  );
}

export async function createClientPluginReleaseSubmission(params: {
  tenantId?: string;
  uploadSessionId: string;
  payload: BulkPublishPluginPayload;
  notes?: string;
}): Promise<PluginReleaseSubmission> {
  const tenantId = resolveClientTenantId(params.tenantId);
  const payload = sanitizeClientReleaseSubmissionPayload(params.payload);
  return parsePluginReleaseSubmission(
    await requestPluginPublishControlPlane<unknown>(
      buildClientPluginPath(tenantId, "/release-submissions"),
      {
        method: "POST",
        payload: {
          uploadSessionId: params.uploadSessionId,
          payload,
          notes: normalizeText(params.notes),
        } satisfies CreatePluginReleaseSubmissionPayload,
      },
    ),
  );
}

export async function preflightClientPluginReleaseSubmission(params: {
  tenantId?: string;
  uploadSessionId: string;
  payload: BulkPublishPluginPayload;
  notes?: string;
}): Promise<BulkPublishPluginPreflightResponse> {
  const tenantId = resolveClientTenantId(params.tenantId);
  const payload = sanitizeClientReleaseSubmissionPayload(params.payload);
  return parsePreflightResponse(
    await requestPluginPublishControlPlane<unknown>(
      buildClientPluginPath(tenantId, "/release-submissions/preflight"),
      {
        method: "POST",
        payload: {
          uploadSessionId: params.uploadSessionId,
          payload,
          notes: normalizeText(params.notes),
        } satisfies CreatePluginReleaseSubmissionPayload,
      },
    ),
  );
}

export async function listClientPluginReleaseSubmissions(
  params: {
    tenantId?: string;
    pluginName?: string;
    marketplaceName?: string;
    status?: PluginReleaseSubmissionStatus;
  } = {},
): Promise<PluginReleaseSubmissionListResponse> {
  const tenantId = resolveClientTenantId(params.tenantId);
  const search = new URLSearchParams();
  if (normalizeText(params.pluginName)) {
    search.set("pluginName", normalizeText(params.pluginName) ?? "");
  }
  if (normalizeText(params.marketplaceName)) {
    search.set("marketplaceName", normalizeText(params.marketplaceName) ?? "");
  }
  if (params.status) {
    search.set("status", params.status);
  }
  const query = search.toString();
  return parsePluginReleaseSubmissionList(
    await requestPluginPublishControlPlane<unknown>(
      `${buildClientPluginPath(tenantId, "/release-submissions")}${
        query ? `?${query}` : ""
      }`,
      {
        method: "GET",
      },
    ),
  );
}

export async function getClientPluginReleaseSubmission(params: {
  tenantId?: string;
  submissionId: string;
}): Promise<PluginReleaseSubmission> {
  const tenantId = resolveClientTenantId(params.tenantId);
  return parsePluginReleaseSubmission(
    await requestPluginPublishControlPlane<unknown>(
      buildClientPluginPath(
        tenantId,
        `/release-submissions/${encodeURIComponent(params.submissionId)}`,
      ),
      {
        method: "GET",
      },
    ),
  );
}

export async function bulkPublishPlugin(
  payload: BulkPublishPluginPayload,
): Promise<BulkPublishPluginResponse> {
  return parsePublishResponse(
    await requestPluginPublishControlPlane<unknown>(
      "/v1/platform/plugins/bulk-publish",
      {
        method: "POST",
        payload,
      },
    ),
  );
}

export async function listPluginReleaseSubmissions(
  params: {
    tenantId?: string;
    developerUserId?: string;
    pluginName?: string;
    marketplaceName?: string;
    status?: PluginReleaseSubmissionStatus;
  } = {},
): Promise<PluginReleaseSubmissionListResponse> {
  const search = new URLSearchParams();
  const entries = {
    tenantId: params.tenantId,
    developerUserId: params.developerUserId,
    pluginName: params.pluginName,
    marketplaceName: params.marketplaceName,
    status: params.status,
  };
  for (const [key, value] of Object.entries(entries)) {
    const normalized = normalizeText(value);
    if (normalized) {
      search.set(key, normalized);
    }
  }
  const query = search.toString();
  return parsePluginReleaseSubmissionList(
    await requestPluginPublishControlPlane<unknown>(
      `/v1/platform/plugins/release-submissions${query ? `?${query}` : ""}`,
      {
        method: "GET",
      },
    ),
  );
}

export async function listPlatformPluginAuditLogs(
  params: {
    tenantIds?: string[];
    pluginName?: string;
    marketplaceName?: string;
    action?: PluginAuditAction;
  } = {},
): Promise<PluginAuditLogListResponse> {
  const search = new URLSearchParams();
  for (const tenantId of params.tenantIds ?? []) {
    const normalized = normalizeText(tenantId);
    if (normalized) {
      search.append("tenantId", normalized);
    }
  }
  const entries = {
    pluginName: params.pluginName,
    marketplaceName: params.marketplaceName,
    action: params.action,
  };
  for (const [key, value] of Object.entries(entries)) {
    const normalized = normalizeText(value);
    if (normalized) {
      search.set(key, normalized);
    }
  }
  const query = search.toString();
  return parsePluginAuditLogList(
    await requestPluginPublishControlPlane<unknown>(
      `/v1/platform/plugins/audit-logs${query ? `?${query}` : ""}`,
      {
        method: "GET",
      },
    ),
  );
}

export async function approvePluginReleaseSubmission(
  submissionId: string,
  payload: ReviewPluginReleaseSubmissionPayload = {},
): Promise<PluginReleaseSubmissionReviewResponse> {
  return parsePluginReleaseSubmissionReviewResponse(
    await requestPluginPublishControlPlane<unknown>(
      `/v1/platform/plugins/release-submissions/${encodeURIComponent(
        submissionId,
      )}/approve`,
      {
        method: "POST",
        payload,
      },
    ),
  );
}

export async function rejectPluginReleaseSubmission(
  submissionId: string,
  payload: RejectPluginReleaseSubmissionPayload,
): Promise<PluginReleaseSubmission> {
  return parsePluginReleaseSubmission(
    await requestPluginPublishControlPlane<unknown>(
      `/v1/platform/plugins/release-submissions/${encodeURIComponent(
        submissionId,
      )}/reject`,
      {
        method: "POST",
        payload,
      },
    ),
  );
}

export function summarizePluginPublishPreflight(
  response: BulkPublishPluginPreflightResponse,
): {
  valid: boolean;
  blockerCount: number;
  warningCount: number;
  targetCount: number;
  updatedTargetCount: number;
} {
  const targetImpact = response.targetImpact ?? [];
  return {
    valid: response.valid,
    blockerCount: response.blockers.length,
    warningCount: response.warnings?.length ?? 0,
    targetCount: targetImpact.length,
    updatedTargetCount: targetImpact.filter((item) => item.action === "updated")
      .length,
  };
}

export function normalizePluginPublishStringList(value: unknown): string[] {
  return normalizeStringArray(value);
}
