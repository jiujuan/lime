import type { AppServerClient } from "./appServer";
import type { PluginCloudReleaseEvidenceCatalogSource } from "../../features/plugin/install/cloudReleaseEvidence";
import type { PluginInstallReview } from "../../features/plugin/install/installReview";
import type { InstalledPluginStateListResult } from "../../features/plugin/install/installedAppState";
import type { PluginPackageCacheEntry } from "../../features/plugin/install/packageCache";
import type {
  PluginHostLifecycleSnapshot,
  PluginTaskRuntimeContract,
} from "../../features/plugin/host";
import type { ShellDescriptor } from "../../features/plugin/shell";
import type {
  AppManifest,
  CloudBootstrapApp,
  CloudBootstrapPayload,
  CloudBootstrapReleaseDescriptor,
  HostCapabilityProfile,
  InstalledPluginState,
  PackageSourceKind,
  PluginCloudReleaseSignatureTrustRoot,
} from "../../features/plugin/types";
import type {
  PluginCloudReleaseSignaturePolicy,
  PluginCloudReleaseSignatureVerificationStatus,
} from "../../features/plugin/install/cloudReleaseEvidence";

export interface PluginLocalPackageInspection {
  sourceKind: "local_folder";
  sourceUri: string;
  appDir: string;
  manifestSource: "plugin_json" | string;
  pluginManifest: unknown;
  manifest: AppManifest;
  manifestHash: string;
  packageHash: string;
  inspectedAt: string;
}

export interface PluginLocalPackageExport {
  sourceKind: "local_folder";
  sourceUri: string;
  appDir: string;
  manifestSource: "plugin_json" | string;
  pluginManifest: unknown;
  manifest: AppManifest;
  manifestHash: string;
  packageHash: string;
  sizeBytes: number;
  fileCount: number;
  contentType: string;
  packageBase64: string;
  exportedAt: string;
}

export interface PluginInstalledStateSaveRequest {
  state: InstalledPluginState;
}

export interface PluginInstallReviewResult {
  review: PluginInstallReview;
  state: InstalledPluginState;
}

export type PluginCloudReleasePackageSourceKind =
  | "explicit_manifest"
  | "verified_cache"
  | "fetched_package";

export interface PluginCloudReleasePackageAcquisitionResult {
  descriptor: CloudBootstrapReleaseDescriptor;
  packageManifest: unknown;
  actualPackageHash?: string;
  actualManifestHash?: string;
  sourceKind: PluginCloudReleasePackageSourceKind;
}

export interface PluginCloudReleasePackageAcquisitionOptions {
  packageManifest?: unknown;
  actualPackageHash?: string;
  actualManifestHash?: string;
  signaturePolicy?: PluginCloudReleaseSignaturePolicy;
  signatureVerificationStatus?: PluginCloudReleaseSignatureVerificationStatus;
  signatureTrustRoots?: PluginCloudReleaseSignatureTrustRoot[];
  signatureCrypto?: Pick<Crypto, "subtle">;
  packageCacheEntry?: PluginPackageCacheEntry;
  resolveCachedPackage?: (
    descriptor: CloudBootstrapReleaseDescriptor,
  ) =>
    | PluginPackageCacheEntry
    | undefined
    | Promise<PluginPackageCacheEntry | undefined>;
  fetchCloudPackage?: (
    descriptor: CloudBootstrapReleaseDescriptor,
  ) => PluginPackageCacheEntry | Promise<PluginPackageCacheEntry>;
  skipPackageFetch?: boolean;
}

export type PluginCloudReleasePackageAcquisitionParams = {
  app: CloudBootstrapApp;
  loadedAt?: string;
} & PluginCloudReleasePackageAcquisitionOptions;

export interface PluginDisabledRequest {
  appId: string;
  disabled: boolean;
  updatedAt?: string;
}

export interface PluginUninstallRehearsalRequest {
  appId: string;
  mode: "keep-data" | "delete-data";
}

export interface PluginUninstallRequest extends PluginUninstallRehearsalRequest {
  confirmationPhrase?: string;
}

export interface PluginUninstallRehearsalResult {
  appId: string;
  packageHash?: string;
  mode: "keep-data" | "delete-data";
  generatedAt: string;
  deletedTargetCount: number;
  retainedTargetCount: number;
  targets: Array<{
    kind: string;
    value: string;
    safeToDelete: boolean;
    action: "delete" | "retain" | "blocked";
    reason: string;
  }>;
  warnings: string[];
}

export interface PluginDeleteDataTargetEvidence {
  kind: string;
  value: string;
  action: string;
  reason: string;
  status: "removed" | "missing" | "retained" | "blocked" | "failed" | string;
  blockerCodes: string[];
  error?: string | null;
}

export interface PluginDeleteDataExecutionEvidence {
  status: "deleted" | "blocked" | "failed" | string;
  generatedAt: string;
  dataRoot: string;
  removedTargets: PluginDeleteDataTargetEvidence[];
  missingTargets: PluginDeleteDataTargetEvidence[];
  retainedTargets: PluginDeleteDataTargetEvidence[];
  blockedTargets: PluginDeleteDataTargetEvidence[];
  failedTarget?: PluginDeleteDataTargetEvidence | null;
  blockerCodes: string[];
  postDeleteResidualAudit?: {
    status: "clear" | "residual_present" | "not_run" | "failed" | string;
    checkedAt: string;
    checkedTargetCount: number;
    remainingTargetCount: number;
    remainingTargets: PluginDeleteDataTargetEvidence[];
    failedTarget?: PluginDeleteDataTargetEvidence | null;
  };
}

export interface PluginUninstallResult {
  status?:
    | "rehearsal_only"
    | "blocked"
    | "deleted"
    | "uninstalled"
    | "failed"
    | string;
  rehearsal: PluginUninstallRehearsalResult;
  list: InstalledPluginStateListResult;
  removedTargetCount: number;
  missingTargetCount: number;
  blockerCodes?: string[];
  deleteEvidence?: PluginDeleteDataExecutionEvidence | null;
}

export interface PluginUiRuntimeStartRequest {
  appId: string;
  entryKey?: string;
}

export interface PluginUiRuntimeStatusRequest {
  appId: string;
}

export interface PluginUiRuntimeStopRequest {
  appId: string;
}

export interface PluginShellLaunchRequest {
  descriptor: ShellDescriptor;
}

export interface PluginSelectDirectoryRequest {
  title?: string;
}

export interface PluginSelectDirectoryResult {
  path: string | null;
  cancelled: boolean;
  message?: string;
}

export interface PluginUiRuntimeStatus {
  appId: string;
  status: "starting" | "running" | "stopped" | "failed";
  baseUrl?: string;
  entryUrl?: string;
  port?: number;
  pid?: number;
  message?: string;
  entryKey?: string;
  route?: string;
  taskRuntime?: PluginTaskRuntimeContract;
}

export interface PluginShellPackageMount {
  kind: "local_dir" | "mock";
  path: string;
  readOnly: boolean;
  packageHash: string;
  manifestHash: string;
}

export interface PluginShellWindowInfo {
  label: string;
  title: string;
  url: string;
  reused: boolean;
  chrome?: {
    deepLinkScheme: string;
    openEntryKey: string;
    trayEnabled: boolean;
    closePolicy: "hide_to_tray" | "quit" | string;
    menuItemIds: string[];
    multiAppManagement: boolean;
    runtimeBypass: boolean;
  };
}

export type PluginShellSurfaceStrategy =
  | "controlledBrowserWindow"
  | "webContentsView";

export interface PluginShellSurfaceInfo {
  activeStrategy: PluginShellSurfaceStrategy;
  supportedStrategies: PluginShellSurfaceStrategy[];
  entryUrl: string;
  containerId: string;
  embedding: {
    standaloneWindow: boolean;
    rightSurfaceDock: boolean;
    iframe: false;
    browserView: false;
  };
  isolation: {
    contextIsolation: true;
    sandbox: true;
    nodeIntegration: false;
  };
}

export interface PluginShellLaunchResult {
  appId?: string;
  status: "launched" | "blocked";
  installMode?: ShellDescriptor["installMode"];
  shellKind?: ShellDescriptor["runtimeProfile"]["shellKind"];
  descriptorVersion?: ShellDescriptor["descriptorVersion"];
  devShell: boolean;
  blockerCodes: string[];
  message?: string;
  packageMount?: PluginShellPackageMount;
  runtimeStatus?: PluginUiRuntimeStatus;
  surface?: PluginShellSurfaceInfo;
  shellWindow?: PluginShellWindowInfo;
  launchedAt?: string;
}

export interface PluginCloudCatalogResult {
  payload: CloudBootstrapPayload;
  source: "remote" | "bootstrap" | "seeded";
}

export interface PluginHostLifecycleListResult {
  snapshots: PluginHostLifecycleSnapshot[];
  issues: unknown[];
}

export class PluginRegistrationRequiredError extends Error {
  constructor() {
    super(
      "Plugin registration must be activated before installing enterprise custom apps.",
    );
    this.name = "PluginRegistrationRequiredError";
  }
}

export interface SelectLocalPluginDirectoryOptions {
  title?: string;
}

export type PluginInstalledListAppServerClient = Pick<AppServerClient, "request">;
export type PluginUiRuntimeAppServerClient = Pick<AppServerClient, "request">;
export type PluginLifecycleAppServerClient = Pick<AppServerClient, "request">;

export type PluginCloudInstallReviewRequest = {
  app: CloudBootstrapApp;
  packageManifest?: unknown;
  actualPackageHash?: string;
  actualManifestHash?: string;
  signaturePolicy?: PluginCloudReleaseSignaturePolicy;
  signatureVerificationStatus?: PluginCloudReleaseSignatureVerificationStatus;
  signatureTrustRoots?: PluginCloudReleaseSignatureTrustRoot[];
  signatureCrypto?: Pick<Crypto, "subtle">;
  packageCacheEntry?: PluginPackageCacheEntry;
  resolveCachedPackage?: PluginCloudReleasePackageAcquisitionOptions["resolveCachedPackage"];
  fetchCloudPackage?: PluginCloudReleasePackageAcquisitionOptions["fetchCloudPackage"];
  skipPackageFetch?: boolean;
  profile?: HostCapabilityProfile;
  installed?: InstalledPluginState[];
  catalogSource?: PluginCloudReleaseEvidenceCatalogSource;
};

export interface PluginLocalInstallRequest {
  appDir: string;
  profile?: HostCapabilityProfile;
  sourceKind?: PackageSourceKind;
}
