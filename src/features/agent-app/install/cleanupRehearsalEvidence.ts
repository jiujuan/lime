import type { AppCleanupPlan, CleanupTarget, InstalledAgentAppState } from "../types";
import {
  classifyAgentAppCleanupNamespaceTargets,
  type AgentAppCleanupNamespaceBlockedReason,
  type AgentAppCleanupNamespaceCategory,
  type AgentAppCleanupNamespaceDisposition,
  type AgentAppCleanupNamespaceKind,
  type AgentAppCleanupNamespaceStrategy,
} from "./cleanupNamespaceClassifier";

export type AgentAppCleanupRehearsalStrategy = AgentAppCleanupNamespaceStrategy;

export type AgentAppCleanupRehearsalTargetCategory =
  AgentAppCleanupNamespaceCategory;

export type AgentAppCleanupRehearsalTargetDisposition =
  AgentAppCleanupNamespaceDisposition;

export type AgentAppCleanupRehearsalBlockedReason =
  AgentAppCleanupNamespaceBlockedReason;

export interface AgentAppCleanupRehearsalTargetSummary {
  category: AgentAppCleanupRehearsalTargetCategory;
  namespaceKind: AgentAppCleanupNamespaceKind;
  appData: boolean;
  kind: CleanupTarget["kind"];
  value: string;
  exists: CleanupTarget["exists"];
  safeToDelete: CleanupTarget["safeToDelete"];
  reason: string;
  disposition: AgentAppCleanupRehearsalTargetDisposition;
}

export interface AgentAppCleanupRehearsalBlockedTargetSummary {
  category: AgentAppCleanupRehearsalTargetCategory;
  namespaceKind: AgentAppCleanupNamespaceKind;
  appData: boolean;
  kind: CleanupTarget["kind"];
  value: string;
  exists: CleanupTarget["exists"];
  safeToDelete: CleanupTarget["safeToDelete"];
  reason: string;
  blockedReason: AgentAppCleanupRehearsalBlockedReason;
}

export interface AgentAppCleanupRehearsalEvidenceSummary {
  appId: string;
  appVersion: string;
  packageHash: string;
  manifestHash: string;
  strategy: AgentAppCleanupRehearsalStrategy;
  generatedAt: string;
  targetCount: number;
  deletedTargetCount: number;
  retainedTargetCount: number;
  blockedTargetCount: number;
  warningCodes: string[];
  targets: AgentAppCleanupRehearsalTargetSummary[];
  blockedTargets: AgentAppCleanupRehearsalBlockedTargetSummary[];
}

export function buildAgentAppCleanupRehearsalEvidence(params: {
  state: InstalledAgentAppState;
  cleanupPlan: AppCleanupPlan;
  strategy: AgentAppCleanupRehearsalStrategy;
  generatedAt?: string;
}): AgentAppCleanupRehearsalEvidenceSummary {
  const classification = classifyAgentAppCleanupNamespaceTargets({
    state: params.state,
    cleanupPlan: params.cleanupPlan,
    strategy: params.strategy,
  });

  return {
    appId: params.state.appId,
    appVersion: params.state.identity.appVersion,
    packageHash: params.state.identity.packageHash,
    manifestHash: params.state.identity.manifestHash,
    strategy: params.strategy,
    generatedAt: params.generatedAt ?? new Date().toISOString(),
    targetCount: classification.targetCount,
    deletedTargetCount: classification.deletedTargetCount,
    retainedTargetCount: classification.retainedTargetCount,
    blockedTargetCount: classification.blockedTargetCount,
    warningCodes: params.cleanupPlan.warnings.map((warning) => warning.code),
    targets: classification.targets,
    blockedTargets: classification.blockedTargets,
  };
}
