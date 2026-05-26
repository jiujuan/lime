import i18n from "i18next";

const DEFAULT_RUNTIME_ERROR_MESSAGE = "执行链路返回失败，请查看详情后重试。";

const PROVIDER_AUTH_ERROR_MESSAGE =
  "当前 Provider 鉴权未通过，请前往设置 -> AI 服务商检查 API Key、Base URL 或授权配置后重试。";

const PROVIDER_QUOTA_ERROR_MESSAGE =
  "当前 AI 服务商余额或额度不足，请在服务商后台充值或开通额度，或切换到其他可用模型后重试。";

const PROVIDER_SESSION_EXPIRED_ERROR_MESSAGE =
  "当前模型通道返回了不兼容的工具 schema，请前往设置 -> AI 服务商检查 Provider 配置或切换模型后重试。";

const PROVIDER_CHANNEL_ERROR_MESSAGE =
  "当前模型通道暂不可用，请前往设置 -> AI 服务商检查 Provider 配置，必要时切换模型后重试。";

function normalizeRuntimeErrorMessage(errorMessage: string): string {
  const normalized = errorMessage.trim();
  return normalized || DEFAULT_RUNTIME_ERROR_MESSAGE;
}

function looksLikeHttpStatus(message: string, status: "401" | "403"): boolean {
  return new RegExp(`(^|\\D)${status}(\\D|$)`).test(message);
}

function includesAny(message: string, candidates: readonly string[]): boolean {
  return candidates.some((candidate) => message.includes(candidate));
}

function readAgentRuntimeCopy(key: string, fallback: string): string {
  if (!i18n.isInitialized) {
    return fallback;
  }

  return String(
    i18n.t(key, {
      ns: "agent",
      defaultValue: fallback,
    }),
  );
}

function isLikelyProviderAuthError(message: string): boolean {
  return (
    looksLikeHttpStatus(message, "401") ||
    looksLikeHttpStatus(message, "403") ||
    includesAny(message, [
      "unauthorized",
      "forbidden",
      "authentication failed",
      "auth failed",
      "authorization expired",
      "credential expired",
      "invalid api key",
      "api key not valid",
      "bad credentials",
      "no access token",
      "refresh token",
      "session expired",
      "token expired",
      "login expired",
      "reauth",
      "凭证已过期",
      "授权已过期",
      "鉴权未通过",
      "鉴权失败",
      "认证失败",
      "权限不足",
      "token 过期",
      "需要重新登录",
      "请重新登录",
    ])
  );
}

function isLikelyProviderQuotaError(message: string): boolean {
  return (
    message.includes("402") ||
    includesAny(message, [
      "payment required",
      "insufficient balance",
      "insufficient_quota",
      "insufficient quota",
      "insufficient credit",
      "no credit",
      "exhausted balance",
      "balance exhausted",
      "billing hard limit",
      "quota exceeded",
      "余额不足",
      "额度不足",
      "余额已用尽",
      "额度已用尽",
      "请充值",
    ])
  );
}

function isLikelyProviderSessionExpiredError(message: string): boolean {
  return (
    message.includes("invalid schema for function 'sendmessage'") &&
    message.includes("array schema missing items")
  );
}

function isLikelyProviderChannelError(message: string): boolean {
  return message.includes("no available channel for model");
}

export function resolveAgentRuntimeErrorPresentation(errorMessage: string): {
  displayMessage: string;
  toastMessage: string;
} {
  const normalizedMessage = normalizeRuntimeErrorMessage(errorMessage);
  const lowerMessage = normalizedMessage.toLowerCase();

  if (isLikelyProviderSessionExpiredError(lowerMessage)) {
    return {
      displayMessage: PROVIDER_SESSION_EXPIRED_ERROR_MESSAGE,
      toastMessage: PROVIDER_SESSION_EXPIRED_ERROR_MESSAGE,
    };
  }

  if (isLikelyProviderChannelError(lowerMessage)) {
    return {
      displayMessage: PROVIDER_CHANNEL_ERROR_MESSAGE,
      toastMessage: PROVIDER_CHANNEL_ERROR_MESSAGE,
    };
  }

  if (isLikelyProviderQuotaError(lowerMessage)) {
    const message = readAgentRuntimeCopy(
      "agentChat.runtimeError.providerQuota",
      PROVIDER_QUOTA_ERROR_MESSAGE,
    );
    return {
      displayMessage: message,
      toastMessage: message,
    };
  }

  if (isLikelyProviderAuthError(lowerMessage)) {
    return {
      displayMessage: PROVIDER_AUTH_ERROR_MESSAGE,
      toastMessage: PROVIDER_AUTH_ERROR_MESSAGE,
    };
  }

  return {
    displayMessage: normalizedMessage,
    toastMessage: `响应错误: ${normalizedMessage}`,
  };
}
