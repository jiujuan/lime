import { resolvePluginHostFlags } from "../featureFlag";
import { p0HostCapabilityProfile } from "../readiness/hostCapabilityProfile";
import type { PluginHostFlags, HostCapabilityProfile } from "../types";
import { buildLimeCapabilityProfileEntriesForMode } from "./capabilityCatalog";
import { assertTestMockSdkEnvironment } from "./mockEnvironment";

export function buildMockCapabilityProfile(
  flagOverrides: Partial<PluginHostFlags> = {},
): HostCapabilityProfile {
  assertTestMockSdkEnvironment("buildMockCapabilityProfile");
  const featureFlags = resolvePluginHostFlags({
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
