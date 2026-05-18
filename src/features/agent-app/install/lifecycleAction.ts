import type { AppCleanupPlan, InstalledAgentAppState } from "../types";
import {
  buildAgentAppCleanupRehearsalEvidence,
  type AgentAppCleanupRehearsalEvidenceSummary,
  type AgentAppCleanupRehearsalStrategy,
} from "./cleanupRehearsalEvidence";
import {
  buildAgentAppCleanupResidualAudit,
  type AgentAppCleanupResidualAuditSummary,
} from "./cleanupResidualAudit";

export type AgentAppLifecycleActionKind = "disable" | "enable" | "uninstall-rehearsal";
export type AgentAppLifecycleActionStatus = "ready" | "noop" | "blocked";
export type AgentAppLifecycleCompletionEffect =
  | "set-disabled"
  | "set-enabled"
  | "rehearsal-only";

interface AgentAppLifecycleActionBase {
  appId: string;
  appVersion: string;
  packageHash: string;
  manifestHash: string;
  generatedAt: string;
  currentDisabled: boolean;
  status: AgentAppLifecycleActionStatus;
  action: AgentAppLifecycleActionKind;
  completionEffect: AgentAppLifecycleCompletionEffect;
  blockerCodes: string[];
}

export interface AgentAppLifecycleToggleDescriptor extends AgentAppLifecycleActionBase {
  action: "disable" | "enable";
  nextDisabled: boolean;
  request: {
    appId: string;
    disabled: boolean;
    updatedAt: string;
  };
}

export interface AgentAppLifecycleUninstallRehearsalDescriptor
  extends AgentAppLifecycleActionBase {
  action: "uninstall-rehearsal";
  mode: AgentAppCleanupRehearsalStrategy;
  realDeleteAllowed: false;
  request: {
    appId: string;
    mode: AgentAppCleanupRehearsalStrategy;
  };
  cleanupEvidence: AgentAppCleanupRehearsalEvidenceSummary;
  residualAudit: AgentAppCleanupResidualAuditSummary;
}

export type AgentAppDeleteDataExecutionGateBlockerCode =
  | "CONFIRMATION_MISMATCH"
  | "MODE_NOT_DELETE_DATA"
  | "OUT_OF_SCOPE_TARGETS"
  | "REHEARSAL_BLOCKED";

export type AgentAppDeleteDataExecutionGate =
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
      blockerCodes: AgentAppDeleteDataExecutionGateBlockerCode[];
      generatedAt: string;
    };

export type AgentAppLifecycleActionDescriptor =
  | AgentAppLifecycleToggleDescriptor
  | AgentAppLifecycleUninstallRehearsalDescriptor;

function baseDescriptor(params: {
  state: InstalledAgentAppState;
  generatedAt: string;
  status: AgentAppLifecycleActionStatus;
  action: AgentAppLifecycleActionKind;
  completionEffect: AgentAppLifecycleCompletionEffect;
  blockerCodes?: string[];
}): AgentAppLifecycleActionBase {
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

export function buildAgentAppLifecycleToggleDescriptor(params: {
  state: InstalledAgentAppState;
  action: "disable" | "enable";
  generatedAt?: string;
}): AgentAppLifecycleToggleDescriptor {
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

export function buildAgentAppLifecycleUninstallRehearsalDescriptor(params: {
  state: InstalledAgentAppState;
  cleanupPlan: AppCleanupPlan;
  mode: AgentAppCleanupRehearsalStrategy;
  generatedAt?: string;
}): AgentAppLifecycleUninstallRehearsalDescriptor {
  const generatedAt = params.generatedAt ?? new Date().toISOString();
  const cleanupEvidence = buildAgentAppCleanupRehearsalEvidence({
    state: params.state,
    cleanupPlan: params.cleanupPlan,
    strategy: params.mode,
    generatedAt,
  });
  const residualAudit = buildAgentAppCleanupResidualAudit({
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

export function buildAgentAppLifecycleActionDescriptor(params:
  | {
      state: InstalledAgentAppState;
      action: "disable" | "enable";
      generatedAt?: string;
    }
  | {
      state: InstalledAgentAppState;
      action: "uninstall-rehearsal";
      cleanupPlan: AppCleanupPlan;
      mode: AgentAppCleanupRehearsalStrategy;
      generatedAt?: string;
    }): AgentAppLifecycleActionDescriptor {
  if (params.action === "uninstall-rehearsal") {
    return buildAgentAppLifecycleUninstallRehearsalDescriptor(params);
  }
  return buildAgentAppLifecycleToggleDescriptor(params);
}

export function buildAgentAppLifecycleLaunchGate(state: InstalledAgentAppState):
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

export function buildAgentAppDeleteDataConfirmationPhrase(
  descriptor: AgentAppLifecycleUninstallRehearsalDescriptor,
): string {
  return `DELETE_AGENT_APP_DATA ${descriptor.appId} ${descriptor.packageHash}`;
}

export function buildAgentAppDeleteDataExecutionGate(params: {
  descriptor: AgentAppLifecycleUninstallRehearsalDescriptor;
  confirmationPhrase: string;
  generatedAt?: string;
}): AgentAppDeleteDataExecutionGate {
  const { descriptor } = params;
  const expected = buildAgentAppDeleteDataConfirmationPhrase(descriptor);
  const blockerCodes: AgentAppDeleteDataExecutionGateBlockerCode[] = [];

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
