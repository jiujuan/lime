import { useEffect, useRef, type MutableRefObject } from "react";
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
    case "done":
    case "error":
    case "final_done":
    case "queue_added":
    case "queue_cleared":
    case "queue_removed":
    case "queue_started":
    case "runtime_status":
    case "warning":
      return true;
    default:
      return false;
  }
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
  refreshSessionDetail: (targetSessionId?: string) => Promise<unknown>;
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
  } = options;
  const lastIsSendingRef = useRef(isSending);
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

  useEffect(() => {
    const wasSending = lastIsSendingRef.current;
    lastIsSendingRef.current = isSending;

    if (!wasSending || isSending || !sessionId) {
      return;
    }

    void refreshSessionDetail(sessionId);
  }, [isSending, refreshSessionDetail, sessionId]);

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
      void refreshSessionDetail(sessionId);
    }, 1500);

    return () => {
      window.clearInterval(timer);
    };
  }, [
    isSending,
    threadReadStatus,
    queuedTurnCount,
    refreshSessionDetail,
    sessionId,
    threadTurns,
  ]);

  useEffect(() => {
    if (!sessionId || !shouldUseAppServerBridgeRuntimePolling) {
      return;
    }

    void refreshSessionDetail(sessionId);

    const timer = window.setInterval(() => {
      void refreshSessionDetail(sessionId);
    }, APP_SERVER_BRIDGE_RUNTIME_POLL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [
    refreshSessionDetail,
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
          void refreshSessionDetail(sessionId);
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
    refreshSessionDetail,
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
            void refreshSessionDetail(sessionId);
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
    refreshSessionDetail,
    runtime,
    sessionId,
    sessionIdRef,
    shouldSubscribeTeamEvents,
  ]);
}
