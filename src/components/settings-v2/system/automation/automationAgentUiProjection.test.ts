import { beforeEach, describe, expect, it } from "vitest";

import type {
  AutomationJobRecord,
  AutomationStatus,
} from "@/lib/api/automation";
import type { AgentRun } from "@/lib/api/executionRun";
import {
  conversationProjectionStore,
  selectAgentUiProjectionEventsByType,
} from "@/components/agent/chat/projection/conversationProjectionStore";

import {
  recordAutomationJobMutationAgentUiProjection,
  recordAutomationJobsRefreshAgentUiProjection,
  recordAutomationRunHistoryAgentUiProjection,
  recordAutomationStatusRefreshAgentUiProjection,
  resetAutomationAgentUiProjectionCacheForTest,
} from "./automationAgentUiProjection";

function createAutomationJob(
  overrides: Partial<AutomationJobRecord> = {},
): AutomationJobRecord {
  return {
    id: "job-1",
    name: "每日简报",
    description: "每天汇总趋势",
    enabled: true,
    workspace_id: "workspace-1",
    execution_mode: "intelligent",
    schedule: { kind: "every", every_secs: 3600 },
    payload: {
      kind: "agent_turn",
      prompt: "生成简报",
      session_id: "session-1",
      thread_id: "thread-1",
      web_search: false,
    },
    delivery: {
      mode: "none",
      best_effort: true,
    },
    timeout_secs: null,
    max_retries: 1,
    next_run_at: "2026-05-09T12:00:00Z",
    last_status: null,
    last_error: null,
    last_run_at: null,
    last_finished_at: null,
    running_started_at: null,
    consecutive_failures: 0,
    last_retry_count: 0,
    auto_disabled_until: null,
    last_delivery: null,
    created_at: "2026-05-09T10:00:00Z",
    updated_at: "2026-05-09T10:00:00Z",
    ...overrides,
  };
}

function createAutomationStatus(
  overrides: Partial<AutomationStatus> = {},
): AutomationStatus {
  return {
    running: true,
    last_polled_at: "2026-05-09T10:05:00Z",
    next_poll_at: "2026-05-09T10:06:00Z",
    last_job_count: 1,
    total_executions: 1,
    active_job_id: "job-1",
    active_job_name: "每日简报",
    ...overrides,
  };
}

function createAutomationRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: "run-1",
    source: "automation",
    source_ref: "job-1",
    session_id: "session-1",
    status: "success",
    started_at: "2026-05-09T10:01:00Z",
    finished_at: "2026-05-09T10:02:00Z",
    duration_ms: 60000,
    error_code: null,
    error_message: null,
    metadata: null,
    created_at: "2026-05-09T10:01:00Z",
    updated_at: "2026-05-09T10:02:00Z",
    ...overrides,
  };
}

describe("automationAgentUiProjection", () => {
  beforeEach(() => {
    conversationProjectionStore.clearAgentUiProjectionEvents();
    resetAutomationAgentUiProjectionCacheForTest();
  });

  it("应把 automation job 列表刷新写入 Agent UI background teammate projection 并去重", () => {
    const job = createAutomationJob({
      last_status: "running",
      running_started_at: "2026-05-09T10:04:00Z",
    });

    const firstEvents = recordAutomationJobsRefreshAgentUiProjection([job]);
    const duplicateEvents = recordAutomationJobsRefreshAgentUiProjection([job]);

    expect(firstEvents).toHaveLength(2);
    expect(duplicateEvents).toHaveLength(0);
    expect(
      selectAgentUiProjectionEventsByType(
        conversationProjectionStore.getSnapshot(),
        "agent.changed",
      ),
    ).toEqual([
      expect.objectContaining({
        sourceType: "automation_job_projection",
        taskId: "job-1",
        agentId: "job-1",
        agentRole: "background_teammate",
        runtimeEntity: "automation_job",
        runtimeStatus: "running",
        surface: "background_teammate",
      }),
    ]);
  });

  it("应把 scheduler status 中的 active job 刷新为 running projection", () => {
    const job = createAutomationJob();

    const events = recordAutomationStatusRefreshAgentUiProjection(
      createAutomationStatus(),
      [job],
    );

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual(
      expect.objectContaining({
        type: "task.changed",
        runtimeStatus: "running",
        phase: "acting",
      }),
    );
  });

  it("应把 automation run history 写回 run-scoped worker notification", () => {
    const job = createAutomationJob({ last_status: "success" });
    const run = createAutomationRun();

    const events = recordAutomationRunHistoryAgentUiProjection(job, [run]);

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "worker.notification",
          runId: "run-1",
          sessionId: "session-1",
          runtimeEntity: "automation_job",
          runtimeStatus: "completed",
          surface: "worker_notifications",
        }),
      ]),
    );
  });

  it("应通过统一 mutation helper 记录 deleted 终态", () => {
    const job = createAutomationJob({
      last_status: "running",
      running_started_at: "2026-05-09T10:04:00Z",
    });

    recordAutomationJobsRefreshAgentUiProjection([job]);
    const events = recordAutomationJobMutationAgentUiProjection(job, "deleted");

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "worker.notification",
          runtimeStatus: "closed",
          surface: "worker_notifications",
        }),
      ]),
    );
  });
});
