use super::unavailable;
use super::NoopAppDataSource;
use super::RuntimeCoreError;
use app_server_protocol::*;
use async_trait::async_trait;
use std::path::PathBuf;

#[async_trait]
pub trait DiagnosticsAppDataSource: Send + Sync {
    async fn list_logs(&self) -> Result<LogListResponse, RuntimeCoreError> {
        Err(unavailable("log/list"))
    }

    async fn read_persisted_log_tail(
        &self,
        _params: LogPersistedTailParams,
    ) -> Result<LogPersistedTailResponse, RuntimeCoreError> {
        Err(unavailable("log/persistedTail"))
    }

    async fn clear_logs(&self) -> Result<LogClearResponse, RuntimeCoreError> {
        Err(unavailable("log/clear"))
    }

    async fn clear_diagnostic_log_history(&self) -> Result<LogClearResponse, RuntimeCoreError> {
        Err(unavailable("log/diagnosticHistory/clear"))
    }

    async fn read_log_storage_diagnostics(
        &self,
    ) -> Result<LogStorageDiagnosticsResponse, RuntimeCoreError> {
        Err(unavailable("diagnostics/logStorage/read"))
    }

    async fn export_support_bundle(
        &self,
        _params: SupportBundleExportParams,
        _trace_store_root: Option<PathBuf>,
    ) -> Result<SupportBundleExportResponse, RuntimeCoreError> {
        Err(unavailable("diagnostics/supportBundle/export"))
    }

    async fn read_windows_startup_diagnostics(
        &self,
    ) -> Result<WindowsStartupDiagnosticsResponse, RuntimeCoreError> {
        Err(unavailable("diagnostics/windowsStartup/read"))
    }
}

impl DiagnosticsAppDataSource for NoopAppDataSource {}
