import type {
  CapabilityRoutingMetricsSnapshot,
  ResponseCacheConfig,
  ResponseCacheStats,
  RequestDedupStats,
  IdempotencyStats,
  TelemetrySummary,
  ResponseCacheDiagnostics,
  RequestDedupConfig,
  RequestDedupDiagnostics,
  IdempotencyConfig,
  IdempotencyDiagnostics,
  ServerDiagnostics,
  LogArtifactEntry,
  LogStorageDiagnostics,
  SupportBundleExportResult,
  DiagnosticsTraceRedactionPolicy,
  DiagnosticsTraceSummary,
  DiagnosticsTraceEvent,
  DiagnosticsTraceListResult,
  DiagnosticsTraceReadResult,
  DiagnosticsTraceExportResult,
  WindowsStartupCheck,
  WindowsStartupDiagnostics,
} from "./serverRuntimeTypes";

export function isRecord(value: unknown): value is Record<string, unknown> {
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

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isOptionalFiniteNumber(value: unknown): value is number | undefined {
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

function isDiagnosticsTraceRedactionPolicy(
  value: unknown,
): value is DiagnosticsTraceRedactionPolicy {
  return (
    isRecord(value) &&
    typeof value.mode === "string" &&
    typeof value.raw_agent_event_payload === "boolean" &&
    typeof value.prompt_text === "boolean" &&
    typeof value.provider_payload === "boolean"
  );
}

function isDiagnosticsTraceSummary(
  value: unknown,
): value is DiagnosticsTraceSummary {
  return (
    isRecord(value) &&
    typeof value.session_id === "string" &&
    typeof value.trace_id === "string" &&
    typeof value.path === "string" &&
    isFiniteNumber(value.size_bytes) &&
    isFiniteNumber(value.event_count) &&
    isOptionalFiniteNumber(value.first_wall_time_unix_ms) &&
    isOptionalFiniteNumber(value.last_wall_time_unix_ms) &&
    isOptionalString(value.modified_at)
  );
}

function isDiagnosticsTraceEvent(
  value: unknown,
): value is DiagnosticsTraceEvent {
  return (
    isRecord(value) &&
    isFiniteNumber(value.schema_version) &&
    isFiniteNumber(value.seq) &&
    isFiniteNumber(value.wall_time_unix_ms) &&
    typeof value.trace_id === "string" &&
    isOptionalNullableString(value.run_id) &&
    isOptionalNullableString(value.request_id) &&
    typeof value.session_id === "string" &&
    isOptionalNullableString(value.thread_id) &&
    isOptionalNullableString(value.turn_id) &&
    typeof value.event_id === "string" &&
    isFiniteNumber(value.event_sequence) &&
    typeof value.event_type === "string" &&
    typeof value.checkpoint === "string" &&
    isRecord(value.metrics) &&
    isDiagnosticsTraceRedactionPolicy(value.redaction)
  );
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
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

export function assertNotMockSupportBundle(value: SupportBundleExportResult): void {
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

export function assertNotMockWindowsStartup(value: WindowsStartupDiagnostics): void {
  if (value.platform === "mock-web") {
    throw new Error(
      "get_windows_startup_diagnostics 尚未接入真实诊断 current 通道，收到 desktop-host mock 返回。",
    );
  }
}

export function assertServerDiagnostics(
  value: unknown,
): asserts value is ServerDiagnostics {
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

export function assertLogStorageDiagnostics(
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

export function assertSupportBundleExportResult(
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

export function assertDiagnosticsTraceListResult(
  value: unknown,
): asserts value is DiagnosticsTraceListResult {
  if (
    !isRecord(value) ||
    typeof value.available !== "boolean" ||
    !isOptionalNullableString(value.trace_root) ||
    !Array.isArray(value.traces) ||
    !value.traces.every(isDiagnosticsTraceSummary) ||
    !isDiagnosticsTraceRedactionPolicy(value.redaction)
  ) {
    throw new Error("diagnostics_trace_list did not return trace list");
  }
}

export function assertDiagnosticsTraceReadResult(
  value: unknown,
): asserts value is DiagnosticsTraceReadResult {
  if (
    !isRecord(value) ||
    typeof value.available !== "boolean" ||
    !(
      value.trace === undefined ||
      value.trace === null ||
      isDiagnosticsTraceSummary(value.trace)
    ) ||
    !Array.isArray(value.events) ||
    !value.events.every(isDiagnosticsTraceEvent) ||
    !isDiagnosticsTraceRedactionPolicy(value.redaction)
  ) {
    throw new Error("diagnostics_trace_read did not return trace events");
  }
}

export function assertDiagnosticsTraceExportResult(
  value: unknown,
): asserts value is DiagnosticsTraceExportResult {
  if (
    !isRecord(value) ||
    typeof value.available !== "boolean" ||
    typeof value.exported !== "boolean" ||
    !(
      value.trace === undefined ||
      value.trace === null ||
      isDiagnosticsTraceSummary(value.trace)
    ) ||
    !isOptionalNullableString(value.bundle_path) ||
    !isOptionalNullableString(value.output_directory) ||
    !isOptionalNullableString(value.generated_at) ||
    !isStringArray(value.included_sections) ||
    !isStringArray(value.omitted_sections) ||
    !isDiagnosticsTraceRedactionPolicy(value.redaction)
  ) {
    throw new Error("diagnostics_trace_export did not return trace export");
  }
  if (
    value.exported &&
    (!value.bundle_path || !value.output_directory || !value.generated_at)
  ) {
    throw new Error("diagnostics_trace_export did not return export artifact");
  }
}

export function assertWindowsStartupDiagnostics(
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
