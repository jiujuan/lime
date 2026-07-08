import type { QueuedTurnSnapshot } from "@/lib/api/agentRuntime";

function compareQueuedTurnSnapshotOrder(
  left: QueuedTurnSnapshot,
  right: QueuedTurnSnapshot,
): number {
  if (left.position !== right.position) {
    return left.position - right.position;
  }
  if (left.created_at !== right.created_at) {
    return left.created_at - right.created_at;
  }
  return left.queued_turn_id.localeCompare(right.queued_turn_id);
}

export function upsertQueuedTurnSnapshot(
  prev: QueuedTurnSnapshot[],
  nextQueuedTurn: QueuedTurnSnapshot,
): QueuedTurnSnapshot[] {
  return [
    ...prev.filter(
      (item) => item.queued_turn_id !== nextQueuedTurn.queued_turn_id,
    ),
    nextQueuedTurn,
  ].sort(compareQueuedTurnSnapshotOrder);
}

export function removeQueuedTurnSnapshots(
  prev: QueuedTurnSnapshot[],
  queuedTurnIds: string[],
): QueuedTurnSnapshot[] {
  if (queuedTurnIds.length === 0) {
    return prev;
  }

  const idSet = new Set(queuedTurnIds);
  const next = prev.filter((item) => !idSet.has(item.queued_turn_id));
  return next.length === prev.length ? prev : next;
}
