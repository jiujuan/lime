import type {
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
  AgentUiProjectionSourceType,
} from "@limecloud/agent-ui-contracts";

import { buildAgentUiProjectionBase } from "./envelope.js";
import { truncateText } from "./normalization.js";

export interface AgentUiQueuedTurnProjectionInput {
  queuedTurnId: string;
  messagePreview: string;
  messageText: string;
  createdAt: number;
  imageCount: number;
  position: number;
}

export interface AgentUiQueueAddedProjectionInput {
  sourceType?: AgentUiProjectionSourceType | string;
  sessionId: string;
  queuedTurn: AgentUiQueuedTurnProjectionInput;
}

export type AgentUiQueueLifecycleEventType =
  | "queue_removed"
  | "queue_started"
  | "queue_cleared";

export interface AgentUiQueueLifecycleProjectionInput {
  sourceType?: AgentUiProjectionSourceType | string;
  eventType: AgentUiQueueLifecycleEventType;
  sessionId: string;
  queuedTurnId?: string;
  queuedTurnIds?: readonly string[];
}

export function buildAgentUiQueueAddedEvents(
  input: AgentUiQueueAddedProjectionInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent[] {
  const base = buildAgentUiProjectionBase(
    { sourceType: input.sourceType ?? "queue_added" },
    context,
  );
  const queuedTurn = input.queuedTurn;
  return [
    {
      ...base,
      type: "queue.changed",
      sessionId: input.sessionId,
      taskId: queuedTurn.queuedTurnId,
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
        queueEvent: "queue_added",
        queuedTurnCount: 1,
        queuedTurnId: queuedTurn.queuedTurnId,
        position: queuedTurn.position,
        messagePreview: truncateText(queuedTurn.messagePreview),
        imageCount: queuedTurn.imageCount,
        createdAt: queuedTurn.createdAt,
      },
    },
    {
      ...base,
      type: "task.changed",
      sessionId: input.sessionId,
      taskId: queuedTurn.queuedTurnId,
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
        queuedTurnId: queuedTurn.queuedTurnId,
        position: queuedTurn.position,
        messagePreview: truncateText(queuedTurn.messagePreview),
        messageLength: queuedTurn.messageText.length,
        imageCount: queuedTurn.imageCount,
        createdAt: queuedTurn.createdAt,
      },
    },
  ];
}

export function buildAgentUiQueueLifecycleEvents(
  input: AgentUiQueueLifecycleProjectionInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent[] {
  const primary = buildAgentUiQueueChangedEvent(input, context);
  if (input.eventType === "queue_cleared") {
    return [
      primary,
      ...(input.queuedTurnIds ?? []).map((queuedTurnId, index) =>
        buildAgentUiQueueTaskChangedEvent(
          {
            input,
            queuedTurnId,
            index,
          },
          context,
        ),
      ),
    ];
  }

  return [
    primary,
    buildAgentUiQueueTaskChangedEvent(
      {
        input,
        queuedTurnId: input.queuedTurnId ?? "",
      },
      context,
    ),
  ];
}

function buildAgentUiQueueChangedEvent(
  input: AgentUiQueueLifecycleProjectionInput,
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  const base = buildAgentUiProjectionBase(
    { sourceType: input.sourceType ?? input.eventType },
    context,
  );
  const queuedTurnCount =
    input.eventType === "queue_cleared" ? (input.queuedTurnIds?.length ?? 0) : 1;
  return {
    ...base,
    type: "queue.changed",
    sessionId: input.sessionId,
    taskId: input.eventType === "queue_cleared" ? undefined : input.queuedTurnId,
    owner: "task",
    scope: "task",
    phase: input.eventType === "queue_started" ? "accepted" : "waiting",
    surface: "task_capsule",
    persistence: "snapshot",
    runtimeStatus: input.eventType === "queue_started" ? "running" : "queued",
    latestTurnStatus:
      input.eventType === "queue_started" ? "running" : "queued",
    queuedTurnCount,
    payload: {
      runtimeEntity: base.runtimeEntity,
      queueEvent: input.eventType,
      queuedTurnCount,
    },
  };
}

function buildAgentUiQueueTaskChangedEvent(
  params: {
    input: AgentUiQueueLifecycleProjectionInput;
    queuedTurnId: string;
    index?: number;
  },
  context: AgentUiProjectionContext,
): AgentUiProjectionEvent {
  const { input, queuedTurnId, index } = params;
  const base = buildAgentUiProjectionBase(
    { sourceType: input.sourceType ?? input.eventType },
    context,
  );
  const started = input.eventType === "queue_started";
  return {
    ...base,
    type: "task.changed",
    sessionId: input.sessionId,
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
      queueEvent: input.eventType,
      queuedTurnId,
      ...(typeof index === "number" ? { clearedIndex: index } : {}),
      ...(input.eventType === "queue_cleared"
        ? { clearedCount: input.queuedTurnIds?.length ?? 0 }
        : {}),
    },
  };
}
