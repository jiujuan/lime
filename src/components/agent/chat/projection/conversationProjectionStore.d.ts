import type { AgentUiEventClass, AgentUiProjectionEvent, AgentUiSurface } from "./agentUiEventProjection";
export type ConversationProjectionSlice = "session" | "stream" | "queue" | "render" | "agentUi" | "diagnostics";
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
    recordStreamDiagnostic: (diagnostic: Omit<ConversationStreamDiagnostic, "id">) => ConversationStreamDiagnostic;
    recordAgentUiProjectionEvents: (events: AgentUiProjectionEvent[]) => AgentUiProjectionEvent[];
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
export declare function createConversationProjectionStore(): ConversationProjectionStore;
export declare const conversationProjectionStore: ConversationProjectionStore;
export declare function selectConversationStreamDiagnostics(state: ConversationProjectionState): ConversationStreamDiagnostic[];
export declare function selectLatestConversationStreamDiagnostic(state: ConversationProjectionState, key: string | null | undefined): ConversationStreamDiagnostic | null;
export declare function selectAgentUiProjectionEvents(state: ConversationProjectionState): AgentUiProjectionEvent[];
export declare function selectAgentUiProjectionEventsForScope(state: ConversationProjectionState, filter: AgentUiProjectionScopeFilter | null | undefined): AgentUiProjectionEvent[];
export declare function selectAgentUiProjectionEventsByType(state: ConversationProjectionState, type: AgentUiEventClass): AgentUiProjectionEvent[];
export declare function selectAgentUiProjectionEventsByTypeForScope(state: ConversationProjectionState, type: AgentUiEventClass, filter: AgentUiProjectionScopeFilter | null | undefined): AgentUiProjectionEvent[];
export declare function selectAgentUiProjectionEventsBySurface(state: ConversationProjectionState, surface: AgentUiSurface): AgentUiProjectionEvent[];
export declare function selectAgentUiProjectionEventsBySurfaceForScope(state: ConversationProjectionState, surface: AgentUiSurface, filter: AgentUiProjectionScopeFilter | null | undefined): AgentUiProjectionEvent[];
export declare function selectLatestAgentUiProjectionEventForScope(state: ConversationProjectionState, filter: AgentUiProjectionScopeFilter | null | undefined): AgentUiProjectionEvent | null;
export declare function selectLatestAgentUiProjectionEventByType(state: ConversationProjectionState, type: AgentUiEventClass): AgentUiProjectionEvent | null;
export declare function selectLatestAgentUiProjectionEventForRun(state: ConversationProjectionState, key: string | null | undefined): AgentUiProjectionEvent | null;
export declare function selectLatestAgentUiProjectionEventForToolCall(state: ConversationProjectionState, key: string | null | undefined): AgentUiProjectionEvent | null;
export declare function selectLatestAgentUiProjectionEventForAction(state: ConversationProjectionState, key: string | null | undefined): AgentUiProjectionEvent | null;
export declare function selectLatestAgentUiProjectionEventForArtifact(state: ConversationProjectionState, key: string | null | undefined): AgentUiProjectionEvent | null;
export declare function selectLatestAgentUiProjectionEventForEvidence(state: ConversationProjectionState, key: string | null | undefined): AgentUiProjectionEvent | null;
export declare function recordConversationStreamDiagnostic(diagnostic: Omit<ConversationStreamDiagnostic, "id">): ConversationStreamDiagnostic;
export declare function recordAgentUiProjectionEvents(events: AgentUiProjectionEvent[]): AgentUiProjectionEvent[];
export declare function clearAgentUiProjectionEvents(): void;
export declare function clearConversationProjectionDiagnostics(): void;
