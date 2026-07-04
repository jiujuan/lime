use agent_protocol::{SessionId, ThreadId, ToolCallId, TurnId};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::error::Error;
use std::fmt;

pub mod mcp_notification;
pub mod tool_io;
pub mod tool_result;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub input_schema: Value,
    #[serde(default)]
    pub metadata: Value,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ToolInvocation {
    pub call_id: ToolCallId,
    pub session_id: SessionId,
    pub thread_id: ThreadId,
    pub turn_id: TurnId,
    pub name: String,
    #[serde(default)]
    pub input: Value,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolPermissionDecision {
    Allow,
    Deny { reason: String },
    AskUser { action_key: String },
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolOutcomeStatus {
    Completed,
    Failed,
    AwaitingAction,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ToolOutcome {
    pub call_id: ToolCallId,
    pub status: ToolOutcomeStatus,
    #[serde(default)]
    pub output: Value,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ToolRuntimeError {
    message: String,
}

impl ToolRuntimeError {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl fmt::Display for ToolRuntimeError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl Error for ToolRuntimeError {}

pub type ToolRuntimeResult<T> = Result<T, ToolRuntimeError>;

pub trait ToolRuntime {
    fn list_tools(&self) -> ToolRuntimeResult<Vec<ToolDefinition>>;

    fn check_permission(
        &self,
        invocation: &ToolInvocation,
    ) -> ToolRuntimeResult<ToolPermissionDecision>;

    fn invoke(&self, invocation: ToolInvocation) -> ToolRuntimeResult<ToolOutcome>;
}
