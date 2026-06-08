import { safeInvoke } from "@/lib/dev-bridge";
import { assertNotDiagnosticFacade } from "./diagnosticFacade";

export interface CapabilityRoutingMetricsSnapshot {
  filter_eval_total: number;
  filter_excluded_total: number;
  filter_excluded_tools_total: number;
  filter_excluded_vision_total: number;
  filter_excluded_context_total: number;
  provider_fallback_total: number;
  model_fallback_total: number;
  all_candidates_excluded_total: number;
}

export interface ResponseCacheConfig {
  enabled: boolean;
  ttl_secs: number;
  max_entries: number;
  max_body_bytes: number;
  cacheable_status_codes: number[];
}

export interface ResponseCacheStats {
  size: number;
  hits: number;
  misses: number;
  evictions: number;
}

export interface RequestDedupStats {
  inflight_size: number;
  completed_size: number;
  check_new_total: number;
  check_in_progress_total: number;
  check_completed_total: number;
  wait_success_total: number;
  wait_timeout_total: number;
  wait_no_result_total: number;
  complete_total: number;
  remove_total: number;
}

export interface IdempotencyStats {
  entries_size: number;
  in_progress_size: number;
  completed_size: number;
  check_new_total: number;
  check_in_progress_total: number;
  check_completed_total: number;
  complete_total: number;
  remove_total: number;
}

export interface TelemetrySummary {
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  timeout_requests: number;
  success_rate: number;
  avg_latency_ms: number;
  min_latency_ms: number | null;
  max_latency_ms: number | null;
  total_input_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
}

export interface ResponseCacheDiagnostics {
  config: ResponseCacheConfig;
  stats: ResponseCacheStats;
  hit_rate_percent: number;
}

export interface RequestDedupConfig {
  enabled: boolean;
  ttl_secs: number;
  wait_timeout_ms: number;
}

export interface RequestDedupDiagnostics {
  config: RequestDedupConfig;
  stats: RequestDedupStats;
  replay_rate_percent: number;
}

export interface IdempotencyConfig {
  enabled: boolean;
  ttl_secs: number;
  header_name: string;
}

export interface IdempotencyDiagnostics {
  config: IdempotencyConfig;
  stats: IdempotencyStats;
  replay_rate_percent: number;
}

export interface ServerDiagnostics {
  generated_at: string;
  running: boolean;
  host: string;
  port: number;
  telemetry_summary: TelemetrySummary;
  capability_routing: CapabilityRoutingMetricsSnapshot;
  response_cache: ResponseCacheDiagnostics;
  request_dedup: RequestDedupDiagnostics;
  idempotency: IdempotencyDiagnostics;
}

export interface LogArtifactEntry {
  file_name: string;
  path: string;
  size_bytes: number;
  modified_at?: string;
  compressed: boolean;
}

export interface LogStorageDiagnostics {
  log_directory?: string;
  current_log_path?: string;
  current_log_exists: boolean;
  current_log_size_bytes?: number;
  in_memory_log_count: number;
  related_log_files: LogArtifactEntry[];
  raw_response_files: LogArtifactEntry[];
}

export interface SupportBundleExportResult {
  bundle_path: string;
  output_directory: string;
  generated_at: string;
  platform: string;
  included_sections: string[];
  omitted_sections: string[];
}

export interface WindowsStartupCheck {
  key: string;
  status: "ok" | "warning" | "error";
  message: string;
  detail?: string | null;
}

export interface WindowsStartupDiagnostics {
  platform: string;
  app_data_dir?: string | null;
  legacy_lime_dir?: string | null;
  db_path?: string | null;
  webview2_version?: string | null;
  current_exe?: string | null;
  current_dir?: string | null;
  resource_dir?: string | null;
  home_dir?: string | null;
  shell_env?: string | null;
  comspec_env?: string | null;
  resolved_terminal_shell?: string | null;
  installation_kind_guess?: string | null;
  checks: WindowsStartupCheck[];
  has_blocking_issues: boolean;
  has_warnings: boolean;
  summary_message?: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isOptionalNullableString(
  value: unknown,
): value is string | null | undefined {
  return value === undefined || value === null || typeof value === "string";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isOptionalFiniteNumber(
  value: unknown,
): value is number | undefined {
  return value === undefined || isFiniteNumber(value);
}

function isLogArtifactEntry(value: unknown): value is LogArtifactEntry {
  return (
    isRecord(value) &&
    typeof value.file_name === "string" &&
    typeof value.path === "string" &&
    isFiniteNumber(value.size_bytes) &&
    isOptionalString(value.modified_at) &&
    typeof value.compressed === "boolean"
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(isFiniteNumber);
}

function isTelemetrySummary(value: unknown): value is TelemetrySummary {
  return (
    isRecord(value) &&
    isFiniteNumber(value.total_requests) &&
    isFiniteNumber(value.successful_requests) &&
    isFiniteNumber(value.failed_requests) &&
    isFiniteNumber(value.timeout_requests) &&
    isFiniteNumber(value.success_rate) &&
    isFiniteNumber(value.avg_latency_ms) &&
    (value.min_latency_ms === null || isFiniteNumber(value.min_latency_ms)) &&
    (value.max_latency_ms === null || isFiniteNumber(value.max_latency_ms)) &&
    isFiniteNumber(value.total_input_tokens) &&
    isFiniteNumber(value.total_output_tokens) &&
    isFiniteNumber(value.total_tokens)
  );
}

function isCapabilityRoutingMetricsSnapshot(
  value: unknown,
): value is CapabilityRoutingMetricsSnapshot {
  return (
    isRecord(value) &&
    isFiniteNumber(value.filter_eval_total) &&
    isFiniteNumber(value.filter_excluded_total) &&
    isFiniteNumber(value.filter_excluded_tools_total) &&
    isFiniteNumber(value.filter_excluded_vision_total) &&
    isFiniteNumber(value.filter_excluded_context_total) &&
    isFiniteNumber(value.provider_fallback_total) &&
    isFiniteNumber(value.model_fallback_total) &&
    isFiniteNumber(value.all_candidates_excluded_total)
  );
}

function isResponseCacheConfig(value: unknown): value is ResponseCacheConfig {
  return (
    isRecord(value) &&
    typeof value.enabled === "boolean" &&
    isFiniteNumber(value.ttl_secs) &&
    isFiniteNumber(value.max_entries) &&
    isFiniteNumber(value.max_body_bytes) &&
    isNumberArray(value.cacheable_status_codes)
  );
}

function isResponseCacheStats(value: unknown): value is ResponseCacheStats {
  return (
    isRecord(value) &&
    isFiniteNumber(value.size) &&
    isFiniteNumber(value.hits) &&
    isFiniteNumber(value.misses) &&
    isFiniteNumber(value.evictions)
  );
}

function isResponseCacheDiagnostics(
  value: unknown,
): value is ResponseCacheDiagnostics {
  return (
    isRecord(value) &&
    isResponseCacheConfig(value.config) &&
    isResponseCacheStats(value.stats) &&
    isFiniteNumber(value.hit_rate_percent)
  );
}

function isRequestDedupConfig(value: unknown): value is RequestDedupConfig {
  return (
    isRecord(value) &&
    typeof value.enabled === "boolean" &&
    isFiniteNumber(value.ttl_secs) &&
    isFiniteNumber(value.wait_timeout_ms)
  );
}

function isRequestDedupStats(value: unknown): value is RequestDedupStats {
  return (
    isRecord(value) &&
    isFiniteNumber(value.inflight_size) &&
    isFiniteNumber(value.completed_size) &&
    isFiniteNumber(value.check_new_total) &&
    isFiniteNumber(value.check_in_progress_total) &&
    isFiniteNumber(value.check_completed_total) &&
    isFiniteNumber(value.wait_success_total) &&
    isFiniteNumber(value.wait_timeout_total) &&
    isFiniteNumber(value.wait_no_result_total) &&
    isFiniteNumber(value.complete_total) &&
    isFiniteNumber(value.remove_total)
  );
}

function isRequestDedupDiagnostics(
  value: unknown,
): value is RequestDedupDiagnostics {
  return (
    isRecord(value) &&
    isRequestDedupConfig(value.config) &&
    isRequestDedupStats(value.stats) &&
    isFiniteNumber(value.replay_rate_percent)
  );
}

function isIdempotencyConfig(value: unknown): value is IdempotencyConfig {
  return (
    isRecord(value) &&
    typeof value.enabled === "boolean" &&
    isFiniteNumber(value.ttl_secs) &&
    typeof value.header_name === "string"
  );
}

function isIdempotencyStats(value: unknown): value is IdempotencyStats {
  return (
    isRecord(value) &&
    isFiniteNumber(value.entries_size) &&
    isFiniteNumber(value.in_progress_size) &&
    isFiniteNumber(value.completed_size) &&
    isFiniteNumber(value.check_new_total) &&
    isFiniteNumber(value.check_in_progress_total) &&
    isFiniteNumber(value.check_completed_total) &&
    isFiniteNumber(value.complete_total) &&
    isFiniteNumber(value.remove_total)
  );
}

function isIdempotencyDiagnostics(
  value: unknown,
): value is IdempotencyDiagnostics {
  return (
    isRecord(value) &&
    isIdempotencyConfig(value.config) &&
    isIdempotencyStats(value.stats) &&
    isFiniteNumber(value.replay_rate_percent)
  );
}

function isWindowsStartupCheck(value: unknown): value is WindowsStartupCheck {
  return (
    isRecord(value) &&
    typeof value.key === "string" &&
    (value.status === "ok" ||
      value.status === "warning" ||
      value.status === "error") &&
    typeof value.message === "string" &&
    isOptionalNullableString(value.detail)
  );
}

function isMockUrl(value: unknown): boolean {
  return typeof value === "string" && value.startsWith("mock://");
}

function assertNotMockSupportBundle(value: SupportBundleExportResult): void {
  if (
    value.platform === "mock-web" ||
    isMockUrl(value.bundle_path) ||
    isMockUrl(value.output_directory)
  ) {
    throw new Error(
      "export_support_bundle 尚未接入真实诊断 current 通道，收到 desktop-host mock 返回。",
    );
  }
}

function assertNotMockWindowsStartup(
  value: WindowsStartupDiagnostics,
): void {
  if (value.platform === "mock-web") {
    throw new Error(
      "get_windows_startup_diagnostics 尚未接入真实诊断 current 通道，收到 desktop-host mock 返回。",
    );
  }
}

function assertServerDiagnostics(value: unknown): asserts value is ServerDiagnostics {
  if (
    !isRecord(value) ||
    typeof value.generated_at !== "string" ||
    typeof value.running !== "boolean" ||
    typeof value.host !== "string" ||
    !isFiniteNumber(value.port) ||
    !isTelemetrySummary(value.telemetry_summary) ||
    !isCapabilityRoutingMetricsSnapshot(value.capability_routing) ||
    !isResponseCacheDiagnostics(value.response_cache) ||
    !isRequestDedupDiagnostics(value.request_dedup) ||
    !isIdempotencyDiagnostics(value.idempotency)
  ) {
    throw new Error("get_server_diagnostics did not return diagnostics");
  }
}

function assertLogStorageDiagnostics(
  value: unknown,
): asserts value is LogStorageDiagnostics {
  if (
    !isRecord(value) ||
    !isOptionalString(value.log_directory) ||
    !isOptionalString(value.current_log_path) ||
    typeof value.current_log_exists !== "boolean" ||
    !isOptionalFiniteNumber(value.current_log_size_bytes) ||
    !isFiniteNumber(value.in_memory_log_count) ||
    !Array.isArray(value.related_log_files) ||
    !value.related_log_files.every(isLogArtifactEntry) ||
    !Array.isArray(value.raw_response_files) ||
    !value.raw_response_files.every(isLogArtifactEntry)
  ) {
    throw new Error(
      "get_log_storage_diagnostics did not return log diagnostics",
    );
  }
}

function assertSupportBundleExportResult(
  value: unknown,
): asserts value is SupportBundleExportResult {
  if (
    !isRecord(value) ||
    typeof value.bundle_path !== "string" ||
    typeof value.output_directory !== "string" ||
    typeof value.generated_at !== "string" ||
    typeof value.platform !== "string" ||
    !isStringArray(value.included_sections) ||
    !isStringArray(value.omitted_sections)
  ) {
    throw new Error("export_support_bundle did not return support bundle");
  }
}

function assertWindowsStartupDiagnostics(
  value: unknown,
): asserts value is WindowsStartupDiagnostics {
  if (
    !isRecord(value) ||
    typeof value.platform !== "string" ||
    !isOptionalNullableString(value.app_data_dir) ||
    !isOptionalNullableString(value.legacy_lime_dir) ||
    !isOptionalNullableString(value.db_path) ||
    !isOptionalNullableString(value.webview2_version) ||
    !isOptionalNullableString(value.current_exe) ||
    !isOptionalNullableString(value.current_dir) ||
    !isOptionalNullableString(value.resource_dir) ||
    !isOptionalNullableString(value.home_dir) ||
    !isOptionalNullableString(value.shell_env) ||
    !isOptionalNullableString(value.comspec_env) ||
    !isOptionalNullableString(value.resolved_terminal_shell) ||
    !isOptionalNullableString(value.installation_kind_guess) ||
    !Array.isArray(value.checks) ||
    !value.checks.every(isWindowsStartupCheck) ||
    typeof value.has_blocking_issues !== "boolean" ||
    typeof value.has_warnings !== "boolean" ||
    !isOptionalNullableString(value.summary_message)
  ) {
    throw new Error(
      "get_windows_startup_diagnostics did not return startup diagnostics",
    );
  }
}

export async function getServerDiagnostics(): Promise<ServerDiagnostics> {
  const result = await safeInvoke<unknown>("get_server_diagnostics");
  assertNotDiagnosticFacade(
    "get_server_diagnostics",
    result,
    "真实诊断 current 通道",
  );
  assertServerDiagnostics(result);
  return result;
}

export async function getLogStorageDiagnostics(): Promise<LogStorageDiagnostics> {
  const result = await safeInvoke<unknown>(
    "get_log_storage_diagnostics",
  );
  assertNotDiagnosticFacade(
    "get_log_storage_diagnostics",
    result,
    "真实诊断 current 通道",
  );
  assertLogStorageDiagnostics(result);
  return result;
}

export async function exportSupportBundle(): Promise<SupportBundleExportResult> {
  const result = await safeInvoke<unknown>(
    "export_support_bundle",
  );
  assertNotDiagnosticFacade(
    "export_support_bundle",
    result,
    "真实诊断 current 通道",
  );
  assertSupportBundleExportResult(result);
  assertNotMockSupportBundle(result);
  return result;
}

export async function getWindowsStartupDiagnostics(): Promise<WindowsStartupDiagnostics> {
  const result = await safeInvoke<unknown>(
    "get_windows_startup_diagnostics",
  );
  assertNotDiagnosticFacade(
    "get_windows_startup_diagnostics",
    result,
    "真实诊断 current 通道",
  );
  assertWindowsStartupDiagnostics(result);
  assertNotMockWindowsStartup(result);
  return result;
}
