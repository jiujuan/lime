import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import {
  createAutomationJob,
  getAutomationJobs,
  getAutomationSchedulerConfig,
  getAutomationStatus,
} from "./automation";

const appServerRequestMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/appServer", () => ({
  AppServerClient: vi.fn(() => ({
    request: appServerRequestMock,
  })),
}));

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
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
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("自动化任务列表缺少必需 result 时不应回退 legacy", async () => {
    appServerRequestMock.mockResolvedValueOnce({
      result: {},
    });

    await expect(getAutomationJobs()).rejects.toThrow(
      "App Server automationJob/list did not return jobs",
    );

    expect(safeInvoke).not.toHaveBeenCalledWith("get_automation_jobs");
  });

  it("自动化 scheduler/status/write 仍保持 Desktop compat 命令", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({
        enabled: true,
        poll_interval_secs: 60,
        enable_history: true,
      })
      .mockResolvedValueOnce({
        running: false,
        last_polled_at: null,
        next_poll_at: null,
        last_job_count: 0,
        total_executions: 0,
        active_job_id: null,
        active_job_name: null,
      })
      .mockResolvedValueOnce({
        id: "job-1",
        name: "每日简报",
      });

    await expect(getAutomationSchedulerConfig()).resolves.toEqual(
      expect.objectContaining({ enabled: true }),
    );
    await expect(getAutomationStatus()).resolves.toEqual(
      expect.objectContaining({ running: false }),
    );
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
    ).resolves.toEqual(expect.objectContaining({ id: "job-1" }));

    expect(safeInvoke).toHaveBeenNthCalledWith(
      1,
      "get_automation_scheduler_config",
    );
    expect(safeInvoke).toHaveBeenNthCalledWith(2, "get_automation_status");
    expect(safeInvoke).toHaveBeenNthCalledWith(3, "create_automation_job", {
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
    expect(appServerRequestMock).not.toHaveBeenCalled();
  });
});
