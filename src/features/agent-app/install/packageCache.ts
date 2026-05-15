import {
  buildAgentAppManifestHash,
  buildAgentAppPackageHash,
} from "./packageIdentity";
import type {
  AgentAppPackageVerificationResult,
  AgentAppProvenance,
  PackageIdentity,
} from "../types";

const DEFAULT_AGENT_APP_DATA_ROOT = "<LimeAppData>/agent-apps";

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

function cachePath(dataRoot: string, identity: PackageIdentity): string {
  return `${dataRoot}/packages/${identity.packageHash}`;
}

function identitySourceUriForLocalHash(identity: PackageIdentity): string {
  return identity.sourceKind === "fixture" ? "fixture" : identity.sourceUri;
}

function cloneEntry(entry: AgentAppPackageCacheEntry): AgentAppPackageCacheEntry {
  return structuredClone(entry);
}

export function buildAgentAppPackageCacheEntry(params: {
  identity: PackageIdentity;
  manifestSnapshot: unknown;
  actualPackageHash?: string;
  actualManifestHash?: string;
  cacheRoot?: string;
  cachedAt?: string;
}): AgentAppPackageCacheEntry {
  const dataRoot = params.cacheRoot ?? DEFAULT_AGENT_APP_DATA_ROOT;
  return {
    appId: params.identity.appId,
    identity: structuredClone(params.identity),
    manifestSnapshot: structuredClone(params.manifestSnapshot),
    packageHash:
      params.actualPackageHash ??
      buildAgentAppPackageHash({
        manifest: params.manifestSnapshot,
        sourceUri: identitySourceUriForLocalHash(params.identity),
      }),
    manifestHash:
      params.actualManifestHash ??
      buildAgentAppManifestHash(params.manifestSnapshot),
    cachePath: cachePath(dataRoot, params.identity),
    cachedAt: params.cachedAt ?? new Date().toISOString(),
  };
}

export function verifyAgentAppPackageCacheEntry(
  entry: AgentAppPackageCacheEntry | undefined,
  identity: PackageIdentity,
): AgentAppPackageVerificationResult {
  if (!entry) {
    return {
      status: "missing",
      expectedPackageHash: identity.packageHash,
      expectedManifestHash: identity.manifestHash,
      message: "Agent App package cache entry is missing.",
    };
  }
  if (entry.packageHash !== identity.packageHash) {
    return {
      status: "package_hash_mismatch",
      expectedPackageHash: identity.packageHash,
      actualPackageHash: entry.packageHash,
      expectedManifestHash: identity.manifestHash,
      actualManifestHash: entry.manifestHash,
      message: "Agent App package hash does not match package identity.",
    };
  }
  if (entry.manifestHash !== identity.manifestHash) {
    return {
      status: "manifest_hash_mismatch",
      expectedPackageHash: identity.packageHash,
      actualPackageHash: entry.packageHash,
      expectedManifestHash: identity.manifestHash,
      actualManifestHash: entry.manifestHash,
      message: "Agent App manifest hash does not match package identity.",
    };
  }
  return {
    status: "verified",
    expectedPackageHash: identity.packageHash,
    actualPackageHash: entry.packageHash,
    expectedManifestHash: identity.manifestHash,
    actualManifestHash: entry.manifestHash,
    message: "Agent App package cache entry is verified.",
  };
}

export class InMemoryAgentAppPackageCacheRepository {
  private readonly activeEntries = new Map<string, AgentAppPackageCacheEntry>();
  private readonly stagedEntries = new Map<string, AgentAppPackageCacheEntry>();
  private readonly rollbackEntries = new Map<string, AgentAppPackageCacheEntry>();

  saveVerified(entry: AgentAppPackageCacheEntry): AgentAppPackageCacheSaveResult {
    const verification = verifyAgentAppPackageCacheEntry(entry, entry.identity);
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

  resolve(identity: PackageIdentity): AgentAppPackageCacheResolveResult {
    const active = this.activeEntries.get(identity.appId);
    const verification = verifyAgentAppPackageCacheEntry(active, identity);
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

  stageUpgrade(entry: AgentAppPackageCacheEntry): AgentAppPackageCacheStageResult {
    const verification = verifyAgentAppPackageCacheEntry(entry, entry.identity);
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

  commitStaged(appId: string): AgentAppPackageCacheCommitResult {
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

  rollback(appId: string, reason = "Rollback to previous verified Agent App package."): AgentAppPackageCacheRollbackResult {
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
        sourceKind: "agent_app",
        appId: previousEntry.identity.appId,
        appVersion: previousEntry.identity.appVersion,
        packageHash: previousEntry.identity.packageHash,
        manifestHash: previousEntry.identity.manifestHash,
      },
    };
  }

  listActive(): AgentAppPackageCacheEntry[] {
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
