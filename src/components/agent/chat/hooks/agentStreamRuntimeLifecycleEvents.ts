import type { AgentEvent, AgentThreadItem } from "@/lib/api/agentProtocol";
import type { Message } from "../types";
import { appendTextToParts } from "./agentChatHistory";
import {
  removeThreadItemState,
  removeThreadTurnState,
  upsertThreadItemState,
  upsertThreadTurnState,
} from "./agentThreadState";
import {
  isStreamedReasoningTimelineItem,
  removeStreamedReasoningTimelineItems,
  resetStreamedReasoningSegment,
} from "./agentStreamReasoningTimeline";
import {
  buildAgentStreamFinalDonePlan,
  buildAgentStreamMissingFinalReplyFailurePlan,
  type AgentStreamFinalDonePlan,
  type AgentStreamMissingFinalReplyPlan,
} from "./agentStreamCompletionController";
import {
  isPersistedReasoningContentPart,
  syncAssistantReasoningContentPartFromThreadItem,
} from "./agentStreamReasoningContentSync";
import {
  syncExistingMessageToolCallFromThreadItem,
} from "./agentStreamToolItemMessageSync";
import {
  buildAgentStreamTurnStartedPendingItemUpdate,
  shouldDeferAgentStreamThreadItemUpdate,
} from "./agentStreamThreadItemController";
import {
  bindAssistantMessageToRuntimeTurn,
  extractVisibleTextFromAgentMessage,
} from "./agentStreamRuntimeHandlerUtils";
import { shouldUseAgentMessageAsFinalText } from "../utils/agentMessagePhase";
import type {
  HandleTurnStreamEventOptions,
  StreamRequestState,
} from "./agentStreamRuntimeHandlerTypes";

type RuntimeHandlerStateSetters = Pick<
  HandleTurnStreamEventOptions,
  | "getThreadItems"
  | "setCurrentTurnId"
  | "setMessages"
  | "setThreadItems"
  | "setThreadTurns"
>;

type AgentStreamCompletionMessagePlan = Extract<
  AgentStreamFinalDonePlan,
  { type: "complete" }
> & {
  usage?: Message["usage"];
};

function noteCompletedTextAsAssistantReplyIfNeeded(
  requestState: StreamRequestState,
) {
  if (!requestState.hasFinalAnswerRequiredProcessBoundary) {
    return;
  }
  requestState.hasAssistantTextAfterLatestFinalAnswerRequiredProcessBoundary =
    true;
}

export function handleAgentStreamMessageSnapshotEvent(params: {
  assistantMsgId: string;
  event: Extract<AgentEvent, { type: "message" }>;
  requestState: StreamRequestState;
  setMessages: RuntimeHandlerStateSetters["setMessages"];
  shouldPreserveAssistantContent: boolean;
  surfaceThinkingDeltas: boolean;
}): void {
  const snapshotText = extractVisibleTextFromAgentMessage(params.event.message);
  const shouldPrefillVisibleText =
    !params.shouldPreserveAssistantContent &&
    params.event.message.role === "assistant" &&
    !params.requestState.renderedContent &&
    !params.requestState.accumulatedContent &&
    snapshotText.trim().length > 0;
  if (!shouldPrefillVisibleText) {
    return;
  }

  params.requestState.accumulatedContent = snapshotText;
  params.requestState.renderedContent = snapshotText;
  params.requestState.prefilledMessageSnapshotReplayOffset = 0;
  params.requestState.prefilledMessageSnapshotText = snapshotText;
  if (!params.requestState.firstTextRenderFlushAt) {
    params.requestState.firstTextRenderFlushAt = Date.now();
  }
  params.setMessages((prev) =>
    prev.map((msg) =>
      msg.id === params.assistantMsgId
        ? {
            ...msg,
            content: snapshotText,
            contentParts: appendTextToParts(
              params.surfaceThinkingDeltas
                ? msg.contentParts || []
                : (msg.contentParts || []).filter(
                    (part) =>
                      part.type !== "thinking" ||
                      isPersistedReasoningContentPart(part),
                  ),
              snapshotText,
            ),
          }
        : msg,
    ),
  );
}

export function handleAgentStreamQueueEvent(params: {
  event: Extract<
    AgentEvent,
    { type: "queue_added" | "queue_removed" | "queue_started" | "queue_cleared" }
  >;
  markQueuedDraftState: (queuedMessageText?: string | null) => void;
  removeQueuedTurnState: (queuedTurnIds: string[]) => void;
  requestState: StreamRequestState;
  scheduleQueuedDraftCleanup: (shouldWatchCurrentRequest: boolean) => void;
  shouldWatchAgentStreamQueuedDraftCleanup: (params: {
    affectedQueuedTurnId: string;
    currentQueuedTurnId: string | null;
  }) => boolean;
  shouldWatchAgentStreamQueuedDraftCleanupForCleared: (params: {
    clearedQueuedTurnIds: string[];
    currentQueuedTurnId: string | null;
  }) => boolean;
  upsertQueuedTurn: HandleTurnStreamEventOptions["callbacks"]["upsertQueuedTurn"];
  clearQueuedDraftCleanupTimer: () => void;
  activateStream: () => void;
}): void {
  switch (params.event.type) {
    case "queue_added":
      params.requestState.queuedTurnId =
        params.event.queued_turn.queued_turn_id;
      params.upsertQueuedTurn(params.event.queued_turn);
      params.markQueuedDraftState(params.event.queued_turn.message_text);
      break;
    case "queue_removed":
      params.removeQueuedTurnState([params.event.queued_turn_id]);
      params.scheduleQueuedDraftCleanup(
        params.shouldWatchAgentStreamQueuedDraftCleanup({
          affectedQueuedTurnId: params.event.queued_turn_id,
          currentQueuedTurnId: params.requestState.queuedTurnId,
        }),
      );
      break;
    case "queue_started":
      params.requestState.queuedTurnId = params.event.queued_turn_id;
      params.removeQueuedTurnState([params.event.queued_turn_id]);
      params.clearQueuedDraftCleanupTimer();
      params.activateStream();
      break;
    case "queue_cleared":
      params.removeQueuedTurnState(params.event.queued_turn_ids);
      params.scheduleQueuedDraftCleanup(
        params.shouldWatchAgentStreamQueuedDraftCleanupForCleared({
          clearedQueuedTurnIds: params.event.queued_turn_ids,
          currentQueuedTurnId: params.requestState.queuedTurnId,
        }),
      );
      break;
    default:
      break;
  }
}

export function handleAgentStreamTurnStartedEvent(params: {
  assistantMsgId: string;
  event: Extract<AgentEvent, { type: "turn_started" }>;
  pendingItemKey: string;
  pendingTurnKey: string;
  requestState: StreamRequestState;
  setters: RuntimeHandlerStateSetters;
}): void {
  params.requestState.currentTurnId = params.event.turn.id;
  bindAssistantMessageToRuntimeTurn(
    params.setters.setMessages,
    params.assistantMsgId,
    params.event.turn.id,
  );
  params.setters.setCurrentTurnId(params.event.turn.id);
  params.setters.setThreadTurns((prev) =>
    upsertThreadTurnState(
      removeThreadTurnState(prev, params.pendingTurnKey),
      params.event.turn,
    ),
  );
  params.setters.setThreadItems((prev) => {
    const pendingItem = prev.find((item) => item.id === params.pendingItemKey);
    const updatedPendingItem = buildAgentStreamTurnStartedPendingItemUpdate({
      pendingItem,
      turn: params.event.turn,
    });
    if (!updatedPendingItem) {
      return prev;
    }

    return upsertThreadItemState(
      removeThreadItemState(prev, params.pendingItemKey),
      updatedPendingItem,
    );
  });
}

export function handleAgentStreamThreadItemLifecycleEvent(params: {
  assistantMsgId: string;
  event: Extract<
    AgentEvent,
    { type: "item_started" | "item_completed" | "item_updated" }
  >;
  pendingItemKey: string;
  requestState: StreamRequestState;
  setters: RuntimeHandlerStateSetters;
}): "deferred" | "applied" {
  params.requestState.currentTurnId = params.event.item.turn_id;
  if (params.event.item.type === "reasoning") {
    resetStreamedReasoningSegment(params.requestState);
  }
  bindAssistantMessageToRuntimeTurn(
    params.setters.setMessages,
    params.assistantMsgId,
    params.event.item.turn_id,
  );
  if (
    params.event.type === "item_updated" &&
    shouldDeferAgentStreamThreadItemUpdate(params.event.item)
  ) {
    return "deferred";
  }

  let nextThreadItemsForSync: readonly AgentThreadItem[] =
    params.setters.getThreadItems?.() ?? [];
  params.setters.setThreadItems((prev) => {
    const nextItems = upsertThreadItemState(
      params.event.item.type === "reasoning"
        ? removeStreamedReasoningTimelineItems(
            removeThreadItemState(prev, params.pendingItemKey),
            params.event.item.turn_id,
          )
        : removeThreadItemState(prev, params.pendingItemKey),
      params.event.item,
    );
    nextThreadItemsForSync = nextItems;
    return nextItems;
  });
  syncExistingMessageToolCallFromThreadItem({
    assistantMsgId: params.assistantMsgId,
    item: params.event.item,
    setMessages: params.setters.setMessages,
  });
  syncAssistantReasoningContentPartFromThreadItem({
    assistantMsgId: params.assistantMsgId,
    item: params.event.item,
    threadItems: nextThreadItemsForSync,
    setMessages: params.setters.setMessages,
  });
  return "applied";
}

export function handleAgentStreamTurnCompletedEvent(params: {
  assistantFallbackContent?: string | null;
  assistantMsgId: string;
  completeAssistantStreamMessageFromCompletionPlan: (
    plan: AgentStreamCompletionMessagePlan,
  ) => void;
  event: Extract<AgentEvent, { type: "turn_completed" }>;
  finalizeMissingFinalReplyFailure: (plan: AgentStreamMissingFinalReplyPlan) => void;
  pendingTurnKey: string;
  requestState: StreamRequestState;
  shouldPreserveAssistantContent: boolean;
  setters: RuntimeHandlerStateSetters;
  toolCallCount: number;
}): void {
  params.requestState.currentTurnId = params.event.turn.id;
  bindAssistantMessageToRuntimeTurn(
    params.setters.setMessages,
    params.assistantMsgId,
    params.event.turn.id,
  );
  params.setters.setThreadTurns((prev) =>
    upsertThreadTurnState(
      removeThreadTurnState(prev, params.pendingTurnKey),
      params.event.turn,
    ),
  );
  params.setters.setCurrentTurnId(params.event.turn.id);
  const completedAt = params.event.turn.completed_at || new Date().toISOString();
  params.setters.setThreadItems((prev) =>
    prev.map((item) =>
      isStreamedReasoningTimelineItem(item, params.event.turn.id) ||
      (item.type === "agent_message" &&
        item.turn_id === params.event.turn.id &&
        !shouldUseAgentMessageAsFinalText(item.phase))
        ? {
            ...item,
            status: "completed",
            completed_at: item.completed_at || completedAt,
            updated_at: completedAt,
          }
        : item,
    ),
  );
  resetStreamedReasoningSegment(params.requestState);
  if (
    params.event.text?.trim() &&
    !params.shouldPreserveAssistantContent
  ) {
    const completedText = params.event.text;
    const existingContent = params.requestState.accumulatedContent;
    const shouldPreferCompletedText =
      Boolean(params.requestState.hasFinalAnswerRequiredProcessBoundary) &&
      completedText.trim().length > 0;
    const completedTextAdopted = shouldPreferCompletedText || !existingContent.trim()
      ? true
      : completedText.startsWith(existingContent) &&
        completedText.length > existingContent.length;
    const nextContent = shouldPreferCompletedText
      ? completedText
      : !existingContent.trim()
      ? completedText
      : completedText.startsWith(existingContent)
        ? completedText
        : existingContent;
    params.requestState.accumulatedContent = nextContent;
    params.requestState.renderedContent = nextContent;
    if (
      completedTextAdopted ||
      params.requestState.hasFinalAnswerRequiredProcessBoundary
    ) {
      noteCompletedTextAsAssistantReplyIfNeeded(params.requestState);
    }
  }
  const turnCompletedPlan = buildAgentStreamFinalDonePlan({
    accumulatedContent: params.requestState.accumulatedContent,
    fallbackContent: params.assistantFallbackContent,
    hasAssistantTextAfterLatestFinalAnswerRequiredProcessBoundary:
      params.requestState
        .hasAssistantTextAfterLatestFinalAnswerRequiredProcessBoundary,
    hasFinalAnswerRequiredProcessBoundary:
      params.requestState.hasFinalAnswerRequiredProcessBoundary,
    hasMeaningfulCompletionSignal:
      params.requestState.hasMeaningfulCompletionSignal,
    queuedTurnId: params.requestState.queuedTurnId,
    toolCallCount: params.toolCallCount,
    usage: params.event.usage,
  });
  if (turnCompletedPlan.type === "missing_final_reply_failure") {
    params.finalizeMissingFinalReplyFailure(turnCompletedPlan);
    return;
  }
  params.completeAssistantStreamMessageFromCompletionPlan({
    ...turnCompletedPlan,
    usage: params.event.usage,
  });
}

export function handleAgentStreamTurnCanceledEvent(params: {
  assistantMsgId: string;
  completeInterruptedTurn: (
    turn: Extract<AgentEvent, { type: "turn_canceled" }>["turn"],
  ) => void;
  event: Extract<AgentEvent, { type: "turn_canceled" }>;
  pendingTurnKey: string;
  setters: RuntimeHandlerStateSetters;
}): void {
  bindAssistantMessageToRuntimeTurn(
    params.setters.setMessages,
    params.assistantMsgId,
    params.event.turn.id,
  );
  params.setters.setThreadTurns((prev) =>
    upsertThreadTurnState(
      removeThreadTurnState(prev, params.pendingTurnKey),
      params.event.turn,
    ),
  );
  params.completeInterruptedTurn(params.event.turn);
}

export function handleAgentStreamTurnFailedEvent(params: {
  assistantMsgId: string;
  event: Extract<AgentEvent, { type: "turn_failed" }>;
  finalizeMissingFinalReplyFailure: (plan: AgentStreamMissingFinalReplyPlan) => void;
  pendingTurnKey: string;
  requestState: StreamRequestState;
  setters: RuntimeHandlerStateSetters;
}): void {
  bindAssistantMessageToRuntimeTurn(
    params.setters.setMessages,
    params.assistantMsgId,
    params.event.turn.id,
  );
  params.setters.setThreadTurns((prev) =>
    upsertThreadTurnState(
      removeThreadTurnState(prev, params.pendingTurnKey),
      params.event.turn,
    ),
  );
  params.setters.setCurrentTurnId(params.event.turn.id);
  params.finalizeMissingFinalReplyFailure(
    buildAgentStreamMissingFinalReplyFailurePlan({
      errorMessage: params.event.turn.error_message || "当前处理失败",
      queuedTurnId: params.requestState.queuedTurnId,
    }),
  );
}
