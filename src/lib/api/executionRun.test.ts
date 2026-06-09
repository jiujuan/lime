import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import {
  executionRunGet,
  executionRunGetGeneralWorkbenchState,
  executionRunList,
  executionRunListGeneralWorkbenchHistory,
} from "./executionRun";

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

describe("executionRun API retired fail-closed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("executionRunList 默认 fail closed，不能回到旧 native 命令", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce([]);

    await expect(executionRunList(10, 5)).rejects.toThrow(
      "execution_run_list is retired until execution run read models move to App Server current methods",
    );

    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("executionRunGet 默认 fail closed，不能回到旧 native 命令", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce(null);

    await expect(executionRunGet("run-1")).rejects.toThrow(
      "execution_run_get is retired until execution run read models move to App Server current methods",
    );

    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("executionRunGetGeneralWorkbenchState 默认 fail closed，不能回到旧 native 命令", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      run_state: "idle",
      current_gate_key: "idle",
      queue_items: [],
      latest_terminal: null,
      updated_at: "2026-06-08T00:00:00.000Z",
    });

    await expect(
      executionRunGetGeneralWorkbenchState("session-1", 7),
    ).rejects.toThrow(
      "execution_run_get_general_workbench_state is retired until execution run read models move to App Server current methods",
    );

    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("executionRunListGeneralWorkbenchHistory 默认 fail closed，不能回到旧 native 命令", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      items: [],
      has_more: false,
      next_offset: null,
    });

    await expect(
      executionRunListGeneralWorkbenchHistory("session-1", 20, 40),
    ).rejects.toThrow(
      "execution_run_list_general_workbench_history is retired until execution run read models move to App Server current methods",
    );

    expect(safeInvoke).not.toHaveBeenCalled();
  });
});
