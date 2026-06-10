import test from "node:test";
import assert from "node:assert/strict";

import { buildAgentUiHistoricalHydrationEvents } from "../dist/index.js";

test("historical hydration helper builds stale-safe standard events", () => {
  const events = buildAgentUiHistoricalHydrationEvents(
    {
      sessionId: "session-history-1",
      threadId: "thread-history-1",
      recordReason: "restored-window",
      isRestoringSession: true,
      isRestoredHistoryWindow: true,
      isHistoricalTimelineReady: false,
      canBuildHistoricalTimeline: false,
      shouldDeferHistoricalTimeline: true,
      shouldDeferThreadItemsScan: true,
      shouldDeferTailRuntimeStatusLine: true,
      hiddenHistoryCount: 20,
      persistedHiddenHistoryCount: 40,
      targetCount: 3,
      hydratedHistoricalMarkdownCount: 1,
      historicalMarkdownDeferredCount: 2,
      historicalContentPartsDeferredCount: 1,
      messagesCount: 50,
      visibleMessagesCount: 10,
      renderedMessagesCount: 5,
      renderedTurnsCount: 2,
      threadItemsCount: 120,
      messageListComputeMs: 9.5,
    },
    {
      sequence: 30,
      timestamp: "2026-05-09T00:00:00.000Z",
    },
  );

  assert.equal(events.length, 3);
  assert.deepEqual(
    events.map((event) => event.sequence),
    [30, 31, 32],
  );
  assert.equal(events[0].type, "session.hydrated");
  assert.equal(events[0].sourceType, "hydration_projection");
  assert.equal(events[0].sessionId, "session-history-1");
  assert.equal(events[0].threadId, "thread-history-1");
  assert.equal(events[0].owner, "session");
  assert.equal(events[0].scope, "session");
  assert.equal(events[0].phase, "hydrating");
  assert.equal(events[0].surface, "session_tabs");
  assert.equal(events[0].persistence, "snapshot");
  assert.equal(events[1].type, "messages.snapshot");
  assert.equal(events[1].owner, "session");
  assert.equal(events[1].scope, "thread");
  assert.equal(events[1].surface, "conversation");
  assert.equal(events[2].type, "diagnostic.changed");
  assert.equal(events[2].owner, "diagnostics");
  assert.equal(events[2].scope, "session");
  assert.equal(events[2].phase, "hydrating");
  assert.deepEqual(events[2].refs, {
    diagnosticKeys: ["historical_hydration_stale_window"],
  });
  assert.deepEqual(events[2].payload, {
    ...events[0].payload,
    diagnosticKey: "historical_hydration_stale_window",
    stale: true,
  });
});

test("historical hydration helper skips empty non-history snapshots", () => {
  const events = buildAgentUiHistoricalHydrationEvents({
    isRestoredHistoryWindow: false,
    isHistoricalTimelineReady: true,
    hiddenHistoryCount: 0,
    persistedHiddenHistoryCount: 0,
    targetCount: 0,
    hydratedHistoricalMarkdownCount: 0,
    historicalMarkdownDeferredCount: 0,
    historicalContentPartsDeferredCount: 0,
    messagesCount: 0,
    visibleMessagesCount: 0,
    renderedMessagesCount: 0,
  });

  assert.deepEqual(events, []);
});

test("historical hydration helper omits diagnostic for completed hydration", () => {
  const events = buildAgentUiHistoricalHydrationEvents({
    sessionId: "session-history-2",
    threadId: "thread-history-2",
    isRestoredHistoryWindow: true,
    isHistoricalTimelineReady: true,
    hiddenHistoryCount: 1,
    persistedHiddenHistoryCount: 1,
    targetCount: 1,
    hydratedHistoricalMarkdownCount: 1,
    historicalMarkdownDeferredCount: 0,
    historicalContentPartsDeferredCount: 0,
    messagesCount: 1,
    visibleMessagesCount: 1,
    renderedMessagesCount: 1,
  });

  assert.equal(events.length, 2);
  assert.equal(events[0].phase, "completed");
  assert.equal(events[1].type, "messages.snapshot");
  assert.equal(events[1].phase, "completed");
});
