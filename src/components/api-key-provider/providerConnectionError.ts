import { resolveAgentRuntimeErrorPresentation } from "@/components/agent/chat/utils/agentRuntimeErrorPresentation";

interface ProviderConnectionErrorCopy {
  fallback: string;
  timeout: string;
}

function readErrorMessage(error: unknown): string | null {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
  }
  return null;
}

function isConnectionTimeout(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("未返回") ||
    normalized.includes("连接超时") ||
    normalized.includes("请求超时")
  );
}

export function formatProviderConnectionError(
  error: unknown,
  copy: ProviderConnectionErrorCopy,
): string {
  const message = readErrorMessage(error);
  if (!message) {
    return copy.fallback;
  }
  if (isConnectionTimeout(message)) {
    return copy.timeout;
  }
  return resolveAgentRuntimeErrorPresentation(message).displayMessage;
}
