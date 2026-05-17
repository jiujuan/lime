import type {
  AgentUiProjectionEvent,
  AgentUiRuntimeStatus,
} from "@/components/agent/chat/projection/agentUiEventProjection";

export type AgentAppRunProjectionPartKind =
  | "status"
  | "queue"
  | "text"
  | "reasoning"
  | "tool"
  | "action"
  | "artifact"
  | "evidence"
  | "diagnostic";

export type AgentAppRunProjectionLabel =
  | "status"
  | "queue"
  | "answer"
  | "reasoning"
  | "tool"
  | "actionRequired"
  | "actionResolved"
  | "artifact"
  | "evidence"
  | "diagnostic";

export type AgentAppRunProjectionActionControl = Exclude<
  NonNullable<AgentUiProjectionEvent["control"]>,
  "none"
>;

export interface AgentAppRunProjectionPart {
  id: string;
  kind: AgentAppRunProjectionPartKind;
  type: AgentUiProjectionEvent["type"];
  sequence: number;
  label: AgentAppRunProjectionLabel;
  displayName?: string;
  preview?: string;
  runtimeStatus?: AgentUiRuntimeStatus;
  surface?: AgentUiProjectionEvent["surface"];
  collapsedByDefault: boolean;
  toolCallId?: string;
  actionId?: string;
  artifactId?: string;
  evidenceId?: string;
}

export interface AgentAppRunProjectionAction {
  actionId: string;
  sessionId?: string;
  threadId?: string;
  runId?: string;
  turnId?: string;
  taskId?: string;
  actionType?: string;
  status: "pending" | "resolved";
  label: "actionRequired" | "actionResolved";
  control?: AgentAppRunProjectionActionControl;
  controls: AgentAppRunProjectionActionControl[];
  preview?: string;
}

export interface AgentAppRunProjectionArtifact {
  artifactId: string;
  label: "artifact";
  preview?: string;
  ref?: string;
  status?: AgentUiRuntimeStatus;
}

export interface AgentAppRunProjectionEvidence {
  evidenceId: string;
  label: "evidence";
  preview?: string;
  status?: AgentUiRuntimeStatus;
}

export interface AgentAppRunProjectionDiagnostic {
  diagnosticId: string;
  label: "diagnostic";
  preview?: string;
  status?: AgentUiRuntimeStatus;
}

export interface AgentAppRunProjectionTaskSummary {
  latestRuntimeStatus: AgentUiRuntimeStatus | "unknown";
  terminal: boolean;
  collapsedByDefault: boolean;
  pendingActionCount: number;
  toolCallCount: number;
  artifactCount: number;
  evidenceCount: number;
  queueCount: number;
}

export interface AgentAppRunProjectionViewModel {
  orderedParts: AgentAppRunProjectionPart[];
  actions: AgentAppRunProjectionAction[];
  artifacts: AgentAppRunProjectionArtifact[];
  evidence: AgentAppRunProjectionEvidence[];
  diagnostics: AgentAppRunProjectionDiagnostic[];
  task: AgentAppRunProjectionTaskSummary;
  answerText: string;
  reasoningText: string;
}

export function buildAgentAppRunProjectionViewModel(
  events: AgentUiProjectionEvent[],
): AgentAppRunProjectionViewModel {
  const orderedEvents = [...events].sort(compareProjectionEvents);
  const orderedParts = buildOrderedProjectionParts(orderedEvents);
  const actions = buildActionIndex(orderedEvents);
  const artifacts = buildArtifactIndex(orderedEvents);
  const evidence = buildEvidenceIndex(orderedEvents);
  const diagnostics = buildDiagnosticIndex(orderedEvents);
  const latestRuntimeStatus = resolveLatestRuntimeStatus(orderedEvents);
  const terminal = isTerminalStatus(latestRuntimeStatus);

  return {
    orderedParts,
    actions,
    artifacts,
    evidence,
    diagnostics,
    task: {
      latestRuntimeStatus,
      terminal,
      collapsedByDefault: terminal,
      pendingActionCount: actions.filter((action) => action.status === "pending").length,
      toolCallCount: uniqueCount(orderedEvents.map((event) => event.toolCallId)),
      artifactCount: artifacts.length,
      evidenceCount: evidence.length,
      queueCount: orderedEvents.filter((event) => event.type === "queue.changed").length,
    },
    answerText: collectText(orderedEvents, "text.delta"),
    reasoningText: collectText(orderedEvents, "reasoning.delta"),
  };
}

function compareProjectionEvents(
  left: AgentUiProjectionEvent,
  right: AgentUiProjectionEvent,
): number {
  const leftSequence = left.sequence ?? Number.MAX_SAFE_INTEGER;
  const rightSequence = right.sequence ?? Number.MAX_SAFE_INTEGER;
  if (leftSequence !== rightSequence) {
    return leftSequence - rightSequence;
  }
  return stableEventId(left).localeCompare(stableEventId(right));
}

function buildProjectionPart(event: AgentUiProjectionEvent): AgentAppRunProjectionPart {
  const kind = partKindForEvent(event);
  const runtimeStatus = event.runtimeStatus ?? event.latestTurnStatus;
  const label = labelForEvent(event, kind);
  return {
    id: stableEventId(event),
    kind,
    type: event.type,
    sequence: event.sequence ?? 0,
    label,
    displayName: readPayloadString(event, "toolName"),
    preview: previewForEvent(event),
    runtimeStatus,
    surface: event.surface,
    collapsedByDefault: shouldCollapsePartByDefault(event, kind, runtimeStatus),
    toolCallId: event.toolCallId,
    actionId: event.actionId,
    artifactId: event.artifactId,
    evidenceId: event.evidenceId,
  };
}

function buildOrderedProjectionParts(
  events: AgentUiProjectionEvent[],
): AgentAppRunProjectionPart[] {
  const parts: AgentAppRunProjectionPart[] = [];
  const groupedParts = new Map<string, AgentAppRunProjectionPart>();

  for (const event of events) {
    const part = buildProjectionPart(event);
    const groupKey = projectionPartGroupKey(event, part.kind);
    if (!groupKey) {
      parts.push(part);
      continue;
    }

    const existing = groupedParts.get(groupKey);
    if (!existing) {
      const groupedPart = {
        ...part,
        id: groupKey,
      };
      groupedParts.set(groupKey, groupedPart);
      parts.push(groupedPart);
      continue;
    }

    existing.preview = mergeProjectionPreview(
      existing.preview,
      part.preview,
      part.kind,
    );
    existing.runtimeStatus = part.runtimeStatus ?? existing.runtimeStatus;
    existing.collapsedByDefault = shouldCollapsePartByDefault(
      event,
      part.kind,
      existing.runtimeStatus,
    );
    existing.displayName = existing.displayName ?? part.displayName;
  }

  return parts;
}

function projectionPartGroupKey(
  event: AgentUiProjectionEvent,
  kind: AgentAppRunProjectionPartKind,
): string | null {
  if (kind === "reasoning" && event.type === "reasoning.delta") {
    return `stream:reasoning:${projectionScopeKey(event)}`;
  }
  if (kind === "text" && event.type === "text.delta") {
    return `stream:text:${projectionScopeKey(event)}`;
  }
  if (
    kind === "tool" &&
    event.toolCallId &&
    (event.type === "tool.args.delta" || event.type === "tool.output.delta")
  ) {
    return `stream:tool:${event.toolCallId}`;
  }
  return null;
}

function projectionScopeKey(event: AgentUiProjectionEvent): string {
  return [
    event.sessionId,
    event.threadId,
    event.runId,
    event.turnId,
    event.taskId,
    event.messageId,
  ]
    .filter((value): value is string => Boolean(value))
    .join(":") || "unknown";
}

function mergeProjectionPreview(
  current: string | undefined,
  next: string | undefined,
  kind: AgentAppRunProjectionPartKind,
): string | undefined {
  if (!next) {
    return current;
  }
  if (!current) {
    return next;
  }
  if (kind === "reasoning" || kind === "text" || kind === "tool") {
    return mergeStreamText(current, next);
  }
  return next;
}

function shouldCollapsePartByDefault(
  event: AgentUiProjectionEvent,
  kind: AgentAppRunProjectionPartKind,
  runtimeStatus?: AgentUiRuntimeStatus,
): boolean {
  if (kind === "text") {
    return false;
  }
  if (kind === "action") {
    return event.type === "action.resolved";
  }
  if (runtimeStatus === "running" || runtimeStatus === "needs_input") {
    return false;
  }
  if (runtimeStatus && isTerminalStatus(runtimeStatus)) {
    return true;
  }
  return ["artifact", "evidence", "status", "queue"].includes(kind);
}

function partKindForEvent(
  event: AgentUiProjectionEvent,
): AgentAppRunProjectionPartKind {
  if (event.type.startsWith("text.")) {
    return "text";
  }
  if (event.type.startsWith("reasoning.")) {
    return "reasoning";
  }
  if (event.type.startsWith("tool.")) {
    return "tool";
  }
  if (event.type.startsWith("action.")) {
    return "action";
  }
  if (event.type.startsWith("artifact.")) {
    return "artifact";
  }
  if (event.type.startsWith("evidence.")) {
    return "evidence";
  }
  if (event.type.startsWith("queue.")) {
    return "queue";
  }
  if (event.type.startsWith("diagnostic.") || event.type.startsWith("metric.")) {
    return "diagnostic";
  }
  return "status";
}

function labelForEvent(
  event: AgentUiProjectionEvent,
  kind: AgentAppRunProjectionPartKind,
): AgentAppRunProjectionLabel {
  switch (kind) {
    case "text":
      return "answer";
    case "reasoning":
      return "reasoning";
    case "tool":
      return "tool";
    case "action":
      return event.type === "action.resolved"
        ? "actionResolved"
        : "actionRequired";
    case "artifact":
      return "artifact";
    case "evidence":
      return "evidence";
    case "queue":
      return "queue";
    case "diagnostic":
      return "diagnostic";
    case "status":
    default:
      return "status";
  }
}

function buildActionIndex(
  events: AgentUiProjectionEvent[],
): AgentAppRunProjectionAction[] {
  const actions = new Map<string, AgentAppRunProjectionAction>();
  for (const event of events) {
    if (!event.type.startsWith("action.")) {
      continue;
    }
    const actionId = event.actionId ?? stableEventId(event);
    actions.set(actionId, {
      actionId,
      sessionId: event.sessionId,
      threadId: event.threadId,
      runId: event.runId,
      turnId: event.turnId,
      taskId: event.taskId,
      actionType: readPayloadString(event, "actionType"),
      status: event.type === "action.resolved" ? "resolved" : "pending",
      label:
        event.type === "action.resolved" ? "actionResolved" : "actionRequired",
      control: normalizeActionControls(event)[0],
      controls: normalizeActionControls(event),
      preview: previewForEvent(event),
    });
  }
  return [...actions.values()];
}

function normalizeActionControls(
  event: AgentUiProjectionEvent,
): AgentAppRunProjectionActionControl[] {
  const payloadControls = event.payload?.controls;
  const controls = Array.isArray(payloadControls)
    ? payloadControls.filter(isActionControl)
    : [];
  if (controls.length > 0) {
    return [...new Set(controls)];
  }
  return event.control && event.control !== "none" ? [event.control] : [];
}

function isActionControl(
  value: unknown,
): value is AgentAppRunProjectionActionControl {
  return (
    typeof value === "string" &&
    [
      "approve",
      "reject",
      "answer",
      "edit",
      "retry",
      "interrupt",
      "stop",
    ].includes(value)
  );
}

function buildArtifactIndex(
  events: AgentUiProjectionEvent[],
): AgentAppRunProjectionArtifact[] {
  const artifacts = new Map<string, AgentAppRunProjectionArtifact>();
  for (const event of events) {
    if (!event.type.startsWith("artifact.")) {
      continue;
    }
    const artifactId = event.artifactId ?? stableEventId(event);
    artifacts.set(artifactId, {
      artifactId,
      label: "artifact",
      preview: previewForEvent(event),
      ref: event.refs?.artifactPaths?.[0],
      status: event.runtimeStatus,
    });
  }
  return [...artifacts.values()];
}

function buildEvidenceIndex(
  events: AgentUiProjectionEvent[],
): AgentAppRunProjectionEvidence[] {
  const evidence = new Map<string, AgentAppRunProjectionEvidence>();
  for (const event of events) {
    if (!event.type.startsWith("evidence.")) {
      continue;
    }
    const evidenceId = event.evidenceId ?? stableEventId(event);
    evidence.set(evidenceId, {
      evidenceId,
      label: "evidence",
      preview: previewForEvent(event),
      status: event.runtimeStatus,
    });
  }
  return [...evidence.values()];
}

function buildDiagnosticIndex(
  events: AgentUiProjectionEvent[],
): AgentAppRunProjectionDiagnostic[] {
  const diagnostics = new Map<string, AgentAppRunProjectionDiagnostic>();
  for (const event of events) {
    if (!event.type.startsWith("diagnostic.") && !event.type.startsWith("metric.")) {
      continue;
    }
    const diagnosticId = event.diagnosticId ?? stableEventId(event);
    diagnostics.set(diagnosticId, {
      diagnosticId,
      label: "diagnostic",
      preview: previewForEvent(event),
      status: event.runtimeStatus,
    });
  }
  return [...diagnostics.values()];
}

function collectText(
  events: AgentUiProjectionEvent[],
  type: AgentUiProjectionEvent["type"],
): string {
  return events
    .filter((event) => event.type === type)
    .map((event) => readPayloadString(event, "preview"))
    .filter((value): value is string => Boolean(value))
    .reduce((merged, value) => mergeStreamText(merged, value), "");
}

function resolveLatestRuntimeStatus(
  events: AgentUiProjectionEvent[],
): AgentUiRuntimeStatus | "unknown" {
  for (const event of [...events].reverse()) {
    const status = event.runtimeStatus ?? event.latestTurnStatus;
    if (status) {
      return status;
    }
  }
  return "unknown";
}

function isTerminalStatus(status: AgentUiRuntimeStatus | "unknown"): boolean {
  return ["completed", "failed", "cancelled", "aborted", "closed"].includes(status);
}

function previewForEvent(event: AgentUiProjectionEvent): string | undefined {
  return (
    readPayloadString(event, "preview") ??
    readPayloadString(event, "status") ??
    event.runtimeStatus
  );
}

function readPayloadString(
  event: AgentUiProjectionEvent,
  key: string,
): string | undefined {
  const value = event.payload?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function mergeStreamText(current: string, next: string): string {
  if (!current) {
    return next;
  }
  if (!next) {
    return current;
  }
  if (next.startsWith(current)) {
    return next;
  }
  const needsSpace =
    /[A-Za-z0-9`)]$/.test(current) && /^[A-Za-z0-9`(]/.test(next);
  return `${current}${needsSpace ? " " : ""}${next}`;
}

function stableEventId(event: AgentUiProjectionEvent): string {
  return [
    event.rawEventRef,
    event.type,
    event.sequence,
    event.toolCallId,
    event.actionId,
    event.artifactId,
    event.evidenceId,
  ]
    .filter((value) => value !== undefined && value !== null && `${value}`.trim())
    .join(":");
}

function uniqueCount(values: Array<string | undefined>): number {
  return new Set(values.filter((value): value is string => Boolean(value))).size;
}
