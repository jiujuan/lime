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

export function projectChatRuntimeQueueControl(
  response: ThreadReadResponse,
): ChatRuntimeQueueControlProjectionResult {
  const thread = response?.thread;
  if (!thread || !Array.isArray(thread.turns)) {
    return { ok: false, reason: "canonical thread read is not hydrated" };
  }
  if (
    !isNonEmptyString(thread.id) ||
    !isNonEmptyString(thread.sessionId) ||
    !isFiniteNumber(thread.updatedAt)
  ) {
    return {
      ok: false,
      reason: "canonical thread identity or timestamp is invalid",
    };
  }

  const seenTurnIds = new Set<string>();
  let activeTurnId: string | null = null;
  for (const turn of thread.turns) {
    if (!isCanonicalTurn(turn)) {
      return { ok: false, reason: "canonical turn identity is invalid" };
    }
    if (seenTurnIds.has(turn.id)) {
      return { ok: false, reason: "canonical turn identity is duplicated" };
    }
    seenTurnIds.add(turn.id);
    if (turn.status === "inProgress") {
      if (activeTurnId !== null) {
        return {
          ok: false,
          reason: "canonical read contains multiple active turns",
        };
      }
      activeTurnId = turn.id;
    }
  }

  return {
    ok: true,
    projection: {
      threadId: thread.id,
      updatedAtMs: thread.updatedAt * 1_000,
      activeTurnId,
      queuedTurnIds: [],
    },
  };
}

function isCanonicalTurn(value: unknown): value is Turn {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const turn = value as Partial<Turn>;
  return (
    isNonEmptyString(turn.id) &&
    (turn.status === "completed" ||
      turn.status === "failed" ||
      turn.status === "inProgress" ||
      turn.status === "interrupted")
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
