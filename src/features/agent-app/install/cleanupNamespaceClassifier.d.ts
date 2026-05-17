import type { AppCleanupPlan, CleanupTarget, InstalledAgentAppState } from "../types";
export type AgentAppCleanupNamespaceCategory = "installed-state" | "package-cache" | "package-cache-index" | "package-staging" | "projection" | "readiness" | "setup-state" | "overlay-ref" | "storage-namespace" | "artifact-ref" | "evidence-ref" | "task-ref" | "secret-ref" | "log" | "export";
export type AgentAppCleanupNamespaceKind = "lifecycle" | "package" | "setup" | "overlay" | "storage" | "artifact" | "evidence" | "task" | "secret" | "log" | "export";
export type AgentAppCleanupNamespaceDisposition = "delete" | "retain";
export type AgentAppCleanupNamespaceBlockedReason = "UNSAFE_TARGET" | "OUT_OF_SCOPE";
export type AgentAppCleanupNamespaceStrategy = "keep-data" | "delete-data";
export interface AgentAppCleanupNamespaceGroup {
    category: AgentAppCleanupNamespaceCategory;
    namespaceKind: AgentAppCleanupNamespaceKind;
    targets: CleanupTarget[];
    appData: boolean;
}
export interface AgentAppCleanupNamespaceTargetSummary {
    category: AgentAppCleanupNamespaceCategory;
    namespaceKind: AgentAppCleanupNamespaceKind;
    appData: boolean;
    kind: CleanupTarget["kind"];
    value: string;
    exists: CleanupTarget["exists"];
    safeToDelete: CleanupTarget["safeToDelete"];
    reason: string;
    disposition: AgentAppCleanupNamespaceDisposition;
}
export interface AgentAppCleanupNamespaceBlockedTargetSummary {
    category: AgentAppCleanupNamespaceCategory;
    namespaceKind: AgentAppCleanupNamespaceKind;
    appData: boolean;
    kind: CleanupTarget["kind"];
    value: string;
    exists: CleanupTarget["exists"];
    safeToDelete: CleanupTarget["safeToDelete"];
    reason: string;
    blockedReason: AgentAppCleanupNamespaceBlockedReason;
}
export interface AgentAppCleanupNamespaceClassification {
    targetCount: number;
    deletedTargetCount: number;
    retainedTargetCount: number;
    blockedTargetCount: number;
    targets: AgentAppCleanupNamespaceTargetSummary[];
    blockedTargets: AgentAppCleanupNamespaceBlockedTargetSummary[];
}
export declare function listAgentAppCleanupNamespaceGroups(plan: AppCleanupPlan): AgentAppCleanupNamespaceGroup[];
export declare function classifyAgentAppCleanupNamespaceTargets(params: {
    state: InstalledAgentAppState;
    cleanupPlan: AppCleanupPlan;
    strategy: AgentAppCleanupNamespaceStrategy;
}): AgentAppCleanupNamespaceClassification;
