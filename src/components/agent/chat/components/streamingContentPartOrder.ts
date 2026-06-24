import type { ContentPart } from "../types";
import { readContentPartSequence } from "../utils/contentPartTimeline";

function isProcessPart(part: ContentPart): boolean {
  return part.type === "thinking" || part.type === "tool_use";
}

function shouldOrderPartWithProcessRun(part: ContentPart): boolean {
  if (isProcessPart(part)) {
    return true;
  }
  return part.type === "text" && readContentPartSequence(part) !== null;
}

function orderProcessRunBySequence(parts: ContentPart[]): ContentPart[] {
  if (parts.length < 2) {
    return parts;
  }

  const indexedParts = parts.map((part, index) => ({
    part,
    index,
    sequence: readContentPartSequence(part),
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
    if (shouldOrderPartWithProcessRun(part)) {
      processRun.push(part);
      continue;
    }

    flushProcessRun();
    orderedParts.push(part);
  }

  flushProcessRun();
  return orderedParts;
}
