import { afterEach, describe, expect, it } from "vitest";

import {
  clearAgentUiProjectionEvents,
  conversationProjectionStore,
  selectAgentUiProjectionEvents,
  selectAgentUiProjectionEventsBySurface,
} from "./conversationProjectionStore";
import { recordAutomationJobsAgentUiProjection } from "./automationJobAgentUiProjection";

describe("automationJobAgentUiProjection", () => {
  afterEach(() => {
    clearAgentUiProjectionEvents();
  });

  it("应把 automation job 列表刷新持续投影为 background teammate", () => {
    const events = recordAutomationJobsAgentUiProjection(
      [
        {
          id: "job-1",
          name: "日报",
          enabled: true,
          workspace_id: "workspace-1",
          execution_mode: "intelligent",
          schedule: { kind: "cron", expr: "0 9 * * *" },
          payload: {
            kind: "agent_turn",
            prompt: "生成日报",
            web_search: false,
          },
          delivery: { mode: "none", best_effort: true },
          last_status: "running",
          consecutive_failures: 0,
          last_retry_count: 0,
          max_retries: 1,
          created_at: "2026-05-09T00:00:00.000Z",
          updated_at: "2026-05-09T00:01:00.000Z",
        },
        {
          id: "job-2",
          name: "周报",
          enabled: true,
          workspace_id: "workspace-1",
          execution_mode: "skill",
          schedule: { kind: "every", every_secs: 86_400 },
          payload: {
            kind: "agent_turn",
            prompt: "生成周报",
            web_search: false,
          },
          delivery: { mode: "none", best_effort: true },
          last_status: "success",
          consecutive_failures: 0,
          last_retry_count: 0,
          max_retries: 1,
          created_at: "2026-05-09T00:00:00.000Z",
          updated_at: "2026-05-09T00:02:00.000Z",
        },
      ],
      "loaded",
      { sequence: 20 },
    );

    expect(events).toHaveLength(5);
    expect(events[0]).toMatchObject({
      type: "task.changed",
      sourceType: "automation_job_projection",
      sequence: 20,
      taskId: "job-1",
      runtimeEntity: "automation_job",
      runtimeStatus: "running",
      surface: "task_capsule",
    });
    expect(events[1]).toMatchObject({
      type: "agent.changed",
      sequence: 21,
      agentId: "job-1",
      topology: "background_teammate",
      surface: "background_teammate",
    });
    expect(events[2]).toMatchObject({
      type: "task.changed",
      sequence: 22,
      taskId: "job-2",
      runtimeStatus: "completed",
    });
    expect(events[4]).toMatchObject({
      type: "worker.notification",
      sequence: 24,
      workerNotificationId: "job-2:completed",
      surface: "worker_notifications",
    });

    const snapshot = conversationProjectionStore.getSnapshot();
    expect(selectAgentUiProjectionEvents(snapshot)).toHaveLength(5);
    expect(
      selectAgentUiProjectionEventsBySurface(snapshot, "background_teammate"),
    ).toHaveLength(2);
  });
});
