import type {
  AgentAppProjection,
  CapabilityRequirement,
  CapabilitySupport,
  EntryReadiness,
  HostCapabilityProfile,
  NormalizedAppManifest,
  ReadinessIssue,
  ReadinessResult,
  ReadinessStatus,
} from "../types";
import { p0HostCapabilityProfile } from "./hostCapabilityProfile";

function supportsManifestRuntime(manifest: NormalizedAppManifest): boolean {
  return manifest.manifestVersion === "0.2";
}

function isRuntimeTargetSupported(
  manifest: NormalizedAppManifest,
  profile: HostCapabilityProfile,
): boolean {
  return manifest.runtimeTargets.some((target) => profile.runtimeTargets.includes(target));
}

function normalizeRange(range: string): string {
  return range.trim() || "*";
}

function supportsRequestedRange(hostVersion: string, requestedRange: string): boolean {
  const normalized = normalizeRange(requestedRange);
  if (normalized === "*" || normalized.startsWith("^0.1") || normalized.includes("0.1.0")) {
    return true;
  }
  return normalized.includes(hostVersion);
}

function capabilitySupport(
  requirement: CapabilityRequirement,
  profile: HostCapabilityProfile,
): CapabilitySupport {
  const host = profile.capabilities[requirement.capability];
  if (!host) {
    return {
      capability: requirement.capability,
      requestedRange: requirement.requestedRange,
      supported: false,
      enabled: false,
      implementation: "none",
    };
  }

  return {
    capability: requirement.capability,
    requestedRange: requirement.requestedRange,
    hostVersion: host.version,
    supported: supportsRequestedRange(host.version, requirement.requestedRange),
    enabled: host.enabled,
    implementation: host.implementation,
  };
}

function issueForCapability(
  requirement: CapabilityRequirement,
  support: CapabilitySupport,
): ReadinessIssue | null {
  if (!support.supported) {
    return {
      code: support.hostVersion ? "CAPABILITY_VERSION_UNSUPPORTED" : "CAPABILITY_MISSING",
      severity: requirement.required ? "blocker" : "warning",
      message: `${requirement.capability} is not available for ${requirement.requestedRange}.`,
      capability: requirement.capability,
      entryKey: requirement.entryKey,
    };
  }

  if (!support.enabled) {
    return {
      code: "CAPABILITY_MISSING",
      severity: requirement.required ? "blocker" : "warning",
      message: `${requirement.capability} is declared but not enabled in P0 host profile.`,
      capability: requirement.capability,
      entryKey: requirement.entryKey,
    };
  }

  return null;
}

function entryStatus(issues: ReadinessIssue[]): ReadinessStatus {
  if (issues.some((issue) => issue.severity === "blocker")) {
    return "blocked";
  }
  if (issues.length > 0) {
    return "degraded";
  }
  return "ready";
}

export function checkReadiness(params: {
  manifest: NormalizedAppManifest;
  projection: AgentAppProjection;
  profile?: HostCapabilityProfile;
  checkedAt?: string;
}): ReadinessResult {
  const profile = params.profile ?? p0HostCapabilityProfile;
  const blockers: ReadinessIssue[] = [];
  const warnings: ReadinessIssue[] = [];

  if (!supportsManifestRuntime(params.manifest)) {
    blockers.push({
      code: "MANIFEST_VERSION_UNSUPPORTED",
      severity: "blocker",
      message: `Manifest version ${params.manifest.manifestVersion} is not supported.`,
    });
  }

  if (!isRuntimeTargetSupported(params.manifest, profile)) {
    blockers.push({
      code: "RUNTIME_TARGET_UNSUPPORTED",
      severity: "blocker",
      message: `Runtime targets ${params.manifest.runtimeTargets.join(", ")} are not supported by this host.`,
    });
  }

  if (params.projection.storage && !profile.featureFlags.localStorageEnabled) {
    warnings.push({
      code: "STORAGE_DECLARED_BUT_DISABLED",
      severity: "warning",
      message: "Storage namespace is declared, but P0 does not create local App storage.",
    });
  }

  if (params.projection.runtimePackage.hasUiBundle && !profile.featureFlags.uiRuntimeEnabled) {
    warnings.push({
      code: "UI_RUNTIME_DISABLED",
      severity: "warning",
      message: "UI bundle is declared, but P0 keeps App UI runtime disabled.",
    });
  }

  if (
    params.projection.runtimePackage.hasWorkerBundle &&
    !profile.featureFlags.workerRuntimeEnabled
  ) {
    warnings.push({
      code: "WORKER_RUNTIME_DISABLED",
      severity: "warning",
      message: "Worker bundle is declared, but P0 keeps worker runtime disabled.",
    });
  }

  const capabilitySupports = params.projection.requiredCapabilities.map((requirement) =>
    capabilitySupport(requirement, profile),
  );

  capabilitySupports.forEach((support, index) => {
    const issue = issueForCapability(params.projection.requiredCapabilities[index], support);
    if (!issue) {
      return;
    }
    if (issue.severity === "blocker") {
      blockers.push(issue);
    } else {
      warnings.push(issue);
    }
  });

  const entryReadiness: EntryReadiness[] = params.projection.entries.map((entry) => {
    const entryIssues = entry.requiredCapabilities
      .map((requirement) => issueForCapability(requirement, capabilitySupport(requirement, profile)))
      .filter((issue): issue is ReadinessIssue => Boolean(issue));

    return {
      entryKey: entry.key,
      status: entryStatus(entryIssues),
      issues: entryIssues,
    };
  });

  const status: ReadinessStatus = blockers.length
    ? "blocked"
    : warnings.length
      ? "degraded"
      : "ready";

  return {
    appId: params.projection.app.appId,
    status,
    checkedAt: params.checkedAt ?? new Date().toISOString(),
    blockers,
    warnings,
    supportedCapabilities: capabilitySupports,
    missingCapabilities: params.projection.requiredCapabilities.filter((requirement, index) => {
      const support = capabilitySupports[index];
      return !support.supported || !support.enabled;
    }),
    entryReadiness,
  };
}
