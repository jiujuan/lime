import { AppServerClient } from "@/lib/api/appServer";
import { safeInvoke } from "@/lib/dev-bridge";
import { assertNotDiagnosticFacade } from "./diagnosticFacade";
import {
  getClientPlugins,
  submitClientPluginRegistrationCode,
} from "./oemCloudControlPlane";
import {
  resolveOemCloudPluginSignatureTrustRoots,
  resolveOemCloudRuntimeContext,
} from "./oemCloudRuntime";
import {
  PluginCloudBootstrapError,
  buildCloudBootstrapInstalledAppPreview,
  buildCloudReleaseDescriptor,
  buildVerifiedCloudReleasePackage,
} from "../../features/plugin/install/cloudBootstrap";
import {
  buildInstalledPluginState,
  type InstalledPluginStateListResult,
} from "../../features/plugin/install/installedAppState";
import {
  buildPluginHostLifecycleSnapshot,
  type PluginHostLifecycleSnapshot,
} from "../../features/plugin/host";
import type { ShellDescriptor } from "../../features/plugin/shell";
import { buildInstalledAppPreview } from "../../features/plugin/install/installedAppPreview";
import { buildPackageIdentity } from "../../features/plugin/install/packageIdentity";
import { buildPluginLabResolvedSetupState } from "../../features/plugin/install/labInstallFlow";
import {
  verifyPluginPackageCacheEntry,
  type PluginPackageCacheEntry,
} from "../../features/plugin/install/packageCache";
import {
  buildPluginInstallReview,
  buildCloudPluginSourceState,
  buildLocalPluginSourceState,
} from "../../features/plugin/install/installReview";
import { buildCloudReleaseEvidence } from "../../features/plugin/install/cloudReleaseEvidence";
import { verifyCloudReleaseSignature } from "../../features/plugin/install/cloudReleaseSignature";
import type {
  PluginCloudReleaseEvidenceCatalogSource,
  PluginCloudReleaseSignaturePolicy,
  PluginCloudReleaseSignatureVerificationStatus,
} from "../../features/plugin/install/cloudReleaseEvidence";
import type {
  AppManifest,
  CloudBootstrapApp,
  CloudBootstrapPayload,
  CloudBootstrapReleaseDescriptor,
  PluginCloudReleaseSignatureTrustRoot,
  HostCapabilityProfile,
  InstalledPluginState,
  PackageSourceKind,
} from "../../features/plugin/types";
import {
  METHOD_PLUGIN_INSTALLED_DISABLED_SET,
  METHOD_PLUGIN_HOST_LIFECYCLE_LIST,
  METHOD_PLUGIN_INSTALLED_LIST,
  METHOD_PLUGIN_INSTALLED_SAVE,
  METHOD_PLUGIN_INSTALLED_UNINSTALL,
  METHOD_PLUGIN_INSTALLED_UNINSTALL_REHEARSAL,
  METHOD_PLUGIN_LOCAL_PACKAGE_EXPORT,
  METHOD_PLUGIN_LOCAL_PACKAGE_INSPECT,
  METHOD_PLUGIN_PACKAGE_FETCH_CLOUD,
  METHOD_PLUGIN_SHELL_PREPARE,
  METHOD_PLUGIN_UI_RUNTIME_START,
  METHOD_PLUGIN_UI_RUNTIME_STATUS,
  METHOD_PLUGIN_UI_RUNTIME_STOP,
  type PluginFetchCloudPackageParams,
  type PluginInstalledListResponse,
  type PluginInstalledSaveParams,
  type PluginLocalPackageExportParams,
  type PluginLocalPackageExportResponse,
  type PluginLocalPackageInspectParams,
  type PluginLocalPackageInspectResponse,
  type PluginPackageCacheEntry as AppServerPluginPackageCacheEntry,
  type PluginShellPrepareResponse,
  type PluginUninstallParams,
  type PluginUninstallRehearsalParams,
  type PluginUninstallRehearsalResponse,
  type PluginUninstallResponse,
  type PluginUiRuntimeStartParams,
  type PluginUiRuntimeStatusParams,
  type PluginUiRuntimeStatusResponse,
  type PluginUiRuntimeStopParams,
} from "../../../packages/app-server-client/src/protocol";
import {
  assertInstalledPluginStateListResult,
  assertInstalledPluginStateResult,
  assertPluginLocalPackageExportResult,
  assertPluginLocalPackageInspectionResult,
  assertPluginPackageCacheEntryResult,
  assertPluginSelectDirectoryResult,
  assertPluginShellLaunchResult,
  assertPluginShellPrepareResponse,
  assertPluginUninstallRehearsalResult,
  assertPluginUninstallResult,
  buildEmptyCloudPayload,
  isRecord,
  normalizeCloudCatalogPayload,
  normalizeInstalledPluginListResponse,
  normalizePluginHostLifecycleListResponse,
  normalizePluginUiRuntimeStatusResponse,
} from "./pluginsResultGuards";
export { PluginRegistrationRequiredError } from "./pluginsTypes";
import { PluginRegistrationRequiredError } from "./pluginsTypes";
export type {
  PluginCloudCatalogResult,
  PluginCloudReleasePackageAcquisitionOptions,
  PluginCloudReleasePackageAcquisitionParams,
  PluginCloudReleasePackageAcquisitionResult,
  PluginCloudReleasePackageSourceKind,
  PluginDeleteDataExecutionEvidence,
  PluginDeleteDataTargetEvidence,
  PluginDisabledRequest,
  PluginHostLifecycleListResult,
  PluginInstalledStateSaveRequest,
  PluginInstallReviewResult,
  PluginLifecycleAppServerClient,
  PluginLocalPackageExport,
  PluginLocalPackageInspection,
  PluginSelectDirectoryRequest,
  PluginSelectDirectoryResult,
  PluginShellLaunchRequest,
  PluginShellLaunchResult,
  PluginShellPackageMount,
  PluginShellSurfaceInfo,
  PluginShellSurfaceStrategy,
  PluginShellWindowInfo,
  PluginUiRuntimeStartRequest,
  PluginUiRuntimeStatus,
  PluginUiRuntimeStatusRequest,
  PluginUiRuntimeStopRequest,
  PluginUninstallRehearsalRequest,
  PluginUninstallRehearsalResult,
  PluginUninstallRequest,
  PluginUninstallResult,
  SelectLocalPluginDirectoryOptions,
} from "./pluginsTypes";
import type {
  PluginCloudCatalogResult,
  PluginCloudReleasePackageAcquisitionOptions,
  PluginCloudReleasePackageAcquisitionParams,
  PluginCloudReleasePackageAcquisitionResult,
  PluginDisabledRequest,
  PluginHostLifecycleListResult,
  PluginInstalledListAppServerClient,
  PluginInstalledStateSaveRequest,
  PluginInstallReviewResult,
  PluginLifecycleAppServerClient,
  PluginLocalPackageExport,
  PluginLocalPackageInspection,
  PluginSelectDirectoryRequest,
  PluginSelectDirectoryResult,
  PluginShellLaunchRequest,
  PluginShellLaunchResult,
  PluginUiRuntimeAppServerClient,
  PluginUiRuntimeStartRequest,
  PluginUiRuntimeStatus,
  PluginUiRuntimeStatusRequest,
  PluginUiRuntimeStopRequest,
  PluginUninstallRehearsalRequest,
  PluginUninstallRehearsalResult,
  PluginUninstallRequest,
  PluginUninstallResult,
  SelectLocalPluginDirectoryOptions,
} from "./pluginsTypes";

export const PLUGINS_CHANGED_EVENT = "lime:plugins-changed";

async function invokePluginCommand<T>(
  command: string,
  args: Record<string, unknown>,
): Promise<T> {
  const result = await safeInvoke<T>(command, args);
  assertNotDiagnosticFacade(command, result, "真实 Plugin current 通道");
  return result;
}

async function requestPluginInstalledListAppServer(
  appServerClient: PluginInstalledListAppServerClient = new AppServerClient(),
): Promise<InstalledPluginStateListResult> {
  const response = await appServerClient.request<PluginInstalledListResponse>(
    METHOD_PLUGIN_INSTALLED_LIST,
    {},
  );
  return normalizeInstalledPluginListResponse(response.result);
}

async function requestPluginShellPrepareAppServer(
  descriptor: ShellDescriptor,
  appServerClient: Pick<AppServerClient, "request"> = new AppServerClient(),
): Promise<PluginShellPrepareResponse> {
  const response = await appServerClient.request<PluginShellPrepareResponse>(
    METHOD_PLUGIN_SHELL_PREPARE,
    {
      descriptor,
    },
  );
  assertPluginShellPrepareResponse(
    METHOD_PLUGIN_SHELL_PREPARE,
    response.result,
  );
  return response.result;
}

async function requestPluginAppServer<T>(
  method: string,
  params: unknown,
  appServerClient: PluginLifecycleAppServerClient = new AppServerClient(),
): Promise<T> {
  const response = await appServerClient.request<T>(method, params);
  if (isRecord(response) && "result" in response) {
    return response.result as T;
  }
  return response as T;
}

async function requestPluginUiRuntimeAppServer(
  method:
    | typeof METHOD_PLUGIN_UI_RUNTIME_START
    | typeof METHOD_PLUGIN_UI_RUNTIME_STATUS
    | typeof METHOD_PLUGIN_UI_RUNTIME_STOP,
  params:
    | PluginUiRuntimeStartParams
    | PluginUiRuntimeStatusParams
    | PluginUiRuntimeStopParams,
  appServerClient: PluginUiRuntimeAppServerClient = new AppServerClient(),
): Promise<PluginUiRuntimeStatus> {
  const response =
    await appServerClient.request<PluginUiRuntimeStatusResponse>(
      method,
      params,
    );
  return normalizePluginUiRuntimeStatusResponse(response.result);
}

function readBootstrapPluginCatalog(): CloudBootstrapPayload | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return normalizeCloudCatalogPayload(window.__LIME_BOOTSTRAP__);
  } catch {
    return null;
  }
}

export async function inspectLocalPluginPackage(
  appDir: string,
): Promise<PluginLocalPackageInspection> {
  const result =
    await requestPluginAppServer<PluginLocalPackageInspectResponse>(
      METHOD_PLUGIN_LOCAL_PACKAGE_INSPECT,
      { appDir } satisfies PluginLocalPackageInspectParams,
    );
  assertPluginLocalPackageInspectionResult(
    METHOD_PLUGIN_LOCAL_PACKAGE_INSPECT,
    result,
  );
  return result as PluginLocalPackageInspection;
}

export async function exportLocalPluginPackage(params: {
  appDir: string;
}): Promise<PluginLocalPackageExport> {
  const result = await requestPluginAppServer<PluginLocalPackageExportResponse>(
    METHOD_PLUGIN_LOCAL_PACKAGE_EXPORT,
    { appDir: params.appDir } satisfies PluginLocalPackageExportParams,
  );
  assertPluginLocalPackageExportResult(
    METHOD_PLUGIN_LOCAL_PACKAGE_EXPORT,
    result,
  );
  return result as PluginLocalPackageExport;
}

export async function selectLocalPluginDirectory(
  options: SelectLocalPluginDirectoryOptions = {},
): Promise<string | null> {
  const selected = await selectPluginDirectory({ title: options.title });
  return selected.cancelled ? null : selected.path;
}

export async function listInstalledPlugins(): Promise<InstalledPluginStateListResult> {
  return requestPluginInstalledListAppServer();
}

export function buildPluginHostLifecycleForInstalledState(
  state: InstalledPluginState,
  generatedAt?: string,
): PluginHostLifecycleSnapshot {
  return buildPluginHostLifecycleSnapshot({
    manifest: state.manifest,
    readiness: state.readiness,
    installedState: state,
    generatedAt: generatedAt ?? state.updatedAt,
  });
}

export async function listPluginHostLifecycleSnapshots(
  appServerClient?: PluginLifecycleAppServerClient,
): Promise<PluginHostLifecycleListResult> {
  const result = await requestPluginAppServer<unknown>(
    METHOD_PLUGIN_HOST_LIFECYCLE_LIST,
    {},
    appServerClient,
  );
  return normalizePluginHostLifecycleListResponse(result);
}

export async function saveInstalledPluginState(
  request: PluginInstalledStateSaveRequest,
): Promise<InstalledPluginState> {
  // 旧 facade 已退役：不得回退 "plugin_save_installed_state" 或 "plugin_uninstall"。
  const result = await requestPluginAppServer<unknown>(
    METHOD_PLUGIN_INSTALLED_SAVE,
    {
      state: request.state,
    } satisfies PluginInstalledSaveParams,
  );
  assertInstalledPluginStateResult(METHOD_PLUGIN_INSTALLED_SAVE, result);
  return result;
}

export async function fetchCloudPluginPackage(
  descriptor: CloudBootstrapReleaseDescriptor,
): Promise<PluginPackageCacheEntry> {
  const result =
    await requestPluginAppServer<AppServerPluginPackageCacheEntry>(
      METHOD_PLUGIN_PACKAGE_FETCH_CLOUD,
      {
        descriptor,
      } satisfies PluginFetchCloudPackageParams,
    );
  assertPluginPackageCacheEntryResult(
    METHOD_PLUGIN_PACKAGE_FETCH_CLOUD,
    result,
  );
  return result as PluginPackageCacheEntry;
}

export async function reviewLocalPluginPackage(params: {
  appDir: string;
  profile?: HostCapabilityProfile;
  sourceKind?: PackageSourceKind;
}): Promise<PluginInstallReviewResult> {
  const inspection = await inspectLocalPluginPackage(params.appDir);
  await assertLocalPluginRegistrationAllowed(inspection.manifest);
  const packageIdentity = buildPackageIdentity({
    manifest: inspection.manifest,
    sourceKind: params.sourceKind ?? "local_folder",
    sourceUri: inspection.sourceUri,
    loadedAt: inspection.inspectedAt,
  });
  const identity = {
    ...packageIdentity,
    packageHash: inspection.packageHash,
    manifestHash: inspection.manifestHash,
  };
  const setupPreview = buildInstalledAppPreview({
    fixture: inspection.manifest,
    identity,
    profile: params.profile,
    loadedAt: inspection.inspectedAt,
    checkedAt: inspection.inspectedAt,
    generatedAt: inspection.inspectedAt,
  });
  const setup = buildPluginLabResolvedSetupState(setupPreview.projection);
  const preview = buildInstalledAppPreview({
    fixture: inspection.manifest,
    identity,
    setup,
    profile: params.profile,
    loadedAt: inspection.inspectedAt,
    checkedAt: inspection.inspectedAt,
    generatedAt: inspection.inspectedAt,
  });
  const state = buildInstalledPluginState({
    preview,
    setup,
    installedAt: inspection.inspectedAt,
    updatedAt: inspection.inspectedAt,
  });

  return {
    review: buildPluginInstallReview({
      preview,
      sourceState: buildLocalPluginSourceState(),
      generatedAt: inspection.inspectedAt,
    }),
    state,
  };
}

export async function installLocalPluginPackage(params: {
  appDir: string;
  profile?: HostCapabilityProfile;
  sourceKind?: PackageSourceKind;
}): Promise<InstalledPluginState> {
  const result = await reviewLocalPluginPackage(params);
  return saveInstalledPluginState({ state: result.state });
}

function isEnterpriseCustomLocalManifest(manifest: AppManifest): boolean {
  const metadata = (manifest as AppManifest & { metadata?: unknown }).metadata;
  return (
    isRecord(metadata) &&
    typeof metadata.distribution === "string" &&
    metadata.distribution.trim() === "enterprise_custom"
  );
}

async function assertLocalPluginRegistrationAllowed(
  manifest: AppManifest,
): Promise<void> {
  if (!isEnterpriseCustomLocalManifest(manifest)) {
    return;
  }

  const catalog = await getPluginCloudCatalog();
  const app = catalog.payload.apps.find((item) => item.appId === manifest.name);
  if (
    !app ||
    app.registrationRequired !== true ||
    app.registrationState !== "active"
  ) {
    throw new PluginRegistrationRequiredError();
  }
}

export async function getPluginCloudCatalog(): Promise<PluginCloudCatalogResult> {
  const runtime = resolveOemCloudRuntimeContext();
  const bootstrapCatalog = readBootstrapPluginCatalog();
  if (runtime) {
    try {
      return {
        payload: await getClientPlugins(runtime.tenantId),
        source: "remote",
      };
    } catch {
      if (bootstrapCatalog) {
        return { payload: bootstrapCatalog, source: "bootstrap" };
      }
    }
  }

  return {
    payload: bootstrapCatalog ?? buildEmptyCloudPayload(),
    source: "bootstrap",
  };
}

export async function submitPluginRegistrationCode(
  appId: string,
  code: string,
): Promise<PluginCloudCatalogResult> {
  const runtime = resolveOemCloudRuntimeContext();
  if (!runtime) {
    throw new Error("Plugin 注册需要先登录 Lime 云端账号。");
  }
  return {
    payload: await submitClientPluginRegistrationCode(
      runtime.tenantId,
      appId,
      {
        code,
      },
    ),
    source: "remote",
  };
}

export async function installCloudPluginRelease(params: {
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
  catalogSource?: PluginCloudReleaseEvidenceCatalogSource;
}): Promise<InstalledPluginState> {
  const result = await reviewCloudPluginRelease(params);
  if (result.review.releaseEvidence?.status === "blocked") {
    throw new PluginCloudBootstrapError(
      `Cloud release ${params.app.appId}@${params.app.version} did not pass release evidence gates: ${result.review.releaseEvidence.blockerCodes.join(", ")}`,
    );
  }
  return saveInstalledPluginState({ state: result.state });
}

export async function resolveCloudReleasePackageManifest(
  params: PluginCloudReleasePackageAcquisitionParams,
): Promise<PluginCloudReleasePackageAcquisitionResult> {
  const descriptor = buildCloudReleaseDescriptor({
    app: params.app,
    loadedAt: params.loadedAt,
  });

  if (params.packageManifest != null) {
    if (!params.actualPackageHash || !params.actualManifestHash) {
      throw new PluginCloudBootstrapError(
        `Cloud release ${params.app.appId}@${params.app.version} requires actual packageHash and manifestHash evidence before install review.`,
      );
    }
    return {
      descriptor,
      packageManifest: params.packageManifest,
      actualPackageHash: params.actualPackageHash,
      actualManifestHash: params.actualManifestHash,
      sourceKind: "explicit_manifest",
    };
  }

  const cacheEntry =
    params.packageCacheEntry ??
    (await params.resolveCachedPackage?.(descriptor));
  if (cacheEntry) {
    const verification = verifyPluginPackageCacheEntry(
      cacheEntry,
      descriptor.identity,
    );
    if (verification.status !== "verified") {
      throw new PluginCloudBootstrapError(verification.message);
    }
    return {
      descriptor,
      packageManifest: cacheEntry.manifestSnapshot,
      actualPackageHash: cacheEntry.packageHash,
      actualManifestHash: cacheEntry.manifestHash,
      sourceKind: "verified_cache",
    };
  }

  if (!params.skipPackageFetch) {
    const fetchedEntry = await (params.fetchCloudPackage?.(descriptor) ??
      fetchCloudPluginPackage(descriptor));
    const verification = verifyPluginPackageCacheEntry(
      fetchedEntry,
      descriptor.identity,
    );
    if (verification.status !== "verified") {
      throw new PluginCloudBootstrapError(verification.message);
    }
    return {
      descriptor,
      packageManifest: fetchedEntry.manifestSnapshot,
      actualPackageHash: fetchedEntry.packageHash,
      actualManifestHash: fetchedEntry.manifestHash,
      sourceKind: "fetched_package",
    };
  }

  throw new PluginCloudBootstrapError(
    `Cloud release ${params.app.appId}@${params.app.version} is missing a verified package source before install review.`,
  );
}

export async function reviewCloudPluginRelease(params: {
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
}): Promise<PluginInstallReviewResult> {
  const acquiredPackage = await resolveCloudReleasePackageManifest(params);
  const verifiedPackage = buildVerifiedCloudReleasePackage({
    app: params.app,
    packageManifest: acquiredPackage.packageManifest,
    actualPackageHash: acquiredPackage.actualPackageHash,
    actualManifestHash: acquiredPackage.actualManifestHash,
    loadedAt: acquiredPackage.descriptor.loadedAt,
  });
  if (verifiedPackage.verification.status !== "verified") {
    throw new PluginCloudBootstrapError(verifiedPackage.verification.message);
  }
  const signatureVerificationStatus =
    params.signatureVerificationStatus ??
    (await verifyCloudReleaseSignature({
      app: params.app,
      trustRoots:
        params.signatureTrustRoots ??
        resolveOemCloudPluginSignatureTrustRoots(),
      crypto: params.signatureCrypto,
    }));
  const releaseEvidence = buildCloudReleaseEvidence({
    app: params.app,
    catalogSource: params.catalogSource ?? "unknown",
    sourceKind: acquiredPackage.sourceKind,
    actualPackageHash: acquiredPackage.actualPackageHash,
    actualManifestHash: acquiredPackage.actualManifestHash,
    signaturePolicy:
      params.signaturePolicy ??
      (params.catalogSource === "remote" ? "required" : "optional"),
    signatureVerificationStatus,
    packageVerificationStatus: verifiedPackage.verification.status,
  });
  const setupPreview = buildCloudBootstrapInstalledAppPreview({
    app: params.app,
    packageManifest: acquiredPackage.packageManifest,
    packageVerification: verifiedPackage.verification,
    setup: {},
    profile: params.profile,
    loadedAt: verifiedPackage.descriptor.loadedAt,
  });
  const setup = buildPluginLabResolvedSetupState(setupPreview.projection);
  const preview = buildCloudBootstrapInstalledAppPreview({
    app: params.app,
    packageManifest: acquiredPackage.packageManifest,
    packageVerification: verifiedPackage.verification,
    setup,
    profile: params.profile,
    loadedAt: setupPreview.identity.loadedAt,
    checkedAt: setupPreview.readiness.checkedAt,
    generatedAt: setupPreview.cleanupPlan.generatedAt,
  });
  const setupWithCloudReleaseEvidence = {
    ...setup,
    cloudReleaseEvidence: releaseEvidence,
  };
  const state = buildInstalledPluginState({
    preview,
    setup: setupWithCloudReleaseEvidence,
    installedAt: preview.identity.loadedAt,
    updatedAt: preview.identity.loadedAt,
  });

  return {
    review: buildPluginInstallReview({
      preview,
      releaseEvidence,
      packageVerificationStatus: verifiedPackage.verification.status,
      sourceState: buildCloudPluginSourceState({
        app: params.app,
        catalogSource: params.catalogSource ?? "unknown",
        installed: params.installed ?? [],
        releaseEvidence,
      }),
      generatedAt: preview.identity.loadedAt,
    }),
    state,
  };
}

export async function setPluginDisabled(
  request: PluginDisabledRequest,
): Promise<InstalledPluginStateListResult> {
  const result = await requestPluginAppServer<PluginInstalledListResponse>(
    METHOD_PLUGIN_INSTALLED_DISABLED_SET,
    request,
  );
  assertInstalledPluginStateListResult(
    METHOD_PLUGIN_INSTALLED_DISABLED_SET,
    result,
  );
  return result;
}

export async function previewPluginUninstall(
  request: PluginUninstallRehearsalRequest,
): Promise<PluginUninstallRehearsalResult> {
  const result =
    await requestPluginAppServer<PluginUninstallRehearsalResponse>(
      METHOD_PLUGIN_INSTALLED_UNINSTALL_REHEARSAL,
      request satisfies PluginUninstallRehearsalParams,
    );
  assertPluginUninstallRehearsalResult(
    METHOD_PLUGIN_INSTALLED_UNINSTALL_REHEARSAL,
    result,
  );
  return result as PluginUninstallRehearsalResult;
}

export async function uninstallPlugin(
  request: PluginUninstallRequest,
): Promise<PluginUninstallResult> {
  const result = await requestPluginAppServer<PluginUninstallResponse>(
    METHOD_PLUGIN_INSTALLED_UNINSTALL,
    request satisfies PluginUninstallParams,
  );
  assertPluginUninstallResult(METHOD_PLUGIN_INSTALLED_UNINSTALL, result);
  return result as PluginUninstallResult;
}

export async function startPluginUiRuntime(
  request: PluginUiRuntimeStartRequest,
): Promise<PluginUiRuntimeStatus> {
  return requestPluginUiRuntimeAppServer(METHOD_PLUGIN_UI_RUNTIME_START, {
    appId: request.appId,
    entryKey: request.entryKey,
  });
}

export async function getPluginUiRuntimeStatus(
  request: PluginUiRuntimeStatusRequest,
): Promise<PluginUiRuntimeStatus> {
  return requestPluginUiRuntimeAppServer(METHOD_PLUGIN_UI_RUNTIME_STATUS, {
    appId: request.appId,
  });
}

export async function stopPluginUiRuntime(
  request: PluginUiRuntimeStopRequest,
): Promise<PluginUiRuntimeStatus> {
  return requestPluginUiRuntimeAppServer(METHOD_PLUGIN_UI_RUNTIME_STOP, {
    appId: request.appId,
  });
}

export async function selectPluginDirectory(
  request: PluginSelectDirectoryRequest = {},
): Promise<PluginSelectDirectoryResult> {
  const result = await invokePluginCommand<unknown>(
    "plugin_select_directory",
    {
      request,
    },
  );
  assertPluginSelectDirectoryResult("plugin_select_directory", result);
  return result;
}

export async function launchPluginShell(
  request: PluginShellLaunchRequest,
): Promise<PluginShellLaunchResult> {
  const result = await invokePluginCommand<unknown>(
    "plugin_launch_shell",
    {
      request,
    },
  );
  assertPluginShellLaunchResult("plugin_launch_shell", result);
  return result;
}

export {
  requestPluginShellPrepareAppServer as preparePluginShellForAppServerTestOnly,
};
