import { resolveAgentAppHostFlags } from "../featureFlag";
import { p0HostCapabilityProfile } from "../readiness/hostCapabilityProfile";
import { buildLimeCapabilityProfileEntriesForMode } from "../sdk/capabilityCatalog";
import type { AgentAppHostFlags, HostCapabilityProfile } from "../types";

export function buildAdapterCapabilityProfile(
  flagOverrides: Partial<AgentAppHostFlags> = {},
): HostCapabilityProfile {
  const featureFlags = resolveAgentAppHostFlags({
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
