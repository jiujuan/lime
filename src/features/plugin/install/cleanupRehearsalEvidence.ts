import type { AppCleanupPlan, CleanupTarget, InstalledPluginState } from "../types";
import {
  classifyPluginCleanupNamespaceTargets,
  type PluginCleanupNamespaceBlockedReason,
  type PluginCleanupNamespaceCategory,
  type PluginCleanupNamespaceDisposition,
  type PluginCleanupNamespaceKind,
  type PluginCleanupNamespaceStrategy,
} from "./cleanupNamespaceClassifier";

export type PluginCleanupRehearsalStrategy = PluginCleanupNamespaceStrategy;

export type PluginCleanupRehearsalTargetCategory =
  PluginCleanupNamespaceCategory;

export type PluginCleanupRehearsalTargetDisposition =
  PluginCleanupNamespaceDisposition;

export type PluginCleanupRehearsalBlockedReason =
  PluginCleanupNamespaceBlockedReason;

export interface PluginCleanupRehearsalTargetSummary {
  category: PluginCleanupRehearsalTargetCategory;
  namespaceKind: PluginCleanupNamespaceKind;
  appData: boolean;
  kind: CleanupTarget["kind"];
  value: string;
  exists: CleanupTarget["exists"];
  safeToDelete: CleanupTarget["safeToDelete"];
  reason: string;
  disposition: PluginCleanupRehearsalTargetDisposition;
}

export interface PluginCleanupRehearsalBlockedTargetSummary {
  category: PluginCleanupRehearsalTargetCategory;
  namespaceKind: PluginCleanupNamespaceKind;
  appData: boolean;
  kind: CleanupTarget["kind"];
  value: string;
  exists: CleanupTarget["exists"];
  safeToDelete: CleanupTarget["safeToDelete"];
  reason: string;
  blockedReason: PluginCleanupRehearsalBlockedReason;
}

export interface PluginCleanupRehearsalEvidenceSummary {
  appId: string;
  appVersion: string;
  packageHash: string;
  manifestHash: string;
  strategy: PluginCleanupRehearsalStrategy;
  generatedAt: string;
  targetCount: number;
  deletedTargetCount: number;
  retainedTargetCount: number;
  blockedTargetCount: number;
  warningCodes: string[];
  targets: PluginCleanupRehearsalTargetSummary[];
  blockedTargets: PluginCleanupRehearsalBlockedTargetSummary[];
}

export function buildPluginCleanupRehearsalEvidence(params: {
  state: InstalledPluginState;
  cleanupPlan: AppCleanupPlan;
  strategy: PluginCleanupRehearsalStrategy;
  generatedAt?: string;
}): PluginCleanupRehearsalEvidenceSummary {
  const classification = classifyPluginCleanupNamespaceTargets({
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
