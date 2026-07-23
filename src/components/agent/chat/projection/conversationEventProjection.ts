import type {
  AgentEvent,
  AgentEventMessage,
  AgentEventReasoningContentDelta,
  AgentEventReasoningEnded,
  AgentEventReasoningSummaryDelta,
  AgentEventReasoningSummaryPartAdded,
  AgentEventReasoningStarted,
  AgentEventTextDelta,
  AgentEventTextDeltaBatch,
  AgentEventThinkingDelta,
  AgentEventReasoningDelta,
  AgentEventReasoningFinal,
} from "@/lib/api/agentProtocol";
import type {
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
} from "@limecloud/agent-ui-contracts";
import {
  buildAgentUiMessageSnapshotEvent,
  buildAgentUiReasoningDeltaEvent,
  buildAgentUiTextDeltaEvent,
} from "@limecloud/agent-runtime-projection";

type ConversationProjectionEvent = Extract<
  AgentEvent,
  {
    type:
      | "message"
      | "text_delta"
      | "text_delta_batch"
      | "thinking_delta"
      | "reasoning_delta"
      | "reasoning_summary_delta"
      | "reasoning_summary_part_added"
      | "reasoning_content_delta"
      | "reasoning_final"
      | "reasoning_started"
      | "reasoning_ended";
  }
>;

export function buildConversationProjectionEvents(
  event: ConversationProjectionEvent,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent[] {
  switch (event.type) {
    case "message":
      return [buildMessageSnapshotEvent(event, context)];
    case "text_delta":
    case "text_delta_batch":
      return [buildTextDeltaEvent(event, context)];
    case "thinking_delta":
    case "reasoning_delta":
    case "reasoning_final":
      return [buildThinkingDeltaEvent(event, context)];
    case "reasoning_summary_delta":
      return [buildReasoningSummaryEvent(event, context)];
    case "reasoning_summary_part_added":
    case "reasoning_content_delta":
      return buildReasoningNonVisibleEvents(event, context);
    case "reasoning_started":
    case "reasoning_ended":
      return buildReasoningLifecycleEvents(event, context);
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}

export function buildMessageSnapshotEvent(
  event: AgentEventMessage,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  return buildAgentUiMessageSnapshotEvent(
    {
      sourceType: event.type,
      role: event.message.role,
      partCount: event.message.content.length,
    },
    context,
  );
}

export function buildTextDeltaEvent(
  event: AgentEventTextDelta | AgentEventTextDeltaBatch,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  return buildAgentUiTextDeltaEvent(
    {
      sourceType: event.type,
      text: event.text,
      ...(event.type === "text_delta_batch"
        ? { chunkCount: event.chunks.length, boundary: event.boundary }
        : {}),
    },
    context,
  );
}

export function buildThinkingDeltaEvent(
  event:
    | AgentEventThinkingDelta
    | AgentEventReasoningDelta
    | AgentEventReasoningFinal,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  return buildAgentUiReasoningDeltaEvent(
    {
      sourceType: event.type,
      text:
        event.type === "reasoning_delta"
          ? event.text || event.delta || ""
          : event.type === "reasoning_final"
            ? event.text
            : event.text,
    },
    context,
  );
}

export function buildReasoningSummaryEvent(
  event: AgentEventReasoningSummaryDelta,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  return buildAgentUiReasoningDeltaEvent(
    {
      itemId: event.itemId,
      sourceType: event.type,
      streamKind: "summary",
      summaryIndex: event.summaryIndex,
      text: event.text,
    },
    context,
  );
}

export function buildReasoningNonVisibleEvents(
  _event: AgentEventReasoningSummaryPartAdded | AgentEventReasoningContentDelta,
  _context: AgentUiProjectionContext,
): AgentUiProjectionEvent[] {
  return [];
}

export function buildReasoningLifecycleEvents(
  _event: AgentEventReasoningStarted | AgentEventReasoningEnded,
  _context: AgentUiProjectionContext,
): AgentUiProjectionEvent[] {
  return [];
}
