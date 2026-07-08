import { parseCloudBootstrapPayload } from "../../features/plugin/install/cloudBootstrap";
import type { InstalledPluginStateListResult } from "../../features/plugin/install/installedAppState";
import type { PluginPackageCacheEntry } from "../../features/plugin/install/packageCache";
import type {
  CloudBootstrapPayload,
  InstalledPluginState,
} from "../../features/plugin/types";
import type {
  PluginInstalledListResponse,
  PluginShellPrepareResponse,
  PluginUiRuntimeStatusResponse,
} from "../../../packages/app-server-client/src/protocol";
import type {
  PluginHostLifecycleListResult,
  PluginLocalPackageExport,
  PluginLocalPackageInspection,
  PluginSelectDirectoryResult,
  PluginShellLaunchResult,
  PluginUiRuntimeStatus,
  PluginUninstallRehearsalResult,
  PluginUninstallResult,
} from "./pluginsTypes";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function unwrapEnvelope<T>(payload: unknown): T {
  if (isRecord(payload) && "data" in payload) {
    return payload.data as T;
  }
  return payload as T;
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

export function assertInstalledPluginStateResult(
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

export function assertPluginLocalPackageInspectionResult(
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

export function assertPluginLocalPackageExportResult(
  command: string,
  result: unknown,
): asserts result is PluginLocalPackageExport {
  assertPluginRecord(command, result);
  assertNonEmptyStringField(command, result, "appDir");
  assertNonEmptyStringField(command, result, "sourceUri");
  assertNonEmptyStringField(command, result, "manifestSource");
  assertNonEmptyStringField(command, result, "manifestHash");
  assertNonEmptyStringField(command, result, "packageHash");
  assertNonEmptyStringField(command, result, "contentType");
  assertNonEmptyStringField(command, result, "packageBase64");
  assertNonEmptyStringField(command, result, "exportedAt");
  if (result.manifestSource !== "plugin_json") {
    throw new Error(`${command} returned unsupported manifestSource`);
  }
  if (!isRecord(result.pluginManifest)) {
    throw new Error(`${command} did not return pluginManifest`);
  }
  if (!isRecord(result.manifest)) {
    throw new Error(`${command} did not return manifest`);
  }
  if (
    typeof result.sizeBytes !== "number" ||
    result.sizeBytes <= 0 ||
    typeof result.fileCount !== "number" ||
    result.fileCount <= 0
  ) {
    throw new Error(`${command} did not return package size metadata`);
  }
}

export function assertPluginPackageCacheEntryResult(
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

export function assertInstalledPluginStateListResult(
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

export function assertPluginUninstallRehearsalResult(
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

export function assertPluginUninstallResult(
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

export function assertPluginSelectDirectoryResult(
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

export function assertPluginShellLaunchResult(
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

export function assertPluginShellPrepareResponse(
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

export function normalizeInstalledPluginListResponse(
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

export function normalizePluginUiRuntimeStatusResponse(
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

export function normalizePluginHostLifecycleListResponse(
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
    snapshots: response.snapshots as PluginHostLifecycleListResult["snapshots"],
    issues: response.issues,
  };
}

export function normalizeCloudCatalogPayload(
  value: unknown,
): CloudBootstrapPayload {
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

export function buildEmptyCloudPayload(): CloudBootstrapPayload {
  return {
    schemaVersion: "plugin-cloud-bootstrap/v1",
    tenantId: "unavailable",
    generatedAt: "1970-01-01T00:00:00.000Z",
    apps: [],
  };
}
