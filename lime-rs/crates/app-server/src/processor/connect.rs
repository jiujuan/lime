//! connect handlers for the App Server processor.

use super::{RequestProcessor, RpcDispatch, dispatch_result, parse_params, to_jsonrpc_error};
use app_server_protocol::{
    ConnectCallbackSendParams, ConnectDeepLinkResolveParams, ConnectOpenDeepLinkResolveParams,
    ConnectRelayApiKeySaveParams, JsonRpcError,
};
use serde_json::Value;

impl RequestProcessor {
    pub(super) async fn handle_connect_deep_link_resolve_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ConnectDeepLinkResolveParams = parse_params(params)?;
        let response = self
            .runtime
            .resolve_connect_deep_link(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_connect_open_deep_link_resolve_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ConnectOpenDeepLinkResolveParams = parse_params(params)?;
        let response = self
            .runtime
            .resolve_connect_open_deep_link(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_connect_relay_api_key_save_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ConnectRelayApiKeySaveParams = parse_params(params)?;
        let response = self
            .runtime
            .save_connect_relay_api_key(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_connect_callback_send_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ConnectCallbackSendParams = parse_params(params)?;
        let response = self
            .runtime
            .deliver_connect_callback(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }
}
