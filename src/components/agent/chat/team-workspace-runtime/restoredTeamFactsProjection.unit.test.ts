import { describe, expect, it } from "vitest";
import { buildRestoredTeamFactsProjection } from "./restoredTeamFactsProjection";

describe("restoredTeamFactsProjection", () => {
  it("应从 parent thread read model 恢复 Team facts，并绑定 parent session / thread / turn", () => {
    const projection = buildRestoredTeamFactsProjection({
      currentSessionId: "session-parent",
      currentThreadId: "thread-parent",
      currentTurnId: "turn-parent",
      childSubagentSessions: [
        {
          id: "child-running",
          name: "研究员",
          created_at: 1_710_000_000,
          updated_at: 1_710_000_100,
          session_type: "sub_agent",
          runtime_status: "running",
          latest_turn_status: "running",
          queued_turn_count: 1,
          team_phase: "running",
          team_parallel_budget: 2,
          team_active_count: 1,
          team_queued_count: 1,
          provider_concurrency_group: "openai:gpt-5.2",
          provider_parallel_budget: 4,
          queue_reason: "provider_busy",
          retryable_overload: true,
          created_from_turn_id: "turn-parent",
        },
      ],
      timestamp: "2026-07-05T00:00:00.000Z",
    });

    expect(projection.fingerprint).toContain("thread-parent");
    expect(projection.events).toHaveLength(6);
    expect(
      projection.events.every(
        (event) =>
          event.sessionId === "session-parent" &&
          event.threadId === "thread-parent" &&
          event.turnId === "turn-parent",
      ),
    ).toBe(true);
    expect(projection.events[0]).toMatchObject({
      type: "agent.changed",
      sourceType: "subagent_status_changed",
      taskId: "child-running",
      agentId: "child-running",
      parentSessionId: "session-parent",
      surface: "team_roster",
      runtimeEntity: "subagent_turn",
      runtimeStatus: "running",
      latestTurnStatus: "running",
      teamPhase: "running",
      teamParallelBudget: 2,
      teamActiveCount: 1,
      teamQueuedCount: 1,
      queuedTurnCount: 1,
      providerConcurrencyGroup: "openai:gpt-5.2",
      providerParallelBudget: 4,
      queueReason: "provider_busy",
      retryableOverload: true,
    });
    expect(
      projection.events.some(
        (event) =>
          event.type === "agent.handoff" &&
          event.handoffId === "session-parent:handoff:child-running",
      ),
    ).toBe(true);
  });

  it("子线程恢复时应使用 parent context 作为 Team facts scope，而不是 child session scope", () => {
    const projection = buildRestoredTeamFactsProjection({
      currentSessionId: "child-current",
      currentSessionRuntimeStatus: "completed",
      currentSessionLatestTurnStatus: "completed",
      subagentParentContext: {
        parent_session_id: "session-parent",
        parent_session_name: "主线程",
        created_from_turn_id: "turn-parent",
        sibling_subagent_sessions: [
          {
            id: "child-sibling",
            name: "审校员",
            created_at: 1_710_000_000,
            updated_at: 1_710_000_100,
            session_type: "sub_agent",
            runtime_status: "queued",
            latest_turn_status: "queued",
            created_from_turn_id: "turn-parent",
          },
        ],
      },
      timestamp: "2026-07-05T00:00:00.000Z",
    });

    const childCurrent = projection.events.filter(
      (event) => event.taskId === "child-current",
    );
    const childSibling = projection.events.filter(
      (event) => event.taskId === "child-sibling",
    );

    expect(childCurrent.length).toBeGreaterThan(0);
    expect(childSibling.length).toBeGreaterThan(0);
    expect(
      projection.events.every(
        (event) =>
          event.sessionId === "session-parent" &&
          event.threadId === "session-parent" &&
          event.turnId === "turn-parent" &&
          event.parentSessionId === "session-parent",
      ),
    ).toBe(true);
    expect(
      projection.events.some(
        (event) =>
          event.type === "worker.notification" &&
          event.workerNotificationId === "child-current:completed",
      ),
    ).toBe(true);
  });
});
