import {
  getAgentAppCloudCatalog,
  listInstalledAgentApps,
  type AgentAppCloudCatalogResult,
} from "@/lib/api/agentApps";
import {
  getClientPluginMarketplace,
  OemCloudControlPlaneError,
} from "@/lib/api/oemCloudControlPlane";
import type {
  CloudBootstrapApp,
  InstalledAgentAppState,
} from "@/features/agent-app/types";
import type { InstalledAgentAppStateListResult } from "@/features/agent-app/install/installedAppState";
import type {
  PluginRegistryItem,
  PluginRegistryProjectionInput,
} from "../manifest/types";
import { projectPluginRegistryFromInstalledAgentApps } from "../installed/installedAgentApps";
import {
  projectPluginMarketplaceRegistryFromInstalledAgentApps,
  projectPluginMarketplaceRegistryInputsFromInstalledAgentApps,
} from "./pluginMarketplace";
import type {
  PluginMarketplaceItem,
  PluginMarketplaceListResponse,
} from "./types";

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
  getAgentAppCatalog?: () => Promise<AgentAppCloudCatalogResult>;
}

function isAuthenticationError(error: unknown): boolean {
  if (
    error instanceof OemCloudControlPlaneError &&
    (error.status === 401 || error.status === 403)
  ) {
    return true;
  }
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const normalized = message.trim().toLowerCase();
  return (
    normalized.includes("invalid auth token") ||
    normalized.includes("session token") ||
    normalized.includes("unauthorized") ||
    normalized.includes("unauthenticated")
  );
}

function marketplaceItemFromInstalledInput(
  input: PluginRegistryProjectionInput,
): PluginMarketplaceItem {
  const contract = input.contract;
  const firstAgentApp = contract.agentApps[0];
  const category = contract.categories[0];
  return {
    pluginKey: contract.id,
    pluginName: contract.name ?? contract.id,
    marketplaceName: "local",
    marketplaceDisplayName: "Local",
    displayName: contract.displayName,
    description: contract.description,
    version: contract.version,
    category,
    categories: contract.categories,
    keywords: contract.keywords,
    capabilities: contract.capabilities,
    sourceKind: "agent_app_release",
    sourceRef: contract.provenance.sourceId,
    appId: firstAgentApp?.id ?? contract.id,
    enabled: input.enabled !== false,
    installState: "available",
    activationState: input.enabled === false ? "blocked" : "activatable",
    policy: {
      installation: "INSTALLED_BY_DEFAULT",
      authentication: "ON_USE",
    },
    package:
      contract.provenance.packageHash && contract.provenance.manifestHash
        ? {
            packageHash: contract.provenance.packageHash,
            manifestHash: contract.provenance.manifestHash,
          }
        : undefined,
    manifestSummary: {
      skills: contract.skills,
      artifactRenderers: contract.artifactRenderers,
      historyRestore: contract.historyRestore,
    },
  };
}

function readOptionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function agentAppCatalogMarketplaceName(
  source: AgentAppCloudCatalogResult["source"],
): string {
  return source === "remote"
    ? "agent-app-cloud"
    : source === "bootstrap"
      ? "agent-app-bootstrap"
      : "agent-app-seeded";
}

function marketplaceItemFromCloudAgentApp(
  app: CloudBootstrapApp,
  source: AgentAppCloudCatalogResult["source"],
  installedState?: InstalledAgentAppState,
): PluginMarketplaceItem {
  const marketplaceName = agentAppCatalogMarketplaceName(source);
  const installed = Boolean(installedState);
  const packageUrl =
    readOptionalText(app.packageUrl) ??
    readOptionalText(installedState?.identity.sourceUri);
  const packageHash =
    readOptionalText(app.packageHash) ??
    readOptionalText(installedState?.identity.packageHash);
  const manifestHash =
    readOptionalText(app.manifestHash) ??
    readOptionalText(installedState?.identity.manifestHash);
  const registrationBlocked =
    !installed &&
    app.registrationRequired === true &&
    app.registrationState !== "active";
  const packageReady = Boolean(packageUrl && packageHash && manifestHash);
  const enabled = installed ? installedState?.disabled !== true : app.enabled;
  const installable =
    installed || (enabled && packageReady && !registrationBlocked);
  const blockedReason = installed
    ? undefined
    : (readOptionalText(app.disabledReason) ??
      (registrationBlocked
        ? "registration required"
        : packageReady
          ? undefined
          : "package unavailable"));
  const category = readOptionalText(app.presentation?.category);
  const displayName =
    readOptionalText(app.displayName) ??
    readOptionalText(app.presentation?.title) ??
    app.appId;

  return {
    pluginKey: app.appId,
    pluginName: app.appId,
    marketplaceName,
    marketplaceDisplayName: "Agent Apps",
    displayName,
    description:
      readOptionalText(app.presentation?.summary) ?? blockedReason ?? "",
    version: app.version,
    category,
    categories: category ? [category] : [],
    keywords: app.defaultEntries,
    capabilities: Object.keys(app.capabilityRequirements).sort(),
    sourceKind: "agent_app_release",
    sourceRef: readOptionalText(app.releaseId) ?? app.appId,
    appId: app.appId,
    enabled,
    installState: installable ? "available" : "blocked",
    activationState: enabled && installable ? "activatable" : "blocked",
    ...(blockedReason ? { blockedReason } : {}),
    policy: {
      installation: installed
        ? "INSTALLED_BY_DEFAULT"
        : enabled
          ? "AVAILABLE"
          : "NOT_AVAILABLE",
      authentication: installed
        ? "ON_USE"
        : app.registrationRequired
          ? "ON_INSTALL"
          : "ON_USE",
    },
    package:
      packageUrl || packageHash || manifestHash || app.releaseId
        ? {
            releaseId: readOptionalText(app.releaseId),
            packageUrl,
            packageHash,
            manifestHash,
            signatureRef: readOptionalText(app.signatureRef),
          }
        : undefined,
  };
}

function mergeLocalMarketplaceItems(params: {
  installedItems: PluginMarketplaceItem[];
  catalogItems: PluginMarketplaceItem[];
}): PluginMarketplaceItem[] {
  const itemsByPluginKey = new Map<string, PluginMarketplaceItem>();
  for (const item of params.catalogItems) {
    itemsByPluginKey.set(item.pluginKey, item);
  }
  for (const item of params.installedItems) {
    itemsByPluginKey.set(item.pluginKey, item);
  }
  return Array.from(itemsByPluginKey.values()).sort((left, right) =>
    left.displayName.localeCompare(right.displayName, "zh-Hans-CN"),
  );
}

function buildLocalMarketplaceRegistrySnapshot(
  installed: InstalledAgentAppStateListResult,
  agentAppCatalog: AgentAppCloudCatalogResult | null,
): PluginMarketplaceRegistrySnapshot {
  const installedAgentApps: readonly InstalledAgentAppState[] =
    installed.states;
  const projection =
    projectPluginRegistryFromInstalledAgentApps(installedAgentApps);
  const installedItems = projection.projectionInputs.map(
    marketplaceItemFromInstalledInput,
  );
  const installedByAppId = new Map(
    installedAgentApps.map((state) => [state.appId, state] as const),
  );
  const catalogItems =
    agentAppCatalog?.payload.apps.map((app) =>
      marketplaceItemFromCloudAgentApp(
        app,
        agentAppCatalog.source,
        installedByAppId.get(app.appId),
      ),
    ) ?? [];
  const items = mergeLocalMarketplaceItems({
    installedItems,
    catalogItems,
  });
  const marketplace: PluginMarketplaceListResponse = {
    schemaVersion: "plugin-marketplace/v1",
    tenantId: "local",
    generatedAt: new Date(0).toISOString(),
    marketplaceName: "local",
    marketplaceDisplayName: "Local",
    items,
  };

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

export async function loadPluginMarketplaceRegistry(
  tenantId: string,
  query: PluginMarketplaceQuery = {},
  deps: PluginMarketplaceRegistryLoaderDeps = {},
): Promise<PluginMarketplaceRegistrySnapshot> {
  const getMarketplace = deps.getMarketplace ?? getClientPluginMarketplace;
  const listInstalled = deps.listInstalled ?? listInstalledAgentApps;
  const getAgentAppCatalog = deps.getAgentAppCatalog ?? getAgentAppCloudCatalog;
  const normalizedTenantId = tenantId.trim();
  const installed = await listInstalled();
  let marketplace: PluginMarketplaceListResponse | null = null;

  if (normalizedTenantId) {
    try {
      marketplace = await getMarketplace(normalizedTenantId, query);
    } catch (error) {
      if (!isAuthenticationError(error)) {
        throw error;
      }
    }
  }

  if (!marketplace) {
    let agentAppCatalog: AgentAppCloudCatalogResult | null = null;
    try {
      agentAppCatalog = await getAgentAppCatalog();
    } catch {
      agentAppCatalog = null;
    }
    return buildLocalMarketplaceRegistrySnapshot(installed, agentAppCatalog);
  }

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
