import type {
  AgentUiEventClass,
  AgentUiPhase,
  AgentUiProjectionEvent,
  AgentUiRuntimeStatus,
} from "@/components/agent/chat/projection/agentUiEventProjection";

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

const TEXT_PREVIEW_LIMIT = 160;

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

function buildProjectionEvent(
  event: Record<string, unknown>,
  context: AgentAppAgentUiProjectionBridgeOptions,
): Omit<AgentUiProjectionEvent, "sequence"> | null {
  const eventType = readString(event, "eventType") ?? readString(event, "type");
  const directAgentUiType = readDirectAgentUiEventClass(eventType);
  if (directAgentUiType) {
    return buildDirectAgentUiProjection(event, context, directAgentUiType);
  }
  const streamKind = readStreamKind(event);
  if (streamKind) {
    return buildStreamProjection(event, context, streamKind);
  }

  switch (eventType) {
    case "task:queued":
      return buildBaseProjection(event, context, {
        type: "queue.changed",
        sourceType: "queue_added",
        phase: "submitted",
        surface: "task_capsule",
        runtimeStatus: "queued",
        control: "queue",
      });
    case "task:toolCall":
      return buildToolProjection(event, context);
    case "task:reviewRequested":
    case "task:missingContextRequested":
    case "task:blocked":
      return buildActionProjection(event, context, "action.required");
    case "task:reviewResolved":
      return buildActionProjection(event, context, "action.resolved");
    case "artifact:created":
      return buildArtifactProjection(event, context);
    case "evidence:recorded":
    case "evidence:verified":
      return buildEvidenceProjection(event, context);
    case "metric.changed":
    case "task:metricChanged":
    case "task:costEstimated":
    case "task:costRecorded":
      return buildMetricProjection(event, context);
    case "diagnostic.changed":
    case "task:diagnostic":
    case "task:warning":
      return buildDiagnosticProjection(event, context);
    case "task:completed":
      return buildBaseProjection(event, context, {
        type: "run.finished",
        sourceType: "runtime_status",
        phase: "completed",
        surface: "runtime_status",
        runtimeStatus: "completed",
        persistence: "archive",
      });
    case "task:error":
      return buildBaseProjection(event, context, {
        type: "run.failed",
        sourceType: "runtime_status",
        phase: "failed",
        surface: "runtime_status",
        runtimeStatus: "failed",
        persistence: "archive",
      });
    case "task:cancelled":
      return buildBaseProjection(event, context, {
        type: "run.finished",
        sourceType: "runtime_status",
        phase: "cancelled",
        surface: "runtime_status",
        runtimeStatus: "cancelled",
        persistence: "archive",
      });
    case "task:progress":
    case "task:status":
    case "task:runtimeEvent":
    case "task:incident":
      return buildRuntimeStatusProjection(event, context);
    default:
      return eventType ? buildRuntimeStatusProjection(event, context) : null;
  }
}

function buildDirectAgentUiProjection(
  event: Record<string, unknown>,
  context: AgentAppAgentUiProjectionBridgeOptions,
  type: AgentUiEventClass,
): Omit<AgentUiProjectionEvent, "sequence"> {
  const payload = recordValue(event, "payload") ?? {};
  const controls = [
    ...readStringArray(event, "controls"),
    ...readStringArray(payload, "controls"),
  ].filter(isSupportedActionControl);
  return buildBaseProjection(event, context, {
    type,
    sourceType: sourceTypeForDirectAgentUiType(type),
    phase: phaseForDirectAgentUiType(type),
    surface: surfaceForDirectAgentUiType(type),
    runtimeStatus: runtimeStatusForDirectAgentUiType(type, event),
    persistence: persistenceForDirectAgentUiType(type),
    toolCallId: readString(event, "toolCallId") ?? readToolCallId(event),
    actionId: readString(event, "actionId") ?? readActionId(event),
    artifactId: readString(event, "artifactId") ?? readArtifactId(event),
    evidenceId: readString(event, "evidenceId") ?? readEvidenceRef(event),
    partId: readString(event, "partId") ?? readEventId(event),
    diagnosticId: readString(event, "diagnosticId") ?? readEventId(event),
    control: controlForDirectAgentUiEvent(event),
    refs: (recordValue(event, "refs") ?? undefined) as AgentUiProjectionEvent["refs"],
    payload: {
      ...payload,
      controls: controls.length > 0 ? uniqueControls(controls) : payload.controls,
      preview:
        readString(payload, "preview") ??
        truncateText(readString(event, "message")),
    },
  });
}

function buildStreamProjection(
  event: Record<string, unknown>,
  context: AgentAppAgentUiProjectionBridgeOptions,
  streamKind: string,
): Omit<AgentUiProjectionEvent, "sequence"> {
  const text = readStreamText(event);
  if (streamKind === "thinking_delta") {
    return buildBaseProjection(event, context, {
      type: "reasoning.delta",
      sourceType: "thinking_delta",
      phase: "reasoning",
      surface: "inline_process",
      runtimeStatus: "running",
      persistence: "ephemeral_live",
      partId: readEventId(event),
      payload: {
        streamKind,
        preview: truncateText(text),
        textLength: text.length,
      },
    });
  }
  if (streamKind === "tool_input_delta") {
    return buildBaseProjection(event, context, {
      type: "tool.args.delta",
      sourceType: "tool_input_delta",
      phase: "acting",
      surface: "tool_ui",
      runtimeStatus: "running",
      persistence: "ephemeral_live",
      toolCallId: readToolCallId(event),
      payload: {
        streamKind,
        toolName: readToolName(event),
        preview: truncateText(text),
        textLength: text.length,
      },
    });
  }
  if (streamKind === "tool_output_delta") {
    return buildBaseProjection(event, context, {
      type: "tool.output.delta",
      sourceType: "tool_output_delta",
      phase: "acting",
      surface: "tool_ui",
      runtimeStatus: "running",
      persistence: "ephemeral_live",
      toolCallId: readToolCallId(event),
      payload: {
        streamKind,
        toolName: readToolName(event),
        preview: truncateText(text),
        textLength: text.length,
      },
    });
  }
  return buildBaseProjection(event, context, {
    type: "text.delta",
    sourceType: "text_delta",
    phase: "producing",
    surface: "conversation",
    runtimeStatus: "running",
    persistence: "transcript",
    partId: readEventId(event),
    payload: {
      streamKind,
      preview: truncateText(text),
      textLength: text.length,
    },
  });
}

function buildToolProjection(
  event: Record<string, unknown>,
  context: AgentAppAgentUiProjectionBridgeOptions,
): Omit<AgentUiProjectionEvent, "sequence"> {
  const status = normalizeStatus(readString(event, "status"));
  const failed = status === "failed";
  const completed = status === "completed";
  return buildBaseProjection(event, context, {
    type: failed ? "tool.failed" : completed ? "tool.result" : "tool.started",
    sourceType: failed || completed ? "tool_end" : "tool_start",
    phase: failed ? "failed" : completed ? "completed" : "acting",
    surface: "tool_ui",
    runtimeStatus: failed ? "failed" : completed ? "completed" : "running",
    persistence: completed || failed ? "archive" : "ephemeral_live",
    toolCallId: readToolCallId(event),
    payload: {
      toolName: readToolName(event),
      status,
      preview: truncateText(readString(event, "message")),
      payloadKeys: payloadKeys(event),
    },
  });
}

function buildActionProjection(
  event: Record<string, unknown>,
  context: AgentAppAgentUiProjectionBridgeOptions,
  type: "action.required" | "action.resolved",
): Omit<AgentUiProjectionEvent, "sequence"> {
  const required = type === "action.required";
  const payload = recordValue(event, "payload");
  const eventType = readString(event, "eventType");
  const controls = required ? controlsForActionEvent(event) : [];
  return buildBaseProjection(event, context, {
    type,
    sourceType: required ? "action_required" : "action_resolved",
    phase: required ? "waiting" : "completed",
    surface: "hitl",
    runtimeStatus: required ? "needs_input" : "completed",
    persistence: required ? "snapshot" : "archive",
    actionId: readActionId(event),
    control: required ? controls[0] : "none",
    payload: {
      status: readString(event, "status"),
      requestId: readActionId(event),
      actionType:
        readString(event, "actionType") ??
        readString(payload, "actionType") ??
        actionTypeForTaskEvent(eventType),
      controls,
      preview: truncateText(readString(event, "message")),
      payloadKeys: payloadKeys(event),
    },
  });
}

function buildArtifactProjection(
  event: Record<string, unknown>,
  context: AgentAppAgentUiProjectionBridgeOptions,
): Omit<AgentUiProjectionEvent, "sequence"> {
  const status = normalizeStatus(readString(event, "status"));
  const artifactRef = readString(event, "artifactRef") ?? readArtifactRef(event);
  const artifactPreview = readArtifactPreview(event);
  return buildBaseProjection(event, context, {
    type: status === "failed" ? "artifact.failed" : "artifact.created",
    sourceType: "artifact_snapshot",
    phase: status === "failed" ? "failed" : "completed",
    surface: "artifact_workspace",
    runtimeStatus: status === "failed" ? "failed" : "completed",
    persistence: "artifact_store",
    artifactId: readArtifactId(event) ?? artifactRef,
    refs: artifactRef ? { artifactPaths: [artifactRef] } : undefined,
    payload: {
      status,
      artifactRef,
      preview: truncateText(artifactPreview),
      payloadKeys: payloadKeys(event),
    },
  });
}

function buildEvidenceProjection(
  event: Record<string, unknown>,
  context: AgentAppAgentUiProjectionBridgeOptions,
): Omit<AgentUiProjectionEvent, "sequence"> {
  const evidenceRef = readString(event, "evidenceRef") ?? readEvidenceRef(event);
  return buildBaseProjection(event, context, {
    type: "evidence.changed",
    sourceType: "evidence_projection",
    phase: "completed",
    surface: "timeline_evidence",
    runtimeStatus: "completed",
    persistence: "evidence_pack",
    evidenceId: evidenceRef,
    refs: evidenceRef ? { rawEventRef: evidenceRef } : undefined,
    payload: {
      status: readString(event, "status"),
      evidenceRef,
      preview: truncateText(readString(event, "message")),
      payloadKeys: payloadKeys(event),
    },
  });
}

function buildMetricProjection(
  event: Record<string, unknown>,
  context: AgentAppAgentUiProjectionBridgeOptions,
): Omit<AgentUiProjectionEvent, "sequence"> {
  const payload = recordValue(event, "payload");
  const status = normalizeStatus(readString(event, "status"));
  return buildBaseProjection(event, context, {
    type: "metric.changed",
    sourceType: "performance_metric",
    phase: "acting",
    surface: "diagnostics",
    runtimeStatus: runtimeStatusForTaskStatus(status),
    persistence: "diagnostics_log",
    payload: {
      metricName:
        readString(event, "metricName") ??
        readString(payload, "metricName") ??
        readString(payload, "metric") ??
        readString(event, "eventType"),
      status,
      providerName:
        readString(event, "providerName") ?? readString(payload, "providerName"),
      modelName:
        readString(event, "modelName") ??
        readString(payload, "modelName") ??
        readString(payload, "model"),
      preview:
        truncateText(readString(event, "message")) ??
        truncateText(readString(payload, "preview")) ??
        buildMetricPreview(event),
      usage: recordValue(event, "usage") ?? recordValue(payload, "usage"),
      cost: recordValue(event, "cost") ?? recordValue(payload, "cost"),
      payloadKeys: payloadKeys(event),
    },
  });
}

function buildDiagnosticProjection(
  event: Record<string, unknown>,
  context: AgentAppAgentUiProjectionBridgeOptions,
): Omit<AgentUiProjectionEvent, "sequence"> {
  const status = normalizeStatus(readString(event, "status"));
  return buildBaseProjection(event, context, {
    type: "diagnostic.changed",
    sourceType: "runtime_status",
    phase: status === "failed" ? "failed" : "acting",
    surface: "diagnostics",
    runtimeStatus: runtimeStatusForTaskStatus(status),
    persistence: "diagnostics_log",
    diagnosticId: readEventId(event),
    payload: {
      status,
      code: readString(event, "code") ?? readString(recordValue(event, "payload"), "code"),
      preview: truncateText(readString(event, "message")),
      payloadKeys: payloadKeys(event),
    },
  });
}

function buildRuntimeStatusProjection(
  event: Record<string, unknown>,
  context: AgentAppAgentUiProjectionBridgeOptions,
): Omit<AgentUiProjectionEvent, "sequence"> {
  const status = normalizeStatus(readString(event, "status"));
  return buildBaseProjection(event, context, {
    type: status === "failed" ? "run.failed" : "run.status",
    sourceType: "runtime_status",
    phase: phaseForRuntimeStatus(status),
    surface: "runtime_status",
    runtimeStatus: runtimeStatusForTaskStatus(status),
    persistence: status === "completed" || status === "failed" ? "archive" : "ephemeral_live",
    payload: {
      status,
      eventType: readString(event, "eventType") ?? readString(event, "type"),
      preview: truncateText(readString(event, "message")),
      payloadKeys: payloadKeys(event),
    },
  });
}

function buildBaseProjection(
  event: Record<string, unknown>,
  context: AgentAppAgentUiProjectionBridgeOptions,
  projection: Pick<
    AgentUiProjectionEvent,
    "type" | "sourceType" | "phase" | "surface" | "runtimeStatus"
  > &
    Partial<AgentUiProjectionEvent>,
): Omit<AgentUiProjectionEvent, "sequence"> {
  const eventId = readEventId(event);
  const timestamp =
    readString(event, "occurredAt") ?? context.timestamp ?? undefined;
  return {
    sourceType: projection.sourceType,
    type: projection.type,
    timestamp,
    sessionId: definedString(context.sessionId),
    threadId: readString(event, "threadId") ?? definedString(context.threadId),
    runId: definedString(context.runId),
    turnId: readString(event, "turnId") ?? definedString(context.turnId),
    taskId: readString(event, "taskId") ?? definedString(context.taskId),
    owner: ownerForProjection(projection.type),
    scope: scopeForProjection(projection.type),
    phase: projection.phase,
    surface: projection.surface,
    persistence: projection.persistence ?? "ephemeral_live",
    runtimeEntity: "agent_turn",
    runtimeStatus: projection.runtimeStatus,
    latestTurnStatus: projection.runtimeStatus,
    toolCallId: projection.toolCallId,
    actionId: projection.actionId,
    artifactId: projection.artifactId,
    evidenceId: projection.evidenceId,
    partId: projection.partId,
    control: projection.control,
    refs: projection.refs,
    rawEventRef: eventId,
    payload: {
      appId: definedString(context.appId),
      taskId: readString(event, "taskId") ?? definedString(context.taskId),
      sourceEventId: eventId,
      ...projection.payload,
    },
  };
}

function ownerForProjection(
  type: AgentUiEventClass,
): AgentUiProjectionEvent["owner"] {
  if (type.startsWith("text.") || type.startsWith("reasoning.")) {
    return "model";
  }
  if (type.startsWith("tool.")) {
    return "tool";
  }
  if (type.startsWith("action.")) {
    return "action";
  }
  if (type.startsWith("artifact.")) {
    return "artifact";
  }
  if (type.startsWith("evidence.")) {
    return "evidence";
  }
  if (type.startsWith("diagnostic.") || type.startsWith("metric.")) {
    return "diagnostics";
  }
  if (type.startsWith("queue.") || type.startsWith("task.")) {
    return "task";
  }
  return "runtime";
}

function scopeForProjection(
  type: AgentUiEventClass,
): AgentUiProjectionEvent["scope"] {
  if (type.startsWith("text.") || type.startsWith("reasoning.")) {
    return "part";
  }
  if (type.startsWith("tool.")) {
    return "tool_call";
  }
  if (type.startsWith("action.")) {
    return "action_request";
  }
  if (type.startsWith("artifact.")) {
    return "artifact";
  }
  if (type.startsWith("evidence.")) {
    return "evidence";
  }
  if (type.startsWith("diagnostic.") || type.startsWith("metric.")) {
    return "run";
  }
  if (type.startsWith("queue.")) {
    return "task";
  }
  return "run";
}

function phaseForRuntimeStatus(status: string): AgentUiPhase {
  switch (status) {
    case "queued":
      return "submitted";
    case "running":
    case "streaming":
      return "acting";
    case "blocked":
    case "pending":
    case "requires_host_authorization":
      return "waiting";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "routing":
      return "routing";
    default:
      return "preparing";
  }
}

function runtimeStatusForTaskStatus(status: string): AgentUiRuntimeStatus {
  switch (status) {
    case "queued":
      return "queued";
    case "running":
    case "streaming":
    case "routing":
      return "running";
    case "blocked":
    case "pending":
    case "requires_host_authorization":
    case "needs_input":
      return "needs_input";
    case "completed":
    case "succeeded":
      return "completed";
    case "failed":
    case "error":
      return "failed";
    case "cancelled":
      return "cancelled";
    default:
      return "unknown";
  }
}

function readDirectAgentUiEventClass(
  value: string | null | undefined,
): AgentUiEventClass | null {
  if (!value || value.includes(":")) {
    return null;
  }
  const prefix = value.split(".")[0];
  return [
    "run",
    "text",
    "reasoning",
    "tool",
    "action",
    "queue",
    "task",
    "artifact",
    "evidence",
    "diagnostic",
    "metric",
    "state",
    "messages",
    "review",
    "team",
    "agent",
  ].includes(prefix)
    ? (value as AgentUiEventClass)
    : null;
}

function sourceTypeForDirectAgentUiType(
  type: AgentUiEventClass,
): AgentUiProjectionEvent["sourceType"] {
  if (type.startsWith("metric.")) {
    return "performance_metric";
  }
  if (type.startsWith("evidence.")) {
    return "evidence_projection";
  }
  if (type.startsWith("artifact.")) {
    return "artifact_snapshot";
  }
  if (type === "tool.started" || type === "tool.args") {
    return "tool_start";
  }
  if (type === "tool.result" || type === "tool.failed") {
    return "tool_end";
  }
  if (type === "tool.progress") {
    return "tool_progress";
  }
  if (type === "tool.output.delta") {
    return "tool_output_delta";
  }
  if (type === "tool.args.delta") {
    return "tool_input_delta";
  }
  if (type === "text.delta" || type === "text.final") {
    return "text_delta";
  }
  if (type.startsWith("reasoning.")) {
    return "thinking_delta";
  }
  if (type === "action.required") {
    return "action_required";
  }
  if (type === "action.resolved") {
    return "action_resolved";
  }
  return "runtime_status";
}

function phaseForDirectAgentUiType(type: AgentUiEventClass): AgentUiPhase {
  if (type.startsWith("text.")) {
    return "producing";
  }
  if (type.startsWith("reasoning.")) {
    return "reasoning";
  }
  if (type.startsWith("tool.")) {
    return type === "tool.failed"
      ? "failed"
      : type === "tool.result"
        ? "completed"
        : "acting";
  }
  if (type === "action.required") {
    return "waiting";
  }
  if (type === "action.resolved") {
    return "completed";
  }
  if (type.startsWith("artifact.") || type.startsWith("evidence.")) {
    return type.endsWith(".failed") ? "failed" : "completed";
  }
  if (type === "run.finished") {
    return "completed";
  }
  if (type === "run.failed") {
    return "failed";
  }
  if (type.startsWith("queue.")) {
    return "submitted";
  }
  return "acting";
}

function surfaceForDirectAgentUiType(
  type: AgentUiEventClass,
): AgentUiProjectionEvent["surface"] {
  if (type.startsWith("text.")) {
    return "conversation";
  }
  if (type.startsWith("reasoning.")) {
    return "inline_process";
  }
  if (type.startsWith("tool.")) {
    return "tool_ui";
  }
  if (type.startsWith("action.")) {
    return "hitl";
  }
  if (type.startsWith("artifact.")) {
    return "artifact_workspace";
  }
  if (type.startsWith("evidence.")) {
    return "timeline_evidence";
  }
  if (type.startsWith("diagnostic.") || type.startsWith("metric.")) {
    return "diagnostics";
  }
  if (type.startsWith("queue.") || type.startsWith("task.")) {
    return "task_capsule";
  }
  return "runtime_status";
}

function runtimeStatusForDirectAgentUiType(
  type: AgentUiEventClass,
  event: Record<string, unknown>,
): AgentUiRuntimeStatus {
  const status = readString(event, "runtimeStatus") ?? readString(event, "status");
  if (status) {
    return runtimeStatusForTaskStatus(normalizeStatus(status));
  }
  if (type === "run.finished" || type === "tool.result" || type === "action.resolved") {
    return "completed";
  }
  if (type === "run.failed" || type === "tool.failed" || type.endsWith(".failed")) {
    return "failed";
  }
  if (type === "action.required") {
    return "needs_input";
  }
  if (type.startsWith("text.") || type.startsWith("reasoning.") || type.startsWith("tool.")) {
    return "running";
  }
  return "unknown";
}

function persistenceForDirectAgentUiType(
  type: AgentUiEventClass,
): AgentUiProjectionEvent["persistence"] {
  if (type.startsWith("text.")) {
    return "transcript";
  }
  if (type.startsWith("artifact.")) {
    return "artifact_store";
  }
  if (type.startsWith("evidence.")) {
    return "evidence_pack";
  }
  if (type.startsWith("diagnostic.") || type.startsWith("metric.")) {
    return "diagnostics_log";
  }
  if (
    type === "run.finished" ||
    type === "run.failed" ||
    type === "tool.result" ||
    type === "tool.failed" ||
    type === "action.resolved"
  ) {
    return "archive";
  }
  return "ephemeral_live";
}

function controlForDirectAgentUiEvent(
  event: Record<string, unknown>,
): AgentUiProjectionEvent["control"] {
  const control = readString(event, "control");
  if (control === "none") {
    return "none";
  }
  return control && isSupportedActionControl(control) ? control : undefined;
}

function controlsForActionEvent(
  event: Record<string, unknown>,
): Array<NonNullable<AgentUiProjectionEvent["control"]>> {
  const payload = recordValue(event, "payload");
  const configuredControls = [
    ...readStringArray(event, "controls"),
    ...readStringArray(event, "allowedControls"),
    ...readStringArray(payload, "controls"),
    ...readStringArray(payload, "allowedControls"),
  ].filter(isSupportedActionControl);
  if (configuredControls.length > 0) {
    return uniqueControls(configuredControls);
  }

  const eventType = readString(event, "eventType");
  if (eventType === "task:missingContextRequested") {
    return ["answer"];
  }
  if (eventType === "task:blocked") {
    return ["answer"];
  }
  if (eventType === "task:reviewRequested") {
    return ["approve", "reject"];
  }
  return ["approve"];
}

function actionTypeForTaskEvent(
  eventType: string | null,
): "tool_confirmation" | "ask_user" | "elicitation" {
  if (eventType === "task:missingContextRequested") {
    return "ask_user";
  }
  if (eventType === "task:blocked") {
    return "ask_user";
  }
  if (eventType === "task:reviewRequested") {
    return "ask_user";
  }
  return "ask_user";
}

function isSupportedActionControl(
  value: string,
): value is NonNullable<AgentUiProjectionEvent["control"]> {
  return [
    "approve",
    "reject",
    "answer",
    "edit",
    "retry",
    "interrupt",
    "stop",
  ].includes(value);
}

function uniqueControls<T extends string>(values: T[]): T[] {
  return [...new Set(values)];
}

function readStreamKind(event: Record<string, unknown>): string | null {
  const payload = recordValue(event, "payload");
  const runtimeEvent = recordValue(payload, "runtimeEvent");
  return (
    readString(payload, "streamKind") ??
    readString(event, "streamKind") ??
    readString(runtimeEvent, "type")
  );
}

function readStreamText(event: Record<string, unknown>): string {
  const payload = recordValue(event, "payload");
  const runtimeEvent = recordValue(payload, "runtimeEvent");
  return (
    readString(payload, "delta") ??
    readString(payload, "text") ??
    readString(runtimeEvent, "text") ??
    readString(runtimeEvent, "delta") ??
    readString(event, "message") ??
    ""
  );
}

function readToolName(event: Record<string, unknown>): string | undefined {
  const payload = recordValue(event, "payload");
  const runtimeEvent = recordValue(payload, "runtimeEvent");
  const result = recordValue(runtimeEvent, "result");
  const metadata = recordValue(result, "metadata");
  const skillName = readString(metadata, "skill_name") ?? readString(metadata, "skillName");
  if (skillName) {
    return `Skill(${skillName})`;
  }
  return (
    readString(event, "toolName") ??
    readString(event, "tool_name") ??
    readString(payload, "tool_name") ??
    readString(payload, "toolName") ??
    readString(runtimeEvent, "tool_name") ??
    readString(runtimeEvent, "toolName") ??
    readString(runtimeEvent, "tool_id") ??
    undefined
  );
}

function readToolCallId(event: Record<string, unknown>): string | undefined {
  const payload = recordValue(event, "payload");
  const runtimeEvent = recordValue(payload, "runtimeEvent");
  return (
    readString(event, "toolId") ??
    readString(event, "toolCallId") ??
    readString(payload, "tool_call_id") ??
    readString(payload, "toolCallId") ??
    readString(payload, "tool_id") ??
    readString(runtimeEvent, "tool_id") ??
    readString(runtimeEvent, "toolId") ??
    readEventId(event) ??
    undefined
  );
}

function readActionId(event: Record<string, unknown>): string | undefined {
  const payload = recordValue(event, "payload");
  return (
    readString(event, "requestId") ??
    readString(event, "actionId") ??
    readString(payload, "request_id") ??
    readString(payload, "requestId") ??
    readEventId(event) ??
    undefined
  );
}

function readArtifactId(event: Record<string, unknown>): string | undefined {
  const payload = recordValue(event, "payload");
  const artifact = recordValue(payload, "artifact");
  return (
    readString(event, "artifactId") ??
    readString(artifact, "artifact_id") ??
    readString(artifact, "artifactId") ??
    readString(artifact, "item_id") ??
    readString(artifact, "itemId") ??
    undefined
  );
}

function readArtifactRef(event: Record<string, unknown>): string | undefined {
  const payload = recordValue(event, "payload");
  const artifact = recordValue(payload, "artifact");
  return (
    readString(event, "artifactRef") ??
    readString(payload, "artifactRef") ??
    readString(artifact, "path") ??
    readString(artifact, "file_path") ??
    readString(artifact, "filePath") ??
    undefined
  );
}

function readArtifactPreview(event: Record<string, unknown>): string | undefined {
  const payload = recordValue(event, "payload");
  const artifact = recordValue(payload, "artifact");
  return (
    readString(event, "message") ??
    readString(payload, "message") ??
    readString(payload, "title") ??
    readString(artifact, "title") ??
    readString(artifact, "name") ??
    undefined
  );
}

function readEvidenceRef(event: Record<string, unknown>): string | undefined {
  const payload = recordValue(event, "payload");
  return (
    readString(event, "evidenceRef") ??
    readString(payload, "evidenceRef") ??
    readString(payload, "evidence_id") ??
    readString(payload, "evidenceId") ??
    undefined
  );
}

function readEventId(event: Record<string, unknown>): string | undefined {
  return readString(event, "id") ?? readString(event, "eventId") ?? undefined;
}

function payloadKeys(event: Record<string, unknown>): string[] | undefined {
  const payload = recordValue(event, "payload");
  if (!payload) {
    return undefined;
  }
  const keys = Object.keys(payload).sort();
  return keys.length ? keys : undefined;
}

function buildMetricPreview(event: Record<string, unknown>): string | undefined {
  const payload = recordValue(event, "payload");
  const usage = recordValue(event, "usage") ?? recordValue(payload, "usage");
  const cost = recordValue(event, "cost") ?? recordValue(payload, "cost");
  const modelName =
    readString(event, "modelName") ??
    readString(payload, "modelName") ??
    readString(payload, "model");
  const totalTokens = readNumber(usage, "totalTokens") ?? readNumber(usage, "total_tokens");
  const totalCost =
    readNumber(cost, "total") ??
    readNumber(cost, "estimatedTotalCost") ??
    readNumber(cost, "estimated_total_cost");
  const parts = [
    modelName,
    typeof totalTokens === "number" ? `${totalTokens} tokens` : undefined,
    typeof totalCost === "number" ? `${totalCost}` : undefined,
  ].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(" · ") : undefined;
}

function normalizeStatus(value: string | null | undefined): string {
  const normalized = value?.trim().toLowerCase();
  switch (normalized) {
    case "succeeded":
    case "success":
    case "created":
    case "ready":
    case "verified":
    case "recorded":
    case "resolved":
      return "completed";
    case "error":
    case "warning":
      return "failed";
    default:
      return normalized || "updated";
  }
}

function truncateText(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.length <= TEXT_PREVIEW_LIMIT) {
    return trimmed;
  }
  return `${trimmed.slice(0, TEXT_PREVIEW_LIMIT).trim()}...`;
}

function definedString(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function readString(
  value: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const item = value?.[key];
  return typeof item === "string" && item.trim() ? item.trim() : null;
}

function readStringArray(
  value: Record<string, unknown> | null | undefined,
  key: string,
): string[] {
  const item = value?.[key];
  return Array.isArray(item)
    ? item.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function readNumber(
  value: Record<string, unknown> | null | undefined,
  key: string,
): number | null {
  const item = value?.[key];
  return typeof item === "number" && Number.isFinite(item) ? item : null;
}

function recordValue(
  value: Record<string, unknown> | null | undefined,
  key: string,
): Record<string, unknown> | null {
  const item = value?.[key];
  return isRecord(item) ? item : null;
}

function readRecordArray(
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown>[] {
  const item = value[key];
  return Array.isArray(item) ? item.filter(isRecord) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
