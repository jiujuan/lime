import type { PluginMarketplaceViewItem } from "./pluginMarketplaceViewModel";

export function pluginMarketplaceActionTone(
  item: PluginMarketplaceViewItem,
): string {
  if (item.primaryAction.disabled) {
    return "border-slate-200 bg-slate-100 text-slate-500";
  }
  if (item.primaryAction.kind === "install") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }
  if (item.primaryAction.kind === "enable") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

export function pluginMarketplaceStatusTone(
  item: PluginMarketplaceViewItem,
): string {
  if (item.needsAttention) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (item.activatable) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (item.installable) {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }
  if (item.installed) {
    return "border-slate-200 bg-slate-50 text-slate-700";
  }
  return "border-rose-200 bg-rose-50 text-rose-700";
}

export function pluginMarketplaceStatusLabelKey(
  item: PluginMarketplaceViewItem,
): string {
  if (item.needsAttention) {
    return "plugin.marketplace.status.attention";
  }
  if (item.activatable) {
    return "plugin.marketplace.status.activatable";
  }
  if (item.installable) {
    return "plugin.marketplace.status.installable";
  }
  if (item.installed) {
    return "plugin.marketplace.status.installed";
  }
  return "plugin.marketplace.status.blocked";
}

export function pluginMarketplaceCategoryText(
  item: PluginMarketplaceViewItem,
): string {
  return item.categories.length > 0 ? item.categories.join(" / ") : "-";
}
