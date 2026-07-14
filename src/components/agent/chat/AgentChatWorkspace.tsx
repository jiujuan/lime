/**
 * AI Agent 聊天页面
 *
 * 包含聊天区域、任务中心和工作台布局
 * 支持内容创作模式下的布局过渡和步骤引导
 * 当主题为 general 时，使用 GeneralChat 组件实现
 */

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAgentChatUnified } from "./hooks";
import { useFileManagerSidebar } from "./hooks/useFileManagerSidebar";
import { usePathReferences } from "./hooks/usePathReferences";
import { useWorkspaceWorkbenchRequests } from "./hooks/useWorkspaceWorkbenchRequests";
import { useContentSync } from "./hooks/useContentSync";
import { useDeveloperFeatureFlags } from "@/hooks/useDeveloperFeatureFlags";
import { useServiceModelsConfig } from "@/hooks/useServiceModelsConfig";
import { useSoulArtifactVoiceGenerationBrief } from "@/hooks/useSoulArtifactVoiceGenerationBrief";
import { useSoulInteractionCopy } from "@/hooks/useSoulInteractionCopy";
import { useTrayModelShortcuts } from "./hooks/useTrayModelShortcuts";
import { type TaskFile } from "./components/TaskFiles";
import {
  type CanvasState as GeneralCanvasState,
  DEFAULT_CANVAS_STATE,
} from "@/components/general-chat/bridge";
import {
  cancelMediaTaskArtifact,
  createImageGenerationTaskArtifact,
  getMediaTaskArtifact,
} from "@/lib/api/mediaTasks";
import { type Character } from "@/lib/api/projectMemory";
import type { WriteArtifactContext } from "./types";
import {
  isSpecializedWorkbenchTheme,
  type ThemeType,
} from "@/lib/workspace/workbenchContract";
import { normalizeProjectId } from "./utils/topicProjectResolution";
import { useThemeScopedChatToolPreferences } from "./hooks/useThemeScopedChatToolPreferences";
import { useWorkspaceProjectSelection } from "./hooks/useWorkspaceProjectSelection";
import { useWorkbenchStore } from "@/stores/useWorkbenchStore";
import { useWorkspaceHarnessInventoryRuntime } from "./workspace/useWorkspaceHarnessInventoryRuntime";
import { useWorkspaceCanvasSceneRuntime } from "./workspace/useWorkspaceCanvasSceneRuntime";
import { useWorkspaceCanvasMessageSyncRuntime } from "./workspace/useWorkspaceCanvasMessageSyncRuntime";
import { useWorkspaceInputbarSceneRuntime } from "./workspace/useWorkspaceInputbarSceneRuntime";
import { useWorkspaceNavigationActions } from "./workspace/useWorkspaceNavigationActions";
import { useWorkspaceArtifactActionRuntime } from "./workspace/useWorkspaceArtifactActionRuntime";
import { useWorkspaceCanvasSurfaceRuntime } from "./workspace/useWorkspaceCanvasSurfaceRuntime";
import { useSessionRecentMetadataSyncRuntime } from "./workspace/useSessionRecentMetadataSyncRuntime";
import { useWorkspaceTaskCenterInteractionRuntime } from "./workspace/useWorkspaceTaskCenterInteractionRuntime";
import { useWorkspaceTaskCenterSendRuntime } from "./workspace/useWorkspaceTaskCenterSendRuntime";
import { useWorkspaceTaskCenterNavigationRuntime } from "./workspace/useWorkspaceTaskCenterNavigationRuntime";
import { useWorkspaceTaskCenterSurfaceRuntime } from "./workspace/useWorkspaceTaskCenterSurfaceRuntime";
import { useWorkspaceImageWorkbenchSessionRuntime } from "./workspace/useWorkspaceImageWorkbenchSessionRuntime";
import { useWorkspaceSessionRestore } from "./workspace/useWorkspaceSessionRestore";
import { useWorkspaceResetRuntime } from "./workspace/useWorkspaceResetRuntime";
import { useWorkspaceSendSurfaceRuntime } from "./workspace/useWorkspaceSendSurfaceRuntime";
import { useGeneralWorkbenchInitialDispatchRuntime } from "./workspace/useGeneralWorkbenchInitialDispatchRuntime";
import { useWorkspaceWorkbenchSideEffectRuntime } from "./workspace/useWorkspaceWorkbenchSideEffectRuntime";
import { useWorkspaceSystemPromptRuntime } from "./workspace/useWorkspaceSystemPromptRuntime";
import { useWorkspaceGeneralWorkbenchScaffoldRuntime } from "./workspace/useWorkspaceGeneralWorkbenchScaffoldRuntime";
import { useWorkspacePlanDecisionRuntime } from "./workspace/useWorkspacePlanDecisionRuntime";
import { useWorkspaceTaskCenterDraftStateRuntime } from "./workspace/useWorkspaceTaskCenterDraftStateRuntime";
import { useWorkspaceGeneralWorkbenchSidebarHostRuntime } from "./workspace/useWorkspaceGeneralWorkbenchSidebarHostRuntime";
import { useWorkspaceGeneralWorkbenchHarnessSurfaceRuntime } from "./workspace/useWorkspaceGeneralWorkbenchHarnessSurfaceRuntime";
import { useWorkspaceGeneralWorkbenchRuntime } from "./workspace/useWorkspaceGeneralWorkbenchRuntime";
import { useWorkspaceTeamRuntime } from "./workspace/useWorkspaceTeamRuntime";
import { useWorkspaceGeneralWorkbenchDocumentPersistenceRuntime } from "./workspace/useWorkspaceGeneralWorkbenchDocumentPersistenceRuntime";
import { useWorkspaceServiceSkillEntryActions } from "./workspace/useWorkspaceServiceSkillEntryActions";
import { useWorkspaceWorkbenchActionSurfaceRuntime } from "./workspace/useWorkspaceWorkbenchActionSurfaceRuntime";
import { useWorkspaceImageWorkbenchProviderRuntime } from "./workspace/useWorkspaceImageWorkbenchProviderRuntime";
import { useWorkspaceMessageKnowledgeSaveRuntime } from "./workspace/useWorkspaceMessageKnowledgeSaveRuntime";
import { useWorkspaceMessageSkillSaveRuntime } from "./workspace/useWorkspaceMessageSkillSaveRuntime";
import { useWorkspaceOpenedProjectsRuntime } from "./workspace/useWorkspaceOpenedProjectsRuntime";
import { useWorkspaceProjectContentRuntime } from "./workspace/useWorkspaceProjectContentRuntime";
import { useWorkspaceHealthRuntime } from "./workspace/useWorkspaceHealthRuntime";
import { useWorkspaceDefaultProjectAliasRuntime } from "./workspace/useWorkspaceDefaultProjectAliasRuntime";
import { GENERAL_WORKBENCH_HISTORY_PAGE_SIZE } from "./workspace/generalWorkbenchHelpers";
import { normalizeInitialTheme } from "./agentChatWorkspaceShared";
import type { AgentChatWorkspaceProps } from "./agentChatWorkspaceContract";
import type { SkillScaffoldDraft } from "@/types/page";
import type { ExpertSkillsManageOptions } from "./experts/ExpertSkillsSection";
import { resolveEffectiveInitialInputCapability } from "./utils/inputCapabilityBootstrap";
import { resolveAgentChatWorkspaceShellViewModel } from "./agentChatWorkspaceShellViewModel";
import { AutomationJobDialog } from "@/components/settings-v2/system/automation/AutomationJobDialog";
import { useWorkspaceShellChromeRuntime } from "./workspace/useWorkspaceShellChromeRuntime";
import { resolveWorkspaceEntryLoadDeferral } from "./workspace/workspaceEntryLoadDeferral";
import { resolveBrowserRuntimeNavigationFromSiteSkill } from "./workspace/workspaceBrowserRuntimeNavigation";
import { useWorkspaceContextSurfaceRuntime } from "./workspace/useWorkspaceContextSurfaceRuntime";
import {
  createRestoredInteractiveMessageSnapshot,
  resolveReadOnlyInteractiveMessageIds,
} from "./workspace/workspaceRestoredInteractiveMessages";
import {
  EMPTY_WORKSPACE_WORKFLOW_STEPS,
  HIDDEN_WORKSPACE_WORKFLOW_STEP_INDEX,
  ignoreHiddenWorkspaceWorkflowStepClick,
  useWorkspaceHiddenWorkflowProgressRuntime,
} from "./workspace/useWorkspaceHiddenWorkflowProgressRuntime";
import { useWorkspaceDebugRuntime } from "./workspace/useWorkspaceDebugRuntime";
import { useWorkspaceClassicClawSidebarRuntime } from "./workspace/useWorkspaceClassicClawSidebarRuntime";
import { useWorkspaceChatToolPreferencesRuntime } from "./workspace/useWorkspaceChatToolPreferencesRuntime";
import { useWorkspaceSkillDirectoryRuntime } from "./workspace/useWorkspaceSkillDirectoryRuntime";
import { useWorkspaceArtifactSurfaceRuntime } from "./workspace/useWorkspaceArtifactSurfaceRuntime";
import { useWorkspaceArtifactCanvasRuntime } from "./workspace/useWorkspaceArtifactCanvasRuntime";
import { useWorkspaceExpertSkillPanelRuntime } from "./workspace/useWorkspaceExpertSkillPanelRuntime";
import { useWorkspaceTeamMemoryRuntime } from "./workspace/useWorkspaceTeamMemoryRuntime";
import { useWorkspaceSubagentNavigationRuntime } from "./workspace/useWorkspaceSubagentNavigationRuntime";
import { useWorkspaceContextDetailRuntime } from "./workspace/useWorkspaceContextDetailRuntime";
import {
  useWorkspaceActiveContentTargetRuntime,
  useWorkspaceEntryStateRuntime,
  useWorkspaceSoulArtifactVoiceTurnRuntime,
  useWorkspaceTaskFilesRefSyncRuntime,
} from "./workspace/useWorkspaceEntrySideEffectsRuntime";
import { useWorkspaceHarnessRequestMetadataRuntime } from "./workspace/useWorkspaceHarnessRequestMetadataRuntime";
import { useWorkspacePersistenceRuntime } from "./workspace/useWorkspacePersistenceRuntime";
import { useWorkspaceHarnessNavigationRuntime } from "./workspace/useWorkspaceHarnessNavigationRuntime";
import { useWorkspaceEntryProjectionRuntime } from "./workspace/useWorkspaceEntryProjectionRuntime";
import { useWorkspacePendingInputRuntime } from "./workspace/useWorkspacePendingInputRuntime";
import { useAgentChatWorkspaceLocalDisplayState } from "./workspace/useAgentChatWorkspaceLocalDisplayState";
import { useAgentChatWorkspaceSceneComposition } from "./workspace/useAgentChatWorkspaceSceneComposition";
import {
  GENERAL_BROWSER_ASSIST_PROFILE_KEY,
  NOOP_SET_CHAT_MESSAGES,
} from "./workspace/agentChatWorkspaceHelpers";

export type {
  AgentBackgroundSessionRuntimeSnapshot,
  AgentChatWorkspaceProps,
  WorkflowProgressSnapshot,
} from "./agentChatWorkspaceContract";

export function AgentChatWorkspace({
  onNavigate: _onNavigate,
  projectId: externalProjectId,
  contentId,
  initialSessionId,
  initialSceneAppExecutionSummary,
  initialRequestMetadata,
  initialAutoSendRequestMetadata,
  autoRunInitialPromptOnMount = false,
  agentEntry = "claw",
  theme: initialTheme,
  initialCreationMode,
  lockTheme = false,
  fromResources = false,
  showChatPanel = true,
  hideTopBar = false,
  topBarChrome = "full",
  onBackToProjectManagement,
  hideInlineStepProgress = false,
  onWorkflowProgressChange,
  initialUserPrompt,
  initialUserImages,
  initialSessionName: _initialSessionName,
  entryBannerMessage,
  initialPendingServiceSkillLaunch,
  initialInputCapability,
  initialKnowledgePackSelection,
  initialProjectFileOpenTarget,
  onInitialUserPromptConsumed,
  newChatAt,
  expertAgentLaunch,
  onRecommendationClick: _onRecommendationClick,
  onHasMessagesChange,
  onSessionChange,
  onAgentStreamingChange,
  onBackgroundSessionRuntimeChange,
  preferContentReviewInRightRail = false,
  openBrowserAssistOnMount = false,
  initialSiteSkillLaunch,
}: AgentChatWorkspaceProps) {
  const { t } = useTranslation("agent");
  const { t: tNavigation } = useTranslation("navigation");
  const untitledTaskLabel = t(
    "generalWorkbench.workflow.outputs.summary.untitledTask",
  );
  const taskCenterRenamePromptLabel = tNavigation(
    "navigation.sidebar.conversations.rename.prompt",
  );
  const newConversationLabel = "新对话";

  // 性能埋点：记录组件渲染开始时间
  const workspaceRenderT0 = useRef<number>(performance.now());
  useEffect(() => {
    console.info(
      `[PERF] AgentChatWorkspace mounted: ${(performance.now() - workspaceRenderT0.current).toFixed(0)}ms`,
    );
  }, []);

  const normalizedEntryTheme = normalizeInitialTheme(initialTheme);
  const shouldAutoCollapseClassicClawSidebar = agentEntry === "claw";
  const defaultTopicSidebarVisible =
    showChatPanel && !shouldAutoCollapseClassicClawSidebar;
  const shouldBootstrapCanvasOnEntry =
    Boolean(contentId) && isSpecializedWorkbenchTheme(normalizedEntryTheme);
  const shouldKeepNewTaskHomeSessionRestoreDisabled =
    agentEntry === "new-task" && !contentId;
  const {
    activeTheme,
    artifactPreviewSize,
    canvasWorkbenchLayoutMode,
    creationMode,
    effectiveEntryBannerMessage,
    entryBannerVisible,
    expertInfoPanelCollapsed,
    handleCollapseTopicSidebarForFileManager,
    handleInputRestoreRequestHandled,
    handleRestoreInterruptedInput,
    input,
    inputbarObjectiveModeEnabled,
    inputRestoreRequest,
    layoutMode,
    runtimeInitialInputCapability,
    selectedText,
    setActiveTheme,
    setArtifactPreviewSize,
    setCanvasWorkbenchLayoutMode,
    setCreationMode,
    setEntryBannerVisible,
    setExpertInfoPanelCollapsed,
    setInput,
    setInputbarObjectiveModeEnabled,
    setLayoutMode,
    setRuntimeEntryBannerMessage,
    setRuntimeInitialInputCapability,
    setSelectedText,
    setShowSidebar,
    showSidebar,
  } = useAgentChatWorkspaceLocalDisplayState({
    defaultTopicSidebarVisible,
    entryBannerMessage,
    initialCreationMode,
    normalizedEntryTheme,
    shouldBootstrapCanvasOnEntry,
  });
  const {
    pathReferences,
    addPathReferences: handleAddPathReferences,
    removePathReference: handleRemovePathReference,
    clearPathReferences: handleClearPathReferences,
  } = usePathReferences();
  const fileManagerSidebar = useFileManagerSidebar({
    onCollapseTopicSidebar: handleCollapseTopicSidebarForFileManager,
  });
  const handleInstallSkillPackageFromFileManager = useCallback(
    (entry: { path: string; name: string }) => {
      _onNavigate?.("skills", {
        initialView: "installed",
        initialSkillPackagePath: entry.path,
        initialSkillPackageName: entry.name,
        initialSkillPackageRequestKey: Date.now(),
      });
    },
    [_onNavigate],
  );
  const handleOpenSkillsManageFromExpertPanel = useCallback(
    (options?: ExpertSkillsManageOptions) => {
      const searchQuery = options?.searchQuery?.trim();
      const scaffoldDraft: SkillScaffoldDraft | undefined =
        options?.scaffoldDraft;
      const requestKey = Date.now();
      _onNavigate?.("skills", {
        initialView: "installed",
        ...(searchQuery
          ? {
              initialSearchQuery: searchQuery,
              initialSearchRequestKey: requestKey,
            }
          : null),
        ...(scaffoldDraft
          ? {
              initialScaffoldDraft: scaffoldDraft,
              initialScaffoldRequestKey: requestKey,
            }
          : null),
      });
    },
    [_onNavigate],
  );
  const {
    activeSessionIdRef,
    chatToolPreferenceSessionSync,
    deferSessionRecentMetadataSyncForNavigation,
    selectedTeamSessionSync,
    syncSessionRecentPreferences,
  } = useSessionRecentMetadataSyncRuntime();
  const {
    chatToolPreferences,
    setChatToolPreferences,
    syncChatToolPreferencesSource,
    getSyncedSessionRecentPreferences,
  } = useThemeScopedChatToolPreferences(activeTheme, {
    sessionSync: chatToolPreferenceSessionSync,
  });
  const handleOpenSubagents = useCallback(() => {
    setChatToolPreferences((previous) =>
      previous.subagent ? previous : { ...previous, subagent: true },
    );
  }, [setChatToolPreferences]);
  const {
    projectId,
    shouldDisableSessionRestore,
    hasHandledNewChatRequest,
    markNewChatRequestHandled,
    rememberProjectId,
    getRememberedProjectId,
    applyProjectSelection,
    resetProjectSelection,
    clearProjectSelectionRuntime,
    startTopicProjectResolution,
    finishTopicProjectResolution,
    deferTopicSwitch,
    consumePendingTopicSwitch,
  } = useWorkspaceProjectSelection({
    externalProjectId,
    initialSessionId,
    keepNewChatSessionRestoreDisabled:
      shouldKeepNewTaskHomeSessionRestoreDisabled,
    newChatAt,
  });
  const taskCenterWorkspaceId = normalizeProjectId(projectId);
  const normalizedInitialSessionId =
    typeof initialSessionId === "string" && initialSessionId.trim().length > 0
      ? initialSessionId.trim()
      : null;
  const sessionRestorePresentation =
    shouldKeepNewTaskHomeSessionRestoreDisabled && !normalizedInitialSessionId
      ? "background"
      : "foreground";
  const {
    shouldPreserveEntryThemeOnHome,
    shouldPreserveBlankHomeSurface,
    shouldUseBrowserWorkspaceHomeChrome,
    shouldDeferWorkspaceAuxiliaryLoads,
    shouldDeferInitialTopicsLoad,
    shouldDeferInitialRuntimeWarmup,
    deferredWorkspaceAuxiliaryLoadMs,
    deferredInitialTopicsLoadMs,
    deferredInitialRuntimeWarmupMs,
  } = resolveWorkspaceEntryLoadDeferral({
    agentEntry,
    contentId,
    normalizedEntryTheme,
    normalizedInitialSessionId,
    initialUserPrompt,
    initialUserImages,
    initialSiteSkillLaunch,
    initialPendingServiceSkillLaunch,
    initialInputCapability,
    initialProjectFileOpenTarget,
  });
  const {
    project,
    setProject,
    projectMemory,
    setProjectMemory,
    isInitialContentLoading,
    initialContentLoadError,
    canvasState,
    setCanvasState,
    documentVersionStatusMap,
    setDocumentVersionStatusMap,
    contentMetadataRef,
    persistedWorkbenchSnapshotRef,
    lastCanvasSyncRequestRef,
  } = useWorkspaceProjectContentRuntime({
    projectId,
    contentId,
    externalProjectId,
    lockTheme,
    initialTheme,
    normalizedEntryTheme,
    shouldBootstrapCanvasOnEntry,
    shouldDeferWorkspaceAuxiliaryLoads,
    shouldPreserveEntryThemeOnHome,
    deferredWorkspaceAuxiliaryLoadMs,
    resetProjectSelection,
    setActiveTheme,
    setLayoutMode,
  });

  useWorkspaceEntryStateRuntime({
    effectiveEntryBannerMessage,
    entryBannerMessage,
    initialCreationMode,
    initialTheme,
    setActiveTheme,
    setCreationMode,
    setEntryBannerVisible,
    setRuntimeEntryBannerMessage,
  });

  useWorkspaceDefaultProjectAliasRuntime({
    applyProjectSelection,
    externalProjectId,
    getRememberedProjectId,
    projectId,
    resetProjectSelection,
    setProject,
  });

  const {
    dismissedInitialPendingServiceSkillLaunchSignatureRef,
    handledInitialPendingServiceSkillLaunchSignatureRef,
    initialAutoSendAllowsDetachedSession,
    initialCreationReplay,
    initialCreationReplaySurface,
    initialPendingServiceSkillLaunchSignature,
    runtimeWorkspaceId,
    validatedRuntimeProjectId,
  } = useWorkspaceEntryProjectionRuntime({
    initialAutoSendRequestMetadata,
    initialPendingServiceSkillLaunch,
    initialRequestMetadata,
    projectId,
    resolvedProjectId: project?.id,
    taskCenterWorkspaceId,
  });

  useWorkspaceActiveContentTargetRuntime({
    canvasType: canvasState?.type ?? null,
    contentId,
    projectId,
  });

  // General 主题专用画布状态
  const [generalCanvasState, setGeneralCanvasState] =
    useState<GeneralCanvasState>(DEFAULT_CANVAS_STATE);

  // 任务文件状态
  const [taskFiles, setTaskFiles] = useState<TaskFile[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | undefined>();
  const taskFilesRef = useRef<TaskFile[]>([]);
  const socialStageLogRef = useRef<Record<string, string>>({});

  const { openedProjects, handleCloseOpenedProject } =
    useWorkspaceOpenedProjectsRuntime({
      enabled: !shouldDeferWorkspaceAuxiliaryLoads,
      project,
      projectId,
      applyProjectSelection,
      setProject,
      setProjectMemory,
    });
  const { clawTraceEnabled, workspaceHarnessEnabled } =
    useDeveloperFeatureFlags({
      enabled: !shouldDeferWorkspaceAuxiliaryLoads,
    });
  const {
    serviceModels,
    agentResponseLanguage,
    refresh: refreshServiceModelsConfig,
  } = useServiceModelsConfig({
    enabled: !shouldDeferWorkspaceAuxiliaryLoads,
  });
  const { generationBrief: soulArtifactVoiceGenerationBrief } =
    useSoulArtifactVoiceGenerationBrief({
      enabled: !shouldDeferWorkspaceAuxiliaryLoads,
    });
  const soulInteractionCopy = useSoulInteractionCopy({
    enabled: !shouldDeferWorkspaceAuxiliaryLoads,
  });
  const [soulArtifactVoiceEnabledForTurn, setSoulArtifactVoiceEnabledForTurn] =
    useState(true);
  useWorkspaceSoulArtifactVoiceTurnRuntime({
    generationBrief: soulArtifactVoiceGenerationBrief,
    setSoulArtifactVoiceEnabledForTurn,
  });
  const inputCompletionEnabled =
    serviceModels.input_completion?.enabled !== false;
  const {
    effectiveImageWorkbenchPreference,
    imageGenerationSelectionReady,
    imageGenerationSelectionWarning,
    imageWorkbenchGenerationRuntime,
    imageWorkbenchPreferenceSummary,
    imageWorkbenchPreferenceWarning,
    setOnDemandMediaDefaults,
  } = useWorkspaceImageWorkbenchProviderRuntime({
    contentId,
    deferredWorkspaceAuxiliaryLoadMs,
    initialSessionId,
    projectImageGenerationPreference: project?.settings?.imageGeneration,
    selectionProjectId: externalProjectId ?? project?.id ?? null,
    shouldDeferWorkspaceAuxiliaryLoads,
  });
  const {
    selectedProviderId: imageWorkbenchSelectedProviderId,
    selectedModelId: imageWorkbenchSelectedModelId,
    selectedSize: imageWorkbenchSelectedSize,
    setSelectedSize: setImageWorkbenchSelectedSize,
    preferredProviderUnavailable: imageWorkbenchPreferredProviderUnavailable,
    ensureProvidersLoaded: ensureImageWorkbenchProvidersLoaded,
    providersLoading: imageWorkbenchProvidersLoading,
    saveImagesToResource: saveImageWorkbenchImagesToResource,
  } = imageWorkbenchGenerationRuntime;

  useWorkspaceTaskFilesRefSyncRuntime({
    taskFiles,
    taskFilesRef,
  });

  // 引用的角色列表（用于注入到消息中）
  const [mentionedCharacters, setMentionedCharacters] = useState<Character[]>(
    [],
  );
  const {
    skills,
    skillsLoading,
    serviceSkills,
    serviceSkillGroups,
    serviceSkillsLoading,
    serviceSkillsError,
    recordServiceSkillUsage,
    handleRefreshSkills,
    handleSkillSuggestionsNeeded,
  } = useWorkspaceSkillDirectoryRuntime({
    activeTheme,
    autoLoadServiceSkills: Boolean(initialPendingServiceSkillLaunchSignature),
    deferredDelayMs: deferredWorkspaceAuxiliaryLoadMs,
    shouldDeferWorkspaceAuxiliaryLoads,
  });

  // Workbench Store（用于工作区右侧技能面板状态同步）
  const pendingSkillKey = useWorkbenchStore((state) => state.pendingSkillKey);
  const clearThemeSkillsRailState = useWorkbenchStore(
    (state) => state.clearThemeSkillsRailState,
  );
  const consumePendingSkill = useWorkbenchStore(
    (state) => state.consumePendingSkill,
  );

  // 用于追踪已处理的消息 ID，避免重复处理
  const processedMessageIds = useRef<Set<string>>(new Set());
  // 文件写入回调 ref（用于传递给统一聊天主链 Hook）
  const handleWriteFileRef =
    useRef<
      (
        content: string,
        fileName: string,
        context?: WriteArtifactContext,
      ) => void
    >();
  const sceneGateResumeHandlerRef = useRef<
    (input: {
      rawText: string;
      requestMetadata: Record<string, unknown>;
    }) => Promise<boolean>
  >(async () => false);

  const mappedTheme = activeTheme as ThemeType;

  // 内容同步 Hook
  const { syncContent, syncStatus } = useContentSync({
    debounceMs: 2000,
    autoRetry: true,
    retryDelayMs: 5000,
  });

  // 判断是否为内容创作模式
  const isSpecializedThemeMode = isSpecializedWorkbenchTheme(activeTheme);

  const workbenchRequests = useWorkspaceWorkbenchRequests();

  // 跳转到技能主页面
  const handleNavigateToSkillSettings = useCallback(() => {
    _onNavigate?.("skills");
  }, [_onNavigate]);
  useEffect(() => {
    const normalizedProjectId = normalizeProjectId(projectId);
    if (!normalizedProjectId) {
      return;
    }

    if (project?.id === normalizedProjectId && project.isArchived) {
      return;
    }
    rememberProjectId(normalizedProjectId);
  }, [project, projectId, rememberProjectId]);

  const { chatMode, generalHarnessEntryEnabled, systemPrompt } =
    useWorkspaceSystemPromptRuntime({
      chatToolPreferences,
      contentId,
      creationMode,
      isSpecializedThemeMode,
      mappedTheme,
      projectMemory,
    });

  // 使用 Agent Chat Hook（传递系统提示词）
  const {
    providerType,
    setProviderType,
    model,
    setModel,
    reasoningEffort,
    setReasoningEffort,
    executionStrategy,
    accessMode,
    setAccessMode,
    messages = [],
    setMessages: setChatMessages = NOOP_SET_CHAT_MESSAGES,
    currentTurnId,
    turns = [],
    threadItems = [],
    todoItems = [],
    queuedTurns = [],
    threadRead = null,
    executionRuntime = null,
    sessionWorkingDir = null,
    activeExecutionRuntime = null,
    isSending,
    sendMessage,
    compactSession = async () => undefined,
    stopSending,
    resumeThread = async () => false,
    replayPendingAction = async () => false,
    promoteQueuedTurn = async () => false,
    removeQueuedTurn = async () => false,
    clearMessages,
    deleteMessage,
    editMessage,
    handlePermissionResponse,
    pendingActions = [],
    submittedActionsInFlight = [],
    triggerAIGuide,
    topics = [],
    sessionHistoryWindow = null,
    isAutoRestoringSession = false,
    isSessionHydrating = false,
    sessionId,
    createFreshSession,
    ensureSession = async () => null,
    switchTopic: originalSwitchTopic,
    loadFullSessionHistory = async () => false,
    refreshSessionReadModel = async () => false,
    renameTopic,
    workspacePathMissing = false,
    fixWorkspacePathAndRetry,
    dismissWorkspacePathError,
  } = useAgentChatUnified({
    systemPrompt,
    onWriteFile: (content, fileName, context) => {
      // 使用 ref 调用最新的 handleWriteFile
      handleWriteFileRef.current?.(content, fileName, context);
    },
    workspaceId: runtimeWorkspaceId,
    workingDir: project?.rootPath || null,
    disableSessionRestore: shouldDisableSessionRestore,
    sessionRestorePresentation,
    initialTopicsLoadMode: shouldDeferInitialTopicsLoad
      ? "deferred"
      : "immediate",
    initialTopicsDeferredDelayMs: shouldDeferInitialTopicsLoad
      ? deferredInitialTopicsLoadMs
      : undefined,
    initialRuntimeWarmupLoadMode: shouldDeferInitialRuntimeWarmup
      ? "deferred"
      : "immediate",
    initialRuntimeWarmupDeferredDelayMs: shouldDeferInitialRuntimeWarmup
      ? deferredInitialRuntimeWarmupMs
      : undefined,
    getSyncedSessionRecentPreferences,
    onOpenSubagents: handleOpenSubagents,
    onRestoreInterruptedInput: handleRestoreInterruptedInput,
    clawTraceEnabled,
    soulCopy: soulInteractionCopy,
  });
  const { workspaceHealthError, setWorkspaceHealthError } =
    useWorkspaceHealthRuntime({
      enabled:
        !shouldDeferWorkspaceAuxiliaryLoads || Boolean(workspacePathMissing),
      project,
      projectId,
      workspacePathMissing,
      shouldDeferWorkspaceAuxiliaryLoads,
      deferredWorkspaceAuxiliaryLoadMs,
    });
  const activeSessionKey = sessionId?.trim() || null;
  const {
    combinedSkillsLoading,
    expertPanelRequestMetadata,
    expertPanelRuntimeKey,
    expertSkillRefsOverride,
    expertWorkspaceSkillRuntimeEnableBindings,
    expertWorkspaceSkillRuntimeEnableInput,
    expertWorkspaceSkillRuntimeEnableRefs,
    handleEnableExpertWorkspaceSkillRuntime,
    handleExpertSkillRefsChange,
    handlePluginSuggestionsNeeded,
    handleThreadExpertProfileSwitch,
    workspacePluginInputSuggestions,
    workspacePluginRuntimeContext,
    workspaceRequestMetadataWithExpertSkills,
    workspaceSkillBindings,
  } = useWorkspaceExpertSkillPanelRuntime({
    activeSessionKey,
    activeTheme,
    deferredDelayMs: shouldDeferWorkspaceAuxiliaryLoads
      ? deferredWorkspaceAuxiliaryLoadMs
      : undefined,
    expertAgentLaunch,
    initialAutoSendRequestMetadata,
    initialRequestMetadata,
    newChatAt,
    onOpenSkillsManage: _onNavigate
      ? handleOpenSkillsManageFromExpertPanel
      : undefined,
    serviceSkillsLoading,
    skillsLoading,
    threadRead,
    workspaceRoot: project?.rootPath,
  });
  const restoredInteractiveMessageSnapshotRef = useRef(
    createRestoredInteractiveMessageSnapshot(),
  );
  const readOnlyInteractiveMessageIds = useMemo<ReadonlySet<string>>(() => {
    return resolveReadOnlyInteractiveMessageIds({
      snapshot: restoredInteractiveMessageSnapshotRef.current,
      activeSessionKey,
      messages,
      normalizedInitialSessionId,
      isAutoRestoringSession,
      isSessionHydrating,
      isLoadingFullSessionHistory: sessionHistoryWindow?.isLoadingFull === true,
    });
  }, [
    activeSessionKey,
    isAutoRestoringSession,
    isSessionHydrating,
    messages,
    normalizedInitialSessionId,
    sessionHistoryWindow?.isLoadingFull,
  ]);
  const topicById = useMemo(
    () => new Map(topics.map((topic) => [topic.id, topic])),
    [topics],
  );
  activeSessionIdRef.current = sessionId;
  const { autoCollapsedTopicSidebarRef } =
    useWorkspaceClassicClawSidebarRuntime({
      contentId,
      externalProjectId,
      newChatAt,
      normalizedEntryTheme,
      sessionId,
      shouldAutoCollapseClassicClawSidebar,
      setShowSidebar,
    });
  const {
    selectedTeam,
    preferredTeamPresetId,
    selectedTeamLabel,
    selectedTeamSummary,
    resolvedTeamMemoryShadowSnapshot,
  } = useWorkspaceTeamMemoryRuntime({
    activeTheme,
    runtimeSelection: executionRuntime?.recent_team_selection ?? null,
    sessionId,
    selectedTeamSessionSync,
    workspaceRoot: project?.rootPath,
  });
  const effectiveChatToolPreferences = useWorkspaceChatToolPreferencesRuntime({
    activeTheme,
    chatToolPreferences,
    executionRuntime,
    executionStrategy,
    sessionId,
    setChatToolPreferences,
    syncChatToolPreferencesSource,
    syncSessionRecentPreferences,
  });

  const {
    canonicalChildren,
    currentSessionTitle,
    handleStopSending,
    hasRuntimeSessions,
    subagentsRuntimeVisible,
  } = useWorkspaceTeamRuntime({
    canonicalRefreshKey: threadItems
      .map((item) => `${item.id}:${item.status}:${item.updated_at}`)
      .join("|"),
    referencedChildThreadIds: threadItems.flatMap((item) =>
      item.type === "subagent_activity" && item.session_id?.trim()
        ? [item.session_id.trim()]
        : [],
    ),
    session: {
      currentTopicId: sessionId,
      parentThreadId: threadRead?.thread_id ?? sessionId,
      topics,
      subagentEnabled: effectiveChatToolPreferences.subagent,
    },
    stopSending,
  });
  const { handleOpenSubagentSession } = useWorkspaceSubagentNavigationRuntime({
    canonicalChildren,
    deferSessionRecentMetadataSyncForNavigation,
    switchTopic: originalSwitchTopic,
  });
  const {
    currentImageWorkbenchState,
    imageWorkbenchSessionKey,
    resetLocalImageWorkbenchSessionScope,
    updateCurrentImageWorkbenchState,
  } = useWorkspaceImageWorkbenchSessionRuntime({
    contentId,
    messages,
    projectId,
    sessionId,
  });
  useEffect(() => {
    if (!shouldDeferWorkspaceAuxiliaryLoads) {
      return;
    }
    if (
      !currentImageWorkbenchState.active &&
      currentImageWorkbenchState.tasks.length === 0
    ) {
      return;
    }

    ensureImageWorkbenchProvidersLoaded();
  }, [
    currentImageWorkbenchState.active,
    currentImageWorkbenchState.tasks.length,
    ensureImageWorkbenchProvidersLoaded,
    shouldDeferWorkspaceAuxiliaryLoads,
  ]);
  useWorkspaceDebugRuntime({
    agentEntry,
    contentId,
    externalProjectId,
    initialCreationMode,
    initialTheme,
    lockTheme,
    stateSnapshot: {
      activeTheme,
      contentId: contentId ?? null,
      initialContentLoadError: initialContentLoadError ?? null,
      isAutoRestoringSession,
      isInitialContentLoading,
      isSessionHydrating,
      isSending,
      layoutMode,
      messagesCount: messages.length,
      projectId: projectId ?? null,
      sessionId: sessionId ?? null,
      skillsCount: skills.length,
      skillsLoading: combinedSkillsLoading,
      topicsCount: topics.length,
      workspaceHealthError,
    },
  });
  const {
    artifacts,
    artifactDisplayState,
    artifactOpenControl: browserAssistArtifactOpenControl,
    artifactViewMode,
    applyAutoArtifactViewMode,
    browserAssistLaunching,
    browserAssistRequestAutoLaunch,
    browserAssistRequestPreferredBackend,
    browserAssistRequestProfileKey,
    browserAssistSessionRef,
    browserAssistSessionState,
    canvasControl: browserAssistCanvasControl,
    currentCanvasArtifact,
    currentBrowserAssistScopeKey,
    displayedCanvasArtifact,
    ensureBrowserAssistCanvas,
    handleArtifactViewModeChange,
    handleOpenBrowserRuntimeForBrowserAssist,
    setSelectedArtifactId,
    settledWorkbenchArtifacts,
    siteSkillExecutionState,
    upsertGeneralArtifact,
  } = useWorkspaceArtifactCanvasRuntime({
    activeTheme,
    contentId,
    generalBrowserAssistProfileKey: GENERAL_BROWSER_ASSIST_PROFILE_KEY,
    generalCanvasState,
    input,
    initialAutoSendRequestMetadata,
    initialSiteSkillLaunch,
    initialUserPrompt,
    mappedTheme,
    messages,
    onNavigate: _onNavigate,
    openBrowserAssistOnMount,
    projectId,
    sessionId,
    setLayoutMode,
    siteSkillLaunchNonce: newChatAt,
    isSending,
    workbenchRequests,
  });
  const handleOpenBrowserRuntimeForSiteSkillExecution = useCallback(() => {
    if (!_onNavigate || !initialSiteSkillLaunch?.adapterName?.trim()) {
      return;
    }

    _onNavigate(
      "browser-runtime",
      resolveBrowserRuntimeNavigationFromSiteSkill({
        contentId,
        initialSiteSkillLaunch,
        projectId,
        siteSkillExecutionState,
      }),
    );
  }, [
    contentId,
    initialSiteSkillLaunch,
    _onNavigate,
    projectId,
    siteSkillExecutionState,
  ]);
  const contextSurfaceRuntime = useWorkspaceContextSurfaceRuntime({
    activeTheme,
    generalHarnessEntryEnabled,
    isSending,
    layoutMode,
    mappedTheme,
    messages,
    model,
    onAgentStreamingChange,
    onSessionChange,
    pendingActions,
    projectId,
    projectMemory,
    providerType,
    sessionId,
    threadItems,
    threadRead,
    todoItems,
    workspaceHarnessEnabled,
  });
  const {
    contextHarnessRuntime,
    effectiveThreadItems,
    harnessState,
    harnessRuntimeVisible,
    harnessShellState,
    inputbarIsSending,
    rightSurfaceLocalState,
  } = contextSurfaceRuntime;
  const { openArticleWorkspaceRightSurface } = rightSurfaceLocalState;
  const {
    contextWorkspace,
    isThemeWorkbench,
    harnessPanelVisible,
    setHarnessPanelVisible,
    harnessPendingCount,
    showHarnessToggle,
    harnessAttentionLevel,
    harnessToggleLabel,
  } = contextHarnessRuntime;
  const generalWorkbenchScaffoldRuntime =
    useWorkspaceGeneralWorkbenchScaffoldRuntime({
      isGeneralWorkbench: isThemeWorkbench,
      mappedTheme,
      sessionId,
      projectId,
      canvasState,
      documentVersionStatusMap,
      setDocumentVersionStatusMap,
      clearThemeSkillsRailState,
      setCanvasState,
      setLayoutMode,
    });
  const {
    shouldUseCompactGeneralWorkbench,
    shouldSkipGeneralWorkbenchAutoGuideWithoutPrompt,
    setTopicStatus,
  } = generalWorkbenchScaffoldRuntime;

  useWorkspaceGeneralWorkbenchDocumentPersistenceRuntime({
    isThemeWorkbench,
    contentId,
    canvasState,
    documentVersionStatusMap,
    contentMetadataRef,
    persistedWorkbenchSnapshotRef,
  });

  const workspaceServiceSkillEntryActions =
    useWorkspaceServiceSkillEntryActions({
      activeTheme,
      creationMode,
      projectId,
      contentId,
      sessionId,
      threadId: threadRead?.thread_id ?? sessionId,
      ensureSessionForThreadLineage: ensureSession,
      input,
      chatToolPreferences: effectiveChatToolPreferences,
      creationReplay: initialCreationReplay,
      preferredTeamPresetId,
      selectedTeam,
      selectedTeamLabel,
      selectedTeamSummary,
      onNavigate: _onNavigate,
      recordServiceSkillUsage,
    });
  const {
    a2uiSubmissionNotice,
    clearEntryPendingA2UI,
    effectivePendingA2UIForm,
    effectivePendingA2UISource,
    handleMessageA2UISubmit,
    handlePendingA2UISubmit,
    hasPendingA2UIForm,
    openRuntimeSceneGate,
    pendingActionRequest,
    pendingPromotedA2UIActionRequest,
  } = useWorkspacePendingInputRuntime({
    activeTheme,
    applyProjectSelection,
    clearPendingServiceSkillLaunch:
      workspaceServiceSkillEntryActions.clearPendingServiceSkillLaunch,
    contentId,
    creationReplay: initialCreationReplay,
    dismissedInitialPendingServiceSkillLaunchSignatureRef,
    handlePendingServiceSkillLaunchSubmit:
      workspaceServiceSkillEntryActions.handlePendingServiceSkillLaunchSubmit,
    handlePermissionResponse,
    handledInitialPendingServiceSkillLaunchSignatureRef,
    initialPendingServiceSkillLaunch,
    initialPendingServiceSkillLaunchSignature,
    messages,
    onSelectServiceSkill:
      workspaceServiceSkillEntryActions.handleServiceSkillSelect,
    pendingActions,
    pendingServiceSkillLaunchForm:
      workspaceServiceSkillEntryActions.pendingServiceSkillLaunchForm,
    pendingServiceSkillLaunchSource:
      workspaceServiceSkillEntryActions.pendingServiceSkillLaunchSource,
    projectId,
    readOnlyInteractiveMessageIds,
    sceneGateResumeHandlerRef,
    sendMessage,
    serviceSkills,
    serviceSkillsError,
    serviceSkillsLoading,
    submittedActionsInFlight,
  });

  const {
    currentGate,
    documentEditorFocusedRef,
    themeWorkbenchActiveQueueItem,
    themeWorkbenchBackendRunState,
    themeWorkbenchRunState,
  } = useWorkspaceGeneralWorkbenchRuntime({
    isThemeWorkbench,
    sessionId,
    isSending,
    pendingActionRequest,
  });

  const handleViewContextDetail = useWorkspaceContextDetailRuntime({
    contextWorkspace,
    t,
  });

  const harnessRequestMetadata = useWorkspaceHarnessRequestMetadataRuntime({
    enabled: workspaceHarnessEnabled && harnessRuntimeVisible,
    agentResponseLanguage,
    browserAssistAutoLaunch: browserAssistRequestAutoLaunch,
    browserAssistPreferredBackend: browserAssistRequestPreferredBackend,
    browserAssistProfileKey: browserAssistRequestProfileKey,
    contentId,
    currentGateKey: currentGate.key,
    effectiveChatToolPreferences,
    isThemeWorkbench,
    mappedTheme,
    preferredTeamPresetId,
    resolvedTeamMemoryShadowSnapshot,
    selectedTeam,
    selectedTeamLabel,
    selectedTeamSummary,
    themeWorkbenchActiveQueueTitle: themeWorkbenchActiveQueueItem?.title,
    workspaceSkillBindings,
    workspaceSkillRuntimeEnable: expertWorkspaceSkillRuntimeEnableInput,
  });
  const harnessInventoryRuntime = useWorkspaceHarnessInventoryRuntime({
    enabled: workspaceHarnessEnabled,
    chatMode,
    mappedTheme,
    harnessPanelVisible: harnessRuntimeVisible,
    harnessRequestMetadata,
    isThemeWorkbench,
    themeWorkbenchRunState,
    currentGate,
    themeWorkbenchBackendRunState,
    themeWorkbenchActiveQueueItem,
    harnessPendingCount,
  });

  const {
    activeTaskCenterDraftTabId,
    handleBeforeTopicSwitch,
    homePendingPreviewRequest,
    setActiveTaskCenterDraftTabId,
    setHomePendingPreviewRequest,
    setTaskCenterDraftSendRequest,
    setTaskCenterDraftTabs,
    shouldHydrateEmptyMatchedInitialSession,
    shouldPauseInitialSessionNavigationForTaskCenterDraft,
    taskCenterDraftSendRequest,
    taskCenterDraftSurfaceActiveRef,
    taskCenterDraftTabs,
  } = useWorkspaceTaskCenterDraftStateRuntime({
    agentEntry,
    deferSessionRecentMetadataSyncForNavigation,
    effectiveThreadItemCount: threadItems.length,
    hasInitialSessionTopic: normalizedInitialSessionId
      ? topicById.has(normalizedInitialSessionId)
      : false,
    initialSessionMessagesCount: normalizedInitialSessionId
      ? (topicById.get(normalizedInitialSessionId)?.messagesCount ?? null)
      : null,
    messagesLength: messages.length,
    normalizedInitialSessionId,
    sessionId,
    turnsLength: turns.length,
  });

  const {
    readSessionFile,
    saveSessionFile,
    sessionFiles,
    sessionMeta,
    syncGeneralArtifactToResource,
  } = useWorkspacePersistenceRuntime({
    activeTheme,
    canvasState,
    contentId,
    creationMode,
    currentTurnId,
    draftSendInFlight: Boolean(
      taskCenterDraftSendRequest || homePendingPreviewRequest,
    ),
    isSending,
    isThemeWorkbench,
    lastCanvasSyncRequestRef,
    mappedTheme,
    projectId,
    projectRootPath: project?.rootPath || null,
    queuedTurnCount: queuedTurns.length,
    sessionId,
    setDocumentVersionStatusMap,
    syncContent,
    themeWorkbenchLatestTerminal:
      themeWorkbenchBackendRunState?.latest_terminal ?? null,
    themeWorkbenchRunState,
  });

  const {
    bootstrapDispatchPreview,
    consumeInitialPrompt,
    consumedInitialPromptRef,
    dismissGeneralWorkbenchEntryPrompt,
    finalizeAfterSendSuccess,
    generalWorkbenchEntryCheckPending,
    generalWorkbenchEntryPrompt,
    hasTriggeredGuideRef,
    initialDispatchKey,
    isBootstrapDispatchPending,
    resetGuideState,
    resolveSendBoundary,
    rollbackAfterSendFailure,
  } = useGeneralWorkbenchInitialDispatchRuntime({
    activeTheme,
    autoRunInitialPromptOnMount,
    contentId,
    initialUserPrompt,
    initialUserImages,
    isSending,
    isThemeWorkbench,
    mappedTheme,
    messagesLength: messages.length,
    onInitialUserPromptConsumed,
    queuedTurnsLength: queuedTurns.length,
    sessionId,
    setInput,
    setSoulArtifactVoiceEnabledForTurn,
    shouldUseCompactGeneralWorkbench,
  });
  const { resetRestoredSessionState } = useWorkspaceSessionRestore({
    sessionId,
    sessionMeta,
    lockTheme,
    initialTheme,
    sessionFiles,
    taskFilesLength: taskFiles.length,
    setActiveTheme,
    setCreationMode,
    setTaskFiles,
  });
  const { handleBackHome, resetTopicLocalState } = useWorkspaceResetRuntime({
    clearMessages,
    clearPendingEntryA2UI: clearEntryPendingA2UI,
    clearProjectSelectionRuntime,
    resetProjectSelection,
    resetRestoredSessionState,
    resetGuideState,
    hasHandledNewChatRequest,
    markNewChatRequestHandled,
    defaultTopicSidebarVisible,
    normalizedInitialTheme: normalizedEntryTheme,
    initialCreationMode,
    newChatAt,
    externalProjectId,
    preserveSessionRestoreOnNewChat:
      shouldKeepNewTaskHomeSessionRestoreDisabled &&
      !shouldDisableSessionRestore,
    onNavigate: _onNavigate,
    autoCollapsedTopicSidebarRef,
    processedMessageIdsRef: processedMessageIds,
    setInput,
    setSelectedText,
    setLayoutMode,
    setShowSidebar,
    setCanvasState,
    setGeneralCanvasState,
    setTaskFiles,
    setSelectedFileId,
    setMentionedCharacters,
    setActiveTheme,
    setCreationMode,
  });
  const {
    clearTaskCenterEmbeddedHomeSession,
    isTaskCenterEntry,
    markTaskCenterEmbeddedHomeSession,
    markTaskCenterLocalSessionOverride,
    replaceTaskCenterOpenTabs,
    setTaskCenterDetachedTopicId,
    setTaskCenterLocalSessionOverride,
    setTaskCenterOpenTabMap,
    setTaskCenterTransitionTopicId,
    taskCenterDetachedTopicId,
    taskCenterEmbeddedHomeSessionIds,
    taskCenterFallbackRestoreRef,
    taskCenterLocalSessionOverride,
    taskCenterOpenTabIds,
    taskCenterOpenTabIdsRef,
    taskCenterTransitionTopicId,
    upsertTaskCenterOpenTab,
    switchTopic,
  } = useWorkspaceTaskCenterNavigationRuntime({
    agentEntry,
    consumePendingTopicSwitch,
    currentSessionId: sessionId,
    deferTopicSwitch,
    externalProjectId,
    finishTopicProjectResolution,
    getRememberedProjectId,
    initialSessionId,
    isAutoRestoringSession,
    isSessionHydrating,
    messagesLength: messages.length,
    normalizedInitialSessionId,
    newChatAt,
    onBeforeTopicSwitch: handleBeforeTopicSwitch,
    originalSwitchTopic,
    projectId: validatedRuntimeProjectId ?? undefined,
    rememberProjectId,
    resetTopicLocalState,
    taskCenterDraftSurfaceActiveRef,
    taskCenterWorkspaceId,
    setActiveTaskCenterDraftTabId,
    setHomePendingPreviewRequest,
    setTaskCenterDraftSendRequest,
    setTaskCenterDraftTabs,
    shouldHydrateEmptyMatchedInitialSession,
    shouldPauseInitialSessionNavigationForTaskCenterDraft,
    startTopicProjectResolution,
    threadItemsLength: threadItems.length,
    topicById,
    topics,
    turnsLength: turns.length,
  });

  useTrayModelShortcuts({
    providerType,
    setProviderType,
    model,
    setModel,
    activeTheme: mappedTheme,
    autoSyncEnabled: false,
    deferInitialSync: true,
  });

  useWorkspaceCanvasMessageSyncRuntime({
    canvasState,
    isSpecializedThemeMode,
    isThemeWorkbench,
    mappedTheme,
    messages,
    processedMessageIdsRef: processedMessageIds,
    setCanvasState,
  });

  const {
    handleSend,
    handleRecommendationClick,
    handleSendRef,
    isPreparingSend,
    displayMessages,
    handleImageWorkbenchCommand,
    imageWorkbenchActionRuntime,
    latestAssistantMessageId,
  } = useWorkspaceSendSurfaceRuntime({
    imageWorkbench: {
      cancelImageTask: cancelMediaTaskArtifact,
      contentId,
      createImageGenerationTask: createImageGenerationTaskArtifact,
      currentImageWorkbenchState,
      ensureImageWorkbenchProvidersLoaded,
      getImageTask: getMediaTaskArtifact,
      imageWorkbenchPreferredModelId:
        effectiveImageWorkbenchPreference.preferredModelId,
      imageWorkbenchPreferredProviderId:
        effectiveImageWorkbenchPreference.preferredProviderId,
      imageWorkbenchPreferredProviderUnavailable,
      imageWorkbenchProvidersLoading,
      imageWorkbenchSelectedModelId,
      imageWorkbenchSelectedProviderId,
      imageWorkbenchSelectedSize,
      imageWorkbenchSessionKey,
      projectId,
      projectImageGenerationPreference: project?.settings?.imageGeneration,
      projectRootPath: project?.rootPath || null,
      saveImageWorkbenchImagesToResource,
      setCanvasState,
      setInput,
      setOnDemandMediaDefaults,
      updateCurrentImageWorkbenchState,
    },
    pendingSkill: {
      consumePendingSkill,
      isThemeWorkbench,
      key: pendingSkillKey,
    },
    sceneGateResumeHandlerRef,
    sendActions: {
      input,
      setInput,
      mentionedCharacters,
      setMentionedCharacters,
      chatToolPreferences: effectiveChatToolPreferences,
      setChatToolPreferences,
      serviceSkills: activeTheme === "general" ? serviceSkills : [],
      activeTheme,
      mappedTheme,
      isThemeWorkbench,
      contextWorkspace: {
        enabled: contextWorkspace.generalWorkbenchEnabled,
        activeContextPrompt: contextWorkspace.activeContextPrompt,
        prepareActiveContextPrompt: contextWorkspace.prepareActiveContextPrompt,
      },
      projectId,
      projectRootPath: project?.rootPath || null,
      sessionId,
      executionStrategy,
      accessMode,
      providerType,
      preferredTeamPresetId,
      selectedTeam,
      selectedTeamLabel,
      selectedTeamSummary,
      teamMemoryShadowSnapshot: resolvedTeamMemoryShadowSnapshot,
      workspaceSkillBindings,
      workspaceSkillRuntimeEnable: expertWorkspaceSkillRuntimeEnableInput,
      currentGateKey: currentGate.key,
      themeWorkbenchActiveQueueTitle: themeWorkbenchActiveQueueItem?.title,
      contentId,
      browserAssistProfileKey: browserAssistRequestProfileKey,
      browserAssistPreferredBackend: browserAssistRequestPreferredBackend,
      browserAssistAutoLaunch: browserAssistRequestAutoLaunch,
      browserAssistSessionState,
      workspaceRequestMetadataBase:
        workspaceRequestMetadataWithExpertSkills ?? undefined,
      savedSoulArtifactVoiceGenerationBrief: soulArtifactVoiceGenerationBrief,
      soulArtifactVoiceEnabledForTurn,
      serviceModels,
      agentResponseLanguage,
      resolveServiceModelsBeforeSend: shouldDeferWorkspaceAuxiliaryLoads
        ? refreshServiceModelsConfig
        : undefined,
      messages,
      setChatMessages,
      bootstrapDispatchPreview,
      sendMessage,
      resolveSendBoundary,
      finalizeAfterSendSuccess,
      rollbackAfterSendFailure,
      ensureBrowserAssistCanvas,
      handleAutoLaunchMatchedSiteSkill:
        workspaceServiceSkillEntryActions.handleAutoLaunchMatchedSiteSkill,
      openRuntimeSceneGate,
      ensureSessionForCommandMetadata: ensureSession,
    },
  });

  const {
    applyWorkbenchFollowUpActionPayload,
    handleContinueGeneralWorkbenchEntryPrompt,
    handleRestartGeneralWorkbenchEntryPrompt,
    handleDocumentAutoContinueRun,
    handleArtifactBlockRewriteRun,
    handleDocumentContentReviewRun,
    handleDocumentTextStylizeRun,
    handleSwitchBranchVersion,
    handleCreateVersionSnapshot,
    handleSetBranchStatus,
    handleAddImage,
    handleImportDocument,
  } = useWorkspaceWorkbenchActionSurfaceRuntime({
    canvasWorkflow: {
      sendRef: handleSendRef,
      setCanvasState,
      setTopicStatus,
      projectId,
      projectName: project?.name,
      canvasState,
      contentId,
      selectedText,
      onRunImageWorkbenchCommand: handleImageWorkbenchCommand,
    },
    entryPrompt: {
      consumeInitialPrompt,
      dismissGeneralWorkbenchEntryPrompt,
      entryBannerMessage,
      generalWorkbenchEntryPrompt,
      handleSendRef,
      initialDispatchKey,
      input,
      setEntryBannerVisible,
      setInput,
      setRuntimeEntryBannerMessage,
      setRuntimeInitialInputCapability,
    },
  });

  const {
    isTaskCenterDraftTabActive,
    isTaskCenterDraftSurfaceActive,
    shouldSuppressTaskCenterDraftContent,
    homePendingPreviewMessages,
    isHomePendingPreviewActive,
    isHomeSendStarting,
    bootstrapPendingPreviewMessages,
    persistTaskCenterMaterializedSessionNavigation,
  } = useWorkspaceTaskCenterSurfaceRuntime({
    activeTheme,
    bootstrapDispatchPreview,
    draftSurface: {
      agentEntry,
      isTaskCenterEntry,
      activeDraftTabId: activeTaskCenterDraftTabId,
      draftTabs: taskCenterDraftTabs,
      draftSurfaceActive: taskCenterDraftSurfaceActiveRef.current,
      draftSendRequest: taskCenterDraftSendRequest,
      displayMessageCount: displayMessages.length,
      threadItemCount: effectiveThreadItems.length,
      hasLocalSessionOverride: taskCenterLocalSessionOverride !== null,
      hasPendingA2UIForm,
      isPreparingSend,
      isSending,
      queuedTurnCount: queuedTurns.length,
    },
    homePendingPreview: {
      homePendingPreviewRequest,
      displayMessagesLength: displayMessages.length,
      executionStrategy,
      workspaceId: taskCenterWorkspaceId,
      soulCopy: soulInteractionCopy,
    },
    lockTheme,
    onNavigate: _onNavigate,
    taskCenterWorkspaceId,
  });

  const hasCanvasWorkbenchContent = layoutMode !== "chat";
  const {
    hasDisplayMessages,
    hasMessages,
    effectiveShowChatPanel,
    shouldRestoreImageTasksFromWorkspace,
  } = resolveAgentChatWorkspaceShellViewModel({
    agentEntry,
    showChatPanel,
    contentId,
    initialSessionId,
    displayMessageCount: displayMessages.length,
    threadItemCount: effectiveThreadItems.length,
    isHomePendingPreviewActive,
    shouldSuppressTaskCenterDraftContent,
    hasCanvasWorkbenchContent,
    isThemeWorkbench,
    shouldUseCompactGeneralWorkbench,
    isBootstrapDispatchPending,
    isSending,
    queuedTurnCount: queuedTurns.length,
  });
  const {
    handleCanvasSelectionTextChange,
    handleToggleCanvas,
    handleCloseCanvas,
    resolvedCanvasState,
  } = useWorkspaceCanvasSurfaceRuntime({
    layout: {
      activeTheme,
      isThemeWorkbench,
      hasPendingA2UIForm,
      layoutMode,
      showChatPanel: effectiveShowChatPanel,
      showSidebar,
      defaultTopicSidebarVisible,
      hasMessages,
      canvasWorkbenchLayoutMode,
      autoCollapsedTopicSidebarRef,
      mappedTheme,
      normalizedEntryTheme,
      shouldPreserveBlankHomeSurface,
      shouldBootstrapCanvasOnEntry,
      canvasState,
      generalCanvasState,
      hasCurrentCanvasArtifact: Boolean(currentCanvasArtifact),
      currentCanvasArtifactType: currentCanvasArtifact?.type,
      browserAssistCanvasControl,
      currentImageWorkbenchActive: currentImageWorkbenchState.active,
      onHasMessagesChange,
      setShowSidebar,
      setLayoutMode,
      setGeneralCanvasState,
      setCanvasState,
      setCanvasWorkbenchLayoutMode,
    },
    selection: {
      activeTheme,
      contentId,
      setSelectedText,
    },
    taskFileSync: {
      taskFiles,
      isThemeWorkbench,
      selectedFileId,
      canvasState,
      mappedTheme,
      documentEditorFocusedRef,
      setSelectedFileId,
      setCanvasState,
    },
  });

  const {
    activeTaskCenterDraftTabIdRef,
    browserWorkspaceHomeTabsNode,
    commitMaterializedTaskCenterDraftTab,
    handleOpenProjectConversation,
    handleOpenTaskTopic,
    handleResumeRecentSession,
    hasHomeConversationActivity,
    isTaskCenterDraftSendPending,
    materializeTaskCenterDraftTab,
    projectConversationGroups,
    recentSessionActionLabel,
    recentSessionTopic,
    shouldRenderTaskCenterEmbeddedHome,
    shouldRenderTaskCenterTabStrip,
    suppressHomeNavbarUtilityActions,
    taskCenterDraftMaterializedSessionIdsRef,
    taskCenterDraftWarmupSessionIdsRef,
    taskCenterHomeSurfaceState,
    taskCenterTabsNode,
  } = useWorkspaceTaskCenterInteractionRuntime({
    chromeNavigation: {
      agentEntry,
      applyProjectSelection,
      clearEmbeddedHomeSession: clearTaskCenterEmbeddedHomeSession,
      detachedTopicId: taskCenterDetachedTopicId,
      displayMessageCount: displayMessages.length,
      draftSendRequest: taskCenterDraftSendRequest,
      embeddedHomeSessionIds: taskCenterEmbeddedHomeSessionIds,
      externalProjectId,
      fallbackRestoreRef: taskCenterFallbackRestoreRef,
      hasDisplayMessages,
      hasLocalSessionOverride: taskCenterLocalSessionOverride !== null,
      hasPendingA2UIForm,
      harnessPanelVisible,
      homeMountedAt: workspaceRenderT0.current,
      initialDispatchKey,
      initialPendingServiceSkillLaunchSignature,
      isAutoRestoringSession,
      isBootstrapDispatchPending,
      isHomeSessionBackgroundRecovery:
        sessionRestorePresentation === "background" &&
        !normalizedInitialSessionId,
      isHomePendingPreviewActive,
      isHomeSendStarting,
      isPreparingSend,
      isSending,
      isSessionHydrating,
      isThemeWorkbench,
      layoutMode,
      messagesLength: messages.length,
      newChatAt,
      newConversationLabel,
      normalizedInitialSessionId,
      onNavigate: _onNavigate,
      onToggleWorkbench: handleToggleCanvas,
      openTabIds: taskCenterOpenTabIds,
      openedProjects,
      projectId,
      queuedTurnsLength: queuedTurns.length,
      renamePromptLabel: taskCenterRenamePromptLabel,
      renameTopic,
      resetProjectSelection,
      sessionId,
      setHarnessPanelVisible,
      shouldSuppressDraftContent: shouldSuppressTaskCenterDraftContent,
      shouldUseBrowserWorkspaceHomeChrome,
      taskCenterWorkspaceId,
      threadItemCount: effectiveThreadItems.length,
      topicById,
      topics,
      transitionTopicId: taskCenterTransitionTopicId,
      untitledTaskLabel,
    },
    draftMaterialization: {
      activeTaskCenterDraftTabId,
      agentEntry,
      clearMessages,
      createFreshSession,
      input,
      isPreparingSend,
      isSending,
      markTaskCenterEmbeddedHomeSession,
      markTaskCenterLocalSessionOverride,
      resetLocalImageWorkbenchSessionScope,
      resetTopicLocalState,
      setActiveTaskCenterDraftTabId,
      setHomePendingPreviewRequest,
      setInput,
      setMentionedCharacters,
      setSelectedText,
      setTaskCenterDetachedTopicId,
      setTaskCenterDraftSendRequest,
      setTaskCenterDraftTabs,
      setTaskCenterTransitionTopicId,
      taskCenterDraftSurfaceActiveRef,
      taskCenterDraftTabs,
      taskCenterWorkspaceId,
      upsertTaskCenterOpenTab,
    },
    persistMaterializedSessionNavigation:
      persistTaskCenterMaterializedSessionNavigation,
    taskCenterSurface: {
      isTaskCenterDraftSurfaceActive,
      isTaskCenterDraftTabActive,
    },
    topicNavigation: {
      activeSessionIdRef,
      agentEntry,
      clearEntryPendingA2UI,
      clearMessages,
      clearTaskCenterEmbeddedHomeSession,
      messagesLength: messages.length,
      replaceTaskCenterOpenTabs,
      resetLocalImageWorkbenchSessionScope,
      resetTopicLocalState,
      sessionId,
      setActiveTaskCenterDraftTabId,
      setHomePendingPreviewRequest,
      setInput,
      setMentionedCharacters,
      setSelectedText,
      setTaskCenterDetachedTopicId,
      setTaskCenterDraftSendRequest,
      setTaskCenterDraftTabs,
      setTaskCenterLocalSessionOverride,
      setTaskCenterOpenTabMap,
      setTaskCenterTransitionTopicId,
      switchTopic,
      taskCenterDetachedTopicId,
      taskCenterDraftSurfaceActiveRef,
      taskCenterOpenTabIdsRef,
      taskCenterTransitionTopicId,
      taskCenterWorkspaceId,
      topicById,
      upsertTaskCenterOpenTab,
      markTaskCenterLocalSessionOverride,
    },
    switchTopic,
  });
  const {
    bindArticleEditorRightSurface,
    bindRightSurfacePendingActions,
    handleArtifactClick,
    handleCodeBlockClick,
    handleHarnessLoadFilePreview,
    handleOpenArtifactFromTimeline,
    handleOpenMessagePreview,
    handleOpenSavedSiteContent,
    handleOpenServiceSkillResultFile,
    handleOpenUrlPreview,
    handleSaveArtifactDocument,
    handleTaskFileClick,
    handleWorkspaceArtifactClick,
    handleWorkspaceFileClick,
    openProjectFilePreviewInCanvas,
    openWorkspaceArtifactInWorkbench,
    preferredServiceSkillResultFileTarget,
    renderArtifactWorkbenchToolbarActions,
    shouldCollapseCodeBlockInChat,
    shouldCollapseCodeBlocks,
    handleWriteFile,
  } = useWorkspaceArtifactActionRuntime({
    activeTheme,
    artifacts,
    contentId,
    currentCanvasArtifact,
    currentGateKey: currentGate.key,
    currentTurnId,
    effectiveThreadItems,
    generalCanvasState,
    browserAssistArtifactOpenControl,
    handleToggleCanvas,
    handleWriteFileRef,
    initialProjectFileOpenTarget,
    isInitialContentLoading,
    isThemeWorkbench,
    layoutMode,
    mappedTheme,
    messages,
    onNavigate: _onNavigate,
    openArticleWorkspaceRightSurface,
    projectId,
    projectRootPath: project?.rootPath || null,
    readSessionFile,
    saveSessionFile,
    sessionFiles,
    sessionId,
    setArtifactViewMode: applyAutoArtifactViewMode,
    setCanvasState,
    setCanvasWorkbenchLayoutMode,
    setDocumentVersionStatusMap,
    setExpertInfoPanelCollapsed,
    setGeneralCanvasState,
    setHarnessPanelVisible,
    setLayoutMode,
    setSelectedArtifactId,
    setSelectedFileId,
    setTaskFiles,
    siteSkillExecutionState,
    socialStageLogRef,
    suppressCanvasAutoOpen: hasPendingA2UIForm,
    syncGeneralArtifactToResource,
    taskFiles,
    taskFilesRef,
    themeWorkbenchActiveQueueItem,
    updateCurrentImageWorkbenchState,
    upsertGeneralArtifact,
    workbenchRequests,
  });
  const {
    defaultCuratedTaskReferenceEntries,
    defaultCuratedTaskReferenceMemoryIds,
    handleJumpToTimelineItem,
    sceneAppExecutionSummaryCard,
    sceneAppReviewDecisionDialogNode,
    serviceSkillExecutionCard,
    workspacePluginHistoryRestoreLandingCard,
  } = useWorkspaceArtifactSurfaceRuntime({
    pluginHistoryRestore: {
      handleWorkspaceArtifactClick,
      pluginRuntimeContext: workspacePluginRuntimeContext.context,
      threadRead,
      upsertGeneralArtifact,
    },
    serviceSkillExecution: {
      onOpenBrowserRuntime: handleOpenBrowserRuntimeForSiteSkillExecution,
      onOpenResultFile: handleOpenServiceSkillResultFile,
      onOpenSavedSiteContent: handleOpenSavedSiteContent,
      preferredResultFileTarget: preferredServiceSkillResultFileTarget,
      state: siteSkillExecutionState,
    },
    sceneAppExecution: {
      artifacts,
      initialSummary: initialSceneAppExecutionSummary,
      isSending,
      onApplyFollowUpAction: applyWorkbenchFollowUpActionPayload,
      onNavigate: _onNavigate,
      onOpenArtifact: handleArtifactClick,
      onOpenTaskFile: handleTaskFileClick,
      onOpenWorkspaceFile: handleWorkspaceFileClick,
      projectId,
      readSessionFile,
      replayReferenceEntries:
        initialCreationReplaySurface?.defaultReferenceEntries,
      replayReferenceMemoryIds:
        initialCreationReplaySurface?.defaultReferenceMemoryIds,
      sessionFiles,
      sessionId,
      taskFiles,
    },
    setLayoutMode,
    workbenchRequests,
  });
  useWorkspaceWorkbenchSideEffectRuntime({
    autoGuide: {
      autoRunInitialPromptOnMount,
      canvasState,
      contentId,
      consumedInitialPromptRef,
      generalWorkbenchEntryCheckPending,
      generalWorkbenchEntryPrompt,
      handleSend,
      hasProject: Boolean(project),
      hasTriggeredGuideRef,
      initialAutoSendAllowsDetachedSession,
      initialAutoSendRequestMetadata,
      initialDispatchKey,
      initialUserPrompt,
      initialUserImages,
      isSending,
      isThemeWorkbench,
      mappedTheme,
      messagesLength: messages.length,
      onInitialUserPromptConsumed,
      projectId,
      sessionId,
      setInput,
      shouldSkipGeneralWorkbenchAutoGuideWithoutPrompt,
      shouldUseCompactGeneralWorkbench,
      systemPrompt,
    },
    mediaTask: {
      canvasState,
      contentId,
      handleImageWorkbenchCommand,
      messages,
      onImageWorkbenchRequested:
        imageWorkbenchGenerationRuntime.ensureProvidersLoaded,
      projectId,
      projectRootPath: project?.rootPath || null,
      setCanvasState,
      setChatMessages,
      setImageWorkbenchSelectedSize,
      updateCurrentImageWorkbenchState,
    },
    triggerAIGuide,
  });

  const shellChromeRuntime = useWorkspaceShellChromeRuntime({
    activeTheme,
    agentEntry,
    contextWorkspaceEnabled: contextWorkspace.generalWorkbenchEnabled,
    effectiveShowChatPanel,
    gateStatus: currentGate.status,
    generalWorkbenchPanelCollapseEnabled:
      generalWorkbenchScaffoldRuntime.enableGeneralWorkbenchPanelCollapse,
    generalWorkbenchSidebarCollapsed:
      generalWorkbenchScaffoldRuntime.generalWorkbenchSidebarCollapsed,
    hasCanvasWorkbenchContent,
    hasDisplayMessages,
    hasHomeConversationActivity,
    hasPendingA2UIForm,
    hideTopBar,
    isBootstrapDispatchPending,
    isPreparingSend,
    isSending,
    isTaskCenterDraftSendPending,
    isThemeWorkbench,
    layoutMode,
    normalizedInitialSessionId,
    queuedTurnCount: queuedTurns.length,
    sessionId,
    shouldRenderTaskCenterEmbeddedHome,
    shouldSuppressTaskCenterDraftContent,
    shouldUseBrowserWorkspaceHomeChrome,
    shouldUseCompactGeneralWorkbench,
    showSidebar,
    subagentsRuntimeVisible,
    hasRuntimeSessions,
    themeWorkbenchRunState,
    topBarChrome,
  });
  const showGeneralWorkbenchSidebar =
    shellChromeRuntime.showGeneralWorkbenchSidebar;
  const showGeneralWorkbenchLeftExpandButton =
    shellChromeRuntime.showGeneralWorkbenchLeftExpandButton;
  const {
    generalWorkbenchActivityLogs,
    generalWorkbenchWorkflowSteps,
    handleExpandGeneralWorkbenchSidebar,
    handleSubmitCodeFixPrompt,
    renderGeneralWorkbenchSidebarNode,
  } = useWorkspaceGeneralWorkbenchSidebarHostRuntime({
    contextActivityLogs: contextWorkspace.activityLogs,
    contextWorkspace: contextHarnessRuntime.contextWorkspace,
    generalWorkbenchHarnessSummary:
      harnessInventoryRuntime.generalWorkbenchHarnessSummary,
    generalWorkbenchScaffoldRuntime,
    handleSendRef,
    historyPageSize: GENERAL_WORKBENCH_HISTORY_PAGE_SIZE,
    isSending,
    isThemeWorkbench,
    messages,
    onAddImage: handleAddImage,
    onApplyFollowUpAction: applyWorkbenchFollowUpActionPayload,
    onCreateVersionSnapshot: handleCreateVersionSnapshot,
    onImportDocument: handleImportDocument,
    onSetBranchStatus: handleSetBranchStatus,
    onSwitchBranchVersion: handleSwitchBranchVersion,
    onViewContextDetail: handleViewContextDetail,
    projectId,
    sessionId,
    sidebarVisible: showGeneralWorkbenchSidebar,
    themeWorkbenchBackendRunState,
  });
  const {
    handleManageProvidersFromHarness,
    handleOpenExecutionPolicySettingsFromHarness,
  } = useWorkspaceHarnessNavigationRuntime({ onNavigate: _onNavigate });
  const effectiveInitialInputCapability = useMemo(
    () =>
      resolveEffectiveInitialInputCapability({
        bootstrap: initialInputCapability,
        runtime: runtimeInitialInputCapability,
      }),
    [initialInputCapability, runtimeInitialInputCapability],
  );
  const { planComposerPendingActions, planDecisionAccessory } =
    useWorkspacePlanDecisionRuntime({
      acceptedLabel: t("agentChat.planComposerDecision.option.accept"),
      displayMessages,
      effectiveChatToolPreferences,
      effectiveThreadItems,
      handlePermissionResponse,
      handleSendRef,
      isSending,
      pendingActions,
      planState: harnessShellState.plan,
      sessionId,
      submittedActionsInFlight,
    });
  const generalWorkbenchHarnessPanelBaseProps =
    useWorkspaceGeneralWorkbenchHarnessSurfaceRuntime({
      activeExecutionRuntime,
      activeTheme,
      canInterrupt: inputbarIsSending,
      canonicalChildren,
      contextHarnessRuntime,
      currentTurnId,
      executionStrategy,
      harnessInventoryRuntime,
      latestAssistantMessageId,
      messages: displayMessages,
      model,
      onInterruptCurrentTurn: stopSending,
      onLoadFilePreview: handleHarnessLoadFilePreview,
      onManageProviders: handleManageProvidersFromHarness,
      onOpenExecutionPolicySettings:
        handleOpenExecutionPolicySettingsFromHarness,
      onOpenFile: handleWorkspaceFileClick,
      onOpenSubagentSession: handleOpenSubagentSession,
      onPromoteQueuedTurn: promoteQueuedTurn,
      onRespondToAction: handlePermissionResponse,
      onResumeThread: resumeThread,
      onSubmitCodeFixPrompt: handleSubmitCodeFixPrompt,
      pendingActions: planComposerPendingActions,
      projectId,
      providerType,
      queuedTurns,
      refreshSessionReadModel,
      replayPendingAction,
      selectedTeamLabel,
      selectedTeamRoles: selectedTeam?.roles,
      selectedTeamSummary,
      sessionId,
      submittedActionsInFlight,
      teamMemorySnapshot: resolvedTeamMemoryShadowSnapshot,
      threadItems: effectiveThreadItems,
      threadRead,
      turns,
      workingDir: project?.rootPath || null,
    });
  useWorkspaceHiddenWorkflowProgressRuntime({
    hasMessages,
    isSpecializedThemeMode,
    onWorkflowProgressChange,
  });
  const navigationActions = useWorkspaceNavigationActions({
    applyProjectSelection,
    compactSession,
    dismissWorkspacePathError,
    fixWorkspacePathAndRetry,
    agentEntry,
    externalProjectId,
    onNavigate: _onNavigate,
    projectId: projectId || undefined,
    setEntryBannerVisible,
    setWorkspaceHealthError,
    workspacePathMissing,
  });
  const { handleSaveMessageAsSkill } = useWorkspaceMessageSkillSaveRuntime({
    creationProjectId: projectId,
    creationReplay: initialCreationReplay,
    onNavigate: _onNavigate,
  });

  const inputbarScene = useWorkspaceInputbarSceneRuntime({
    contextVariant: agentEntry === "claw" ? "task-center" : "default",
    setMentionedCharacters,
    taskFiles,
    selectedFileId,
    isThemeWorkbench,
    sessionId,
    generalWorkbenchHarnessPanelBaseProps,
    currentSessionTitle,
    handleStopSending,
    input,
    setInput,
    currentGate,
    generalWorkbenchWorkflowSteps,
    steps: EMPTY_WORKSPACE_WORKFLOW_STEPS,
    workflowRunState: themeWorkbenchRunState,
    handleSend,
    isPreparingSend,
    isSending: inputbarIsSending,
    isSessionRestoring:
      isAutoRestoringSession ||
      isSessionHydrating ||
      taskCenterHomeSurfaceState.isRestoringSession,
    providerType,
    setProviderType,
    model,
    setModel,
    reasoningEffort,
    setReasoningEffort,
    sessionExecutionRuntime: executionRuntime,
    projectId: projectId ?? null,
    openedProjects,
    projectRootPath: project?.rootPath || null,
    accessMode,
    setAccessMode,
    activeTheme,
    navigationActions,
    characters: projectMemory?.characters || [],
    skills,
    serviceSkills: activeTheme === "general" ? serviceSkills : [],
    serviceSkillGroups: activeTheme === "general" ? serviceSkillGroups : [],
    skillsLoading: combinedSkillsLoading,
    onSelectServiceSkill:
      workspaceServiceSkillEntryActions.handleServiceSkillSelect,
    onSkillSuggestionsNeeded: handleSkillSuggestionsNeeded,
    initialInputCapability: effectiveInitialInputCapability,
    initialKnowledgePackSelection,
    pluginSuggestions: workspacePluginInputSuggestions,
    pluginSuggestionsError:
      workspacePluginRuntimeContext.error?.message ?? null,
    pluginSuggestionsLoading: workspacePluginRuntimeContext.loading,
    onPluginSuggestionsNeeded: handlePluginSuggestionsNeeded,
    setChatToolPreferences,
    objectiveEnabled: inputbarObjectiveModeEnabled,
    onObjectiveEnabledChange: setInputbarObjectiveModeEnabled,
    handleNavigateToSkillSettings,
    handleRefreshSkills,
    soulArtifactVoiceGenerationBrief,
    soulArtifactVoiceEnabledForTurn,
    onSoulArtifactVoiceEnabledForTurnChange: setSoulArtifactVoiceEnabledForTurn,
    removeQueuedTurn,
    generalWorkbenchEntryPrompt,
    handleRestartGeneralWorkbenchEntryPrompt,
    handleContinueGeneralWorkbenchEntryPrompt,
    planDecisionAccessory,
    generalWorkbenchEnabled:
      generalHarnessEntryEnabled && !suppressHomeNavbarUtilityActions,
    harnessPanelVisible:
      !suppressHomeNavbarUtilityActions &&
      contextHarnessRuntime.harnessPanelVisible,
    setHarnessPanelVisible: contextHarnessRuntime.setHarnessPanelVisible,
    harnessState,
    mappedTheme,
    activeRuntimeStatusTitle: contextHarnessRuntime.activeRuntimeStatusTitle,
    chatToolPreferences: effectiveChatToolPreferences,
    defaultCuratedTaskReferenceMemoryIds: defaultCuratedTaskReferenceMemoryIds,
    defaultCuratedTaskReferenceEntries: defaultCuratedTaskReferenceEntries,
    pathReferences,
    onAddPathReferences: handleAddPathReferences,
    inputRestoreRequest,
    onInputRestoreRequestHandled: handleInputRestoreRequestHandled,
    onRemovePathReference: handleRemovePathReference,
    onClearPathReferences: handleClearPathReferences,
    fileManagerOpen: fileManagerSidebar.fileManagerOpen,
    onToggleFileManager: fileManagerSidebar.fileManagerAvailable
      ? fileManagerSidebar.toggleFileManagerSidebar
      : undefined,
    inputCompletionEnabled,
  });
  const { handleSaveMessageAsKnowledge } =
    useWorkspaceMessageKnowledgeSaveRuntime({
      currentSessionTitle,
      importTextAsKnowledge: inputbarScene.onImportTextAsKnowledge,
      knowledgeSelectionWorkingDir:
        inputbarScene.knowledgePackSelection?.workingDir,
      onNavigate: _onNavigate,
      projectRootPath: project?.rootPath,
      selectedPackName: inputbarScene.knowledgePackSelection?.packName,
    });

  const canvasScene = useWorkspaceCanvasSceneRuntime({
    shouldBootstrapCanvasOnEntry,
    normalizedEntryTheme,
    mappedTheme,
    canvasState,
    resolvedCanvasState,
    isInitialContentLoading,
    initialContentLoadError,
    imageWorkbenchGenerationRuntime,
    imageWorkbenchActionRuntime,
    inputbarScene,
    projectRootPath: project?.rootPath || null,
    generalCanvasState,
    setGeneralCanvasState,
    currentCanvasArtifact,
    displayedCanvasArtifact,
    artifactDisplayState,
    artifactViewMode,
    setArtifactViewMode: handleArtifactViewModeChange,
    artifactPreviewSize,
    setArtifactPreviewSize,
    onSaveArtifactDocument: handleSaveArtifactDocument,
    onArtifactBlockRewriteRun: handleArtifactBlockRewriteRun,
    renderArtifactWorkbenchToolbarActions,
    threadItems: effectiveThreadItems,
    focusedBlockId: workbenchRequests.focusedArtifactBlockId,
    blockFocusRequestKey: workbenchRequests.artifactBlockFocusRequestKey,
    onJumpToTimelineItem: handleJumpToTimelineItem,
    handleCloseCanvas,
    currentImageWorkbenchState,
    imageWorkbenchPreferenceSummary,
    imageWorkbenchPreferenceWarning,
    setCanvasState,
    handleBackHome,
    isSending,
    handleCanvasSelectionTextChange,
    projectId: projectId ?? null,
    contentId: contentId ?? null,
    imageGenerationSelectionReady,
    imageGenerationSelectionWarning,
    sourceThreadId: sessionId ?? null,
    providerType,
    setProviderType,
    model,
    setModel,
    handleDocumentAutoContinueRun,
    handleAddImage,
    handleImportDocument,
    handleDocumentContentReviewRun,
    handleDocumentTextStylizeRun,
    preferContentReviewInRightRail,
  });

  const {
    handleSendFromEmptyState,
    sceneDisplayMessages,
    sceneTurns,
    sceneThreadItems,
    sceneCurrentTurnId,
    sceneThreadRead,
    sceneExecutionRuntime,
    scenePendingActions,
    sceneSubmittedActionsInFlight,
    sceneQueuedTurns,
    sceneIsPreparingSend,
    sceneIsSending,
    sceneIsRestoringSession,
    sceneLayoutMode,
    sceneMessageListEmptyStateVariant,
    sceneSessionId,
    shouldHideCurrentSessionContent,
  } = useWorkspaceTaskCenterSendRuntime({
    activeDraftTabIdRef: activeTaskCenterDraftTabIdRef,
    activeSessionIdRef,
    agentEntry,
    clearMessages,
    commitMaterializedDraftTab: commitMaterializedTaskCenterDraftTab,
    currentSessionId: sessionId,
    currentTurnId,
    displayMessages,
    effectiveThreadItems,
    executionRuntime,
    handleSend,
    hasDisplayMessages,
    homePendingPreviewMessages,
    bootstrapPendingPreviewMessages,
    input,
    isPreparingSend,
    isSending,
    isTaskCenterDraftSendPending,
    layoutMode,
    markNewChatRequestHandled,
    markTaskCenterLocalSessionOverride,
    materializedSessionIdsRef: taskCenterDraftMaterializedSessionIdsRef,
    materializeDraftTab: materializeTaskCenterDraftTab,
    messagesLength: messages.length,
    newChatAt,
    normalizedInitialSessionId,
    planComposerPendingActions,
    prewarmedDraftSessionIdsRef: taskCenterDraftWarmupSessionIdsRef,
    queuedTurns,
    sendRef: handleSendRef,
    setActiveDraftTabId: setActiveTaskCenterDraftTabId,
    setDetachedTopicId: setTaskCenterDetachedTopicId,
    setHomePendingPreviewRequest,
    setInput,
    setTaskCenterDraftSendRequest,
    setTaskCenterDraftTabs,
    setTransitionTopicId: setTaskCenterTransitionTopicId,
    shouldRenderTaskCenterEmbeddedHome,
    shouldSuppressTaskCenterDraftContent,
    submittedActionsInFlight,
    taskCenterDraftSendRequest,
    taskCenterDraftSurfaceActiveRef,
    taskCenterHomeSurfaceState,
    taskCenterWorkspaceId,
    threadRead,
    turns,
    switchToReadySession: originalSwitchTopic,
    upsertTaskCenterOpenTab,
  });
  const workspaceSceneNode = useAgentChatWorkspaceSceneComposition({
    expertPanel: {
      canOpenSkillsManage: Boolean(_onNavigate),
      combinedSkillsLoading,
      effectiveThreadItems,
      expertInfoPanelCollapsed,
      expertPanelRequestMetadata,
      expertPanelRuntimeKey,
      expertSkillRefsOverride,
      expertWorkspaceSkillRuntimeEnableBindings,
      expertWorkspaceSkillRuntimeEnableRefs,
      handleEnableExpertWorkspaceSkillRuntime,
      handleExpertSkillRefsChange,
      handleOpenSkillsManageFromExpertPanel,
      handleThreadExpertProfileSwitch,
      localSkills: skills,
      sceneLayoutMode,
      serviceSkills,
      setExpertInfoPanelCollapsed,
      workspaceSkillBindings,
    },
    rightSurface: {
      articleEditor: {
        activeArticleWorkspace: rightSurfaceLocalState.activeArticleWorkspace,
        canvasState,
        contentId,
        currentImageWorkbenchState,
        imageWorkbenchSessionKey,
        messages,
        projectId,
        runtimeWorkspaceId,
        sceneDisplayMessages,
        sceneIsPreparingSend,
        sceneIsSending,
        sceneSessionId,
        sceneThreadRead,
        setCanvasState,
        setChatMessages,
        shouldDeferWorkspaceAuxiliaryLoads,
        shouldHideCurrentSessionContent,
        shouldRestoreImageTasksFromWorkspace,
        updateCurrentImageWorkbenchState,
      },
      bindArticleEditorRightSurface,
      chrome: {
        showHarnessToggle,
        harnessPendingCount,
        harnessAttentionLevel,
        harnessToggleLabel,
        suppressHarnessChrome: suppressHomeNavbarUtilityActions,
      },
      coordinator: {
        bindRightSurfacePendingActions,
        browserAssistLaunching,
        browserAssistSessionRef,
        browserAssistSessionState,
        clawTraceEnabled,
        currentBrowserAssistScopeKey,
        expertInfoPanelCollapsed,
        handleToggleCanvas,
        harnessPendingCount,
        localState: rightSurfaceLocalState,
        pluginRuntimeContext: workspacePluginRuntimeContext.context,
        preferredServiceSkillResultFileTarget,
        runtimeWorkspaceId,
        sceneIsPreparingSend,
        sceneIsSending,
        sceneLayoutMode,
        sceneSessionId,
        sessionId,
        showHarnessToggle,
        suppressHomeNavbarUtilityActions,
        taskCenterHomeHotpathActive:
          shouldRenderTaskCenterEmbeddedHome ||
          Boolean(taskCenterDraftSendRequest || homePendingPreviewRequest),
        setExpertInfoPanelCollapsed,
        setHarnessPanelVisible,
        setLayoutMode,
      },
      host: {
        generalWorkbenchHarnessPanelBaseProps,
        harnessState,
        preferredServiceSkillResultFileTarget,
        runtimeWorkspaceId,
        sceneSessionId,
        onOpenArticlePreviewArtifact: openWorkspaceArtifactInWorkbench,
        onOpenBrowserRuntimeForBrowserAssist:
          handleOpenBrowserRuntimeForBrowserAssist,
        onOpenServiceSkillResultFile: handleOpenServiceSkillResultFile,
        handleSendRef,
        restoreInput: setInput,
        setLayoutMode,
      },
      imageSlot: {
        contentId,
        handleImageWorkbenchCommand,
        projectId,
        setLayoutMode,
      },
      projectRootPath: project?.rootPath,
      renderGeneralWorkbenchSidebarNode,
      sessionWorkingDir,
    },
    homeRecovery: {
      onBackgroundSessionRuntimeChange,
      onNavigate: _onNavigate,
      onOpenTaskTopic: handleOpenTaskTopic,
      onResumeRecentSession: handleResumeRecentSession,
      projectId,
      recentSessionTopic,
    },
    conversation: {
      landing: {
        accessMode,
        activeTheme,
        artifacts,
        browserAssistLoading: browserAssistLaunching,
        chatToolPreferences: effectiveChatToolPreferences,
        contentId,
        creationMode,
        creationReplaySurface: initialCreationReplaySurface,
        defaultCuratedTaskReferenceEntries,
        defaultCuratedTaskReferenceMemoryIds,
        emptyStateDisabled: sceneIsPreparingSend || sceneIsSending,
        emptyStateIsLoading: sceneIsPreparingSend || sceneIsSending,
        emptyStateSendOnPointerDown: true,
        entryBannerMessage: effectiveEntryBannerMessage,
        entryBannerVisible,
        fileManagerOpen: fileManagerSidebar.fileManagerOpen,
        generalCanvasContent: generalCanvasState.content,
        handleSendFromEmptyState,
        initialInputCapability: effectiveInitialInputCapability,
        input,
        inputbarScene,
        inputRestoreRequest,
        lockTheme,
        model,
        objectiveEnabled: inputbarObjectiveModeEnabled,
        onAddPathReferences: handleAddPathReferences,
        onClearPathReferences: handleClearPathReferences,
        onDismissEntryBanner: navigationActions.handleDismissEntryBanner,
        onInputRestoreRequestHandled: handleInputRestoreRequestHandled,
        onLaunchBrowserAssist: handleOpenBrowserRuntimeForBrowserAssist,
        onManageProviders: navigationActions.handleManageProviders,
        onNavigateToSettings: handleNavigateToSkillSettings,
        onObjectiveEnabledChange: setInputbarObjectiveModeEnabled,
        onOpenProjectConversation: handleOpenProjectConversation,
        onPluginSuggestionsNeeded: handlePluginSuggestionsNeeded,
        onProjectChange: navigationActions.handleProjectChange,
        onRecommendationClick: handleRecommendationClick,
        onRefreshSkills: handleRefreshSkills,
        onRemovePathReference: handleRemovePathReference,
        onSelectServiceSkill:
          workspaceServiceSkillEntryActions.handleServiceSkillSelect,
        onStopSending: stopSending,
        onToggleFileManager: fileManagerSidebar.fileManagerAvailable
          ? fileManagerSidebar.toggleFileManagerSidebar
          : undefined,
        openedProjects,
        pathReferences,
        pluginHistoryRestoreLandingCard:
          workspacePluginHistoryRestoreLandingCard,
        pluginSuggestions: workspacePluginInputSuggestions,
        pluginSuggestionsError:
          workspacePluginRuntimeContext.error?.message ?? null,
        pluginSuggestionsLoading: workspacePluginRuntimeContext.loading,
        projectCharacters: projectMemory?.characters || [],
        projectConversationGroups,
        projectId: projectId ?? null,
        providerType,
        reasoningEffort,
        recentSessionActionLabel,
        recentSessionSummary: recentSessionTopic?.lastPreview ?? null,
        recentSessionTitle: recentSessionTopic?.title ?? null,
        resolvedCanvasState,
        sceneAppExecutionSummaryCard,
        serviceSkillExecutionCard,
        serviceSkillGroups: activeTheme === "general" ? serviceSkillGroups : [],
        serviceSkills: activeTheme === "general" ? serviceSkills : [],
        sessionId: sceneSessionId,
        setAccessMode,
        setActiveTheme,
        setChatToolPreferences,
        setCreationMode,
        setInput,
        setModel,
        setProviderType,
        setReasoningEffort,
        skills,
        skillsLoading: combinedSkillsLoading,
        selectedText,
        suppressRecentSessionRecovery:
          sceneMessageListEmptyStateVariant === "task-center",
      },
      messageList: {
        actions: {
          onA2UISubmit: handleMessageA2UISubmit,
          onArtifactClick: handleWorkspaceArtifactClick,
          onCodeBlockClick: handleCodeBlockClick,
          onDeleteMessage: deleteMessage,
          onEditMessage: editMessage,
          onFileClick: handleWorkspaceFileClick,
          onInterruptCurrentTurn: stopSending,
          onLoadFullHistory: () => {
            void loadFullSessionHistory();
          },
          onOpenArtifactFromTimeline: handleOpenArtifactFromTimeline,
          onOpenMessagePreview: handleOpenMessagePreview,
          onOpenSavedSiteContent: handleOpenSavedSiteContent,
          onOpenSubagentSession: handleOpenSubagentSession,
          onOpenUrlPreview: handleOpenUrlPreview,
          onPermissionResponse: handlePermissionResponse,
          onPromoteQueuedTurn: promoteQueuedTurn,
          onReplayPendingRequest: replayPendingAction,
          onResumeThread: resumeThread,
          onSaveMessageAsKnowledge: handleSaveMessageAsKnowledge,
          onSaveMessageAsSkill: handleSaveMessageAsSkill,
          onWriteFile: handleWriteFile,
        },
        collapseCodeBlocks: shouldCollapseCodeBlocks,
        emptyStateVariant: sceneMessageListEmptyStateVariant,
        focus: {
          focusedTimelineItemId: workbenchRequests.focusedTimelineItemId,
          timelineFocusRequestKey: workbenchRequests.timelineFocusRequestKey,
        },
        input: {
          quoteInput: input,
          onQuoteInputChange: setInput,
        },
        pendingPromotedA2UIActionRequest,
        projection: {
          currentTurnId: sceneCurrentTurnId,
          executionRuntime: sceneExecutionRuntime,
          isSending: sceneIsSending,
          pendingActions: scenePendingActions,
          queuedTurns: sceneQueuedTurns,
          sessionHistoryWindow,
          submittedActionsInFlight: sceneSubmittedActionsInFlight,
          threadItems: sceneThreadItems,
          threadRead: sceneThreadRead,
          todoItems,
          turns: sceneTurns,
        },
        provider: {
          accessMode,
          model,
          providerType,
          reasoningEffort,
        },
        refreshSessionReadModel,
        sceneSessionId,
        shouldCollapseCodeBlock: shouldCollapseCodeBlockInChat,
      },
      scene: {
        navbarContextVariant:
          agentEntry === "claw" || shouldUseBrowserWorkspaceHomeChrome
            ? "task-center"
            : "default",
        navigationActions,
        inputbarScene,
        canvasScene,
        handleSendFromEmptyState,
        shellChromeRuntime,
        currentImageWorkbenchActive: currentImageWorkbenchState.active,
        browserWorkbenchOpenRequest:
          workbenchRequests.browserWorkbenchOpenRequest,
        onBrowserWorkbenchOpenRequestHandled:
          workbenchRequests.handleBrowserWorkbenchOpenRequestHandled,
        canvasWorkbenchPreviewOpenRequest:
          workbenchRequests.canvasWorkbenchPreviewOpenRequest,
        onCanvasWorkbenchPreviewOpenRequestHandled:
          workbenchRequests.handleCanvasWorkbenchPreviewOpenRequestHandled,
        projectId: projectId ?? null,
        openedProjects,
        onCloseProject: handleCloseOpenedProject,
        deferWorkspaceListLoad: shouldUseBrowserWorkspaceHomeChrome,
        projectRootPath: project?.rootPath || null,
        contextWorkspaceEnabled: contextWorkspace.generalWorkbenchEnabled,
        activeTheme,
        contentId,
        taskCenterTabsNode: shouldRenderTaskCenterTabStrip
          ? taskCenterTabsNode
          : browserWorkspaceHomeTabsNode,
        suppressNavbarUtilityActions: suppressHomeNavbarUtilityActions,
        topBarChrome,
        onBackToProjectManagement,
        fromResources,
        handleBackHome,
        isRestoringSession: sceneIsRestoringSession,
        sessionId: sceneSessionId,
        syncStatus,
        pendingA2UIForm: effectivePendingA2UIForm,
        pendingA2UISource: effectivePendingA2UISource,
        a2uiSubmissionNotice,
        handlePendingA2UISubmit,
        hideInlineStepProgress,
        isSpecializedThemeMode,
        hasMessages,
        steps: EMPTY_WORKSPACE_WORKFLOW_STEPS,
        activityLogs: generalWorkbenchActivityLogs,
        creationTaskEvents:
          generalWorkbenchScaffoldRuntime.generalWorkbenchCreationTaskEvents,
        canonicalChildren,
        currentStepIndex: HIDDEN_WORKSPACE_WORKFLOW_STEP_INDEX,
        goToStep: ignoreHiddenWorkspaceWorkflowStepClick,
        layoutMode: sceneLayoutMode,
        isThemeWorkbench,
        settledWorkbenchArtifacts,
        resolvedCanvasState,
        taskFiles,
        selectedFileId,
        handleHarnessLoadFilePreview,
        setCanvasWorkbenchLayoutMode,
        workspacePathMissing: Boolean(workspacePathMissing),
        workspaceHealthError,
      },
    },
    fileManager: {
      fileManagerSidebar,
      initialDirectory: project?.rootPath || null,
      onAddPathReferences: handleAddPathReferences,
      onImportAsKnowledge: inputbarScene.onImportPathReferenceAsKnowledge,
      onInstallSkillPackage: _onNavigate
        ? handleInstallSkillPackageFromFileManager
        : undefined,
      onOpenWorkspaceFile: (absolutePath) => {
        void openProjectFilePreviewInCanvas({
          absolutePath,
        });
      },
    },
    shell: {
      compactChrome: shellChromeRuntime.isWorkspaceCompactChrome,
      isThemeWorkbench,
      showGeneralWorkbenchLeftExpandButton,
      onExpandGeneralWorkbenchSidebar: handleExpandGeneralWorkbenchSidebar,
    },
  });
  return (
    <>
      {workspaceSceneNode}
      <AutomationJobDialog
        open={workspaceServiceSkillEntryActions.automationDialogOpen}
        mode="create"
        workspaces={workspaceServiceSkillEntryActions.automationWorkspaces}
        initialValues={
          workspaceServiceSkillEntryActions.automationDialogInitialValues
        }
        threadLineage={
          workspaceServiceSkillEntryActions.automationThreadLineage
        }
        saving={workspaceServiceSkillEntryActions.automationJobSaving}
        onOpenChange={
          workspaceServiceSkillEntryActions.handleAutomationDialogOpenChange
        }
        onSubmit={
          workspaceServiceSkillEntryActions.handleAutomationDialogSubmit
        }
      />
      {sceneAppReviewDecisionDialogNode}
    </>
  );
}
