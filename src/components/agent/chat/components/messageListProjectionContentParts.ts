import { sanitizeMessageTextForDisplay } from "../utils/messageDisplaySanitizer";
import { isAgentMessageCommentaryPhase } from "../utils/agentMessagePhase";
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

function findFirstProcessBoundaryIndex(parts: MessageContentPart[]): number {
  return parts.findIndex(
    (part) =>
      part.type === "tool_use" ||
      part.type === "action_required" ||
      part.type === "file_changes_batch",
  );
}

function readTextContentPartPhase(
  part: Extract<MessageContentPart, { type: "text" }>,
): string | null {
  const phase = part.metadata?.phase;
  return typeof phase === "string" ? phase : null;
}

function isCommentaryTextContentPart(part: MessageContentPart): boolean {
  return (
    part.type === "text" &&
    isAgentMessageCommentaryPhase(readTextContentPartPhase(part))
  );
}

function isFinalTextContentPart(
  part: MessageContentPart,
): part is Extract<MessageContentPart, { type: "text" }> {
  return part.type === "text" && !isCommentaryTextContentPart(part);
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
        isFinalTextContentPart(part) && part.text.trim().length > 0,
    ) || [];

  return textParts[textParts.length - 1]?.text.trim() || "";
}

function endsWithThinkingSegmentBoundary(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) {
    return false;
  }
  const lastChar = normalized[normalized.length - 1];
  return Boolean(lastChar && ".!?;:。！？；：".includes(lastChar));
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
      isFinalTextContentPart(part) &&
      part.text.trim().length > 0,
  );
}

export function resolveProcessSeparatedContentParts(
  parts?: Message["contentParts"],
): Message["contentParts"] | undefined {
  if (!hasProcessBoundaryContentPart(parts)) {
    return parts;
  }

  const structuredParts = parts || [];

  const hasActionBoundary = Boolean(
    structuredParts.some((part) => part.type === "action_required"),
  );
  if (hasActionBoundary) {
    return structuredParts;
  }

  const firstProcessIndex = findFirstProcessBoundaryIndex(structuredParts);
  const lastFinalTextIndex = structuredParts.reduce(
    (lastIndex, part, index) =>
      isFinalTextContentPart(part) && part.text.trim().length > 0
        ? index
        : lastIndex,
    -1,
  );

  const filtered = structuredParts.filter((part, index) => {
    if (part.type !== "text") {
      return true;
    }
    if (isCommentaryTextContentPart(part)) {
      return true;
    }
    return index < firstProcessIndex || index === lastFinalTextIndex;
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
  const thinkingPartIndex = parts.findIndex(
    (part) => part.type === "thinking" && part.text.trim().length > 0,
  );
  if (thinkingPartIndex >= 0) {
    const existingPart = parts[thinkingPartIndex];
    if (
      existingPart?.type === "thinking" &&
      normalizedThinking.startsWith(existingPart.text.trim()) &&
      normalizedThinking.length > existingPart.text.trim().length
    ) {
      const existingThinkingText = existingPart.text.trim();
      const trailingThinking = normalizedThinking
        .slice(existingThinkingText.length)
        .trim();
      const hasProcessAfterExistingThinking = hasProcessBoundaryContentPart(
        parts.slice(thinkingPartIndex + 1),
      );
      if (
        hasProcessAfterExistingThinking &&
        trailingThinking &&
        endsWithThinkingSegmentBoundary(existingThinkingText)
      ) {
        const hasTrailingThinking = parts
          .slice(thinkingPartIndex + 1)
          .some(
            (part) =>
              part.type === "thinking" &&
              part.text.trim() === trailingThinking,
          );
        if (hasTrailingThinking) {
          return params.parts;
        }

        return [
          ...parts,
          {
            type: "thinking",
            text: trailingThinking,
          },
        ];
      }

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

export function normalizeInlineThinkingContentParts(
  parts?: Message["contentParts"],
): Message["contentParts"] | undefined {
  return parts;
}
