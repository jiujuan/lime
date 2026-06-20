import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { Topic } from "../hooks/agentChatShared";
import { loadPersisted, savePersisted } from "../hooks/agentChatStorage";
import type { TaskCenterDraftSendRequest } from "../homePendingPreview";
import {
  applyTaskCenterRouteTabSyncToMap,
  initializeTaskCenterOpenTabMap,
  isTaskCenterAgentEntry,
  MAX_TASK_CENTER_OPEN_TABS,
  normalizeTaskCenterWorkspaceTabMap,
  reconcileTaskCenterTabIds,
  replaceTaskCenterTabIdsForWorkspace,
  resolveTaskCenterReconcileCurrentTopicId,
  resolveTaskCenterRouteTabSyncIntent,
  resolveTaskCenterTabIdsForWorkspace,
  shouldRespectTaskCenterLocalSessionOverride,
  shouldWaitForTaskCenterInitialSessionTopic,
  TASK_CENTER_OPEN_TAB_IDS_STORAGE_KEY,
  updateTaskCenterTabIdsForWorkspace,
  type TaskCenterLocalSessionOverride,
  type TaskCenterWorkspaceTabMap,
} from "../utils/taskCenterTabs";
import type { AgentChatWorkspaceProps } from "../agentChatWorkspaceContract";
import { normalizeProjectId } from "../utils/topicProjectResolution";
import type { TaskCenterDraftTab } from "./agentChatWorkspaceHelpers";

type AgentEntry = AgentChatWorkspaceProps["agentEntry"] | null;

function resolveTaskCenterTabWorkspaceId(
  workspaceIdOverride: string | null | undefined,
  fallbackWorkspaceId: string | null | undefined,
): string | null {
  return normalizeProjectId(workspaceIdOverride) ?? fallbackWorkspaceId ?? null;
}

interface UseTaskCenterTabSessionRuntimeParams {
  agentEntry?: AgentEntry;
  normalizedInitialSessionId?: string | null;
  sessionId?: string | null;
  taskCenterDraftSurfaceActiveRef: MutableRefObject<boolean>;
  taskCenterWorkspaceId?: string | null;
  topicById: ReadonlyMap<string, Topic>;
  topics: Topic[];
  setActiveTaskCenterDraftTabId: Dispatch<SetStateAction<string | null>>;
  setHomePendingPreviewRequest: Dispatch<
    SetStateAction<TaskCenterDraftSendRequest | null>
  >;
  setTaskCenterDraftSendRequest: Dispatch<
    SetStateAction<TaskCenterDraftSendRequest | null>
  >;
  setTaskCenterDraftTabs: Dispatch<SetStateAction<TaskCenterDraftTab[]>>;
}

export interface TaskCenterTabSessionRuntimeState {
  clearTaskCenterEmbeddedHomeSession: (topicId: string) => void;
  isTaskCenterEntry: boolean;
  markTaskCenterEmbeddedHomeSession: (topicId: string) => void;
  markTaskCenterLocalSessionOverride: (topicId: string) => void;
  replaceTaskCenterOpenTabs: (
    topicId: string,
    workspaceIdOverride?: string | null,
  ) => void;
  setTaskCenterDetachedTopicId: Dispatch<SetStateAction<string | null>>;
  setTaskCenterLocalSessionOverride: Dispatch<
    SetStateAction<TaskCenterLocalSessionOverride | null>
  >;
  setTaskCenterOpenTabMap: Dispatch<SetStateAction<TaskCenterWorkspaceTabMap>>;
  setTaskCenterTransitionTopicId: Dispatch<SetStateAction<string | null>>;
  taskCenterDetachedTopicId: string | null;
  taskCenterEmbeddedHomeSessionIds: Set<string>;
  taskCenterFallbackRestoreRef: MutableRefObject<{
    topicId: string;
    startedAt: number;
  } | null>;
  taskCenterLocalSessionOverride: TaskCenterLocalSessionOverride | null;
  taskCenterOpenTabIds: string[];
  taskCenterOpenTabIdsRef: MutableRefObject<string[]>;
  taskCenterTransitionTopicId: string | null;
  upsertTaskCenterOpenTab: (
    topicId: string,
    workspaceIdOverride?: string | null,
  ) => void;
}

export function useTaskCenterTabSessionRuntime({
  agentEntry,
  normalizedInitialSessionId,
  sessionId,
  taskCenterDraftSurfaceActiveRef,
  taskCenterWorkspaceId,
  topicById,
  topics,
  setActiveTaskCenterDraftTabId,
  setHomePendingPreviewRequest,
  setTaskCenterDraftSendRequest,
  setTaskCenterDraftTabs,
}: UseTaskCenterTabSessionRuntimeParams): TaskCenterTabSessionRuntimeState {
  const [taskCenterOpenTabMap, setTaskCenterOpenTabMap] =
    useState<TaskCenterWorkspaceTabMap>(() => {
      const initialTabMap = normalizeTaskCenterWorkspaceTabMap(
        loadPersisted<unknown>(TASK_CENTER_OPEN_TAB_IDS_STORAGE_KEY, []),
        {
          workspaceId: taskCenterWorkspaceId,
        },
      );

      return initializeTaskCenterOpenTabMap({
        initialTabMap,
        agentEntry,
        workspaceId: taskCenterWorkspaceId,
        normalizedInitialSessionId,
      });
    });
  const [taskCenterDetachedTopicId, setTaskCenterDetachedTopicId] = useState<
    string | null
  >(null);
  const [taskCenterTransitionTopicId, setTaskCenterTransitionTopicId] =
    useState<string | null>(null);
  const [
    taskCenterEmbeddedHomeSessionIds,
    setTaskCenterEmbeddedHomeSessionIds,
  ] = useState<Set<string>>(() => new Set());
  const [taskCenterLocalSessionOverride, setTaskCenterLocalSessionOverride] =
    useState<TaskCenterLocalSessionOverride | null>(null);
  const taskCenterOpenTabIds = useMemo(
    () =>
      resolveTaskCenterTabIdsForWorkspace(
        taskCenterOpenTabMap,
        taskCenterWorkspaceId,
      ),
    [taskCenterOpenTabMap, taskCenterWorkspaceId],
  );
  const taskCenterOpenTabIdsRef = useRef(taskCenterOpenTabIds);
  const taskCenterFallbackRestoreRef = useRef<{
    topicId: string;
    startedAt: number;
  } | null>(null);
  const taskCenterRouteTabSyncRef = useRef<string | null>(null);
  const isTaskCenterEntry = isTaskCenterAgentEntry(agentEntry);
  const shouldRespectTaskCenterLocalSession =
    shouldRespectTaskCenterLocalSessionOverride({
      localSessionOverride: taskCenterLocalSessionOverride,
      normalizedInitialSessionId,
      sessionId,
    });

  useEffect(() => {
    taskCenterOpenTabIdsRef.current = taskCenterOpenTabIds;
  }, [taskCenterOpenTabIds]);

  useEffect(() => {
    if (!isTaskCenterEntry) {
      taskCenterDraftSurfaceActiveRef.current = false;
      setTaskCenterTransitionTopicId(null);
      return;
    }

    if (
      taskCenterTransitionTopicId &&
      taskCenterTransitionTopicId === sessionId
    ) {
      setTaskCenterTransitionTopicId(null);
    }
  }, [
    isTaskCenterEntry,
    sessionId,
    taskCenterDraftSurfaceActiveRef,
    taskCenterTransitionTopicId,
  ]);

  useEffect(() => {
    if (!isTaskCenterEntry) {
      setTaskCenterDetachedTopicId(null);
      setTaskCenterEmbeddedHomeSessionIds((current) =>
        current.size > 0 ? new Set<string>() : current,
      );
      setTaskCenterDraftTabs((current) => (current.length > 0 ? [] : current));
      setActiveTaskCenterDraftTabId(null);
      taskCenterDraftSurfaceActiveRef.current = false;
      if (agentEntry !== "new-task") {
        setTaskCenterDraftSendRequest(null);
        setHomePendingPreviewRequest(null);
        setTaskCenterLocalSessionOverride(null);
      }
      return;
    }

    if (!sessionId || sessionId !== normalizedInitialSessionId) {
      return;
    }

    const hasTopicMatch = topicById.has(sessionId);
    if (hasTopicMatch) {
      setTaskCenterDetachedTopicId((current) =>
        current === sessionId ? null : current,
      );
      return;
    }

    setTaskCenterDetachedTopicId((current) =>
      current === sessionId ? current : sessionId,
    );
  }, [
    agentEntry,
    isTaskCenterEntry,
    normalizedInitialSessionId,
    sessionId,
    setActiveTaskCenterDraftTabId,
    setHomePendingPreviewRequest,
    setTaskCenterDraftSendRequest,
    setTaskCenterDraftTabs,
    taskCenterDraftSurfaceActiveRef,
    topicById,
  ]);

  useEffect(() => {
    const syncIntent = resolveTaskCenterRouteTabSyncIntent({
      agentEntry,
      workspaceId: taskCenterWorkspaceId,
      normalizedInitialSessionId,
      lastSyncedInitialSessionId: taskCenterRouteTabSyncRef.current,
      shouldRespectLocalSession: shouldRespectTaskCenterLocalSession,
    });
    if (!syncIntent.shouldSync) {
      return;
    }

    taskCenterRouteTabSyncRef.current = syncIntent.nextRouteSyncSessionId;
    if (syncIntent.shouldClearActiveDraft) {
      setActiveTaskCenterDraftTabId(null);
    }
    if (syncIntent.shouldClearTransitionAndDetached) {
      setTaskCenterTransitionTopicId(null);
      setTaskCenterDetachedTopicId(null);
    }
    setTaskCenterOpenTabMap((currentMap) =>
      applyTaskCenterRouteTabSyncToMap({
        currentMap,
        workspaceId: taskCenterWorkspaceId,
        normalizedInitialSessionId,
        shouldRespectLocalSession: shouldRespectTaskCenterLocalSession,
      }),
    );
  }, [
    agentEntry,
    normalizedInitialSessionId,
    setActiveTaskCenterDraftTabId,
    shouldRespectTaskCenterLocalSession,
    taskCenterWorkspaceId,
  ]);

  useEffect(() => {
    if (
      !isTaskCenterEntry ||
      !taskCenterWorkspaceId ||
      !normalizedInitialSessionId ||
      normalizedInitialSessionId === sessionId ||
      shouldRespectTaskCenterLocalSession
    ) {
      return;
    }

    setTaskCenterTransitionTopicId((current) =>
      current === normalizedInitialSessionId
        ? current
        : normalizedInitialSessionId,
    );
    setTaskCenterDetachedTopicId(null);
  }, [
    isTaskCenterEntry,
    normalizedInitialSessionId,
    sessionId,
    shouldRespectTaskCenterLocalSession,
    taskCenterWorkspaceId,
  ]);

  useEffect(() => {
    if (!isTaskCenterEntry || !taskCenterWorkspaceId) {
      return;
    }

    const hasInitialSessionTopic = normalizedInitialSessionId
      ? topicById.has(normalizedInitialSessionId)
      : false;
    if (
      shouldWaitForTaskCenterInitialSessionTopic({
        normalizedInitialSessionId,
        hasInitialSessionTopic,
      })
    ) {
      return;
    }

    setTaskCenterOpenTabMap((currentMap) => {
      const nextIds = reconcileTaskCenterTabIds({
        existingIds: resolveTaskCenterTabIdsForWorkspace(
          currentMap,
          taskCenterWorkspaceId,
        ),
        topics,
        currentTopicId: resolveTaskCenterReconcileCurrentTopicId({
          normalizedInitialSessionId,
          sessionId,
          shouldRespectLocalSession: shouldRespectTaskCenterLocalSession,
          localSessionOverride: taskCenterLocalSessionOverride,
          detachedTopicId: taskCenterDetachedTopicId,
        }),
      });
      return updateTaskCenterTabIdsForWorkspace(
        currentMap,
        taskCenterWorkspaceId,
        nextIds,
      );
    });
  }, [
    isTaskCenterEntry,
    normalizedInitialSessionId,
    sessionId,
    shouldRespectTaskCenterLocalSession,
    taskCenterDetachedTopicId,
    taskCenterLocalSessionOverride,
    taskCenterWorkspaceId,
    topicById,
    topics,
  ]);

  useEffect(() => {
    if (agentEntry !== "claw" && agentEntry !== "new-task") {
      return;
    }

    savePersisted(TASK_CENTER_OPEN_TAB_IDS_STORAGE_KEY, taskCenterOpenTabMap);
  }, [agentEntry, taskCenterOpenTabMap]);

  const upsertTaskCenterOpenTab = useCallback(
    (topicId: string, workspaceIdOverride?: string | null) => {
      const targetWorkspaceId = resolveTaskCenterTabWorkspaceId(
        workspaceIdOverride,
        taskCenterWorkspaceId,
      );
      if (!targetWorkspaceId) {
        return;
      }

      setTaskCenterOpenTabMap((currentMap) =>
        updateTaskCenterTabIdsForWorkspace(
          currentMap,
          targetWorkspaceId,
          (currentIds) =>
            [topicId, ...currentIds.filter((item) => item !== topicId)].slice(
              0,
              MAX_TASK_CENTER_OPEN_TABS,
            ),
        ),
      );
    },
    [taskCenterWorkspaceId],
  );

  const replaceTaskCenterOpenTabs = useCallback(
    (topicId: string, workspaceIdOverride?: string | null) => {
      const targetWorkspaceId = resolveTaskCenterTabWorkspaceId(
        workspaceIdOverride,
        taskCenterWorkspaceId,
      );
      if (!targetWorkspaceId) {
        return;
      }

      setTaskCenterOpenTabMap((currentMap) =>
        replaceTaskCenterTabIdsForWorkspace(
          currentMap,
          targetWorkspaceId,
          topicId,
        ),
      );
    },
    [taskCenterWorkspaceId],
  );

  const markTaskCenterEmbeddedHomeSession = useCallback((topicId: string) => {
    setTaskCenterEmbeddedHomeSessionIds((current) => {
      if (current.has(topicId)) {
        return current;
      }

      const next = new Set(current);
      next.add(topicId);
      return next;
    });
  }, []);

  const markTaskCenterLocalSessionOverride = useCallback(
    (topicId: string) => {
      setTaskCenterLocalSessionOverride({
        sessionId: topicId,
        routeSessionId: normalizedInitialSessionId ?? null,
      });
    },
    [normalizedInitialSessionId],
  );

  const clearTaskCenterEmbeddedHomeSession = useCallback((topicId: string) => {
    setTaskCenterEmbeddedHomeSessionIds((current) => {
      if (!current.has(topicId)) {
        return current;
      }

      const next = new Set(current);
      next.delete(topicId);
      return next;
    });
  }, []);

  return {
    clearTaskCenterEmbeddedHomeSession,
    isTaskCenterEntry,
    markTaskCenterEmbeddedHomeSession,
    markTaskCenterLocalSessionOverride,
    replaceTaskCenterOpenTabs,
    setTaskCenterDetachedTopicId,
    setTaskCenterLocalSessionOverride,
    setTaskCenterOpenTabMap,
    setTaskCenterTransitionTopicId,
    taskCenterDetachedTopicId,
    taskCenterEmbeddedHomeSessionIds,
    taskCenterFallbackRestoreRef,
    taskCenterLocalSessionOverride,
    taskCenterOpenTabIds,
    taskCenterOpenTabIdsRef,
    taskCenterTransitionTopicId,
    upsertTaskCenterOpenTab,
  };
}
