import test from "node:test";
import assert from "node:assert/strict";

import { buildAgentUiSubagentStatusChangedEvents } from "../dist/index.js";

test("subagent status helper builds running team and handoff events", () => {
  const events = buildAgentUiSubagentStatusChangedEvents(
    {
      sourceType: "subagent_status_changed",
      session_id: "child-1",
      root_session_id: "session-1",
      parent_session_id: "session-1",
      status: "running",
      latest_turn_id: "turn-child-1",
      latest_turn_status: "queued",
      queued_turn_count: 2,
      team_phase: "queued",
      team_parallel_budget: 3,
      team_active_count: 1,
      team_queued_count: 2,
      provider_concurrency_group: "openai:gpt-5.2",
      provider_parallel_budget: 4,
      queue_reason: "provider_busy",
      retryable_overload: true,
      metadata: {
        soul_lifecycle: {
          toneVariant: "cool_confident",
          profileId: "cool_confident_operator",
          packId: "com.lime.soul.cool-confident-operator",
        },
      },
    },
    {
      sessionId: "session-1",
      threadId: "thread-1",
      timestamp: "2026-06-10T00:00:00.000Z",
    },
  );

  assert.equal(events.length, 6);
  assert.deepEqual(
    events.map((event) => event.type),
    [
      "agent.changed",
      "task.changed",
      "team.changed",
      "agent.changed",
      "agent.spawned",
      "agent.handoff",
    ],
  );
  assert.deepEqual(
    {
      type: events[0].type,
      sourceType: events[0].sourceType,
      sessionId: events[0].sessionId,
      taskId: events[0].taskId,
      agentId: events[0].agentId,
      parentSessionId: events[0].parentSessionId,
      owner: events[0].owner,
      scope: events[0].scope,
      phase: events[0].phase,
      surface: events[0].surface,
      runtimeEntity: events[0].runtimeEntity,
      runtimeStatus: events[0].runtimeStatus,
      latestTurnStatus: events[0].latestTurnStatus,
      teamPhase: events[0].teamPhase,
      teamParallelBudget: events[0].teamParallelBudget,
      teamActiveCount: events[0].teamActiveCount,
      teamQueuedCount: events[0].teamQueuedCount,
      queuedTurnCount: events[0].queuedTurnCount,
      providerConcurrencyGroup: events[0].providerConcurrencyGroup,
      providerParallelBudget: events[0].providerParallelBudget,
      queueReason: events[0].queueReason,
      retryableOverload: events[0].retryableOverload,
    },
    {
      type: "agent.changed",
      sourceType: "subagent_status_changed",
      sessionId: "session-1",
      taskId: "child-1",
      agentId: "child-1",
      parentSessionId: "session-1",
      owner: "agent",
      scope: "agent",
      phase: "acting",
      surface: "team_roster",
      runtimeEntity: "subagent_turn",
      runtimeStatus: "running",
      latestTurnStatus: "queued",
      teamPhase: "queued",
      teamParallelBudget: 3,
      teamActiveCount: 1,
      teamQueuedCount: 2,
      queuedTurnCount: 2,
      providerConcurrencyGroup: "openai:gpt-5.2",
      providerParallelBudget: 4,
      queueReason: "provider_busy",
      retryableOverload: true,
    },
  );
  assert.deepEqual(events[0].payload?.collaborationFacts, {
    source: "projection_facts",
    surface: "collaboration",
    collaborationSurface: "team_roster",
    collaborationPhase: "acting",
    collaborationKind: "subagent_status",
    sourceType: "subagent_status_changed",
    status: "running",
    runtimeEntity: "subagent_turn",
    runtimeStatus: "running",
    latestTurnStatus: "queued",
    taskId: "child-1",
    agentId: "child-1",
    parentSessionId: "session-1",
    transcriptRef: "child-1:turn-child-1",
    styleLevel: "L1",
    riskLevel: "normal",
    toneVariant: "cool_confident",
    profileId: "cool_confident_operator",
    packId: "com.lime.soul.cool-confident-operator",
  });
  assert.equal(events[1].type, "task.changed");
  assert.equal(events[1].control, "stop");
  assert.equal(events[1].payload?.collaborationSurface, "task_capsule");
  assert.equal(
    events[1].payload?.collaborationFacts?.collaborationKind,
    "subagent_task",
  );
  assert.equal(events[2].topology, "parallel_workers");
  assert.equal(events[3].surface, "teammate_transcript");
  assert.equal(events[3].transcriptRef, "child-1:turn-child-1");
  assert.equal(events[4].type, "agent.spawned");
  assert.equal(events[4].control, "delegate");
  assert.equal(events[5].type, "agent.handoff");
  assert.equal(events[5].handoffId, "session-1:handoff:child-1");
  assert.equal(events[5].phase, "accepted");
  assert.equal(events[5].topology, "specialist_handoff");
  assert.equal(events[5].payload?.handoffEvent, "specialist_handoff");
  assert.equal(events[5].payload?.status, "accepted");
  assert.equal(events[5].payload?.sourceStatus, "running");
  assert.equal(events[5].payload?.from, "session-1");
  assert.equal(events[5].payload?.to, "child-1");
  assert.equal(events[5].payload?.reason, "subagent_status_changed");
  assert.equal(
    events[5].payload?.resumeTarget,
    "agent-runtime://session/child-1",
  );
  assert.equal(events[5].payload?.contextBoundary, "subagent_session");
  assert.equal(events[5].payload?.transcriptRef, "child-1:turn-child-1");
  assert.equal(events[5].payload?.latestTurnId, "turn-child-1");
  assert.deepEqual(events[5].payload?.collaborationFacts, {
    source: "projection_facts",
    surface: "collaboration",
    collaborationSurface: "handoff_lane",
    collaborationPhase: "accepted",
    collaborationKind: "specialist_handoff",
    sourceType: "subagent_status_changed",
    status: "accepted",
    runtimeEntity: "subagent_turn",
    runtimeStatus: "running",
    latestTurnStatus: "queued",
    taskId: "child-1",
    agentId: "child-1",
    parentSessionId: "session-1",
    transcriptRef: "child-1:turn-child-1",
    handoffId: "session-1:handoff:child-1",
    styleLevel: "L1",
    riskLevel: "normal",
    toneVariant: "cool_confident",
    profileId: "cool_confident_operator",
    packId: "com.lime.soul.cool-confident-operator",
  });
});

test("subagent status helper builds completed worker notification events", () => {
  const events = buildAgentUiSubagentStatusChangedEvents({
    sourceType: "subagent_status_changed",
    session_id: "child-1",
    root_session_id: "session-1",
    parent_session_id: "session-1",
    status: "completed",
    latest_turn_id: "turn-child-done",
    usage: {
      input_tokens: 120,
      output_tokens: 32,
      cached_input_tokens: 5,
      cache_creation_input_tokens: 7,
    },
    duration_ms: 12345,
    tool_count: 4,
    result_ref: "artifact://worker-result-1",
  });

  assert.equal(events.length, 7);
  assert.equal(events[4].type, "agent.completed");
  assert.equal(events[4].phase, "completed");
  assert.equal(events[4].surface, "delegation_graph");
  assert.equal(events[5].type, "worker.notification");
  assert.equal(events[5].workerNotificationId, "child-1:completed");
  assert.equal(events[5].transcriptRef, "child-1:turn-child-done");
  assert.deepEqual(events[5].workerUsage, {
    inputTokens: 120,
    outputTokens: 32,
    cachedInputTokens: 5,
    cacheCreationInputTokens: 7,
    totalTokens: 152,
  });
  assert.equal(events[5].payload?.notificationKind, "worker_completed");
  assert.equal(events[5].payload?.status, "completed");
  assert.equal(events[5].payload?.childSessionId, "child-1");
  assert.equal(events[5].payload?.parentSessionId, "session-1");
  assert.equal(events[5].payload?.latestTurnId, "turn-child-done");
  assert.equal(events[5].payload?.transcriptRef, "child-1:turn-child-done");
  assert.deepEqual(events[5].payload?.workerUsage, {
    inputTokens: 120,
    outputTokens: 32,
    cachedInputTokens: 5,
    cacheCreationInputTokens: 7,
    totalTokens: 152,
  });
  assert.equal(events[5].payload?.durationMs, 12345);
  assert.equal(events[5].payload?.toolCount, 4);
  assert.equal(events[5].payload?.resultRef, "artifact://worker-result-1");
  assert.deepEqual(events[5].payload?.collaborationFacts, {
    source: "projection_facts",
    surface: "collaboration",
    collaborationSurface: "worker_notifications",
    collaborationPhase: "completed",
    collaborationKind: "worker_completed",
    sourceType: "subagent_status_changed",
    status: "completed",
    runtimeEntity: "subagent_turn",
    runtimeStatus: "completed",
    taskId: "child-1",
    agentId: "child-1",
    parentSessionId: "session-1",
    transcriptRef: "child-1:turn-child-done",
    styleLevel: "L1",
    riskLevel: "normal",
  });
  assert.equal(events[6].type, "agent.handoff");
  assert.equal(events[6].phase, "reconciling");
  assert.equal(events[6].persistence, "archive");
  assert.equal(events[6].payload?.status, "returned");
  assert.equal(events[6].payload?.resultRef, "artifact://worker-result-1");
});

test("subagent status helper skips handoff without parent session", () => {
  const events = buildAgentUiSubagentStatusChangedEvents({
    sourceType: "subagent_status_changed",
    session_id: "child-1",
    root_session_id: "session-1",
    status: "running",
  });

  assert.equal(events.some((event) => event.type === "agent.handoff"), false);
  assert.equal(events.some((event) => event.type === "agent.spawned"), true);
});
