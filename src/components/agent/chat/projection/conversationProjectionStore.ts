import type {
  AgentUiEventClass,
  AgentUiProjectionEvent,
  AgentUiSurface,
} from "./agentUiEventProjection";

export type ConversationProjectionSlice =
  | "session"
  | "stream"
  | "queue"
  | "render"
  | "agentUi"
  | "diagnostics";

export interface ConversationStreamDiagnostic {
  id: number;
  phase: string;
  at: number;
  wallTime: number;
  sessionId?: string | null;
  workspaceId?: string | null;
  source?: string | null;
  requestId?: string | null;
  actualSessionId?: string | null;
  metrics: Record<string, string | number | boolean | null>;
}

export interface ConversationDiagnosticsSlice {
  streamDiagnostics: ConversationStreamDiagnostic[];
  latestStreamDiagnosticBySession: Record<string, ConversationStreamDiagnostic>;
}

export interface ConversationAgentUiProjectionSlice {
  events: AgentUiProjectionEvent[];
  latestEventByType: Partial<Record<AgentUiEventClass, AgentUiProjectionEvent>>;
  latestEventByRun: Record<string, AgentUiProjectionEvent>;
  latestEventByToolCall: Record<string, AgentUiProjectionEvent>;
  latestEventByAction: Record<string, AgentUiProjectionEvent>;
  latestEventByArtifact: Record<string, AgentUiProjectionEvent>;
  latestEventByEvidence: Record<string, AgentUiProjectionEvent>;
}

export interface ConversationSessionProjectionSlice {
  version: number;
}

export interface ConversationStreamProjectionSlice {
  version: number;
}

export interface ConversationQueueProjectionSlice {
  version: number;
}

export interface ConversationRenderProjectionSlice {
  version: number;
}

export interface ConversationProjectionState {
  session: ConversationSessionProjectionSlice;
  stream: ConversationStreamProjectionSlice;
  queue: ConversationQueueProjectionSlice;
  render: ConversationRenderProjectionSlice;
  agentUi: ConversationAgentUiProjectionSlice;
  diagnostics: ConversationDiagnosticsSlice;
}

export type ConversationProjectionListener = () => void;

export interface ConversationProjectionStore {
  getSnapshot: () => ConversationProjectionState;
  subscribe: (listener: ConversationProjectionListener) => () => void;
  recordStreamDiagnostic: (
    diagnostic: Omit<ConversationStreamDiagnostic, "id">,
  ) => ConversationStreamDiagnostic;
  recordAgentUiProjectionEvents: (
    events: AgentUiProjectionEvent[],
  ) => AgentUiProjectionEvent[];
  clearAgentUiProjectionEvents: () => void;
  clearDiagnostics: () => void;
}

export interface AgentUiProjectionScopeFilter {
  sessionId?: string | null;
  threadId?: string | null;
  runId?: string | null;
  turnId?: string | null;
  taskId?: string | null;
}

const MAX_STREAM_DIAGNOSTICS = 500;
const MAX_AGENT_UI_PROJECTION_EVENTS = 1000;

function createInitialState(): ConversationProjectionState {
  return {
    session: { version: 0 },
    stream: { version: 0 },
    queue: { version: 0 },
    render: { version: 0 },
    agentUi: {
      events: [],
      latestEventByType: {},
      latestEventByRun: {},
      latestEventByToolCall: {},
      latestEventByAction: {},
      latestEventByArtifact: {},
      latestEventByEvidence: {},
    },
    diagnostics: {
      streamDiagnostics: [],
      latestStreamDiagnosticBySession: {},
    },
  };
}

function normalizeSessionKey(
  diagnostic: Pick<ConversationStreamDiagnostic, "sessionId" | "requestId">,
): string | null {
  return diagnostic.sessionId ?? diagnostic.requestId ?? null;
}

function normalizeAgentUiRunKey(event: AgentUiProjectionEvent): string | null {
  return (
    event.runId ?? event.turnId ?? event.threadId ?? event.sessionId ?? null
  );
}

export function createConversationProjectionStore(): ConversationProjectionStore {
  let state = createInitialState();
  let nextDiagnosticId = 1;
  const listeners = new Set<ConversationProjectionListener>();

  function emit(): void {
    for (const listener of listeners) {
      listener();
    }
  }

  return {
    getSnapshot: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    recordStreamDiagnostic(diagnostic) {
      const entry: ConversationStreamDiagnostic = {
        ...diagnostic,
        id: nextDiagnosticId,
      };
      nextDiagnosticId += 1;

      const streamDiagnostics = [...state.diagnostics.streamDiagnostics, entry];
      if (streamDiagnostics.length > MAX_STREAM_DIAGNOSTICS) {
        streamDiagnostics.splice(
          0,
          streamDiagnostics.length - MAX_STREAM_DIAGNOSTICS,
        );
      }

      const latestStreamDiagnosticBySession = {
        ...state.diagnostics.latestStreamDiagnosticBySession,
      };
      const sessionKey = normalizeSessionKey(entry);
      if (sessionKey) {
        latestStreamDiagnosticBySession[sessionKey] = entry;
      }

      state = {
        ...state,
        diagnostics: {
          streamDiagnostics,
          latestStreamDiagnosticBySession,
        },
      };
      emit();
      return entry;
    },

    recordAgentUiProjectionEvents(events) {
      if (events.length === 0) {
        return [];
      }

      const nextEvents = [...state.agentUi.events, ...events];
      if (nextEvents.length > MAX_AGENT_UI_PROJECTION_EVENTS) {
        nextEvents.splice(
          0,
          nextEvents.length - MAX_AGENT_UI_PROJECTION_EVENTS,
        );
      }

      const latestEventByType = { ...state.agentUi.latestEventByType };
      const latestEventByRun = { ...state.agentUi.latestEventByRun };
      const latestEventByToolCall = {
        ...state.agentUi.latestEventByToolCall,
      };
      const latestEventByAction = { ...state.agentUi.latestEventByAction };
      const latestEventByArtifact = {
        ...state.agentUi.latestEventByArtifact,
      };
      const latestEventByEvidence = {
        ...state.agentUi.latestEventByEvidence,
      };

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

      state = {
        ...state,
        agentUi: {
          events: nextEvents,
          latestEventByType,
          latestEventByRun,
          latestEventByToolCall,
          latestEventByAction,
          latestEventByArtifact,
          latestEventByEvidence,
        },
      };
      emit();
      return events;
    },

    clearAgentUiProjectionEvents() {
      if (state.agentUi.events.length === 0) {
        return;
      }

      state = {
        ...state,
        agentUi: {
          events: [],
          latestEventByType: {},
          latestEventByRun: {},
          latestEventByToolCall: {},
          latestEventByAction: {},
          latestEventByArtifact: {},
          latestEventByEvidence: {},
        },
      };
      emit();
    },

    clearDiagnostics() {
      if (
        state.diagnostics.streamDiagnostics.length === 0 &&
        Object.keys(state.diagnostics.latestStreamDiagnosticBySession)
          .length === 0
      ) {
        return;
      }

      state = {
        ...state,
        diagnostics: {
          streamDiagnostics: [],
          latestStreamDiagnosticBySession: {},
        },
      };
      nextDiagnosticId = 1;
      emit();
    },
  };
}

export const conversationProjectionStore = createConversationProjectionStore();

export function selectConversationStreamDiagnostics(
  state: ConversationProjectionState,
): ConversationStreamDiagnostic[] {
  return state.diagnostics.streamDiagnostics;
}

export function selectLatestConversationStreamDiagnostic(
  state: ConversationProjectionState,
  key: string | null | undefined,
): ConversationStreamDiagnostic | null {
  if (!key) {
    return null;
  }
  return state.diagnostics.latestStreamDiagnosticBySession[key] ?? null;
}

export function selectAgentUiProjectionEvents(
  state: ConversationProjectionState,
): AgentUiProjectionEvent[] {
  return state.agentUi.events;
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

function matchesAgentUiProjectionScope(
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

export function selectAgentUiProjectionEventsForScope(
  state: ConversationProjectionState,
  filter: AgentUiProjectionScopeFilter | null | undefined,
): AgentUiProjectionEvent[] {
  if (!hasAgentUiProjectionScopeFilter(filter)) {
    return state.agentUi.events;
  }

  return state.agentUi.events.filter((event) =>
    matchesAgentUiProjectionScope(event, filter),
  );
}

export function selectAgentUiProjectionEventsByType(
  state: ConversationProjectionState,
  type: AgentUiEventClass,
): AgentUiProjectionEvent[] {
  return state.agentUi.events.filter((event) => event.type === type);
}

export function selectAgentUiProjectionEventsByTypeForScope(
  state: ConversationProjectionState,
  type: AgentUiEventClass,
  filter: AgentUiProjectionScopeFilter | null | undefined,
): AgentUiProjectionEvent[] {
  return selectAgentUiProjectionEventsForScope(state, filter).filter(
    (event) => event.type === type,
  );
}

export function selectAgentUiProjectionEventsBySurface(
  state: ConversationProjectionState,
  surface: AgentUiSurface,
): AgentUiProjectionEvent[] {
  return state.agentUi.events.filter((event) => event.surface === surface);
}

export function selectAgentUiProjectionEventsBySurfaceForScope(
  state: ConversationProjectionState,
  surface: AgentUiSurface,
  filter: AgentUiProjectionScopeFilter | null | undefined,
): AgentUiProjectionEvent[] {
  return selectAgentUiProjectionEventsForScope(state, filter).filter(
    (event) => event.surface === surface,
  );
}

export function selectLatestAgentUiProjectionEventForScope(
  state: ConversationProjectionState,
  filter: AgentUiProjectionScopeFilter | null | undefined,
): AgentUiProjectionEvent | null {
  const events = selectAgentUiProjectionEventsForScope(state, filter);
  return events[events.length - 1] ?? null;
}

export function selectLatestAgentUiProjectionEventByType(
  state: ConversationProjectionState,
  type: AgentUiEventClass,
): AgentUiProjectionEvent | null {
  return state.agentUi.latestEventByType[type] ?? null;
}

export function selectLatestAgentUiProjectionEventForRun(
  state: ConversationProjectionState,
  key: string | null | undefined,
): AgentUiProjectionEvent | null {
  if (!key) {
    return null;
  }
  return state.agentUi.latestEventByRun[key] ?? null;
}

export function selectLatestAgentUiProjectionEventForToolCall(
  state: ConversationProjectionState,
  key: string | null | undefined,
): AgentUiProjectionEvent | null {
  if (!key) {
    return null;
  }
  return state.agentUi.latestEventByToolCall[key] ?? null;
}

export function selectLatestAgentUiProjectionEventForAction(
  state: ConversationProjectionState,
  key: string | null | undefined,
): AgentUiProjectionEvent | null {
  if (!key) {
    return null;
  }
  return state.agentUi.latestEventByAction[key] ?? null;
}

export function selectLatestAgentUiProjectionEventForArtifact(
  state: ConversationProjectionState,
  key: string | null | undefined,
): AgentUiProjectionEvent | null {
  if (!key) {
    return null;
  }
  return state.agentUi.latestEventByArtifact[key] ?? null;
}

export function selectLatestAgentUiProjectionEventForEvidence(
  state: ConversationProjectionState,
  key: string | null | undefined,
): AgentUiProjectionEvent | null {
  if (!key) {
    return null;
  }
  return state.agentUi.latestEventByEvidence[key] ?? null;
}

export function recordConversationStreamDiagnostic(
  diagnostic: Omit<ConversationStreamDiagnostic, "id">,
): ConversationStreamDiagnostic {
  return conversationProjectionStore.recordStreamDiagnostic(diagnostic);
}

export function recordAgentUiProjectionEvents(
  events: AgentUiProjectionEvent[],
): AgentUiProjectionEvent[] {
  return conversationProjectionStore.recordAgentUiProjectionEvents(events);
}

export function clearAgentUiProjectionEvents(): void {
  conversationProjectionStore.clearAgentUiProjectionEvents();
}

export function clearConversationProjectionDiagnostics(): void {
  conversationProjectionStore.clearDiagnostics();
}
