//! gateway domain handlers for the App Server processor.

use super::{dispatch_result, parse_params, to_jsonrpc_error, RequestProcessor, RpcDispatch};
use app_server_protocol::{
    GatewayChannelStartParams, GatewayChannelStatusParams, GatewayChannelStopParams,
    GatewayTunnelCloudflaredInstallParams, GatewayTunnelCreateParams,
    GatewayTunnelSyncWebhookUrlParams, JsonRpcError,
};

impl RequestProcessor {
    pub(super) async fn handle_gateway_channel_status_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: GatewayChannelStatusParams = parse_params(params)?;
        let response = self
            .runtime
            .read_gateway_channel_status(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_gateway_channel_start_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: GatewayChannelStartParams = parse_params(params)?;
        let runtime = self.runtime_arc();
        let response = self
            .runtime
            .start_gateway_channel(params, runtime)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_gateway_channel_stop_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: GatewayChannelStopParams = parse_params(params)?;
        let response = self
            .runtime
            .stop_gateway_channel(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_gateway_tunnel_probe_impl(
        &self,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .probe_gateway_tunnel()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_gateway_tunnel_cloudflared_detect_impl(
        &self,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .detect_gateway_tunnel_cloudflared()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_gateway_tunnel_cloudflared_install_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: GatewayTunnelCloudflaredInstallParams = parse_params(params)?;
        let response = self
            .runtime
            .install_gateway_tunnel_cloudflared(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_gateway_tunnel_create_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: GatewayTunnelCreateParams = parse_params(params)?;
        let response = self
            .runtime
            .create_gateway_tunnel(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_gateway_tunnel_start_impl(
        &self,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .start_gateway_tunnel()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_gateway_tunnel_stop_impl(
        &self,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .stop_gateway_tunnel()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_gateway_tunnel_restart_impl(
        &self,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .restart_gateway_tunnel()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_gateway_tunnel_status_impl(
        &self,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .read_gateway_tunnel_status()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_gateway_tunnel_sync_webhook_url_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: GatewayTunnelSyncWebhookUrlParams = parse_params(params)?;
        let response = self
            .runtime
            .sync_gateway_tunnel_webhook_url(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }
}
