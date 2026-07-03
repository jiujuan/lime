import type { PluginCleanupResidualTargetSummary } from "./cleanupResidualAudit";
import type {
  PluginDeleteDataExecutionGate,
  PluginLifecycleUninstallRehearsalDescriptor,
} from "./lifecycleAction";

const DEFAULT_PLUGIN_DATA_ROOT = "<LimeAppData>/plugins";

export interface PluginDeleteDataFileSystemPort {
  removePath(path: string): Promise<void>;
  pathExists(path: string): Promise<boolean>;
}

export type PluginDeleteDataExecutionBlockerCode =
  | "PLUGIN_DATA_ROOT_MISSING"
  | "DELETE_DATA_GATE_BLOCKED"
  | "GATE_DESCRIPTOR_MISMATCH"
  | "MODE_NOT_DELETE_DATA"
  | "POST_DELETE_RESIDUAL_AUDIT_FAILED"
  | "POST_DELETE_RESIDUAL_PRESENT"
  | "REHEARSAL_NOT_READY"
  | "RESIDUAL_AUDIT_HAS_BLOCKED_TARGETS"
  | "TARGET_OUTSIDE_PLUGIN_DATA_ROOT"
  | "TARGET_OUTSIDE_APP_NAMESPACE"
  | "TARGET_PATH_EMPTY"
  | "TARGET_PATH_TRAVERSAL";

export interface PluginDeleteDataExecutionBlocker {
  code: PluginDeleteDataExecutionBlockerCode;
  message: string;
  details?: unknown;
}

export type PluginDeleteDataTargetStatus = "deleted" | "retained" | "blocked";
export type PluginDeleteDataRetainedReason = "REFERENCE_ONLY";

export interface PluginDeleteDataTargetEvidence extends PluginCleanupResidualTargetSummary {
  status: PluginDeleteDataTargetStatus;
  retainedReason?: PluginDeleteDataRetainedReason;
  blockerCodes?: PluginDeleteDataExecutionBlockerCode[];
}

export interface PluginDeleteDataExecutionFailure {
  code:
    | "TARGET_DELETE_FAILED"
    | "POST_DELETE_RESIDUAL_PRESENT"
    | "POST_DELETE_RESIDUAL_AUDIT_FAILED";
  message: string;
  target: PluginDeleteDataTargetEvidence;
  details?: unknown;
}

export type PluginDeleteDataPostDeleteResidualAuditStatus =
  | "clear"
  | "residual_present"
  | "failed";

export interface PluginDeleteDataPostDeleteResidualAudit {
  status: PluginDeleteDataPostDeleteResidualAuditStatus;
  checkedAt: string;
  checkedTargetCount: number;
  remainingTargetCount: number;
  remainingTargets: PluginDeleteDataTargetEvidence[];
  failedTarget?: PluginDeleteDataTargetEvidence;
}

export interface PluginDeleteDataExecutionInput {
  descriptor: PluginLifecycleUninstallRehearsalDescriptor;
  gate: PluginDeleteDataExecutionGate;
  fileSystem: PluginDeleteDataFileSystemPort;
  pluginDataRoot?: string;
  generatedAt?: string;
}

interface PluginDeleteDataExecutionBase {
  schemaVersion: 1;
  appId: string;
  packageHash: string;
  dataRoot?: string;
  generatedAt: string;
  deletedTargets: PluginDeleteDataTargetEvidence[];
  retainedTargets: PluginDeleteDataTargetEvidence[];
  blockedTargets: PluginDeleteDataTargetEvidence[];
  postDeleteResidualAudit?: PluginDeleteDataPostDeleteResidualAudit;
}

export type PluginDeleteDataExecutionResult =
  | (PluginDeleteDataExecutionBase & {
      status: "deleted";
      blockers: [];
      failure?: never;
    })
  | (PluginDeleteDataExecutionBase & {
      status: "blocked";
      blockers: PluginDeleteDataExecutionBlocker[];
      failure?: never;
    })
  | (PluginDeleteDataExecutionBase & {
      status: "failed";
      blockers: [];
      failure: PluginDeleteDataExecutionFailure;
    });

function normalizeBoundaryPath(value: string): string {
  const normalized = value.trim().replace(/\\/g, "/").replace(/\/+/g, "/");
  if (normalized.length > 1 && normalized.endsWith("/")) {
    return normalized.slice(0, -1);
  }
  return normalized;
}

function hasTraversal(path: string): boolean {
  return normalizeBoundaryPath(path).split("/").includes("..");
}

function isInsideRoot(path: string, root: string): boolean {
  const normalizedPath = normalizeBoundaryPath(path);
  const normalizedRoot = normalizeBoundaryPath(root);
  return (
    normalizedPath === normalizedRoot ||
    normalizedPath.startsWith(`${normalizedRoot}/`)
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function residualAuditTarget(
  target: PluginDeleteDataTargetEvidence,
  status: PluginDeleteDataTargetStatus,
  extra: Partial<PluginDeleteDataTargetEvidence> = {},
): PluginDeleteDataTargetEvidence {
  return {
    ...target,
    status,
    ...extra,
  };
}

function targetEvidence(
  target: PluginCleanupResidualTargetSummary,
  status: PluginDeleteDataTargetStatus,
  extra: Partial<PluginDeleteDataTargetEvidence> = {},
): PluginDeleteDataTargetEvidence {
  return {
    category: target.category,
    kind: target.kind,
    value: normalizeBoundaryPath(target.value),
    reason: target.reason,
    status,
    ...extra,
  };
}

function buildBaseBlockers(params: {
  descriptor: PluginLifecycleUninstallRehearsalDescriptor;
  gate: PluginDeleteDataExecutionGate;
  dataRoot?: string;
}): PluginDeleteDataExecutionBlocker[] {
  const blockers: PluginDeleteDataExecutionBlocker[] = [];
  const { descriptor, gate } = params;

  if (!params.dataRoot) {
    blockers.push({
      code: "PLUGIN_DATA_ROOT_MISSING",
      message: "Delete-data executor requires a non-empty Plugin data root.",
    });
  }
  if (params.dataRoot && hasTraversal(params.dataRoot)) {
    blockers.push({
      code: "TARGET_PATH_TRAVERSAL",
      message: "Plugin data root must not contain parent traversal.",
      details: { path: params.dataRoot },
    });
  }
  if (!gate.allowed) {
    blockers.push({
      code: "DELETE_DATA_GATE_BLOCKED",
      message: "Delete-data executor requires an allowed confirmation gate.",
      details: { gateBlockerCodes: gate.blockerCodes },
    });
  }
  if (
    gate.appId !== descriptor.appId ||
    gate.packageHash !== descriptor.packageHash ||
    (gate.allowed &&
      gate.pendingDeletionCount !==
        descriptor.residualAudit.pendingDeletionCount)
  ) {
    blockers.push({
      code: "GATE_DESCRIPTOR_MISMATCH",
      message: "Delete-data gate must match the rehearsal descriptor.",
      details: {
        gateAppId: gate.appId,
        descriptorAppId: descriptor.appId,
        gatePackageHash: gate.packageHash,
        descriptorPackageHash: descriptor.packageHash,
      },
    });
  }
  if (descriptor.mode !== "delete-data") {
    blockers.push({
      code: "MODE_NOT_DELETE_DATA",
      message: "Delete-data executor only accepts delete-data rehearsal mode.",
    });
  }
  if (descriptor.status !== "ready") {
    blockers.push({
      code: "REHEARSAL_NOT_READY",
      message: "Delete-data executor requires a ready uninstall rehearsal.",
      details: {
        status: descriptor.status,
        blockerCodes: descriptor.blockerCodes,
      },
    });
  }
  if (
    descriptor.cleanupEvidence.blockedTargetCount > 0 ||
    descriptor.residualAudit.blockedOutOfScopeCount > 0
  ) {
    blockers.push({
      code: "RESIDUAL_AUDIT_HAS_BLOCKED_TARGETS",
      message:
        "Delete-data executor refuses to run while residual audit has blocked targets.",
      details: {
        cleanupBlockedTargetCount:
          descriptor.cleanupEvidence.blockedTargetCount,
        blockedOutOfScopeCount: descriptor.residualAudit.blockedOutOfScopeCount,
      },
    });
  }

  return blockers;
}

function targetNamespaceMatchesDescriptor(params: {
  target: PluginCleanupResidualTargetSummary;
  descriptor: PluginLifecycleUninstallRehearsalDescriptor;
}): boolean {
  const { target, descriptor } = params;
  const allowedIdentifiers = [
    descriptor.appId,
    descriptor.packageHash,
    descriptor.manifestHash,
  ].filter(Boolean);

  return allowedIdentifiers.some((identifier) =>
    target.value.includes(identifier),
  );
}

function buildTargetBlockers(params: {
  target: PluginCleanupResidualTargetSummary;
  descriptor: PluginLifecycleUninstallRehearsalDescriptor;
  dataRoot?: string;
}): PluginDeleteDataExecutionBlocker[] {
  const blockers: PluginDeleteDataExecutionBlocker[] = [];
  const { target, descriptor, dataRoot } = params;
  const value = normalizeBoundaryPath(target.value);

  if (!value) {
    blockers.push({
      code: "TARGET_PATH_EMPTY",
      message: "Delete-data target path must not be empty.",
      details: { category: target.category, kind: target.kind },
    });
  }
  if (value && hasTraversal(value)) {
    blockers.push({
      code: "TARGET_PATH_TRAVERSAL",
      message: "Delete-data target path must not contain parent traversal.",
      details: { value, category: target.category, kind: target.kind },
    });
  }
  if (value && dataRoot && !isInsideRoot(value, dataRoot)) {
    blockers.push({
      code: "TARGET_OUTSIDE_PLUGIN_DATA_ROOT",
      message: "Delete-data target must stay inside Plugin data root.",
      details: { value, dataRoot },
    });
  }
  if (
    value &&
    !targetNamespaceMatchesDescriptor({
      target,
      descriptor,
    })
  ) {
    blockers.push({
      code: "TARGET_OUTSIDE_APP_NAMESPACE",
      message:
        "Delete-data target must belong to the selected Plugin namespace.",
      details: {
        value,
        appId: descriptor.appId,
        packageHash: descriptor.packageHash,
      },
    });
  }

  return blockers;
}

function splitTargets(params: {
  descriptor: PluginLifecycleUninstallRehearsalDescriptor;
  dataRoot?: string;
}): {
  deleteCandidates: PluginDeleteDataTargetEvidence[];
  retainedTargets: PluginDeleteDataTargetEvidence[];
  blockedTargets: PluginDeleteDataTargetEvidence[];
  blockers: PluginDeleteDataExecutionBlocker[];
} {
  const deleteCandidates: PluginDeleteDataTargetEvidence[] = [];
  const retainedTargets: PluginDeleteDataTargetEvidence[] = [];
  const blockedTargets: PluginDeleteDataTargetEvidence[] = [];
  const blockers: PluginDeleteDataExecutionBlocker[] = [];

  params.descriptor.residualAudit.pendingDeletionTargets.forEach((target) => {
    if (target.kind === "ref") {
      retainedTargets.push(
        targetEvidence(target, "retained", {
          retainedReason: "REFERENCE_ONLY",
        }),
      );
      return;
    }

    const targetBlockers = buildTargetBlockers({
      target,
      descriptor: params.descriptor,
      dataRoot: params.dataRoot,
    });
    if (targetBlockers.length > 0) {
      blockers.push(...targetBlockers);
      blockedTargets.push(
        targetEvidence(target, "blocked", {
          blockerCodes: targetBlockers.map((blocker) => blocker.code),
        }),
      );
      return;
    }

    deleteCandidates.push(targetEvidence(target, "deleted"));
  });

  return { deleteCandidates, retainedTargets, blockedTargets, blockers };
}

export async function executePluginDeleteData(
  input: PluginDeleteDataExecutionInput,
): Promise<PluginDeleteDataExecutionResult> {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const dataRoot = normalizeBoundaryPath(
    input.pluginDataRoot ?? DEFAULT_PLUGIN_DATA_ROOT,
  );
  const base = {
    schemaVersion: 1 as const,
    appId: input.descriptor.appId,
    packageHash: input.descriptor.packageHash,
    dataRoot: dataRoot || undefined,
    generatedAt,
  };

  const split = splitTargets({ descriptor: input.descriptor, dataRoot });
  const blockers = [
    ...buildBaseBlockers({
      descriptor: input.descriptor,
      gate: input.gate,
      dataRoot,
    }),
    ...split.blockers,
  ];

  if (blockers.length > 0) {
    return {
      ...base,
      status: "blocked",
      deletedTargets: [],
      retainedTargets: split.retainedTargets,
      blockedTargets: split.blockedTargets,
      blockers,
    };
  }

  const deletedTargets: PluginDeleteDataTargetEvidence[] = [];
  for (const target of split.deleteCandidates) {
    try {
      await input.fileSystem.removePath(target.value);
      deletedTargets.push(target);
    } catch (error) {
      return {
        ...base,
        status: "failed",
        deletedTargets,
        retainedTargets: split.retainedTargets,
        blockedTargets: [],
        blockers: [],
        failure: {
          code: "TARGET_DELETE_FAILED",
          message: "Delete-data executor failed to remove a target.",
          target,
          details: { error: errorMessage(error) },
        },
      };
    }
  }

  const remainingTargets: PluginDeleteDataTargetEvidence[] = [];
  for (const target of deletedTargets) {
    try {
      if (await input.fileSystem.pathExists(target.value)) {
        remainingTargets.push(
          residualAuditTarget(target, "blocked", {
            blockerCodes: ["POST_DELETE_RESIDUAL_PRESENT"],
          }),
        );
      }
    } catch (error) {
      const failedTarget = residualAuditTarget(target, "blocked", {
        blockerCodes: ["POST_DELETE_RESIDUAL_AUDIT_FAILED"],
      });
      return {
        ...base,
        status: "failed",
        deletedTargets,
        retainedTargets: split.retainedTargets,
        blockedTargets: [],
        blockers: [],
        postDeleteResidualAudit: {
          status: "failed",
          checkedAt: generatedAt,
          checkedTargetCount: deletedTargets.length,
          remainingTargetCount: remainingTargets.length,
          remainingTargets,
          failedTarget,
        },
        failure: {
          code: "POST_DELETE_RESIDUAL_AUDIT_FAILED",
          message: "Delete-data executor failed to audit residual targets.",
          target: failedTarget,
          details: { error: errorMessage(error) },
        },
      };
    }
  }

  const postDeleteResidualAudit: PluginDeleteDataPostDeleteResidualAudit = {
    status: remainingTargets.length > 0 ? "residual_present" : "clear",
    checkedAt: generatedAt,
    checkedTargetCount: deletedTargets.length,
    remainingTargetCount: remainingTargets.length,
    remainingTargets,
  };

  if (remainingTargets.length > 0) {
    return {
      ...base,
      status: "failed",
      deletedTargets,
      retainedTargets: split.retainedTargets,
      blockedTargets: [],
      blockers: [],
      postDeleteResidualAudit,
      failure: {
        code: "POST_DELETE_RESIDUAL_PRESENT",
        message: "Delete-data executor found residual targets after deletion.",
        target: remainingTargets[0],
      },
    };
  }

  return {
    ...base,
    status: "deleted",
    deletedTargets,
    retainedTargets: split.retainedTargets,
    blockedTargets: [],
    blockers: [],
    postDeleteResidualAudit,
  };
}
