import { buildCloudReleasePackageIdentity } from "./cloudReleaseDescriptor";
import type {
  CloudBootstrapApp,
  CloudBootstrapInstallDecision,
  PackageIdentity,
} from "../types";

function sameInstalledRelease(
  installedIdentity: PackageIdentity | undefined,
  targetIdentity: PackageIdentity,
): boolean {
  return (
    installedIdentity?.appId === targetIdentity.appId &&
    installedIdentity.appVersion === targetIdentity.appVersion &&
    installedIdentity.packageHash === targetIdentity.packageHash &&
    installedIdentity.manifestHash === targetIdentity.manifestHash
  );
}

export function resolveCloudBootstrapInstallDecision(params: {
  app?: CloudBootstrapApp;
  installedIdentity?: PackageIdentity;
  actualPackageHash?: string;
  actualManifestHash?: string;
  cloudReachable?: boolean;
  loadedAt?: string;
}): CloudBootstrapInstallDecision {
  const cloudReachable = params.cloudReachable ?? true;
  const appId = params.app?.appId ?? params.installedIdentity?.appId ?? "unknown";

  if (!cloudReachable && !params.app) {
    if (params.installedIdentity) {
      return {
        appId,
        status: "offline_available",
        canRunInstalled: true,
        shouldDownload: false,
        preserveData: true,
        shouldDeleteData: false,
        reason: "Cloud bootstrap is unavailable; using installed package identity.",
        installedIdentity: params.installedIdentity,
      };
    }
    return {
      appId,
      status: "offline_unavailable",
      canRunInstalled: false,
      shouldDownload: false,
      preserveData: true,
      shouldDeleteData: false,
      reason: "Cloud bootstrap is unavailable and no installed package identity exists.",
    };
  }

  if (!params.app) {
    return {
      appId,
      status: "install_required",
      canRunInstalled: false,
      shouldDownload: false,
      preserveData: true,
      shouldDeleteData: false,
      reason: "Cloud bootstrap app metadata is missing.",
      installedIdentity: params.installedIdentity,
    };
  }

  if (
    params.app.registrationRequired &&
    params.app.registrationState !== "active"
  ) {
    return {
      appId,
      status: "disabled",
      canRunInstalled: false,
      shouldDownload: false,
      preserveData: true,
      shouldDeleteData: false,
      reason: "Cloud Plugin requires registration before download.",
      installedIdentity: params.installedIdentity,
    };
  }

  const targetIdentity = buildCloudReleasePackageIdentity({
    app: params.app,
    loadedAt: params.loadedAt,
  });

  if (!params.app.enabled) {
    return {
      appId,
      status: "disabled",
      canRunInstalled: false,
      shouldDownload: false,
      preserveData: true,
      shouldDeleteData: false,
      reason: "Cloud tenant enablement disabled this App; local data must be preserved.",
      installedIdentity: params.installedIdentity,
      targetIdentity,
    };
  }

  if (
    (params.actualPackageHash && params.actualPackageHash !== params.app.packageHash) ||
    (params.actualManifestHash && params.actualManifestHash !== params.app.manifestHash)
  ) {
    return {
      appId,
      status: "hash_mismatch",
      canRunInstalled: Boolean(params.installedIdentity),
      shouldDownload: false,
      preserveData: true,
      shouldDeleteData: false,
      reason: "Downloaded package or manifest hash does not match Cloud release metadata.",
      installedIdentity: params.installedIdentity,
      targetIdentity,
    };
  }

  if (sameInstalledRelease(params.installedIdentity, targetIdentity)) {
    return {
      appId,
      status: "up_to_date",
      canRunInstalled: true,
      shouldDownload: false,
      preserveData: true,
      shouldDeleteData: false,
      reason: "Installed package identity matches Cloud release metadata.",
      installedIdentity: params.installedIdentity,
      targetIdentity,
    };
  }

  if (params.installedIdentity?.appId === targetIdentity.appId) {
    return {
      appId,
      status: "upgrade_available",
      canRunInstalled: true,
      shouldDownload: true,
      preserveData: true,
      shouldDeleteData: false,
      reason: "Cloud release metadata points to a different package identity.",
      installedIdentity: params.installedIdentity,
      targetIdentity,
    };
  }

  return {
    appId,
    status: "install_required",
    canRunInstalled: false,
    shouldDownload: true,
    preserveData: true,
    shouldDeleteData: false,
    reason: "No installed package identity exists for this Cloud release.",
    installedIdentity: params.installedIdentity,
    targetIdentity,
  };
}
