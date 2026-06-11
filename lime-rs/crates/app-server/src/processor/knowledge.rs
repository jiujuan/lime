//! knowledge domain handlers for the App Server processor.

use super::{dispatch_result, parse_params, to_jsonrpc_error, RequestProcessor, RpcDispatch};
use app_server_protocol::{
    JsonRpcError, KnowledgeCompilePackParams, KnowledgeImportSourceParams, KnowledgeListPacksParams,
    KnowledgeReadPackParams, KnowledgeResolveContextParams, KnowledgeSetDefaultPackParams,
    KnowledgeUpdatePackStatusParams, KnowledgeValidateContextRunParams,
};
use serde_json::Value;

impl RequestProcessor {
    pub(super) async fn handle_knowledge_pack_list_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: KnowledgeListPacksParams = parse_params(params)?;
        let response = self
            .runtime
            .list_knowledge_packs(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_knowledge_pack_read_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: KnowledgeReadPackParams = parse_params(params)?;
        let response = self
            .runtime
            .read_knowledge_pack(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_knowledge_source_import_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: KnowledgeImportSourceParams = parse_params(params)?;
        let response = self
            .runtime
            .import_knowledge_source(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_knowledge_pack_compile_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: KnowledgeCompilePackParams = parse_params(params)?;
        let response = self
            .runtime
            .compile_knowledge_pack(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_knowledge_pack_default_set_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: KnowledgeSetDefaultPackParams = parse_params(params)?;
        let response = self
            .runtime
            .set_default_knowledge_pack(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_knowledge_pack_status_update_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: KnowledgeUpdatePackStatusParams = parse_params(params)?;
        let response = self
            .runtime
            .update_knowledge_pack_status(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_knowledge_context_resolve_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: KnowledgeResolveContextParams = parse_params(params)?;
        let response = self
            .runtime
            .resolve_knowledge_context(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_knowledge_context_run_validate_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: KnowledgeValidateContextRunParams = parse_params(params)?;
        let response = self
            .runtime
            .validate_knowledge_context_run(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }
}
