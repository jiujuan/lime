import type { InstalledAgentAppState } from "@/features/agent-app/types";
import { buildPluginContractFromAgentAppManifest } from "../manifest/pluginContract";
import { projectPluginRegistry } from "../manifest/pluginRegistry";
import type {
  PluginContract,
  PluginRegistryItem,
  PluginRegistryProjectionInput,
} from "../manifest/types";

export interface PluginContractsFromInstalledAgentAppsProjection {
  contracts: PluginContract[];
  skippedAppIds: string[];
}

export interface PluginRegistryFromInstalledAgentAppsProjection extends PluginContractsFromInstalledAgentAppsProjection {
  projectionInputs: PluginRegistryProjectionInput[];
  registry: PluginRegistryItem[];
}

export function projectPluginContractsFromInstalledAgentApps(
  states: readonly InstalledAgentAppState[],
): PluginContractsFromInstalledAgentAppsProjection {
  const projection = projectPluginRegistryFromInstalledAgentApps(states);

  return {
    contracts: projection.contracts,
    skippedAppIds: projection.skippedAppIds,
  };
}

function projectPluginRegistryInputFromInstalledAgentApp(
  state: InstalledAgentAppState,
): PluginRegistryProjectionInput | null {
  try {
    return {
      contract: buildPluginContractFromAgentAppManifest({
        manifest: state.manifest,
        identity: state.identity,
      }),
      installed: true,
      enabled: state.disabled !== true,
      readinessStatus: state.readiness?.status ?? "unknown",
    };
  } catch {
    return null;
  }
}

export function projectPluginRegistryInputsFromInstalledAgentApps(
  states: readonly InstalledAgentAppState[],
): PluginRegistryProjectionInput[] {
  return states
    .map(projectPluginRegistryInputFromInstalledAgentApp)
    .filter((input): input is PluginRegistryProjectionInput => Boolean(input));
}

export function projectPluginRegistryFromInstalledAgentApps(
  states: readonly InstalledAgentAppState[],
): PluginRegistryFromInstalledAgentAppsProjection {
  const projectionInputs =
    projectPluginRegistryInputsFromInstalledAgentApps(states);
  const contracts = projectionInputs.map((input) => input.contract);
  const projectedSourceIds = new Set(
    contracts.map((contract) => contract.provenance.sourceId),
  );

  return {
    contracts,
    skippedAppIds: states
      .map((state) => state.appId)
      .filter((appId) => !projectedSourceIds.has(appId)),
    projectionInputs,
    registry: projectPluginRegistry(projectionInputs),
  };
}
