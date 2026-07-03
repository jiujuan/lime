import type {
  CloudBootstrapApp,
  InstalledPluginState,
  InstalledAppPreview,
  ReadinessStatus,
} from "../types";
import {
  listCloudReleaseEvidenceIssueCodes,
  type PluginCloudReleaseEvidence,
  type PluginCloudReleaseEvidenceCatalogSource,
} from "./cloudReleaseEvidence";
import { listPluginCleanupNamespaceGroups } from "./cleanupNamespaceClassifier";

export type PluginSourceStateKind =
  | "local-selected"
  | "local-invalid"
  | "cloud-discovered"
  | "registration-required"
  | "registration-active"
  | "cloud-disabled"
  | "hash-missing"
  | "release-evidence-blocked"
  | "release-evidence-warning"
  | "offline-cached"
  | "installed";

export type PluginSourceStateLabelKey =
  | "plugin.apps.sourceState.localSelected"
  | "plugin.apps.sourceState.cloudDiscovered"
  | "plugin.apps.sourceState.registrationRequired"
  | "plugin.apps.sourceState.registrationActive"
  | "plugin.apps.sourceState.cloudDisabled"
  | "plugin.apps.sourceState.hashMissing"
  | "plugin.apps.sourceState.releaseEvidenceBlocked"
  | "plugin.apps.sourceState.releaseEvidenceWarning"
  | "plugin.apps.sourceState.offlineCached"
  | "plugin.apps.sourceState.installed";

export interface PluginSourceState {
  kind: PluginSourceStateKind;
  labelKey: PluginSourceStateLabelKey;
  tone: "slate" | "sky" | "emerald" | "amber" | "rose";
  canReview: boolean;
  reason?: string;
}

export interface PluginInstallReview {
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
  releaseEvidence?: PluginCloudReleaseEvidence;
  packageVerificationStatus?: string;
  sourceState: PluginSourceState;
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
  catalogSource: PluginCloudReleaseEvidenceCatalogSource;
  installed: InstalledPluginState[];
  releaseEvidence?: PluginCloudReleaseEvidence;
}

function countCleanupTargets(preview: InstalledAppPreview): number {
  return listPluginCleanupNamespaceGroups(preview.cleanupPlan).reduce(
    (total, group) => total + group.targets.length,
    0,
  );
}

export function buildLocalPluginSourceState(): PluginSourceState {
  return {
    kind: "local-selected",
    labelKey: "plugin.apps.sourceState.localSelected",
    tone: "sky",
    canReview: true,
  };
}

export function buildCloudPluginSourceState({
  app,
  catalogSource,
  installed,
  releaseEvidence,
}: BuildCloudSourceStateParams): PluginSourceState {
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
          ? "plugin.apps.sourceState.offlineCached"
          : "plugin.apps.sourceState.installed",
      tone: "emerald",
      canReview: false,
    };
  }

  if (app.registrationRequired && app.registrationState !== "active") {
    return {
      kind: "registration-required",
      labelKey: "plugin.apps.sourceState.registrationRequired",
      tone: "amber",
      canReview: false,
      reason: app.registrationHint ?? app.disabledReason,
    };
  }

  if (!app.enabled) {
    return {
      kind: "cloud-disabled",
      labelKey: "plugin.apps.sourceState.cloudDisabled",
      tone: "rose",
      canReview: false,
      reason: app.disabledReason,
    };
  }

  if (!app.packageUrl || !app.packageHash || !app.manifestHash) {
    return {
      kind: "hash-missing",
      labelKey: "plugin.apps.sourceState.hashMissing",
      tone: "rose",
      canReview: false,
      reason: app.disabledReason,
    };
  }

  if (releaseEvidence?.status === "blocked") {
    return {
      kind: "release-evidence-blocked",
      labelKey: "plugin.apps.sourceState.releaseEvidenceBlocked",
      tone: "rose",
      canReview: false,
      reason: listCloudReleaseEvidenceIssueCodes(releaseEvidence).join(", "),
    };
  }

  if (releaseEvidence?.status === "warning") {
    return {
      kind: "release-evidence-warning",
      labelKey: "plugin.apps.sourceState.releaseEvidenceWarning",
      tone: "amber",
      canReview: true,
      reason: listCloudReleaseEvidenceIssueCodes(releaseEvidence).join(", "),
    };
  }

  if (app.registrationRequired && app.registrationState === "active") {
    return {
      kind: "registration-active",
      labelKey: "plugin.apps.sourceState.registrationActive",
      tone: "emerald",
      canReview: true,
    };
  }

  return {
    kind: "cloud-discovered",
    labelKey: "plugin.apps.sourceState.cloudDiscovered",
    tone: catalogSource === "remote" ? "sky" : "slate",
    canReview: true,
  };
}

export function buildPluginInstallReview(params: {
  preview: InstalledAppPreview;
  sourceState: PluginSourceState;
  releaseEvidence?: PluginCloudReleaseEvidence;
  packageVerificationStatus?: string;
  generatedAt?: string;
}): PluginInstallReview {
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
    releaseEvidence: params.releaseEvidence,
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
