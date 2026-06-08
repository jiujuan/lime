use super::{args_or_default, parse_nested_arg, require_app_handle};
use crate::dev_bridge::DevBridgeState;
use serde_json::Value as JsonValue;
use tauri::Manager;

type DynError = Box<dyn std::error::Error>;

pub(super) async fn try_handle(
    state: &DevBridgeState,
    cmd: &str,
    args: Option<&JsonValue>,
) -> Result<Option<JsonValue>, DynError> {
    let result = match cmd {
        "wechat_channel_set_runtime_model" => {
            let app_handle = require_app_handle(state)?;
            let args = args_or_default(args);
            let request: crate::commands::wechat_channel_cmd::WechatRuntimeModelRequest =
                parse_nested_arg(&args, "request")?;
            let logs = app_handle.state::<crate::app::LogState>();
            let config_manager = app_handle.state::<crate::config::GlobalConfigManagerState>();

            serde_json::to_value(
                crate::commands::wechat_channel_cmd::persist_wechat_runtime_model(
                    &config_manager,
                    &logs,
                    &request,
                )
                .await?,
            )?
        }
        _ => return Ok(None),
    };

    Ok(Some(result))
}
