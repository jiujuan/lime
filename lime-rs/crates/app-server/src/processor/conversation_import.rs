use super::{dispatch_result, parse_params, to_jsonrpc_error, RequestProcessor, RpcDispatch};
use app_server_protocol::{
    ConversationImportJobReadParams, ConversationImportSourceScanParams,
    ConversationImportThreadCommitParams, ConversationImportThreadPreviewParams, JsonRpcError,
};

impl RequestProcessor {
    pub(super) async fn handle_conversation_import_source_scan_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ConversationImportSourceScanParams = parse_params(params)?;
        let response = self
            .runtime
            .scan_conversation_import_source(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_conversation_import_thread_preview_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ConversationImportThreadPreviewParams = parse_params(params)?;
        let response = self
            .runtime
            .preview_conversation_import_thread(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_conversation_import_thread_commit_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ConversationImportThreadCommitParams = parse_params(params)?;
        let response = self
            .runtime
            .commit_conversation_import_thread(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_conversation_import_job_read_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ConversationImportJobReadParams = parse_params(params)?;
        let response = self
            .runtime
            .read_conversation_import_job(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }
}
