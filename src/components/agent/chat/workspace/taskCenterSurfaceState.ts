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
  hasHomePendingPreview?: boolean;
  displayMessageCount: number;
  threadItemCount: number;
  hasLocalSessionOverride?: boolean;
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

export function hasTaskCenterPendingPreviewActivity(
  isHomePendingPreviewActive: boolean,
  bootstrapPendingPreviewMessageCount: number,
): boolean {
  return isHomePendingPreviewActive || bootstrapPendingPreviewMessageCount > 0;
}

interface ResolveTaskCenterHomeChromeStateParams {
  agentEntry: string;
  draftSurfaceActive: boolean;
  draftTabActive: boolean;
  shouldSuppressDraftContent: boolean;
  draftSendRequest: TaskCenterDraftSendRequest | null;
  sessionSwitchPending: boolean;
  hasInitialSessionRoute: boolean;
  isHomeSessionBackgroundRecovery?: boolean;
  displayMessageCount: number;
  threadItemCount: number;
  hasPendingA2UIForm: boolean;
  isPreparingSend: boolean;
  isSending: boolean;
  isHomePendingPreviewActive: boolean;
  isHomeSendStarting?: boolean;
  queuedTurnCount: number;
  hasLocalSessionOverride?: boolean;
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
  hasHomePendingPreview = false,
  displayMessageCount,
  threadItemCount,
  hasLocalSessionOverride = false,
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
    (agentEntry === "claw" || agentEntry === "new-task") &&
    draftSendRequest?.materializeDraft &&
    (activeTaskCenterDraftTab
      ? draftSendRequest.draftTabId === activeTaskCenterDraftTab.id
      : draftSurfaceActive),
  );
  const hasVisibleSessionActivityForDraftSurface =
    Boolean(draftSendRequest) ||
    hasHomePendingPreview ||
    isPreparingSend ||
    isSending ||
    (!isTaskCenterDraftTabActive &&
      (displayMessageCount > 0 ||
        threadItemCount > 0 ||
        hasLocalSessionOverride ||
        hasPendingA2UIForm ||
        queuedTurnCount > 0));
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
  isHomeSessionBackgroundRecovery = false,
  displayMessageCount,
  threadItemCount,
  hasPendingA2UIForm,
  isPreparingSend,
  isSending,
  isHomePendingPreviewActive,
  isHomeSendStarting = false,
  queuedTurnCount,
  hasLocalSessionOverride = false,
  sessionId,
  embeddedHomeSessionIds,
  isAutoRestoringSession,
  isSessionHydrating,
  shouldUseBrowserWorkspaceHomeChrome,
}: ResolveTaskCenterHomeChromeStateParams): TaskCenterHomeChromeState {
  const hasForegroundLocalSession =
    hasLocalSessionOverride &&
    Boolean(sessionId) &&
    !draftSurfaceActive &&
    !draftTabActive &&
    !shouldSuppressDraftContent;
  const shouldTreatCurrentSessionAsBackground =
    isHomeSessionBackgroundRecovery &&
    !hasInitialSessionRoute &&
    !hasForegroundLocalSession;
  const hasCurrentSessionActivity =
    !shouldTreatCurrentSessionAsBackground &&
    !draftTabActive &&
    (displayMessageCount > 0 ||
      threadItemCount > 0 ||
      Boolean(draftSendRequest) ||
      hasForegroundLocalSession ||
      hasPendingA2UIForm ||
      isHomeSendStarting ||
      isPreparingSend ||
      isSending ||
      isHomePendingPreviewActive ||
      queuedTurnCount > 0);
  const hasHomeConversationActivity =
    !shouldTreatCurrentSessionAsBackground &&
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
    isHomeSessionBackgroundRecovery: shouldTreatCurrentSessionAsBackground,
  });
  const isTaskCenterDraftSendPending = isTaskCenterDraftSendPendingForLayout({
    hasDraftSendRequest: Boolean(draftSendRequest),
    hasDisplayMessages: displayMessageCount > 0 || threadItemCount > 0,
    isSending,
    queuedTurnCount,
  });
  const shouldRenderTaskCenterEmbeddedHome =
    taskCenterHomeSurfaceState.shouldRenderEmbeddedHome;
  const hasNavbarUtilityActivity =
    hasHomeConversationActivity ||
    displayMessageCount > 0 ||
    threadItemCount > 0 ||
    Boolean(draftSendRequest) ||
    hasPendingA2UIForm ||
    isHomeSendStarting ||
    isPreparingSend ||
    isSending ||
    isHomePendingPreviewActive ||
    queuedTurnCount > 0;

  return {
    hasCurrentSessionActivity,
    hasHomeConversationActivity,
    taskCenterHomeSurfaceState,
    isTaskCenterDraftSendPending,
    shouldRenderTaskCenterEmbeddedHome,
    suppressHomeNavbarUtilityActions:
      (shouldUseBrowserWorkspaceHomeChrome && !hasNavbarUtilityActivity) ||
      shouldRenderTaskCenterEmbeddedHome,
  };
}
