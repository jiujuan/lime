import type { AppCleanupPlan, CleanupTarget, InstalledPluginState } from "../types";
export type PluginCleanupNamespaceCategory = "installed-state" | "package-cache" | "package-cache-index" | "package-staging" | "projection" | "readiness" | "setup-state" | "overlay-ref" | "storage-namespace" | "artifact-ref" | "evidence-ref" | "task-ref" | "secret-ref" | "log" | "export";
export type PluginCleanupNamespaceKind = "lifecycle" | "package" | "setup" | "overlay" | "storage" | "artifact" | "evidence" | "task" | "secret" | "log" | "export";
export type PluginCleanupNamespaceDisposition = "delete" | "retain";
export type PluginCleanupNamespaceBlockedReason = "UNSAFE_TARGET" | "OUT_OF_SCOPE";
export type PluginCleanupNamespaceStrategy = "keep-data" | "delete-data";
export interface PluginCleanupNamespaceGroup {
    category: PluginCleanupNamespaceCategory;
    namespaceKind: PluginCleanupNamespaceKind;
    targets: CleanupTarget[];
    appData: boolean;
}
export interface PluginCleanupNamespaceTargetSummary {
    category: PluginCleanupNamespaceCategory;
    namespaceKind: PluginCleanupNamespaceKind;
    appData: boolean;
    kind: CleanupTarget["kind"];
    value: string;
    exists: CleanupTarget["exists"];
    safeToDelete: CleanupTarget["safeToDelete"];
    reason: string;
    disposition: PluginCleanupNamespaceDisposition;
}
export interface PluginCleanupNamespaceBlockedTargetSummary {
    category: PluginCleanupNamespaceCategory;
    namespaceKind: PluginCleanupNamespaceKind;
    appData: boolean;
    kind: CleanupTarget["kind"];
    value: string;
    exists: CleanupTarget["exists"];
    safeToDelete: CleanupTarget["safeToDelete"];
    reason: string;
    blockedReason: PluginCleanupNamespaceBlockedReason;
}
export interface PluginCleanupNamespaceClassification {
    targetCount: number;
    deletedTargetCount: number;
    retainedTargetCount: number;
    blockedTargetCount: number;
    targets: PluginCleanupNamespaceTargetSummary[];
    blockedTargets: PluginCleanupNamespaceBlockedTargetSummary[];
}
export declare function listPluginCleanupNamespaceGroups(plan: AppCleanupPlan): PluginCleanupNamespaceGroup[];
export declare function classifyPluginCleanupNamespaceTargets(params: {
    state: InstalledPluginState;
    cleanupPlan: AppCleanupPlan;
    strategy: PluginCleanupNamespaceStrategy;
}): PluginCleanupNamespaceClassification;
