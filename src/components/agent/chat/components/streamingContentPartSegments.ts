import type { ContentPart } from "../types";

type TextContentPart = Extract<ContentPart, { type: "text" }>;
type ThinkingContentPart = Extract<ContentPart, { type: "thinking" }>;
type CoalescibleContentPart = TextContentPart | ThinkingContentPart;

export function mergeIncrementalText(base: string, chunk: string): string {
  if (!base) {
    return chunk;
  }
  if (!chunk) {
    return base;
  }
  if (chunk.startsWith(base)) {
    return chunk;
  }
  if (base.endsWith(chunk)) {
    return base;
  }

  const maxOverlap = Math.min(base.length, chunk.length);
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    if (base.slice(-overlap) === chunk.slice(0, overlap)) {
      return base + chunk.slice(overlap);
    }
  }

  return base + chunk;
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

    if (pendingPart.type !== part.type) {
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
