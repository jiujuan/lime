import { resolvePluginHostFlags } from "../featureFlag";
import { p0HostCapabilityProfile } from "../readiness/hostCapabilityProfile";
import { buildLimeCapabilityProfileEntriesForMode } from "../sdk/capabilityCatalog";
import type { PluginHostFlags, HostCapabilityProfile } from "../types";

export function buildAdapterCapabilityProfile(
  flagOverrides: Partial<PluginHostFlags> = {},
): HostCapabilityProfile {
  const featureFlags = resolvePluginHostFlags({
    ...flagOverrides,
    labEnabled: true,
    realAdapterEnabled: true,
    localStorageEnabled: true,
    mockSdkEnabled: false,
  });

  return {
    ...p0HostCapabilityProfile,
    capabilities: buildLimeCapabilityProfileEntriesForMode("adapter"),
    featureFlags,
  };
}
