import type {
  PluginRegistryCapabilityState,
  PluginRegistryItem,
  PluginSkillDeclaration,
} from "../manifest/types";
import { projectPluginMarketplaceItemSkills } from "./pluginMarketplace";
import {
  buildPluginMarketplaceCapabilityProfile,
  type PluginMarketplaceCapabilityProfile,
} from "./pluginMarketplaceCapabilityProfile";
import type { PluginMarketplaceRegistrySnapshot } from "./marketplaceRegistryLoader";
import type {
  PluginMarketplaceItem,
  PluginMarketplacePackageRef,
} from "./types";

export type PluginMarketplaceStatusFilter =
  | "all"
  | "installed"
  | "installable"
  | "activatable"
  | "attention";

export type PluginMarketplaceSortKey = "name" | "status";

export type PluginMarketplacePrimaryActionKind =
  | "install"
  | "enable"
  | "open"
  | "view_history"
  | "blocked";

export type PluginMarketplacePrimaryActionLabelKey =
  | "plugin.marketplace.action.install"
  | "plugin.marketplace.action.enable"
  | "plugin.marketplace.action.open"
  | "plugin.marketplace.action.viewHistory"
  | "plugin.marketplace.action.blocked";

export type PluginMarketplaceVisibleBlockerLabelKey =
  | "plugin.marketplace.blocker.disabled"
  | "plugin.marketplace.blocker.installUnavailable"
  | "plugin.marketplace.blocker.installedPackageMismatch"
  | "plugin.marketplace.blocker.marketplaceBlocked"
  | "plugin.marketplace.blocker.activationBlocked"
  | "plugin.marketplace.blocker.activationEntryMissing"
  | "plugin.marketplace.blocker.generic";

export interface PluginMarketplaceViewOptions {
  query?: string;
  category?: string;
  statusFilter?: PluginMarketplaceStatusFilter;
  sort?: PluginMarketplaceSortKey;
}

export interface PluginMarketplacePrimaryAction {
  kind: PluginMarketplacePrimaryActionKind;
  labelKey: PluginMarketplacePrimaryActionLabelKey;
  disabled: boolean;
  blockerCodes: string[];
}

export interface PluginMarketplaceVisibleBlocker {
  code: string;
  labelKey: PluginMarketplaceVisibleBlockerLabelKey;
}

export interface PluginMarketplaceViewItem {
  pluginId: string;
  pluginName: string;
  marketplaceName: string;
  displayName: string;
  description: string;
  version: string;
  categories: string[];
  sourceKind: PluginMarketplaceItem["sourceKind"];
  marketplaceDisplayName?: string;
  marketplaceItemDisplayName: string;
  appId?: string;
  package?: PluginMarketplacePackageRef;
  policy: PluginMarketplaceItem["policy"];
  releaseId?: string;
  installed: boolean;
  enabled: boolean;
  installable: boolean;
  activatable: boolean;
  renderable: boolean;
  readOnlyHistory: boolean;
  skills: PluginSkillDeclaration[];
  capabilityProfile: PluginMarketplaceCapabilityProfile;
  needsAttention: boolean;
  blockerCodes: string[];
  visibleBlockers: PluginMarketplaceVisibleBlocker[];
  primaryAction: PluginMarketplacePrimaryAction;
}

export interface PluginMarketplaceFilterCounts {
  all: number;
  installed: number;
  installable: number;
  activatable: number;
  attention: number;
}

export interface PluginMarketplaceViewModel {
  items: PluginMarketplaceViewItem[];
  filterCounts: PluginMarketplaceFilterCounts;
  issueCount: number;
  generatedAt: string;
}

const ATTENTION_BLOCKERS = new Set([
  "PLUGIN_INSTALL_UNAVAILABLE",
  "PLUGIN_INSTALLED_PACKAGE_MISMATCH",
  "PLUGIN_CLOUD_RELEASE_EVIDENCE_MISSING",
  "PLUGIN_DISABLED",
]);

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function resolveDisplayName(
  item: PluginMarketplaceItem,
  registryItem: PluginRegistryItem,
): string {
  return (
    uniqueStrings([
      registryItem.displayName,
      item.displayName,
      item.pluginName,
      item.pluginKey,
    ])[0] ?? item.pluginKey
  );
}

function capabilitySet(
  registryItem: PluginRegistryItem,
): Set<PluginRegistryCapabilityState> {
  return new Set(registryItem.capabilityStates);
}

function isAttentionBlocker(code: string): boolean {
  return (
    ATTENTION_BLOCKERS.has(code) ||
    code.startsWith("PLUGIN_MARKETPLACE_BLOCKED")
  );
}

function hasAttention(registryItem: PluginRegistryItem): boolean {
  return registryItem.blockerCodes.some(isAttentionBlocker);
}

function visibleBlockerLabelKey(
  code: string,
): PluginMarketplaceVisibleBlockerLabelKey | null {
  if (code === "PLUGIN_RENDERER_UNAVAILABLE") {
    return null;
  }
  if (code === "PLUGIN_WORKSPACE_MISSING") {
    return null;
  }
  if (code.startsWith("PLUGIN_MARKETPLACE_BLOCKED")) {
    return "plugin.marketplace.blocker.marketplaceBlocked";
  }
  switch (code) {
    case "PLUGIN_DISABLED":
      return "plugin.marketplace.blocker.disabled";
    case "PLUGIN_INSTALL_UNAVAILABLE":
      return "plugin.marketplace.blocker.installUnavailable";
    case "PLUGIN_INSTALLED_PACKAGE_MISMATCH":
      return "plugin.marketplace.blocker.installedPackageMismatch";
    case "PLUGIN_ACTIVATION_BLOCKED":
      return "plugin.marketplace.blocker.activationBlocked";
    case "PLUGIN_ACTIVATION_ENTRY_MISSING":
      return "plugin.marketplace.blocker.activationEntryMissing";
    default:
      return "plugin.marketplace.blocker.generic";
  }
}

function visibleBlockers(
  registryItem: PluginRegistryItem,
  action: PluginMarketplacePrimaryAction,
): PluginMarketplaceVisibleBlocker[] {
  return registryItem.blockerCodes.flatMap((code) => {
    if (action.kind !== "blocked" && !isAttentionBlocker(code)) {
      return [];
    }
    const labelKey = visibleBlockerLabelKey(code);
    return labelKey ? [{ code, labelKey }] : [];
  });
}

function primaryAction(
  registryItem: PluginRegistryItem,
  installable: boolean,
  activatable: boolean,
  readOnlyHistory: boolean,
): PluginMarketplacePrimaryAction {
  if (registryItem.installed && installable) {
    return {
      kind: "install",
      labelKey: "plugin.marketplace.action.install",
      disabled: false,
      blockerCodes: [],
    };
  }
  if (registryItem.installed && activatable) {
    return {
      kind: "open",
      labelKey: "plugin.marketplace.action.open",
      disabled: false,
      blockerCodes: [],
    };
  }
  if (registryItem.installed && registryItem.enabled === false) {
    return {
      kind: "enable",
      labelKey: "plugin.marketplace.action.enable",
      disabled: false,
      blockerCodes: [],
    };
  }
  if (!registryItem.installed && installable) {
    return {
      kind: "install",
      labelKey: "plugin.marketplace.action.install",
      disabled: false,
      blockerCodes: [],
    };
  }
  if (readOnlyHistory) {
    return {
      kind: "view_history",
      labelKey: "plugin.marketplace.action.viewHistory",
      disabled: false,
      blockerCodes: [],
    };
  }
  return {
    kind: "blocked",
    labelKey: "plugin.marketplace.action.blocked",
    disabled: true,
    blockerCodes: registryItem.blockerCodes,
  };
}

function viewItem(
  item: PluginMarketplaceItem,
  registryItem: PluginRegistryItem,
): PluginMarketplaceViewItem {
  const states = capabilitySet(registryItem);
  const installable = states.has("installable");
  const activatable = states.has("activatable");
  const renderable = states.has("renderable");
  const readOnlyHistory = states.has("read_only_history");
  const displayName = resolveDisplayName(item, registryItem);
  const action = primaryAction(
    registryItem,
    installable,
    activatable,
    readOnlyHistory,
  );
  const skills = projectPluginMarketplaceItemSkills(item);

  return {
    pluginId: item.pluginKey,
    pluginName: item.pluginName,
    marketplaceName: item.marketplaceName,
    displayName,
    description: item.description ?? "",
    version: registryItem.version,
    categories: uniqueStrings([item.category, ...(item.categories ?? [])]),
    sourceKind: item.sourceKind,
    marketplaceDisplayName: item.marketplaceDisplayName,
    marketplaceItemDisplayName: item.displayName,
    appId: item.appId,
    package: item.package,
    policy: item.policy,
    releaseId: item.sourceRef ?? item.package?.releaseId,
    installed: registryItem.installed,
    enabled: registryItem.enabled,
    installable,
    activatable,
    renderable,
    readOnlyHistory,
    skills,
    capabilityProfile: buildPluginMarketplaceCapabilityProfile({
      item,
      registryItem,
      skills,
    }),
    needsAttention: hasAttention(registryItem),
    blockerCodes: registryItem.blockerCodes,
    visibleBlockers: visibleBlockers(registryItem, action),
    primaryAction: action,
  };
}

function buildViewItems(
  snapshot: PluginMarketplaceRegistrySnapshot,
): PluginMarketplaceViewItem[] {
  const registryByPluginId = new Map(
    snapshot.registry.map((item) => [item.pluginId, item] as const),
  );
  return snapshot.marketplace.items.flatMap((item) => {
    const registryItem = registryByPluginId.get(item.pluginKey);
    return registryItem ? [viewItem(item, registryItem)] : [];
  });
}

function matchesQuery(item: PluginMarketplaceViewItem, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  return [
    item.pluginId,
    item.pluginName,
    item.displayName,
    item.description,
    ...item.categories,
  ].some((value) => value.toLowerCase().includes(normalized));
}

function matchesCategory(
  item: PluginMarketplaceViewItem,
  category: string | undefined,
): boolean {
  const normalized = category?.trim().toLowerCase();
  if (!normalized || normalized === "all") {
    return true;
  }
  return item.categories.some((value) => value.toLowerCase() === normalized);
}

function matchesStatus(
  item: PluginMarketplaceViewItem,
  statusFilter: PluginMarketplaceStatusFilter,
): boolean {
  switch (statusFilter) {
    case "installed":
      return item.installed;
    case "installable":
      return item.installable;
    case "activatable":
      return item.activatable;
    case "attention":
      return item.needsAttention;
    case "all":
    default:
      return true;
  }
}

export function buildPluginMarketplaceFilterCounts(
  items: readonly PluginMarketplaceViewItem[],
): PluginMarketplaceFilterCounts {
  return {
    all: items.length,
    installed: items.filter((item) => item.installed).length,
    installable: items.filter((item) => item.installable).length,
    activatable: items.filter((item) => item.activatable).length,
    attention: items.filter((item) => item.needsAttention).length,
  };
}

function statusRank(item: PluginMarketplaceViewItem): number {
  if (item.needsAttention) {
    return 0;
  }
  if (item.activatable) {
    return 1;
  }
  if (item.installed) {
    return 2;
  }
  if (item.installable) {
    return 3;
  }
  return 4;
}

function sortItems(
  items: PluginMarketplaceViewItem[],
  sort: PluginMarketplaceSortKey,
): PluginMarketplaceViewItem[] {
  return [...items].sort((left, right) => {
    if (sort === "status") {
      const rank = statusRank(left) - statusRank(right);
      if (rank !== 0) {
        return rank;
      }
    }
    return left.displayName.localeCompare(right.displayName);
  });
}

export function buildPluginMarketplaceViewModel(
  snapshot: PluginMarketplaceRegistrySnapshot,
  options: PluginMarketplaceViewOptions = {},
): PluginMarketplaceViewModel {
  const allItems = buildViewItems(snapshot);
  const statusFilter = options.statusFilter ?? "all";
  const filtered = allItems.filter(
    (item) =>
      matchesQuery(item, options.query ?? "") &&
      matchesCategory(item, options.category) &&
      matchesStatus(item, statusFilter),
  );

  return {
    items: sortItems(filtered, options.sort ?? "name"),
    filterCounts: buildPluginMarketplaceFilterCounts(allItems),
    issueCount: snapshot.installed.issues.length,
    generatedAt: snapshot.marketplace.generatedAt,
  };
}
