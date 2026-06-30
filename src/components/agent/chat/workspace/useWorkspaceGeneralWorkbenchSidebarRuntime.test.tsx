import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GeneralWorkbenchRunState,
  GeneralWorkbenchRunTerminalItem,
  GeneralWorkbenchRunTodoItem,
} from "@/lib/api/executionRun";
import { useWorkspaceGeneralWorkbenchSidebarRuntime } from "./useWorkspaceGeneralWorkbenchSidebarRuntime";

const mockExecutionRunGet = vi.hoisted(() => vi.fn());
const mockExecutionRunListGeneralWorkbenchHistory = vi.hoisted(() => vi.fn());
const mockSkillGetDetail = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/executionRun", () => ({
  executionRunGet: mockExecutionRunGet,
  executionRunListGeneralWorkbenchHistory:
    mockExecutionRunListGeneralWorkbenchHistory,
}));

vi.mock("@/lib/api/skill-execution", () => ({
  skillExecutionApi: {
    getSkillDetail: mockSkillGetDetail,
  },
}));

interface HookProps {
  isThemeWorkbench: boolean;
  sidebarVisible: boolean;
  sessionId?: string | null;
  messages: Parameters<
    typeof useWorkspaceGeneralWorkbenchSidebarRuntime
  >[0]["messages"];
  isSending: boolean;
  themeWorkbenchBackendRunState: Parameters<
    typeof useWorkspaceGeneralWorkbenchSidebarRuntime
  >[0]["themeWorkbenchBackendRunState"];
  contextActivityLogs: Parameters<
    typeof useWorkspaceGeneralWorkbenchSidebarRuntime
  >[0]["contextActivityLogs"];
  historyPageSize: number;
}

interface HookHarness {
  getValue: () => ReturnType<typeof useWorkspaceGeneralWorkbenchSidebarRuntime>;
  rerender: (props?: Partial<HookProps>) => void;
  unmount: () => void;
}

function mountHook(initialProps?: Partial<HookProps>): HookHarness {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  let hookValue: ReturnType<
    typeof useWorkspaceGeneralWorkbenchSidebarRuntime
  > | null = null;
  let currentProps: HookProps = {
    isThemeWorkbench: true,
    sidebarVisible: true,
    sessionId: null,
    messages: [],
    isSending: false,
    themeWorkbenchBackendRunState: null,
    contextActivityLogs: [],
    historyPageSize: 20,
    ...initialProps,
  };

  function TestComponent() {
    hookValue = useWorkspaceGeneralWorkbenchSidebarRuntime(currentProps);
    return null;
  }

  const render = (nextProps?: Partial<HookProps>) => {
    currentProps = {
      ...currentProps,
      ...nextProps,
    };
    act(() => {
      root.render(<TestComponent />);
    });
  };

  render();

  return {
    getValue: () => {
      if (!hookValue) {
        throw new Error("hook 尚未初始化");
      }
      return hookValue;
    },
    rerender: render,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe("useWorkspaceGeneralWorkbenchSidebarRuntime", () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    mockExecutionRunListGeneralWorkbenchHistory.mockResolvedValue({
      items: [],
      has_more: false,
      next_offset: null,
    });
    mockExecutionRunGet.mockResolvedValue(null);
    mockSkillGetDetail.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("侧栏不可见时不应预取工作台历史和 Skill 详情", async () => {
    const harness = mountHook({
      sidebarVisible: false,
      sessionId: "session-general-1",
      messages: [
        {
          id: "user-1",
          role: "user",
          content: "/content_post 写一篇新品稿",
          timestamp: new Date("2026-03-24T14:00:00.000Z"),
        },
      ],
    });

    try {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(mockExecutionRunListGeneralWorkbenchHistory).not.toHaveBeenCalled();
      expect(mockSkillGetDetail).not.toHaveBeenCalled();
      expect(harness.getValue().generalWorkbenchHistoryLoading).toBe(false);
      expect(harness.getValue().generalWorkbenchHistoryHasMore).toBe(false);
    } finally {
      harness.unmount();
    }
  });

  it("应通过 artifact protocol 将后端运行项映射为侧栏产物路径", () => {
    const queueItem = {
      run_id: "run-queue",
      title: "生成社媒初稿",
      gate_key: "write_mode",
      status: "running",
      source: "skill",
      source_ref: null,
      started_at: "2026-03-24T14:00:00.000Z",
      filePath: "content-posts/demo.md",
    } as unknown as GeneralWorkbenchRunTodoItem;
    const latestTerminal = {
      run_id: "run-terminal",
      title: "生成封面",
      gate_key: "write_mode",
      status: "success",
      source: "skill",
      source_ref: null,
      started_at: "2026-03-24T14:00:01.000Z",
      finished_at: "2026-03-24T14:00:03.000Z",
      artifactPath: "content-posts\\demo-cover.png",
    } as unknown as GeneralWorkbenchRunTerminalItem;
    const backendRunState = {
      run_state: "auto_running",
      current_gate_key: "write_mode",
      queue_items: [queueItem],
      latest_terminal: latestTerminal,
      updated_at: "2026-03-24T14:00:03.000Z",
    } as GeneralWorkbenchRunState;

    const harness = mountHook({
      themeWorkbenchBackendRunState: backendRunState,
    });

    try {
      expect(harness.getValue().generalWorkbenchActivityLogs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            runId: "run-queue",
            artifactPaths: ["content-posts/demo.md"],
          }),
          expect.objectContaining({
            runId: "run-terminal",
            artifactPaths: ["content-posts/demo-cover.png"],
          }),
        ]),
      );
    } finally {
      harness.unmount();
    }
  });
});
