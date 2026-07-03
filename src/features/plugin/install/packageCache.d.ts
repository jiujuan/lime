import type { PluginPackageVerificationResult, PluginProvenance, PackageIdentity } from "../types";
export interface PluginPackageCacheEntry {
    appId: string;
    identity: PackageIdentity;
    manifestSnapshot: unknown;
    packageHash: string;
    manifestHash: string;
    cachePath: string;
    cachedAt: string;
}
export interface PluginPackageCacheSaveResult {
    status: "cached" | "blocked";
    entry?: PluginPackageCacheEntry;
    verification: PluginPackageVerificationResult;
}
export interface PluginPackageCacheResolveResult {
    status: "cache_hit" | "cache_miss" | "hash_mismatch";
    entry?: PluginPackageCacheEntry;
    verification?: PluginPackageVerificationResult;
}
export interface PluginPackageCacheStageResult {
    status: "staged" | "blocked";
    entry?: PluginPackageCacheEntry;
    previousEntry?: PluginPackageCacheEntry;
    verification: PluginPackageVerificationResult;
}
export interface PluginPackageCacheCommitResult {
    status: "committed" | "nothing_staged";
    activeEntry?: PluginPackageCacheEntry;
    previousEntry?: PluginPackageCacheEntry;
}
export interface PluginPackageCacheRollbackResult {
    status: "rolled_back" | "nothing_to_rollback";
    appId: string;
    activeEntry?: PluginPackageCacheEntry;
    previousEntry?: PluginPackageCacheEntry;
    reason: string;
    evidence?: PluginProvenance;
}
export declare function buildPluginPackageCacheEntry(params: {
    identity: PackageIdentity;
    manifestSnapshot: unknown;
    actualPackageHash?: string;
    actualManifestHash?: string;
    cacheRoot?: string;
    cachedAt?: string;
}): PluginPackageCacheEntry;
export declare function verifyPluginPackageCacheEntry(entry: PluginPackageCacheEntry | undefined, identity: PackageIdentity): PluginPackageVerificationResult;
export declare class InMemoryPluginPackageCacheRepository {
    private readonly activeEntries;
    private readonly stagedEntries;
    private readonly rollbackEntries;
    saveVerified(entry: PluginPackageCacheEntry): PluginPackageCacheSaveResult;
    resolve(identity: PackageIdentity): PluginPackageCacheResolveResult;
    stageUpgrade(entry: PluginPackageCacheEntry): PluginPackageCacheStageResult;
    commitStaged(appId: string): PluginPackageCacheCommitResult;
    rollback(appId: string, reason?: string): PluginPackageCacheRollbackResult;
    listActive(): PluginPackageCacheEntry[];
    clearApp(appId: string): number;
}
