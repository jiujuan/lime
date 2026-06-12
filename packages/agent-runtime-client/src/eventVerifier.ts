import type {
  AgentEvent,
  AgentSessionEventNotification,
} from "@limecloud/app-server-client";
import {
  createRuntimeSequenceVerifier,
  normalizeRuntimeTurnTerminalEventClass,
  runtimeStatusForTerminalEventClass,
  type AgentRuntimeExecutionEvent,
  type RuntimeSequenceVerifier,
  type RuntimeSequenceViolation,
} from "@limecloud/agent-ui-contracts";

export type AgentRuntimeSequenceVerifierMode =
  | "fail-closed"
  | "collect-diagnostics"
  | "off";

export interface AgentRuntimeSequenceVerifierLike {
  push(event: AgentRuntimeExecutionEvent): RuntimeSequenceViolation[];
  getViolations(): RuntimeSequenceViolation[];
  finalize?(): RuntimeSequenceViolation[];
}

export interface AgentRuntimeSequenceVerifierOptions {
  verifier?: AgentRuntimeSequenceVerifierLike;
  mode?: AgentRuntimeSequenceVerifierMode;
}

export interface AgentRuntimeSequenceVerificationResult {
  accepted: boolean;
  violations: RuntimeSequenceViolation[];
}

export class AgentRuntimeSequenceViolationError extends Error {
  readonly violations: RuntimeSequenceViolation[];

  constructor(violations: RuntimeSequenceViolation[]) {
    super(
      violations.length > 0
        ? `Agent runtime event sequence violation: ${violations.map((violation) => violation.code).join(", ")}`
        : "Agent runtime event sequence violation.",
    );
    this.name = "AgentRuntimeSequenceViolationError";
    this.violations = violations;
  }
}

export class AgentRuntimeEventSequenceGate {
  readonly #verifier: AgentRuntimeSequenceVerifierLike | undefined;
  readonly #mode: AgentRuntimeSequenceVerifierMode;

  constructor(options: AgentRuntimeSequenceVerifierOptions = {}) {
    this.#mode = options.mode ?? "fail-closed";
    this.#verifier =
      this.#mode === "off"
        ? undefined
        : options.verifier ?? createRuntimeSequenceVerifier();
  }

  verify(notification: AgentSessionEventNotification): AgentRuntimeSequenceVerificationResult {
    if (!this.#verifier) {
      return { accepted: true, violations: [] };
    }
    const event = runtimeExecutionEventFromAgentEvent(notification.params.event);
    const violations = this.#verifier.push(event);
    return {
      accepted: this.#mode !== "fail-closed" || violations.length === 0,
      violations,
    };
  }

  getViolations(): RuntimeSequenceViolation[] {
    return this.#verifier?.getViolations() ?? [];
  }

  sequenceViolationError(): AgentRuntimeSequenceViolationError {
    return new AgentRuntimeSequenceViolationError(this.getViolations());
  }
}

export function runtimeExecutionEventFromAgentEvent(
  event: AgentEvent,
): AgentRuntimeExecutionEvent {
  const eventRecord = event as unknown as Record<string, unknown>;
  const payload = isRecord(event.payload) ? event.payload : {};
  const eventClass = normalizeAgentEventClass(
    stringValue(event.type) ?? "runtime.event",
  );
  const toolCallId =
    stringValue(eventRecord.toolCallId)
    ?? stringValue(eventRecord.tool_call_id)
    ?? stringValue(payload.toolCallId)
    ?? stringValue(payload.tool_call_id)
    ?? stringValue(payload.toolId)
    ?? stringValue(payload.tool_id);
  const actionId =
    stringValue(eventRecord.actionId)
    ?? stringValue(eventRecord.requestId)
    ?? stringValue(eventRecord.request_id)
    ?? stringValue(payload.actionId)
    ?? stringValue(payload.requestId)
    ?? stringValue(payload.request_id);
  return {
    id:
      stringValue(event.eventId)
      ?? stringValue(eventRecord.id)
      ?? `${stringValue(event.sessionId) ?? "session"}:${eventClass}:${numberValue(event.sequence) ?? 0}`,
    schemaVersion:
      stringValue(eventRecord.schemaVersion)
      ?? stringValue(payload.schemaVersion)
      ?? "lime-runtime-event/v0.1",
    runtimeId:
      stringValue(eventRecord.runtimeId)
      ?? stringValue(payload.runtimeId)
      ?? stringValue(event.sessionId)
      ?? "app-server",
    threadId: stringValue(event.threadId) ?? stringValue(payload.threadId),
    turnId: stringValue(event.turnId) ?? stringValue(payload.turnId),
    taskId: stringValue(eventRecord.taskId) ?? stringValue(payload.taskId),
    subagentId: stringValue(eventRecord.subagentId) ?? stringValue(payload.subagentId),
    toolCallId,
    actionId,
    sequence: numberValue(event.sequence) ?? numberValue(payload.sequence) ?? 0,
    kind: eventKindFromClass(eventClass),
    status: eventStatusFromClass(eventClass),
    eventClass,
    title:
      stringValue(eventRecord.title)
      ?? stringValue(payload.title)
      ?? eventClass,
    payload,
    createdAt:
      stringValue(event.timestamp)
      ?? stringValue(eventRecord.createdAt)
      ?? stringValue(payload.createdAt)
      ?? new Date(0).toISOString(),
  };
}

function eventKindFromClass(eventClass: string): AgentRuntimeExecutionEvent["kind"] {
  const [prefix] = eventClass.split(".");
  switch (prefix) {
    case "action":
      return "action";
    case "artifact":
      return "draft";
    case "context":
      return "context";
    case "evidence":
    case "review":
      return "evidence";
    case "model":
    case "message":
    case "reasoning":
      return "model";
    case "permission":
      return "permission";
    case "sandbox":
      return "sandbox";
    case "tool":
      return "tool";
    case "turn":
    case "run":
    case "session":
    default:
      return "state";
  }
}

function normalizeAgentEventClass(type: string): string {
  const terminalEventClass = normalizeRuntimeTurnTerminalEventClass(type);
  if (terminalEventClass) {
    return terminalEventClass;
  }
  if (type === "message.delta" || type === "message.delta_batch" || type === "message.batch") {
    return "model.delta";
  }
  if (
    type === "message" ||
    type === "message.completed" ||
    type === "item.completed"
  ) {
    return "model.completed";
  }
  if (type === "thinking.delta") return "reasoning.delta";
  if (type === "artifact.snapshot") return "artifact.changed";
  if (type === "runtime.status") return "run.status";
  return type;
}

function eventStatusFromClass(eventClass: string): AgentRuntimeExecutionEvent["status"] {
  const terminalStatus = runtimeStatusForTerminalEventClass(eventClass);
  if (terminalStatus) return terminalStatus;
  if (eventClass.endsWith(".failed")) return "failed";
  if (
    eventClass.endsWith(".completed")
    || eventClass.endsWith(".result")
    || eventClass.endsWith(".resolved")
    || eventClass === "action.cancelled"
    || eventClass === "action.canceled"
    || eventClass === "action.expired"
  ) {
    return "completed";
  }
  if (eventClass.endsWith(".required")) return "blocked";
  if (
    eventClass.endsWith(".started")
    || eventClass.endsWith(".delta")
    || eventClass.endsWith(".progress")
  ) {
    return "running";
  }
  return "pending";
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
