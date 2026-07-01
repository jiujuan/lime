import type { ProviderWithKeysDisplay } from "@/lib/api/apiKeyProvider";
import {
  isFalImageProviderLike,
  isLikelyFalImageModelId,
  isResponsesImageGenerationModelId,
} from "@/lib/imageGen/providerMatchers";
import { dedupeModelIds } from "./providerConfigUtils";

export type ProviderModelFetchStatusTone = "success" | "error" | "info";

export interface ProviderModelFetchStatus {
  tone: ProviderModelFetchStatusTone;
  message: string;
}

export interface ProviderModelFetchStatusCopy {
  responsesConfirmedImage?: (imageModel: string) => string;
  responsesManualImage?: string;
  falConfirmedModel?: (modelId: string) => string;
  falManualModel?: string;
}

export interface ProviderModelFetchProfile {
  id?: string | null;
  type?: string | null;
  api_host?: string | null;
}

export function extractApiModelIds(
  models: Array<{ id?: string | null }>,
): string[] {
  return dedupeModelIds(
    models
      .map((model) => model.id?.trim() ?? "")
      .filter((modelId) => modelId.length > 0),
  );
}

export function isResponsesImageModel(modelId: string): boolean {
  return isResponsesImageGenerationModelId(modelId);
}

export function isFalProviderLike(
  provider: ProviderWithKeysDisplay | ProviderModelFetchProfile,
): boolean {
  return isFalImageProviderLike(provider);
}

export function isFalModelFetchUnsupported(result: {
  error?: string | null;
  diagnostic_hint?: string | null;
}): boolean {
  const message = `${result.error ?? ""} ${result.diagnostic_hint ?? ""}`
    .trim()
    .toLowerCase();
  return message.includes("fal") && message.includes("/models");
}

export function isLikelyFalImageModel(modelId: string): boolean {
  return isLikelyFalImageModelId(modelId);
}

export function isProviderApiKeyRequired(
  provider: ProviderWithKeysDisplay | ProviderModelFetchProfile,
  modelFetchApiKeyRequired: boolean,
): boolean {
  return isFalProviderLike(provider) || modelFetchApiKeyRequired;
}

export function isResponsesModelFetchUnsupported(result: {
  error?: string | null;
  diagnostic_hint?: string | null;
}): boolean {
  const message = `${result.error ?? ""} ${result.diagnostic_hint ?? ""}`
    .trim()
    .toLowerCase();
  return (
    message.includes("responses") &&
    (message.includes("/models") || message.includes("models 接口"))
  );
}

export function buildResponsesModelFetchStatus(
  result: {
    error?: string | null;
    diagnostic_hint?: string | null;
  },
  models: string[],
  copy?: ProviderModelFetchStatusCopy,
): ProviderModelFetchStatus | null {
  if (!isResponsesModelFetchUnsupported(result)) {
    return null;
  }

  const imageModel = models.find(isResponsesImageModel);
  if (imageModel) {
    return {
      tone: "success",
      message:
        copy?.responsesConfirmedImage?.(imageModel) ??
        `已确认 Responses 图片模型 ${imageModel}，该入口无需标准 /models 枚举，图片生成会走 Responses image_generation。`,
    };
  }

  return {
    tone: "info",
    message:
      copy?.responsesManualImage ??
      "该 Responses 图片入口不提供标准 /models 枚举；请手动添加 gpt-images-2 或 gpt-image-2，图片生成会走 Responses image_generation。",
  };
}

export function buildFalModelFetchStatus(
  provider: ProviderWithKeysDisplay | ProviderModelFetchProfile,
  result: {
    error?: string | null;
    diagnostic_hint?: string | null;
  },
  models: string[],
  copy?: ProviderModelFetchStatusCopy,
): ProviderModelFetchStatus | null {
  if (!isFalProviderLike(provider) || !isFalModelFetchUnsupported(result)) {
    return null;
  }

  const firstModel = models.find(isLikelyFalImageModel);
  if (firstModel) {
    return {
      tone: "success",
      message:
        copy?.falConfirmedModel?.(firstModel) ??
        `已确认 Fal 模型 ${firstModel}，Fal 不提供标准 /models 枚举，后续会使用手动声明的模型 ID。`,
    };
  }

  return {
    tone: "info",
    message:
      copy?.falManualModel ??
      "Fal 不提供标准 /models 枚举；当前模型优先级没有可用 Fal 图片模型，请手动添加 fal-ai/nano-banana-pro、fal-ai/flux-pro 或其他 fal-ai/... 模型 ID。",
  };
}
