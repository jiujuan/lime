import { InMemoryInstalledAgentAppStateStore } from "./installedAppState";
import { InMemoryAgentAppPackageCacheRepository, type AgentAppPackageCacheEntry, type AgentAppPackageCacheSaveResult } from "./packageCache";
import { type AgentAppEntryRuntimeGuardOperation, type AgentAppEntryRuntimeGuardResult, type AgentAppPermissionDecision } from "../runtime/entryRuntimeGuard";
import { type AgentAppRuntimePackageLoadResult } from "../runtime/runtimePackageLoader";
import type { AgentAppHostFlags, AgentAppProjection, AgentAppSetupState, AppCleanupPlan, InstalledAgentAppState, InstalledAppPreview, ReadinessStatus } from "../types";
export type AgentAppLabInstallFlowStage = "source-selected" | "package-reviewed" | "package-verified" | "installed" | "setup-review" | "permission-review" | "launched" | "cleanup-preview";
export type AgentAppLabInstallFlowStatus = AgentAppLabInstallFlowStage | "package-invalid" | "package-mismatch" | "needs-setup" | "permission-denied" | "runtime-blocked" | "cleanup-required";
export interface AgentAppLabInstallReview {
    appId: string;
    displayName: string;
    appVersion: string;
    sourceKind: string;
    sourceUri: string;
    packageHash: string;
    manifestHash: string;
    readinessStatus: ReadinessStatus;
    requiredSetupCount: number;
    requestedPermissionCount: number;
    cleanupTargetCount: number;
}
export interface AgentAppLabUninstallBranchPreview {
    mode: "keep-data" | "delete-data";
    deletedTargetCount: number;
    retainedTargetCount: number;
    warningCodes: string[];
}
export interface AgentAppLabInstallFlowResult {
    status: AgentAppLabInstallFlowStatus;
    completedStages: AgentAppLabInstallFlowStage[];
    review: AgentAppLabInstallReview;
    cacheEntry?: AgentAppPackageCacheEntry;
    cacheSave: AgentAppPackageCacheSaveResult;
    installedState?: InstalledAgentAppState;
    runtimePackageLoad?: AgentAppRuntimePackageLoadResult;
    guard?: AgentAppEntryRuntimeGuardResult;
    cleanupPreview: AppCleanupPlan;
    uninstallPreview: {
        keepData: AgentAppLabUninstallBranchPreview;
        deleteData: AgentAppLabUninstallBranchPreview;
    };
    canLaunch: boolean;
}
export interface EvaluateAgentAppLabInstallFlowParams {
    preview: InstalledAppPreview;
    flags: AgentAppHostFlags;
    entryKey?: string;
    operation?: AgentAppEntryRuntimeGuardOperation;
    permissionDecision?: AgentAppPermissionDecision;
    launchRequested?: boolean;
    setup?: AgentAppSetupState;
    packageCache?: InMemoryAgentAppPackageCacheRepository;
    installedStore?: InMemoryInstalledAgentAppStateStore;
    actualPackageHash?: string;
    actualManifestHash?: string;
    now?: string;
}
export declare function buildAgentAppLabResolvedSetupState(projection: AgentAppProjection): AgentAppSetupState;
export declare function evaluateAgentAppLabInstallFlow(params: EvaluateAgentAppLabInstallFlowParams): AgentAppLabInstallFlowResult;
