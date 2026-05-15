import type {
  CloudBootstrapApp,
  InstalledAgentAppState,
  InstalledAppPreview,
  ReadinessStatus,
} from "../types";
import { listAgentAppCleanupNamespaceGroups } from "./cleanupNamespaceClassifier";

export type AgentAppSourceStateKind =
  | "local-selected"
  | "local-invalid"
  | "cloud-discovered"
  | "registration-required"
  | "registration-active"
  | "cloud-disabled"
  | "hash-missing"
  | "offline-cached"
  | "installed";

export type AgentAppSourceStateLabelKey =
  | "agentApp.apps.sourceState.localSelected"
  | "agentApp.apps.sourceState.cloudDiscovered"
  | "agentApp.apps.sourceState.registrationRequired"
  | "agentApp.apps.sourceState.registrationActive"
  | "agentApp.apps.sourceState.cloudDisabled"
  | "agentApp.apps.sourceState.hashMissing"
  | "agentApp.apps.sourceState.offlineCached"
  | "agentApp.apps.sourceState.installed";

export interface AgentAppSourceState {
  kind: AgentAppSourceStateKind;
  labelKey: AgentAppSourceStateLabelKey;
  tone: "slate" | "sky" | "emerald" | "amber" | "rose";
  canReview: boolean;
  reason?: string;
}

export interface AgentAppInstallReview {
  id: string;
  appId: string;
  displayName: string;
  version: string;
  manifestVersion: string;
  sourceKind: string;
  sourceUri: string;
  packageUrl?: string;
  releaseId?: string;
  releaseChannel?: string;
  tenantEnablementRef?: string;
  signatureRef?: string;
  packageVerificationStatus?: string;
  sourceState: AgentAppSourceState;
  packageHash: string;
  manifestHash: string;
  entryCount: number;
  capabilityCount: number;
  requiredCapabilityKeys: string[];
  permissionCount: number;
  storageNamespace?: string;
  cleanupTargetCount: number;
  readinessStatus: ReadinessStatus;
  blockerCount: number;
  warningCount: number;
  generatedAt: string;
}

export interface BuildCloudSourceStateParams {
  app: CloudBootstrapApp;
  catalogSource: "remote" | "bootstrap" | "seeded";
  installed: InstalledAgentAppState[];
}

function countCleanupTargets(preview: InstalledAppPreview): number {
  return listAgentAppCleanupNamespaceGroups(preview.cleanupPlan).reduce(
    (total, group) => total + group.targets.length,
    0,
  );
}

export function buildLocalAgentAppSourceState(): AgentAppSourceState {
  return {
    kind: "local-selected",
    labelKey: "agentApp.apps.sourceState.localSelected",
    tone: "sky",
    canReview: true,
  };
}

export function buildCloudAgentAppSourceState({
  app,
  catalogSource,
  installed,
}: BuildCloudSourceStateParams): AgentAppSourceState {
  const alreadyInstalled = installed.some(
    (state) =>
      state.appId === app.appId &&
      state.identity.appVersion === app.version &&
      state.identity.packageHash === app.packageHash &&
      state.identity.manifestHash === app.manifestHash,
  );
  if (alreadyInstalled) {
    return {
      kind: catalogSource === "bootstrap" ? "offline-cached" : "installed",
      labelKey:
        catalogSource === "bootstrap"
          ? "agentApp.apps.sourceState.offlineCached"
          : "agentApp.apps.sourceState.installed",
      tone: "emerald",
      canReview: false,
    };
  }

  if (app.registrationRequired && app.registrationState !== "active") {
    return {
      kind: "registration-required",
      labelKey: "agentApp.apps.sourceState.registrationRequired",
      tone: "amber",
      canReview: false,
      reason: app.registrationHint ?? app.disabledReason,
    };
  }

  if (!app.enabled) {
    return {
      kind: "cloud-disabled",
      labelKey: "agentApp.apps.sourceState.cloudDisabled",
      tone: "rose",
      canReview: false,
      reason: app.disabledReason,
    };
  }

  if (!app.packageUrl || !app.packageHash || !app.manifestHash) {
    return {
      kind: "hash-missing",
      labelKey: "agentApp.apps.sourceState.hashMissing",
      tone: "rose",
      canReview: false,
      reason: app.disabledReason,
    };
  }

  if (app.registrationRequired && app.registrationState === "active") {
    return {
      kind: "registration-active",
      labelKey: "agentApp.apps.sourceState.registrationActive",
      tone: "emerald",
      canReview: true,
    };
  }

  return {
    kind: "cloud-discovered",
    labelKey: "agentApp.apps.sourceState.cloudDiscovered",
    tone: catalogSource === "remote" ? "sky" : "slate",
    canReview: true,
  };
}

export function buildAgentAppInstallReview(params: {
  preview: InstalledAppPreview;
  sourceState: AgentAppSourceState;
  packageVerificationStatus?: string;
  generatedAt?: string;
}): AgentAppInstallReview {
  const { preview, sourceState } = params;
  const generatedAt = params.generatedAt ?? preview.cleanupPlan.generatedAt;
  const capabilityKeys = preview.projection.requiredCapabilities.map(
    (item) => item.capability,
  );

  return {
    id: `${preview.identity.appId}:${preview.identity.appVersion}:${preview.identity.packageHash}`,
    appId: preview.identity.appId,
    displayName: preview.manifest.displayName,
    version: preview.identity.appVersion,
    manifestVersion: preview.manifest.manifestVersion,
    sourceKind: preview.identity.sourceKind,
    sourceUri: preview.identity.sourceUri,
    packageUrl:
      preview.identity.sourceKind === "cloud_release"
        ? preview.identity.sourceUri
        : undefined,
    releaseId: preview.identity.releaseId,
    releaseChannel: preview.identity.channel,
    tenantEnablementRef: preview.identity.tenantEnablementRef,
    signatureRef: preview.identity.signatureRef,
    packageVerificationStatus: params.packageVerificationStatus,
    sourceState,
    packageHash: preview.identity.packageHash,
    manifestHash: preview.identity.manifestHash,
    entryCount: preview.projection.entries.length,
    capabilityCount: capabilityKeys.length,
    requiredCapabilityKeys: capabilityKeys,
    permissionCount: preview.manifest.permissions.length,
    storageNamespace: preview.projection.storage?.namespace,
    cleanupTargetCount: countCleanupTargets(preview),
    readinessStatus: preview.readiness.status,
    blockerCount: preview.readiness.blockers.length,
    warningCount: preview.readiness.warnings.length,
    generatedAt,
  };
}
