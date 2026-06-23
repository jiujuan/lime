import type {
  AgentEventMessage,
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
