import { describe, expect, it, vi } from "vitest";
import type { AgentRuntimeFileCheckpointThreadSummary } from "@/lib/api/agentRuntime";
import type { AgentThreadItem, AgentThreadTurn } from "@/lib/api/agentProtocol";
import {
  buildCanvasWorkbenchChangeView,
  buildCanvasWorkbenchChangeViewFromCodingProjection,
  buildCodingRuntimeEventsFromThreadItems,
  buildCodingWorkbenchProjectionFromThreadItems,
  buildFileArtifactChangeItem,
  buildOutputHeaderViewModel,
  buildQuotedReplyText,
  buildSessionHeaderViewModel,
  buildSessionRuntimeCounters,
  buildSessionRuntimeCountersFromCodingProjection,
  buildSessionRuntimeProjectionIdentity,
  buildSessionRuntimeProjectionState,
  buildWorkspaceHeaderView,
  isCodeOutputThreadItem,
  resolveNextSessionRuntimeProjectionState,
  resolvePathLeaf,
  resolveSessionRuntimeProjectionStatus,
  resolveSessionStatusBadge,
  shouldConsiderSessionRuntimeProjectionDeferral,
  shortenSessionText,
} from "./workspaceConversationSceneViewModel";

function createFileArtifactItem(
  overrides: Partial<Extract<AgentThreadItem, { type: "file_artifact" }>> = {},
): Extract<AgentThreadItem, { type: "file_artifact" }> {
  return {
    id: "file-1",
    type: "file_artifact",
    path: "src/App.tsx",
    source: "agent",
    status: "completed",
    content: "export default function App() {}",
    metadata: {},
    ...overrides,
  } as Extract<AgentThreadItem, { type: "file_artifact" }>;
}

function createCommandExecutionItem(
  overrides: Partial<
    Extract<AgentThreadItem, { type: "command_execution" }>
  > = {},
): Extract<AgentThreadItem, { type: "command_execution" }> {
  return {
    id: "command-1",
    type: "command_execution",
    thread_id: "thread-1",
    turn_id: "turn-1",
    sequence: 1,
    status: "completed",
    started_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    command: "npm test",
    cwd: "/workspace",
    ...overrides,
  } as Extract<AgentThreadItem, { type: "command_execution" }>;
}

function createThreadTurn(
  overrides: Partial<AgentThreadTurn> = {},
): AgentThreadTurn {
  return {
    id: "turn-1",
    thread_id: "thread-1",
    prompt_text: "请检查测试分层",
    status: "running",
    started_at: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function createCheckpointSummary(
  overrides: Partial<AgentRuntimeFileCheckpointThreadSummary> = {},
): AgentRuntimeFileCheckpointThreadSummary {
  return {
    count: 1,
    latest_checkpoint: {
      path: "src/App.tsx",
      snapshot_path: ".lime/checkpoints/app-v4.tsx",
      version_no: 4,
    },
    ...overrides,
  } as AgentRuntimeFileCheckpointThreadSummary;
}

function createTranslate() {
  return ((key: string, options?: Record<string, unknown>) => {
    if (typeof options?.prompt === "string") {
      return `${key}:${options.prompt}`;
    }
    if (typeof options?.countLabel === "string") {
      return `${key}:${options.countLabel}`;
    }
    return key;
  }) as never;
}

describe("workspaceConversationSceneViewModel", () => {
  it("应归一化并截断 session 文本", () => {
    expect(shortenSessionText("  第一行\n第二行  ")).toBe("第一行 第二行");
    expect(shortenSessionText("")).toBe("");
    expect(shortenSessionText("abcdef", 4)).toBe("abc…");
  });

  it("应解析 session 状态 badge，并允许翻译函数覆盖 label", () => {
    expect(resolveSessionStatusBadge("running")).toEqual({
      label: "执行中",
      tone: "accent",
    });
    expect(resolveSessionStatusBadge("completed")).toEqual({
      label: "已完成",
      tone: "success",
    });
    expect(
      resolveSessionStatusBadge(
        "failed",
        ((key: string) => `t:${key}`) as never,
      ),
    ).toEqual({
      label: "t:agentChat.sessionOverview.status.turn.failed",
      tone: "default",
    });
    for (const status of ["canceled", "cancelled", "interrupted"] as const) {
      expect(resolveSessionStatusBadge(status)).toEqual({
        label: "已中断",
        tone: "default",
      });
    }
  });

  it("应解析跨平台路径末尾名称", () => {
    expect(resolvePathLeaf("C:\\Users\\lime\\project")).toBe("project");
    expect(resolvePathLeaf("/tmp/project/")).toBe("project");
    expect(resolvePathLeaf("   ")).toBe("");
  });

  it("应构造引用回复文本，并保留已有输入", () => {
    expect(
      buildQuotedReplyText({ content: "  第一行\n第二行  ", input: "" }),
    ).toBe("> 第一行\n> 第二行\n\n");
    expect(buildQuotedReplyText({ content: "继续", input: "已有内容\n" })).toBe(
      "已有内容\n\n> 继续\n\n",
    );
    expect(
      buildQuotedReplyText({ content: "   ", input: "已有内容" }),
    ).toBeNull();
  });

  it("应统计 runtime 输出、文件变更和待处理进度", () => {
    const commandItem = createCommandExecutionItem({ status: "failed" });
    const fileItem = createFileArtifactItem({ status: "in_progress" });

    const counters = buildSessionRuntimeCounters({
      threadItems: [commandItem, fileItem],
      fileCheckpointSummary: null,
      pendingActions: [{}],
      queuedTurns: [],
    });

    expect(isCodeOutputThreadItem(commandItem)).toBe(true);
    expect(isCodeOutputThreadItem(fileItem)).toBe(false);
    expect(counters).toEqual({
      outputItemCount: 1,
      failedOutputItemCount: 1,
      inProgressItemCount: 1,
      generatedFileCount: 1,
      hasRuntimeFileChanges: true,
      hasRuntimeOutputs: true,
      shouldUseRuntimeWorkbench: true,
      shouldExposeSessionProgress: true,
    });
  });

  it("应构造 session header 与 output header 的纯 view model", () => {
    const t = createTranslate();
    const counters = buildSessionRuntimeCounters({
      threadItems: [
        createCommandExecutionItem({ status: "failed" }),
        createFileArtifactItem({ status: "in_progress" }),
      ],
      fileCheckpointSummary: createCheckpointSummary({ count: 1 }),
      pendingActions: [{}],
      queuedTurns: [],
    });
    const labels = {
      inProgressItemCountLabel: "1",
      generatedFileCountLabel: "1",
      pendingActionCountLabel: "1",
      queuedTurnCountLabel: "0",
    };
    const sessionView = buildSessionHeaderViewModel({
      t,
      currentSessionTurn: createThreadTurn({
        prompt_text: "  需要\n继续推进  ",
      }),
      currentSessionStatus: resolveSessionStatusBadge("running", t),
      counters,
      labels,
      pendingActionCount: 1,
      queuedTurnCount: 0,
    });
    const outputView = buildOutputHeaderViewModel({
      t,
      counters: {
        ...counters,
        outputItemCount: 120,
      },
    });

    expect(sessionView).toMatchObject({
      tabBadge: "agentChat.workspaceSession.badge.inProgress:1",
      subtitle: "agentChat.workspaceSession.subtitle.current:需要 继续推进",
      badges: expect.arrayContaining([
        expect.objectContaining({ key: "session-pending-actions" }),
      ]),
    });
    expect(sessionView?.summaryStats).toHaveLength(3);
    expect(outputView).toMatchObject({
      enabled: true,
      tabBadge: "99+",
      tabBadgeTone: "rose",
    });
  });

  it("应构造工作区 header，并标记路径异常", () => {
    expect(
      buildWorkspaceHeaderView({
        projectRootPath: "C:\\Users\\lime\\project",
        workspacePathMissing: false,
        workspaceHealthError: false,
      }),
    ).toMatchObject({
      title: "项目工作区文件",
      tabBadge: "project",
      tabBadgeTone: "sky",
      summaryStats: [
        expect.objectContaining({ key: "workspace-root", value: "project" }),
        expect.objectContaining({ key: "workspace-binding", value: "已连接" }),
      ],
    });
    expect(
      buildWorkspaceHeaderView({
        projectRootPath: "/tmp/project",
        workspacePathMissing: true,
        workspaceHealthError: false,
      }),
    ).toMatchObject({
      tabBadge: "路径缺失",
      tabBadgeTone: "rose",
      badges: expect.arrayContaining([
        expect.objectContaining({ key: "workspace-missing" }),
      ]),
    });
  });

  it("应从 file artifact metadata 构造 canvas change item", () => {
    const item = createFileArtifactItem({
      metadata: {
        artifact_title: "应用入口",
        preview_text: "更新 App 入口",
        artifact_version_no: "4",
      },
    });

    expect(
      buildFileArtifactChangeItem(item, createCheckpointSummary()),
    ).toEqual(
      expect.objectContaining({
        id: "file-1",
        path: "src/App.tsx",
        displayName: "应用入口",
        preview: "更新 App 入口",
        checkpointPath: "src/App.tsx",
        checkpointLabel: "v4",
      }),
    );
  });

  it("应合并同一路径的 file artifact change view", () => {
    const onOpenFile = vi.fn();
    const view = buildCanvasWorkbenchChangeView({
      threadItems: [
        createFileArtifactItem({
          id: "file-first",
          path: "src/App.tsx",
          status: "completed",
          content: "first",
        }),
        createFileArtifactItem({
          id: "file-second",
          path: "SRC\\app.tsx",
          status: "in_progress",
          content: "second",
          metadata: {
            title: "App 入口",
          },
        }),
      ] as AgentThreadItem[],
      fileCheckpointSummary: createCheckpointSummary({
        count: 2,
        latest_checkpoint: {
          checkpoint_id: "checkpoint-app-v5",
          turn_id: "turn-1",
          path: "src/App.tsx",
          source: "artifact_snapshot",
          snapshot_path: ".lime/checkpoints/app-v5.tsx",
          updated_at: "2026-06-02T10:00:00.000Z",
          version_no: 5,
          validation_issue_count: 0,
        },
      }),
      onOpenFile,
    });

    expect(view).toMatchObject({
      checkpointCount: 2,
      latestCheckpointPath: ".lime/checkpoints/app-v5.tsx",
      items: [
        {
          id: "file-first",
          path: "SRC\\app.tsx",
          displayName: "App 入口",
          status: "in_progress",
          currentContent: "second",
          checkpointLabel: "v5",
        },
      ],
    });
    expect(view?.onOpenFile).toBe(onOpenFile);
  });

  it("应把迁移期 thread item 归一为标准 coding runtime events", () => {
    const events = buildCodingRuntimeEventsFromThreadItems({
      threadItems: [
        createFileArtifactItem({
          id: "file-item",
          sequence: 1,
          path: "src/App.tsx",
          metadata: {
            diffRef: "artifact://diff/app",
          },
        }),
        createCommandExecutionItem({
          id: "command-item",
          sequence: 2,
          command: "npm test",
          cwd: ".",
          exit_code: 0,
          aggregated_output: "pass",
        }),
        {
          id: "patch-item",
          type: "tool_call",
          thread_id: "thread-1",
          turn_id: "turn-1",
          sequence: 3,
          status: "failed",
          started_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:01Z",
          tool_name: "apply_patch",
          output: "conflict",
          metadata: {
            patchId: "patch-app",
            path: "src/App.tsx",
            failureCategory: "conflict",
          },
        },
        {
          id: "test-summary",
          type: "turn_summary",
          thread_id: "thread-1",
          turn_id: "turn-1",
          sequence: 4,
          status: "failed",
          started_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:01Z",
          text: "unit tests failed",
          metadata: {
            kind: "test_run",
            testRunId: "test-unit",
            commandId: "command-item",
            passed: 8,
            failed: 1,
          },
        },
      ] as AgentThreadItem[],
      fileCheckpointSummary: createCheckpointSummary(),
    });

    expect(events.map((event) => event.eventClass)).toEqual([
      "file.changed",
      "command.started",
      "command.exited",
      "patch.started",
      "patch.failed",
      "test.started",
      "test.completed",
    ]);
    expect(events.every((event, index) => event.sequence === index + 1)).toBe(
      true,
    );
  });

  it("应通过标准 coding projection 派生工作台 change view", () => {
    const onOpenFile = vi.fn();
    const codingView = buildCodingWorkbenchProjectionFromThreadItems({
      threadItems: [
        createFileArtifactItem({
          id: "file-item",
          path: "src/App.tsx",
          content: "export function App() {}",
          metadata: {
            previewText: "更新 App",
            diffRef: "artifact://diff/app",
          },
        }),
      ] as AgentThreadItem[],
      fileCheckpointSummary: createCheckpointSummary(),
    });
    const changeView = buildCanvasWorkbenchChangeViewFromCodingProjection({
      codingView,
      fileCheckpointSummary: createCheckpointSummary(),
      onOpenFile,
    });

    expect(codingView.changes).toHaveLength(1);
    expect(changeView).toMatchObject({
      checkpointCount: 1,
      items: [
        {
          id: "coding_thread_item_file-item",
          path: "src/App.tsx",
          displayName: "App.tsx",
          source: "runtime",
          status: "completed",
          preview: "更新 App",
        },
      ],
    });
    expect(changeView?.onOpenFile).toBe(onOpenFile);
  });

  it("应从 current thread read model 合并 coding command/test/action 状态", () => {
    const codingView = buildCodingWorkbenchProjectionFromThreadItems({
      threadItems: [],
      threadRead: {
        thread_id: "thread-1",
        active_turn_id: "turn-1",
        active_command_id: "command-active",
        active_test_run_id: "test-active",
        commands: [
          {
            command_id: "command-active",
            status: "running",
            command: "npm test",
            cwd: "app",
            output_refs: ["output://command-active"],
            output_preview: "running tests",
          },
        ],
        tests: [
          {
            test_run_id: "test-active",
            status: "running",
            command_id: "command-active",
            suite: "unit",
            passed: 3,
            failed: 0,
          },
        ],
        pending_requests: [
          {
            id: "action-approve-command",
            thread_id: "thread-1",
            turn_id: "turn-1",
            request_type: "approval",
            status: "pending",
            title: "确认执行命令",
          },
        ],
      },
    });

    expect(codingView.mainObject.id).toBe("turn-1");
    expect(codingView.mainObject.activeCommandId).toBe("command-active");
    expect(codingView.mainObject.activeTestRunId).toBe("test-active");
    expect(codingView.commands).toMatchObject([
      {
        commandId: "command-active",
        status: "running",
        command: "npm test",
        cwd: "app",
        preview: "running tests",
      },
    ]);
    expect(codingView.tests).toMatchObject([
      {
        testRunId: "test-active",
        status: "running",
        commandId: "command-active",
        suite: "unit",
        passed: 3,
      },
    ]);
    expect(codingView.actions[0]?.actionId).toBe("action-approve-command");
    expect(codingView.ui.preferredTab).toBe("outputs");
  });

  it("应从 current coding projection 计算 workbench 输出和进度计数", () => {
    const codingView = buildCodingWorkbenchProjectionFromThreadItems({
      threadItems: [],
      threadRead: {
        thread_id: "thread-1",
        active_turn_id: "turn-1",
        active_command_id: "command-active",
        active_test_run_id: "test-active",
        commands: [
          {
            command_id: "command-active",
            status: "running",
            command: "npm test",
            cwd: "app",
            output_preview: "running tests",
          },
        ],
        tests: [
          {
            test_run_id: "test-active",
            status: "failed",
            command_id: "command-active",
            suite: "unit",
            passed: 3,
            failed: 1,
          },
        ],
        pending_requests: [
          {
            id: "action-approve-command",
            thread_id: "thread-1",
            turn_id: "turn-1",
            request_type: "approval",
            status: "pending",
            title: "确认执行命令",
          },
        ],
      },
    });

    expect(
      buildSessionRuntimeCountersFromCodingProjection({
        codingView,
        fileCheckpointSummary: null,
        queuedTurns: [],
      }),
    ).toEqual({
      outputItemCount: 3,
      failedOutputItemCount: 1,
      inProgressItemCount: 1,
      generatedFileCount: 0,
      hasRuntimeFileChanges: false,
      hasRuntimeOutputs: true,
      shouldUseRuntimeWorkbench: true,
      shouldExposeSessionProgress: true,
    });
  });

  it("projection state 未变化时应复用当前对象", () => {
    const current = buildSessionRuntimeProjectionState({
      key: "session-1:ready",
      sessionId: "session-1",
      firstMessageId: "message-1",
      lastMessageId: "message-9",
      ready: true,
    });
    const same = buildSessionRuntimeProjectionState({ ...current });
    const changed = buildSessionRuntimeProjectionState({
      ...current,
      lastMessageId: "message-10",
    });

    expect(resolveNextSessionRuntimeProjectionState(current, same)).toBe(
      current,
    );
    expect(resolveNextSessionRuntimeProjectionState(current, changed)).toBe(
      changed,
    );
  });

  it("应构造 session runtime projection identity", () => {
    const identity = buildSessionRuntimeProjectionIdentity({
      sessionId: "session-1",
      messages: [{ id: "message-1" }, { id: "message-2" }],
      turns: [{ id: "turn-1" }],
      threadItems: [{ id: "item-1" }, { id: "item-2" }],
    });

    expect(identity).toEqual({
      key: "session-1|message-1|message-2|turn-1|item-2",
      sessionId: "session-1",
      firstMessageId: "message-1",
      lastMessageId: "message-2",
      lastTurnId: "turn-1",
      lastItemId: "item-2",
    });
  });

  it("应只在恢复重载窗口且无活跃交互时考虑延迟 projection", () => {
    expect(
      shouldConsiderSessionRuntimeProjectionDeferral({
        isRestoringSession: true,
        isSending: false,
        focusedTimelineItemId: null,
        pendingA2UIForm: null,
        messageCount: 20,
        turnCount: 0,
        threadItemCount: 0,
        messageThreshold: 20,
        turnThreshold: 6,
        threadItemThreshold: 24,
      }),
    ).toBe(true);
    expect(
      shouldConsiderSessionRuntimeProjectionDeferral({
        isRestoringSession: true,
        isSending: true,
        focusedTimelineItemId: null,
        pendingA2UIForm: null,
        messageCount: 20,
        turnCount: 0,
        threadItemCount: 0,
        messageThreshold: 20,
        turnThreshold: 6,
        threadItemThreshold: 24,
      }),
    ).toBe(false);
  });

  it("应保留 append-only 消息更新的即时 projection 快路径", () => {
    const current = buildSessionRuntimeProjectionState({
      key: "session-1|message-1|message-2|turn-1|item-1",
      sessionId: "session-1",
      firstMessageId: "message-1",
      lastMessageId: "message-2",
      ready: true,
    });
    const identity = buildSessionRuntimeProjectionIdentity({
      sessionId: "session-1",
      messages: [{ id: "message-1" }, { id: "message-3" }],
      turns: [{ id: "turn-1" }],
      threadItems: [{ id: "item-1" }],
    });

    expect(
      resolveSessionRuntimeProjectionStatus({
        currentState: current,
        identity,
        shouldConsiderDeferring: true,
      }),
    ).toMatchObject({
      appendOnlyMessageUpdate: true,
      shouldDefer: false,
      ready: true,
      shouldUseDeferredProjection: false,
    });
  });
});
