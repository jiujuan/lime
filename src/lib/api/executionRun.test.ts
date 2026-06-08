import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import {
  executionRunGet,
  executionRunGetGeneralWorkbenchState,
  executionRunList,
  executionRunListGeneralWorkbenchHistory,
  type AgentRun,
  type GeneralWorkbenchRunHistoryPage,
  type GeneralWorkbenchRunState,
} from "./executionRun";

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

const mockRun: AgentRun = {
  id: "run-1",
  source: "chat",
  source_ref: null,
  session_id: "session-1",
  status: "success",
  started_at: "2026-06-08T00:00:00.000Z",
  finished_at: "2026-06-08T00:00:01.000Z",
  duration_ms: 1000,
  error_code: null,
  error_message: null,
  metadata: null,
  created_at: "2026-06-08T00:00:00.000Z",
  updated_at: "2026-06-08T00:00:01.000Z",
};

const mockWorkbenchState: GeneralWorkbenchRunState = {
  run_state: "idle",
  current_gate_key: "idle",
  queue_items: [],
  latest_terminal: null,
  recent_terminals: [],
  updated_at: "2026-06-08T00:00:00.000Z",
};

const mockHistoryPage: GeneralWorkbenchRunHistoryPage = {
  items: [],
  has_more: false,
  next_offset: null,
};

describe("executionRun API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("executionRunList 应代理到执行历史列表命令", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce([mockRun]);

    await expect(executionRunList(10, 5)).resolves.toEqual([mockRun]);
    expect(safeInvoke).toHaveBeenCalledWith("execution_run_list", {
      limit: 10,
      offset: 5,
    });
  });

  it("executionRunList 遇到 diagnostic facade 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      diagnostic: { command: "execution_run_list", source: "electron" },
    });

    await expect(executionRunList()).rejects.toThrow(
      "execution_run_list 尚未接入真实 Execution run current 通道",
    );
  });

  it("executionRunList 收到非 run 列表形状时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce([
      {
        id: "run-1",
        status: "success",
      },
    ]);

    await expect(executionRunList()).rejects.toThrow(
      "execution_run_list did not return execution run list",
    );
  });

  it("executionRunGet 应代理到执行历史详情命令", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce(mockRun);

    await expect(executionRunGet("run-1")).resolves.toEqual(mockRun);
    expect(safeInvoke).toHaveBeenCalledWith("execution_run_get", {
      runId: "run-1",
    });
  });

  it("executionRunGet 遇到 diagnostic facade 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      diagnostic: { command: "execution_run_get", source: "electron" },
    });

    await expect(executionRunGet("run-1")).rejects.toThrow(
      "execution_run_get 尚未接入真实 Execution run current 通道",
    );
  });

  it("executionRunGet 允许真实 null，错误 envelope 应 fail closed", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        error: {
          code: "COMMAND_UNSUPPORTED",
          message: "not available",
        },
      });

    await expect(executionRunGet("missing-run")).resolves.toBeNull();
    await expect(executionRunGet("run-1")).rejects.toThrow(
      "execution_run_get did not return execution run",
    );
  });

  it("executionRunGetGeneralWorkbenchState 应发送 camelCase 与 snake_case session id", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce(mockWorkbenchState);

    await expect(
      executionRunGetGeneralWorkbenchState("session-1", 7),
    ).resolves.toEqual(mockWorkbenchState);
    expect(safeInvoke).toHaveBeenCalledWith(
      "execution_run_get_general_workbench_state",
      {
        sessionId: "session-1",
        session_id: "session-1",
        limit: 7,
      },
    );
  });

  it("executionRunGetGeneralWorkbenchState 遇到 diagnostic facade 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      diagnostic: {
        command: "execution_run_get_general_workbench_state",
        source: "electron",
      },
    });

    await expect(
      executionRunGetGeneralWorkbenchState("session-1"),
    ).rejects.toThrow(
      "execution_run_get_general_workbench_state 尚未接入真实 Execution run current 通道",
    );
  });

  it("executionRunGetGeneralWorkbenchState 收到缺字段状态时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      run_state: "idle",
      latest_terminal: null,
      updated_at: "2026-06-08T00:00:00.000Z",
    });

    await expect(
      executionRunGetGeneralWorkbenchState("session-1"),
    ).rejects.toThrow(
      "execution_run_get_general_workbench_state did not return general workbench state",
    );
  });

  it("executionRunListGeneralWorkbenchHistory 应发送分页参数", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce(mockHistoryPage);

    await expect(
      executionRunListGeneralWorkbenchHistory("session-1", 20, 40),
    ).resolves.toEqual(mockHistoryPage);
    expect(safeInvoke).toHaveBeenCalledWith(
      "execution_run_list_general_workbench_history",
      {
        sessionId: "session-1",
        session_id: "session-1",
        limit: 20,
        offset: 40,
      },
    );
  });

  it("executionRunListGeneralWorkbenchHistory 遇到 diagnostic facade 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      diagnostic: {
        command: "execution_run_list_general_workbench_history",
        source: "electron",
      },
    });

    await expect(
      executionRunListGeneralWorkbenchHistory("session-1"),
    ).rejects.toThrow(
      "execution_run_list_general_workbench_history 尚未接入真实 Execution run current 通道",
    );
  });

  it("executionRunListGeneralWorkbenchHistory 收到错误分页形状时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      items: [
        {
          run_id: "run-1",
          title: "执行中",
          status: "success",
          source: "chat",
          source_ref: null,
          started_at: "2026-06-08T00:00:00.000Z",
        },
      ],
      has_more: false,
      next_offset: null,
    });

    await expect(
      executionRunListGeneralWorkbenchHistory("session-1"),
    ).rejects.toThrow(
      "execution_run_list_general_workbench_history did not return general workbench history page",
    );
  });
});
