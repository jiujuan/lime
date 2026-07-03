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
  parseCloudBootstrapPayload,
} from "../../features/plugin/install/cloudBootstrap";
import {
  buildInstalledPluginState,
  type InstalledPluginStateListResult,
} from "../../features/plugin/install/installedAppState";
import {
  buildPluginHostLifecycleSnapshot,
  type PluginHostLifecycleSnapshot,
  type PluginTaskRuntimeContract,
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
  type PluginInstallReview,
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
  METHOD_PLUGIN_LOCAL_PACKAGE_INSPECT,
  METHOD_PLUGIN_PACKAGE_FETCH_CLOUD,
  METHOD_PLUGIN_SHELL_PREPARE,
  METHOD_PLUGIN_UI_RUNTIME_START,
  METHOD_PLUGIN_UI_RUNTIME_STATUS,
  METHOD_PLUGIN_UI_RUNTIME_STOP,
  type PluginFetchCloudPackageParams,
  type PluginInstalledListResponse,
  type PluginInstalledSaveParams,
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

export const PLUGINS_CHANGED_EVENT = "lime:plugins-changed";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function unwrapEnvelope<T>(payload: unknown): T {
  if (isRecord(payload) && "data" in payload) {
    return payload.data as T;
  }
  return payload as T;
}

type PluginInstalledListAppServerClient = Pick<AppServerClient, "request">;
type PluginUiRuntimeAppServerClient = Pick<AppServerClient, "request">;
type PluginLifecycleAppServerClient = Pick<AppServerClient, "request">;

async function invokePluginCommand<T>(
  command: string,
  args: Record<string, unknown>,
): Promise<T> {
  const result = await safeInvoke<T>(command, args);
  assertNotDiagnosticFacade(command, result, "真实 Plugin current 通道");
  return result;
}

function assertPluginRecord(
  command: string,
  result: unknown,
): asserts result is Record<string, unknown> {
  if (!isRecord(result)) {
    throw new Error(`${command} did not return an object`);
  }
}

function assertNonEmptyStringField(
  command: string,
  result: Record<string, unknown>,
  field: string,
): void {
  if (typeof result[field] !== "string" || !result[field].trim()) {
    throw new Error(`${command} did not return ${field}`);
  }
}

function assertBooleanField(
  command: string,
  result: Record<string, unknown>,
  field: string,
): void {
  if (typeof result[field] !== "boolean") {
    throw new Error(`${command} did not return ${field}`);
  }
}

function assertArrayField(
  command: string,
  result: Record<string, unknown>,
  field: string,
): void {
  if (!Array.isArray(result[field])) {
    throw new Error(`${command} did not return ${field}`);
  }
}

function assertInstalledPluginStateResult(
  command: string,
  result: unknown,
): asserts result is InstalledPluginState {
  assertPluginRecord(command, result);
  assertNonEmptyStringField(command, result, "appId");
  assertNonEmptyStringField(command, result, "installMode");
  assertNonEmptyStringField(command, result, "installedAt");
  assertNonEmptyStringField(command, result, "updatedAt");
  assertBooleanField(command, result, "disabled");
  if (
    !isRecord(result.identity) ||
    !isRecord(result.manifest) ||
    !isRecord(result.projection) ||
    !isRecord(result.readiness) ||
    !isRecord(result.runtimeProfileSummary) ||
    !isRecord(result.setup)
  ) {
    throw new Error(`${command} did not return an installed Plugin state`);
  }
}

function assertPluginLocalPackageInspectionResult(
  command: string,
  result: unknown,
): asserts result is PluginLocalPackageInspection {
  assertPluginRecord(command, result);
  assertNonEmptyStringField(command, result, "appDir");
  assertNonEmptyStringField(command, result, "sourceUri");
  assertNonEmptyStringField(command, result, "manifestSource");
  assertNonEmptyStringField(command, result, "manifestHash");
  assertNonEmptyStringField(command, result, "packageHash");
  assertNonEmptyStringField(command, result, "inspectedAt");
  if (result.manifestSource !== "plugin_json") {
    throw new Error(`${command} returned unsupported manifestSource`);
  }
  if (!isRecord(result.pluginManifest)) {
    throw new Error(`${command} did not return pluginManifest`);
  }
  if (!isRecord(result.manifest)) {
    throw new Error(`${command} did not return manifest`);
  }
}

function assertPluginPackageCacheEntryResult(
  command: string,
  result: unknown,
): asserts result is PluginPackageCacheEntry {
  assertPluginRecord(command, result);
  assertNonEmptyStringField(command, result, "appId");
  assertNonEmptyStringField(command, result, "packageHash");
  assertNonEmptyStringField(command, result, "manifestHash");
  assertNonEmptyStringField(command, result, "cachePath");
  assertNonEmptyStringField(command, result, "cachedAt");
  if (!isRecord(result.identity) || result.manifestSnapshot == null) {
    throw new Error(`${command} did not return a package cache entry`);
  }
}

function assertInstalledPluginStateListResult(
  command: string,
  result: unknown,
): asserts result is InstalledPluginStateListResult {
  assertPluginRecord(command, result);
  const states = result.states;
  const issues = result.issues;
  if (!Array.isArray(states)) {
    throw new Error(`${command} did not return states`);
  }
  if (!Array.isArray(issues)) {
    throw new Error(`${command} did not return issues`);
  }
  states.forEach((state, index) => {
    assertInstalledPluginStateResult(`${command}.states[${index}]`, state);
  });
}

function assertPluginUninstallRehearsalResult(
  command: string,
  result: unknown,
): asserts result is PluginUninstallRehearsalResult {
  assertPluginRecord(command, result);
  assertNonEmptyStringField(command, result, "appId");
  assertNonEmptyStringField(command, result, "mode");
  assertNonEmptyStringField(command, result, "generatedAt");
  if (result.mode !== "keep-data" && result.mode !== "delete-data") {
    throw new Error(`${command} returned unsupported uninstall mode`);
  }
  if (
    typeof result.deletedTargetCount !== "number" ||
    typeof result.retainedTargetCount !== "number" ||
    !Array.isArray(result.targets) ||
    !Array.isArray(result.warnings)
  ) {
    throw new Error(`${command} did not return uninstall rehearsal details`);
  }
}

function assertPluginUninstallResult(
  command: string,
  result: unknown,
): asserts result is PluginUninstallResult {
  assertPluginRecord(command, result);
  if (result.status != null && typeof result.status !== "string") {
    throw new Error(`${command} did not return status`);
  }
  if (!isRecord(result.rehearsal)) {
    throw new Error(`${command} did not return rehearsal`);
  }
  assertPluginUninstallRehearsalResult(command, result.rehearsal);
  assertInstalledPluginStateListResult(command, result.list);
  if (
    typeof result.removedTargetCount !== "number" ||
    typeof result.missingTargetCount !== "number"
  ) {
    throw new Error(`${command} did not return uninstall counters`);
  }
  if (result.blockerCodes != null && !Array.isArray(result.blockerCodes)) {
    throw new Error(`${command} did not return blockerCodes`);
  }
}

function assertPluginSelectDirectoryResult(
  command: string,
  result: unknown,
): asserts result is PluginSelectDirectoryResult {
  assertPluginRecord(command, result);
  const selectedPath = result.path;
  if (typeof result.cancelled !== "boolean") {
    throw new Error(`${command} did not return cancelled`);
  }
  if (selectedPath !== null && typeof selectedPath !== "string") {
    throw new Error(`${command} did not return path`);
  }
  if (
    result.cancelled === false &&
    (selectedPath === null || !selectedPath.trim())
  ) {
    throw new Error(`${command} did not return selected path`);
  }
}

function assertPluginShellLaunchResult(
  command: string,
  result: unknown,
): asserts result is PluginShellLaunchResult {
  assertPluginRecord(command, result);
  assertNonEmptyStringField(command, result, "status");
  if (result.status !== "launched" && result.status !== "blocked") {
    throw new Error(`${command} returned unsupported shell status`);
  }
  assertBooleanField(command, result, "devShell");
  assertArrayField(command, result, "blockerCodes");
  if (result.status === "launched") {
    assertNonEmptyStringField(command, result, "launchedAt");
    assertPluginShellSurfaceInfo(command, result.surface);
  }
}

function assertPluginShellSurfaceInfo(command: string, value: unknown): void {
  if (!value || typeof value !== "object") {
    throw new Error(`${command} did not return shell surface`);
  }
  const record = value as Record<string, unknown>;
  assertNonEmptyStringField(command, record, "activeStrategy");
  if (
    record.activeStrategy !== "controlledBrowserWindow" &&
    record.activeStrategy !== "webContentsView"
  ) {
    throw new Error(`${command} returned unsupported shell surface strategy`);
  }
  assertArrayField(command, record, "supportedStrategies");
  assertNonEmptyStringField(command, record, "entryUrl");
  assertNonEmptyStringField(command, record, "containerId");
  if (!record.embedding || typeof record.embedding !== "object") {
    throw new Error(`${command} did not return shell surface embedding`);
  }
  if (!record.isolation || typeof record.isolation !== "object") {
    throw new Error(`${command} did not return shell surface isolation`);
  }
}

function assertPluginShellPrepareResponse(
  method: string,
  result: unknown,
): asserts result is PluginShellPrepareResponse {
  assertPluginRecord(method, result);
  assertNonEmptyStringField(method, result, "status");
  assertBooleanField(method, result, "devShell");
  assertArrayField(method, result, "blockerCodes");
  if (result.status === "ready") {
    assertNonEmptyStringField(method, result, "appId");
    assertNonEmptyStringField(method, result, "entryKey");
    assertNonEmptyStringField(method, result, "preparedAt");
  }
}

function normalizeInstalledPluginListResponse(
  response: PluginInstalledListResponse | null | undefined,
): InstalledPluginStateListResult {
  if (
    !response ||
    typeof response !== "object" ||
    !Array.isArray(response.states)
  ) {
    throw new Error("App Server pluginInstalled/list did not return states");
  }
  if (!Array.isArray(response.issues)) {
    throw new Error("App Server pluginInstalled/list did not return issues");
  }
  return {
    issues: response.issues as InstalledPluginStateListResult["issues"],
    states: response.states as InstalledPluginState[],
  };
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

function normalizePluginUiRuntimeStatusResponse(
  response: PluginUiRuntimeStatusResponse | null | undefined,
): PluginUiRuntimeStatus {
  if (!response || typeof response !== "object") {
    throw new Error("App Server Plugin UI runtime did not return status");
  }
  if (typeof response.appId !== "string" || !response.appId.trim()) {
    throw new Error("App Server Plugin UI runtime did not return appId");
  }
  if (typeof response.status !== "string" || !response.status.trim()) {
    throw new Error("App Server Plugin UI runtime did not return status");
  }
  return response as PluginUiRuntimeStatus;
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

function normalizeCloudCatalogPayload(value: unknown): CloudBootstrapPayload {
  const data = unwrapEnvelope<unknown>(value);
  if (isRecord(data) && data.pluginCatalog != null) {
    return normalizeCloudCatalogPayload(data.pluginCatalog);
  }
  if (isRecord(data) && data.bootstrap != null) {
    return normalizeCloudCatalogPayload(data.bootstrap);
  }
  if (isRecord(data) && Array.isArray(data.apps)) {
    return parseCloudBootstrapPayload(data);
  }
  if (isRecord(data) && Array.isArray(data.items)) {
    return parseCloudBootstrapPayload({
      schemaVersion: "plugin-cloud-bootstrap/v1",
      tenantId: typeof data.tenantId === "string" ? data.tenantId : undefined,
      generatedAt:
        typeof data.generatedAt === "string" ? data.generatedAt : undefined,
      apps: data.items,
    });
  }
  throw new Error("Plugin 云端目录格式非法。");
}

function buildEmptyCloudPayload(): CloudBootstrapPayload {
  return {
    schemaVersion: "plugin-cloud-bootstrap/v1",
    tenantId: "unavailable",
    generatedAt: "1970-01-01T00:00:00.000Z",
    apps: [],
  };
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

function normalizePluginHostLifecycleListResponse(
  response: unknown,
): PluginHostLifecycleListResult {
  if (!isRecord(response) || !Array.isArray(response.snapshots)) {
    throw new Error(
      "App Server pluginHostLifecycle/list did not return snapshots",
    );
  }
  if (!Array.isArray(response.issues)) {
    throw new Error(
      "App Server pluginHostLifecycle/list did not return issues",
    );
  }
  return {
    snapshots: response.snapshots as PluginHostLifecycleSnapshot[],
    issues: response.issues,
  };
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
