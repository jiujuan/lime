import {
  startTransition,
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { Character } from "@/lib/api/projectMemory";
import { scheduleMinimumDelayIdleTask } from "@/lib/utils/scheduleMinimumDelayIdleTask";
import type { Topic } from "../hooks/agentChatShared";
import { loadPersistedSessionWorkspaceId } from "../hooks/agentProjectStorage";
import {
  isTaskCenterDraftTabId,
  type TaskCenterDraftTab,
} from "./agentChatWorkspaceHelpers";
import {
  clearTaskCenterLocalSessionOverrideForTopic,
  clearTaskCenterTransitionTopicForTopic,
  isTaskCenterTopicSwitchSuccess,
  resolveTaskCenterTopicClosePlan,
  resolveTaskCenterTopicSwitchOptions,
  rollbackTaskCenterOpenTabMapForFailedSwitch,
  shouldSkipTaskCenterActiveTopicReopen,
  shouldResumeTaskSession,
  updateTaskCenterTabIdsForWorkspace,
  type TaskCenterWorkspaceTabMap,
} from "../utils/taskCenterTabs";
import { resolveTaskCenterDraftClosePlan } from "./taskCenterDraftTabs";
import { normalizeProjectId } from "../utils/topicProjectResolution";
import type { TaskCenterDraftSendRequest } from "../homePendingPreview";

type AgentEntry = "new-task" | "claw";

interface TaskCenterTopicSwitchOptions {
  forceRefresh?: boolean;
  resumeSessionStartHooks?: boolean;
  allowDetachedSession?: boolean;
}

interface UseTaskCenterTopicNavigationRuntimeParams {
  activeSessionIdRef: MutableRefObject<string | null>;
  activeTaskCenterDraftTabIdRef: MutableRefObject<string | null>;
  agentEntry: AgentEntry;
  clearEntryPendingA2UI: () => void;
  clearMessages: (options?: { showToast?: boolean }) => void;
  clearTaskCenterEmbeddedHomeSession: (topicId: string) => void;
  messagesLength: number;
  openTaskCenterDraftTab: () => string;
  replaceTaskCenterOpenTabs: (
    topicId: string,
    workspaceIdOverride?: string | null,
  ) => void;
  resetLocalImageWorkbenchSessionScope: () => void;
  resetTopicLocalState: () => void;
  sessionId?: string | null;
  setActiveTaskCenterDraftTabId: Dispatch<SetStateAction<string | null>>;
  setHomePendingPreviewRequest: Dispatch<
    SetStateAction<TaskCenterDraftSendRequest | null>
  >;
  setInput: Dispatch<SetStateAction<string>>;
  setMentionedCharacters: Dispatch<SetStateAction<Character[]>>;
  setSelectedText: Dispatch<SetStateAction<string>>;
  setTaskCenterDetachedTopicId: Dispatch<SetStateAction<string | null>>;
  setTaskCenterDraftSendRequest: Dispatch<
    SetStateAction<TaskCenterDraftSendRequest | null>
  >;
  setTaskCenterDraftTabs: Dispatch<SetStateAction<TaskCenterDraftTab[]>>;
  setTaskCenterLocalSessionOverride: Dispatch<
    SetStateAction<{ sessionId: string; routeSessionId: string | null } | null>
  >;
  setTaskCenterOpenTabMap: Dispatch<SetStateAction<TaskCenterWorkspaceTabMap>>;
  setTaskCenterTransitionTopicId: Dispatch<SetStateAction<string | null>>;
  switchTopic: (
    topicId: string,
    options?: TaskCenterTopicSwitchOptions,
  ) => Promise<unknown>;
  taskCenterDetachedTopicId: string | null;
  taskCenterDraftSurfaceActiveRef: MutableRefObject<boolean>;
  taskCenterDraftTabsRef: MutableRefObject<TaskCenterDraftTab[]>;
  taskCenterOpenTabIdsRef: MutableRefObject<string[]>;
  taskCenterTransitionTopicId: string | null;
  taskCenterWorkspaceId?: string | null;
  topicById: ReadonlyMap<string, Topic>;
  upsertTaskCenterOpenTab: (
    topicId: string,
    workspaceIdOverride?: string | null,
  ) => void;
  markTaskCenterLocalSessionOverride: (topicId: string) => void;
}

export function useTaskCenterTopicNavigationRuntime({
  activeSessionIdRef,
  activeTaskCenterDraftTabIdRef,
  agentEntry,
  clearEntryPendingA2UI,
  clearMessages,
  clearTaskCenterEmbeddedHomeSession,
  messagesLength,
  openTaskCenterDraftTab,
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
  taskCenterDraftTabsRef,
  taskCenterOpenTabIdsRef,
  taskCenterTransitionTopicId,
  taskCenterWorkspaceId,
  topicById,
  upsertTaskCenterOpenTab,
  markTaskCenterLocalSessionOverride,
}: UseTaskCenterTopicNavigationRuntimeParams) {
  const handleOpenTaskTopic = useCallback(
    async (
      topicId: string,
      options?: {
        preferResume?: boolean;
        forceRefresh?: boolean;
        replaceOpenTabs?: boolean;
      },
    ) => {
      const topic = topicById.get(topicId);
      const topicWorkspaceId = normalizeProjectId(
        topic?.workspaceId ?? loadPersistedSessionWorkspaceId(topicId),
      );
      const isDetachedTopic = !topicWorkspaceId;
      const shouldResume =
        options?.preferResume === true || shouldResumeTaskSession(topic);
      const switchOptions = resolveTaskCenterTopicSwitchOptions({
        shouldResume,
        forceRefresh: options?.forceRefresh,
        allowDetachedSession: isDetachedTopic,
      });
      const wasOpenInTaskCenter =
        taskCenterOpenTabIdsRef.current.includes(topicId);
      const shouldMaintainTaskCenterTab =
        agentEntry === "claw" || agentEntry === "new-task";
      const shouldSkipActiveTopicReopen = shouldSkipTaskCenterActiveTopicReopen(
        {
          topicId,
          activeSessionId: activeSessionIdRef.current,
          messagesLength,
          activeDraftTabId: activeTaskCenterDraftTabIdRef.current,
          draftSurfaceActive: taskCenterDraftSurfaceActiveRef.current,
          detachedTopicId: taskCenterDetachedTopicId,
          shouldResume,
          forceRefresh: options?.forceRefresh,
          preferResume: options?.preferResume,
          replaceOpenTabs: options?.replaceOpenTabs,
        },
      );
      const rollbackPendingOpen = () => {
        setTaskCenterOpenTabMap((currentMap) =>
          rollbackTaskCenterOpenTabMapForFailedSwitch({
            currentMap,
            workspaceId: topicWorkspaceId,
            topicId,
            wasOpenInTaskCenter,
            replaceOpenTabs: options?.replaceOpenTabs,
          }),
        );
        setTaskCenterLocalSessionOverride((current) =>
          clearTaskCenterLocalSessionOverrideForTopic(current, topicId),
        );
        setTaskCenterTransitionTopicId((current) =>
          clearTaskCenterTransitionTopicForTopic(current, topicId),
        );
      };

      if (shouldSkipActiveTopicReopen) {
        return;
      }

      taskCenterDraftSurfaceActiveRef.current = false;
      clearTaskCenterEmbeddedHomeSession(topicId);
      resetLocalImageWorkbenchSessionScope();
      setTaskCenterTransitionTopicId(topicId);
      setTaskCenterDetachedTopicId(isDetachedTopic ? topicId : null);
      setActiveTaskCenterDraftTabId(null);
      clearEntryPendingA2UI();
      if (options?.replaceOpenTabs === true) {
        replaceTaskCenterOpenTabs(topicId, topicWorkspaceId);
      } else if (shouldMaintainTaskCenterTab) {
        upsertTaskCenterOpenTab(topicId, topicWorkspaceId);
      }
      markTaskCenterLocalSessionOverride(topicId);
      const switchResult = await switchTopic(topicId, switchOptions);
      if (switchResult === "busy") {
        scheduleMinimumDelayIdleTask(
          () => {
            void switchTopic(topicId, switchOptions)
              .then((retryResult) => {
                if (!isTaskCenterTopicSwitchSuccess(retryResult)) {
                  rollbackPendingOpen();
                }
              })
              .catch(() => {
                rollbackPendingOpen();
              });
          },
          {
            minimumDelayMs: 120,
            idleTimeoutMs: 600,
          },
        );
        return;
      }
      if (!isTaskCenterTopicSwitchSuccess(switchResult)) {
        rollbackPendingOpen();
        return;
      }
      if (options?.replaceOpenTabs === true) {
        replaceTaskCenterOpenTabs(topicId, topicWorkspaceId);
      } else if (shouldMaintainTaskCenterTab) {
        upsertTaskCenterOpenTab(topicId, topicWorkspaceId);
      }
    },
    [
      activeSessionIdRef,
      activeTaskCenterDraftTabIdRef,
      agentEntry,
      clearEntryPendingA2UI,
      clearTaskCenterEmbeddedHomeSession,
      markTaskCenterLocalSessionOverride,
      messagesLength,
      replaceTaskCenterOpenTabs,
      resetLocalImageWorkbenchSessionScope,
      setActiveTaskCenterDraftTabId,
      setTaskCenterDetachedTopicId,
      setTaskCenterLocalSessionOverride,
      setTaskCenterOpenTabMap,
      setTaskCenterTransitionTopicId,
      switchTopic,
      taskCenterDetachedTopicId,
      taskCenterDraftSurfaceActiveRef,
      taskCenterOpenTabIdsRef,
      topicById,
      upsertTaskCenterOpenTab,
    ],
  );

  const handleSelectTaskCenterDraftTab = useCallback(
    (draftTabId: string) => {
      const draft = taskCenterDraftTabsRef.current.find(
        (tab) => tab.id === draftTabId,
      );
      if (!draft) {
        return;
      }

      taskCenterDraftSurfaceActiveRef.current = true;
      resetLocalImageWorkbenchSessionScope();
      clearMessages({ showToast: false });
      startTransition(() => {
        setTaskCenterTransitionTopicId(null);
        setTaskCenterDetachedTopicId(null);
        setActiveTaskCenterDraftTabId(draftTabId);
        setTaskCenterDraftSendRequest(null);
        setHomePendingPreviewRequest(null);
        resetTopicLocalState();
        setInput("");
        setSelectedText("");
        setMentionedCharacters([]);
      });
    },
    [
      clearMessages,
      resetLocalImageWorkbenchSessionScope,
      resetTopicLocalState,
      setActiveTaskCenterDraftTabId,
      setHomePendingPreviewRequest,
      setInput,
      setMentionedCharacters,
      setSelectedText,
      setTaskCenterDetachedTopicId,
      setTaskCenterDraftSendRequest,
      setTaskCenterTransitionTopicId,
      taskCenterDraftSurfaceActiveRef,
      taskCenterDraftTabsRef,
    ],
  );

  const handleSwitchTaskTopic = useCallback(
    async (topicId: string) => {
      if (isTaskCenterDraftTabId(topicId)) {
        handleSelectTaskCenterDraftTab(topicId);
        return;
      }

      await handleOpenTaskTopic(topicId);
    },
    [handleOpenTaskTopic, handleSelectTaskCenterDraftTab],
  );

  const handleCloseTaskCenterTab = useCallback(
    async (topicId: string) => {
      if (isTaskCenterDraftTabId(topicId)) {
        const closePlan = resolveTaskCenterDraftClosePlan({
          closingDraftTabId: topicId,
          currentDraftTabs: taskCenterDraftTabsRef.current,
          activeDraftTabId: activeTaskCenterDraftTabIdRef.current,
          openTopicIds: taskCenterOpenTabIdsRef.current,
        });
        setTaskCenterDraftTabs(closePlan.remainingDraftTabs);
        if (closePlan.action === "selectDraft") {
          handleSelectTaskCenterDraftTab(closePlan.fallbackDraftTabId);
          return;
        }
        if (closePlan.action === "switchTopic") {
          taskCenterDraftSurfaceActiveRef.current = false;
          setActiveTaskCenterDraftTabId(null);
          setInput("");
          await handleSwitchTaskTopic(closePlan.fallbackTopicId);
          return;
        }
        if (closePlan.action === "clearActiveDraft") {
          taskCenterDraftSurfaceActiveRef.current = false;
          setActiveTaskCenterDraftTabId(null);
          setInput("");
        }
        return;
      }

      const closePlan = resolveTaskCenterTopicClosePlan({
        closingTopicId: topicId,
        currentOpenTabIds: taskCenterOpenTabIdsRef.current,
        sessionId,
        detachedTopicId: taskCenterDetachedTopicId,
        transitionTopicId: taskCenterTransitionTopicId,
      });

      if (closePlan.shouldClearDetachedTopic) {
        setTaskCenterDetachedTopicId(null);
      }
      if (closePlan.shouldClearTransitionTopic) {
        setTaskCenterTransitionTopicId(null);
      }
      clearTaskCenterEmbeddedHomeSession(topicId);

      setTaskCenterOpenTabMap((currentMap) =>
        updateTaskCenterTabIdsForWorkspace(
          currentMap,
          taskCenterWorkspaceId,
          closePlan.remainingIds,
        ),
      );

      if (closePlan.isActiveTab) {
        if (closePlan.fallbackTopicId) {
          await handleSwitchTaskTopic(closePlan.fallbackTopicId);
        } else {
          openTaskCenterDraftTab();
        }
      }
    },
    [
      activeTaskCenterDraftTabIdRef,
      clearTaskCenterEmbeddedHomeSession,
      handleSelectTaskCenterDraftTab,
      handleSwitchTaskTopic,
      openTaskCenterDraftTab,
      sessionId,
      setActiveTaskCenterDraftTabId,
      setInput,
      setTaskCenterDetachedTopicId,
      setTaskCenterDraftTabs,
      setTaskCenterOpenTabMap,
      setTaskCenterTransitionTopicId,
      taskCenterDetachedTopicId,
      taskCenterDraftSurfaceActiveRef,
      taskCenterDraftTabsRef,
      taskCenterOpenTabIdsRef,
      taskCenterTransitionTopicId,
      taskCenterWorkspaceId,
    ],
  );

  return {
    handleCloseTaskCenterTab,
    handleOpenTaskTopic,
    handleSelectTaskCenterDraftTab,
    handleSwitchTaskTopic,
  };
}
