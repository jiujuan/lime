import type {
  ComponentProps,
  Dispatch,
  ReactNode,
  SetStateAction,
} from "react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatNumber } from "@/i18n/format";
import { StepProgress } from "@/components/workspace/layout/StepProgress";
import { useWorkspaceNavigationActions } from "./useWorkspaceNavigationActions";
import { useWorkspaceInputbarSceneRuntime } from "./useWorkspaceInputbarSceneRuntime";
import { useWorkspaceCanvasSceneRuntime } from "./useWorkspaceCanvasSceneRuntime";
import { scheduleMinimumDelayIdleTask } from "@/lib/utils/scheduleMinimumDelayIdleTask";
import { CanvasSessionOverviewPanel } from "../components/CanvasSessionOverviewPanel";
import { MessageList } from "../components/MessageList";
import type {
  CanvasWorkbenchSessionView,
  CanvasWorkbenchUtilityView,
} from "../components/CanvasWorkbenchLayout";
import type { ChatToolPreferences } from "../utils/chatToolPreferences";
import type { CreationMode } from "../components/types";
import type { WriteArtifactContext } from "../types";
import type { PendingA2UISource } from "../types";
import type { LayoutMode, ThemeType } from "@/lib/workspace/workbenchContract";
import type { Artifact } from "@/lib/artifact/types";
import type { Character } from "@/lib/api/memory";
import type { TaskFile } from "../components/TaskFiles";
import type { InputbarSendHandler } from "../components/Inputbar/inputbarSendPayload";
import type { TeamDefinition } from "../utils/teamDefinitions";
import type { WorkspacePathMissingState } from "../hooks/agentChatShared";
import type { SyncStatus } from "../hooks/useContentSync";
import type { ArtifactTimelineOpenTarget } from "../utils/artifactTimelineNavigation";
import { buildAgentTaskRuntimeCardModel } from "../utils/agentTaskRuntime";
import type { CreationReplaySurfaceModel } from "../utils/creationReplaySurface";
import { buildStepProgressProps } from "./chatSurfaceProps";
import { WorkspaceConversationScene } from "./WorkspaceConversationScene";
import {
  buildCanvasWorkbenchChangeView,
  buildOutputHeaderViewModel,
  buildQuotedReplyText,
  buildSessionHeaderViewModel,
  buildSessionRuntimeCounters,
  buildSessionRuntimeProjectionIdentity,
  buildSessionRuntimeProjectionState,
  buildWorkspaceHeaderView,
  isCodeOutputThreadItem,
  resolveNextSessionRuntimeProjectionState,
  resolveSessionRuntimeProjectionStatus,
  resolveSessionStatusBadge,
  shouldConsiderSessionRuntimeProjectionDeferral,
} from "./workspaceConversationSceneViewModel";

type InputbarScene = Pick<
  ReturnType<typeof useWorkspaceInputbarSceneRuntime>,
  | "inputbarNode"
  | "generalWorkbenchDialog"
  | "runtimeToolAvailability"
  | "knowledgePackSelection"
  | "knowledgePackOptions"
  | "onToggleKnowledgePack"
  | "onSelectKnowledgePack"
  | "onToggleKnowledgeCompanionPack"
  | "onStartKnowledgeOrganize"
  | "onManageKnowledgePacks"
>;
type CanvasScene = Pick<
  ReturnType<typeof useWorkspaceCanvasSceneRuntime>,
  | "hasLiveCanvasPreviewContent"
  | "liveCanvasPreview"
  | "shouldShowCanvasLoadingState"
  | "canvasWorkbenchDefaultPreview"
  | "handleOpenCanvasWorkbenchPath"
  | "handleRevealCanvasWorkbenchPath"
  | "handleCloseCanvasWorkbench"
  | "renderCanvasWorkbenchPreview"
>;
type WorkspaceConversationSceneProps = ComponentProps<
  typeof WorkspaceConversationScene
>;
type CanvasWorkbenchLayoutProps = NonNullable<
  WorkspaceConversationSceneProps["canvasWorkbenchLayoutProps"]
>;
interface ConversationScenePresentationParams {
  scene: Omit<
    WorkspaceConversationSceneProps,
    | "workspaceAlertVisible"
    | "projectId"
    | "canvasWorkbenchLayoutProps"
    | "stepProgressProps"
    | "messageListProps"
  > & {
    projectId: string | null | undefined;
  };
  stepProgress: {
    hidden: boolean;
    isSpecializedThemeMode: boolean;
    hasMessages: boolean;
    steps: ComponentProps<typeof StepProgress>["steps"];
    currentIndex: ComponentProps<typeof StepProgress>["currentIndex"];
    onStepClick: NonNullable<
      ComponentProps<typeof StepProgress>["onStepClick"]
    >;
  };
  messageList: ComponentProps<typeof MessageList>;
  workspaceAlert: {
    workspacePathMissing: boolean;
    workspaceHealthError: boolean;
  };
  canvasWorkbenchLayout: Omit<
    CanvasWorkbenchLayoutProps,
    "workspaceUnavailable"
  >;
}
interface WorkspaceConversationScenePresentationResult {
  workspaceAlertVisible: boolean;
  mainAreaNode: ReactNode;
}
type NavigationActions = Pick<
  ReturnType<typeof useWorkspaceNavigationActions>,
  | "handleDismissEntryBanner"
  | "handleWorkspaceAlertSelectDirectory"
  | "handleDismissWorkspaceAlert"
  | "handleManageProviders"
  | "handleProjectChange"
  | "handleOpenAppearanceSettings"
  | "handleOpenRuntimeMemoryWorkbench"
  | "handleOpenChannels"
  | "handleOpenChromeRelay"
  | "handleBackToResources"
  | "handleCompactContext"
>;
interface ShellChromeRuntime {
  showChatLayout: boolean;
  isWorkspaceCompactChrome: boolean;
  workflowLayoutBottomSpacing: {
    shellBottomInset: string;
    messageViewportBottomPadding: string;
  };
  shouldHideGeneralWorkbenchInputForTheme: boolean;
  shouldRenderTopBar: boolean;
  layoutTransitionChatPanelWidth?: string;
  layoutTransitionChatPanelMinWidth?: string;
  shouldShowGeneralWorkbenchFloatingInputOverlay: boolean;
  shouldRenderInlineA2UI: boolean;
}

function renderWorkspaceConversationScene({
  scene,
  stepProgress,
  messageList,
  workspaceAlert,
  canvasWorkbenchLayout,
}: ConversationScenePresentationParams): WorkspaceConversationScenePresentationResult {
  const stepProgressProps = buildStepProgressProps(stepProgress);
  const workspaceAlertVisible = Boolean(
    workspaceAlert.workspacePathMissing || workspaceAlert.workspaceHealthError,
  );

  const canvasWorkbenchLayoutProps: CanvasWorkbenchLayoutProps = {
    ...canvasWorkbenchLayout,
    workspaceUnavailable: workspaceAlertVisible,
  };

  return {
    workspaceAlertVisible,
    mainAreaNode: (
      <WorkspaceConversationScene
        {...scene}
        stepProgressProps={stepProgressProps}
        messageListProps={messageList}
        workspaceAlertVisible={workspaceAlertVisible}
        projectId={scene.projectId ?? null}
        canvasWorkbenchLayoutProps={canvasWorkbenchLayoutProps}
      />
    ),
  };
}

const SESSION_RUNTIME_PROJECTION_DEFER_MESSAGE_THRESHOLD = 20;
const SESSION_RUNTIME_PROJECTION_DEFER_TURN_THRESHOLD = 6;
const SESSION_RUNTIME_PROJECTION_DEFER_ITEM_THRESHOLD = 24;
const SESSION_RUNTIME_PROJECTION_DEFER_DELAY_MS = 700;
const SESSION_RUNTIME_PROJECTION_DEFER_IDLE_TIMEOUT_MS = 1_800;
const EMPTY_PROJECTED_TURNS: NonNullable<
  ConversationScenePresentationParams["messageList"]["turns"]
> = [];
const EMPTY_PROJECTED_THREAD_ITEMS: NonNullable<
  ConversationScenePresentationParams["messageList"]["threadItems"]
> = [];
const EMPTY_PROJECTED_PENDING_ACTIONS: NonNullable<
  ConversationScenePresentationParams["messageList"]["pendingActions"]
> = [];
const EMPTY_PROJECTED_SUBMITTED_ACTIONS: NonNullable<
  ConversationScenePresentationParams["messageList"]["submittedActionsInFlight"]
> = [];
const EMPTY_PROJECTED_QUEUED_TURNS: NonNullable<
  ConversationScenePresentationParams["messageList"]["queuedTurns"]
> = [];
const EMPTY_PROJECTED_CHILD_SUBAGENT_SESSIONS: NonNullable<
  ConversationScenePresentationParams["messageList"]["childSubagentSessions"]
> = [];

interface UseWorkspaceConversationSceneRuntimeParams {
  messageListEmptyStateVariant?: "default" | "task-center";
  navbarContextVariant?: "default" | "task-center";
  navigationActions: NavigationActions;
  inputbarScene: InputbarScene;
  canvasScene: CanvasScene;
  handleSendFromEmptyState: InputbarSendHandler;
  shellChromeRuntime: ShellChromeRuntime;
  generalWorkbenchHarnessDialog: ConversationScenePresentationParams["scene"]["generalWorkbenchHarnessDialog"];
  entryBannerVisible: ConversationScenePresentationParams["scene"]["entryBannerVisible"];
  entryBannerMessage: ConversationScenePresentationParams["scene"]["entryBannerMessage"];
  creationReplaySurface?: CreationReplaySurfaceModel | null;
  defaultCuratedTaskReferenceMemoryIds?: ConversationScenePresentationParams["scene"]["defaultCuratedTaskReferenceMemoryIds"];
  defaultCuratedTaskReferenceEntries?: ConversationScenePresentationParams["scene"]["defaultCuratedTaskReferenceEntries"];
  pathReferences?: ConversationScenePresentationParams["scene"]["pathReferences"];
  onAddPathReferences?: ConversationScenePresentationParams["scene"]["onAddPathReferences"];
  onImportPathReferenceAsKnowledge?: ConversationScenePresentationParams["scene"]["onImportPathReferenceAsKnowledge"];
  onRemovePathReference?: ConversationScenePresentationParams["scene"]["onRemovePathReference"];
  onClearPathReferences?: ConversationScenePresentationParams["scene"]["onClearPathReferences"];
  fileManagerOpen?: ConversationScenePresentationParams["scene"]["fileManagerOpen"];
  onToggleFileManager?: ConversationScenePresentationParams["scene"]["onToggleFileManager"];
  sceneAppExecutionSummaryCard?: ConversationScenePresentationParams["scene"]["sceneAppExecutionSummaryCard"];
  serviceSkillExecutionCard?: ConversationScenePresentationParams["scene"]["serviceSkillExecutionCard"];
  contextWorkspaceEnabled: boolean;
  input: ConversationScenePresentationParams["scene"]["input"];
  setInput: ConversationScenePresentationParams["scene"]["setInput"];
  providerType: ConversationScenePresentationParams["scene"]["providerType"];
  setProviderType: ConversationScenePresentationParams["scene"]["setProviderType"];
  model: ConversationScenePresentationParams["scene"]["model"];
  setModel: ConversationScenePresentationParams["scene"]["setModel"];
  reasoningEffort: ConversationScenePresentationParams["scene"]["reasoningEffort"];
  setReasoningEffort: ConversationScenePresentationParams["scene"]["setReasoningEffort"];
  accessMode: ConversationScenePresentationParams["scene"]["accessMode"];
  setAccessMode: ConversationScenePresentationParams["scene"]["setAccessMode"];
  chatToolPreferences: ChatToolPreferences;
  setChatToolPreferences: Dispatch<SetStateAction<ChatToolPreferences>>;
  objectiveEnabled?: ConversationScenePresentationParams["scene"]["objectiveEnabled"];
  onObjectiveEnabledChange?: ConversationScenePresentationParams["scene"]["onObjectiveEnabledChange"];
  selectedTeam?: TeamDefinition | null;
  creationMode: CreationMode;
  setCreationMode: Dispatch<SetStateAction<CreationMode>>;
  activeTheme: string;
  setActiveTheme: Dispatch<SetStateAction<string>>;
  lockTheme: boolean;
  artifacts: Artifact[];
  generalCanvasContent: string;
  resolvedCanvasState: ConversationScenePresentationParams["scene"]["resolvedCanvasState"];
  contentId: ConversationScenePresentationParams["scene"]["contentId"];
  selectedText: ConversationScenePresentationParams["scene"]["selectedText"];
  handleRecommendationClick: ConversationScenePresentationParams["scene"]["onRecommendationClick"];
  projectCharacters: Character[];
  skills: ConversationScenePresentationParams["scene"]["skills"];
  serviceSkills: ConversationScenePresentationParams["scene"]["serviceSkills"];
  serviceSkillGroups: ConversationScenePresentationParams["scene"]["serviceSkillGroups"];
  skillsLoading: ConversationScenePresentationParams["scene"]["isSkillsLoading"];
  onSelectServiceSkill?: ConversationScenePresentationParams["scene"]["onSelectServiceSkill"];
  initialInputCapability?: ConversationScenePresentationParams["scene"]["initialInputCapability"];
  handleNavigateToSkillSettings: ConversationScenePresentationParams["scene"]["onNavigateToSettings"];
  handleRefreshSkills: ConversationScenePresentationParams["scene"]["onRefreshSkills"];
  handleOpenBrowserAssistInCanvas: ConversationScenePresentationParams["scene"]["onLaunchBrowserAssist"];
  browserAssistLaunching: ConversationScenePresentationParams["scene"]["browserAssistLoading"];
  recentSessionTitle?: ConversationScenePresentationParams["scene"]["recentSessionTitle"];
  recentSessionSummary?: ConversationScenePresentationParams["scene"]["recentSessionSummary"];
  recentSessionActionLabel?: ConversationScenePresentationParams["scene"]["recentSessionActionLabel"];
  handleResumeRecentSession?: ConversationScenePresentationParams["scene"]["onResumeRecentSession"];
  projectId: string | null;
  openedProjects?: ConversationScenePresentationParams["scene"]["openedProjects"];
  onCloseProject?: ConversationScenePresentationParams["scene"]["onCloseProject"];
  deferWorkspaceListLoad?: ConversationScenePresentationParams["scene"]["deferWorkspaceListLoad"];
  workspaceHintMessage?: ConversationScenePresentationParams["scene"]["workspaceHintMessage"];
  workspaceHintVisible?: ConversationScenePresentationParams["scene"]["workspaceHintVisible"];
  onDismissWorkspaceHint?: ConversationScenePresentationParams["scene"]["onDismissWorkspaceHint"];
  taskCenterTabsNode?: ConversationScenePresentationParams["scene"]["taskCenterTabsNode"];
  suppressNavbarUtilityActions?: boolean;
  hideHistoryToggle: boolean;
  showChatPanel: boolean;
  topBarChrome: ConversationScenePresentationParams["scene"]["navbarChrome"];
  onBackToProjectManagement?: ConversationScenePresentationParams["scene"]["onBackToProjectManagement"];
  fromResources: boolean;
  handleBackHome: ConversationScenePresentationParams["scene"]["onBackHome"];
  handleToggleSidebar: ConversationScenePresentationParams["scene"]["onToggleHistory"];
  handlePrefetchHistory?: ConversationScenePresentationParams["scene"]["onPrefetchHistory"];
  showHarnessToggle: ConversationScenePresentationParams["scene"]["showHarnessToggle"];
  navbarHarnessPanelVisible: ConversationScenePresentationParams["scene"]["harnessPanelVisible"];
  handleToggleHarnessPanel: ConversationScenePresentationParams["scene"]["onToggleHarnessPanel"];
  harnessPendingCount: ConversationScenePresentationParams["scene"]["harnessPendingCount"];
  harnessAttentionLevel: ConversationScenePresentationParams["scene"]["harnessAttentionLevel"];
  harnessToggleLabel: ConversationScenePresentationParams["scene"]["harnessToggleLabel"];
  isRestoringSession: boolean;
  sessionId: string | null | undefined;
  syncStatus: SyncStatus;
  pendingA2UIForm: ConversationScenePresentationParams["scene"]["pendingA2UIForm"];
  pendingA2UISource: PendingA2UISource | null;
  a2uiSubmissionNotice: ConversationScenePresentationParams["scene"]["a2uiSubmissionNotice"];
  handlePendingA2UISubmit: NonNullable<
    ConversationScenePresentationParams["scene"]["onPendingA2UISubmit"]
  >;
  handleToggleCanvas: ConversationScenePresentationParams["scene"]["onToggleCanvas"];
  currentImageWorkbenchActive: ConversationScenePresentationParams["scene"]["currentImageWorkbenchActive"];
  hideInlineStepProgress: ConversationScenePresentationParams["stepProgress"]["hidden"];
  isSpecializedThemeMode: ConversationScenePresentationParams["stepProgress"]["isSpecializedThemeMode"];
  hasMessages: ConversationScenePresentationParams["stepProgress"]["hasMessages"];
  steps: ConversationScenePresentationParams["stepProgress"]["steps"];
  currentStepIndex: ConversationScenePresentationParams["stepProgress"]["currentIndex"];
  goToStep: ConversationScenePresentationParams["stepProgress"]["onStepClick"];
  displayMessages: ConversationScenePresentationParams["messageList"]["messages"];
  turns: ConversationScenePresentationParams["messageList"]["turns"];
  effectiveThreadItems: ConversationScenePresentationParams["messageList"]["threadItems"];
  currentTurnId: ConversationScenePresentationParams["messageList"]["currentTurnId"];
  threadRead: ConversationScenePresentationParams["messageList"]["threadRead"];
  pendingActions: ConversationScenePresentationParams["messageList"]["pendingActions"];
  submittedActionsInFlight: ConversationScenePresentationParams["messageList"]["submittedActionsInFlight"];
  queuedTurns: ConversationScenePresentationParams["messageList"]["queuedTurns"];
  childSubagentSessions?: ConversationScenePresentationParams["messageList"]["childSubagentSessions"];
  sessionHistoryWindow?: ConversationScenePresentationParams["messageList"]["sessionHistoryWindow"];
  loadFullSessionHistory?: ConversationScenePresentationParams["messageList"]["onLoadFullHistory"];
  isPreparingSend: boolean;
  isSending: ConversationScenePresentationParams["messageList"]["isSending"];
  stopSending: ConversationScenePresentationParams["messageList"]["onInterruptCurrentTurn"];
  resumeThread: ConversationScenePresentationParams["messageList"]["onResumeThread"];
  replayPendingAction: ConversationScenePresentationParams["messageList"]["onReplayPendingRequest"];
  promoteQueuedTurn: ConversationScenePresentationParams["messageList"]["onPromoteQueuedTurn"];
  deleteMessage: ConversationScenePresentationParams["messageList"]["onDeleteMessage"];
  editMessage: ConversationScenePresentationParams["messageList"]["onEditMessage"];
  handleA2UISubmit: ConversationScenePresentationParams["messageList"]["onA2UISubmit"];
  handleWriteFile: (
    content: string,
    fileName: string,
    context?: WriteArtifactContext,
  ) => void | Promise<void>;
  handleFileClick: ConversationScenePresentationParams["messageList"]["onFileClick"];
  handleOpenArtifactFromTimeline: (target: ArtifactTimelineOpenTarget) => void;
  handleOpenSavedSiteContent: ConversationScenePresentationParams["messageList"]["onOpenSavedSiteContent"];
  handleArtifactClick: ConversationScenePresentationParams["messageList"]["onArtifactClick"];
  handleOpenMessagePreview?: ConversationScenePresentationParams["messageList"]["onOpenMessagePreview"];
  handleSaveMessageAsSkill?: ConversationScenePresentationParams["messageList"]["onSaveMessageAsSkill"];
  handleSaveMessageAsInspiration?: ConversationScenePresentationParams["messageList"]["onSaveMessageAsInspiration"];
  handleSaveMessageAsKnowledge?: ConversationScenePresentationParams["messageList"]["onSaveMessageAsKnowledge"];
  handleOpenSubagentSession: ConversationScenePresentationParams["messageList"]["onOpenSubagentSession"];
  handlePermissionResponse: ConversationScenePresentationParams["messageList"]["onPermissionResponse"];
  pendingPromotedA2UIActionRequest: unknown;
  shouldCollapseCodeBlocks: ConversationScenePresentationParams["messageList"]["collapseCodeBlocks"];
  shouldCollapseCodeBlockInChat: ConversationScenePresentationParams["messageList"]["shouldCollapseCodeBlock"];
  handleCodeBlockClick: ConversationScenePresentationParams["messageList"]["onCodeBlockClick"];
  layoutMode: LayoutMode;
  isThemeWorkbench: boolean;
  settledWorkbenchArtifacts: ConversationScenePresentationParams["canvasWorkbenchLayout"]["artifacts"];
  taskFiles: TaskFile[];
  selectedFileId: string | undefined;
  projectRootPath: string | null;
  handleHarnessLoadFilePreview: ConversationScenePresentationParams["canvasWorkbenchLayout"]["loadFilePreview"];
  setCanvasWorkbenchLayoutMode: ConversationScenePresentationParams["canvasWorkbenchLayout"]["onLayoutModeChange"];
  workspacePathMissing: WorkspacePathMissingState | boolean | null;
  workspaceHealthError: boolean;
  focusedTimelineItemId: string | null;
  timelineFocusRequestKey: number;
}

export function useWorkspaceConversationSceneRuntime({
  messageListEmptyStateVariant = "default",
  navbarContextVariant = "default",
  navigationActions,
  inputbarScene,
  canvasScene,
  handleSendFromEmptyState,
  shellChromeRuntime,
  generalWorkbenchHarnessDialog,
  entryBannerVisible,
  entryBannerMessage,
  creationReplaySurface,
  defaultCuratedTaskReferenceMemoryIds,
  defaultCuratedTaskReferenceEntries,
  pathReferences,
  onAddPathReferences,
  onImportPathReferenceAsKnowledge,
  onRemovePathReference,
  onClearPathReferences,
  fileManagerOpen,
  onToggleFileManager,
  sceneAppExecutionSummaryCard,
  serviceSkillExecutionCard,
  contextWorkspaceEnabled,
  input,
  setInput,
  providerType,
  setProviderType,
  model,
  setModel,
  reasoningEffort,
  setReasoningEffort,
  accessMode,
  setAccessMode,
  chatToolPreferences,
  setChatToolPreferences,
  objectiveEnabled,
  onObjectiveEnabledChange,
  creationMode,
  setCreationMode,
  activeTheme,
  setActiveTheme,
  lockTheme,
  artifacts,
  generalCanvasContent,
  resolvedCanvasState,
  contentId,
  selectedText,
  handleRecommendationClick,
  projectCharacters,
  skills,
  serviceSkills,
  serviceSkillGroups,
  skillsLoading,
  onSelectServiceSkill,
  initialInputCapability,
  handleNavigateToSkillSettings,
  handleRefreshSkills,
  handleOpenBrowserAssistInCanvas,
  browserAssistLaunching,
  recentSessionTitle,
  recentSessionSummary,
  recentSessionActionLabel,
  handleResumeRecentSession,
  projectId,
  openedProjects,
  onCloseProject,
  deferWorkspaceListLoad,
  workspaceHintMessage,
  workspaceHintVisible,
  onDismissWorkspaceHint,
  taskCenterTabsNode,
  suppressNavbarUtilityActions = false,
  hideHistoryToggle,
  showChatPanel,
  topBarChrome,
  onBackToProjectManagement,
  fromResources,
  handleBackHome,
  handleToggleSidebar,
  handlePrefetchHistory,
  showHarnessToggle,
  navbarHarnessPanelVisible,
  handleToggleHarnessPanel,
  harnessPendingCount,
  harnessAttentionLevel,
  harnessToggleLabel,
  isRestoringSession,
  sessionId,
  syncStatus,
  pendingA2UIForm,
  pendingA2UISource,
  a2uiSubmissionNotice,
  handlePendingA2UISubmit,
  handleToggleCanvas,
  currentImageWorkbenchActive,
  hideInlineStepProgress,
  isSpecializedThemeMode,
  hasMessages,
  steps,
  currentStepIndex,
  goToStep,
  displayMessages,
  turns = EMPTY_PROJECTED_TURNS,
  effectiveThreadItems = EMPTY_PROJECTED_THREAD_ITEMS,
  currentTurnId,
  threadRead,
  pendingActions = EMPTY_PROJECTED_PENDING_ACTIONS,
  submittedActionsInFlight = EMPTY_PROJECTED_SUBMITTED_ACTIONS,
  queuedTurns = EMPTY_PROJECTED_QUEUED_TURNS,
  childSubagentSessions = EMPTY_PROJECTED_CHILD_SUBAGENT_SESSIONS,
  sessionHistoryWindow = null,
  loadFullSessionHistory,
  isPreparingSend,
  isSending,
  stopSending,
  resumeThread,
  replayPendingAction,
  promoteQueuedTurn,
  deleteMessage,
  editMessage,
  handleA2UISubmit,
  handleWriteFile,
  handleFileClick,
  handleOpenArtifactFromTimeline,
  handleOpenSavedSiteContent,
  handleArtifactClick,
  handleOpenMessagePreview,
  handleSaveMessageAsSkill,
  handleSaveMessageAsInspiration,
  handleSaveMessageAsKnowledge,
  handleOpenSubagentSession,
  handlePermissionResponse,
  pendingPromotedA2UIActionRequest,
  shouldCollapseCodeBlocks,
  shouldCollapseCodeBlockInChat,
  handleCodeBlockClick,
  layoutMode,
  isThemeWorkbench,
  settledWorkbenchArtifacts,
  taskFiles,
  selectedFileId,
  projectRootPath,
  handleHarnessLoadFilePreview,
  setCanvasWorkbenchLayoutMode,
  workspacePathMissing,
  workspaceHealthError,
  focusedTimelineItemId,
  timelineFocusRequestKey,
}: UseWorkspaceConversationSceneRuntimeParams) {
  const { i18n, t } = useTranslation("agent");
  const locale = i18n.language;
  const sessionRuntimeProjectionIdentity =
    buildSessionRuntimeProjectionIdentity({
      sessionId,
      messages: displayMessages,
      turns,
      threadItems: effectiveThreadItems,
    });
  const shouldConsiderDeferringSessionRuntimeProjection =
    shouldConsiderSessionRuntimeProjectionDeferral({
      isRestoringSession,
      isSending: Boolean(isSending),
      focusedTimelineItemId,
      pendingA2UIForm,
      messageCount: displayMessages.length,
      turnCount: turns.length,
      threadItemCount: effectiveThreadItems.length,
      messageThreshold: SESSION_RUNTIME_PROJECTION_DEFER_MESSAGE_THRESHOLD,
      turnThreshold: SESSION_RUNTIME_PROJECTION_DEFER_TURN_THRESHOLD,
      threadItemThreshold: SESSION_RUNTIME_PROJECTION_DEFER_ITEM_THRESHOLD,
    });
  const [sessionRuntimeProjectionState, setSessionRuntimeProjectionState] =
    useState(() =>
      buildSessionRuntimeProjectionState({
        key: sessionRuntimeProjectionIdentity.key,
        sessionId: sessionRuntimeProjectionIdentity.sessionId,
        firstMessageId: sessionRuntimeProjectionIdentity.firstMessageId,
        lastMessageId: sessionRuntimeProjectionIdentity.lastMessageId,
        ready: !shouldConsiderDeferringSessionRuntimeProjection,
      }),
    );
  const sessionRuntimeProjectionStatus = resolveSessionRuntimeProjectionStatus({
    currentState: sessionRuntimeProjectionState,
    identity: sessionRuntimeProjectionIdentity,
    shouldConsiderDeferring: shouldConsiderDeferringSessionRuntimeProjection,
  });

  useEffect(() => {
    if (!sessionRuntimeProjectionStatus.shouldDefer) {
      const nextState = buildSessionRuntimeProjectionState({
        key: sessionRuntimeProjectionIdentity.key,
        sessionId: sessionRuntimeProjectionIdentity.sessionId,
        firstMessageId: sessionRuntimeProjectionIdentity.firstMessageId,
        lastMessageId: sessionRuntimeProjectionIdentity.lastMessageId,
        ready: true,
      });
      setSessionRuntimeProjectionState((current) =>
        resolveNextSessionRuntimeProjectionState(current, nextState),
      );
      return;
    }

    const pendingState = buildSessionRuntimeProjectionState({
      key: sessionRuntimeProjectionIdentity.key,
      sessionId: sessionRuntimeProjectionIdentity.sessionId,
      firstMessageId: sessionRuntimeProjectionIdentity.firstMessageId,
      lastMessageId: sessionRuntimeProjectionIdentity.lastMessageId,
      ready: false,
    });
    setSessionRuntimeProjectionState((current) =>
      resolveNextSessionRuntimeProjectionState(current, pendingState),
    );
    return scheduleMinimumDelayIdleTask(
      () => {
        const readyState = buildSessionRuntimeProjectionState({
          key: sessionRuntimeProjectionIdentity.key,
          sessionId: sessionRuntimeProjectionIdentity.sessionId,
          firstMessageId: sessionRuntimeProjectionIdentity.firstMessageId,
          lastMessageId: sessionRuntimeProjectionIdentity.lastMessageId,
          ready: true,
        });
        setSessionRuntimeProjectionState((current) =>
          current.key === sessionRuntimeProjectionIdentity.key
            ? resolveNextSessionRuntimeProjectionState(current, readyState)
            : current,
        );
      },
      {
        minimumDelayMs: SESSION_RUNTIME_PROJECTION_DEFER_DELAY_MS,
        idleTimeoutMs: SESSION_RUNTIME_PROJECTION_DEFER_IDLE_TIMEOUT_MS,
      },
    );
  }, [
    sessionRuntimeProjectionIdentity.firstMessageId,
    sessionRuntimeProjectionIdentity.key,
    sessionRuntimeProjectionIdentity.lastMessageId,
    sessionRuntimeProjectionIdentity.sessionId,
    sessionRuntimeProjectionStatus.shouldDefer,
  ]);

  const shouldUseDeferredSessionRuntimeProjection =
    sessionRuntimeProjectionStatus.shouldUseDeferredProjection;
  const projectedTurns = shouldUseDeferredSessionRuntimeProjection
    ? EMPTY_PROJECTED_TURNS
    : turns;
  const projectedThreadItems = shouldUseDeferredSessionRuntimeProjection
    ? EMPTY_PROJECTED_THREAD_ITEMS
    : effectiveThreadItems;
  const projectedCurrentTurnId = shouldUseDeferredSessionRuntimeProjection
    ? null
    : currentTurnId;
  const projectedThreadRead = shouldUseDeferredSessionRuntimeProjection
    ? null
    : threadRead;
  const projectedPendingActions = shouldUseDeferredSessionRuntimeProjection
    ? EMPTY_PROJECTED_PENDING_ACTIONS
    : pendingActions;
  const projectedSubmittedActionsInFlight =
    shouldUseDeferredSessionRuntimeProjection
      ? EMPTY_PROJECTED_SUBMITTED_ACTIONS
      : submittedActionsInFlight;
  const projectedQueuedTurns = shouldUseDeferredSessionRuntimeProjection
    ? EMPTY_PROJECTED_QUEUED_TURNS
    : queuedTurns;
  const projectedChildSubagentSessions =
    shouldUseDeferredSessionRuntimeProjection
      ? EMPTY_PROJECTED_CHILD_SUBAGENT_SESSIONS
      : childSubagentSessions;
  const handleQuoteMessage = (content: string) => {
    const quotedText = buildQuotedReplyText({
      content,
      input,
    });
    if (!quotedText) {
      return;
    }
    setInput(quotedText);
  };

  const navbarUtilityActionsVisible = !suppressNavbarUtilityActions;
  const shouldSyncCanvasWorkbenchLayoutMode =
    !isThemeWorkbench &&
    activeTheme === "general" &&
    layoutMode === "chat-canvas";
  const currentSessionTurn =
    projectedTurns.find((turn) => turn.id === projectedCurrentTurnId) ||
    projectedTurns.at(-1) ||
    null;
  const currentSessionStatus = resolveSessionStatusBadge(
    isSending ? "running" : currentSessionTurn?.status,
    t,
  );
  const runtimeTaskCard = useMemo(
    () =>
      buildAgentTaskRuntimeCardModel({
        messages: displayMessages,
        turns: projectedTurns,
        threadItems: projectedThreadItems,
        currentTurnId: projectedCurrentTurnId,
        threadRead: projectedThreadRead,
        pendingActions: projectedPendingActions,
        submittedActionsInFlight: projectedSubmittedActionsInFlight,
        queuedTurns: projectedQueuedTurns,
        childSubagentSessions: projectedChildSubagentSessions,
        isSending,
      }),
    [
      displayMessages,
      isSending,
      projectedChildSubagentSessions,
      projectedCurrentTurnId,
      projectedPendingActions,
      projectedSubmittedActionsInFlight,
      projectedQueuedTurns,
      projectedThreadItems,
      projectedThreadRead,
      projectedTurns,
    ],
  );
  const fileCheckpointSummary =
    projectedThreadRead?.file_checkpoint_summary || null;
  const sessionRuntimeCounters = buildSessionRuntimeCounters({
    threadItems: projectedThreadItems,
    fileCheckpointSummary,
    pendingActions: projectedPendingActions,
    queuedTurns: projectedQueuedTurns,
  });
  const sessionRuntimeCountLabels = {
    inProgressItemCountLabel: formatNumber(
      sessionRuntimeCounters.inProgressItemCount,
      { locale },
    ),
    generatedFileCountLabel: formatNumber(
      sessionRuntimeCounters.generatedFileCount,
      { locale },
    ),
    pendingActionCountLabel: formatNumber(projectedPendingActions.length, {
      locale,
    }),
    queuedTurnCountLabel: formatNumber(projectedQueuedTurns.length, {
      locale,
    }),
  };
  const changeView = useMemo(() => {
    return buildCanvasWorkbenchChangeView({
      threadItems: sessionRuntimeCounters.hasRuntimeFileChanges
        ? projectedThreadItems
        : [],
      fileCheckpointSummary,
      onOpenFile: canvasScene.handleOpenCanvasWorkbenchPath,
    });
  }, [
    canvasScene.handleOpenCanvasWorkbenchPath,
    fileCheckpointSummary,
    projectedThreadItems,
    sessionRuntimeCounters.hasRuntimeFileChanges,
  ]);
  const sessionHeaderView = buildSessionHeaderViewModel({
    t,
    currentSessionTurn,
    currentSessionStatus,
    counters: sessionRuntimeCounters,
    labels: sessionRuntimeCountLabels,
    pendingActionCount: projectedPendingActions.length,
    queuedTurnCount: projectedQueuedTurns.length,
  });
  const sessionView: CanvasWorkbenchSessionView | null = sessionHeaderView
    ? {
        ...sessionHeaderView,
        renderPanel: () => (
          <CanvasSessionOverviewPanel
            turns={projectedTurns}
            threadItems={projectedThreadItems}
            currentTurnId={projectedCurrentTurnId}
            pendingActions={projectedPendingActions}
            queuedTurns={projectedQueuedTurns}
            isSending={isSending}
            focusedItemId={focusedTimelineItemId}
          />
        ),
      }
    : null;
  const outputHeaderView = buildOutputHeaderViewModel({
    t,
    counters: sessionRuntimeCounters,
  });
  const outputView: CanvasWorkbenchUtilityView = {
    ...outputHeaderView,
    renderPanel: () => (
      <CanvasSessionOverviewPanel
        turns={projectedTurns}
        threadItems={projectedThreadItems.filter(isCodeOutputThreadItem)}
        currentTurnId={projectedCurrentTurnId}
        pendingActions={[]}
        queuedTurns={[]}
        isSending={isSending}
        focusedItemId={focusedTimelineItemId}
      />
    ),
  };
  const workspaceView = buildWorkspaceHeaderView({
    projectRootPath,
    workspacePathMissing: Boolean(workspacePathMissing),
    workspaceHealthError,
  });

  return renderWorkspaceConversationScene({
    scene: {
      entryBannerVisible,
      entryBannerMessage,
      onDismissEntryBanner: navigationActions.handleDismissEntryBanner,
      creationReplaySurface,
      defaultCuratedTaskReferenceMemoryIds,
      defaultCuratedTaskReferenceEntries,
      pathReferences,
      onAddPathReferences,
      onImportPathReferenceAsKnowledge,
      onRemovePathReference,
      onClearPathReferences,
      fileManagerOpen,
      onToggleFileManager,
      sceneAppExecutionSummaryCard,
      serviceSkillExecutionCard,
      showChatLayout: shellChromeRuntime.showChatLayout,
      compactChrome: shellChromeRuntime.isWorkspaceCompactChrome,
      contextWorkspaceEnabled,
      generalWorkbenchMessageViewportBottomPadding:
        shellChromeRuntime.workflowLayoutBottomSpacing
          .messageViewportBottomPadding,
      onSelectWorkspaceDirectory:
        navigationActions.handleWorkspaceAlertSelectDirectory,
      onDismissWorkspaceAlert: navigationActions.handleDismissWorkspaceAlert,
      shouldHideGeneralWorkbenchInputForTheme:
        shellChromeRuntime.shouldHideGeneralWorkbenchInputForTheme,
      inputbarNode: inputbarScene.inputbarNode,
      input,
      setInput,
      onSendMessage: handleSendFromEmptyState,
      emptyStateIsLoading: isPreparingSend || isSending,
      emptyStateDisabled: isPreparingSend || isSending,
      providerType,
      setProviderType,
      model,
      setModel,
      reasoningEffort,
      setReasoningEffort,
      accessMode,
      setAccessMode,
      onManageProviders: navigationActions.handleManageProviders,
      toolPreferences: chatToolPreferences,
      onToolPreferenceChange: (key, enabled) =>
        setChatToolPreferences((previous) => ({
          ...previous,
          [key]: enabled,
        })),
      objectiveEnabled,
      onObjectiveEnabledChange,
      creationMode,
      onCreationModeChange: setCreationMode,
      activeTheme: activeTheme as ThemeType,
      onThemeChange: setActiveTheme,
      themeLocked: lockTheme,
      artifactsCount: artifacts.length,
      generalCanvasContent,
      resolvedCanvasState,
      contentId,
      selectedText,
      onRecommendationClick: handleRecommendationClick,
      characters: projectCharacters,
      skills,
      serviceSkills,
      serviceSkillGroups,
      isSkillsLoading: skillsLoading,
      onSelectServiceSkill,
      onNavigateToSettings: handleNavigateToSkillSettings,
      onRefreshSkills: handleRefreshSkills,
      onLaunchBrowserAssist: handleOpenBrowserAssistInCanvas,
      browserAssistLoading: browserAssistLaunching,
      recentSessionTitle:
        messageListEmptyStateVariant === "task-center"
          ? undefined
          : recentSessionTitle,
      recentSessionSummary:
        messageListEmptyStateVariant === "task-center"
          ? undefined
          : recentSessionSummary,
      recentSessionActionLabel:
        messageListEmptyStateVariant === "task-center"
          ? undefined
          : recentSessionActionLabel,
      onResumeRecentSession:
        messageListEmptyStateVariant === "task-center"
          ? undefined
          : handleResumeRecentSession,
      projectId,
      openedProjects,
      deferWorkspaceListLoad,
      workspaceHintMessage,
      workspaceHintVisible,
      onDismissWorkspaceHint,
      sessionId,
      onProjectChange: navigationActions.handleProjectChange,
      onCloseProject,
      onOpenSettings: navbarUtilityActionsVisible
        ? navigationActions.handleOpenAppearanceSettings
        : undefined,
      runtimeToolAvailability: inputbarScene.runtimeToolAvailability,
      initialInputCapability,
      knowledgePackSelection: inputbarScene.knowledgePackSelection,
      knowledgePackOptions: inputbarScene.knowledgePackOptions,
      onToggleKnowledgePack: inputbarScene.onToggleKnowledgePack,
      onSelectKnowledgePack: inputbarScene.onSelectKnowledgePack,
      onToggleKnowledgeCompanionPack:
        inputbarScene.onToggleKnowledgeCompanionPack,
      onStartKnowledgeOrganize: inputbarScene.onStartKnowledgeOrganize,
      onManageKnowledgePacks: inputbarScene.onManageKnowledgePacks,
      runtimeTaskCard,
      taskCenterTabsNode,
      onOpenMemoryWorkbench: () =>
        navigationActions.handleOpenRuntimeMemoryWorkbench({
          sessionId,
          workingDir: projectRootPath,
          userMessage: currentSessionTurn?.prompt_text || null,
        }),
      onOpenChannels: navigationActions.handleOpenChannels,
      onOpenChromeRelay: navigationActions.handleOpenChromeRelay,
      navbarVisible: shellChromeRuntime.shouldRenderTopBar,
      isRunning: Boolean(isSending),
      navbarChrome: topBarChrome,
      navbarContextVariant,
      onToggleHistory: handleToggleSidebar,
      onPrefetchHistory: handlePrefetchHistory,
      showHistoryToggle: !hideHistoryToggle && showChatPanel,
      onBackToProjectManagement,
      onBackToResources: fromResources
        ? navigationActions.handleBackToResources
        : undefined,
      isThemeWorkbench,
      layoutMode,
      onToggleCanvas: handleToggleCanvas,
      onBackHome: handleBackHome,
      showHarnessToggle: navbarUtilityActionsVisible && showHarnessToggle,
      harnessPanelVisible:
        navbarUtilityActionsVisible && navbarHarnessPanelVisible,
      onToggleHarnessPanel: navbarUtilityActionsVisible
        ? handleToggleHarnessPanel
        : undefined,
      harnessPendingCount: navbarUtilityActionsVisible
        ? harnessPendingCount
        : 0,
      harnessAttentionLevel: navbarUtilityActionsVisible
        ? harnessAttentionLevel
        : "idle",
      harnessToggleLabel: navbarUtilityActionsVisible
        ? harnessToggleLabel
        : undefined,
      showContextCompactionAction:
        navbarUtilityActionsVisible && Boolean(sessionId),
      contextCompactionRunning: navbarUtilityActionsVisible && isSending,
      onCompactContext: navbarUtilityActionsVisible
        ? navigationActions.handleCompactContext
        : undefined,
      syncStatus,
      pendingA2UIForm,
      onPendingA2UISubmit: handlePendingA2UISubmit,
      a2uiSubmissionNotice,
      hasLiveCanvasPreviewContent: canvasScene.hasLiveCanvasPreviewContent,
      liveCanvasPreview: canvasScene.liveCanvasPreview,
      currentImageWorkbenchActive,
      shouldShowCanvasLoadingState: canvasScene.shouldShowCanvasLoadingState,
      shellBottomInset:
        shellChromeRuntime.workflowLayoutBottomSpacing.shellBottomInset,
      chatPanelWidth: shellChromeRuntime.layoutTransitionChatPanelWidth,
      chatPanelMinWidth: shellChromeRuntime.layoutTransitionChatPanelMinWidth,
      generalWorkbenchDialog: inputbarScene.generalWorkbenchDialog,
      generalWorkbenchHarnessDialog,
      showFloatingInputOverlay:
        shellChromeRuntime.shouldShowGeneralWorkbenchFloatingInputOverlay,
      hasPendingA2UIForm: Boolean(pendingA2UIForm),
    },
    stepProgress: {
      hidden: hideInlineStepProgress,
      isSpecializedThemeMode,
      hasMessages,
      steps,
      currentIndex: currentStepIndex,
      onStepClick: goToStep,
    },
    messageList: {
      sessionId,
      messages: displayMessages,
      emptyStateVariant: messageListEmptyStateVariant,
      providerType,
      turns: projectedTurns,
      threadItems: projectedThreadItems,
      currentTurnId: projectedCurrentTurnId,
      threadRead: projectedThreadRead,
      pendingActions: projectedPendingActions,
      submittedActionsInFlight: projectedSubmittedActionsInFlight,
      queuedTurns: projectedQueuedTurns,
      childSubagentSessions: projectedChildSubagentSessions,
      sessionHistoryWindow,
      onLoadFullHistory: loadFullSessionHistory,
      isRestoringSession,
      isSending,
      onInterruptCurrentTurn: stopSending,
      onResumeThread: resumeThread,
      onReplayPendingRequest: replayPendingAction,
      onPromoteQueuedTurn: promoteQueuedTurn,
      onDeleteMessage: deleteMessage,
      onEditMessage: editMessage,
      onQuoteMessage: handleQuoteMessage,
      onA2UISubmit: handleA2UISubmit,
      onWriteFile: handleWriteFile,
      onFileClick: handleFileClick,
      onOpenArtifactFromTimeline: handleOpenArtifactFromTimeline,
      onOpenSavedSiteContent: handleOpenSavedSiteContent,
      onArtifactClick: handleArtifactClick,
      onOpenMessagePreview: handleOpenMessagePreview,
      onSaveMessageAsSkill: handleSaveMessageAsSkill,
      onSaveMessageAsInspiration: handleSaveMessageAsInspiration,
      onSaveMessageAsKnowledge: handleSaveMessageAsKnowledge,
      onOpenSubagentSession: handleOpenSubagentSession,
      onPermissionResponse: handlePermissionResponse,
      promoteActionRequestsToA2UI: Boolean(pendingPromotedA2UIActionRequest),
      renderA2UIInline: shellChromeRuntime.shouldRenderInlineA2UI,
      activePendingA2UISource: pendingA2UISource,
      collapseCodeBlocks: shouldCollapseCodeBlocks,
      shouldCollapseCodeBlock: shouldCollapseCodeBlockInChat,
      onCodeBlockClick: handleCodeBlockClick,
      focusedTimelineItemId,
      timelineFocusRequestKey,
    },
    workspaceAlert: {
      workspacePathMissing: Boolean(workspacePathMissing),
      workspaceHealthError,
    },
    canvasWorkbenchLayout: {
      artifacts: settledWorkbenchArtifacts,
      canvasState: resolvedCanvasState,
      taskFiles,
      selectedFileId,
      workspaceRoot: projectRootPath,
      defaultPreview: canvasScene.canvasWorkbenchDefaultPreview,
      loadFilePreview: handleHarnessLoadFilePreview,
      onOpenPath: canvasScene.handleOpenCanvasWorkbenchPath,
      onRevealPath: canvasScene.handleRevealCanvasWorkbenchPath,
      onClose: canvasScene.handleCloseCanvasWorkbench,
      renderPreview: canvasScene.renderCanvasWorkbenchPreview,
      workbenchMode: sessionRuntimeCounters.shouldUseRuntimeWorkbench
        ? "coding"
        : "default",
      workspaceView,
      sessionView,
      outputView: sessionRuntimeCounters.shouldUseRuntimeWorkbench
        ? outputView
        : null,
      logView: sessionRuntimeCounters.shouldUseRuntimeWorkbench
        ? sessionView
        : null,
      changeView: sessionRuntimeCounters.shouldUseRuntimeWorkbench
        ? changeView
        : null,
      onLayoutModeChange: shouldSyncCanvasWorkbenchLayoutMode
        ? setCanvasWorkbenchLayoutMode
        : undefined,
    },
  });
}
