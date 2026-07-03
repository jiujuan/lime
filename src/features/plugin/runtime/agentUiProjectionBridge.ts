import type {
  AgentRuntimeExecutionEvent,
  AgentUiProjectionEvent,
} from "@limecloud/agent-ui-contracts";

import { buildProjectionEvent } from "./agentUiProjectionBuilders";
import { isRecord, readRecordArray, readString } from "./agentUiProjectionFieldReaders";
import { agentUiProjectionEventToRuntimeEvent } from "./agentUiRuntimeEventAdapter";

export interface PluginAgentUiProjectionBridgeOptions {
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

interface NormalizedPluginTaskEvent {
  event: Record<string, unknown>;
  inherited: PluginAgentUiProjectionBridgeOptions;
}

export function buildPluginAgentUiProjectionEvents({
  events = [],
  ...context
}: PluginAgentUiProjectionBridgeOptions = {}): AgentUiProjectionEvent[] {
  const normalizedEvents = events.flatMap((event) =>
    normalizePluginTaskEvents(event, context),
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

export function buildPluginStandardRuntimeEvents(
  options: PluginAgentUiProjectionBridgeOptions = {},
): AgentRuntimeExecutionEvent[] {
  return buildPluginAgentUiProjectionEvents(options).map(agentUiProjectionEventToRuntimeEvent);
}

function normalizePluginTaskEvents(
  value: unknown,
  inherited: PluginAgentUiProjectionBridgeOptions,
): NormalizedPluginTaskEvent[] {
  if (!isRecord(value)) {
    return [];
  }
  const nextInherited: PluginAgentUiProjectionBridgeOptions = {
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
      normalizePluginTaskEvents(event, nextInherited),
    );
  }
  return [{ event: value, inherited: nextInherited }];
}
