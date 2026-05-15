import { resolveAgentAppHostFlags } from "../featureFlag";
import { p0HostCapabilityProfile } from "../readiness/hostCapabilityProfile";
import type { AgentAppHostFlags, HostCapabilityProfile } from "../types";

const MOCK_CAPABILITIES = [
  "lime.ui",
  "lime.storage",
  "lime.files",
  "lime.artifacts",
  "lime.evidence",
  "lime.agent",
  "lime.knowledge",
  "lime.tools",
  "lime.workflow",
] as const;

export function buildMockCapabilityProfile(
  flagOverrides: Partial<AgentAppHostFlags> = {},
): HostCapabilityProfile {
  const featureFlags = resolveAgentAppHostFlags({
    ...flagOverrides,
    labEnabled: true,
    mockSdkEnabled: true,
  });
  const capabilities: HostCapabilityProfile["capabilities"] = {
    ...p0HostCapabilityProfile.capabilities,
  };

  MOCK_CAPABILITIES.forEach((capability) => {
    capabilities[capability] = {
      version: capabilities[capability]?.version ?? "0.3.0",
      enabled: true,
      implementation: "mock",
    };
  });

  return {
    ...p0HostCapabilityProfile,
    capabilities,
    featureFlags,
  };
}
