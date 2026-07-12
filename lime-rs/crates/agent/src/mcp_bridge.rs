//! MCP 桥接运行时边界
//!
//! 将 Agent reply-loop 的 MCP 调用转发到
//! Lime 已有的 MCP RunningService，避免重复启动进程。

use agent_protocol::session_context::SESSION_ID_HEADER;
use agent_runtime::runtime_scope::current_session_id;
use lime_mcp::{
    build_runtime_extension_surface, runtime_extension_name,
    McpBridgeClient as RuntimeMcpBridgeClient, McpBridgeSnapshot,
};
use rmcp::model::{
    CallToolResult, Extensions, GetPromptResult, InitializeResult, JsonObject, ListPromptsResult,
    ListResourcesResult, ListToolsResult, Meta, ReadResourceResult, ServerNotification,
};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tokio::sync::{mpsc, Mutex, RwLock};
use tokio_util::sync::CancellationToken;
use tool_runtime::mcp_connection::McpConnectionRegistry;
use tool_runtime::mcp_connection::{McpConnection, McpConnectionError};
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
                    Arc::clone(&snapshot.running_service),
                    Arc::clone(&snapshot.handler),
                    snapshot.server_info.clone(),
                ))));
            let surface = registration.config.clone();

            connections
                .register(
                    bridge_name.clone(),
                    surface,
                    client,
                    snapshot.server_info.clone(),
                )
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
    inner: RuntimeMcpBridgeClient,
}

impl McpBridgeClient {
    fn new(
        service: Arc<rmcp::service::RunningService<rmcp::RoleClient, lime_mcp::LimeMcpClient>>,
        handler: Arc<lime_mcp::LimeMcpClient>,
        server_info: Option<InitializeResult>,
    ) -> Self {
        Self {
            inner: RuntimeMcpBridgeClient::new(service, handler, server_info),
        }
    }

    /// 注入 Session ID 到扩展字段
    fn request_extensions(&self) -> Extensions {
        let mut extensions = Extensions::default();
        if let Some(session_id) = current_session_id() {
            let mut meta_map = extensions
                .get::<Meta>()
                .map(|meta| meta.0.clone())
                .unwrap_or_default();

            // 移除旧的 ID (大小写不敏感)
            meta_map.retain(|k, _| !k.eq_ignore_ascii_case(SESSION_ID_HEADER));
            // 插入新的 ID
            meta_map.insert(SESSION_ID_HEADER.to_string(), Value::String(session_id));

            extensions.insert(Meta(meta_map));
        }
        extensions
    }
}

fn map_mcp_result<T>(
    result: Result<T, rmcp::service::ServiceError>,
) -> Result<T, McpConnectionError> {
    result
}

#[async_trait::async_trait]
impl McpConnection for McpBridgeClient {
    async fn list_resources(
        &self,
        cursor: Option<String>,
        cancel_token: CancellationToken,
    ) -> Result<ListResourcesResult, McpConnectionError> {
        map_mcp_result(
            self.inner
                .list_resources(cursor, self.request_extensions(), cancel_token)
                .await,
        )
    }

    async fn read_resource(
        &self,
        uri: &str,
        cancel_token: CancellationToken,
    ) -> Result<ReadResourceResult, McpConnectionError> {
        map_mcp_result(
            self.inner
                .read_resource(uri, self.request_extensions(), cancel_token)
                .await,
        )
    }

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
        cancel_token: CancellationToken,
    ) -> Result<CallToolResult, McpConnectionError> {
        map_mcp_result(
            self.inner
                .call_tool(name, arguments, self.request_extensions(), cancel_token)
                .await,
        )
    }

    async fn list_prompts(
        &self,
        cursor: Option<String>,
        cancel_token: CancellationToken,
    ) -> Result<ListPromptsResult, McpConnectionError> {
        map_mcp_result(
            self.inner
                .list_prompts(cursor, self.request_extensions(), cancel_token)
                .await,
        )
    }

    async fn get_prompt(
        &self,
        name: &str,
        arguments: Value,
        cancel_token: CancellationToken,
    ) -> Result<GetPromptResult, McpConnectionError> {
        map_mcp_result(
            self.inner
                .get_prompt(name, arguments, self.request_extensions(), cancel_token)
                .await,
        )
    }

    async fn subscribe(&self) -> mpsc::Receiver<ServerNotification> {
        self.inner.subscribe().await
    }

    fn get_info(&self) -> Option<&InitializeResult> {
        self.inner.server_info()
    }
}
