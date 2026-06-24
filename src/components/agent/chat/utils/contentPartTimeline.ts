import type { ContentPart } from "../types";
import { isAgentMessageCommentaryPhase } from "./agentMessagePhase";

type TextContentPart = Extract<ContentPart, { type: "text" }>;
type ThinkingContentPart = Extract<ContentPart, { type: "thinking" }>;
export type CoalescibleContentPart = TextContentPart | ThinkingContentPart;

export function mergeIncrementalTextWithOverlap(
  base: string,
  chunk: string,
): string {
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
  if (base.includes(chunk)) {
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

export function readContentPartSequence(part: ContentPart): number | null {
  const sequence =
    part.type === "tool_use"
      ? (part.metadata?.sequence ?? part.toolCall.metadata?.sequence)
      : part.metadata?.sequence;
  return typeof sequence === "number" &&
    Number.isFinite(sequence) &&
    sequence < Number.MAX_SAFE_INTEGER
    ? sequence
    : null;
}

export function isProcessBoundaryContentPart(part: ContentPart): boolean {
  if (part.type !== "text") {
    return true;
  }

  const phase = part.metadata?.phase;
  return typeof phase === "string" && isAgentMessageCommentaryPhase(phase);
}

function hasOwnMetadata(part: ContentPart): boolean {
  return Boolean(part.metadata && Object.keys(part.metadata).length > 0);
}

function provenanceValue(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string {
  const value = metadata?.[key];
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}

function hasComparableTextProvenance(part: TextContentPart): boolean {
  const metadata = part.metadata;
  return Boolean(
    metadata?.source ||
    metadata?.threadItemId ||
    metadata?.itemId ||
    metadata?.turnId ||
    metadata?.phase ||
    readContentPartSequence(part) !== null,
  );
}

function hasSameTextProvenance(
  base: TextContentPart,
  chunk: TextContentPart,
): boolean {
  const keys = ["source", "threadItemId", "itemId", "turnId", "phase"];
  if (
    keys.some(
      (key) =>
        provenanceValue(base.metadata, key) !==
        provenanceValue(chunk.metadata, key),
    )
  ) {
    return false;
  }

  const baseSequence = readContentPartSequence(base);
  const chunkSequence = readContentPartSequence(chunk);
  if (baseSequence !== null || chunkSequence !== null) {
    return baseSequence === chunkSequence;
  }

  return true;
}

export function canMergeCoalescibleContentParts(
  base: CoalescibleContentPart,
  chunk: CoalescibleContentPart,
): boolean {
  if (base.type !== chunk.type) {
    return false;
  }
  if (base.type === "thinking") {
    return true;
  }
  if (chunk.type !== "text") {
    return false;
  }

  const baseHasProvenance = hasComparableTextProvenance(base);
  const chunkHasProvenance = hasComparableTextProvenance(chunk);
  if (!baseHasProvenance && !chunkHasProvenance) {
    return !hasOwnMetadata(base) && !hasOwnMetadata(chunk);
  }
  if (baseHasProvenance !== chunkHasProvenance) {
    return false;
  }

  return hasSameTextProvenance(base, chunk);
}

export function shouldAppendCompletionSuffixToTextPart(
  parts: ContentPart[],
  textPartIndex: number,
): boolean {
  const textPart = parts[textPartIndex];
  if (!textPart || textPart.type !== "text") {
    return false;
  }
  const textSequence = readContentPartSequence(textPart);
  if (textSequence === null) {
    return true;
  }

  return !parts.some((part, index) => {
    if (index === textPartIndex) {
      return false;
    }
    if (!isProcessBoundaryContentPart(part)) {
      return false;
    }
    const processSequence = readContentPartSequence(part);
    return processSequence !== null && processSequence > textSequence;
  });
}

export function buildAgentTextDeltaContentPartMetadata(params: {
  itemId?: string | null;
  phase?: string | null;
  sequence?: number | null;
  turnId?: string | null;
}): Record<string, unknown> | undefined {
  const metadata: Record<string, unknown> = {
    source: "agent_text_delta",
  };
  if (typeof params.sequence === "number" && Number.isFinite(params.sequence)) {
    metadata.sequence = params.sequence;
  }
  if (params.itemId) {
    metadata.itemId = params.itemId;
  }
  if (params.turnId) {
    metadata.turnId = params.turnId;
  }
  if (params.phase) {
    metadata.phase = params.phase;
  }

  return Object.keys(metadata).length > 1 ? metadata : undefined;
}
