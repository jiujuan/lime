import {
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { TaskCenterDraftSendRequest } from "../homePendingPreview";
import type { InputbarSendHandler } from "../components/Inputbar/inputbarSendPayload";
import type { WorkspaceHandleSend } from "./useWorkspaceSendActions";
import {
  useTaskCenterDraftSendDispatchRuntime,
  useTaskCenterEmptyStateSendRuntime,
} from "./useTaskCenterDraftSendRuntime";
import {
  resolveWorkspaceSceneSessionProjection,
  type WorkspaceSceneSessionProjection,
} from "./workspaceSceneSessionProjection";
import {
  clearActiveTaskCenterDraftTab,
  removeTaskCenterDraftTab,
} from "./taskCenterDraftTabs";
import type { TaskCenterDraftTab } from "./agentChatWorkspaceHelpers";
import type { TaskCenterHomeSurfaceState } from "./agentChatWorkspaceHelpers";
import type { LayoutMode } from "@/lib/workspace/workbenchContract";

interface UseWorkspaceTaskCenterSendRuntimeParams<
  TMessage,
  TTurn,
  TThreadItem,
  TThreadRead,
  TExecutionRuntime,
  TPendingAction,
  TSubmittedAction,
  TQueuedTurn,
> {
  activeDraftTabIdRef: MutableRefObject<string | null>;
  activeSessionIdRef?: MutableRefObject<string | null>;
  agentEntry: string;
  clearMessages: (options?: { showToast?: boolean }) => void;
  commitMaterializedDraftTab: (
    draftTabId: string,
    newSessionId: string,
    options?: {
      embedHomeSession?: boolean;
      hydrateSession?: boolean;
      preserveInput?: boolean;
      syncRoute?: boolean;
    },
  ) => void;
  currentSessionId?: string | null;
  currentTurnId: string | null;
  displayMessages: TMessage[];
  effectiveThreadItems: TThreadItem[];
  executionRuntime: TExecutionRuntime | null;
  handleSend: WorkspaceHandleSend;
  hasDisplayMessages: boolean;
  homePendingPreviewMessages: TMessage[];
  bootstrapPendingPreviewMessages: TMessage[];
  input: string;
  isPreparingSend: boolean;
  isSending: boolean;
  isTaskCenterDraftSendPending: boolean;
  layoutMode: LayoutMode;
  markNewChatRequestHandled: (requestKey: string) => void;
  markTaskCenterLocalSessionOverride: (topicId: string) => void;
  materializedSessionIdsRef: MutableRefObject<Map<string, string>>;
  materializeDraftTab: (
    draftTabId: string,
    options: { reason: "send"; commit: false },
  ) => Promise<string | null>;
  messagesLength: number;
  newChatAt?: number;
  normalizedInitialSessionId?: string | null;
  planComposerPendingActions: TPendingAction[];
  prewarmedDraftSessionIdsRef: MutableRefObject<Set<string>>;
  queuedTurns: TQueuedTurn[];
  sendRef: MutableRefObject<WorkspaceHandleSend>;
  setActiveDraftTabId: Dispatch<SetStateAction<string | null>>;
  setDetachedTopicId: Dispatch<SetStateAction<string | null>>;
  setHomePendingPreviewRequest: Dispatch<
    SetStateAction<TaskCenterDraftSendRequest | null>
  >;
  setInput: (value: string) => void;
  setTaskCenterDraftSendRequest: Dispatch<
    SetStateAction<TaskCenterDraftSendRequest | null>
  >;
  setTaskCenterDraftTabs: Dispatch<SetStateAction<TaskCenterDraftTab[]>>;
  setTransitionTopicId: Dispatch<SetStateAction<string | null>>;
  shouldRenderTaskCenterEmbeddedHome: boolean;
  shouldSuppressTaskCenterDraftContent: boolean;
  submittedActionsInFlight: TSubmittedAction[];
  taskCenterDraftSendRequest: TaskCenterDraftSendRequest | null;
  taskCenterDraftSurfaceActiveRef: MutableRefObject<boolean>;
  taskCenterHomeSurfaceState: TaskCenterHomeSurfaceState;
  taskCenterWorkspaceId?: string | null;
  threadRead: TThreadRead | null;
  turns: TTurn[];
  switchToReadySession?: (
    sessionId: string,
    options?: { forceRefresh?: boolean; allowDetachedSession?: boolean },
  ) => Promise<unknown>;
  upsertTaskCenterOpenTab: (
    topicId: string,
    workspaceIdOverride?: string | null,
  ) => void;
}

type WorkspaceTaskCenterSendRuntime<
  TMessage,
  TTurn,
  TThreadItem,
  TThreadRead,
  TExecutionRuntime,
  TPendingAction,
  TSubmittedAction,
  TQueuedTurn,
> = WorkspaceSceneSessionProjection<
  TMessage,
  TTurn,
  TThreadItem,
  TThreadRead,
  TExecutionRuntime,
  TPendingAction,
  TSubmittedAction,
  TQueuedTurn
> & {
  handleSendFromEmptyState: InputbarSendHandler;
  sceneIsRestoringSession: boolean;
  sceneLayoutMode: LayoutMode;
  sceneMessageListEmptyStateVariant: "task-center" | "none";
  sceneSessionId: string | null;
  shouldHideCurrentSessionContent: boolean;
};

export function shouldSwitchToReadyTaskCenterSession(params: {
  readySessionId: string;
  currentSessionId?: string | null;
  activeSessionId?: string | null;
}): boolean {
  const readySessionId = params.readySessionId.trim();
  if (!readySessionId) {
    return false;
  }

  return ![params.currentSessionId, params.activeSessionId]
    .map((sessionId) => sessionId?.trim() || null)
    .includes(readySessionId);
}

export function useWorkspaceTaskCenterSendRuntime<
  TMessage,
  TTurn,
  TThreadItem,
  TThreadRead,
  TExecutionRuntime,
  TPendingAction,
  TSubmittedAction,
  TQueuedTurn,
>({
  activeDraftTabIdRef,
  activeSessionIdRef,
  agentEntry,
  clearMessages,
  commitMaterializedDraftTab,
  currentSessionId,
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
  materializedSessionIdsRef,
  materializeDraftTab,
  messagesLength,
  newChatAt,
  normalizedInitialSessionId,
  planComposerPendingActions,
  prewarmedDraftSessionIdsRef,
  queuedTurns,
  sendRef,
  setActiveDraftTabId,
  setDetachedTopicId,
  setHomePendingPreviewRequest,
  setInput,
  setTaskCenterDraftSendRequest,
  setTaskCenterDraftTabs,
  setTransitionTopicId,
  shouldRenderTaskCenterEmbeddedHome,
  shouldSuppressTaskCenterDraftContent,
  submittedActionsInFlight,
  taskCenterDraftSendRequest,
  taskCenterDraftSurfaceActiveRef,
  taskCenterHomeSurfaceState,
  taskCenterWorkspaceId,
  threadRead,
  turns,
  switchToReadySession,
  upsertTaskCenterOpenTab,
}: UseWorkspaceTaskCenterSendRuntimeParams<
  TMessage,
  TTurn,
  TThreadItem,
  TThreadRead,
  TExecutionRuntime,
  TPendingAction,
  TSubmittedAction,
  TQueuedTurn
>): WorkspaceTaskCenterSendRuntime<
  TMessage,
  TTurn,
  TThreadItem,
  TThreadRead,
  TExecutionRuntime,
  TPendingAction,
  TSubmittedAction,
  TQueuedTurn
> {
  const handleNonMaterializedSessionReady = useCallback(
    (
      readySessionId: string,
      options?: { sourceDraftTabId?: string | null },
    ) => {
      if (typeof newChatAt === "number") {
        markNewChatRequestHandled(String(newChatAt));
      }
      taskCenterDraftSurfaceActiveRef.current = false;
      const sourceDraftTabId = options?.sourceDraftTabId?.trim() || null;
      if (sourceDraftTabId) {
        setTaskCenterDraftTabs((current) =>
          removeTaskCenterDraftTab(current, sourceDraftTabId),
        );
        setActiveDraftTabId((current) =>
          clearActiveTaskCenterDraftTab(current, sourceDraftTabId),
        );
      }
      setTransitionTopicId(null);
      setDetachedTopicId(null);
      upsertTaskCenterOpenTab(readySessionId, taskCenterWorkspaceId);
      markTaskCenterLocalSessionOverride(readySessionId);
      if (
        shouldSwitchToReadyTaskCenterSession({
          readySessionId,
          currentSessionId,
          activeSessionId: activeSessionIdRef?.current,
        })
      ) {
        void switchToReadySession?.(readySessionId, {
          allowDetachedSession: true,
          forceRefresh: true,
        });
      }
    },
    [
      currentSessionId,
      activeSessionIdRef,
      markNewChatRequestHandled,
      markTaskCenterLocalSessionOverride,
      newChatAt,
      setActiveDraftTabId,
      setDetachedTopicId,
      setTaskCenterDraftTabs,
      setTransitionTopicId,
      switchToReadySession,
      taskCenterDraftSurfaceActiveRef,
      taskCenterWorkspaceId,
      upsertTaskCenterOpenTab,
    ],
  );

  const handleSendFromEmptyState = useTaskCenterEmptyStateSendRuntime({
    agentEntry,
    input,
    setInput,
    activeSessionIdRef,
    activeDraftTabIdRef: activeDraftTabIdRef,
    clearMessages,
    displayMessagesLength: displayMessages.length,
    turnsLength: turns.length,
    threadItemsLength: effectiveThreadItems.length,
    hasDisplayMessages,
    handleSend,
    sessionId: currentSessionId,
    taskCenterWorkspaceId,
    setTaskCenterDraftTabs,
    setTaskCenterDraftSendRequest,
    taskCenterDraftSendRequest,
    setHomePendingPreviewRequest,
    materializedSessionIdsRef,
    prewarmedDraftSessionIdsRef,
    onNonMaterializedSessionReady: handleNonMaterializedSessionReady,
  });

  useTaskCenterDraftSendDispatchRuntime({
    taskCenterDraftSendRequest,
    setTaskCenterDraftSendRequest,
    setHomePendingPreviewRequest,
    messagesLength,
    displayMessagesLength: displayMessages.length,
    currentSessionId,
    materializedSessionIdsRef,
    prewarmedDraftSessionIdsRef,
    materializeDraftTab,
    commitMaterializedDraftTab,
    onNonMaterializedSessionReady: handleNonMaterializedSessionReady,
    restoreInput: setInput,
    sendRef,
    workspaceId: taskCenterWorkspaceId,
  });

  return {
    handleSendFromEmptyState,
    sceneIsRestoringSession: taskCenterHomeSurfaceState.isRestoringSession,
    sceneLayoutMode: shouldRenderTaskCenterEmbeddedHome ? "chat" : layoutMode,
    sceneMessageListEmptyStateVariant:
      agentEntry === "claw" &&
      !normalizedInitialSessionId &&
      !shouldRenderTaskCenterEmbeddedHome &&
      !shouldSuppressTaskCenterDraftContent
        ? "task-center"
        : "none",
    sceneSessionId: taskCenterHomeSurfaceState.sceneSessionId,
    shouldHideCurrentSessionContent:
      taskCenterHomeSurfaceState.shouldHideCurrentSessionContent,
    ...resolveWorkspaceSceneSessionProjection({
      shouldHideCurrentSessionContent:
        taskCenterHomeSurfaceState.shouldHideCurrentSessionContent,
      displayMessages,
      homePendingPreviewMessages:
        homePendingPreviewMessages.length > 0
          ? homePendingPreviewMessages
          : bootstrapPendingPreviewMessages,
      turns,
      effectiveThreadItems,
      currentTurnId,
      threadRead,
      executionRuntime,
      planComposerPendingActions,
      submittedActionsInFlight,
      queuedTurns,
      isPreparingSend,
      isTaskCenterDraftSendPending,
      isSending,
    }),
  };
}
