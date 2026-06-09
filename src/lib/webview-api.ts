/**
 * Browser Runtime 管理 API
 *
 * 提供 Chrome Profile、Browser Runtime 与 Site adapter current 命令网关。
 *
 * @module lib/webview-api
 */

import { createSiteClient } from "@/lib/api/agentRuntime/siteClient";
import { assertNotDiagnosticFacade } from "@/lib/api/diagnosticFacade";
import { safeInvoke } from "@/lib/dev-bridge";

const retiredSiteClient = createSiteClient();

/**
 * 启动外部 Chrome Profile 的请求参数
 */
export interface OpenChromeProfileRequest {
  /** Profile 隔离键 */
  profile_key: string;
  /** 要打开的 URL */
  url: string;
  /** 浏览器启动级选项 */
  launch_options?: ChromeProfileLaunchOptions;
}

export interface ChromeProfileLaunchOptions {
  proxy_server?: string;
  language?: string;
}

/**
 * 启动外部 Chrome Profile 的响应
 */
export interface OpenChromeProfileResponse {
  /** 是否成功 */
  success: boolean;
  /** 是否复用已存在会话 */
  reused?: boolean;
  /** 浏览器来源 */
  browser_source?: "system" | "playwright";
  /** 浏览器可执行文件路径 */
  browser_path?: string;
  /** Profile 目录 */
  profile_dir?: string;
  /** 远程调试端口 */
  remote_debugging_port?: number;
  /** Chrome 进程 PID */
  pid?: number;
  /** DevTools HTTP URL */
  devtools_http_url?: string;
  /** 错误信息 */
  error?: string;
}

/**
 * Chrome Profile 会话信息
 */
export interface ChromeProfileSessionInfo {
  profile_key: string;
  browser_source: "system" | "playwright";
  browser_path: string;
  profile_dir: string;
  remote_debugging_port: number;
  pid: number;
  started_at: string;
  last_url: string;
}

export type BrowserProfileTransportKind = "managed_cdp" | "existing_session";

export interface BrowserProfileRecord {
  id: string;
  profile_key: string;
  name: string;
  description: string | null;
  site_scope: string | null;
  launch_url: string | null;
  transport_kind: BrowserProfileTransportKind;
  profile_dir: string;
  managed_profile_dir: string | null;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
  archived_at: string | null;
}

export interface SaveBrowserProfileRequest {
  id?: string;
  profile_key: string;
  name: string;
  description?: string;
  site_scope?: string;
  launch_url?: string;
  transport_kind?: BrowserProfileTransportKind;
}

export interface BrowserEnvironmentPresetRecord {
  id: string;
  name: string;
  description: string | null;
  proxy_server: string | null;
  timezone_id: string | null;
  locale: string | null;
  accept_language: string | null;
  geolocation_lat: number | null;
  geolocation_lng: number | null;
  geolocation_accuracy_m: number | null;
  user_agent: string | null;
  platform: string | null;
  viewport_width: number | null;
  viewport_height: number | null;
  device_scale_factor: number | null;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
  archived_at: string | null;
}

export interface SaveBrowserEnvironmentPresetRequest {
  id?: string;
  name: string;
  description?: string;
  proxy_server?: string;
  timezone_id?: string;
  locale?: string;
  accept_language?: string;
  geolocation_lat?: number;
  geolocation_lng?: number;
  geolocation_accuracy_m?: number;
  user_agent?: string;
  platform?: string;
  viewport_width?: number;
  viewport_height?: number;
  device_scale_factor?: number;
}

export interface BrowserEnvironmentLaunchConfig {
  preset_id?: string;
  preset_name?: string;
  proxy_server?: string;
  timezone_id?: string;
  locale?: string;
  accept_language?: string;
  geolocation_lat?: number;
  geolocation_lng?: number;
  geolocation_accuracy_m?: number;
  user_agent?: string;
  platform?: string;
  viewport_width?: number;
  viewport_height?: number;
  device_scale_factor?: number;
}

export interface ChromeBridgeEndpointInfo {
  server_running: boolean;
  host: string;
  port: number;
  observer_ws_url: string;
  control_ws_url: string;
  bridge_key: string;
}

export interface ChromeBridgePageInfo {
  title?: string;
  url?: string;
  markdown: string;
  updated_at: string;
}

export interface ChromeBridgeObserverSnapshot {
  client_id: string;
  profile_key: string;
  connected_at: string;
  user_agent?: string;
  last_heartbeat_at?: string;
  last_page_info?: ChromeBridgePageInfo;
}

export interface ChromeBridgeControlSnapshot {
  client_id: string;
  connected_at: string;
  user_agent?: string;
}

export interface ChromeBridgePendingCommandSnapshot {
  request_id: string;
  source_type: "api" | "control";
  command: string;
  observer_client_id: string;
  wait_for_page_info: boolean;
  command_completed: boolean;
  created_at: string;
}

export interface ChromeBridgeStatusSnapshot {
  observer_count: number;
  control_count: number;
  pending_command_count: number;
  observers: ChromeBridgeObserverSnapshot[];
  controls: ChromeBridgeControlSnapshot[];
  pending_commands: ChromeBridgePendingCommandSnapshot[];
}

export interface ChromeBridgeDisconnectResult {
  disconnected_observer_count: number;
  disconnected_control_count: number;
  status: ChromeBridgeStatusSnapshot;
}

export interface ChromeBridgeCommandRequest {
  profile_key?: string;
  command: string;
  target?: string;
  text?: string;
  url?: string;
  payload?: unknown;
  wait_for_page_info?: boolean;
  timeout_ms?: number;
}

export interface ChromeBridgeCommandResult {
  success: boolean;
  request_id: string;
  command: string;
  message?: string;
  error?: string;
  page_info?: ChromeBridgePageInfo;
  data?: unknown;
}

export interface SystemConnectorSnapshot {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
  available: boolean;
  visible: boolean;
  authorization_status: string;
  last_error?: string | null;
  capabilities: string[];
}

export interface BrowserActionCapabilitySnapshot {
  key: string;
  label: string;
  description: string;
  group: string;
  enabled: boolean;
}

export interface BrowserConnectorSettingsSnapshot {
  enabled: boolean;
  install_root_dir?: string | null;
  install_dir?: string | null;
  system_connectors: SystemConnectorSnapshot[];
  browser_action_capabilities?: BrowserActionCapabilitySnapshot[];
}

export interface BrowserConnectorInstallStatus {
  status: "not_installed" | "installed" | "update_available" | "broken";
  install_root_dir?: string | null;
  install_dir?: string | null;
  bundled_name: string;
  bundled_version: string;
  installed_name?: string | null;
  installed_version?: string | null;
  message?: string | null;
}

export interface BrowserConnectorInstallRequest {
  install_root_dir?: string;
  profile_key?: string;
}

export interface BrowserConnectorInstallResult {
  install_root_dir: string;
  install_dir: string;
  bundled_name: string;
  bundled_version: string;
  installed_version: string;
  auto_config_path: string;
}

export type BrowserConnectorGuideMode = "extension" | "cdp";

export type BrowserBackendType =
  | "aster_compat"
  | "lime_extension_bridge"
  | "cdp_direct";

export interface BrowserBackendPolicy {
  priority: BrowserBackendType[];
  auto_fallback: boolean;
}

export interface BrowserBackendStatusItem {
  backend: BrowserBackendType;
  available: boolean;
  reason?: string;
  capabilities: string[];
}

export interface BrowserBackendsStatusSnapshot {
  policy: BrowserBackendPolicy;
  bridge_observer_count: number;
  bridge_control_count: number;
  running_profile_count: number;
  cdp_alive_profile_count: number;
  aster_native_host_supported: boolean;
  aster_native_host_configured: boolean;
  backends: BrowserBackendStatusItem[];
}

export interface BrowserActionRequest {
  profile_key?: string;
  backend?: BrowserBackendType;
  action: string;
  args?: Record<string, unknown>;
  timeout_ms?: number;
}

export interface BrowserActionAttempt {
  backend: BrowserBackendType;
  success: boolean;
  message: string;
}

export interface BrowserActionResult {
  success: boolean;
  backend?: BrowserBackendType;
  session_id?: string;
  target_id?: string;
  action: string;
  request_id: string;
  data?: unknown;
  error?: string;
  attempts: BrowserActionAttempt[];
}

export interface SiteAdapterDefinition {
  name: string;
  domain: string;
  description: string;
  read_only: boolean;
  capabilities: string[];
  input_schema: Record<string, unknown>;
  example_args: Record<string, unknown>;
  example: string;
  auth_hint?: string;
  source_kind?: "bundled" | "imported" | "server_synced";
  source_version?: string;
}

export interface SiteAdapterRecommendation {
  adapter: SiteAdapterDefinition;
  reason: string;
  profile_key?: string;
  target_id?: string;
  entry_url: string;
  score: number;
}

export interface SiteAdapterCatalogStatus {
  exists: boolean;
  source_kind: "bundled" | "imported" | "server_synced";
  registry_version: number;
  directory?: string;
  catalog_version?: string;
  tenant_id?: string;
  synced_at?: string;
  adapter_count: number;
}

export interface SiteAdapterImportYamlBundleRequest {
  yaml_bundle: string;
  catalog_version?: string;
  source_version?: string;
  read_only?: boolean;
}

export interface SiteAdapterImportResult {
  directory: string;
  adapter_count: number;
  catalog_version?: string;
}

export interface SiteAdapterLaunchReadinessRequest {
  adapter_name: string;
  profile_key?: string;
  target_id?: string;
}

export interface SiteAdapterLaunchReadinessResult {
  status: "ready" | "requires_browser_runtime";
  adapter: string;
  domain: string;
  profile_key?: string;
  target_id?: string;
  message: string;
  report_hint?: string;
}

export interface RunSiteAdapterRequest {
  adapter_name: string;
  args?: Record<string, unknown>;
  profile_key?: string;
  target_id?: string;
  timeout_ms?: number;
  content_id?: string;
  project_id?: string;
  save_title?: string;
  require_attached_session?: boolean;
  skill_title?: string;
}

export interface SiteAdapterRunResult {
  ok: boolean;
  adapter: string;
  domain: string;
  profile_key: string;
  session_id?: string;
  target_id?: string;
  entry_url: string;
  source_url?: string;
  data?: unknown;
  error_code?: string;
  error_message?: string;
  auth_hint?: string;
  report_hint?: string;
  saved_content?: SavedSiteAdapterContent;
  saved_project_id?: string;
  saved_by?:
    | "explicit_project"
    | "context_project"
    | "explicit_content"
    | "context_content";
  save_skipped_project_id?: string;
  save_skipped_by?:
    | "explicit_project"
    | "context_project"
    | "explicit_content"
    | "context_content";
  save_error_message?: string;
}

export interface SaveSiteAdapterResultRequest {
  project_id?: string;
  content_id?: string;
  save_title?: string;
  run_request: RunSiteAdapterRequest;
  result: SiteAdapterRunResult;
}

export interface SavedSiteAdapterContent {
  content_id: string;
  project_id: string;
  title: string;
  project_root_path?: string;
  bundle_relative_dir?: string;
  markdown_relative_path?: string;
  images_relative_dir?: string;
  meta_relative_path?: string;
  image_count?: number;
}

export type BrowserRuntimeAuditKind = "action" | "launch";

export interface BrowserRuntimeAuditRecord {
  id: string;
  created_at: string;
  kind: BrowserRuntimeAuditKind;
  action?: string;
  profile_key?: string;
  profile_id?: string;
  requested_backend?: BrowserBackendType;
  selected_backend?: BrowserBackendType;
  success: boolean;
  error?: string;
  attempts?: BrowserActionAttempt[];
  environment_preset_id?: string;
  environment_preset_name?: string;
  target_id?: string;
  session_id?: string;
  url?: string;
  reused?: boolean;
  open_window?: boolean;
  stream_mode?: BrowserStreamMode;
  browser_source?: string;
  remote_debugging_port?: number;
}

export type BrowserActionAuditRecord = BrowserRuntimeAuditRecord;

export interface CdpTargetInfo {
  id: string;
  title: string;
  url: string;
  target_type: string;
  web_socket_debugger_url?: string;
  devtools_frontend_url?: string;
}

export interface BrowserPageInfo {
  title: string;
  url: string;
  markdown: string;
  updated_at: string;
}

export type BrowserStreamMode = "events" | "frames" | "both";
export type BrowserSessionLifecycleState =
  | "launching"
  | "live"
  | "waiting_for_human"
  | "human_controlling"
  | "agent_resuming"
  | "closed"
  | "failed";
export type BrowserControlMode = "agent" | "human" | "shared";
export type BrowserTransportKind = "cdp_frames";

export interface CdpSessionState {
  session_id: string;
  profile_key: string;
  environment_preset_id?: string;
  environment_preset_name?: string;
  target_id: string;
  target_title: string;
  target_url: string;
  remote_debugging_port: number;
  ws_debugger_url: string;
  devtools_frontend_url?: string;
  stream_mode?: BrowserStreamMode;
  transport_kind: BrowserTransportKind;
  lifecycle_state: BrowserSessionLifecycleState;
  control_mode: BrowserControlMode;
  human_reason?: string;
  last_page_info?: BrowserPageInfo;
  last_event_at?: string;
  last_frame_at?: string;
  last_error?: string;
  created_at: string;
  connected: boolean;
}

export type BrowserEvent =
  | {
      session_id: string;
      sequence: number;
      occurred_at: string;
      type: "session_opened";
      profile_key: string;
      target_id: string;
    }
  | {
      session_id: string;
      sequence: number;
      occurred_at: string;
      type: "session_closed";
      reason: string;
    }
  | {
      session_id: string;
      sequence: number;
      occurred_at: string;
      type: "session_error";
      error: string;
    }
  | {
      session_id: string;
      sequence: number;
      occurred_at: string;
      type: "session_state_changed";
      lifecycle_state: BrowserSessionLifecycleState;
      control_mode: BrowserControlMode;
      human_reason?: string;
    }
  | {
      session_id: string;
      sequence: number;
      occurred_at: string;
      type: "page_info_changed";
      title: string;
      url: string;
      markdown: string;
    }
  | {
      session_id: string;
      sequence: number;
      occurred_at: string;
      type: "console_message";
      level: string;
      text: string;
      timestamp: number;
    }
  | {
      session_id: string;
      sequence: number;
      occurred_at: string;
      type: "network_request";
      request_id: string;
      url: string;
      method: string;
    }
  | {
      session_id: string;
      sequence: number;
      occurred_at: string;
      type: "network_response";
      request_id: string;
      url: string;
      status: number;
      mime_type: string;
    }
  | {
      session_id: string;
      sequence: number;
      occurred_at: string;
      type: "network_failed";
      request_id: string;
      error_text: string;
    }
  | {
      session_id: string;
      sequence: number;
      occurred_at: string;
      type: "frame_chunk";
      data: string;
      metadata: {
        width: number;
        height: number;
        timestamp: number;
        sequence: number;
      };
    }
  | {
      session_id: string;
      sequence: number;
      occurred_at: string;
      type: "frame_dropped";
      reason: string;
    }
  | {
      session_id: string;
      sequence: number;
      occurred_at: string;
      type: "command_started";
      command_id: number;
      action: string;
    }
  | {
      session_id: string;
      sequence: number;
      occurred_at: string;
      type: "command_completed";
      command_id: number;
      action: string;
    }
  | {
      session_id: string;
      sequence: number;
      occurred_at: string;
      type: "command_failed";
      command_id: number;
      action: string;
      error: string;
    };

export interface BrowserEventBufferSnapshot {
  events: BrowserEvent[];
  next_cursor: number;
}

export interface LaunchBrowserSessionRequest {
  profile_id?: string;
  profile_key?: string;
  url?: string;
  environment_preset_id?: string;
  environment?: BrowserEnvironmentLaunchConfig;
  target_id?: string;
  open_window?: boolean;
  headless?: boolean;
  stream_mode?: BrowserStreamMode;
}

export interface BrowserSessionLaunchResponse {
  profile: OpenChromeProfileResponse;
  session: CdpSessionState;
}

export interface UpdateBrowserSessionControlRequest {
  session_id: string;
  human_reason?: string;
}

const BROWSER_CONNECTOR_CURRENT_SURFACE = "真实 Browser connector current 通道";
const BROWSER_RUNTIME_CURRENT_SURFACE = "真实 Browser runtime current 通道";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isOptionalNullableString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === "string";
}

function isBrowserBackendType(value: unknown): value is BrowserBackendType {
  return (
    value === "aster_compat" ||
    value === "lime_extension_bridge" ||
    value === "cdp_direct"
  );
}

function isChromeProfileSessionInfo(
  value: unknown,
): value is ChromeProfileSessionInfo {
  return (
    isRecord(value) &&
    typeof value.profile_key === "string" &&
    (value.browser_source === "system" ||
      value.browser_source === "playwright") &&
    typeof value.browser_path === "string" &&
    typeof value.profile_dir === "string" &&
    isFiniteNumber(value.remote_debugging_port) &&
    isFiniteNumber(value.pid) &&
    typeof value.started_at === "string" &&
    typeof value.last_url === "string"
  );
}

function assertChromeProfileSessions(
  command: string,
  value: unknown,
): asserts value is ChromeProfileSessionInfo[] {
  if (!Array.isArray(value) || !value.every(isChromeProfileSessionInfo)) {
    throw new Error(`${command} did not return chrome profile sessions`);
  }
}

function isChromeBridgeEndpointInfo(
  value: unknown,
): value is ChromeBridgeEndpointInfo {
  return (
    isRecord(value) &&
    typeof value.server_running === "boolean" &&
    typeof value.host === "string" &&
    isFiniteNumber(value.port) &&
    typeof value.observer_ws_url === "string" &&
    typeof value.control_ws_url === "string" &&
    typeof value.bridge_key === "string"
  );
}

function assertChromeBridgeEndpointInfo(
  command: string,
  value: unknown,
): asserts value is ChromeBridgeEndpointInfo {
  if (!isChromeBridgeEndpointInfo(value)) {
    throw new Error(`${command} did not return chrome bridge endpoint info`);
  }
}

function isChromeBridgePageInfo(value: unknown): value is ChromeBridgePageInfo {
  return (
    isRecord(value) &&
    isOptionalNullableString(value.title) &&
    isOptionalNullableString(value.url) &&
    typeof value.markdown === "string" &&
    typeof value.updated_at === "string"
  );
}

function isChromeBridgeObserverSnapshot(
  value: unknown,
): value is ChromeBridgeObserverSnapshot {
  return (
    isRecord(value) &&
    typeof value.client_id === "string" &&
    typeof value.profile_key === "string" &&
    typeof value.connected_at === "string" &&
    isOptionalNullableString(value.user_agent) &&
    isOptionalNullableString(value.last_heartbeat_at) &&
    (value.last_page_info === undefined ||
      value.last_page_info === null ||
      isChromeBridgePageInfo(value.last_page_info))
  );
}

function isChromeBridgeControlSnapshot(
  value: unknown,
): value is ChromeBridgeControlSnapshot {
  return (
    isRecord(value) &&
    typeof value.client_id === "string" &&
    typeof value.connected_at === "string" &&
    isOptionalNullableString(value.user_agent)
  );
}

function isChromeBridgePendingCommandSnapshot(
  value: unknown,
): value is ChromeBridgePendingCommandSnapshot {
  return (
    isRecord(value) &&
    typeof value.request_id === "string" &&
    (value.source_type === "api" || value.source_type === "control") &&
    typeof value.command === "string" &&
    typeof value.observer_client_id === "string" &&
    typeof value.wait_for_page_info === "boolean" &&
    typeof value.command_completed === "boolean" &&
    typeof value.created_at === "string"
  );
}

function isChromeBridgeStatusSnapshot(
  value: unknown,
): value is ChromeBridgeStatusSnapshot {
  return (
    isRecord(value) &&
    isFiniteNumber(value.observer_count) &&
    isFiniteNumber(value.control_count) &&
    isFiniteNumber(value.pending_command_count) &&
    Array.isArray(value.observers) &&
    value.observers.every(isChromeBridgeObserverSnapshot) &&
    Array.isArray(value.controls) &&
    value.controls.every(isChromeBridgeControlSnapshot) &&
    Array.isArray(value.pending_commands) &&
    value.pending_commands.every(isChromeBridgePendingCommandSnapshot)
  );
}

function assertChromeBridgeStatusSnapshot(
  command: string,
  value: unknown,
): asserts value is ChromeBridgeStatusSnapshot {
  if (!isChromeBridgeStatusSnapshot(value)) {
    throw new Error(`${command} did not return chrome bridge status`);
  }
}

function isSystemConnectorSnapshot(
  value: unknown,
): value is SystemConnectorSnapshot {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.label === "string" &&
    typeof value.description === "string" &&
    typeof value.enabled === "boolean" &&
    typeof value.available === "boolean" &&
    typeof value.visible === "boolean" &&
    typeof value.authorization_status === "string" &&
    isOptionalNullableString(value.last_error) &&
    isStringArray(value.capabilities)
  );
}

function isBrowserActionCapabilitySnapshot(
  value: unknown,
): value is BrowserActionCapabilitySnapshot {
  return (
    isRecord(value) &&
    typeof value.key === "string" &&
    typeof value.label === "string" &&
    typeof value.description === "string" &&
    typeof value.group === "string" &&
    typeof value.enabled === "boolean"
  );
}

function isBrowserConnectorSettingsSnapshot(
  value: unknown,
): value is BrowserConnectorSettingsSnapshot {
  return (
    isRecord(value) &&
    typeof value.enabled === "boolean" &&
    isOptionalNullableString(value.install_root_dir) &&
    isOptionalNullableString(value.install_dir) &&
    Array.isArray(value.system_connectors) &&
    value.system_connectors.every(isSystemConnectorSnapshot) &&
    (value.browser_action_capabilities === undefined ||
      (Array.isArray(value.browser_action_capabilities) &&
        value.browser_action_capabilities.every(
          isBrowserActionCapabilitySnapshot,
        )))
  );
}

function assertBrowserConnectorSettingsSnapshot(
  command: string,
  value: unknown,
): asserts value is BrowserConnectorSettingsSnapshot {
  if (!isBrowserConnectorSettingsSnapshot(value)) {
    throw new Error(`${command} did not return browser connector settings`);
  }
}

function isBrowserConnectorInstallStatus(
  value: unknown,
): value is BrowserConnectorInstallStatus {
  return (
    isRecord(value) &&
    (value.status === "not_installed" ||
      value.status === "installed" ||
      value.status === "update_available" ||
      value.status === "broken") &&
    isOptionalNullableString(value.install_root_dir) &&
    isOptionalNullableString(value.install_dir) &&
    typeof value.bundled_name === "string" &&
    typeof value.bundled_version === "string" &&
    isOptionalNullableString(value.installed_name) &&
    isOptionalNullableString(value.installed_version) &&
    isOptionalNullableString(value.message)
  );
}

function assertBrowserConnectorInstallStatus(
  command: string,
  value: unknown,
): asserts value is BrowserConnectorInstallStatus {
  if (!isBrowserConnectorInstallStatus(value)) {
    throw new Error(
      `${command} did not return browser connector install status`,
    );
  }
}

function isBrowserBackendPolicy(value: unknown): value is BrowserBackendPolicy {
  return (
    isRecord(value) &&
    Array.isArray(value.priority) &&
    value.priority.every(isBrowserBackendType) &&
    typeof value.auto_fallback === "boolean"
  );
}

function assertBrowserBackendPolicy(
  command: string,
  value: unknown,
): asserts value is BrowserBackendPolicy {
  if (!isBrowserBackendPolicy(value)) {
    throw new Error(`${command} did not return browser backend policy`);
  }
}

function isBrowserBackendStatusItem(
  value: unknown,
): value is BrowserBackendStatusItem {
  return (
    isRecord(value) &&
    isBrowserBackendType(value.backend) &&
    typeof value.available === "boolean" &&
    isOptionalNullableString(value.reason) &&
    isStringArray(value.capabilities)
  );
}

function isBrowserBackendsStatusSnapshot(
  value: unknown,
): value is BrowserBackendsStatusSnapshot {
  return (
    isRecord(value) &&
    isBrowserBackendPolicy(value.policy) &&
    isFiniteNumber(value.bridge_observer_count) &&
    isFiniteNumber(value.bridge_control_count) &&
    isFiniteNumber(value.running_profile_count) &&
    isFiniteNumber(value.cdp_alive_profile_count) &&
    typeof value.aster_native_host_supported === "boolean" &&
    typeof value.aster_native_host_configured === "boolean" &&
    Array.isArray(value.backends) &&
    value.backends.every(isBrowserBackendStatusItem)
  );
}

function assertBrowserBackendsStatusSnapshot(
  command: string,
  value: unknown,
): asserts value is BrowserBackendsStatusSnapshot {
  if (!isBrowserBackendsStatusSnapshot(value)) {
    throw new Error(`${command} did not return browser backends status`);
  }
}

function rejectMissingBrowserConnectorCurrent<T>(command: string): Promise<T> {
  return Promise.reject(
    new Error(`${command} 尚未接入${BROWSER_CONNECTOR_CURRENT_SURFACE}`),
  );
}

function rejectMissingBrowserRuntimeCurrent<T>(command: string): Promise<T> {
  return Promise.reject(
    new Error(`${command} 尚未接入${BROWSER_RUNTIME_CURRENT_SURFACE}`),
  );
}

/**
 * 使用外部 Chrome + 独立 Profile 打开 URL
 */
export async function openChromeProfileWindow(
  request: OpenChromeProfileRequest,
): Promise<OpenChromeProfileResponse> {
  void request;
  return rejectMissingBrowserRuntimeCurrent("open_chrome_profile_window");
}

/**
 * 获取当前运行中的 Chrome Profile 会话
 */
export async function getChromeProfileSessions(): Promise<
  ChromeProfileSessionInfo[]
> {
  const command = "get_chrome_profile_sessions";
  const result = await safeInvoke<ChromeProfileSessionInfo[]>(command);
  assertNotDiagnosticFacade(
    command,
    result,
    "真实 Browser bridge current 通道",
  );
  assertChromeProfileSessions(command, result);
  return result;
}

/**
 * 关闭指定的 Chrome Profile 会话
 */
export async function closeChromeProfileSession(
  profileKey: string,
): Promise<boolean> {
  void profileKey;
  return rejectMissingBrowserRuntimeCurrent("close_chrome_profile_session");
}

export async function listBrowserProfiles(params?: {
  include_archived?: boolean;
}): Promise<BrowserProfileRecord[]> {
  void params;
  return rejectMissingBrowserRuntimeCurrent("list_browser_profiles_cmd");
}

export async function saveBrowserProfile(
  request: SaveBrowserProfileRequest,
): Promise<BrowserProfileRecord> {
  void request;
  return rejectMissingBrowserRuntimeCurrent("save_browser_profile_cmd");
}

export async function listBrowserEnvironmentPresets(params?: {
  include_archived?: boolean;
}): Promise<BrowserEnvironmentPresetRecord[]> {
  void params;
  return rejectMissingBrowserRuntimeCurrent(
    "list_browser_environment_presets_cmd",
  );
}

export async function saveBrowserEnvironmentPreset(
  request: SaveBrowserEnvironmentPresetRequest,
): Promise<BrowserEnvironmentPresetRecord> {
  void request;
  return rejectMissingBrowserRuntimeCurrent(
    "save_browser_environment_preset_cmd",
  );
}

export async function archiveBrowserEnvironmentPreset(
  id: string,
): Promise<boolean> {
  void id;
  return rejectMissingBrowserRuntimeCurrent(
    "archive_browser_environment_preset_cmd",
  );
}

export async function restoreBrowserEnvironmentPreset(
  id: string,
): Promise<boolean> {
  void id;
  return rejectMissingBrowserRuntimeCurrent(
    "restore_browser_environment_preset_cmd",
  );
}

export async function archiveBrowserProfile(id: string): Promise<boolean> {
  void id;
  return rejectMissingBrowserRuntimeCurrent("archive_browser_profile_cmd");
}

export async function restoreBrowserProfile(id: string): Promise<boolean> {
  void id;
  return rejectMissingBrowserRuntimeCurrent("restore_browser_profile_cmd");
}

/**
 * 获取 ChromeBridge 端点信息（用于扩展配置）
 */
export async function getChromeBridgeEndpointInfo(): Promise<ChromeBridgeEndpointInfo> {
  const command = "get_chrome_bridge_endpoint_info";
  const result = await safeInvoke<ChromeBridgeEndpointInfo>(command);
  assertNotDiagnosticFacade(
    command,
    result,
    "真实 Browser bridge current 通道",
  );
  assertChromeBridgeEndpointInfo(command, result);
  return result;
}

/**
 * 获取 ChromeBridge 当前连接状态
 */
export async function getChromeBridgeStatus(): Promise<ChromeBridgeStatusSnapshot> {
  const command = "get_chrome_bridge_status";
  const result = await safeInvoke<ChromeBridgeStatusSnapshot>(command);
  assertNotDiagnosticFacade(
    command,
    result,
    "真实 Browser bridge current 通道",
  );
  assertChromeBridgeStatusSnapshot(command, result);
  return result;
}

export async function disconnectBrowserConnectorSession(params?: {
  profile_key?: string;
}): Promise<ChromeBridgeDisconnectResult> {
  void params;
  return rejectMissingBrowserRuntimeCurrent(
    "disconnect_browser_connector_session",
  );
}

export async function getBrowserConnectorSettings(): Promise<BrowserConnectorSettingsSnapshot> {
  const command = "get_browser_connector_settings_cmd";
  const result = await safeInvoke<BrowserConnectorSettingsSnapshot>(command);
  assertNotDiagnosticFacade(command, result, BROWSER_CONNECTOR_CURRENT_SURFACE);
  assertBrowserConnectorSettingsSnapshot(command, result);
  return result;
}

export async function setBrowserConnectorInstallRoot(
  installRootDir: string,
): Promise<BrowserConnectorSettingsSnapshot> {
  void installRootDir;
  return rejectMissingBrowserConnectorCurrent(
    "set_browser_connector_install_root_cmd",
  );
}

export async function setBrowserConnectorEnabled(
  enabled: boolean,
): Promise<BrowserConnectorSettingsSnapshot> {
  void enabled;
  return rejectMissingBrowserConnectorCurrent(
    "set_browser_connector_enabled_cmd",
  );
}

export async function setSystemConnectorEnabled(request: {
  id: string;
  enabled: boolean;
}): Promise<BrowserConnectorSettingsSnapshot> {
  void request;
  return rejectMissingBrowserConnectorCurrent(
    "set_system_connector_enabled_cmd",
  );
}

export async function setBrowserActionCapabilityEnabled(request: {
  key: string;
  enabled: boolean;
}): Promise<BrowserConnectorSettingsSnapshot> {
  void request;
  return rejectMissingBrowserConnectorCurrent(
    "set_browser_action_capability_enabled_cmd",
  );
}

export async function getBrowserConnectorInstallStatus(): Promise<BrowserConnectorInstallStatus> {
  const command = "get_browser_connector_install_status_cmd";
  const result = await safeInvoke<BrowserConnectorInstallStatus>(command);
  assertNotDiagnosticFacade(command, result, BROWSER_CONNECTOR_CURRENT_SURFACE);
  assertBrowserConnectorInstallStatus(command, result);
  return result;
}

export async function installBrowserConnectorExtension(
  request: BrowserConnectorInstallRequest,
): Promise<BrowserConnectorInstallResult> {
  void request;
  return rejectMissingBrowserConnectorCurrent(
    "install_browser_connector_extension_cmd",
  );
}

export async function openBrowserExtensionsPage(): Promise<boolean> {
  return rejectMissingBrowserConnectorCurrent(
    "open_browser_extensions_page_cmd",
  );
}

export async function openBrowserRemoteDebuggingPage(): Promise<boolean> {
  return rejectMissingBrowserConnectorCurrent(
    "open_browser_remote_debugging_page_cmd",
  );
}

export async function openBrowserConnectorGuideWindow(request: {
  mode: BrowserConnectorGuideMode;
}): Promise<void> {
  void request;
  return rejectMissingBrowserConnectorCurrent(
    "open_browser_connector_guide_window",
  );
}

/**
 * 通过 ChromeBridge 发送测试命令
 */
export async function chromeBridgeExecuteCommand(
  request: ChromeBridgeCommandRequest,
): Promise<ChromeBridgeCommandResult> {
  void request;
  return rejectMissingBrowserRuntimeCurrent("chrome_bridge_execute_command");
}

export async function getBrowserBackendPolicy(): Promise<BrowserBackendPolicy> {
  const command = "get_browser_backend_policy";
  const result = await safeInvoke<BrowserBackendPolicy>(command);
  assertNotDiagnosticFacade(
    command,
    result,
    "真实 Browser bridge current 通道",
  );
  assertBrowserBackendPolicy(command, result);
  return result;
}

export async function setBrowserBackendPolicy(
  policy: BrowserBackendPolicy,
): Promise<BrowserBackendPolicy> {
  void policy;
  return rejectMissingBrowserRuntimeCurrent("set_browser_backend_policy");
}

export async function getBrowserBackendsStatus(): Promise<BrowserBackendsStatusSnapshot> {
  const command = "get_browser_backends_status";
  const result = await safeInvoke<BrowserBackendsStatusSnapshot>(command);
  assertNotDiagnosticFacade(
    command,
    result,
    "真实 Browser bridge current 通道",
  );
  assertBrowserBackendsStatusSnapshot(command, result);
  return result;
}

export async function listCdpTargets(
  profileKey?: string,
): Promise<CdpTargetInfo[]> {
  void profileKey;
  return rejectMissingBrowserRuntimeCurrent("list_cdp_targets");
}

export async function openCdpSession(params: {
  profile_key: string;
  target_id?: string;
}): Promise<CdpSessionState> {
  void params;
  return rejectMissingBrowserRuntimeCurrent("open_cdp_session");
}

export async function closeCdpSession(sessionId: string): Promise<boolean> {
  void sessionId;
  return rejectMissingBrowserRuntimeCurrent("close_cdp_session");
}

export async function startBrowserStream(params: {
  session_id: string;
  mode: BrowserStreamMode;
}): Promise<CdpSessionState> {
  void params;
  return rejectMissingBrowserRuntimeCurrent("start_browser_stream");
}

export async function stopBrowserStream(
  sessionId: string,
): Promise<CdpSessionState> {
  void sessionId;
  return rejectMissingBrowserRuntimeCurrent("stop_browser_stream");
}

export async function getBrowserSessionState(
  sessionId: string,
): Promise<CdpSessionState> {
  void sessionId;
  return rejectMissingBrowserRuntimeCurrent("get_browser_session_state");
}

export async function takeOverBrowserSession(
  request: UpdateBrowserSessionControlRequest,
): Promise<CdpSessionState> {
  void request;
  return rejectMissingBrowserRuntimeCurrent("take_over_browser_session");
}

export async function releaseBrowserSession(
  request: UpdateBrowserSessionControlRequest,
): Promise<CdpSessionState> {
  void request;
  return rejectMissingBrowserRuntimeCurrent("release_browser_session");
}

export async function resumeBrowserSession(
  request: UpdateBrowserSessionControlRequest,
): Promise<CdpSessionState> {
  void request;
  return rejectMissingBrowserRuntimeCurrent("resume_browser_session");
}

export async function getBrowserEventBuffer(params: {
  session_id: string;
  cursor?: number;
}): Promise<BrowserEventBufferSnapshot> {
  void params;
  return rejectMissingBrowserRuntimeCurrent("get_browser_event_buffer");
}

export async function openBrowserRuntimeDebuggerWindow(request?: {
  session_id?: string;
  profile_key?: string;
}): Promise<void> {
  void request;
  return rejectMissingBrowserRuntimeCurrent(
    "open_browser_runtime_debugger_window",
  );
}

export async function closeBrowserRuntimeDebuggerWindow(): Promise<void> {
  return rejectMissingBrowserRuntimeCurrent(
    "close_browser_runtime_debugger_window",
  );
}

export async function launchBrowserSession(
  request: LaunchBrowserSessionRequest,
): Promise<BrowserSessionLaunchResponse> {
  void request;
  return rejectMissingBrowserRuntimeCurrent("launch_browser_session");
}

export async function browserExecuteAction(
  request: BrowserActionRequest,
): Promise<BrowserActionResult> {
  void request;
  return rejectMissingBrowserRuntimeCurrent("browser_execute_action");
}

export async function siteListAdapters(): Promise<SiteAdapterDefinition[]> {
  return retiredSiteClient.siteListAdapters();
}

export async function siteRecommendAdapters(
  limit?: number,
): Promise<SiteAdapterRecommendation[]> {
  return retiredSiteClient.siteRecommendAdapters(limit);
}

export async function siteSearchAdapters(
  query: string,
): Promise<SiteAdapterDefinition[]> {
  return retiredSiteClient.siteSearchAdapters(query);
}

export async function siteGetAdapterInfo(
  name: string,
): Promise<SiteAdapterDefinition> {
  return retiredSiteClient.siteGetAdapterInfo(name);
}

export async function siteGetAdapterLaunchReadiness(
  request: SiteAdapterLaunchReadinessRequest,
): Promise<SiteAdapterLaunchReadinessResult> {
  return retiredSiteClient.siteGetAdapterLaunchReadiness(request);
}

export async function siteGetAdapterCatalogStatus(): Promise<SiteAdapterCatalogStatus> {
  return retiredSiteClient.siteGetAdapterCatalogStatus();
}

export async function siteApplyAdapterCatalogBootstrap(
  payload: unknown,
): Promise<SiteAdapterCatalogStatus> {
  return retiredSiteClient.siteApplyAdapterCatalogBootstrap(payload);
}

export async function siteClearAdapterCatalogCache(): Promise<SiteAdapterCatalogStatus> {
  return retiredSiteClient.siteClearAdapterCatalogCache();
}

export async function siteImportAdapterYamlBundle(
  request: SiteAdapterImportYamlBundleRequest,
): Promise<SiteAdapterImportResult> {
  return retiredSiteClient.siteImportAdapterYamlBundle(request);
}

export async function siteRunAdapter(
  request: RunSiteAdapterRequest,
): Promise<SiteAdapterRunResult> {
  return retiredSiteClient.siteRunAdapter(request);
}

export async function siteDebugRunAdapter(
  request: RunSiteAdapterRequest,
): Promise<SiteAdapterRunResult> {
  return retiredSiteClient.siteDebugRunAdapter(request);
}

export async function siteSaveAdapterResult(
  request: SaveSiteAdapterResultRequest,
): Promise<SavedSiteAdapterContent> {
  return retiredSiteClient.siteSaveAdapterResult(request);
}

export async function getBrowserRuntimeAuditLogs(
  limit?: number,
): Promise<BrowserRuntimeAuditRecord[]> {
  void limit;
  return rejectMissingBrowserRuntimeCurrent("get_browser_action_audit_logs");
}

export async function getBrowserActionAuditLogs(
  limit?: number,
): Promise<BrowserActionAuditRecord[]> {
  return getBrowserRuntimeAuditLogs(limit);
}
