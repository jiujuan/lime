use async_trait::async_trait;
use rmcp::model::{
    CallToolResult, GetPromptResult, InitializeResult, JsonObject, ListPromptsResult,
    ListResourcesResult, ListToolsResult, ReadResourceResult, ServerNotification,
};
use serde_json::Value;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

mod registry;
mod step_snapshot;

pub use registry::{
    McpConnectionCall, McpConnectionHandle, McpConnectionRegistry, McpConnectionSummary,
};
pub use step_snapshot::McpStepSnapshot;

pub type McpConnectionError = rmcp::ServiceError;

#[async_trait]
pub trait McpConnection: Send + Sync {
    async fn list_resources(
        &self,
        next_cursor: Option<String>,
        cancel_token: CancellationToken,
    ) -> Result<ListResourcesResult, McpConnectionError>;

    async fn read_resource(
        &self,
        uri: &str,
        cancel_token: CancellationToken,
    ) -> Result<ReadResourceResult, McpConnectionError>;

    async fn list_tools(
        &self,
        next_cursor: Option<String>,
        cancel_token: CancellationToken,
    ) -> Result<ListToolsResult, McpConnectionError>;

    async fn call_tool(
        &self,
        name: &str,
        arguments: Option<JsonObject>,
        cancel_token: CancellationToken,
    ) -> Result<CallToolResult, McpConnectionError>;

    async fn list_prompts(
        &self,
        next_cursor: Option<String>,
        cancel_token: CancellationToken,
    ) -> Result<ListPromptsResult, McpConnectionError>;

    async fn get_prompt(
        &self,
        name: &str,
        arguments: Value,
        cancel_token: CancellationToken,
    ) -> Result<GetPromptResult, McpConnectionError>;

    async fn subscribe(&self) -> mpsc::Receiver<ServerNotification>;

    fn get_info(&self) -> Option<&InitializeResult>;
}
