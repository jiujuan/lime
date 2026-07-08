import type { AgentRuntimeEventProjection, AgentRuntimeExecutionEvent } from "@limecloud/agent-ui-contracts";

import type { PluginRunProjectionRuntimeStatus } from "./agentUiProjectionViewModel";

export function standardProjectionType(
  projection: AgentRuntimeEventProjection,
): string {
  const payloadType = stringValue(projection.source.payload?.projectionType);
  if (payloadType) {
    return payloadType;
  }
  const eventClass = projection.source.eventClass ?? "";
  if (eventClass === "model.delta") return "text.delta";
  if (eventClass === "model.completed") return "text.final";
  if (eventClass.startsWith("reasoning.")) return "reasoning.delta";
  if (eventClass === "tool.started") return "tool.started";
  if (eventClass === "tool.result") return "tool.result";
  if (eventClass === "tool.failed") return "tool.failed";
  if (eventClass === "action.required") return "action.required";
  if (eventClass === "action.resolved") return "action.resolved";
  if (eventClass === "artifact.changed") return "artifact.created";
  if (eventClass === "evidence.changed") return "evidence.changed";
  if (eventClass === "runtime.error") return "diagnostic.changed";
  if (eventClass === "snapshot.updated") return "metric.changed";
  if (eventClass === "turn.completed") return "run.finished";
  if (eventClass === "turn.failed") return "run.failed";
  return "run.status";
}

export function pluginRuntimeStatusFromStandardEvent(
  event: AgentRuntimeExecutionEvent,
): PluginRunProjectionRuntimeStatus {
  if (event.eventClass === "action.required") return "needs_input";
  if (event.eventClass === "action.resolved") return "completed";
  if (event.status === "completed") return "completed";
  if (event.status === "failed") return "failed";
  if (event.status === "blocked") return "needs_input";
  if (event.status === "running") return "running";
  if (event.status === "pending") return "queued";
  return "unknown";
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
