pub mod ask;
pub mod turn_executor;

use agent_protocol::{AgentTurnInput, RuntimeSnapshot, SessionId, ThreadId, TurnId};
use model_provider::ModelRoute;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::error::Error;
use std::fmt;
use tool_runtime::ToolDefinition;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct AgentRuntimeCapabilities {
    #[serde(default)]
    pub model_routes: Vec<ModelRoute>,
    #[serde(default)]
    pub tools: Vec<ToolDefinition>,
    pub supports_subagents: bool,
    #[serde(default)]
    pub metadata: Value,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct StartTurnRequest {
    pub input: AgentTurnInput,
    pub route: Option<ModelRoute>,
    #[serde(default)]
    pub metadata: Value,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct StartTurnAccepted {
    pub session_id: SessionId,
    pub thread_id: ThreadId,
    pub turn_id: TurnId,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AgentRuntimeError {
    message: String,
}

impl AgentRuntimeError {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl fmt::Display for AgentRuntimeError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl Error for AgentRuntimeError {}

pub type AgentRuntimeResult<T> = Result<T, AgentRuntimeError>;

pub trait AgentRuntime {
    fn capabilities(&self) -> AgentRuntimeResult<AgentRuntimeCapabilities>;

    fn start_turn(&self, request: StartTurnRequest) -> AgentRuntimeResult<StartTurnAccepted>;

    fn read_thread(
        &self,
        session_id: &SessionId,
        thread_id: &ThreadId,
    ) -> AgentRuntimeResult<RuntimeSnapshot>;
}
