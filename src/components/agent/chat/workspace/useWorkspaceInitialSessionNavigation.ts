import { useEffect, useRef } from "react";
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
  switchTopic,
  resolveInitialSessionSwitch,
}: UseWorkspaceInitialSessionNavigationParams) {
  const appliedInitialSessionIdRef = useRef<string | null>(null);
  const normalizedInitialSessionId = normalizeSessionId(initialSessionId);
  const normalizedCurrentSessionId = normalizeSessionId(currentSessionId);

  useEffect(() => {
    if (!normalizedInitialSessionId) {
      appliedInitialSessionIdRef.current = null;
      return;
    }

    if (normalizedCurrentSessionId === normalizedInitialSessionId) {
      appliedInitialSessionIdRef.current = normalizedInitialSessionId;
      externalNavigationStartsBySessionId.delete(normalizedInitialSessionId);
      return;
    }

    if (appliedInitialSessionIdRef.current === normalizedInitialSessionId) {
      return;
    }

    const resolvedSwitchOptions =
      resolveInitialSessionSwitch?.(normalizedInitialSessionId) ?? null;
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

    const dedupeKey = `${normalizedCurrentSessionId ?? ""}->${normalizedInitialSessionId}`;
    let switchTopicStarts = switchTopicScopedNavigationStarts.get(switchTopic);
    if (!switchTopicStarts) {
      switchTopicStarts = new Map();
      switchTopicScopedNavigationStarts.set(switchTopic, switchTopicStarts);
    }

    const startedAt = Date.now();
    const scopedLastStartedAt = switchTopicStarts.get(dedupeKey) ?? 0;
    const externalLastStartedAt =
      externalNavigationStartsBySessionId.get(normalizedInitialSessionId) ?? 0;
    const lastStartedAt = Math.max(scopedLastStartedAt, externalLastStartedAt);
    if (startedAt - lastStartedAt < INITIAL_SESSION_NAVIGATION_DEDUPE_MS) {
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

    appliedInitialSessionIdRef.current = normalizedInitialSessionId;
    switchTopicStarts.set(dedupeKey, startedAt);
    logAgentDebug("AgentChatPage", "initialSessionNavigation.start", {
      currentSessionId: normalizedCurrentSessionId,
      forceRefresh: resolvedSwitchOptions?.forceRefresh === true,
      initialSessionId: normalizedInitialSessionId,
      resumeSessionStartHooks:
        resolvedSwitchOptions?.resumeSessionStartHooks === true,
      allowDetachedSession:
        resolvedSwitchOptions?.allowDetachedSession === true,
    });

    const switchOptions: InitialSessionSwitchOptions = {
      ...(resolvedSwitchOptions?.forceRefresh === true
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
    resolveInitialSessionSwitch,
    switchTopic,
  ]);
}
