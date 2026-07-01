import {
  IMAGE_GENERATION_CANCELED_MESSAGE,
  isGenerationCanceledError,
} from "./imageExecutorUtils";
import { resolveImageErrorPresentation } from "./imageErrorPresentation";
import type { GeneratedImage } from "./types";

const MISSING_API_KEY_MESSAGE =
  "该 Provider 没有可用的 API Key，请在设置 -> AI 服务商中添加";

export interface SingleImageRequestParams {
  item: GeneratedImage;
  apiKey: string;
  signal?: AbortSignal;
}

export interface RunSingleImageGenerationBatchParams {
  generationItems: GeneratedImage[];
  providerId: string;
  signal?: AbortSignal;
  getApiKey: (providerId: string) => Promise<string | null | undefined>;
  requestImage: (params: SingleImageRequestParams) => Promise<string>;
  ensureGenerationStillActive: () => void;
  isGenerationStillActive: () => boolean;
  commitCompletedImage: (item: GeneratedImage, imageUrl: string) => void;
  commitFailedImage: (item: GeneratedImage, errorMessage: string) => void;
  saveCompletedImage?: (image: GeneratedImage) => Promise<void>;
}

export async function runSingleImageGenerationBatch(
  params: RunSingleImageGenerationBatchParams,
): Promise<{ completedImages: GeneratedImage[]; errors: string[] }> {
  const completedImages: GeneratedImage[] = [];
  const errors: string[] = [];

  for (const item of params.generationItems) {
    try {
      params.ensureGenerationStillActive();
      const apiKey = await params.getApiKey(params.providerId);
      params.ensureGenerationStillActive();
      if (!apiKey) {
        throw new Error(MISSING_API_KEY_MESSAGE);
      }

      const imageUrl = await params.requestImage({
        item,
        apiKey,
        signal: params.signal,
      });
      params.ensureGenerationStillActive();

      const completedImage: GeneratedImage = {
        ...item,
        url: imageUrl,
        status: "complete",
        error: undefined,
      };

      params.commitCompletedImage(item, imageUrl);

      if (params.saveCompletedImage) {
        params.ensureGenerationStillActive();
        await params.saveCompletedImage(completedImage);
        params.ensureGenerationStillActive();
      }

      completedImages.push(completedImage);
    } catch (error) {
      if (
        isGenerationCanceledError(error) ||
        !params.isGenerationStillActive() ||
        params.signal?.aborted
      ) {
        throw new Error(IMAGE_GENERATION_CANCELED_MESSAGE);
      }

      const errorMessage = resolveImageErrorPresentation(error).message;
      errors.push(errorMessage);
      params.commitFailedImage(item, errorMessage);
    }
  }

  return { completedImages, errors };
}

export function summarizeImageGenerationErrors(errors: string[]): string {
  const normalizedErrors = Array.from(
    new Set(errors.map((item) => item.trim()).filter(Boolean)),
  );

  if (normalizedErrors.length === 0) {
    return "图片生成失败";
  }

  if (normalizedErrors.length === 1) {
    return normalizedErrors[0];
  }

  const preview = normalizedErrors.slice(0, 3).join("；");
  const suffix =
    normalizedErrors.length > 3
      ? `；另有 ${normalizedErrors.length - 3} 条错误`
      : "";
  return `全部图片生成失败：${preview}${suffix}`;
}
