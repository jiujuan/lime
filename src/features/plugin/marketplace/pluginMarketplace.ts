import { normalizePluginManifest } from "../manifest/pluginContract";
import { projectPluginRegistry } from "../manifest/pluginRegistry";
import type { InstalledAgentAppState } from "@/features/agent-app/types";
import type {
  PluginContract,
  PluginManifest,
  PluginRegistryItem,
  PluginRegistryProjectionInput,
  PluginSkillDeclaration,
} from "../manifest/types";
import type {
  PluginMarketplaceItem,
  PluginMarketplaceListResponse,
} from "./types";

export interface PluginMarketplaceRegistryProjectionOptions {
  installedPluginKeys?: readonly string[];
  enabledPluginKeys?: readonly string[];
  historyWorkspacePluginKeys?: readonly string[];
}

export interface PluginMarketplaceInstalledAgentAppsProjectionOptions extends Omit<
  PluginMarketplaceRegistryProjectionOptions,
  "installedPluginKeys" | "enabledPluginKeys"
> {
  installedAgentApps?: readonly InstalledAgentAppState[];
}

export interface PluginMarketplaceInstalledKeyProjection {
  installedPluginKeys: string[];
  enabledPluginKeys: string[];
  disabledPluginKeys: string[];
  blockerCodesByPluginKey: Record<string, string[]>;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function marketplaceCategories(item: PluginMarketplaceItem): string[] {
  return uniqueStrings([item.category, ...(item.categories ?? [])]);
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function projectPluginMarketplaceItemSkills(
  item: Pick<PluginMarketplaceItem, "manifestSummary">,
): PluginSkillDeclaration[] {
  const summary = readRecord(item.manifestSummary);
  const rawSkills = Array.isArray(summary?.skills) ? summary.skills : [];
  const seen = new Set<string>();

  return rawSkills.flatMap((entry): PluginSkillDeclaration[] => {
    const record = readRecord(entry);
    const id = readString(record?.id);
    if (!id || seen.has(id)) {
      return [];
    }
    seen.add(id);
    const title = readString(record?.title) ?? id;
    const description = readString(record?.description);
    return [
      {
        id,
        title,
        ...(description ? { description } : {}),
      },
    ];
  });
}

function marketplaceManifest(item: PluginMarketplaceItem): PluginManifest {
  return {
    id: item.pluginKey,
    name: item.pluginName,
    displayName: item.displayName,
    version: item.version ?? "0.0.0",
    description: item.description,
    categories: marketplaceCategories(item),
    capabilities: item.capabilities ?? [],
    skills: projectPluginMarketplaceItemSkills(item),
    interface: {
      displayName: item.displayName,
      shortDescription: item.description,
      category: item.category,
      capabilities: item.capabilities ?? [],
      screenshots: [],
    },
    agentApps: item.appId
      ? [
          {
            id: item.appId,
            title: item.displayName,
            description: item.description,
            uiKind: "pane",
            entryKey: item.pluginName,
          },
        ]
      : [],
    activationEntries: [
      {
        key: item.pluginName,
        title: item.displayName,
        kind: item.appId ? "agentApp" : "plugin",
        intent: "manual",
      },
    ],
  };
}

function isMarketplaceItemAvailable(item: PluginMarketplaceItem): boolean {
  return (
    item.enabled &&
    item.installState === "available" &&
    item.activationState === "activatable" &&
    item.policy.installation !== "NOT_AVAILABLE" &&
    Boolean(item.package?.packageUrl)
  );
}

function setFrom(values: readonly string[] | undefined): Set<string> {
  return new Set((values ?? []).map((value) => value.trim()).filter(Boolean));
}

function normalizeToken(value: string | undefined): string | undefined {
  const token = value?.trim();
  return token ? token : undefined;
}

function matchPackageHash(
  item: PluginMarketplaceItem,
  state: InstalledAgentAppState,
): boolean {
  const expectedPackageHash = normalizeToken(item.package?.packageHash);
  const expectedManifestHash = normalizeToken(item.package?.manifestHash);
  return (
    Boolean(expectedPackageHash) &&
    Boolean(expectedManifestHash) &&
    state.identity.packageHash === expectedPackageHash &&
    state.identity.manifestHash === expectedManifestHash
  );
}

function installedStateForMarketplaceItem(
  item: PluginMarketplaceItem,
  statesByAppId: ReadonlyMap<string, InstalledAgentAppState>,
): InstalledAgentAppState | undefined {
  const appId = normalizeToken(item.appId);
  if (!appId) {
    return undefined;
  }
  return statesByAppId.get(appId);
}

export function projectPluginMarketplaceInstalledKeysFromAgentApps(
  marketplace: PluginMarketplaceListResponse,
  installedAgentApps: readonly InstalledAgentAppState[] = [],
): PluginMarketplaceInstalledKeyProjection {
  const statesByAppId = new Map(
    installedAgentApps.map((state) => [state.appId, state] as const),
  );
  const installedPluginKeys: string[] = [];
  const enabledPluginKeys: string[] = [];
  const disabledPluginKeys: string[] = [];
  const blockerCodesByPluginKey: Record<string, string[]> = {};

  marketplace.items.forEach((item) => {
    const state = installedStateForMarketplaceItem(item, statesByAppId);
    if (!state) {
      return;
    }
    if (!matchPackageHash(item, state)) {
      blockerCodesByPluginKey[item.pluginKey] = [
        "PLUGIN_INSTALLED_PACKAGE_MISMATCH",
      ];
      return;
    }
    installedPluginKeys.push(item.pluginKey);
    if (state.disabled === true) {
      disabledPluginKeys.push(item.pluginKey);
    } else {
      enabledPluginKeys.push(item.pluginKey);
    }
  });

  return {
    installedPluginKeys,
    enabledPluginKeys,
    disabledPluginKeys,
    blockerCodesByPluginKey,
  };
}

export function buildPluginContractFromMarketplaceItem(
  item: PluginMarketplaceItem,
): PluginContract {
  return normalizePluginManifest(marketplaceManifest(item), {
    provenance: {
      sourceKind: "plugin_marketplace",
      sourceId: item.pluginKey,
      sourceVersion: item.version ?? "0.0.0",
      packageHash: item.package?.packageHash,
      manifestHash: item.package?.manifestHash,
    },
  });
}

export function buildPluginContractsFromMarketplace(
  marketplace: PluginMarketplaceListResponse,
): PluginContract[] {
  return marketplace.items.map(buildPluginContractFromMarketplaceItem);
}

export function projectPluginMarketplaceRegistryInputs(
  marketplace: PluginMarketplaceListResponse,
  options: PluginMarketplaceRegistryProjectionOptions = {},
): PluginRegistryProjectionInput[] {
  const installed = setFrom(options.installedPluginKeys);
  const enabled = setFrom(options.enabledPluginKeys);
  const historyWorkspace = setFrom(options.historyWorkspacePluginKeys);

  return marketplace.items.map((item) => {
    const available = isMarketplaceItemAvailable(item);
    const installedByDefault =
      item.policy.installation === "INSTALLED_BY_DEFAULT";
    const isInstalled = installed.has(item.pluginKey) || installedByDefault;
    const hasExplicitEnabledSet = enabled.size > 0;
    return {
      contract: buildPluginContractFromMarketplaceItem(item),
      installed: isInstalled,
      installable: available,
      enabled: hasExplicitEnabledSet
        ? enabled.has(item.pluginKey)
        : isInstalled,
      readinessStatus: available ? "ready" : "blocked",
      hasHistoryWorkspace: historyWorkspace.has(item.pluginKey),
      blockerCodes: available
        ? []
        : [
            item.blockedReason
              ? `PLUGIN_MARKETPLACE_BLOCKED:${item.blockedReason}`
              : "PLUGIN_MARKETPLACE_BLOCKED",
          ],
    };
  });
}

export function projectPluginMarketplaceRegistryInputsFromInstalledAgentApps(
  marketplace: PluginMarketplaceListResponse,
  options: PluginMarketplaceInstalledAgentAppsProjectionOptions = {},
): PluginRegistryProjectionInput[] {
  const installedProjection =
    projectPluginMarketplaceInstalledKeysFromAgentApps(
      marketplace,
      options.installedAgentApps,
    );
  const baseInputs = projectPluginMarketplaceRegistryInputs(marketplace, {
    installedPluginKeys: installedProjection.installedPluginKeys,
    enabledPluginKeys: installedProjection.enabledPluginKeys,
    historyWorkspacePluginKeys: options.historyWorkspacePluginKeys,
  });
  const disabled = setFrom(installedProjection.disabledPluginKeys);

  return baseInputs.map((input) => ({
    ...input,
    enabled: input.enabled && !disabled.has(input.contract.id),
    blockerCodes: [
      ...(input.blockerCodes ?? []),
      ...(installedProjection.blockerCodesByPluginKey[input.contract.id] ?? []),
    ],
  }));
}

export function projectPluginMarketplaceRegistry(
  marketplace: PluginMarketplaceListResponse,
  options: PluginMarketplaceRegistryProjectionOptions = {},
): PluginRegistryItem[] {
  return projectPluginRegistry(
    projectPluginMarketplaceRegistryInputs(marketplace, options),
  );
}

export function projectPluginMarketplaceRegistryFromInstalledAgentApps(
  marketplace: PluginMarketplaceListResponse,
  options: PluginMarketplaceInstalledAgentAppsProjectionOptions = {},
): PluginRegistryItem[] {
  return projectPluginRegistry(
    projectPluginMarketplaceRegistryInputsFromInstalledAgentApps(
      marketplace,
      options,
    ),
  );
}
