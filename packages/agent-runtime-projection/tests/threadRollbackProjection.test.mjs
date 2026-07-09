import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCodexThreadRollbackProjectionEvent,
  extractCodexThreadRollbackProjectionSnapshot,
} from "../dist/index.js";

function turn(id, itemIds = []) {
  return {
    id,
    status: "completed",
    items: itemIds.map((itemId) => ({ id: itemId })),
  };
}

function rollbackInput(overrides = {}) {
  return {
    threadId: "thread-rollback",
    rollbackRequest: {
      threadId: "thread-rollback",
      numTurns: 1,
    },
    rollbackResponse: {
      thread: {
        id: "thread-rollback",
        sessionId: "thread-rollback",
        status: "idle",
        turns: [turn("turn-1", ["item-user-1", "item-assistant-1"])],
      },
    },
    resumeResponse: {
      thread: {
        id: "thread-rollback",
        status: "idle",
        turns: [turn("turn-1", ["item-user-1", "item-assistant-1"])],
      },
    },
    sourceTurnOrder: ["turn-1", "turn-2"],
    removedTurnIds: ["turn-2"],
    rollbackMarkers: [
      {
        type: "ThreadRolledBack",
        threadId: "thread-rollback",
        numTurns: 1,
      },
    ],
    expectedRollbackMarkerCount: 1,
    readModelTurns: [turn("turn-1")],
    historyWindowTurns: [turn("turn-1")],
    currentSettings: {
      model: "mock-model",
      realtimeActive: false,
    },
    expectedSettings: {
      model: "mock-model",
      realtimeActive: false,
    },
    referenceContext: {
      turnId: "turn-1",
      model: "mock-model",
    },
    expectedReferenceContext: {
      turnId: "turn-1",
      model: "mock-model",
    },
    tokenUsage: {
      turnId: "turn-1",
      inputTokens: 12,
      outputTokens: 4,
    },
    expectedTokenUsage: {
      turnId: "turn-1",
      inputTokens: 12,
      outputTokens: 4,
    },
    ...overrides,
  };
}

test("thread rollback projection drops removed turns and persists a rollback marker", () => {
  const event = buildCodexThreadRollbackProjectionEvent(
    rollbackInput(),
    {
      sequence: 151,
      sessionId: "session-thread",
      timestamp: "2026-07-09T00:00:00.000Z",
    },
  );

  assert.deepEqual(
    {
      type: event.type,
      sourceType: event.sourceType,
      sequence: event.sequence,
      sessionId: event.sessionId,
      threadId: event.threadId,
      turnId: event.turnId,
      owner: event.owner,
      scope: event.scope,
      phase: event.phase,
      surface: event.surface,
      persistence: event.persistence,
      control: event.control,
      runtimeStatus: event.runtimeStatus,
    },
    {
      type: "context.changed",
      sourceType: "thread_rollback_projection",
      sequence: 151,
      sessionId: "session-thread",
      threadId: "thread-rollback",
      turnId: "turn-1",
      owner: "context",
      scope: "thread",
      phase: "completed",
      surface: "timeline_evidence",
      persistence: "snapshot",
      control: "open_detail",
      runtimeStatus: "completed",
    },
  );
  assert.deepEqual(event.payload.removedTurnIds, ["turn-2"]);
  assert.equal(event.payload.readModelClean, true);
  assert.equal(event.payload.resumeClean, true);
  assert.equal(event.payload.historyWindowClean, true);
  assert.equal(event.payload.settingsRecomputed, true);
  assert.equal(event.payload.referenceContextRecomputed, true);
  assert.equal(event.payload.tokenUsageRecomputed, true);
  assert.deepEqual(event.payload.validationIssues, []);
});

test("thread rollback projection replays markers cumulatively", () => {
  const snapshot = extractCodexThreadRollbackProjectionSnapshot(
    rollbackInput({
      rollbackRequest: {
        threadId: "thread-rollback",
        numTurns: 1,
      },
      rollbackResponse: {
        thread: {
          id: "thread-rollback",
          turns: [turn("turn-1")],
        },
      },
      sourceTurnOrder: ["turn-1", "turn-2", "turn-3"],
      removedTurnIds: ["turn-2", "turn-3"],
      rollbackMarkers: [
        { type: "ThreadRolledBack", threadId: "thread-rollback", numTurns: 1 },
        { type: "ThreadRolledBack", threadId: "thread-rollback", numTurns: 1 },
      ],
      expectedRollbackMarkerCount: 2,
      readModelTurns: [turn("turn-1")],
      historyWindowTurns: [turn("turn-1")],
    }),
  );

  assert.equal(snapshot.rollbackMarkerCount, 2);
  assert.deepEqual(snapshot.removedTurnIds, ["turn-2", "turn-3"]);
  assert.deepEqual(snapshot.validationIssues, []);
});

test("thread rollback projection fails when removed turns remain projected or resume restores them", () => {
  const snapshot = extractCodexThreadRollbackProjectionSnapshot(
    rollbackInput({
      readModelTurns: [turn("turn-1"), turn("turn-2")],
      resumeResponse: {
        thread: {
          id: "thread-rollback",
          turns: [turn("turn-1"), turn("turn-2")],
        },
      },
      historyWindowTurns: [turn("turn-1"), turn("turn-2")],
    }),
  );

  assert.equal(snapshot.readModelClean, false);
  assert.equal(snapshot.resumeClean, false);
  assert.equal(snapshot.historyWindowClean, false);
  assert.deepEqual(
    snapshot.validationIssues.map((item) => item.code),
    [
      "removed_turn_still_projected",
      "resume_restored_removed_turn",
      "history_window_still_has_removed_turn",
    ],
  );
});

test("thread rollback projection rejects UI-only hiding while read model keeps removed turns", () => {
  const snapshot = extractCodexThreadRollbackProjectionSnapshot(
    rollbackInput({
      hiddenTurnIds: ["turn-2"],
      readModelTurns: [turn("turn-1"), turn("turn-2")],
    }),
  );

  assert.equal(snapshot.uiOnlyRollback, true);
  assert.deepEqual(
    snapshot.validationIssues.map((item) => item.code),
    ["removed_turn_still_projected", "rollback_only_hidden_in_ui"],
  );
});

test("thread rollback projection checks settings, reference context and token usage replay", () => {
  const snapshot = extractCodexThreadRollbackProjectionSnapshot(
    rollbackInput({
      currentSettings: {
        model: "stale-model",
      },
      referenceContext: {
        turnId: "turn-2",
        model: "rolled-back-model",
      },
      tokenUsage: {
        turnId: "turn-2",
        inputTokens: 99,
      },
    }),
  );

  assert.equal(snapshot.settingsRecomputed, false);
  assert.equal(snapshot.referenceContextRecomputed, false);
  assert.equal(snapshot.tokenUsageRecomputed, false);
  assert.deepEqual(
    snapshot.validationIssues.map((item) => item.code),
    [
      "settings_not_recomputed",
      "reference_context_not_recomputed",
      "token_usage_not_recomputed",
    ],
  );
});

test("thread rollback projection requires a marker and the expected marker count", () => {
  const missingMarker = extractCodexThreadRollbackProjectionSnapshot(
    rollbackInput({
      rollbackMarkers: [],
    }),
  );
  assert.deepEqual(
    missingMarker.validationIssues.map((item) => item.code),
    ["missing_rollback_marker"],
  );

  const wrongCount = extractCodexThreadRollbackProjectionSnapshot(
    rollbackInput({
      rollbackMarkers: [
        { type: "ThreadRolledBack", threadId: "thread-rollback", numTurns: 1 },
      ],
      expectedRollbackMarkerCount: 2,
    }),
  );
  assert.deepEqual(
    wrongCount.validationIssues.map((item) => item.code),
    ["rollback_marker_count_mismatch"],
  );
});

test("thread rollback projection fails for invalid request or in-progress turn", () => {
  const snapshot = extractCodexThreadRollbackProjectionSnapshot({
    rollbackRequest: {
      numTurns: 0,
    },
    rollbackResponse: {
      thread: {
        turns: [],
      },
    },
    rollbackMarkers: [],
    turnInProgress: true,
  });

  assert.deepEqual(
    snapshot.validationIssues.map((item) => item.code),
    [
      "missing_thread_id",
      "invalid_num_turns",
      "rollback_while_turn_in_progress",
      "missing_rollback_marker",
    ],
  );
});

test("thread rollback projection detects response thread mismatch", () => {
  const snapshot = extractCodexThreadRollbackProjectionSnapshot(
    rollbackInput({
      rollbackResponse: {
        thread: {
          id: "other-thread",
          turns: [turn("turn-1")],
        },
      },
    }),
  );

  assert.deepEqual(
    snapshot.validationIssues.map((item) => item.code),
    ["rollback_response_thread_mismatch"],
  );
});
