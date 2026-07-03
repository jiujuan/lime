import type { AppCleanupPlan, InstalledPluginState } from "../types";
import {
  buildPluginCleanupRehearsalEvidence,
  type PluginCleanupRehearsalEvidenceSummary,
  type PluginCleanupRehearsalStrategy,
} from "./cleanupRehearsalEvidence";
import {
  buildPluginCleanupResidualAudit,
  type PluginCleanupResidualAuditSummary,
} from "./cleanupResidualAudit";

export type PluginLifecycleActionKind =
  | "disable"
  | "enable"
  | "uninstall-rehearsal";
export type PluginLifecycleActionStatus = "ready" | "noop" | "blocked";
export type PluginLifecycleCompletionEffect =
  | "set-disabled"
  | "set-enabled"
  | "rehearsal-only";

interface PluginLifecycleActionBase {
  appId: string;
  appVersion: string;
  packageHash: string;
  manifestHash: string;
  generatedAt: string;
  currentDisabled: boolean;
  status: PluginLifecycleActionStatus;
  action: PluginLifecycleActionKind;
  completionEffect: PluginLifecycleCompletionEffect;
  blockerCodes: string[];
}

export interface PluginLifecycleToggleDescriptor extends PluginLifecycleActionBase {
  action: "disable" | "enable";
  nextDisabled: boolean;
  request: {
    appId: string;
    disabled: boolean;
    updatedAt: string;
  };
}

export interface PluginLifecycleUninstallRehearsalDescriptor extends PluginLifecycleActionBase {
  action: "uninstall-rehearsal";
  mode: PluginCleanupRehearsalStrategy;
  realDeleteAllowed: false;
  request: {
    appId: string;
    mode: PluginCleanupRehearsalStrategy;
  };
  cleanupEvidence: PluginCleanupRehearsalEvidenceSummary;
  residualAudit: PluginCleanupResidualAuditSummary;
}

export type PluginDeleteDataExecutionGateBlockerCode =
  | "CONFIRMATION_MISMATCH"
  | "MODE_NOT_DELETE_DATA"
  | "OUT_OF_SCOPE_TARGETS"
  | "REHEARSAL_BLOCKED";

export type PluginDeleteDataExecutionGate =
  | {
      allowed: true;
      appId: string;
      packageHash: string;
      confirmationPhrase: string;
      pendingDeletionCount: number;
      generatedAt: string;
    }
  | {
      allowed: false;
      appId: string;
      packageHash: string;
      confirmationPhrase: string;
      blockerCodes: PluginDeleteDataExecutionGateBlockerCode[];
      generatedAt: string;
    };

export type PluginLifecycleActionDescriptor =
  | PluginLifecycleToggleDescriptor
  | PluginLifecycleUninstallRehearsalDescriptor;

function baseDescriptor(params: {
  state: InstalledPluginState;
  generatedAt: string;
  status: PluginLifecycleActionStatus;
  action: PluginLifecycleActionKind;
  completionEffect: PluginLifecycleCompletionEffect;
  blockerCodes?: string[];
}): PluginLifecycleActionBase {
  return {
    appId: params.state.appId,
    appVersion: params.state.identity.appVersion,
    packageHash: params.state.identity.packageHash,
    manifestHash: params.state.identity.manifestHash,
    generatedAt: params.generatedAt,
    currentDisabled: params.state.disabled,
    status: params.status,
    action: params.action,
    completionEffect: params.completionEffect,
    blockerCodes: params.blockerCodes ?? [],
  };
}

export function buildPluginLifecycleToggleDescriptor(params: {
  state: InstalledPluginState;
  action: "disable" | "enable";
  generatedAt?: string;
}): PluginLifecycleToggleDescriptor {
  const generatedAt = params.generatedAt ?? new Date().toISOString();
  const nextDisabled = params.action === "disable";
  const status = params.state.disabled === nextDisabled ? "noop" : "ready";

  return {
    ...baseDescriptor({
      state: params.state,
      generatedAt,
      status,
      action: params.action,
      completionEffect: nextDisabled ? "set-disabled" : "set-enabled",
    }),
    action: params.action,
    nextDisabled,
    request: {
      appId: params.state.appId,
      disabled: nextDisabled,
      updatedAt: generatedAt,
    },
  };
}

export function buildPluginLifecycleUninstallRehearsalDescriptor(params: {
  state: InstalledPluginState;
  cleanupPlan: AppCleanupPlan;
  mode: PluginCleanupRehearsalStrategy;
  generatedAt?: string;
}): PluginLifecycleUninstallRehearsalDescriptor {
  const generatedAt = params.generatedAt ?? new Date().toISOString();
  const cleanupEvidence = buildPluginCleanupRehearsalEvidence({
    state: params.state,
    cleanupPlan: params.cleanupPlan,
    strategy: params.mode,
    generatedAt,
  });
  const residualAudit = buildPluginCleanupResidualAudit({
    state: params.state,
    cleanupEvidence,
    generatedAt,
  });
  const blockerCodes = cleanupEvidence.blockedTargets.map(
    (target) => target.blockedReason,
  );

  return {
    ...baseDescriptor({
      state: params.state,
      generatedAt,
      status: blockerCodes.length > 0 ? "blocked" : "ready",
      action: "uninstall-rehearsal",
      completionEffect: "rehearsal-only",
      blockerCodes,
    }),
    action: "uninstall-rehearsal",
    mode: params.mode,
    realDeleteAllowed: false,
    request: {
      appId: params.state.appId,
      mode: params.mode,
    },
    cleanupEvidence,
    residualAudit,
  };
}

export function buildPluginLifecycleActionDescriptor(
  params:
    | {
        state: InstalledPluginState;
        action: "disable" | "enable";
        generatedAt?: string;
      }
    | {
        state: InstalledPluginState;
        action: "uninstall-rehearsal";
        cleanupPlan: AppCleanupPlan;
        mode: PluginCleanupRehearsalStrategy;
        generatedAt?: string;
      },
): PluginLifecycleActionDescriptor {
  if (params.action === "uninstall-rehearsal") {
    return buildPluginLifecycleUninstallRehearsalDescriptor(params);
  }
  return buildPluginLifecycleToggleDescriptor(params);
}

export function buildPluginLifecycleLaunchGate(
  state: InstalledPluginState,
):
  | {
      allowed: true;
      appId: string;
    }
  | {
      allowed: false;
      appId: string;
      reason: "disabled";
    } {
  if (state.disabled) {
    return {
      allowed: false,
      appId: state.appId,
      reason: "disabled",
    };
  }
  return {
    allowed: true,
    appId: state.appId,
  };
}

export function buildPluginDeleteDataConfirmationPhrase(
  descriptor: PluginLifecycleUninstallRehearsalDescriptor,
): string {
  return `DELETE_PLUGIN_DATA ${descriptor.appId} ${descriptor.packageHash}`;
}

export function buildPluginDeleteDataExecutionGate(params: {
  descriptor: PluginLifecycleUninstallRehearsalDescriptor;
  confirmationPhrase: string;
  generatedAt?: string;
}): PluginDeleteDataExecutionGate {
  const { descriptor } = params;
  const expected = buildPluginDeleteDataConfirmationPhrase(descriptor);
  const blockerCodes: PluginDeleteDataExecutionGateBlockerCode[] = [];

  if (descriptor.mode !== "delete-data") {
    blockerCodes.push("MODE_NOT_DELETE_DATA");
  }
  if (descriptor.status !== "ready") {
    blockerCodes.push("REHEARSAL_BLOCKED");
  }
  if (descriptor.cleanupEvidence.blockedTargetCount > 0) {
    blockerCodes.push("OUT_OF_SCOPE_TARGETS");
  }
  if (params.confirmationPhrase !== expected) {
    blockerCodes.push("CONFIRMATION_MISMATCH");
  }

  const generatedAt = params.generatedAt ?? new Date().toISOString();
  if (blockerCodes.length > 0) {
    return {
      allowed: false,
      appId: descriptor.appId,
      packageHash: descriptor.packageHash,
      confirmationPhrase: expected,
      blockerCodes,
      generatedAt,
    };
  }

  return {
    allowed: true,
    appId: descriptor.appId,
    packageHash: descriptor.packageHash,
    confirmationPhrase: expected,
    pendingDeletionCount: descriptor.residualAudit.pendingDeletionCount,
    generatedAt,
  };
}
