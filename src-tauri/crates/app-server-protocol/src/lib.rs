use serde::{Deserialize, Serialize};
use std::fmt;

mod schema_fixtures;

pub use schema_fixtures::generated_fixture_tree;
pub use schema_fixtures::normalize_fixture_bytes;
pub use schema_fixtures::protocol_fixture_manifest;
pub use schema_fixtures::read_fixture_tree;
pub use schema_fixtures::write_fixture_tree;

pub const JSONRPC_VERSION: &str = "2.0";
pub const PROTOCOL_VERSION: &str = "appserver.v0";
pub const SERVER_NAME: &str = "app-server";

pub const METHOD_INITIALIZE: &str = "initialize";
pub const METHOD_INITIALIZED: &str = "initialized";
pub const METHOD_CAPABILITY_LIST: &str = "capability/list";
pub const METHOD_ARTIFACT_READ: &str = "artifact/read";
pub const METHOD_EVIDENCE_EXPORT: &str = "evidence/export";
pub const METHOD_AGENT_SESSION_START: &str = "agentSession/start";
pub const METHOD_AGENT_SESSION_READ: &str = "agentSession/read";
pub const METHOD_AGENT_SESSION_TURN_START: &str = "agentSession/turn/start";
pub const METHOD_AGENT_SESSION_TURN_CANCEL: &str = "agentSession/turn/cancel";
pub const METHOD_AGENT_SESSION_ACTION_RESPOND: &str = "agentSession/action/respond";
pub const METHOD_AGENT_SESSION_EVENT: &str = "agentSession/event";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum AppServerMethodKind {
    Request,
    Notification,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppServerMethodSpec {
    pub method: &'static str,
    pub kind: AppServerMethodKind,
}

pub const APP_SERVER_METHODS: &[AppServerMethodSpec] = &[
    AppServerMethodSpec {
        method: METHOD_INITIALIZE,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_INITIALIZED,
        kind: AppServerMethodKind::Notification,
    },
    AppServerMethodSpec {
        method: METHOD_CAPABILITY_LIST,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_ARTIFACT_READ,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_EVIDENCE_EXPORT,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AGENT_SESSION_START,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AGENT_SESSION_READ,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AGENT_SESSION_TURN_START,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AGENT_SESSION_TURN_CANCEL,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AGENT_SESSION_ACTION_RESPOND,
        kind: AppServerMethodKind::Request,
    },
    AppServerMethodSpec {
        method: METHOD_AGENT_SESSION_EVENT,
        kind: AppServerMethodKind::Notification,
    },
];

pub fn is_app_server_request_method(method: &str) -> bool {
    APP_SERVER_METHODS
        .iter()
        .any(|spec| spec.kind == AppServerMethodKind::Request && spec.method == method)
}

pub fn is_app_server_notification_method(method: &str) -> bool {
    APP_SERVER_METHODS
        .iter()
        .any(|spec| spec.kind == AppServerMethodKind::Notification && spec.method == method)
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(untagged)]
pub enum RequestId {
    Integer(i64),
    String(String),
}

impl fmt::Display for RequestId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Integer(value) => write!(f, "{value}"),
            Self::String(value) => f.write_str(value),
        }
    }
}

pub type RpcResult = serde_json::Value;

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(untagged)]
pub enum JsonRpcMessage {
    Request(JsonRpcRequest),
    Notification(JsonRpcNotification),
    Response(JsonRpcResponse),
    Error(JsonRpcErrorResponse),
}

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JsonRpcRequest {
    pub id: RequestId,
    pub method: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub params: Option<serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JsonRpcNotification {
    pub method: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub params: Option<serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JsonRpcResponse {
    pub id: RequestId,
    pub result: RpcResult,
}

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JsonRpcErrorResponse {
    pub id: RequestId,
    pub error: JsonRpcError,
}

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JsonRpcError {
    pub code: i64,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

pub mod error_codes {
    pub const PARSE_ERROR: i64 = -32700;
    pub const INVALID_REQUEST: i64 = -32600;
    pub const METHOD_NOT_FOUND: i64 = -32601;
    pub const INVALID_PARAMS: i64 = -32602;
    pub const RUNTIME_ERROR: i64 = -32000;
    pub const NOT_INITIALIZED: i64 = -32002;
    pub const ALREADY_INITIALIZED: i64 = -32003;
    pub const SESSION_NOT_FOUND: i64 = -32010;
    pub const TURN_NOT_ACTIVE: i64 = -32011;
    pub const SESSION_ALREADY_EXISTS: i64 = -32013;
    pub const CAPABILITY_DENIED: i64 = -32020;
}

impl JsonRpcRequest {
    pub fn new(
        id: RequestId,
        method: impl Into<String>,
        params: Option<serde_json::Value>,
    ) -> Self {
        Self {
            id,
            method: method.into(),
            params,
        }
    }
}

impl JsonRpcNotification {
    pub fn new(method: impl Into<String>, params: Option<serde_json::Value>) -> Self {
        Self {
            method: method.into(),
            params,
        }
    }
}

impl JsonRpcResponse {
    pub fn new(id: RequestId, result: impl Serialize) -> Result<Self, serde_json::Error> {
        Ok(Self {
            id,
            result: serde_json::to_value(result)?,
        })
    }
}

impl JsonRpcError {
    pub fn new(code: i64, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            data: None,
        }
    }

    pub fn with_data(
        code: i64,
        message: impl Into<String>,
        data: impl Serialize,
    ) -> Result<Self, serde_json::Error> {
        Ok(Self {
            code,
            message: message.into(),
            data: Some(serde_json::to_value(data)?),
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientInfo {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientCapabilities {
    #[serde(default)]
    pub event_methods: Vec<String>,
    #[serde(default)]
    pub experimental: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InitializeParams {
    pub client_info: ClientInfo,
    #[serde(default)]
    pub capabilities: ClientCapabilities,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InitializeResponse {
    pub server_info: ServerInfo,
    pub platform: PlatformInfo,
    pub capabilities: ServerCapabilities,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerInfo {
    pub name: String,
    pub version: String,
    pub protocol_version: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformInfo {
    pub family: String,
    pub os: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerCapabilities {
    pub agent_session: bool,
    pub capability_discovery: bool,
    pub artifact: bool,
    pub evidence: bool,
    pub workspace: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityListParams {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub app_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityListResponse {
    #[serde(default)]
    pub capabilities: Vec<CapabilityDescriptor>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityDescriptor {
    pub id: String,
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default)]
    pub methods: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactReadParams {
    pub session_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artifact_ref: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub include_content: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ArtifactContentStatus {
    #[default]
    NotRequested,
    Available,
    Unavailable,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactSummary {
    pub artifact_ref: String,
    pub event_id: String,
    pub sequence: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artifact_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(default)]
    pub content_status: ArtifactContentStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactReadResponse {
    #[serde(default)]
    pub artifacts: Vec<ArtifactSummary>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceExportParams {
    pub session_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub include_events: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub include_artifacts: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub include_evidence_pack: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceExportResponse {
    pub session: AgentSession,
    #[serde(default)]
    pub turns: Vec<AgentTurn>,
    #[serde(default)]
    pub events: Vec<AgentEvent>,
    #[serde(default)]
    pub artifacts: Vec<ArtifactSummary>,
    pub exported_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub evidence_pack: Option<EvidencePackSummary>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EvidencePackSummary {
    pub pack_relative_root: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pack_absolute_root: Option<String>,
    pub exported_at: String,
    pub thread_status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub latest_turn_status: Option<String>,
    pub turn_count: usize,
    pub item_count: usize,
    pub pending_request_count: usize,
    pub queued_turn_count: usize,
    pub recent_artifact_count: usize,
    #[serde(default)]
    pub known_gaps: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub observability_summary: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub completion_audit_summary: Option<serde_json::Value>,
    #[serde(default)]
    pub artifacts: Vec<EvidencePackArtifact>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EvidencePackArtifact {
    pub kind: String,
    pub title: String,
    pub relative_path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub absolute_path: Option<String>,
    pub bytes: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionStartParams {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thread_id: Option<String>,
    pub app_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub business_object_ref: Option<BusinessObjectRef>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub locale: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionStartResponse {
    pub session: AgentSession,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionReadParams {
    pub session_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionReadResponse {
    pub session: AgentSession,
    #[serde(default)]
    pub turns: Vec<AgentTurn>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionTurnStartParams {
    pub session_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
    pub input: AgentInput,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub runtime_options: Option<RuntimeOptions>,
    #[serde(default)]
    pub queue_if_busy: bool,
    #[serde(default)]
    pub skip_pre_submit_resume: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionTurnStartResponse {
    pub turn: AgentTurn,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionTurnCancelParams {
    pub session_id: String,
    pub turn_id: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionTurnCancelResponse {}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentSessionActionType {
    ToolConfirmation,
    AskUser,
    Elicitation,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionActionScope {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thread_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionActionRespondParams {
    pub session_id: String,
    pub request_id: String,
    pub action_type: AgentSessionActionType,
    pub confirmed: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub response: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user_data: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub event_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub action_scope: Option<AgentSessionActionScope>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionActionRespondResponse {}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionEventParams {
    pub event: AgentEvent,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BusinessObjectRef {
    pub kind: String,
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AgentSessionStatus {
    Idle,
    Running,
    WaitingAction,
    Completed,
    Failed,
    Canceled,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSession {
    pub session_id: String,
    pub thread_id: String,
    pub app_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub business_object_ref: Option<BusinessObjectRef>,
    pub status: AgentSessionStatus,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AgentTurnStatus {
    Accepted,
    Queued,
    Running,
    WaitingAction,
    Completed,
    Failed,
    Canceled,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentTurn {
    pub turn_id: String,
    pub session_id: String,
    pub thread_id: String,
    pub status: AgentTurnStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub started_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentInput {
    pub text: String,
    #[serde(default)]
    pub attachments: Vec<AgentAttachment>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAttachment {
    pub kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeOptions {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub capability_id: Option<String>,
    #[serde(default)]
    pub stream: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub event_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider_preference: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model_preference: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub queued_turn_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub host_options: Option<serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentEvent {
    pub event_id: String,
    pub sequence: u64,
    pub session_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thread_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
    #[serde(rename = "type")]
    pub event_type: String,
    pub timestamp: String,
    pub payload: serde_json::Value,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn initialize_request_matches_protocol_fixture_shape() {
        let value = serde_json::to_value(JsonRpcRequest::new(
            RequestId::Integer(1),
            METHOD_INITIALIZE,
            Some(
                serde_json::to_value(InitializeParams {
                    client_info: ClientInfo {
                        name: "desktop-client".to_string(),
                        title: Some("Desktop Client".to_string()),
                        version: Some("1.58.0".to_string()),
                    },
                    capabilities: ClientCapabilities {
                        event_methods: vec![METHOD_AGENT_SESSION_EVENT.to_string()],
                        experimental: false,
                    },
                })
                .expect("serialize params"),
            ),
        ))
        .expect("serialize request");

        assert_eq!(
            value,
            json!({
                "id": 1,
                "method": "initialize",
                "params": {
                    "clientInfo": {
                        "name": "desktop-client",
                        "title": "Desktop Client",
                        "version": "1.58.0"
                    },
                    "capabilities": {
                        "eventMethods": ["agentSession/event"],
                        "experimental": false
                    }
                }
            })
        );
    }

    #[test]
    fn initialize_response_matches_protocol_fixture_shape() {
        let value = serde_json::to_value(
            JsonRpcResponse::new(
                RequestId::Integer(1),
                InitializeResponse {
                    server_info: ServerInfo {
                        name: SERVER_NAME.to_string(),
                        version: "1.58.0".to_string(),
                        protocol_version: PROTOCOL_VERSION.to_string(),
                    },
                    platform: PlatformInfo {
                        family: "desktop".to_string(),
                        os: "macos".to_string(),
                    },
                    capabilities: ServerCapabilities {
                        agent_session: true,
                        capability_discovery: true,
                        artifact: true,
                        evidence: true,
                        workspace: true,
                    },
                },
            )
            .expect("create response"),
        )
        .expect("serialize response");

        assert_eq!(
            value,
            json!({
                "id": 1,
                "result": {
                    "serverInfo": {
                        "name": "app-server",
                        "version": "1.58.0",
                        "protocolVersion": "appserver.v0"
                    },
                    "platform": {
                        "family": "desktop",
                        "os": "macos"
                    },
                    "capabilities": {
                        "agentSession": true,
                        "capabilityDiscovery": true,
                        "artifact": true,
                        "evidence": true,
                        "workspace": true
                    }
                }
            })
        );
    }

    #[test]
    fn capability_list_request_matches_protocol_fixture_shape() {
        let value = serde_json::to_value(JsonRpcRequest::new(
            RequestId::Integer(2),
            METHOD_CAPABILITY_LIST,
            Some(
                serde_json::to_value(CapabilityListParams {
                    app_id: Some("content-studio".to_string()),
                    workspace_id: Some("workspace-main".to_string()),
                    session_id: Some("sess_1".to_string()),
                    cursor: Some("2".to_string()),
                    limit: Some(25),
                })
                .expect("serialize params"),
            ),
        ))
        .expect("serialize request");

        assert_eq!(
            value,
            json!({
                "id": 2,
                "method": "capability/list",
                "params": {
                    "appId": "content-studio",
                    "workspaceId": "workspace-main",
                    "sessionId": "sess_1",
                    "cursor": "2",
                    "limit": 25
                }
            })
        );
    }

    #[test]
    fn agent_session_start_request_matches_protocol_fixture_shape() {
        let value = serde_json::to_value(JsonRpcRequest::new(
            RequestId::String("req-start".to_string()),
            METHOD_AGENT_SESSION_START,
            Some(
                serde_json::to_value(AgentSessionStartParams {
                    session_id: Some("sess_1".to_string()),
                    thread_id: Some("thread_1".to_string()),
                    app_id: "writer".to_string(),
                    workspace_id: Some("workspace_1".to_string()),
                    business_object_ref: Some(BusinessObjectRef {
                        kind: "document".to_string(),
                        id: "doc_1".to_string(),
                        title: Some("Draft".to_string()),
                        uri: Some("file:///draft.md".to_string()),
                        metadata: Some(json!({ "source": "fixture" })),
                    }),
                    locale: Some("zh-CN".to_string()),
                })
                .expect("serialize params"),
            ),
        ))
        .expect("serialize request");

        assert_eq!(
            value,
            json!({
                "id": "req-start",
                "method": "agentSession/start",
                "params": {
                    "sessionId": "sess_1",
                    "threadId": "thread_1",
                    "appId": "writer",
                    "workspaceId": "workspace_1",
                    "businessObjectRef": {
                        "kind": "document",
                        "id": "doc_1",
                        "title": "Draft",
                        "uri": "file:///draft.md",
                        "metadata": {
                            "source": "fixture"
                        }
                    },
                    "locale": "zh-CN"
                }
            })
        );
    }

    #[test]
    fn artifact_read_request_matches_protocol_fixture_shape() {
        let value = serde_json::to_value(JsonRpcRequest::new(
            RequestId::Integer(6),
            METHOD_ARTIFACT_READ,
            Some(
                serde_json::to_value(ArtifactReadParams {
                    session_id: "sess_1".to_string(),
                    turn_id: Some("turn_1".to_string()),
                    artifact_ref: Some("artifact-document:req-1".to_string()),
                    include_content: Some(true),
                    cursor: Some("2".to_string()),
                    limit: Some(10),
                })
                .expect("serialize params"),
            ),
        ))
        .expect("serialize request");

        assert_eq!(
            value,
            json!({
                "id": 6,
                "method": "artifact/read",
                "params": {
                    "sessionId": "sess_1",
                    "turnId": "turn_1",
                    "artifactRef": "artifact-document:req-1",
                    "includeContent": true,
                    "cursor": "2",
                    "limit": 10
                }
            })
        );
    }

    #[test]
    fn artifact_summary_content_status_matches_protocol_fixture_shape() {
        let value = serde_json::to_value(ArtifactSummary {
            artifact_ref: "artifact-document:req-1".to_string(),
            event_id: "evt-artifact-1".to_string(),
            sequence: 7,
            turn_id: Some("turn_1".to_string()),
            artifact_id: Some("req-1".to_string()),
            path: Some(".lime/artifacts/report.md".to_string()),
            title: Some("Report".to_string()),
            kind: Some("document".to_string()),
            status: Some("ready".to_string()),
            content: Some("# Report".to_string()),
            content_status: ArtifactContentStatus::Available,
            metadata: Some(json!({ "version": 2 })),
        })
        .expect("serialize artifact summary");

        assert_eq!(
            value,
            json!({
                "artifactRef": "artifact-document:req-1",
                "eventId": "evt-artifact-1",
                "sequence": 7,
                "turnId": "turn_1",
                "artifactId": "req-1",
                "path": ".lime/artifacts/report.md",
                "title": "Report",
                "kind": "document",
                "status": "ready",
                "content": "# Report",
                "contentStatus": "available",
                "metadata": {
                    "version": 2
                }
            })
        );
    }

    #[test]
    fn evidence_export_request_matches_protocol_fixture_shape() {
        let value = serde_json::to_value(JsonRpcRequest::new(
            RequestId::Integer(7),
            METHOD_EVIDENCE_EXPORT,
            Some(
                serde_json::to_value(EvidenceExportParams {
                    session_id: "sess_1".to_string(),
                    turn_id: Some("turn_1".to_string()),
                    include_events: Some(true),
                    include_artifacts: Some(true),
                    include_evidence_pack: Some(true),
                })
                .expect("serialize params"),
            ),
        ))
        .expect("serialize request");

        assert_eq!(
            value,
            json!({
                "id": 7,
                "method": "evidence/export",
                "params": {
                    "sessionId": "sess_1",
                    "turnId": "turn_1",
                    "includeEvents": true,
                    "includeArtifacts": true,
                    "includeEvidencePack": true
                }
            })
        );
    }

    #[test]
    fn evidence_export_response_matches_protocol_fixture_shape() {
        let value = serde_json::to_value(EvidenceExportResponse {
            session: AgentSession {
                session_id: "sess_1".to_string(),
                thread_id: "thread_1".to_string(),
                app_id: "content-studio".to_string(),
                workspace_id: Some("workspace-main".to_string()),
                business_object_ref: None,
                status: AgentSessionStatus::Running,
                created_at: "2026-06-05T00:00:00.000Z".to_string(),
                updated_at: "2026-06-05T00:00:01.000Z".to_string(),
            },
            turns: vec![AgentTurn {
                turn_id: "turn_1".to_string(),
                session_id: "sess_1".to_string(),
                thread_id: "thread_1".to_string(),
                status: AgentTurnStatus::Accepted,
                started_at: Some("2026-06-05T00:00:01.000Z".to_string()),
                completed_at: None,
            }],
            events: vec![AgentEvent {
                event_id: "evt_1".to_string(),
                sequence: 1,
                session_id: "sess_1".to_string(),
                thread_id: Some("thread_1".to_string()),
                turn_id: Some("turn_1".to_string()),
                event_type: "artifact.snapshot".to_string(),
                timestamp: "2026-06-05T00:00:01.000Z".to_string(),
                payload: json!({
                    "artifactId": "artifact-report",
                    "path": ".app-server/artifacts/report.md"
                }),
            }],
            artifacts: vec![ArtifactSummary {
                artifact_ref: "artifact-report".to_string(),
                event_id: "evt_1".to_string(),
                sequence: 1,
                turn_id: Some("turn_1".to_string()),
                artifact_id: Some("artifact-report".to_string()),
                path: Some(".app-server/artifacts/report.md".to_string()),
                title: None,
                kind: None,
                status: None,
                content: None,
                content_status: ArtifactContentStatus::NotRequested,
                metadata: None,
            }],
            exported_at: "2026-06-05T00:00:02.000Z".to_string(),
            evidence_pack: Some(EvidencePackSummary {
                pack_relative_root: ".lime/harness/sessions/sess_1/evidence".to_string(),
                pack_absolute_root: Some(
                    "/workspace/.lime/harness/sessions/sess_1/evidence".to_string(),
                ),
                exported_at: "2026-06-05T00:00:03.000Z".to_string(),
                thread_status: "running".to_string(),
                latest_turn_status: Some("accepted".to_string()),
                turn_count: 1,
                item_count: 3,
                pending_request_count: 0,
                queued_turn_count: 0,
                recent_artifact_count: 1,
                known_gaps: vec!["gui_smoke_not_run".to_string()],
                observability_summary: Some(json!({
                    "schema_version": "runtime-evidence-pack.v1"
                })),
                completion_audit_summary: Some(json!({
                    "decision": "in_progress"
                })),
                artifacts: vec![EvidencePackArtifact {
                    kind: "summary".to_string(),
                    title: "Evidence Summary".to_string(),
                    relative_path: ".lime/harness/sessions/sess_1/evidence/summary.md".to_string(),
                    absolute_path: None,
                    bytes: 128,
                }],
            }),
        })
        .expect("serialize evidence export response");

        assert_eq!(
            value,
            json!({
                "session": {
                    "sessionId": "sess_1",
                    "threadId": "thread_1",
                    "appId": "content-studio",
                    "workspaceId": "workspace-main",
                    "status": "running",
                    "createdAt": "2026-06-05T00:00:00.000Z",
                    "updatedAt": "2026-06-05T00:00:01.000Z"
                },
                "turns": [{
                    "turnId": "turn_1",
                    "sessionId": "sess_1",
                    "threadId": "thread_1",
                    "status": "accepted",
                    "startedAt": "2026-06-05T00:00:01.000Z"
                }],
                "events": [{
                    "eventId": "evt_1",
                    "sequence": 1,
                    "sessionId": "sess_1",
                    "threadId": "thread_1",
                    "turnId": "turn_1",
                    "type": "artifact.snapshot",
                    "timestamp": "2026-06-05T00:00:01.000Z",
                    "payload": {
                        "artifactId": "artifact-report",
                        "path": ".app-server/artifacts/report.md"
                    }
                }],
                "artifacts": [{
                    "artifactRef": "artifact-report",
                    "eventId": "evt_1",
                    "sequence": 1,
                    "turnId": "turn_1",
                    "artifactId": "artifact-report",
                    "path": ".app-server/artifacts/report.md",
                    "contentStatus": "notRequested"
                }],
                "exportedAt": "2026-06-05T00:00:02.000Z",
                "evidencePack": {
                    "packRelativeRoot": ".lime/harness/sessions/sess_1/evidence",
                    "packAbsoluteRoot": "/workspace/.lime/harness/sessions/sess_1/evidence",
                    "exportedAt": "2026-06-05T00:00:03.000Z",
                    "threadStatus": "running",
                    "latestTurnStatus": "accepted",
                    "turnCount": 1,
                    "itemCount": 3,
                    "pendingRequestCount": 0,
                    "queuedTurnCount": 0,
                    "recentArtifactCount": 1,
                    "knownGaps": ["gui_smoke_not_run"],
                    "observabilitySummary": {
                        "schema_version": "runtime-evidence-pack.v1"
                    },
                    "completionAuditSummary": {
                        "decision": "in_progress"
                    },
                    "artifacts": [{
                        "kind": "summary",
                        "title": "Evidence Summary",
                        "relativePath": ".lime/harness/sessions/sess_1/evidence/summary.md",
                        "bytes": 128
                    }]
                }
            })
        );
    }

    #[test]
    fn agent_session_turn_start_request_matches_protocol_fixture_shape() {
        let value = serde_json::to_value(JsonRpcRequest::new(
            RequestId::Integer(2),
            METHOD_AGENT_SESSION_TURN_START,
            Some(
                serde_json::to_value(AgentSessionTurnStartParams {
                    session_id: "sess_1".to_string(),
                    turn_id: Some("turn_1".to_string()),
                    input: AgentInput {
                        text: "hello".to_string(),
                        attachments: vec![AgentAttachment {
                            kind: "file".to_string(),
                            uri: Some("file:///draft.md".to_string()),
                            metadata: Some(json!({ "mimeType": "text/markdown" })),
                        }],
                    },
                    runtime_options: Some(RuntimeOptions {
                        capability_id: Some("draft.write".to_string()),
                        stream: true,
                        event_name: Some("agent_app_runtime:app:task".to_string()),
                        provider_preference: Some("deepseek".to_string()),
                        model_preference: Some("deepseek-v4-flash".to_string()),
                        metadata: Some(json!({ "taskId": "task-1" })),
                        queued_turn_id: Some("queued-turn-1".to_string()),
                        host_options: Some(json!({ "adapter": "desktop" })),
                    }),
                    queue_if_busy: true,
                    skip_pre_submit_resume: true,
                })
                .expect("serialize params"),
            ),
        ))
        .expect("serialize request");

        assert_eq!(
            value,
            json!({
                "id": 2,
                "method": "agentSession/turn/start",
                "params": {
                    "sessionId": "sess_1",
                    "turnId": "turn_1",
                    "input": {
                        "text": "hello",
                        "attachments": [{
                            "kind": "file",
                            "uri": "file:///draft.md",
                            "metadata": {
                                "mimeType": "text/markdown"
                            }
                        }]
                    },
                    "runtimeOptions": {
                        "capabilityId": "draft.write",
                        "stream": true,
                        "eventName": "agent_app_runtime:app:task",
                        "providerPreference": "deepseek",
                        "modelPreference": "deepseek-v4-flash",
                        "metadata": {
                            "taskId": "task-1"
                        },
                        "queuedTurnId": "queued-turn-1",
                        "hostOptions": {
                            "adapter": "desktop"
                        }
                    },
                    "queueIfBusy": true,
                    "skipPreSubmitResume": true
                }
            })
        );
    }

    #[test]
    fn agent_session_turn_cancel_request_matches_protocol_fixture_shape() {
        let value = serde_json::to_value(JsonRpcRequest::new(
            RequestId::Integer(3),
            METHOD_AGENT_SESSION_TURN_CANCEL,
            Some(
                serde_json::to_value(AgentSessionTurnCancelParams {
                    session_id: "sess_1".to_string(),
                    turn_id: "turn_1".to_string(),
                })
                .expect("serialize params"),
            ),
        ))
        .expect("serialize request");

        assert_eq!(
            value,
            json!({
                "id": 3,
                "method": "agentSession/turn/cancel",
                "params": {
                    "sessionId": "sess_1",
                    "turnId": "turn_1"
                }
            })
        );
    }

    #[test]
    fn agent_session_action_respond_request_matches_protocol_fixture_shape() {
        let value = serde_json::to_value(JsonRpcRequest::new(
            RequestId::Integer(4),
            METHOD_AGENT_SESSION_ACTION_RESPOND,
            Some(
                serde_json::to_value(AgentSessionActionRespondParams {
                    session_id: "sess_1".to_string(),
                    request_id: "req_confirm_1".to_string(),
                    action_type: AgentSessionActionType::ToolConfirmation,
                    confirmed: true,
                    response: Some("allow".to_string()),
                    user_data: Some(json!({ "choice": "allow" })),
                    metadata: Some(json!({ "source": "content-studio" })),
                    event_name: Some("agent_app_runtime:app:task".to_string()),
                    action_scope: Some(AgentSessionActionScope {
                        session_id: Some("sess_1".to_string()),
                        thread_id: Some("thread_1".to_string()),
                        turn_id: Some("turn_1".to_string()),
                    }),
                })
                .expect("serialize params"),
            ),
        ))
        .expect("serialize request");

        assert_eq!(
            value,
            json!({
                "id": 4,
                "method": "agentSession/action/respond",
                "params": {
                    "sessionId": "sess_1",
                    "requestId": "req_confirm_1",
                    "actionType": "tool_confirmation",
                    "confirmed": true,
                    "response": "allow",
                    "userData": {
                        "choice": "allow"
                    },
                    "metadata": {
                        "source": "content-studio"
                    },
                    "eventName": "agent_app_runtime:app:task",
                    "actionScope": {
                        "sessionId": "sess_1",
                        "threadId": "thread_1",
                        "turnId": "turn_1"
                    }
                }
            })
        );
    }

    #[test]
    fn agent_session_event_notification_matches_protocol_fixture_shape() {
        let value = serde_json::to_value(JsonRpcNotification::new(
            METHOD_AGENT_SESSION_EVENT,
            Some(
                serde_json::to_value(AgentSessionEventParams {
                    event: AgentEvent {
                        event_id: "evt_1".to_string(),
                        sequence: 1,
                        session_id: "sess_1".to_string(),
                        thread_id: Some("thread_1".to_string()),
                        turn_id: Some("turn_1".to_string()),
                        event_type: "turn.started".to_string(),
                        timestamp: "2026-06-04T00:00:00Z".to_string(),
                        payload: json!({
                            "status": "running",
                            "delta": {
                                "text": "hello"
                            }
                        }),
                    },
                })
                .expect("serialize params"),
            ),
        ))
        .expect("serialize notification");

        assert_eq!(
            value,
            json!({
                "method": "agentSession/event",
                "params": {
                    "event": {
                        "eventId": "evt_1",
                        "sequence": 1,
                        "sessionId": "sess_1",
                        "threadId": "thread_1",
                        "turnId": "turn_1",
                        "type": "turn.started",
                        "timestamp": "2026-06-04T00:00:00Z",
                        "payload": {
                            "status": "running",
                            "delta": {
                                "text": "hello"
                            }
                        }
                    }
                }
            })
        );
    }

    #[test]
    fn request_id_display_is_stable() {
        assert_eq!(RequestId::Integer(7).to_string(), "7");
        assert_eq!(RequestId::String("req_1".to_string()).to_string(), "req_1");
    }

    #[test]
    fn app_server_method_catalog_keeps_request_and_notification_methods_together() {
        let methods: Vec<&str> = APP_SERVER_METHODS.iter().map(|spec| spec.method).collect();
        assert_eq!(
            methods,
            vec![
                METHOD_INITIALIZE,
                METHOD_INITIALIZED,
                METHOD_CAPABILITY_LIST,
                METHOD_ARTIFACT_READ,
                METHOD_EVIDENCE_EXPORT,
                METHOD_AGENT_SESSION_START,
                METHOD_AGENT_SESSION_READ,
                METHOD_AGENT_SESSION_TURN_START,
                METHOD_AGENT_SESSION_TURN_CANCEL,
                METHOD_AGENT_SESSION_ACTION_RESPOND,
                METHOD_AGENT_SESSION_EVENT,
            ]
        );

        let unique_methods = methods.iter().collect::<std::collections::HashSet<_>>();
        assert_eq!(unique_methods.len(), methods.len());
        assert!(is_app_server_request_method(METHOD_INITIALIZE));
        assert!(is_app_server_request_method(METHOD_EVIDENCE_EXPORT));
        assert!(is_app_server_request_method(
            METHOD_AGENT_SESSION_TURN_START
        ));
        assert!(!is_app_server_request_method(METHOD_INITIALIZED));
        assert!(is_app_server_notification_method(METHOD_INITIALIZED));
        assert!(is_app_server_notification_method(
            METHOD_AGENT_SESSION_EVENT
        ));
        assert!(!is_app_server_notification_method(
            METHOD_AGENT_SESSION_START
        ));
    }
}
