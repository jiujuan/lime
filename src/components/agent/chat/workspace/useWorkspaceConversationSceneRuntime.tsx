import type {
  ComponentProps,
  Dispatch,
  ReactNode,
  SetStateAction,
} from "react";
import { useEffect, useMemo, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { formatNumber } from "@/i18n/format";
import { StepProgress } from "@/lib/workspace/workbenchUi";
import type { AgentRuntimeFileCheckpointThreadSummary } from "@/lib/api/agentRuntime";
import type { AgentThreadItem } from "@/lib/api/agentProtocol";
import { useWorkspaceNavigationActions } from "./useWorkspaceNavigationActions";
import { useWorkspaceInputbarSceneRuntime } from "./useWorkspaceInputbarSceneRuntime";
import { useWorkspaceCanvasSceneRuntime } from "./useWorkspaceCanvasSceneRuntime";
import { scheduleMinimumDelayIdleTask } from "@/lib/utils/scheduleMinimumDelayIdleTask";
import { CanvasSessionOverviewPanel } from "../components/CanvasSessionOverviewPanel";
import { MessageList } from "../components/MessageList";
import { TeamWorkspaceDock } from "../components/TeamWorkspaceDock";
import type {
  CanvasWorkbenchChangeItem,
  CanvasWorkbenchChangeView,
  CanvasWorkbenchHeaderView,
  CanvasWorkbenchSessionView,
  CanvasWorkbenchSummaryStat,
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
import type { WorkspacePathMissingState } from "../hooks/agentChatShared";
import type { SyncStatus } from "../hooks/useContentSync";
import type { ArtifactTimelineOpenTarget } from "../utils/artifactTimelineNavigation";
import { buildAgentTaskRuntimeCardModel } from "../utils/agentTaskRuntime";
import type { CreationReplaySurfaceModel } from "../utils/creationReplaySurface";
import {
  buildStepProgressProps,
  buildTeamWorkspaceDockProps,
  type TeamWorkbenchSurfaceProps,
} from "./chatSurfaceProps";
import { WorkspaceConversationScene } from "./WorkspaceConversationScene";
import { extractFileNameFromPath } from "./workspacePath";

type InputbarScene = Pick<
  ReturnType<typeof useWorkspaceInputbarSceneRuntime>,
  | "inputbarNode"
  | "generalWorkbenchDialog"
  | "teamWorkbenchSurfaceProps"
  | "runtimeToolAvailability"
  | "knowledgePackSelection"
  | "knowledgePackOptions"
  | "onToggleKnowledgePack"
  | "onSelectKnowledgePack"
  | "onToggleKnowledgeCompanionPack"
  | "onStartKnowledgeOrganize"
  | "onManageKnowledgePacks"
>;
type AgentTranslate = TFunction<"agent", undefined>;
type CanvasScene = Pick<
  ReturnType<typeof useWorkspaceCanvasSceneRuntime>,
  | "hasLiveCanvasPreviewContent"
  | "liveCanvasPreview"
  | "shouldShowCanvasLoadingState"
  | "teamWorkbenchView"
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
    | "teamWorkspaceDockProps"
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
  teamWorkspaceDock: {
    enabled: boolean;
    shouldShowFloatingInputOverlay: boolean;
    layoutMode: "chat" | "chat-canvas";
    onActivateWorkbench: NonNullable<
      ComponentProps<typeof TeamWorkspaceDock>["onActivateWorkbench"]
    >;
    withBottomOverlay: boolean;
    surfaceProps: TeamWorkbenchSurfaceProps;
  };
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
  teamWorkspaceDock,
  workspaceAlert,
  canvasWorkbenchLayout,
}: ConversationScenePresentationParams): WorkspaceConversationScenePresentationResult {
  const stepProgressProps = buildStepProgressProps(stepProgress);
  const teamWorkspaceDockProps = buildTeamWorkspaceDockProps(teamWorkspaceDock);
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
        teamWorkspaceDockProps={teamWorkspaceDockProps}
        workspaceAlertVisible={workspaceAlertVisible}
        projectId={scene.projectId ?? null}
        canvasWorkbenchLayoutProps={canvasWorkbenchLayoutProps}
      />
    ),
  };
}

function shortenSessionText(value?: string | null, maxLength = 120): string {
  const normalized = (value || "").trim().replace(/\s+/g, " ");
  if (!normalized) {
    return "";
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function resolveSessionStatusBadge(
  status?: "running" | "completed" | "failed" | "aborted" | null,
  t?: AgentTranslate,
): {
  label: string;
  tone: "default" | "accent" | "success";
} {
  if (status === "running") {
    return {
      label: t?.("agentChat.sessionOverview.status.turn.running") ?? "执行中",
      tone: "accent",
    };
  }
  if (status === "completed") {
    return {
      label: t?.("agentChat.sessionOverview.status.turn.completed") ?? "已完成",
      tone: "success",
    };
  }
  if (status === "failed") {
    return {
      label: t?.("agentChat.sessionOverview.status.turn.failed") ?? "失败",
      tone: "default",
    };
  }
  if (status === "aborted") {
    return {
      label: t?.("agentChat.sessionOverview.status.turn.aborted") ?? "已中断",
      tone: "default",
    };
  }
  return {
    label: t?.("agentChat.sessionOverview.status.turn.idle") ?? "空闲",
    tone: "default",
  };
}

function resolvePathLeaf(value?: string | null): string {
  const normalized = (value || "").trim().replace(/\\/g, "/");
  if (!normalized) {
    return "";
  }
  const segments = normalized.split("/").filter(Boolean);
  return segments.at(-1) || normalized;
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

const CODE_OUTPUT_ITEM_TYPES = new Set([
  "command_execution",
  "tool_call",
  "error",
  "warning",
]);

function normalizeChangePath(value: string): string {
  return value.replace(/\\/g, "/").trim().toLowerCase();
}

function readMetadataRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readMetadataText(
  metadata: Record<string, unknown> | null,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = metadata?.[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function readMetadataRecordValue(
  metadata: Record<string, unknown> | null,
  keys: string[],
): Record<string, unknown> | null {
  for (const key of keys) {
    const value = readMetadataRecord(metadata?.[key]);
    if (value) {
      return value;
    }
  }
  return null;
}

function readMetadataVersionNo(
  metadata: Record<string, unknown> | null,
): number | undefined {
  const versionRecord = readMetadataRecordValue(metadata, [
    "artifactVersion",
    "artifact_version",
  ]);
  const rawValue =
    metadata?.artifactVersionNo ??
    metadata?.artifact_version_no ??
    metadata?.versionNo ??
    metadata?.version_no ??
    versionRecord?.versionNo ??
    versionRecord?.version_no;
  if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
    return rawValue;
  }
  if (typeof rawValue === "string" && rawValue.trim()) {
    const parsed = Number(rawValue.trim());
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function buildFileArtifactChangeItem(
  item: Extract<AgentThreadItem, { type: "file_artifact" }>,
  fileCheckpointSummary?: AgentRuntimeFileCheckpointThreadSummary | null,
): CanvasWorkbenchChangeItem | null {
  const path = item.path.trim();
  if (!path) {
    return null;
  }

  const metadata = readMetadataRecord(item.metadata);
  const versionRecord = readMetadataRecordValue(metadata, [
    "artifactVersion",
    "artifact_version",
  ]);
  const preview =
    readMetadataText(metadata, [
      "previewText",
      "preview_text",
      "artifactSummary",
      "artifact_summary",
      "summary",
    ]) || item.content;
  const latestCheckpoint = fileCheckpointSummary?.latest_checkpoint || null;
  const metadataCheckpointPath =
    readMetadataText(metadata, ["snapshotPath", "snapshot_path"]) ||
    readMetadataText(versionRecord, ["snapshotPath", "snapshot_path"]);
  const checkpointMatches =
    latestCheckpoint?.path &&
    normalizeChangePath(latestCheckpoint.path) === normalizeChangePath(path);
  const versionNo = readMetadataVersionNo(metadata);

  return {
    id: item.id,
    path,
    displayName:
      readMetadataText(metadata, [
        "artifactTitle",
        "artifact_title",
        "title",
        "fileName",
        "filename",
      ]) || extractFileNameFromPath(path),
    source: item.source,
    status: item.status,
    preview,
    currentContent: item.content || preview || null,
    previousContent: null,
    checkpointPath: checkpointMatches
      ? latestCheckpoint.path
      : metadataCheckpointPath || null,
    checkpointLabel:
      (checkpointMatches && latestCheckpoint.version_no) || versionNo
        ? `v${latestCheckpoint?.version_no || versionNo}`
        : null,
  };
}

function upsertChangeItem(
  byPath: Map<string, CanvasWorkbenchChangeItem>,
  item: CanvasWorkbenchChangeItem | null,
) {
  if (!item) {
    return;
  }
  const key = normalizeChangePath(item.path);
  const previous = byPath.get(key);
  if (!previous) {
    byPath.set(key, item);
    return;
  }

  byPath.set(key, {
    ...previous,
    ...item,
    id: previous.id,
    currentContent: item.currentContent || previous.currentContent,
    previousContent: item.previousContent ?? previous.previousContent,
    preview: item.preview || previous.preview,
    source: item.source || previous.source,
    absolutePath: item.absolutePath || previous.absolutePath,
    status:
      previous.status === "in_progress" || item.status === "in_progress"
        ? "in_progress"
        : previous.status === "failed" || item.status === "failed"
          ? "failed"
          : item.status || previous.status,
    checkpointPath: item.checkpointPath || previous.checkpointPath,
    checkpointLabel: item.checkpointLabel || previous.checkpointLabel,
  });
}

function buildCanvasWorkbenchChangeView({
  threadItems,
  fileCheckpointSummary,
  onOpenFile,
}: {
  threadItems: AgentThreadItem[];
  fileCheckpointSummary?: AgentRuntimeFileCheckpointThreadSummary | null;
  onOpenFile?: (path: string) => void | Promise<void>;
}): CanvasWorkbenchChangeView | null {
  const byPath = new Map<string, CanvasWorkbenchChangeItem>();

  threadItems
    .filter(
      (item): item is Extract<AgentThreadItem, { type: "file_artifact" }> =>
        item.type === "file_artifact",
    )
    .forEach((item) => {
      upsertChangeItem(
        byPath,
        buildFileArtifactChangeItem(item, fileCheckpointSummary),
      );
    });

  const items = [...byPath.values()];
  if (items.length === 0 && !(fileCheckpointSummary?.count ?? 0)) {
    return null;
  }

  const latestCheckpoint = fileCheckpointSummary?.latest_checkpoint || null;
  const latestCheckpointPath =
    latestCheckpoint?.snapshot_path || latestCheckpoint?.path || null;

  return {
    items,
    checkpointCount: fileCheckpointSummary?.count ?? 0,
    latestCheckpointPath,
    onOpenFile,
  };
}

interface SessionRuntimeProjectionState {
  key: string;
  sessionId: string;
  firstMessageId: string;
  lastMessageId: string;
  ready: boolean;
}

function buildSessionRuntimeProjectionState(params: {
  key: string;
  sessionId: string;
  firstMessageId: string;
  lastMessageId: string;
  ready: boolean;
}): SessionRuntimeProjectionState {
  return params;
}

function resolveNextSessionRuntimeProjectionState(
  current: SessionRuntimeProjectionState,
  next: SessionRuntimeProjectionState,
): SessionRuntimeProjectionState {
  return current.key === next.key &&
    current.sessionId === next.sessionId &&
    current.firstMessageId === next.firstMessageId &&
    current.lastMessageId === next.lastMessageId &&
    current.ready === next.ready
    ? current
    : next;
}

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
  accessMode: ConversationScenePresentationParams["scene"]["accessMode"];
  setAccessMode: ConversationScenePresentationParams["scene"]["setAccessMode"];
  chatToolPreferences: ChatToolPreferences;
  setChatToolPreferences: Dispatch<SetStateAction<ChatToolPreferences>>;
  selectedTeam: ConversationScenePresentationParams["scene"]["selectedTeam"];
  handleSelectTeam: ConversationScenePresentationParams["scene"]["onSelectTeam"];
  handleEnableSuggestedTeam: ConversationScenePresentationParams["scene"]["onEnableSuggestedTeam"];
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
  teamWorkspaceEnabled: ConversationScenePresentationParams["teamWorkspaceDock"]["enabled"];
  layoutMode: LayoutMode;
  handleActivateTeamWorkbench: ConversationScenePresentationParams["teamWorkspaceDock"]["onActivateWorkbench"];
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
  accessMode,
  setAccessMode,
  chatToolPreferences,
  setChatToolPreferences,
  selectedTeam,
  handleSelectTeam,
  handleEnableSuggestedTeam,
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
  teamWorkspaceEnabled,
  layoutMode,
  handleActivateTeamWorkbench,
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
  const sessionRuntimeProjectionSessionId = sessionId ?? "no-session";
  const sessionRuntimeProjectionFirstMessageId =
    displayMessages[0]?.id ?? "no-first-message";
  const sessionRuntimeProjectionLastMessageId =
    displayMessages[displayMessages.length - 1]?.id ?? "no-last-message";
  const sessionRuntimeProjectionLastTurnId =
    turns[turns.length - 1]?.id ?? "no-last-turn";
  const sessionRuntimeProjectionLastItemId =
    effectiveThreadItems[effectiveThreadItems.length - 1]?.id ?? "no-last-item";
  const sessionRuntimeProjectionKey = [
    sessionRuntimeProjectionSessionId,
    sessionRuntimeProjectionFirstMessageId,
    sessionRuntimeProjectionLastMessageId,
    sessionRuntimeProjectionLastTurnId,
    sessionRuntimeProjectionLastItemId,
  ].join("|");
  const shouldTreatAsRestoredHistoryWindow = isRestoringSession;
  const hasHeavySessionRuntimeProjection =
    displayMessages.length >=
      SESSION_RUNTIME_PROJECTION_DEFER_MESSAGE_THRESHOLD ||
    turns.length >= SESSION_RUNTIME_PROJECTION_DEFER_TURN_THRESHOLD ||
    effectiveThreadItems.length >=
      SESSION_RUNTIME_PROJECTION_DEFER_ITEM_THRESHOLD;
  const shouldConsiderDeferringSessionRuntimeProjection =
    shouldTreatAsRestoredHistoryWindow &&
    !isSending &&
    !focusedTimelineItemId &&
    !pendingA2UIForm &&
    hasHeavySessionRuntimeProjection;
  const [sessionRuntimeProjectionState, setSessionRuntimeProjectionState] =
    useState(() =>
      buildSessionRuntimeProjectionState({
        key: sessionRuntimeProjectionKey,
        sessionId: sessionRuntimeProjectionSessionId,
        firstMessageId: sessionRuntimeProjectionFirstMessageId,
        lastMessageId: sessionRuntimeProjectionLastMessageId,
        ready: !shouldConsiderDeferringSessionRuntimeProjection,
      }),
    );
  const sessionRuntimeProjectionAlreadyReady =
    sessionRuntimeProjectionState.key === sessionRuntimeProjectionKey &&
    sessionRuntimeProjectionState.ready;
  const isAppendOnlyMessageProjectionUpdate =
    sessionRuntimeProjectionState.key !== sessionRuntimeProjectionKey &&
    sessionRuntimeProjectionState.sessionId ===
      sessionRuntimeProjectionSessionId &&
    sessionRuntimeProjectionState.firstMessageId ===
      sessionRuntimeProjectionFirstMessageId &&
    sessionRuntimeProjectionState.lastMessageId !==
      sessionRuntimeProjectionLastMessageId;
  const shouldDeferSessionRuntimeProjection =
    shouldConsiderDeferringSessionRuntimeProjection &&
    !sessionRuntimeProjectionAlreadyReady &&
    !isAppendOnlyMessageProjectionUpdate;
  const sessionRuntimeProjectionReady =
    sessionRuntimeProjectionState.key === sessionRuntimeProjectionKey
      ? sessionRuntimeProjectionState.ready
      : !shouldDeferSessionRuntimeProjection;

  useEffect(() => {
    if (!shouldDeferSessionRuntimeProjection) {
      const nextState = buildSessionRuntimeProjectionState({
        key: sessionRuntimeProjectionKey,
        sessionId: sessionRuntimeProjectionSessionId,
        firstMessageId: sessionRuntimeProjectionFirstMessageId,
        lastMessageId: sessionRuntimeProjectionLastMessageId,
        ready: true,
      });
      setSessionRuntimeProjectionState((current) =>
        resolveNextSessionRuntimeProjectionState(current, nextState),
      );
      return;
    }

    const pendingState = buildSessionRuntimeProjectionState({
      key: sessionRuntimeProjectionKey,
      sessionId: sessionRuntimeProjectionSessionId,
      firstMessageId: sessionRuntimeProjectionFirstMessageId,
      lastMessageId: sessionRuntimeProjectionLastMessageId,
      ready: false,
    });
    setSessionRuntimeProjectionState((current) =>
      resolveNextSessionRuntimeProjectionState(current, pendingState),
    );
    return scheduleMinimumDelayIdleTask(
      () => {
        const readyState = buildSessionRuntimeProjectionState({
          key: sessionRuntimeProjectionKey,
          sessionId: sessionRuntimeProjectionSessionId,
          firstMessageId: sessionRuntimeProjectionFirstMessageId,
          lastMessageId: sessionRuntimeProjectionLastMessageId,
          ready: true,
        });
        setSessionRuntimeProjectionState((current) =>
          current.key === sessionRuntimeProjectionKey
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
    displayMessages.length,
    effectiveThreadItems.length,
    focusedTimelineItemId,
    hasHeavySessionRuntimeProjection,
    isSending,
    pendingA2UIForm,
    sessionRuntimeProjectionFirstMessageId,
    sessionRuntimeProjectionKey,
    sessionRuntimeProjectionLastMessageId,
    sessionRuntimeProjectionSessionId,
    shouldConsiderDeferringSessionRuntimeProjection,
    shouldDeferSessionRuntimeProjection,
    shouldTreatAsRestoredHistoryWindow,
    turns.length,
  ]);

  const shouldUseDeferredSessionRuntimeProjection =
    shouldDeferSessionRuntimeProjection && !sessionRuntimeProjectionReady;
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
    const normalized = content.trim();
    if (!normalized) {
      return;
    }

    const quotedBlock = `${normalized
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n")}\n\n`;

    if (!input.trim()) {
      setInput(quotedBlock);
      return;
    }

    setInput(`${input.trimEnd()}\n\n${quotedBlock}`);
  };

  const teamWorkspaceDockLayoutMode =
    layoutMode === "chat" ? "chat" : "chat-canvas";
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
  const outputItemCount = projectedThreadItems.filter((item) =>
    CODE_OUTPUT_ITEM_TYPES.has(item.type),
  ).length;
  const failedOutputItemCount = projectedThreadItems.filter(
    (item) => CODE_OUTPUT_ITEM_TYPES.has(item.type) && item.status === "failed",
  ).length;
  const inProgressItemCount = projectedThreadItems.filter(
    (item) => item.status === "in_progress",
  ).length;
  const generatedFileCount = projectedThreadItems.filter(
    (item) => item.type === "file_artifact",
  ).length;
  const inProgressItemCountLabel = formatNumber(inProgressItemCount, {
    locale,
  });
  const generatedFileCountLabel = formatNumber(generatedFileCount, { locale });
  const pendingActionCountLabel = formatNumber(projectedPendingActions.length, {
    locale,
  });
  const queuedTurnCountLabel = formatNumber(projectedQueuedTurns.length, {
    locale,
  });
  const fileCheckpointSummary =
    projectedThreadRead?.file_checkpoint_summary || null;
  const hasRuntimeFileChanges =
    (fileCheckpointSummary?.count ?? 0) > 0 ||
    projectedThreadItems.some((item) => item.type === "file_artifact");
  const hasRuntimeOutputs = outputItemCount > 0;
  const shouldUseRuntimeWorkbench =
    hasRuntimeFileChanges || hasRuntimeOutputs || inProgressItemCount > 0;
  const changeView = useMemo(() => {
    return buildCanvasWorkbenchChangeView({
      threadItems: hasRuntimeFileChanges ? projectedThreadItems : [],
      fileCheckpointSummary,
      onOpenFile: canvasScene.handleOpenCanvasWorkbenchPath,
    });
  }, [
    canvasScene.handleOpenCanvasWorkbenchPath,
    fileCheckpointSummary,
    hasRuntimeFileChanges,
    projectedThreadItems,
  ]);
  const sessionSummaryStats: CanvasWorkbenchSummaryStat[] = [
    {
      key: "session-status",
      label: t("agentChat.workspaceSession.summary.status.label"),
      value: currentSessionStatus.label,
      detail: t("agentChat.workspaceSession.summary.status.detail"),
      tone: currentSessionStatus.tone,
    },
    {
      key: "session-generated-files",
      label: t("agentChat.workspaceSession.summary.outputs.label"),
      value:
        inProgressItemCount > 0
          ? t("agentChat.workspaceSession.summary.outputs.value.inProgress", {
              countLabel: inProgressItemCountLabel,
            })
          : generatedFileCount > 0
            ? t("agentChat.workspaceSession.summary.outputs.value.files", {
                countLabel: generatedFileCountLabel,
              })
            : t("agentChat.workspaceSession.summary.outputs.value.empty"),
      detail:
        inProgressItemCount > 0
          ? t("agentChat.workspaceSession.summary.outputs.detail.inProgress")
          : generatedFileCount > 0
            ? t("agentChat.workspaceSession.summary.outputs.detail.files")
            : t("agentChat.workspaceSession.summary.outputs.detail.empty"),
      tone: inProgressItemCount > 0 ? "accent" : "default",
    },
    {
      key: "session-follow-up",
      label:
        projectedPendingActions.length > 0
          ? t("agentChat.workspaceSession.summary.next.label.pending")
          : projectedQueuedTurns.length > 0
            ? t("agentChat.workspaceSession.summary.next.label.queued")
            : t("agentChat.workspaceSession.summary.next.label.idle"),
      value:
        projectedPendingActions.length > 0
          ? t("agentChat.workspaceSession.summary.next.value.pending", {
              countLabel: pendingActionCountLabel,
            })
          : projectedQueuedTurns.length > 0
            ? t("agentChat.workspaceSession.summary.next.value.queued", {
                countLabel: queuedTurnCountLabel,
              })
            : t("agentChat.workspaceSession.summary.next.value.idle"),
      detail:
        projectedPendingActions.length > 0
          ? t("agentChat.workspaceSession.summary.next.detail.pending")
          : projectedQueuedTurns.length > 0
            ? t("agentChat.workspaceSession.summary.next.detail.queued", {
                countLabel: queuedTurnCountLabel,
              })
            : t("agentChat.workspaceSession.summary.next.detail.idle"),
      tone:
        projectedPendingActions.length > 0
          ? "accent"
          : projectedQueuedTurns.length > 0
            ? "default"
            : "default",
    },
  ];
  const shouldExposeSessionProgress =
    inProgressItemCount > 0 ||
    projectedPendingActions.length > 0 ||
    projectedQueuedTurns.length > 0;
  const sessionView: CanvasWorkbenchSessionView | null =
    shouldExposeSessionProgress
      ? {
          eyebrow: t("agentChat.workspaceSession.eyebrow"),
          title: t("agentChat.workspaceSession.title"),
          tabLabel: t("agentChat.workspaceSession.tabLabel"),
          tabBadge:
            inProgressItemCount > 0
              ? t("agentChat.workspaceSession.badge.inProgress", {
                  countLabel: inProgressItemCountLabel,
                })
              : projectedQueuedTurns.length > 0
                ? t("agentChat.workspaceSession.badge.queued", {
                    countLabel: queuedTurnCountLabel,
                  })
                : undefined,
          tabBadgeTone: inProgressItemCount > 0 ? "sky" : "slate",
          subtitle: currentSessionTurn
            ? t("agentChat.workspaceSession.subtitle.current", {
                prompt:
                  shortenSessionText(currentSessionTurn.prompt_text, 160) ||
                  t("agentChat.sessionOverview.latestPromptFallback"),
              })
            : t("agentChat.workspaceSession.subtitle.empty"),
          summaryStats: sessionSummaryStats,
          badges: [
            {
              key: "session-status",
              label: currentSessionStatus.label,
              tone: currentSessionStatus.tone,
            },
            {
              key: "session-generated-files",
              label:
                inProgressItemCount > 0
                  ? t("agentChat.workspaceSession.badge.inProgress", {
                      countLabel: inProgressItemCountLabel,
                    })
                  : t("agentChat.workspaceSession.badge.files", {
                      countLabel: generatedFileCountLabel,
                    }),
              tone: inProgressItemCount > 0 ? "accent" : "default",
            },
            ...(projectedPendingActions.length > 0
              ? [
                  {
                    key: "session-pending-actions",
                    label: t("agentChat.workspaceSession.badge.pending", {
                      countLabel: pendingActionCountLabel,
                    }),
                    tone: "accent" as const,
                  },
                ]
              : []),
            ...(projectedQueuedTurns.length > 0
              ? [
                  {
                    key: "session-queued-turns",
                    label: t("agentChat.workspaceSession.badge.queued", {
                      countLabel: queuedTurnCountLabel,
                    }),
                    tone: "default" as const,
                  },
                ]
              : []),
          ],
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
  const outputView: CanvasWorkbenchUtilityView = {
    enabled: shouldUseRuntimeWorkbench,
    tabLabel: t("agentChat.workspaceSession.outputView.tabLabel"),
    title: t("agentChat.workspaceSession.outputView.title"),
    subtitle: t("agentChat.workspaceSession.outputView.subtitle"),
    tabBadge:
      outputItemCount > 0
        ? outputItemCount > 99
          ? "99+"
          : `${outputItemCount}`
        : undefined,
    tabBadgeTone:
      failedOutputItemCount > 0
        ? "rose"
        : outputItemCount > 0
          ? "sky"
          : "slate",
    renderPanel: () => (
      <CanvasSessionOverviewPanel
        turns={projectedTurns}
        threadItems={projectedThreadItems.filter((item) =>
          CODE_OUTPUT_ITEM_TYPES.has(item.type),
        )}
        currentTurnId={projectedCurrentTurnId}
        pendingActions={[]}
        queuedTurns={[]}
        isSending={isSending}
        focusedItemId={focusedTimelineItemId}
      />
    ),
  };
  const workspaceRootLabel = resolvePathLeaf(projectRootPath) || "未绑定";
  const workspaceBindingValue = workspacePathMissing
    ? "路径缺失"
    : workspaceHealthError
      ? "状态异常"
      : projectRootPath
        ? "已连接"
        : "未绑定";
  const workspaceView: CanvasWorkbenchHeaderView = {
    eyebrow: "Project Workspace",
    tabLabel: "文件",
    tabBadge:
      workspacePathMissing || workspaceHealthError
        ? workspaceBindingValue
        : projectRootPath?.trim()
          ? workspaceRootLabel
          : undefined,
    tabBadgeTone:
      workspacePathMissing || workspaceHealthError
        ? "rose"
        : projectRootPath?.trim()
          ? "sky"
          : undefined,
    title: projectRootPath?.trim()
      ? "项目工作区文件"
      : "当前没有可浏览的项目文件",
    subtitle: projectRootPath?.trim()
      ? projectRootPath
      : "绑定工作区目录后，这里会显示真实文件树。",
    badges: [
      {
        key: "workspace-root",
        label: projectRootPath?.trim() ? workspaceRootLabel : "未绑定工作区",
        tone: projectRootPath?.trim() ? "accent" : "default",
      },
      ...(workspacePathMissing
        ? [
            {
              key: "workspace-missing",
              label: "路径缺失",
              tone: "default" as const,
            },
          ]
        : workspaceHealthError
          ? [
              {
                key: "workspace-health-error",
                label: "状态异常",
                tone: "default" as const,
              },
            ]
          : []),
    ],
    summaryStats: [
      {
        key: "workspace-root",
        label: "工作区",
        value: workspaceRootLabel,
        detail:
          projectRootPath?.trim() || "绑定工作区后，这里会展示真实文件树。",
        tone: projectRootPath?.trim() ? "accent" : "default",
      },
      {
        key: "workspace-binding",
        label: "目录状态",
        value: workspaceBindingValue,
        detail: workspacePathMissing
          ? "当前工作区路径缺失，需重新选择目录。"
          : workspaceHealthError
            ? "当前工作区状态异常，建议先修复后再继续浏览。"
            : projectRootPath?.trim()
              ? "画布会直接读取项目里的真实文件。"
              : "尚未绑定工作区目录。",
        tone:
          workspacePathMissing || workspaceHealthError ? "default" : "success",
      },
    ],
    panelCopy: {
      unavailableText: "当前工作区路径不可用，暂时无法浏览项目文件。",
      emptyText: "当前会话没有绑定可浏览的工作区目录。",
      sectionEyebrow: "项目目录",
      loadingText: "正在加载目录...",
      emptyDirectoryText: "暂无目录内容。",
    },
  };

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
      accessMode,
      setAccessMode,
      onManageProviders: navigationActions.handleManageProviders,
      toolPreferences: chatToolPreferences,
      onToolPreferenceChange: (key, enabled) =>
        setChatToolPreferences((previous) => ({
          ...previous,
          [key]: enabled,
        })),
      selectedTeam,
      onSelectTeam: handleSelectTeam,
      onEnableSuggestedTeam: handleEnableSuggestedTeam,
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
      deferWorkspaceListLoad,
      workspaceHintMessage,
      workspaceHintVisible,
      onDismissWorkspaceHint,
      sessionId,
      onProjectChange: navigationActions.handleProjectChange,
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
      teamWorkbenchView: canvasScene.teamWorkbenchView,
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
    teamWorkspaceDock: {
      enabled: teamWorkspaceEnabled,
      shouldShowFloatingInputOverlay:
        shellChromeRuntime.shouldShowGeneralWorkbenchFloatingInputOverlay,
      layoutMode: teamWorkspaceDockLayoutMode,
      onActivateWorkbench: handleActivateTeamWorkbench,
      withBottomOverlay:
        isThemeWorkbench &&
        shellChromeRuntime.showChatLayout &&
        !shellChromeRuntime.shouldHideGeneralWorkbenchInputForTheme,
      surfaceProps: inputbarScene.teamWorkbenchSurfaceProps,
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
      workbenchMode: shouldUseRuntimeWorkbench ? "coding" : "default",
      workspaceView,
      sessionView,
      outputView: shouldUseRuntimeWorkbench ? outputView : null,
      logView: shouldUseRuntimeWorkbench ? sessionView : null,
      changeView: shouldUseRuntimeWorkbench ? changeView : null,
      onLayoutModeChange: shouldSyncCanvasWorkbenchLayoutMode
        ? setCanvasWorkbenchLayoutMode
        : undefined,
    },
  });
}
