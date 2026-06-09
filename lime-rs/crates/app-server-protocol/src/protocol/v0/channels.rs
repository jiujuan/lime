use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GatewayChannelStartParams {
    pub channel: String,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "account_id")]
    pub account_id: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "poll_timeout_secs"
    )]
    pub poll_timeout_secs: Option<u64>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GatewayChannelStopParams {
    pub channel: String,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "account_id")]
    pub account_id: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GatewayChannelStatusParams {
    pub channel: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GatewayChannelStatusResponse {
    pub channel: String,
    pub status: serde_json::Value,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ChannelProbeParams {
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "account_id")]
    pub account_id: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ChannelProbeResponse {
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "account_id")]
    pub account_id: Option<String>,
    pub ok: bool,
    pub message: String,
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WechatLoginStartParams {
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "base_url")]
    pub base_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "bot_type")]
    pub bot_type: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "session_key"
    )]
    pub session_key: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WechatLoginStartResponse {
    #[serde(alias = "session_key")]
    pub session_key: String,
    #[serde(alias = "qrcode_url")]
    pub qrcode_url: String,
    pub message: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WechatLoginWaitParams {
    #[serde(alias = "session_key")]
    pub session_key: String,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "base_url")]
    pub base_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "bot_type")]
    pub bot_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "timeout_ms")]
    pub timeout_ms: Option<u64>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "account_name"
    )]
    pub account_name: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WechatLoginWaitResponse {
    pub connected: bool,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "bot_token")]
    pub bot_token: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "account_id")]
    pub account_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "user_id")]
    pub user_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "base_url")]
    pub base_url: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WechatConfiguredAccount {
    pub account_id: String,
    pub enabled: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cdn_base_url: Option<String>,
    pub has_token: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scanner_user_id: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WechatChannelAccountListResponse {
    #[serde(default)]
    pub accounts: Vec<WechatConfiguredAccount>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WechatChannelAccountRemoveParams {
    #[serde(alias = "account_id")]
    pub account_id: String,
    #[serde(default, alias = "purge_data")]
    pub purge_data: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WechatChannelAccountRemoveResponse {}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WechatRuntimeModelSetParams {
    #[serde(alias = "provider_id")]
    pub provider_id: String,
    #[serde(alias = "model_id")]
    pub model_id: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WechatRuntimeModelSetResponse {
    pub runtime_model: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GatewayTunnelCreateParams {
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "tunnel_name"
    )]
    pub tunnel_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "dns_name")]
    pub dns_name: Option<String>,
    #[serde(default = "default_true")]
    pub persist: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GatewayTunnelCreateResult {
    pub ok: bool,
    pub tunnel_name: String,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "tunnel_id")]
    pub tunnel_id: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "credentials_file"
    )]
    pub credentials_file: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "dns_name")]
    pub dns_name: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "public_base_url"
    )]
    pub public_base_url: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GatewayTunnelStatusResponse {
    pub running: bool,
    pub provider: String,
    pub mode: String,
    pub binary: String,
    pub local_url: String,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "public_base_url"
    )]
    pub public_base_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pid: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "started_at")]
    pub started_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "last_error")]
    pub last_error: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "last_exit")]
    pub last_exit: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "command_preview"
    )]
    pub command_preview: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "connector_active"
    )]
    pub connector_active: Option<bool>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "connector_message"
    )]
    pub connector_message: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GatewayTunnelProbeResponse {
    pub ok: bool,
    pub provider: String,
    pub mode: String,
    pub binary: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(alias = "config_ready")]
    pub config_ready: bool,
    pub message: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GatewayTunnelCloudflaredDetectResponse {
    pub installed: bool,
    pub binary: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    pub platform: String,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "package_manager"
    )]
    pub package_manager: Option<String>,
    #[serde(alias = "install_supported")]
    pub install_supported: bool,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "install_command"
    )]
    pub install_command: Option<String>,
    #[serde(alias = "requires_privilege")]
    pub requires_privilege: bool,
    pub message: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GatewayTunnelCloudflaredInstallParams {
    #[serde(default)]
    pub confirm: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GatewayTunnelCloudflaredInstallResponse {
    pub ok: bool,
    pub attempted: bool,
    pub platform: String,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "package_manager"
    )]
    pub package_manager: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "exit_code")]
    pub exit_code: Option<i32>,
    pub installed: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    pub stdout: String,
    pub stderr: String,
    pub message: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GatewayTunnelCreateResponse {
    pub result: GatewayTunnelCreateResult,
    pub status: GatewayTunnelStatusResponse,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GatewayTunnelSyncWebhookUrlParams {
    pub channel: String,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "account_id")]
    pub account_id: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "webhook_path"
    )]
    pub webhook_path: Option<String>,
    #[serde(default = "default_true")]
    pub persist: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GatewayTunnelSyncWebhookUrlResponse {
    pub channel: String,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "account_id")]
    pub account_id: Option<String>,
    #[serde(alias = "webhook_path")]
    pub webhook_path: String,
    #[serde(alias = "public_base_url")]
    pub public_base_url: String,
    #[serde(alias = "webhook_url")]
    pub webhook_url: String,
    pub persisted: bool,
}

const fn default_true() -> bool {
    true
}
