import { buildAdapterCapabilityProfile } from "../adapters/adapterCapabilityProfile";
import { resolvePluginHostFlags } from "../featureFlag";
import { p0HostCapabilityProfile } from "../readiness/hostCapabilityProfile";
import type { PluginHostFlags, HostCapabilityProfile } from "../types";

export function buildUiRuntimeCapabilityProfile(
  flagOverrides: Partial<PluginHostFlags> = {},
): HostCapabilityProfile {
  const featureFlags = resolvePluginHostFlags({
    ...flagOverrides,
    labEnabled: true,
    uiRuntimeEnabled: true,
    workerRuntimeEnabled: false,
  });
  const baseProfile = featureFlags.realAdapterEnabled
    ? buildAdapterCapabilityProfile(featureFlags)
    : p0HostCapabilityProfile;

  return {
    ...baseProfile,
    capabilities: {
      ...baseProfile.capabilities,
      "lime.ui": {
        version: baseProfile.capabilities["lime.ui"]?.version ?? "0.3.0",
        enabled: true,
        implementation: "native",
      },
    },
    featureFlags: {
      ...baseProfile.featureFlags,
      ...featureFlags,
      labEnabled: true,
      uiRuntimeEnabled: true,
      workerRuntimeEnabled: false,
    },
  };
}
