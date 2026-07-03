import type { PluginCapabilityErrorCode, PluginCapabilityErrorPayload } from "../types";
export declare const LIME_CAPABILITY_ERROR_CODES: readonly ["capability_unavailable", "readiness_blocked", "permission_denied", "policy_denied", "schema_invalid", "source_unverified", "secret_required", "timeout", "cancelled", "conflict", "upstream_failed"];
export type LimeCapabilityErrorCode = (typeof LIME_CAPABILITY_ERROR_CODES)[number];
export interface LimeCapabilityError {
    code: LimeCapabilityErrorCode;
    message: string;
    appId?: string;
    entryKey?: string;
    capability?: string;
    method?: string;
    requestId?: string;
    traceId?: string;
    causeCode?: string;
    retryable?: boolean;
    details?: unknown;
}
export interface LimeCapabilityErrorContext {
    appId?: string;
    entryKey?: string;
    capability?: string;
    method?: string;
    requestId?: string;
    traceId?: string;
    retryable?: boolean;
    details?: unknown;
}
export interface PluginCapabilityErrorInit extends PluginCapabilityErrorPayload {
    stableCode?: LimeCapabilityErrorCode;
    method?: string;
    requestId?: string;
    traceId?: string;
    retryable?: boolean;
    details?: unknown;
}
export declare function isLimeCapabilityErrorCode(value: unknown): value is LimeCapabilityErrorCode;
export declare function normalizeLimeCapabilityErrorCode(code: string | undefined): LimeCapabilityErrorCode;
export declare class PluginCapabilityError extends Error {
    readonly code: PluginCapabilityErrorCode;
    readonly stableCode: LimeCapabilityErrorCode;
    readonly appId?: string;
    readonly entryKey?: string;
    readonly capability?: string;
    readonly method?: string;
    readonly requestId?: string;
    readonly traceId?: string;
    readonly retryable?: boolean;
    readonly details?: unknown;
    constructor(payload: PluginCapabilityErrorInit);
    toStableError(context?: LimeCapabilityErrorContext): LimeCapabilityError;
}
export declare function toLimeCapabilityError(error: unknown, context?: LimeCapabilityErrorContext): LimeCapabilityError;
