import { useCallback, useEffect, useRef, useState } from "react";
import {
  isLegacyDefaultProjectId,
  normalizeProjectId,
} from "../utils/topicProjectResolution";
import {
  LAST_PROJECT_ID_KEY,
  loadPersistedSessionWorkspaceId,
  loadPersistedProjectId,
  savePersistedProjectId,
} from "./agentProjectStorage";

interface PendingTopicSwitchState {
  topicId: string;
  targetProjectId: string;
  forceRefresh?: boolean;
  resumeSessionStartHooks?: boolean;
  allowDetachedSession?: boolean;
}

interface UseWorkspaceProjectSelectionOptions {
  externalProjectId?: string | null;
  initialSessionId?: string | null;
  newChatAt?: number;
  storageKey?: string;
}

export type WorkspaceProjectSelectionSource =
  | "external"
  | "initial-session"
  | "remembered"
  | "manual"
  | "topic-switch"
  | "none";

export function useWorkspaceProjectSelection(
  options: UseWorkspaceProjectSelectionOptions = {},
) {
  const {
    externalProjectId,
    initialSessionId,
    newChatAt,
    storageKey = LAST_PROJECT_ID_KEY,
  } = options;
  const normalizedExternalProjectId = isLegacyDefaultProjectId(
    externalProjectId,
  )
    ? null
    : normalizeProjectId(externalProjectId);
  const normalizedInitialSessionId =
    typeof initialSessionId === "string" && initialSessionId.trim().length > 0
      ? initialSessionId.trim()
      : null;
  const loadInitialSessionProjectId = useCallback(
    () =>
      normalizedInitialSessionId
        ? loadPersistedSessionWorkspaceId(normalizedInitialSessionId)
        : null,
    [normalizedInitialSessionId],
  );
  const loadRememberedProjectId = useCallback(() => {
    const rememberedProjectId = loadPersistedProjectId(storageKey);
    return isLegacyDefaultProjectId(rememberedProjectId)
      ? null
      : rememberedProjectId;
  }, [storageKey]);
  const resolveInitialSelection = useCallback((): {
    projectId: string | null;
    source: Exclude<WorkspaceProjectSelectionSource, "external">;
  } => {
    const initialSessionProjectId = loadInitialSessionProjectId();
    if (initialSessionProjectId) {
      return {
        projectId: initialSessionProjectId,
        source: "initial-session",
      };
    }

    const rememberedProjectId = loadRememberedProjectId();
    if (rememberedProjectId) {
      return {
        projectId: rememberedProjectId,
        source: "remembered",
      };
    }

    return {
      projectId: null,
      source: "none",
    };
  }, [loadInitialSessionProjectId, loadRememberedProjectId]);
  const [internalProjectId, setInternalProjectId] = useState<string | null>(
    () => normalizedExternalProjectId ?? resolveInitialSelection().projectId,
  );
  const [internalProjectSelectionSource, setInternalProjectSelectionSource] =
    useState<Exclude<WorkspaceProjectSelectionSource, "external">>(() =>
      normalizedExternalProjectId ? "none" : resolveInitialSelection().source,
    );
  const handledNewChatRequestRef = useRef<string | null>(null);
  const pendingTopicSwitchRef = useRef<PendingTopicSwitchState | null>(null);
  const isResolvingTopicProjectRef = useRef(false);

  const incomingNewChatRequestKey =
    typeof newChatAt === "number" ? String(newChatAt) : null;
  const hasExplicitInitialSession =
    typeof initialSessionId === "string" && initialSessionId.trim().length > 0;
  const shouldDisableSessionRestore =
    incomingNewChatRequestKey !== null || hasExplicitInitialSession;
  const projectId =
    normalizedExternalProjectId ?? internalProjectId ?? undefined;
  const projectSelectionSource: WorkspaceProjectSelectionSource =
    normalizedExternalProjectId ? "external" : internalProjectSelectionSource;

  const hasHandledNewChatRequest = useCallback(
    (requestKey: string) => handledNewChatRequestRef.current === requestKey,
    [],
  );

  const markNewChatRequestHandled = useCallback((requestKey: string) => {
    handledNewChatRequestRef.current = requestKey;
  }, []);

  const clearProjectSelectionRuntime = useCallback(() => {
    pendingTopicSwitchRef.current = null;
    isResolvingTopicProjectRef.current = false;
  }, []);

  const rememberProjectId = useCallback(
    (nextProjectId?: string | null) => {
      const normalizedProjectId = normalizeProjectId(nextProjectId);
      if (!normalizedProjectId) {
        return;
      }

      savePersistedProjectId(storageKey, normalizedProjectId);
    },
    [storageKey],
  );

  useEffect(() => {
    if (normalizedExternalProjectId) {
      return;
    }

    const initialSessionProjectId = loadInitialSessionProjectId();
    if (!initialSessionProjectId) {
      return;
    }

    clearProjectSelectionRuntime();
    rememberProjectId(initialSessionProjectId);
    setInternalProjectId((currentProjectId) =>
      currentProjectId === initialSessionProjectId
        ? currentProjectId
        : initialSessionProjectId,
    );
    setInternalProjectSelectionSource("initial-session");
  }, [
    clearProjectSelectionRuntime,
    loadInitialSessionProjectId,
    normalizedExternalProjectId,
    rememberProjectId,
  ]);

  const resetProjectSelection = useCallback(() => {
    clearProjectSelectionRuntime();
    setInternalProjectId(null);
    setInternalProjectSelectionSource("none");
  }, [clearProjectSelectionRuntime]);

  const applyProjectSelection = useCallback(
    (nextProjectId?: string | null) => {
      if (normalizedExternalProjectId) {
        return;
      }

      const normalizedProjectId = normalizeProjectId(nextProjectId);
      clearProjectSelectionRuntime();
      rememberProjectId(normalizedProjectId);
      setInternalProjectId(normalizedProjectId);
      setInternalProjectSelectionSource(
        normalizedProjectId ? "manual" : "none",
      );
    },
    [
      clearProjectSelectionRuntime,
      normalizedExternalProjectId,
      rememberProjectId,
    ],
  );

  const startTopicProjectResolution = useCallback(() => {
    if (isResolvingTopicProjectRef.current) {
      return false;
    }

    isResolvingTopicProjectRef.current = true;
    return true;
  }, []);

  const finishTopicProjectResolution = useCallback(() => {
    isResolvingTopicProjectRef.current = false;
  }, []);

  const deferTopicSwitch = useCallback(
    (
      topicId: string,
      targetProjectId: string,
      options?: {
        forceRefresh?: boolean;
        resumeSessionStartHooks?: boolean;
        allowDetachedSession?: boolean;
      },
    ) => {
      const normalizedTargetProjectId = normalizeProjectId(targetProjectId);
      if (!normalizedTargetProjectId) {
        pendingTopicSwitchRef.current = null;
        return;
      }

      rememberProjectId(normalizedTargetProjectId);
      pendingTopicSwitchRef.current = {
        topicId,
        targetProjectId: normalizedTargetProjectId,
        ...(options?.forceRefresh === true ? { forceRefresh: true } : {}),
        ...(options?.resumeSessionStartHooks === true
          ? { resumeSessionStartHooks: true }
          : {}),
        ...(options?.allowDetachedSession === true
          ? { allowDetachedSession: true }
          : {}),
      };
      setInternalProjectId(normalizedTargetProjectId);
      setInternalProjectSelectionSource("topic-switch");
    },
    [rememberProjectId],
  );

  const consumePendingTopicSwitch = useCallback(
    (currentProjectId?: string | null) => {
      const pending = pendingTopicSwitchRef.current;
      if (!pending) {
        return null;
      }

      const normalizedCurrentProjectId = normalizeProjectId(currentProjectId);
      if (normalizedCurrentProjectId !== pending.targetProjectId) {
        return null;
      }

      pendingTopicSwitchRef.current = null;
      return pending;
    },
    [],
  );

  const getRememberedProjectId = useCallback(
    () => loadRememberedProjectId(),
    [loadRememberedProjectId],
  );

  return {
    projectId,
    projectSelectionSource,
    shouldDisableSessionRestore,
    hasHandledNewChatRequest,
    markNewChatRequestHandled,
    rememberProjectId,
    getRememberedProjectId,
    applyProjectSelection,
    resetProjectSelection,
    clearProjectSelectionRuntime,
    startTopicProjectResolution,
    finishTopicProjectResolution,
    deferTopicSwitch,
    consumePendingTopicSwitch,
  };
}
