import { AppServerClient } from "@/lib/api/appServer";
import { safeInvoke } from "@/lib/dev-bridge";
import {
  getClientAgentApps,
  submitClientAgentAppRegistrationCode,
} from "./oemCloudControlPlane";
import { resolveOemCloudRuntimeContext } from "./oemCloudRuntime";
import contentFactoryFixture from "@/features/agent-app/fixtures/content-factory-app.json";
import {
  AgentAppCloudBootstrapError,
  buildCloudBootstrapInstalledAppPreview,
  buildCloudReleaseDescriptor,
  buildVerifiedCloudReleasePackage,
  parseCloudBootstrapPayload,
} from "@/features/agent-app/install/cloudBootstrap";
import {
  buildInstalledAgentAppState,
  type InstalledAgentAppStateListResult,
} from "@/features/agent-app/install/installedAppState";
import type { ShellDescriptor } from "@/features/agent-app/shell";
import { buildInstalledAppPreview } from "@/features/agent-app/install/installedAppPreview";
import { buildPackageIdentity } from "@/features/agent-app/install/packageIdentity";
import { buildAgentAppLabResolvedSetupState } from "@/features/agent-app/install/labInstallFlow";
import {
  verifyAgentAppPackageCacheEntry,
  type AgentAppPackageCacheEntry,
} from "@/features/agent-app/install/packageCache";
import {
  buildAgentAppInstallReview,
  buildCloudAgentAppSourceState,
  buildLocalAgentAppSourceState,
  type AgentAppInstallReview,
} from "@/features/agent-app/install/installReview";
import type {
  AppManifest,
  CloudBootstrapApp,
  CloudBootstrapPayload,
  CloudBootstrapReleaseDescriptor,
  HostCapabilityProfile,
  InstalledAgentAppState,
  PackageSourceKind,
} from "@/features/agent-app/types";
import {
  METHOD_AGENT_APP_INSTALLED_LIST,
  type AgentAppInstalledListResponse,
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
  status?: "rehearsal_only" | "blocked" | "deleted" | "failed" | string;
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
  shellWindow?: AgentAppShellWindowInfo;
  launchedAt: string;
}

export interface AgentAppFetchCloudPackageRequest {
  descriptor: CloudBootstrapReleaseDescriptor;
}

export interface AgentAppCloudCatalogResult {
  payload: CloudBootstrapPayload;
  source: "remote" | "bootstrap" | "seeded";
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
  return safeInvoke<AgentAppLocalPackageInspection>(
    "agent_app_inspect_local_package",
    { appDir },
  );
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

export async function saveInstalledAgentAppState(
  request: AgentAppInstalledStateSaveRequest,
): Promise<InstalledAgentAppState> {
  return safeInvoke<InstalledAgentAppState>("agent_app_save_installed_state", {
    request,
  });
}

export async function fetchCloudAgentAppPackage(
  descriptor: CloudBootstrapReleaseDescriptor,
): Promise<AgentAppPackageCacheEntry> {
  return safeInvoke<AgentAppPackageCacheEntry>(
    "agent_app_fetch_cloud_package",
    {
      request: {
        descriptor,
      } satisfies AgentAppFetchCloudPackageRequest,
    },
  );
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
  if (manifest.name === "content-factory-app") {
    return true;
  }
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
  packageCacheEntry?: AgentAppPackageCacheEntry;
  resolveCachedPackage?: AgentAppCloudReleasePackageAcquisitionOptions["resolveCachedPackage"];
  fetchCloudPackage?: AgentAppCloudReleasePackageAcquisitionOptions["fetchCloudPackage"];
  skipPackageFetch?: boolean;
  profile?: HostCapabilityProfile;
}): Promise<InstalledAgentAppState> {
  const result = await reviewCloudAgentAppRelease(params);
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
  const state = buildInstalledAgentAppState({
    preview,
    setup,
    installedAt: preview.identity.loadedAt,
    updatedAt: preview.identity.loadedAt,
  });

  return {
    review: buildAgentAppInstallReview({
      preview,
      packageVerificationStatus: verifiedPackage.verification.status,
      sourceState: buildCloudAgentAppSourceState({
        app: params.app,
        catalogSource: params.catalogSource ?? "seeded",
        installed: params.installed ?? [],
      }),
      generatedAt: preview.identity.loadedAt,
    }),
    state,
  };
}

export async function setAgentAppDisabled(
  request: AgentAppDisabledRequest,
): Promise<InstalledAgentAppStateListResult> {
  return safeInvoke<InstalledAgentAppStateListResult>(
    "agent_app_set_disabled",
    {
      request,
    },
  );
}

export async function previewAgentAppUninstall(
  request: AgentAppUninstallRehearsalRequest,
): Promise<AgentAppUninstallRehearsalResult> {
  return safeInvoke<AgentAppUninstallRehearsalResult>(
    "agent_app_uninstall_rehearsal",
    { request },
  );
}

export async function uninstallAgentApp(
  request: AgentAppUninstallRequest,
): Promise<AgentAppUninstallResult> {
  // delete-data 只有在调用方传入精确 confirmationPhrase 时才会进入受控删除 adapter。
  return safeInvoke<AgentAppUninstallResult>("agent_app_uninstall", {
    request,
  });
}

export async function startAgentAppUiRuntime(
  request: AgentAppUiRuntimeStartRequest,
): Promise<AgentAppUiRuntimeStatus> {
  return safeInvoke<AgentAppUiRuntimeStatus>("agent_app_start_ui_runtime", {
    request,
  });
}

export async function getAgentAppUiRuntimeStatus(
  request: AgentAppUiRuntimeStatusRequest,
): Promise<AgentAppUiRuntimeStatus> {
  return safeInvoke<AgentAppUiRuntimeStatus>(
    "agent_app_get_ui_runtime_status",
    {
      request,
    },
  );
}

export async function stopAgentAppUiRuntime(
  request: AgentAppUiRuntimeStopRequest,
): Promise<AgentAppUiRuntimeStatus> {
  return safeInvoke<AgentAppUiRuntimeStatus>("agent_app_stop_ui_runtime", {
    request,
  });
}

export async function selectAgentAppDirectory(
  request: AgentAppSelectDirectoryRequest = {},
): Promise<AgentAppSelectDirectoryResult> {
  return safeInvoke<AgentAppSelectDirectoryResult>(
    "agent_app_select_directory",
    {
      request,
    },
  );
}

export async function launchAgentAppShell(
  request: AgentAppShellLaunchRequest,
): Promise<AgentAppShellLaunchResult> {
  return safeInvoke<AgentAppShellLaunchResult>("agent_app_launch_shell", {
    request,
  });
}

export { extractFrontmatter };
