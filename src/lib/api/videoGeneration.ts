/**
 * @file 视频生成 API
 * @description 封装视频生成任务相关的 App Server current 迁移边界
 * @module lib/api/videoGeneration
 */

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

function rejectRetiredVideoGenerationCommand(command: string): never {
  throw new Error(
    `${command} is retired until video generation tasks move to App Server current methods`,
  );
}

export const videoGenerationApi = {
  async createTask(
    request: CreateVideoGenerationRequest,
  ): Promise<VideoGenerationTask> {
    void request;
    return rejectRetiredVideoGenerationCommand("create_video_generation_task");
  },

  async getTask(
    taskId: string,
    options?: { refreshStatus?: boolean },
  ): Promise<VideoGenerationTask | null> {
    void taskId;
    void options;
    return rejectRetiredVideoGenerationCommand("get_video_generation_task");
  },

  async listTasks(
    projectId: string,
    options?: { limit?: number },
  ): Promise<VideoGenerationTask[]> {
    void projectId;
    void options;
    return rejectRetiredVideoGenerationCommand("list_video_generation_tasks");
  },

  async cancelTask(taskId: string): Promise<VideoGenerationTask | null> {
    void taskId;
    return rejectRetiredVideoGenerationCommand("cancel_video_generation_task");
  },
};
