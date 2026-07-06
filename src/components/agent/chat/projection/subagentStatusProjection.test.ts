import { describe, expect, it } from "vitest";
import { buildSubagentProjectionEvents } from "./subagentStatusProjection";

const baseContext = {
  sessionId: "session-parent",
  threadId: "thread-parent",
  runId: "run-parent",
  turnId: "turn-parent",
  timestamp: "2026-06-10T00:00:00.000Z",
};

describe("subagentStatusProjection", () => {
  it("应由 subagent owner 统一分发 running subagent status", () => {
    const events = buildSubagentProjectionEvents(
      {
        type: "subagent_status_changed",
        session_id: "child-1",
        root_session_id: "session-parent",
        parent_session_id: "session-parent",
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
            profileId: "cheeky_sassy_executor",
            packId: "com.lime.soul.cheeky-sassy-executor",
            toneVariant: "cheeky_sassy",
          },
        },
      },
      baseContext,
    );

    expect(events).toHaveLength(6);
    expect(events[0]).toMatchObject({
      type: "agent.changed",
      sourceType: "subagent_status_changed",
      sessionId: "session-parent",
      threadId: "thread-parent",
      turnId: "turn-parent",
      taskId: "child-1",
      agentId: "child-1",
      parentSessionId: "session-parent",
      owner: "agent",
      scope: "agent",
      phase: "acting",
      surface: "team_roster",
      persistence: "snapshot",
      topology: "parallel_workers",
      runtimeEntity: "subagent_turn",
      runtimeStatus: "running",
      latestTurnStatus: "queued",
      queuedTurnCount: 2,
      teamPhase: "queued",
      teamParallelBudget: 3,
      teamActiveCount: 1,
      teamQueuedCount: 2,
      providerConcurrencyGroup: "openai:gpt-5.2",
      providerParallelBudget: 4,
      queueReason: "provider_busy",
      retryableOverload: true,
      payload: {
        agentEvent: "subagent_status_changed",
        childSessionId: "child-1",
        parentSessionId: "session-parent",
        status: "running",
        collaborationFacts: {
          collaborationSurface: "team_roster",
          collaborationPhase: "acting",
          collaborationKind: "subagent_status",
          profileId: "cheeky_sassy_executor",
          packId: "com.lime.soul.cheeky-sassy-executor",
          toneVariant: "cheeky_sassy",
        },
      },
    });
    expect(events[1]).toMatchObject({
      type: "task.changed",
      owner: "task",
      scope: "task",
      phase: "acting",
      surface: "task_capsule",
      control: "stop",
      runtimeStatus: "running",
      payload: {
        taskEvent: "subagent_status_changed",
        childSessionId: "child-1",
        latestTurnId: "turn-child-1",
        latestTurnStatus: "queued",
        teamPhase: "queued",
        queueReason: "provider_busy",
      },
    });
    expect(events[2]).toMatchObject({
      type: "team.changed",
      owner: "team",
      scope: "team",
      surface: "team_roster",
      payload: {
        teamEvent: "teammate_status_changed",
        childSessionId: "child-1",
        queuedTurnCount: 2,
      },
    });
    expect(events[3]).toMatchObject({
      type: "agent.changed",
      surface: "teammate_transcript",
      control: "open_detail",
      transcriptRef: "child-1:turn-child-1",
      payload: {
        agentEvent: "teammate_transcript_ref",
        transcriptRef: "child-1:turn-child-1",
      },
    });
    expect(events[4]).toMatchObject({
      type: "agent.spawned",
      surface: "delegation_graph",
      control: "delegate",
      payload: {
        agentEvent: "subagent_active",
        spawnSource: "subagent_status_changed",
      },
    });
    expect(events[5]).toMatchObject({
      type: "agent.handoff",
      handoffId: "session-parent:handoff:child-1",
      phase: "accepted",
      surface: "handoff_lane",
      runtimeStatus: "running",
      payload: {
        handoffEvent: "specialist_handoff",
        status: "accepted",
        sourceStatus: "running",
        from: "session-parent",
        to: "child-1",
        reason: "subagent_status_changed",
        transcriptRef: "child-1:turn-child-1",
      },
    });
  });

  it("应由 subagent owner 统一分发 completed subagent status", () => {
    const events = buildSubagentProjectionEvents(
      {
        type: "subagent_status_changed",
        session_id: "child-1",
        root_session_id: "session-parent",
        parent_session_id: "session-parent",
        status: "completed",
        latest_turn_id: "turn-child-done",
        usage: {
          input_tokens: 120,
          output_tokens: 32,
          cached_input_tokens: 5,
          cache_creation_input_tokens: 7,
        },
        duration_ms: 12_345,
        tool_count: 4,
        result_ref: "artifact://worker-result-1",
      },
      baseContext,
    );

    expect(events).toHaveLength(7);
    expect(events[1]).toMatchObject({
      type: "task.changed",
      control: "close",
      runtimeStatus: "completed",
    });
    expect(events[4]).toMatchObject({
      type: "agent.completed",
      owner: "agent",
      phase: "completed",
      surface: "delegation_graph",
      runtimeStatus: "completed",
      payload: {
        agentEvent: "worker_completed",
      },
    });
    expect(events[5]).toMatchObject({
      type: "worker.notification",
      workerNotificationId: "child-1:completed",
      transcriptRef: "child-1:turn-child-done",
      workerUsage: {
        inputTokens: 120,
        outputTokens: 32,
        cachedInputTokens: 5,
        cacheCreationInputTokens: 7,
        totalTokens: 152,
      },
      owner: "agent",
      phase: "completed",
      surface: "worker_notifications",
      runtimeStatus: "completed",
      payload: {
        notificationKind: "worker_completed",
        status: "completed",
        childSessionId: "child-1",
        transcriptRef: "child-1:turn-child-done",
        durationMs: 12345,
        toolCount: 4,
        resultRef: "artifact://worker-result-1",
      },
    });
    expect(events[6]).toMatchObject({
      type: "agent.handoff",
      handoffId: "session-parent:handoff:child-1",
      phase: "reconciling",
      surface: "handoff_lane",
      persistence: "archive",
      runtimeStatus: "completed",
      payload: {
        handoffEvent: "specialist_handoff",
        status: "returned",
        sourceStatus: "completed",
        from: "session-parent",
        to: "child-1",
        resultRef: "artifact://worker-result-1",
      },
    });
  });
});
