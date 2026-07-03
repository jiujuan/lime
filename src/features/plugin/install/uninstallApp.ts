import type { CapabilityHost } from "../sdk/CapabilityHost";
import type { PluginUninstallResult, AppCleanupPlan } from "../types";

export interface PluginInstalledStateRepository {
  remove(appId: string): Promise<boolean>;
}

export async function uninstallApp(params: {
  host: CapabilityHost;
  cleanupPlan: AppCleanupPlan;
  deleteData: boolean;
  installedStateRepository?: PluginInstalledStateRepository;
}): Promise<PluginUninstallResult> {
  const result = await params.host.uninstall({
    cleanupPlan: params.cleanupPlan,
    deleteData: params.deleteData,
  });
  await params.installedStateRepository?.remove(result.appId);
  return result;
}
