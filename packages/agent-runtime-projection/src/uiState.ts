import type {
  AgentRuntimeExecutionEvent,
  AgentRuntimeProjectionInput,
  AgentUiProjectionState,
  AgentUiProjector,
  AgentUiRuntimeStatusView,
  ExecutionGraphNode,
  ExecutionGraphNodeType,
  ProcessTimelineEntry,
  ProcessTimelineEntryKind,
  UIMessagePart,
} from "@limecloud/agent-ui-contracts";
import { agentEventSurface, projectAgentRuntimeReadModel } from "./readModel.js";

function eventRefs(event: AgentRuntimeExecutionEvent): string[] {
  return [
    ...(event.refIds ?? []),
    ...(event.artifactRefs ?? []),
    ...(event.evidenceRefs ?? []),
  ];
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
      event.stepId && event.toolCallId
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
  const messages = executionEvents
    .map(uiPartForEvent)
    .filter((part): part is UIMessagePart => Boolean(part));
  const timeline = executionEvents.map(timelineEntryForEvent);
  const graphNodes = new Map<string, ExecutionGraphNode>();
  executionEvents.forEach((event) => upsertGraphNode(graphNodes, event));
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
    graph: Array.from(graphNodes.values()),
    tools,
    actions,
    artifacts: readModel.artifactRefs.map((id) => ({
      id,
      sourceEventId: id,
    })),
    evidence: readModel.evidenceRefs.map((id) => ({
      id,
      sourceEventId: id,
    })),
    diagnostics,
    readModel,
    hydration: {
      status: executionEvents.length ? "live" : "idle",
      eventCount: executionEvents.length,
    },
    ephemeralUi: {},
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
