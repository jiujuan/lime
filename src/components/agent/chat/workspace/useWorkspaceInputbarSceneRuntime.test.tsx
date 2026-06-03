import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import { useWorkspaceInputbarSceneRuntime } from "./useWorkspaceInputbarSceneRuntime";

vi.mock("../components/Inputbar", () => ({
  Inputbar: ({ overlayAccessory }: { overlayAccessory?: React.ReactNode }) => (
    <div data-testid="inputbar-mock">{overlayAccessory}</div>
  ),
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

function createDefaultProps(
  overrides: Partial<HookProps> = {},
): HookProps {
  const noop = vi.fn();

  return {
    setMentionedCharacters: noop,
    taskFiles: [],
    taskFilesExpanded: false,
    setTaskFilesExpanded: noop,
    selectedFileId: undefined,
    isThemeWorkbench: true,
    sessionId: "session-1",
    childSubagentSessions: [],
    subagentParentContext: null,
    selectedTeamLabel: undefined,
    selectedTeamSummary: undefined,
    teamDispatchPreviewState: null,
    teamMemorySnapshot: null,
    currentSessionTitle: "当前会话",
    currentSessionRuntimeStatus: undefined,
    currentSessionLatestTurnStatus: undefined,
    liveRuntimeBySessionId: {},
    liveActivityBySessionId: {},
    activityRefreshVersionBySessionId: {},
    handleSendSubagentInput: noop,
    handleWaitSubagentSession: noop,
    handleWaitActiveTeamSessions: noop,
    handleCloseCompletedTeamSessions: noop,
    handleCloseSubagentSession: noop,
    handleResumeSubagentSession: noop,
    teamWaitSummary: null,
    teamControlSummary: null,
    handleStopSending: noop,
    teamWorkspaceEnabled: false,
    handleOpenSubagentSession: noop,
    handleReturnToParentSession: noop,
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
    sessionExecutionRuntime: null,
    projectId: "project-1",
    projectRootPath: "/tmp/project-1",
    accessMode: "default" as any,
    setAccessMode: noop,
    activeTheme: "general",
    navigationActions: {
      handleManageProviders: noop,
      handleOpenRuntimeMemoryWorkbench: noop,
      handleOpenKnowledgeManagement: noop,
    },
    selectedTeam: null,
    handleSelectTeam: noop,
    handleEnableSuggestedTeam: noop,
    layoutMode: "chat",
    handleTaskFileClick: noop,
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
    showGeneralWorkbenchFloatingInputOverlay: false,
    handleActivateTeamWorkbench: noop,
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
      container.querySelector('[data-testid="soul-artifact-voice-turn-toggle"]'),
    ).toBeNull();
  });
});
