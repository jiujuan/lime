import type {
  AgentUiEventClass,
  AgentUiPhase,
  AgentUiProjectionEvent,
  AgentUiRuntimeStatus,
} from "@limecloud/agent-ui-contracts";
import { isAgentUiEventClass } from "@limecloud/agent-ui-contracts";

import {
  normalizeStatus,
  readString,
  readStringArray,
  recordValue,
} from "./agentUiProjectionFieldReaders";

export function ownerForProjection(
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

export function scopeForProjection(
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

export function phaseForRuntimeStatus(status: string): AgentUiPhase {
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
    case "canceled":
    case "cancelled":
      return "cancelled";
    case "routing":
      return "routing";
    default:
      return "preparing";
  }
}

export function runtimeStatusForTaskStatus(
  status: string,
): AgentUiRuntimeStatus {
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
    case "canceled":
    case "cancelled":
      return "cancelled";
    default:
      return "unknown";
  }
}

export function readDirectAgentUiEventClass(
  value: string | null | undefined,
): AgentUiEventClass | null {
  return isAgentUiEventClass(value) ? value : null;
}

export function sourceTypeForDirectAgentUiType(
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

export function phaseForDirectAgentUiType(
  type: AgentUiEventClass,
): AgentUiPhase {
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
  if (type === "run.canceled") {
    return "cancelled";
  }
  if (type.startsWith("queue.")) {
    return "submitted";
  }
  return "acting";
}

export function surfaceForDirectAgentUiType(
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

export function runtimeStatusForDirectAgentUiType(
  type: AgentUiEventClass,
  event: Record<string, unknown>,
): AgentUiRuntimeStatus {
  const status =
    readString(event, "runtimeStatus") ?? readString(event, "status");
  if (status) {
    return runtimeStatusForTaskStatus(normalizeStatus(status));
  }
  if (
    type === "run.finished" ||
    type === "tool.result" ||
    type === "action.resolved"
  ) {
    return "completed";
  }
  if (
    type === "run.failed" ||
    type === "tool.failed" ||
    type.endsWith(".failed")
  ) {
    return "failed";
  }
  if (type === "run.canceled") {
    return "cancelled";
  }
  if (type === "action.required") {
    return "needs_input";
  }
  if (
    type.startsWith("text.") ||
    type.startsWith("reasoning.") ||
    type.startsWith("tool.")
  ) {
    return "running";
  }
  return "unknown";
}

export function persistenceForDirectAgentUiType(
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
    type === "run.canceled" ||
    type === "tool.result" ||
    type === "tool.failed" ||
    type === "action.resolved"
  ) {
    return "archive";
  }
  return "ephemeral_live";
}

export function controlForDirectAgentUiEvent(
  event: Record<string, unknown>,
): AgentUiProjectionEvent["control"] {
  const control = readString(event, "control");
  if (control === "none") {
    return "none";
  }
  return control && isSupportedActionControl(control) ? control : undefined;
}

export function controlsForActionEvent(
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

export function actionTypeForTaskEvent(
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

export function isSupportedActionControl(
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

export function uniqueControls<T extends string>(values: T[]): T[] {
  return [...new Set(values)];
}
