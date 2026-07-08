//! Browser Session App Server method handlers.

use serde_json::Value;

use super::{RequestProcessor, RpcDispatch, dispatch_result, parse_params, to_jsonrpc_error};
use app_server_protocol::{
    BrowserSessionActionExecuteParams, BrowserSessionEventListParams, BrowserSessionIdParams,
    BrowserSessionOpenParams, BrowserSessionTargetListParams, JsonRpcError,
};

impl RequestProcessor {
    pub(super) async fn handle_browser_session_target_list_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: BrowserSessionTargetListParams = parse_params(params)?;
        let response = self
            .runtime
            .list_browser_session_targets(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_browser_session_open_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: BrowserSessionOpenParams = parse_params(params)?;
        let response = self
            .runtime
            .open_browser_session(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_browser_session_read_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: BrowserSessionIdParams = parse_params(params)?;
        let response = self
            .runtime
            .read_browser_session(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_browser_session_close_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: BrowserSessionIdParams = parse_params(params)?;
        let response = self
            .runtime
            .close_browser_session(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_browser_session_event_list_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: BrowserSessionEventListParams = parse_params(params)?;
        let response = self
            .runtime
            .list_browser_session_events(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_browser_session_action_execute_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: BrowserSessionActionExecuteParams = parse_params(params)?;
        let response = self
            .runtime
            .execute_browser_session_action(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::RuntimeCore;
    use app_server_protocol::{
        ClientCapabilities, ClientInfo, InitializeParams, JsonRpcMessage, JsonRpcNotification,
        JsonRpcRequest, METHOD_BROWSER_SESSION_TARGET_LIST, METHOD_INITIALIZE, METHOD_INITIALIZED,
        RequestId, error_codes,
    };
    use serde_json::json;

    async fn initialize_processor(processor: &RequestProcessor) {
        processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(1),
                METHOD_INITIALIZE,
                Some(
                    serde_json::to_value(InitializeParams {
                        client_info: ClientInfo {
                            name: "browser-session-test".to_string(),
                            title: None,
                            version: None,
                        },
                        capabilities: ClientCapabilities::default(),
                    })
                    .expect("initialize params"),
                ),
            ))
            .await
            .expect("initialize");
        processor.handle_notification(JsonRpcNotification::new(
            METHOD_INITIALIZED,
            Some(json!({})),
        ));
    }

    #[tokio::test]
    async fn browser_session_methods_require_initialized_processor() {
        let processor = RequestProcessor::new(RuntimeCore::default());

        let messages = processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(10),
                METHOD_BROWSER_SESSION_TARGET_LIST,
                Some(json!({ "remoteDebuggingPort": 9 })),
            ))
            .await
            .expect("browser target list response");

        assert!(matches!(
            &messages[0],
            JsonRpcMessage::Error(error) if error.error.code == error_codes::NOT_INITIALIZED
        ));
    }

    #[tokio::test]
    async fn browser_session_target_list_uses_current_runtime_method() {
        let processor = RequestProcessor::new(RuntimeCore::default());
        initialize_processor(&processor).await;

        let messages = processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(11),
                METHOD_BROWSER_SESSION_TARGET_LIST,
                Some(json!({ "remoteDebuggingPort": 9 })),
            ))
            .await
            .expect("browser target list response");

        assert!(matches!(
            &messages[0],
            JsonRpcMessage::Error(error)
                if error.error.code == error_codes::RUNTIME_ERROR
                    && error.error.message.contains("读取 CDP 标签页失败")
        ));
    }
}
