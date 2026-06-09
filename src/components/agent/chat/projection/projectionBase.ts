import type { AgentEvent } from "@/lib/api/agentProtocol";
import type {
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
  AgentUiRuntimeEntity,
} from "@limecloud/agent-ui-contracts";
import {
  definedString,
  inferAgentUiRuntimeEntity,
} from "@limecloud/agent-runtime-projection";

export type AgentUiProjectionBase = Pick<
  AgentUiProjectionEvent,
  | "sourceType"
  | "timestamp"
  | "sessionId"
  | "threadId"
  | "runId"
  | "turnId"
  | "messageId"
  | "taskId"
  | "partId"
  | "runtimeEntity"
>;

type AgentProjectionSource = Pick<AgentEvent, "type"> & {
  item?: {
    type?: unknown;
  };
};

function inferRuntimeEntityFromSource(
  event: AgentProjectionSource,
  context: AgentUiProjectionContext,
): AgentUiRuntimeEntity {
  const itemType =
    typeof event.item?.type === "string" ? event.item.type : undefined;
  return inferAgentUiRuntimeEntity({
    runtimeEntity: context.runtimeEntity,
    sourceType: event.type,
    itemType,
    runId: context.runId,
  });
}

export function buildAgentUiProjectionBase(
  event: AgentProjectionSource,
  context: AgentUiProjectionContext,
): AgentUiProjectionBase {
  return {
    sourceType: event.type,
    timestamp: context.timestamp,
    sessionId: definedString(context.sessionId ?? undefined),
    threadId: definedString(context.threadId ?? undefined),
    runId: definedString(context.runId ?? undefined),
    turnId: definedString(context.turnId ?? undefined),
    messageId: definedString(context.messageId ?? undefined),
    taskId: definedString(context.taskId ?? undefined),
    runtimeEntity: inferRuntimeEntityFromSource(event, context),
  };
}

export function sequenceProjectionEvents(
  events: AgentUiProjectionEvent[],
  startSequence: number | undefined,
): AgentUiProjectionEvent[] {
  if (typeof startSequence !== "number") {
    return events;
  }
  return events.map((event, index) => ({
    ...event,
    sequence: startSequence + index,
  }));
}
