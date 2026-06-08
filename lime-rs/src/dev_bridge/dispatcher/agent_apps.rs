use super::{args_or_default, parse_optional_nested_arg, require_app_handle};
use crate::dev_bridge::DevBridgeState;
use serde_json::Value as JsonValue;
use tauri::Manager;

pub async fn try_handle(
    state: &DevBridgeState,
    cmd: &str,
    args: Option<&JsonValue>,
) -> Result<Option<JsonValue>, Box<dyn std::error::Error>> {
    let value = match cmd {
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
        _ => return Ok(None),
    };

    Ok(Some(value))
}
