import {
  verifyAgentAppPackageCacheEntry,
  type AgentAppPackageCacheEntry,
} from "../install/packageCache";
import { AgentAppCapabilityError } from "../sdk/capabilityErrors";
import type {
  AgentAppPackageVerificationResult,
  AgentAppUiEntryKind,
  AgentAppUiMountResult,
  AgentAppUiSandboxPolicy,
  AgentAppProjection,
  AgentAppHostFlags,
  InstalledAppPreview,
  PackageIdentity,
  ProjectedEntry,
} from "../types";
import { UiExtensionHost, agentAppUiSandboxPolicy } from "./uiExtensionHost";

const UI_ENTRY_KINDS = new Set<string>(["page", "panel", "settings"]);

export interface AgentAppUiBundleDescriptor {
  entryKey: string;
  entryKind: AgentAppUiEntryKind;
  title: string;
  route?: string;
  bundlePath: string;
  packageHash: string;
  manifestHash: string;
}

export interface AgentAppRuntimePackagePolicyEvidence {
  rawWorkerAllowed: false;
  networkAllowed: false;
  fileSystemAllowed: false;
  rawTauriAllowed: false;
  nodeApiAllowed: false;
  sandboxPolicy: AgentAppUiSandboxPolicy;
}

export interface AgentAppRuntimePackageDescriptor {
  appId: string;
  appVersion: string;
  packageHash: string;
  manifestHash: string;
  cachePath: string;
  loadedFrom: "package-cache";
  uiBundles: AgentAppUiBundleDescriptor[];
  policyEvidence: AgentAppRuntimePackagePolicyEvidence;
}

export interface AgentAppRuntimePackageLoadIssue {
  code:
    | "PACKAGE_NOT_VERIFIED"
    | "UI_BUNDLE_MISSING"
    | "UI_ENTRY_MISSING"
    | "UI_ENTRY_UNSUPPORTED";
  message: string;
  entryKey?: string;
}

export interface AgentAppRuntimePackageLoadResult {
  status: "loaded" | "blocked";
  verification: AgentAppPackageVerificationResult;
  descriptor?: AgentAppRuntimePackageDescriptor;
  issues: AgentAppRuntimePackageLoadIssue[];
}

export interface AgentAppRuntimePackageMountResult {
  descriptor: AgentAppRuntimePackageDescriptor;
  bundle: AgentAppUiBundleDescriptor;
  mounted: AgentAppUiMountResult;
}

function isUiEntry(entry: ProjectedEntry): boolean {
  return UI_ENTRY_KINDS.has(entry.kind);
}

function buildPolicyEvidence(): AgentAppRuntimePackagePolicyEvidence {
  return {
    rawWorkerAllowed: false,
    networkAllowed: false,
    fileSystemAllowed: false,
    rawTauriAllowed: false,
    nodeApiAllowed: false,
    sandboxPolicy: agentAppUiSandboxPolicy,
  };
}

function buildUiBundles(params: {
  projection: AgentAppProjection;
  identity: PackageIdentity;
}): AgentAppUiBundleDescriptor[] {
  const bundlePath = params.projection.runtimePackage.uiPath;
  if (!bundlePath) {
    return [];
  }
  return params.projection.entries
    .filter(isUiEntry)
    .map((entry) => ({
      entryKey: entry.key,
      entryKind: entry.kind as AgentAppUiEntryKind,
      title: entry.title,
      route: entry.route,
      bundlePath,
      packageHash: params.identity.packageHash,
      manifestHash: params.identity.manifestHash,
    }))
    .sort((left, right) => left.entryKey.localeCompare(right.entryKey));
}

export function loadRuntimePackageDescriptor(params: {
  cacheEntry: AgentAppPackageCacheEntry;
  identity: PackageIdentity;
  projection: AgentAppProjection;
}): AgentAppRuntimePackageLoadResult {
  const verification = verifyAgentAppPackageCacheEntry(
    params.cacheEntry,
    params.identity,
  );
  const issues: AgentAppRuntimePackageLoadIssue[] = [];
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
  descriptor: AgentAppRuntimePackageDescriptor;
  projection: AgentAppProjection;
  entryKey: string;
}): AgentAppUiBundleDescriptor {
  const entry = params.projection.entries.find((item) => item.key === params.entryKey);
  if (!entry) {
    throw new AgentAppCapabilityError({
      code: "ENTRY_NOT_FOUND",
      message: `Agent App entry ${params.entryKey} was not found in projection.`,
      appId: params.descriptor.appId,
      entryKey: params.entryKey,
    });
  }
  if (!isUiEntry(entry)) {
    throw new AgentAppCapabilityError({
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
    throw new AgentAppCapabilityError({
      code: "APP_RUNTIME_UNSUPPORTED",
      message: `Runtime package descriptor does not include UI bundle for ${params.entryKey}.`,
      appId: params.descriptor.appId,
      entryKey: params.entryKey,
    });
  }
  return bundle;
}

export function mountRuntimePackageUiEntry(params: {
  descriptor: AgentAppRuntimePackageDescriptor;
  preview: InstalledAppPreview;
  flags: AgentAppHostFlags;
  entryKey: string;
  now?: () => string;
}): AgentAppRuntimePackageMountResult {
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
