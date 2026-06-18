import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Message } from "../types";
import { normalizeProjectId } from "../utils/topicProjectResolution";
import { scheduleMinimumDelayIdleTask } from "@/lib/utils/scheduleMinimumDelayIdleTask";
import {
  createInitialSessionImageWorkbenchState,
  type SessionImageWorkbenchState,
} from "./imageWorkbenchHelpers";
import {
  buildSessionImageWorkbenchStateFromMessages,
  isSessionImageWorkbenchStateMeaningful,
  loadSessionImageWorkbenchCachedState,
  saveSessionImageWorkbenchCachedState,
} from "./imageWorkbenchStateCache";
import { createLocalImageWorkbenchSessionKey } from "./agentChatWorkspaceHelpers";

type ImageWorkbenchStateUpdater = (
  current: SessionImageWorkbenchState,
) => SessionImageWorkbenchState;

export interface WorkspaceImageWorkbenchSessionRuntimeState {
  currentImageWorkbenchState: SessionImageWorkbenchState;
  imageWorkbenchSessionKey: string;
  resetLocalImageWorkbenchSessionScope: () => void;
  updateCurrentImageWorkbenchState: (updater: ImageWorkbenchStateUpdater) => void;
  updateImageWorkbenchStateForSession: (
    sessionKey: string,
    updater: ImageWorkbenchStateUpdater,
    options?: {
      fallbackState?: SessionImageWorkbenchState;
      removeSessionKeys?: string[];
    },
  ) => void;
}

interface UseWorkspaceImageWorkbenchSessionRuntimeParams {
  contentId?: string | null;
  messages: Message[];
  projectId?: string | null;
  sessionId?: string | null;
}

export function useWorkspaceImageWorkbenchSessionRuntime({
  contentId,
  messages,
  projectId,
  sessionId,
}: UseWorkspaceImageWorkbenchSessionRuntimeParams): WorkspaceImageWorkbenchSessionRuntimeState {
  const [imageWorkbenchBySessionId, setImageWorkbenchBySessionId] = useState<
    Record<string, SessionImageWorkbenchState>
  >({});
  const localImageWorkbenchSessionKeyRef = useRef(
    createLocalImageWorkbenchSessionKey(),
  );
  const [localImageWorkbenchSessionKey, setLocalImageWorkbenchSessionKey] =
    useState(() => localImageWorkbenchSessionKeyRef.current);

  const resetLocalImageWorkbenchSessionScope = useCallback(() => {
    const previousLocalSessionKey = localImageWorkbenchSessionKeyRef.current;
    const nextLocalSessionKey = createLocalImageWorkbenchSessionKey();
    localImageWorkbenchSessionKeyRef.current = nextLocalSessionKey;
    setLocalImageWorkbenchSessionKey(nextLocalSessionKey);
    setImageWorkbenchBySessionId((previous) => {
      if (!previous[previousLocalSessionKey]) {
        return previous;
      }
      const next = { ...previous };
      delete next[previousLocalSessionKey];
      return next;
    });
  }, []);

  const imageWorkbenchSessionKey = useMemo(
    () => sessionId?.trim() || localImageWorkbenchSessionKey,
    [localImageWorkbenchSessionKey, sessionId],
  );

  const cachedImageWorkbenchState = useMemo(() => {
    const normalizedProjectId = normalizeProjectId(projectId);
    const normalizedSessionId = sessionId?.trim();
    if (!normalizedProjectId || !normalizedSessionId) {
      return null;
    }

    return loadSessionImageWorkbenchCachedState(
      normalizedProjectId,
      normalizedSessionId,
      { contentId, refreshAccess: false },
    );
  }, [contentId, projectId, sessionId]);

  const currentImageWorkbenchState = useMemo(
    () =>
      imageWorkbenchBySessionId[imageWorkbenchSessionKey] ||
      cachedImageWorkbenchState?.state ||
      createInitialSessionImageWorkbenchState(),
    [
      cachedImageWorkbenchState,
      imageWorkbenchBySessionId,
      imageWorkbenchSessionKey,
    ],
  );

  const imageWorkbenchStateForCache = useMemo(() => {
    if (isSessionImageWorkbenchStateMeaningful(currentImageWorkbenchState)) {
      return currentImageWorkbenchState;
    }

    return buildSessionImageWorkbenchStateFromMessages(messages);
  }, [currentImageWorkbenchState, messages]);

  const updateCurrentImageWorkbenchState = useCallback(
    (updater: ImageWorkbenchStateUpdater) => {
      setImageWorkbenchBySessionId((previous) => {
        const current =
          previous[imageWorkbenchSessionKey] ||
          createInitialSessionImageWorkbenchState();
        return {
          ...previous,
          [imageWorkbenchSessionKey]: updater(current),
        };
      });
    },
    [imageWorkbenchSessionKey],
  );

  const updateImageWorkbenchStateForSession = useCallback(
    (
      sessionKey: string,
      updater: ImageWorkbenchStateUpdater,
      options?: {
        fallbackState?: SessionImageWorkbenchState;
        removeSessionKeys?: string[];
      },
    ) => {
      const normalizedSessionKey = sessionKey.trim();
      if (!normalizedSessionKey) {
        return;
      }

      setImageWorkbenchBySessionId((previous) => {
        const current =
          previous[normalizedSessionKey] ||
          options?.fallbackState ||
          createInitialSessionImageWorkbenchState();
        const nextState = {
          ...previous,
          [normalizedSessionKey]: updater(current),
        };

        options?.removeSessionKeys?.forEach((candidateKey) => {
          const normalizedCandidateKey = candidateKey.trim();
          if (
            !normalizedCandidateKey ||
            normalizedCandidateKey === normalizedSessionKey
          ) {
            return;
          }
          delete nextState[normalizedCandidateKey];
        });

        return nextState;
      });
    },
    [],
  );

  useEffect(() => {
    const normalizedSessionId = sessionId?.trim();
    const localSessionKey = localImageWorkbenchSessionKey;
    if (!normalizedSessionId || normalizedSessionId === localSessionKey) {
      return;
    }

    const localState = imageWorkbenchBySessionId[localSessionKey];
    if (!localState) {
      return;
    }

    updateImageWorkbenchStateForSession(
      normalizedSessionId,
      (current) => current,
      {
        fallbackState: localState,
        removeSessionKeys: [localSessionKey],
      },
    );
  }, [
    imageWorkbenchBySessionId,
    localImageWorkbenchSessionKey,
    sessionId,
    updateImageWorkbenchStateForSession,
  ]);

  useEffect(() => {
    const normalizedProjectId = normalizeProjectId(projectId);
    const normalizedSessionId = sessionId?.trim();
    if (!normalizedProjectId || !normalizedSessionId) {
      return;
    }

    if (!cachedImageWorkbenchState) {
      return;
    }

    setImageWorkbenchBySessionId((previous) => {
      if (isSessionImageWorkbenchStateMeaningful(previous[normalizedSessionId])) {
        return previous;
      }

      return {
        ...previous,
        [normalizedSessionId]: cachedImageWorkbenchState.state,
      };
    });
  }, [cachedImageWorkbenchState, projectId, sessionId]);

  useEffect(() => {
    const normalizedProjectId = normalizeProjectId(projectId);
    const normalizedSessionId = sessionId?.trim();
    if (
      !normalizedProjectId ||
      !normalizedSessionId ||
      !isSessionImageWorkbenchStateMeaningful(imageWorkbenchStateForCache)
    ) {
      return;
    }

    return scheduleMinimumDelayIdleTask(
      () => {
        saveSessionImageWorkbenchCachedState(
          normalizedProjectId,
          normalizedSessionId,
          imageWorkbenchStateForCache,
          { contentId },
        );
      },
      {
        minimumDelayMs: 400,
        idleTimeoutMs: 2_000,
      },
    );
  }, [contentId, imageWorkbenchStateForCache, projectId, sessionId]);

  return {
    currentImageWorkbenchState,
    imageWorkbenchSessionKey,
    resetLocalImageWorkbenchSessionScope,
    updateCurrentImageWorkbenchState,
    updateImageWorkbenchStateForSession,
  };
}
