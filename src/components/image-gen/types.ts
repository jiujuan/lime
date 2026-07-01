/**
 * 图片生成类型入口
 *
 * 这里只保留业务请求/响应结构；图片模型目录统一从 catalog 消费。
 */

/** 生成的图片记录 */
export interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  model: string;
  size: string;
  providerId: string;
  providerName: string;
  createdAt: number;
  status: "pending" | "generating" | "complete" | "error";
  error?: string;
  errorRecoveryHint?: string;
  resourceMaterialId?: string;
  resourceProjectId?: string;
  resourceSavedAt?: number;
  resourceSaveError?: string;
  resourceSaveErrorRecoveryHint?: string;
}

/** 图片生成请求 */
export interface ImageGenRequest {
  model: string;
  prompt: string;
  n?: number;
  size?: string;
  quality?: string;
  reference_images?: string[];
}

/** 图片生成响应 */
export interface ImageGenResponse {
  created: number;
  data: Array<{
    url: string;
    b64_json?: string;
    revised_prompt?: string;
  }>;
}
