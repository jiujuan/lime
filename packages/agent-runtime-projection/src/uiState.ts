import type {
  AgentRuntimeExecutionEvent,
  AgentRuntimeProjectionInput,
  AgentRuntimeReadModel,
  AgentUiArtifactRefView,
  AgentUiEvidenceRefView,
  AgentUiProjectionState,
  AgentUiProjector,
  AgentUiRefView,
  AgentUiRuntimeStatusView,
  ExecutionGraphNode,
  ExecutionGraphNodeType,
  ProcessTimelineEntry,
  ProcessTimelineEntryKind,
  UIMessagePart,
} from "@limecloud/agent-ui-contracts";
import { agentEventSurface, projectAgentRuntimeReadModel } from "./readModel.js";
import { buildAgentUiSubagentsModel } from "./subagents.js";

function eventRefs(event: AgentRuntimeExecutionEvent): string[] {
  return [
    ...(event.refIds ?? []),
    ...(event.artifactRefs ?? []),
    ...(event.evidenceRefs ?? []),
  ];
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

export interface AgentUiSessionSnapshotMessage {
  id: string;
  role?: "user" | "assistant" | "system" | string;
  content?: string;
  text?: string;
  createdAt?: string;
  refs?: string[];
}

export interface AgentUiSessionSnapshotInput<
  TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent,
> extends AgentRuntimeProjectionInput<TEvent> {
  messages?: readonly AgentUiSessionSnapshotMessage[];
  readModel?: AgentRuntimeReadModel<TEvent>;
}

function payloadString(
  event: AgentRuntimeExecutionEvent,
  ...keys: string[]
): string | undefined {
  const payload = event.payload;
  if (!isRecord(payload)) return undefined;
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return undefined;
}

function payloadRecord(
  event: AgentRuntimeExecutionEvent,
  key: string,
): Record<string, unknown> | undefined {
  const payload = event.payload;
  if (!isRecord(payload)) return undefined;
  const value = payload[key];
  return isRecord(value) ? value : undefined;
}

function safeRefPath(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (/^(?:[A-Za-z]:[\\/]|\/|file:)/.test(value)) return undefined;
  if (/(?:api[-_]?key|authorization|password|secret|token)=/i.test(value)) {
    return undefined;
  }
  return value;
}

function safePreview(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.length > 280 ? `${value.slice(0, 277)}...` : value;
}

function compactRefView(ref: AgentUiRefView): AgentUiRefView {
  return Object.fromEntries(
    Object.entries(ref).filter(([, value]) => value !== undefined),
  ) as AgentUiRefView;
}

function refViewForEvent(
  event: AgentRuntimeExecutionEvent,
  refId: string,
): AgentUiRefView {
  const payloadSourceEventId = payloadString(event, "sourceEventId", "eventId");
  const path = safeRefPath(
    payloadString(
      event,
      "path",
      "relativePath",
      "packRelativeRoot",
      "artifactPath",
      "evidencePath",
    ),
  );
  return compactRefView({
    id: refId,
    sourceEventId: payloadSourceEventId ?? event.id,
    title: payloadString(event, "title", "name") ?? event.title,
    status: event.status,
    owner: event.owner,
    path,
    contentRef: payloadString(event, "contentRef", "uri", "url"),
    mimeType: payloadString(event, "mimeType", "mime"),
    preview: safePreview(payloadString(event, "preview", "summary", "text")),
    metadata: payloadRecord(event, "metadata"),
  });
}

function collectRefViews(
  events: AgentRuntimeExecutionEvent[],
  readModelRefs: string[],
  kind: "artifact" | "evidence",
): AgentUiRefView[] {
  const refs = new Map<string, AgentUiRefView>();
  events.forEach((event) => {
    const eventRefs = kind === "artifact"
      ? event.artifactRefs ?? []
      : event.evidenceRefs ?? [];
    eventRefs.forEach((id) => {
      if (!refs.has(id)) refs.set(id, refViewForEvent(event, id));
    });
  });
  readModelRefs.forEach((id) => {
    if (!refs.has(id)) {
      refs.set(id, { id, sourceEventId: id });
    }
  });
  return Array.from(refs.values());
}

function uiPartForEvent(
  event: AgentRuntimeExecutionEvent,
): UIMessagePart | undefined {
  const eventClass = event.eventClass ?? "";
  if (
    event.kind === "model" ||
    eventClass === "model.delta" ||
    eventClass === "model.completed"
  ) {
    return {
      type: "text",
      partId: event.id,
      messageId:
        typeof event.payload?.messageId === "string"
          ? event.payload.messageId
          : event.id,
      role: "assistant",
      text:
        typeof event.payload?.text === "string"
          ? event.payload.text
          : event.detail ?? event.title,
      state:
        eventClass === "model.completed" || event.status === "completed"
          ? "final"
          : "streaming",
      sourceEventId: event.id,
      createdAt: event.createdAt,
      refs: eventRefs(event),
    };
  }
  if (eventClass.startsWith("reasoning.") || event.kind === "note") {
    return {
      type: "reasoning",
      partId: event.id,
      text: event.detail ?? event.title,
      state: event.status === "completed" ? "final" : "streaming",
      sourceEventId: event.id,
      createdAt: event.createdAt,
      refs: eventRefs(event),
    };
  }
  if (eventClass === "tool.result" || eventClass === "tool.failed") {
    return {
      type: "tool-preview",
      partId: event.id,
      text: event.detail ?? event.title,
      state: event.status === "failed" ? "failed" : "available",
      toolCallId: event.toolCallId,
      sourceEventId: event.id,
      createdAt: event.createdAt,
      refs: eventRefs(event),
    };
  }
  if (eventClass === "artifact.changed" || event.kind === "draft") {
    return {
      type: "artifact-card",
      partId: event.id,
      text: event.detail ?? event.title,
      state: event.status === "failed" ? "failed" : "available",
      artifactId: event.artifactId ?? event.artifactRefs?.[0],
      sourceEventId: event.id,
      createdAt: event.createdAt,
      refs: eventRefs(event),
    };
  }
  if (eventClass === "evidence.changed" || event.kind === "evidence") {
    return {
      type: "evidence-citation",
      partId: event.id,
      text: event.detail ?? event.title,
      state: event.status === "failed" ? "failed" : "available",
      evidenceId: event.evidenceId ?? event.evidenceRefs?.[0],
      sourceEventId: event.id,
      createdAt: event.createdAt,
      refs: eventRefs(event),
    };
  }
  if (
    eventClass === "runtime.error" ||
    eventClass === "snapshot.updated" ||
    event.owner === "diagnostics" ||
    event.status === "failed" ||
    event.status === "blocked"
  ) {
    return {
      type: "diagnostic-ref",
      partId: event.id,
      text: event.detail ?? event.title,
      state: event.status,
      diagnosticId: event.traceId ?? event.id,
      sourceEventId: event.id,
      createdAt: event.createdAt,
      refs: eventRefs(event),
    };
  }
  return undefined;
}

function messageScopeKey(event: AgentRuntimeExecutionEvent): string {
  return [
    event.runtimeId,
    event.threadId,
    event.runId,
    event.turnId,
    event.taskId,
    typeof event.payload?.messageId === "string" ? event.payload.messageId : undefined,
  ]
    .filter((value): value is string => Boolean(value))
    .join(":") || "default";
}

function messagePartGroupKey(
  event: AgentRuntimeExecutionEvent,
  part: UIMessagePart,
): string | null {
  const eventClass = event.eventClass ?? "";
  if (part.type === "text" && eventClass === "model.delta") {
    return `stream:text:${messageScopeKey(event)}`;
  }
  if (part.type === "reasoning" && eventClass.startsWith("reasoning.")) {
    return `stream:reasoning:${messageScopeKey(event)}`;
  }
  return null;
}

function mergeStreamText(current = "", next = ""): string {
  if (!current) return next;
  if (!next) return current;
  if (next.startsWith(current)) return next;
  const needsSpace =
    /[A-Za-z0-9`)]$/.test(current) && /^[A-Za-z0-9`(]/.test(next);
  return `${current}${needsSpace ? " " : ""}${next}`;
}

function mergeMessagePart(current: UIMessagePart, next: UIMessagePart): UIMessagePart {
  return {
    ...current,
    text: mergeStreamText(current.text, next.text),
    state: next.state ?? current.state,
    sourceEventId: next.sourceEventId,
    createdAt: current.createdAt ?? next.createdAt,
    refs: [...new Set([...(current.refs ?? []), ...(next.refs ?? [])])],
  };
}

function collectMessageParts(
  events: AgentRuntimeExecutionEvent[],
): UIMessagePart[] {
  const parts: UIMessagePart[] = [];
  const groups = new Map<string, number>();

  events.forEach((event) => {
    const part = uiPartForEvent(event);
    if (!part) return;
    const groupKey = messagePartGroupKey(event, part);
    if (!groupKey) {
      parts.push(part);
      return;
    }
    const existingIndex = groups.get(groupKey);
    if (typeof existingIndex === "number") {
      parts[existingIndex] = mergeMessagePart(parts[existingIndex], part);
      return;
    }
    groups.set(groupKey, parts.length);
    parts.push(part);
  });

  return parts;
}

function normalizeSnapshotMessageRole(
  role: AgentUiSessionSnapshotMessage["role"],
): string {
  return role && role.trim() ? role : "assistant";
}

function snapshotMessageText(message: AgentUiSessionSnapshotMessage): string {
  return message.content ?? message.text ?? "";
}

function messagePartForSnapshotMessage(
  message: AgentUiSessionSnapshotMessage,
): UIMessagePart {
  return {
    type: "text",
    partId: `message:${message.id}`,
    messageId: message.id,
    role: normalizeSnapshotMessageRole(message.role),
    text: snapshotMessageText(message),
    state: "final",
    sourceEventId: `message:${message.id}`,
    createdAt: message.createdAt,
    refs: message.refs,
  };
}

function collectExecutionEventsFromReadModel<TEvent extends AgentRuntimeExecutionEvent>(
  readModel?: AgentRuntimeReadModel<TEvent>,
): TEvent[] {
  return readModel?.events.map((event) => event.source) ?? [];
}

function timelineKindForEvent(
  event: AgentRuntimeExecutionEvent,
): ProcessTimelineEntryKind {
  const surface = agentEventSurface(event);
  if (surface === "runtime-status") return "status";
  if (surface === "human-action") return "action";
  if (surface === "permission") return "action";
  if (surface === "tool") return "tool";
  if (surface === "artifact") return "artifact";
  if (surface === "evidence") return "evidence";
  if (surface === "context") return "status";
  if ((event.eventClass ?? "").startsWith("reasoning.")) return "reasoning";
  if (event.taskId) return "task";
  return "message";
}

function timelineEntryForEvent(
  event: AgentRuntimeExecutionEvent,
): ProcessTimelineEntry {
  return {
    entryId: event.id,
    sequence: event.sequence,
    kind: timelineKindForEvent(event),
    phase: event.phase,
    owner: event.owner,
    status: event.status,
    title: event.title,
    detail: event.detail,
    refs: eventRefs(event),
    sourceEventId: event.id,
    createdAt: event.createdAt,
    completedAt: event.completedAt,
  };
}

function graphNodeIdForEvent(
  event: AgentRuntimeExecutionEvent,
): string | undefined {
  return (
    event.subagentId ??
    event.toolCallId ??
    event.actionId ??
    event.stepId ??
    event.attemptId ??
    event.runId ??
    event.taskId ??
    event.turnId
  );
}

function graphNodeTypeForEvent(
  event: AgentRuntimeExecutionEvent,
): ExecutionGraphNodeType {
  if (event.subagentId) return "subagent";
  if (event.toolCallId) return "tool";
  if (event.actionId) return "action";
  if (event.stepId) return "step";
  if (event.attemptId) return "attempt";
  if (event.runId) return "run";
  if (event.taskId) return "task";
  if (event.turnId) return "turn";
  return "task";
}

function upsertGraphNode(
  nodes: Map<string, ExecutionGraphNode>,
  event: AgentRuntimeExecutionEvent,
): void {
  const nodeId = graphNodeIdForEvent(event);
  if (!nodeId) return;
  const existing = nodes.get(nodeId);
  const refs = new Set([...(existing?.refs ?? []), ...eventRefs(event)]);
  const sourceEventIds = new Set([
    ...(existing?.sourceEventIds ?? []),
    event.id,
  ]);
  nodes.set(nodeId, {
    nodeId,
    parentId:
      event.subagentId && event.taskId
        ? event.taskId
        : event.stepId && event.toolCallId
        ? event.stepId
        : event.taskId && event.runId
          ? event.taskId
          : undefined,
    nodeType: existing?.nodeType ?? graphNodeTypeForEvent(event),
    status: event.status,
    title: existing?.title ?? event.title,
    refs: Array.from(refs),
    sourceEventIds: Array.from(sourceEventIds),
    createdAt: existing?.createdAt ?? event.createdAt,
    completedAt: event.completedAt ?? existing?.completedAt,
  });
}

function runtimeStatusForEvents(
  events: AgentRuntimeExecutionEvent[],
): AgentUiRuntimeStatusView {
  const latest = events.length ? events[events.length - 1] : undefined;
  const resolvedActionIds = new Set<string>();
  let status: AgentUiRuntimeStatusView["status"] = "idle";
  // 从最新事件倒序解析运行态，避免已处理 action 继续把 runtime 锁在 waiting。
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.eventClass === "action.resolved" && event.actionId) {
      resolvedActionIds.add(event.actionId);
      continue;
    }
    if (
      event.status === "failed" ||
      event.eventClass === "turn.failed" ||
      event.eventClass === "runtime.error"
    ) {
      status = "failed";
      break;
    }
    if (event.status === "blocked") {
      status = "blocked";
      break;
    }
    if (
      event.eventClass === "action.required" &&
      (!event.actionId || !resolvedActionIds.has(event.actionId))
    ) {
      status = "waiting";
      break;
    }
    if (
      event.status === "pending" &&
      (!event.actionId || !resolvedActionIds.has(event.actionId))
    ) {
      status = "waiting";
      break;
    }
    if (
      event.eventClass === "turn.completed" ||
      event.eventClass === "model.completed"
    ) {
      status = "completed";
      break;
    }
    if (
      event.status === "running" ||
      event.eventClass === "turn.started" ||
      event.eventClass === "model.delta"
    ) {
      status = "running";
      break;
    }
  }
  return {
    status,
    activeTurnId: latest?.turnId,
    activeRunId: latest?.runId,
    activeTaskId: latest?.taskId,
    latestEventId: latest?.id,
    latestSequence: latest?.sequence,
  };
}

export function projectAgentUiState<
  TEvent extends AgentRuntimeExecutionEvent,
>(input?: AgentRuntimeProjectionInput<TEvent>): AgentUiProjectionState<TEvent> {
  const executionEvents = input?.executionEvents ?? [];
  const readModel = projectAgentRuntimeReadModel(input);
  const messages = collectMessageParts(executionEvents);
  const timeline = executionEvents.map(timelineEntryForEvent);
  const graphNodes = new Map<string, ExecutionGraphNode>();
  executionEvents.forEach((event) => upsertGraphNode(graphNodes, event));
  const graph = Array.from(graphNodes.values());
  const actions = readModel.events.filter(
    (event) => event.surface === "human-action",
  );
  const tools = readModel.events.filter((event) => event.surface === "tool");
  const diagnostics = executionEvents
    .filter(
      (event) =>
        event.status === "failed" ||
        event.status === "blocked" ||
        event.eventClass === "runtime.error",
    )
    .map((event) => ({
      id: event.traceId ?? event.id,
      sourceEventId: event.id,
      title: event.title,
      detail: event.detail,
      status: event.status,
    }));
  return {
    runtime: runtimeStatusForEvents(executionEvents),
    messages,
    timeline,
    graph,
    tools,
    actions,
    artifacts: collectRefViews(
      executionEvents,
      readModel.artifactRefs,
      "artifact",
    ) as AgentUiArtifactRefView[],
    evidence: collectRefViews(
      executionEvents,
      readModel.evidenceRefs,
      "evidence",
    ) as AgentUiEvidenceRefView[],
    diagnostics,
    subagents: buildAgentUiSubagentsModel(executionEvents),
    readModel,
    hydration: {
      status: executionEvents.length ? "live" : "idle",
      eventCount: executionEvents.length,
    },
    ephemeralUi: {},
  };
}

export function projectAgentUiStateFromSessionSnapshot<
  TEvent extends AgentRuntimeExecutionEvent,
>(
  input: AgentUiSessionSnapshotInput<TEvent> = {},
): AgentUiProjectionState<TEvent> {
  const executionEvents =
    input.executionEvents ?? collectExecutionEventsFromReadModel(input.readModel);
  const state = projectAgentUiState<TEvent>({
    executionEvents,
    sourceCount: input.sourceCount ?? input.readModel?.sourceCount,
  });
  const messages = input.messages?.map(messagePartForSnapshotMessage) ?? [];
  if (!messages.length) {
    return state;
  }
  return {
    ...state,
    messages,
  };
}

export function createAgentUiProjector<
  TEvent extends AgentRuntimeExecutionEvent,
>(initialInput?: AgentRuntimeProjectionInput<TEvent>): AgentUiProjector<TEvent> {
  let events = [...(initialInput?.executionEvents ?? [])];
  let sourceCount = initialInput?.sourceCount;
  let state = projectAgentUiState<TEvent>({
    executionEvents: events,
    sourceCount,
  });
  return {
    getState() {
      return state;
    },
    hydrate(input?: AgentRuntimeProjectionInput<TEvent>) {
      events = [...(input?.executionEvents ?? [])];
      sourceCount = input?.sourceCount;
      state = projectAgentUiState<TEvent>({ executionEvents: events, sourceCount });
      return state;
    },
    apply(event: TEvent) {
      if (!events.some((existing) => existing.id === event.id)) {
        events = [...events, event];
      }
      state = projectAgentUiState<TEvent>({ executionEvents: events, sourceCount });
      return state;
    },
    reset() {
      events = [];
      sourceCount = undefined;
      state = projectAgentUiState<TEvent>();
      return state;
    },
  };
}
