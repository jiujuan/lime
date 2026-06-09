use super::data_error;
use crate::gateway_tunnel;
use crate::RuntimeCoreError;
use app_server_protocol::ChannelProbeParams;
use app_server_protocol::ChannelProbeResponse;
use app_server_protocol::GatewayChannelStartParams;
use app_server_protocol::GatewayChannelStatusParams;
use app_server_protocol::GatewayChannelStatusResponse;
use app_server_protocol::GatewayChannelStopParams;
use app_server_protocol::GatewayTunnelCloudflaredDetectResponse;
use app_server_protocol::GatewayTunnelCloudflaredInstallParams;
use app_server_protocol::GatewayTunnelCloudflaredInstallResponse;
use app_server_protocol::GatewayTunnelCreateParams;
use app_server_protocol::GatewayTunnelCreateResponse;
use app_server_protocol::GatewayTunnelProbeResponse;
use app_server_protocol::GatewayTunnelStatusResponse;
use app_server_protocol::GatewayTunnelSyncWebhookUrlParams;
use app_server_protocol::GatewayTunnelSyncWebhookUrlResponse;
use app_server_protocol::WechatChannelAccountListResponse;
use app_server_protocol::WechatChannelAccountRemoveParams;
use app_server_protocol::WechatChannelAccountRemoveResponse;
use app_server_protocol::WechatConfiguredAccount;
use app_server_protocol::WechatLoginStartParams;
use app_server_protocol::WechatLoginStartResponse;
use app_server_protocol::WechatLoginWaitParams;
use app_server_protocol::WechatLoginWaitResponse;
use app_server_protocol::WechatRuntimeModelSetParams;
use app_server_protocol::WechatRuntimeModelSetResponse;
use lime_agent::AsterAgentState;
use lime_core::config::load_config;
use lime_core::config::save_config;
use lime_core::database::DbConnection;
use lime_core::logger::LogStore;
use lime_gateway::discord;
use lime_gateway::discord::DiscordGatewayState;
use lime_gateway::feishu;
use lime_gateway::feishu::FeishuGatewayState;
use lime_gateway::telegram;
use lime_gateway::telegram::TelegramGatewayState;
use lime_gateway::tunnel::GatewayTunnelState;
use lime_gateway::wechat;
use lime_gateway::wechat::WechatGatewayState;
use lime_gateway::wechat::WechatLoginState;
use serde::Serialize;
use std::sync::Arc;
use tokio::sync::RwLock;

pub(crate) struct GatewayChannelStates<'a> {
    pub(crate) db: &'a DbConnection,
    pub(crate) logs: &'a Arc<RwLock<LogStore>>,
    pub(crate) aster_agent_state: &'a AsterAgentState,
    pub(crate) telegram_gateway_state: &'a TelegramGatewayState,
    pub(crate) feishu_gateway_state: &'a FeishuGatewayState,
    pub(crate) discord_gateway_state: &'a DiscordGatewayState,
    pub(crate) wechat_gateway_state: &'a WechatGatewayState,
}

pub(crate) struct WechatLoginRuntime<'a> {
    pub(crate) db: &'a DbConnection,
    pub(crate) logs: &'a Arc<RwLock<LogStore>>,
    pub(crate) aster_agent_state: &'a AsterAgentState,
    pub(crate) wechat_gateway_state: &'a WechatGatewayState,
    pub(crate) wechat_login_state: &'a WechatLoginState,
}

pub(crate) async fn start_gateway_channel(
    states: GatewayChannelStates<'_>,
    params: GatewayChannelStartParams,
) -> Result<GatewayChannelStatusResponse, RuntimeCoreError> {
    let channel = normalize_gateway_channel(&params.channel)?;
    let account_id = optional_trimmed(params.account_id);
    let config = load_config().map_err(data_error)?;
    states.logs.write().await.add(
        "info",
        &format!(
            "[GatewayChannel] App Server start channel={} account={}",
            channel,
            account_id.as_deref().unwrap_or("<auto>")
        ),
    );
    let status = match channel.as_str() {
        "telegram" => telegram::start_gateway(
            states.telegram_gateway_state,
            states.db.clone(),
            states.logs.clone(),
            config,
            account_id,
            params.poll_timeout_secs,
        )
        .await
        .map_err(data_error)
        .and_then(|status| serde_json::to_value(status).map_err(data_error))?,
        "feishu" => feishu::start_gateway(
            states.feishu_gateway_state,
            states.db.clone(),
            states.logs.clone(),
            config,
            account_id,
            params.poll_timeout_secs,
        )
        .await
        .map_err(data_error)
        .and_then(|status| serde_json::to_value(status).map_err(data_error))?,
        "discord" => discord::start_gateway(
            states.discord_gateway_state,
            states.db.clone(),
            states.logs.clone(),
            config,
            account_id,
            params.poll_timeout_secs,
        )
        .await
        .map_err(data_error)
        .and_then(|status| serde_json::to_value(status).map_err(data_error))?,
        "wechat" => {
            states
                .aster_agent_state
                .init_agent_with_db(states.db)
                .await
                .map_err(data_error)?;
            wechat::start_gateway(
                states.wechat_gateway_state,
                states.db.clone(),
                states.aster_agent_state.clone(),
                states.logs.clone(),
                config,
                account_id,
                params.poll_timeout_secs,
            )
            .await
            .map_err(data_error)
            .and_then(|status| serde_json::to_value(status).map_err(data_error))?
        }
        _ => unreachable!("normalize_gateway_channel restricts channel values"),
    };
    Ok(GatewayChannelStatusResponse { channel, status })
}

pub(crate) async fn stop_gateway_channel(
    states: GatewayChannelStates<'_>,
    params: GatewayChannelStopParams,
) -> Result<GatewayChannelStatusResponse, RuntimeCoreError> {
    let channel = normalize_gateway_channel(&params.channel)?;
    let account_id = optional_trimmed(params.account_id);
    let status = match channel.as_str() {
        "telegram" => telegram::stop_gateway(states.telegram_gateway_state, account_id)
            .await
            .map_err(data_error)
            .and_then(|status| serde_json::to_value(status).map_err(data_error))?,
        "feishu" => feishu::stop_gateway(states.feishu_gateway_state, account_id)
            .await
            .map_err(data_error)
            .and_then(|status| serde_json::to_value(status).map_err(data_error))?,
        "discord" => discord::stop_gateway(states.discord_gateway_state, account_id)
            .await
            .map_err(data_error)
            .and_then(|status| serde_json::to_value(status).map_err(data_error))?,
        "wechat" => wechat::stop_gateway(states.wechat_gateway_state, account_id)
            .await
            .map_err(data_error)
            .and_then(|status| serde_json::to_value(status).map_err(data_error))?,
        _ => unreachable!("normalize_gateway_channel restricts channel values"),
    };
    Ok(GatewayChannelStatusResponse { channel, status })
}

pub(crate) async fn read_gateway_channel_status(
    states: GatewayChannelStates<'_>,
    params: GatewayChannelStatusParams,
) -> Result<GatewayChannelStatusResponse, RuntimeCoreError> {
    let channel = normalize_gateway_channel(&params.channel)?;
    let status = match channel.as_str() {
        "telegram" => telegram::status_gateway(states.telegram_gateway_state)
            .await
            .map_err(data_error)
            .and_then(|status| serde_json::to_value(status).map_err(data_error))?,
        "feishu" => feishu::status_gateway(states.feishu_gateway_state)
            .await
            .map_err(data_error)
            .and_then(|status| serde_json::to_value(status).map_err(data_error))?,
        "discord" => discord::status_gateway(states.discord_gateway_state)
            .await
            .map_err(data_error)
            .and_then(|status| serde_json::to_value(status).map_err(data_error))?,
        "wechat" => wechat::status_gateway(states.wechat_gateway_state)
            .await
            .map_err(data_error)
            .and_then(|status| serde_json::to_value(status).map_err(data_error))?,
        _ => unreachable!("normalize_gateway_channel restricts channel values"),
    };
    Ok(GatewayChannelStatusResponse { channel, status })
}

pub(crate) async fn probe_gateway_tunnel() -> Result<GatewayTunnelProbeResponse, RuntimeCoreError> {
    gateway_tunnel::probe_gateway_tunnel()
        .await
        .map_err(data_error)
}

pub(crate) async fn detect_gateway_tunnel_cloudflared(
) -> Result<GatewayTunnelCloudflaredDetectResponse, RuntimeCoreError> {
    gateway_tunnel::detect_gateway_tunnel_cloudflared()
        .await
        .map_err(data_error)
}

pub(crate) async fn install_gateway_tunnel_cloudflared(
    params: GatewayTunnelCloudflaredInstallParams,
) -> Result<GatewayTunnelCloudflaredInstallResponse, RuntimeCoreError> {
    gateway_tunnel::install_gateway_tunnel_cloudflared(params)
        .await
        .map_err(data_error)
}

pub(crate) async fn create_gateway_tunnel(
    state: &GatewayTunnelState,
    logs: Arc<RwLock<LogStore>>,
    params: GatewayTunnelCreateParams,
) -> Result<GatewayTunnelCreateResponse, RuntimeCoreError> {
    gateway_tunnel::create_gateway_tunnel(state, logs, params)
        .await
        .map_err(data_error)
}

pub(crate) async fn start_gateway_tunnel(
    state: &GatewayTunnelState,
    logs: Arc<RwLock<LogStore>>,
) -> Result<GatewayTunnelStatusResponse, RuntimeCoreError> {
    gateway_tunnel::start_gateway_tunnel(state, logs)
        .await
        .map_err(data_error)
}

pub(crate) async fn stop_gateway_tunnel(
    state: &GatewayTunnelState,
    logs: Arc<RwLock<LogStore>>,
) -> Result<GatewayTunnelStatusResponse, RuntimeCoreError> {
    gateway_tunnel::stop_gateway_tunnel(state, logs)
        .await
        .map_err(data_error)
}

pub(crate) async fn restart_gateway_tunnel(
    state: &GatewayTunnelState,
    logs: Arc<RwLock<LogStore>>,
) -> Result<GatewayTunnelStatusResponse, RuntimeCoreError> {
    gateway_tunnel::restart_gateway_tunnel(state, logs)
        .await
        .map_err(data_error)
}

pub(crate) async fn read_gateway_tunnel_status(
    state: &GatewayTunnelState,
    logs: Arc<RwLock<LogStore>>,
) -> Result<GatewayTunnelStatusResponse, RuntimeCoreError> {
    gateway_tunnel::read_gateway_tunnel_status(state, logs)
        .await
        .map_err(data_error)
}

pub(crate) async fn sync_gateway_tunnel_webhook_url(
    params: GatewayTunnelSyncWebhookUrlParams,
) -> Result<GatewayTunnelSyncWebhookUrlResponse, RuntimeCoreError> {
    gateway_tunnel::sync_gateway_tunnel_webhook_url(params)
        .await
        .map_err(data_error)
}

pub(crate) async fn probe_telegram_channel(
    params: ChannelProbeParams,
) -> Result<ChannelProbeResponse, RuntimeCoreError> {
    let config = load_config().map_err(data_error)?;
    let result = telegram::probe_gateway_account(&config, optional_trimmed(params.account_id))
        .await
        .map_err(data_error)?;
    channel_probe_response_from_value(result)
}

pub(crate) async fn probe_feishu_channel(
    params: ChannelProbeParams,
) -> Result<ChannelProbeResponse, RuntimeCoreError> {
    let config = load_config().map_err(data_error)?;
    let result = feishu::probe_gateway_account(&config, optional_trimmed(params.account_id))
        .await
        .map_err(data_error)?;
    channel_probe_response_from_value(result)
}

pub(crate) async fn probe_discord_channel(
    params: ChannelProbeParams,
) -> Result<ChannelProbeResponse, RuntimeCoreError> {
    let config = load_config().map_err(data_error)?;
    let result = discord::probe_gateway_account(&config, optional_trimmed(params.account_id))
        .await
        .map_err(data_error)?;
    channel_probe_response_from_value(result)
}

pub(crate) async fn probe_wechat_channel(
    params: ChannelProbeParams,
) -> Result<ChannelProbeResponse, RuntimeCoreError> {
    let config = load_config().map_err(data_error)?;
    let result = wechat::probe_gateway_account(&config, optional_trimmed(params.account_id))
        .await
        .map_err(data_error)?;
    channel_probe_response_from_value(result)
}

pub(crate) async fn start_wechat_channel_login(
    state: &WechatLoginState,
    logs: &Arc<RwLock<LogStore>>,
    params: WechatLoginStartParams,
) -> Result<WechatLoginStartResponse, RuntimeCoreError> {
    logs.write().await.add(
        "info",
        &format!(
            "[WechatChannel] App Server login/start base_url={} bot_type={}",
            params.base_url.as_deref().unwrap_or("<default>"),
            params.bot_type.as_deref().unwrap_or("<default>")
        ),
    );
    let client = reqwest::Client::new();
    let result = wechat::start_login(
        state,
        &client,
        params.base_url.as_deref(),
        params.bot_type.as_deref(),
        params.session_key.as_deref(),
    )
    .await
    .map_err(data_error)?;
    Ok(WechatLoginStartResponse {
        session_key: result.session_key,
        qrcode_url: result.qrcode_url,
        message: result.message,
    })
}

pub(crate) async fn wait_wechat_channel_login(
    runtime: WechatLoginRuntime<'_>,
    params: WechatLoginWaitParams,
) -> Result<WechatLoginWaitResponse, RuntimeCoreError> {
    let client = reqwest::Client::new();
    let result = wechat::wait_login(
        runtime.wechat_login_state,
        &client,
        &params.session_key,
        params.base_url.as_deref(),
        params.bot_type.as_deref(),
        params.timeout_ms,
    )
    .await
    .map_err(data_error)?;

    if result.connected {
        let account_id = result
            .account_id
            .clone()
            .ok_or_else(|| data_error("登录成功但缺少 accountId"))?;
        let bot_token = result
            .bot_token
            .clone()
            .ok_or_else(|| data_error("登录成功但缺少 botToken"))?;
        let mut config = load_config().map_err(data_error)?;
        let accounts = &mut config.channels.wechat.accounts;
        let account = accounts
            .entry(account_id.clone())
            .or_insert_with(lime_core::config::WechatAccountConfig::default);
        account.enabled = true;
        account.name = params
            .account_name
            .clone()
            .filter(|value| !value.trim().is_empty());
        account.base_url = result.base_url.clone();
        account.cdn_base_url = Some(wechat::DEFAULT_CDN_BASE_URL.to_string());
        account.bot_token = Some(bot_token);
        account.scanner_user_id = result.user_id.clone();
        let default_account = config
            .channels
            .wechat
            .default_account
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty());
        if default_account.is_none()
            || default_account == Some("default")
            || !accounts.contains_key(default_account.unwrap_or_default())
        {
            config.channels.wechat.default_account = Some(account_id.clone());
        }
        if config.channels.wechat.base_url.trim().is_empty() {
            config.channels.wechat.base_url = result
                .base_url
                .clone()
                .unwrap_or_else(|| params.base_url.clone().unwrap_or_default());
        }
        if config.channels.wechat.cdn_base_url.trim().is_empty() {
            config.channels.wechat.cdn_base_url = wechat::DEFAULT_CDN_BASE_URL.to_string();
        }
        if config.channels.wechat.scanner_user_id.is_none() {
            config.channels.wechat.scanner_user_id = result.user_id.clone();
        }
        config.channels.wechat.enabled = true;
        save_config(&config).map_err(data_error)?;
        runtime
            .aster_agent_state
            .init_agent_with_db(runtime.db)
            .await
            .map_err(data_error)?;
        wechat::start_gateway(
            runtime.wechat_gateway_state,
            runtime.db.clone(),
            runtime.aster_agent_state.clone(),
            runtime.logs.clone(),
            config,
            Some(account_id),
            None,
        )
        .await
        .map_err(|error| data_error(format!("微信登录成功，但自动启动网关失败: {error}")))?;
    }

    Ok(WechatLoginWaitResponse {
        connected: result.connected,
        message: result.message,
        bot_token: result.bot_token,
        account_id: result.account_id,
        user_id: result.user_id,
        base_url: result.base_url,
    })
}

pub(crate) fn list_wechat_channel_accounts(
) -> Result<WechatChannelAccountListResponse, RuntimeCoreError> {
    Ok(WechatChannelAccountListResponse {
        accounts: list_wechat_configured_accounts_from_config()?,
    })
}

pub(crate) async fn remove_wechat_channel_account(
    state: &WechatGatewayState,
    params: WechatChannelAccountRemoveParams,
) -> Result<WechatChannelAccountRemoveResponse, RuntimeCoreError> {
    let account_id = params.account_id.trim();
    if account_id.is_empty() {
        return Err(data_error("accountId 不能为空"));
    }
    let _ = wechat::stop_gateway(state, Some(account_id.to_string())).await;
    let mut config = load_config().map_err(data_error)?;
    config.channels.wechat.accounts.remove(account_id);
    if config.channels.wechat.default_account.as_deref() == Some(account_id) {
        config.channels.wechat.default_account = None;
    }
    save_config(&config).map_err(data_error)?;
    if params.purge_data {
        wechat::purge_account_data(account_id).map_err(data_error)?;
    }
    Ok(WechatChannelAccountRemoveResponse {})
}

pub(crate) async fn set_wechat_channel_runtime_model(
    logs: &Arc<RwLock<LogStore>>,
    params: WechatRuntimeModelSetParams,
) -> Result<WechatRuntimeModelSetResponse, RuntimeCoreError> {
    let response = save_wechat_runtime_model(params)?;
    logs.write().await.add(
        "info",
        &format!(
            "[WechatChannel] App Server runtime model set stored={}",
            response.runtime_model
        ),
    );
    Ok(response)
}

fn normalize_gateway_channel(channel: &str) -> Result<String, RuntimeCoreError> {
    let normalized = channel.trim().to_ascii_lowercase();
    match normalized.as_str() {
        "telegram" | "feishu" | "discord" | "wechat" => Ok(normalized),
        _ => Err(data_error(format!(
            "暂不支持的渠道: {}（当前支持 telegram / feishu / discord / wechat）",
            channel
        ))),
    }
}

fn optional_trimmed(value: Option<String>) -> Option<String> {
    value
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn channel_probe_response_from_value(
    value: impl Serialize,
) -> Result<ChannelProbeResponse, RuntimeCoreError> {
    let mut object = match serde_json::to_value(value).map_err(data_error)? {
        serde_json::Value::Object(object) => object,
        _ => return Err(data_error("渠道探测结果不是对象")),
    };
    let account_id = object
        .remove("accountId")
        .or_else(|| object.remove("account_id"))
        .and_then(|value| value.as_str().map(str::to_string));
    let ok = object
        .remove("ok")
        .and_then(|value| value.as_bool())
        .ok_or_else(|| data_error("渠道探测结果缺少 ok"))?;
    let message = object
        .remove("message")
        .and_then(|value| value.as_str().map(str::to_string))
        .ok_or_else(|| data_error("渠道探测结果缺少 message"))?;
    Ok(ChannelProbeResponse {
        account_id,
        ok,
        message,
        extra: object,
    })
}

fn save_wechat_runtime_model(
    params: WechatRuntimeModelSetParams,
) -> Result<WechatRuntimeModelSetResponse, RuntimeCoreError> {
    let provider_id = params.provider_id.trim();
    if provider_id.is_empty() {
        return Err(data_error("providerId 不能为空"));
    }
    let model_id = params.model_id.trim();
    if model_id.is_empty() {
        return Err(data_error("modelId 不能为空"));
    }

    let runtime_model = format!("{provider_id}/{model_id}");
    let mut config = load_config().map_err(data_error)?;
    config.channels.wechat.default_model = Some(runtime_model.clone());

    let mut bound_account_id = config
        .channels
        .wechat
        .default_account
        .clone()
        .filter(|value| config.channels.wechat.accounts.contains_key(value));

    if bound_account_id.is_none() && config.channels.wechat.accounts.len() == 1 {
        bound_account_id = config.channels.wechat.accounts.keys().next().cloned();
    }

    if let Some(account_id) = bound_account_id.as_deref() {
        if let Some(account) = config.channels.wechat.accounts.get_mut(account_id) {
            account.default_model = Some(runtime_model.clone());
        }
    }

    save_config(&config).map_err(data_error)?;
    Ok(WechatRuntimeModelSetResponse { runtime_model })
}

fn list_wechat_configured_accounts_from_config(
) -> Result<Vec<WechatConfiguredAccount>, RuntimeCoreError> {
    let config = load_config().map_err(data_error)?;
    let mut accounts = config
        .channels
        .wechat
        .accounts
        .into_iter()
        .map(|(account_id, account)| WechatConfiguredAccount {
            account_id,
            enabled: account.enabled,
            name: account.name,
            base_url: account.base_url,
            cdn_base_url: account.cdn_base_url,
            has_token: account
                .bot_token
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .is_some(),
            scanner_user_id: account.scanner_user_id,
        })
        .collect::<Vec<_>>();
    accounts.sort_by(|left, right| left.account_id.cmp(&right.account_id));
    Ok(accounts)
}
