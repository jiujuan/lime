import type { ThreadReadResponse, Turn } from "@limecloud/app-server-client";

export interface ChatRuntimeQueueControlProjection {
  threadId: string;
  updatedAtMs: number;
  activeTurnId: string | null;
  readonly queuedTurnIds: readonly string[];
}

export type ChatRuntimeQueueControlProjectionResult =
  | { ok: true; projection: ChatRuntimeQueueControlProjection }
  | { ok: false; reason: string };

/**
 * Projects only the queue-control facts needed by immediate queued-turn
 * promotion. A malformed or partial canonical read must never become a
 * guessed active/queued state.
 */
export function projectChatRuntimeQueueControl(
  response: ThreadReadResponse,
): ChatRuntimeQueueControlProjectionResult {
  const thread = response?.thread;
  if (!thread || thread.turnsView !== "full" || !Array.isArray(thread.turns)) {
    return { ok: false, reason: "canonical thread read is not hydrated" };
  }
  if (
    !isNonEmptyString(thread.threadId) ||
    !isNonEmptyString(thread.sessionId) ||
    !isFiniteNumber(thread.updatedAtMs)
  ) {
    return {
      ok: false,
      reason: "canonical thread identity or timestamp is invalid",
    };
  }

  const seenTurnIds = new Set<string>();
  const queuedTurnIds: string[] = [];
  let activeTurnId: string | null = null;

  for (const turn of thread.turns) {
    if (
      !isCanonicalTurn(turn) ||
      turn.threadId !== thread.threadId ||
      turn.sessionId !== thread.sessionId
    ) {
      return { ok: false, reason: "canonical turn identity is invalid" };
    }
    if (seenTurnIds.has(turn.turnId)) {
      return { ok: false, reason: "canonical turn identity is duplicated" };
    }
    seenTurnIds.add(turn.turnId);

    if (turn.queue?.state === "queued") {
      if (turn.status !== "inProgress") {
        return { ok: false, reason: "queued turn has terminal status" };
      }
      queuedTurnIds.push(turn.turnId);
      continue;
    }
    if (turn.status === "inProgress") {
      if (activeTurnId !== null) {
        return {
          ok: false,
          reason: "canonical read contains multiple active turns",
        };
      }
      activeTurnId = turn.turnId;
    }
  }

  return {
    ok: true,
    projection: {
      threadId: thread.threadId,
      updatedAtMs: thread.updatedAtMs,
      activeTurnId,
      queuedTurnIds,
    },
  };
}

function isCanonicalTurn(value: unknown): value is Turn {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const turn = value as Partial<Turn>;
  return (
    isNonEmptyString(turn.turnId) &&
    isNonEmptyString(turn.threadId) &&
    isNonEmptyString(turn.sessionId) &&
    isFiniteNumber(turn.createdAtMs) &&
    isFiniteNumber(turn.updatedAtMs) &&
    (turn.status === "completed" ||
      turn.status === "failed" ||
      turn.status === "inProgress" ||
      turn.status === "interrupted") &&
    (turn.queue === undefined ||
      turn.queue.state === "notQueued" ||
      turn.queue.state === "running" ||
      turn.queue.state === "queued") &&
    (turn.queue === undefined ||
      turn.queue.state !== "queued" ||
      turn.status === "inProgress")
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
