import type { AgentAppPackageVerificationResult, AgentAppProvenance, PackageIdentity } from "../types";
export interface AgentAppPackageCacheEntry {
    appId: string;
    identity: PackageIdentity;
    manifestSnapshot: unknown;
    packageHash: string;
    manifestHash: string;
    cachePath: string;
    cachedAt: string;
}
export interface AgentAppPackageCacheSaveResult {
    status: "cached" | "blocked";
    entry?: AgentAppPackageCacheEntry;
    verification: AgentAppPackageVerificationResult;
}
export interface AgentAppPackageCacheResolveResult {
    status: "cache_hit" | "cache_miss" | "hash_mismatch";
    entry?: AgentAppPackageCacheEntry;
    verification?: AgentAppPackageVerificationResult;
}
export interface AgentAppPackageCacheStageResult {
    status: "staged" | "blocked";
    entry?: AgentAppPackageCacheEntry;
    previousEntry?: AgentAppPackageCacheEntry;
    verification: AgentAppPackageVerificationResult;
}
export interface AgentAppPackageCacheCommitResult {
    status: "committed" | "nothing_staged";
    activeEntry?: AgentAppPackageCacheEntry;
    previousEntry?: AgentAppPackageCacheEntry;
}
export interface AgentAppPackageCacheRollbackResult {
    status: "rolled_back" | "nothing_to_rollback";
    appId: string;
    activeEntry?: AgentAppPackageCacheEntry;
    previousEntry?: AgentAppPackageCacheEntry;
    reason: string;
    evidence?: AgentAppProvenance;
}
export declare function buildAgentAppPackageCacheEntry(params: {
    identity: PackageIdentity;
    manifestSnapshot: unknown;
    actualPackageHash?: string;
    actualManifestHash?: string;
    cacheRoot?: string;
    cachedAt?: string;
}): AgentAppPackageCacheEntry;
export declare function verifyAgentAppPackageCacheEntry(entry: AgentAppPackageCacheEntry | undefined, identity: PackageIdentity): AgentAppPackageVerificationResult;
export declare class InMemoryAgentAppPackageCacheRepository {
    private readonly activeEntries;
    private readonly stagedEntries;
    private readonly rollbackEntries;
    saveVerified(entry: AgentAppPackageCacheEntry): AgentAppPackageCacheSaveResult;
    resolve(identity: PackageIdentity): AgentAppPackageCacheResolveResult;
    stageUpgrade(entry: AgentAppPackageCacheEntry): AgentAppPackageCacheStageResult;
    commitStaged(appId: string): AgentAppPackageCacheCommitResult;
    rollback(appId: string, reason?: string): AgentAppPackageCacheRollbackResult;
    listActive(): AgentAppPackageCacheEntry[];
    clearApp(appId: string): number;
}
