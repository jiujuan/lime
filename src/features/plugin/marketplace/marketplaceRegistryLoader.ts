import {
  getAgentAppCloudCatalog,
  listInstalledAgentApps,
  reviewLocalAgentAppPackage,
  saveInstalledAgentAppState,
  type AgentAppCloudCatalogResult,
} from "@/lib/api/agentApps";
import {
  getClientPluginMarketplace,
  OemCloudControlPlaneError,
} from "@/lib/api/oemCloudControlPlane";
import type {
  CloudBootstrapApp,
  HostCapabilityProfile,
  InstalledAgentAppState,
  RuntimeTarget,
} from "@/features/agent-app/types";
import type { InstalledAgentAppStateListResult } from "@/features/agent-app/install/installedAppState";
import { repairStaleInstalledAgentAppReadinessList } from "@/features/agent-app/install/staleReadinessRepair";
import { buildAppCenterRuntimeCapabilityProfile } from "@/features/agent-app/runtime/appCenterRuntimeProfile";
import type {
  PluginRegistryItem,
  PluginRegistryProjectionInput,
} from "../manifest/types";
import { projectPluginRegistryFromInstalledAgentApps } from "../installed/installedAgentApps";
import {
  marketplaceItemMatchesInstalledAgentAppPackage,
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
  reviewLocalPackage?: typeof reviewLocalAgentAppPackage;
  saveInstalledState?: typeof saveInstalledAgentAppState;
  profile?: HostCapabilityProfile;
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
    install: contract.install
      ? {
          local: contract.install.local,
          cloud: contract.install.cloud,
          authentication: contract.install.authentication,
        }
      : undefined,
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
      interface: contract.interface,
      install: contract.install,
      skills: contract.skills,
      agentApps: contract.agentApps,
      subagents: contract.subagents,
      workflows: contract.workflows,
      connectors: contract.connectors,
      mcpServers: contract.mcpServers,
      activationEntries: contract.activationEntries,
      artifactRenderers: contract.artifactRenderers,
      historyRestore: contract.historyRestore,
      capabilities: contract.capabilities,
      componentPaths: contract.componentPaths,
    },
  };
}

function readOptionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function uniqueText(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => readOptionalText(value))
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function installedAgentAppManifestSummary(
  state: InstalledAgentAppState,
): PluginMarketplaceItem["manifestSummary"] {
  const manifest = state.manifest;
  const manifestRecord = manifest as unknown as Record<string, unknown>;
  return {
    agentRuntime: manifest.agentRuntime,
    runtimePackage: manifest.runtimePackage,
    workbench: manifest.workbench,
    interface: manifest.interface,
    componentPaths: manifest.componentPaths,
    activationEntries: manifest.activationEntries,
    subagents: manifest.subagents,
    workflows: manifest.workflows,
    connectors: manifestRecord.connectors,
    mcpServers: manifestRecord.mcpServers,
    requires: manifest.requires,
    skillRefs: manifest.skillRefs,
    toolRefs: manifest.toolRefs,
    hooks: manifestRecord.hooks,
    clis: manifestRecord.clis,
    secrets: manifest.secrets,
    operations: manifest.operations,
  };
}

function mergeSummaryRecord(
  target: Record<string, unknown>,
  source: PluginMarketplaceItem["manifestSummary"],
  keys: readonly string[],
) {
  const sourceRecord = readRecord(source);
  if (!sourceRecord) {
    return;
  }
  for (const key of keys) {
    const value = sourceRecord[key];
    if (Array.isArray(value) ? value.length > 0 : value !== undefined) {
      target[key] = value;
    }
  }
}

function mergeManifestSummary(
  marketplaceSummary: PluginMarketplaceItem["manifestSummary"],
  installedSummary: PluginMarketplaceItem["manifestSummary"],
): PluginMarketplaceItem["manifestSummary"] {
  const marketplaceRecord = readRecord(marketplaceSummary);
  const installedRecord = readRecord(installedSummary);
  const next: Record<string, unknown> = marketplaceRecord
    ? { ...marketplaceRecord }
    : {};
  mergeSummaryRecord(next, installedRecord, [
    "skills",
    "agentApps",
    "subagents",
    "workflows",
    "connectors",
    "mcpServers",
    "activationEntries",
    "artifactRenderers",
    "historyRestore",
    "capabilities",
    "interface",
    "componentPaths",
    "agentRuntime",
    "runtimePackage",
    "workbench",
    "requires",
    "skillRefs",
    "toolRefs",
    "hooks",
    "clis",
    "secrets",
    "operations",
  ]);
  return Object.keys(next).length > 0 ? next : undefined;
}

function enrichMarketplaceItemWithInstalledStateSummary(params: {
  item: PluginMarketplaceItem;
  state?: InstalledAgentAppState;
}): PluginMarketplaceItem {
  if (!params.state) {
    return params.item;
  }
  return {
    ...params.item,
    manifestSummary: mergeManifestSummary(
      params.item.manifestSummary,
      installedAgentAppManifestSummary(params.state),
    ),
  };
}

function hasCloudReleaseEvidence(
  state: InstalledAgentAppState | undefined,
): boolean {
  const setup = readRecord(state?.setup);
  return Boolean(
    state?.identity.sourceKind !== "cloud_release" ||
    !state.identity.sourceUri.startsWith("https://seeded.local/") ||
    setup?.cloudReleaseEvidence,
  );
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
  const installedEvidenceMissing =
    installed && !hasCloudReleaseEvidence(installedState);
  const enabled = installed ? installedState?.disabled !== true : app.enabled;
  const installable =
    (installed && !installedEvidenceMissing) ||
    (enabled && packageReady && !registrationBlocked);
  const blockedReason = installed
    ? installedEvidenceMissing
      ? "cloud release evidence missing"
      : undefined
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
    install: (app.runtimeTargets ?? ([] as RuntimeTarget[])).includes("local")
      ? {
          local: true,
          cloud: source === "seeded" ? false : true,
          authentication: app.registrationRequired ? "on_install" : "on_use",
        }
      : {
          local: false,
          cloud: true,
          authentication: app.registrationRequired ? "on_install" : "on_use",
        },
    enabled,
    installState: installable ? "available" : "blocked",
    activationState: enabled && installable ? "activatable" : "blocked",
    ...(blockedReason ? { blockedReason } : {}),
    policy: {
      installation:
        installed && !installedEvidenceMissing
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
    manifestSummary: {
      install: {
        local: (app.runtimeTargets ?? ([] as RuntimeTarget[])).includes(
          "local",
        ),
        cloud: true,
        authentication: app.registrationRequired ? "on_install" : "on_use",
      },
    },
  };
}

function mergeLocalMarketplaceItems(params: {
  installedItems: PluginMarketplaceItem[];
  catalogItems: PluginMarketplaceItem[];
}): PluginMarketplaceItem[] {
  const itemsByPluginKey = new Map<string, PluginMarketplaceItem>();
  for (const item of params.installedItems) {
    itemsByPluginKey.set(item.pluginKey, item);
  }
  for (const item of params.catalogItems) {
    const installedItem = itemsByPluginKey.get(item.pluginKey);
    itemsByPluginKey.set(
      item.pluginKey,
      installedItem
        ? enrichMarketplaceItemWithInstalledManifest({
            marketplaceItem: item,
            installedItem,
          })
        : item,
    );
  }
  return Array.from(itemsByPluginKey.values()).sort((left, right) =>
    left.displayName.localeCompare(right.displayName, "zh-Hans-CN"),
  );
}

function enrichMarketplaceItemWithInstalledManifest(params: {
  marketplaceItem: PluginMarketplaceItem;
  installedItem: PluginMarketplaceItem;
}): PluginMarketplaceItem {
  const { marketplaceItem, installedItem } = params;
  const categories = uniqueText([
    marketplaceItem.category,
    ...(marketplaceItem.categories ?? []),
    installedItem.category,
    ...(installedItem.categories ?? []),
  ]);
  const keywords = uniqueText([
    ...(marketplaceItem.keywords ?? []),
    ...(installedItem.keywords ?? []),
  ]);
  const capabilities = uniqueText([
    ...(marketplaceItem.capabilities ?? []),
    ...(installedItem.capabilities ?? []),
  ]);
  return {
    ...marketplaceItem,
    pluginName:
      readOptionalText(marketplaceItem.pluginName) ?? installedItem.pluginName,
    displayName:
      readOptionalText(marketplaceItem.displayName) ??
      installedItem.displayName,
    description:
      readOptionalText(marketplaceItem.description) ??
      readOptionalText(installedItem.description),
    version: readOptionalText(marketplaceItem.version) ?? installedItem.version,
    category:
      readOptionalText(marketplaceItem.category) ?? installedItem.category,
    categories: categories.length > 0 ? categories : undefined,
    keywords: keywords.length > 0 ? keywords : undefined,
    capabilities: capabilities.length > 0 ? capabilities : undefined,
    appId: readOptionalText(marketplaceItem.appId) ?? installedItem.appId,
    install:
      (marketplaceItem.install ?? installedItem.install)
        ? {
            local:
              marketplaceItem.install?.local ?? installedItem.install?.local,
            cloud:
              marketplaceItem.install?.cloud ?? installedItem.install?.cloud,
            authentication:
              marketplaceItem.install?.authentication ??
              installedItem.install?.authentication,
          }
        : undefined,
    manifestSummary: mergeManifestSummary(
      marketplaceItem.manifestSummary,
      installedItem.manifestSummary,
    ),
  };
}

function mergeInstalledManifestFieldsIntoMarketplace(params: {
  marketplace: PluginMarketplaceListResponse;
  installedAgentApps: readonly InstalledAgentAppState[];
}): PluginMarketplaceListResponse {
  const projection = projectPluginRegistryFromInstalledAgentApps(
    params.installedAgentApps,
  );
  const installedItems = projection.projectionInputs.map((input) => {
    const item = marketplaceItemFromInstalledInput(input);
    return enrichMarketplaceItemWithInstalledStateSummary({
      item,
      state: params.installedAgentApps.find(
        (state) => state.appId === item.appId,
      ),
    });
  });
  const installedItemsByAppId = new Map(
    installedItems
      .map((item) => (item.appId ? ([item.appId, item] as const) : null))
      .filter(
        (entry): entry is readonly [string, PluginMarketplaceItem] =>
          entry !== null,
      ),
  );
  const installedStatesByAppId = new Map(
    params.installedAgentApps.map((state) => [state.appId, state] as const),
  );
  const representedAppIds = new Set<string>();
  const representedPluginKeys = new Set<string>();
  const items = params.marketplace.items.map((item) => {
    const explicitAppId = readOptionalText(item.appId);
    const pluginKey = readOptionalText(item.pluginKey);
    const appId =
      explicitAppId ??
      (pluginKey && installedStatesByAppId.has(pluginKey)
        ? pluginKey
        : undefined);
    if (appId) {
      representedAppIds.add(appId);
    }
    representedPluginKeys.add(item.pluginKey);
    if (!appId) {
      return item;
    }
    const installedState = installedStatesByAppId.get(appId);
    const installedItem = installedItemsByAppId.get(appId);
    if (
      !installedState ||
      !installedItem ||
      !marketplaceItemMatchesInstalledAgentAppPackage(item, installedState)
    ) {
      return item;
    }
    return enrichMarketplaceItemWithInstalledManifest({
      marketplaceItem: item,
      installedItem,
    });
  });
  const missingInstalledItems = installedItems.filter((item) => {
    const appId = readOptionalText(item.appId);
    return (
      !representedPluginKeys.has(item.pluginKey) &&
      (!appId || !representedAppIds.has(appId))
    );
  });
  return {
    ...params.marketplace,
    items: [...items, ...missingInstalledItems],
  };
}

function buildLocalMarketplaceRegistrySnapshot(
  installed: InstalledAgentAppStateListResult,
  agentAppCatalog: AgentAppCloudCatalogResult | null,
): PluginMarketplaceRegistrySnapshot {
  const installedAgentApps: readonly InstalledAgentAppState[] =
    installed.states;
  const projection =
    projectPluginRegistryFromInstalledAgentApps(installedAgentApps);
  const installedByAppId = new Map(
    installedAgentApps.map((state) => [state.appId, state] as const),
  );
  const installedItems = projection.projectionInputs.map((input) => {
    const item = marketplaceItemFromInstalledInput(input);
    return enrichMarketplaceItemWithInstalledStateSummary({
      item,
      state: installedByAppId.get(item.appId ?? ""),
    });
  });
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
  const loadedInstalled = await listInstalled();
  let installed = loadedInstalled;
  try {
    const repairedStates = await repairStaleInstalledAgentAppReadinessList(
      loadedInstalled.states,
      deps.profile ?? buildAppCenterRuntimeCapabilityProfile(),
      {
        reviewLocalPackage:
          deps.reviewLocalPackage ?? reviewLocalAgentAppPackage,
        saveInstalledState:
          deps.saveInstalledState ?? saveInstalledAgentAppState,
      },
    );
    if (repairedStates !== loadedInstalled.states) {
      installed = {
        ...loadedInstalled,
        states: repairedStates,
      };
    }
  } catch (error) {
    console.warn(
      "[plugin-marketplace] stale Agent App readiness repair failed",
      error,
    );
  }
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
  const enrichedMarketplace = mergeInstalledManifestFieldsIntoMarketplace({
    marketplace,
    installedAgentApps,
  });

  return {
    marketplace: enrichedMarketplace,
    installed,
    projectionInputs:
      projectPluginMarketplaceRegistryInputsFromInstalledAgentApps(
        enrichedMarketplace,
        {
          installedAgentApps,
        },
      ),
    registry: projectPluginMarketplaceRegistryFromInstalledAgentApps(
      enrichedMarketplace,
      {
        installedAgentApps,
      },
    ),
  };
}
