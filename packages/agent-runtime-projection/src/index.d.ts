export type AgentRuntimeExecutionEventKind = "context" | "source" | "skill" | "tool" | "permission" | "sandbox" | "state" | "model" | "draft" | "handoff" | "action" | "evidence" | "note" | string;
export type AgentRuntimeExecutionEventStatus = "pending" | "running" | "completed" | "blocked" | "failed" | string;
export type AgentRuntimeEventClass = "session.created" | "turn.submitted" | "turn.started" | "turn.completed" | "turn.failed" | "run.status" | "context.resolved" | "tool.started" | "tool.result" | "tool.failed" | "tool.catalog.resolved" | "permission.evaluated" | "permission.requested" | "permission.resolved" | "sandbox.applied" | "sandbox.violation" | "model.requested" | "model.delta" | "model.completed" | "model.failed" | "artifact.changed" | "action.required" | "action.resolved" | "runtime.error" | "evidence.changed" | "snapshot.updated" | string;
export type AgentRuntimeFactOwner = "runtime" | "artifact" | "evidence" | "ui" | string;
export type AgentRuntimePhase = "submitted" | "routing" | "preparing" | "waiting_provider" | "streaming" | "tool_running" | "action_required" | "failed" | "completed" | "blocked" | string;
export interface AgentRuntimeExecutionEvent {
    id: string;
    kind: AgentRuntimeExecutionEventKind;
    status: AgentRuntimeExecutionEventStatus;
    eventClass?: AgentRuntimeEventClass;
    owner?: AgentRuntimeFactOwner;
    schemaVersion?: string;
    sequence?: number;
    runtimeId?: string;
    threadId?: string;
    turnId?: string;
    taskId?: string;
    runId?: string;
    stepId?: string;
    toolCallId?: string;
    actionId?: string;
    traceId?: string;
    spanId?: string;
    attemptId?: string;
    artifactId?: string;
    evidenceId?: string;
    phase?: AgentRuntimePhase;
    title: string;
    detail?: string;
    refIds?: string[];
    artifactRefs?: string[];
    evidenceRefs?: string[];
    payload?: Record<string, unknown>;
    model?: string;
    createdAt: string;
    completedAt?: string;
}
export type AgentRuntimeActionKind = "add-input-source" | "configure-text-model" | string;
export type AgentRuntimeActionDecision = "open-input-source" | "open-model-settings" | "acknowledge" | string;
export type AgentRuntimeSurface = "runtime-status" | "human-action" | "tool" | "permission" | "artifact" | "evidence" | "context" | "message";
export interface AgentRuntimeActionProjection {
    actionKind: AgentRuntimeActionKind;
    targetModule: string;
    buttonLabel: string;
    decision: AgentRuntimeActionDecision;
}
export interface AgentRuntimeEventProjection<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent> {
    id: string;
    source: TEvent;
    surface: AgentRuntimeSurface;
    title: string;
    detail?: string;
    status: TEvent["status"];
    displayStatus: string;
    action?: AgentRuntimeActionProjection;
    actionId?: string;
    resolved: boolean;
    actionKind: string;
    targetModule: string;
}
export interface AgentRuntimeReadModel<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent> {
    events: AgentRuntimeEventProjection<TEvent>[];
    visibleEvents: AgentRuntimeEventProjection<TEvent>[];
    pendingActions: AgentRuntimeEventProjection<TEvent>[];
    inputSourceRecovery: boolean;
    sourceCount: number;
    artifactRefs: string[];
    evidenceRefs: string[];
    taskRefs: string[];
}
export interface AgentRuntimeProjectionInput<TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent> {
    executionEvents?: TEvent[];
    sourceCount?: number;
}
interface AgentRuntimeProjectionContext {
    resolvedActionIds: Set<string>;
    resolvedEventIds: Set<string>;
}
export declare function agentEventStatusLabel(status: AgentRuntimeExecutionEventStatus): string;
export declare function agentEventDisplayStatus(event: AgentRuntimeExecutionEvent): string;
export declare function agentEventActionKind(event: AgentRuntimeExecutionEvent): string;
export declare function agentEventTargetModule(event: AgentRuntimeExecutionEvent): string;
export declare function projectAgentRuntimeAction(event: AgentRuntimeExecutionEvent): AgentRuntimeActionProjection;
export declare function agentEventSurface(event: AgentRuntimeExecutionEvent): AgentRuntimeSurface;
export declare function projectAgentRuntimeEvent<TEvent extends AgentRuntimeExecutionEvent>(event: TEvent, context?: AgentRuntimeProjectionContext): AgentRuntimeEventProjection<TEvent>;
export declare function projectAgentRuntimeReadModel<TEvent extends AgentRuntimeExecutionEvent>(input?: AgentRuntimeProjectionInput<TEvent>): AgentRuntimeReadModel<TEvent>;
export declare function isAgentInputSourceRecoveryEvent(event: AgentRuntimeExecutionEvent): boolean;
export {};
