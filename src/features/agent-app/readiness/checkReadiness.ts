import type {
  AgentAppPackageVerificationResult,
  AgentAppProjection,
  AgentAppSetupState,
  CapabilityRequirement,
  CapabilitySupport,
  CloudBootstrapApp,
  CloudBootstrapToolAvailability,
  EntryReadiness,
  HostCapabilityProfile,
  NormalizedAppManifest,
  ReadinessIssue,
  ReadinessResult,
  ReadinessStatus,
} from "../types";
import {
  compatibleAgentAppStandardVersions,
  p0HostCapabilityProfile,
} from "./hostCapabilityProfile";
import { checkInstallModesReadiness } from "../install-mode";

function supportsManifestRuntime(manifest: NormalizedAppManifest): boolean {
  return (
    manifest.manifestVersion === "0.2" ||
    manifest.manifestVersion === "0.3" ||
    compatibleAgentAppStandardVersions.includes(manifest.manifestVersion)
  );
}

function isRuntimeTargetSupported(
  manifest: NormalizedAppManifest,
  profile: HostCapabilityProfile,
): boolean {
  return manifest.runtimeTargets.some((target) =>
    profile.runtimeTargets.includes(target),
  );
}

function normalizeRange(range: string): string {
  const normalized = range.trim();
  if (!normalized) {
    return "*";
  }
  const sdkRange = normalized.match(/^@lime\/app-sdk@(.+)$/);
  return sdkRange?.[1] ?? normalized;
}

function supportsRequestedRange(
  hostVersion: string,
  requestedRange: string,
): boolean {
  const normalized = normalizeRange(requestedRange);
  if (normalized === "*") {
    return true;
  }
  if (normalized.startsWith("^")) {
    const requestedMinor = normalized.match(/^\^(\d+)\.(\d+)/);
    const hostMinor = hostVersion.match(/^(\d+)\.(\d+)/);
    return Boolean(
      requestedMinor &&
      hostMinor &&
      requestedMinor[1] === hostMinor[1] &&
      requestedMinor[2] === hostMinor[2],
    );
  }
  if (normalized.includes(hostVersion)) {
    return true;
  }
  if (normalized.includes(">=0.3.0") && normalized.includes("<1.0.0")) {
    return (
      hostVersion.startsWith("0.3.") ||
      hostVersion.startsWith("0.5.") ||
      hostVersion.startsWith("0.6.") ||
      hostVersion.startsWith("0.7.") ||
      hostVersion.startsWith("0.8.") ||
      hostVersion.startsWith("0.9.") ||
      hostVersion.startsWith("0.10.") ||
      hostVersion.startsWith("0.11.")
    );
  }
  if (normalized.includes(">=0.2.0") && normalized.includes("<1.0.0")) {
    return hostVersion.startsWith("0.2.") || hostVersion.startsWith("0.3.");
  }
  if (normalized.includes("0.1.0")) {
    return true;
  }
  return false;
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
      code: support.hostVersion
        ? "CAPABILITY_VERSION_UNSUPPORTED"
        : "CAPABILITY_MISSING",
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
  if (issues.some((issue) => issue.required)) {
    return "needs-setup";
  }
  if (issues.length > 0) {
    return "degraded";
  }
  return "ready";
}

function issueFromCloudTool(
  tool: CloudBootstrapToolAvailability,
): ReadinessIssue | null {
  if (tool.status === "available") {
    return null;
  }
  const severity = tool.required === false ? "warning" : "blocker";
  return {
    code: "CLOUD_TOOL_UNAVAILABLE",
    severity,
    message: `Cloud ToolHub reports ${tool.key} as ${tool.status}.`,
    capability: "lime.tools",
  };
}

function collectCloudReadinessIssues(cloud?: CloudBootstrapApp): {
  blockers: ReadinessIssue[];
  warnings: ReadinessIssue[];
} {
  const blockers: ReadinessIssue[] = [];
  const warnings: ReadinessIssue[] = [];
  if (!cloud) {
    return { blockers, warnings };
  }

  const registrationBlocked =
    cloud.registrationRequired && cloud.registrationState !== "active";
  if (registrationBlocked) {
    blockers.push({
      code: "CLOUD_REGISTRATION_REQUIRED",
      severity: "blocker",
      message: cloud.registrationHint
        ? `Cloud Agent App requires registration: ${cloud.registrationHint}.`
        : "Cloud Agent App requires registration before install or launch.",
    });
  } else if (!cloud.enabled) {
    blockers.push({
      code: "CLOUD_APP_DISABLED",
      severity: "blocker",
      message: cloud.disabledReason
        ? `Cloud tenant enablement disabled this App: ${cloud.disabledReason}.`
        : "Cloud tenant enablement disabled this App.",
    });
  }

  if (cloud.licenseState === "expired" || cloud.licenseState === "revoked") {
    blockers.push({
      code: "CLOUD_LICENSE_UNAVAILABLE",
      severity: "blocker",
      message: `Cloud license state is ${cloud.licenseState}.`,
    });
  } else if (
    cloud.licenseState === "trial" ||
    cloud.licenseState === "unknown"
  ) {
    warnings.push({
      code: "CLOUD_LICENSE_UNAVAILABLE",
      severity: "warning",
      message: `Cloud license state is ${cloud.licenseState}.`,
    });
  }

  cloud.toolAvailability.forEach((tool) => {
    const issue = issueFromCloudTool(tool);
    if (!issue) {
      return;
    }
    if (issue.severity === "blocker") {
      blockers.push(issue);
    } else {
      warnings.push(issue);
    }
  });

  if (cloud.policyDefaults.allowServerAssisted === true) {
    blockers.push({
      code: "CLOUD_POLICY_UNSUPPORTED",
      severity: "blocker",
      message:
        "Cloud policy defaults cannot enable server-assisted runtime locally.",
    });
  }

  return { blockers, warnings };
}

function pushSetupIssue(
  target: { blockers: ReadinessIssue[]; warnings: ReadinessIssue[] },
  params: {
    code: ReadinessIssue["code"];
    kind: string;
    key: string;
    required: boolean;
    message: string;
    remediation: string;
  },
): void {
  const issue: ReadinessIssue = {
    code: params.code,
    kind: params.kind,
    key: params.key,
    required: params.required,
    severity: "warning",
    message: params.message,
    remediation: params.remediation,
  };
  if (issue.severity === "blocker") {
    target.blockers.push(issue);
  } else {
    target.warnings.push(issue);
  }
}

function isSetupResolved(
  setupGroup: Record<string, boolean> | undefined,
  key: string,
): boolean {
  return setupGroup?.[key] === true;
}

function pushSetupIssueWhenMissing(
  target: { blockers: ReadinessIssue[]; warnings: ReadinessIssue[] },
  params: {
    code: ReadinessIssue["code"];
    kind: string;
    key: string;
    required: boolean;
    resolved: boolean;
    message: string;
    remediation: string;
  },
): void {
  if (params.resolved) {
    return;
  }
  pushSetupIssue(target, params);
}

function collectProjectionSetupIssues(
  projection: AgentAppProjection,
  setup?: AgentAppSetupState,
): {
  blockers: ReadinessIssue[];
  warnings: ReadinessIssue[];
} {
  const result = {
    blockers: [] as ReadinessIssue[],
    warnings: [] as ReadinessIssue[],
  };

  projection.knowledgeBindings.forEach((binding) => {
    pushSetupIssueWhenMissing(result, {
      code: "KNOWLEDGE_BINDING_REQUIRED",
      kind: "knowledge",
      key: binding.key,
      required: binding.required,
      resolved: isSetupResolved(setup?.knowledgeBindings, binding.key),
      message: `Knowledge binding ${binding.key} is not configured in this workspace.`,
      remediation: `Bind an Agent Knowledge pack for ${binding.key}.`,
    });
  });

  projection.skillRequirements.forEach((skill) => {
    pushSetupIssueWhenMissing(result, {
      code: "SKILL_REQUIRED",
      kind: "skill",
      key: skill.id,
      required: skill.required,
      resolved: isSetupResolved(setup?.skills, skill.id),
      message: `Skill ${skill.id} is not installed for this App.`,
      remediation: `Install or enable Agent Skill ${skill.id}.`,
    });
  });

  projection.toolRequirements.forEach((tool) => {
    pushSetupIssueWhenMissing(result, {
      code: "TOOL_REQUIRED",
      kind: "tool",
      key: tool.key,
      required: tool.required,
      resolved: isSetupResolved(setup?.tools, tool.key),
      message: `Tool ${tool.key} is not available for this App.`,
      remediation: `Enable ToolHub connector ${tool.key}.`,
    });
  });

  projection.artifactTypes.forEach((artifact) => {
    pushSetupIssueWhenMissing(result, {
      code: "ARTIFACT_TYPE_REQUIRED",
      kind: "artifact",
      key: artifact.key,
      required: artifact.required,
      resolved: isSetupResolved(setup?.artifactTypes, artifact.key),
      message: `Artifact type ${artifact.key} is not verified in this host.`,
      remediation: `Verify Artifact support for ${artifact.key}.`,
    });
  });

  projection.evals.forEach((evalRule) => {
    pushSetupIssueWhenMissing(result, {
      code: "EVAL_REQUIRED",
      kind: "eval",
      key: evalRule.key,
      required: evalRule.required || evalRule.evidenceRequired,
      resolved: isSetupResolved(setup?.evals, evalRule.key),
      message: `Eval ${evalRule.key} is not configured for this App.`,
      remediation: `Configure eval rule ${evalRule.key}.`,
    });
  });

  projection.secrets.forEach((secret) => {
    pushSetupIssueWhenMissing(result, {
      code: "SECRET_REQUIRED",
      kind: "secret",
      key: secret.key,
      required: secret.required,
      resolved: isSetupResolved(setup?.secrets, secret.key),
      message: `Secret ${secret.key} is not bound for this App.`,
      remediation: `Bind secret slot ${secret.key} in the host secret manager.`,
    });
  });

  projection.overlayTemplates.forEach((overlay) => {
    pushSetupIssueWhenMissing(result, {
      code: "OVERLAY_REQUIRED",
      kind: "overlay",
      key: overlay.key,
      required: overlay.required,
      resolved: isSetupResolved(setup?.overlays, overlay.key),
      message: `Overlay ${overlay.key} has not been resolved.`,
      remediation: `Resolve overlay template ${overlay.key} for tenant or workspace.`,
    });
  });

  projection.services.forEach((service) => {
    pushSetupIssueWhenMissing(result, {
      code: "SERVICE_REQUIRED",
      kind: "service",
      key: service.key,
      required: service.required,
      resolved: isSetupResolved(setup?.services, service.key),
      message: `Service ${service.key} is declared but not activated in the host.`,
      remediation: `Enable or review service ${service.key}.`,
    });
  });

  projection.workflows.forEach((workflow) => {
    pushSetupIssueWhenMissing(result, {
      code: "WORKFLOW_REQUIRED",
      kind: "workflow",
      key: workflow.key,
      required: workflow.required,
      resolved: isSetupResolved(setup?.workflows, workflow.key),
      message: `Workflow ${workflow.key} is declared but not activated in the host.`,
      remediation: `Review workflow ${workflow.key} before activation.`,
    });
  });

  return result;
}

function cloudEntryIssue(
  entryKey: string,
  cloud?: CloudBootstrapApp,
): ReadinessIssue | null {
  if (!cloud) {
    return null;
  }
  if (!cloud.enabled) {
    return {
      code: "CLOUD_APP_DISABLED",
      severity: "blocker",
      message: "Cloud tenant enablement disabled this App entry.",
      entryKey,
    };
  }
  if (
    cloud.defaultEntries.length > 0 &&
    !cloud.defaultEntries.includes(entryKey)
  ) {
    return {
      code: "CLOUD_ENTRY_NOT_ENABLED",
      severity: "warning",
      message: `Cloud tenant enablement does not enable entry ${entryKey} by default.`,
      entryKey,
    };
  }
  return null;
}

function packageVerificationIssue(
  verification?: AgentAppPackageVerificationResult,
): ReadinessIssue | null {
  if (!verification || verification.status === "verified") {
    return null;
  }
  if (verification.status === "missing") {
    return {
      code: "PACKAGE_HASH_MISSING",
      severity: "blocker",
      message: verification.message,
    };
  }
  return {
    code: "PACKAGE_HASH_MISMATCH",
    severity: "blocker",
    message: verification.message,
  };
}

export function checkReadiness(params: {
  manifest: NormalizedAppManifest;
  projection: AgentAppProjection;
  profile?: HostCapabilityProfile;
  cloud?: CloudBootstrapApp;
  packageVerification?: AgentAppPackageVerificationResult;
  setup?: AgentAppSetupState;
  checkedAt?: string;
}): ReadinessResult {
  const profile = params.profile ?? p0HostCapabilityProfile;
  const blockers: ReadinessIssue[] = [];
  const warnings: ReadinessIssue[] = [];
  const cloudIssues = collectCloudReadinessIssues(params.cloud);
  const setupIssues = collectProjectionSetupIssues(
    params.projection,
    params.setup,
  );
  const installModes = checkInstallModesReadiness({
    install: params.manifest.install,
    profile,
  });
  const preferredInstallMode = installModes.find(
    (mode) => mode.mode === params.manifest.install.preferredMode,
  );
  blockers.push(...cloudIssues.blockers);
  warnings.push(...cloudIssues.warnings);
  blockers.push(...setupIssues.blockers);
  warnings.push(...setupIssues.warnings);
  if (preferredInstallMode?.status === "blocked") {
    blockers.push(...preferredInstallMode.blockers);
  }

  const packageIssue = packageVerificationIssue(params.packageVerification);
  if (packageIssue) {
    blockers.push(packageIssue);
  }

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
      message:
        "Storage namespace is declared, but P0 does not create local App storage.",
    });
  }

  if (
    params.projection.runtimePackage.hasUiBundle &&
    !profile.featureFlags.uiRuntimeEnabled
  ) {
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
      message:
        "Worker bundle is declared, but P0 keeps worker runtime disabled.",
    });
  }

  const capabilitySupports = params.projection.requiredCapabilities.map(
    (requirement) => capabilitySupport(requirement, profile),
  );

  capabilitySupports.forEach((support, index) => {
    const issue = issueForCapability(
      params.projection.requiredCapabilities[index],
      support,
    );
    if (!issue) {
      return;
    }
    if (issue.severity === "blocker") {
      blockers.push(issue);
    } else {
      warnings.push(issue);
    }
  });

  const entryReadiness: EntryReadiness[] = params.projection.entries.map(
    (entry) => {
      const entryIssues = entry.requiredCapabilities
        .map((requirement) =>
          issueForCapability(
            requirement,
            capabilitySupport(requirement, profile),
          ),
        )
        .filter((issue): issue is ReadinessIssue => Boolean(issue));
      const cloudIssue = cloudEntryIssue(entry.key, params.cloud);
      if (cloudIssue) {
        entryIssues.push(cloudIssue);
      }

      return {
        entryKey: entry.key,
        status: entryStatus(entryIssues),
        issues: entryIssues,
      };
    },
  );

  const status: ReadinessStatus = blockers.length
    ? "blocked"
    : warnings.some((issue) => issue.required)
      ? "needs-setup"
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
    missingCapabilities: params.projection.requiredCapabilities.filter(
      (requirement, index) => {
        const support = capabilitySupports[index];
        return !support.supported || !support.enabled;
      },
    ),
    entryReadiness,
    installModes,
  };
}
