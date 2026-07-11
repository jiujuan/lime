import { useEffect, useMemo, useRef } from "react";
import { logAgentDebug } from "@/lib/agentDebug";

const INITIAL_SESSION_NAVIGATION_DEDUPE_MS = 2_000;
type InitialSessionSwitchTopic = (
  topicId: string,
  options?: InitialSessionSwitchOptions,
) => Promise<unknown>;

let switchTopicScopedNavigationStarts = new WeakMap<
  InitialSessionSwitchTopic,
  Map<string, number>
>();
const externalNavigationStartsBySessionId = new Map<string, number>();

interface InitialSessionSwitchOptions {
  forceRefresh?: boolean;
  resumeSessionStartHooks?: boolean;
  allowDetachedSession?: boolean;
}

interface InitialSessionSwitchResolution extends InitialSessionSwitchOptions {
  waitForResolution?: boolean;
}

interface UseWorkspaceInitialSessionNavigationParams {
  initialSessionId?: string | null;
  currentSessionId?: string | null;
  shouldAllowResolvedForceMatchedHydration?: boolean;
  shouldSkipInitialSessionNavigation?: boolean;
  shouldCancelPausedInitialSessionNavigationOnCurrentSessionChange?: boolean;
  shouldPauseInitialSessionNavigation?: boolean;
  shouldHydrateMatchedInitialSession?: boolean;
  switchTopic: InitialSessionSwitchTopic;
  resolveInitialSessionSwitch?: (
    sessionId: string,
  ) => InitialSessionSwitchResolution | null | undefined;
}

function normalizeSessionId(value?: string | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}

export function resetInitialSessionNavigationDeduplicationForTests() {
  switchTopicScopedNavigationStarts = new WeakMap();
  externalNavigationStartsBySessionId.clear();
}

export function rememberInitialSessionNavigationStart(sessionId: string) {
  const normalizedSessionId = normalizeSessionId(sessionId);
  if (!normalizedSessionId) {
    return;
  }

  externalNavigationStartsBySessionId.set(normalizedSessionId, Date.now());
}

export function useWorkspaceInitialSessionNavigation({
  initialSessionId,
  currentSessionId,
  shouldAllowResolvedForceMatchedHydration = true,
  shouldSkipInitialSessionNavigation = false,
  shouldCancelPausedInitialSessionNavigationOnCurrentSessionChange = false,
  shouldPauseInitialSessionNavigation = false,
  shouldHydrateMatchedInitialSession = false,
  switchTopic,
  resolveInitialSessionSwitch,
}: UseWorkspaceInitialSessionNavigationParams) {
  const appliedInitialSessionIdRef = useRef<string | null>(null);
  const pausedInitialSessionIdRef = useRef<string | null>(null);
  const normalizedInitialSessionId = normalizeSessionId(initialSessionId);
  const normalizedCurrentSessionId = normalizeSessionId(currentSessionId);
  const shouldRunMatchedHydration =
    normalizedCurrentSessionId === normalizedInitialSessionId &&
    shouldHydrateMatchedInitialSession;
  const resolvedSwitchOptions = useMemo(
    () =>
      normalizedInitialSessionId
        ? (resolveInitialSessionSwitch?.(normalizedInitialSessionId) ?? null)
        : null,
    [normalizedInitialSessionId, resolveInitialSessionSwitch],
  );
  const shouldForceMatchedHydration =
    normalizedCurrentSessionId === normalizedInitialSessionId &&
    shouldAllowResolvedForceMatchedHydration &&
    resolvedSwitchOptions?.forceRefresh === true;
  const shouldHydrateMatchedSession =
    shouldRunMatchedHydration || shouldForceMatchedHydration;
  const navigationMode = shouldHydrateMatchedSession
    ? "matched-hydrate"
    : "navigate";
  const appliedNavigationKey = normalizedInitialSessionId
    ? `${normalizedInitialSessionId}:${navigationMode}`
    : null;

  useEffect(() => {
    if (!normalizedInitialSessionId) {
      appliedInitialSessionIdRef.current = null;
      pausedInitialSessionIdRef.current = null;
      return;
    }

    if (shouldPauseInitialSessionNavigation) {
      pausedInitialSessionIdRef.current = normalizedInitialSessionId;
      logAgentDebug(
        "AgentChatPage",
        "initialSessionNavigation.paused",
        {
          currentSessionId: normalizedCurrentSessionId,
          initialSessionId: normalizedInitialSessionId,
        },
        {
          dedupeKey: `initialSessionNavigation.paused:${normalizedInitialSessionId}`,
          throttleMs: 1000,
        },
      );
      return;
    }

    if (
      shouldCancelPausedInitialSessionNavigationOnCurrentSessionChange &&
      pausedInitialSessionIdRef.current === normalizedInitialSessionId &&
      normalizedCurrentSessionId &&
      normalizedCurrentSessionId !== normalizedInitialSessionId
    ) {
      appliedInitialSessionIdRef.current = `${normalizedInitialSessionId}:cancelled-after-current-session-change`;
      logAgentDebug(
        "AgentChatPage",
        "initialSessionNavigation.cancelledAfterCurrentSessionChange",
        {
          currentSessionId: normalizedCurrentSessionId,
          initialSessionId: normalizedInitialSessionId,
        },
        {
          dedupeKey: `initialSessionNavigation.cancelledAfterCurrentSessionChange:${normalizedInitialSessionId}`,
          throttleMs: 1000,
        },
      );
      return;
    }

    if (shouldSkipInitialSessionNavigation) {
      appliedInitialSessionIdRef.current = `${normalizedInitialSessionId}:skipped`;
      logAgentDebug(
        "AgentChatPage",
        "initialSessionNavigation.skipped",
        {
          currentSessionId: normalizedCurrentSessionId,
          initialSessionId: normalizedInitialSessionId,
        },
        {
          dedupeKey: `initialSessionNavigation.skipped:${normalizedInitialSessionId}`,
          throttleMs: 1000,
        },
      );
      return;
    }

    if (
      normalizedCurrentSessionId === normalizedInitialSessionId &&
      !shouldHydrateMatchedSession
    ) {
      appliedInitialSessionIdRef.current = `${normalizedInitialSessionId}:matched-current`;
      externalNavigationStartsBySessionId.delete(normalizedInitialSessionId);
      return;
    }

    if (appliedInitialSessionIdRef.current === appliedNavigationKey) {
      return;
    }

    if (resolvedSwitchOptions?.waitForResolution) {
      logAgentDebug(
        "AgentChatPage",
        "initialSessionNavigation.waitForResolution",
        {
          currentSessionId: normalizedCurrentSessionId,
          initialSessionId: normalizedInitialSessionId,
        },
        {
          dedupeKey: `initialSessionNavigation.wait:${normalizedInitialSessionId}`,
          throttleMs: 1000,
        },
      );
      return;
    }

    const dedupeKey = `${normalizedCurrentSessionId ?? ""}->${normalizedInitialSessionId}:${navigationMode}`;
    const sessionDedupeKey = `*->${normalizedInitialSessionId}:${navigationMode}`;
    let switchTopicStarts = switchTopicScopedNavigationStarts.get(switchTopic);
    if (!switchTopicStarts) {
      switchTopicStarts = new Map();
      switchTopicScopedNavigationStarts.set(switchTopic, switchTopicStarts);
    }

    const startedAt = Date.now();
    const scopedLastStartedAt = switchTopicStarts.get(dedupeKey) ?? 0;
    const scopedSessionLastStartedAt =
      switchTopicStarts.get(sessionDedupeKey) ?? 0;
    const externalLastStartedAt =
      externalNavigationStartsBySessionId.get(normalizedInitialSessionId) ?? 0;
    const lastStartedAt = Math.max(
      scopedLastStartedAt,
      scopedSessionLastStartedAt,
      externalLastStartedAt,
    );
    if (startedAt - lastStartedAt < INITIAL_SESSION_NAVIGATION_DEDUPE_MS) {
      appliedInitialSessionIdRef.current = appliedNavigationKey;
      logAgentDebug(
        "AgentChatPage",
        "initialSessionNavigation.deduped",
        {
          currentSessionId: normalizedCurrentSessionId,
          initialSessionId: normalizedInitialSessionId,
          elapsedSinceLastStartMs: startedAt - lastStartedAt,
        },
        {
          dedupeKey: `initialSessionNavigation.deduped:${normalizedInitialSessionId}`,
          throttleMs: INITIAL_SESSION_NAVIGATION_DEDUPE_MS,
        },
      );
      return;
    }

    appliedInitialSessionIdRef.current = appliedNavigationKey;
    switchTopicStarts.set(dedupeKey, startedAt);
    switchTopicStarts.set(sessionDedupeKey, startedAt);
    logAgentDebug("AgentChatPage", "initialSessionNavigation.start", {
      currentSessionId: normalizedCurrentSessionId,
      forceRefresh:
        shouldHydrateMatchedSession ||
        resolvedSwitchOptions?.forceRefresh === true,
      initialSessionId: normalizedInitialSessionId,
      matchedHydration: shouldHydrateMatchedSession,
      resumeSessionStartHooks:
        resolvedSwitchOptions?.resumeSessionStartHooks === true,
      allowDetachedSession:
        resolvedSwitchOptions?.allowDetachedSession === true,
    });

    const switchOptions: InitialSessionSwitchOptions = {
      ...(shouldHydrateMatchedSession ||
      resolvedSwitchOptions?.forceRefresh === true
        ? { forceRefresh: true }
        : {}),
      ...(resolvedSwitchOptions?.resumeSessionStartHooks === true
        ? { resumeSessionStartHooks: true }
        : {}),
      ...(resolvedSwitchOptions?.allowDetachedSession === true
        ? { allowDetachedSession: true }
        : {}),
    };
    const hasSwitchOptions = Object.keys(switchOptions).length > 0;

    void switchTopic(
      normalizedInitialSessionId,
      hasSwitchOptions ? switchOptions : undefined,
    ).catch(
      (error) => {
        appliedInitialSessionIdRef.current = null;
        switchTopicStarts.delete(dedupeKey);
        externalNavigationStartsBySessionId.delete(normalizedInitialSessionId);
        logAgentDebug(
          "AgentChatPage",
          "initialSessionNavigation.error",
          {
            error,
            initialSessionId: normalizedInitialSessionId,
          },
          { level: "error" },
        );
        console.error("[AgentChatPage] 恢复初始会话失败:", error);
      },
    );
  }, [
    normalizedCurrentSessionId,
    normalizedInitialSessionId,
    appliedNavigationKey,
    navigationMode,
    resolveInitialSessionSwitch,
    resolvedSwitchOptions,
    shouldAllowResolvedForceMatchedHydration,
    shouldSkipInitialSessionNavigation,
    shouldCancelPausedInitialSessionNavigationOnCurrentSessionChange,
    shouldPauseInitialSessionNavigation,
    shouldHydrateMatchedSession,
    shouldHydrateMatchedInitialSession,
    shouldRunMatchedHydration,
    switchTopic,
  ]);
}
