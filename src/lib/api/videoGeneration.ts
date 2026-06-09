/**
 * @file 视频生成 API
 * @description 视频任务统一投影到 App Server mediaTaskArtifact current 主链
 * @module lib/api/videoGeneration
 */

import {
  cancelMediaTaskArtifact,
  createVideoGenerationTaskArtifact,
  getMediaTaskArtifact,
  listMediaTaskArtifacts,
  type CreateVideoGenerationTaskArtifactRequest,
  type MediaTaskArtifactOutput,
} from "./mediaTasks";

export type VideoTaskStatus =
  | "pending"
  | "processing"
  | "success"
  | "error"
  | "cancelled";

export interface CreateVideoGenerationRequest {
  projectId: string;
  projectRootPath?: string;
  providerId: string;
  model: string;
  prompt: string;
  aspectRatio?: string;
  resolution?: string;
  duration?: number;
  imageUrl?: string;
  endImageUrl?: string;
  seed?: number;
  generateAudio?: boolean;
  cameraFixed?: boolean;
  sessionId?: string;
  threadId?: string;
  turnId?: string;
  contentId?: string;
}

export interface VideoGenerationTask {
  id: string;
  projectId: string;
  projectRootPath?: string | null;
  providerId: string;
  model: string;
  prompt: string;
  requestPayload?: string | null;
  providerTaskId?: string | null;
  status: VideoTaskStatus;
  progress?: number | null;
  resultUrl?: string | null;
  errorMessage?: string | null;
  metadataJson?: string | null;
  createdAt: number;
  updatedAt: number;
  finishedAt?: number | null;
}

const VIDEO_TASK_TYPE = "video_generate";
const VIDEO_TASK_FAMILY = "video";

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOptionalString(value: unknown): string | null {
  const normalized = normalizeString(value);
  return normalized || null;
}

function normalizeTimestamp(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return Date.now();
}

function normalizeStatus(value: unknown): VideoTaskStatus {
  switch (normalizeString(value)) {
    case "pending":
    case "queued":
    case "pending_submit":
      return "pending";
    case "running":
    case "processing":
    case "submitted":
      return "processing";
    case "succeeded":
    case "success":
    case "completed":
      return "success";
    case "cancelled":
    case "canceled":
      return "cancelled";
    case "failed":
    case "error":
      return "error";
    default:
      return "pending";
  }
}

function recordPayload(
  output: MediaTaskArtifactOutput,
): Record<string, unknown> {
  const payload = output.record?.payload;
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
}

function recordResult(
  output: MediaTaskArtifactOutput,
): Record<string, unknown> {
  const result = output.record?.result;
  return result && typeof result === "object" && !Array.isArray(result)
    ? (result as Record<string, unknown>)
    : {};
}

function recordLastError(
  output: MediaTaskArtifactOutput,
): Record<string, unknown> {
  const error = output.record?.last_error;
  return error && typeof error === "object" && !Array.isArray(error)
    ? (error as Record<string, unknown>)
    : {};
}

function normalizeProgress(output: MediaTaskArtifactOutput): number | null {
  const progress = output.record?.progress;
  if (!progress || typeof progress !== "object" || Array.isArray(progress)) {
    return null;
  }
  const raw = (progress as Record<string, unknown>).percent;
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return null;
  }
  return Math.max(0, Math.min(100, Math.round(raw)));
}

function normalizeResultUrl(output: MediaTaskArtifactOutput): string | null {
  const result = recordResult(output);
  return (
    normalizeOptionalString(result.video_url) ||
    normalizeOptionalString(result.videoUrl) ||
    normalizeOptionalString(result.url) ||
    normalizeOptionalString(result.output_url) ||
    normalizeOptionalString(result.outputUrl)
  );
}

function normalizeErrorMessage(output: MediaTaskArtifactOutput): string | null {
  const error = recordLastError(output);
  return (
    normalizeOptionalString(error.message) ||
    normalizeOptionalString(error.error) ||
    normalizeOptionalString(
      output.record?.status === "failed" ? "视频任务失败" : null,
    )
  );
}

function normalizeMetadataJson(output: MediaTaskArtifactOutput): string | null {
  const metadata = {
    path: output.path,
    absolutePath: output.absolute_path,
    artifactPath: output.artifact_path,
    absoluteArtifactPath: output.absolute_artifact_path,
    currentAttemptId: output.current_attempt_id,
    idempotencyKey: output.idempotency_key,
    record: output.record,
  };
  return JSON.stringify(metadata);
}

function projectVideoTask(
  output: MediaTaskArtifactOutput,
): VideoGenerationTask {
  if (
    output.task_type !== VIDEO_TASK_TYPE ||
    output.task_family !== VIDEO_TASK_FAMILY
  ) {
    throw new Error(`App Server 返回了非视频任务: ${output.task_type}`);
  }

  const payload = recordPayload(output);
  const projectId =
    normalizeString(payload.project_id) || normalizeString(payload.projectId);
  const providerId =
    normalizeString(payload.provider_id) || normalizeString(payload.providerId);
  const model = normalizeString(payload.model);
  const prompt = normalizeString(payload.prompt);
  const createdAt = normalizeTimestamp(output.record?.created_at);
  const updatedAt = normalizeTimestamp(output.record?.updated_at) || createdAt;
  const status = normalizeStatus(output.normalized_status || output.status);

  return {
    id: output.task_id,
    projectId,
    projectRootPath:
      normalizeOptionalString(payload.project_root_path) ||
      normalizeOptionalString(payload.projectRootPath),
    providerId,
    model,
    prompt,
    requestPayload: JSON.stringify(payload),
    providerTaskId:
      normalizeOptionalString(payload.provider_task_id) ||
      normalizeOptionalString(payload.providerTaskId),
    status,
    progress: normalizeProgress(output),
    resultUrl: normalizeResultUrl(output),
    errorMessage: normalizeErrorMessage(output),
    metadataJson: normalizeMetadataJson(output),
    createdAt,
    updatedAt,
    finishedAt:
      status === "success" || status === "error" || status === "cancelled"
        ? updatedAt
        : null,
  };
}

function resolveProjectRootPath(projectRootPath: string | undefined): string {
  const normalizedProjectRootPath = normalizeString(projectRootPath);
  if (normalizedProjectRootPath) {
    return normalizedProjectRootPath;
  }
  throw new Error("缺少视频任务 projectRootPath");
}

function buildCreateParams(
  request: CreateVideoGenerationRequest,
): CreateVideoGenerationTaskArtifactRequest {
  const projectRootPath = resolveProjectRootPath(request.projectRootPath);
  const prompt = normalizeString(request.prompt);
  if (!prompt) {
    throw new Error("缺少视频生成提示词");
  }

  return {
    projectRootPath,
    prompt,
    title: prompt.slice(0, 48),
    rawText: prompt,
    aspectRatio: request.aspectRatio,
    resolution: request.resolution,
    duration: request.duration,
    imageUrl: request.imageUrl,
    endImageUrl: request.endImageUrl,
    seed: request.seed,
    generateAudio: request.generateAudio,
    cameraFixed: request.cameraFixed,
    providerId: request.providerId,
    model: request.model,
    sessionId: request.sessionId,
    threadId: request.threadId,
    turnId: request.turnId,
    projectId: request.projectId,
    contentId: request.contentId,
    entrySource: "video_workspace",
    modalityContractKey: "video_generation",
    modality: "video",
    requiredCapabilities: ["video_generation"],
    routingSlot: "video_generation_model",
    requestedTarget: "video",
  };
}

export const videoGenerationApi = {
  async createTask(
    request: CreateVideoGenerationRequest,
  ): Promise<VideoGenerationTask> {
    const output = await createVideoGenerationTaskArtifact(
      buildCreateParams(request),
    );
    return projectVideoTask(output);
  },

  async getTask(
    taskId: string,
    options?: { refreshStatus?: boolean; projectRootPath?: string },
  ): Promise<VideoGenerationTask | null> {
    void options?.refreshStatus;
    const projectRootPath = resolveProjectRootPath(options?.projectRootPath);
    const output = await getMediaTaskArtifact({
      projectRootPath,
      taskRef: taskId,
    });
    return projectVideoTask(output);
  },

  async listTasks(
    projectId: string,
    options?: { limit?: number; projectRootPath?: string },
  ): Promise<VideoGenerationTask[]> {
    const projectRootPath = resolveProjectRootPath(options?.projectRootPath);
    const response = await listMediaTaskArtifacts({
      projectRootPath,
      taskFamily: VIDEO_TASK_FAMILY,
      taskType: VIDEO_TASK_TYPE,
      modalityContractKey: "video_generation",
      limit: options?.limit,
    });
    return response.tasks.map(projectVideoTask);
  },

  async cancelTask(
    taskId: string,
    options?: { projectRootPath?: string },
  ): Promise<VideoGenerationTask | null> {
    const projectRootPath = resolveProjectRootPath(options?.projectRootPath);
    const output = await cancelMediaTaskArtifact({
      projectRootPath,
      taskRef: taskId,
    });
    return projectVideoTask(output);
  },
};
