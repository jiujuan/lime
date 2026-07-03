import type { InstalledPluginState } from "@/features/plugin/types";
import type {
  PluginActivationContext,
  PluginContract,
  PluginRegistryItem,
} from "@/features/plugin";
import { projectPluginRegistryFromInstalledPlugins } from "@/features/plugin";
import { extractWorkspacePluginActivationFromRequestMetadata } from "./workspacePluginActivation";
import {
  buildWorkspacePluginRuntimeReadiness,
  extractWorkspacePluginRuntimeReadinessFromRequestMetadata,
  type WorkspacePluginRuntimeReadiness,
} from "./workspacePluginRuntimeReadiness";

export type WorkspacePluginRuntimeContextStatus =
  | "inactive"
  | "active"
  | "blocked";

export interface WorkspacePluginRuntimeContext {
  status: WorkspacePluginRuntimeContextStatus;
  activationContext: PluginActivationContext | null;
  runtimeReadiness: WorkspacePluginRuntimeReadiness | null;
  contracts: PluginContract[];
  registry: PluginRegistryItem[];
  skippedAppIds: string[];
  blockerCodes: string[];
}

export interface BuildWorkspacePluginRuntimeContextParams {
  requestMetadata?: Record<string, unknown>;
  installedPlugins: readonly InstalledPluginState[];
}

export function buildWorkspacePluginRuntimeContext({
  requestMetadata,
  installedPlugins,
}: BuildWorkspacePluginRuntimeContextParams): WorkspacePluginRuntimeContext {
  const projection =
    projectPluginRegistryFromInstalledPlugins(installedPlugins);
  const activation =
    extractWorkspacePluginActivationFromRequestMetadata(requestMetadata);
  const restoredRuntimeReadiness =
    extractWorkspacePluginRuntimeReadinessFromRequestMetadata(requestMetadata);
  if (!activation) {
    return {
      status: "inactive",
      activationContext: null,
      runtimeReadiness: restoredRuntimeReadiness,
      contracts: projection.contracts,
      registry: projection.registry,
      skippedAppIds: projection.skippedAppIds,
      blockerCodes: [],
    };
  }

  const registryItem = projection.registry.find(
    (item) => item.pluginId === activation.context.pluginId,
  );
  const contract = projection.contracts.find(
    (item) => item.id === activation.context.pluginId,
  );
  const installedPlugin = installedPlugins.find(
    (item) =>
      item.appId ===
      (activation.context.activePluginUiId ?? activation.context.pluginId),
  );
  const runtimeReadiness =
    contract && registryItem
      ? buildWorkspacePluginRuntimeReadiness({
          contract,
          installedPlugin,
          activePluginUiId: activation.context.activePluginUiId,
          workflowKey: activation.context.workflowKey,
          taskKind: activation.context.taskKind,
        })
      : restoredRuntimeReadiness;
  const blockerCodes =
    registryItem && registryItem.activationState !== "activatable"
      ? registryItem.blockerCodes.length > 0
        ? registryItem.blockerCodes
        : ["PLUGIN_ACTIVATION_BLOCKED"]
      : registryItem
        ? runtimeReadiness?.status === "blocked"
          ? runtimeReadiness.blockerCodes
          : []
        : ["PLUGIN_REGISTRY_ITEM_MISSING"];

  return {
    status: blockerCodes.length > 0 ? "blocked" : "active",
    activationContext: activation.context,
    runtimeReadiness,
    contracts: projection.contracts,
    registry: projection.registry,
    skippedAppIds: projection.skippedAppIds,
    blockerCodes,
  };
}
