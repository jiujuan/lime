import { previewResponseText } from "./imageResponseParsers";

export type LocalImageServerErrorKind =
  | "missing_api_key"
  | "authentication_failed"
  | "no_image_provider"
  | "configured_provider_missing_key"
  | "configured_provider_missing_model"
  | "invalid_json"
  | "missing_image"
  | "request_failed";

export class LocalImageServerError extends Error {
  readonly kind: LocalImageServerErrorKind;
  readonly status?: number;
  readonly serverCode?: string;

  constructor(
    kind: LocalImageServerErrorKind,
    message: string,
    options: {
      status?: number;
      serverCode?: string;
    } = {},
  ) {
    super(message);
    this.name = "LocalImageServerError";
    Object.setPrototypeOf(this, new.target.prototype);
    this.kind = kind;
    this.status = options.status;
    this.serverCode = options.serverCode;
  }
}

function normalizeErrorCode(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .replace(/__+/g, "_")
    .toLowerCase();
}

function extractServerError(
  payload: unknown,
): { code: string; message: string } | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const errorValue = record.error;
  if (!errorValue || typeof errorValue !== "object") {
    return null;
  }

  const errorRecord = errorValue as Record<string, unknown>;
  const code =
    typeof errorRecord.code === "string" ? errorRecord.code.trim() : "";
  const message =
    typeof errorRecord.message === "string" ? errorRecord.message.trim() : "";

  if (!code && !message) {
    return null;
  }

  return {
    code,
    message,
  };
}

function getDefaultMessage(kind: LocalImageServerErrorKind): string {
  switch (kind) {
    case "missing_api_key":
      return "本机图片服务缺少 API Key，请检查服务配置。";
    case "authentication_failed":
      return "本机图片服务认证失败，请检查 API Key。";
    case "no_image_provider":
      return "本机图片服务未配置可用图片 Provider。";
    case "configured_provider_missing_key":
      return "默认图片服务没有可用的 API Key。";
    case "configured_provider_missing_model":
      return "默认图片服务没有可用图片模型。";
    case "invalid_json":
      return "本机图片服务返回了无效 JSON。";
    case "missing_image":
      return "本机图片服务未返回可解析图片。";
    case "request_failed":
    default:
      return "本机图片服务请求失败。";
  }
}

function resolveKnownKind(errorCode: string): LocalImageServerErrorKind | null {
  switch (normalizeErrorCode(errorCode)) {
    case "authentication_failed":
      return "authentication_failed";
    case "no_image_provider":
      return "no_image_provider";
    case "configured_provider_missing_key":
      return "configured_provider_missing_key";
    case "configured_provider_missing_model":
      return "configured_provider_missing_model";
    default:
      return null;
  }
}

function previewRequestFailedMessage(
  response: Response,
  rawText: string,
): string {
  return `本机图片服务请求失败: ${response.status} - ${previewResponseText(rawText, 300)}`;
}

export function classifyLocalImageServerError(params: {
  response: Response;
  rawText: string;
  parsedJson: unknown | null;
}): LocalImageServerError {
  const { response, rawText, parsedJson } = params;
  const serverError = extractServerError(parsedJson);
  const normalizedServerCode = normalizeErrorCode(serverError?.code);

  if (
    response.status === 401 ||
    response.status === 403 ||
    normalizedServerCode === "authentication_failed"
  ) {
    return new LocalImageServerError(
      "authentication_failed",
      serverError?.message || getDefaultMessage("authentication_failed"),
      {
        status: response.status,
        serverCode: serverError?.code || undefined,
      },
    );
  }

  const knownKind = resolveKnownKind(serverError?.code || "");
  if (knownKind) {
    return new LocalImageServerError(
      knownKind,
      serverError?.message || getDefaultMessage(knownKind),
      {
        status: response.status,
        serverCode: serverError?.code || undefined,
      },
    );
  }

  if (response.ok) {
    if (!parsedJson) {
      return new LocalImageServerError(
        "invalid_json",
        getDefaultMessage("invalid_json"),
        {
          status: response.status,
        },
      );
    }

    return new LocalImageServerError(
      "missing_image",
      getDefaultMessage("missing_image"),
      {
        status: response.status,
      },
    );
  }

  return new LocalImageServerError(
    "request_failed",
    previewRequestFailedMessage(response, rawText),
    {
      status: response.status,
      serverCode: serverError?.code || undefined,
    },
  );
}

export const __localImageServerErrorsTestUtils = {
  extractServerError,
  getDefaultMessage,
  normalizeErrorCode,
  previewRequestFailedMessage,
  resolveKnownKind,
  classifyLocalImageServerError,
};
