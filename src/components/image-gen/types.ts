/**
 * 图片生成类型入口
 *
 * 业务请求/响应结构保留在这里，模型与尺寸目录统一转发到 lib 层。
 */

export type {
  ImageGenModel,
} from "@/lib/imageGen/models";
export {
  IMAGE_GEN_MODELS,
} from "@/lib/imageGen/models";

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
  resourceMaterialId?: string;
  resourceProjectId?: string;
  resourceSavedAt?: number;
  resourceSaveError?: string;
}

/** 图片生成请求 */
export interface ImageGenRequest {
  model: string;
  prompt: string;
  n?: number;
  size?: string;
  quality?: string;
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
