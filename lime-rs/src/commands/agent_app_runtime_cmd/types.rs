use crate::commands::aster_agent_cmd::{AgentRuntimeRespondActionRequest, AgentTurnConfigSnapshot};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppRuntimeStartTaskRequest {
    pub app_id: String,
    #[serde(default)]
    pub entry_key: Option<String>,
    #[serde(default)]
    pub workspace_id: Option<String>,
    #[serde(default)]
    pub session_id: Option<String>,
    #[serde(default)]
    pub task_id: Option<String>,
    pub task_kind: String,
    #[serde(default)]
    pub idempotency_key: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub prompt: Option<String>,
    #[serde(default)]
    pub input: Option<Value>,
    #[serde(default)]
    pub expected_output: Option<Value>,
    #[serde(default)]
    pub required_capabilities: Vec<String>,
    #[serde(default)]
    pub capability_hints: Vec<String>,
    #[serde(default)]
    pub knowledge_bindings: Vec<Value>,
    #[serde(default)]
    pub human_review: Option<bool>,
    #[serde(default)]
    pub event_name: Option<String>,
    #[serde(default)]
    pub turn_id: Option<String>,
    #[serde(default)]
    pub provider_preference: Option<String>,
    #[serde(default)]
    pub model_preference: Option<String>,
    #[serde(default)]
    pub turn_config: Option<AgentTurnConfigSnapshot>,
    #[serde(default)]
    pub queue_if_busy: Option<bool>,
    #[serde(default)]
    pub skip_pre_submit_resume: Option<bool>,
    #[serde(default)]
    pub run_start_hooks: Option<bool>,
    #[serde(default)]
    pub metadata: Option<Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppRuntimeStartTaskResult {
    pub app_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entry_key: Option<String>,
    pub task_id: String,
    pub trace_id: String,
    pub task_kind: String,
    pub session_id: String,
    pub turn_id: String,
    pub event_name: String,
    pub status: String,
    pub submitted_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppRuntimeCancelTaskRequest {
    pub app_id: String,
    pub task_id: String,
    pub session_id: String,
    #[serde(default)]
    pub turn_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppRuntimeCancelTaskResult {
    pub app_id: String,
    pub task_id: String,
    pub session_id: String,
    pub cancelled: bool,
    pub status: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppRuntimeGetTaskRequest {
    pub app_id: String,
    pub task_id: String,
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppRuntimeTaskEvent {
    pub id: String,
    pub event_type: String,
    pub status: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub severity: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub evidence_ref: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub artifact_ref: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub occurred_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload: Option<Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppRuntimeTaskSnapshot {
    pub app_id: String,
    pub task_id: String,
    pub session_id: String,
    pub status: String,
    pub task_status: String,
    pub task_events: Vec<AgentAppRuntimeTaskEvent>,
    pub thread_read: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppRuntimeSubmitHostResponseRequest {
    pub app_id: String,
    pub task_id: String,
    pub runtime_request: AgentRuntimeRespondActionRequest,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppRuntimeSubmitHostResponseResult {
    pub app_id: String,
    pub task_id: String,
    pub status: String,
}
