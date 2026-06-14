use async_trait::async_trait;
use serde_json::Value;
use std::sync::Arc;

#[derive(Debug, Clone, PartialEq)]
pub struct GatewayAgentRunRequest {
    pub channel: String,
    pub account_id: String,
    pub session_id: String,
    pub input_text: String,
    pub metadata: Value,
    pub provider_preference: Option<String>,
    pub model_preference: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GatewayAgentRunResponse {
    pub session_id: String,
    pub turn_id: String,
    pub reply_text: String,
}

#[async_trait]
pub trait GatewayAgentRunner: Send + Sync {
    async fn run_agent_turn(
        &self,
        request: GatewayAgentRunRequest,
    ) -> Result<GatewayAgentRunResponse, String>;
}

pub type GatewayAgentRunnerHandle = Arc<dyn GatewayAgentRunner>;
