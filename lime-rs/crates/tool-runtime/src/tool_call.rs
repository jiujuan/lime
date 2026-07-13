use crate::tool_lifecycle::{ToolLifecycleEmitter, ToolLifecycleEvent};
use crate::tool_result_projection::NormalizedToolOutput;
use serde_json::Value;
use std::path::PathBuf;
use std::sync::Arc;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ToolEnvironment {
    pub environment_id: String,
    pub cwd: PathBuf,
}

impl ToolEnvironment {
    pub fn new(environment_id: impl Into<String>, cwd: PathBuf) -> Self {
        Self {
            environment_id: environment_id.into(),
            cwd,
        }
    }
}

#[derive(Clone)]
pub struct ToolCall {
    turn_id: String,
    call_id: String,
    tool_name: String,
    arguments: Value,
    environments: Vec<ToolEnvironment>,
    lifecycle_emitter: Arc<dyn ToolLifecycleEmitter>,
}

impl ToolCall {
    pub fn new(
        turn_id: impl Into<String>,
        call_id: impl Into<String>,
        tool_name: impl Into<String>,
        arguments: Value,
        environments: Vec<ToolEnvironment>,
        lifecycle_emitter: Arc<dyn ToolLifecycleEmitter>,
    ) -> Self {
        Self {
            turn_id: turn_id.into(),
            call_id: call_id.into(),
            tool_name: tool_name.into(),
            arguments,
            environments,
            lifecycle_emitter,
        }
    }

    pub fn turn_id(&self) -> &str {
        &self.turn_id
    }

    pub fn call_id(&self) -> &str {
        &self.call_id
    }

    pub fn tool_name(&self) -> &str {
        &self.tool_name
    }

    pub fn arguments(&self) -> &Value {
        &self.arguments
    }

    pub fn environments(&self) -> &[ToolEnvironment] {
        &self.environments
    }

    pub async fn emit_started(&self) {
        self.lifecycle_emitter
            .emit(ToolLifecycleEvent::started(self))
            .await;
    }

    pub async fn emit_completed(&self, output: NormalizedToolOutput) {
        self.lifecycle_emitter
            .emit(ToolLifecycleEvent::completed(self, output))
            .await;
    }
}

impl std::fmt::Debug for ToolCall {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("ToolCall")
            .field("turn_id", &self.turn_id)
            .field("call_id", &self.call_id)
            .field("tool_name", &self.tool_name)
            .field("arguments", &self.arguments)
            .field("environments", &self.environments)
            .field("lifecycle_emitter", &"<host lifecycle emitter>")
            .finish()
    }
}
