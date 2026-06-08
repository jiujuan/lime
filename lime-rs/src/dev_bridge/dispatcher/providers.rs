use super::require_app_handle;
use crate::connect::RelayRegistry;
use crate::dev_bridge::DevBridgeState;
use serde_json::Value as JsonValue;
use std::sync::Arc;
use tauri::Manager;

type DynError = Box<dyn std::error::Error>;

async fn relay_registry(state: &DevBridgeState) -> Option<Arc<RelayRegistry>> {
    let state_guard = state.connect_state.read().await;
    state_guard
        .as_ref()
        .map(|connect_state| connect_state.registry.clone())
}

pub(super) async fn try_handle(
    state: &DevBridgeState,
    cmd: &str,
    _args: Option<&JsonValue>,
) -> Result<Option<JsonValue>, DynError> {
    let result = match cmd {
        "aster_agent_init" => {
            let app_handle = require_app_handle(state)?;
            let aster_state = app_handle.state::<crate::agent::AsterAgentState>();
            let db = app_handle.state::<crate::database::DbConnection>();
            let api_key_provider_service =
                app_handle
                    .state::<crate::commands::api_key_provider_cmd::ApiKeyProviderServiceState>();
            let mcp_manager = app_handle.state::<crate::mcp::McpManagerState>();

            serde_json::to_value(
                crate::commands::aster_agent_cmd::aster_agent_init(
                    app_handle.clone(),
                    aster_state,
                    db,
                    api_key_provider_service,
                    mcp_manager,
                )
                .await?,
            )?
        }
        "aster_agent_status" => {
            let app_handle = require_app_handle(state)?;
            let aster_state = app_handle.state::<crate::agent::AsterAgentState>();

            serde_json::to_value(
                crate::commands::aster_agent_cmd::aster_agent_status(aster_state).await?,
            )?
        }
        "aster_agent_reset" => {
            let app_handle = require_app_handle(state)?;
            let aster_state = app_handle.state::<crate::agent::AsterAgentState>();

            serde_json::to_value(
                crate::commands::aster_agent_cmd::aster_agent_reset(aster_state).await?,
            )?
        }
        "aster_agent_configure_provider" => {
            let app_handle = require_app_handle(state)?;
            let aster_state = app_handle.state::<crate::agent::AsterAgentState>();
            let db = app_handle.state::<crate::database::DbConnection>();
            let args = args_or_default(args);
            let request = parse_nested_arg::<
                crate::commands::aster_agent_cmd::ConfigureProviderRequest,
            >(&args, "request")?;
            let session_id = get_string_arg(&args, "session_id", "sessionId")?;

            serde_json::to_value(
                crate::commands::aster_agent_cmd::aster_agent_configure_provider(
                    aster_state,
                    db,
                    request,
                    session_id,
                )
                .await?,
            )?
        }
        "list_relay_providers" => {
            if let Some(registry) = relay_registry(state).await {
                serde_json::to_value(registry.list())?
            } else {
                serde_json::json!([])
            }
        }
        "refresh_relay_registry" => {
            if let Some(registry) = relay_registry(state).await {
                registry
                    .load_from_remote()
                    .await
                    .map_err(|e| format!("刷新中转商注册表失败: {e}"))?;
                serde_json::json!(registry.len())
            } else {
                return Err("Connect 模块未初始化".into());
            }
        }
        _ => return Ok(None),
    };

    Ok(Some(result))
}
