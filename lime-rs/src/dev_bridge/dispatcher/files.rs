use super::{args_or_default, get_string_arg};
use crate::dev_bridge::DevBridgeState;
use serde_json::Value as JsonValue;

pub(super) async fn try_handle(
    _state: &DevBridgeState,
    cmd: &str,
    args: Option<&JsonValue>,
) -> Result<Option<JsonValue>, Box<dyn std::error::Error>> {
    let result = match cmd {
        "get_file_name" => {
            let args = args_or_default(args);
            let path = get_string_arg(&args, "path", "path")?;
            serde_json::to_value(
                crate::services::file_browser_service::get_file_name(path)
                    .await
                    .map_err(|error| format!("读取文件名失败: {error}"))?,
            )?
        }
        _ => return Ok(None),
    };

    Ok(Some(result))
}
