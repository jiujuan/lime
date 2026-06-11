import type {
  AgentRuntimeExecutionEvent,
  AgentRuntimeExecutionEventKind,
  AgentRuntimeExecutionEventStatus,
  AgentRuntimeFactOwner,
  AgentRuntimePhase,
  AgentUiProjectionEvent,
} from "@limecloud/agent-ui-contracts";

export function agentUiProjectionEventToRuntimeEvent(
  event: AgentUiProjectionEvent,
): AgentRuntimeExecutionEvent {
  const payload = {
    ...(event.payload ?? {}),
    sessionId: event.sessionId,
    threadId: event.threadId,
    projectionType: event.type,
    sourceType: event.sourceType,
    surface: event.surface,
    persistence: event.persistence,
    control: event.control,
  };
  const artifactRefs = [
    ...(event.artifactId ? [event.artifactId] : []),
    ...(event.refs?.artifactIds ?? []),
    ...(event.refs?.artifactPaths ?? []),
  ];
  const evidenceRefs = [
    ...(event.evidenceId ? [event.evidenceId] : []),
    ...(event.refs?.rawEventRef ? [event.refs.rawEventRef] : []),
  ];
  return {
    id: stableRuntimeEventId(event),
    kind: runtimeEventKindForProjection(event),
    status: runtimeEventStatusForProjection(event),
    eventClass: runtimeEventClassForProjection(event),
    owner: runtimeEventOwnerForProjection(event),
    sequence: event.sequence,
    runtimeId: event.runId,
    threadId: event.threadId,
    turnId: event.turnId,
    taskId: event.taskId,
    runId: event.runId,
    toolCallId: event.toolCallId,
    actionId: event.actionId,
    artifactId: event.artifactId,
    evidenceId: event.evidenceId,
    phase: runtimeEventPhaseForProjection(event),
    title: runtimeEventTitleForProjection(event),
    detail: readProjectionPayloadString(event, "preview"),
    refIds: event.refs?.rawEventRef ? [event.refs.rawEventRef] : undefined,
    artifactRefs: artifactRefs.length ? [...new Set(artifactRefs)] : undefined,
    evidenceRefs: evidenceRefs.length ? [...new Set(evidenceRefs)] : undefined,
    payload,
    createdAt: event.timestamp ?? new Date(0).toISOString(),
    completedAt: runtimeEventStatusForProjection(event) === "completed" ? event.timestamp : undefined,
  };
}

function stableRuntimeEventId(event: AgentUiProjectionEvent): string {
  return (
    event.rawEventRef ??
    event.payload?.sourceEventId?.toString() ??
    event.partId ??
    event.toolCallId ??
    event.actionId ??
    event.artifactId ??
    event.evidenceId ??
    `${event.type}:${event.sequence ?? "unknown"}`
  );
}

function runtimeEventKindForProjection(event: AgentUiProjectionEvent): AgentRuntimeExecutionEventKind {
  if (event.type.startsWith("text.")) return "model";
  if (event.type.startsWith("reasoning.")) return "note";
  if (event.type.startsWith("tool.")) return "tool";
  if (event.type.startsWith("action.")) return "action";
  if (event.type.startsWith("artifact.")) return "draft";
  if (event.type.startsWith("evidence.")) return "evidence";
  if (event.type.startsWith("diagnostic.") || event.type.startsWith("metric.")) return "state";
  if (event.type.startsWith("queue.") || event.type.startsWith("task.")) return "state";
  return "state";
}

function runtimeEventClassForProjection(event: AgentUiProjectionEvent): AgentRuntimeExecutionEvent["eventClass"] {
  if (event.type === "text.delta") return "model.delta";
  if (event.type === "text.final") return "model.completed";
  if (event.type === "reasoning.delta") return "reasoning.delta";
  if (event.type === "reasoning.summary") return "reasoning.summary";
  if (event.type === "tool.started" || event.type === "tool.args" || event.type === "tool.args.delta") return "tool.started";
  if (event.type === "tool.result" || event.type === "tool.output.delta") return "tool.result";
  if (event.type === "tool.failed") return "tool.failed";
  if (event.type === "artifact.created" || event.type === "artifact.updated") return "artifact.changed";
  if (event.type === "evidence.changed") return "evidence.changed";
  if (event.type === "run.finished") return "turn.completed";
  if (event.type === "run.failed") return "turn.failed";
  if (event.type === "action.required" || event.type === "action.resolved") return event.type;
  if (event.type === "metric.changed") return "snapshot.updated";
  if (event.type === "diagnostic.changed") return "runtime.error";
  return "run.status";
}

function runtimeEventOwnerForProjection(event: AgentUiProjectionEvent): AgentRuntimeFactOwner {
  if (event.owner === "artifact") return "artifact";
  if (event.owner === "evidence") return "evidence";
  return "runtime";
}

function runtimeEventPhaseForProjection(event: AgentUiProjectionEvent): AgentRuntimePhase {
  if (event.phase === "submitted") return "submitted";
  if (event.phase === "routing") return "routing";
  if (event.phase === "preparing") return "preparing";
  if (event.phase === "producing" || event.phase === "reasoning") return "streaming";
  if (event.phase === "acting") return "tool_running";
  if (event.phase === "waiting") return "action_required";
  if (event.phase === "failed") return "failed";
  if (event.phase === "completed") return "completed";
  return "preparing";
}

function runtimeEventStatusForProjection(event: AgentUiProjectionEvent): AgentRuntimeExecutionEventStatus {
  if (event.type === "action.required") return "pending";
  const status = event.runtimeStatus ?? event.latestTurnStatus;
  if (status === "completed" || status === "closed") return "completed";
  if (status === "failed" || status === "aborted") return "failed";
  if (status === "needs_input" || status === "waiting") return "blocked";
  if (status === "running" || status === "submitted" || status === "accepted") return "running";
  return "pending";
}

function runtimeEventTitleForProjection(event: AgentUiProjectionEvent): string {
  return (
    readProjectionPayloadString(event, "displayTitle") ??
    readProjectionPayloadString(event, "title") ??
    readProjectionPayloadString(event, "toolName") ??
    readProjectionPayloadString(event, "metricName") ??
    readProjectionPayloadString(event, "eventType") ??
    event.type
  );
}

function readProjectionPayloadString(event: AgentUiProjectionEvent, key: string): string | undefined {
  const value = event.payload?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}
