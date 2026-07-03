import type {
  PluginInstallMode,
  LimeRuntimeProfile,
  LimeRuntimeShellKind,
} from "../types";

export function shellKindForInstallMode(
  installMode: PluginInstallMode,
): LimeRuntimeShellKind {
  if (installMode === "standalone") {
    return "app_shell";
  }
  if (installMode === "runtime_backed") {
    return "runtime_backed";
  }
  if (installMode === "web_host") {
    return "web_host";
  }
  return "desktop";
}

export function summarizeRuntimeProfile(profile: LimeRuntimeProfile): {
  runtimeId: string;
  runtimeVersion: string;
  shellKind: LimeRuntimeShellKind;
  installMode: PluginInstallMode;
  availableCapabilityCount: number;
  unavailableCapabilityCount: number;
} {
  const capabilities = Object.values(profile.capabilities);
  return {
    runtimeId: profile.runtimeId,
    runtimeVersion: profile.runtimeVersion,
    shellKind: profile.shellKind,
    installMode: profile.installMode,
    availableCapabilityCount: capabilities.filter((capability) => capability.available).length,
    unavailableCapabilityCount: capabilities.filter((capability) => !capability.available).length,
  };
}
