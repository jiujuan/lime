import { buildAdapterCapabilityProfile } from "../adapters/adapterCapabilityProfile";
import { resolveAgentAppHostFlags } from "../featureFlag";
import { p0HostCapabilityProfile } from "../readiness/hostCapabilityProfile";
import type { AgentAppHostFlags, HostCapabilityProfile } from "../types";

export function buildWorkflowRuntimeCapabilityProfile(
  flagOverrides: Partial<AgentAppHostFlags> = {},
): HostCapabilityProfile {
  const featureFlags = resolveAgentAppHostFlags({
    ...flagOverrides,
    labEnabled: true,
    workerRuntimeEnabled: true,
  });
  const baseProfile = featureFlags.realAdapterEnabled
    ? buildAdapterCapabilityProfile(featureFlags)
    : p0HostCapabilityProfile;

  return {
    ...baseProfile,
    capabilities: {
      ...baseProfile.capabilities,
      "lime.workflow": {
        version: baseProfile.capabilities["lime.workflow"]?.version ?? "0.3.0",
        enabled: true,
        implementation: "native",
      },
      "lime.ui": {
        version: baseProfile.capabilities["lime.ui"]?.version ?? "0.3.0",
        enabled: featureFlags.uiRuntimeEnabled || baseProfile.capabilities["lime.ui"]?.enabled === true,
        implementation: featureFlags.uiRuntimeEnabled
          ? "native"
          : baseProfile.capabilities["lime.ui"]?.implementation ?? "none",
      },
    },
    featureFlags: {
      ...baseProfile.featureFlags,
      ...featureFlags,
      labEnabled: true,
      workerRuntimeEnabled: true,
    },
  };
}
