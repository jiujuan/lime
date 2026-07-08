import type {
  AgentRuntimeEventProjection,
  AgentRuntimeExecutionEvent,
  AgentUiProjectionState,
} from "@limecloud/agent-ui-contracts";
import {
  pluginRuntimeStatusFromStandardEvent,
  standardProjectionType,
} from "./agentUiProjectionStandardMapping";

export type PluginRunProjectionRuntimeStatus =
  | "idle"
  | "queued"
  | "submitted"
  | "accepted"
  | "preparing"
  | "running"
  | "waiting"
  | "needs_input"
  | "plan_ready"
  | "completed"
  | "failed"
  | "aborted"
  | "cancelled"
  | "closed"
  | "not_found"
  | "unknown"
  | string;

export type PluginRunProjectionSourceControl =
  | "approve"
  | "reject"
  | "answer"
  | "edit"
  | "retry"
  | "interrupt"
  | "stop"
  | "none"
  | string;

export interface PluginRunProjectionSourceRefs {
  artifactIds?: string[];
  artifactPaths?: string[];
  rawEventRef?: string;
}

export interface PluginRunProjectionSourceEvent {
  type: string;
  sequence?: number;
  timestamp?: string;
  sessionId?: string;
  threadId?: string;
  runId?: string;
  turnId?: string;
  messageId?: string;
  taskId?: string;
  toolCallId?: string;
  actionId?: string;
  artifactId?: string;
  evidenceId?: string;
  diagnosticId?: string;
  runtimeStatus?: PluginRunProjectionRuntimeStatus;
  latestTurnStatus?: PluginRunProjectionRuntimeStatus;
  surface?: string;
  control?: PluginRunProjectionSourceControl;
  payload?: Record<string, unknown>;
  refs?: PluginRunProjectionSourceRefs;
  rawEventRef?: string;
}

export type PluginRunProjectionPartKind =
  | "status"
  | "queue"
  | "text"
  | "reasoning"
  | "tool"
  | "action"
  | "artifact"
  | "evidence"
  | "diagnostic";

export type PluginRunProjectionLabel =
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

export type PluginRunProjectionActionControl = Exclude<
  PluginRunProjectionSourceControl,
  "none"
>;

export interface PluginRunProjectionPart {
  id: string;
  kind: PluginRunProjectionPartKind;
  type: string;
  sequence: number;
  label: PluginRunProjectionLabel;
  displayName?: string;
  preview?: string;
  runtimeStatus?: PluginRunProjectionRuntimeStatus;
  surface?: string;
  collapsedByDefault: boolean;
  toolCallId?: string;
  actionId?: string;
  artifactId?: string;
  evidenceId?: string;
}

export interface PluginRunProjectionAction {
  actionId: string;
  sessionId?: string;
  threadId?: string;
  runId?: string;
  turnId?: string;
  taskId?: string;
  actionType?: string;
  status: "pending" | "resolved";
  label: "actionRequired" | "actionResolved";
  control?: PluginRunProjectionActionControl;
  controls: PluginRunProjectionActionControl[];
  preview?: string;
}

export interface PluginRunProjectionArtifact {
  artifactId: string;
  label: "artifact";
  preview?: string;
  ref?: string;
  status?: PluginRunProjectionRuntimeStatus;
}

export interface PluginRunProjectionEvidence {
  evidenceId: string;
  label: "evidence";
  preview?: string;
  status?: PluginRunProjectionRuntimeStatus;
}

export interface PluginRunProjectionDiagnostic {
  diagnosticId: string;
  label: "diagnostic";
  preview?: string;
  status?: PluginRunProjectionRuntimeStatus;
}

export interface PluginRunProjectionTaskSummary {
  latestRuntimeStatus: PluginRunProjectionRuntimeStatus | "unknown";
  terminal: boolean;
  collapsedByDefault: boolean;
  pendingActionCount: number;
  toolCallCount: number;
  artifactCount: number;
  evidenceCount: number;
  queueCount: number;
}

export interface PluginRunProjectionMetrics {
  providerName?: string;
  modelName?: string;
  modelLabel?: string;
  tokenCount?: number;
  tokenText?: string;
  costText?: string;
}

export interface PluginRunProjectionViewModel {
  orderedParts: PluginRunProjectionPart[];
  actions: PluginRunProjectionAction[];
  artifacts: PluginRunProjectionArtifact[];
  evidence: PluginRunProjectionEvidence[];
  diagnostics: PluginRunProjectionDiagnostic[];
  task: PluginRunProjectionTaskSummary;
  metrics: PluginRunProjectionMetrics;
  answerText: string;
  reasoningText: string;
}

export function buildPluginRunProjectionViewModel(
  events: PluginRunProjectionSourceEvent[],
): PluginRunProjectionViewModel {
  const orderedEvents = [...events].sort(compareProjectionEvents);
  const orderedParts = buildOrderedProjectionParts(orderedEvents);
  const actions = buildActionIndex(orderedEvents);
  const artifacts = buildArtifactIndex(orderedEvents);
  const evidence = buildEvidenceIndex(orderedEvents);
  const diagnostics = buildDiagnosticIndex(orderedEvents);
  const latestRuntimeStatus = resolveLatestRuntimeStatus(orderedEvents);
  const terminal = isTerminalStatus(latestRuntimeStatus);
  const metrics = buildMetricSummary(orderedEvents);

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
    metrics,
    answerText: collectText(orderedEvents, "text.delta"),
    reasoningText: collectText(orderedEvents, "reasoning.delta"),
  };
}

export function buildPluginRunProjectionViewModelFromStandardState<
  TEvent extends AgentRuntimeExecutionEvent,
>(state: AgentUiProjectionState<TEvent>): PluginRunProjectionViewModel {
  return buildPluginRunProjectionViewModel(
    state.readModel.events.map(standardRuntimeProjectionToSourceEvent),
  );
}

function standardRuntimeProjectionToSourceEvent<TEvent extends AgentRuntimeExecutionEvent>(
  projection: AgentRuntimeEventProjection<TEvent>,
  index: number,
): PluginRunProjectionSourceEvent {
  const event = projection.source;
  const payload = event.payload ?? {};
  return {
    type: standardProjectionType(projection),
    sequence: event.sequence ?? index + 1,
    timestamp: event.createdAt,
    sessionId: stringValue(payload.sessionId) ?? event.runtimeId,
    threadId: stringValue(payload.threadId) ?? event.threadId,
    runId: event.runId,
    turnId: event.turnId,
    taskId: event.taskId,
    toolCallId: event.toolCallId,
    actionId: event.actionId,
    artifactId: event.artifactId ?? event.artifactRefs?.[0],
    evidenceId: event.evidenceId ?? event.evidenceRefs?.[0],
    diagnosticId: event.traceId ?? event.id,
    runtimeStatus: pluginRuntimeStatusFromStandardEvent(event),
    latestTurnStatus: pluginRuntimeStatusFromStandardEvent(event),
    surface: stringValue(payload.surface) ?? projection.surface,
    control: stringValue(payload.control),
    refs: {
      artifactIds: nonEmptyStrings(event.artifactRefs),
      artifactPaths: nonEmptyStrings([
        stringValue(payload.artifactRef),
        ...(event.artifactRefs ?? []),
      ]),
      rawEventRef: event.refIds?.[0],
    },
    rawEventRef: event.refIds?.[0] ?? event.id,
    payload: {
      ...payload,
      actionType:
        stringValue(payload.actionType) ??
        stringValue(payload.actionKind) ??
        projection.actionKind,
      controls: Array.isArray(payload.controls) ? payload.controls : undefined,
      eventType: event.eventClass,
      metricName: stringValue(payload.metricName) ?? event.eventClass,
      displayTitle: stringValue(payload.displayTitle),
      displayMessage: stringValue(payload.displayMessage),
      displayTitleKey: stringValue(payload.displayTitleKey),
      displayMessageKey: stringValue(payload.displayMessageKey),
      displayValues: recordPayloadValue(payload, "displayValues"),
      soulLifecycle: recordPayloadValue(payload, "soulLifecycle"),
      soulSurface: stringValue(payload.soulSurface),
      soulPhase: stringValue(payload.soulPhase),
      styleLevel: stringValue(payload.styleLevel),
      riskLevel: stringValue(payload.riskLevel),
      toneVariant: stringValue(payload.toneVariant),
      profileId: stringValue(payload.profileId),
      packId: stringValue(payload.packId),
      generationBriefBoundary: recordPayloadValue(
        payload,
        "generationBriefBoundary",
      ),
      preview: projection.detail ?? event.detail ?? event.title,
      providerName: stringValue(payload.providerName),
      modelName: stringValue(payload.modelName) ?? event.model,
      toolName: stringValue(payload.toolName) ?? event.title,
      usage: recordPayloadValue(payload, "usage"),
      cost: recordPayloadValue(payload, "cost"),
    },
  };
}

function compareProjectionEvents(
  left: PluginRunProjectionSourceEvent,
  right: PluginRunProjectionSourceEvent,
): number {
  const leftSequence = left.sequence ?? Number.MAX_SAFE_INTEGER;
  const rightSequence = right.sequence ?? Number.MAX_SAFE_INTEGER;
  if (leftSequence !== rightSequence) {
    return leftSequence - rightSequence;
  }
  return stableEventId(left).localeCompare(stableEventId(right));
}

function buildProjectionPart(event: PluginRunProjectionSourceEvent): PluginRunProjectionPart {
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
  events: PluginRunProjectionSourceEvent[],
): PluginRunProjectionPart[] {
  const parts: PluginRunProjectionPart[] = [];
  const groupedParts = new Map<string, PluginRunProjectionPart>();

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
  event: PluginRunProjectionSourceEvent,
  kind: PluginRunProjectionPartKind,
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

function projectionScopeKey(event: PluginRunProjectionSourceEvent): string {
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
  kind: PluginRunProjectionPartKind,
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
  event: PluginRunProjectionSourceEvent,
  kind: PluginRunProjectionPartKind,
  runtimeStatus?: PluginRunProjectionRuntimeStatus,
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
  event: PluginRunProjectionSourceEvent,
): PluginRunProjectionPartKind {
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
  event: PluginRunProjectionSourceEvent,
  kind: PluginRunProjectionPartKind,
): PluginRunProjectionLabel {
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
  events: PluginRunProjectionSourceEvent[],
): PluginRunProjectionAction[] {
  const actions = new Map<string, PluginRunProjectionAction>();
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
  event: PluginRunProjectionSourceEvent,
): PluginRunProjectionActionControl[] {
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
): value is PluginRunProjectionActionControl {
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
  events: PluginRunProjectionSourceEvent[],
): PluginRunProjectionArtifact[] {
  const artifacts = new Map<string, PluginRunProjectionArtifact>();
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
  events: PluginRunProjectionSourceEvent[],
): PluginRunProjectionEvidence[] {
  const evidence = new Map<string, PluginRunProjectionEvidence>();
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
  events: PluginRunProjectionSourceEvent[],
): PluginRunProjectionDiagnostic[] {
  const diagnostics = new Map<string, PluginRunProjectionDiagnostic>();
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

function buildMetricSummary(
  events: PluginRunProjectionSourceEvent[],
): PluginRunProjectionMetrics {
  const metrics: PluginRunProjectionMetrics = {};
  for (const event of events) {
    if (!event.type.startsWith("metric.")) {
      continue;
    }
    const payload = event.payload ?? {};
    const providerName = readPayloadString(event, "providerName");
    const modelName = readPayloadString(event, "modelName");
    const usage = recordPayloadValue(payload, "usage");
    const cost = recordPayloadValue(payload, "cost");
    const tokenCount = readNumber(usage, "totalTokens") ?? readNumber(usage, "total_tokens");
    const costText = formatCostText(cost);

    if (providerName) metrics.providerName = providerName;
    if (modelName) metrics.modelName = modelName;
    if (typeof tokenCount === "number") {
      metrics.tokenCount = tokenCount;
      metrics.tokenText = `${formatInteger(tokenCount)} tokens`;
    }
    if (costText) metrics.costText = costText;
  }

  if (metrics.modelName || metrics.providerName) {
    metrics.modelLabel = [metrics.providerName, metrics.modelName]
      .filter((value): value is string => Boolean(value))
      .join(" / ");
  }
  return metrics;
}

function collectText(
  events: PluginRunProjectionSourceEvent[],
  type: string,
): string {
  return events
    .filter((event) => event.type === type)
    .map((event) => readPayloadString(event, "preview"))
    .filter((value): value is string => Boolean(value))
    .reduce((merged, value) => mergeStreamText(merged, value), "");
}

function resolveLatestRuntimeStatus(
  events: PluginRunProjectionSourceEvent[],
): PluginRunProjectionRuntimeStatus | "unknown" {
  for (const event of [...events].reverse()) {
    const status = event.runtimeStatus ?? event.latestTurnStatus;
    if (status) {
      return status;
    }
  }
  return "unknown";
}

function isTerminalStatus(status: PluginRunProjectionRuntimeStatus | "unknown"): boolean {
  return ["completed", "failed", "cancelled", "aborted", "closed"].includes(status);
}

function previewForEvent(event: PluginRunProjectionSourceEvent): string | undefined {
  return (
    readPayloadString(event, "displayMessage") ??
    readPayloadString(event, "displayTitle") ??
    readPayloadString(event, "preview") ??
    readPayloadString(event, "status") ??
    event.runtimeStatus
  );
}

function readPayloadString(
  event: PluginRunProjectionSourceEvent,
  key: string,
): string | undefined {
  const value = event.payload?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function recordPayloadValue(
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const item = value[key];
  return item && typeof item === "object" && !Array.isArray(item)
    ? item as Record<string, unknown>
    : undefined;
}

function readNumber(
  value: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  const item = value?.[key];
  return typeof item === "number" && Number.isFinite(item) ? item : undefined;
}

function formatInteger(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

function formatCostText(value: Record<string, unknown> | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const total =
    readNumber(value, "estimatedTotalCost") ??
    readNumber(value, "estimated_total_cost") ??
    readNumber(value, "totalCost") ??
    readNumber(value, "total_cost") ??
    readNumber(value, "total");
  const currency = typeof value.currency === "string" && value.currency.trim()
    ? value.currency.trim()
    : "USD";
  if (typeof total === "number") {
    return `${currency} ${total.toFixed(total < 0.01 ? 4 : 2)}`;
  }
  const costClass =
    typeof value.estimatedCostClass === "string" && value.estimatedCostClass.trim()
      ? value.estimatedCostClass.trim()
      : typeof value.estimated_cost_class === "string" && value.estimated_cost_class.trim()
        ? value.estimated_cost_class.trim()
        : undefined;
  return costClass ? costClass : undefined;
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

function stableEventId(event: PluginRunProjectionSourceEvent): string {
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

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function nonEmptyStrings(values: Array<string | undefined> | undefined): string[] | undefined {
  const items = values?.filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );
  return items?.length ? items : undefined;
}

function uniqueCount(values: Array<string | undefined>): number {
  return new Set(values.filter((value): value is string => Boolean(value))).size;
}
