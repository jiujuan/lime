//! diagnostics handlers for the App Server processor.

use super::{dispatch_result, to_jsonrpc_error, RequestProcessor, RpcDispatch};
use app_server_protocol::JsonRpcError;

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
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .export_support_bundle()
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
