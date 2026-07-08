import { buildInstalledAppPreview } from "./installedAppPreview";
import {
  buildPluginPackageCacheEntry,
  verifyPluginPackageCacheEntry,
  type PluginPackageCacheEntry,
} from "./packageCache";
import {
  isSupportedPackageUrl,
  PluginCloudBootstrapError,
} from "./cloudBootstrapValidation";
import type {
  CloudBootstrapApp,
  CloudBootstrapPackageSource,
  CloudBootstrapReleaseDescriptor,
  HostCapabilityProfile,
  InstalledAppPreview,
  PackageIdentity,
  PluginPackageVerificationResult,
  PluginSetupState,
} from "../types";

export function buildCloudReleasePackageIdentity(params: {
  app: CloudBootstrapApp;
  loadedAt?: string;
}): PackageIdentity {
  return {
    sourceKind: "cloud_release",
    sourceUri: params.app.packageUrl,
    appId: params.app.appId,
    appVersion: params.app.version,
    packageHash: params.app.packageHash,
    manifestHash: params.app.manifestHash,
    loadedAt: params.loadedAt ?? new Date().toISOString(),
    releaseId: params.app.releaseId,
    tenantId: params.app.tenantId,
    tenantEnablementRef: params.app.tenantEnablementRef,
    channel: params.app.channel,
    signatureRef: params.app.signatureRef,
  };
}

export function buildCloudReleaseDescriptor(params: {
  app: CloudBootstrapApp;
  loadedAt?: string;
}): CloudBootstrapReleaseDescriptor {
  const identity = buildCloudReleasePackageIdentity(params);
  const missingFields = [
    ["packageUrl", params.app.packageUrl],
    ["packageHash", params.app.packageHash],
    ["manifestHash", params.app.manifestHash],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missingFields.length > 0) {
    throw new PluginCloudBootstrapError(
      `Cloud release ${params.app.appId}@${params.app.version} is missing required install metadata: ${missingFields.join(", ")}`,
    );
  }
  if (!isSupportedPackageUrl(params.app.packageUrl)) {
    throw new PluginCloudBootstrapError(
      `Cloud release ${params.app.appId}@${params.app.version} packageUrl must use https.`,
    );
  }

  return {
    sourceKind: "cloud_release",
    sourceUri: params.app.packageUrl,
    appId: params.app.appId,
    version: params.app.version,
    releaseId: params.app.releaseId,
    tenantId: params.app.tenantId,
    tenantEnablementRef: params.app.tenantEnablementRef,
    channel: params.app.channel,
    packageUrl: params.app.packageUrl,
    packageHash: params.app.packageHash,
    manifestHash: params.app.manifestHash,
    signatureRef: params.app.signatureRef,
    signatureProof: params.app.signatureProof,
    compatibility: {
      capabilities: { ...params.app.capabilityRequirements },
    },
    identity,
    loadedAt: identity.loadedAt,
  };
}

export interface VerifiedCloudReleasePackage {
  descriptor: CloudBootstrapReleaseDescriptor;
  entry: PluginPackageCacheEntry;
  verification: PluginPackageVerificationResult;
}

export function buildVerifiedCloudReleasePackage(params: {
  app: CloudBootstrapApp;
  packageManifest: unknown;
  actualPackageHash?: string;
  actualManifestHash?: string;
  loadedAt?: string;
}): VerifiedCloudReleasePackage {
  const descriptor = buildCloudReleaseDescriptor({
    app: params.app,
    loadedAt: params.loadedAt,
  });
  const entry = buildPluginPackageCacheEntry({
    identity: descriptor.identity,
    manifestSnapshot: params.packageManifest,
    actualPackageHash: params.actualPackageHash ?? descriptor.packageHash,
    actualManifestHash: params.actualManifestHash ?? descriptor.manifestHash,
    cachedAt: descriptor.loadedAt,
  });
  const verification = verifyPluginPackageCacheEntry(
    entry,
    descriptor.identity,
  );

  return {
    descriptor,
    entry,
    verification,
  };
}

export function buildCloudBootstrapPackageSource(params: {
  app: CloudBootstrapApp;
  loadedAt?: string;
}): CloudBootstrapPackageSource {
  const identity = buildCloudReleasePackageIdentity(params);

  return {
    sourceKind: "cloud_release",
    sourceUri: params.app.packageUrl,
    identity,
    app: params.app,
    enabled: params.app.enabled,
    defaultEntries: params.app.defaultEntries,
    policyDefaults: params.app.policyDefaults,
    toolAvailability: params.app.toolAvailability,
  };
}

export function buildCloudBootstrapInstalledAppPreview(params: {
  app: CloudBootstrapApp;
  packageManifest: unknown;
  packageVerification?: PluginPackageVerificationResult;
  profile?: HostCapabilityProfile;
  setup?: PluginSetupState;
  loadedAt?: string;
  checkedAt?: string;
  generatedAt?: string;
}): InstalledAppPreview {
  const source = buildCloudBootstrapPackageSource({
    app: params.app,
    loadedAt: params.loadedAt,
  });

  return buildInstalledAppPreview({
    fixture: params.packageManifest,
    identity: source.identity,
    cloud: params.app,
    packageVerification: params.packageVerification,
    setup: params.setup,
    profile: params.profile,
    checkedAt: params.checkedAt,
    generatedAt: params.generatedAt,
  });
}
