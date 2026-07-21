import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { AgentThreadItem, AgentThreadTurn } from "@/lib/api/agentProtocol";
import type { Message } from "../types";
import type { InterruptedInputDraftSnapshot } from "./agentStreamInputRestoreTypes";
import {
  removeThreadItemState,
  removeThreadTurnState,
  upsertThreadItemState,
  upsertThreadTurnState,
} from "./agentThreadState";
import {
  buildFailedAgentRuntimeStatus,
  formatAgentRuntimeStatusSummary,
} from "../utils/agentRuntimeStatus";
import type { AgentUiPerformanceTraceMetadata } from "./agentStreamPerformanceMetrics";

export interface ActiveStreamState {
  assistantMsgId: string;
  eventName: string;
  sessionId: string;
  turnId?: string;
  pendingTurnKey?: string;
  pendingItemKey?: string;
  submittedDraft?: InterruptedInputDraftSnapshot | null;
}

export interface StreamRequestState {
  accumulatedContent: string;
  hasMeaningfulCompletionSignal?: boolean;
  hasFinalAnswerRequiredProcessBoundary?: boolean;
  hasAssistantTextAfterLatestFinalAnswerRequiredProcessBoundary?: boolean;
  requestLogId: string | null;
  requestStartedAt: number;
  submissionDispatchedAt?: number | null;
  submissionAcceptedAt?: number | null;
  startTerminalRecoveryPoll?: () => void;
  listenerBoundAt?: number | null;
  firstEventReceivedAt?: number | null;
  firstRuntimeStatusAt?: number | null;
  firstThinkingDeltaAt?: number | null;
  firstTextDeltaAt?: number | null;
  firstTextPaintAt?: number | null;
  firstTextPaintScheduled?: boolean;
  firstTextRenderFlushAt?: number | null;
  lastTextRenderFlushAt?: number | null;
  textDeltaBufferedCount?: number;
  textDeltaFlushCount?: number;
  maxTextDeltaBacklogChars?: number;
  requestFinished: boolean;
  currentTurnId?: string | null;
  pendingTextRenderTimerId?: ReturnType<typeof setTimeout> | null;
  renderedContent?: string;
  preservedAssistantContentInitialized?: boolean;
  activeTextSegmentTurnId?: string | null;
  activeTextSegmentSequence?: number | null;
  latestAssistantTextEventSequence?: number | null;
  maxProcessEventSequence?: number | null;
  maxFinalAnswerRequiredProcessEventSequence?: number | null;
  performanceTrace?: AgentUiPerformanceTraceMetadata | null;
}

function normalizeUserMessageContent(value: string | undefined): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

function messageImageCount(message: Message): number {
  return message.images?.length ?? 0;
}

function findEquivalentPendingUserMessage(
  messages: Message[],
  userMsg: Message | null,
): Message | null {
  if (!userMsg) {
    return null;
  }

  const expectedContent = normalizeUserMessageContent(userMsg.content);
  if (!expectedContent) {
    return null;
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "user") {
      continue;
    }

    if (message.runtimeTurnId?.trim()) {
      return null;
    }

    const currentContent = normalizeUserMessageContent(message.content);
    if (
      currentContent === expectedContent &&
      messageImageCount(message) === messageImageCount(userMsg)
    ) {
      return message;
    }
    return null;
  }

  return null;
}

interface CreateSubmissionLifecycleOptions {
  assistantMsg: Message;
  assistantMsgId: string;
  userMsgId: string | null;
  userMsg?: Message | null;
  content: string;
  submittedDraft?: InterruptedInputDraftSnapshot | null;
  listenerMapRef: MutableRefObject<Map<string, () => void>>;
  setActiveStream: (nextActive: ActiveStreamState | null) => void;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setThreadItems: Dispatch<SetStateAction<AgentThreadItem[]>>;
  setThreadTurns: Dispatch<SetStateAction<AgentThreadTurn[]>>;
  setCurrentTurnId: Dispatch<SetStateAction<string | null>>;
}

function createPendingTurnKey() {
  return `pending-turn:${crypto.randomUUID()}`;
}

function createPendingItemKey(pendingTurnKey: string) {
  return `pending-item:${pendingTurnKey}`;
}

export function createAgentStreamSubmissionLifecycle(
  options: CreateSubmissionLifecycleOptions,
) {
  const {
    assistantMsg,
    assistantMsgId,
    userMsgId,
    userMsg,
    content,
    submittedDraft,
    listenerMapRef,
    setActiveStream,
    setMessages,
    setThreadItems,
    setThreadTurns,
    setCurrentTurnId,
  } = options;

  let unlisten: (() => void) | null = null;
  let streamActivated = false;
  const requestState: StreamRequestState = {
    accumulatedContent: "",
    hasMeaningfulCompletionSignal: false,
    hasFinalAnswerRequiredProcessBoundary: false,
    hasAssistantTextAfterLatestFinalAnswerRequiredProcessBoundary: false,
    requestLogId: null,
    requestStartedAt: 0,
    submissionDispatchedAt: null,
    submissionAcceptedAt: null,
    listenerBoundAt: null,
    firstEventReceivedAt: null,
    firstRuntimeStatusAt: null,
    firstThinkingDeltaAt: null,
    firstTextDeltaAt: null,
    firstTextPaintAt: null,
    firstTextPaintScheduled: false,
    firstTextRenderFlushAt: null,
    lastTextRenderFlushAt: null,
    textDeltaBufferedCount: 0,
    textDeltaFlushCount: 0,
    maxTextDeltaBacklogChars: 0,
    requestFinished: false,
    pendingTextRenderTimerId: null,
    renderedContent: "",
    activeTextSegmentTurnId: null,
    activeTextSegmentSequence: null,
    latestAssistantTextEventSequence: null,
    maxProcessEventSequence: null,
    maxFinalAnswerRequiredProcessEventSequence: null,
    performanceTrace: null,
  };
  const optimisticStartedAt = assistantMsg.timestamp.toISOString();
  const pendingTurnKey = createPendingTurnKey();
  const pendingItemKey = createPendingItemKey(pendingTurnKey);
  const eventName = `agent_stream_${assistantMsgId}`;
  const turnUserMsg = userMsg
    ? {
        ...userMsg,
        runtimeTurnId: userMsg.runtimeTurnId || pendingTurnKey,
      }
    : null;
  const turnAssistantMsg = {
    ...assistantMsg,
    runtimeTurnId: assistantMsg.runtimeTurnId || pendingTurnKey,
  };
  const toolLogIdByToolId = new Map<string, string>();
  const toolStartedAtByToolId = new Map<string, number>();
  const toolNameByToolId = new Map<string, string>();
  const actionLoggedKeys = new Set<string>();

  const removeOptimisticMessages = () => {
    setMessages((prev) =>
      prev.filter(
        (msg) =>
          msg.id !== assistantMsgId &&
          (userMsgId ? msg.id !== userMsgId : true),
      ),
    );
  };

  const clearOptimisticItem = () => {
    setThreadItems((prev) => removeThreadItemState(prev, pendingItemKey));
  };

  const clearOptimisticTurn = () => {
    setThreadTurns((prev) => removeThreadTurnState(prev, pendingTurnKey));
    setCurrentTurnId((prev) => (prev === pendingTurnKey ? null : prev));
  };

  const markOptimisticFailure = (errorMessage: string) => {
    const failedAt = new Date().toISOString();
    const failedRuntimeStatus = buildFailedAgentRuntimeStatus(errorMessage);

    setThreadTurns((prev) => {
      const currentTurn = prev.find((turn) => turn.id === pendingTurnKey);
      if (!currentTurn) {
        return prev;
      }

      return upsertThreadTurnState(prev, {
        ...currentTurn,
        status: "failed",
        error_message: errorMessage,
        completed_at: currentTurn.completed_at || failedAt,
        updated_at: failedAt,
      });
    });

    setThreadItems((prev) => {
      const currentItem = prev.find((item) => item.id === pendingItemKey);
      if (!currentItem || currentItem.type !== "turn_summary") {
        return prev;
      }

      return upsertThreadItemState(prev, {
        ...currentItem,
        status: "failed",
        completed_at: currentItem.completed_at || failedAt,
        updated_at: failedAt,
        text: formatAgentRuntimeStatusSummary(failedRuntimeStatus),
      });
    });
  };

  const disposeListener = () => {
    const registered = listenerMapRef.current.get(eventName);
    if (registered) {
      registered();
      listenerMapRef.current.delete(eventName);
    } else if (unlisten) {
      unlisten();
    }
    unlisten = null;
  };

  const activateStream = (
    activeSessionId: string,
    effectiveWaitingRuntimeStatus: NonNullable<Message["runtimeStatus"]>,
    canonicalThreadId?: string,
  ) => {
    if (streamActivated) {
      return;
    }
    streamActivated = true;
    setActiveStream({
      assistantMsgId,
      eventName,
      sessionId: activeSessionId,
      pendingTurnKey,
      pendingItemKey,
      submittedDraft: submittedDraft ?? null,
    });
    setMessages((prev) => {
      const equivalentPendingUserMsg = findEquivalentPendingUserMessage(
        prev,
        turnUserMsg,
      );
      const hasUserMsg = userMsg
        ? prev.some((msg) => msg.id === userMsg.id) ||
          Boolean(equivalentPendingUserMsg)
        : true;
      const hasAssistantMsg = prev.some((msg) => msg.id === assistantMsgId);
      let nextMessages = prev;

      if (!hasAssistantMsg) {
        nextMessages = [...nextMessages, turnAssistantMsg];
      }
      if (!hasUserMsg && turnUserMsg) {
        const assistantIndex = nextMessages.findIndex(
          (msg) => msg.id === assistantMsgId,
        );
        nextMessages =
          assistantIndex >= 0
            ? [
                ...nextMessages.slice(0, assistantIndex),
                turnUserMsg,
                ...nextMessages.slice(assistantIndex),
              ]
            : [...nextMessages, turnUserMsg];
      }
      return nextMessages.map((msg) =>
        (msg.id === userMsgId ||
          (equivalentPendingUserMsg &&
            msg.id === equivalentPendingUserMsg.id)) &&
        turnUserMsg
          ? {
              ...msg,
              runtimeTurnId: msg.runtimeTurnId || pendingTurnKey,
            }
          : msg.id === assistantMsgId
            ? {
                ...msg,
                runtimeStatus: effectiveWaitingRuntimeStatus,
                runtimeTurnId: msg.runtimeTurnId || pendingTurnKey,
              }
            : msg,
      );
    });

    const updatedAt = new Date().toISOString();
    setThreadTurns((prev) =>
      upsertThreadTurnState(prev, {
        id: pendingTurnKey,
        thread_id: canonicalThreadId || activeSessionId,
        prompt_text: content,
        status: "running",
        started_at: optimisticStartedAt,
        created_at: optimisticStartedAt,
        updated_at: updatedAt,
      }),
    );
    setThreadItems((prev) =>
      upsertThreadItemState(prev, {
        id: pendingItemKey,
        thread_id: canonicalThreadId || activeSessionId,
        turn_id: pendingTurnKey,
        sequence: 0,
        status: "in_progress",
        started_at: optimisticStartedAt,
        updated_at: updatedAt,
        type: "turn_summary",
        text: formatAgentRuntimeStatusSummary(effectiveWaitingRuntimeStatus),
      }),
    );
    setCurrentTurnId(pendingTurnKey);
  };

  const registerListener = (nextUnlisten: () => void) => {
    unlisten = nextUnlisten;
    listenerMapRef.current.set(eventName, nextUnlisten);
  };

  return {
    eventName,
    requestState,
    pendingTurnKey,
    pendingItemKey,
    toolLogIdByToolId,
    toolStartedAtByToolId,
    toolNameByToolId,
    actionLoggedKeys,
    activateStream,
    clearOptimisticItem,
    clearOptimisticTurn,
    disposeListener,
    removeOptimisticMessages,
    markOptimisticFailure,
    registerListener,
    isStreamActivated: () => streamActivated,
  };
}
