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
import { truncateText } from "@limecloud/agent-runtime-projection";
import { buildAgentUiProjectionBase } from "./projectionBase";

type QueueLifecycleEvent =
  | AgentEventQueueRemoved
  | AgentEventQueueStarted
  | AgentEventQueueCleared;

export function buildQueueAddedEvents(
  event: AgentEventQueueAdded,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent[] {
  const base = buildAgentUiProjectionBase(event, context);
  const queuedTurn = event.queued_turn;
  return [
    {
      ...base,
      type: "queue.changed",
      sessionId: event.session_id,
      taskId: queuedTurn.queued_turn_id,
      owner: "task",
      scope: "task",
      phase: "waiting",
      surface: "task_capsule",
      persistence: "snapshot",
      control: "queue",
      runtimeStatus: "queued",
      latestTurnStatus: "queued",
      queuedTurnCount: 1,
      payload: {
        runtimeEntity: base.runtimeEntity,
        queueEvent: event.type,
        queuedTurnCount: 1,
        queuedTurnId: queuedTurn.queued_turn_id,
        position: queuedTurn.position,
        messagePreview: truncateText(queuedTurn.message_preview),
        imageCount: queuedTurn.image_count,
        createdAt: queuedTurn.created_at,
      },
    },
    {
      ...base,
      type: "task.changed",
      sessionId: event.session_id,
      taskId: queuedTurn.queued_turn_id,
      owner: "task",
      scope: "turn",
      phase: "submitted",
      surface: "task_capsule",
      persistence: "snapshot",
      control: "steer",
      runtimeStatus: "queued",
      latestTurnStatus: "queued",
      queuedTurnCount: 1,
      payload: {
        runtimeEntity: base.runtimeEntity,
        taskEvent: "steer_intent",
        intentKind: "queued_user_input",
        queuedTurnId: queuedTurn.queued_turn_id,
        position: queuedTurn.position,
        messagePreview: truncateText(queuedTurn.message_preview),
        messageLength: queuedTurn.message_text.length,
        imageCount: queuedTurn.image_count,
        createdAt: queuedTurn.created_at,
      },
    },
  ];
}

function buildQueueChangedEvent(
  event: QueueLifecycleEvent,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  const base = buildAgentUiProjectionBase(event, context);
  const queuedTurnCount =
    event.type === "queue_cleared" ? event.queued_turn_ids.length : 1;
  return {
    ...base,
    type: "queue.changed",
    sessionId: event.session_id,
    taskId: event.type === "queue_cleared" ? undefined : event.queued_turn_id,
    owner: "task",
    scope: "task",
    phase: event.type === "queue_started" ? "accepted" : "waiting",
    surface: "task_capsule",
    persistence: "snapshot",
    runtimeStatus: event.type === "queue_started" ? "running" : "queued",
    latestTurnStatus: event.type === "queue_started" ? "running" : "queued",
    queuedTurnCount,
    payload: {
      runtimeEntity: base.runtimeEntity,
      queueEvent: event.type,
      queuedTurnCount,
    },
  };
}

function buildQueueTaskChangedEvent(params: {
  event: QueueLifecycleEvent;
  context: AgentUiProjectionContext;
  queuedTurnId: string;
  index?: number;
}): AgentUiProjectionEvent {
  const { event, context, queuedTurnId, index } = params;
  const base = buildAgentUiProjectionBase(event, context);
  const started = event.type === "queue_started";
  return {
    ...base,
    type: "task.changed",
    sessionId: event.session_id,
    taskId: queuedTurnId,
    owner: "task",
    scope: "turn",
    phase: started ? "accepted" : "cancelled",
    surface: "task_capsule",
    persistence: "snapshot",
    control: started ? "steer" : "remove",
    runtimeStatus: started ? "running" : "cancelled",
    latestTurnStatus: started ? "running" : "cancelled",
    payload: {
      runtimeEntity: base.runtimeEntity,
      taskEvent: started ? "steer_started" : "steer_removed",
      intentKind: "queued_user_input",
      queueEvent: event.type,
      queuedTurnId,
      ...(typeof index === "number" ? { clearedIndex: index } : {}),
      ...(event.type === "queue_cleared"
        ? { clearedCount: event.queued_turn_ids.length }
        : {}),
    },
  };
}

export function buildQueueLifecycleEvents(
  event: QueueLifecycleEvent,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent[] {
  const primary = buildQueueChangedEvent(event, context);
  if (event.type === "queue_cleared") {
    return [
      primary,
      ...event.queued_turn_ids.map((queuedTurnId, index) =>
        buildQueueTaskChangedEvent({
          event,
          context,
          queuedTurnId,
          index,
        }),
      ),
    ];
  }

  return [
    primary,
    buildQueueTaskChangedEvent({
      event,
      context,
      queuedTurnId: event.queued_turn_id,
    }),
  ];
}
