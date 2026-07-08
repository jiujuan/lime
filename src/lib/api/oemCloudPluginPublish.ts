import {
  buildClientPluginPath,
  normalizePluginPublishStringList as normalizeStringList,
  normalizeText,
  parseCompleteUploadResponse,
  parsePluginAuditLogList,
  parsePluginPackageUploadSession,
  parsePluginReleaseSubmission,
  parsePluginReleaseSubmissionList,
  parsePluginReleaseSubmissionReviewResponse,
  parsePreflightResponse,
  parsePublishResponse,
  parseUploadContentResponse,
  requestPluginPackageUploadContent,
  requestPluginPublishControlPlane,
  resolveClientPluginPackageUploadPath,
  resolveClientTenantId,
  sanitizeClientReleaseSubmissionPayload,
} from "./oemCloudPluginPublishRuntime";
import type {
  BulkPublishPluginPayload,
  BulkPublishPluginPreflightResponse,
  BulkPublishPluginResponse,
  CompletePluginPackageUploadSessionResponse,
  CreateClientPluginPackageUploadSessionPayload,
  CreatePluginPackageUploadSessionPayload,
  CreatePluginReleaseSubmissionPayload,
  PluginAuditAction,
  PluginAuditLogListResponse,
  PluginPackageUploadSession,
  PluginReleaseSubmission,
  PluginReleaseSubmissionListResponse,
  PluginReleaseSubmissionReviewResponse,
  PluginReleaseSubmissionStatus,
  RejectPluginReleaseSubmissionPayload,
  ReviewPluginReleaseSubmissionPayload,
  UploadPluginPackageContentResponse,
} from "./oemCloudPluginPublishTypes";

export type * from "./oemCloudPluginPublishTypes";

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
  return normalizeStringList(value);
}
