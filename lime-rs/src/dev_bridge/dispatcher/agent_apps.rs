use super::{args_or_default, parse_nested_arg, parse_optional_nested_arg, require_app_handle};
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
        "agent_app_select_directory" => {
            let request = parse_optional_nested_arg(&args_or_default(args), "request")?;
            let app_handle = require_app_handle(state)?;
            let window = app_handle
                .get_webview_window("main")
                .ok_or("DevBridge 缺少 main 窗口，无法打开目录选择器")?;
            serde_json::to_value(
                crate::commands::agent_app_cmd::agent_app_select_directory_from_window(
                    request, &window,
                ),
            )?
        }
        "agent_app_launch_shell" => {
            let request = parse_nested_arg(&args_or_default(args), "request")?;
            let app_handle = require_app_handle(state)?;
            let config = { state.server.read().await.config.clone() };
            serde_json::to_value(
                crate::commands::agent_app_cmd::agent_app_launch_shell_for_dev_bridge(
                    request,
                    &app_handle,
                    &config,
                    state.db.as_ref(),
                    Some(state.api_key_provider_service.as_ref()),
                )
                .await?,
            )?
        }
        _ => return Ok(None),
    };

    Ok(Some(value))
}
