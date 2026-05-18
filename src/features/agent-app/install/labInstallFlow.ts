import {
  buildInstalledAgentAppState,
  InMemoryInstalledAgentAppStateStore,
} from "./installedAppState";
import {
  buildAgentAppPackageCacheEntry,
  InMemoryAgentAppPackageCacheRepository,
  type AgentAppPackageCacheEntry,
  type AgentAppPackageCacheSaveResult,
} from "./packageCache";
import {
  evaluateAgentAppEntryRuntimeGuard,
  type AgentAppEntryRuntimeGuardOperation,
  type AgentAppEntryRuntimeGuardResult,
  type AgentAppPermissionDecision,
} from "../runtime/entryRuntimeGuard";
import {
  loadRuntimePackageDescriptor,
  type AgentAppRuntimePackageLoadResult,
} from "../runtime/runtimePackageLoader";
import { listAgentAppCleanupNamespaceGroups } from "./cleanupNamespaceClassifier";
import type {
  AgentAppHostFlags,
  AgentAppProjection,
  AgentAppSetupState,
  AppCleanupPlan,
  InstalledAgentAppState,
  InstalledAppPreview,
  LimeRuntimeProfile,
  ReadinessStatus,
} from "../types";

export type AgentAppLabInstallFlowStage =
  | "source-selected"
  | "package-reviewed"
  | "package-verified"
  | "installed"
  | "setup-review"
  | "permission-review"
  | "launched"
  | "cleanup-preview";

export type AgentAppLabInstallFlowStatus =
  | AgentAppLabInstallFlowStage
  | "package-invalid"
  | "package-mismatch"
  | "needs-setup"
  | "permission-denied"
  | "runtime-blocked"
  | "cleanup-required";

export interface AgentAppLabInstallReview {
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

export interface AgentAppLabUninstallBranchPreview {
  mode: "keep-data" | "delete-data";
  deletedTargetCount: number;
  retainedTargetCount: number;
  warningCodes: string[];
}

export interface AgentAppLabInstallFlowResult {
  status: AgentAppLabInstallFlowStatus;
  completedStages: AgentAppLabInstallFlowStage[];
  review: AgentAppLabInstallReview;
  cacheEntry?: AgentAppPackageCacheEntry;
  cacheSave: AgentAppPackageCacheSaveResult;
  installedState?: InstalledAgentAppState;
  runtimePackageLoad?: AgentAppRuntimePackageLoadResult;
  guard?: AgentAppEntryRuntimeGuardResult;
  cleanupPreview: AppCleanupPlan;
  uninstallPreview: {
    keepData: AgentAppLabUninstallBranchPreview;
    deleteData: AgentAppLabUninstallBranchPreview;
  };
  canLaunch: boolean;
}

export interface EvaluateAgentAppLabInstallFlowParams {
  preview: InstalledAppPreview;
  flags: AgentAppHostFlags;
  entryKey?: string;
  operation?: AgentAppEntryRuntimeGuardOperation;
  permissionDecision?: AgentAppPermissionDecision;
  launchRequested?: boolean;
  setup?: AgentAppSetupState;
  packageCache?: InMemoryAgentAppPackageCacheRepository;
  installedStore?: InMemoryInstalledAgentAppStateStore;
  actualPackageHash?: string;
  actualManifestHash?: string;
  runtimeProfile?: LimeRuntimeProfile;
  now?: string;
}

function cleanupTargetCount(plan: AppCleanupPlan): number {
  return listAgentAppCleanupNamespaceGroups(plan).reduce(
    (count, group) => count + group.targets.length,
    0,
  );
}

function uninstallBranchPreview(plan: AppCleanupPlan): AgentAppLabInstallFlowResult["uninstallPreview"] {
  const groups = listAgentAppCleanupNamespaceGroups(plan);
  const alwaysDeletedCount = groups
    .filter((group) => !group.appData)
    .reduce((count, group) => count + group.targets.length, 0);
  const dataTargetCount = groups
    .filter((group) => group.appData)
    .reduce((count, group) => count + group.targets.length, 0);

  return {
    keepData: {
      mode: "keep-data",
      deletedTargetCount: alwaysDeletedCount,
      retainedTargetCount: dataTargetCount,
      warningCodes: dataTargetCount > 0 ? ["APP_DATA_RETAINED"] : [],
    },
    deleteData: {
      mode: "delete-data",
      deletedTargetCount: alwaysDeletedCount + dataTargetCount,
      retainedTargetCount: 0,
      warningCodes: [],
    },
  };
}

function requiredSetupCount(preview: InstalledAppPreview): number {
  return [...preview.readiness.blockers, ...preview.readiness.warnings].filter(
    (issue) => issue.required === true && issue.kind && issue.key,
  ).length;
}

function requestedPermissionCount(preview: InstalledAppPreview, entryKey?: string): number {
  const entry = entryKey
    ? preview.manifest.entries.find((item) => item.key === entryKey)
    : undefined;
  return preview.manifest.permissions.length + (entry?.permissions.length ?? 0);
}

function buildInstallReview(params: {
  preview: InstalledAppPreview;
  entryKey?: string;
}): AgentAppLabInstallReview {
  return {
    appId: params.preview.identity.appId,
    displayName: params.preview.projection.app.displayName,
    appVersion: params.preview.identity.appVersion,
    sourceKind: params.preview.identity.sourceKind,
    sourceUri: params.preview.identity.sourceUri,
    packageHash: params.preview.identity.packageHash,
    manifestHash: params.preview.identity.manifestHash,
    readinessStatus: params.preview.readiness.status,
    requiredSetupCount: requiredSetupCount(params.preview),
    requestedPermissionCount: requestedPermissionCount(
      params.preview,
      params.entryKey,
    ),
    cleanupTargetCount: cleanupTargetCount(params.preview.cleanupPlan),
  };
}

function defaultEntryKey(preview: InstalledAppPreview): string {
  return preview.projection.entries[0]?.key ?? "unknown";
}

function statusFromGuard(
  guard: AgentAppEntryRuntimeGuardResult,
): AgentAppLabInstallFlowStatus {
  if (guard.status === "needs-setup") {
    return "needs-setup";
  }
  if (guard.status === "denied") {
    return "permission-denied";
  }
  if (guard.status === "blocked") {
    const hasPackageMismatch = guard.blockers.some((issue) =>
      issue.code.includes("PACKAGE_HASH"),
    );
    return hasPackageMismatch ? "package-mismatch" : "runtime-blocked";
  }
  return "permission-review";
}

function putTrue(record: Record<string, boolean>, key: string): void {
  record[key] = true;
}

export function buildAgentAppLabResolvedSetupState(
  projection: AgentAppProjection,
): AgentAppSetupState {
  const setup: AgentAppSetupState = {
    knowledgeBindings: {},
    skills: {},
    tools: {},
    artifactTypes: {},
    evals: {},
    secrets: {},
    overlays: {},
    services: {},
    workflows: {},
  };

  projection.knowledgeBindings
    .filter((item) => item.required)
    .forEach((item) => putTrue(setup.knowledgeBindings ?? {}, item.key));
  projection.skillRequirements
    .filter((item) => item.required)
    .forEach((item) => putTrue(setup.skills ?? {}, item.id));
  projection.toolRequirements
    .filter((item) => item.required)
    .forEach((item) => putTrue(setup.tools ?? {}, item.key));
  projection.artifactTypes
    .filter((item) => item.required)
    .forEach((item) => putTrue(setup.artifactTypes ?? {}, item.key));
  projection.evals
    .filter((item) => item.required)
    .forEach((item) => putTrue(setup.evals ?? {}, item.key));
  projection.secrets
    .filter((item) => item.required)
    .forEach((item) => putTrue(setup.secrets ?? {}, item.key));
  projection.overlayTemplates
    .filter((item) => item.required)
    .forEach((item) => putTrue(setup.overlays ?? {}, item.key));
  projection.services
    .filter((item) => item.required)
    .forEach((item) => putTrue(setup.services ?? {}, item.key));
  projection.workflows
    .filter((item) => item.required)
    .forEach((item) => putTrue(setup.workflows ?? {}, item.key));

  return setup;
}

export function evaluateAgentAppLabInstallFlow(
  params: EvaluateAgentAppLabInstallFlowParams,
): AgentAppLabInstallFlowResult {
  const entryKey = params.entryKey ?? defaultEntryKey(params.preview);
  const now = params.now ?? new Date().toISOString();
  const review = buildInstallReview({ preview: params.preview, entryKey });
  const uninstallPreview = uninstallBranchPreview(params.preview.cleanupPlan);
  const completedStages: AgentAppLabInstallFlowStage[] = [
    "source-selected",
    "package-reviewed",
  ];
  const packageCache =
    params.packageCache ?? new InMemoryAgentAppPackageCacheRepository();
  const installedStore =
    params.installedStore ?? new InMemoryInstalledAgentAppStateStore();
  const cacheEntry = buildAgentAppPackageCacheEntry({
    identity: params.preview.identity,
    manifestSnapshot: params.preview.manifest,
    actualPackageHash: params.actualPackageHash ?? params.preview.identity.packageHash,
    actualManifestHash: params.actualManifestHash ?? params.preview.identity.manifestHash,
    cachedAt: now,
  });
  const cacheSave = packageCache.saveVerified(cacheEntry);

  if (cacheSave.status !== "cached" || !cacheSave.entry) {
    return {
      status:
        cacheSave.verification.status === "missing"
          ? "package-invalid"
          : "package-mismatch",
      completedStages,
      review,
      cacheEntry,
      cacheSave,
      cleanupPreview: params.preview.cleanupPlan,
      uninstallPreview,
      canLaunch: false,
    };
  }
  completedStages.push("package-verified");

  const installedState = installedStore.upsert(
    buildInstalledAgentAppState({
      preview: params.preview,
      setup: params.setup,
      installedAt: now,
      updatedAt: now,
    }),
  );
  completedStages.push("installed", "setup-review");

  const runtimePackageLoad = loadRuntimePackageDescriptor({
    cacheEntry: cacheSave.entry,
    identity: params.preview.identity,
    projection: params.preview.projection,
  });
  const guard = evaluateAgentAppEntryRuntimeGuard({
    preview: params.preview,
    entryKey,
    flags: params.flags,
    operation: params.operation ?? "run-entry",
    runtimePackageLoad,
    permissionDecision: params.permissionDecision ?? "requires-review",
    installMode: params.preview.projection.install.preferredMode,
    runtimeProfile: params.runtimeProfile,
  });
  const guardStatus = statusFromGuard(guard);
  if (guardStatus !== "permission-review") {
    return {
      status: guardStatus,
      completedStages,
      review,
      cacheEntry: cacheSave.entry,
      cacheSave,
      installedState,
      runtimePackageLoad,
      guard,
      cleanupPreview: params.preview.cleanupPlan,
      uninstallPreview,
      canLaunch: false,
    };
  }

  completedStages.push("permission-review");
  const permissionAccepted = guard.prompt?.decision === "accepted";
  if (!permissionAccepted) {
    return {
      status: "permission-review",
      completedStages,
      review,
      cacheEntry: cacheSave.entry,
      cacheSave,
      installedState,
      runtimePackageLoad,
      guard,
      cleanupPreview: params.preview.cleanupPlan,
      uninstallPreview,
      canLaunch: false,
    };
  }

  if (params.launchRequested) {
    completedStages.push("launched", "cleanup-preview");
    return {
      status: "launched",
      completedStages,
      review,
      cacheEntry: cacheSave.entry,
      cacheSave,
      installedState,
      runtimePackageLoad,
      guard,
      cleanupPreview: params.preview.cleanupPlan,
      uninstallPreview,
      canLaunch: true,
    };
  }

  return {
    status: "permission-review",
    completedStages,
    review,
    cacheEntry: cacheSave.entry,
    cacheSave,
    installedState,
    runtimePackageLoad,
    guard,
    cleanupPreview: params.preview.cleanupPlan,
    uninstallPreview,
    canLaunch: true,
  };
}
