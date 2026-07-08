//! wechat domain handlers for the App Server processor.

use super::{dispatch_result, parse_params, to_jsonrpc_error, RequestProcessor, RpcDispatch};
use app_server_protocol::{
    ChannelProbeParams, JsonRpcError, WechatChannelAccountRemoveParams, WechatLoginStartParams,
    WechatLoginWaitParams, WechatRuntimeModelSetParams,
};
use serde_json::Value;

impl RequestProcessor {
    pub(super) async fn handle_wechat_channel_probe_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ChannelProbeParams = parse_params(params)?;
        let response = self
            .runtime
            .probe_wechat_channel(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_wechat_channel_login_start_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: WechatLoginStartParams = parse_params(params)?;
        let response = self
            .runtime
            .start_wechat_channel_login(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_wechat_channel_login_wait_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: WechatLoginWaitParams = parse_params(params)?;
        let runtime = self.runtime_arc();
        let response = self
            .runtime
            .wait_wechat_channel_login(params, runtime)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_wechat_channel_account_list_impl(
        &self,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .list_wechat_channel_accounts()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_wechat_channel_account_remove_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: WechatChannelAccountRemoveParams = parse_params(params)?;
        let response = self
            .runtime
            .remove_wechat_channel_account(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_wechat_channel_runtime_model_set_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: WechatRuntimeModelSetParams = parse_params(params)?;
        let response = self
            .runtime
            .set_wechat_channel_runtime_model(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }
}
