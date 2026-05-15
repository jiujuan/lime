import { buildAdapterCapabilityProfile } from "../adapters/adapterCapabilityProfile";
import { resolveAgentAppHostFlags } from "../featureFlag";
import { p0HostCapabilityProfile } from "../readiness/hostCapabilityProfile";
import { buildMockCapabilityProfile } from "../sdk/mockCapabilityProfile";
import type { AgentAppHostFlags, HostCapabilityProfile } from "../types";

export function buildUiRuntimeCapabilityProfile(
  flagOverrides: Partial<AgentAppHostFlags> = {},
): HostCapabilityProfile {
  const featureFlags = resolveAgentAppHostFlags({
    ...flagOverrides,
    labEnabled: true,
    uiRuntimeEnabled: true,
    workerRuntimeEnabled: false,
  });
  const baseProfile = featureFlags.realAdapterEnabled
    ? buildAdapterCapabilityProfile(featureFlags)
    : featureFlags.mockSdkEnabled
      ? buildMockCapabilityProfile(featureFlags)
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
