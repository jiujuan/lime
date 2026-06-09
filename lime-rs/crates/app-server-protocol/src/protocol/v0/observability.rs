use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMemoryReadParams {
    pub project_id: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMemoryReadResponse {
    pub memory: serde_json::Value,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub timestamp: String,
    pub level: String,
    pub message: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct LogListResponse {
    #[serde(default)]
    pub entries: Vec<LogEntry>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct LogPersistedTailParams {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lines: Option<usize>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct LogPersistedTailResponse {
    #[serde(default)]
    pub entries: Vec<LogEntry>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct LogClearResponse {
    pub cleared: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct LogArtifactEntry {
    pub file_name: String,
    pub path: String,
    pub size_bytes: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub modified_at: Option<String>,
    pub compressed: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct LogStorageDiagnosticsResponse {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub log_directory: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub current_log_path: Option<String>,
    pub current_log_exists: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub current_log_size_bytes: Option<u64>,
    pub in_memory_log_count: usize,
    #[serde(default)]
    pub related_log_files: Vec<LogArtifactEntry>,
    #[serde(default)]
    pub raw_response_files: Vec<LogArtifactEntry>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SupportBundleExportResponse {
    pub bundle_path: String,
    pub output_directory: String,
    pub generated_at: String,
    pub platform: String,
    #[serde(default)]
    pub included_sections: Vec<String>,
    #[serde(default)]
    pub omitted_sections: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsMetricConfig {
    pub enabled: bool,
    pub ttl_secs: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_entries: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_body_bytes: Option<u64>,
    #[serde(default)]
    pub cacheable_status_codes: Vec<u16>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wait_timeout_ms: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub header_name: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsTelemetrySummary {
    pub total_requests: u64,
    pub successful_requests: u64,
    pub failed_requests: u64,
    pub timeout_requests: u64,
    pub success_rate: f64,
    pub avg_latency_ms: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_latency_ms: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_latency_ms: Option<f64>,
    pub total_input_tokens: u64,
    pub total_output_tokens: u64,
    pub total_tokens: u64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsCapabilityRoutingMetricsSnapshot {
    pub filter_eval_total: u64,
    pub filter_excluded_total: u64,
    pub filter_excluded_tools_total: u64,
    pub filter_excluded_vision_total: u64,
    pub filter_excluded_context_total: u64,
    pub provider_fallback_total: u64,
    pub model_fallback_total: u64,
    pub all_candidates_excluded_total: u64,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsResponseCacheDiagnostics {
    pub config: DiagnosticsMetricConfig,
    pub stats: serde_json::Value,
    pub hit_rate_percent: f64,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsRequestDedupDiagnostics {
    pub config: DiagnosticsMetricConfig,
    pub stats: serde_json::Value,
    pub replay_rate_percent: f64,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsIdempotencyDiagnostics {
    pub config: DiagnosticsMetricConfig,
    pub stats: serde_json::Value,
    pub replay_rate_percent: f64,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ServerDiagnosticsResponse {
    pub generated_at: String,
    pub running: bool,
    pub host: String,
    pub port: u16,
    pub telemetry_summary: DiagnosticsTelemetrySummary,
    pub capability_routing: DiagnosticsCapabilityRoutingMetricsSnapshot,
    pub response_cache: DiagnosticsResponseCacheDiagnostics,
    pub request_dedup: DiagnosticsRequestDedupDiagnostics,
    pub idempotency: DiagnosticsIdempotencyDiagnostics,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WindowsStartupCheck {
    pub key: String,
    pub status: String,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WindowsStartupDiagnosticsResponse {
    pub platform: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub app_data_dir: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub legacy_lime_dir: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub db_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub webview2_version: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub current_exe: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub current_dir: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resource_dir: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub home_dir: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shell_env: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub comspec_env: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resolved_terminal_shell: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub installation_kind_guess: Option<String>,
    #[serde(default)]
    pub checks: Vec<WindowsStartupCheck>,
    pub has_blocking_issues: bool,
    pub has_warnings: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub summary_message: Option<String>,
}
