import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAutomationJob,
  deleteAutomationJob,
  getAutomationHealth,
  getAutomationJob,
  getAutomationJobs,
  getAutomationRunHistory,
  getAutomationSchedulerConfig,
  getAutomationStatus,
  previewAutomationSchedule,
  runAutomationJobNow,
  updateAutomationJob,
  updateAutomationSchedulerConfig,
  validateAutomationSchedule,
} from "./automation";

const appServerRequestMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/appServer", () => ({
  AppServerClient: vi.fn(() => ({
    request: appServerRequestMock,
  })),
}));

describe("automation API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appServerRequestMock.mockReset();
  });

  it("自动化任务列表应通过 App Server automationJob/list 读取", async () => {
    appServerRequestMock.mockResolvedValueOnce({
      result: {
        jobs: [
          {
            id: "job-1",
            name: "每日简报",
            enabled: true,
          },
        ],
      },
    });

    await expect(getAutomationJobs()).resolves.toEqual([
      expect.objectContaining({
        id: "job-1",
        name: "每日简报",
      }),
    ]);

    expect(appServerRequestMock).toHaveBeenCalledWith("automationJob/list", {});
  });

  it("自动化任务列表缺少必需 result 时不应回退 legacy", async () => {
    appServerRequestMock.mockResolvedValueOnce({
      result: {},
    });

    await expect(getAutomationJobs()).rejects.toThrow(
      "App Server automationJob/list did not return jobs",
    );

    expect(appServerRequestMock).toHaveBeenCalledWith("automationJob/list", {});
  });

  it("自动化 scheduler/status/write 应全部走 App Server current 方法", async () => {
    appServerRequestMock
      .mockResolvedValueOnce({
        result: {
          config: {
            enabled: true,
            poll_interval_secs: 60,
            enable_history: true,
          },
        },
      })
      .mockResolvedValueOnce({
        result: {
          config: {
            enabled: false,
            poll_interval_secs: 120,
            enable_history: true,
          },
        },
      })
      .mockResolvedValueOnce({
        result: {
          status: {
            running: false,
            last_polled_at: null,
            next_poll_at: null,
            last_job_count: 0,
            total_executions: 0,
            active_job_id: null,
            active_job_name: null,
          },
        },
      })
      .mockResolvedValueOnce({
        result: {
          job: null,
        },
      })
      .mockResolvedValueOnce({
        result: {
          job: {
            id: "job-1",
            name: "每日简报",
          },
        },
      })
      .mockResolvedValueOnce({
        result: {
          job: {
            id: "job-1",
            name: "每日简报 v2",
          },
        },
      })
      .mockResolvedValueOnce({
        result: {
          deleted: true,
        },
      })
      .mockResolvedValueOnce({
        result: {
          result: {
            job_count: 1,
            success_count: 1,
            failed_count: 0,
            timeout_count: 0,
          },
        },
      })
      .mockResolvedValueOnce({
        result: {
          health: {
            total_jobs: 1,
            enabled_jobs: 1,
            pending_jobs: 0,
            running_jobs: 0,
            failed_jobs: 0,
            cooldown_jobs: 0,
            stale_running_jobs: 0,
            failed_last_24h: 0,
            failure_trend_24h: [],
            alerts: [],
            risky_jobs: [],
            generated_at: "2026-06-08T00:00:00Z",
          },
        },
      })
      .mockResolvedValueOnce({
        result: {
          runs: [
            {
              id: "run-1",
              source: "automation",
              source_ref: "job-1",
              session_id: null,
              status: "success",
              started_at: "2026-06-08T00:00:00Z",
              finished_at: null,
              duration_ms: null,
              error_code: null,
              error_message: null,
              metadata: null,
              created_at: "2026-06-08T00:00:00Z",
              updated_at: "2026-06-08T00:00:00Z",
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        result: {
          nextRunAt: "2026-06-08T01:00:00Z",
        },
      })
      .mockResolvedValueOnce({
        result: {
          valid: true,
        },
      });

    await expect(getAutomationSchedulerConfig()).resolves.toEqual(
      expect.objectContaining({ enabled: true }),
    );
    await expect(
      updateAutomationSchedulerConfig({
        enabled: false,
        poll_interval_secs: 120,
        enable_history: true,
      }),
    ).resolves.toBeUndefined();
    await expect(getAutomationStatus()).resolves.toEqual(
      expect.objectContaining({ running: false }),
    );
    await expect(getAutomationJob("job-1")).resolves.toBeNull();
    await expect(
      createAutomationJob({
        name: "每日简报",
        workspace_id: "workspace-1",
        schedule: { kind: "every", every_secs: 3600 },
        payload: {
          kind: "agent_turn",
          prompt: "总结今天重点",
          web_search: false,
        },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: "job-1",
        name: "每日简报",
      }),
    );
    await expect(
      updateAutomationJob("job-1", {
        name: "每日简报 v2",
      }),
    ).resolves.toEqual(expect.objectContaining({ name: "每日简报 v2" }));
    await expect(deleteAutomationJob("job-1")).resolves.toBe(true);
    await expect(runAutomationJobNow("job-1")).resolves.toEqual(
      expect.objectContaining({ success_count: 1 }),
    );
    await expect(getAutomationHealth({ top_limit: 3 })).resolves.toEqual(
      expect.objectContaining({ total_jobs: 1 }),
    );
    await expect(getAutomationRunHistory("job-1", 5)).resolves.toHaveLength(1);
    await expect(
      previewAutomationSchedule({ kind: "every", every_secs: 3600 }),
    ).resolves.toBe("2026-06-08T01:00:00Z");
    await expect(
      validateAutomationSchedule({ kind: "every", every_secs: 3600 }),
    ).resolves.toEqual({ valid: true, error: null });

    expect(appServerRequestMock).toHaveBeenNthCalledWith(
      1,
      "automationScheduler/config/read",
      {},
    );
    expect(appServerRequestMock).toHaveBeenNthCalledWith(
      2,
      "automationScheduler/config/update",
      {
        config: {
          enabled: false,
          poll_interval_secs: 120,
          enable_history: true,
        },
      },
    );
    expect(appServerRequestMock).toHaveBeenNthCalledWith(
      3,
      "automationScheduler/status",
      {},
    );
    expect(appServerRequestMock).toHaveBeenNthCalledWith(4, "automationJob/read", {
      id: "job-1",
    });
    expect(appServerRequestMock).toHaveBeenNthCalledWith(
      5,
      "automationJob/create",
      {
        request: {
          name: "每日简报",
          workspace_id: "workspace-1",
          schedule: { kind: "every", every_secs: 3600 },
          payload: {
            kind: "agent_turn",
            prompt: "总结今天重点",
            web_search: false,
          },
        },
      },
    );
    expect(appServerRequestMock).toHaveBeenNthCalledWith(
      6,
      "automationJob/update",
      {
        id: "job-1",
        request: {
          name: "每日简报 v2",
        },
      },
    );
    expect(appServerRequestMock).toHaveBeenNthCalledWith(
      7,
      "automationJob/delete",
      { id: "job-1" },
    );
    expect(appServerRequestMock).toHaveBeenNthCalledWith(
      8,
      "automationJob/runNow",
      { id: "job-1" },
    );
    expect(appServerRequestMock).toHaveBeenNthCalledWith(
      9,
      "automationJob/health",
      { query: { top_limit: 3 } },
    );
    expect(appServerRequestMock).toHaveBeenNthCalledWith(
      10,
      "automationJob/runHistory",
      { id: "job-1", limit: 5 },
    );
    expect(appServerRequestMock).toHaveBeenNthCalledWith(
      11,
      "automationSchedule/preview",
      { schedule: { kind: "every", every_secs: 3600 } },
    );
    expect(appServerRequestMock).toHaveBeenNthCalledWith(
      12,
      "automationSchedule/validate",
      { schedule: { kind: "every", every_secs: 3600 } },
    );
  });

  it("自动化任务创建缺少 App Server job 时不应回退 legacy", async () => {
    appServerRequestMock.mockResolvedValueOnce({
      result: {},
    });

    await expect(
      createAutomationJob({
        name: "每日简报",
        workspace_id: "workspace-1",
        schedule: { kind: "every", every_secs: 3600 },
        payload: {
          kind: "agent_turn",
          prompt: "总结今天重点",
          web_search: false,
        },
      }),
    ).rejects.toThrow("App Server automationJob/create did not return job");

    expect(appServerRequestMock).toHaveBeenCalledWith("automationJob/create", {
      request: {
        name: "每日简报",
        workspace_id: "workspace-1",
        schedule: { kind: "every", every_secs: 3600 },
        payload: {
          kind: "agent_turn",
          prompt: "总结今天重点",
          web_search: false,
        },
      },
    });
  });
});
