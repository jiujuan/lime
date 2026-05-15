import type { AppCleanupPlan, CleanupTarget, InstalledAgentAppState } from "../types";

export type AgentAppCleanupNamespaceCategory =
  | "installed-state"
  | "package-cache"
  | "package-cache-index"
  | "package-staging"
  | "projection"
  | "readiness"
  | "setup-state"
  | "overlay-ref"
  | "storage-namespace"
  | "artifact-ref"
  | "evidence-ref"
  | "task-ref"
  | "secret-ref"
  | "log"
  | "export";

export type AgentAppCleanupNamespaceKind =
  | "lifecycle"
  | "package"
  | "setup"
  | "overlay"
  | "storage"
  | "artifact"
  | "evidence"
  | "task"
  | "secret"
  | "log"
  | "export";

export type AgentAppCleanupNamespaceDisposition = "delete" | "retain";

export type AgentAppCleanupNamespaceBlockedReason =
  | "UNSAFE_TARGET"
  | "OUT_OF_SCOPE";

export type AgentAppCleanupNamespaceStrategy = "keep-data" | "delete-data";

export interface AgentAppCleanupNamespaceGroup {
  category: AgentAppCleanupNamespaceCategory;
  namespaceKind: AgentAppCleanupNamespaceKind;
  targets: CleanupTarget[];
  appData: boolean;
}

export interface AgentAppCleanupNamespaceTargetSummary {
  category: AgentAppCleanupNamespaceCategory;
  namespaceKind: AgentAppCleanupNamespaceKind;
  appData: boolean;
  kind: CleanupTarget["kind"];
  value: string;
  exists: CleanupTarget["exists"];
  safeToDelete: CleanupTarget["safeToDelete"];
  reason: string;
  disposition: AgentAppCleanupNamespaceDisposition;
}

export interface AgentAppCleanupNamespaceBlockedTargetSummary {
  category: AgentAppCleanupNamespaceCategory;
  namespaceKind: AgentAppCleanupNamespaceKind;
  appData: boolean;
  kind: CleanupTarget["kind"];
  value: string;
  exists: CleanupTarget["exists"];
  safeToDelete: CleanupTarget["safeToDelete"];
  reason: string;
  blockedReason: AgentAppCleanupNamespaceBlockedReason;
}

export interface AgentAppCleanupNamespaceClassification {
  targetCount: number;
  deletedTargetCount: number;
  retainedTargetCount: number;
  blockedTargetCount: number;
  targets: AgentAppCleanupNamespaceTargetSummary[];
  blockedTargets: AgentAppCleanupNamespaceBlockedTargetSummary[];
}

export function listAgentAppCleanupNamespaceGroups(
  plan: AppCleanupPlan,
): AgentAppCleanupNamespaceGroup[] {
  return [
    {
      category: "installed-state",
      namespaceKind: "lifecycle",
      targets: plan.installedStatePaths,
      appData: false,
    },
    {
      category: "package-cache",
      namespaceKind: "package",
      targets: plan.packageCachePaths,
      appData: false,
    },
    {
      category: "package-cache-index",
      namespaceKind: "package",
      targets: plan.packageCacheIndexPaths,
      appData: false,
    },
    {
      category: "package-staging",
      namespaceKind: "package",
      targets: plan.packageStagingPaths,
      appData: false,
    },
    {
      category: "projection",
      namespaceKind: "lifecycle",
      targets: plan.projectionPaths,
      appData: false,
    },
    {
      category: "readiness",
      namespaceKind: "lifecycle",
      targets: plan.readinessPaths,
      appData: false,
    },
    {
      category: "setup-state",
      namespaceKind: "setup",
      targets: plan.setupStatePaths,
      appData: false,
    },
    {
      category: "overlay-ref",
      namespaceKind: "overlay",
      targets: plan.overlayRefs,
      appData: true,
    },
    {
      category: "storage-namespace",
      namespaceKind: "storage",
      targets: plan.storageNamespaces,
      appData: true,
    },
    {
      category: "artifact-ref",
      namespaceKind: "artifact",
      targets: plan.artifactRefs,
      appData: true,
    },
    {
      category: "evidence-ref",
      namespaceKind: "evidence",
      targets: plan.evidenceRefs,
      appData: true,
    },
    {
      category: "task-ref",
      namespaceKind: "task",
      targets: plan.taskRefs,
      appData: true,
    },
    {
      category: "secret-ref",
      namespaceKind: "secret",
      targets: plan.secretRefs,
      appData: true,
    },
    {
      category: "log",
      namespaceKind: "log",
      targets: plan.logPaths,
      appData: false,
    },
    {
      category: "export",
      namespaceKind: "export",
      targets: plan.exportPaths,
      appData: true,
    },
  ];
}

function sanitizeTargetValue(
  target: CleanupTarget,
  category: AgentAppCleanupNamespaceCategory,
): string {
  if (category === "secret-ref") {
    return target.kind === "ref" && target.value.startsWith("secret-ref:")
      ? target.value
      : "secret-ref:redacted";
  }
  return target.value;
}

function isAgentAppScopedTarget(params: {
  target: CleanupTarget;
  category: AgentAppCleanupNamespaceCategory;
  state: InstalledAgentAppState;
  cleanupPlan: AppCleanupPlan;
}): boolean {
  const { target, category, state, cleanupPlan } = params;
  const storageNamespace = state.projection.storage?.namespace;
  const value = target.value;
  const allowedIdentifiers = [
    state.appId,
    state.identity.packageHash,
    state.identity.manifestHash,
    cleanupPlan.packageHash,
    storageNamespace,
  ].filter((item): item is string => Boolean(item));

  if (category === "secret-ref") {
    return target.kind === "ref" || value.includes(state.appId);
  }

  if (target.kind === "ref") {
    return value.includes(state.appId);
  }

  if (category === "storage-namespace" && storageNamespace) {
    return value.includes(`/storage/${storageNamespace}`) || value === storageNamespace;
  }

  if (value.includes("<LimeAppData>/agent-apps")) {
    return allowedIdentifiers.some((identifier) => value.includes(identifier));
  }

  return allowedIdentifiers.some((identifier) => value.includes(identifier));
}

function blockedReasonForTarget(params: {
  target: CleanupTarget;
  category: AgentAppCleanupNamespaceCategory;
  state: InstalledAgentAppState;
  cleanupPlan: AppCleanupPlan;
}): AgentAppCleanupNamespaceBlockedReason | null {
  if (!params.target.safeToDelete) {
    return "UNSAFE_TARGET";
  }
  if (!isAgentAppScopedTarget(params)) {
    return "OUT_OF_SCOPE";
  }
  return null;
}

export function classifyAgentAppCleanupNamespaceTargets(params: {
  state: InstalledAgentAppState;
  cleanupPlan: AppCleanupPlan;
  strategy: AgentAppCleanupNamespaceStrategy;
}): AgentAppCleanupNamespaceClassification {
  const targets: AgentAppCleanupNamespaceTargetSummary[] = [];
  const blockedTargets: AgentAppCleanupNamespaceBlockedTargetSummary[] = [];

  listAgentAppCleanupNamespaceGroups(params.cleanupPlan).forEach((group) => {
    group.targets.forEach((target) => {
      const blockedReason = blockedReasonForTarget({
        target,
        category: group.category,
        state: params.state,
        cleanupPlan: params.cleanupPlan,
      });
      const value = sanitizeTargetValue(target, group.category);

      if (blockedReason) {
        blockedTargets.push({
          category: group.category,
          namespaceKind: group.namespaceKind,
          appData: group.appData,
          kind: target.kind,
          value,
          exists: target.exists,
          safeToDelete: target.safeToDelete,
          reason: target.reason,
          blockedReason,
        });
        return;
      }

      targets.push({
        category: group.category,
        namespaceKind: group.namespaceKind,
        appData: group.appData,
        kind: target.kind,
        value,
        exists: target.exists,
        safeToDelete: target.safeToDelete,
        reason: target.reason,
        disposition:
          group.appData && params.strategy === "keep-data" ? "retain" : "delete",
      });
    });
  });

  const deletedTargetCount = targets.filter(
    (target) => target.disposition === "delete",
  ).length;
  const retainedTargetCount = targets.filter(
    (target) => target.disposition === "retain",
  ).length;

  return {
    targetCount: targets.length,
    deletedTargetCount,
    retainedTargetCount,
    blockedTargetCount: blockedTargets.length,
    targets,
    blockedTargets,
  };
}
