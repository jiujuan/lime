import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import { isRuntimeSettledStatusValue } from "@limecloud/agent-ui-contracts";
import { isAppServerBridgeAvailable } from "@/lib/api/appServerBridgeAvailability";
import { hasDevBridgeEventListenerCapability } from "@/lib/api/bridgeEvents";
import { parseAgentEvent } from "@/lib/api/agentProtocol";
import {
  dedupeAgentRuntimeEventNames,
  getAgentSubagentStatusEventName,
} from "@/lib/api/agentRuntimeEvents";
import { hasDesktopHostEventListenerCapability } from "@/lib/desktop-runtime";
import type { AgentThreadTurn } from "../types";
import type { AgentRuntimeAdapter } from "./agentRuntimeAdapter";

const APP_SERVER_BRIDGE_RUNTIME_POLL_MS = 1000;
const RECOVERED_RUNTIME_POLL_ACTIVE_WINDOW_MS = 30 * 60 * 1000;
const RUNTIME_DETAIL_REFRESH_COALESCE_MS = 120;

function parseTimestampMs(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const timestampMs = Date.parse(value);
  return Number.isFinite(timestampMs) ? timestampMs : null;
}

function hasRecentRunningTurn(threadTurns: AgentThreadTurn[]): boolean {
  const nowMs = Date.now();
  return threadTurns.some((turn) => {
    if (turn.status !== "running") {
      return false;
    }

    const timestampMs =
      parseTimestampMs(turn.updated_at) ?? parseTimestampMs(turn.started_at);
    if (timestampMs === null) {
      return false;
    }

    return nowMs - timestampMs <= RECOVERED_RUNTIME_POLL_ACTIVE_WINDOW_MS;
  });
}

function shouldPollRecoveredRuntimeWork(params: {
  threadReadStatus?: string | null;
  queuedTurnCount: number;
  threadTurns: AgentThreadTurn[];
}): boolean {
  if (params.queuedTurnCount > 0) {
    return true;
  }

  const normalizedThreadReadStatus = (
    params.threadReadStatus || ""
  ).toLowerCase();
  const hasRunningTurn = params.threadTurns.some(
    (turn) => turn.status === "running",
  );

  if (hasRunningTurn) {
    return hasRecentRunningTurn(params.threadTurns);
  }

  return (
    normalizedThreadReadStatus === "running" ||
    normalizedThreadReadStatus === "queued"
  );
}

function shouldRefreshReadModelForTurnEvent(payload: unknown): boolean {
  const data = parseAgentEvent(payload);
  if (!data) {
    return false;
  }

  switch (data.type) {
    case "action_required":
    case "action_resolved":
    case "artifact_snapshot":
    case "error":
    case "queue_added":
    case "queue_cleared":
    case "queue_removed":
    case "queue_started":
    case "runtime_status":
    case "turn_completed":
    case "turn_canceled":
    case "turn_failed":
    case "warning":
      return true;
    default:
      return false;
  }
}

function isTerminalRuntimeStatus(status?: string | null): boolean {
  return isRuntimeSettledStatusValue(status);
}

function isExplicitTerminalRuntimeStatus(status?: string | null): boolean {
  const normalizedStatus = (status || "").trim().toLowerCase();
  return normalizedStatus !== "idle" && isTerminalRuntimeStatus(status);
}

function hasRunningTurn(threadTurns: AgentThreadTurn[]): boolean {
  return threadTurns.some((turn) => turn.status === "running");
}

function hasTerminalTurn(threadTurns: AgentThreadTurn[]): boolean {
  return threadTurns.some((turn) => isTerminalRuntimeStatus(turn.status));
}

interface UseAgentRuntimeSyncEffectsOptions {
  runtime: Pick<
    AgentRuntimeAdapter,
    "listenToTeamEvents" | "listenToTurnEvents"
  >;
  sessionIdRef: MutableRefObject<string | null>;
  sessionId: string | null;
  parentSessionId?: string | null;
  currentTurnEventName?: string | null;
  isSending: boolean;
  threadReadStatus?: string | null;
  queuedTurnCount: number;
  threadTurns: AgentThreadTurn[];
  refreshSessionDetail: (
    targetSessionId?: string,
    source?: string,
  ) => Promise<unknown>;
  settleActiveRuntimeStream?: (targetSessionId: string) => void;
}

export function useAgentRuntimeSyncEffects(
  options: UseAgentRuntimeSyncEffectsOptions,
) {
  const {
    runtime,
    sessionIdRef,
    sessionId,
    parentSessionId,
    currentTurnEventName,
    isSending,
    threadReadStatus,
    queuedTurnCount,
    threadTurns,
    refreshSessionDetail,
    settleActiveRuntimeStream,
  } = options;
  const lastIsSendingRef = useRef(isSending);
  const observedActiveRuntimeWorkRef = useRef(false);
  const refreshInFlightSessionRef = useRef<string | null>(null);
  const refreshTimerRef = useRef<number | null>(null);
  const normalizedParentSessionId = parentSessionId?.trim() || null;
  const normalizedCurrentTurnEventName = currentTurnEventName?.trim() || null;
  const hasDesktopRuntimeEventListenerCapability =
    hasDesktopHostEventListenerCapability();
  const hasRuntimeEventListenerCapability =
    hasDesktopRuntimeEventListenerCapability ||
    hasDevBridgeEventListenerCapability();
  const hasActiveRuntimeWork = shouldPollRecoveredRuntimeWork({
    threadReadStatus,
    queuedTurnCount,
    threadTurns,
  });
  const shouldUseAppServerBridgeRuntimePolling =
    Boolean(sessionId) &&
    isSending &&
    isAppServerBridgeAvailable() &&
    !hasRuntimeEventListenerCapability;
  const shouldSubscribeTeamEvents =
    Boolean(sessionId) &&
    (hasDesktopRuntimeEventListenerCapability ||
      isSending ||
      hasActiveRuntimeWork ||
      Boolean(normalizedParentSessionId));

  const refreshSessionDetailOnce = useCallback(
    (targetSessionId: string, source: string) => {
      if (refreshInFlightSessionRef.current === targetSessionId) {
        return;
      }

      refreshInFlightSessionRef.current = targetSessionId;
      void refreshSessionDetail(targetSessionId, source).finally(() => {
        if (refreshInFlightSessionRef.current === targetSessionId) {
          refreshInFlightSessionRef.current = null;
        }
      });
    },
    [refreshSessionDetail],
  );

  const scheduleRefreshSessionDetail = useCallback(
    (targetSessionId: string, source: string) => {
      if (refreshInFlightSessionRef.current === targetSessionId) {
        return;
      }

      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
      }

      refreshTimerRef.current = window.setTimeout(() => {
        refreshTimerRef.current = null;
        refreshSessionDetailOnce(targetSessionId, source);
      }, RUNTIME_DETAIL_REFRESH_COALESCE_MS);
    },
    [refreshSessionDetailOnce],
  );

  useEffect(
    () => () => {
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    const wasSending = lastIsSendingRef.current;
    lastIsSendingRef.current = isSending;

    if (!wasSending || isSending || !sessionId) {
      return;
    }

    scheduleRefreshSessionDetail(sessionId, "runtimeSync.sendSettled");
  }, [isSending, scheduleRefreshSessionDetail, sessionId]);

  useEffect(() => {
    if (!isSending) {
      observedActiveRuntimeWorkRef.current = false;
      return;
    }

    if (hasActiveRuntimeWork) {
      observedActiveRuntimeWorkRef.current = true;
    }
  }, [hasActiveRuntimeWork, isSending]);

  useEffect(() => {
    if (!sessionId || !isSending || !settleActiveRuntimeStream) {
      return;
    }
    const hasTerminalTurnInReadModel = hasTerminalTurn(threadTurns);
    const hasTerminalReadModel =
      isExplicitTerminalRuntimeStatus(threadReadStatus) ||
      hasTerminalTurnInReadModel;
    if (!observedActiveRuntimeWorkRef.current && !hasTerminalReadModel) {
      return;
    }
    if (queuedTurnCount > 0 || hasRunningTurn(threadTurns)) {
      return;
    }
    if (
      !hasTerminalTurnInReadModel &&
      !isTerminalRuntimeStatus(threadReadStatus)
    ) {
      return;
    }

    observedActiveRuntimeWorkRef.current = false;
    settleActiveRuntimeStream(sessionId);
  }, [
    isSending,
    queuedTurnCount,
    sessionId,
    settleActiveRuntimeStream,
    threadReadStatus,
    threadTurns,
  ]);

  useEffect(() => {
    if (!sessionId || isSending) {
      return;
    }

    if (
      !shouldPollRecoveredRuntimeWork({
        threadReadStatus,
        queuedTurnCount,
        threadTurns,
      })
    ) {
      return;
    }

    const timer = window.setInterval(() => {
      refreshSessionDetailOnce(sessionId, "runtimeSync.recoveredPoll");
    }, 1500);

    return () => {
      window.clearInterval(timer);
    };
  }, [
    isSending,
    threadReadStatus,
    queuedTurnCount,
    refreshSessionDetailOnce,
    sessionId,
    threadTurns,
  ]);

  useEffect(() => {
    if (!sessionId || !shouldUseAppServerBridgeRuntimePolling) {
      return;
    }

    refreshSessionDetailOnce(sessionId, "runtimeSync.poll");

    const timer = window.setInterval(() => {
      refreshSessionDetailOnce(sessionId, "runtimeSync.poll");
    }, APP_SERVER_BRIDGE_RUNTIME_POLL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [
    refreshSessionDetailOnce,
    sessionId,
    shouldUseAppServerBridgeRuntimePolling,
  ]);

  useEffect(() => {
    if (!sessionId || !normalizedCurrentTurnEventName) {
      return;
    }

    let disposed = false;
    let unlisten: (() => void) | null = null;

    const subscribe = async () => {
      const nextUnlisten = await runtime.listenToTurnEvents(
        normalizedCurrentTurnEventName,
        (event) => {
          if (
            disposed ||
            sessionIdRef.current !== sessionId ||
            !shouldRefreshReadModelForTurnEvent(event.payload)
          ) {
            return;
          }
          scheduleRefreshSessionDetail(sessionId, "runtimeSync.event");
        },
      );

      if (disposed) {
        nextUnlisten();
        return;
      }

      unlisten = nextUnlisten;
    };

    void subscribe();

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [
    normalizedCurrentTurnEventName,
    scheduleRefreshSessionDetail,
    runtime,
    sessionId,
    sessionIdRef,
  ]);

  useEffect(() => {
    if (!sessionId || !shouldSubscribeTeamEvents) {
      return;
    }

    const eventNames = dedupeAgentRuntimeEventNames([
      getAgentSubagentStatusEventName(sessionId),
      normalizedParentSessionId
        ? getAgentSubagentStatusEventName(normalizedParentSessionId)
        : null,
    ]);

    let disposed = false;
    const unlisteners: Array<() => void> = [];

    const subscribe = async () => {
      for (const eventName of eventNames) {
        const unlisten = await runtime.listenToTeamEvents(
          eventName,
          (event) => {
            const data = parseAgentEvent(event.payload);
            if (disposed || data?.type !== "subagent_status_changed") {
              return;
            }
            if (sessionIdRef.current !== sessionId) {
              return;
            }
            scheduleRefreshSessionDetail(sessionId, "runtimeSync.event");
          },
        );

        if (disposed) {
          unlisten();
          return;
        }

        unlisteners.push(unlisten);
      }
    };

    void subscribe();

    return () => {
      disposed = true;
      for (const unlisten of unlisteners) {
        unlisten();
      }
    };
  }, [
    normalizedParentSessionId,
    scheduleRefreshSessionDetail,
    runtime,
    sessionId,
    sessionIdRef,
    shouldSubscribeTeamEvents,
  ]);
}
