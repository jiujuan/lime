import type { ContentPart } from "../types";
import {
  canMergeCoalescibleContentParts,
  mergeIncrementalTextWithOverlap,
} from "../utils/contentPartTimeline";

type TextContentPart = Extract<ContentPart, { type: "text" }>;
type ThinkingContentPart = Extract<ContentPart, { type: "thinking" }>;
type CoalescibleContentPart = TextContentPart | ThinkingContentPart;

export function mergeIncrementalText(base: string, chunk: string): string {
  return mergeIncrementalTextWithOverlap(base, chunk);
}

function mergeCoalescibleContentPart<TPart extends CoalescibleContentPart>(
  base: TPart,
  chunk: TPart,
): TPart {
  return {
    ...base,
    text:
      base.type === "text"
        ? base.text + chunk.text
        : mergeIncrementalText(base.text, chunk.text),
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
