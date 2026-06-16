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
  let latestValue: ReturnType<typeof useWorkspaceTaskRailRuntime> | null =
    null;
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
  it("应从 read model 和子任务会话派生任务轨道运行事实", () => {
    const context = buildWorkspaceTaskRailRuntimeContext({
      providerType: "cloud",
      model: "reasoner-pro",
      accessMode: "current",
      reasoningEffort: "medium",
      workspaceRootPath: "/tmp/project-1",
      threadRead: {
        thread_id: "thread-1",
        managed_objective: {
          objective_id: "objective-1",
          owner_kind: "agent_session",
          owner_id: "session-1",
          objective_text: "完成任务区域运行事实摘要",
          success_criteria: [],
          status: "active",
          last_artifact_refs: [],
          created_at: "2026-06-16T10:00:00.000Z",
          updated_at: "2026-06-16T10:00:00.000Z",
        },
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
      childSubagentSessions: [
        {
          id: "child-running",
          name: "实现",
          created_at: 1,
          updated_at: 2,
          session_type: "subagent",
          runtime_status: "running",
        },
        {
          id: "child-done",
          name: "验证",
          created_at: 1,
          updated_at: 2,
          session_type: "subagent",
          runtime_status: "completed",
        },
        {
          id: "child-failed",
          name: "修复",
          created_at: 1,
          updated_at: 2,
          session_type: "subagent",
          runtime_status: "failed",
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
      subtaskTotalCount: 3,
      subtaskActiveCount: 1,
      subtaskCompletedCount: 1,
      subtaskFailedCount: 1,
    });
  });
});

describe("useWorkspaceTaskRailRuntime", () => {
  it("应生成任务轨道上下文并透传运行事实", async () => {
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
    expect(getValue().context).toEqual({
      providerType: "cloud",
      model: "reasoner-pro",
      accessMode: "current",
      reasoningEffort: "medium",
      workspacePath: "/tmp/project-1",
    });
  });

  it("应透传 read model 与子任务摘要事实", async () => {
    const threadRead = {
      thread_id: "thread-1",
      managed_objective: {
        objective_id: "objective-1",
        owner_kind: "agent_session",
        owner_id: "session-1",
        objective_text: "完成顶部任务轨道",
        success_criteria: [],
        status: "active",
        last_artifact_refs: [],
        created_at: "2026-06-16T10:00:00.000Z",
        updated_at: "2026-06-16T10:00:00.000Z",
      },
      change_summary: {
        changed_file_count: 1,
        changed_files: ["src/App.tsx"],
        patch_count: 1,
      },
      context_summary: {
        sources: ["https://docs.example.com/task-rail"],
      },
    } as any;
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
    const childSubagentSessions = [
      {
        id: "child-running",
        name: "实现",
        created_at: 1,
        updated_at: 2,
        session_type: "subagent",
        latest_turn_status: "queued" as const,
      },
    ];
    const { render, getValue } = renderHook({
      threadRead,
      threadItems,
      childSubagentSessions,
    });

    await render();

    expect(getValue().threadRead).toBe(threadRead);
    expect(getValue().childSubagentSessions).toBe(childSubagentSessions);
    expect(getValue().context).toMatchObject({
      objectiveText: "完成顶部任务轨道",
      changedFileCount: 1,
      changedFiles: ["src/App.tsx"],
      patchCount: 1,
      sourceCount: 2,
      sourceLabels: ["docs.example.com", "source.md"],
      subtaskTotalCount: 1,
      subtaskActiveCount: 1,
    });
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
