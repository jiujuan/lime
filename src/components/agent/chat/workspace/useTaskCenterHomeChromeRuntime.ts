import {
  useCallback,
  useEffect,
  useMemo,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { Topic } from "../hooks/agentChatShared";
import type { TaskCenterDraftSendRequest } from "../homePendingPreview";
import {
  isTaskCenterTopicSwitchPending,
  resolveTaskCenterPreviewTopicId,
} from "../utils/taskCenterTabs";
import { isTaskCenterDraftTabId } from "./agentChatWorkspaceHelpers";
import {
  resolveTaskCenterHomeChromeState,
  type TaskCenterHomeChromeState,
} from "./taskCenterSurfaceState";
import { resolveTaskCenterTopicTitle } from "./taskCenterTabProjection";

interface UseTaskCenterHomeChromeRuntimeParams {
  agentEntry: string;
  sessionId?: string | null;
  detachedTopicId?: string | null;
  transitionTopicId?: string | null;
  topicById: ReadonlyMap<string, Topic>;
  untitledTaskLabel: string;
  renamePromptLabel: string;
  renameTopic: (topicId: string, title: string) => void | Promise<void>;
  draftSurfaceActive: boolean;
  draftTabActive: boolean;
  shouldSuppressDraftContent: boolean;
  draftSendRequest: TaskCenterDraftSendRequest | null;
  normalizedInitialSessionId?: string | null;
  isHomeSessionBackgroundRecovery: boolean;
  displayMessageCount: number;
  threadItemCount: number;
  hasPendingA2UIForm: boolean;
  isPreparingSend: boolean;
  isSending: boolean;
  isHomePendingPreviewActive: boolean;
  isHomeSendStarting?: boolean;
  queuedTurnCount: number;
  hasLocalSessionOverride: boolean;
  embeddedHomeSessionIds: ReadonlySet<string>;
  isAutoRestoringSession: boolean;
  isSessionHydrating: boolean;
  shouldUseBrowserWorkspaceHomeChrome: boolean;
  harnessPanelVisible: boolean;
  setHarnessPanelVisible: Dispatch<SetStateAction<boolean>>;
  clearEmbeddedHomeSession: (sessionId: string) => void;
}

export interface TaskCenterHomeChromeRuntime extends TaskCenterHomeChromeState {
  handleRenameTaskTopic: (topicId: string) => Promise<void>;
  taskCenterPreviewTopicId: string | null;
  taskCenterSessionSwitchPending: boolean;
}

export function useTaskCenterHomeChromeRuntime({
  agentEntry,
  sessionId,
  detachedTopicId,
  transitionTopicId,
  topicById,
  untitledTaskLabel,
  renamePromptLabel,
  renameTopic,
  draftSurfaceActive,
  draftTabActive,
  shouldSuppressDraftContent,
  draftSendRequest,
  normalizedInitialSessionId,
  isHomeSessionBackgroundRecovery,
  displayMessageCount,
  threadItemCount,
  hasPendingA2UIForm,
  isPreparingSend,
  isSending,
  isHomePendingPreviewActive,
  isHomeSendStarting = false,
  queuedTurnCount,
  hasLocalSessionOverride,
  embeddedHomeSessionIds,
  isAutoRestoringSession,
  isSessionHydrating,
  shouldUseBrowserWorkspaceHomeChrome,
  harnessPanelVisible,
  setHarnessPanelVisible,
  clearEmbeddedHomeSession,
}: UseTaskCenterHomeChromeRuntimeParams): TaskCenterHomeChromeRuntime {
  const handleRenameTaskTopic = useCallback(
    async (topicId: string) => {
      if (isTaskCenterDraftTabId(topicId) || typeof window === "undefined") {
        return;
      }

      const topic = topicById.get(topicId);
      if (!topic) {
        return;
      }

      const currentTitle = resolveTaskCenterTopicTitle(
        topic.title,
        untitledTaskLabel,
      );
      const nextTitle = window.prompt(renamePromptLabel, currentTitle)?.trim();
      if (!nextTitle || nextTitle === currentTitle) {
        return;
      }

      await renameTopic(topicId, nextTitle);
    },
    [renamePromptLabel, renameTopic, topicById, untitledTaskLabel],
  );

  const taskCenterPreviewTopicId = useMemo(
    () =>
      resolveTaskCenterPreviewTopicId({
        sessionId,
        detachedTopicId,
        switchingTopicId: transitionTopicId,
      }),
    [detachedTopicId, sessionId, transitionTopicId],
  );
  const taskCenterSessionSwitchPending = useMemo(
    () =>
      isTaskCenterTopicSwitchPending({
        sessionId,
        switchingTopicId: transitionTopicId,
      }),
    [sessionId, transitionTopicId],
  );
  const homeChromeState = resolveTaskCenterHomeChromeState({
    agentEntry,
    draftSurfaceActive,
    draftTabActive,
    shouldSuppressDraftContent,
    draftSendRequest,
    sessionSwitchPending: taskCenterSessionSwitchPending,
    hasInitialSessionRoute: Boolean(normalizedInitialSessionId),
    isHomeSessionBackgroundRecovery,
    displayMessageCount,
    threadItemCount,
    hasPendingA2UIForm,
    isPreparingSend,
    isSending,
    isHomePendingPreviewActive,
    isHomeSendStarting,
    queuedTurnCount,
    hasLocalSessionOverride,
    sessionId,
    embeddedHomeSessionIds,
    isAutoRestoringSession,
    isSessionHydrating,
    shouldUseBrowserWorkspaceHomeChrome,
  });

  useEffect(() => {
    if (!sessionId || !embeddedHomeSessionIds.has(sessionId)) {
      return;
    }

    if (homeChromeState.hasHomeConversationActivity) {
      clearEmbeddedHomeSession(sessionId);
    }
  }, [
    clearEmbeddedHomeSession,
    embeddedHomeSessionIds,
    homeChromeState.hasHomeConversationActivity,
    sessionId,
  ]);

  useEffect(() => {
    if (
      !homeChromeState.suppressHomeNavbarUtilityActions ||
      !harnessPanelVisible
    ) {
      return;
    }

    setHarnessPanelVisible(false);
  }, [
    harnessPanelVisible,
    homeChromeState.suppressHomeNavbarUtilityActions,
    setHarnessPanelVisible,
  ]);

  return {
    ...homeChromeState,
    handleRenameTaskTopic,
    taskCenterPreviewTopicId,
    taskCenterSessionSwitchPending,
  };
}
