import type { PluginMarketplaceViewItem } from "./marketplace/pluginMarketplaceViewModel";

export function shouldShowPluginMarketplaceRegistrationPanel(
  item: PluginMarketplaceViewItem,
): boolean {
  return (
    !item.installed &&
    item.policy.authentication === "ON_INSTALL" &&
    Boolean(item.appId?.trim())
  );
}
