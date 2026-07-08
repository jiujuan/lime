//! log handlers for the App Server processor.

use super::{RequestProcessor, RpcDispatch, dispatch_result, parse_params, to_jsonrpc_error};
use app_server_protocol::{JsonRpcError, LogPersistedTailParams};
use serde_json::Value;

impl RequestProcessor {
    pub(super) async fn handle_log_list_impl(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self.runtime.list_logs().await.map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_log_persisted_tail_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: LogPersistedTailParams = parse_params(params)?;
        let response = self
            .runtime
            .read_persisted_log_tail(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_log_clear_impl(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self.runtime.clear_logs().await.map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_log_diagnostic_history_clear_impl(
        &self,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .clear_diagnostic_log_history()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }
}
