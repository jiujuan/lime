import { resolveAgentAppHostFlags } from "../featureFlag";
import { p0HostCapabilityProfile } from "../readiness/hostCapabilityProfile";
import type { AgentAppHostFlags, HostCapabilityProfile } from "../types";

const HYBRID_CAPABILITIES = [
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

const ADAPTER_CAPABILITIES = new Set<string>([
  "lime.storage",
  "lime.artifacts",
  "lime.evidence",
  "lime.agent",
  "lime.knowledge",
]);

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
  const capabilities: HostCapabilityProfile["capabilities"] = {
    ...p0HostCapabilityProfile.capabilities,
  };

  HYBRID_CAPABILITIES.forEach((capability) => {
    capabilities[capability] = {
      version: capabilities[capability]?.version ?? "0.3.0",
      enabled: true,
      implementation: ADAPTER_CAPABILITIES.has(capability) ? "adapter" : "mock",
    };
  });

  return {
    ...p0HostCapabilityProfile,
    capabilities,
    featureFlags,
  };
}
