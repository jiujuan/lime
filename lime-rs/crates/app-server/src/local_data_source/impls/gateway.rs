use super::super::*;
use async_trait::async_trait;

#[async_trait]
impl GatewayAppDataSource for LocalAppDataSource {
    async fn start_gateway_channel(
        &self,
        params: GatewayChannelStartParams,
        agent_runner: lime_gateway::agent_runner::GatewayAgentRunnerHandle,
    ) -> Result<GatewayChannelStatusResponse, RuntimeCoreError> {
        channels::start_gateway_channel(
            channels::GatewayChannelStates {
                logs: &self.logs,
                telegram_gateway_state: &self.telegram_gateway_state,
                feishu_gateway_state: &self.feishu_gateway_state,
                discord_gateway_state: &self.discord_gateway_state,
                wechat_gateway_state: &self.wechat_gateway_state,
            },
            params,
            agent_runner,
        )
        .await
    }

    async fn stop_gateway_channel(
        &self,
        params: GatewayChannelStopParams,
    ) -> Result<GatewayChannelStatusResponse, RuntimeCoreError> {
        channels::stop_gateway_channel(
            channels::GatewayChannelStates {
                logs: &self.logs,
                telegram_gateway_state: &self.telegram_gateway_state,
                feishu_gateway_state: &self.feishu_gateway_state,
                discord_gateway_state: &self.discord_gateway_state,
                wechat_gateway_state: &self.wechat_gateway_state,
            },
            params,
        )
        .await
    }

    async fn read_gateway_channel_status(
        &self,
        params: GatewayChannelStatusParams,
    ) -> Result<GatewayChannelStatusResponse, RuntimeCoreError> {
        channels::read_gateway_channel_status(
            channels::GatewayChannelStates {
                logs: &self.logs,
                telegram_gateway_state: &self.telegram_gateway_state,
                feishu_gateway_state: &self.feishu_gateway_state,
                discord_gateway_state: &self.discord_gateway_state,
                wechat_gateway_state: &self.wechat_gateway_state,
            },
            params,
        )
        .await
    }

    async fn probe_gateway_tunnel(&self) -> Result<GatewayTunnelProbeResponse, RuntimeCoreError> {
        channels::probe_gateway_tunnel().await
    }

    async fn detect_gateway_tunnel_cloudflared(
        &self,
    ) -> Result<GatewayTunnelCloudflaredDetectResponse, RuntimeCoreError> {
        channels::detect_gateway_tunnel_cloudflared().await
    }

    async fn install_gateway_tunnel_cloudflared(
        &self,
        params: GatewayTunnelCloudflaredInstallParams,
    ) -> Result<GatewayTunnelCloudflaredInstallResponse, RuntimeCoreError> {
        channels::install_gateway_tunnel_cloudflared(params).await
    }

    async fn create_gateway_tunnel(
        &self,
        params: GatewayTunnelCreateParams,
    ) -> Result<GatewayTunnelCreateResponse, RuntimeCoreError> {
        channels::create_gateway_tunnel(&self.gateway_tunnel_state, self.logs.clone(), params).await
    }

    async fn start_gateway_tunnel(&self) -> Result<GatewayTunnelStatusResponse, RuntimeCoreError> {
        channels::start_gateway_tunnel(&self.gateway_tunnel_state, self.logs.clone()).await
    }

    async fn stop_gateway_tunnel(&self) -> Result<GatewayTunnelStatusResponse, RuntimeCoreError> {
        channels::stop_gateway_tunnel(&self.gateway_tunnel_state, self.logs.clone()).await
    }

    async fn restart_gateway_tunnel(
        &self,
    ) -> Result<GatewayTunnelStatusResponse, RuntimeCoreError> {
        channels::restart_gateway_tunnel(&self.gateway_tunnel_state, self.logs.clone()).await
    }

    async fn read_gateway_tunnel_status(
        &self,
    ) -> Result<GatewayTunnelStatusResponse, RuntimeCoreError> {
        channels::read_gateway_tunnel_status(&self.gateway_tunnel_state, self.logs.clone()).await
    }

    async fn sync_gateway_tunnel_webhook_url(
        &self,
        params: GatewayTunnelSyncWebhookUrlParams,
    ) -> Result<GatewayTunnelSyncWebhookUrlResponse, RuntimeCoreError> {
        channels::sync_gateway_tunnel_webhook_url(params).await
    }

    async fn probe_telegram_channel(
        &self,
        params: ChannelProbeParams,
    ) -> Result<ChannelProbeResponse, RuntimeCoreError> {
        channels::probe_telegram_channel(params).await
    }

    async fn probe_feishu_channel(
        &self,
        params: ChannelProbeParams,
    ) -> Result<ChannelProbeResponse, RuntimeCoreError> {
        channels::probe_feishu_channel(params).await
    }

    async fn probe_discord_channel(
        &self,
        params: ChannelProbeParams,
    ) -> Result<ChannelProbeResponse, RuntimeCoreError> {
        channels::probe_discord_channel(params).await
    }

    async fn probe_wechat_channel(
        &self,
        params: ChannelProbeParams,
    ) -> Result<ChannelProbeResponse, RuntimeCoreError> {
        channels::probe_wechat_channel(params).await
    }

    async fn start_wechat_channel_login(
        &self,
        params: WechatLoginStartParams,
    ) -> Result<WechatLoginStartResponse, RuntimeCoreError> {
        channels::start_wechat_channel_login(&self.wechat_login_state, &self.logs, params).await
    }

    async fn wait_wechat_channel_login(
        &self,
        params: WechatLoginWaitParams,
        agent_runner: lime_gateway::agent_runner::GatewayAgentRunnerHandle,
    ) -> Result<WechatLoginWaitResponse, RuntimeCoreError> {
        channels::wait_wechat_channel_login(
            channels::WechatLoginRuntime {
                logs: &self.logs,
                agent_runner,
                wechat_gateway_state: &self.wechat_gateway_state,
                wechat_login_state: &self.wechat_login_state,
            },
            params,
        )
        .await
    }

    async fn list_wechat_channel_accounts(
        &self,
    ) -> Result<WechatChannelAccountListResponse, RuntimeCoreError> {
        channels::list_wechat_channel_accounts()
    }

    async fn remove_wechat_channel_account(
        &self,
        params: WechatChannelAccountRemoveParams,
    ) -> Result<WechatChannelAccountRemoveResponse, RuntimeCoreError> {
        channels::remove_wechat_channel_account(&self.wechat_gateway_state, params).await
    }

    async fn set_wechat_channel_runtime_model(
        &self,
        params: WechatRuntimeModelSetParams,
    ) -> Result<WechatRuntimeModelSetResponse, RuntimeCoreError> {
        channels::set_wechat_channel_runtime_model(&self.logs, params).await
    }
}
