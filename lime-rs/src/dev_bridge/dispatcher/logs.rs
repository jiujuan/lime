use super::require_app_handle;
use crate::dev_bridge::DevBridgeState;
use serde_json::Value as JsonValue;

type DynError = Box<dyn std::error::Error>;

pub(super) async fn try_handle(
    state: &DevBridgeState,
    cmd: &str,
    args: Option<&JsonValue>,
) -> Result<Option<JsonValue>, DynError> {
    let result = match cmd {
        "get_log_storage_diagnostics" => {
            let logs = state.logs.read().await;
            let diagnostics = crate::app::commands::get_log_storage_diagnostics_from_path(
                logs.get_log_file_path(),
                logs.get_logs().len(),
            );
            serde_json::to_value(diagnostics)?
        }
        "get_windows_startup_diagnostics" => {
            let app_handle = require_app_handle(state)?;
            let diagnostics =
                crate::commands::windows_startup_cmd::collect_windows_startup_diagnostics(
                    &app_handle,
            );
            serde_json::to_value(diagnostics)?
        }
        _ => return Ok(None),
    };

    Ok(Some(result))
}
