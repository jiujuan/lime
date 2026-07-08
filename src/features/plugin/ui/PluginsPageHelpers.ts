import {
  PLUGINS_CHANGED_EVENT,
  type PluginUninstallRehearsalResult,
} from "@/lib/api/plugins";
import { buildCleanupPlan } from "../install/cleanupPlan";
import type { PluginLifecycleUninstallRehearsalDescriptor } from "../install/lifecycleAction";
import { buildAppCenterRuntimeCapabilityProfile } from "../runtime/appCenterRuntimeProfile";
import type {
  HostCapabilityProfile,
  InstalledAppPreview,
  InstalledPluginState,
} from "../types";
import type { PluginsPageParams } from "@/types/page";
import type { AppCenterStatusFilter } from "./PluginsPageViewModel";

export function buildProfile(): HostCapabilityProfile {
  return buildAppCenterRuntimeCapabilityProfile();
}

export function normalizeStatusFilter(
  statusFilter: PluginsPageParams["statusFilter"] | undefined,
): AppCenterStatusFilter {
  if (
    statusFilter === "all" ||
    statusFilter === "installed" ||
    statusFilter === "installable" ||
    statusFilter === "attention"
  ) {
    return statusFilter;
  }
  if (statusFilter === "activatable") {
    return "attention";
  }
  return "all";
}

export function isDeleteDataExecutionBlocked(params: {
  descriptor: PluginLifecycleUninstallRehearsalDescriptor | null;
  preview: PluginUninstallRehearsalResult | null;
}): boolean {
  return (
    params.descriptor?.mode === "delete-data" &&
    (params.descriptor.realDeleteAllowed === false ||
      params.preview?.warnings.includes("DRY_RUN_ONLY") === true)
  );
}

export function buildPreviewFromInstalledState(
  state: InstalledPluginState,
): InstalledAppPreview {
  return {
    identity: state.identity,
    manifest: state.manifest,
    projection: state.projection,
    readiness: state.readiness,
    cleanupPlan: buildCleanupPlan({
      projection: state.projection,
      generatedAt: state.updatedAt,
    }),
  };
}

export function dispatchPluginsChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PLUGINS_CHANGED_EVENT));
  }
}
