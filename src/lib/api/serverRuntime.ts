import { createAppServerClient } from "./appServer";

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

export interface SupportBundleTraceExportSelection {
  session_id: string;
  trace_id: string;
}

export interface SupportBundleExportParams {
  include_trace_export?: SupportBundleTraceExportSelection;
}

export interface DiagnosticsTraceListParams {
  session_id?: string;
  limit?: number;
}

export interface DiagnosticsTraceReadParams {
  session_id: string;
  trace_id: string;
  max_events?: number;
}

export interface DiagnosticsTraceExportParams {
  session_id: string;
  trace_id: string;
}

export interface DiagnosticsTraceRedactionPolicy {
  mode: string;
  raw_agent_event_payload: boolean;
  prompt_text: boolean;
  provider_payload: boolean;
}

export interface DiagnosticsTraceSummary {
  session_id: string;
  trace_id: string;
  path: string;
  size_bytes: number;
  event_count: number;
  first_wall_time_unix_ms?: number;
  last_wall_time_unix_ms?: number;
  modified_at?: string;
}

export interface DiagnosticsTraceEvent {
  schema_version: number;
  seq: number;
  wall_time_unix_ms: number;
  trace_id: string;
  run_id?: string | null;
  request_id?: string | null;
  session_id: string;
  thread_id?: string | null;
  turn_id?: string | null;
  event_id: string;
  event_sequence: number;
  event_type: string;
  checkpoint: string;
  metrics: Record<string, unknown>;
  redaction: DiagnosticsTraceRedactionPolicy;
}

export interface DiagnosticsTraceListResult {
  available: boolean;
  trace_root?: string | null;
  traces: DiagnosticsTraceSummary[];
  redaction: DiagnosticsTraceRedactionPolicy;
}

export interface DiagnosticsTraceReadResult {
  available: boolean;
  trace?: DiagnosticsTraceSummary | null;
  events: DiagnosticsTraceEvent[];
  redaction: DiagnosticsTraceRedactionPolicy;
}

export interface DiagnosticsTraceExportResult {
  available: boolean;
  exported: boolean;
  trace?: DiagnosticsTraceSummary | null;
  bundle_path?: string | null;
  output_directory?: string | null;
  generated_at?: string | null;
  included_sections: string[];
  omitted_sections: string[];
  redaction: DiagnosticsTraceRedactionPolicy;
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

function assertNotMockWindowsStartup(value: WindowsStartupDiagnostics): void {
  if (value.platform === "mock-web") {
    throw new Error(
      "get_windows_startup_diagnostics 尚未接入真实诊断 current 通道，收到 desktop-host mock 返回。",
    );
  }
}

function assertServerDiagnostics(
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

function assertDiagnosticsTraceListResult(
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

function assertDiagnosticsTraceReadResult(
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

function assertDiagnosticsTraceExportResult(
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

function projectLogArtifactEntry(value: {
  fileName: string;
  path: string;
  sizeBytes: number;
  modifiedAt?: string;
  compressed: boolean;
}): LogArtifactEntry {
  return {
    file_name: value.fileName,
    path: value.path,
    size_bytes: value.sizeBytes,
    ...(value.modifiedAt ? { modified_at: value.modifiedAt } : {}),
    compressed: value.compressed,
  };
}

function projectLogStorageDiagnostics(value: {
  logDirectory?: string;
  currentLogPath?: string;
  currentLogExists: boolean;
  currentLogSizeBytes?: number;
  inMemoryLogCount: number;
  relatedLogFiles: Array<{
    fileName: string;
    path: string;
    sizeBytes: number;
    modifiedAt?: string;
    compressed: boolean;
  }>;
  rawResponseFiles: Array<{
    fileName: string;
    path: string;
    sizeBytes: number;
    modifiedAt?: string;
    compressed: boolean;
  }>;
}): LogStorageDiagnostics {
  return {
    ...(value.logDirectory ? { log_directory: value.logDirectory } : {}),
    ...(value.currentLogPath ? { current_log_path: value.currentLogPath } : {}),
    current_log_exists: value.currentLogExists,
    ...(typeof value.currentLogSizeBytes === "number"
      ? { current_log_size_bytes: value.currentLogSizeBytes }
      : {}),
    in_memory_log_count: value.inMemoryLogCount,
    related_log_files: value.relatedLogFiles.map(projectLogArtifactEntry),
    raw_response_files: value.rawResponseFiles.map(projectLogArtifactEntry),
  };
}

function projectServerDiagnostics(value: {
  generatedAt: string;
  running: boolean;
  host: string;
  port: number;
  telemetrySummary: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    timeoutRequests: number;
    successRate: number;
    avgLatencyMs: number;
    minLatencyMs?: number | null;
    maxLatencyMs?: number | null;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
  };
  capabilityRouting: {
    filterEvalTotal: number;
    filterExcludedTotal: number;
    filterExcludedToolsTotal: number;
    filterExcludedVisionTotal: number;
    filterExcludedContextTotal: number;
    providerFallbackTotal: number;
    modelFallbackTotal: number;
    allCandidatesExcludedTotal: number;
  };
  responseCache: {
    config: {
      enabled: boolean;
      ttlSecs: number;
      maxEntries?: number;
      maxBodyBytes?: number;
      cacheableStatusCodes: number[];
    };
    stats: unknown;
    hitRatePercent: number;
  };
  requestDedup: {
    config: {
      enabled: boolean;
      ttlSecs: number;
      waitTimeoutMs?: number;
    };
    stats: unknown;
    replayRatePercent: number;
  };
  idempotency: {
    config: {
      enabled: boolean;
      ttlSecs: number;
      headerName?: string;
    };
    stats: unknown;
    replayRatePercent: number;
  };
}): ServerDiagnostics {
  const responseCacheStats = isRecord(value.responseCache.stats)
    ? value.responseCache.stats
    : {};
  const requestDedupStats = isRecord(value.requestDedup.stats)
    ? value.requestDedup.stats
    : {};
  const idempotencyStats = isRecord(value.idempotency.stats)
    ? value.idempotency.stats
    : {};
  const numberFromStats = (
    stats: Record<string, unknown>,
    key: string,
  ): number => (isFiniteNumber(stats[key]) ? stats[key] : 0);

  return {
    generated_at: value.generatedAt,
    running: value.running,
    host: value.host,
    port: value.port,
    telemetry_summary: {
      total_requests: value.telemetrySummary.totalRequests,
      successful_requests: value.telemetrySummary.successfulRequests,
      failed_requests: value.telemetrySummary.failedRequests,
      timeout_requests: value.telemetrySummary.timeoutRequests,
      success_rate: value.telemetrySummary.successRate,
      avg_latency_ms: value.telemetrySummary.avgLatencyMs,
      min_latency_ms: value.telemetrySummary.minLatencyMs ?? null,
      max_latency_ms: value.telemetrySummary.maxLatencyMs ?? null,
      total_input_tokens: value.telemetrySummary.totalInputTokens,
      total_output_tokens: value.telemetrySummary.totalOutputTokens,
      total_tokens: value.telemetrySummary.totalTokens,
    },
    capability_routing: {
      filter_eval_total: value.capabilityRouting.filterEvalTotal,
      filter_excluded_total: value.capabilityRouting.filterExcludedTotal,
      filter_excluded_tools_total:
        value.capabilityRouting.filterExcludedToolsTotal,
      filter_excluded_vision_total:
        value.capabilityRouting.filterExcludedVisionTotal,
      filter_excluded_context_total:
        value.capabilityRouting.filterExcludedContextTotal,
      provider_fallback_total: value.capabilityRouting.providerFallbackTotal,
      model_fallback_total: value.capabilityRouting.modelFallbackTotal,
      all_candidates_excluded_total:
        value.capabilityRouting.allCandidatesExcludedTotal,
    },
    response_cache: {
      config: {
        enabled: value.responseCache.config.enabled,
        ttl_secs: value.responseCache.config.ttlSecs,
        max_entries: value.responseCache.config.maxEntries ?? 0,
        max_body_bytes: value.responseCache.config.maxBodyBytes ?? 0,
        cacheable_status_codes:
          value.responseCache.config.cacheableStatusCodes ?? [],
      },
      stats: {
        size: numberFromStats(responseCacheStats, "size"),
        hits: numberFromStats(responseCacheStats, "hits"),
        misses: numberFromStats(responseCacheStats, "misses"),
        evictions: numberFromStats(responseCacheStats, "evictions"),
      },
      hit_rate_percent: value.responseCache.hitRatePercent,
    },
    request_dedup: {
      config: {
        enabled: value.requestDedup.config.enabled,
        ttl_secs: value.requestDedup.config.ttlSecs,
        wait_timeout_ms: value.requestDedup.config.waitTimeoutMs ?? 0,
      },
      stats: {
        inflight_size: numberFromStats(requestDedupStats, "inflight_size"),
        completed_size: numberFromStats(requestDedupStats, "completed_size"),
        check_new_total: numberFromStats(requestDedupStats, "check_new_total"),
        check_in_progress_total: numberFromStats(
          requestDedupStats,
          "check_in_progress_total",
        ),
        check_completed_total: numberFromStats(
          requestDedupStats,
          "check_completed_total",
        ),
        wait_success_total: numberFromStats(
          requestDedupStats,
          "wait_success_total",
        ),
        wait_timeout_total: numberFromStats(
          requestDedupStats,
          "wait_timeout_total",
        ),
        wait_no_result_total: numberFromStats(
          requestDedupStats,
          "wait_no_result_total",
        ),
        complete_total: numberFromStats(requestDedupStats, "complete_total"),
        remove_total: numberFromStats(requestDedupStats, "remove_total"),
      },
      replay_rate_percent: value.requestDedup.replayRatePercent,
    },
    idempotency: {
      config: {
        enabled: value.idempotency.config.enabled,
        ttl_secs: value.idempotency.config.ttlSecs,
        header_name: value.idempotency.config.headerName ?? "idempotency-key",
      },
      stats: {
        entries_size: numberFromStats(idempotencyStats, "entries_size"),
        in_progress_size: numberFromStats(idempotencyStats, "in_progress_size"),
        completed_size: numberFromStats(idempotencyStats, "completed_size"),
        check_new_total: numberFromStats(idempotencyStats, "check_new_total"),
        check_in_progress_total: numberFromStats(
          idempotencyStats,
          "check_in_progress_total",
        ),
        check_completed_total: numberFromStats(
          idempotencyStats,
          "check_completed_total",
        ),
        complete_total: numberFromStats(idempotencyStats, "complete_total"),
        remove_total: numberFromStats(idempotencyStats, "remove_total"),
      },
      replay_rate_percent: value.idempotency.replayRatePercent,
    },
  };
}

function projectSupportBundleExport(value: {
  bundlePath: string;
  outputDirectory: string;
  generatedAt: string;
  platform: string;
  includedSections: string[];
  omittedSections: string[];
}): SupportBundleExportResult {
  return {
    bundle_path: value.bundlePath,
    output_directory: value.outputDirectory,
    generated_at: value.generatedAt,
    platform: value.platform,
    included_sections: value.includedSections,
    omitted_sections: value.omittedSections,
  };
}

function projectSupportBundleExportParams(
  params: SupportBundleExportParams,
): { includeTraceExport?: { sessionId: string; traceId: string } } | undefined {
  const selection = params.include_trace_export;
  if (!selection) {
    return undefined;
  }
  return {
    includeTraceExport: {
      sessionId: selection.session_id,
      traceId: selection.trace_id,
    },
  };
}

function projectTraceRedactionPolicy(value: {
  mode: string;
  rawAgentEventPayload: boolean;
  promptText: boolean;
  providerPayload: boolean;
}): DiagnosticsTraceRedactionPolicy {
  return {
    mode: value.mode,
    raw_agent_event_payload: value.rawAgentEventPayload,
    prompt_text: value.promptText,
    provider_payload: value.providerPayload,
  };
}

function projectTraceSummary(value: {
  sessionId: string;
  traceId: string;
  path: string;
  sizeBytes: number;
  eventCount: number;
  firstWallTimeUnixMs?: number | null;
  lastWallTimeUnixMs?: number | null;
  modifiedAt?: string | null;
}): DiagnosticsTraceSummary {
  return {
    session_id: value.sessionId,
    trace_id: value.traceId,
    path: value.path,
    size_bytes: value.sizeBytes,
    event_count: value.eventCount,
    ...(typeof value.firstWallTimeUnixMs === "number"
      ? { first_wall_time_unix_ms: value.firstWallTimeUnixMs }
      : {}),
    ...(typeof value.lastWallTimeUnixMs === "number"
      ? { last_wall_time_unix_ms: value.lastWallTimeUnixMs }
      : {}),
    ...(value.modifiedAt ? { modified_at: value.modifiedAt } : {}),
  };
}

function projectTraceEvent(value: {
  schemaVersion: number;
  seq: number;
  wallTimeUnixMs: number;
  traceId: string;
  runId?: string | null;
  requestId?: string | null;
  sessionId: string;
  threadId?: string | null;
  turnId?: string | null;
  eventId: string;
  eventSequence: number;
  eventType: string;
  checkpoint: string;
  metrics?: Record<string, unknown>;
  redaction: {
    mode: string;
    rawAgentEventPayload: boolean;
    promptText: boolean;
    providerPayload: boolean;
  };
}): DiagnosticsTraceEvent {
  return {
    schema_version: value.schemaVersion,
    seq: value.seq,
    wall_time_unix_ms: value.wallTimeUnixMs,
    trace_id: value.traceId,
    run_id: value.runId ?? null,
    request_id: value.requestId ?? null,
    session_id: value.sessionId,
    thread_id: value.threadId ?? null,
    turn_id: value.turnId ?? null,
    event_id: value.eventId,
    event_sequence: value.eventSequence,
    event_type: value.eventType,
    checkpoint: value.checkpoint,
    metrics: isRecord(value.metrics) ? value.metrics : {},
    redaction: projectTraceRedactionPolicy(value.redaction),
  };
}

function projectDiagnosticsTraceList(value: {
  available: boolean;
  traceRoot?: string | null;
  traces?: Array<Parameters<typeof projectTraceSummary>[0]>;
  redaction: Parameters<typeof projectTraceRedactionPolicy>[0];
}): DiagnosticsTraceListResult {
  return {
    available: value.available,
    trace_root: value.traceRoot ?? null,
    traces: (value.traces ?? []).map(projectTraceSummary),
    redaction: projectTraceRedactionPolicy(value.redaction),
  };
}

function projectDiagnosticsTraceRead(value: {
  available: boolean;
  trace?: Parameters<typeof projectTraceSummary>[0] | null;
  events?: Array<Parameters<typeof projectTraceEvent>[0]>;
  redaction: Parameters<typeof projectTraceRedactionPolicy>[0];
}): DiagnosticsTraceReadResult {
  return {
    available: value.available,
    trace: value.trace ? projectTraceSummary(value.trace) : null,
    events: (value.events ?? []).map(projectTraceEvent),
    redaction: projectTraceRedactionPolicy(value.redaction),
  };
}

function projectDiagnosticsTraceExport(value: {
  available: boolean;
  exported: boolean;
  trace?: Parameters<typeof projectTraceSummary>[0] | null;
  bundlePath?: string | null;
  outputDirectory?: string | null;
  generatedAt?: string | null;
  includedSections?: string[];
  omittedSections?: string[];
  redaction: Parameters<typeof projectTraceRedactionPolicy>[0];
}): DiagnosticsTraceExportResult {
  return {
    available: value.available,
    exported: value.exported,
    trace: value.trace ? projectTraceSummary(value.trace) : null,
    bundle_path: value.bundlePath ?? null,
    output_directory: value.outputDirectory ?? null,
    generated_at: value.generatedAt ?? null,
    included_sections: value.includedSections ?? [],
    omitted_sections: value.omittedSections ?? [],
    redaction: projectTraceRedactionPolicy(value.redaction),
  };
}

function projectWindowsStartupDiagnostics(value: {
  platform: string;
  appDataDir?: string | null;
  legacyLimeDir?: string | null;
  dbPath?: string | null;
  webview2Version?: string | null;
  currentExe?: string | null;
  currentDir?: string | null;
  resourceDir?: string | null;
  homeDir?: string | null;
  shellEnv?: string | null;
  comspecEnv?: string | null;
  resolvedTerminalShell?: string | null;
  installationKindGuess?: string | null;
  checks: Array<{
    key: string;
    status: string;
    message: string;
    detail?: string | null;
  }>;
  hasBlockingIssues: boolean;
  hasWarnings: boolean;
  summaryMessage?: string | null;
}): WindowsStartupDiagnostics {
  const projectStatus = (status: string): "ok" | "warning" | "error" => {
    if (status === "ok" || status === "warning" || status === "error") {
      return status;
    }
    return "warning";
  };

  return {
    platform: value.platform,
    app_data_dir: value.appDataDir ?? null,
    legacy_lime_dir: value.legacyLimeDir ?? null,
    db_path: value.dbPath ?? null,
    webview2_version: value.webview2Version ?? null,
    current_exe: value.currentExe ?? null,
    current_dir: value.currentDir ?? null,
    resource_dir: value.resourceDir ?? null,
    home_dir: value.homeDir ?? null,
    shell_env: value.shellEnv ?? null,
    comspec_env: value.comspecEnv ?? null,
    resolved_terminal_shell: value.resolvedTerminalShell ?? null,
    installation_kind_guess: value.installationKindGuess ?? null,
    checks: value.checks.map((check) => ({
      key: check.key,
      status: projectStatus(check.status),
      message: check.message,
      detail: check.detail ?? null,
    })),
    has_blocking_issues: value.hasBlockingIssues,
    has_warnings: value.hasWarnings,
    summary_message: value.summaryMessage ?? null,
  };
}

export async function getServerDiagnostics(): Promise<ServerDiagnostics> {
  const response = await createAppServerClient().readServerDiagnostics();
  const result = projectServerDiagnostics(response.result);
  assertServerDiagnostics(result);
  return result;
}

export async function getLogStorageDiagnostics(): Promise<LogStorageDiagnostics> {
  const response = await createAppServerClient().readLogStorageDiagnostics();
  const result = projectLogStorageDiagnostics(response.result);
  assertLogStorageDiagnostics(result);
  return result;
}

export async function exportSupportBundle(
  params: SupportBundleExportParams = {},
): Promise<SupportBundleExportResult> {
  const requestParams = projectSupportBundleExportParams(params);
  const response = requestParams
    ? await createAppServerClient().exportSupportBundle(requestParams)
    : await createAppServerClient().exportSupportBundle();
  const result = projectSupportBundleExport(response.result);
  assertSupportBundleExportResult(result);
  assertNotMockSupportBundle(result);
  return result;
}

export async function listDiagnosticsTraces(
  params: DiagnosticsTraceListParams = {},
): Promise<DiagnosticsTraceListResult> {
  const response = await createAppServerClient().listDiagnosticsTraces({
    ...(params.session_id ? { sessionId: params.session_id } : {}),
    ...(typeof params.limit === "number" ? { limit: params.limit } : {}),
  });
  const result = projectDiagnosticsTraceList(response.result);
  assertDiagnosticsTraceListResult(result);
  return result;
}

export async function readDiagnosticsTrace(
  params: DiagnosticsTraceReadParams,
): Promise<DiagnosticsTraceReadResult> {
  const response = await createAppServerClient().readDiagnosticsTrace({
    sessionId: params.session_id,
    traceId: params.trace_id,
    ...(typeof params.max_events === "number"
      ? { maxEvents: params.max_events }
      : {}),
  });
  const result = projectDiagnosticsTraceRead(response.result);
  assertDiagnosticsTraceReadResult(result);
  return result;
}

export async function exportDiagnosticsTrace(
  params: DiagnosticsTraceExportParams,
): Promise<DiagnosticsTraceExportResult> {
  const response = await createAppServerClient().exportDiagnosticsTrace({
    sessionId: params.session_id,
    traceId: params.trace_id,
  });
  const result = projectDiagnosticsTraceExport(response.result);
  assertDiagnosticsTraceExportResult(result);
  return result;
}

export async function getWindowsStartupDiagnostics(): Promise<WindowsStartupDiagnostics> {
  const response =
    await createAppServerClient().readWindowsStartupDiagnostics();
  const result = projectWindowsStartupDiagnostics(response.result);
  assertWindowsStartupDiagnostics(result);
  assertNotMockWindowsStartup(result);
  return result;
}
