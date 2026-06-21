import { sanitizeMessageTextForDisplay } from "../utils/messageDisplaySanitizer";
import { isRuntimeStatusDiagnosticsOnly } from "../utils/turnSummaryPresentation";
import type { AgentThreadItem, Message } from "../types";

export type MessageContentPart = NonNullable<Message["contentParts"]>[number];

export function hasInlineProcessContentParts(
  message: Message,
  options: {
    displayContent: string;
    timelineItems?: AgentThreadItem[];
  },
): boolean {
  const contentParts = message.contentParts || [];
  const hasNonThinkingProcessPart = contentParts.some(
    (part) =>
      part.type === "tool_use" ||
      part.type === "action_required" ||
      part.type === "file_changes_batch",
  );
  if (hasNonThinkingProcessPart) {
    return true;
  }

  const hasThinkingPart = contentParts.some(
    (part) => part.type === "thinking" && part.text.trim().length > 0,
  );
  if (!hasThinkingPart) {
    return false;
  }

  if (
    message.isThinking &&
    !options.displayContent.trim() &&
    isRuntimeStatusDiagnosticsOnly(message.runtimeStatus)
  ) {
    return false;
  }

  return Boolean(
    options.displayContent.trim() ||
      options.timelineItems?.some((item) => item.type === "reasoning"),
  );
}

function hasProcessBoundaryContentPart(
  parts?: Message["contentParts"],
): boolean {
  return Boolean(
    parts?.some(
      (part) =>
        part.type === "tool_use" ||
        part.type === "action_required" ||
        part.type === "file_changes_batch",
    ),
  );
}

function findLastProcessBoundaryIndex(parts: MessageContentPart[]): number {
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];
    if (
      part?.type === "tool_use" ||
      part?.type === "action_required" ||
      part?.type === "file_changes_batch"
    ) {
      return index;
    }
  }
  return -1;
}

function isLikelyCompleteThinkingSegment(text: string): boolean {
  return /[.!?;:。！？；：]\s*$/.test(text.trim());
}

export function collectFileChangeBatchPaths(
  parts?: Message["contentParts"],
): string[] {
  return (parts || []).flatMap((part) =>
    part.type === "file_changes_batch"
      ? part.aggregate.files.map((file) => file.path)
      : [],
  );
}

function resolveFinalTextFromContentParts(
  parts?: Message["contentParts"],
): string {
  const textParts =
    parts?.filter(
      (part): part is Extract<MessageContentPart, { type: "text" }> =>
        part.type === "text" && part.text.trim().length > 0,
    ) || [];

  return textParts[textParts.length - 1]?.text.trim() || "";
}

export function resolveDeferredTextContentParts(
  parts?: Message["contentParts"],
  options?: Parameters<typeof sanitizeMessageTextForDisplay>[1],
): Message["contentParts"] | undefined {
  const finalText = resolveFinalTextFromContentParts(parts);
  const sanitizedText = options
    ? sanitizeMessageTextForDisplay(finalText, options)
    : finalText;
  return sanitizedText ? [{ type: "text", text: sanitizedText }] : undefined;
}

export function resolveAssistantActionContent(params: {
  displayContent: string;
  conversationContentParts?: Message["contentParts"];
  useProcessSeparatedFinalText: boolean;
}): string {
  if (params.useProcessSeparatedFinalText) {
    return resolveFinalTextFromContentParts(params.conversationContentParts);
  }

  return (
    params.displayContent.trim() ||
    resolveFinalTextFromContentParts(params.conversationContentParts)
  );
}

export function hasFinalTextAfterProcessBoundary(
  parts?: Message["contentParts"],
): boolean {
  const normalizedParts = parts || [];
  const firstProcessIndex = normalizedParts.findIndex(
    (part) =>
      part.type === "tool_use" ||
      part.type === "action_required" ||
      part.type === "file_changes_batch",
  );
  if (firstProcessIndex < 0) {
    return false;
  }

  return normalizedParts.some(
    (part, index) =>
      index > firstProcessIndex &&
      part.type === "text" &&
      part.text.trim().length > 0,
  );
}

export function resolveProcessSeparatedContentParts(
  parts?: Message["contentParts"],
): Message["contentParts"] | undefined {
  if (!hasProcessBoundaryContentPart(parts)) {
    return parts;
  }

  const hasActionBoundary = Boolean(
    parts?.some((part) => part.type === "action_required"),
  );
  if (hasActionBoundary) {
    return parts;
  }

  const firstProcessIndex = (parts || []).findIndex(
    (part) =>
      part.type === "tool_use" ||
      part.type === "action_required" ||
      part.type === "file_changes_batch",
  );
  const lastTextIndex = (parts || []).reduce(
    (lastIndex, part, index) =>
      part.type === "text" && part.text.trim().length > 0 ? index : lastIndex,
    -1,
  );

  const filtered = (parts || []).filter((part, index) => {
    if (part.type !== "text") {
      return true;
    }
    return index < firstProcessIndex || index === lastTextIndex;
  });

  return filtered.length > 0 ? filtered : undefined;
}

export function hasInlineToolUseContentPart(
  parts?: Message["contentParts"],
): boolean {
  return Boolean(parts?.some((part) => part.type === "tool_use"));
}

export function ensureInlineThinkingContentPart(params: {
  parts?: Message["contentParts"];
  thinkingContent?: string;
  shouldEnsure: boolean;
}): Message["contentParts"] | undefined {
  const normalizedThinking = params.thinkingContent?.trim();
  if (!params.shouldEnsure || !normalizedThinking) {
    return params.parts;
  }

  const parts = params.parts || [];
  const existingThinkingText = parts
    .filter(
      (part): part is Extract<MessageContentPart, { type: "thinking" }> =>
        part.type === "thinking" && part.text.trim().length > 0,
    )
    .map((part) => part.text)
    .join("");
  const normalizedExistingThinking = existingThinkingText.trim();
  const processBoundaryIndex = findLastProcessBoundaryIndex(parts);
  const thinkingPartIndex = parts.findIndex(
    (part) => part.type === "thinking" && part.text.trim().length > 0,
  );
  if (thinkingPartIndex >= 0) {
    const existingPart = parts[thinkingPartIndex];
    const missingThinkingTail =
      normalizedExistingThinking &&
      normalizedThinking.startsWith(normalizedExistingThinking)
        ? normalizedThinking.slice(normalizedExistingThinking.length).trim()
        : "";
    if (
      processBoundaryIndex >= 0 &&
      missingThinkingTail &&
      isLikelyCompleteThinkingSegment(normalizedExistingThinking)
    ) {
      const nextParts = [...parts];
      const insertIndex = processBoundaryIndex + 1;
      const existingThinkingAfterBoundaryIndex = nextParts.findIndex(
        (part, index) =>
          index > processBoundaryIndex &&
          part.type === "thinking" &&
          part.text.trim().length > 0,
      );
      const existingThinkingAfterBoundary =
        existingThinkingAfterBoundaryIndex >= 0
          ? nextParts[existingThinkingAfterBoundaryIndex]
          : undefined;
      if (existingThinkingAfterBoundary?.type === "thinking") {
        nextParts[existingThinkingAfterBoundaryIndex] = {
          ...existingThinkingAfterBoundary,
          text: `${existingThinkingAfterBoundary.text}\n\n${missingThinkingTail}`,
        };
      } else {
        nextParts.splice(insertIndex, 0, {
          type: "thinking",
          text: missingThinkingTail,
        });
      }
      return nextParts;
    }
    if (
      existingPart?.type === "thinking" &&
      normalizedThinking.startsWith(existingPart.text.trim()) &&
      normalizedThinking.length > existingPart.text.trim().length
    ) {
      const nextParts = [...parts];
      nextParts[thinkingPartIndex] = {
        ...existingPart,
        text: normalizedThinking,
      };
      return nextParts;
    }
    return params.parts;
  }

  return [{ type: "thinking", text: normalizedThinking }, ...parts];
}
