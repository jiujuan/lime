//! MCP 桥接运行时边界
//!
//! 将 Agent reply-loop 的 MCP 调用绑定到其 Session-owned connection generation。

use lime_mcp::{
    build_runtime_extension_surface, runtime_extension_name,
    McpBridgeClient as RuntimeMcpBridgeClient, McpBridgeSnapshot,
};
use rmcp::model::{CallToolResult, Extensions, JsonObject, ListToolsResult, ServerNotification};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tokio::sync::{mpsc, Mutex, RwLock};
use tokio_util::sync::CancellationToken;
use tool_runtime::mcp_connection::McpConnectionRegistry;
use tool_runtime::mcp_connection::{McpCallScope, McpConnection, McpConnectionError};
use tool_runtime::tool_extension::{RuntimeExtensionRegistration, RuntimeExtensionSyncPlan};

pub(crate) struct McpBridgeRuntimeRegistry {
    registered_bridge_names: RwLock<HashSet<String>>,
}

impl McpBridgeRuntimeRegistry {
    pub(crate) fn new() -> Self {
        Self {
            registered_bridge_names: RwLock::new(HashSet::new()),
        }
    }

    pub(crate) async fn sync(
        &self,
        connections: &McpConnectionRegistry,
        snapshots: Vec<McpBridgeSnapshot>,
    ) -> usize {
        let mut snapshots_by_bridge_name = HashMap::new();
        let mut registrations = Vec::new();
        for snapshot in snapshots {
            let extension_name = runtime_extension_name(&snapshot.server_name);
            let surface = build_runtime_extension_surface(
                &extension_name,
                snapshot.description.clone(),
                &snapshot.tools,
            );

            let bridge_name = surface.name.clone();
            registrations.push(RuntimeExtensionRegistration::new(
                surface,
                Some(snapshot.server_name.clone()),
            ));
            snapshots_by_bridge_name.insert(bridge_name, snapshot);
        }

        let previous_bridge_names = self.registered_bridge_names.read().await.clone();
        let plan = RuntimeExtensionSyncPlan::from_registrations(
            previous_bridge_names.iter().cloned(),
            registrations,
        );
        let active_bridge_names = plan.active_names();

        for registration in &plan.registrations {
            let bridge_name = registration.config.name.clone();
            let Some(snapshot) = snapshots_by_bridge_name.get(&bridge_name) else {
                continue;
            };
            let client: Arc<Mutex<Box<dyn McpConnection>>> =
                Arc::new(Mutex::new(Box::new(McpBridgeClient::new(
                    Arc::clone(&snapshot.manager),
                    Arc::clone(&snapshot.running_service),
                    snapshot.tool_timeout,
                ))));
            let surface = registration.config.clone();

            connections
                .register(bridge_name.clone(), surface, client)
                .await;
        }

        for stale_name in &plan.stale_names {
            if !connections.remove(stale_name).await {
                tracing::warn!(
                    extension_name = %stale_name,
                    "[AgentRuntime] 清理过期 MCP bridge 失败"
                );
            }
        }

        let bridge_count = plan.registrations.len();
        *self.registered_bridge_names.write().await = active_bridge_names;
        bridge_count
    }
}

struct McpBridgeClient {
    _manager: Arc<lime_mcp::McpClientManager>,
    inner: RuntimeMcpBridgeClient,
}

impl McpBridgeClient {
    fn new(
        manager: Arc<lime_mcp::McpClientManager>,
        service: Arc<
            rmcp::service::RunningService<rmcp::RoleClient, lime_mcp::LimeMcpClientService>,
        >,
        tool_timeout: std::time::Duration,
    ) -> Self {
        Self {
            _manager: manager,
            inner: RuntimeMcpBridgeClient::new(service, tool_timeout),
        }
    }

    fn request_extensions(&self) -> Extensions {
        Extensions::default()
    }
}

fn map_mcp_result<T>(
    result: Result<T, rmcp::service::ServiceError>,
) -> Result<T, McpConnectionError> {
    result
}

#[async_trait::async_trait]
impl McpConnection for McpBridgeClient {
    async fn list_tools(
        &self,
        cursor: Option<String>,
        cancel_token: CancellationToken,
    ) -> Result<ListToolsResult, McpConnectionError> {
        map_mcp_result(
            self.inner
                .list_tools(cursor, self.request_extensions(), cancel_token)
                .await,
        )
    }

    async fn call_tool(
        &self,
        name: &str,
        arguments: Option<JsonObject>,
        scope: &McpCallScope,
        cancel_token: CancellationToken,
    ) -> Result<CallToolResult, McpConnectionError> {
        map_mcp_result(
            self.inner
                .call_tool(
                    name,
                    arguments,
                    self.request_extensions(),
                    Some(scope),
                    cancel_token,
                )
                .await,
        )
    }

    async fn subscribe(&self) -> mpsc::Receiver<ServerNotification> {
        self.inner.subscribe().await
    }
}
