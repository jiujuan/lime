import type { InstalledAgentAppState } from "@/features/agent-app/types";
import type {
  PluginActivationContext,
  PluginContract,
  PluginRegistryItem,
} from "@/features/plugin";
import { projectPluginRegistryFromInstalledAgentApps } from "@/features/plugin";
import { extractWorkspacePluginActivationFromRequestMetadata } from "./workspacePluginActivation";

export type WorkspacePluginRuntimeContextStatus =
  | "inactive"
  | "active"
  | "blocked";

export interface WorkspacePluginRuntimeContext {
  status: WorkspacePluginRuntimeContextStatus;
  activationContext: PluginActivationContext | null;
  contracts: PluginContract[];
  registry: PluginRegistryItem[];
  skippedAppIds: string[];
  blockerCodes: string[];
}

export interface BuildWorkspacePluginRuntimeContextParams {
  requestMetadata?: Record<string, unknown>;
  installedAgentApps: readonly InstalledAgentAppState[];
}

export function buildWorkspacePluginRuntimeContext({
  requestMetadata,
  installedAgentApps,
}: BuildWorkspacePluginRuntimeContextParams): WorkspacePluginRuntimeContext {
  const projection =
    projectPluginRegistryFromInstalledAgentApps(installedAgentApps);
  const activation =
    extractWorkspacePluginActivationFromRequestMetadata(requestMetadata);
  if (!activation) {
    return {
      status: "inactive",
      activationContext: null,
      contracts: projection.contracts,
      registry: projection.registry,
      skippedAppIds: projection.skippedAppIds,
      blockerCodes: [],
    };
  }

  const registryItem = projection.registry.find(
    (item) => item.pluginId === activation.context.pluginId,
  );
  const blockerCodes =
    registryItem && registryItem.activationState !== "activatable"
      ? registryItem.blockerCodes.length > 0
        ? registryItem.blockerCodes
        : ["PLUGIN_ACTIVATION_BLOCKED"]
      : registryItem
        ? []
        : ["PLUGIN_REGISTRY_ITEM_MISSING"];

  return {
    status: blockerCodes.length > 0 ? "blocked" : "active",
    activationContext: activation.context,
    contracts: projection.contracts,
    registry: projection.registry,
    skippedAppIds: projection.skippedAppIds,
    blockerCodes,
  };
}
