import type {
  AgentEventMessage,
  AgentEventTextDelta,
  AgentEventTextDeltaBatch,
  AgentEventThinkingDelta,
} from "@/lib/api/agentProtocol";
import type {
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
} from "@limecloud/agent-ui-contracts";
import { truncateText } from "@limecloud/agent-runtime-projection";
import { buildAgentUiProjectionBase as buildBase } from "./projectionBase";

export function buildMessageSnapshotEvent(
  event: AgentEventMessage,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  return {
    ...buildBase(event, context),
    type: "messages.snapshot",
    owner: "session",
    scope: "message",
    phase: "hydrating",
    surface: "conversation",
    persistence: "snapshot",
    payload: {
      role: event.message.role,
      partCount: event.message.content.length,
    },
  };
}

export function buildTextDeltaEvent(
  event: AgentEventTextDelta | AgentEventTextDeltaBatch,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  return {
    ...buildBase(event, context),
    type: "text.delta",
    owner: "model",
    scope: "part",
    phase: "producing",
    surface: "conversation",
    persistence: "transcript",
    payload: {
      textLength: event.text.length,
      preview: truncateText(event.text),
      ...(event.type === "text_delta_batch"
        ? {
            chunkCount: event.chunks.length,
            boundary: event.boundary,
          }
        : {}),
    },
  };
}

export function buildThinkingDeltaEvent(
  event: AgentEventThinkingDelta,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  return {
    ...buildBase(event, context),
    type: "reasoning.delta",
    owner: "model",
    scope: "part",
    phase: "reasoning",
    surface: "inline_process",
    persistence: "ephemeral_live",
    payload: {
      textLength: event.text.length,
      preview: truncateText(event.text),
    },
  };
}
