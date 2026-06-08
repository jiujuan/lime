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
  requestPayload?: string;
  providerTaskId?: string;
  status: VideoTaskStatus;
  progress?: number;
  resultUrl?: string;
  errorMessage?: string;
  metadataJson?: string;
  createdAt: number;
  updatedAt: number;
  finishedAt?: number;
}

async function invokeVideoGenerationCommand<T>(
  command: string,
  request: unknown,
): Promise<T> {
  const result = await safeInvoke<T>(command, { request });
  assertNotDiagnosticFacade(
    command,
    result,
    "真实视频生成 current 通道",
  );
  return result;
}

export const videoGenerationApi = {
  async createTask(
    request: CreateVideoGenerationRequest,
  ): Promise<VideoGenerationTask> {
    return invokeVideoGenerationCommand("create_video_generation_task", request);
  },

  async getTask(
    taskId: string,
    options?: { refreshStatus?: boolean },
  ): Promise<VideoGenerationTask | null> {
    return invokeVideoGenerationCommand("get_video_generation_task", {
      taskId,
      refreshStatus: options?.refreshStatus ?? true,
    });
  },

  async listTasks(
    projectId: string,
    options?: { limit?: number },
  ): Promise<VideoGenerationTask[]> {
    return invokeVideoGenerationCommand("list_video_generation_tasks", {
      projectId,
      limit: options?.limit ?? 50,
    });
  },

  async cancelTask(taskId: string): Promise<VideoGenerationTask | null> {
    return invokeVideoGenerationCommand("cancel_video_generation_task", {
      taskId,
    });
  },
};
