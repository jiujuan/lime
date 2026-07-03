import type {
  InstalledPluginState,
  NormalizedAppManifest,
} from "@/features/plugin/types";
import { normalizeManifest } from "@/features/plugin/manifest/normalizeManifest";
import { parseManifest } from "@/features/plugin/manifest/parseManifest";
import { buildPluginContractFromPluginManifest } from "../manifest/pluginContract";
import { projectPluginRegistry } from "../manifest/pluginRegistry";
import type {
  PluginContract,
  PluginRegistryItem,
  PluginRegistryProjectionInput,
} from "../manifest/types";

export interface PluginContractsFromInstalledPluginsProjection {
  contracts: PluginContract[];
  skippedAppIds: string[];
}

export interface PluginRegistryFromInstalledPluginsProjection extends PluginContractsFromInstalledPluginsProjection {
  projectionInputs: PluginRegistryProjectionInput[];
  registry: PluginRegistryItem[];
}

export function projectPluginContractsFromInstalledPlugins(
  states: readonly InstalledPluginState[],
): PluginContractsFromInstalledPluginsProjection {
  const projection = projectPluginRegistryFromInstalledPlugins(states);

  return {
    contracts: projection.contracts,
    skippedAppIds: projection.skippedAppIds,
  };
}

function projectPluginRegistryInputFromInstalledPlugin(
  state: InstalledPluginState,
): PluginRegistryProjectionInput | null {
  try {
    const manifest = normalizeInstalledPluginManifest(state.manifest);
    return {
      contract: buildPluginContractFromPluginManifest({
        manifest,
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

function normalizeInstalledPluginManifest(
  manifest: InstalledPluginState["manifest"],
): NormalizedAppManifest {
  if (
    "appId" in manifest &&
    typeof manifest.appId === "string" &&
    !("name" in manifest)
  ) {
    return manifest as NormalizedAppManifest;
  }
  return normalizeManifest(parseManifest(manifest));
}

export function projectPluginRegistryInputsFromInstalledPlugins(
  states: readonly InstalledPluginState[],
): PluginRegistryProjectionInput[] {
  return states
    .map(projectPluginRegistryInputFromInstalledPlugin)
    .filter((input): input is PluginRegistryProjectionInput => Boolean(input));
}

export function projectPluginRegistryFromInstalledPlugins(
  states: readonly InstalledPluginState[],
): PluginRegistryFromInstalledPluginsProjection {
  const projectionInputs =
    projectPluginRegistryInputsFromInstalledPlugins(states);
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
