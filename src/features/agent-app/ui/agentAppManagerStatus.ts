import type { AgentAppEntryRuntimeGuardResult } from "../runtime/entryRuntimeGuard";
import type { AgentAppCleanupRehearsalEvidenceSummary } from "../install/cleanupRehearsalEvidence";
import type { AgentAppCleanupResidualAuditSummary } from "../install/cleanupResidualAudit";
import type { InstalledAgentAppState } from "../types";

export type AgentAppManagerLifecycleStatus =
  | "discovered"
  | "setup-required"
  | "launchable"
  | "disabled"
  | "blocked";

export type AgentAppManagerEvidenceAction =
  | "launch"
  | "enable"
  | "disable"
  | "uninstall-keep-data"
  | "uninstall-delete-data";

export interface AgentAppManagerEvidenceSummary {
  action: AgentAppManagerEvidenceAction;
  appId: string;
  appVersion: string;
  packageHash: string;
  manifestHash: string;
  generatedAt: string;
  entryKey?: string;
  guardStatus?: AgentAppEntryRuntimeGuardResult["status"];
  deletedTargetCount: number;
  retainedTargetCount: number;
  cleanupEvidence?: AgentAppCleanupRehearsalEvidenceSummary;
  residualAudit?: AgentAppCleanupResidualAuditSummary;
}

export function getAgentAppManagerStatus(params: {
  installedState?: InstalledAgentAppState;
  canLaunch: boolean;
  disabled: boolean;
}): AgentAppManagerLifecycleStatus {
  if (!params.installedState) {
    return "discovered";
  }
  if (params.disabled || params.installedState.disabled) {
    return "disabled";
  }
  if (params.canLaunch) {
    return "launchable";
  }
  if (params.installedState.readiness.status === "needs-setup") {
    return "setup-required";
  }
  return "blocked";
}
