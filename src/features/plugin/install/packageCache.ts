import {
  buildPluginManifestHash,
  buildPluginPackageHash,
} from "./packageIdentity";
import type {
  PluginPackageVerificationResult,
  PluginProvenance,
  PackageIdentity,
} from "../types";

const DEFAULT_PLUGIN_DATA_ROOT = "<LimeAppData>/plugins";

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

function cachePath(dataRoot: string, identity: PackageIdentity): string {
  return `${dataRoot}/packages/${identity.packageHash}`;
}

function identitySourceUriForLocalHash(identity: PackageIdentity): string {
  return identity.sourceKind === "fixture" ? "fixture" : identity.sourceUri;
}

function cloneEntry(entry: PluginPackageCacheEntry): PluginPackageCacheEntry {
  return structuredClone(entry);
}

export function buildPluginPackageCacheEntry(params: {
  identity: PackageIdentity;
  manifestSnapshot: unknown;
  actualPackageHash?: string;
  actualManifestHash?: string;
  cacheRoot?: string;
  cachedAt?: string;
}): PluginPackageCacheEntry {
  const dataRoot = params.cacheRoot ?? DEFAULT_PLUGIN_DATA_ROOT;
  return {
    appId: params.identity.appId,
    identity: structuredClone(params.identity),
    manifestSnapshot: structuredClone(params.manifestSnapshot),
    packageHash:
      params.actualPackageHash ??
      buildPluginPackageHash({
        manifest: params.manifestSnapshot,
        sourceUri: identitySourceUriForLocalHash(params.identity),
      }),
    manifestHash:
      params.actualManifestHash ??
      buildPluginManifestHash(params.manifestSnapshot),
    cachePath: cachePath(dataRoot, params.identity),
    cachedAt: params.cachedAt ?? new Date().toISOString(),
  };
}

export function verifyPluginPackageCacheEntry(
  entry: PluginPackageCacheEntry | undefined,
  identity: PackageIdentity,
): PluginPackageVerificationResult {
  if (!entry) {
    return {
      status: "missing",
      expectedPackageHash: identity.packageHash,
      expectedManifestHash: identity.manifestHash,
      message: "Plugin package cache entry is missing.",
    };
  }
  if (entry.packageHash !== identity.packageHash) {
    return {
      status: "package_hash_mismatch",
      expectedPackageHash: identity.packageHash,
      actualPackageHash: entry.packageHash,
      expectedManifestHash: identity.manifestHash,
      actualManifestHash: entry.manifestHash,
      message: "Plugin package hash does not match package identity.",
    };
  }
  if (entry.manifestHash !== identity.manifestHash) {
    return {
      status: "manifest_hash_mismatch",
      expectedPackageHash: identity.packageHash,
      actualPackageHash: entry.packageHash,
      expectedManifestHash: identity.manifestHash,
      actualManifestHash: entry.manifestHash,
      message: "Plugin manifest hash does not match package identity.",
    };
  }
  return {
    status: "verified",
    expectedPackageHash: identity.packageHash,
    actualPackageHash: entry.packageHash,
    expectedManifestHash: identity.manifestHash,
    actualManifestHash: entry.manifestHash,
    message: "Plugin package cache entry is verified.",
  };
}

export class InMemoryPluginPackageCacheRepository {
  private readonly activeEntries = new Map<string, PluginPackageCacheEntry>();
  private readonly stagedEntries = new Map<string, PluginPackageCacheEntry>();
  private readonly rollbackEntries = new Map<string, PluginPackageCacheEntry>();

  saveVerified(entry: PluginPackageCacheEntry): PluginPackageCacheSaveResult {
    const verification = verifyPluginPackageCacheEntry(entry, entry.identity);
    if (verification.status !== "verified") {
      return { status: "blocked", verification };
    }
    this.activeEntries.set(entry.appId, cloneEntry(entry));
    return {
      status: "cached",
      entry: cloneEntry(entry),
      verification,
    };
  }

  resolve(identity: PackageIdentity): PluginPackageCacheResolveResult {
    const active = this.activeEntries.get(identity.appId);
    const verification = verifyPluginPackageCacheEntry(active, identity);
    if (!active || verification.status === "missing") {
      return {
        status: "cache_miss",
        verification,
      };
    }
    if (verification.status !== "verified") {
      return {
        status: "hash_mismatch",
        entry: cloneEntry(active),
        verification,
      };
    }
    return {
      status: "cache_hit",
      entry: cloneEntry(active),
      verification,
    };
  }

  stageUpgrade(entry: PluginPackageCacheEntry): PluginPackageCacheStageResult {
    const verification = verifyPluginPackageCacheEntry(entry, entry.identity);
    const previousEntry = this.activeEntries.get(entry.appId);
    if (verification.status !== "verified") {
      return {
        status: "blocked",
        previousEntry: previousEntry ? cloneEntry(previousEntry) : undefined,
        verification,
      };
    }
    this.stagedEntries.set(entry.appId, cloneEntry(entry));
    return {
      status: "staged",
      entry: cloneEntry(entry),
      previousEntry: previousEntry ? cloneEntry(previousEntry) : undefined,
      verification,
    };
  }

  commitStaged(appId: string): PluginPackageCacheCommitResult {
    const staged = this.stagedEntries.get(appId);
    if (!staged) {
      return { status: "nothing_staged" };
    }
    const previousEntry = this.activeEntries.get(appId);
    if (previousEntry) {
      this.rollbackEntries.set(appId, cloneEntry(previousEntry));
    }
    this.activeEntries.set(appId, cloneEntry(staged));
    this.stagedEntries.delete(appId);
    return {
      status: "committed",
      activeEntry: cloneEntry(staged),
      previousEntry: previousEntry ? cloneEntry(previousEntry) : undefined,
    };
  }

  rollback(appId: string, reason = "Rollback to previous verified Plugin package."): PluginPackageCacheRollbackResult {
    const previousEntry = this.rollbackEntries.get(appId);
    const activeEntry = this.activeEntries.get(appId);
    if (!previousEntry) {
      return {
        status: "nothing_to_rollback",
        appId,
        activeEntry: activeEntry ? cloneEntry(activeEntry) : undefined,
        reason: "No previous verified package is available for rollback.",
      };
    }
    this.activeEntries.set(appId, cloneEntry(previousEntry));
    this.rollbackEntries.delete(appId);
    return {
      status: "rolled_back",
      appId,
      activeEntry: cloneEntry(previousEntry),
      previousEntry: activeEntry ? cloneEntry(activeEntry) : undefined,
      reason,
      evidence: {
        sourceKind: "plugin",
        appId: previousEntry.identity.appId,
        appVersion: previousEntry.identity.appVersion,
        packageHash: previousEntry.identity.packageHash,
        manifestHash: previousEntry.identity.manifestHash,
      },
    };
  }

  listActive(): PluginPackageCacheEntry[] {
    return Array.from(this.activeEntries.values())
      .map(cloneEntry)
      .sort((left, right) => left.appId.localeCompare(right.appId));
  }

  clearApp(appId: string): number {
    const deleted = [
      this.activeEntries.delete(appId),
      this.stagedEntries.delete(appId),
      this.rollbackEntries.delete(appId),
    ].filter(Boolean).length;
    return deleted;
  }
}
