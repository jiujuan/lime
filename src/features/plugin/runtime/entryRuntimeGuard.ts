import type {
  PluginHostFlags,
  PluginInstallMode,
  PluginPackageVerificationResult,
  PluginProvenance,
  CapabilityRequirement,
  CapabilitySupport,
  InstalledAppPreview,
  LimeRuntimeProfile,
  LimeRuntimeShellKind,
  ProjectedEntry,
  ReadinessIssue,
} from "../types";
import {
  runtimeProfileIssueForInstallMode,
  summarizeRuntimeProfile,
} from "../runtime-profile";
import type {
  PluginRuntimePackageDescriptor,
  PluginRuntimePackageLoadResult,
  PluginRuntimePackagePolicyEvidence,
} from "./runtimePackageLoader";
import { pluginUiSandboxPolicy } from "./uiExtensionHost";

const UI_ENTRY_KINDS = new Set<string>(["page", "panel", "settings"]);
const DEFAULT_POLICY_EVIDENCE: PluginRuntimePackagePolicyEvidence = {
  rawWorkerAllowed: false,
  networkAllowed: false,
  fileSystemAllowed: false,
  rawHostApiAllowed: false,
  nodeApiAllowed: false,
  sandboxPolicy: pluginUiSandboxPolicy,
};

export type PluginEntryRuntimeGuardStatus =
  | "allow"
  | "needs-setup"
  | "blocked"
  | "denied";

export type PluginPermissionDecision =
  | "not-required"
  | "requires-review"
  | "accepted"
  | "denied";

export type PluginEntryRuntimeGuardOperation = "run-entry" | "mount-ui";

export interface PluginEntryRuntimeGuardIssue {
  code: string;
  severity: "blocker" | "warning";
  message: string;
  capability?: string;
  entryKey?: string;
  kind?: string;
  key?: string;
  required?: boolean;
  remediation?: string;
}

export interface PluginPermissionPromptCapability {
  capability: string;
  requestedRange: string;
  implementation: CapabilitySupport["implementation"];
  required: boolean;
}

export interface PluginPermissionPromptPermission {
  key: string;
  reason: string;
  required: boolean;
}

export interface PluginPermissionPromptSetupItem {
  kind: string;
  key: string;
  required: boolean;
  resolved: boolean;
  remediation?: string;
}

export interface PluginPermissionPromptRuntimeProfile {
  runtimeId: string;
  runtimeVersion: string;
  shellKind: LimeRuntimeShellKind;
  installMode: PluginInstallMode;
  availableCapabilityCount: number;
  unavailableCapabilityCount: number;
}

export interface PluginPermissionPromptDescriptor {
  appId: string;
  appVersion: string;
  entryKey: string;
  entryTitle: string;
  packageHash: string;
  manifestHash: string;
  decision: PluginPermissionDecision;
  requestedCapabilities: PluginPermissionPromptCapability[];
  requestedPermissions: PluginPermissionPromptPermission[];
  setupSummary: PluginPermissionPromptSetupItem[];
  policySummary: Pick<
    PluginRuntimePackagePolicyEvidence,
    | "rawWorkerAllowed"
    | "networkAllowed"
    | "fileSystemAllowed"
    | "rawHostApiAllowed"
    | "nodeApiAllowed"
  >;
  runtimeProfile?: PluginPermissionPromptRuntimeProfile;
  secretSlots: Array<{
    key: string;
    provider?: string;
    required: boolean;
  }>;
  warnings: string[];
}

export interface PluginEntryRuntimeGuardResult {
  status: PluginEntryRuntimeGuardStatus;
  entry?: ProjectedEntry;
  prompt?: PluginPermissionPromptDescriptor;
  blockers: PluginEntryRuntimeGuardIssue[];
  warnings: PluginEntryRuntimeGuardIssue[];
  provenance: PluginProvenance;
}

export interface PluginEntryRuntimeLifecycleState {
  disabled?: boolean;
  cleanupStatus?: "ready" | "blocked";
  cleanupBlockerCodes?: string[];
}

export interface EvaluatePluginEntryRuntimeGuardParams {
  preview: InstalledAppPreview;
  entryKey: string;
  flags: PluginHostFlags;
  operation?: PluginEntryRuntimeGuardOperation;
  runtimePackageLoad?: PluginRuntimePackageLoadResult;
  runtimeDescriptor?: PluginRuntimePackageDescriptor;
  packageVerification?: PluginPackageVerificationResult;
  permissionDecision?: PluginPermissionDecision;
  lifecycle?: PluginEntryRuntimeLifecycleState;
  installMode?: PluginInstallMode;
  runtimeProfile?: LimeRuntimeProfile;
}

function toGuardIssue(issue: ReadinessIssue): PluginEntryRuntimeGuardIssue {
  return {
    code: issue.code,
    severity: issue.severity,
    message: issue.message,
    capability: issue.capability,
    entryKey: issue.entryKey,
    kind: issue.kind,
    key: issue.key,
    required: issue.required,
    remediation: issue.remediation,
  };
}

function asLaunchWarning(
  issue: PluginEntryRuntimeGuardIssue,
): PluginEntryRuntimeGuardIssue {
  return {
    ...issue,
    severity: "warning",
  };
}

function packageVerificationIssue(
  verification: PluginPackageVerificationResult | undefined,
): PluginEntryRuntimeGuardIssue | null {
  if (!verification || verification.status === "verified") {
    return null;
  }
  return {
    code:
      verification.status === "missing"
        ? "PACKAGE_HASH_MISSING"
        : "PACKAGE_HASH_MISMATCH",
    severity: "blocker",
    message: verification.message,
  };
}

function runtimeLoadIssues(
  result: PluginRuntimePackageLoadResult | undefined,
): PluginEntryRuntimeGuardIssue[] {
  if (!result || result.status === "loaded") {
    return [];
  }
  return result.issues.map((issue) => ({
    code: issue.code,
    severity: "blocker" as const,
    message: issue.message,
    entryKey: issue.entryKey,
  }));
}

function lifecycleIssues(
  lifecycle: PluginEntryRuntimeLifecycleState | undefined,
  entryKey: string,
): PluginEntryRuntimeGuardIssue[] {
  const issues: PluginEntryRuntimeGuardIssue[] = [];
  if (lifecycle?.disabled) {
    issues.push({
      code: "PLUGIN_DISABLED",
      severity: "blocker",
      message: "Plugin lifecycle state is disabled.",
      entryKey,
    });
  }
  if (lifecycle?.cleanupStatus === "blocked") {
    const blockers = lifecycle.cleanupBlockerCodes?.join(", ");
    issues.push({
      code: "CLEANUP_BLOCKED",
      severity: "blocker",
      message: blockers
        ? `Plugin cleanup rehearsal is blocked: ${blockers}.`
        : "Plugin cleanup rehearsal is blocked.",
      entryKey,
    });
  }
  return issues;
}

function runtimeProfileIssues(params: {
  runtimeProfile?: LimeRuntimeProfile;
  installMode: PluginInstallMode;
  entryKey: string;
}): PluginEntryRuntimeGuardIssue[] {
  if (!params.runtimeProfile) {
    if (params.installMode === "in_lime") {
      return [];
    }
    return [
      {
        code: "RUNTIME_PROFILE_MISSING",
        severity: "blocker",
        message: `Runtime profile is required before launching install mode ${params.installMode}.`,
        entryKey: params.entryKey,
        kind: "install-mode",
        key: params.installMode,
        required: true,
        remediation:
          "Resolve LimeRuntimeProfile through RuntimeProfilePort before launching this Plugin entry.",
      },
    ];
  }

  const issue = runtimeProfileIssueForInstallMode({
    profile: params.runtimeProfile,
    installMode: params.installMode,
  });
  return issue ? [{ ...toGuardIssue(issue), entryKey: params.entryKey }] : [];
}

function uniqueCapabilities(
  preview: InstalledAppPreview,
  entry: ProjectedEntry,
): CapabilityRequirement[] {
  const byCapability = new Map<string, CapabilityRequirement>();
  [...preview.projection.requiredCapabilities, ...entry.requiredCapabilities].forEach(
    (requirement) => {
      const current = byCapability.get(requirement.capability);
      byCapability.set(requirement.capability, {
        ...requirement,
        required: requirement.required || current?.required === true,
        declaredBy: Array.from(
          new Set([...(current?.declaredBy ?? []), ...requirement.declaredBy]),
        ),
      });
    },
  );
  return Array.from(byCapability.values()).sort((left, right) =>
    left.capability.localeCompare(right.capability),
  );
}

function supportFor(
  preview: InstalledAppPreview,
  requirement: CapabilityRequirement,
): CapabilitySupport | undefined {
  return preview.readiness.supportedCapabilities.find(
    (support) => support.capability === requirement.capability,
  );
}

function collectPromptCapabilities(
  preview: InstalledAppPreview,
  entry: ProjectedEntry,
): PluginPermissionPromptCapability[] {
  return uniqueCapabilities(preview, entry).map((requirement) => ({
    capability: requirement.capability,
    requestedRange: requirement.requestedRange,
    implementation: supportFor(preview, requirement)?.implementation ?? "none",
    required: requirement.required,
  }));
}

function collectPromptPermissions(
  preview: InstalledAppPreview,
  entry: ProjectedEntry,
): PluginPermissionPromptPermission[] {
  const manifestEntry = preview.manifest.entries.find((item) => item.key === entry.key);
  const manifestPermissions = preview.manifest.permissions.map((permission) => ({
    key: permission.key,
    reason: permission.reason ?? "Declared by Plugin manifest.",
    required: permission.required !== false,
  }));
  const entryPermissions = (manifestEntry?.permissions ?? []).map((permission) => ({
    key: permission,
    reason: "Declared by Plugin entry.",
    required: true,
  }));
  return [...manifestPermissions, ...entryPermissions].sort((left, right) =>
    left.key.localeCompare(right.key),
  );
}

function collectSetupSummary(
  issues: PluginEntryRuntimeGuardIssue[],
): PluginPermissionPromptSetupItem[] {
  return issues
    .filter((issue) => issue.kind && issue.key)
    .map((issue) => ({
      kind: issue.kind ?? "setup",
      key: issue.key ?? "unknown",
      required: issue.required === true,
      resolved: false,
      remediation: issue.remediation,
    }))
    .sort((left, right) => `${left.kind}:${left.key}`.localeCompare(`${right.kind}:${right.key}`));
}

function policySummary(
  descriptor: PluginRuntimePackageDescriptor | undefined,
): PluginPermissionPromptDescriptor["policySummary"] {
  const evidence = descriptor?.policyEvidence ?? DEFAULT_POLICY_EVIDENCE;
  return {
    rawWorkerAllowed: evidence.rawWorkerAllowed,
    networkAllowed: evidence.networkAllowed,
    fileSystemAllowed: evidence.fileSystemAllowed,
    rawHostApiAllowed: evidence.rawHostApiAllowed,
    nodeApiAllowed: evidence.nodeApiAllowed,
  };
}

function buildPromptDescriptor(params: {
  preview: InstalledAppPreview;
  entry: ProjectedEntry;
  issues: PluginEntryRuntimeGuardIssue[];
  descriptor?: PluginRuntimePackageDescriptor;
  decision: PluginPermissionDecision;
  runtimeProfile?: LimeRuntimeProfile;
}): PluginPermissionPromptDescriptor {
  const prompt: PluginPermissionPromptDescriptor = {
    appId: params.preview.identity.appId,
    appVersion: params.preview.identity.appVersion,
    entryKey: params.entry.key,
    entryTitle: params.entry.title,
    packageHash: params.preview.identity.packageHash,
    manifestHash: params.preview.identity.manifestHash,
    decision: params.decision,
    requestedCapabilities: collectPromptCapabilities(params.preview, params.entry),
    requestedPermissions: collectPromptPermissions(params.preview, params.entry),
    setupSummary: collectSetupSummary(params.issues),
    policySummary: policySummary(params.descriptor),
    secretSlots: params.preview.projection.secrets
      .map((secret) => ({
        key: secret.key,
        provider: secret.provider,
        required: secret.required,
      }))
      .sort((left, right) => left.key.localeCompare(right.key)),
    warnings: params.issues
      .filter((issue) => issue.severity === "warning")
      .map((issue) => issue.message),
  };
  if (params.runtimeProfile) {
    prompt.runtimeProfile = summarizeRuntimeProfile(params.runtimeProfile);
  }
  return prompt;
}

function operationIssues(params: {
  entry: ProjectedEntry;
  flags: PluginHostFlags;
  operation: PluginEntryRuntimeGuardOperation;
  descriptor?: PluginRuntimePackageDescriptor;
}): PluginEntryRuntimeGuardIssue[] {
  const issues: PluginEntryRuntimeGuardIssue[] = [];
  if (params.operation === "mount-ui") {
    if (!UI_ENTRY_KINDS.has(params.entry.kind)) {
      issues.push({
        code: "UI_ENTRY_UNSUPPORTED",
        severity: "blocker",
        message: `Entry ${params.entry.key} is not a UI runtime entry.`,
        entryKey: params.entry.key,
      });
    }
    if (!params.flags.uiRuntimeEnabled) {
      issues.push({
        code: "UI_RUNTIME_DISABLED",
        severity: "blocker",
        message: "Plugin UI runtime is disabled.",
        entryKey: params.entry.key,
      });
    }
    if (
      params.descriptor &&
      !params.descriptor.uiBundles.some((bundle) => bundle.entryKey === params.entry.key)
    ) {
      issues.push({
        code: "UI_BUNDLE_MISSING",
        severity: "blocker",
        message: `Runtime package descriptor does not include UI bundle for ${params.entry.key}.`,
        entryKey: params.entry.key,
      });
    }
  }
  if (params.entry.kind === "background-task") {
    issues.push({
      code: "RAW_WORKER_BLOCKED",
      severity: "blocker",
      message: "Background task entries require a worker sandbox, which P14 keeps disabled.",
      entryKey: params.entry.key,
    });
  }
  return issues;
}

export function evaluatePluginEntryRuntimeGuard(
  params: EvaluatePluginEntryRuntimeGuardParams,
): PluginEntryRuntimeGuardResult {
  const entry = params.preview.projection.entries.find((item) => item.key === params.entryKey);
  const provenance: PluginProvenance = {
    ...params.preview.projection.provenance,
    entryKey: params.entryKey,
  };
  if (!entry) {
    return {
      status: "blocked",
      blockers: [
        {
          code: "ENTRY_NOT_FOUND",
          severity: "blocker",
          message: `Plugin entry ${params.entryKey} was not found in projection.`,
          entryKey: params.entryKey,
        },
      ],
      warnings: [],
      provenance,
    };
  }

  const descriptor = params.runtimeDescriptor ?? params.runtimePackageLoad?.descriptor;
  const verification = params.packageVerification ?? params.runtimePackageLoad?.verification;
  const installMode = params.installMode ?? params.preview.projection.install.preferredMode;
  const blockers: PluginEntryRuntimeGuardIssue[] = [];
  const warnings: PluginEntryRuntimeGuardIssue[] = [];
  const packageIssue = packageVerificationIssue(verification);
  if (packageIssue) {
    blockers.push(packageIssue);
  }
  blockers.push(...lifecycleIssues(params.lifecycle, entry.key));
  blockers.push(
    ...runtimeProfileIssues({
      runtimeProfile: params.runtimeProfile,
      installMode,
      entryKey: entry.key,
    }),
  );
  blockers.push(...runtimeLoadIssues(params.runtimePackageLoad));
  blockers.push(
    ...operationIssues({
      entry,
      flags: params.flags,
      operation: params.operation ?? "run-entry",
      descriptor,
    }),
  );
  const entryReadiness = params.preview.readiness.entryReadiness.find(
    (item) => item.entryKey === entry.key,
  );
  const appReadinessBlockers = params.preview.readiness.blockers.map(toGuardIssue);
  // Page entries must remain openable so users can inspect setup and degraded capabilities.
  if (params.operation === "mount-ui" && entryReadiness?.status !== "blocked") {
    warnings.push(...appReadinessBlockers.map(asLaunchWarning));
  } else {
    blockers.push(...appReadinessBlockers);
  }

  if (entryReadiness?.status === "blocked") {
    blockers.push(...entryReadiness.issues.map(toGuardIssue));
  }

  warnings.push(...params.preview.readiness.warnings.map(toGuardIssue));
  if (entryReadiness && entryReadiness.status !== "blocked") {
    warnings.push(...entryReadiness.issues.map(toGuardIssue));
  }

  const setupIssues = [...blockers, ...warnings].filter(
    (issue) => issue.required === true && issue.kind && issue.key,
  );
  const decision = params.permissionDecision ?? "accepted";
  const prompt = buildPromptDescriptor({
    preview: params.preview,
    entry,
    issues: [...blockers, ...warnings],
    descriptor,
    decision,
    runtimeProfile: params.runtimeProfile,
  });

  if (blockers.length > 0) {
    return {
      status: "blocked",
      entry,
      prompt,
      blockers,
      warnings,
      provenance,
    };
  }
  if (setupIssues.length > 0) {
    return {
      status: "needs-setup",
      entry,
      prompt,
      blockers: [],
      warnings,
      provenance,
    };
  }
  if (decision === "denied") {
    return {
      status: "denied",
      entry,
      prompt,
      blockers: [
        {
          code: "PERMISSION_DENIED",
          severity: "blocker",
          message: `Required permission for entry ${entry.key} was denied.`,
          entryKey: entry.key,
        },
      ],
      warnings,
      provenance,
    };
  }
  return {
    status: "allow",
    entry,
    prompt,
    blockers: [],
    warnings,
    provenance,
  };
}
