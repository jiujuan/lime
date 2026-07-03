pub mod canonical;

use agent_protocol::{ModelId, TurnId};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::error::Error;
use std::fmt;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ModelProviderProtocol {
    Responses,
    ChatCompletions,
    Custom(String),
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ModelRoute {
    pub provider: String,
    pub model: ModelId,
    pub protocol: ModelProviderProtocol,
    #[serde(default)]
    pub capabilities: Vec<String>,
    #[serde(default)]
    pub metadata: Value,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ModelTaskRequest {
    pub turn_id: TurnId,
    pub task_kind: String,
    #[serde(default)]
    pub required_capabilities: Vec<String>,
    #[serde(default)]
    pub metadata: Value,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ModelProviderError {
    message: String,
}

impl ModelProviderError {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl fmt::Display for ModelProviderError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl Error for ModelProviderError {}

pub type ModelProviderResult<T> = Result<T, ModelProviderError>;

pub trait ModelProviderCatalog {
    fn resolve_route(&self, request: &ModelTaskRequest) -> ModelProviderResult<Option<ModelRoute>>;
}
