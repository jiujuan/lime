export const STALE_RUNNING_THREAD_READ_MS = 30 * 60 * 1000;

export interface ThreadReadActivityOptions {
  allowThreadStatusWithoutTurn?: boolean;
  nowMs?: number;
  staleRunningMs?: number;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readArray(record: Record<string, unknown>, keys: string[]): unknown[] {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
}

function normalizeStatus(value: unknown): string | null {
  return typeof value === "string"
    ? value
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_") || null
    : null;
}

function isExplicitTerminalThreadStatus(status: string | null): boolean {
  return (
    status === "completed" ||
    status === "failed" ||
    status === "canceled" ||
    status === "cancelled" ||
    status === "aborted"
  );
}

function isRunningTurnStatus(status: string | null): boolean {
  return (
    status === "accepted" ||
    status === "running" ||
    status === "in_progress" ||
    status === "processing" ||
    status === "streaming"
  );
}

function isQueuedThreadStatus(status: string | null): boolean {
  return status === "queued";
}

function readString(
  record: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function readTurnId(turn: Record<string, unknown>): string | null {
  return readString(turn, ["turn_id", "turnId", "id"]);
}

function readTurnStatus(turn: Record<string, unknown>): string | null {
  return (
    normalizeStatus(turn.status) ??
    normalizeStatus(turn.profile_status) ??
    normalizeStatus(turn.profileStatus)
  );
}

function parseTimestampMs(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.abs(value) >= 1_000_000_000_000 ? value : value * 1000;
  }
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return Math.abs(numeric) >= 1_000_000_000_000 ? numeric : numeric * 1000;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readActivityTimestampMs(
  record: Record<string, unknown>,
): number | null {
  const candidates = [
    record.updated_at,
    record.updatedAt,
    record.started_at,
    record.startedAt,
    record.created_at,
    record.createdAt,
  ]
    .map(parseTimestampMs)
    .filter((value): value is number => value !== null);
  return candidates.length > 0 ? Math.max(...candidates) : null;
}

function hasPendingOrQueuedActivity(record: Record<string, unknown>): boolean {
  return (
    readArray(record, ["pending_requests", "pendingRequests"]).length > 0 ||
    readArray(record, ["queued_turns", "queuedTurns"]).length > 0
  );
}

function isFreshRunningRecord(
  record: Record<string, unknown>,
  options: ThreadReadActivityOptions,
): boolean {
  const timestampMs = readActivityTimestampMs(record);
  if (timestampMs === null) {
    return true;
  }
  const nowMs = options.nowMs ?? Date.now();
  const staleRunningMs = options.staleRunningMs ?? STALE_RUNNING_THREAD_READ_MS;
  return nowMs - timestampMs <= staleRunningMs;
}

export function hasRunningTurnRecordActivity(
  turn: unknown,
  options: ThreadReadActivityOptions = {},
): boolean {
  const record = readRecord(turn);
  if (!record) {
    return false;
  }
  const status = readTurnStatus(record);
  if (isExplicitTerminalThreadStatus(status)) {
    return false;
  }
  return isRunningTurnStatus(status) && isFreshRunningRecord(record, options);
}

export function hasRunningThreadReadActivity(
  threadRead: unknown,
  options: ThreadReadActivityOptions = {},
): boolean {
  const record = readRecord(threadRead);
  if (!record) {
    return false;
  }
  const threadStatus = normalizeStatus(record.status);
  const profileStatus = normalizeStatus(record.profile_status);
  if (
    isExplicitTerminalThreadStatus(threadStatus) ||
    isExplicitTerminalThreadStatus(profileStatus)
  ) {
    return false;
  }

  const turns = readArray(record, ["turns"])
    .map(readRecord)
    .filter((turn): turn is Record<string, unknown> => turn !== null);
  const activeTurnId = readString(record, ["active_turn_id", "activeTurnId"]);
  const hasPendingOrQueued = hasPendingOrQueuedActivity(record);
  const hasQueuedTurns =
    readArray(record, ["queued_turns", "queuedTurns"]).length > 0;
  if (
    hasQueuedTurns ||
    (isQueuedThreadStatus(threadStatus) &&
      isFreshRunningRecord(record, options)) ||
    (isQueuedThreadStatus(profileStatus) &&
      isFreshRunningRecord(record, options))
  ) {
    return true;
  }

  if (activeTurnId) {
    const activeTurn = turns.find((turn) => readTurnId(turn) === activeTurnId);
    if (!activeTurn) {
      return false;
    }
    const activeTurnStatus = readTurnStatus(activeTurn);
    if (isExplicitTerminalThreadStatus(activeTurnStatus)) {
      return false;
    }
    return (
      isRunningTurnStatus(activeTurnStatus) &&
      (hasPendingOrQueued || isFreshRunningRecord(activeTurn, options))
    );
  }

  if (
    turns.some(
      (turn) =>
        isRunningTurnStatus(readTurnStatus(turn)) &&
        (hasPendingOrQueued || isFreshRunningRecord(turn, options)),
    )
  ) {
    return true;
  }

  if (
    options.allowThreadStatusWithoutTurn === true &&
    (threadStatus === "running" || profileStatus === "running")
  ) {
    return hasPendingOrQueued || isFreshRunningRecord(record, options);
  }

  return false;
}

export function hasRunningSessionOverviewActivity(
  session: unknown,
  options: ThreadReadActivityOptions = {},
): boolean {
  const record = readRecord(session);
  if (!record) {
    return false;
  }

  const threadStatus = normalizeStatus(record.thread_status);
  const profileStatus = normalizeStatus(record.profile_status);
  const latestTurnStatus = normalizeStatus(record.latest_turn_status);
  if (
    isExplicitTerminalThreadStatus(threadStatus) ||
    isExplicitTerminalThreadStatus(profileStatus)
  ) {
    return false;
  }

  if (threadStatus === "running" || profileStatus === "running") {
    return isFreshRunningRecord(record, options);
  }

  const hasExplicitThreadStatus = Boolean(threadStatus || profileStatus);
  if (hasExplicitThreadStatus) {
    return false;
  }

  const activeTurnId = readString(record, ["active_turn_id", "activeTurnId"]);
  return Boolean(
    activeTurnId &&
    isRunningTurnStatus(latestTurnStatus) &&
    isFreshRunningRecord(record, options),
  );
}
