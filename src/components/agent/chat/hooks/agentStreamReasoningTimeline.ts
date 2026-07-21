import type { AgentThreadItem } from "@/lib/api/agentProtocol";

export interface AgentStreamReasoningTimelineState {
  currentTurnId?: string | null;
  streamedReasoningItemId?: string | null;
  streamedReasoningText?: string;
  streamedReasoningStartedAt?: string | null;
  streamedReasoningSequence?: number | null;
  streamedReasoningSegmentCounter?: number;
}

export function appendTextWithOverlapFallback(
  base: string,
  delta: string,
): string {
  if (!base) {
    return delta;
  }
  if (!delta) {
    return base;
  }
  if (delta.startsWith(base)) {
    return delta;
  }
  if (base.endsWith(delta)) {
    return base;
  }

  const maxOverlap = Math.min(base.length, delta.length);
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    if (base.endsWith(delta.slice(0, overlap))) {
      return `${base}${delta.slice(overlap)}`;
    }
  }

  return `${base}${delta}`;
}

export function resolveStreamedReasoningTurnId(
  requestState: AgentStreamReasoningTimelineState,
): string | null {
  return requestState.currentTurnId?.trim() || null;
}

export function buildStreamedReasoningItem(params: {
  activeSessionId: string;
  now: string;
  requestState: AgentStreamReasoningTimelineState;
  sequence?: number | null;
}): AgentThreadItem | null {
  const turnId = resolveStreamedReasoningTurnId(params.requestState);
  const text = params.requestState.streamedReasoningText?.trim();
  if (!turnId || !text) {
    return null;
  }

  let itemId = params.requestState.streamedReasoningItemId;
  if (!itemId) {
    const sequence =
      typeof params.sequence === "number" && Number.isFinite(params.sequence)
        ? params.sequence
        : null;
    if (sequence !== null) {
      itemId = `streamed-reasoning:${turnId}:${sequence}`;
    } else {
      const nextCounter =
        (params.requestState.streamedReasoningSegmentCounter ?? 0) + 1;
      params.requestState.streamedReasoningSegmentCounter = nextCounter;
      itemId = `streamed-reasoning:${turnId}:local-${nextCounter}`;
    }
    params.requestState.streamedReasoningItemId = itemId;
    params.requestState.streamedReasoningSequence = sequence;
  }
  const startedAt =
    params.requestState.streamedReasoningStartedAt || params.now;
  params.requestState.streamedReasoningStartedAt = startedAt;
  const itemSequence =
    typeof params.requestState.streamedReasoningSequence === "number"
      ? params.requestState.streamedReasoningSequence
      : 0;

  return {
    id: itemId,
    thread_id: params.activeSessionId,
    turn_id: turnId,
    sequence: itemSequence,
    status: "in_progress",
    started_at: startedAt,
    updated_at: params.now,
    type: "reasoning",
    text,
  };
}

export function isStreamedReasoningTimelineItem(
  item: AgentThreadItem,
  turnId?: string | null,
): boolean {
  return (
    item.type === "reasoning" &&
    item.id.startsWith("streamed-reasoning:") &&
    (!turnId || item.turn_id === turnId)
  );
}

export function removeStreamedReasoningTimelineItems(
  items: AgentThreadItem[],
  turnId?: string | null,
): AgentThreadItem[] {
  const nextItems = items.filter(
    (item) => !isStreamedReasoningTimelineItem(item, turnId),
  );
  return nextItems.length === items.length ? items : nextItems;
}

export function resetStreamedReasoningSegment(
  requestState: AgentStreamReasoningTimelineState,
): void {
  requestState.streamedReasoningItemId = null;
  requestState.streamedReasoningText = "";
  requestState.streamedReasoningStartedAt = null;
  requestState.streamedReasoningSequence = null;
}
