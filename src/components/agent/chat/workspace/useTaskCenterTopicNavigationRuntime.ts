import {
  startTransition,
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { Character } from "@/lib/api/memory";
import { scheduleMinimumDelayIdleTask } from "@/lib/utils/scheduleMinimumDelayIdleTask";
import type { Topic } from "../hooks/agentChatShared";
import { loadPersistedSessionWorkspaceId } from "../hooks/agentProjectStorage";
import {
  isTaskCenterDraftTabId,
  type TaskCenterDraftTab,
} from "./agentChatWorkspaceHelpers";
import {
  shouldResumeTaskSession,
  updateTaskCenterTabIdsForWorkspace,
  type TaskCenterWorkspaceTabMap,
} from "../utils/taskCenterTabs";
import { normalizeProjectId } from "../utils/topicProjectResolution";
import { rememberInitialSessionNavigationStart } from "./useWorkspaceInitialSessionNavigation";
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
        topic?.workspaceId ??
          loadPersistedSessionWorkspaceId(topicId) ??
          taskCenterWorkspaceId,
      );
      const shouldResume =
        options?.preferResume === true || shouldResumeTaskSession(topic);
      const switchOptions =
        shouldResume || options?.forceRefresh === true
          ? {
              ...(options?.forceRefresh === true ? { forceRefresh: true } : {}),
              ...(shouldResume ? { resumeSessionStartHooks: true } : {}),
            }
          : undefined;
      const wasOpenInTaskCenter =
        taskCenterOpenTabIdsRef.current.includes(topicId);
      const shouldMaintainTaskCenterTab =
        agentEntry === "claw" || agentEntry === "new-task";
      const shouldSkipActiveTopicReopen =
        topicId === activeSessionIdRef.current &&
        messagesLength > 0 &&
        activeTaskCenterDraftTabIdRef.current === null &&
        taskCenterDraftSurfaceActiveRef.current === false &&
        taskCenterDetachedTopicId === null &&
        shouldResume === false &&
        options?.forceRefresh !== true &&
        options?.preferResume !== true &&
        options?.replaceOpenTabs !== true;
      const rollbackPendingOpen = () => {
        if (!wasOpenInTaskCenter && options?.replaceOpenTabs !== true) {
          setTaskCenterOpenTabMap((currentMap) =>
            updateTaskCenterTabIdsForWorkspace(
              currentMap,
              topicWorkspaceId,
              (currentIds) =>
                currentIds.filter((currentId) => currentId !== topicId),
            ),
          );
        }
        setTaskCenterLocalSessionOverride((current) =>
          current?.sessionId === topicId ? null : current,
        );
        setTaskCenterTransitionTopicId((current) =>
          current === topicId ? null : current,
        );
      };

      if (shouldSkipActiveTopicReopen) {
        return;
      }

      taskCenterDraftSurfaceActiveRef.current = false;
      resetLocalImageWorkbenchSessionScope();
      setTaskCenterTransitionTopicId(topicId);
      setTaskCenterDetachedTopicId(null);
      setActiveTaskCenterDraftTabId(null);
      clearEntryPendingA2UI();
      if (options?.replaceOpenTabs === true) {
        replaceTaskCenterOpenTabs(topicId, topicWorkspaceId);
      } else if (shouldMaintainTaskCenterTab) {
        upsertTaskCenterOpenTab(topicId, topicWorkspaceId);
      }
      markTaskCenterLocalSessionOverride(topicId);
      rememberInitialSessionNavigationStart(topicId);
      const switchResult = await switchTopic(topicId, switchOptions);
      if (switchResult === "busy") {
        scheduleMinimumDelayIdleTask(
          () => {
            void switchTopic(topicId, switchOptions)
              .then((retryResult) => {
                if (retryResult !== "success" && retryResult !== "deferred") {
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
      if (switchResult !== "success" && switchResult !== "deferred") {
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
      taskCenterWorkspaceId,
      topicById,
      upsertTaskCenterOpenTab,
    ],
  );

  const handleOpenArchivedTaskTopic = useCallback(
    async (topicId: string) => {
      taskCenterDraftSurfaceActiveRef.current = false;
      resetLocalImageWorkbenchSessionScope();
      setActiveTaskCenterDraftTabId(null);
      setTaskCenterDetachedTopicId(topicId);
      setTaskCenterTransitionTopicId(topicId);
      clearEntryPendingA2UI();
      markTaskCenterLocalSessionOverride(topicId);
      rememberInitialSessionNavigationStart(topicId);
      const switchResult = await switchTopic(topicId, {
        allowDetachedSession: true,
      });
      if (switchResult === "success" || switchResult === "deferred") {
        return;
      }

      setTaskCenterLocalSessionOverride((current) =>
        current?.sessionId === topicId ? null : current,
      );
      setTaskCenterTransitionTopicId((current) =>
        current === topicId ? null : current,
      );
      setTaskCenterDetachedTopicId((current) =>
        current === topicId ? null : current,
      );
    },
    [
      clearEntryPendingA2UI,
      markTaskCenterLocalSessionOverride,
      resetLocalImageWorkbenchSessionScope,
      setActiveTaskCenterDraftTabId,
      setTaskCenterDetachedTopicId,
      setTaskCenterLocalSessionOverride,
      setTaskCenterTransitionTopicId,
      switchTopic,
      taskCenterDraftSurfaceActiveRef,
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
        const remainingDraftTabs = taskCenterDraftTabsRef.current.filter(
          (tab) => tab.id !== topicId,
        );
        setTaskCenterDraftTabs(remainingDraftTabs);
        if (activeTaskCenterDraftTabIdRef.current === topicId) {
          const fallbackDraftId = remainingDraftTabs[0]?.id ?? null;
          if (fallbackDraftId) {
            handleSelectTaskCenterDraftTab(fallbackDraftId);
            return;
          }

          setActiveTaskCenterDraftTabId(null);
          setInput("");
          const fallbackTopicId = taskCenterOpenTabIdsRef.current[0] ?? null;
          if (fallbackTopicId) {
            await handleSwitchTaskTopic(fallbackTopicId);
          }
        }
        return;
      }

      const currentIds = taskCenterOpenTabIdsRef.current;
      const currentIndex = currentIds.indexOf(topicId);
      const remainingIds = currentIds.filter((item) => item !== topicId);
      const isActiveTab = sessionId === topicId;

      if (taskCenterDetachedTopicId === topicId) {
        setTaskCenterDetachedTopicId(null);
      }
      if (taskCenterTransitionTopicId === topicId) {
        setTaskCenterTransitionTopicId(null);
      }
      clearTaskCenterEmbeddedHomeSession(topicId);

      setTaskCenterOpenTabMap((currentMap) =>
        updateTaskCenterTabIdsForWorkspace(
          currentMap,
          taskCenterWorkspaceId,
          remainingIds,
        ),
      );

      if (isActiveTab) {
        const fallbackId =
          remainingIds[currentIndex] ??
          remainingIds[currentIndex - 1] ??
          remainingIds[0] ??
          null;

        if (fallbackId) {
          await handleSwitchTaskTopic(fallbackId);
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
      taskCenterDraftTabsRef,
      taskCenterOpenTabIdsRef,
      taskCenterTransitionTopicId,
      taskCenterWorkspaceId,
    ],
  );

  return {
    handleCloseTaskCenterTab,
    handleOpenArchivedTaskTopic,
    handleOpenTaskTopic,
    handleSelectTaskCenterDraftTab,
    handleSwitchTaskTopic,
  };
}
