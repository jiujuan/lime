import type { InstalledAgentAppStatePersistenceIssue } from "./installedAppState";
import type {
  AgentAppCleanupRehearsalEvidenceSummary,
  AgentAppCleanupRehearsalTargetSummary,
} from "./cleanupRehearsalEvidence";
import type { InstalledAgentAppState } from "../types";

export interface AgentAppCleanupResidualTargetSummary {
  category: AgentAppCleanupRehearsalTargetSummary["category"];
  kind: AgentAppCleanupRehearsalTargetSummary["kind"];
  value: string;
  reason: string;
}

export interface AgentAppCleanupResidualRepositoryIssueSummary {
  code: InstalledAgentAppStatePersistenceIssue["code"];
  path: string;
  message: string;
  appId?: string;
}

export interface AgentAppCleanupResidualAuditSummary {
  appId: string;
  appVersion: string;
  packageHash: string;
  manifestHash: string;
  strategy: AgentAppCleanupRehearsalEvidenceSummary["strategy"];
  generatedAt: string;
  retainedTargets: AgentAppCleanupResidualTargetSummary[];
  pendingDeletionTargets: AgentAppCleanupResidualTargetSummary[];
  blockedOutOfScopeTargets: AgentAppCleanupResidualTargetSummary[];
  repositoryIssues: AgentAppCleanupResidualRepositoryIssueSummary[];
  retainedCount: number;
  pendingDeletionCount: number;
  blockedOutOfScopeCount: number;
  repositoryIssueCount: number;
}

function targetSummary(
  target: Pick<
    AgentAppCleanupResidualTargetSummary,
    "category" | "kind" | "value" | "reason"
  >,
): AgentAppCleanupResidualTargetSummary {
  return {
    category: target.category,
    kind: target.kind,
    value: target.value,
    reason: target.reason,
  };
}

export function buildAgentAppCleanupResidualAudit(params: {
  state: InstalledAgentAppState;
  cleanupEvidence: AgentAppCleanupRehearsalEvidenceSummary;
  repositoryIssues?: InstalledAgentAppStatePersistenceIssue[];
  generatedAt?: string;
}): AgentAppCleanupResidualAuditSummary {
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
