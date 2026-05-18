import type {
  AgentAppInstallMode,
  HostCapabilityProfile,
  InstallModeReadiness,
  NormalizedAgentAppInstallContract,
  ReadinessIssue,
} from "../types";

function parseVersion(value: string | undefined): [number, number, number] | undefined {
  if (!value) {
    return undefined;
  }
  const match = value.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return undefined;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersion(left: string | undefined, right: string | undefined): number {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  if (!leftParts || !rightParts) {
    return 0;
  }
  for (let index = 0; index < leftParts.length; index += 1) {
    const diff = leftParts[index] - rightParts[index];
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

function runtimeMinVersionForMode(
  install: NormalizedAgentAppInstallContract,
  mode: AgentAppInstallMode,
): string | undefined {
  if (mode === "runtime_backed") {
    return install.runtimeBacked?.minVersion ?? install.runtime.runtimeBacked?.minVersion ?? install.runtime.minVersion;
  }
  return install.runtime.minVersion;
}

function shellKindForMode(mode: AgentAppInstallMode): string {
  if (mode === "standalone") {
    return "Lime App Shell";
  }
  if (mode === "runtime_backed") {
    return "system Lime Runtime";
  }
  if (mode === "web_host") {
    return "Web Host";
  }
  return "Lime Desktop";
}

function unsupportedWebHostIssue(mode: AgentAppInstallMode): ReadinessIssue {
  return {
    code: "INSTALL_MODE_UNSUPPORTED",
    severity: "blocker",
    message: "web_host is reserved in Agent App v2 and is not launchable in the Lime desktop client yet.",
    kind: "install-mode",
    key: mode,
    required: true,
    remediation: "Choose in_lime, standalone, or runtime_backed until the web host contract is implemented.",
  };
}

function runtimeVersionIssue(params: {
  mode: AgentAppInstallMode;
  minVersion: string;
  profile: HostCapabilityProfile;
}): ReadinessIssue {
  return {
    code: "RUNTIME_VERSION_UNSUPPORTED",
    severity: "blocker",
    message: `${shellKindForMode(params.mode)} requires Lime Runtime ${params.minVersion}, but host runtime is ${params.profile.appRuntimeVersion}.`,
    kind: "install-mode",
    key: params.mode,
    required: true,
    remediation: `Upgrade Lime Runtime to ${params.minVersion} or choose another install mode.`,
  };
}

export function checkInstallModeReadiness(params: {
  install: NormalizedAgentAppInstallContract;
  profile: HostCapabilityProfile;
  mode: AgentAppInstallMode;
}): InstallModeReadiness {
  const blockers: ReadinessIssue[] = [];
  const minVersion = runtimeMinVersionForMode(params.install, params.mode);

  if (params.mode === "web_host") {
    blockers.push(unsupportedWebHostIssue(params.mode));
  }
  if (minVersion && compareVersion(params.profile.appRuntimeVersion, minVersion) < 0) {
    blockers.push(
      runtimeVersionIssue({
        mode: params.mode,
        minVersion,
        profile: params.profile,
      }),
    );
  }

  return {
    mode: params.mode,
    status: blockers.length > 0 ? "blocked" : "ready",
    blockers,
    setupActions: blockers.map((blocker) => ({
      code:
        blocker.code === "RUNTIME_VERSION_UNSUPPORTED"
          ? "upgrade_lime_runtime"
          : "select_install_mode",
      label: blocker.remediation ?? blocker.message,
      mode: params.mode,
    })),
    evidencePolicy: params.mode === "web_host" ? "optional" : "required",
    runtimeVersion: params.profile.appRuntimeVersion,
  };
}

export function checkInstallModesReadiness(params: {
  install: NormalizedAgentAppInstallContract;
  profile: HostCapabilityProfile;
}): InstallModeReadiness[] {
  return params.install.supportedModes.map((mode) =>
    checkInstallModeReadiness({
      install: params.install,
      profile: params.profile,
      mode,
    }),
  );
}
