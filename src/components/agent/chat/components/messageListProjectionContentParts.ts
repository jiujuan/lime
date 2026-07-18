import { sanitizeMessageTextForDisplay } from "../utils/messageDisplaySanitizer";
import {
  isAgentMessageCommentaryPhase,
  isAgentMessageFinalAnswerPhase,
} from "../utils/agentMessagePhase";
import {
  areComparableContentTextsEqual,
  areComparableContentTextsRelated,
  areLikelyRevisedThinkingParagraph,
  isComparableContentTextPrefix,
  normalizeComparableContentText,
  readableContentTextScore,
} from "./messageListComparableText";
import type { AgentThreadItem, Message } from "../types";

export type MessageContentPart = NonNullable<Message["contentParts"]>[number];

export function hasInlineProcessContentParts(
  message: Message,
  _options: {
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

  return true;
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

export function selectFinalTextContentParts(
  parts?: Message["contentParts"],
): Array<Extract<MessageContentPart, { type: "text" }>> {
  const candidates = collectVisibleTextContentParts(parts);
  const explicitFinalParts = candidates.filter((part) =>
    isAgentMessageFinalAnswerPhase(readTextContentPartPhase(part)),
  );
  if (explicitFinalParts.length > 0) {
    return explicitFinalParts;
  }
  const fallbackFinalPart = candidates.at(-1);
  return fallbackFinalPart ? [fallbackFinalPart] : [];
}

function collectVisibleTextContentParts(
  parts?: Message["contentParts"],
): Array<Extract<MessageContentPart, { type: "text" }>> {
  return (parts || []).filter(
    (part): part is Extract<MessageContentPart, { type: "text" }> =>
      isFinalTextContentPart(part) && part.text.trim().length > 0,
  );
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
  const textParts = collectVisibleTextContentParts(parts);

  return textParts[textParts.length - 1]?.text.trim() || "";
}

function resolveVisibleTextFromContentParts(
  parts?: Message["contentParts"],
): string {
  return (
    collectVisibleTextContentParts(parts)
      .map((part) => part.text.trim())
      .join("\n\n")
      .trim() || ""
  );
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
  const finalTextParts = selectFinalTextContentParts(parts).flatMap((part) => {
    const sanitizedText = options
      ? sanitizeMessageTextForDisplay(part.text, options)
      : part.text.trim();
    return sanitizedText ? [{ ...part, text: sanitizedText }] : [];
  });
  if (finalTextParts.length > 0) {
    return finalTextParts;
  }

  const mediaReferenceParts = (parts || []).filter(
    (part): part is Extract<MessageContentPart, { type: "media_reference" }> =>
      part.type === "media_reference",
  );
  return mediaReferenceParts.length > 0 ? mediaReferenceParts : undefined;
}

export function resolveAssistantActionContent(params: {
  displayContent: string;
  conversationContentParts?: Message["contentParts"];
  useProcessSeparatedFinalText: boolean;
}): string {
  if (params.useProcessSeparatedFinalText) {
    return (
      resolveVisibleTextFromContentParts(params.conversationContentParts) ||
      params.displayContent.trim()
    );
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
  const lastFinalTextPart = structuredParts[lastFinalTextIndex];
  const lastFinalText =
    lastFinalTextPart?.type === "text" ? lastFinalTextPart.text.trim() : "";
  const normalizedLastFinalText = normalizeComparableText(lastFinalText);

  const filtered = structuredParts.flatMap<MessageContentPart>(
    (part, index) => {
      if (part.type !== "text") {
        return [part];
      }
      if (isCommentaryTextContentPart(part)) {
        return [part];
      }

      if (
        isAgentMessageFinalAnswerPhase(readTextContentPartPhase(part))
      ) {
        return [part];
      }

      if (index < firstProcessIndex) {
        const trimmedPart = trimFinalTextOverlapFromLeadingPart({
          leadingPart: part,
          finalText: lastFinalText,
          normalizedFinalText: normalizedLastFinalText,
        });
        return trimmedPart ? [trimmedPart] : [];
      }

      if (index !== lastFinalTextIndex) {
        return [];
      }

      if (isTextCoveredByThinkingPart(structuredParts, index, part.text)) {
        return [];
      }

      return [part];
    },
  );

  return filtered.length > 0 ? filtered : undefined;
}

function normalizeComparableText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function normalizeCompactComparableText(text: string): string {
  return text.trim().replace(/\s+/g, "");
}

function trimFinalTextOverlapFromLeadingPart(params: {
  leadingPart: Extract<MessageContentPart, { type: "text" }>;
  finalText: string;
  normalizedFinalText: string;
}): Extract<MessageContentPart, { type: "text" }> | null {
  const leadingText = params.leadingPart.text.trim();
  if (!leadingText || !params.finalText) {
    return leadingText ? { ...params.leadingPart, text: leadingText } : null;
  }

  if (normalizeComparableText(leadingText) === params.normalizedFinalText) {
    return null;
  }

  if (
    normalizeCompactComparableText(leadingText) ===
    normalizeCompactComparableText(params.finalText)
  ) {
    return null;
  }

  if (!leadingText.endsWith(params.finalText)) {
    return { ...params.leadingPart, text: leadingText };
  }

  const retainedText = leadingText
    .slice(0, leadingText.length - params.finalText.length)
    .trim();
  return retainedText ? { ...params.leadingPart, text: retainedText } : null;
}

function isTextCoveredByThinkingPart(
  parts: MessageContentPart[],
  textIndex: number,
  text: string,
): boolean {
  const normalizedText = text.trim();
  if (!normalizedText) {
    return false;
  }

  return parts
    .slice(textIndex + 1)
    .some(
      (part) =>
        part.type === "thinking" && part.text.trim().startsWith(normalizedText),
    );
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
              part.type === "thinking" && part.text.trim() === trailingThinking,
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
  if (!parts || parts.length < 2) {
    return parts;
  }

  let changed = false;
  const normalized: NonNullable<Message["contentParts"]> = [];
  const thinkingIndexByIdentity = new Map<string, number>();

  for (const part of parts) {
    const previous = normalized[normalized.length - 1];

    const thinkingIdentities =
      part.type === "thinking" ? readThinkingContentPartIdentities(part) : [];

    if (part.type === "thinking") {
      const existingIndex = findExistingThinkingContentPartIndex({
        identities: thinkingIdentities,
        normalized,
        part,
        thinkingIndexByIdentity,
      });
      if (existingIndex !== undefined) {
        const existingPart = normalized[existingIndex];
        if (existingPart?.type === "thinking") {
          normalized[existingIndex] = mergeDuplicateThinkingContentPart(
            existingPart,
            part,
          );
        }
        registerThinkingContentPartIdentities(
          thinkingIndexByIdentity,
          thinkingIdentities,
          existingIndex,
        );
        changed = true;
        continue;
      }
      registerThinkingContentPartIdentities(
        thinkingIndexByIdentity,
        thinkingIdentities,
        normalized.length,
      );
    }

    if (
      previous?.type === "thinking" &&
      part.type === "thinking" &&
      areComparableContentTextsEqual(previous.text, part.text)
    ) {
      changed = true;
      if (!previous.metadata && part.metadata) {
        normalized[normalized.length - 1] = part;
      }
      registerThinkingContentPartIdentities(
        thinkingIndexByIdentity,
        thinkingIdentities,
        normalized.length - 1,
      );
      continue;
    }

    if (previous?.type === "thinking" && part.type === "thinking") {
      if (isComparableContentTextPrefix(previous.text, part.text)) {
        normalized[normalized.length - 1] = part;
        registerThinkingContentPartIdentities(
          thinkingIndexByIdentity,
          thinkingIdentities,
          normalized.length - 1,
        );
        changed = true;
        continue;
      }
      if (isComparableContentTextPrefix(part.text, previous.text)) {
        changed = true;
        continue;
      }
    }

    if (
      previous?.type === "text" &&
      part.type === "text" &&
      isFinalTextContentPart(previous) &&
      isFinalTextContentPart(part) &&
      areComparableContentTextsEqual(previous.text, part.text)
    ) {
      changed = true;
      if (!previous.metadata && part.metadata) {
        normalized[normalized.length - 1] = part;
      }
      continue;
    }

    normalized.push(part);
  }

  return changed ? normalized : parts;
}

function readMetadataString(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readMetadataNumber(
  metadata: Record<string, unknown> | undefined,
  key: string,
): number | null {
  const value = metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readThinkingContentPartIdentities(
  part: Extract<MessageContentPart, { type: "thinking" }>,
): string[] {
  const identities: string[] = [];
  const metadata = part.metadata;
  const itemId =
    readMetadataString(metadata, "threadItemId") ||
    readMetadataString(metadata, "itemId");
  if (itemId) {
    identities.push(`item:${itemId}`);
  }

  const turnId = readMetadataString(metadata, "turnId");
  const sequence = readMetadataNumber(metadata, "sequence");
  if (turnId && sequence !== null) {
    identities.push(`turn:${turnId}:${sequence}`);
  }

  const normalizedText = normalizeComparableContentText(part.text);
  if (normalizedText) {
    identities.push(`legacy-text:${normalizedText}`);
  }

  return identities;
}

function registerThinkingContentPartIdentities(
  indexByIdentity: Map<string, number>,
  identities: string[],
  index: number,
) {
  for (const identity of identities) {
    indexByIdentity.set(identity, index);
  }
}

function findExistingThinkingContentPartIndex(params: {
  identities: string[];
  normalized: NonNullable<Message["contentParts"]>;
  part: Extract<MessageContentPart, { type: "thinking" }>;
  thinkingIndexByIdentity: Map<string, number>;
}): number | undefined {
  for (const identity of params.identities) {
    const existingIndex = params.thinkingIndexByIdentity.get(identity);
    if (existingIndex !== undefined) {
      return existingIndex;
    }
  }

  const index = params.normalized.findIndex(
    (candidate) =>
      candidate.type === "thinking" &&
      (areComparableContentTextsRelated(candidate.text, params.part.text) ||
        areLikelyRevisedThinkingParagraph(candidate.text, params.part.text) ||
        areLikelyRevisedThinkingParagraph(params.part.text, candidate.text)),
  );
  return index >= 0 ? index : undefined;
}

function shouldPreferReadableThinkingText(params: {
  previousText: string;
  nextText: string;
}): boolean {
  if (isComparableContentTextPrefix(params.previousText, params.nextText)) {
    return true;
  }

  if (areLikelyRevisedThinkingParagraph(params.previousText, params.nextText)) {
    return true;
  }

  if (!areComparableContentTextsRelated(params.previousText, params.nextText)) {
    return false;
  }

  return (
    readableContentTextScore(params.nextText) >
    readableContentTextScore(params.previousText) + 2
  );
}

function mergeDuplicateThinkingContentPart(
  previous: Extract<MessageContentPart, { type: "thinking" }>,
  next: Extract<MessageContentPart, { type: "thinking" }>,
): Extract<MessageContentPart, { type: "thinking" }> {
  if (
    shouldPreferReadableThinkingText({
      previousText: previous.text,
      nextText: next.text,
    })
  ) {
    return {
      ...previous,
      text: next.text,
      metadata: previous.metadata ?? next.metadata,
    };
  }

  return {
    ...previous,
    metadata: previous.metadata ?? next.metadata,
  };
}
