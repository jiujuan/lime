import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import { useWorkspaceInputbarSceneRuntime } from "./useWorkspaceInputbarSceneRuntime";

const mockInputbarRender = vi.hoisted(() => vi.fn());

vi.mock("../components/Inputbar", () => ({
  Inputbar: (props: { overlayAccessory?: React.ReactNode }) => {
    mockInputbarRender(props);
    return <div data-testid="inputbar-mock">{props.overlayAccessory}</div>;
  },
}));

vi.mock("./WorkspaceHarnessDialogs", () => ({
  GeneralWorkbenchDialogSection: () => (
    <div data-testid="general-workbench-dialog-mock" />
  ),
}));

vi.mock("./knowledge/useWorkspaceKnowledgeRuntime", () => ({
  useWorkspaceKnowledgeRuntime: () => ({
    knowledgePackSelection: null,
    knowledgePackOptions: [],
    onToggleKnowledgePack: vi.fn(),
    onSelectKnowledgePack: vi.fn(),
    onToggleKnowledgeCompanionPack: vi.fn(),
    onStartKnowledgeOrganize: vi.fn(),
    onManageKnowledgePacks: vi.fn(),
    onImportPathReferenceAsKnowledge: vi.fn(),
    onImportTextAsKnowledge: vi.fn(),
  }),
}));

type HookProps = Parameters<typeof useWorkspaceInputbarSceneRuntime>[0];

const mountedRoots: Array<{ container: HTMLDivElement; root: Root }> = [];

function createDefaultProps(overrides: Partial<HookProps> = {}): HookProps {
  const noop = vi.fn();

  return {
    setMentionedCharacters: noop,
    isThemeWorkbench: true,
    sessionId: "session-1",
    childSubagentSessions: [],
    subagentParentContext: null,
    selectedTeamLabel: undefined,
    selectedTeamSummary: undefined,
    teamMemorySnapshot: null,
    currentSessionTitle: "当前会话",
    handleStopSending: noop,
    handleOpenSubagentSession: noop,
    input: "",
    setInput: noop,
    currentGate: null,
    generalWorkbenchWorkflowSteps: [],
    steps: [],
    workflowRunState: "idle",
    handleSend: vi.fn().mockResolvedValue(true),
    isPreparingSend: false,
    isSending: false,
    providerType: "openai",
    setProviderType: noop,
    model: "gpt-5",
    setModel: noop,
    reasoningEffort: "",
    setReasoningEffort: noop,
    sessionExecutionRuntime: null,
    projectId: "project-1",
    projectRootPath: "/tmp/project-1",
    openedProjects: [],
    accessMode: "default" as any,
    setAccessMode: noop,
    activeTheme: "general",
    navigationActions: {
      handleManageProviders: noop,
      handleOpenExecutionPolicySettings: noop,
      handleOpenRuntimeMemoryWorkbench: noop,
      handleOpenKnowledgeManagement: noop,
      handleProjectChange: noop,
    },
    selectedTeam: null,
    characters: [],
    skills: [],
    serviceSkills: [],
    serviceSkillGroups: [],
    skillsLoading: false,
    onSelectServiceSkill: noop,
    initialInputCapability: undefined,
    initialKnowledgePackSelection: undefined,
    setChatToolPreferences: noop,
    handleNavigateToSkillSettings: noop,
    handleRefreshSkills: noop,
    soulArtifactVoiceGenerationBrief: null,
    soulArtifactVoiceEnabledForTurn: true,
    onSoulArtifactVoiceEnabledForTurnChange: noop,
    turns: [],
    threadItems: [],
    currentTurnId: null,
    threadRead: null,
    activeExecutionRuntime: null,
    pendingActions: [],
    submittedActionsInFlight: [],
    onRespondToAction: noop,
    messages: [],
    queuedTurns: [],
    resumeThread: noop,
    replayPendingAction: noop,
    promoteQueuedTurn: noop,
    onObjectiveChanged: noop,
    removeQueuedTurn: noop,
    latestAssistantMessageId: null,
    sessionIdForDiagnostics: null,
    generalWorkbenchEntryPrompt: null,
    handleRestartGeneralWorkbenchEntryPrompt: noop,
    handleContinueGeneralWorkbenchEntryPrompt: noop,
    generalWorkbenchEnabled: false,
    harnessPanelVisible: false,
    setHarnessPanelVisible: noop,
    harnessState: {
      runtimeStatus: null,
      pendingApprovals: [],
      latestContextTrace: [],
      plan: {
        phase: "idle",
        items: [],
      },
      activity: {
        planning: 0,
        filesystem: 0,
        execution: 0,
        web: 0,
        skills: 0,
        delegation: 0,
      },
      delegatedTasks: [],
      outputSignals: [],
      activeFileWrites: [],
      recentFileEvents: [],
      hasSignals: false,
    },
    harnessEnvironment: {
      skillsCount: 0,
      skillNames: [],
      memorySignals: [],
      contextItemsCount: 0,
      activeContextCount: 0,
      contextItemNames: [],
      contextEnabled: false,
    },
    toolInventory: null,
    toolInventoryLoading: false,
    toolInventoryError: null,
    refreshToolInventory: noop,
    mappedTheme: "general",
    activeRuntimeStatusTitle: null,
    handleHarnessLoadFilePreview: noop,
    handleFileClick: noop,
    chatToolPreferences: {
      task: false,
      subagent: false,
    },
    defaultCuratedTaskReferenceMemoryIds: [],
    defaultCuratedTaskReferenceEntries: [],
    pathReferences: [],
    onAddPathReferences: noop,
    onRemovePathReference: noop,
    onClearPathReferences: noop,
    fileManagerOpen: false,
    onToggleFileManager: noop,
    inputCompletionEnabled: true,
    ...overrides,
  };
}

function renderHookNode(props: HookProps): HTMLDivElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  function Probe() {
    const runtime = useWorkspaceInputbarSceneRuntime(props);
    return <>{runtime.inputbarNode}</>;
  }

  act(() => {
    root.render(<Probe />);
  });

  mountedRoots.push({ container, root });
  return container;
}

function getLatestInputbarProps(): {
  disabled?: boolean;
  inputRestoreRequest?: unknown;
  onInputRestoreRequestHandled?: (requestId: string) => void;
  toolStates?: Record<string, boolean>;
  onToolStatesChange?: (states: Record<string, boolean>) => void;
} {
  const latestCall = mockInputbarRender.mock.calls.at(-1);
  expect(latestCall).toBeTruthy();
  return latestCall?.[0] as {
    disabled?: boolean;
    inputRestoreRequest?: unknown;
    onInputRestoreRequestHandled?: (requestId: string) => void;
    toolStates?: Record<string, boolean>;
    onToolStatesChange?: (states: Record<string, boolean>) => void;
  };
}

beforeEach(async () => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  await changeLimeLocale("zh-CN");
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
  vi.clearAllMocks();
});

describe("useWorkspaceInputbarSceneRuntime", () => {
  it("有已保存创作声线时应在输入区显示本轮开关并响应切换", () => {
    const onSoulArtifactVoiceEnabledForTurnChange = vi.fn();
    const container = renderHookNode(
      createDefaultProps({
        soulArtifactVoiceGenerationBrief: {
          voice_source: "brand_voice",
          brand_voice_id: "brand-voice-1",
        },
        soulArtifactVoiceEnabledForTurn: true,
        onSoulArtifactVoiceEnabledForTurnChange,
      }),
    );

    expect(
      container.querySelector('[data-testid="soul-artifact-voice-turn-toggle"]')
        ?.textContent,
    ).toContain("创作声线");
    expect(container.textContent).toContain("本轮使用");

    act(() => {
      (
        container.querySelector(
          '[data-testid="soul-artifact-voice-turn-switch"]',
        ) as HTMLButtonElement
      ).click();
    });

    expect(onSoulArtifactVoiceEnabledForTurnChange).toHaveBeenCalledWith(false);
  });

  it("没有已保存创作声线时不应显示本轮开关", () => {
    const container = renderHookNode(createDefaultProps());

    expect(
      container.querySelector(
        '[data-testid="soul-artifact-voice-turn-toggle"]',
      ),
    ).toBeNull();
  });

  it("应在 Plan 确认态替换底部输入框而不是叠加渲染", () => {
    const container = renderHookNode(
      createDefaultProps({
        planDecisionAccessory: (
          <div data-testid="plan-composer-decision-panel">计划确认</div>
        ),
      }),
    );

    expect(
      container.querySelector('[data-testid="plan-composer-decision-panel"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("计划确认");
    expect(container.querySelector('[data-testid="inputbar-mock"]')).toBeNull();
  });

  it("非 Plan 决策态仍应把附加面板作为输入区 overlay accessory 渲染", () => {
    const container = renderHookNode(
      createDefaultProps({
        generalWorkbenchEntryPrompt: {
          kind: "resume",
          signature: "resume:continue-last-work",
          title: "继续上次工作",
          description: "补充上下文后继续。",
          actionLabel: "继续",
          prompt: "继续上次工作",
        },
      }),
    );

    expect(
      container.querySelector('[data-testid="inputbar-mock"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("继续上次工作");
  });

  it("应把工作区 task 偏好映射为 Inputbar plan 受控状态", () => {
    const setChatToolPreferences = vi.fn();
    renderHookNode(
      createDefaultProps({
        chatToolPreferences: {
          task: true,
          subagent: false,
        },
        setChatToolPreferences,
      }),
    );

    const inputbarProps = getLatestInputbarProps();

    expect(inputbarProps.toolStates).toMatchObject({
      plan: true,
      subagent: false,
    });

    act(() => {
      inputbarProps.onToolStatesChange?.({
        plan: false,
      });
    });

    const updater = setChatToolPreferences.mock.calls[0]?.[0] as (previous: {
      task: boolean;
      subagent: boolean;
    }) => { task: boolean; subagent: boolean };
    expect(updater({ task: true, subagent: true })).toEqual({
      task: false,
      subagent: true,
    });
  });

  it("应把工作区 goal 会话态映射为 Inputbar objective 受控状态", () => {
    renderHookNode(
      createDefaultProps({
        objectiveEnabled: true,
      }),
    );

    expect(getLatestInputbarProps().toolStates).toMatchObject({
      objective: true,
    });
  });

  it("Inputbar goal 变更应只更新 goal 会话态，不写入 ChatToolPreferences", () => {
    const setChatToolPreferences = vi.fn();
    const onObjectiveEnabledChange = vi.fn();
    renderHookNode(
      createDefaultProps({
        setChatToolPreferences,
        onObjectiveEnabledChange,
      }),
    );

    act(() => {
      getLatestInputbarProps().onToolStatesChange?.({
        objective: true,
      });
    });

    expect(setChatToolPreferences).not.toHaveBeenCalled();
    expect(onObjectiveEnabledChange).toHaveBeenCalledWith(true);
  });

  it("任务中心 detached 会话没有 projectId 时仍应允许继续输入", () => {
    renderHookNode(
      createDefaultProps({
        contextVariant: "task-center",
        projectId: null,
        isPreparingSend: false,
      }),
    );

    expect(getLatestInputbarProps().disabled).toBe(false);
  });

  it("会话恢复中应禁用任务中心输入，避免消息落到新会话", () => {
    renderHookNode(
      createDefaultProps({
        contextVariant: "task-center",
        projectId: null,
        isPreparingSend: false,
        isSessionRestoring: true,
      }),
    );

    expect(getLatestInputbarProps().disabled).toBe(true);
  });

  it("普通会话没有 projectId 但已有 sessionId 时仍应允许继续输入", () => {
    renderHookNode(
      createDefaultProps({
        contextVariant: "default",
        projectId: null,
        sessionId: "session-detached",
        isPreparingSend: false,
      }),
    );

    expect(getLatestInputbarProps().disabled).toBe(false);
  });

  it("普通工作区没有 projectId 且没有 sessionId 时仍应禁用输入", () => {
    renderHookNode(
      createDefaultProps({
        contextVariant: "default",
        projectId: null,
        sessionId: null,
        isPreparingSend: false,
      }),
    );

    expect(getLatestInputbarProps().disabled).toBe(true);
  });

  it("应把中断输入恢复请求透传给 inline Inputbar", () => {
    const onInputRestoreRequestHandled = vi.fn();
    const inputRestoreRequest = {
      requestId: "restore-1",
      reason: "thinking_only_cancelled_turn" as const,
      draft: {
        text: "恢复这段输入",
        images: [],
        pathReferences: [],
        inputCapabilityRoute: null,
      },
    };

    renderHookNode(
      createDefaultProps({
        inputRestoreRequest,
        onInputRestoreRequestHandled,
      }),
    );

    expect(getLatestInputbarProps().inputRestoreRequest).toBe(
      inputRestoreRequest,
    );
    getLatestInputbarProps().onInputRestoreRequestHandled?.("restore-1");
    expect(onInputRestoreRequestHandled).toHaveBeenCalledWith("restore-1");
  });
});
