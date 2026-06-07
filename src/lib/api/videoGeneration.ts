/**
 * @file 视频生成 API
 * @description 封装视频生成任务相关的 Desktop Host / App Server 命令调用
 * @module lib/api/videoGeneration
 */

import { safeInvoke } from "@/lib/dev-bridge";

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

export const videoGenerationApi = {
  async createTask(
    request: CreateVideoGenerationRequest,
  ): Promise<VideoGenerationTask> {
    return safeInvoke("create_video_generation_task", { request });
  },

  async getTask(
    taskId: string,
    options?: { refreshStatus?: boolean },
  ): Promise<VideoGenerationTask | null> {
    return safeInvoke("get_video_generation_task", {
      request: {
        taskId,
        refreshStatus: options?.refreshStatus ?? true,
      },
    });
  },

  async listTasks(
    projectId: string,
    options?: { limit?: number },
  ): Promise<VideoGenerationTask[]> {
    return safeInvoke("list_video_generation_tasks", {
      request: {
        projectId,
        limit: options?.limit ?? 50,
      },
    });
  },

  async cancelTask(taskId: string): Promise<VideoGenerationTask | null> {
    return safeInvoke("cancel_video_generation_task", {
      request: {
        taskId,
      },
    });
  },
};
