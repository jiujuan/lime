import type {
  CanonicalThreadEventNotification,
  AgentSessionEventNotification,
} from "@limecloud/app-server-client";
import {
  createRuntimeSequenceVerifier,
  type AgentRuntimeExecutionEvent,
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

type CanonicalThreadItem = Extract<
  CanonicalThreadEventNotification,
  { method: "item/updated" }
>["params"];
type CanonicalItemKind = CanonicalThreadItem["kind"];
type CanonicalItemStatus = CanonicalThreadItem["status"];

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
    const canonical = notification.params.canonicalEvent;
    if (!canonical) {
      // Raw agentSession events belong to the non-thread channel. They must
      // never participate in the Thread/Turn/Item lifecycle verifier.
      return { accepted: true, violations: [] };
    }
    const event = runtimeExecutionEventFromCanonicalEvent(canonical);
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

/**
 * Convert a canonical Thread/Turn/Item entity into the package's verifier
 * input. Lifecycle state is read from the typed entity itself; the raw
 * agentSession/event envelope is intentionally not consulted.
 */
export function runtimeExecutionEventFromCanonicalEvent(
  event: CanonicalThreadEventNotification,
): AgentRuntimeExecutionEvent {
  if (event.method === "thread/updated") {
    const thread = event.params;
    return {
      id: `thread:${thread.threadId}:${thread.updatedAtMs}`,
      runtimeId: "app-server",
      threadId: thread.threadId,
      sequence: thread.updatedAtMs,
      kind: "state",
      status: threadStatus(thread.status.type),
      eventClass: "run.status",
      title: thread.name ?? "Thread",
      payload: { canonical: thread },
      createdAt: dateFromMillis(thread.updatedAtMs),
    };
  }

  if (event.method === "turn/updated") {
    const turn = event.params;
    const eventClass = turnEventClass(turn.status);
    return {
      id: `turn:${turn.turnId}:${turn.updatedAtMs}`,
      runtimeId: "app-server",
      threadId: turn.threadId,
      turnId: turn.turnId,
      sequence: turn.updatedAtMs,
      kind: "state",
      status: turnStatus(turn.status),
      eventClass,
      title: "Turn",
      payload: { canonical: turn },
      createdAt: dateFromMillis(turn.updatedAtMs),
      completedAt:
        turn.completedAtMs == null
          ? undefined
          : dateFromMillis(turn.completedAtMs),
    };
  }

  const item = event.params;
  const eventClass = itemEventClass(item.kind, item.status);
  return {
    id: `item:${item.itemId}:${item.sequence}:${item.updatedAtMs}`,
    runtimeId: "app-server",
    threadId: item.threadId,
    turnId: item.turnId,
    toolCallId: item.kind === "tool" ? item.itemId : undefined,
    actionId: item.kind === "approval" ? item.itemId : undefined,
    sequence: item.sequence,
    kind: itemRuntimeKind(item.kind),
    status: itemStatus(item.status),
    eventClass,
    title: itemTitle(item),
    payload: { canonical: item },
    createdAt: dateFromMillis(item.createdAtMs),
    completedAt:
      item.completedAtMs == null
        ? undefined
        : dateFromMillis(item.completedAtMs),
  };
}

function dateFromMillis(value: number): string {
  return new Date(value).toISOString();
}

function threadStatus(
  status: "notLoaded" | "idle" | "systemError" | "active",
): AgentRuntimeExecutionEvent["status"] {
  switch (status) {
    case "systemError":
      return "failed";
    case "active":
      return "running";
    case "notLoaded":
      return "pending";
    case "idle":
    default:
      return "completed";
  }
}

function turnStatus(
  status: "completed" | "failed" | "inProgress" | "interrupted",
): AgentRuntimeExecutionEvent["status"] {
  switch (status) {
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "interrupted":
      return "canceled";
    case "inProgress":
    default:
      return "running";
  }
}

function turnEventClass(
  status: "completed" | "failed" | "inProgress" | "interrupted",
): string {
  switch (status) {
    case "completed":
      return "turn.completed";
    case "failed":
      return "turn.failed";
    case "interrupted":
      return "turn.canceled";
    case "inProgress":
    default:
      return "turn.started";
  }
}

function itemStatus(
  status: CanonicalItemStatus,
): AgentRuntimeExecutionEvent["status"] {
  switch (status) {
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "cancelled":
    case "interrupted":
      return "canceled";
    case "inProgress":
      return "running";
    case "pending":
    default:
      return "pending";
  }
}

function itemEventClass(
  kind: CanonicalItemKind,
  status: CanonicalItemStatus,
): string {
  const family = itemEventFamily(kind);
  if (family === "tool") {
    if (status === "pending") return "tool.pending";
    if (status === "inProgress") return "tool.started";
    if (status === "completed") return "tool.result";
    return "tool.failed";
  }
  if (family === "model") {
    if (status === "pending") return "model.pending";
    if (status === "inProgress") return "model.delta";
    if (status === "completed") return "model.completed";
    return "model.failed";
  }
  if (family === "action") {
    if (status === "pending" || status === "inProgress") {
      return "action.required";
    }
    if (status === "completed") return "action.resolved";
    return "action.canceled";
  }
  if (family === "command") {
    if (status === "pending") return "command.pending";
    if (status === "inProgress") return "command.started";
    return "command.exited";
  }
  if (status === "failed") return `${family}.failed`;
  if (status === "cancelled" || status === "interrupted") {
    return `${family}.canceled`;
  }
  if (status === "completed") return `${family}.completed`;
  if (status === "inProgress") return `${family}.started`;
  return `${family}.pending`;
}

function itemEventFamily(kind: CanonicalItemKind): string {
  switch (kind) {
    case "agentMessage":
    case "userMessage":
    case "reasoning":
      return "model";
    case "approval":
      return "action";
    case "contextCompaction":
      return "context";
    case "file":
    case "media":
      return "artifact";
    case "subAgent":
      return "handoff";
    case "extension":
      return "runtime";
    case "command":
      return "command";
    case "tool":
    default:
      return "tool";
  }
}

function itemRuntimeKind(
  kind: CanonicalItemKind,
): AgentRuntimeExecutionEvent["kind"] {
  switch (kind) {
    case "agentMessage":
    case "userMessage":
    case "reasoning":
      return "model";
    case "approval":
      return "action";
    case "contextCompaction":
      return "context";
    case "file":
    case "media":
      return "draft";
    case "subAgent":
      return "handoff";
    case "extension":
      return "note";
    case "command":
      return "tool";
    case "tool":
    default:
      return "tool";
  }
}

function itemTitle(item: CanonicalThreadItem): string {
  const payload = item.payload;
  switch (payload.type) {
    case "agentMessage":
      return payload.text;
    case "userMessage":
      return payload.content;
    case "tool":
      return payload.name;
    case "command":
      return payload.command;
    case "file":
      return payload.path;
    case "media":
      return payload.mime_type;
    case "subAgent":
      return payload.child_thread_id;
    default:
      return payload.type;
  }
}
