import type { PluginEntryRuntimeGuardResult } from "../runtime/entryRuntimeGuard";
import type { PluginCleanupRehearsalEvidenceSummary } from "../install/cleanupRehearsalEvidence";
import type { PluginCleanupResidualAuditSummary } from "../install/cleanupResidualAudit";
import type { InstalledPluginState } from "../types";

export type PluginManagerLifecycleStatus =
  | "discovered"
  | "setup-required"
  | "launchable"
  | "disabled"
  | "blocked";

export type PluginManagerEvidenceAction =
  | "launch"
  | "enable"
  | "disable"
  | "uninstall-keep-data"
  | "uninstall-delete-data";

export interface PluginManagerEvidenceSummary {
  action: PluginManagerEvidenceAction;
  appId: string;
  appVersion: string;
  packageHash: string;
  manifestHash: string;
  generatedAt: string;
  entryKey?: string;
  guardStatus?: PluginEntryRuntimeGuardResult["status"];
  deletedTargetCount: number;
  retainedTargetCount: number;
  cleanupEvidence?: PluginCleanupRehearsalEvidenceSummary;
  residualAudit?: PluginCleanupResidualAuditSummary;
}

export function getPluginManagerStatus(params: {
  installedState?: InstalledPluginState;
  canLaunch: boolean;
  disabled: boolean;
}): PluginManagerLifecycleStatus {
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
