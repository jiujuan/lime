use super::super::*;
use async_trait::async_trait;

#[async_trait]
impl DiagnosticsAppDataSource for LocalAppDataSource {
    async fn list_logs(&self) -> Result<LogListResponse, RuntimeCoreError> {
        Ok(LogListResponse {
            entries: diagnostics::read_persisted_logs_tail(1_000).map_err(data_error)?,
        })
    }

    async fn read_persisted_log_tail(
        &self,
        params: LogPersistedTailParams,
    ) -> Result<LogPersistedTailResponse, RuntimeCoreError> {
        let limit = params.lines.unwrap_or(200).clamp(20, 1_000);
        Ok(LogPersistedTailResponse {
            entries: diagnostics::read_persisted_logs_tail(limit).map_err(data_error)?,
        })
    }

    async fn clear_logs(&self) -> Result<LogClearResponse, RuntimeCoreError> {
        diagnostics::clear_persisted_log_artifacts().map_err(data_error)?;
        Ok(LogClearResponse { cleared: true })
    }

    async fn clear_diagnostic_log_history(&self) -> Result<LogClearResponse, RuntimeCoreError> {
        diagnostics::clear_diagnostic_log_artifacts().map_err(data_error)?;
        Ok(LogClearResponse { cleared: true })
    }

    async fn read_log_storage_diagnostics(
        &self,
    ) -> Result<LogStorageDiagnosticsResponse, RuntimeCoreError> {
        Ok(diagnostics::read_log_storage_diagnostics().map_err(data_error)?)
    }

    async fn export_support_bundle(&self) -> Result<SupportBundleExportResponse, RuntimeCoreError> {
        diagnostics::export_support_bundle().map_err(data_error)
    }

    async fn read_windows_startup_diagnostics(
        &self,
    ) -> Result<WindowsStartupDiagnosticsResponse, RuntimeCoreError> {
        diagnostics::read_windows_startup_diagnostics().map_err(data_error)
    }
}
