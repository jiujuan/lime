import type {
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
  AgentUiProjectionSourceType,
} from "@limecloud/agent-ui-contracts";

import { definedString } from "./normalization.js";
import { inferAgentUiRuntimeEntity } from "./runtimeFacts.js";

export interface AgentUiProjectionEnvelopeSource {
  sourceType: AgentUiProjectionSourceType | string;
  itemType?: string | null;
}

export type AgentUiProjectionBase = Pick<
  AgentUiProjectionEvent,
  | "sourceType"
  | "timestamp"
  | "sessionId"
  | "threadId"
  | "runId"
  | "turnId"
  | "messageId"
  | "partId"
  | "taskId"
  | "runtimeEntity"
>;

export function buildAgentUiProjectionBase(
  source: AgentUiProjectionEnvelopeSource,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionBase {
  return {
    sourceType: source.sourceType,
    timestamp: context.timestamp,
    sessionId: definedString(context.sessionId ?? undefined),
    threadId: definedString(context.threadId ?? undefined),
    runId: definedString(context.runId ?? undefined),
    turnId: definedString(context.turnId ?? undefined),
    messageId: definedString(context.messageId ?? undefined),
    taskId: definedString(context.taskId ?? undefined),
    runtimeEntity: inferAgentUiRuntimeEntity({
      runtimeEntity: context.runtimeEntity,
      sourceType: source.sourceType,
      itemType: source.itemType ?? undefined,
      runId: context.runId,
    }),
  };
}

export function sequenceAgentUiProjectionEvents(
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
