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
