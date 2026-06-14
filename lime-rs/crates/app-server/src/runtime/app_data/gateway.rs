use super::unavailable;
use super::NoopAppDataSource;
use super::RuntimeCoreError;
use app_server_protocol::*;
use async_trait::async_trait;
use lime_gateway::agent_runner::GatewayAgentRunnerHandle;

#[async_trait]
pub trait GatewayAppDataSource: Send + Sync {
    async fn start_gateway_channel(
        &self,
        _params: GatewayChannelStartParams,
        _agent_runner: GatewayAgentRunnerHandle,
    ) -> Result<GatewayChannelStatusResponse, RuntimeCoreError> {
        Err(unavailable("gatewayChannel/start"))
    }

    async fn stop_gateway_channel(
        &self,
        _params: GatewayChannelStopParams,
    ) -> Result<GatewayChannelStatusResponse, RuntimeCoreError> {
        Err(unavailable("gatewayChannel/stop"))
    }

    async fn read_gateway_channel_status(
        &self,
        _params: GatewayChannelStatusParams,
    ) -> Result<GatewayChannelStatusResponse, RuntimeCoreError> {
        Err(unavailable("gatewayChannel/status"))
    }

    async fn probe_gateway_tunnel(&self) -> Result<GatewayTunnelProbeResponse, RuntimeCoreError> {
        Err(unavailable("gatewayTunnel/probe"))
    }

    async fn detect_gateway_tunnel_cloudflared(
        &self,
    ) -> Result<GatewayTunnelCloudflaredDetectResponse, RuntimeCoreError> {
        Err(unavailable("gatewayTunnel/cloudflared/detect"))
    }

    async fn install_gateway_tunnel_cloudflared(
        &self,
        _params: GatewayTunnelCloudflaredInstallParams,
    ) -> Result<GatewayTunnelCloudflaredInstallResponse, RuntimeCoreError> {
        Err(unavailable("gatewayTunnel/cloudflared/install"))
    }

    async fn create_gateway_tunnel(
        &self,
        _params: GatewayTunnelCreateParams,
    ) -> Result<GatewayTunnelCreateResponse, RuntimeCoreError> {
        Err(unavailable("gatewayTunnel/create"))
    }

    async fn start_gateway_tunnel(&self) -> Result<GatewayTunnelStatusResponse, RuntimeCoreError> {
        Err(unavailable("gatewayTunnel/start"))
    }

    async fn stop_gateway_tunnel(&self) -> Result<GatewayTunnelStatusResponse, RuntimeCoreError> {
        Err(unavailable("gatewayTunnel/stop"))
    }

    async fn restart_gateway_tunnel(
        &self,
    ) -> Result<GatewayTunnelStatusResponse, RuntimeCoreError> {
        Err(unavailable("gatewayTunnel/restart"))
    }

    async fn read_gateway_tunnel_status(
        &self,
    ) -> Result<GatewayTunnelStatusResponse, RuntimeCoreError> {
        Err(unavailable("gatewayTunnel/status"))
    }

    async fn sync_gateway_tunnel_webhook_url(
        &self,
        _params: GatewayTunnelSyncWebhookUrlParams,
    ) -> Result<GatewayTunnelSyncWebhookUrlResponse, RuntimeCoreError> {
        Err(unavailable("gatewayTunnel/syncWebhookUrl"))
    }

    async fn probe_telegram_channel(
        &self,
        _params: ChannelProbeParams,
    ) -> Result<ChannelProbeResponse, RuntimeCoreError> {
        Err(unavailable("telegramChannel/probe"))
    }

    async fn probe_feishu_channel(
        &self,
        _params: ChannelProbeParams,
    ) -> Result<ChannelProbeResponse, RuntimeCoreError> {
        Err(unavailable("feishuChannel/probe"))
    }

    async fn probe_discord_channel(
        &self,
        _params: ChannelProbeParams,
    ) -> Result<ChannelProbeResponse, RuntimeCoreError> {
        Err(unavailable("discordChannel/probe"))
    }

    async fn probe_wechat_channel(
        &self,
        _params: ChannelProbeParams,
    ) -> Result<ChannelProbeResponse, RuntimeCoreError> {
        Err(unavailable("wechatChannel/probe"))
    }

    async fn start_wechat_channel_login(
        &self,
        _params: WechatLoginStartParams,
    ) -> Result<WechatLoginStartResponse, RuntimeCoreError> {
        Err(unavailable("wechatChannel/login/start"))
    }

    async fn wait_wechat_channel_login(
        &self,
        _params: WechatLoginWaitParams,
        _agent_runner: GatewayAgentRunnerHandle,
    ) -> Result<WechatLoginWaitResponse, RuntimeCoreError> {
        Err(unavailable("wechatChannel/login/wait"))
    }

    async fn list_wechat_channel_accounts(
        &self,
    ) -> Result<WechatChannelAccountListResponse, RuntimeCoreError> {
        Err(unavailable("wechatChannel/accounts/list"))
    }

    async fn remove_wechat_channel_account(
        &self,
        _params: WechatChannelAccountRemoveParams,
    ) -> Result<WechatChannelAccountRemoveResponse, RuntimeCoreError> {
        Err(unavailable("wechatChannel/account/remove"))
    }

    async fn set_wechat_channel_runtime_model(
        &self,
        _params: WechatRuntimeModelSetParams,
    ) -> Result<WechatRuntimeModelSetResponse, RuntimeCoreError> {
        Err(unavailable("wechatChannel/runtimeModel/set"))
    }
}

impl GatewayAppDataSource for NoopAppDataSource {}
