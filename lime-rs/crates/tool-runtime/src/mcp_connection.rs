use async_trait::async_trait;
use rmcp::model::{CallToolResult, JsonObject, ListToolsResult, ServerNotification};
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

mod registry;
mod scope;
mod step_snapshot;

pub use registry::{McpConnectionCall, McpConnectionHandle, McpConnectionRegistry};
pub use scope::McpCallScope;
pub use step_snapshot::McpStepSnapshot;

pub type McpConnectionError = rmcp::ServiceError;

#[async_trait]
pub trait McpConnection: Send + Sync {
    async fn list_tools(
        &self,
        next_cursor: Option<String>,
        cancel_token: CancellationToken,
    ) -> Result<ListToolsResult, McpConnectionError>;

    async fn call_tool(
        &self,
        name: &str,
        arguments: Option<JsonObject>,
        scope: &McpCallScope,
        cancel_token: CancellationToken,
    ) -> Result<CallToolResult, McpConnectionError>;

    async fn subscribe(&self) -> mpsc::Receiver<ServerNotification>;
}
