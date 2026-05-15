import type { CapabilityHost } from "../sdk/CapabilityHost";
import type { AgentAppUninstallResult, AppCleanupPlan } from "../types";

export interface AgentAppInstalledStateRepository {
  remove(appId: string): Promise<boolean>;
}

export async function uninstallApp(params: {
  host: CapabilityHost;
  cleanupPlan: AppCleanupPlan;
  deleteData: boolean;
  installedStateRepository?: AgentAppInstalledStateRepository;
}): Promise<AgentAppUninstallResult> {
  const result = await params.host.uninstall({
    cleanupPlan: params.cleanupPlan,
    deleteData: params.deleteData,
  });
  await params.installedStateRepository?.remove(result.appId);
  return result;
}
