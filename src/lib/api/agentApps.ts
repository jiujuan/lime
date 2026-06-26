import { AppServerClient } from "@/lib/api/appServer";
import { safeInvoke } from "@/lib/dev-bridge";
import { assertNotDiagnosticFacade } from "./diagnosticFacade";
import {
  getClientAgentApps,
  submitClientAgentAppRegistrationCode,
} from "./oemCloudControlPlane";
import {
  resolveOemCloudAgentAppSignatureTrustRoots,
  resolveOemCloudRuntimeContext,
} from "./oemCloudRuntime";
import contentFactoryFixture from "../../features/agent-app/fixtures/content-factory-app.json";
import {
  AgentAppCloudBootstrapError,
  buildCloudBootstrapInstalledAppPreview,
  buildCloudReleaseDescriptor,
  buildVerifiedCloudReleasePackage,
  parseCloudBootstrapPayload,
} from "../../features/agent-app/install/cloudBootstrap";
import {
  buildInstalledAgentAppState,
  type InstalledAgentAppStateListResult,
} from "../../features/agent-app/install/installedAppState";
import {
  buildAgentAppHostLifecycleSnapshot,
  type AgentAppHostLifecycleSnapshot,
  type AgentAppTaskRuntimeContract,
} from "../../features/agent-app/host";
import type { ShellDescriptor } from "../../features/agent-app/shell";
import { buildInstalledAppPreview } from "../../features/agent-app/install/installedAppPreview";
import { buildPackageIdentity } from "../../features/agent-app/install/packageIdentity";
import { buildAgentAppLabResolvedSetupState } from "../../features/agent-app/install/labInstallFlow";
import {
  verifyAgentAppPackageCacheEntry,
  type AgentAppPackageCacheEntry,
} from "../../features/agent-app/install/packageCache";
import {
  buildAgentAppInstallReview,
  buildCloudAgentAppSourceState,
  buildLocalAgentAppSourceState,
  type AgentAppInstallReview,
} from "../../features/agent-app/install/installReview";
import { buildCloudReleaseEvidence } from "../../features/agent-app/install/cloudReleaseEvidence";
import { verifyCloudReleaseSignature } from "../../features/agent-app/install/cloudReleaseSignature";
import type {
  AgentAppCloudReleaseSignaturePolicy,
  AgentAppCloudReleaseSignatureVerificationStatus,
} from "../../features/agent-app/install/cloudReleaseEvidence";
import type {
  AppManifest,
  CloudBootstrapApp,
  CloudBootstrapPayload,
  CloudBootstrapReleaseDescriptor,
  AgentAppCloudReleaseSignatureTrustRoot,
  HostCapabilityProfile,
  InstalledAgentAppState,
  PackageSourceKind,
} from "../../features/agent-app/types";
import {
  METHOD_AGENT_APP_INSTALLED_DISABLED_SET,
  METHOD_AGENT_APP_HOST_LIFECYCLE_LIST,
  METHOD_AGENT_APP_INSTALLED_LIST,
  METHOD_AGENT_APP_INSTALLED_SAVE,
  METHOD_AGENT_APP_INSTALLED_UNINSTALL,
  METHOD_AGENT_APP_INSTALLED_UNINSTALL_REHEARSAL,
  METHOD_AGENT_APP_LOCAL_PACKAGE_INSPECT,
  METHOD_AGENT_APP_PACKAGE_FETCH_CLOUD,
  METHOD_AGENT_APP_SHELL_PREPARE,
  METHOD_AGENT_APP_UI_RUNTIME_START,
  METHOD_AGENT_APP_UI_RUNTIME_STATUS,
  METHOD_AGENT_APP_UI_RUNTIME_STOP,
  type AgentAppFetchCloudPackageParams,
  type AgentAppInstalledListResponse,
  type AgentAppInstalledSaveParams,
  type AgentAppLocalPackageInspectParams,
  type AgentAppLocalPackageInspectResponse,
  type AgentAppPackageCacheEntry as AppServerAgentAppPackageCacheEntry,
  type AgentAppShellPrepareResponse,
  type AgentAppUninstallParams,
  type AgentAppUninstallRehearsalParams,
  type AgentAppUninstallRehearsalResponse,
  type AgentAppUninstallResponse,
  type AgentAppUiRuntimeStartParams,
  type AgentAppUiRuntimeStatusParams,
  type AgentAppUiRuntimeStatusResponse,
  type AgentAppUiRuntimeStopParams,
} from "../../../packages/app-server-client/src/protocol";

export const AGENT_APPS_CHANGED_EVENT = "lime:agent-apps-changed";

export interface AgentAppLocalPackageInspection {
  sourceKind: "local_folder";
  sourceUri: string;
  appDir: string;
  appMarkdown: string;
  manifest: AppManifest;
  manifestHash: string;
  packageHash: string;
  inspectedAt: string;
}

export interface AgentAppInstalledStateSaveRequest {
  state: InstalledAgentAppState;
}

export interface AgentAppInstallReviewResult {
  review: AgentAppInstallReview;
  state: InstalledAgentAppState;
}

export type AgentAppCloudReleasePackageSourceKind =
  | "explicit_manifest"
  | "verified_cache"
  | "fetched_package";

export interface AgentAppCloudReleasePackageAcquisitionResult {
  descriptor: CloudBootstrapReleaseDescriptor;
  packageManifest: unknown;
  actualPackageHash?: string;
  actualManifestHash?: string;
  sourceKind: AgentAppCloudReleasePackageSourceKind;
}

export interface AgentAppCloudReleasePackageAcquisitionOptions {
  packageManifest?: unknown;
  actualPackageHash?: string;
  actualManifestHash?: string;
  signaturePolicy?: AgentAppCloudReleaseSignaturePolicy;
  signatureVerificationStatus?: AgentAppCloudReleaseSignatureVerificationStatus;
  signatureTrustRoots?: AgentAppCloudReleaseSignatureTrustRoot[];
  signatureCrypto?: Pick<Crypto, "subtle">;
  packageCacheEntry?: AgentAppPackageCacheEntry;
  resolveCachedPackage?: (
    descriptor: CloudBootstrapReleaseDescriptor,
  ) =>
    | AgentAppPackageCacheEntry
    | undefined
    | Promise<AgentAppPackageCacheEntry | undefined>;
  fetchCloudPackage?: (
    descriptor: CloudBootstrapReleaseDescriptor,
  ) => AgentAppPackageCacheEntry | Promise<AgentAppPackageCacheEntry>;
  skipPackageFetch?: boolean;
}

export type AgentAppCloudReleasePackageAcquisitionParams = {
  app: CloudBootstrapApp;
  loadedAt?: string;
} & AgentAppCloudReleasePackageAcquisitionOptions;

export interface AgentAppDisabledRequest {
  appId: string;
  disabled: boolean;
  updatedAt?: string;
}

export interface AgentAppUninstallRehearsalRequest {
  appId: string;
  mode: "keep-data" | "delete-data";
}

export interface AgentAppUninstallRequest extends AgentAppUninstallRehearsalRequest {
  confirmationPhrase?: string;
}

export interface AgentAppUninstallRehearsalResult {
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

export interface AgentAppDeleteDataTargetEvidence {
  kind: string;
  value: string;
  action: string;
  reason: string;
  status: "removed" | "missing" | "retained" | "blocked" | "failed" | string;
  blockerCodes: string[];
  error?: string | null;
}

export interface AgentAppDeleteDataExecutionEvidence {
  status: "deleted" | "blocked" | "failed" | string;
  generatedAt: string;
  dataRoot: string;
  removedTargets: AgentAppDeleteDataTargetEvidence[];
  missingTargets: AgentAppDeleteDataTargetEvidence[];
  retainedTargets: AgentAppDeleteDataTargetEvidence[];
  blockedTargets: AgentAppDeleteDataTargetEvidence[];
  failedTarget?: AgentAppDeleteDataTargetEvidence | null;
  blockerCodes: string[];
  postDeleteResidualAudit?: {
    status: "clear" | "residual_present" | "not_run" | "failed" | string;
    checkedAt: string;
    checkedTargetCount: number;
    remainingTargetCount: number;
    remainingTargets: AgentAppDeleteDataTargetEvidence[];
    failedTarget?: AgentAppDeleteDataTargetEvidence | null;
  };
}

export interface AgentAppUninstallResult {
  status?:
    | "rehearsal_only"
    | "blocked"
    | "deleted"
    | "uninstalled"
    | "failed"
    | string;
  rehearsal: AgentAppUninstallRehearsalResult;
  list: InstalledAgentAppStateListResult;
  removedTargetCount: number;
  missingTargetCount: number;
  blockerCodes?: string[];
  deleteEvidence?: AgentAppDeleteDataExecutionEvidence | null;
}

export interface AgentAppUiRuntimeStartRequest {
  appId: string;
  entryKey?: string;
}

export interface AgentAppUiRuntimeStatusRequest {
  appId: string;
}

export interface AgentAppUiRuntimeStopRequest {
  appId: string;
}

export interface AgentAppShellLaunchRequest {
  descriptor: ShellDescriptor;
}

export interface AgentAppSelectDirectoryRequest {
  title?: string;
}

export interface AgentAppSelectDirectoryResult {
  path: string | null;
  cancelled: boolean;
  message?: string;
}

export interface AgentAppUiRuntimeStatus {
  appId: string;
  status: "starting" | "running" | "stopped" | "failed";
  baseUrl?: string;
  entryUrl?: string;
  port?: number;
  pid?: number;
  message?: string;
  entryKey?: string;
  route?: string;
  taskRuntime?: AgentAppTaskRuntimeContract;
}

export interface AgentAppShellPackageMount {
  kind: "local_dir" | "mock";
  path: string;
  readOnly: boolean;
  packageHash: string;
  manifestHash: string;
}

export interface AgentAppShellWindowInfo {
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

export type AgentAppShellSurfaceStrategy =
  | "controlledBrowserWindow"
  | "webContentsView";

export interface AgentAppShellSurfaceInfo {
  activeStrategy: AgentAppShellSurfaceStrategy;
  supportedStrategies: AgentAppShellSurfaceStrategy[];
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

export interface AgentAppShellLaunchResult {
  appId?: string;
  status: "launched" | "blocked";
  installMode?: ShellDescriptor["installMode"];
  shellKind?: ShellDescriptor["runtimeProfile"]["shellKind"];
  descriptorVersion?: ShellDescriptor["descriptorVersion"];
  devShell: boolean;
  blockerCodes: string[];
  message?: string;
  packageMount?: AgentAppShellPackageMount;
  runtimeStatus?: AgentAppUiRuntimeStatus;
  surface?: AgentAppShellSurfaceInfo;
  shellWindow?: AgentAppShellWindowInfo;
  launchedAt?: string;
}

export interface AgentAppCloudCatalogResult {
  payload: CloudBootstrapPayload;
  source: "remote" | "bootstrap" | "seeded";
}

export interface AgentAppHostLifecycleListResult {
  snapshots: AgentAppHostLifecycleSnapshot[];
  issues: unknown[];
}

export class AgentAppRegistrationRequiredError extends Error {
  constructor() {
    super(
      "Agent App registration must be activated before installing enterprise custom apps.",
    );
    this.name = "AgentAppRegistrationRequiredError";
  }
}

export interface SelectLocalAgentAppDirectoryOptions {
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

type AgentAppInstalledListAppServerClient = Pick<AppServerClient, "request">;
type AgentAppUiRuntimeAppServerClient = Pick<AppServerClient, "request">;
type AgentAppLifecycleAppServerClient = Pick<AppServerClient, "request">;

async function invokeAgentAppCommand<T>(
  command: string,
  args: Record<string, unknown>,
): Promise<T> {
  const result = await safeInvoke<T>(command, args);
  assertNotDiagnosticFacade(command, result, "真实 Agent App current 通道");
  return result;
}

function assertAgentAppRecord(
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

function assertInstalledAgentAppStateResult(
  command: string,
  result: unknown,
): asserts result is InstalledAgentAppState {
  assertAgentAppRecord(command, result);
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
    throw new Error(`${command} did not return an installed Agent App state`);
  }
}

function assertAgentAppLocalPackageInspectionResult(
  command: string,
  result: unknown,
): asserts result is AgentAppLocalPackageInspection {
  assertAgentAppRecord(command, result);
  assertNonEmptyStringField(command, result, "appDir");
  assertNonEmptyStringField(command, result, "sourceUri");
  assertNonEmptyStringField(command, result, "manifestHash");
  assertNonEmptyStringField(command, result, "packageHash");
  assertNonEmptyStringField(command, result, "inspectedAt");
  if (!isRecord(result.manifest)) {
    throw new Error(`${command} did not return manifest`);
  }
}

function assertAgentAppPackageCacheEntryResult(
  command: string,
  result: unknown,
): asserts result is AgentAppPackageCacheEntry {
  assertAgentAppRecord(command, result);
  assertNonEmptyStringField(command, result, "appId");
  assertNonEmptyStringField(command, result, "packageHash");
  assertNonEmptyStringField(command, result, "manifestHash");
  assertNonEmptyStringField(command, result, "cachePath");
  assertNonEmptyStringField(command, result, "cachedAt");
  if (!isRecord(result.identity) || result.manifestSnapshot == null) {
    throw new Error(`${command} did not return a package cache entry`);
  }
}

function assertInstalledAgentAppStateListResult(
  command: string,
  result: unknown,
): asserts result is InstalledAgentAppStateListResult {
  assertAgentAppRecord(command, result);
  const states = result.states;
  const issues = result.issues;
  if (!Array.isArray(states)) {
    throw new Error(`${command} did not return states`);
  }
  if (!Array.isArray(issues)) {
    throw new Error(`${command} did not return issues`);
  }
  states.forEach((state, index) => {
    assertInstalledAgentAppStateResult(`${command}.states[${index}]`, state);
  });
}

function assertAgentAppUninstallRehearsalResult(
  command: string,
  result: unknown,
): asserts result is AgentAppUninstallRehearsalResult {
  assertAgentAppRecord(command, result);
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

function assertAgentAppUninstallResult(
  command: string,
  result: unknown,
): asserts result is AgentAppUninstallResult {
  assertAgentAppRecord(command, result);
  if (result.status != null && typeof result.status !== "string") {
    throw new Error(`${command} did not return status`);
  }
  if (!isRecord(result.rehearsal)) {
    throw new Error(`${command} did not return rehearsal`);
  }
  assertAgentAppUninstallRehearsalResult(command, result.rehearsal);
  assertInstalledAgentAppStateListResult(command, result.list);
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

function assertAgentAppSelectDirectoryResult(
  command: string,
  result: unknown,
): asserts result is AgentAppSelectDirectoryResult {
  assertAgentAppRecord(command, result);
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

function assertAgentAppShellLaunchResult(
  command: string,
  result: unknown,
): asserts result is AgentAppShellLaunchResult {
  assertAgentAppRecord(command, result);
  assertNonEmptyStringField(command, result, "status");
  if (result.status !== "launched" && result.status !== "blocked") {
    throw new Error(`${command} returned unsupported shell status`);
  }
  assertBooleanField(command, result, "devShell");
  assertArrayField(command, result, "blockerCodes");
  if (result.status === "launched") {
    assertNonEmptyStringField(command, result, "launchedAt");
    assertAgentAppShellSurfaceInfo(command, result.surface);
  }
}

function assertAgentAppShellSurfaceInfo(command: string, value: unknown): void {
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

function assertAgentAppShellPrepareResponse(
  method: string,
  result: unknown,
): asserts result is AgentAppShellPrepareResponse {
  assertAgentAppRecord(method, result);
  assertNonEmptyStringField(method, result, "status");
  assertBooleanField(method, result, "devShell");
  assertArrayField(method, result, "blockerCodes");
  if (result.status === "ready") {
    assertNonEmptyStringField(method, result, "appId");
    assertNonEmptyStringField(method, result, "entryKey");
    assertNonEmptyStringField(method, result, "preparedAt");
  }
}

function normalizeInstalledAgentAppListResponse(
  response: AgentAppInstalledListResponse | null | undefined,
): InstalledAgentAppStateListResult {
  if (
    !response ||
    typeof response !== "object" ||
    !Array.isArray(response.states)
  ) {
    throw new Error("App Server agentAppInstalled/list did not return states");
  }
  if (!Array.isArray(response.issues)) {
    throw new Error("App Server agentAppInstalled/list did not return issues");
  }
  return {
    issues: response.issues as InstalledAgentAppStateListResult["issues"],
    states: response.states as InstalledAgentAppState[],
  };
}

async function requestAgentAppInstalledListAppServer(
  appServerClient: AgentAppInstalledListAppServerClient = new AppServerClient(),
): Promise<InstalledAgentAppStateListResult> {
  const response = await appServerClient.request<AgentAppInstalledListResponse>(
    METHOD_AGENT_APP_INSTALLED_LIST,
    {},
  );
  return normalizeInstalledAgentAppListResponse(response.result);
}

async function requestAgentAppShellPrepareAppServer(
  descriptor: ShellDescriptor,
  appServerClient: Pick<AppServerClient, "request"> = new AppServerClient(),
): Promise<AgentAppShellPrepareResponse> {
  const response = await appServerClient.request<AgentAppShellPrepareResponse>(
    METHOD_AGENT_APP_SHELL_PREPARE,
    {
      descriptor,
    },
  );
  assertAgentAppShellPrepareResponse(
    METHOD_AGENT_APP_SHELL_PREPARE,
    response.result,
  );
  return response.result;
}

async function requestAgentAppAppServer<T>(
  method: string,
  params: unknown,
  appServerClient: AgentAppLifecycleAppServerClient = new AppServerClient(),
): Promise<T> {
  const response = await appServerClient.request<T>(method, params);
  if (isRecord(response) && "result" in response) {
    return response.result as T;
  }
  return response as T;
}

function normalizeAgentAppUiRuntimeStatusResponse(
  response: AgentAppUiRuntimeStatusResponse | null | undefined,
): AgentAppUiRuntimeStatus {
  if (!response || typeof response !== "object") {
    throw new Error("App Server Agent App UI runtime did not return status");
  }
  if (typeof response.appId !== "string" || !response.appId.trim()) {
    throw new Error("App Server Agent App UI runtime did not return appId");
  }
  if (typeof response.status !== "string" || !response.status.trim()) {
    throw new Error("App Server Agent App UI runtime did not return status");
  }
  return response as AgentAppUiRuntimeStatus;
}

async function requestAgentAppUiRuntimeAppServer(
  method:
    | typeof METHOD_AGENT_APP_UI_RUNTIME_START
    | typeof METHOD_AGENT_APP_UI_RUNTIME_STATUS
    | typeof METHOD_AGENT_APP_UI_RUNTIME_STOP,
  params:
    | AgentAppUiRuntimeStartParams
    | AgentAppUiRuntimeStatusParams
    | AgentAppUiRuntimeStopParams,
  appServerClient: AgentAppUiRuntimeAppServerClient = new AppServerClient(),
): Promise<AgentAppUiRuntimeStatus> {
  const response =
    await appServerClient.request<AgentAppUiRuntimeStatusResponse>(
      method,
      params,
    );
  return normalizeAgentAppUiRuntimeStatusResponse(response.result);
}

function extractFrontmatter(markdown: string): Record<string, unknown> {
  const normalized = markdown.replace(/^\uFEFF/, "");
  const match = /^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/.exec(normalized);
  if (!match) {
    throw new Error("Agent App APP.md 缺少 YAML frontmatter。");
  }
  const yamlSource = match[1] ?? "";
  const result: Record<string, unknown> = {};
  let currentKey: string | null = null;

  for (const rawLine of yamlSource.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, "");
    if (!line.trim() || line.trimStart().startsWith("#")) {
      continue;
    }

    const listMatch = /^\s+-\s+(.+)$/.exec(line);
    if (listMatch && currentKey) {
      const value = listMatch[1]?.trim();
      const current = result[currentKey];
      result[currentKey] = Array.isArray(current)
        ? [...current, value]
        : [value].filter(Boolean);
      continue;
    }

    const keyValueMatch = /^([A-Za-z0-9_.-]+):\s*(.*)$/.exec(line);
    if (!keyValueMatch) {
      continue;
    }

    const key = keyValueMatch[1]!;
    const rawValue = keyValueMatch[2]?.trim() ?? "";
    currentKey = key;
    if (!rawValue) {
      result[key] = [];
      continue;
    }
    result[key] = rawValue.replace(/^["']|["']$/g, "");
  }

  return result;
}

function normalizeCloudCatalogPayload(value: unknown): CloudBootstrapPayload {
  const data = unwrapEnvelope<unknown>(value);
  if (isRecord(data) && data.agentAppCatalog != null) {
    return normalizeCloudCatalogPayload(data.agentAppCatalog);
  }
  if (isRecord(data) && data.bootstrap != null) {
    return normalizeCloudCatalogPayload(data.bootstrap);
  }
  if (isRecord(data) && Array.isArray(data.apps)) {
    return parseCloudBootstrapPayload(data);
  }
  if (isRecord(data) && Array.isArray(data.items)) {
    return parseCloudBootstrapPayload({
      schemaVersion: "agent-app-cloud-bootstrap/v1",
      tenantId: typeof data.tenantId === "string" ? data.tenantId : undefined,
      generatedAt:
        typeof data.generatedAt === "string" ? data.generatedAt : undefined,
      apps: data.items,
    });
  }
  throw new Error("Agent App 云端目录格式非法。");
}

function buildSeededCloudPayload(): CloudBootstrapPayload {
  const manifest = contentFactoryFixture as AppManifest;
  const app: CloudBootstrapApp = {
    appId: manifest.name,
    displayName: manifest.displayName ?? manifest.title ?? manifest.name,
    version: manifest.version,
    releaseId: "seeded-content-factory-app-0.3.0",
    channel: "seeded",
    licenseState: "unknown",
    registrationRequired: true,
    registrationState: "required",
    enabled: false,
    disabledReason: "registration required",
    packageUrl: "",
    packageHash: "",
    manifestHash: "",
    capabilityRequirements:
      typeof manifest.requires?.capabilities === "object" &&
      !Array.isArray(manifest.requires.capabilities)
        ? manifest.requires.capabilities
        : {},
    defaultEntries: manifest.entries.map((entry) => entry.key),
    policyDefaults: {},
    toolAvailability: [],
  };

  return {
    schemaVersion: "agent-app-cloud-bootstrap/v1",
    tenantId: "seeded",
    generatedAt: "2026-05-15T00:00:00.000Z",
    apps: [app],
  };
}

function readBootstrapAgentAppCatalog(): CloudBootstrapPayload | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return normalizeCloudCatalogPayload(window.__LIME_BOOTSTRAP__);
  } catch {
    return null;
  }
}

export async function inspectLocalAgentAppPackage(
  appDir: string,
): Promise<AgentAppLocalPackageInspection> {
  const result =
    await requestAgentAppAppServer<AgentAppLocalPackageInspectResponse>(
      METHOD_AGENT_APP_LOCAL_PACKAGE_INSPECT,
      { appDir } satisfies AgentAppLocalPackageInspectParams,
    );
  assertAgentAppLocalPackageInspectionResult(
    METHOD_AGENT_APP_LOCAL_PACKAGE_INSPECT,
    result,
  );
  return result as AgentAppLocalPackageInspection;
}

export async function selectLocalAgentAppDirectory(
  options: SelectLocalAgentAppDirectoryOptions = {},
): Promise<string | null> {
  const selected = await selectAgentAppDirectory({ title: options.title });
  return selected.cancelled ? null : selected.path;
}

export async function listInstalledAgentApps(): Promise<InstalledAgentAppStateListResult> {
  return requestAgentAppInstalledListAppServer();
}

export function buildAgentAppHostLifecycleForInstalledState(
  state: InstalledAgentAppState,
  generatedAt?: string,
): AgentAppHostLifecycleSnapshot {
  return buildAgentAppHostLifecycleSnapshot({
    manifest: state.manifest,
    readiness: state.readiness,
    installedState: state,
    generatedAt: generatedAt ?? state.updatedAt,
  });
}

function normalizeAgentAppHostLifecycleListResponse(
  response: unknown,
): AgentAppHostLifecycleListResult {
  if (!isRecord(response) || !Array.isArray(response.snapshots)) {
    throw new Error(
      "App Server agentAppHostLifecycle/list did not return snapshots",
    );
  }
  if (!Array.isArray(response.issues)) {
    throw new Error(
      "App Server agentAppHostLifecycle/list did not return issues",
    );
  }
  return {
    snapshots: response.snapshots as AgentAppHostLifecycleSnapshot[],
    issues: response.issues,
  };
}

export async function listAgentAppHostLifecycleSnapshots(
  appServerClient?: AgentAppLifecycleAppServerClient,
): Promise<AgentAppHostLifecycleListResult> {
  const result = await requestAgentAppAppServer<unknown>(
    METHOD_AGENT_APP_HOST_LIFECYCLE_LIST,
    {},
    appServerClient,
  );
  return normalizeAgentAppHostLifecycleListResponse(result);
}

export async function saveInstalledAgentAppState(
  request: AgentAppInstalledStateSaveRequest,
): Promise<InstalledAgentAppState> {
  // 旧 facade 已退役：不得回退 "agent_app_save_installed_state" 或 "agent_app_uninstall"。
  const result = await requestAgentAppAppServer<unknown>(
    METHOD_AGENT_APP_INSTALLED_SAVE,
    {
      state: request.state,
    } satisfies AgentAppInstalledSaveParams,
  );
  assertInstalledAgentAppStateResult(METHOD_AGENT_APP_INSTALLED_SAVE, result);
  return result;
}

export async function fetchCloudAgentAppPackage(
  descriptor: CloudBootstrapReleaseDescriptor,
): Promise<AgentAppPackageCacheEntry> {
  const result =
    await requestAgentAppAppServer<AppServerAgentAppPackageCacheEntry>(
      METHOD_AGENT_APP_PACKAGE_FETCH_CLOUD,
      {
        descriptor,
      } satisfies AgentAppFetchCloudPackageParams,
    );
  assertAgentAppPackageCacheEntryResult(
    METHOD_AGENT_APP_PACKAGE_FETCH_CLOUD,
    result,
  );
  return result as AgentAppPackageCacheEntry;
}

export async function reviewLocalAgentAppPackage(params: {
  appDir: string;
  profile?: HostCapabilityProfile;
  sourceKind?: PackageSourceKind;
}): Promise<AgentAppInstallReviewResult> {
  const inspection = await inspectLocalAgentAppPackage(params.appDir);
  await assertLocalAgentAppRegistrationAllowed(inspection.manifest);
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
  const setup = buildAgentAppLabResolvedSetupState(setupPreview.projection);
  const preview = buildInstalledAppPreview({
    fixture: inspection.manifest,
    identity,
    setup,
    profile: params.profile,
    loadedAt: inspection.inspectedAt,
    checkedAt: inspection.inspectedAt,
    generatedAt: inspection.inspectedAt,
  });
  const state = buildInstalledAgentAppState({
    preview,
    setup,
    installedAt: inspection.inspectedAt,
    updatedAt: inspection.inspectedAt,
  });

  return {
    review: buildAgentAppInstallReview({
      preview,
      sourceState: buildLocalAgentAppSourceState(),
      generatedAt: inspection.inspectedAt,
    }),
    state,
  };
}

export async function installLocalAgentAppPackage(params: {
  appDir: string;
  profile?: HostCapabilityProfile;
  sourceKind?: PackageSourceKind;
}): Promise<InstalledAgentAppState> {
  const result = await reviewLocalAgentAppPackage(params);
  return saveInstalledAgentAppState({ state: result.state });
}

function isEnterpriseCustomLocalManifest(manifest: AppManifest): boolean {
  const metadata = (manifest as AppManifest & { metadata?: unknown }).metadata;
  return (
    isRecord(metadata) &&
    typeof metadata.distribution === "string" &&
    metadata.distribution.trim() === "enterprise_custom"
  );
}

async function assertLocalAgentAppRegistrationAllowed(
  manifest: AppManifest,
): Promise<void> {
  if (!isEnterpriseCustomLocalManifest(manifest)) {
    return;
  }

  const catalog = await getAgentAppCloudCatalog();
  const app = catalog.payload.apps.find((item) => item.appId === manifest.name);
  if (
    !app ||
    app.registrationRequired !== true ||
    app.registrationState !== "active"
  ) {
    throw new AgentAppRegistrationRequiredError();
  }
}

export async function getAgentAppCloudCatalog(): Promise<AgentAppCloudCatalogResult> {
  const runtime = resolveOemCloudRuntimeContext();
  if (runtime) {
    try {
      return {
        payload: await getClientAgentApps(runtime.tenantId),
        source: "remote",
      };
    } catch {
      const bootstrapCatalog = readBootstrapAgentAppCatalog();
      if (bootstrapCatalog) {
        return { payload: bootstrapCatalog, source: "bootstrap" };
      }
    }
  }

  return { payload: buildSeededCloudPayload(), source: "seeded" };
}

export async function submitAgentAppRegistrationCode(
  appId: string,
  code: string,
): Promise<AgentAppCloudCatalogResult> {
  const runtime = resolveOemCloudRuntimeContext();
  if (!runtime) {
    throw new Error("Agent App 注册需要先登录 Lime 云端账号。");
  }
  return {
    payload: await submitClientAgentAppRegistrationCode(
      runtime.tenantId,
      appId,
      {
        code,
      },
    ),
    source: "remote",
  };
}

export async function installCloudAgentAppRelease(params: {
  app: CloudBootstrapApp;
  packageManifest?: unknown;
  actualPackageHash?: string;
  actualManifestHash?: string;
  signaturePolicy?: AgentAppCloudReleaseSignaturePolicy;
  signatureVerificationStatus?: AgentAppCloudReleaseSignatureVerificationStatus;
  signatureTrustRoots?: AgentAppCloudReleaseSignatureTrustRoot[];
  signatureCrypto?: Pick<Crypto, "subtle">;
  packageCacheEntry?: AgentAppPackageCacheEntry;
  resolveCachedPackage?: AgentAppCloudReleasePackageAcquisitionOptions["resolveCachedPackage"];
  fetchCloudPackage?: AgentAppCloudReleasePackageAcquisitionOptions["fetchCloudPackage"];
  skipPackageFetch?: boolean;
  profile?: HostCapabilityProfile;
}): Promise<InstalledAgentAppState> {
  const result = await reviewCloudAgentAppRelease(params);
  if (result.review.releaseEvidence?.status === "blocked") {
    throw new AgentAppCloudBootstrapError(
      `Cloud release ${params.app.appId}@${params.app.version} did not pass release evidence gates: ${result.review.releaseEvidence.blockerCodes.join(", ")}`,
    );
  }
  return saveInstalledAgentAppState({ state: result.state });
}

export async function resolveCloudReleasePackageManifest(
  params: AgentAppCloudReleasePackageAcquisitionParams,
): Promise<AgentAppCloudReleasePackageAcquisitionResult> {
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
    const verification = verifyAgentAppPackageCacheEntry(
      cacheEntry,
      descriptor.identity,
    );
    if (verification.status !== "verified") {
      throw new AgentAppCloudBootstrapError(verification.message);
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
      fetchCloudAgentAppPackage(descriptor));
    const verification = verifyAgentAppPackageCacheEntry(
      fetchedEntry,
      descriptor.identity,
    );
    if (verification.status !== "verified") {
      throw new AgentAppCloudBootstrapError(verification.message);
    }
    return {
      descriptor,
      packageManifest: fetchedEntry.manifestSnapshot,
      actualPackageHash: fetchedEntry.packageHash,
      actualManifestHash: fetchedEntry.manifestHash,
      sourceKind: "fetched_package",
    };
  }

  throw new AgentAppCloudBootstrapError(
    `Cloud release ${params.app.appId}@${params.app.version} is missing a verified package source before install review.`,
  );
}

export async function reviewCloudAgentAppRelease(params: {
  app: CloudBootstrapApp;
  packageManifest?: unknown;
  actualPackageHash?: string;
  actualManifestHash?: string;
  signaturePolicy?: AgentAppCloudReleaseSignaturePolicy;
  signatureVerificationStatus?: AgentAppCloudReleaseSignatureVerificationStatus;
  signatureTrustRoots?: AgentAppCloudReleaseSignatureTrustRoot[];
  signatureCrypto?: Pick<Crypto, "subtle">;
  packageCacheEntry?: AgentAppPackageCacheEntry;
  resolveCachedPackage?: AgentAppCloudReleasePackageAcquisitionOptions["resolveCachedPackage"];
  fetchCloudPackage?: AgentAppCloudReleasePackageAcquisitionOptions["fetchCloudPackage"];
  skipPackageFetch?: boolean;
  profile?: HostCapabilityProfile;
  installed?: InstalledAgentAppState[];
  catalogSource?: AgentAppCloudCatalogResult["source"];
}): Promise<AgentAppInstallReviewResult> {
  const acquiredPackage = await resolveCloudReleasePackageManifest(params);
  const verifiedPackage = buildVerifiedCloudReleasePackage({
    app: params.app,
    packageManifest: acquiredPackage.packageManifest,
    actualPackageHash: acquiredPackage.actualPackageHash,
    actualManifestHash: acquiredPackage.actualManifestHash,
    loadedAt: acquiredPackage.descriptor.loadedAt,
  });
  if (verifiedPackage.verification.status !== "verified") {
    throw new AgentAppCloudBootstrapError(verifiedPackage.verification.message);
  }
  const signatureVerificationStatus =
    params.signatureVerificationStatus ??
    (await verifyCloudReleaseSignature({
      app: params.app,
      trustRoots:
        params.signatureTrustRoots ??
        resolveOemCloudAgentAppSignatureTrustRoots(),
      crypto: params.signatureCrypto,
    }));
  const releaseEvidence = buildCloudReleaseEvidence({
    app: params.app,
    catalogSource: params.catalogSource ?? "seeded",
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
  const setup = buildAgentAppLabResolvedSetupState(setupPreview.projection);
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
  const state = buildInstalledAgentAppState({
    preview,
    setup: setupWithCloudReleaseEvidence,
    installedAt: preview.identity.loadedAt,
    updatedAt: preview.identity.loadedAt,
  });

  return {
    review: buildAgentAppInstallReview({
      preview,
      releaseEvidence,
      packageVerificationStatus: verifiedPackage.verification.status,
      sourceState: buildCloudAgentAppSourceState({
        app: params.app,
        catalogSource: params.catalogSource ?? "seeded",
        installed: params.installed ?? [],
        releaseEvidence,
      }),
      generatedAt: preview.identity.loadedAt,
    }),
    state,
  };
}

export async function setAgentAppDisabled(
  request: AgentAppDisabledRequest,
): Promise<InstalledAgentAppStateListResult> {
  const result = await requestAgentAppAppServer<AgentAppInstalledListResponse>(
    METHOD_AGENT_APP_INSTALLED_DISABLED_SET,
    request,
  );
  assertInstalledAgentAppStateListResult(
    METHOD_AGENT_APP_INSTALLED_DISABLED_SET,
    result,
  );
  return result;
}

export async function previewAgentAppUninstall(
  request: AgentAppUninstallRehearsalRequest,
): Promise<AgentAppUninstallRehearsalResult> {
  const result =
    await requestAgentAppAppServer<AgentAppUninstallRehearsalResponse>(
      METHOD_AGENT_APP_INSTALLED_UNINSTALL_REHEARSAL,
      request satisfies AgentAppUninstallRehearsalParams,
    );
  assertAgentAppUninstallRehearsalResult(
    METHOD_AGENT_APP_INSTALLED_UNINSTALL_REHEARSAL,
    result,
  );
  return result as AgentAppUninstallRehearsalResult;
}

export async function uninstallAgentApp(
  request: AgentAppUninstallRequest,
): Promise<AgentAppUninstallResult> {
  const result = await requestAgentAppAppServer<AgentAppUninstallResponse>(
    METHOD_AGENT_APP_INSTALLED_UNINSTALL,
    request satisfies AgentAppUninstallParams,
  );
  assertAgentAppUninstallResult(METHOD_AGENT_APP_INSTALLED_UNINSTALL, result);
  return result as AgentAppUninstallResult;
}

export async function startAgentAppUiRuntime(
  request: AgentAppUiRuntimeStartRequest,
): Promise<AgentAppUiRuntimeStatus> {
  return requestAgentAppUiRuntimeAppServer(METHOD_AGENT_APP_UI_RUNTIME_START, {
    appId: request.appId,
    entryKey: request.entryKey,
  });
}

export async function getAgentAppUiRuntimeStatus(
  request: AgentAppUiRuntimeStatusRequest,
): Promise<AgentAppUiRuntimeStatus> {
  return requestAgentAppUiRuntimeAppServer(METHOD_AGENT_APP_UI_RUNTIME_STATUS, {
    appId: request.appId,
  });
}

export async function stopAgentAppUiRuntime(
  request: AgentAppUiRuntimeStopRequest,
): Promise<AgentAppUiRuntimeStatus> {
  return requestAgentAppUiRuntimeAppServer(METHOD_AGENT_APP_UI_RUNTIME_STOP, {
    appId: request.appId,
  });
}

export async function selectAgentAppDirectory(
  request: AgentAppSelectDirectoryRequest = {},
): Promise<AgentAppSelectDirectoryResult> {
  const result = await invokeAgentAppCommand<unknown>(
    "agent_app_select_directory",
    {
      request,
    },
  );
  assertAgentAppSelectDirectoryResult("agent_app_select_directory", result);
  return result;
}

export async function launchAgentAppShell(
  request: AgentAppShellLaunchRequest,
): Promise<AgentAppShellLaunchResult> {
  const result = await invokeAgentAppCommand<unknown>(
    "agent_app_launch_shell",
    {
      request,
    },
  );
  assertAgentAppShellLaunchResult("agent_app_launch_shell", result);
  return result;
}

export {
  extractFrontmatter,
  requestAgentAppShellPrepareAppServer as prepareAgentAppShellForAppServerTestOnly,
};
