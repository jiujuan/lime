use super::{dispatch_result, parse_params, to_jsonrpc_error, RequestProcessor, RpcDispatch};
use app_server_protocol::{ConversationImportSourceScanParams, JsonRpcError};

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
}
