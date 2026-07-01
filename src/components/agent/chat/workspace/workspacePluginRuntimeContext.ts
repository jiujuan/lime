import type { InstalledAgentAppState } from "@/features/agent-app/types";
import type {
  PluginActivationContext,
  PluginContract,
  PluginRegistryItem,
} from "@/features/plugin";
import { projectPluginRegistryFromInstalledAgentApps } from "@/features/plugin";
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
  const installedAgentApp = installedAgentApps.find(
    (item) =>
      item.appId ===
      (activation.context.activeAgentAppId ?? activation.context.pluginId),
  );
  const runtimeReadiness =
    contract && registryItem
      ? buildWorkspacePluginRuntimeReadiness({
          contract,
          installedAgentApp,
          activeAgentAppId: activation.context.activeAgentAppId,
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
