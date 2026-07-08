import type { AgentThreadItem, Message } from "../types";
import {
  isProcessBoundaryContentPart,
  readContentPartSequence,
} from "../utils/contentPartTimeline";
import {
  isUnifiedWebFetchToolName,
  isUnifiedWebSearchToolName,
} from "../utils/toolNameFamily";
import type { MessageContentPart } from "./messageListTimelineContentPartTypes";
import { buildSparseTimelineInlinePart } from "./messageListTimelineContentPartBuilders";
import {
  appendTextContentPart,
  hasFinalTextContentPart,
  isTextContentPart,
  isThinkingContentPart,
  shouldRenderTimelineAgentMessageAsVisibleText,
} from "./messageListTimelineContentPartText";

function parseTimelineTimeMs(value?: string | null): number | null {
  const timestamp = Date.parse(value || "");
  return Number.isFinite(timestamp) ? timestamp : null;
}

function resolveThreadItemTimeMs(item: AgentThreadItem): number | null {
  return (
    parseTimelineTimeMs(item.started_at) ??
    parseTimelineTimeMs(item.updated_at) ??
    parseTimelineTimeMs(item.completed_at)
  );
}

function resolveContentPartTimeMs(part: MessageContentPart): number | null {
  if (part.type !== "tool_use") {
    return null;
  }
  const startedAt = part.toolCall.startTime?.getTime();
  if (Number.isFinite(startedAt)) {
    return startedAt ?? null;
  }
  const endedAt = part.toolCall.endTime?.getTime();
  return Number.isFinite(endedAt) ? (endedAt ?? null) : null;
}

function resolveContentPartSequence(
  part: MessageContentPart,
  timelineSequenceById: Map<string, number>,
): number | null {
  if (part.type !== "tool_use") {
    return null;
  }
  const metadataSequence = readContentPartSequence(part);
  if (metadataSequence !== null) {
    return metadataSequence;
  }
  const sequence = timelineSequenceById.get(part.toolCall.id);
  return typeof sequence === "number" && Number.isFinite(sequence)
    ? sequence
    : null;
}

function isWebRetrievalContentPart(part: MessageContentPart): boolean {
  return (
    part.type === "tool_use" &&
    (isUnifiedWebSearchToolName(part.toolCall.name) ||
      isUnifiedWebFetchToolName(part.toolCall.name))
  );
}

function getSparseProcessPartKey(part: MessageContentPart): string | null {
  if (isThinkingContentPart(part)) {
    const text = part.text.trim();
    return text ? `thinking:${text}` : null;
  }
  if (isTextContentPart(part)) {
    const text = part.text.trim();
    const phase =
      typeof part.metadata?.phase === "string" ? part.metadata.phase : "";
    return text ? `text:${phase}:${text}` : null;
  }
  return null;
}

function collectSparseProcessPartKeys(
  parts: MessageContentPart[],
): Set<string> {
  const keys = new Set<string>();
  for (const part of parts) {
    const key = getSparseProcessPartKey(part);
    if (key) {
      keys.add(key);
    }
  }
  return keys;
}

function canMergeSparseTimelineProcessItem(item: AgentThreadItem): boolean {
  if (item.type === "agent_message") {
    return (
      item.text.trim().length > 0 &&
      shouldRenderTimelineAgentMessageAsVisibleText(item)
    );
  }
  if (item.type === "reasoning") {
    return item.text.trim().length > 0;
  }
  return false;
}

function canIgnoreSparseTimelineProcessItem(item: AgentThreadItem): boolean {
  return item.type === "turn_summary";
}

export function mergeSparseTimelineProcessIntoExistingParts(params: {
  items: AgentThreadItem[];
  existingContentParts?: Message["contentParts"];
  displayContent: string;
}): MessageContentPart[] | null {
  const existingParts = params.existingContentParts || [];
  if (!existingParts.some(isProcessBoundaryContentPart)) {
    return null;
  }

  if (
    !params.items.every(
      (item) =>
        canMergeSparseTimelineProcessItem(item) ||
        canIgnoreSparseTimelineProcessItem(item),
    )
  ) {
    return null;
  }

  const pending = params.items
    .filter(canMergeSparseTimelineProcessItem)
    .map((item) => ({
      item,
      part: buildSparseTimelineInlinePart(item),
      timeMs: resolveThreadItemTimeMs(item),
    }))
    .filter(
      (
        entry,
      ): entry is {
        item: AgentThreadItem;
        part: MessageContentPart;
        timeMs: number | null;
      } => Boolean(entry.part),
    )
    .sort((left, right) => {
      if (left.timeMs !== null && right.timeMs !== null) {
        return left.timeMs - right.timeMs;
      }
      if (left.timeMs !== null) {
        return -1;
      }
      if (right.timeMs !== null) {
        return 1;
      }
      return left.item.sequence - right.item.sequence;
    });

  if (pending.length === 0) {
    return null;
  }

  const seenProcessKeys = collectSparseProcessPartKeys(existingParts);
  const uniquePending: typeof pending = [];
  for (const entry of pending) {
    const key = getSparseProcessPartKey(entry.part);
    if (key && seenProcessKeys.has(key)) {
      continue;
    }
    if (key) {
      seenProcessKeys.add(key);
    }
    uniquePending.push(entry);
  }

  if (uniquePending.length === 0) {
    return null;
  }

  const timelineSequenceById = new Map<string, number>();
  for (const item of params.items) {
    if (Number.isFinite(item.sequence)) {
      timelineSequenceById.set(item.id, item.sequence);
    }
  }

  const nextParts: MessageContentPart[] = [];
  let pendingIndex = 0;
  let sawProcess = false;
  let sawWebRetrievalProcess = false;
  const shouldUseWebRetrievalOrderFallback =
    uniquePending.length > 0 &&
    existingParts.some(isWebRetrievalContentPart) &&
    !params.items.some(
      (item) =>
        item.type === "tool_call" ||
        item.type === "web_search" ||
        item.type === "command_execution" ||
        item.type === "patch",
    );
  const flushPendingBefore = (
    timeMs: number | null,
    options: { includeUnknownTime: boolean } = { includeUnknownTime: true },
  ) => {
    while (pendingIndex < uniquePending.length) {
      const pendingTimeMs = uniquePending[pendingIndex]!.timeMs;
      if (
        timeMs !== null &&
        !(
          (options.includeUnknownTime && pendingTimeMs === null) ||
          (pendingTimeMs !== null && pendingTimeMs < timeMs)
        )
      ) {
        break;
      }
      nextParts.push(uniquePending[pendingIndex]!.part);
      pendingIndex += 1;
    }
  };
  const flushPendingBeforeSequence = (sequence: number | null) => {
    if (sequence === null) {
      return;
    }
    while (
      pendingIndex < uniquePending.length &&
      uniquePending[pendingIndex]!.timeMs === null &&
      Number.isFinite(uniquePending[pendingIndex]!.item.sequence) &&
      uniquePending[pendingIndex]!.item.sequence < sequence
    ) {
      nextParts.push(uniquePending[pendingIndex]!.part);
      pendingIndex += 1;
    }
  };

  for (const part of existingParts) {
    const partTimeMs = resolveContentPartTimeMs(part);
    const partSequence = resolveContentPartSequence(part, timelineSequenceById);
    if (part.type === "text" && sawProcess) {
      flushPendingBefore(null);
      nextParts.push(part);
      continue;
    }

    flushPendingBeforeSequence(partSequence);
    if (partTimeMs !== null) {
      flushPendingBefore(partTimeMs, {
        includeUnknownTime: partSequence === null,
      });
    } else {
      flushPendingBeforeSequence(partSequence);
    }
    nextParts.push(part);
    if (
      shouldUseWebRetrievalOrderFallback &&
      !sawWebRetrievalProcess &&
      isWebRetrievalContentPart(part)
    ) {
      sawWebRetrievalProcess = true;
      flushPendingBefore(null);
    }
    if (isProcessBoundaryContentPart(part)) {
      sawProcess = true;
    }
  }

  flushPendingBefore(null);
  if (!hasFinalTextContentPart(nextParts)) {
    appendTextContentPart(nextParts, params.displayContent);
  }

  return nextParts;
}
