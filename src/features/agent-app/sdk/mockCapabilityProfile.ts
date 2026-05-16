import { resolveAgentAppHostFlags } from "../featureFlag";
import { p0HostCapabilityProfile } from "../readiness/hostCapabilityProfile";
import type { AgentAppHostFlags, HostCapabilityProfile } from "../types";
import { buildLimeCapabilityProfileEntriesForMode } from "./capabilityCatalog";

export function buildMockCapabilityProfile(
  flagOverrides: Partial<AgentAppHostFlags> = {},
): HostCapabilityProfile {
  const featureFlags = resolveAgentAppHostFlags({
    ...flagOverrides,
    labEnabled: true,
    mockSdkEnabled: true,
  });

  return {
    ...p0HostCapabilityProfile,
    capabilities: buildLimeCapabilityProfileEntriesForMode("mock"),
    featureFlags,
  };
}
