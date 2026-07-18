import type { ContentPart } from "../types";
import {
  canMergeCoalescibleContentParts,
  mergeIncrementalTextWithOverlap,
} from "../utils/contentPartTimeline";
import {
  areComparableContentTextsEqual,
  areLikelyRevisedThinkingParagraph,
  dedupeAdjacentDuplicateParagraphs,
  isComparableContentTextPrefix,
} from "./messageListComparableText";

type TextContentPart = Extract<ContentPart, { type: "text" }>;
type ThinkingContentPart = Extract<ContentPart, { type: "thinking" }>;
type CoalescibleContentPart = TextContentPart | ThinkingContentPart;

export function mergeIncrementalText(base: string, chunk: string): string {
  if (areComparableContentTextsEqual(base, chunk)) {
    return base;
  }
  if (isComparableContentTextPrefix(base, chunk)) {
    return chunk;
  }
  if (isComparableContentTextPrefix(chunk, base)) {
    return base;
  }

  return mergeIncrementalTextWithOverlap(base, chunk);
}

function mergeCoalescibleContentPart<TPart extends CoalescibleContentPart>(
  base: TPart,
  chunk: TPart,
): TPart {
  const mergedThinkingText =
    base.type === "thinking" &&
    areLikelyRevisedThinkingParagraph(base.text, chunk.text)
      ? chunk.text
      : dedupeAdjacentDuplicateParagraphs(
          mergeIncrementalText(base.text, chunk.text),
        );
  return {
    ...base,
    text:
      base.type === "text"
        ? mergeIncrementalText(base.text, chunk.text)
        : mergedThinkingText,
    agentUiEvent: base.agentUiEvent ?? chunk.agentUiEvent,
    metadata: base.metadata ?? chunk.metadata,
  };
}

export function coalesceAdjacentDisplayContentParts(
  parts: ContentPart[] | undefined,
): ContentPart[] | undefined {
  if (!parts || parts.length < 2) {
    return parts;
  }

  const coalescedParts: ContentPart[] = [];
  let pendingPart: CoalescibleContentPart | null = null;
  let didCoalesce = false;

  const flushPendingPart = () => {
    if (!pendingPart) {
      return;
    }
    coalescedParts.push(pendingPart);
    pendingPart = null;
  };

  for (const part of parts) {
    if (part.type !== "text" && part.type !== "thinking") {
      flushPendingPart();
      coalescedParts.push(part);
      continue;
    }

    if (!pendingPart) {
      pendingPart = part;
      continue;
    }

    if (!canMergeCoalescibleContentParts(pendingPart, part)) {
      flushPendingPart();
      pendingPart = part;
      continue;
    }

    didCoalesce = true;
    pendingPart =
      pendingPart.type === "text"
        ? mergeCoalescibleContentPart(pendingPart, part)
        : mergeCoalescibleContentPart(pendingPart, part);
  }

  flushPendingPart();

  return didCoalesce ? coalescedParts : parts;
}
