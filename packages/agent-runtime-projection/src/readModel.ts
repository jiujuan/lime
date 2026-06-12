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
  if (status === "canceled") return "agent.status.canceled";
  if (status === "failed") return "agent.status.failed";
  return "agent.status.pending";
}

export function agentEventDisplayStatusKey(
  event: AgentRuntimeExecutionEvent,
): AgentRuntimeDisplayStatusKey {
  if (event.eventClass === "action.required") {
    return "agent.status.actionRequired";
  }
  if (isActionTerminalEventClass(event.eventClass)) {
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

function projectAgentRuntimeActions(
  event: AgentRuntimeExecutionEvent,
): AgentRuntimeActionProjection[] {
  const baseAction = projectAgentRuntimeAction(event);
  const controls = readActionControls(event);
  if (!controls.length) {
    return [baseAction];
  }
  return controls.map((control) => ({
    ...baseAction,
    labelKey: actionLabelKey(control),
    decision: control,
  }));
}

function readActionControls(event: AgentRuntimeExecutionEvent): string[] {
  const payloadControls = event.payload?.controls;
  const controls = Array.isArray(payloadControls) ? payloadControls : [];
  return [
    ...new Set(
      controls.filter(
        (control): control is string =>
          typeof control === "string" && Boolean(control.trim()),
      ),
    ),
  ];
}

function actionLabelKey(control: string): string {
  if (control === "approve") return "agent.action.approve";
  if (control === "reject") return "agent.action.reject";
  if (control === "answer") return "agent.action.answer";
  if (control === "retry") return "agent.action.retry";
  if (control === "stop") return "agent.action.stop";
  return `agent.action.${control}`;
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
    if (!isActionTerminalEventClass(event.eventClass)) return;
    // action terminal 可能只带 actionId，也可能通过 payload 指回原事件。
    if (event.actionId) resolvedActionIds.add(event.actionId);
    const sourceEventId = resolvedFromEventId(event);
    if (sourceEventId) resolvedEventIds.add(sourceEventId);
  });
  return { resolvedActionIds, resolvedEventIds };
}

function isActionTerminalEventClass(eventClass?: string): boolean {
  return (
    eventClass === "action.resolved" ||
    eventClass === "action.cancelled" ||
    eventClass === "action.canceled" ||
    eventClass === "action.expired"
  );
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
  if (
    event.source.status === "blocked" ||
    event.source.status === "failed" ||
    event.source.status === "canceled"
  ) {
    return true;
  }
  if (event.surface === "artifact" || event.surface === "evidence") return true;
  if (isActionTerminalEventClass(eventClass)) return true;
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
  const actions =
    event.eventClass === "action.required" && !resolved
      ? projectAgentRuntimeActions(event)
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
    actions,
    actionId: event.actionId,
    resolved,
    actionKind: agentEventActionKind(event),
    targetModule: agentEventTargetModule(event),
  };
}

export interface AgentRuntimeReadModelAccumulator<
  TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent,
> {
  apply(event: TEvent): AgentRuntimeReadModel<TEvent>;
  getReadModel(): AgentRuntimeReadModel<TEvent>;
  getEventsBySurface(
    surface: AgentRuntimeSurface,
  ): AgentRuntimeEventProjection<TEvent>[];
  reset(sourceCount?: number): AgentRuntimeReadModel<TEvent>;
}

function addIndex(index: Map<string, Set<number>>, key: string, value: number): void {
  const values = index.get(key);
  if (values) {
    values.add(value);
    return;
  }
  index.set(key, new Set([value]));
}

function snapshotProjection<
  TEvent extends AgentRuntimeExecutionEvent,
>(
  projection: AgentRuntimeEventProjection<TEvent>,
): AgentRuntimeEventProjection<TEvent> {
  return {
    ...projection,
    action: projection.action ? { ...projection.action } : undefined,
    actions: projection.actions?.map((action) => ({ ...action })),
  };
}

function snapshotProjections<
  TEvent extends AgentRuntimeExecutionEvent,
>(
  projections: AgentRuntimeEventProjection<TEvent>[],
): AgentRuntimeEventProjection<TEvent>[] {
  return projections.map(snapshotProjection);
}

export function createAgentRuntimeReadModelAccumulator<
  TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent,
>(sourceCount = 0): AgentRuntimeReadModelAccumulator<TEvent> {
  let events: AgentRuntimeEventProjection<TEvent>[] = [];
  let sourceCountValue = sourceCount;
  const visibleEvents: AgentRuntimeEventProjection<TEvent>[] = [];
  const pendingActions = new Map<string, AgentRuntimeEventProjection<TEvent>>();
  const surfaceEvents = new Map<AgentRuntimeSurface, AgentRuntimeEventProjection<TEvent>[]>();
  const artifactRefs = new Set<string>();
  const evidenceRefs = new Set<string>();
  const taskRefs = new Set<string>();
  const resolvedActionIds = new Set<string>();
  const resolvedEventIds = new Set<string>();
  const actionRequiredIndexesByActionId = new Map<string, Set<number>>();
  const actionRequiredIndexByEventId = new Map<string, number>();
  let inputSourceRecovery = false;
  let readModel = buildReadModel();

  function context(): AgentRuntimeProjectionContext {
    return { resolvedActionIds, resolvedEventIds };
  }

  function buildReadModel(): AgentRuntimeReadModel<TEvent> {
    return {
      events: snapshotProjections(events),
      visibleEvents: snapshotProjections(visibleEvents.slice(-8)),
      pendingActions: snapshotProjections(Array.from(pendingActions.values())),
      inputSourceRecovery,
      sourceCount: sourceCountValue,
      artifactRefs: Array.from(artifactRefs),
      evidenceRefs: Array.from(evidenceRefs),
      taskRefs: Array.from(taskRefs),
    };
  }

  function rememberSurface(
    projection: AgentRuntimeEventProjection<TEvent>,
  ): void {
    const items = surfaceEvents.get(projection.surface);
    if (items) {
      items.push(projection);
      return;
    }
    surfaceEvents.set(projection.surface, [projection]);
  }

  function rememberVisible(
    projection: AgentRuntimeEventProjection<TEvent>,
  ): void {
    if (isVisibleAgentRuntimeEvent(projection)) {
      visibleEvents.push(projection);
    }
  }

  function refreshPendingAction(
    projection: AgentRuntimeEventProjection<TEvent>,
  ): void {
    if (projection.action) {
      pendingActions.set(projection.id, projection);
      return;
    }
    pendingActions.delete(projection.id);
  }

  function updateProjectionAt(index: number): void {
    const current = events[index];
    if (!current) return;
    const next = projectAgentRuntimeEvent(current.source, context());
    Object.assign(current, next);
    refreshPendingAction(current);
  }

  function updateResolvedActionProjections(event: TEvent): void {
    if (event.actionId) {
      for (const index of actionRequiredIndexesByActionId.get(event.actionId) ?? []) {
        updateProjectionAt(index);
      }
    }
    const sourceEventId = resolvedFromEventId(event);
    if (sourceEventId) {
      const index = actionRequiredIndexByEventId.get(sourceEventId);
      if (typeof index === "number") {
        updateProjectionAt(index);
      }
    }
  }

  function reset(nextSourceCount = 0): AgentRuntimeReadModel<TEvent> {
    events = [];
    sourceCountValue = nextSourceCount;
    visibleEvents.length = 0;
    pendingActions.clear();
    surfaceEvents.clear();
    artifactRefs.clear();
    evidenceRefs.clear();
    taskRefs.clear();
    resolvedActionIds.clear();
    resolvedEventIds.clear();
    actionRequiredIndexesByActionId.clear();
    actionRequiredIndexByEventId.clear();
    inputSourceRecovery = false;
    readModel = buildReadModel();
    return readModel;
  }

  return {
    apply(event) {
      if (isActionTerminalEventClass(event.eventClass)) {
        if (event.actionId) resolvedActionIds.add(event.actionId);
        const sourceEventId = resolvedFromEventId(event);
        if (sourceEventId) resolvedEventIds.add(sourceEventId);
        updateResolvedActionProjections(event);
      }

      const projection = projectAgentRuntimeEvent(event, context());
      events.push(projection);
      rememberSurface(projection);
      rememberVisible(projection);
      refreshPendingAction(projection);

      if (event.eventClass === "action.required") {
        const index = events.length - 1;
        actionRequiredIndexByEventId.set(event.id, index);
        if (event.actionId) {
          addIndex(actionRequiredIndexesByActionId, event.actionId, index);
        }
      }

      event.artifactRefs?.forEach((ref) => artifactRefs.add(ref));
      event.evidenceRefs?.forEach((ref) => evidenceRefs.add(ref));
      if (event.taskId) taskRefs.add(event.taskId);
      inputSourceRecovery ||= isAgentInputSourceRecoveryEvent(event);
      readModel = buildReadModel();
      return readModel;
    },
    getReadModel() {
      return readModel;
    },
    getEventsBySurface(surface) {
      return snapshotProjections(surfaceEvents.get(surface) ?? []);
    },
    reset,
  };
}

export function projectAgentRuntimeReadModel<
  TEvent extends AgentRuntimeExecutionEvent,
>(input?: AgentRuntimeProjectionInput<TEvent>): AgentRuntimeReadModel<TEvent> {
  const accumulator = createAgentRuntimeReadModelAccumulator<TEvent>(
    input?.sourceCount ?? 0,
  );
  for (const event of input?.executionEvents ?? []) {
    accumulator.apply(event);
  }
  return accumulator.getReadModel();
}

export function isAgentInputSourceRecoveryEvent(
  event: AgentRuntimeExecutionEvent,
): boolean {
  return (
    (event.eventClass === "action.required" ||
      isActionTerminalEventClass(event.eventClass)) &&
    (agentEventActionKind(event) === "add-input-source" ||
      agentEventTargetModule(event) === "knowledge-inputs")
  );
}
