import type { AgentTurnContextSummary } from "./agentProtocol";
export type AgentExecutionStrategy = "react";
export type AgentApprovalPolicy = "never" | "on-request" | "on-failure" | "untrusted";
export type AgentSandboxPolicy = "read-only" | "workspace-write" | "danger-full-access";
export type AgentSessionExecutionRuntimeAccessMode = "read-only" | "current" | "full-access";
export type AgentSessionExecutionRuntimeSource = "session" | "runtime_snapshot" | "turn_context" | "model_change";
export interface AgentSessionExecutionRuntimePreferences {
    webSearch?: boolean;
    thinking?: boolean;
    task: boolean;
    subagent: boolean;
}
export interface AgentSessionExecutionRuntimeTaskProfile {
    kind: string;
    source: string;
    traits?: string[];
    modalityContractKey?: string | null;
    routingSlot?: string | null;
    executionProfileKey?: string | null;
    executorAdapterKey?: string | null;
    executorKind?: string | null;
    executorBindingKey?: string | null;
    permissionProfileKeys?: string[];
    userLockPolicy?: string | null;
    serviceModelSlot?: string | null;
    sceneKind?: string | null;
    sceneSkillId?: string | null;
    entrySource?: string | null;
}
export interface AgentSessionExecutionRuntimeRoutingDecision {
    routingMode: string;
    decisionSource: string;
    decisionReason: string;
    selectedProvider?: string | null;
    selectedModel?: string | null;
    requestedProvider?: string | null;
    requestedModel?: string | null;
    candidateCount: number;
    estimatedCostClass?: string | null;
    capabilityGap?: string | null;
    fallbackChain?: string[];
    settingsSource?: string | null;
    serviceModelSlot?: string | null;
    fallbackApplied?: boolean | null;
    requestedSelection?: Record<string, unknown> | null;
    routingAttempts?: Record<string, unknown>[];
}
export interface AgentSessionExecutionRuntimeLimitState {
    status: string;
    singleCandidateOnly: boolean;
    providerLocked: boolean;
    settingsLocked: boolean;
    oemLocked: boolean;
    candidateCount: number;
    capabilityGap?: string | null;
    notes?: string[];
}
export interface AgentSessionExecutionRuntimeCostState {
    status: string;
    estimatedCostClass?: string | null;
    inputPerMillion?: number | null;
    outputPerMillion?: number | null;
    cacheReadPerMillion?: number | null;
    cacheWritePerMillion?: number | null;
    currency?: string | null;
    estimatedTotalCost?: number | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
    totalTokens?: number | null;
    cachedInputTokens?: number | null;
    cacheCreationInputTokens?: number | null;
}
export interface AgentSessionExecutionRuntimePermissionState {
    status: "not_required" | "declared_only" | "requires_confirmation" | string;
    requiredProfileKeys?: string[];
    askProfileKeys?: string[];
    blockingProfileKeys?: string[];
    decisionSource: string;
    decisionScope: string;
    confirmationStatus?: "not_required" | "not_requested" | "requested" | "resolved" | string | null;
    confirmationRequestId?: string | null;
    confirmationSource?: string | null;
    notes?: string[];
}
export interface AgentSessionExecutionRuntimeLimitEvent {
    eventKind: string;
    message: string;
    retryable: boolean;
}
export type AgentTurnOutputSchemaSource = "session" | "turn";
export type AgentTurnOutputSchemaStrategy = "native" | "final_output_tool";
export interface AgentTurnOutputSchemaRuntime {
    source: AgentTurnOutputSchemaSource;
    strategy: AgentTurnOutputSchemaStrategy;
    providerName?: string | null;
    modelName?: string | null;
}
export interface AgentSessionExecutionRuntime {
    session_id: string;
    provider_selector?: string | null;
    provider_name?: string | null;
    model_name?: string | null;
    source_client?: string | null;
    imported_continuation?: Record<string, unknown> | null;
    imported_thread_settings?: Record<string, unknown> | null;
    execution_strategy?: AgentExecutionStrategy | null;
    output_schema_runtime?: AgentTurnOutputSchemaRuntime | null;
    source: AgentSessionExecutionRuntimeSource;
    mode?: string | null;
    latest_turn_id?: string | null;
    latest_turn_status?: "idle" | "queued" | "running" | "completed" | "failed" | "aborted" | "closed" | "not_found" | null;
    context_summary?: AgentTurnContextSummary | null;
    recent_access_mode?: AgentSessionExecutionRuntimeAccessMode | null;
    recent_preferences?: AgentSessionExecutionRuntimePreferences | null;
    recent_theme?: string | null;
    recent_session_mode?: "default" | "general_workbench" | string | null;
    recent_gate_key?: string | null;
    recent_run_title?: string | null;
    recent_content_id?: string | null;
    task_profile?: AgentSessionExecutionRuntimeTaskProfile | null;
    routing_decision?: AgentSessionExecutionRuntimeRoutingDecision | null;
    limit_state?: AgentSessionExecutionRuntimeLimitState | null;
    cost_state?: AgentSessionExecutionRuntimeCostState | null;
    permission_state?: AgentSessionExecutionRuntimePermissionState | null;
    limit_event?: AgentSessionExecutionRuntimeLimitEvent | null;
}
