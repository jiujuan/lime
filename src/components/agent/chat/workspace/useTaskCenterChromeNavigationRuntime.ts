import type {
  Dispatch,
  MutableRefObject,
  ReactNode,
  SetStateAction,
} from "react";
import type { Topic } from "../hooks/agentChatShared";
import type { AgentChatWorkspaceProps } from "../agentChatWorkspaceContract";
import type { TaskCenterDraftSendRequest } from "../homePendingPreview";
import type { OpenedProjectSummary } from "../hooks/useOpenedProjectSummaries";
import type { LayoutMode } from "@/lib/workspace/workbenchContract";
import type { TaskCenterDraftTab } from "./agentChatWorkspaceHelpers";
import { useTaskCenterConversationNavigationRuntime } from "./useTaskCenterConversationNavigationRuntime";
import { useTaskCenterFallbackRestoreRuntime } from "./useTaskCenterFallbackRestoreRuntime";
import { useTaskCenterHomeChromeRuntime } from "./useTaskCenterHomeChromeRuntime";
import { useTaskCenterNewTaskPageRuntime } from "./useTaskCenterNewTaskPageRuntime";
import { useTaskCenterTabChrome } from "./useTaskCenterTabChrome";
import type { TaskCenterHomeChromeState } from "./taskCenterSurfaceState";

interface TaskCenterFallbackRestoreState {
  topicId: string;
  startedAt: number;
}

interface OpenTaskTopicOptions {
  preferResume?: boolean;
  forceRefresh?: boolean;
  replaceOpenTabs?: boolean;
}

interface UseTaskCenterChromeNavigationRuntimeParams {
  activeDraftTabId: string | null;
  agentEntry: "new-task" | "claw";
  applyProjectSelection: (projectId: string) => void;
  clearEmbeddedHomeSession: (sessionId: string) => void;
  detachedTopicId: string | null;
  draftSendRequest: TaskCenterDraftSendRequest | null;
  draftSurfaceActive: boolean;
  draftTabActive: boolean;
  draftTabs: TaskCenterDraftTab[];
  embeddedHomeSessionIds: ReadonlySet<string>;
  externalProjectId?: string | null;
  fallbackRestoreRef: MutableRefObject<TaskCenterFallbackRestoreState | null>;
  hasDisplayMessages: boolean;
  hasLocalSessionOverride: boolean;
  hasPendingA2UIForm: boolean;
  homeMountedAt: number;
  initialDispatchKey: string | null;
  initialPendingServiceSkillLaunchSignature?: string | null;
  isAutoRestoringSession: boolean;
  isBootstrapDispatchPending: boolean;
  isHomePendingPreviewActive: boolean;
  isPreparingSend: boolean;
  isSending: boolean;
  isSessionHydrating: boolean;
  isTaskCenterDraftSurfaceActive: boolean;
  isTaskCenterDraftTabActive: boolean;
  isThemeWorkbench: boolean;
  layoutMode: LayoutMode;
  messagesLength: number;
  newChatAt?: number;
  newConversationLabel: string;
  normalizedInitialSessionId?: string | null;
  onCloseTaskCenterTab: (topicId: string) => void;
  onNavigate?: AgentChatWorkspaceProps["onNavigate"];
  onOpenTaskTopic: (
    topicId: string,
    options?: OpenTaskTopicOptions,
  ) => void | Promise<void>;
  onSwitchTaskTopic: (topicId: string) => void | Promise<void>;
  onToggleWorkbench: () => void;
  openDraftTab: () => string;
  openTabIds: string[];
  openedProjects: OpenedProjectSummary[];
  projectId?: string | null;
  queuedTurnsLength: number;
  renamePromptLabel: string;
  renameTopic: (topicId: string, title: string) => void | Promise<void>;
  resetProjectSelection: () => void;
  sessionId?: string | null;
  setHarnessPanelVisible: Dispatch<SetStateAction<boolean>>;
  shouldSuppressDraftContent: boolean;
  shouldUseBrowserWorkspaceHomeChrome: boolean;
  taskCenterWorkspaceId?: string | null;
  threadItemCount: number;
  topicById: ReadonlyMap<string, Topic>;
  topics: Topic[];
  transitionTopicId: string | null;
  untitledTaskLabel: string;
  harnessPanelVisible: boolean;
  displayMessageCount: number;
}

interface TaskCenterChromeNavigationRuntime {
  browserWorkspaceHomeTabsNode: ReactNode;
  handleOpenProjectConversation: (
    topicId: string,
    statusReason?: string,
  ) => void;
  handleOpenTaskCenterNewTaskPage: () => void;
  handleResumeRecentSession: () => void;
  hasHomeConversationActivity: boolean;
  projectConversationGroups: ReturnType<
    typeof useTaskCenterConversationNavigationRuntime
  >["projectConversationGroups"];
  recentSessionActionLabel: string;
  recentSessionTopic: Topic | null;
  shouldHideDetachedTaskCenterTabs: boolean;
  isTaskCenterDraftSendPending: boolean;
  shouldRenderTaskCenterEmbeddedHome: boolean;
  shouldRenderTaskCenterTabStrip: boolean;
  suppressHomeNavbarUtilityActions: boolean;
  taskCenterHomeSurfaceState: TaskCenterHomeChromeState;
  taskCenterTabsNode: ReactNode;
  taskCenterVisibleTabIds: string[];
}

export function useTaskCenterChromeNavigationRuntime({
  activeDraftTabId,
  agentEntry,
  applyProjectSelection,
  clearEmbeddedHomeSession,
  detachedTopicId,
  displayMessageCount,
  draftSendRequest,
  draftSurfaceActive,
  draftTabActive,
  draftTabs,
  embeddedHomeSessionIds,
  externalProjectId,
  fallbackRestoreRef,
  hasDisplayMessages,
  hasLocalSessionOverride,
  hasPendingA2UIForm,
  harnessPanelVisible,
  homeMountedAt,
  initialDispatchKey,
  initialPendingServiceSkillLaunchSignature,
  isAutoRestoringSession,
  isBootstrapDispatchPending,
  isHomePendingPreviewActive,
  isPreparingSend,
  isSending,
  isSessionHydrating,
  isTaskCenterDraftSurfaceActive,
  isTaskCenterDraftTabActive,
  isThemeWorkbench,
  layoutMode,
  messagesLength,
  newChatAt,
  newConversationLabel,
  normalizedInitialSessionId,
  onCloseTaskCenterTab,
  onNavigate,
  onOpenTaskTopic,
  onSwitchTaskTopic,
  onToggleWorkbench,
  openDraftTab,
  openTabIds,
  openedProjects,
  projectId,
  queuedTurnsLength,
  renamePromptLabel,
  renameTopic,
  resetProjectSelection,
  sessionId,
  setHarnessPanelVisible,
  shouldSuppressDraftContent,
  shouldUseBrowserWorkspaceHomeChrome,
  taskCenterWorkspaceId,
  threadItemCount,
  topicById,
  topics,
  transitionTopicId,
  untitledTaskLabel,
}: UseTaskCenterChromeNavigationRuntimeParams): TaskCenterChromeNavigationRuntime {
  const {
    handleRenameTaskTopic,
    taskCenterPreviewTopicId,
    hasHomeConversationActivity,
    taskCenterHomeSurfaceState,
    isTaskCenterDraftSendPending,
    shouldRenderTaskCenterEmbeddedHome,
    suppressHomeNavbarUtilityActions,
  } = useTaskCenterHomeChromeRuntime({
    agentEntry,
    sessionId,
    detachedTopicId,
    transitionTopicId,
    topicById,
    untitledTaskLabel,
    renamePromptLabel,
    renameTopic,
    draftSurfaceActive: isTaskCenterDraftSurfaceActive,
    draftTabActive: isTaskCenterDraftTabActive,
    shouldSuppressDraftContent,
    draftSendRequest,
    normalizedInitialSessionId,
    displayMessageCount,
    threadItemCount,
    hasPendingA2UIForm,
    isPreparingSend,
    isSending,
    isHomePendingPreviewActive,
    queuedTurnCount: queuedTurnsLength,
    embeddedHomeSessionIds,
    isAutoRestoringSession,
    isSessionHydrating,
    shouldUseBrowserWorkspaceHomeChrome,
    harnessPanelVisible,
    setHarnessPanelVisible,
    clearEmbeddedHomeSession,
  });

  const {
    recentSessionTopic,
    recentSessionActionLabel,
    handleResumeRecentSession,
    projectConversationGroups,
    handleOpenProjectConversation,
  } = useTaskCenterConversationNavigationRuntime({
    topics,
    sessionId,
    projectId,
    openedProjects,
    onOpenTaskTopic,
  });

  const handleOpenTaskCenterNewTaskPage = useTaskCenterNewTaskPageRuntime({
    agentEntry,
    externalProjectId,
    normalizedInitialSessionId,
    onNavigate,
    applyProjectSelection,
    resetProjectSelection,
    openTaskCenterDraftTab: openDraftTab,
  });

  const {
    shouldHideDetachedTaskCenterTabs,
    taskCenterVisibleTabIds,
    shouldRenderTaskCenterTabStrip,
    taskCenterTabsNode,
    browserWorkspaceHomeTabsNode,
  } = useTaskCenterTabChrome({
    agentEntry,
    sessionId,
    normalizedInitialSessionId,
    detachedTopicId,
    openTabIds,
    topics,
    previewTopicId: taskCenterPreviewTopicId,
    draftTabs,
    activeDraftTabId,
    isDraftTabActive: draftTabActive,
    hasLocalSessionOverride,
    topicById,
    untitledTaskLabel,
    shouldUseBrowserWorkspaceHomeChrome,
    newConversationLabel,
    newChatAt,
    homeMountedAt,
    isThemeWorkbench,
    layoutMode,
    onSwitchTaskTopic,
    onRenameTaskTopic: handleRenameTaskTopic,
    onCloseTaskCenterTab,
    onOpenTaskCenterNewTaskPage: handleOpenTaskCenterNewTaskPage,
    onToggleWorkbench,
  });

  useTaskCenterFallbackRestoreRuntime({
    agentEntry,
    workspaceId: taskCenterWorkspaceId,
    isAutoRestoringSession,
    isSessionHydrating,
    draftSurfaceActive,
    draftTabActive,
    initialPendingServiceSkillLaunchSignature,
    initialDispatchKey,
    isBootstrapDispatchPending,
    messagesLength,
    isSending,
    queuedTurnsLength,
    shouldHideDetachedTaskCenterTabs,
    normalizedInitialSessionId,
    sessionId,
    currentSessionIsKnownTopic: Boolean(sessionId && topicById.has(sessionId)),
    hasDisplayMessages,
    switchingTopicId: transitionTopicId,
    detachedTopicId,
    openTabIds,
    visibleTabIds: taskCenterVisibleTabIds,
    topics,
    fallbackRestoreRef,
    onOpenTaskTopic,
  });

  return {
    browserWorkspaceHomeTabsNode,
    handleOpenProjectConversation,
    handleOpenTaskCenterNewTaskPage,
    handleResumeRecentSession,
    hasHomeConversationActivity,
    projectConversationGroups,
    recentSessionActionLabel,
    recentSessionTopic,
    shouldHideDetachedTaskCenterTabs,
    isTaskCenterDraftSendPending,
    shouldRenderTaskCenterEmbeddedHome,
    shouldRenderTaskCenterTabStrip,
    suppressHomeNavbarUtilityActions,
    taskCenterHomeSurfaceState,
    taskCenterTabsNode,
    taskCenterVisibleTabIds,
  };
}
