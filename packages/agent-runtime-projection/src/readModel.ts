import type {
  AgentRuntimeActionProjection,
  AgentRuntimeDisplayStatusKey,
  AgentRuntimeEventProjection,
  AgentRuntimeExecutionEvent,
  AgentRuntimeExecutionEventStatus,
  AgentRuntimeProjectionInput,
  AgentRuntimeReadModel,
  AgentRuntimeSurface,
} from "@limecloud/agent-ui-contracts";

interface AgentRuntimeProjectionContext {
  resolvedActionIds: Set<string>;
  resolvedEventIds: Set<string>;
}

export function agentEventStatusLabel(
  status: AgentRuntimeExecutionEventStatus,
): string {
  return agentEventStatusKey(status);
}

export function agentEventStatusKey(
  status: AgentRuntimeExecutionEventStatus,
): AgentRuntimeDisplayStatusKey {
  if (status === "completed") return "agent.status.completed";
  if (status === "running") return "agent.status.running";
  if (status === "blocked") return "agent.status.blocked";
  if (status === "failed") return "agent.status.failed";
  return "agent.status.pending";
}

export function agentEventDisplayStatusKey(
  event: AgentRuntimeExecutionEvent,
): AgentRuntimeDisplayStatusKey {
  if (event.eventClass === "action.required") {
    return "agent.status.actionRequired";
  }
  if (event.eventClass === "action.resolved") {
    return "agent.status.actionResolved";
  }
  return agentEventStatusKey(event.status);
}

export function agentEventActionKind(
  event: AgentRuntimeExecutionEvent,
): string {
  return typeof event.payload?.actionKind === "string"
    ? event.payload.actionKind
    : "";
}

export function agentEventTargetModule(
  event: AgentRuntimeExecutionEvent,
): string {
  return typeof event.payload?.targetModule === "string"
    ? event.payload.targetModule
    : "";
}

export function projectAgentRuntimeAction(
  event: AgentRuntimeExecutionEvent,
): AgentRuntimeActionProjection {
  const actionKind = agentEventActionKind(event);
  const targetModule = agentEventTargetModule(event);
  if (actionKind === "configure-text-model") {
    return {
      actionKind,
      targetModule,
      labelKey: "agent.action.configureTextModel",
      decision: "open-model-settings",
    };
  }
  if (actionKind === "add-input-source" || targetModule === "knowledge-inputs") {
    return {
      actionKind: actionKind || "add-input-source",
      targetModule,
      labelKey: "agent.action.addInputSource",
      decision: "open-input-source",
    };
  }
  return {
    actionKind,
    targetModule,
    labelKey: "agent.action.acknowledge",
    decision: "acknowledge",
  };
}

function resolvedFromEventId(event: AgentRuntimeExecutionEvent): string {
  return typeof event.payload?.resolvedFromEventId === "string"
    ? event.payload.resolvedFromEventId
    : "";
}

function buildProjectionContext(
  events: AgentRuntimeExecutionEvent[],
): AgentRuntimeProjectionContext {
  const resolvedActionIds = new Set<string>();
  const resolvedEventIds = new Set<string>();
  events.forEach((event) => {
    if (event.eventClass !== "action.resolved") return;
    // action.resolved 可能只带 actionId，也可能通过 payload 指回原事件。
    if (event.actionId) resolvedActionIds.add(event.actionId);
    const sourceEventId = resolvedFromEventId(event);
    if (sourceEventId) resolvedEventIds.add(sourceEventId);
  });
  return { resolvedActionIds, resolvedEventIds };
}

export function agentEventSurface(
  event: AgentRuntimeExecutionEvent,
): AgentRuntimeSurface {
  if (event.eventClass === "action.required") return "human-action";
  if (event.kind === "action") return "human-action";
  if (
    event.kind === "permission" ||
    event.kind === "sandbox" ||
    event.eventClass?.startsWith("permission.") ||
    event.eventClass?.startsWith("sandbox.")
  ) {
    return "permission";
  }
  if (event.kind === "draft" || event.eventClass === "artifact.changed") {
    return "artifact";
  }
  if (event.kind === "evidence" || event.eventClass === "evidence.changed") {
    return "evidence";
  }
  if (event.kind === "state" || event.eventClass === "snapshot.updated") {
    return "runtime-status";
  }
  if (
    event.kind === "context" ||
    event.kind === "source" ||
    event.eventClass === "context.resolved"
  ) {
    return "context";
  }
  if (
    event.kind === "skill" ||
    event.kind === "tool" ||
    event.eventClass?.startsWith("tool.") ||
    event.phase === "tool_running"
  ) {
    return "tool";
  }
  if (event.kind === "model") return "runtime-status";
  return "message";
}

function isVisibleAgentRuntimeEvent(
  event: AgentRuntimeEventProjection<AgentRuntimeExecutionEvent>,
): boolean {
  const eventClass = event.source.eventClass ?? "";
  if (event.action) return true;
  if (event.resolved) return true;
  if (event.source.status === "blocked" || event.source.status === "failed") {
    return true;
  }
  if (event.surface === "artifact" || event.surface === "evidence") return true;
  if (eventClass === "action.resolved") return true;
  if (eventClass === "model.completed" || eventClass === "model.failed") {
    return true;
  }
  if (
    eventClass === "tool.catalog.resolved" &&
    Number(event.source.payload?.skillCount ?? 0) > 0
  ) {
    return true;
  }
  return false;
}

export function projectAgentRuntimeEvent<
  TEvent extends AgentRuntimeExecutionEvent,
>(
  event: TEvent,
  context: AgentRuntimeProjectionContext = {
    resolvedActionIds: new Set(),
    resolvedEventIds: new Set(),
  },
): AgentRuntimeEventProjection<TEvent> {
  const resolved =
    event.eventClass === "action.required" &&
    ((event.actionId ? context.resolvedActionIds.has(event.actionId) : false) ||
      context.resolvedEventIds.has(event.id));
  const action =
    event.eventClass === "action.required" && !resolved
      ? projectAgentRuntimeAction(event)
      : undefined;
  return {
    id: event.id,
    source: event,
    surface: agentEventSurface(event),
    title: event.title,
    detail: event.detail,
    status: event.status,
    displayStatusKey: resolved
      ? "agent.status.actionResolved"
      : agentEventDisplayStatusKey(event),
    action,
    actionId: event.actionId,
    resolved,
    actionKind: agentEventActionKind(event),
    targetModule: agentEventTargetModule(event),
  };
}

export function projectAgentRuntimeReadModel<
  TEvent extends AgentRuntimeExecutionEvent,
>(input?: AgentRuntimeProjectionInput<TEvent>): AgentRuntimeReadModel<TEvent> {
  const sourceEvents = input?.executionEvents ?? [];
  const context = buildProjectionContext(sourceEvents);
  const events = sourceEvents.map((event) =>
    projectAgentRuntimeEvent(event, context),
  );
  const artifactRefs = new Set<string>();
  const evidenceRefs = new Set<string>();
  const taskRefs = new Set<string>();
  sourceEvents.forEach((event) => {
    event.artifactRefs?.forEach((ref) => artifactRefs.add(ref));
    event.evidenceRefs?.forEach((ref) => evidenceRefs.add(ref));
    if (event.taskId) taskRefs.add(event.taskId);
  });
  return {
    events,
    visibleEvents: events.filter(isVisibleAgentRuntimeEvent).slice(-8),
    pendingActions: events.filter((event) => Boolean(event.action)),
    inputSourceRecovery: sourceEvents.some((event) =>
      isAgentInputSourceRecoveryEvent(event),
    ),
    sourceCount: input?.sourceCount ?? 0,
    artifactRefs: Array.from(artifactRefs),
    evidenceRefs: Array.from(evidenceRefs),
    taskRefs: Array.from(taskRefs),
  };
}

export function isAgentInputSourceRecoveryEvent(
  event: AgentRuntimeExecutionEvent,
): boolean {
  return (
    (event.eventClass === "action.required" ||
      event.eventClass === "action.resolved") &&
    (agentEventActionKind(event) === "add-input-source" ||
      agentEventTargetModule(event) === "knowledge-inputs")
  );
}
