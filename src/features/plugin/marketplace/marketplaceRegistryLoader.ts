import { listInstalledAgentApps } from "@/lib/api/agentApps";
import { getClientPluginMarketplace } from "@/lib/api/oemCloudControlPlane";
import type { InstalledAgentAppState } from "@/features/agent-app/types";
import type { InstalledAgentAppStateListResult } from "@/features/agent-app/install/installedAppState";
import type {
  PluginRegistryItem,
  PluginRegistryProjectionInput,
} from "../manifest/types";
import {
  projectPluginMarketplaceRegistryFromInstalledAgentApps,
  projectPluginMarketplaceRegistryInputsFromInstalledAgentApps,
} from "./pluginMarketplace";
import type { PluginMarketplaceListResponse } from "./types";

export interface PluginMarketplaceQuery {
  query?: string;
  category?: string;
  sort?: string;
}

export interface PluginMarketplaceRegistrySnapshot {
  marketplace: PluginMarketplaceListResponse;
  installed: InstalledAgentAppStateListResult;
  projectionInputs: PluginRegistryProjectionInput[];
  registry: PluginRegistryItem[];
}

export interface PluginMarketplaceRegistryLoaderDeps {
  getMarketplace?: (
    tenantId: string,
    query?: PluginMarketplaceQuery,
  ) => Promise<PluginMarketplaceListResponse>;
  listInstalled?: () => Promise<InstalledAgentAppStateListResult>;
}

export async function loadPluginMarketplaceRegistry(
  tenantId: string,
  query: PluginMarketplaceQuery = {},
  deps: PluginMarketplaceRegistryLoaderDeps = {},
): Promise<PluginMarketplaceRegistrySnapshot> {
  const getMarketplace = deps.getMarketplace ?? getClientPluginMarketplace;
  const listInstalled = deps.listInstalled ?? listInstalledAgentApps;
  const [marketplace, installed] = await Promise.all([
    getMarketplace(tenantId, query),
    listInstalled(),
  ]);
  const installedAgentApps: readonly InstalledAgentAppState[] =
    installed.states;

  return {
    marketplace,
    installed,
    projectionInputs:
      projectPluginMarketplaceRegistryInputsFromInstalledAgentApps(
        marketplace,
        {
          installedAgentApps,
        },
      ),
    registry: projectPluginMarketplaceRegistryFromInstalledAgentApps(
      marketplace,
      {
        installedAgentApps,
      },
    ),
  };
}
