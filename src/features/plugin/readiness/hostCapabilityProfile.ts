import { defaultPluginHostFlags } from "../featureFlag";
import type { HostCapabilityProfile } from "../types";
import { buildLimeCapabilityProfileEntriesForMode } from "../sdk/capabilityCatalog";

export const currentPluginHostRuntimeVersion = "0.11.0";
export const currentPluginStandardVersion = "0.11";
export const compatiblePluginStandardVersions = [
  "0.5",
  "0.6",
  "0.7",
  "0.8",
  "0.9",
  "0.10",
  "0.11",
];

export const p0HostCapabilityProfile: HostCapabilityProfile = {
  appRuntimeVersion: currentPluginHostRuntimeVersion,
  standardVersions: {
    current: currentPluginStandardVersion,
    compatible: [...compatiblePluginStandardVersions],
  },
  runtimeTargets: ["local"],
  capabilities: buildLimeCapabilityProfileEntriesForMode("base"),
  featureFlags: defaultPluginHostFlags,
};
