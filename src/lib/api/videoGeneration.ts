/**
 * @file 视频生成 API
 * @description 封装视频生成任务相关的 Desktop Host / App Server 命令调用
 * @module lib/api/videoGeneration
 */

import { safeInvoke } from "@/lib/dev-bridge";
import { assertNotDiagnosticFacade } from "./diagnosticFacade";

export type VideoTaskStatus =
  | "pending"
  | "processing"
  | "success"
  | "error"
  | "cancelled";

export interface CreateVideoGenerationRequest {
  projectId: string;
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
}

export interface VideoGenerationTask {
  id: string;
  projectId: string;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isVideoTaskStatus(value: unknown): value is VideoTaskStatus {
  return (
    value === "pending" ||
    value === "processing" ||
    value === "success" ||
    value === "error" ||
    value === "cancelled"
  );
}

function isNullableString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === "string";
}

function isNullableFiniteNumber(
  value: unknown,
): value is number | null | undefined {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function isVideoGenerationTask(value: unknown): value is VideoGenerationTask {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.projectId === "string" &&
    typeof value.providerId === "string" &&
    typeof value.model === "string" &&
    typeof value.prompt === "string" &&
    isVideoTaskStatus(value.status) &&
    isNullableString(value.requestPayload) &&
    isNullableString(value.providerTaskId) &&
    isNullableFiniteNumber(value.progress) &&
    isNullableString(value.resultUrl) &&
    isNullableString(value.errorMessage) &&
    isNullableString(value.metadataJson) &&
    typeof value.createdAt === "number" &&
    Number.isFinite(value.createdAt) &&
    typeof value.updatedAt === "number" &&
    Number.isFinite(value.updatedAt) &&
    isNullableFiniteNumber(value.finishedAt)
  );
}

async function invokeVideoGenerationCommand<T>(
  command: string,
  request: unknown,
): Promise<T> {
  const result = await safeInvoke<unknown>(command, { request });
  assertNotDiagnosticFacade(
    command,
    result,
    "真实视频生成 current 通道",
  );
  return result as T;
}

function assertVideoGenerationTask(
  command: string,
  value: unknown,
): asserts value is VideoGenerationTask {
  if (!isVideoGenerationTask(value)) {
    throw new Error(`${command} did not return video generation task`);
  }
}

function assertVideoGenerationTaskOrNull(
  command: string,
  value: unknown,
): asserts value is VideoGenerationTask | null {
  if (value !== null && !isVideoGenerationTask(value)) {
    throw new Error(`${command} did not return video generation task`);
  }
}

function assertVideoGenerationTaskList(
  command: string,
  value: unknown,
): asserts value is VideoGenerationTask[] {
  if (!Array.isArray(value) || !value.every(isVideoGenerationTask)) {
    throw new Error(`${command} did not return video generation task list`);
  }
}

export const videoGenerationApi = {
  async createTask(
    request: CreateVideoGenerationRequest,
  ): Promise<VideoGenerationTask> {
    const command = "create_video_generation_task";
    const result = await invokeVideoGenerationCommand<unknown>(command, request);
    assertVideoGenerationTask(command, result);
    return result;
  },

  async getTask(
    taskId: string,
    options?: { refreshStatus?: boolean },
  ): Promise<VideoGenerationTask | null> {
    const command = "get_video_generation_task";
    const result = await invokeVideoGenerationCommand<unknown>(command, {
      taskId,
      refreshStatus: options?.refreshStatus ?? true,
    });
    assertVideoGenerationTaskOrNull(command, result);
    return result;
  },

  async listTasks(
    projectId: string,
    options?: { limit?: number },
  ): Promise<VideoGenerationTask[]> {
    const command = "list_video_generation_tasks";
    const result = await invokeVideoGenerationCommand<unknown>(command, {
      projectId,
      limit: options?.limit ?? 50,
    });
    assertVideoGenerationTaskList(command, result);
    return result;
  },

  async cancelTask(taskId: string): Promise<VideoGenerationTask | null> {
    const command = "cancel_video_generation_task";
    const result = await invokeVideoGenerationCommand<unknown>(command, {
      taskId,
    });
    assertVideoGenerationTaskOrNull(command, result);
    return result;
  },
};
