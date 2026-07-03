import type {
  PluginInstallMode,
  LimeRuntimeProfile,
  ReadinessIssue,
} from "../types";

export function runtimeProfileIssueForInstallMode(params: {
  profile: LimeRuntimeProfile;
  installMode: PluginInstallMode;
}): ReadinessIssue | null {
  if (params.profile.installMode !== params.installMode) {
    return {
      code: "RUNTIME_PROFILE_MISSING",
      severity: "blocker",
      message: `Runtime profile was resolved for ${params.profile.installMode}, not ${params.installMode}.`,
      kind: "install-mode",
      key: params.installMode,
      required: true,
      remediation: "Resolve a fresh LimeRuntimeProfile for the selected install mode before launch.",
    };
  }
  return null;
}
