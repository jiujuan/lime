use super::{timestamp, RuntimeCore, RuntimeCoreError};
use app_server_protocol::*;
use serde_json::json;

impl RuntimeCore {
    pub async fn list_logs(&self) -> Result<LogListResponse, RuntimeCoreError> {
        self.app_data_source.list_logs().await
    }

    pub async fn read_persisted_log_tail(
        &self,
        params: LogPersistedTailParams,
    ) -> Result<LogPersistedTailResponse, RuntimeCoreError> {
        self.app_data_source.read_persisted_log_tail(params).await
    }

    pub async fn clear_logs(&self) -> Result<LogClearResponse, RuntimeCoreError> {
        self.app_data_source.clear_logs().await
    }

    pub async fn clear_diagnostic_log_history(&self) -> Result<LogClearResponse, RuntimeCoreError> {
        self.app_data_source.clear_diagnostic_log_history().await
    }

    pub async fn read_log_storage_diagnostics(
        &self,
    ) -> Result<LogStorageDiagnosticsResponse, RuntimeCoreError> {
        self.app_data_source.read_log_storage_diagnostics().await
    }

    pub async fn export_support_bundle(
        &self,
    ) -> Result<SupportBundleExportResponse, RuntimeCoreError> {
        self.app_data_source.export_support_bundle().await
    }

    pub async fn read_server_diagnostics(
        &self,
    ) -> Result<ServerDiagnosticsResponse, RuntimeCoreError> {
        Ok(ServerDiagnosticsResponse {
            generated_at: timestamp(),
            running: true,
            host: "127.0.0.1".to_string(),
            port: 0,
            telemetry_summary: DiagnosticsTelemetrySummary::default(),
            capability_routing: DiagnosticsCapabilityRoutingMetricsSnapshot::default(),
            response_cache: DiagnosticsResponseCacheDiagnostics {
                config: DiagnosticsMetricConfig {
                    enabled: false,
                    ttl_secs: 0,
                    max_entries: Some(0),
                    max_body_bytes: Some(0),
                    cacheable_status_codes: Vec::new(),
                    wait_timeout_ms: None,
                    header_name: None,
                },
                stats: json!({
                    "size": 0,
                    "hits": 0,
                    "misses": 0,
                    "evictions": 0,
                }),
                hit_rate_percent: 0.0,
            },
            request_dedup: DiagnosticsRequestDedupDiagnostics {
                config: DiagnosticsMetricConfig {
                    enabled: false,
                    ttl_secs: 0,
                    max_entries: None,
                    max_body_bytes: None,
                    cacheable_status_codes: Vec::new(),
                    wait_timeout_ms: Some(0),
                    header_name: None,
                },
                stats: json!({
                    "inflight_size": 0,
                    "completed_size": 0,
                    "check_new_total": 0,
                    "check_in_progress_total": 0,
                    "check_completed_total": 0,
                    "wait_success_total": 0,
                    "wait_timeout_total": 0,
                    "wait_no_result_total": 0,
                    "complete_total": 0,
                    "remove_total": 0,
                }),
                replay_rate_percent: 0.0,
            },
            idempotency: DiagnosticsIdempotencyDiagnostics {
                config: DiagnosticsMetricConfig {
                    enabled: false,
                    ttl_secs: 0,
                    max_entries: None,
                    max_body_bytes: None,
                    cacheable_status_codes: Vec::new(),
                    wait_timeout_ms: None,
                    header_name: Some("idempotency-key".to_string()),
                },
                stats: json!({
                    "entries_size": 0,
                    "in_progress_size": 0,
                    "completed_size": 0,
                    "check_new_total": 0,
                    "check_in_progress_total": 0,
                    "check_completed_total": 0,
                    "complete_total": 0,
                    "remove_total": 0,
                }),
                replay_rate_percent: 0.0,
            },
        })
    }

    pub async fn read_windows_startup_diagnostics(
        &self,
    ) -> Result<WindowsStartupDiagnosticsResponse, RuntimeCoreError> {
        self.app_data_source
            .read_windows_startup_diagnostics()
            .await
    }
}
