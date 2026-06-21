import type { ContentPart } from "../types";

function readComparableSequence(part: ContentPart): number | null {
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

function isProcessPart(part: ContentPart): boolean {
  return part.type === "thinking" || part.type === "tool_use";
}

function orderProcessRunBySequence(parts: ContentPart[]): ContentPart[] {
  if (parts.length < 2) {
    return parts;
  }

  const indexedParts = parts.map((part, index) => ({
    part,
    index,
    sequence: readComparableSequence(part),
  }));
  if (!indexedParts.every((entry) => entry.sequence !== null)) {
    return parts;
  }

  return indexedParts
    .sort((left, right) => {
      if (left.sequence !== right.sequence) {
        return left.sequence! - right.sequence!;
      }
      return left.index - right.index;
    })
    .map((entry) => entry.part);
}

export function orderStreamingContentPartsForDisplay(
  parts: ContentPart[] | undefined,
): ContentPart[] | undefined {
  if (!parts || parts.length < 2) {
    return parts;
  }

  const orderedParts: ContentPart[] = [];
  let processRun: ContentPart[] = [];

  const flushProcessRun = () => {
    if (processRun.length > 0) {
      orderedParts.push(...orderProcessRunBySequence(processRun));
      processRun = [];
    }
  };

  for (const part of parts) {
    if (isProcessPart(part)) {
      processRun.push(part);
      continue;
    }

    flushProcessRun();
    orderedParts.push(part);
  }

  flushProcessRun();
  return orderedParts;
}
