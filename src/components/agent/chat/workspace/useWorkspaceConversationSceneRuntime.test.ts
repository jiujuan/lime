import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceConversationSceneRuntime } from "./useWorkspaceConversationSceneRuntime";

vi.mock("react-i18next", async () => {
  const { agentZhCNResource } = await import("@/i18n/agentResources");
  const agentZhCN = agentZhCNResource as Record<string, string>;

  return {
    useTranslation: () => ({
      i18n: {
        language: "zh-CN",
      },
      t: (key: string, options?: Record<string, unknown>) => {
        const template = agentZhCN[key] ?? key;
        return template.replace(/{{\s*([^}]+?)\s*}}/g, (_, name: string) =>
          String(options?.[name.trim()] ?? ""),
        );
      },
    }),
  };
});

vi.mock("react-syntax-highlighter", () => ({
  Prism: ({ children }: { children?: unknown }) =>
    React.createElement(
      "pre",
      { "data-testid": "syntax-highlighter-mock" },
      String(children ?? ""),
    ),
}));

vi.mock("react-syntax-highlighter/dist/esm/styles/prism", () => ({
  oneLight: {},
  oneDark: {},
}));

type HookProps = Parameters<typeof useWorkspaceConversationSceneRuntime>[0];

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

function createBaseParams(overrides: Record<string, unknown> = {}) {
  const noop = vi.fn();
  const setCanvasWorkbenchLayoutMode = vi.fn();

  return {
    navigationActions: {
      handleDismissEntryBanner: noop,
      handleWorkspaceAlertSelectDirectory: noop,
      handleDismissWorkspaceAlert: noop,
      handleManageProviders: noop,
      handleOpenExecutionPolicySettings: noop,
      handleProjectChange: noop,
      handleOpenAppearanceSettings: noop,
      handleOpenChannels: noop,
      handleOpenChromeRelay: noop,
      handleBackToResources: noop,
      handleCompactContext: noop,
      handleOpenRuntimeMemoryWorkbench: noop,
    },
    inputbarScene: {
      inputbarNode: null,
      generalWorkbenchDialog: undefined,
      runtimeToolAvailability: null,
    },
    canvasScene: {
      hasLiveCanvasPreviewContent: false,
      liveCanvasPreview: null,
      shouldShowCanvasLoadingState: false,
      canvasWorkbenchDefaultPreview: null,
      handleOpenCanvasWorkbenchPath: noop,
      handleRevealCanvasWorkbenchPath: noop,
      handleCloseCanvasWorkbench: noop,
      renderCanvasWorkbenchPreview: noop,
    },
    handleSendFromEmptyState: noop,
    shellChromeRuntime: {
      showChatLayout: true,
      isWorkspaceCompactChrome: false,
      workflowLayoutBottomSpacing: {
        messageViewportBottomPadding: "0px",
        shellBottomInset: "0px",
      },
      shouldHideGeneralWorkbenchInputForTheme: false,
      shouldRenderTopBar: true,
      layoutTransitionChatPanelWidth: undefined,
      layoutTransitionChatPanelMinWidth: undefined,
      shouldShowGeneralWorkbenchFloatingInputOverlay: false,
      shouldRenderInlineA2UI: false,
    },
    generalWorkbenchHarnessDialog: undefined,
    entryBannerVisible: false,
    entryBannerMessage: undefined,
    sceneAppExecutionSummaryCard: undefined,
    serviceSkillExecutionCard: undefined,
    contextWorkspaceEnabled: false,
    input: "",
    setInput: noop,
    providerType: "mock-provider",
    setProviderType: noop,
    model: "mock-model",
    setModel: noop,
    executionStrategy: "default",
    setExecutionStrategy: noop,
    accessMode: "default",
    setAccessMode: noop,
    chatToolPreferences: {
      task: false,
      subagent: false,
    },
    setChatToolPreferences: noop,
    selectedTeam: null,
    creationMode: "guided",
    setCreationMode: noop,
    activeTheme: "general",
    setActiveTheme: noop,
    lockTheme: false,
    artifacts: [],
    generalCanvasContent: "",
    resolvedCanvasState: null,
    contentId: null,
    selectedText: "",
    handleRecommendationClick: noop,
    projectCharacters: [],
    skills: [],
    serviceSkills: [],
    skillsLoading: false,
    onSelectServiceSkill: noop,
    handleNavigateToSkillSettings: noop,
    handleRefreshSkills: noop,
    handleOpenBrowserAssistInCanvas: noop,
    browserAssistLaunching: false,
    projectId: "project-1",
    showChatPanel: true,
    topBarChrome: "full",
    onBackToProjectManagement: undefined,
    fromResources: false,
    handleBackHome: noop,
    showHarnessToggle: false,
    navbarHarnessPanelVisible: false,
    handleToggleHarnessPanel: noop,
    harnessPendingCount: 0,
    harnessAttentionLevel: "idle",
    harnessToggleLabel: undefined,
    isRestoringSession: false,
    sessionId: null,
    syncStatus: "idle",
    pendingA2UIForm: undefined,
    pendingA2UISource: null,
    a2uiSubmissionNotice: undefined,
    handlePendingA2UISubmit: noop,
    handleToggleCanvas: noop,
    currentImageWorkbenchActive: false,
    hideInlineStepProgress: false,
    isSpecializedThemeMode: false,
    hasMessages: false,
    steps: [],
    currentStepIndex: 0,
    goToStep: noop,
    displayMessages: [],
    turns: [],
    effectiveThreadItems: [],
    currentTurnId: null,
    threadRead: false,
    pendingActions: [],
    submittedActionsInFlight: [],
    queuedTurns: [],
    isPreparingSend: false,
    isSending: false,
    stopSending: noop,
    resumeThread: noop,
    replayPendingAction: noop,
    promoteQueuedTurn: noop,
    deleteMessage: noop,
    editMessage: noop,
    handleA2UISubmit: noop,
    handleWriteFile: noop,
    handleFileClick: noop,
    handleOpenArtifactFromTimeline: noop,
    handleOpenSavedSiteContent: noop,
    handleArtifactClick: noop,
    handleOpenSubagentSession: noop,
    handlePermissionResponse: noop,
    pendingPromotedA2UIActionRequest: null,
    shouldCollapseCodeBlocks: false,
    shouldCollapseCodeBlockInChat: noop,
    handleCodeBlockClick: noop,
    layoutMode: "chat-canvas",
    isThemeWorkbench: false,
    settledWorkbenchArtifacts: [],
    taskFiles: [],
    selectedFileId: undefined,
    projectRootPath: "/tmp/project-1",
    handleHarnessLoadFilePreview: noop,
    setCanvasWorkbenchLayoutMode,
    workspacePathMissing: false,
    workspaceHealthError: false,
    focusedTimelineItemId: null,
    timelineFocusRequestKey: 0,
    ...overrides,
  } as any;
}

function renderHook(initialProps: HookProps) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let latestValue: ReturnType<
    typeof useWorkspaceConversationSceneRuntime
  > | null = null;

  function Probe(currentProps: HookProps) {
    latestValue = useWorkspaceConversationSceneRuntime(currentProps);
    return null;
  }

  const render = (nextProps: HookProps) => {
    act(() => {
      root.render(React.createElement(Probe, nextProps));
    });
  };

  render(initialProps);
  mountedRoots.push({ root, container });

  return {
    getValue: () => {
      if (!latestValue) {
        throw new Error("hook 尚未初始化");
      }
      return latestValue;
    },
    render,
  };
}

function getRenderedSceneProps(params: ReturnType<typeof createBaseParams>) {
  const { getValue } = renderHook(params);
  return (getValue().mainAreaNode as any).props;
}

function buildHeavySessionRuntimeFixture(sessionId = "session") {
  const messages = Array.from({ length: 24 }, (_, index) => ({
    id: `${sessionId}-msg-${index}`,
    role: index % 2 === 0 ? "user" : "assistant",
    content: `${sessionId} 消息 ${index}`,
    timestamp: new Date(2026, 3, 30, 10, index),
  }));
  const turns = Array.from({ length: 6 }, (_, index) => ({
    id: `${sessionId}-turn-${index}`,
    thread_id: `${sessionId}-thread`,
    prompt_text: `${sessionId} 任务 ${index}`,
    status: "completed",
    started_at: `2026-04-30T10:0${index}:00.000Z`,
    created_at: `2026-04-30T10:0${index}:00.000Z`,
    updated_at: `2026-04-30T10:0${index}:01.000Z`,
  }));
  const threadItems = Array.from({ length: 28 }, (_, index) => ({
    id: `${sessionId}-item-${index}`,
    thread_id: `${sessionId}-thread`,
    turn_id: `${sessionId}-turn-${Math.min(5, Math.floor(index / 5))}`,
    sequence: index + 1,
    status: "completed",
    started_at: `2026-04-30T10:00:${String(index).padStart(2, "0")}.000Z`,
    updated_at: `2026-04-30T10:00:${String(index).padStart(2, "0")}.500Z`,
    type: "tool_call",
    tool_name: "Read",
    arguments: { index },
  }));

  return { messages, turns, threadItems };
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
  vi.restoreAllMocks();
});

describe("useWorkspaceConversationSceneRuntime", () => {
  it("通用 Claw 双栏场景应继续同步 stacked/split 布局状态", () => {
    const params = createBaseParams();
    const setCanvasWorkbenchLayoutMode = params.setCanvasWorkbenchLayoutMode;

    const sceneProps = getRenderedSceneProps(params);
    expect(sceneProps.canvasWorkbenchLayoutProps.onLayoutModeChange).toBe(
      setCanvasWorkbenchLayoutMode,
    );
  });

  it("应向画布壳透传关闭动作", () => {
    const handleCloseCanvasWorkbench = vi.fn();
    const params = createBaseParams({
      canvasScene: {
        ...createBaseParams().canvasScene,
        handleCloseCanvasWorkbench,
      },
    });

    const sceneProps = getRenderedSceneProps(params);
    expect(sceneProps.canvasWorkbenchLayoutProps.onClose).toBe(
      handleCloseCanvasWorkbench,
    );
  });

  it("应把 URL 来源预览入口透传给消息列表", () => {
    const handleOpenUrlPreview = vi.fn();
    const params = createBaseParams({
      handleOpenUrlPreview,
    });

    const sceneProps = getRenderedSceneProps(params);
    expect(sceneProps.messageListProps.onOpenUrlPreview).toBe(
      handleOpenUrlPreview,
    );
  });

  it("主题工作台场景不应再向外回写 stacked/split 布局状态", () => {
    const params = createBaseParams({
      activeTheme: "general",
      isThemeWorkbench: true,
      isSpecializedThemeMode: true,
      layoutMode: "canvas",
    });

    const sceneProps = getRenderedSceneProps(params);
    expect(
      sceneProps.canvasWorkbenchLayoutProps.onLayoutModeChange,
    ).toBeUndefined();
  });

  it("生成场景应继续向页面层透传顶栏上下文变体", () => {
    const params = createBaseParams({
      navbarContextVariant: "task-center",
    });

    const sceneProps = getRenderedSceneProps(params);
    expect(sceneProps.navbarContextVariant).toBe("task-center");
  });

  it("应把运行摘要事实透传给 Task Center 任务轨道", () => {
    const params = createBaseParams({
      providerType: "cloud",
      model: "reasoner-pro",
      accessMode: "current",
      reasoningEffort: "medium",
      projectRootPath: "/tmp/project-1",
      canvasWorkbenchRootPath: "/tmp/canvas-root",
    });

    const sceneProps = getRenderedSceneProps(params);
    expect(sceneProps.taskRail?.context).toEqual({
      providerType: "cloud",
      model: "reasoner-pro",
      accessMode: "current",
      reasoningEffort: "medium",
      workspacePath: "/tmp/project-1",
    });
  });

  it("应把待确认状态与响应入口透传给 Task Center 任务轨道", () => {
    const handlePermissionResponse = vi.fn();
    const pendingActions = [
      {
        requestId: "approval-write",
        actionType: "tool_confirmation",
        toolName: "write_file",
        prompt: "允许保存 result.md？",
      },
    ];
    const submittedActionsInFlight = [
      {
        requestId: "approval-shell",
        actionType: "tool_confirmation",
        toolName: "shell",
        status: "submitted",
      },
    ];
    const params = createBaseParams({
      pendingActions,
      submittedActionsInFlight,
      handlePermissionResponse,
    });

    const sceneProps = getRenderedSceneProps(params);
    expect(sceneProps.taskRail?.pendingActions).toBe(pendingActions);
    expect(sceneProps.taskRail?.submittedActionsInFlight).toBe(
      submittedActionsInFlight,
    );
    expect(sceneProps.taskRail?.onRespondToAction).toBe(
      handlePermissionResponse,
    );
  });

  it("应把已投影 timeline 透传给 Task Center 任务轨道用于已处理确认回显", () => {
    const threadItems = [
      {
        id: "approval-write-item",
        type: "approval_request",
        thread_id: "thread-1",
        turn_id: "turn-1",
        sequence: 1,
        status: "completed",
        request_id: "approval-write",
        action_type: "tool_confirmation",
        prompt: "允许保存 result.md？",
        response: "approved",
        started_at: "2026-06-16T10:00:00.000Z",
        completed_at: "2026-06-16T10:00:03.000Z",
        updated_at: "2026-06-16T10:00:03.000Z",
      },
    ];
    const params = createBaseParams({
      effectiveThreadItems: threadItems,
    });

    const sceneProps = getRenderedSceneProps(params);
    expect(sceneProps.taskRail?.threadItems).toBe(threadItems);
  });

  it("应把 todo items 透传给 Task Center 任务轨道用于恢复历史计划", () => {
    const todoItems = [
      {
        content: "恢复历史计划",
        status: "in_progress",
      },
    ];
    const params = createBaseParams({
      todoItems,
    });

    const sceneProps = getRenderedSceneProps(params);
    expect(sceneProps.taskRail?.todoItems).toBe(todoItems);
  });

  it("应把 read model 目标、变更和子任务事实透传给 Task Center 任务轨道", () => {
    const threadRead = {
      thread_id: "thread-1",
      managed_objective: {
        objective_id: "objective-1",
        owner_kind: "agent_session",
        owner_id: "session-1",
        objective_text: "完成任务区域摘要",
        success_criteria: [],
        status: "active",
        last_artifact_refs: [],
        created_at: "2026-06-16T10:00:00.000Z",
        updated_at: "2026-06-16T10:00:00.000Z",
      },
      change_summary: {
        changed_file_count: 2,
        changed_files: ["src/App.tsx", "src/index.ts"],
        patch_count: 2,
        applied_patch_count: 1,
      },
      context_summary: {
        sources: ["https://docs.example.com/task-rail"],
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
    };
    const childSubagentSessions = [
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
    ];
    const params = createBaseParams({
      threadRead,
      childSubagentSessions,
    });

    const sceneProps = getRenderedSceneProps(params);

    expect(sceneProps.taskRail?.threadRead).toBe(threadRead);
    expect(sceneProps.taskRail?.childSubagentSessions).toBe(
      childSubagentSessions,
    );
    expect(sceneProps.taskRail?.context).toEqual(
      expect.objectContaining({
        objectiveText: "完成任务区域摘要",
        changedFileCount: 2,
        changedFiles: ["src/App.tsx", "src/index.ts"],
        patchCount: 2,
        appliedPatchCount: 1,
        sourceCount: 3,
        sourceLabels: [
          "docs.example.com",
          "run-observability.md",
          "run-control.json",
        ],
        sourceEvidenceCount: 1,
        sourceConsistencyStatus: "linked",
        subtaskTotalCount: 2,
        subtaskActiveCount: 1,
        subtaskCompletedCount: 1,
      }),
    );
  });

  it("存在 Harness 入口时应透传顶栏按钮文案", () => {
    const params = createBaseParams({
      showHarnessToggle: true,
      harnessToggleLabel: "Harness",
    });

    const sceneProps = getRenderedSceneProps(params);
    expect(sceneProps.harnessToggleLabel).toBe("Harness");
  });

  it("Task Center 隐藏旧顶栏动作时仍应保留 Harness 开关能力", () => {
    const handleToggleHarnessPanel = vi.fn();
    const params = createBaseParams({
      navbarContextVariant: "task-center",
      suppressNavbarUtilityActions: true,
      showHarnessToggle: false,
      navbarHarnessPanelVisible: false,
      handleToggleHarnessPanel,
      harnessToggleLabel: "Harness",
    });

    const sceneProps = getRenderedSceneProps(params);

    expect(sceneProps.navbarContextVariant).toBe("task-center");
    expect(sceneProps.showHarnessToggle).toBe(false);
    expect(sceneProps.onToggleHarnessPanel).toBe(handleToggleHarnessPanel);
    expect(sceneProps.harnessToggleLabel).toBe("Harness");
  });

  it("首页空态应继续透传 service skills 与选择回调", () => {
    const onSelectServiceSkill = vi.fn();
    const serviceSkills = [
      {
        id: "daily-trend-briefing",
        title: "每日趋势摘要",
      },
    ];
    const params = createBaseParams({
      serviceSkills,
      onSelectServiceSkill,
    });

    const sceneProps = getRenderedSceneProps(params);
    expect(sceneProps.serviceSkills).toBe(serviceSkills);
    expect(sceneProps.onSelectServiceSkill).toBe(onSelectServiceSkill);
  });

  it("需要用户关注时才向画布壳透传会话进展面板", () => {
    const handlePermissionResponse = vi.fn();
    const params = createBaseParams({
      handlePermissionResponse,
      turns: [
        {
          id: "turn-1",
          thread_id: "thread-1",
          prompt_text: "请抓取文章并整理成 markdown",
          status: "running",
          started_at: "2026-04-09T10:00:00.000Z",
          created_at: "2026-04-09T10:00:00.000Z",
          updated_at: "2026-04-09T10:00:01.000Z",
        },
      ],
      currentTurnId: "turn-1",
      effectiveThreadItems: [
        {
          id: "item-1",
          thread_id: "thread-1",
          turn_id: "turn-1",
          sequence: 1,
          status: "in_progress",
          started_at: "2026-04-09T10:00:00.000Z",
          updated_at: "2026-04-09T10:00:01.000Z",
          type: "command_execution",
          command: "lime task create url-parse --json",
          cwd: "/tmp/project-1",
        },
        {
          id: "action-1",
          thread_id: "thread-1",
          turn_id: "turn-1",
          sequence: 2,
          status: "in_progress",
          started_at: "2026-04-09T10:00:01.000Z",
          updated_at: "2026-04-09T10:00:02.000Z",
          type: "request_user_input",
          request_id: "req-1",
          action_type: "elicitation",
          prompt: "请补充导出目录",
        },
      ],
      pendingActions: [
        {
          requestId: "req-1",
          actionType: "elicitation",
          prompt: "请补充导出目录",
          status: "pending",
        },
      ],
      queuedTurns: [
        {
          queued_turn_id: "queued-1",
          message_preview: "继续下载图片",
          message_text: "继续下载图片",
          created_at: 1_712_650_000,
          image_count: 0,
          position: 1,
        },
      ],
      settledWorkbenchArtifacts: [{ id: "artifact-1" }],
      isSending: true,
      focusedTimelineItemId: "item-1",
    });

    const sceneProps = getRenderedSceneProps(params);
    const sessionView = sceneProps.canvasWorkbenchLayoutProps.sessionView;

    expect(sessionView?.title).toBe("任务进展");
    expect(sessionView?.tabLabel).toBe("进展");
    expect(sessionView?.tabBadge).toBe("后续 1");
    expect(sessionView?.tabBadgeTone).toBe("slate");
    expect(sessionView?.subtitle).toBe("正在处理：请抓取文章并整理成 markdown");
    expect(sessionView?.summaryStats).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "session-status",
          label: "当前状态",
          value: "执行中",
        }),
        expect.objectContaining({
          key: "session-generated-files",
          label: "生成内容",
          value: "暂无产出",
        }),
        expect.objectContaining({
          key: "session-follow-up",
          label: "后续输入",
          value: "后续 1",
        }),
      ]),
    );
    expect(sessionView?.badges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "session-status",
          label: "执行中",
        }),
        expect.objectContaining({
          key: "session-queued-turns",
          label: "后续 1",
        }),
      ]),
    );
    expect(typeof sessionView?.renderPanel).toBe("function");
  });

  it("恢复旧会话首帧应先透传消息，并延迟运行轨迹投影", () => {
    vi.useFakeTimers();
    const { messages, turns, threadItems } =
      buildHeavySessionRuntimeFixture("restore");
    const params = createBaseParams({
      displayMessages: messages,
      turns,
      currentTurnId: "restore-turn-5",
      effectiveThreadItems: threadItems,
      pendingActions: [
        {
          requestId: "req-1",
          actionType: "elicitation",
          prompt: "补充信息",
          status: "pending",
        },
      ],
      queuedTurns: [
        {
          queued_turn_id: "queued-1",
          message_preview: "继续处理",
          message_text: "继续处理",
          created_at: 1_777_520_000,
          image_count: 0,
          position: 1,
        },
      ],
      isRestoringSession: true,
    });

    const harness = renderHook(params);
    let sceneProps = (harness.getValue().mainAreaNode as any).props;

    expect(sceneProps.messageListProps.messages).toBe(messages);
    expect(sceneProps.messageListProps.turns).toEqual([]);
    expect(sceneProps.messageListProps.threadItems).toEqual([]);
    expect(sceneProps.messageListProps.currentTurnId).toBeNull();
    expect(sceneProps.messageListProps.pendingActions).toEqual([]);
    expect(sceneProps.messageListProps.queuedTurns).toEqual([]);
    expect(sceneProps.canvasWorkbenchLayoutProps.sessionView).toBeNull();

    act(() => {
      vi.advanceTimersByTime(700);
    });

    sceneProps = (harness.getValue().mainAreaNode as any).props;
    expect(sceneProps.messageListProps.turns).toBe(turns);
    expect(sceneProps.messageListProps.threadItems).toBe(threadItems);
    expect(sceneProps.messageListProps.currentTurnId).toBe("restore-turn-5");
    expect(sceneProps.messageListProps.pendingActions).toHaveLength(1);
    expect(sceneProps.messageListProps.queuedTurns).toHaveLength(1);
    vi.useRealTimers();
  });

  it("历史窗口 hydrate 完成后应直接透传消息和运行轨迹投影", () => {
    const { messages, turns, threadItems } =
      buildHeavySessionRuntimeFixture("history-window");
    const params = createBaseParams({
      displayMessages: messages,
      turns,
      currentTurnId: "history-window-turn-5",
      effectiveThreadItems: threadItems,
      isRestoringSession: false,
      sessionHistoryWindow: {
        loadedMessages: 40,
        totalMessages: 320,
        isLoadingFull: false,
        error: null,
      },
    });

    const harness = renderHook(params);
    const sceneProps = (harness.getValue().mainAreaNode as any).props;

    expect(sceneProps.messageListProps.messages).toBe(messages);
    expect(sceneProps.messageListProps.turns).toBe(turns);
    expect(sceneProps.messageListProps.threadItems).toBe(threadItems);
    expect(sceneProps.messageListProps.currentTurnId).toBe(
      "history-window-turn-5",
    );
  });

  it("发送中会话不应延迟运行轨迹投影", () => {
    vi.useFakeTimers();
    const { messages, turns, threadItems } =
      buildHeavySessionRuntimeFixture("sending");
    const params = createBaseParams({
      displayMessages: messages,
      turns,
      currentTurnId: "sending-turn-5",
      effectiveThreadItems: threadItems,
      isRestoringSession: true,
      isSending: true,
    });

    const sceneProps = getRenderedSceneProps(params);
    expect(sceneProps.messageListProps.turns).toBe(turns);
    expect(sceneProps.messageListProps.threadItems).toBe(threadItems);
    expect(sceneProps.messageListProps.currentTurnId).toBe("sending-turn-5");
    vi.useRealTimers();
  });

  it("聚焦 timeline 或存在 A2UI 表单时不应延迟运行轨迹投影", () => {
    const { messages, turns, threadItems } =
      buildHeavySessionRuntimeFixture("interactive");
    const focusedSceneProps = getRenderedSceneProps(
      createBaseParams({
        displayMessages: messages,
        turns,
        currentTurnId: "interactive-turn-5",
        effectiveThreadItems: threadItems,
        isRestoringSession: true,
        focusedTimelineItemId: "interactive-item-1",
      }),
    );
    expect(focusedSceneProps.messageListProps.turns).toBe(turns);
    expect(focusedSceneProps.messageListProps.threadItems).toBe(threadItems);

    const pendingA2UISceneProps = getRenderedSceneProps(
      createBaseParams({
        displayMessages: messages,
        turns,
        currentTurnId: "interactive-turn-5",
        effectiveThreadItems: threadItems,
        isRestoringSession: true,
        pendingA2UIForm: {
          id: "form-1",
          title: "补充信息",
          schema: {},
        },
      }),
    );
    expect(pendingA2UISceneProps.messageListProps.turns).toBe(turns);
    expect(pendingA2UISceneProps.messageListProps.threadItems).toBe(
      threadItems,
    );
  });

  it("切换到另一条同长度旧会话时应重新延迟运行轨迹投影", () => {
    vi.useFakeTimers();
    const buildSession = (sessionId: string) => {
      const messages = Array.from({ length: 24 }, (_, index) => ({
        id: `${sessionId}-msg-${index}`,
        role: index % 2 === 0 ? "user" : "assistant",
        content: `${sessionId} 消息 ${index}`,
        timestamp: new Date(2026, 3, 30, 11, index),
      }));
      const turns = Array.from({ length: 6 }, (_, index) => ({
        id: `${sessionId}-turn-${index}`,
        thread_id: `${sessionId}-thread`,
        prompt_text: `${sessionId} 任务 ${index}`,
        status: "completed",
        started_at: `2026-04-30T11:0${index}:00.000Z`,
        created_at: `2026-04-30T11:0${index}:00.000Z`,
        updated_at: `2026-04-30T11:0${index}:01.000Z`,
      }));
      const threadItems = Array.from({ length: 28 }, (_, index) => ({
        id: `${sessionId}-item-${index}`,
        thread_id: `${sessionId}-thread`,
        turn_id: `${sessionId}-turn-${Math.min(5, Math.floor(index / 5))}`,
        sequence: index + 1,
        status: "completed",
        started_at: `2026-04-30T11:00:${String(index).padStart(2, "0")}.000Z`,
        updated_at: `2026-04-30T11:00:${String(index).padStart(2, "0")}.500Z`,
        type: "tool_call",
        tool_name: "Read",
        arguments: { index },
      }));

      return { messages, turns, threadItems };
    };
    const sessionA = buildSession("session-a");
    const sessionB = buildSession("session-b");
    const buildParams = (
      sessionId: string,
      session: ReturnType<typeof buildSession>,
    ) =>
      createBaseParams({
        sessionId,
        displayMessages: session.messages,
        turns: session.turns,
        currentTurnId: session.turns.at(-1)?.id ?? null,
        effectiveThreadItems: session.threadItems,
        isRestoringSession: true,
      });

    const harness = renderHook(buildParams("session-a", sessionA));
    act(() => {
      vi.advanceTimersByTime(700);
    });

    let sceneProps = (harness.getValue().mainAreaNode as any).props;
    expect(sceneProps.messageListProps.turns).toBe(sessionA.turns);
    expect(sceneProps.messageListProps.threadItems).toBe(sessionA.threadItems);

    harness.render(buildParams("session-b", sessionB));
    sceneProps = (harness.getValue().mainAreaNode as any).props;

    expect(sceneProps.messageListProps.messages).toBe(sessionB.messages);
    expect(sceneProps.messageListProps.turns).toEqual([]);
    expect(sceneProps.messageListProps.threadItems).toEqual([]);
    expect(sceneProps.messageListProps.currentTurnId).toBeNull();

    act(() => {
      vi.advanceTimersByTime(700);
    });

    sceneProps = (harness.getValue().mainAreaNode as any).props;
    expect(sceneProps.messageListProps.turns).toBe(sessionB.turns);
    expect(sceneProps.messageListProps.threadItems).toBe(sessionB.threadItems);
    expect(sceneProps.messageListProps.currentTurnId).toBe("session-b-turn-5");
    vi.useRealTimers();
  });

  it("应向画布壳透传 workspaceView 头部语义", () => {
    const params = createBaseParams({
      settledWorkbenchArtifacts: [{ id: "artifact-1" }, { id: "artifact-2" }],
      taskFiles: [{ id: "task-1", name: "draft.md" }],
      projectRootPath: "/tmp/demo-project",
      workspacePathMissing: false,
      workspaceHealthError: false,
      queuedTurns: [
        {
          queued_turn_id: "queued-1",
          message_preview: "继续处理",
          message_text: "继续处理",
          created_at: 1_712_650_000,
          image_count: 0,
          position: 1,
        },
      ],
      threadRead: {
        thread_id: "thread-1",
        active_turn_id: "turn-1",
        pending_requests: [
          {
            id: "approval-command-1",
            thread_id: "thread-1",
            turn_id: "turn-1",
            request_type: "tool_confirmation",
            status: "pending",
            title: "确认执行命令",
            payload: {
              command: "npm test",
            },
          },
        ],
      },
      submittedActionsInFlight: [
        {
          requestId: "approval-other",
          actionType: "tool_confirmation",
          status: "submitted",
        },
      ],
    });

    const sceneProps = getRenderedSceneProps(params);
    const workspaceView = sceneProps.canvasWorkbenchLayoutProps.workspaceView;

    expect(workspaceView?.title).toBe("项目工作区文件");
    expect(workspaceView?.tabLabel).toBe("文件");
    expect(workspaceView?.tabBadge).toBe("demo-project");
    expect(workspaceView?.tabBadgeTone).toBe("sky");
    expect(workspaceView?.badges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "workspace-root",
          label: "demo-project",
        }),
      ]),
    );
    expect(workspaceView?.summaryStats).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "workspace-root",
          label: "工作区",
          value: "demo-project",
        }),
        expect.objectContaining({
          key: "workspace-binding",
          label: "目录状态",
          value: "已连接",
        }),
      ]),
    );
    expect(workspaceView?.panelCopy).toEqual(
      expect.objectContaining({
        unavailableText: "当前工作区路径不可用，暂时无法浏览项目文件。",
        emptyText: "当前会话没有绑定可浏览的工作区目录。",
        sectionEyebrow: "项目目录",
      }),
    );
  });

  it("右侧工作台应优先打开项目根，避免审查落到会话临时目录", () => {
    const params = createBaseParams({
      projectRootPath: "/tmp/project-record-root",
      canvasWorkbenchRootPath: "/tmp/session-working-dir",
    });

    const sceneProps = getRenderedSceneProps(params);

    expect(sceneProps.projectRootPath).toBe("/tmp/project-record-root");
    expect(sceneProps.canvasWorkbenchLayoutProps.workspaceRoot).toBe(
      "/tmp/project-record-root",
    );
    expect(sceneProps.canvasWorkbenchLayoutProps.workspaceView.tabBadge).toBe(
      "project-record-root",
    );
  });

  it("运行时输出和文件信号应启用工作台模式并透出输出/日志入口", async () => {
    const openChangedFile = vi.fn(async () => undefined);
    const handleSendFromEmptyState = vi.fn();
    const handlePermissionResponse = vi.fn();
    const params = createBaseParams({
      executionStrategy: "react",
      handleSendFromEmptyState,
      handlePermissionResponse,
      canvasScene: {
        ...createBaseParams().canvasScene,
        handleOpenCanvasWorkbenchPath: openChangedFile,
      },
      threadRead: {
        thread_id: "thread-1",
        active_turn_id: "turn-1",
        active_command_id: "command-npm-test",
        active_test_run_id: "test-unit",
        file_checkpoint_summary: {
          count: 2,
          latest_checkpoint: {
            checkpoint_id: "checkpoint-index",
            turn_id: "turn-1",
            path: "index.html",
            source: "runtime",
            updated_at: "2026-05-27T10:00:04.000Z",
            version_no: 2,
            title: "index.html",
            kind: "code",
            status: "completed",
            preview_text: "更新后的页面",
            snapshot_path: ".lime/artifacts/thread-1/index.v2.html",
            validation_issue_count: 0,
          },
        },
        commands: [
          {
            command_id: "command-npm-test",
            turn_id: "turn-1",
            status: "failed",
            command: "npm test",
            cwd: "demo-project",
            exit_code: 1,
            output_preview: "FAIL src/App.test.tsx\nExpected title",
          },
        ],
        tests: [
          {
            test_run_id: "test-unit",
            turn_id: "turn-1",
            status: "failed",
            command_id: "command-npm-test",
            suite: "unit",
            result: "failed",
            passed: 8,
            failed: 1,
          },
        ],
        artifacts: [
          {
            artifactRef: "artifact-index",
            eventId: "evt-file-index",
            sequence: 3,
            turnId: "turn-1",
            path: "index.html",
            title: "index.html",
            kind: "code_file",
            status: "completed",
            metadata: {
              previewText: "更新后的页面",
              checkpointRef: "index.html",
              artifactVersion: {
                versionNo: 2,
                snapshotPath: ".lime/artifacts/thread-1/index.v2.html",
              },
            },
          },
          {
            artifactRef: "artifact-app",
            eventId: "evt-file-app",
            sequence: 4,
            turnId: "turn-1",
            path: "src/App.tsx",
            title: "App.tsx",
            kind: "code_file",
            status: "running",
            metadata: {
              previewText: "export function App() {}",
            },
          },
        ],
        pending_requests: [
          {
            id: "approval-command-1",
            thread_id: "thread-1",
            turn_id: "turn-1",
            request_type: "tool_confirmation",
            status: "pending",
            title: "确认执行命令",
            payload: {
              command: "npm test",
            },
          },
        ],
      },
      submittedActionsInFlight: [
        {
          requestId: "approval-other",
          actionType: "tool_confirmation",
          status: "submitted",
        },
      ],
    });

    const sceneProps = getRenderedSceneProps(params);
    const canvasProps = sceneProps.canvasWorkbenchLayoutProps;

    expect(canvasProps.workbenchMode).toBe("coding");
    expect(canvasProps.outputView?.tabBadge).toBe("3");
    expect(canvasProps.outputView?.tabBadgeTone).toBe("rose");
    expect(typeof canvasProps.outputView?.renderPanel).toBe("function");
    expect(canvasProps.outputView?.leadContent).toBeUndefined();
    const outputPanel = canvasProps.outputView?.renderPanel?.() as any;
    expect(outputPanel.props.onRespondToAction).toBe(handlePermissionResponse);
    expect(typeof outputPanel.props.onSubmitRecoveryPrompt).toBe("function");
    expect(outputPanel.props.submittedActionsInFlight).toEqual([
      expect.objectContaining({ requestId: "approval-other" }),
    ]);
    expect(handleSendFromEmptyState).not.toHaveBeenCalled();
    await outputPanel.props.onSubmitRecoveryPrompt("请继续修复失败测试");
    expect(handleSendFromEmptyState).toHaveBeenCalledWith({
      textOverride: "请继续修复失败测试",
    });
    await outputPanel.props.onSubmitRecoveryPrompt("请带上下文继续修复", {
      schemaVersion: "coding-workbench-recovery/v1",
      failureKind: "test",
      sourceIds: {
        commandId: "command-npm-test",
        testRunId: "test-unit",
      },
      refs: {
        outputRefs: ["output://command-npm-test"],
        sourceEventIds: ["event-command-npm-test"],
      },
      relatedFiles: ["src/App.tsx"],
      latestCheckpointPath: "index.html",
      signals: [
        {
          kind: "test",
          id: "test-unit",
          title: "unit",
          sourceIds: {
            commandId: "command-npm-test",
            testRunId: "test-unit",
          },
          refs: {
            outputRefs: ["output://command-npm-test"],
            sourceEventIds: ["event-command-npm-test"],
          },
        },
      ],
    });
    expect(handleSendFromEmptyState).toHaveBeenLastCalledWith({
      textOverride: "请带上下文继续修复",
      sendOptions: {
        requestMetadata: {
          harness: {
            coding_workbench_recovery: expect.objectContaining({
              schemaVersion: "coding-workbench-recovery/v1",
              failureKind: "test",
              sourceIds: {
                commandId: "command-npm-test",
                testRunId: "test-unit",
              },
              refs: {
                outputRefs: ["output://command-npm-test"],
                sourceEventIds: ["event-command-npm-test"],
              },
              relatedFiles: ["src/App.tsx"],
              latestCheckpointPath: "index.html",
            }),
          },
        },
      },
    });
    expect(canvasProps.logView).not.toBe(canvasProps.sessionView);
    expect(canvasProps.logView?.tabLabel).toBe("日志");
    expect(canvasProps.logView?.title).toBe("运行日志");
    expect(typeof canvasProps.logView?.renderPanel).toBe("function");
    expect(canvasProps.changeView?.checkpointCount).toBe(2);
    expect(canvasProps.changeView?.latestCheckpointPath).toBe(
      ".lime/artifacts/thread-1/index.v2.html",
    );
    expect(canvasProps.changeView?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "evt-file-index",
          path: "index.html",
          displayName: "index.html",
          status: "completed",
          changeKind: "modified",
          checkpointPath: "index.html",
          checkpointLabel: "snapshot",
        }),
        expect.objectContaining({
          id: "evt-file-app",
          path: "src/App.tsx",
          displayName: "App.tsx",
          status: "in_progress",
          changeKind: "modified",
        }),
      ]),
    );
    canvasProps.changeView?.onOpenFile?.("/tmp/demo/index.html");
    expect(openChangedFile).toHaveBeenCalledWith("/tmp/demo/index.html");

    expect(handleSendFromEmptyState).toHaveBeenCalledTimes(2);
  });

  it("无运行时输出和文件信号时应保持默认画布工作台模式", () => {
    const sceneProps = getRenderedSceneProps(
      createBaseParams({
        executionStrategy: "react",
      }),
    );
    const canvasProps = sceneProps.canvasWorkbenchLayoutProps;

    expect(canvasProps.workbenchMode).toBe("default");
    expect(canvasProps.sessionView).toBeNull();
    expect(canvasProps.outputView).toBeNull();
    expect(canvasProps.logView).toBeNull();
    expect(canvasProps.changeView).toBeNull();
  });

  it("任务中心无运行时输出时仍应使用 coding 工作台 chrome 暴露审查入口", () => {
    const sceneProps = getRenderedSceneProps(
      createBaseParams({
        executionStrategy: "react",
        navbarContextVariant: "task-center",
      }),
    );
    const canvasProps = sceneProps.canvasWorkbenchLayoutProps;

    expect(canvasProps.workbenchMode).toBe("coding");
    expect(canvasProps.outputView).toBeNull();
    expect(canvasProps.logView).toBeNull();
    expect(canvasProps.changeView).toBeNull();
  });

  it("任务中心输出文件应按工作区根目录解析后再打开", () => {
    const handleOpenCanvasWorkbenchPath = vi.fn();
    const sceneProps = getRenderedSceneProps(
      createBaseParams({
        canvasScene: {
          ...createBaseParams().canvasScene,
          handleOpenCanvasWorkbenchPath,
        },
        projectRootPath: "/tmp/project-1",
        canvasWorkbenchRootPath: "/tmp/session-root",
        steps: [{ id: "write", title: "整理输出文件", status: "active" }],
      }),
    );

    sceneProps.taskRail?.onOpenOutput?.("docs/result.md");
    expect(handleOpenCanvasWorkbenchPath).toHaveBeenCalledWith(
      "/tmp/project-1/docs/result.md",
    );

    sceneProps.taskRail?.onOpenOutput?.("/tmp/absolute.md");
    expect(handleOpenCanvasWorkbenchPath).toHaveBeenLastCalledWith(
      "/tmp/absolute.md",
    );
  });

  it("应把做法执行摘要卡透传给 WorkspaceConversationScene", () => {
    const sceneAppExecutionSummaryCard = React.createElement(
      "div",
      { "data-testid": "sceneapp-summary-card-probe" },
      "sceneapp summary",
    );
    const params = createBaseParams({
      sceneAppExecutionSummaryCard,
    });

    const sceneProps = getRenderedSceneProps(params);

    expect(sceneProps.sceneAppExecutionSummaryCard).toBe(
      sceneAppExecutionSummaryCard,
    );
  });
});
