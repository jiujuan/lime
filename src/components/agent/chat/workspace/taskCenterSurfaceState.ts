import type { TaskCenterDraftSendRequest } from "../homePendingPreview";
import {
  isTaskCenterDraftSendPendingForLayout,
  resolveTaskCenterHomeSurfaceState,
  shouldSuppressTaskCenterDraftContentForLayout,
  type TaskCenterDraftTab,
  type TaskCenterHomeSurfaceState,
} from "./agentChatWorkspaceHelpers";

interface ResolveTaskCenterDraftSurfaceStateParams {
  agentEntry: string;
  isTaskCenterEntry: boolean;
  activeDraftTabId: string | null;
  draftTabs: readonly TaskCenterDraftTab[];
  draftSurfaceActive: boolean;
  draftSendRequest: TaskCenterDraftSendRequest | null;
  displayMessageCount: number;
  threadItemCount: number;
  hasPendingA2UIForm: boolean;
  isPreparingSend: boolean;
  isSending: boolean;
  queuedTurnCount: number;
}

export interface TaskCenterDraftSurfaceState {
  activeTaskCenterDraftTab: TaskCenterDraftTab | null;
  isTaskCenterDraftTabActive: boolean;
  isTaskCenterDraftSurfaceActive: boolean;
  isTaskCenterDraftSendInFlight: boolean;
  hasVisibleSessionActivityForDraftSurface: boolean;
  shouldSuppressTaskCenterDraftContent: boolean;
}

interface ResolveTaskCenterHomeChromeStateParams {
  agentEntry: string;
  draftSurfaceActive: boolean;
  draftTabActive: boolean;
  shouldSuppressDraftContent: boolean;
  draftSendRequest: TaskCenterDraftSendRequest | null;
  sessionSwitchPending: boolean;
  hasInitialSessionRoute: boolean;
  displayMessageCount: number;
  threadItemCount: number;
  hasPendingA2UIForm: boolean;
  isPreparingSend: boolean;
  isSending: boolean;
  isHomePendingPreviewActive: boolean;
  queuedTurnCount: number;
  sessionId?: string | null;
  embeddedHomeSessionIds: ReadonlySet<string>;
  isAutoRestoringSession: boolean;
  isSessionHydrating: boolean;
  shouldUseBrowserWorkspaceHomeChrome: boolean;
}

export interface TaskCenterHomeChromeState {
  hasCurrentSessionActivity: boolean;
  hasHomeConversationActivity: boolean;
  taskCenterHomeSurfaceState: TaskCenterHomeSurfaceState;
  isTaskCenterDraftSendPending: boolean;
  shouldRenderTaskCenterEmbeddedHome: boolean;
  suppressHomeNavbarUtilityActions: boolean;
}

export function resolveTaskCenterDraftSurfaceState({
  agentEntry,
  isTaskCenterEntry,
  activeDraftTabId,
  draftTabs,
  draftSurfaceActive,
  draftSendRequest,
  displayMessageCount,
  threadItemCount,
  hasPendingA2UIForm,
  isPreparingSend,
  isSending,
  queuedTurnCount,
}: ResolveTaskCenterDraftSurfaceStateParams): TaskCenterDraftSurfaceState {
  const activeTaskCenterDraftTab = activeDraftTabId
    ? (draftTabs.find((tab) => tab.id === activeDraftTabId) ?? null)
    : null;
  const isTaskCenterDraftTabActive = Boolean(
    isTaskCenterEntry && activeTaskCenterDraftTab,
  );
  const isTaskCenterDraftSurfaceActive = Boolean(
    isTaskCenterEntry && (activeTaskCenterDraftTab || draftSurfaceActive),
  );
  const isTaskCenterDraftSendInFlight = Boolean(
    agentEntry === "claw" &&
    draftSendRequest?.materializeDraft &&
    (activeTaskCenterDraftTab
      ? draftSendRequest.draftTabId === activeTaskCenterDraftTab.id
      : draftSurfaceActive),
  );
  const hasVisibleSessionActivityForDraftSurface =
    !isTaskCenterDraftTabActive &&
    (displayMessageCount > 0 ||
      threadItemCount > 0 ||
      hasPendingA2UIForm ||
      isPreparingSend ||
      isSending ||
      queuedTurnCount > 0);
  const shouldSuppressTaskCenterDraftContent =
    shouldSuppressTaskCenterDraftContentForLayout({
      draftSurfaceActive: isTaskCenterDraftSurfaceActive,
      draftSendInFlight: isTaskCenterDraftSendInFlight,
      hasVisibleSessionActivity: hasVisibleSessionActivityForDraftSurface,
    });

  return {
    activeTaskCenterDraftTab,
    isTaskCenterDraftTabActive,
    isTaskCenterDraftSurfaceActive,
    isTaskCenterDraftSendInFlight,
    hasVisibleSessionActivityForDraftSurface,
    shouldSuppressTaskCenterDraftContent,
  };
}

export function resolveTaskCenterHomeChromeState({
  agentEntry,
  draftSurfaceActive,
  draftTabActive,
  shouldSuppressDraftContent,
  draftSendRequest,
  sessionSwitchPending,
  hasInitialSessionRoute,
  displayMessageCount,
  threadItemCount,
  hasPendingA2UIForm,
  isPreparingSend,
  isSending,
  isHomePendingPreviewActive,
  queuedTurnCount,
  sessionId,
  embeddedHomeSessionIds,
  isAutoRestoringSession,
  isSessionHydrating,
  shouldUseBrowserWorkspaceHomeChrome,
}: ResolveTaskCenterHomeChromeStateParams): TaskCenterHomeChromeState {
  const hasCurrentSessionActivity =
    !draftTabActive &&
    (displayMessageCount > 0 ||
      threadItemCount > 0 ||
      hasPendingA2UIForm ||
      isPreparingSend ||
      isSending ||
      isHomePendingPreviewActive ||
      queuedTurnCount > 0);
  const hasHomeConversationActivity =
    !shouldSuppressDraftContent &&
    (hasCurrentSessionActivity || Boolean(draftSendRequest));
  const taskCenterHomeSurfaceState = resolveTaskCenterHomeSurfaceState({
    agentEntry,
    draftSurfaceActive,
    shouldSuppressDraftContent,
    sessionSwitchPending,
    hasInitialSessionRoute,
    hasConversationActivity: hasHomeConversationActivity,
    hasCurrentSessionActivity,
    sessionId,
    embeddedHomeSessionIds,
    isAutoRestoringSession,
    isSessionHydrating,
  });
  const isTaskCenterDraftSendPending = isTaskCenterDraftSendPendingForLayout({
    hasDraftSendRequest: Boolean(draftSendRequest),
    hasDisplayMessages: displayMessageCount > 0 || threadItemCount > 0,
    isSending,
    queuedTurnCount,
  });
  const shouldRenderTaskCenterEmbeddedHome =
    taskCenterHomeSurfaceState.shouldRenderEmbeddedHome;

  return {
    hasCurrentSessionActivity,
    hasHomeConversationActivity,
    taskCenterHomeSurfaceState,
    isTaskCenterDraftSendPending,
    shouldRenderTaskCenterEmbeddedHome,
    suppressHomeNavbarUtilityActions:
      (shouldUseBrowserWorkspaceHomeChrome && !hasHomeConversationActivity) ||
      shouldRenderTaskCenterEmbeddedHome,
  };
}
