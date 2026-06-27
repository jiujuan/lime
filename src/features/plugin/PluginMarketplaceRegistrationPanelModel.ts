import type { PluginMarketplaceViewItem } from "./marketplace/pluginMarketplaceViewModel";

function hasPluginMarketplaceRegistrationTarget(
  item: PluginMarketplaceViewItem,
): boolean {
  if (item.sourceKind === "plugin_catalog") {
    return Boolean(item.pluginName.trim());
  }
  return Boolean(item.appId?.trim());
}

export function shouldShowPluginMarketplaceRegistrationPanel(
  item: PluginMarketplaceViewItem,
): boolean {
  return (
    !item.installed &&
    item.policy.authentication === "ON_INSTALL" &&
    hasPluginMarketplaceRegistrationTarget(item)
  );
}
