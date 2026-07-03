import type { InstalledPluginStatePersistenceIssue } from "./installedAppState";
import type {
  PluginCleanupRehearsalEvidenceSummary,
  PluginCleanupRehearsalTargetSummary,
} from "./cleanupRehearsalEvidence";
import type { InstalledPluginState } from "../types";

export interface PluginCleanupResidualTargetSummary {
  category: PluginCleanupRehearsalTargetSummary["category"];
  kind: PluginCleanupRehearsalTargetSummary["kind"];
  value: string;
  reason: string;
}

export interface PluginCleanupResidualRepositoryIssueSummary {
  code: InstalledPluginStatePersistenceIssue["code"];
  path: string;
  message: string;
  appId?: string;
}

export interface PluginCleanupResidualAuditSummary {
  appId: string;
  appVersion: string;
  packageHash: string;
  manifestHash: string;
  strategy: PluginCleanupRehearsalEvidenceSummary["strategy"];
  generatedAt: string;
  retainedTargets: PluginCleanupResidualTargetSummary[];
  pendingDeletionTargets: PluginCleanupResidualTargetSummary[];
  blockedOutOfScopeTargets: PluginCleanupResidualTargetSummary[];
  repositoryIssues: PluginCleanupResidualRepositoryIssueSummary[];
  retainedCount: number;
  pendingDeletionCount: number;
  blockedOutOfScopeCount: number;
  repositoryIssueCount: number;
}

function targetSummary(
  target: Pick<
    PluginCleanupResidualTargetSummary,
    "category" | "kind" | "value" | "reason"
  >,
): PluginCleanupResidualTargetSummary {
  return {
    category: target.category,
    kind: target.kind,
    value: target.value,
    reason: target.reason,
  };
}

export function buildPluginCleanupResidualAudit(params: {
  state: InstalledPluginState;
  cleanupEvidence: PluginCleanupRehearsalEvidenceSummary;
  repositoryIssues?: InstalledPluginStatePersistenceIssue[];
  generatedAt?: string;
}): PluginCleanupResidualAuditSummary {
  const retainedTargets = params.cleanupEvidence.targets
    .filter((target) => target.disposition === "retain")
    .map(targetSummary);
  const pendingDeletionTargets = params.cleanupEvidence.targets
    .filter((target) => target.disposition === "delete")
    .map(targetSummary);
  const blockedOutOfScopeTargets = params.cleanupEvidence.blockedTargets
    .filter((target) => target.blockedReason === "OUT_OF_SCOPE")
    .map(targetSummary);
  const repositoryIssues = (params.repositoryIssues ?? [])
    .filter((issue) => !issue.appId || issue.appId === params.state.appId)
    .map((issue) => ({
      code: issue.code,
      path: issue.path,
      message: issue.message,
      appId: issue.appId,
    }));

  return {
    appId: params.state.appId,
    appVersion: params.state.identity.appVersion,
    packageHash: params.state.identity.packageHash,
    manifestHash: params.state.identity.manifestHash,
    strategy: params.cleanupEvidence.strategy,
    generatedAt: params.generatedAt ?? new Date().toISOString(),
    retainedTargets,
    pendingDeletionTargets,
    blockedOutOfScopeTargets,
    repositoryIssues,
    retainedCount: retainedTargets.length,
    pendingDeletionCount: pendingDeletionTargets.length,
    blockedOutOfScopeCount: blockedOutOfScopeTargets.length,
    repositoryIssueCount: repositoryIssues.length,
  };
}
