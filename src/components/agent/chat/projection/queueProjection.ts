import type {
  AgentEventQueueAdded,
  AgentEventQueueCleared,
  AgentEventQueueRemoved,
  AgentEventQueueStarted,
} from "@/lib/api/agentProtocol";
import type {
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
} from "@limecloud/agent-ui-contracts";
import {
  buildAgentUiQueueAddedEvents,
  buildAgentUiQueueLifecycleEvents,
} from "@limecloud/agent-runtime-projection";

type QueueLifecycleEvent =
  | AgentEventQueueRemoved
  | AgentEventQueueStarted
  | AgentEventQueueCleared;

export function buildQueueAddedEvents(
  event: AgentEventQueueAdded,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent[] {
  return buildAgentUiQueueAddedEvents(
    {
      sourceType: event.type,
      sessionId: event.session_id,
      queuedTurn: {
        queuedTurnId: event.queued_turn.queued_turn_id,
        messagePreview: event.queued_turn.message_preview,
        messageText: event.queued_turn.message_text,
        createdAt: event.queued_turn.created_at,
        imageCount: event.queued_turn.image_count,
        position: event.queued_turn.position,
      },
    },
    context,
  );
}

export function buildQueueLifecycleEvents(
  event: QueueLifecycleEvent,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent[] {
  return buildAgentUiQueueLifecycleEvents(
    {
      sourceType: event.type,
      eventType: event.type,
      sessionId: event.session_id,
      ...(event.type === "queue_cleared"
        ? { queuedTurnIds: event.queued_turn_ids }
        : { queuedTurnId: event.queued_turn_id }),
    },
    context,
  );
}
