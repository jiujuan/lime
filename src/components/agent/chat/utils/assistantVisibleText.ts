import type { Message } from "../types";

const FAILURE_DIAGNOSTIC_PREFIXES = [
  /^执行失败\s*[:：]/i,
  /^execution failed\s*:/i,
  /^当前处理失败(?:\s|$)/i,
];

export function isMeaningfulAssistantVisibleText(
  value?: string | null,
): boolean {
  const text = (value || "").trim();
  if (!text) {
    return false;
  }
  if (/^[\s.,!?;:，。！？；：、…]+$/.test(text)) {
    return false;
  }

  const compactText = text.replace(/\s+/g, " ");
  return !FAILURE_DIAGNOSTIC_PREFIXES.some((pattern) =>
    pattern.test(compactText),
  );
}

export function hasMeaningfulAssistantVisibleText(
  message?: Pick<Message, "content" | "contentParts" | "role"> | null,
): boolean {
  if (!message || message.role !== "assistant") {
    return false;
  }

  if (isMeaningfulAssistantVisibleText(message.content)) {
    return true;
  }

  return Boolean(
    message.contentParts?.some(
      (part) =>
        part.type === "text" && isMeaningfulAssistantVisibleText(part.text),
    ),
  );
}
