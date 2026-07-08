import { resolveOemCloudRuntimeContext } from "./oemCloudRuntime";
import { OemCloudControlPlaneError } from "./oemCloudControlPlane";
import type {
  BulkPublishPluginPayload,
  BulkPublishPluginPreflightResponse,
  BulkPublishPluginPreflightTargetImpact,
  BulkPublishPluginResponse,
  BulkPublishPluginTargetResult,
  PluginAuditAction,
  PluginAuditLog,
  PluginAuditLogListResponse,
  PluginBulkPublishTargetAction,
  PluginPackageScanReport,
  PluginPackageScanReportStatus,
  PluginPackageUploadSession,
  PluginPackageUploadSessionStatus,
  PluginPublishPreflightIssue,
  PluginPublishPreflightIssueSeverity,
  PluginRegistrationState,
  PluginReleaseSignatureVerification,
  PluginReleaseSignatureVerificationStatus,
  PluginReleaseSubmission,
  PluginReleaseSubmissionListResponse,
  PluginReleaseSubmissionReviewResponse,
  PluginReleaseSubmissionStatus,
  BulkPublishPluginTenantTargetPayload,
  CompletePluginPackageUploadSessionResponse,
  UploadPluginPackageContentResponse,
} from "./oemCloudPluginPublishTypes";

interface ControlPlaneEnvelope<T> {
  code?: number;
  message?: string;
  data?: T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeText(value: unknown): string | undefined {
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

export async function requestPluginPublishControlPlane<T>(
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
  const init: {
    method: "GET" | "POST";
    headers: Record<string, string>;
    body?: string;
  } = {
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

export function resolveClientTenantId(value?: string): string {
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

export function sanitizeClientReleaseSubmissionPayload(
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

export function buildClientPluginPath(tenantId: string, path: string): string {
  return `/v1/public/tenants/${encodeURIComponent(
    tenantId,
  )}/client/plugins${path.startsWith("/") ? path : `/${path}`}`;
}

export function resolveClientPluginPackageUploadPath(
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

export async function requestPluginPackageUploadContent<T>(
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

export function parsePreflightResponse(
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

export function parsePublishResponse(value: unknown): BulkPublishPluginResponse {
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

export function parsePluginPackageUploadSession(
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

export function parseUploadContentResponse(
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

export function parseCompleteUploadResponse(
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

export function parsePluginReleaseSubmission(value: unknown): PluginReleaseSubmission {
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

export function parsePluginReleaseSubmissionList(
  value: unknown,
): PluginReleaseSubmissionListResponse {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    throw new OemCloudControlPlaneError("Plugin 发布审核单列表格式非法。");
  }
  return {
    items: value.items.map(parsePluginReleaseSubmission),
  };
}

export function parsePluginReleaseSubmissionReviewResponse(
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

export function parsePluginAuditLogList(value: unknown): PluginAuditLogListResponse {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    throw new OemCloudControlPlaneError("Plugin 审计记录列表格式非法。");
  }
  return {
    items: value.items.map(parsePluginAuditLog),
  };
}

export function normalizePluginPublishStringList(value: unknown): string[] {
  return normalizeStringArray(value);
}
