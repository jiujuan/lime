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

function findFirstProcessBoundaryIndex(parts: MessageContentPart[]): number {
  return parts.findIndex(
    (part) =>
      part.type === "tool_use" ||
      part.type === "action_required" ||
      part.type === "file_changes_batch",
  );
}

function normalizeDuplicateTextSignature(text: string): string {
  let signature = "";
  for (const char of text.trim()) {
    if (!isWhitespaceChar(char)) {
      signature += char;
    }
  }
  return signature;
}

function isWhitespaceChar(char: string): boolean {
  return char.trim() === "";
}

function findDuplicateTextSignatureRange(
  haystack: string,
  needle: string,
): { start: number; end: number } | null {
  const needleSignature = normalizeDuplicateTextSignature(needle);
  if (needleSignature.length < 12) {
    return null;
  }

  const compactChars: string[] = [];
  const originalIndexes: number[] = [];
  for (let index = 0; index < haystack.length; index += 1) {
    const char = haystack[index] || "";
    if (isWhitespaceChar(char)) {
      continue;
    }
    compactChars.push(char);
    originalIndexes.push(index);
  }

  const compactHaystack = compactChars.join("");
  const matchIndex = compactHaystack.indexOf(needleSignature);
  if (matchIndex < 0) {
    return null;
  }

  const endSignatureIndex = matchIndex + needleSignature.length - 1;
  const start = originalIndexes[matchIndex];
  const end = originalIndexes[endSignatureIndex];
  if (start === undefined || end === undefined) {
    return null;
  }
  return { start, end: end + 1 };
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

function resolveVisibleTextFromContentParts(
  parts?: Message["contentParts"],
): string {
  const textParts =
    parts?.filter(
      (part): part is Extract<MessageContentPart, { type: "text" }> =>
        part.type === "text" && part.text.trim().length > 0,
    ) || [];
  const segments: string[] = [];

  for (const part of textParts) {
    const normalizedText = part.text.trim();
    if (!normalizedText) {
      continue;
    }
    const previous = segments[segments.length - 1];
    if (previous) {
      const normalizedPrevious = previous.trim();
      if (
        normalizedPrevious === normalizedText ||
        normalizedPrevious.includes(normalizedText)
      ) {
        continue;
      }
      if (normalizedText.includes(normalizedPrevious)) {
        segments[segments.length - 1] = normalizedText;
        continue;
      }
    }
    segments.push(normalizedText);
  }

  return segments.join("\n\n");
}

function trimDuplicatedFinalTextFromLeadingText(
  leadingText: string,
  finalText: string,
): string {
  const normalizedLeading = leadingText.trim();
  const normalizedFinal = finalText.trim();
  if (!normalizedLeading || !normalizedFinal) {
    return normalizedLeading;
  }

  if (normalizedLeading === normalizedFinal) {
    return "";
  }

  const finalTextIndex = normalizedLeading.indexOf(normalizedFinal);
  const duplicateRange =
    finalTextIndex >= 0
      ? {
          start: finalTextIndex,
          end: finalTextIndex + normalizedFinal.length,
        }
      : findDuplicateTextSignatureRange(normalizedLeading, normalizedFinal);
  if (!duplicateRange) {
    return normalizedLeading;
  }

  const prefix = normalizedLeading.slice(0, duplicateRange.start).trim();
  const suffix = normalizedLeading.slice(duplicateRange.end).trim();
  return [prefix, suffix].filter(Boolean).join("\n\n");
}

function normalizeDuplicatedLeadingTextBeforeProcess(
  parts: MessageContentPart[],
): MessageContentPart[] {
  const firstProcessIndex = findFirstProcessBoundaryIndex(parts);
  if (firstProcessIndex < 0) {
    return parts;
  }

  const finalText = resolveFinalTextFromContentParts(parts);
  if (!finalText) {
    return parts;
  }

  let changed = false;
  const normalizedParts = parts.flatMap((part, index) => {
    if (
      index >= firstProcessIndex ||
      part.type !== "text" ||
      part.text.trim().length === 0
    ) {
      return [part];
    }

    const nextText = trimDuplicatedFinalTextFromLeadingText(
      part.text,
      finalText,
    );
    if (nextText === part.text.trim()) {
      return [part];
    }

    changed = true;
    return nextText ? [{ ...part, text: nextText }] : [];
  });

  return changed ? normalizedParts : parts;
}

function isInlineProcessContentPart(part: MessageContentPart): boolean {
  return (
    part.type === "thinking" ||
    part.type === "tool_use" ||
    part.type === "action_required" ||
    part.type === "file_changes_batch"
  );
}

function endsWithThinkingSegmentBoundary(text: string): boolean {
  return /[.!?;:。！？；：]$/.test(text.trim());
}

function removeTextPartsCoveredByThinking(
  parts?: Message["contentParts"],
): Message["contentParts"] | undefined {
  if (!parts || parts.length < 2) {
    return parts;
  }

  const thinkingSignatures = parts
    .filter(
      (part): part is Extract<MessageContentPart, { type: "thinking" }> =>
        part.type === "thinking" && part.text.trim().length > 0,
    )
    .map((part) => normalizeDuplicateTextSignature(part.text))
    .filter((signature) => signature.length >= 12);

  if (thinkingSignatures.length === 0) {
    return parts;
  }

  let changed = false;
  const normalizedParts = parts.filter((part, index) => {
    if (part.type !== "text" || part.text.trim().length === 0) {
      return true;
    }

    const hasLaterProcessPart = parts
      .slice(index + 1)
      .some(isInlineProcessContentPart);
    if (!hasLaterProcessPart) {
      return true;
    }

    const textSignature = normalizeDuplicateTextSignature(part.text);
    const isCoveredByThinking =
      textSignature.length >= 12 &&
      thinkingSignatures.some(
        (thinkingSignature) =>
          thinkingSignature === textSignature ||
          thinkingSignature.includes(textSignature),
      );
    if (!isCoveredByThinking) {
      return true;
    }

    changed = true;
    return false;
  });

  return changed ? normalizedParts : parts;
}

function restoreMissingLeadingTextFromDisplayContent(
  parts: MessageContentPart[],
  displayContent?: string,
): MessageContentPart[] {
  const firstProcessIndex = findFirstProcessBoundaryIndex(parts);
  if (firstProcessIndex < 0) {
    return parts;
  }

  const hasLeadingText = parts.some(
    (part, index) =>
      index < firstProcessIndex &&
      part.type === "text" &&
      part.text.trim().length > 0,
  );
  if (hasLeadingText) {
    return parts;
  }

  const finalText = resolveFinalTextFromContentParts(parts);
  const normalizedDisplayContent = displayContent?.trim();
  if (!finalText || !normalizedDisplayContent) {
    return parts;
  }

  const finalTextIndex = normalizedDisplayContent.indexOf(finalText);
  if (finalTextIndex <= 0) {
    return parts;
  }

  const leadingText = normalizedDisplayContent.slice(0, finalTextIndex).trim();
  if (!leadingText) {
    return parts;
  }

  return [{ type: "text", text: leadingText }, ...parts];
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
    return resolveVisibleTextFromContentParts(params.conversationContentParts);
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
  options?: {
    displayContent?: string;
  },
): Message["contentParts"] | undefined {
  if (!hasProcessBoundaryContentPart(parts)) {
    return parts;
  }

  const restoredParts = restoreMissingLeadingTextFromDisplayContent(
    parts || [],
    options?.displayContent,
  );
  const dedupedParts = removeTextPartsCoveredByThinking(
    normalizeDuplicatedLeadingTextBeforeProcess(restoredParts),
  ) || [];

  const hasActionBoundary = Boolean(
    dedupedParts.some((part) => part.type === "action_required"),
  );
  if (hasActionBoundary) {
    return dedupedParts;
  }

  const firstProcessIndex = findFirstProcessBoundaryIndex(dedupedParts);
  const lastTextIndex = dedupedParts.reduce(
    (lastIndex, part, index) =>
      part.type === "text" && part.text.trim().length > 0 ? index : lastIndex,
    -1,
  );

  const filtered = dedupedParts.filter((part, index) => {
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
        const trailingSignature = normalizeDuplicateTextSignature(
          trailingThinking,
        );
        const hasTrailingThinking = parts
          .slice(thinkingPartIndex + 1)
          .some(
            (part) =>
              part.type === "thinking" &&
              normalizeDuplicateTextSignature(part.text) ===
                trailingSignature,
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
  return removeTextPartsCoveredByThinking(parts);
}
