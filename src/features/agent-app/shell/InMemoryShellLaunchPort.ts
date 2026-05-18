import type {
  ShellDescriptor,
  ShellLaunchPort,
  ShellLaunchReadiness,
  ShellLaunchResult,
} from "./ShellLaunchPort";

function expectedShellKind(mode: ShellDescriptor["installMode"]) {
  if (mode === "standalone") {
    return "app_shell";
  }
  if (mode === "runtime_backed") {
    return "runtime_backed";
  }
  return "desktop";
}

function readinessBlockers(
  descriptor: ShellDescriptor,
): ShellLaunchReadiness["blockers"] {
  const blockers: ShellLaunchReadiness["blockers"] = [];
  if (descriptor.installMode !== "standalone" && descriptor.installMode !== "runtime_backed") {
    blockers.push({
      code: "SHELL_INSTALL_MODE_UNSUPPORTED",
      message: `Shell launch only supports standalone or runtime_backed, got ${descriptor.installMode}.`,
    });
  }
  if (!descriptor.packageHash || !descriptor.manifestHash) {
    blockers.push({
      code: "PACKAGE_IDENTITY_MISSING",
      message: "Shell launch requires packageHash and manifestHash.",
    });
  }
  if (descriptor.runtimeProfile.installMode !== descriptor.installMode) {
    blockers.push({
      code: "RUNTIME_PROFILE_MISMATCH",
      message: `Runtime profile mode ${descriptor.runtimeProfile.installMode} does not match ${descriptor.installMode}.`,
    });
  }
  if (descriptor.runtimeProfile.shellKind !== expectedShellKind(descriptor.installMode)) {
    blockers.push({
      code: "SHELL_KIND_MISMATCH",
      message: `Runtime profile shell kind ${descriptor.runtimeProfile.shellKind} does not match ${descriptor.installMode}.`,
    });
  }
  if (
    descriptor.isolation.packageMount !== "read-only" ||
    descriptor.isolation.secrets !== "refs-only" ||
    descriptor.isolation.sideEffects !== "runtime-broker" ||
    descriptor.isolation.evidence !== "runtime-provenance"
  ) {
    blockers.push({
      code: "ISOLATION_POLICY_INVALID",
      message: "Shell launch requires read-only package, ref-only secrets, runtime-broker side effects and runtime provenance.",
    });
  }
  return blockers;
}

export class InMemoryShellLaunchPort implements ShellLaunchPort {
  private readonly launched = new Map<string, ShellDescriptor>();

  async canLaunch(descriptor: ShellDescriptor): Promise<ShellLaunchReadiness> {
    const blockers = readinessBlockers(descriptor);
    return {
      status: blockers.length > 0 ? "blocked" : "ready",
      blockers,
    };
  }

  async launch(descriptor: ShellDescriptor): Promise<ShellLaunchResult> {
    const readiness = await this.canLaunch(descriptor);
    if (readiness.status === "blocked") {
      return {
        status: "blocked",
        descriptor,
        blockerCodes: readiness.blockers.map((blocker) => blocker.code),
      };
    }
    this.launched.set(`${descriptor.appId}:${descriptor.entry.entryKey}`, descriptor);
    return {
      status: "launched",
      descriptor,
      blockerCodes: [],
    };
  }

  getLaunchedDescriptors(): ShellDescriptor[] {
    return Array.from(this.launched.values()).map((descriptor) =>
      structuredClone(descriptor),
    );
  }
}
