use super::gateway_runner::RuntimeGatewayAgentRunner;
use super::{RuntimeCore, RuntimeCoreError};
use app_server_protocol::*;
use lime_gateway::agent_runner::GatewayAgentRunnerHandle;
use std::sync::Arc;

impl RuntimeCore {
    pub async fn start_gateway_channel(
        &self,
        params: GatewayChannelStartParams,
        runtime: Arc<RuntimeCore>,
    ) -> Result<GatewayChannelStatusResponse, RuntimeCoreError> {
        let runner: GatewayAgentRunnerHandle = Arc::new(RuntimeGatewayAgentRunner::new(runtime));
        self.app_data_source
            .start_gateway_channel(params, runner)
            .await
    }

    pub async fn stop_gateway_channel(
        &self,
        params: GatewayChannelStopParams,
    ) -> Result<GatewayChannelStatusResponse, RuntimeCoreError> {
        self.app_data_source.stop_gateway_channel(params).await
    }

    pub async fn read_gateway_channel_status(
        &self,
        params: GatewayChannelStatusParams,
    ) -> Result<GatewayChannelStatusResponse, RuntimeCoreError> {
        self.app_data_source
            .read_gateway_channel_status(params)
            .await
    }

    pub async fn probe_gateway_tunnel(
        &self,
    ) -> Result<GatewayTunnelProbeResponse, RuntimeCoreError> {
        self.app_data_source.probe_gateway_tunnel().await
    }

    pub async fn detect_gateway_tunnel_cloudflared(
        &self,
    ) -> Result<GatewayTunnelCloudflaredDetectResponse, RuntimeCoreError> {
        self.app_data_source
            .detect_gateway_tunnel_cloudflared()
            .await
    }

    pub async fn install_gateway_tunnel_cloudflared(
        &self,
        params: GatewayTunnelCloudflaredInstallParams,
    ) -> Result<GatewayTunnelCloudflaredInstallResponse, RuntimeCoreError> {
        self.app_data_source
            .install_gateway_tunnel_cloudflared(params)
            .await
    }

    pub async fn create_gateway_tunnel(
        &self,
        params: GatewayTunnelCreateParams,
    ) -> Result<GatewayTunnelCreateResponse, RuntimeCoreError> {
        self.app_data_source.create_gateway_tunnel(params).await
    }

    pub async fn start_gateway_tunnel(
        &self,
    ) -> Result<GatewayTunnelStatusResponse, RuntimeCoreError> {
        self.app_data_source.start_gateway_tunnel().await
    }

    pub async fn stop_gateway_tunnel(
        &self,
    ) -> Result<GatewayTunnelStatusResponse, RuntimeCoreError> {
        self.app_data_source.stop_gateway_tunnel().await
    }

    pub async fn restart_gateway_tunnel(
        &self,
    ) -> Result<GatewayTunnelStatusResponse, RuntimeCoreError> {
        self.app_data_source.restart_gateway_tunnel().await
    }

    pub async fn read_gateway_tunnel_status(
        &self,
    ) -> Result<GatewayTunnelStatusResponse, RuntimeCoreError> {
        self.app_data_source.read_gateway_tunnel_status().await
    }

    pub async fn sync_gateway_tunnel_webhook_url(
        &self,
        params: GatewayTunnelSyncWebhookUrlParams,
    ) -> Result<GatewayTunnelSyncWebhookUrlResponse, RuntimeCoreError> {
        self.app_data_source
            .sync_gateway_tunnel_webhook_url(params)
            .await
    }

    pub async fn probe_telegram_channel(
        &self,
        params: ChannelProbeParams,
    ) -> Result<ChannelProbeResponse, RuntimeCoreError> {
        self.app_data_source.probe_telegram_channel(params).await
    }

    pub async fn probe_feishu_channel(
        &self,
        params: ChannelProbeParams,
    ) -> Result<ChannelProbeResponse, RuntimeCoreError> {
        self.app_data_source.probe_feishu_channel(params).await
    }

    pub async fn probe_discord_channel(
        &self,
        params: ChannelProbeParams,
    ) -> Result<ChannelProbeResponse, RuntimeCoreError> {
        self.app_data_source.probe_discord_channel(params).await
    }

    pub async fn probe_wechat_channel(
        &self,
        params: ChannelProbeParams,
    ) -> Result<ChannelProbeResponse, RuntimeCoreError> {
        self.app_data_source.probe_wechat_channel(params).await
    }

    pub async fn start_wechat_channel_login(
        &self,
        params: WechatLoginStartParams,
    ) -> Result<WechatLoginStartResponse, RuntimeCoreError> {
        self.app_data_source
            .start_wechat_channel_login(params)
            .await
    }

    pub async fn wait_wechat_channel_login(
        &self,
        params: WechatLoginWaitParams,
        runtime: Arc<RuntimeCore>,
    ) -> Result<WechatLoginWaitResponse, RuntimeCoreError> {
        let runner: GatewayAgentRunnerHandle = Arc::new(RuntimeGatewayAgentRunner::new(runtime));
        self.app_data_source
            .wait_wechat_channel_login(params, runner)
            .await
    }

    pub async fn list_wechat_channel_accounts(
        &self,
    ) -> Result<WechatChannelAccountListResponse, RuntimeCoreError> {
        self.app_data_source.list_wechat_channel_accounts().await
    }

    pub async fn remove_wechat_channel_account(
        &self,
        params: WechatChannelAccountRemoveParams,
    ) -> Result<WechatChannelAccountRemoveResponse, RuntimeCoreError> {
        self.app_data_source
            .remove_wechat_channel_account(params)
            .await
    }

    pub async fn set_wechat_channel_runtime_model(
        &self,
        params: WechatRuntimeModelSetParams,
    ) -> Result<WechatRuntimeModelSetResponse, RuntimeCoreError> {
        self.app_data_source
            .set_wechat_channel_runtime_model(params)
            .await
    }
}
