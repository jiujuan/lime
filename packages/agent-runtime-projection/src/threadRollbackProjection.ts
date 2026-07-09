import type {
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
  AgentUiRuntimeStatus,
} from "@limecloud/agent-ui-contracts";

import {
  compactProjectionFields,
  definedString,
  readBooleanField,
  readNumberField,
  readRecord,
  readStringArray,
  readStringField,
} from "./normalization.js";

export type AgentUiThreadRollbackProjectionIssueCode =
  | "missing_thread_id"
  | "invalid_num_turns"
  | "rollback_while_turn_in_progress"
  | "rollback_response_thread_mismatch"
  | "missing_rollback_marker"
  | "rollback_marker_count_mismatch"
  | "removed_turn_still_projected"
  | "resume_restored_removed_turn"
  | "history_window_still_has_removed_turn"
  | "rollback_only_hidden_in_ui"
  | "settings_not_recomputed"
  | "reference_context_not_recomputed"
  | "token_usage_not_recomputed";

export interface AgentUiThreadRollbackProjectionIssue {
  code: AgentUiThreadRollbackProjectionIssueCode;
  path: string;
  message: string;
}

export interface AgentUiThreadRollbackProjectionInput {
  threadId?: string | null;
  rollbackRequest?: unknown;
  rollbackResponse?: unknown;
  resumeResponse?: unknown;
  sourceTurnOrder?: unknown;
  removedTurnIds?: unknown;
  rollbackMarkers?: unknown;
  expectedRollbackMarkerCount?: number | null;
  readModelTurns?: unknown;
  projectedTurns?: unknown;
  historyWindowTurns?: unknown;
  hiddenTurnIds?: unknown;
  currentSettings?: unknown;
  expectedSettings?: unknown;
  referenceContext?: unknown;
  expectedReferenceContext?: unknown;
  tokenUsage?: unknown;
  expectedTokenUsage?: unknown;
  turnInProgress?: boolean | null;
  timestamp?: string | null;
}

export interface AgentUiRollbackMarkerSnapshot {
  index: number;
  numTurns?: number;
  threadId?: string;
}

export interface AgentUiThreadRollbackProjectionSnapshot {
  threadId?: string;
  numTurns?: number;
  sourceTurnIds: string[];
  responseTurnIds: string[];
  resumeTurnIds: string[];
  readModelTurnIds: string[];
  historyWindowTurnIds: string[];
  removedTurnIds: string[];
  hiddenTurnIds: string[];
  rollbackMarkers: AgentUiRollbackMarkerSnapshot[];
  expectedRollbackMarkerCount: number;
  rollbackMarkerCount: number;
  readModelClean: boolean;
  resumeClean: boolean;
  historyWindowClean: boolean;
  uiOnlyRollback: boolean;
  settingsRecomputed: boolean;
  referenceContextRecomputed: boolean;
  tokenUsageRecomputed: boolean;
  validationIssues: AgentUiThreadRollbackProjectionIssue[];
}

function issue(
  code: AgentUiThreadRollbackProjectionIssueCode,
  path: string,
  message: string,
): AgentUiThreadRollbackProjectionIssue {
  return { code, path, message };
}

function recordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => readRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item));
}

function threadRecord(value: unknown): Record<string, unknown> | undefined {
  const record = readRecord(value);
  return readRecord(record?.thread) ?? record;
}

function threadIdFromRecord(record: Record<string, unknown> | undefined): string | undefined {
  return readStringField(record, ["id", "threadId", "thread_id"]);
}

function idList(value: unknown): string[] {
  const strings = readStringArray(value);
  if (strings.length > 0) return strings;
  return recordArray(value)
    .map((record) => readStringField(record, ["id", "turnId", "turn_id"]))
    .filter((item): item is string => Boolean(item));
}

function turnIdsFromThread(value: unknown): string[] {
  const thread = threadRecord(value);
  return idList(thread?.turns);
}

function readNumTurns(input: AgentUiThreadRollbackProjectionInput): number | undefined {
  const request = readRecord(input.rollbackRequest);
  return readNumberField(request, ["numTurns", "num_turns"]);
}

function readThreadId(input: AgentUiThreadRollbackProjectionInput): string | undefined {
  const request = readRecord(input.rollbackRequest);
  const responseThread = threadRecord(input.rollbackResponse);
  return (
    definedString(input.threadId ?? undefined) ??
    readStringField(request, ["threadId", "thread_id"]) ??
    threadIdFromRecord(responseThread)
  );
}

function inferRemovedTurnIds(
  input: AgentUiThreadRollbackProjectionInput,
  sourceTurnIds: readonly string[],
  responseTurnIds: readonly string[],
): string[] {
  const explicit = idList(input.removedTurnIds);
  if (explicit.length > 0) return explicit;
  const response = new Set(responseTurnIds);
  return sourceTurnIds.filter((turnId) => !response.has(turnId));
}

function markerRecords(input: AgentUiThreadRollbackProjectionInput): Record<string, unknown>[] {
  const explicit = recordArray(input.rollbackMarkers);
  if (explicit.length > 0) return explicit;
  const response = readRecord(input.rollbackResponse);
  return recordArray(response?.rollbackMarkers ?? response?.rollback_markers);
}

function markerSnapshots(
  input: AgentUiThreadRollbackProjectionInput,
): AgentUiRollbackMarkerSnapshot[] {
  return markerRecords(input).map((record, index) =>
    compactProjectionFields({
      index,
      numTurns: readNumberField(record, ["numTurns", "num_turns"]),
      threadId: readStringField(record, ["threadId", "thread_id"]),
    } satisfies AgentUiRollbackMarkerSnapshot),
  );
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  const record = readRecord(value);
  if (!record) return value;
  return Object.fromEntries(
    Object.entries(record)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stableValue(entry)]),
  );
}

function stableEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

function derivedStateMatches(actual: unknown, expected: unknown): boolean {
  if (expected === undefined || expected === null) return true;
  return stableEqual(actual, expected);
}

function containsAny(
  container: readonly string[],
  needles: readonly string[],
): boolean {
  const values = new Set(container);
  return needles.some((needle) => values.has(needle));
}

function validateSnapshot(
  input: AgentUiThreadRollbackProjectionInput,
  snapshot: Omit<AgentUiThreadRollbackProjectionSnapshot, "validationIssues">,
): AgentUiThreadRollbackProjectionIssue[] {
  const issues: AgentUiThreadRollbackProjectionIssue[] = [];
  const responseThreadId = threadIdFromRecord(threadRecord(input.rollbackResponse));

  if (!snapshot.threadId) {
    issues.push(
      issue(
        "missing_thread_id",
        "$.rollbackRequest.threadId",
        "thread/rollback must target a thread id.",
      ),
    );
  }
  if (!snapshot.numTurns || snapshot.numTurns < 1) {
    issues.push(
      issue(
        "invalid_num_turns",
        "$.rollbackRequest.numTurns",
        "thread/rollback numTurns must be >= 1.",
      ),
    );
  }
  if (input.turnInProgress) {
    issues.push(
      issue(
        "rollback_while_turn_in_progress",
        "$.turnInProgress",
        "Rollback must fail while a turn is in progress.",
      ),
    );
  }
  if (
    snapshot.threadId &&
    responseThreadId &&
    responseThreadId !== snapshot.threadId
  ) {
    issues.push(
      issue(
        "rollback_response_thread_mismatch",
        "$.rollbackResponse.thread.id",
        "Rollback response thread id must match the requested thread.",
      ),
    );
  }
  if (snapshot.rollbackMarkerCount === 0) {
    issues.push(
      issue(
        "missing_rollback_marker",
        "$.rollbackMarkers",
        "Rollback must persist a ThreadRolledBack marker.",
      ),
    );
  }
  if (
    snapshot.expectedRollbackMarkerCount > 0 &&
    snapshot.rollbackMarkerCount > 0 &&
    snapshot.rollbackMarkerCount !== snapshot.expectedRollbackMarkerCount
  ) {
    issues.push(
      issue(
        "rollback_marker_count_mismatch",
        "$.rollbackMarkers",
        "Rollback markers must replay cumulatively.",
      ),
    );
  }
  if (containsAny(snapshot.readModelTurnIds, snapshot.removedTurnIds)) {
    issues.push(
      issue(
        "removed_turn_still_projected",
        "$.readModelTurns",
        "Removed turns must not remain in the read model projection.",
      ),
    );
  }
  if (containsAny(snapshot.resumeTurnIds, snapshot.removedTurnIds)) {
    issues.push(
      issue(
        "resume_restored_removed_turn",
        "$.resumeResponse.thread.turns",
        "Resuming after rollback must not restore removed turns.",
      ),
    );
  }
  if (containsAny(snapshot.historyWindowTurnIds, snapshot.removedTurnIds)) {
    issues.push(
      issue(
        "history_window_still_has_removed_turn",
        "$.historyWindowTurns",
        "History windows must not show turns removed by rollback.",
      ),
    );
  }
  if (snapshot.uiOnlyRollback) {
    issues.push(
      issue(
        "rollback_only_hidden_in_ui",
        "$.hiddenTurnIds",
        "Rollback cannot be implemented by hiding turns in UI while keeping them in read model.",
      ),
    );
  }
  if (!snapshot.settingsRecomputed) {
    issues.push(
      issue(
        "settings_not_recomputed",
        "$.currentSettings",
        "Rollback replay must recompute previous turn settings from remaining history.",
      ),
    );
  }
  if (!snapshot.referenceContextRecomputed) {
    issues.push(
      issue(
        "reference_context_not_recomputed",
        "$.referenceContext",
        "Rollback replay must recompute reference context from remaining history.",
      ),
    );
  }
  if (!snapshot.tokenUsageRecomputed) {
    issues.push(
      issue(
        "token_usage_not_recomputed",
        "$.tokenUsage",
        "Rollback must align token/context usage with remaining turns.",
      ),
    );
  }

  return issues;
}

function runtimeStatus(
  issues: readonly AgentUiThreadRollbackProjectionIssue[],
): AgentUiRuntimeStatus {
  return issues.length > 0 ? "failed" : "completed";
}

export function extractCodexThreadRollbackProjectionSnapshot(
  input: AgentUiThreadRollbackProjectionInput,
): AgentUiThreadRollbackProjectionSnapshot {
  const threadId = readThreadId(input);
  const numTurns = readNumTurns(input);
  const sourceTurnIds = idList(input.sourceTurnOrder);
  const responseTurnIds = turnIdsFromThread(input.rollbackResponse);
  const resumeTurnIds =
    turnIdsFromThread(input.resumeResponse).length > 0
      ? turnIdsFromThread(input.resumeResponse)
      : responseTurnIds;
  const readModelTurnIds =
    idList(input.readModelTurns).length > 0
      ? idList(input.readModelTurns)
      : responseTurnIds;
  const historyWindowTurnIds =
    idList(input.historyWindowTurns).length > 0
      ? idList(input.historyWindowTurns)
      : readModelTurnIds;
  const removedTurnIds = inferRemovedTurnIds(input, sourceTurnIds, responseTurnIds);
  const hiddenTurnIds = idList(input.hiddenTurnIds);
  const markers = markerSnapshots(input);
  const expectedRollbackMarkerCount =
    input.expectedRollbackMarkerCount ?? (numTurns && numTurns > 0 ? 1 : 0);
  const uiOnlyRollback =
    hiddenTurnIds.length > 0 && containsAny(readModelTurnIds, hiddenTurnIds);
  const base = {
    threadId,
    numTurns,
    sourceTurnIds,
    responseTurnIds,
    resumeTurnIds,
    readModelTurnIds,
    historyWindowTurnIds,
    removedTurnIds,
    hiddenTurnIds,
    rollbackMarkers: markers,
    expectedRollbackMarkerCount,
    rollbackMarkerCount: markers.length,
    readModelClean: !containsAny(readModelTurnIds, removedTurnIds),
    resumeClean: !containsAny(resumeTurnIds, removedTurnIds),
    historyWindowClean: !containsAny(historyWindowTurnIds, removedTurnIds),
    uiOnlyRollback,
    settingsRecomputed: derivedStateMatches(
      input.currentSettings,
      input.expectedSettings,
    ),
    referenceContextRecomputed: derivedStateMatches(
      input.referenceContext,
      input.expectedReferenceContext,
    ),
    tokenUsageRecomputed: derivedStateMatches(
      input.tokenUsage,
      input.expectedTokenUsage,
    ),
  };
  return {
    ...base,
    validationIssues: validateSnapshot(input, base),
  };
}

export function buildCodexThreadRollbackProjectionEvent(
  input: AgentUiThreadRollbackProjectionInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent {
  const snapshot = extractCodexThreadRollbackProjectionSnapshot(input);
  const status = runtimeStatus(snapshot.validationIssues);
  return compactProjectionFields({
    type: "context.changed",
    sourceType: "thread_rollback_projection",
    sequence: context.sequence,
    timestamp: definedString(input.timestamp ?? undefined) ?? context.timestamp,
    sessionId: definedString(context.sessionId ?? undefined),
    threadId: snapshot.threadId ?? definedString(context.threadId ?? undefined),
    runId: definedString(context.runId ?? undefined),
    turnId: snapshot.responseTurnIds[snapshot.responseTurnIds.length - 1] ?? definedString(context.turnId ?? undefined),
    owner: "context",
    scope: "thread",
    phase: status === "failed" ? "failed" : "completed",
    surface: "timeline_evidence",
    persistence: "snapshot",
    control: "open_detail",
    runtimeEntity: "agent_turn",
    runtimeStatus: status,
    latestTurnStatus: status,
    payload: {
      threadRollbackProjectionEvent: "thread_rollback_snapshot",
      numTurns: snapshot.numTurns,
      removedTurnIds: snapshot.removedTurnIds,
      responseTurnIds: snapshot.responseTurnIds,
      rollbackMarkerCount: snapshot.rollbackMarkerCount,
      readModelClean: snapshot.readModelClean,
      resumeClean: snapshot.resumeClean,
      historyWindowClean: snapshot.historyWindowClean,
      settingsRecomputed: snapshot.settingsRecomputed,
      referenceContextRecomputed: snapshot.referenceContextRecomputed,
      tokenUsageRecomputed: snapshot.tokenUsageRecomputed,
      threadRollbackProjection: snapshot,
      validationIssues: snapshot.validationIssues,
    },
  } satisfies AgentUiProjectionEvent);
}
