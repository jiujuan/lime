import {
  verifyPluginPackageCacheEntry,
  type PluginPackageCacheEntry,
} from "../install/packageCache";
import { PluginCapabilityError } from "../sdk/capabilityErrors";
import type {
  PluginPackageVerificationResult,
  PluginUiEntryKind,
  PluginUiMountResult,
  PluginUiSandboxPolicy,
  PluginProjection,
  PluginHostFlags,
  InstalledAppPreview,
  PackageIdentity,
  ProjectedEntry,
} from "../types";
import { UiExtensionHost, pluginUiSandboxPolicy } from "./uiExtensionHost";

const UI_ENTRY_KINDS = new Set<string>(["page", "panel", "settings"]);

export interface PluginUiBundleDescriptor {
  entryKey: string;
  entryKind: PluginUiEntryKind;
  title: string;
  route?: string;
  bundlePath: string;
  packageHash: string;
  manifestHash: string;
}

export interface PluginRuntimePackagePolicyEvidence {
  rawWorkerAllowed: false;
  networkAllowed: false;
  fileSystemAllowed: false;
  rawHostApiAllowed: false;
  nodeApiAllowed: false;
  sandboxPolicy: PluginUiSandboxPolicy;
}

export interface PluginRuntimePackageDescriptor {
  appId: string;
  appVersion: string;
  packageHash: string;
  manifestHash: string;
  cachePath: string;
  loadedFrom: "package-cache";
  uiBundles: PluginUiBundleDescriptor[];
  policyEvidence: PluginRuntimePackagePolicyEvidence;
}

export interface PluginRuntimePackageLoadIssue {
  code:
    | "PACKAGE_NOT_VERIFIED"
    | "UI_BUNDLE_MISSING"
    | "UI_ENTRY_MISSING"
    | "UI_ENTRY_UNSUPPORTED";
  message: string;
  entryKey?: string;
}

export interface PluginRuntimePackageLoadResult {
  status: "loaded" | "blocked";
  verification: PluginPackageVerificationResult;
  descriptor?: PluginRuntimePackageDescriptor;
  issues: PluginRuntimePackageLoadIssue[];
}

export interface PluginRuntimePackageMountResult {
  descriptor: PluginRuntimePackageDescriptor;
  bundle: PluginUiBundleDescriptor;
  mounted: PluginUiMountResult;
}

function isUiEntry(entry: ProjectedEntry): boolean {
  return UI_ENTRY_KINDS.has(entry.kind);
}

function buildPolicyEvidence(): PluginRuntimePackagePolicyEvidence {
  return {
    rawWorkerAllowed: false,
    networkAllowed: false,
    fileSystemAllowed: false,
    rawHostApiAllowed: false,
    nodeApiAllowed: false,
    sandboxPolicy: pluginUiSandboxPolicy,
  };
}

function buildUiBundles(params: {
  projection: PluginProjection;
  identity: PackageIdentity;
}): PluginUiBundleDescriptor[] {
  const bundlePath = params.projection.runtimePackage.uiPath;
  if (!bundlePath) {
    return [];
  }
  return params.projection.entries
    .filter(isUiEntry)
    .map((entry) => ({
      entryKey: entry.key,
      entryKind: entry.kind as PluginUiEntryKind,
      title: entry.title,
      route: entry.route,
      bundlePath,
      packageHash: params.identity.packageHash,
      manifestHash: params.identity.manifestHash,
    }))
    .sort((left, right) => left.entryKey.localeCompare(right.entryKey));
}

export function loadRuntimePackageDescriptor(params: {
  cacheEntry: PluginPackageCacheEntry;
  identity: PackageIdentity;
  projection: PluginProjection;
}): PluginRuntimePackageLoadResult {
  const verification = verifyPluginPackageCacheEntry(
    params.cacheEntry,
    params.identity,
  );
  const issues: PluginRuntimePackageLoadIssue[] = [];
  if (verification.status !== "verified") {
    issues.push({
      code: "PACKAGE_NOT_VERIFIED",
      message: verification.message,
    });
    return {
      status: "blocked",
      verification,
      issues,
    };
  }

  const uiBundles = buildUiBundles({
    projection: params.projection,
    identity: params.identity,
  });
  if (params.projection.runtimePackage.hasUiBundle && uiBundles.length === 0) {
    issues.push({
      code: "UI_BUNDLE_MISSING",
      message: "Runtime package declares a UI bundle, but no UI entry can be mapped.",
    });
  }

  return {
    status: issues.length > 0 ? "blocked" : "loaded",
    verification,
    descriptor:
      issues.length > 0
        ? undefined
        : {
            appId: params.identity.appId,
            appVersion: params.identity.appVersion,
            packageHash: params.identity.packageHash,
            manifestHash: params.identity.manifestHash,
            cachePath: params.cacheEntry.cachePath,
            loadedFrom: "package-cache",
            uiBundles,
            policyEvidence: buildPolicyEvidence(),
          },
    issues,
  };
}

export function findUiBundleDescriptor(params: {
  descriptor: PluginRuntimePackageDescriptor;
  projection: PluginProjection;
  entryKey: string;
}): PluginUiBundleDescriptor {
  const entry = params.projection.entries.find((item) => item.key === params.entryKey);
  if (!entry) {
    throw new PluginCapabilityError({
      code: "ENTRY_NOT_FOUND",
      message: `Plugin entry ${params.entryKey} was not found in projection.`,
      appId: params.descriptor.appId,
      entryKey: params.entryKey,
    });
  }
  if (!isUiEntry(entry)) {
    throw new PluginCapabilityError({
      code: "UI_ENTRY_UNSUPPORTED",
      message: `Entry ${params.entryKey} is not a UI bundle entry.`,
      appId: params.descriptor.appId,
      entryKey: params.entryKey,
    });
  }
  const bundle = params.descriptor.uiBundles.find(
    (item) => item.entryKey === params.entryKey,
  );
  if (!bundle) {
    throw new PluginCapabilityError({
      code: "APP_RUNTIME_UNSUPPORTED",
      message: `Runtime package descriptor does not include UI bundle for ${params.entryKey}.`,
      appId: params.descriptor.appId,
      entryKey: params.entryKey,
    });
  }
  return bundle;
}

export function mountRuntimePackageUiEntry(params: {
  descriptor: PluginRuntimePackageDescriptor;
  preview: InstalledAppPreview;
  flags: PluginHostFlags;
  entryKey: string;
  now?: () => string;
}): PluginRuntimePackageMountResult {
  const bundle = findUiBundleDescriptor({
    descriptor: params.descriptor,
    projection: params.preview.projection,
    entryKey: params.entryKey,
  });
  const mounted = new UiExtensionHost({
    preview: params.preview,
    flags: params.flags,
    now: params.now,
  }).mountEntry(params.entryKey);

  return {
    descriptor: params.descriptor,
    bundle,
    mounted,
  };
}
