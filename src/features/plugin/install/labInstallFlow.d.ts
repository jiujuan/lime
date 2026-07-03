import { InMemoryInstalledPluginStateStore } from "./installedAppState";
import { InMemoryPluginPackageCacheRepository, type PluginPackageCacheEntry, type PluginPackageCacheSaveResult } from "./packageCache";
import { type PluginEntryRuntimeGuardOperation, type PluginEntryRuntimeGuardResult, type PluginPermissionDecision } from "../runtime/entryRuntimeGuard";
import { type PluginRuntimePackageLoadResult } from "../runtime/runtimePackageLoader";
import type { PluginHostFlags, PluginProjection, PluginSetupState, AppCleanupPlan, InstalledPluginState, InstalledAppPreview, ReadinessStatus } from "../types";
export type PluginLabInstallFlowStage = "source-selected" | "package-reviewed" | "package-verified" | "installed" | "setup-review" | "permission-review" | "launched" | "cleanup-preview";
export type PluginLabInstallFlowStatus = PluginLabInstallFlowStage | "package-invalid" | "package-mismatch" | "needs-setup" | "permission-denied" | "runtime-blocked" | "cleanup-required";
export interface PluginLabInstallReview {
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
export interface PluginLabUninstallBranchPreview {
    mode: "keep-data" | "delete-data";
    deletedTargetCount: number;
    retainedTargetCount: number;
    warningCodes: string[];
}
export interface PluginLabInstallFlowResult {
    status: PluginLabInstallFlowStatus;
    completedStages: PluginLabInstallFlowStage[];
    review: PluginLabInstallReview;
    cacheEntry?: PluginPackageCacheEntry;
    cacheSave: PluginPackageCacheSaveResult;
    installedState?: InstalledPluginState;
    runtimePackageLoad?: PluginRuntimePackageLoadResult;
    guard?: PluginEntryRuntimeGuardResult;
    cleanupPreview: AppCleanupPlan;
    uninstallPreview: {
        keepData: PluginLabUninstallBranchPreview;
        deleteData: PluginLabUninstallBranchPreview;
    };
    canLaunch: boolean;
}
export interface EvaluatePluginLabInstallFlowParams {
    preview: InstalledAppPreview;
    flags: PluginHostFlags;
    entryKey?: string;
    operation?: PluginEntryRuntimeGuardOperation;
    permissionDecision?: PluginPermissionDecision;
    launchRequested?: boolean;
    setup?: PluginSetupState;
    packageCache?: InMemoryPluginPackageCacheRepository;
    installedStore?: InMemoryInstalledPluginStateStore;
    actualPackageHash?: string;
    actualManifestHash?: string;
    now?: string;
}
export declare function buildPluginLabResolvedSetupState(projection: PluginProjection): PluginSetupState;
export declare function evaluatePluginLabInstallFlow(params: EvaluatePluginLabInstallFlowParams): PluginLabInstallFlowResult;
