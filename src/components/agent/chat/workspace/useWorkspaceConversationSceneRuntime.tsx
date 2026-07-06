import type {
  ComponentProps,
  Dispatch,
  ReactNode,
  SetStateAction,
} from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { StepProgress } from "@/components/workspace/layout/StepProgress";
import { useWorkspaceNavigationActions } from "./useWorkspaceNavigationActions";
import { useWorkspaceInputbarSceneRuntime } from "./useWorkspaceInputbarSceneRuntime";
import { useWorkspaceCanvasSceneRuntime } from "./useWorkspaceCanvasSceneRuntime";
import { MessageList } from "../components/MessageList";
import type { ChatToolPreferences } from "../utils/chatToolPreferences";
import type { CreationMode } from "../components/types";
import type { WriteArtifactContext } from "../types";
import type { PendingA2UISource } from "../types";
import type { LayoutMode, ThemeType } from "@/lib/workspace/workbenchContract";
import type { Artifact } from "@/lib/artifact/types";
import type { Character } from "@/lib/api/projectMemory";
import type { TaskFile } from "../components/TaskFiles";
import type { InputbarSendHandler } from "../components/Inputbar/inputbarSendPayload";
import type { TeamDefinition } from "../utils/teamDefinitions";
import type { WorkspacePathMissingState } from "../hooks/agentChatShared";
import type { SidebarActivityLog } from "../hooks/useThemeContextWorkspace";
import type { SyncStatus } from "../hooks/useContentSync";
import type { ArtifactTimelineOpenTarget } from "../utils/artifactTimelineNavigation";
import { buildAgentTaskRuntimeCardModel } from "../utils/agentTaskRuntime";
import type { CreationReplaySurfaceModel } from "../utils/creationReplaySurface";
import { buildStepProgressProps } from "./chatSurfaceProps";
import { WorkspaceConversationScene } from "./WorkspaceConversationScene";
import { buildWorkspaceConversationCodingViews } from "./workspaceConversationCodingViews";
import type {
  AsterSessionExecutionRuntime,
  AsterTodoItem,
} from "@/lib/api/agentRuntime";
import type { CodingWorkbenchRecoveryContext } from "./codingWorkbenchRecovery";
import type { GeneralWorkbenchCreationTaskEvent } from "../components/generalWorkbenchWorkflowData";
import { useWorkspaceTaskRailRuntime } from "./useWorkspaceTaskRailRuntime";
import { useSessionRuntimeProjectionDeferral } from "./useSessionRuntimeProjectionDeferral";
import {
  buildQuotedReplyText,
  buildWorkspaceHeaderView,
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
  | "handleOpenExecutionPolicySettings"
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
  entryBannerVisible: ConversationScenePresentationParams["scene"]["entryBannerVisible"];
  entryBannerMessage: ConversationScenePresentationParams["scene"]["entryBannerMessage"];
  creationReplaySurface?: CreationReplaySurfaceModel | null;
  defaultCuratedTaskReferenceMemoryIds?: ConversationScenePresentationParams["scene"]["defaultCuratedTaskReferenceMemoryIds"];
  defaultCuratedTaskReferenceEntries?: ConversationScenePresentationParams["scene"]["defaultCuratedTaskReferenceEntries"];
  pathReferences?: ConversationScenePresentationParams["scene"]["pathReferences"];
  onAddPathReferences?: ConversationScenePresentationParams["scene"]["onAddPathReferences"];
  inputRestoreRequest?: ConversationScenePresentationParams["scene"]["inputRestoreRequest"];
  onInputRestoreRequestHandled?: ConversationScenePresentationParams["scene"]["onInputRestoreRequestHandled"];
  onImportPathReferenceAsKnowledge?: ConversationScenePresentationParams["scene"]["onImportPathReferenceAsKnowledge"];
  onRemovePathReference?: ConversationScenePresentationParams["scene"]["onRemovePathReference"];
  onClearPathReferences?: ConversationScenePresentationParams["scene"]["onClearPathReferences"];
  fileManagerOpen?: ConversationScenePresentationParams["scene"]["fileManagerOpen"];
  onToggleFileManager?: ConversationScenePresentationParams["scene"]["onToggleFileManager"];
  sceneAppExecutionSummaryCard?: ConversationScenePresentationParams["scene"]["sceneAppExecutionSummaryCard"];
  pluginHistoryRestoreLandingCard?: ConversationScenePresentationParams["scene"]["pluginHistoryRestoreLandingCard"];
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
  pluginSuggestions?: ConversationScenePresentationParams["scene"]["pluginSuggestions"];
  pluginSuggestionsError?: ConversationScenePresentationParams["scene"]["pluginSuggestionsError"];
  pluginSuggestionsLoading?: ConversationScenePresentationParams["scene"]["pluginSuggestionsLoading"];
  onPluginSuggestionsNeeded?: ConversationScenePresentationParams["scene"]["onPluginSuggestionsNeeded"];
  handleNavigateToSkillSettings: ConversationScenePresentationParams["scene"]["onNavigateToSettings"];
  handleRefreshSkills: ConversationScenePresentationParams["scene"]["onRefreshSkills"];
  handleOpenBrowserAssistInCanvas: ConversationScenePresentationParams["scene"]["onLaunchBrowserAssist"];
  browserAssistLaunching: ConversationScenePresentationParams["scene"]["browserAssistLoading"];
  recentSessionTitle?: ConversationScenePresentationParams["scene"]["recentSessionTitle"];
  recentSessionSummary?: ConversationScenePresentationParams["scene"]["recentSessionSummary"];
  recentSessionActionLabel?: ConversationScenePresentationParams["scene"]["recentSessionActionLabel"];
  handleResumeRecentSession?: ConversationScenePresentationParams["scene"]["handleResumeRecentSession"];
  projectConversationGroups?: ConversationScenePresentationParams["scene"]["projectConversationGroups"];
  handleOpenProjectConversation?: ConversationScenePresentationParams["scene"]["handleOpenProjectConversation"];
  projectId: string | null;
  openedProjects?: ConversationScenePresentationParams["scene"]["openedProjects"];
  onCloseProject?: ConversationScenePresentationParams["scene"]["onCloseProject"];
  deferWorkspaceListLoad?: ConversationScenePresentationParams["scene"]["deferWorkspaceListLoad"];
  workspaceHintMessage?: ConversationScenePresentationParams["scene"]["workspaceHintMessage"];
  workspaceHintVisible?: ConversationScenePresentationParams["scene"]["workspaceHintVisible"];
  onDismissWorkspaceHint?: ConversationScenePresentationParams["scene"]["onDismissWorkspaceHint"];
  taskCenterTabsNode?: ConversationScenePresentationParams["scene"]["taskCenterTabsNode"];
  suppressNavbarUtilityActions?: boolean;
  topBarChrome: ConversationScenePresentationParams["scene"]["navbarChrome"];
  onBackToProjectManagement?: ConversationScenePresentationParams["scene"]["onBackToProjectManagement"];
  fromResources: boolean;
  handleBackHome: ConversationScenePresentationParams["scene"]["onBackHome"];
  rightSurfaceContent?: ConversationScenePresentationParams["scene"]["rightSurfaceContent"];
  rightSurfaceLaunchers?: ConversationScenePresentationParams["scene"]["rightSurfaceLaunchers"];
  rightSurfaceObjectCanvasOpen?: ConversationScenePresentationParams["scene"]["rightSurfaceObjectCanvasOpen"];
  onToggleRightSurfaceObjectCanvas?: ConversationScenePresentationParams["scene"]["onToggleRightSurfaceObjectCanvas"];
  rightSurfaceBrowserOpen?: ConversationScenePresentationParams["scene"]["rightSurfaceBrowserOpen"];
  onToggleRightSurfaceBrowser?: ConversationScenePresentationParams["scene"]["onToggleRightSurfaceBrowser"];
  rightSurfaceFilesOpen?: ConversationScenePresentationParams["scene"]["rightSurfaceFilesOpen"];
  onToggleRightSurfaceFiles?: ConversationScenePresentationParams["scene"]["onToggleRightSurfaceFiles"];
  rightSurfaceTraceOpen?: ConversationScenePresentationParams["scene"]["rightSurfaceTraceOpen"];
  onToggleRightSurfaceTrace?: ConversationScenePresentationParams["scene"]["onToggleRightSurfaceTrace"];
  rightSurfaceShellOpen?: ConversationScenePresentationParams["scene"]["rightSurfaceShellOpen"];
  onToggleRightSurfaceShell?: ConversationScenePresentationParams["scene"]["onToggleRightSurfaceShell"];
  showHarnessToggle: ConversationScenePresentationParams["scene"]["showHarnessToggle"];
  navbarHarnessPanelVisible: ConversationScenePresentationParams["scene"]["harnessPanelVisible"];
  handleToggleHarnessPanel: ConversationScenePresentationParams["scene"]["onToggleHarnessPanel"];
  showExpertInfoToggle?: ConversationScenePresentationParams["scene"]["showExpertInfoToggle"];
  expertInfoPanelVisible?: ConversationScenePresentationParams["scene"]["expertInfoPanelVisible"];
  handleToggleExpertInfoPanel?: ConversationScenePresentationParams["scene"]["onToggleExpertInfoPanel"];
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
  browserWorkbenchOpenRequest?: ConversationScenePresentationParams["canvasWorkbenchLayout"]["browserOpenRequest"];
  onBrowserWorkbenchOpenRequestHandled?: ConversationScenePresentationParams["canvasWorkbenchLayout"]["onBrowserOpenRequestHandled"];
  canvasWorkbenchPreviewOpenRequest?: ConversationScenePresentationParams["canvasWorkbenchLayout"]["previewOpenRequest"];
  onCanvasWorkbenchPreviewOpenRequestHandled?: ConversationScenePresentationParams["canvasWorkbenchLayout"]["onPreviewOpenRequestHandled"];
  hideInlineStepProgress: ConversationScenePresentationParams["stepProgress"]["hidden"];
  isSpecializedThemeMode: ConversationScenePresentationParams["stepProgress"]["isSpecializedThemeMode"];
  hasMessages: ConversationScenePresentationParams["stepProgress"]["hasMessages"];
  steps: ConversationScenePresentationParams["stepProgress"]["steps"];
  activityLogs?: SidebarActivityLog[];
  creationTaskEvents?: GeneralWorkbenchCreationTaskEvent[];
  currentStepIndex: ConversationScenePresentationParams["stepProgress"]["currentIndex"];
  goToStep: ConversationScenePresentationParams["stepProgress"]["onStepClick"];
  displayMessages: ConversationScenePresentationParams["messageList"]["messages"];
  turns: ConversationScenePresentationParams["messageList"]["turns"];
  effectiveThreadItems: ConversationScenePresentationParams["messageList"]["threadItems"];
  todoItems?: AsterTodoItem[];
  currentTurnId: ConversationScenePresentationParams["messageList"]["currentTurnId"];
  threadRead: ConversationScenePresentationParams["messageList"]["threadRead"];
  executionRuntime?: AsterSessionExecutionRuntime | null;
  pendingActions: NonNullable<
    ConversationScenePresentationParams["messageList"]["pendingActions"]
  >;
  submittedActionsInFlight: NonNullable<
    ConversationScenePresentationParams["messageList"]["submittedActionsInFlight"]
  >;
  queuedTurns: NonNullable<
    ConversationScenePresentationParams["messageList"]["queuedTurns"]
  >;
  childSubagentSessions?: NonNullable<
    ConversationScenePresentationParams["messageList"]["childSubagentSessions"]
  >;
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
  handleOpenUrlPreview?: ConversationScenePresentationParams["messageList"]["onOpenUrlPreview"];
  handleOpenMessagePreview?: ConversationScenePresentationParams["messageList"]["onOpenMessagePreview"];
  handleSaveMessageAsSkill?: ConversationScenePresentationParams["messageList"]["onSaveMessageAsSkill"];
  handleSaveMessageAsKnowledge?: ConversationScenePresentationParams["messageList"]["onSaveMessageAsKnowledge"];
  handleOpenSubagentSession: ConversationScenePresentationParams["messageList"]["onOpenSubagentSession"];
  handlePermissionResponse: ConversationScenePresentationParams["messageList"]["onPermissionResponse"];
  onRefreshSessionReadModel?: () => void | Promise<unknown>;
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
  canvasWorkbenchRootPath?: string | null;
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
  entryBannerVisible,
  entryBannerMessage,
  creationReplaySurface,
  defaultCuratedTaskReferenceMemoryIds,
  defaultCuratedTaskReferenceEntries,
  pathReferences,
  onAddPathReferences,
  inputRestoreRequest,
  onInputRestoreRequestHandled,
  onImportPathReferenceAsKnowledge,
  onRemovePathReference,
  onClearPathReferences,
  fileManagerOpen,
  onToggleFileManager,
  sceneAppExecutionSummaryCard,
  pluginHistoryRestoreLandingCard,
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
  pluginSuggestions,
  pluginSuggestionsError,
  pluginSuggestionsLoading,
  onPluginSuggestionsNeeded,
  handleNavigateToSkillSettings,
  handleRefreshSkills,
  handleOpenBrowserAssistInCanvas,
  browserAssistLaunching,
  recentSessionTitle,
  recentSessionSummary,
  recentSessionActionLabel,
  handleResumeRecentSession,
  projectConversationGroups,
  handleOpenProjectConversation,
  projectId,
  openedProjects,
  onCloseProject,
  deferWorkspaceListLoad,
  workspaceHintMessage,
  workspaceHintVisible,
  onDismissWorkspaceHint,
  taskCenterTabsNode,
  suppressNavbarUtilityActions = false,
  topBarChrome,
  onBackToProjectManagement,
  fromResources,
  handleBackHome,
  rightSurfaceContent,
  rightSurfaceLaunchers,
  rightSurfaceObjectCanvasOpen,
  onToggleRightSurfaceObjectCanvas,
  rightSurfaceBrowserOpen,
  onToggleRightSurfaceBrowser,
  rightSurfaceFilesOpen,
  onToggleRightSurfaceFiles,
  rightSurfaceTraceOpen,
  onToggleRightSurfaceTrace,
  rightSurfaceShellOpen,
  onToggleRightSurfaceShell,
  showHarnessToggle,
  navbarHarnessPanelVisible,
  handleToggleHarnessPanel,
  showExpertInfoToggle,
  expertInfoPanelVisible,
  handleToggleExpertInfoPanel,
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
  browserWorkbenchOpenRequest,
  onBrowserWorkbenchOpenRequestHandled,
  canvasWorkbenchPreviewOpenRequest,
  onCanvasWorkbenchPreviewOpenRequestHandled,
  hideInlineStepProgress,
  isSpecializedThemeMode,
  hasMessages,
  steps,
  activityLogs = [],
  creationTaskEvents = [],
  currentStepIndex,
  goToStep,
  displayMessages,
  turns = EMPTY_PROJECTED_TURNS,
  effectiveThreadItems = EMPTY_PROJECTED_THREAD_ITEMS,
  todoItems = [],
  currentTurnId,
  threadRead,
  executionRuntime,
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
  handleOpenUrlPreview,
  handleOpenMessagePreview,
  handleSaveMessageAsSkill,
  handleSaveMessageAsKnowledge,
  handleOpenSubagentSession,
  handlePermissionResponse,
  onRefreshSessionReadModel,
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
  canvasWorkbenchRootPath,
  handleHarnessLoadFilePreview,
  setCanvasWorkbenchLayoutMode,
  workspacePathMissing,
  workspaceHealthError,
  focusedTimelineItemId,
  timelineFocusRequestKey,
}: UseWorkspaceConversationSceneRuntimeParams) {
  const { i18n, t } = useTranslation("agent");
  const locale = i18n.language;
  const projectedRuntime = useSessionRuntimeProjectionDeferral({
    sessionId,
    messages: displayMessages,
    turns,
    threadItems: effectiveThreadItems,
    currentTurnId,
    threadRead,
    pendingActions,
    submittedActionsInFlight,
    queuedTurns,
    childSubagentSessions,
    isRestoringSession,
    isSending: Boolean(isSending),
    focusedTimelineItemId,
    pendingA2UIForm,
  });
  const projectedTurns = projectedRuntime.turns;
  const projectedThreadItems = projectedRuntime.threadItems;
  const projectedCurrentTurnId = projectedRuntime.currentTurnId;
  const projectedThreadRead = projectedRuntime.threadRead;
  const projectedPendingActions = projectedRuntime.pendingActions;
  const projectedSubmittedActionsInFlight =
    projectedRuntime.submittedActionsInFlight;
  const projectedQueuedTurns = projectedRuntime.queuedTurns;
  const projectedChildSubagentSessions = projectedRuntime.childSubagentSessions;
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
  const taskCenterUtilityActionsVisible =
    navbarUtilityActionsVisible || navbarContextVariant === "task-center";
  const shouldSyncCanvasWorkbenchLayoutMode =
    !isThemeWorkbench &&
    activeTheme === "general" &&
    layoutMode === "chat-canvas";
  const shouldBuildRuntimeTaskCard = !shellChromeRuntime.showChatLayout;
  const runtimeTaskCard = useMemo(() => {
    if (!shouldBuildRuntimeTaskCard) {
      return null;
    }

    return buildAgentTaskRuntimeCardModel({
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
    });
  }, [
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
    shouldBuildRuntimeTaskCard,
  ]);
  const codingWorkbenchViews = useMemo(
    () =>
      buildWorkspaceConversationCodingViews({
        t,
        locale,
        turns: projectedTurns,
        currentTurnId: projectedCurrentTurnId,
        threadRead: projectedThreadRead,
        pendingActions: projectedPendingActions,
        submittedActionsInFlight: projectedSubmittedActionsInFlight,
        queuedTurns: projectedQueuedTurns,
        isSending,
        focusedTimelineItemId,
        onOpenFile: canvasScene.handleOpenCanvasWorkbenchPath,
        onRespondToAction: handlePermissionResponse,
        onRefreshSessionReadModel,
        onSubmitRecoveryPrompt: (
          prompt,
          recoveryContext?: CodingWorkbenchRecoveryContext,
        ) =>
          handleSendFromEmptyState({
            textOverride: prompt,
            sendOptions: recoveryContext
              ? {
                  requestMetadata: {
                    harness: {
                      coding_workbench_recovery: recoveryContext,
                    },
                  },
                }
              : undefined,
          }),
      }),
    [
      canvasScene.handleOpenCanvasWorkbenchPath,
      focusedTimelineItemId,
      handleSendFromEmptyState,
      handlePermissionResponse,
      onRefreshSessionReadModel,
      isSending,
      locale,
      projectedCurrentTurnId,
      projectedPendingActions,
      projectedQueuedTurns,
      projectedSubmittedActionsInFlight,
      projectedThreadRead,
      projectedTurns,
      t,
    ],
  );
  const sessionRuntimeCounters = codingWorkbenchViews.counters;
  const shouldUseCodingWorkbenchChrome =
    sessionRuntimeCounters.shouldUseRuntimeWorkbench ||
    navbarContextVariant === "task-center";
  const effectiveCanvasWorkbenchRootPath =
    projectRootPath?.trim() || canvasWorkbenchRootPath?.trim() || null;
  const taskRailProps = useWorkspaceTaskRailRuntime({
    sessionId,
    workflowSteps: steps,
    messages: displayMessages,
    activityLogs,
    creationTaskEvents,
    pendingActions: projectedPendingActions,
    submittedActionsInFlight: projectedSubmittedActionsInFlight,
    threadItems: projectedThreadItems,
    todoItems,
    threadRead: projectedThreadRead,
    executionRuntime,
    childSubagentSessions: projectedChildSubagentSessions,
    providerType,
    model,
    accessMode,
    reasoningEffort,
    projectRootPath,
    canvasWorkbenchRootPath,
    onOpenWorkspacePath: canvasScene.handleOpenCanvasWorkbenchPath,
    onRespondToAction: handlePermissionResponse,
  });
  const workspaceView = buildWorkspaceHeaderView({
    projectRootPath: effectiveCanvasWorkbenchRootPath,
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
      inputRestoreRequest,
      onInputRestoreRequestHandled,
      onImportPathReferenceAsKnowledge,
      onRemovePathReference,
      onClearPathReferences,
      fileManagerOpen,
      onToggleFileManager,
      sceneAppExecutionSummaryCard,
      pluginHistoryRestoreLandingCard,
      serviceSkillExecutionCard,
      showChatLayout: shellChromeRuntime.showChatLayout,
      compactChrome: shellChromeRuntime.isWorkspaceCompactChrome,
      contextWorkspaceEnabled,
      generalWorkbenchMessageViewportBottomPadding:
        shellChromeRuntime.workflowLayoutBottomSpacing
          .messageViewportBottomPadding,
      taskRail: taskRailProps,
      onSelectWorkspaceDirectory:
        navigationActions.handleWorkspaceAlertSelectDirectory,
      onDismissWorkspaceAlert: navigationActions.handleDismissWorkspaceAlert,
      shouldHideGeneralWorkbenchInputForTheme:
        shellChromeRuntime.shouldHideGeneralWorkbenchInputForTheme,
      inputbarNode: inputbarScene.inputbarNode,
      input,
      setInput,
      onSendMessage: handleSendFromEmptyState,
      onStopSending: stopSending,
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
      onOpenExecutionPolicySettings:
        navigationActions.handleOpenExecutionPolicySettings,
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
      handleResumeRecentSession:
        messageListEmptyStateVariant === "task-center"
          ? undefined
          : handleResumeRecentSession,
      projectConversationGroups:
        messageListEmptyStateVariant === "task-center"
          ? undefined
          : projectConversationGroups,
      handleOpenProjectConversation:
        messageListEmptyStateVariant === "task-center"
          ? undefined
          : handleOpenProjectConversation,
      projectId,
      openedProjects,
      projectRootPath,
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
      pluginSuggestions,
      pluginSuggestionsError,
      pluginSuggestionsLoading,
      onPluginSuggestionsNeeded,
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
          userMessage:
            codingWorkbenchViews.currentSessionTurn?.prompt_text || null,
        }),
      onOpenChannels: navigationActions.handleOpenChannels,
      onOpenChromeRelay: navigationActions.handleOpenChromeRelay,
      navbarVisible: shellChromeRuntime.shouldRenderTopBar,
      isRunning: Boolean(isSending),
      navbarChrome: topBarChrome,
      navbarContextVariant,
      onBackToProjectManagement,
      onBackToResources: fromResources
        ? navigationActions.handleBackToResources
        : undefined,
      isThemeWorkbench,
      layoutMode,
      onToggleCanvas: handleToggleCanvas,
      onBackHome: handleBackHome,
      rightSurfaceContent,
      rightSurfaceLaunchers,
      rightSurfaceObjectCanvasOpen:
        taskCenterUtilityActionsVisible &&
        Boolean(rightSurfaceObjectCanvasOpen),
      onToggleRightSurfaceObjectCanvas: taskCenterUtilityActionsVisible
        ? onToggleRightSurfaceObjectCanvas
        : undefined,
      rightSurfaceBrowserOpen:
        taskCenterUtilityActionsVisible && Boolean(rightSurfaceBrowserOpen),
      onToggleRightSurfaceBrowser: taskCenterUtilityActionsVisible
        ? onToggleRightSurfaceBrowser
        : undefined,
      rightSurfaceFilesOpen:
        taskCenterUtilityActionsVisible && Boolean(rightSurfaceFilesOpen),
      onToggleRightSurfaceFiles: taskCenterUtilityActionsVisible
        ? onToggleRightSurfaceFiles
        : undefined,
      rightSurfaceTraceOpen:
        taskCenterUtilityActionsVisible && Boolean(rightSurfaceTraceOpen),
      onToggleRightSurfaceTrace: taskCenterUtilityActionsVisible
        ? onToggleRightSurfaceTrace
        : undefined,
      rightSurfaceShellOpen:
        taskCenterUtilityActionsVisible && Boolean(rightSurfaceShellOpen),
      onToggleRightSurfaceShell: taskCenterUtilityActionsVisible
        ? onToggleRightSurfaceShell
        : undefined,
      showHarnessToggle: taskCenterUtilityActionsVisible && showHarnessToggle,
      harnessPanelVisible:
        taskCenterUtilityActionsVisible && navbarHarnessPanelVisible,
      onToggleHarnessPanel: taskCenterUtilityActionsVisible
        ? handleToggleHarnessPanel
        : undefined,
      showExpertInfoToggle:
        taskCenterUtilityActionsVisible && Boolean(showExpertInfoToggle),
      expertInfoPanelVisible:
        taskCenterUtilityActionsVisible && Boolean(expertInfoPanelVisible),
      onToggleExpertInfoPanel: taskCenterUtilityActionsVisible
        ? handleToggleExpertInfoPanel
        : undefined,
      harnessPendingCount: taskCenterUtilityActionsVisible
        ? harnessPendingCount
        : 0,
      harnessAttentionLevel: taskCenterUtilityActionsVisible
        ? harnessAttentionLevel
        : "idle",
      harnessToggleLabel: taskCenterUtilityActionsVisible
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
      onOpenUrlPreview: handleOpenUrlPreview,
      onOpenMessagePreview: handleOpenMessagePreview,
      onSaveMessageAsSkill: handleSaveMessageAsSkill,
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
      workspaceRoot: effectiveCanvasWorkbenchRootPath,
      defaultPreview: canvasScene.canvasWorkbenchDefaultPreview,
      loadFilePreview: handleHarnessLoadFilePreview,
      onOpenPath: canvasScene.handleOpenCanvasWorkbenchPath,
      onRevealPath: canvasScene.handleRevealCanvasWorkbenchPath,
      onClose: canvasScene.handleCloseCanvasWorkbench,
      workbenchMode: shouldUseCodingWorkbenchChrome ? "coding" : "default",
      workspaceView,
      sessionView: codingWorkbenchViews.sessionView,
      outputView: codingWorkbenchViews.outputView,
      logView: codingWorkbenchViews.logView,
      changeView: codingWorkbenchViews.changeView,
      onLayoutModeChange: shouldSyncCanvasWorkbenchLayoutMode
        ? setCanvasWorkbenchLayoutMode
        : undefined,
      browserOpenRequest: browserWorkbenchOpenRequest,
      onBrowserOpenRequestHandled: onBrowserWorkbenchOpenRequestHandled,
      previewOpenRequest: canvasWorkbenchPreviewOpenRequest,
      onPreviewOpenRequestHandled: onCanvasWorkbenchPreviewOpenRequestHandled,
    },
  });
}
