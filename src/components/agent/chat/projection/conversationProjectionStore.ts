import {
  createEmptyAgentUiProjectionEventIndex,
  createEmptyAgentUiProjectionEventStoreState,
  indexAgentUiProjectionEvents,
  selectAgentUiProjectionEventsBySurfaceForScopeFromStore,
  selectAgentUiProjectionEventsBySurfaceFromStore,
  selectAgentUiProjectionEventsByTypeForScopeFromStore,
  selectAgentUiProjectionEventsByTypeFromStore,
  selectAgentUiProjectionEventsForScopeFromStore,
  selectAgentUiProjectionEventsFromStore,
  selectLatestAgentUiProjectionEventByTypeFromStore,
  selectLatestAgentUiProjectionEventForActionFromStore,
  selectLatestAgentUiProjectionEventForArtifactFromStore,
  selectLatestAgentUiProjectionEventForEvidenceFromStore,
  selectLatestAgentUiProjectionEventForRunFromStore,
  selectLatestAgentUiProjectionEventForScopeFromStore,
  selectLatestAgentUiProjectionEventForToolCallFromStore,
  type AgentUiEventClass,
  type AgentUiProjectionEvent,
  type AgentUiProjectionEventStoreState,
  type AgentUiProjectionScopeFilter,
  type AgentUiSurface,
} from "@limecloud/agent-runtime-projection";

export type { AgentUiProjectionScopeFilter } from "@limecloud/agent-runtime-projection";

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

export type ConversationAgentUiProjectionSlice =
  AgentUiProjectionEventStoreState;

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
  subscribeToSlice: (
    slice: ConversationProjectionSlice,
    listener: ConversationProjectionListener,
  ) => () => void;
  recordStreamDiagnostic: (
    diagnostic: Omit<ConversationStreamDiagnostic, "id">,
  ) => ConversationStreamDiagnostic;
  recordAgentUiProjectionEvents: (
    events: AgentUiProjectionEvent[],
  ) => AgentUiProjectionEvent[];
  clearAgentUiProjectionEvents: () => void;
  clearDiagnostics: () => void;
}

const MAX_STREAM_DIAGNOSTICS = 500;
const MAX_AGENT_UI_PROJECTION_EVENTS = 1000;
const CANONICAL_TOOL_SOURCE_TYPES = new Set([
  "item_started",
  "item_updated",
  "item_completed",
]);
const LEGACY_TOOL_LIFECYCLE_EVENT_TYPES = new Set([
  "tool.started",
  "tool.args",
  "tool.result",
  "tool.failed",
]);

function createInitialState(): ConversationProjectionState {
  return {
    session: { version: 0 },
    stream: { version: 0 },
    queue: { version: 0 },
    render: { version: 0 },
    agentUi: createEmptyAgentUiProjectionEventStoreState(),
    diagnostics: {
      streamDiagnostics: [],
      latestStreamDiagnosticBySession: {},
    },
  };
}

export const EMPTY_CONVERSATION_AGENT_UI_PROJECTION_SLICE =
  createEmptyAgentUiProjectionEventStoreState();

function normalizeSessionKey(
  diagnostic: Pick<ConversationStreamDiagnostic, "sessionId" | "requestId">,
): string | null {
  return diagnostic.sessionId ?? diagnostic.requestId ?? null;
}

function toolEventScopeKey(event: AgentUiProjectionEvent): string | null {
  if (!event.toolCallId) {
    return null;
  }
  return [
    event.sessionId ?? "",
    event.threadId ?? "",
    event.turnId ?? "",
    event.toolCallId,
  ].join("\u001f");
}

function isCanonicalToolEvent(event: AgentUiProjectionEvent): boolean {
  return (
    event.owner === "tool" &&
    event.scope === "tool_call" &&
    Boolean(event.toolCallId) &&
    CANONICAL_TOOL_SOURCE_TYPES.has(event.sourceType)
  );
}

function isLegacyToolLifecycleEvent(event: AgentUiProjectionEvent): boolean {
  return (
    event.owner === "tool" &&
    event.scope === "tool_call" &&
    Boolean(event.toolCallId) &&
    !CANONICAL_TOOL_SOURCE_TYPES.has(event.sourceType) &&
    LEGACY_TOOL_LIFECYCLE_EVENT_TYPES.has(event.type)
  );
}

function normalizeAgentUiProjectionEventsForItemFirstToolLifecycle(
  events: AgentUiProjectionEvent[],
): AgentUiProjectionEvent[] {
  const canonicalToolKeys = new Set<string>();
  for (const event of events) {
    if (!isCanonicalToolEvent(event)) {
      continue;
    }
    const key = toolEventScopeKey(event);
    if (key) {
      canonicalToolKeys.add(key);
    }
  }

  return events.filter((event) => {
    const key = toolEventScopeKey(event);
    if (
      isLegacyToolLifecycleEvent(event) &&
      key &&
      canonicalToolKeys.has(key)
    ) {
      return false;
    }
    return true;
  });
}

export function createConversationProjectionStore(): ConversationProjectionStore {
  let state = createInitialState();
  let nextDiagnosticId = 1;
  const listeners = new Set<ConversationProjectionListener>();
  const sliceListeners = new Map<
    ConversationProjectionSlice,
    Set<ConversationProjectionListener>
  >();

  function emit(slices: ConversationProjectionSlice[]): void {
    const notified = new Set<ConversationProjectionListener>();
    for (const listener of listeners) {
      notified.add(listener);
      listener();
    }
    for (const slice of slices) {
      const listenersForSlice = sliceListeners.get(slice);
      if (!listenersForSlice) {
        continue;
      }
      for (const listener of listenersForSlice) {
        if (notified.has(listener)) {
          continue;
        }
        notified.add(listener);
        listener();
      }
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

    subscribeToSlice(slice, listener) {
      const listenersForSlice =
        sliceListeners.get(slice) ?? new Set<ConversationProjectionListener>();
      listenersForSlice.add(listener);
      sliceListeners.set(slice, listenersForSlice);
      return () => {
        listenersForSlice.delete(listener);
        if (listenersForSlice.size === 0) {
          sliceListeners.delete(slice);
        }
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
      emit(["diagnostics"]);
      return entry;
    },

    recordAgentUiProjectionEvents(events) {
      if (events.length === 0) {
        return [];
      }

      const recorded =
        normalizeAgentUiProjectionEventsForItemFirstToolLifecycle([
          ...state.agentUi.events,
          ...events,
        ]);
      const nextEvents = recorded;
      if (nextEvents.length > MAX_AGENT_UI_PROJECTION_EVENTS) {
        nextEvents.splice(
          0,
          nextEvents.length - MAX_AGENT_UI_PROJECTION_EVENTS,
        );
      }

      const indexedEvents = indexAgentUiProjectionEvents(nextEvents);

      state = {
        ...state,
        agentUi: {
          events: nextEvents,
          ...indexedEvents,
        },
      };
      emit(["agentUi"]);
      return events.filter((event) => nextEvents.includes(event));
    },

    clearAgentUiProjectionEvents() {
      if (state.agentUi.events.length === 0) {
        return;
      }

      state = {
        ...state,
        agentUi: {
          events: [],
          ...createEmptyAgentUiProjectionEventIndex(),
        },
      };
      emit(["agentUi"]);
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
      emit(["diagnostics"]);
    },
  };
}

export const conversationProjectionStore = createConversationProjectionStore();

let queuedAgentUiProjectionEvents: AgentUiProjectionEvent[] = [];
let agentUiProjectionFlushScheduled = false;

function scheduleAgentUiProjectionFlush(task: () => void): void {
  if (typeof queueMicrotask === "function") {
    queueMicrotask(task);
    return;
  }
  void Promise.resolve().then(task);
}

export function flushQueuedAgentUiProjectionEvents(): AgentUiProjectionEvent[] {
  const queuedEvents = queuedAgentUiProjectionEvents;
  queuedAgentUiProjectionEvents = [];
  agentUiProjectionFlushScheduled = false;
  if (queuedEvents.length === 0) {
    return [];
  }
  return conversationProjectionStore.recordAgentUiProjectionEvents(
    queuedEvents,
  );
}

export function enqueueAgentUiProjectionEvents(
  events: AgentUiProjectionEvent[],
): void {
  if (events.length === 0) {
    return;
  }
  queuedAgentUiProjectionEvents.push(...events);
  if (agentUiProjectionFlushScheduled) {
    return;
  }
  agentUiProjectionFlushScheduled = true;
  scheduleAgentUiProjectionFlush(() => {
    flushQueuedAgentUiProjectionEvents();
  });
}

function clearQueuedAgentUiProjectionEvents(): void {
  queuedAgentUiProjectionEvents = [];
  agentUiProjectionFlushScheduled = false;
}

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
  return selectAgentUiProjectionEventsFromStore(state.agentUi);
}

export function selectAgentUiProjectionEventsFromSlice(
  agentUi: ConversationAgentUiProjectionSlice,
): AgentUiProjectionEvent[] {
  return selectAgentUiProjectionEventsFromStore(agentUi);
}

export function selectAgentUiProjectionEventsForScope(
  state: ConversationProjectionState,
  filter: AgentUiProjectionScopeFilter | null | undefined,
): AgentUiProjectionEvent[] {
  return selectAgentUiProjectionEventsForScopeFromStore(state.agentUi, filter);
}

export function selectAgentUiProjectionEventsForScopeFromSlice(
  agentUi: ConversationAgentUiProjectionSlice,
  filter: AgentUiProjectionScopeFilter | null | undefined,
): AgentUiProjectionEvent[] {
  return selectAgentUiProjectionEventsForScopeFromStore(agentUi, filter);
}

export function selectAgentUiProjectionEventsByType(
  state: ConversationProjectionState,
  type: AgentUiEventClass,
): AgentUiProjectionEvent[] {
  return selectAgentUiProjectionEventsByTypeFromStore(state.agentUi, type);
}

export function selectAgentUiProjectionEventsByTypeForScope(
  state: ConversationProjectionState,
  type: AgentUiEventClass,
  filter: AgentUiProjectionScopeFilter | null | undefined,
): AgentUiProjectionEvent[] {
  return selectAgentUiProjectionEventsByTypeForScopeFromStore(
    state.agentUi,
    type,
    filter,
  );
}

export function selectAgentUiProjectionEventsBySurface(
  state: ConversationProjectionState,
  surface: AgentUiSurface,
): AgentUiProjectionEvent[] {
  return selectAgentUiProjectionEventsBySurfaceFromStore(
    state.agentUi,
    surface,
  );
}

export function selectAgentUiProjectionEventsBySurfaceForScope(
  state: ConversationProjectionState,
  surface: AgentUiSurface,
  filter: AgentUiProjectionScopeFilter | null | undefined,
): AgentUiProjectionEvent[] {
  return selectAgentUiProjectionEventsBySurfaceForScopeFromStore(
    state.agentUi,
    surface,
    filter,
  );
}

export function selectAgentUiProjectionEventsBySurfaceForScopeFromSlice(
  agentUi: ConversationAgentUiProjectionSlice,
  surface: AgentUiSurface,
  filter: AgentUiProjectionScopeFilter | null | undefined,
): AgentUiProjectionEvent[] {
  return selectAgentUiProjectionEventsBySurfaceForScopeFromStore(
    agentUi,
    surface,
    filter,
  );
}

export function selectLatestAgentUiProjectionEventForScope(
  state: ConversationProjectionState,
  filter: AgentUiProjectionScopeFilter | null | undefined,
): AgentUiProjectionEvent | null {
  return selectLatestAgentUiProjectionEventForScopeFromStore(
    state.agentUi,
    filter,
  );
}

export function selectLatestAgentUiProjectionEventByType(
  state: ConversationProjectionState,
  type: AgentUiEventClass,
): AgentUiProjectionEvent | null {
  return selectLatestAgentUiProjectionEventByTypeFromStore(state.agentUi, type);
}

export function selectLatestAgentUiProjectionEventForRun(
  state: ConversationProjectionState,
  key: string | null | undefined,
): AgentUiProjectionEvent | null {
  return selectLatestAgentUiProjectionEventForRunFromStore(state.agentUi, key);
}

export function selectLatestAgentUiProjectionEventForToolCall(
  state: ConversationProjectionState,
  key: string | null | undefined,
): AgentUiProjectionEvent | null {
  return selectLatestAgentUiProjectionEventForToolCallFromStore(
    state.agentUi,
    key,
  );
}

export function selectLatestAgentUiProjectionEventForAction(
  state: ConversationProjectionState,
  key: string | null | undefined,
): AgentUiProjectionEvent | null {
  return selectLatestAgentUiProjectionEventForActionFromStore(
    state.agentUi,
    key,
  );
}

export function selectLatestAgentUiProjectionEventForArtifact(
  state: ConversationProjectionState,
  key: string | null | undefined,
): AgentUiProjectionEvent | null {
  return selectLatestAgentUiProjectionEventForArtifactFromStore(
    state.agentUi,
    key,
  );
}

export function selectLatestAgentUiProjectionEventForEvidence(
  state: ConversationProjectionState,
  key: string | null | undefined,
): AgentUiProjectionEvent | null {
  return selectLatestAgentUiProjectionEventForEvidenceFromStore(
    state.agentUi,
    key,
  );
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
  clearQueuedAgentUiProjectionEvents();
  conversationProjectionStore.clearAgentUiProjectionEvents();
}

export function clearConversationProjectionDiagnostics(): void {
  conversationProjectionStore.clearDiagnostics();
}
