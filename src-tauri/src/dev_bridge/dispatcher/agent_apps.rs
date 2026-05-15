use super::{args_or_default, parse_nested_arg, require_app_handle};
use crate::dev_bridge::DevBridgeState;
use serde_json::Value as JsonValue;
use tauri::Manager;

pub async fn try_handle(
    state: &DevBridgeState,
    cmd: &str,
    args: Option<&JsonValue>,
) -> Result<Option<JsonValue>, Box<dyn std::error::Error>> {
    let value = match cmd {
        "agent_app_inspect_local_package" => {
            let args = args_or_default(args);
            let app_dir = args
                .get("appDir")
                .or_else(|| args.get("app_dir"))
                .and_then(|value| value.as_str())
                .ok_or("缺少参数: appDir")?
                .to_string();
            serde_json::to_value(
                crate::commands::agent_app_cmd::agent_app_inspect_local_package(app_dir).await?,
            )?
        }
        "agent_app_fetch_cloud_package" => {
            let request = parse_nested_arg(&args_or_default(args), "request")?;
            serde_json::to_value(
                crate::commands::agent_app_cmd::agent_app_fetch_cloud_package(request).await?,
            )?
        }
        "agent_app_save_installed_state" => {
            let request = parse_nested_arg(&args_or_default(args), "request")?;
            serde_json::to_value(
                crate::commands::agent_app_cmd::agent_app_save_installed_state(request).await?,
            )?
        }
        "agent_app_list_installed" => {
            serde_json::to_value(crate::commands::agent_app_cmd::agent_app_list_installed().await?)?
        }
        "agent_app_set_disabled" => {
            let request = parse_nested_arg(&args_or_default(args), "request")?;
            serde_json::to_value(
                crate::commands::agent_app_cmd::agent_app_set_disabled(request).await?,
            )?
        }
        "agent_app_uninstall_rehearsal" => {
            let request = parse_nested_arg(&args_or_default(args), "request")?;
            serde_json::to_value(
                crate::commands::agent_app_cmd::agent_app_uninstall_rehearsal(request).await?,
            )?
        }
        "agent_app_uninstall" => {
            let request = parse_nested_arg(&args_or_default(args), "request")?;
            serde_json::to_value(
                crate::commands::agent_app_cmd::agent_app_uninstall(request).await?,
            )?
        }
        "agent_app_start_ui_runtime" => {
            let request = parse_nested_arg(&args_or_default(args), "request")?;
            let config = { state.server.read().await.config.clone() };
            serde_json::to_value(
                crate::commands::agent_app_cmd::agent_app_start_ui_runtime_for_dev_bridge(
                    request,
                    &config,
                    state.db.as_ref(),
                    Some(state.api_key_provider_service.as_ref()),
                )
                .await?,
            )?
        }
        "agent_app_get_ui_runtime_status" => {
            let request = parse_nested_arg(&args_or_default(args), "request")?;
            serde_json::to_value(
                crate::commands::agent_app_cmd::agent_app_get_ui_runtime_status(request).await?,
            )?
        }
        "agent_app_stop_ui_runtime" => {
            let request = parse_nested_arg(&args_or_default(args), "request")?;
            serde_json::to_value(
                crate::commands::agent_app_cmd::agent_app_stop_ui_runtime(request).await?,
            )?
        }
        "agent_app_runtime_start_task" => {
            let request = parse_nested_arg(&args_or_default(args), "request")?;
            let app_handle = require_app_handle(state)?;
            let aster_state = app_handle.state::<crate::agent::AsterAgentState>();
            let db = app_handle.state::<crate::database::DbConnection>();
            let api_key_provider_service =
                app_handle
                    .state::<crate::commands::api_key_provider_cmd::ApiKeyProviderServiceState>();
            let logs = app_handle.state::<crate::app::LogState>();
            let config_manager = app_handle.state::<crate::config::GlobalConfigManagerState>();
            let mcp_manager = app_handle.state::<crate::mcp::McpManagerState>();
            let automation_state =
                app_handle.state::<crate::services::automation_service::AutomationServiceState>();
            serde_json::to_value(
                crate::commands::agent_app_runtime_cmd::agent_app_runtime_start_task(
                    app_handle.clone(),
                    aster_state,
                    db,
                    api_key_provider_service,
                    logs,
                    config_manager,
                    mcp_manager,
                    automation_state,
                    request,
                )
                .await?,
            )?
        }
        "agent_app_runtime_cancel_task" => {
            let request = parse_nested_arg(&args_or_default(args), "request")?;
            let app_handle = require_app_handle(state)?;
            let aster_state = app_handle.state::<crate::agent::AsterAgentState>();
            serde_json::to_value(
                crate::commands::agent_app_runtime_cmd::agent_app_runtime_cancel_task(
                    app_handle.clone(),
                    aster_state,
                    request,
                )
                .await?,
            )?
        }
        "agent_app_runtime_get_task" => {
            let request = parse_nested_arg(&args_or_default(args), "request")?;
            let app_handle = require_app_handle(state)?;
            let aster_state = app_handle.state::<crate::agent::AsterAgentState>();
            let db = app_handle.state::<crate::database::DbConnection>();
            let api_key_provider_service =
                app_handle
                    .state::<crate::commands::api_key_provider_cmd::ApiKeyProviderServiceState>();
            let logs = app_handle.state::<crate::app::LogState>();
            let config_manager = app_handle.state::<crate::config::GlobalConfigManagerState>();
            let mcp_manager = app_handle.state::<crate::mcp::McpManagerState>();
            let automation_state =
                app_handle.state::<crate::services::automation_service::AutomationServiceState>();
            serde_json::to_value(
                crate::commands::agent_app_runtime_cmd::agent_app_runtime_get_task(
                    app_handle.clone(),
                    aster_state,
                    db,
                    api_key_provider_service,
                    logs,
                    config_manager,
                    mcp_manager,
                    automation_state,
                    request,
                )
                .await?,
            )?
        }
        "agent_app_runtime_submit_host_response" => {
            let request = parse_nested_arg(&args_or_default(args), "request")?;
            let app_handle = require_app_handle(state)?;
            let aster_state = app_handle.state::<crate::agent::AsterAgentState>();
            let db = app_handle.state::<crate::database::DbConnection>();
            serde_json::to_value(
                crate::commands::agent_app_runtime_cmd::agent_app_runtime_submit_host_response(
                    app_handle.clone(),
                    aster_state,
                    db,
                    request,
                )
                .await?,
            )?
        }
        _ => return Ok(None),
    };

    Ok(Some(value))
}
