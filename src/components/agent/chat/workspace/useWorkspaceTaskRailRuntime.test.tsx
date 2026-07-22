import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildWorkspaceTaskRailRuntimeContext,
  resolveWorkspaceTaskRailRootPath,
  useWorkspaceTaskRailRuntime,
} from "./useWorkspaceTaskRailRuntime";

type HookProps = Parameters<typeof useWorkspaceTaskRailRuntime>[0];

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

function createBaseProps(overrides: Partial<HookProps> = {}): HookProps {
  return {
    workflowSteps: [
      {
        id: "write",
        title: "整理输出",
        status: "active",
      },
    ],
    messages: [
      {
        id: "message-1",
        role: "assistant",
        content: "已完成整理",
        timestamp: new Date("2026-06-16T10:00:00.000Z"),
      },
    ],
    providerType: "cloud",
    model: "reasoner-pro",
    accessMode: "current",
    reasoningEffort: "medium",
    projectRootPath: "/tmp/project-1",
    canvasWorkbenchRootPath: "/tmp/session-root",
    onOpenWorkspacePath: vi.fn(),
    ...overrides,
  };
}

function renderHook(initialProps?: Partial<HookProps>) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let latestValue: ReturnType<typeof useWorkspaceTaskRailRuntime> | null = null;
  const defaultProps = createBaseProps(initialProps);

  function Probe(props: HookProps) {
    latestValue = useWorkspaceTaskRailRuntime(props);
    return null;
  }

  const render = async (nextProps?: Partial<HookProps>) => {
    await act(async () => {
      root.render(<Probe {...defaultProps} {...nextProps} />);
      await Promise.resolve();
    });
  };

  mountedRoots.push({ root, container });

  return {
    render,
    getValue: () => {
      if (!latestValue) {
        throw new Error("hook 尚未初始化");
      }
      return latestValue;
    },
  };
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  while (mountedRoots.length > 0) {
    const mounted = mountedRoots.pop();
    if (!mounted) {
      break;
    }
    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
});

describe("resolveWorkspaceTaskRailRootPath", () => {
  it("应优先使用项目根目录，其次使用 canvas 根目录", () => {
    expect(
      resolveWorkspaceTaskRailRootPath({
        projectRootPath: "  /tmp/project-1  ",
        canvasWorkbenchRootPath: "/tmp/session-root",
      }),
    ).toBe("/tmp/project-1");

    expect(
      resolveWorkspaceTaskRailRootPath({
        projectRootPath: "  ",
        canvasWorkbenchRootPath: "/tmp/session-root",
      }),
    ).toBe("/tmp/session-root");

    expect(
      resolveWorkspaceTaskRailRootPath({
        projectRootPath: null,
        canvasWorkbenchRootPath: undefined,
      }),
    ).toBeNull();
  });
});

describe("buildWorkspaceTaskRailRuntimeContext", () => {
  it("应从 read model 和 canonical 子任务派生任务轨道运行事实", () => {
    const context = buildWorkspaceTaskRailRuntimeContext({
      providerType: "cloud",
      model: "reasoner-pro",
      accessMode: "current",
      reasoningEffort: "medium",
      workspaceRootPath: "/tmp/project-1",
      threadGoal: {
        createdAt: 1,
        objective: "完成任务区域运行事实摘要",
        status: "active",
        threadId: "thread-1",
        timeUsedSeconds: 0,
        tokensUsed: 0,
        updatedAt: 1,
      },
      threadRead: {
        thread_id: "thread-1",
        change_summary: {
          changed_file_count: 2,
          changed_files: ["src/A.ts", "src/B.ts"],
          patch_count: 3,
          applied_patch_count: 1,
          failed_patch_count: 1,
          running_patch_count: 1,
        },
        context_summary: {
          sources: ["https://docs.example.com/agent-workspace"],
          retrieval_refs: [
            {
              source_id: "retrieval-1",
              kind: "file",
              title: "run-observability.md",
            },
          ],
        },
        evidence_summary: {
          evidence_refs: ["evidence/run-control.json"],
        },
      } as any,
      threadItems: [
        {
          id: "web-search",
          type: "web_search",
          thread_id: "thread-1",
          turn_id: "turn-1",
          sequence: 1,
          status: "completed",
          query: "agent workspace evaluation",
          started_at: "2026-06-16T10:00:00.000Z",
          completed_at: "2026-06-16T10:00:01.000Z",
          updated_at: "2026-06-16T10:00:01.000Z",
        },
      ],
      canonicalChildren: [
        {
          name: "实现",
          parentThreadId: "thread-parent",
          sessionId: "child-running",
          status: "running",
          threadId: "thread-child-running",
          updatedAtMs: 2,
        },
        {
          name: "验证",
          parentThreadId: "thread-parent",
          sessionId: "child-done",
          status: "completed",
          threadId: "thread-child-done",
          updatedAtMs: 2,
        },
        {
          name: "修复",
          parentThreadId: "thread-parent",
          sessionId: "child-failed",
          status: "errored",
          threadId: "thread-child-failed",
          updatedAtMs: 2,
        },
        {
          name: "中断恢复",
          parentThreadId: "thread-parent",
          sessionId: "child-interrupted",
          status: "interrupted",
          threadId: "thread-child-interrupted",
          updatedAtMs: 2,
        },
      ],
    });

    expect(context).toMatchObject({
      providerType: "cloud",
      model: "reasoner-pro",
      accessMode: "current",
      reasoningEffort: "medium",
      workspacePath: "/tmp/project-1",
      objectiveText: "完成任务区域运行事实摘要",
      changedFileCount: 2,
      changedFiles: ["src/A.ts", "src/B.ts"],
      patchCount: 3,
      appliedPatchCount: 1,
      failedPatchCount: 1,
      runningPatchCount: 1,
      sourceCount: 4,
      sourceLabels: [
        "docs.example.com",
        "run-observability.md",
        "run-control.json",
        "agent workspace evaluation",
      ],
      sourceEvidenceCount: 1,
      sourceConsistencyStatus: "linked",
      subtaskTotalCount: 4,
      subtaskActiveCount: 1,
      subtaskCompletedCount: 1,
      subtaskFailedCount: 2,
    });
  });
});

describe("useWorkspaceTaskRailRuntime", () => {
  it("应透传轻量运行事实但不预构建任务轨道上下文", async () => {
    const pendingActions = [
      {
        requestId: "approval-write",
        actionType: "tool_confirmation" as const,
        toolName: "write_file",
      },
    ];
    const onRespondToAction = vi.fn();
    const { render, getValue } = renderHook({
      pendingActions,
      onRespondToAction,
    });

    await render();

    expect(getValue().workflowSteps).toHaveLength(1);
    expect(getValue().messages).toHaveLength(1);
    expect(getValue().pendingActions).toBe(pendingActions);
    expect(getValue().onRespondToAction).toBe(onRespondToAction);
    expect(getValue().providerType).toBe("cloud");
    expect(getValue().model).toBe("reasoner-pro");
    expect(getValue().accessMode).toBe("current");
    expect(getValue().reasoningEffort).toBe("medium");
    expect(getValue().workspaceRootPath).toBe("/tmp/project-1");
    expect(
      (getValue() as unknown as { context?: unknown }).context,
    ).toBeUndefined();
  });

  it("应透传 read model 与子任务摘要事实", async () => {
    const threadRead = {
      thread_id: "thread-1",
      change_summary: {
        changed_file_count: 1,
        changed_files: ["src/App.tsx"],
        patch_count: 1,
      },
      context_summary: {
        sources: ["https://docs.example.com/task-rail"],
      },
    } as any;
    const threadGoal = {
      createdAt: 1,
      objective: "完成顶部任务轨道",
      status: "active" as const,
      threadId: "thread-1",
      timeUsedSeconds: 0,
      tokensUsed: 0,
      updatedAt: 1,
    };
    const threadItems = [
      {
        id: "file-source",
        type: "file_artifact" as const,
        thread_id: "thread-1",
        turn_id: "turn-1",
        sequence: 1,
        status: "completed" as const,
        path: "docs/source.md",
        source: "write_file",
        started_at: "2026-06-16T10:00:00.000Z",
        completed_at: "2026-06-16T10:00:01.000Z",
        updated_at: "2026-06-16T10:00:01.000Z",
      },
    ];
    const canonicalChildren = [
      {
        name: "实现",
        parentThreadId: "thread-parent",
        sessionId: "child-running",
        status: "pendingInit" as const,
        threadId: "thread-child-running",
        updatedAtMs: 2,
      },
    ];
    const { render, getValue } = renderHook({
      threadGoal,
      threadRead,
      threadItems,
      canonicalChildren,
    });

    await render();

    expect(getValue().threadRead).toBe(threadRead);
    expect(getValue().threadGoal).toBe(threadGoal);
    expect(getValue().threadItems).toBe(threadItems);
    expect(getValue().canonicalChildren).toBe(canonicalChildren);
    expect(
      (getValue() as unknown as { context?: unknown }).context,
    ).toBeUndefined();
  });

  it("应透传 todo items 供运行控制区域恢复历史计划", async () => {
    const todoItems = [
      {
        content: "恢复历史计划",
        status: "in_progress" as const,
      },
      {
        content: "补充回归验证",
        status: "pending" as const,
      },
    ];
    const { render, getValue } = renderHook({
      workflowSteps: [],
      todoItems,
    });

    await render();

    expect(getValue().workflowSteps).toEqual([]);
    expect(getValue().todoItems).toBe(todoItems);
  });

  it("应透传导入会话运行态供任务中心显示完整记录入口", async () => {
    const executionRuntime = {
      session_id: "session-imported",
      source_client: "codex",
      imported_thread_settings: {
        cwd: "/tmp/project-1",
      },
      source: "session" as const,
    };
    const { render, getValue } = renderHook({
      sessionId: "session-imported",
      executionRuntime,
    });

    await render();

    expect(getValue().executionRuntime).toBe(executionRuntime);
  });

  it("打开输出时应先按工作区根目录解析相对路径", async () => {
    const onOpenWorkspacePath = vi.fn();
    const { render, getValue } = renderHook({
      onOpenWorkspacePath,
    });

    await render();

    getValue().onOpenOutput("docs/result.md");
    expect(onOpenWorkspacePath).toHaveBeenCalledWith(
      "/tmp/project-1/docs/result.md",
    );

    getValue().onOpenOutput("/tmp/absolute.md");
    expect(onOpenWorkspacePath).toHaveBeenLastCalledWith("/tmp/absolute.md");
  });
});
