use super::{args_or_default, require_app_handle};
use crate::dev_bridge::DevBridgeState;
use serde_json::Value as JsonValue;
use tauri::Manager;

type DynError = Box<dyn std::error::Error>;

pub(super) async fn try_handle(
    state: &DevBridgeState,
    cmd: &str,
    args: Option<&JsonValue>,
) -> Result<Option<JsonValue>, DynError> {
    if cmd != "sync_tray_model_shortcuts" {
        return Ok(None);
    }

    let app_handle = require_app_handle(state)?;
    let result = match cmd {
        "sync_tray_model_shortcuts" => {
            let Some(tray_state) = app_handle.try_state::<crate::TrayManagerState<tauri::Wry>>()
            else {
                return Ok(Some(JsonValue::Null));
            };

            let args = args_or_default(args);
            let current_model_provider_type = args
                .get("currentModelProviderType")
                .or_else(|| args.get("current_model_provider_type"))
                .and_then(|value| value.as_str())
                .unwrap_or_default()
                .to_string();
            let current_model_provider_label = args
                .get("currentModelProviderLabel")
                .or_else(|| args.get("current_model_provider_label"))
                .and_then(|value| value.as_str())
                .unwrap_or_default()
                .to_string();
            let current_model = args
                .get("currentModel")
                .or_else(|| args.get("current_model"))
                .and_then(|value| value.as_str())
                .unwrap_or_default()
                .to_string();
            let current_theme_label = args
                .get("currentThemeLabel")
                .or_else(|| args.get("current_theme_label"))
                .and_then(|value| value.as_str())
                .unwrap_or_default()
                .to_string();
            let quick_model_groups = args
                .get("quickModelGroups")
                .or_else(|| args.get("quick_model_groups"))
                .cloned()
                .map(serde_json::from_value::<Vec<crate::tray::TrayQuickModelGroup>>)
                .transpose()?
                .unwrap_or_default();

            match crate::commands::tray_cmd::sync_tray_model_shortcuts(
                tray_state,
                current_model_provider_type,
                current_model_provider_label,
                current_model,
                current_theme_label,
                quick_model_groups,
            )
            .await
            {
                Ok(()) => JsonValue::Null,
                Err(error) if error.contains("托盘管理器未初始化") => JsonValue::Null,
                Err(error) => return Err(error.into()),
            }
        }
        _ => unreachable!("已通过前置判断过滤托盘命令"),
    };

    Ok(Some(result))
}
