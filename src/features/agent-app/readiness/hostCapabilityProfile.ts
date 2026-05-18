import { defaultAgentAppHostFlags } from "../featureFlag";
import type { HostCapabilityProfile } from "../types";
import { buildLimeCapabilityProfileEntriesForMode } from "../sdk/capabilityCatalog";

export const currentAgentAppHostRuntimeVersion = "0.8.0";
export const currentAgentAppStandardVersion = "0.8";
export const compatibleAgentAppStandardVersions = ["0.5", "0.6", "0.7", "0.8"];

export const p0HostCapabilityProfile: HostCapabilityProfile = {
  appRuntimeVersion: currentAgentAppHostRuntimeVersion,
  standardVersions: {
    current: currentAgentAppStandardVersion,
    compatible: [...compatibleAgentAppStandardVersions],
  },
  runtimeTargets: ["local"],
  capabilities: buildLimeCapabilityProfileEntriesForMode("base"),
  featureFlags: defaultAgentAppHostFlags,
};
