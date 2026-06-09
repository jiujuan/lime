import type {
  AgentUiEventClass,
  AgentUiProjectionEvent,
  AgentUiSurface,
} from "@limecloud/agent-ui-contracts";

export interface AgentUiProjectionScopeFilter {
  sessionId?: string | null;
  threadId?: string | null;
  runId?: string | null;
  turnId?: string | null;
  taskId?: string | null;
}

export interface AgentUiProjectionEventIndex {
  latestEventByType: Partial<Record<AgentUiEventClass, AgentUiProjectionEvent>>;
  latestEventByRun: Record<string, AgentUiProjectionEvent>;
  latestEventByToolCall: Record<string, AgentUiProjectionEvent>;
  latestEventByAction: Record<string, AgentUiProjectionEvent>;
  latestEventByArtifact: Record<string, AgentUiProjectionEvent>;
  latestEventByEvidence: Record<string, AgentUiProjectionEvent>;
}

export interface AgentUiProjectionEventStoreState
  extends AgentUiProjectionEventIndex {
  events: AgentUiProjectionEvent[];
}

export function createEmptyAgentUiProjectionEventIndex(): AgentUiProjectionEventIndex {
  return {
    latestEventByType: {},
    latestEventByRun: {},
    latestEventByToolCall: {},
    latestEventByAction: {},
    latestEventByArtifact: {},
    latestEventByEvidence: {},
  };
}

export function createEmptyAgentUiProjectionEventStoreState(): AgentUiProjectionEventStoreState {
  return {
    events: [],
    ...createEmptyAgentUiProjectionEventIndex(),
  };
}

function normalizeAgentUiRunKey(event: AgentUiProjectionEvent): string | null {
  return (
    event.runId ?? event.turnId ?? event.threadId ?? event.sessionId ?? null
  );
}

export function indexAgentUiProjectionEvents(
  events: AgentUiProjectionEvent[],
  previous: AgentUiProjectionEventIndex = createEmptyAgentUiProjectionEventIndex(),
): AgentUiProjectionEventIndex {
  const latestEventByType = { ...previous.latestEventByType };
  const latestEventByRun = { ...previous.latestEventByRun };
  const latestEventByToolCall = { ...previous.latestEventByToolCall };
  const latestEventByAction = { ...previous.latestEventByAction };
  const latestEventByArtifact = { ...previous.latestEventByArtifact };
  const latestEventByEvidence = { ...previous.latestEventByEvidence };

  for (const event of events) {
    latestEventByType[event.type] = event;
    const runKey = normalizeAgentUiRunKey(event);
    if (runKey) {
      latestEventByRun[runKey] = event;
    }
    if (event.toolCallId) {
      latestEventByToolCall[event.toolCallId] = event;
    }
    if (event.actionId) {
      latestEventByAction[event.actionId] = event;
    }
    if (event.artifactId) {
      latestEventByArtifact[event.artifactId] = event;
    }
    if (event.evidenceId) {
      latestEventByEvidence[event.evidenceId] = event;
    }
  }

  return {
    latestEventByType,
    latestEventByRun,
    latestEventByToolCall,
    latestEventByAction,
    latestEventByArtifact,
    latestEventByEvidence,
  };
}

function hasAgentUiProjectionScopeFilter(
  filter: AgentUiProjectionScopeFilter | null | undefined,
): boolean {
  return Boolean(
    filter?.sessionId ||
      filter?.threadId ||
      filter?.runId ||
      filter?.turnId ||
      filter?.taskId,
  );
}

function matchesAgentUiProjectionScopeValue(
  eventValue: string | undefined,
  filterValue: string | null | undefined,
): boolean {
  return !filterValue || eventValue === filterValue;
}

export function matchesAgentUiProjectionScope(
  event: AgentUiProjectionEvent,
  filter: AgentUiProjectionScopeFilter | null | undefined,
): boolean {
  if (!hasAgentUiProjectionScopeFilter(filter)) {
    return true;
  }

  return (
    matchesAgentUiProjectionScopeValue(event.sessionId, filter?.sessionId) &&
    matchesAgentUiProjectionScopeValue(event.threadId, filter?.threadId) &&
    matchesAgentUiProjectionScopeValue(event.runId, filter?.runId) &&
    matchesAgentUiProjectionScopeValue(event.turnId, filter?.turnId) &&
    matchesAgentUiProjectionScopeValue(event.taskId, filter?.taskId)
  );
}

export function selectAgentUiProjectionEventsFromStore(
  state: AgentUiProjectionEventStoreState,
): AgentUiProjectionEvent[] {
  return state.events;
}

export function selectAgentUiProjectionEventsForScopeFromStore(
  state: AgentUiProjectionEventStoreState,
  filter: AgentUiProjectionScopeFilter | null | undefined,
): AgentUiProjectionEvent[] {
  if (!hasAgentUiProjectionScopeFilter(filter)) {
    return state.events;
  }

  return state.events.filter((event) =>
    matchesAgentUiProjectionScope(event, filter),
  );
}

export function selectAgentUiProjectionEventsByTypeFromStore(
  state: AgentUiProjectionEventStoreState,
  type: AgentUiEventClass,
): AgentUiProjectionEvent[] {
  return state.events.filter((event) => event.type === type);
}

export function selectAgentUiProjectionEventsByTypeForScopeFromStore(
  state: AgentUiProjectionEventStoreState,
  type: AgentUiEventClass,
  filter: AgentUiProjectionScopeFilter | null | undefined,
): AgentUiProjectionEvent[] {
  return selectAgentUiProjectionEventsForScopeFromStore(state, filter).filter(
    (event) => event.type === type,
  );
}

export function selectAgentUiProjectionEventsBySurfaceFromStore(
  state: AgentUiProjectionEventStoreState,
  surface: AgentUiSurface,
): AgentUiProjectionEvent[] {
  return state.events.filter((event) => event.surface === surface);
}

export function selectAgentUiProjectionEventsBySurfaceForScopeFromStore(
  state: AgentUiProjectionEventStoreState,
  surface: AgentUiSurface,
  filter: AgentUiProjectionScopeFilter | null | undefined,
): AgentUiProjectionEvent[] {
  return selectAgentUiProjectionEventsForScopeFromStore(state, filter).filter(
    (event) => event.surface === surface,
  );
}

export function selectLatestAgentUiProjectionEventForScopeFromStore(
  state: AgentUiProjectionEventStoreState,
  filter: AgentUiProjectionScopeFilter | null | undefined,
): AgentUiProjectionEvent | null {
  const events = selectAgentUiProjectionEventsForScopeFromStore(state, filter);
  return events[events.length - 1] ?? null;
}

export function selectLatestAgentUiProjectionEventByTypeFromStore(
  state: AgentUiProjectionEventStoreState,
  type: AgentUiEventClass,
): AgentUiProjectionEvent | null {
  return state.latestEventByType[type] ?? null;
}

export function selectLatestAgentUiProjectionEventForRunFromStore(
  state: AgentUiProjectionEventStoreState,
  key: string | null | undefined,
): AgentUiProjectionEvent | null {
  if (!key) {
    return null;
  }
  return state.latestEventByRun[key] ?? null;
}

export function selectLatestAgentUiProjectionEventForToolCallFromStore(
  state: AgentUiProjectionEventStoreState,
  key: string | null | undefined,
): AgentUiProjectionEvent | null {
  if (!key) {
    return null;
  }
  return state.latestEventByToolCall[key] ?? null;
}

export function selectLatestAgentUiProjectionEventForActionFromStore(
  state: AgentUiProjectionEventStoreState,
  key: string | null | undefined,
): AgentUiProjectionEvent | null {
  if (!key) {
    return null;
  }
  return state.latestEventByAction[key] ?? null;
}

export function selectLatestAgentUiProjectionEventForArtifactFromStore(
  state: AgentUiProjectionEventStoreState,
  key: string | null | undefined,
): AgentUiProjectionEvent | null {
  if (!key) {
    return null;
  }
  return state.latestEventByArtifact[key] ?? null;
}

export function selectLatestAgentUiProjectionEventForEvidenceFromStore(
  state: AgentUiProjectionEventStoreState,
  key: string | null | undefined,
): AgentUiProjectionEvent | null {
  if (!key) {
    return null;
  }
  return state.latestEventByEvidence[key] ?? null;
}
