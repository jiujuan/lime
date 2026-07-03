import type {
  AgentUiEventClass,
  AgentUiProjectionEvent,
} from "@limecloud/agent-ui-contracts";

import {
  buildMetricPreview,
  definedString,
  normalizeStatus,
  payloadKeys,
  readActionId,
  readArtifactId,
  readArtifactPreview,
  readArtifactRef,
  readEventId,
  readEvidenceRef,
  readStreamKind,
  readStreamText,
  readString,
  readStringArray,
  readToolCallId,
  readToolName,
  recordValue,
  truncateText,
} from "./agentUiProjectionFieldReaders";
import {
  actionTypeForTaskEvent,
  controlForDirectAgentUiEvent,
  controlsForActionEvent,
  isSupportedActionControl,
  ownerForProjection,
  persistenceForDirectAgentUiType,
  phaseForDirectAgentUiType,
  phaseForRuntimeStatus,
  readDirectAgentUiEventClass,
  runtimeStatusForDirectAgentUiType,
  runtimeStatusForTaskStatus,
  scopeForProjection,
  sourceTypeForDirectAgentUiType,
  surfaceForDirectAgentUiType,
  uniqueControls,
} from "./agentUiProjectionMapping";

export interface PluginProjectionEventContext {
  appId?: string | null;
  taskId?: string | null;
  sessionId?: string | null;
  threadId?: string | null;
  runId?: string | null;
  turnId?: string | null;
  timestamp?: string | null;
}

export function buildProjectionEvent(
  event: Record<string, unknown>,
  context: PluginProjectionEventContext,
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
  context: PluginProjectionEventContext,
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
  context: PluginProjectionEventContext,
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
  context: PluginProjectionEventContext,
): Omit<AgentUiProjectionEvent, "sequence"> {
  const status = normalizeStatus(readString(event, "status"));
  const failed = status === "failed";
  const completed = status === "completed";
  const payload = recordValue(event, "payload");
  return buildBaseProjection(event, context, {
    type: failed ? "tool.failed" : completed ? "tool.result" : "tool.started",
    sourceType: failed || completed ? "tool_end" : "tool_start",
    phase: failed ? "failed" : completed ? "completed" : "acting",
    surface: "tool_ui",
    runtimeStatus: failed ? "failed" : completed ? "completed" : "running",
    persistence: completed || failed ? "archive" : "ephemeral_live",
    toolCallId: readToolCallId(event),
    payload: {
      title: readString(payload, "title"),
      displayTitle: readString(payload, "displayTitle"),
      toolName: readToolName(event),
      status,
      preview: truncateText(
        readString(payload, "displayMessage") ?? readString(event, "message"),
      ),
      payloadKeys: payloadKeys(event),
    },
  });
}

function buildActionProjection(
  event: Record<string, unknown>,
  context: PluginProjectionEventContext,
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
  context: PluginProjectionEventContext,
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
  context: PluginProjectionEventContext,
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
  context: PluginProjectionEventContext,
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
  context: PluginProjectionEventContext,
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
  context: PluginProjectionEventContext,
): Omit<AgentUiProjectionEvent, "sequence"> {
  const status = normalizeStatus(readString(event, "status"));
  const payload = recordValue(event, "payload");
  return buildBaseProjection(event, context, {
    type: status === "failed" ? "run.failed" : "run.status",
    sourceType: "runtime_status",
    phase: phaseForRuntimeStatus(status),
    surface: "runtime_status",
    runtimeStatus: runtimeStatusForTaskStatus(status),
    persistence: status === "completed" || status === "failed" ? "archive" : "ephemeral_live",
    payload: {
      status,
      title: readString(payload, "title"),
      displayTitle: readString(payload, "displayTitle"),
      eventType: readString(event, "eventType") ?? readString(event, "type"),
      preview: truncateText(
        readString(payload, "displayMessage") ?? readString(event, "message"),
      ),
      payloadKeys: payloadKeys(event),
    },
  });
}

function buildBaseProjection(
  event: Record<string, unknown>,
  context: PluginProjectionEventContext,
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
