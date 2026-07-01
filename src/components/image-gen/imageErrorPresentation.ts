import { getLimeI18n } from "@/i18n/createI18n";
import { IMAGE_GENERATION_CANCELED_MESSAGE } from "./imageExecutorUtils";
import type { LocalImageServerErrorKind } from "./localImageServerErrors";

type ImageGenerationErrorCode =
  | "missing_api_key"
  | "authentication_failed"
  | "no_image_provider"
  | "configured_provider_missing_key"
  | "configured_provider_missing_model"
  | "invalid_json"
  | "missing_image"
  | "request_failed"
  | "resource_save_failed"
  | "image_generation_cancelled"
  | "image_generation_failed";

export interface ImageErrorPresentation {
  code: ImageGenerationErrorCode;
  message: string;
  recoveryHint: string;
}

const DEFAULT_IMAGE_ERROR: ImageErrorPresentation = {
  code: "image_generation_failed",
  message: "图片生成失败",
  recoveryHint: "请重试；如果持续失败，请检查图片服务配置或切换模型后再试。",
};

function tImageErrorPresentation(key: string, fallback: string): string {
  const translate = getLimeI18n().t as unknown as (
    key: string,
    options?: Record<string, unknown>,
  ) => string;
  return translate(key, {
    ns: "agentRuntime",
    defaultValue: fallback,
  });
}

function normalizeErrorMessage(value: unknown): string {
  if (value instanceof Error) {
    return value.message.trim() || DEFAULT_IMAGE_ERROR.message;
  }

  if (typeof value === "string") {
    return value.trim() || DEFAULT_IMAGE_ERROR.message;
  }

  if (value && typeof value === "object") {
    const message = (value as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
  }

  return DEFAULT_IMAGE_ERROR.message;
}

function isLocalImageServerErrorKind(
  value: string,
): value is LocalImageServerErrorKind {
  switch (value) {
    case "missing_api_key":
    case "authentication_failed":
    case "no_image_provider":
    case "configured_provider_missing_key":
    case "configured_provider_missing_model":
    case "invalid_json":
    case "missing_image":
    case "request_failed":
      return true;
    default:
      return false;
  }
}

function inferImageGenerationErrorCode(
  message: string,
): ImageGenerationErrorCode {
  const lower = message.toLowerCase();

  if (
    message === IMAGE_GENERATION_CANCELED_MESSAGE ||
    lower.includes("已停止当前图片任务") ||
    lower.includes("generation stopped") ||
    lower.includes("cancel")
  ) {
    return "image_generation_cancelled";
  }

  if (
    lower.includes("resource save failed") ||
    lower.includes("保存到素材库失败")
  ) {
    return "resource_save_failed";
  }

  if (
    lower.includes("api key") &&
    (lower.includes("missing") || lower.includes("缺少"))
  ) {
    return "missing_api_key";
  }

  if (lower.includes("401") || lower.includes("403")) {
    return "authentication_failed";
  }

  if (lower.includes("no_image_provider")) {
    return "no_image_provider";
  }

  if (lower.includes("configured_provider_missing_key")) {
    return "configured_provider_missing_key";
  }

  if (lower.includes("configured_provider_missing_model")) {
    return "configured_provider_missing_model";
  }

  if (lower.includes("invalid json")) {
    return "invalid_json";
  }

  if (lower.includes("missing image") || lower.includes("no image")) {
    return "missing_image";
  }

  if (lower.includes("request failed")) {
    return "request_failed";
  }

  return "image_generation_failed";
}

function normalizeImageGenerationErrorCode(
  value: unknown,
): ImageGenerationErrorCode | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  switch (normalized) {
    case "missing_api_key":
    case "authentication_failed":
    case "no_image_provider":
    case "configured_provider_missing_key":
    case "configured_provider_missing_model":
    case "invalid_json":
    case "missing_image":
    case "request_failed":
    case "resource_save_failed":
    case "image_generation_cancelled":
    case "image_generation_failed":
      return normalized;
    default:
      return null;
  }
}

function resolveImageErrorCopy(code: ImageGenerationErrorCode): {
  message: string;
  recoveryHint: string;
} {
  switch (code) {
    case "missing_api_key":
      return {
        message: tImageErrorPresentation(
          "agentChat.imageWorkbenchError.missingApiKey.message",
          "本机图片服务缺少 API Key",
        ),
        recoveryHint: tImageErrorPresentation(
          "agentChat.imageWorkbenchError.missingApiKey.recoveryHint",
          "请检查图片服务配置并补充 API Key 后重试。",
        ),
      };
    case "authentication_failed":
      return {
        message: tImageErrorPresentation(
          "agentChat.imageWorkbenchError.authenticationFailed.message",
          "图片服务认证失败",
        ),
        recoveryHint: tImageErrorPresentation(
          "agentChat.imageWorkbenchError.authenticationFailed.recoveryHint",
          "请检查 API Key、授权状态或服务端配置后重试。",
        ),
      };
    case "no_image_provider":
      return {
        message: tImageErrorPresentation(
          "agentChat.imageWorkbenchError.noImageProvider.message",
          "未配置可用图片 Provider",
        ),
        recoveryHint: tImageErrorPresentation(
          "agentChat.imageWorkbenchError.noImageProvider.recoveryHint",
          "请先在图片服务中配置可用 Provider，再重新生成。",
        ),
      };
    case "configured_provider_missing_key":
      return {
        message: tImageErrorPresentation(
          "agentChat.imageWorkbenchError.configuredProviderMissingKey.message",
          "默认图片服务缺少可用 API Key",
        ),
        recoveryHint: tImageErrorPresentation(
          "agentChat.imageWorkbenchError.configuredProviderMissingKey.recoveryHint",
          "请切换默认 Provider 或补充对应 API Key 后重试。",
        ),
      };
    case "configured_provider_missing_model":
      return {
        message: tImageErrorPresentation(
          "agentChat.imageWorkbenchError.configuredProviderMissingModel.message",
          "默认图片服务没有可用模型",
        ),
        recoveryHint: tImageErrorPresentation(
          "agentChat.imageWorkbenchError.configuredProviderMissingModel.recoveryHint",
          "请检查模型配置，或切换到支持图片生成的模型后重试。",
        ),
      };
    case "invalid_json":
      return {
        message: tImageErrorPresentation(
          "agentChat.imageWorkbenchError.invalidJson.message",
          "图片服务返回了无效 JSON",
        ),
        recoveryHint: tImageErrorPresentation(
          "agentChat.imageWorkbenchError.invalidJson.recoveryHint",
          "请稍后重试；如果持续失败，请检查图片服务返回格式。",
        ),
      };
    case "missing_image":
      return {
        message: tImageErrorPresentation(
          "agentChat.imageWorkbenchError.missingImage.message",
          "图片服务未返回可解析图片",
        ),
        recoveryHint: tImageErrorPresentation(
          "agentChat.imageWorkbenchError.missingImage.recoveryHint",
          "请稍后重试；如果持续失败，请检查图片服务结果结构。",
        ),
      };
    case "request_failed":
      return {
        message: tImageErrorPresentation(
          "agentChat.imageWorkbenchError.requestFailed.message",
          "图片服务请求失败",
        ),
        recoveryHint: tImageErrorPresentation(
          "agentChat.imageWorkbenchError.requestFailed.recoveryHint",
          "请稍后重试；如果持续失败，请检查图片服务连接状态。",
        ),
      };
    case "resource_save_failed":
      return {
        message: tImageErrorPresentation(
          "agentChat.imageWorkbenchError.resourceSaveFailed.message",
          "保存到素材库失败",
        ),
        recoveryHint: tImageErrorPresentation(
          "agentChat.imageWorkbenchError.resourceSaveFailed.recoveryHint",
          "请稍后重试，或确认素材库是否可写。",
        ),
      };
    case "image_generation_cancelled":
      return {
        message: tImageErrorPresentation(
          "agentChat.imageWorkbenchError.cancelled.message",
          "已停止当前图片任务",
        ),
        recoveryHint: tImageErrorPresentation(
          "agentChat.imageWorkbenchError.cancelled.recoveryHint",
          "可以直接再次提交同一条图片命令。",
        ),
      };
    case "image_generation_failed":
    default:
      return {
        message: tImageErrorPresentation(
          "agentChat.imageWorkbenchError.failed.message",
          DEFAULT_IMAGE_ERROR.message,
        ),
        recoveryHint: tImageErrorPresentation(
          "agentChat.imageWorkbenchError.failed.recoveryHint",
          DEFAULT_IMAGE_ERROR.recoveryHint,
        ),
      };
  }
}

export function resolveImageErrorPresentation(
  error: unknown,
): ImageErrorPresentation {
  const rawMessage = normalizeErrorMessage(error);
  const inferredCode = inferImageGenerationErrorCode(rawMessage);

  if (error && typeof error === "object") {
    const code = (error as { code?: unknown }).code;
    const normalizedCode = normalizeImageGenerationErrorCode(code);
    if (normalizedCode) {
      const resolved = resolveImageErrorCopy(normalizedCode);
      return {
        code: normalizedCode,
        message: resolved.message,
        recoveryHint: resolved.recoveryHint,
      };
    }

    const kind = (error as { kind?: unknown }).kind;
    if (typeof kind === "string" && isLocalImageServerErrorKind(kind)) {
      const resolved = resolveImageErrorCopy(kind);
      return {
        code: kind,
        message: resolved.message,
        recoveryHint: resolved.recoveryHint,
      };
    }
  }

  return {
    code: inferredCode,
    ...resolveImageErrorCopy(inferredCode),
  };
}
