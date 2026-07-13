use super::{dispatch_result, parse_params, to_jsonrpc_error, RequestProcessor, RpcDispatch};
use app_server_protocol::{
    JsonRpcError, ThreadItemsListParams, ThreadListParams, ThreadReadParams, ThreadTurnsListParams,
};

impl RequestProcessor {
    pub(super) async fn handle_thread_read_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ThreadReadParams = parse_params(params)?;
        dispatch_result(
            self.runtime
                .read_thread(params)
                .await
                .map_err(to_jsonrpc_error)?,
        )
    }

    pub(super) async fn handle_thread_list_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ThreadListParams = parse_params(params)?;
        dispatch_result(
            self.runtime
                .list_threads(params)
                .await
                .map_err(to_jsonrpc_error)?,
        )
    }

    pub(super) async fn handle_thread_turns_list_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ThreadTurnsListParams = parse_params(params)?;
        dispatch_result(
            self.runtime
                .list_thread_turns(params)
                .await
                .map_err(to_jsonrpc_error)?,
        )
    }

    pub(super) async fn handle_thread_items_list_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ThreadItemsListParams = parse_params(params)?;
        dispatch_result(
            self.runtime
                .list_thread_items(params)
                .await
                .map_err(to_jsonrpc_error)?,
        )
    }
}
