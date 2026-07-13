use crate::AppDataSource;
use crate::RuntimeCoreError;
use app_server_protocol::McpServerStartParams;
use lime_agent::AgentRuntimeState;
use serde_json::Value;
use std::collections::BTreeSet;
use std::sync::{Arc, RwLock};
use std::time::Duration;
use tokio::time::timeout;

const MCP_AUTOSTART_TIMEOUT: Duration = Duration::from_secs(2);
const MCP_BRIDGE_SNAPSHOT_TIMEOUT: Duration = Duration::from_secs(2);

pub(super) async fn sync_mcp_bridges_if_available(
    agent_state: &AgentRuntimeState,
    app_data_source: &RwLock<Option<Arc<dyn AppDataSource>>>,
) -> Result<(), RuntimeCoreError> {
    if !agent_state.is_initialized().await {
        return Ok(());
    }
    let app_data_source = app_data_source
        .read()
        .map_err(|_| {
            RuntimeCoreError::Backend("MCP bridge app data source lock poisoned".to_string())
        })?
        .clone();
    let Some(app_data_source) = app_data_source else {
        return Ok(());
    };
    start_enabled_lime_mcp_servers_if_needed(app_data_source.clone()).await;
    let snapshots = match timeout(
        MCP_BRIDGE_SNAPSHOT_TIMEOUT,
        app_data_source.list_mcp_bridge_snapshots(),
    )
    .await
    {
        Ok(Ok(snapshots)) => snapshots,
        Ok(Err(error)) => {
            tracing::warn!(
                error = %error,
                "[RuntimeBackend] MCP bridge 快照同步失败，继续执行主模型回合"
            );
            return Ok(());
        }
        Err(_) => {
            tracing::warn!(
                timeout_secs = MCP_BRIDGE_SNAPSHOT_TIMEOUT.as_secs(),
                "[RuntimeBackend] MCP bridge 快照同步超时，继续执行主模型回合"
            );
            return Ok(());
        }
    };
    agent_state
        .sync_mcp_bridges(snapshots)
        .await
        .map_err(|error| RuntimeCoreError::Backend(error.to_string()))
}

pub(super) async fn start_enabled_lime_mcp_servers_if_needed(
    app_data_source: Arc<dyn AppDataSource>,
) {
    let response = match app_data_source.list_mcp_servers_with_status().await {
        Ok(response) => response,
        Err(error) => {
            tracing::warn!(
                error = %error,
                "[RuntimeBackend] 读取 MCP 运行状态失败，跳过 Agent turn MCP 自动启动"
            );
            return;
        }
    };

    for server_name in enabled_lime_mcp_servers_to_start(&response.servers) {
        match timeout(
            MCP_AUTOSTART_TIMEOUT,
            app_data_source.start_mcp_server(McpServerStartParams {
                name: server_name.clone(),
            }),
        )
        .await
        {
            Ok(Ok(_)) => {
                tracing::info!(
                    server_name = %server_name,
                    "[RuntimeBackend] 已为 Agent turn 启动 Lime MCP server"
                );
            }
            Ok(Err(error)) => {
                tracing::warn!(
                    server_name = %server_name,
                    error = %error,
                    "[RuntimeBackend] Agent turn 启动 Lime MCP server 失败，继续使用当前可用工具面"
                );
            }
            Err(_) => {
                tracing::warn!(
                    server_name = %server_name,
                    timeout_secs = MCP_AUTOSTART_TIMEOUT.as_secs(),
                    "[RuntimeBackend] Agent turn 启动 Lime MCP server 超时，继续执行主模型回合"
                );
            }
        }
    }
}

fn enabled_lime_mcp_servers_to_start(servers: &[Value]) -> Vec<String> {
    let mut names = BTreeSet::new();
    for server in servers {
        if !value_bool_field(server, &["enabled_lime", "enabledLime"]) {
            continue;
        }
        if mcp_status_is_running(server) {
            continue;
        }
        if let Some(name) = value_string_field(server, &["name"]) {
            names.insert(name.to_string());
        }
    }
    names.into_iter().collect()
}

fn mcp_status_is_running(server: &Value) -> bool {
    value_bool_field(server, &["is_running", "isRunning"])
        || server
            .get("runtime_status")
            .is_some_and(|status| value_bool_field(status, &["is_running", "isRunning"]))
        || server
            .get("runtimeStatus")
            .is_some_and(|status| value_bool_field(status, &["is_running", "isRunning"]))
}

fn value_bool_field(value: &Value, keys: &[&str]) -> bool {
    keys.iter()
        .any(|key| value.get(*key).and_then(Value::as_bool).unwrap_or(false))
}

fn value_string_field<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a str> {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(Value::as_str))
        .map(str::trim)
        .filter(|value| !value.is_empty())
}
