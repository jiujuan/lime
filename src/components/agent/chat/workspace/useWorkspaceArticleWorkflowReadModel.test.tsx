import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceArticleWorkflowReadModel } from "./useWorkspaceArticleWorkflowReadModel";

const mockReadWorkflow = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/appServer", () => ({
  createAppServerClient: () => ({
    readWorkflow: mockReadWorkflow,
  }),
}));

interface HookProps {
  enabled: boolean;
  sessionId?: string | null;
}

function mountHook(initialProps: HookProps) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let currentProps = initialProps;
  let hookValue: ReturnType<typeof useWorkspaceArticleWorkflowReadModel> | null =
    null;

  function Probe() {
    hookValue = useWorkspaceArticleWorkflowReadModel(currentProps);
    return null;
  }

  const render = (nextProps?: Partial<HookProps>) => {
    currentProps = {
      ...currentProps,
      ...nextProps,
    };
    act(() => {
      root.render(<Probe />);
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

describe("useWorkspaceArticleWorkflowReadModel", () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    mockReadWorkflow.mockResolvedValue({
      result: {
        sessionId: "session-1",
        workflow: {
          workflowRuns: [
            {
              workflowRunId: "workflow-run-1",
              workflowKey: "content_article_workflow",
              status: "running",
            },
          ],
        },
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("启用且有 session 时应读取 workflow/read", async () => {
    const harness = mountHook({
      enabled: true,
      sessionId: "session-1",
    });

    try {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(mockReadWorkflow).toHaveBeenCalledWith({ sessionId: "session-1" });
      expect(harness.getValue().workflowRuns).toEqual([
        expect.objectContaining({
          workflowRunId: "workflow-run-1",
          workflowKey: "content_article_workflow",
        }),
      ]);
      expect(harness.getValue().loading).toBe(false);
    } finally {
      harness.unmount();
    }
  });

  it("读取失败时应 fail closed 并清空 read model", async () => {
    mockReadWorkflow.mockRejectedValue(new Error("bridge unavailable"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const harness = mountHook({
      enabled: true,
      sessionId: "session-1",
    });

    try {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(harness.getValue().workflowRuns).toEqual([]);
      expect(harness.getValue().loading).toBe(false);
      expect(warn).toHaveBeenCalledWith(
        "[ArticleWorkspace] 加载 Workflow Read Model 失败:",
        expect.any(Error),
      );
    } finally {
      warn.mockRestore();
      harness.unmount();
    }
  });

  it("未启用或没有 session 时不应调用 workflow/read", async () => {
    const harness = mountHook({
      enabled: false,
      sessionId: "session-1",
    });

    try {
      await act(async () => {
        await Promise.resolve();
      });

      expect(mockReadWorkflow).not.toHaveBeenCalled();
      expect(harness.getValue().workflowRuns).toEqual([]);
    } finally {
      harness.unmount();
    }
  });
});
