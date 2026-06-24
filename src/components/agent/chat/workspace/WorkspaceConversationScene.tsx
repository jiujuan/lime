import { useState, type ComponentProps, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, CheckCircle2, Info, Loader2 } from "lucide-react";
import type { CanvasStateUnion } from "@/components/workspace/canvas/canvasUtils";
import type { ExecutionPolicyFocusContext } from "@/types/page";
import { StepProgress } from "@/components/workspace/layout/StepProgress";
import type {
  A2UIFormData,
  A2UIResponse,
} from "@/components/workspace/a2ui/types";
import { CanvasWorkbenchLayout } from "../components/CanvasWorkbenchLayout";
import { ChatNavbar } from "../components/ChatNavbar";
import {
  TaskCenterShellPanel,
  TASK_CENTER_SHELL_PANEL_DEFAULT_HEIGHT_PX,
  TASK_CENTER_SHELL_PANEL_MAX_HEIGHT_RATIO,
} from "../components/TaskCenterShellPanel";
import { TaskCenterUtilityToolbar } from "../components/TaskCenterUtilityToolbar";
import type { GeneralWorkbenchWorkflowStepInput } from "../components/generalWorkbenchWorkflowPanelViewModel";
import type { SidebarActivityLog } from "../hooks/useThemeContextWorkspace";
import type { GeneralWorkbenchCreationTaskEvent } from "../components/generalWorkbenchWorkflowData";
import type { GeneralWorkbenchTaskRailContextInput } from "../components/generalWorkbenchTaskRailViewModel";
import type { ConfirmResponse } from "../types";
import type { AsterSessionExecutionRuntime } from "@/lib/api/agentRuntime";
import { CreationReplaySurfaceBanner } from "../components/CreationReplaySurfaceBanner";
import { EmptyState } from "../components/EmptyState";
import type { InputbarSendHandler } from "../components/Inputbar/inputbarSendPayload";
import { MessageList } from "../components/MessageList";
import { WorkspaceMainArea } from "./WorkspaceMainArea";
import { WorkspacePendingA2UIPanel } from "./WorkspacePendingA2UIPanel";
import {
  buildWorkspaceEmptyStateProps,
  buildWorkspaceNavbarProps,
} from "./chatSurfaceProps";
import { isCanvasStateEmpty } from "./generalWorkbenchHelpers";
import type { SyncStatus } from "../hooks/useContentSync";
import type { A2UISubmissionNoticeData } from "./A2UISubmissionNotice";
import type { CreationReplaySurfaceModel } from "../utils/creationReplaySurface";
import {
  ChatContainer,
  ChatContainerInner,
  ChatContent,
  ChatInputSlot,
  ContentSyncNotice,
  ContentSyncNoticeText,
  EntryBanner,
  EntryBannerClose,
  MessageViewport,
} from "./WorkspaceStyles";

type WorkspaceMainAreaProps = Omit<
  ComponentProps<typeof WorkspaceMainArea>,
  | "navbarNode"
  | "contentSyncNoticeNode"
  | "forceCanvasMode"
  | "chatContent"
  | "canvasContent"
>;
type CanvasWorkbenchLayoutProps = ComponentProps<typeof CanvasWorkbenchLayout>;
type ChatToolPreferences = {
  task: boolean;
  subagent: boolean;
};
type ChatToolPreferenceKey = keyof ChatToolPreferences;
type StepProgressProps = ComponentProps<typeof StepProgress>;
type MessageListProps = ComponentProps<typeof MessageList>;
type EmptyStateProps = ComponentProps<typeof EmptyState>;
type AgentNamespaceTranslation = (
  key: string,
  options?: Record<string, unknown>,
) => unknown;

interface WorkspaceChatContentParams {
  entryBannerVisible: boolean;
  entryBannerMessage?: string;
  onDismissEntryBanner: () => void;
  creationReplaySurface?: CreationReplaySurfaceModel | null;
  sceneAppExecutionSummaryCard?: ReactNode;
  serviceSkillExecutionCard?: ReactNode;
  stepProgressProps?: StepProgressProps | null;
  showChatLayout: boolean;
  compactChrome: boolean;
  taskCenterSurface: boolean;
  contextWorkspaceEnabled: boolean;
  generalWorkbenchMessageViewportBottomPadding?: string;
  messageListProps: MessageListProps;
  emptyStateProps: EmptyStateProps;
  showWorkspaceAlert: boolean;
  onSelectWorkspaceDirectory: () => void;
  onDismissWorkspaceAlert: () => void;
  pendingA2UIForm?: A2UIResponse | null;
  onPendingA2UISubmit?: (formData: A2UIFormData) => void;
  a2uiSubmissionNotice?: A2UISubmissionNoticeData | null;
  showInlineInputbar: boolean;
  inputbarNode: ReactNode;
  copy: WorkspaceChatContentCopy;
}

interface WorkspaceChatContentCopy {
  entryBannerClose: string;
  entryBannerCloseAria: string;
  workspaceMissing: string;
  workspaceReselect: string;
  workspaceDismissAria: string;
}

function resolveContentSyncNoticeMeta(status: Exclude<SyncStatus, "idle">): {
  label: string;
  Icon: typeof Loader2;
  animated?: boolean;
} {
  switch (status) {
    case "syncing":
      return {
        label: "正在同步到当前内容…",
        Icon: Loader2,
        animated: true,
      };
    case "success":
      return {
        label: "内容已同步",
        Icon: CheckCircle2,
      };
    case "error":
    default:
      return {
        label: "同步失败，将自动重试",
        Icon: AlertTriangle,
      };
  }
}

function renderWorkspaceChatContent({
  entryBannerVisible,
  entryBannerMessage,
  onDismissEntryBanner,
  creationReplaySurface,
  sceneAppExecutionSummaryCard,
  serviceSkillExecutionCard,
  stepProgressProps,
  showChatLayout,
  compactChrome,
  taskCenterSurface,
  contextWorkspaceEnabled,
  generalWorkbenchMessageViewportBottomPadding,
  messageListProps,
  emptyStateProps,
  showWorkspaceAlert,
  onSelectWorkspaceDirectory,
  onDismissWorkspaceAlert,
  pendingA2UIForm,
  onPendingA2UISubmit,
  a2uiSubmissionNotice,
  showInlineInputbar,
  inputbarNode,
  copy,
}: WorkspaceChatContentParams): ReactNode {
  const pendingA2UISource = messageListProps.activePendingA2UISource ?? null;
  const hasPendingA2UIMessageTailPayload = Boolean(
    pendingA2UIForm || a2uiSubmissionNotice,
  );
  const shouldRenderPendingA2UIAsMessageTail =
    hasPendingA2UIMessageTailPayload &&
    (!pendingA2UISource ||
      pendingA2UISource.kind === "scene_gate" ||
      pendingA2UISource.kind === "service_skill" ||
      Boolean(a2uiSubmissionNotice));
  const leadingMessageContent =
    sceneAppExecutionSummaryCard ||
    stepProgressProps ||
    serviceSkillExecutionCard ? (
      <>
        {sceneAppExecutionSummaryCard}
        {stepProgressProps ? <StepProgress {...stepProgressProps} /> : null}
        {serviceSkillExecutionCard}
      </>
    ) : null;
  const pendingA2UIMessageTail = shouldRenderPendingA2UIAsMessageTail ? (
    <WorkspacePendingA2UIPanel
      pendingA2UIForm={pendingA2UIForm}
      onA2UISubmit={onPendingA2UISubmit}
      a2uiSubmissionNotice={a2uiSubmissionNotice}
      placement="message"
    />
  ) : null;
  const trailingMessageContent =
    messageListProps.trailingContent || pendingA2UIMessageTail ? (
      <>
        {messageListProps.trailingContent}
        {pendingA2UIMessageTail}
      </>
    ) : null;

  const messageListNode = (
    <MessageList
      {...messageListProps}
      leadingContent={leadingMessageContent}
      trailingContent={trailingMessageContent}
      compactLeadingSpacing={contextWorkspaceEnabled}
    />
  );

  return (
    <ChatContainer>
      <ChatContainerInner $taskCenterSurface={taskCenterSurface}>
        {entryBannerVisible && entryBannerMessage ? (
          <EntryBanner data-testid="workspace-entry-banner">
            <Info className="h-4 w-4 shrink-0" />
            <span data-testid="workspace-entry-banner-text">
              {entryBannerMessage}
            </span>
            <EntryBannerClose
              type="button"
              onClick={onDismissEntryBanner}
              aria-label={copy.entryBannerCloseAria}
            >
              {copy.entryBannerClose}
            </EntryBannerClose>
          </EntryBanner>
        ) : null}

        {showChatLayout && creationReplaySurface ? (
          <CreationReplaySurfaceBanner
            surface={creationReplaySurface}
            className="mx-4 mb-2"
          />
        ) : null}

        {showChatLayout ? (
          <ChatContent $compact={compactChrome}>
            <>
              {contextWorkspaceEnabled ? (
                <MessageViewport
                  $bottomPadding={generalWorkbenchMessageViewportBottomPadding}
                >
                  {messageListNode}
                </MessageViewport>
              ) : (
                messageListNode
              )}
              {showWorkspaceAlert ? (
                <div className="mx-4 mb-2 flex items-center gap-2 rounded-[18px] border border-amber-200/90 bg-amber-50/86 px-3.5 py-2.5 text-sm text-amber-800 shadow-sm shadow-amber-950/5 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                  <span className="flex-1">{copy.workspaceMissing}</span>
                  <button
                    type="button"
                    onClick={onSelectWorkspaceDirectory}
                    className="shrink-0 rounded-xl border border-amber-200 bg-white/84 px-2.5 py-1 text-xs font-medium text-amber-900 transition hover:border-amber-300 hover:bg-white dark:bg-amber-800 dark:text-amber-100 dark:hover:bg-amber-700"
                  >
                    {copy.workspaceReselect}
                  </button>
                  <button
                    type="button"
                    onClick={onDismissWorkspaceAlert}
                    className="shrink-0 text-amber-600 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200"
                    aria-label={copy.workspaceDismissAria}
                  >
                    ✕
                  </button>
                </div>
              ) : null}
              {showInlineInputbar ? (
                <ChatInputSlot data-testid="workspace-inline-input-slot">
                  {inputbarNode}
                </ChatInputSlot>
              ) : null}
            </>
          </ChatContent>
        ) : (
          <EmptyState {...emptyStateProps} />
        )}
      </ChatContainerInner>
    </ChatContainer>
  );
}

interface WorkspaceConversationSceneProps extends WorkspaceMainAreaProps {
  entryBannerVisible: boolean;
  entryBannerMessage?: string;
  onDismissEntryBanner: () => void;
  creationReplaySurface?: CreationReplaySurfaceModel | null;
  defaultCuratedTaskReferenceMemoryIds?: ComponentProps<
    typeof EmptyState
  >["defaultCuratedTaskReferenceMemoryIds"];
  defaultCuratedTaskReferenceEntries?: ComponentProps<
    typeof EmptyState
  >["defaultCuratedTaskReferenceEntries"];
  pathReferences?: ComponentProps<typeof EmptyState>["pathReferences"];
  onAddPathReferences?: ComponentProps<
    typeof EmptyState
  >["onAddPathReferences"];
  onImportPathReferenceAsKnowledge?: ComponentProps<
    typeof EmptyState
  >["onImportPathReferenceAsKnowledge"];
  onRemovePathReference?: ComponentProps<
    typeof EmptyState
  >["onRemovePathReference"];
  onClearPathReferences?: ComponentProps<
    typeof EmptyState
  >["onClearPathReferences"];
  fileManagerOpen?: ComponentProps<typeof EmptyState>["fileManagerOpen"];
  onToggleFileManager?: ComponentProps<
    typeof EmptyState
  >["onToggleFileManager"];
  sceneAppExecutionSummaryCard?: WorkspaceChatContentParams["sceneAppExecutionSummaryCard"];
  serviceSkillExecutionCard?: WorkspaceChatContentParams["serviceSkillExecutionCard"];
  stepProgressProps?: WorkspaceChatContentParams["stepProgressProps"];
  showChatLayout: boolean;
  contextWorkspaceEnabled: boolean;
  generalWorkbenchMessageViewportBottomPadding?: string;
  messageListProps: WorkspaceChatContentParams["messageListProps"];
  taskRail?: {
    sessionId?: string | null;
    workflowSteps: GeneralWorkbenchWorkflowStepInput[];
    messages: MessageListProps["messages"];
    activityLogs?: SidebarActivityLog[];
    creationTaskEvents?: GeneralWorkbenchCreationTaskEvent[];
    pendingActions?: MessageListProps["pendingActions"];
    submittedActionsInFlight?: MessageListProps["submittedActionsInFlight"];
    threadItems?: MessageListProps["threadItems"];
    threadRead?: MessageListProps["threadRead"];
    executionRuntime?: AsterSessionExecutionRuntime | null;
    childSubagentSessions?: MessageListProps["childSubagentSessions"];
    context?: GeneralWorkbenchTaskRailContextInput;
    onOpenOutput?: (path: string) => void | Promise<void>;
    onRespondToAction?: (response: ConfirmResponse) => void | Promise<void>;
  };
  workspaceAlertVisible: boolean;
  onSelectWorkspaceDirectory: () => void;
  onDismissWorkspaceAlert: () => void;
  pendingA2UIForm?: WorkspaceChatContentParams["pendingA2UIForm"];
  onPendingA2UISubmit?: WorkspaceChatContentParams["onPendingA2UISubmit"];
  a2uiSubmissionNotice?: WorkspaceChatContentParams["a2uiSubmissionNotice"];
  shouldHideGeneralWorkbenchInputForTheme: boolean;
  input: ComponentProps<typeof EmptyState>["input"];
  setInput: ComponentProps<typeof EmptyState>["setInput"];
  onSendMessage: InputbarSendHandler;
  emptyStateIsLoading?: ComponentProps<typeof EmptyState>["isLoading"];
  emptyStateDisabled?: ComponentProps<typeof EmptyState>["disabled"];
  providerType: ComponentProps<typeof EmptyState>["providerType"];
  setProviderType: ComponentProps<typeof EmptyState>["setProviderType"];
  model: ComponentProps<typeof EmptyState>["model"];
  setModel: ComponentProps<typeof EmptyState>["setModel"];
  reasoningEffort?: ComponentProps<typeof EmptyState>["reasoningEffort"];
  setReasoningEffort?: ComponentProps<typeof EmptyState>["setReasoningEffort"];
  accessMode: ComponentProps<typeof EmptyState>["accessMode"];
  setAccessMode?: ComponentProps<typeof EmptyState>["setAccessMode"];
  onManageProviders?: ComponentProps<typeof EmptyState>["onManageProviders"];
  onOpenExecutionPolicySettings?: (
    context?: ExecutionPolicyFocusContext,
  ) => void;
  toolPreferences: ChatToolPreferences;
  onToolPreferenceChange: (
    key: ChatToolPreferenceKey,
    enabled: boolean,
  ) => void;
  objectiveEnabled?: ComponentProps<typeof EmptyState>["objectiveEnabled"];
  onObjectiveEnabledChange?: ComponentProps<
    typeof EmptyState
  >["onObjectiveEnabledChange"];
  creationMode: ComponentProps<typeof EmptyState>["creationMode"];
  onCreationModeChange?: ComponentProps<
    typeof EmptyState
  >["onCreationModeChange"];
  activeTheme: ComponentProps<typeof EmptyState>["activeTheme"];
  onThemeChange?: NonNullable<
    ComponentProps<typeof EmptyState>["onThemeChange"]
  >;
  themeLocked: boolean;
  artifactsCount: number;
  generalCanvasContent?: string | null;
  resolvedCanvasState: CanvasStateUnion | null;
  selectedText: ComponentProps<typeof EmptyState>["selectedText"];
  onRecommendationClick?: ComponentProps<
    typeof EmptyState
  >["onRecommendationClick"];
  characters: NonNullable<ComponentProps<typeof EmptyState>["characters"]>;
  skills: NonNullable<ComponentProps<typeof EmptyState>["skills"]>;
  serviceSkills: NonNullable<
    ComponentProps<typeof EmptyState>["serviceSkills"]
  >;
  serviceSkillGroups: NonNullable<
    ComponentProps<typeof EmptyState>["serviceSkillGroups"]
  >;
  isSkillsLoading: boolean;
  onSelectServiceSkill?: ComponentProps<
    typeof EmptyState
  >["onSelectServiceSkill"];
  onNavigateToSettings?: ComponentProps<
    typeof EmptyState
  >["onNavigateToSettings"];
  onRefreshSkills?: ComponentProps<typeof EmptyState>["onRefreshSkills"];
  onLaunchBrowserAssist?: ComponentProps<
    typeof EmptyState
  >["onLaunchBrowserAssist"];
  browserAssistLoading: boolean;
  recentSessionTitle?: ComponentProps<typeof EmptyState>["recentSessionTitle"];
  recentSessionSummary?: ComponentProps<
    typeof EmptyState
  >["recentSessionSummary"];
  recentSessionActionLabel?: ComponentProps<
    typeof EmptyState
  >["recentSessionActionLabel"];
  handleResumeRecentSession?: ComponentProps<
    typeof EmptyState
  >["onResumeRecentSession"];
  projectConversationGroups?: ComponentProps<
    typeof EmptyState
  >["projectConversationGroups"];
  handleOpenProjectConversation?: ComponentProps<
    typeof EmptyState
  >["onOpenProjectConversation"];
  projectId: string | null;
  openedProjects?: ComponentProps<typeof EmptyState>["openedProjects"];
  projectRootPath?: string | null;
  sessionId?: ComponentProps<typeof EmptyState>["sessionId"];
  onProjectChange?: (projectId: string | null) => void;
  onCloseProject?: ComponentProps<typeof ChatNavbar>["onCloseProject"];
  deferWorkspaceListLoad?: ComponentProps<
    typeof ChatNavbar
  >["deferWorkspaceListLoad"];
  workspaceHintMessage?: ComponentProps<
    typeof ChatNavbar
  >["workspaceHintMessage"];
  workspaceHintVisible?: ComponentProps<
    typeof ChatNavbar
  >["workspaceHintVisible"];
  onDismissWorkspaceHint?: ComponentProps<
    typeof ChatNavbar
  >["onDismissWorkspaceHint"];
  onOpenSettings?: () => void;
  runtimeToolAvailability?: ComponentProps<
    typeof EmptyState
  >["runtimeToolAvailability"];
  initialInputCapability?: ComponentProps<
    typeof EmptyState
  >["initialInputCapability"];
  knowledgePackSelection?: ComponentProps<
    typeof EmptyState
  >["knowledgePackSelection"];
  knowledgePackOptions?: ComponentProps<
    typeof EmptyState
  >["knowledgePackOptions"];
  onToggleKnowledgePack?: ComponentProps<
    typeof EmptyState
  >["onToggleKnowledgePack"];
  onSelectKnowledgePack?: ComponentProps<
    typeof EmptyState
  >["onSelectKnowledgePack"];
  onToggleKnowledgeCompanionPack?: ComponentProps<
    typeof EmptyState
  >["onToggleKnowledgeCompanionPack"];
  onStartKnowledgeOrganize?: ComponentProps<
    typeof EmptyState
  >["onStartKnowledgeOrganize"];
  onManageKnowledgePacks?: ComponentProps<
    typeof EmptyState
  >["onManageKnowledgePacks"];
  runtimeTaskCard?: ComponentProps<typeof EmptyState>["runtimeTaskCard"];
  onOpenMemoryWorkbench?: ComponentProps<
    typeof EmptyState
  >["onOpenMemoryWorkbench"];
  onOpenChannels?: ComponentProps<typeof EmptyState>["onOpenChannels"];
  onOpenChromeRelay?: ComponentProps<typeof EmptyState>["onOpenChromeRelay"];
  taskCenterTabsNode?: ReactNode;
  navbarVisible: boolean;
  isRunning: boolean;
  navbarChrome: ComponentProps<typeof ChatNavbar>["chrome"];
  navbarContextVariant?: "default" | "task-center";
  onBackToProjectManagement?: ComponentProps<
    typeof ChatNavbar
  >["onBackToProjectManagement"];
  onBackToResources?: ComponentProps<typeof ChatNavbar>["onBackToResources"];
  onToggleCanvas?: ComponentProps<typeof ChatNavbar>["onToggleCanvas"];
  onBackHome?: ComponentProps<typeof ChatNavbar>["onBackHome"];
  showHarnessToggle: boolean;
  harnessPanelVisible: boolean;
  onToggleHarnessPanel?: ComponentProps<
    typeof ChatNavbar
  >["onToggleHarnessPanel"];
  showExpertInfoToggle?: boolean;
  expertInfoPanelVisible?: boolean;
  onToggleExpertInfoPanel?: () => void;
  harnessPendingCount: number;
  harnessAttentionLevel: ComponentProps<
    typeof ChatNavbar
  >["harnessAttentionLevel"];
  harnessToggleLabel?: ComponentProps<typeof ChatNavbar>["harnessToggleLabel"];
  showContextCompactionAction?: ComponentProps<
    typeof ChatNavbar
  >["showContextCompactionAction"];
  contextCompactionRunning?: ComponentProps<
    typeof ChatNavbar
  >["contextCompactionRunning"];
  onCompactContext?: ComponentProps<typeof ChatNavbar>["onCompactContext"];
  isThemeWorkbench: boolean;
  contentId?: string;
  syncStatus: SyncStatus;
  hasLiveCanvasPreviewContent: boolean;
  liveCanvasPreview: ReactNode;
  rightSurfaceContent?: ReactNode;
  rightSurfaceLaunchers?: ComponentProps<
    typeof TaskCenterUtilityToolbar
  >["rightSurfaceLaunchers"];
  rightSurfaceObjectCanvasOpen?: boolean;
  onToggleRightSurfaceObjectCanvas?: () => void;
  rightSurfaceBrowserOpen?: boolean;
  onToggleRightSurfaceBrowser?: () => void;
  rightSurfaceFilesOpen?: boolean;
  onToggleRightSurfaceFiles?: () => void;
  rightSurfaceShellOpen?: boolean;
  onToggleRightSurfaceShell?: () => void;
  currentImageWorkbenchActive: boolean;
  shouldShowCanvasLoadingState: boolean;
  canvasWorkbenchLayoutProps: CanvasWorkbenchLayoutProps;
}

export function WorkspaceConversationScene({
  entryBannerVisible,
  entryBannerMessage,
  onDismissEntryBanner,
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
  stepProgressProps,
  showChatLayout,
  compactChrome,
  contextWorkspaceEnabled,
  generalWorkbenchMessageViewportBottomPadding,
  messageListProps,
  taskRail,
  workspaceAlertVisible,
  onSelectWorkspaceDirectory,
  onDismissWorkspaceAlert,
  pendingA2UIForm,
  onPendingA2UISubmit,
  a2uiSubmissionNotice,
  shouldHideGeneralWorkbenchInputForTheme,
  inputbarNode,
  input,
  setInput,
  onSendMessage,
  emptyStateIsLoading = false,
  emptyStateDisabled = false,
  providerType,
  setProviderType,
  model,
  setModel,
  reasoningEffort,
  setReasoningEffort,
  accessMode,
  setAccessMode,
  onManageProviders,
  toolPreferences,
  onToolPreferenceChange,
  objectiveEnabled,
  onObjectiveEnabledChange,
  creationMode,
  onCreationModeChange,
  activeTheme,
  onThemeChange,
  themeLocked,
  artifactsCount,
  generalCanvasContent,
  resolvedCanvasState,
  contentId,
  selectedText,
  onRecommendationClick,
  characters,
  skills,
  serviceSkills,
  serviceSkillGroups,
  isSkillsLoading,
  onSelectServiceSkill,
  onNavigateToSettings,
  onRefreshSkills,
  onLaunchBrowserAssist,
  browserAssistLoading,
  recentSessionTitle,
  recentSessionSummary,
  recentSessionActionLabel,
  handleResumeRecentSession,
  projectConversationGroups,
  handleOpenProjectConversation,
  projectId,
  openedProjects,
  projectRootPath,
  sessionId,
  onProjectChange,
  onCloseProject,
  deferWorkspaceListLoad,
  workspaceHintMessage,
  workspaceHintVisible,
  onDismissWorkspaceHint,
  onOpenSettings,
  runtimeToolAvailability,
  initialInputCapability,
  knowledgePackSelection,
  knowledgePackOptions,
  onToggleKnowledgePack,
  onSelectKnowledgePack,
  onToggleKnowledgeCompanionPack,
  onStartKnowledgeOrganize,
  onManageKnowledgePacks,
  runtimeTaskCard,
  onOpenMemoryWorkbench,
  onOpenChannels,
  onOpenChromeRelay,
  taskCenterTabsNode,
  navbarVisible,
  isRunning,
  navbarChrome,
  navbarContextVariant = "default",
  onBackToProjectManagement,
  onBackToResources,
  isThemeWorkbench,
  layoutMode,
  onToggleCanvas,
  onBackHome,
  showHarnessToggle,
  harnessPanelVisible,
  onToggleHarnessPanel,
  showExpertInfoToggle,
  expertInfoPanelVisible,
  onToggleExpertInfoPanel,
  harnessPendingCount,
  harnessAttentionLevel,
  harnessToggleLabel,
  showContextCompactionAction,
  contextCompactionRunning,
  onCompactContext,
  syncStatus,
  hasLiveCanvasPreviewContent,
  liveCanvasPreview,
  rightSurfaceContent,
  rightSurfaceLaunchers,
  rightSurfaceObjectCanvasOpen,
  onToggleRightSurfaceObjectCanvas,
  rightSurfaceBrowserOpen,
  onToggleRightSurfaceBrowser,
  rightSurfaceFilesOpen,
  onToggleRightSurfaceFiles,
  rightSurfaceShellOpen,
  onToggleRightSurfaceShell,
  currentImageWorkbenchActive,
  shouldShowCanvasLoadingState,
  canvasWorkbenchLayoutProps,
  shellBottomInset,
  chatPanelWidth,
  chatPanelMinWidth,
  generalWorkbenchDialog,
  showFloatingInputOverlay,
  hasPendingA2UIForm,
}: WorkspaceConversationSceneProps) {
  const { t } = useTranslation("agent");
  const agentT = t as unknown as AgentNamespaceTranslation;
  const text = (key: string) =>
    String(agentT(`agentChat.workspaceConversation.${key}`));
  const emptyStateProps = buildWorkspaceEmptyStateProps({
    input,
    setInput,
    onSendMessage,
    isLoading: emptyStateIsLoading,
    disabled: emptyStateDisabled,
    providerType,
    setProviderType,
    model,
    setModel,
    reasoningEffort,
    setReasoningEffort,
    accessMode,
    setAccessMode,
    onManageProviders,
    toolPreferences,
    onToolPreferenceChange,
    objectiveEnabled,
    onObjectiveEnabledChange,
    creationMode,
    onCreationModeChange,
    activeTheme,
    onThemeChange,
    themeLocked,
    hasCanvasContent:
      activeTheme === "general"
        ? artifactsCount > 0 || Boolean(generalCanvasContent?.trim())
        : !isCanvasStateEmpty(resolvedCanvasState),
    hasContentId: Boolean(contentId),
    selectedText,
    onRecommendationClick,
    characters,
    skills,
    serviceSkills,
    serviceSkillGroups,
    isSkillsLoading,
    onSelectServiceSkill,
    onNavigateToSettings,
    onRefreshSkills,
    onLaunchBrowserAssist,
    browserAssistLoading,
    recentSessionTitle,
    recentSessionSummary,
    recentSessionActionLabel,
    onResumeRecentSession: handleResumeRecentSession,
    projectConversationGroups,
    onOpenProjectConversation: handleOpenProjectConversation,
    projectId,
    openedProjects,
    onProjectChange: onProjectChange
      ? (nextProjectId) => onProjectChange(nextProjectId)
      : undefined,
    sessionId,
    runtimeToolAvailability,
    initialInputCapability,
    knowledgePackSelection,
    knowledgePackOptions,
    onToggleKnowledgePack,
    onSelectKnowledgePack,
    onToggleKnowledgeCompanionPack,
    onStartKnowledgeOrganize,
    onManageKnowledgePacks,
    runtimeTaskCard,
    onOpenMemoryWorkbench,
    onOpenChannels,
    onOpenChromeRelay,
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
  });
  const chatContent = renderWorkspaceChatContent({
    entryBannerVisible,
    entryBannerMessage,
    onDismissEntryBanner,
    creationReplaySurface,
    sceneAppExecutionSummaryCard,
    serviceSkillExecutionCard,
    stepProgressProps,
    showChatLayout,
    compactChrome,
    taskCenterSurface: navbarContextVariant === "task-center",
    contextWorkspaceEnabled,
    generalWorkbenchMessageViewportBottomPadding,
    messageListProps,
    emptyStateProps,
    showWorkspaceAlert: workspaceAlertVisible,
    onSelectWorkspaceDirectory,
    onDismissWorkspaceAlert,
    pendingA2UIForm,
    onPendingA2UISubmit,
    a2uiSubmissionNotice,
    showInlineInputbar:
      !contextWorkspaceEnabled && !shouldHideGeneralWorkbenchInputForTheme,
    inputbarNode,
    copy: {
      entryBannerClose: text("entryBanner.close"),
      entryBannerCloseAria: text("entryBanner.closeAria"),
      workspaceMissing: text("workspaceAlert.missing"),
      workspaceReselect: text("workspaceAlert.reselect"),
      workspaceDismissAria: text("workspaceAlert.dismissAria"),
    },
  });
  const [localShellPanelOpen, setLocalShellPanelOpen] = useState(false);
  const [shellPanelHeightPx, setShellPanelHeightPx] = useState(
    TASK_CENTER_SHELL_PANEL_DEFAULT_HEIGHT_PX,
  );
  const [shellPanelMaximized, setShellPanelMaximized] = useState(false);
  const shouldUseTaskCenterUtilityToolbar =
    navbarContextVariant === "task-center" && Boolean(taskCenterTabsNode);
  const shellManagedByRightSurface = Boolean(onToggleRightSurfaceShell);
  const shellPanelOpen = shellManagedByRightSurface
    ? Boolean(rightSurfaceShellOpen)
    : localShellPanelOpen;
  const bottomShellPanelOpen =
    localShellPanelOpen &&
    shouldUseTaskCenterUtilityToolbar &&
    !shellManagedByRightSurface;
  const effectiveShellPanelHeightPx =
    bottomShellPanelOpen
      ? shellPanelMaximized && typeof window !== "undefined"
        ? Math.max(
            TASK_CENTER_SHELL_PANEL_DEFAULT_HEIGHT_PX,
            Math.floor(
              window.innerHeight * TASK_CENTER_SHELL_PANEL_MAX_HEIGHT_RATIO,
            ),
          )
        : shellPanelHeightPx
      : 0;
  const effectiveShellBottomInset =
    bottomShellPanelOpen
      ? `calc(${shellBottomInset} + ${effectiveShellPanelHeightPx}px)`
      : shellBottomInset;
  const taskCenterUtilityToolbarNode = shouldUseTaskCenterUtilityToolbar ? (
    <TaskCenterUtilityToolbar
      projectRootPath={projectRootPath}
      taskRail={taskRail}
      placement={layoutMode !== "chat" ? "workbench-header" : "task-strip"}
      showCanvasToggle={!isThemeWorkbench}
      isCanvasOpen={layoutMode !== "chat"}
      onToggleCanvas={onToggleCanvas}
      showHarnessToggle={showHarnessToggle}
      harnessPanelVisible={harnessPanelVisible}
      onToggleHarnessPanel={onToggleHarnessPanel}
      showExpertInfoToggle={showExpertInfoToggle}
      expertInfoPanelVisible={expertInfoPanelVisible}
      onToggleExpertInfoPanel={onToggleExpertInfoPanel}
      harnessPendingCount={harnessPendingCount}
      harnessAttentionLevel={harnessAttentionLevel ?? "idle"}
      harnessToggleLabel={harnessToggleLabel ?? "Harness"}
      shellPanelOpen={shellPanelOpen}
      onToggleObjectCanvasPanel={
        rightSurfaceObjectCanvasOpen || onToggleRightSurfaceObjectCanvas
          ? onToggleRightSurfaceObjectCanvas
          : undefined
      }
      onToggleBrowserPanel={
        rightSurfaceBrowserOpen || onToggleRightSurfaceBrowser
          ? onToggleRightSurfaceBrowser
          : undefined
      }
      onToggleFilesPanel={
        rightSurfaceFilesOpen || onToggleRightSurfaceFiles
          ? onToggleRightSurfaceFiles
          : undefined
      }
      rightSurfaceLaunchers={rightSurfaceLaunchers}
      onToggleShellPanel={() => {
        if (onToggleRightSurfaceShell) {
          onToggleRightSurfaceShell();
          return;
        }
        setLocalShellPanelOpen((current) => !current);
      }}
    />
  ) : null;
  const chatNavbarProps = buildWorkspaceNavbarProps({
    visible: navbarVisible,
    isRunning,
    chrome: navbarChrome,
    navbarContextVariant,
    onBackToProjectManagement,
    onBackToResources,
    showCanvasToggle: !isThemeWorkbench,
    isCanvasOpen: layoutMode !== "chat",
    onToggleCanvas,
    projectId,
    openedProjects,
    onProjectChange,
    onCloseProject,
    deferWorkspaceListLoad,
    workspaceHintMessage,
    workspaceHintVisible,
    onDismissWorkspaceHint,
    workspaceType: activeTheme,
    onBackHome,
    showHarnessToggle,
    harnessPanelVisible,
    onToggleHarnessPanel,
    harnessPendingCount,
    harnessAttentionLevel,
    harnessToggleLabel,
    showContextCompactionAction,
    contextCompactionRunning,
    onCompactContext,
    onOpenSettings,
  });

  const navbarNode = chatNavbarProps ? (
    <ChatNavbar {...chatNavbarProps} />
  ) : null;
  const shouldShowContentSyncNotice =
    !isThemeWorkbench &&
    Boolean(contentId) &&
    (syncStatus === "syncing" ||
      syncStatus === "success" ||
      syncStatus === "error");
  const contentSyncNoticeNode = shouldShowContentSyncNotice
    ? (() => {
        const notice = resolveContentSyncNoticeMeta(syncStatus);
        const NoticeIcon = notice.Icon;

        return (
          <ContentSyncNotice $status={syncStatus}>
            <NoticeIcon
              className={
                notice.animated ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"
              }
            />
            <ContentSyncNoticeText>{notice.label}</ContentSyncNoticeText>
          </ContentSyncNotice>
        );
      })()
    : null;
  const taskCenterShellPanelNode =
    bottomShellPanelOpen ? (
      <TaskCenterShellPanel
        heightPx={effectiveShellPanelHeightPx}
        maximized={shellPanelMaximized}
        projectRootPath={projectRootPath}
        onClose={() => {
          setLocalShellPanelOpen(false);
        }}
        onHeightChange={(heightPx) => {
          setShellPanelMaximized(false);
          setShellPanelHeightPx(heightPx);
        }}
        onToggleMaximize={() => {
          setShellPanelMaximized((current) => !current);
        }}
      />
    ) : null;
  const canvasContent =
    !liveCanvasPreview ? null : currentImageWorkbenchActive ||
      shouldShowCanvasLoadingState ? (
      liveCanvasPreview
    ) : (
      <CanvasWorkbenchLayout
        {...canvasWorkbenchLayoutProps}
        topRightTools={null}
      />
    );
  const forceCanvasMode = Boolean(
    isThemeWorkbench && hasLiveCanvasPreviewContent,
  );

  return (
    <>
      <WorkspaceMainArea
        compactChrome={compactChrome}
        navbarNode={navbarNode}
        taskCenterUtilityToolbarNode={taskCenterUtilityToolbarNode}
        taskCenterTabsNode={taskCenterTabsNode}
        taskCenterShellPanelNode={taskCenterShellPanelNode}
        contentSyncNoticeNode={contentSyncNoticeNode}
        shellBottomInset={effectiveShellBottomInset}
        layoutMode={layoutMode}
        forceCanvasMode={forceCanvasMode}
        chatContent={chatContent}
        canvasContent={canvasContent}
        rightSurfaceContent={rightSurfaceContent}
        chatPanelWidth={chatPanelWidth}
        chatPanelMinWidth={chatPanelMinWidth}
        generalWorkbenchDialog={generalWorkbenchDialog}
        showFloatingInputOverlay={showFloatingInputOverlay}
        hasPendingA2UIForm={hasPendingA2UIForm}
        inputbarNode={inputbarNode}
      />
    </>
  );
}
