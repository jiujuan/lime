use super::{args_or_default, get_string_arg};
use serde_json::Value as JsonValue;

pub(super) async fn try_handle(
    cmd: &str,
    args: Option<&JsonValue>,
) -> Result<Option<JsonValue>, Box<dyn std::error::Error>> {
    let value = match cmd {
        "open_external_url" => {
            let args = args_or_default(args);
            let url = get_string_arg(&args, "url", "url")?;
            serde_json::to_value(
                crate::commands::external_tools_cmd::open_external_url(url)
                    .await
                    .map_err(|error| format!("打开外部链接失败: {error}"))?,
            )?
        }
        _ => return Ok(None),
    };

    Ok(Some(value))
}
