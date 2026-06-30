import { useEffect, useState } from "react";
import type {
  AsterSubagentSessionInfo,
  AgentRuntimeThreadReadModel,
  QueuedTurnSnapshot,
} from "@/lib/api/agentRuntime";
import { scheduleMinimumDelayIdleTask } from "@/lib/utils/scheduleMinimumDelayIdleTask";
import type { AgentThreadItem, AgentThreadTurn, Message } from "../types";
import {
  buildSessionRuntimeProjectionIdentity,
  buildSessionRuntimeProjectionState,
  resolveNextSessionRuntimeProjectionState,
  resolveSessionRuntimeProjectionStatus,
  shouldConsiderSessionRuntimeProjectionDeferral,
} from "./workspaceConversationSceneViewModel";

const SESSION_RUNTIME_PROJECTION_DEFER_MESSAGE_THRESHOLD = 20;
const SESSION_RUNTIME_PROJECTION_DEFER_TURN_THRESHOLD = 6;
const SESSION_RUNTIME_PROJECTION_DEFER_ITEM_THRESHOLD = 24;
const SESSION_RUNTIME_PROJECTION_DEFER_DELAY_MS = 700;
const SESSION_RUNTIME_PROJECTION_DEFER_IDLE_TIMEOUT_MS = 1_800;

const EMPTY_PROJECTED_TURNS: AgentThreadTurn[] = [];
const EMPTY_PROJECTED_THREAD_ITEMS: AgentThreadItem[] = [];
const EMPTY_PROJECTED_PENDING_ACTIONS: never[] = [];
const EMPTY_PROJECTED_SUBMITTED_ACTIONS: never[] = [];
const EMPTY_PROJECTED_QUEUED_TURNS: QueuedTurnSnapshot[] = [];
const EMPTY_PROJECTED_CHILD_SUBAGENT_SESSIONS: AsterSubagentSessionInfo[] = [];

export interface SessionRuntimeProjectionDeferralInput<
  PendingAction,
  SubmittedAction,
> {
  sessionId?: string | null;
  messages: Message[];
  turns: readonly AgentThreadTurn[];
  threadItems: readonly AgentThreadItem[];
  currentTurnId?: string | null;
  threadRead?: AgentRuntimeThreadReadModel | null;
  pendingActions: readonly PendingAction[];
  submittedActionsInFlight: readonly SubmittedAction[];
  queuedTurns: readonly QueuedTurnSnapshot[];
  childSubagentSessions: readonly AsterSubagentSessionInfo[];
  isRestoringSession: boolean;
  isSending: boolean;
  focusedTimelineItemId?: string | null;
  pendingA2UIForm?: unknown;
}

export interface SessionRuntimeProjectionDeferralResult<
  PendingAction,
  SubmittedAction,
> {
  turns: readonly AgentThreadTurn[];
  threadItems: readonly AgentThreadItem[];
  currentTurnId: string | null;
  threadRead: AgentRuntimeThreadReadModel | null;
  pendingActions: readonly PendingAction[];
  submittedActionsInFlight: readonly SubmittedAction[];
  queuedTurns: readonly QueuedTurnSnapshot[];
  childSubagentSessions: readonly AsterSubagentSessionInfo[];
}

export function useSessionRuntimeProjectionDeferral<
  PendingAction,
  SubmittedAction,
>({
  sessionId,
  messages,
  turns,
  threadItems,
  currentTurnId,
  threadRead,
  pendingActions,
  submittedActionsInFlight,
  queuedTurns,
  childSubagentSessions,
  isRestoringSession,
  isSending,
  focusedTimelineItemId,
  pendingA2UIForm,
}: SessionRuntimeProjectionDeferralInput<
  PendingAction,
  SubmittedAction
>): SessionRuntimeProjectionDeferralResult<PendingAction, SubmittedAction> {
  const identity = buildSessionRuntimeProjectionIdentity({
    sessionId,
    messages,
    turns,
    threadItems,
  });
  const shouldConsiderDeferring =
    shouldConsiderSessionRuntimeProjectionDeferral({
      isRestoringSession,
      isSending,
      focusedTimelineItemId,
      pendingA2UIForm,
      messageCount: messages.length,
      turnCount: turns.length,
      threadItemCount: threadItems.length,
      messageThreshold: SESSION_RUNTIME_PROJECTION_DEFER_MESSAGE_THRESHOLD,
      turnThreshold: SESSION_RUNTIME_PROJECTION_DEFER_TURN_THRESHOLD,
      threadItemThreshold: SESSION_RUNTIME_PROJECTION_DEFER_ITEM_THRESHOLD,
    });
  const [state, setState] = useState(() =>
    buildSessionRuntimeProjectionState({
      key: identity.key,
      sessionId: identity.sessionId,
      firstMessageId: identity.firstMessageId,
      lastMessageId: identity.lastMessageId,
      ready: !shouldConsiderDeferring,
    }),
  );
  const status = resolveSessionRuntimeProjectionStatus({
    currentState: state,
    identity,
    shouldConsiderDeferring,
  });

  useEffect(() => {
    if (!status.shouldDefer) {
      const nextState = buildSessionRuntimeProjectionState({
        key: identity.key,
        sessionId: identity.sessionId,
        firstMessageId: identity.firstMessageId,
        lastMessageId: identity.lastMessageId,
        ready: true,
      });
      setState((current) =>
        resolveNextSessionRuntimeProjectionState(current, nextState),
      );
      return;
    }

    const pendingState = buildSessionRuntimeProjectionState({
      key: identity.key,
      sessionId: identity.sessionId,
      firstMessageId: identity.firstMessageId,
      lastMessageId: identity.lastMessageId,
      ready: false,
    });
    setState((current) =>
      resolveNextSessionRuntimeProjectionState(current, pendingState),
    );
    return scheduleMinimumDelayIdleTask(
      () => {
        const readyState = buildSessionRuntimeProjectionState({
          key: identity.key,
          sessionId: identity.sessionId,
          firstMessageId: identity.firstMessageId,
          lastMessageId: identity.lastMessageId,
          ready: true,
        });
        setState((current) =>
          current.key === identity.key
            ? resolveNextSessionRuntimeProjectionState(current, readyState)
            : current,
        );
      },
      {
        minimumDelayMs: SESSION_RUNTIME_PROJECTION_DEFER_DELAY_MS,
        idleTimeoutMs: SESSION_RUNTIME_PROJECTION_DEFER_IDLE_TIMEOUT_MS,
      },
    );
  }, [
    identity.firstMessageId,
    identity.key,
    identity.lastMessageId,
    identity.sessionId,
    status.shouldDefer,
  ]);

  if (!status.shouldUseDeferredProjection) {
    return {
      turns,
      threadItems,
      currentTurnId: currentTurnId ?? null,
      threadRead: threadRead ?? null,
      pendingActions,
      submittedActionsInFlight,
      queuedTurns,
      childSubagentSessions,
    };
  }

  return {
    turns: EMPTY_PROJECTED_TURNS,
    threadItems: EMPTY_PROJECTED_THREAD_ITEMS,
    currentTurnId: null,
    threadRead: null,
    pendingActions: EMPTY_PROJECTED_PENDING_ACTIONS,
    submittedActionsInFlight: EMPTY_PROJECTED_SUBMITTED_ACTIONS,
    queuedTurns: EMPTY_PROJECTED_QUEUED_TURNS,
    childSubagentSessions: EMPTY_PROJECTED_CHILD_SUBAGENT_SESSIONS,
  };
}
