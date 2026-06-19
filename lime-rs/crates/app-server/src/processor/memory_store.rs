//! memory store domain handlers for the App Server processor.

use super::{dispatch_result, parse_params, to_jsonrpc_error, RequestProcessor, RpcDispatch};
use app_server_protocol::{
    JsonRpcError, MemoryStoreAddNoteParams, MemoryStoreListParams, MemoryStoreReadParams,
    MemoryStoreResetParams, MemoryStoreRootParams, MemoryStoreSearchParams,
};
use serde_json::Value;

impl RequestProcessor {
    pub(super) async fn handle_memory_store_list_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: MemoryStoreListParams = parse_params(params)?;
        let response = self
            .runtime
            .list_memory_store(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_memory_store_read_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: MemoryStoreReadParams = parse_params(params)?;
        let response = self
            .runtime
            .read_memory_store(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_memory_store_search_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: MemoryStoreSearchParams = parse_params(params)?;
        let response = self
            .runtime
            .search_memory_store(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_memory_store_add_note_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: MemoryStoreAddNoteParams = parse_params(params)?;
        let response = self
            .runtime
            .add_memory_store_note(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_memory_store_health_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: MemoryStoreRootParams = parse_params(params)?;
        let response = self
            .runtime
            .health_memory_store(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_memory_store_reset_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: MemoryStoreResetParams = parse_params(params)?;
        let response = self
            .runtime
            .reset_memory_store(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }
}
