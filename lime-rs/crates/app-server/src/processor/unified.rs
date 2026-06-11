//! unified memory domain handlers for the App Server processor.

use super::{dispatch_result, parse_params, to_jsonrpc_error, RequestProcessor, RpcDispatch};
use app_server_protocol::{
    JsonRpcError, UnifiedMemoryAnalyzeParams, UnifiedMemoryCreateParams, UnifiedMemoryDeleteParams,
    UnifiedMemoryGetParams, UnifiedMemoryHybridSearchParams, UnifiedMemoryListParams,
    UnifiedMemorySearchParams, UnifiedMemorySemanticSearchParams, UnifiedMemoryUpdateParams,
};

impl RequestProcessor {
    pub(super) async fn handle_unified_memory_list_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: UnifiedMemoryListParams = parse_params(params)?;
        let response = self
            .runtime
            .list_unified_memories(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_unified_memory_get_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: UnifiedMemoryGetParams = parse_params(params)?;
        let response = self
            .runtime
            .get_unified_memory(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_unified_memory_create_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: UnifiedMemoryCreateParams = parse_params(params)?;
        let response = self
            .runtime
            .create_unified_memory(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_unified_memory_update_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: UnifiedMemoryUpdateParams = parse_params(params)?;
        let response = self
            .runtime
            .update_unified_memory(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_unified_memory_delete_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: UnifiedMemoryDeleteParams = parse_params(params)?;
        let response = self
            .runtime
            .delete_unified_memory(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_unified_memory_search_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: UnifiedMemorySearchParams = parse_params(params)?;
        let response = self
            .runtime
            .search_unified_memories(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_unified_memory_stats_impl(
        &self,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .read_unified_memory_stats()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_unified_memory_analyze_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: UnifiedMemoryAnalyzeParams = parse_params(params)?;
        let response = self
            .runtime
            .analyze_unified_memories(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_unified_memory_semantic_search_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: UnifiedMemorySemanticSearchParams = parse_params(params)?;
        let response = self
            .runtime
            .semantic_search_unified_memories(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_unified_memory_hybrid_search_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: UnifiedMemoryHybridSearchParams = parse_params(params)?;
        let response = self
            .runtime
            .hybrid_search_unified_memories(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }
    // mcp handlers 已提取到 processor/mcp.rs
}
