use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct BrowserSessionTargetListParams {
    pub remote_debugging_port: u16,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct BrowserSessionTargetInfo {
    pub id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub target_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub web_socket_debugger_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub devtools_frontend_url: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct BrowserSessionTargetListResponse {
    #[serde(default)]
    pub targets: Vec<BrowserSessionTargetInfo>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct BrowserSessionOpenParams {
    pub profile_key: String,
    pub remote_debugging_port: u16,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub launch_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub environment_preset_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub environment_preset_name: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct BrowserSessionIdParams {
    pub session_id: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct BrowserSessionEventListParams {
    pub session_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cursor: Option<u64>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct BrowserSessionActionExecuteParams {
    pub session_id: String,
    pub action: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub args: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct BrowserSessionPageInfo {
    pub title: String,
    pub url: String,
    pub markdown: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct BrowserSessionState {
    pub session_id: String,
    pub profile_key: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub environment_preset_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub environment_preset_name: Option<String>,
    pub target_id: String,
    pub target_title: String,
    pub target_url: String,
    pub remote_debugging_port: u16,
    pub ws_debugger_url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub devtools_frontend_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stream_mode: Option<String>,
    pub transport_kind: String,
    pub lifecycle_state: String,
    pub control_mode: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub human_reason: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_page_info: Option<BrowserSessionPageInfo>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_event_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_frame_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_error: Option<String>,
    pub created_at: String,
    pub connected: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct BrowserSessionOpenResponse {
    pub session: BrowserSessionState,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct BrowserSessionReadResponse {
    pub session: BrowserSessionState,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct BrowserSessionCloseResponse {
    pub status: String,
    pub session_id: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct BrowserSessionEventItem {
    pub session_id: String,
    pub sequence: u64,
    pub occurred_at: String,
    #[serde(default)]
    pub payload: serde_json::Value,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct BrowserSessionEventListResponse {
    #[serde(default)]
    pub events: Vec<BrowserSessionEventItem>,
    pub next_cursor: u64,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct BrowserSessionActionExecuteResponse {
    pub session_id: String,
    pub action: String,
    #[serde(default)]
    pub result: serde_json::Value,
}
