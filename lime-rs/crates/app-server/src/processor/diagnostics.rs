//! diagnostics handlers for the App Server processor.

use super::{RequestProcessor, RpcDispatch, dispatch_result, parse_params, to_jsonrpc_error};
use app_server_protocol::{
    DiagnosticsTraceExportParams, DiagnosticsTraceListParams, DiagnosticsTraceReadParams,
    JsonRpcError, SupportBundleExportParams,
};

impl RequestProcessor {
    pub(super) async fn handle_diagnostics_log_storage_read_impl(
        &self,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .read_log_storage_diagnostics()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_diagnostics_support_bundle_export_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: SupportBundleExportParams = parse_params(params)?;
        let response = self
            .runtime
            .export_support_bundle(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_diagnostics_trace_list_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: DiagnosticsTraceListParams = parse_params(params)?;
        let response = self
            .runtime
            .list_diagnostics_traces(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_diagnostics_trace_read_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: DiagnosticsTraceReadParams = parse_params(params)?;
        let response = self
            .runtime
            .read_diagnostics_trace(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_diagnostics_trace_export_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: DiagnosticsTraceExportParams = parse_params(params)?;
        let response = self
            .runtime
            .export_diagnostics_trace(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_diagnostics_server_read_impl(
        &self,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .read_server_diagnostics()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_diagnostics_windows_startup_read_impl(
        &self,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .read_windows_startup_diagnostics()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }
}
