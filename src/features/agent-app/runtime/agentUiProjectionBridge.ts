import type {
  AgentRuntimeExecutionEvent,
  AgentUiProjectionEvent,
} from "@limecloud/agent-ui-contracts";

import { buildProjectionEvent } from "./agentUiProjectionBuilders";
import { isRecord, readRecordArray, readString } from "./agentUiProjectionFieldReaders";
import { agentUiProjectionEventToRuntimeEvent } from "./agentUiRuntimeEventAdapter";

export interface AgentAppAgentUiProjectionBridgeOptions {
  appId?: string | null;
  taskId?: string | null;
  sessionId?: string | null;
  threadId?: string | null;
  runId?: string | null;
  turnId?: string | null;
  timestamp?: string | null;
  startSequence?: number;
  events?: unknown[];
}

interface NormalizedAgentAppTaskEvent {
  event: Record<string, unknown>;
  inherited: AgentAppAgentUiProjectionBridgeOptions;
}

export function buildAgentAppAgentUiProjectionEvents({
  events = [],
  ...context
}: AgentAppAgentUiProjectionBridgeOptions = {}): AgentUiProjectionEvent[] {
  const normalizedEvents = events.flatMap((event) =>
    normalizeAgentAppTaskEvents(event, context),
  );
  const projections = normalizedEvents
    .map(({ event, inherited }) => buildProjectionEvent(event, inherited))
    .filter(
      (event): event is Omit<AgentUiProjectionEvent, "sequence"> =>
        Boolean(event),
    );

  return projections.map((event, index) => ({
    ...event,
    sequence:
      typeof context.startSequence === "number"
        ? context.startSequence + index
        : index + 1,
  }));
}

export function buildAgentAppStandardRuntimeEvents(
  options: AgentAppAgentUiProjectionBridgeOptions = {},
): AgentRuntimeExecutionEvent[] {
  return buildAgentAppAgentUiProjectionEvents(options).map(agentUiProjectionEventToRuntimeEvent);
}

function normalizeAgentAppTaskEvents(
  value: unknown,
  inherited: AgentAppAgentUiProjectionBridgeOptions,
): NormalizedAgentAppTaskEvent[] {
  if (!isRecord(value)) {
    return [];
  }
  const nextInherited: AgentAppAgentUiProjectionBridgeOptions = {
    ...inherited,
    sessionId: readString(value, "sessionId") ?? inherited.sessionId,
    threadId: readString(value, "threadId") ?? inherited.threadId,
    turnId: readString(value, "turnId") ?? inherited.turnId,
    taskId: readString(value, "taskId") ?? inherited.taskId,
    runId: readString(value, "runtimeEventName") ?? inherited.runId,
    timestamp:
      readString(value, "occurredAt") ??
      readString(value, "emittedAt") ??
      inherited.timestamp,
  };
  const taskEvents = readRecordArray(value, "taskEvents");
  if (taskEvents.length > 0) {
    return taskEvents.flatMap((event) =>
      normalizeAgentAppTaskEvents(event, nextInherited),
    );
  }
  return [{ event: value, inherited: nextInherited }];
}
