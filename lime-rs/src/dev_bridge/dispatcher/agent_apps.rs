use crate::dev_bridge::DevBridgeState;
use serde_json::Value as JsonValue;

pub async fn try_handle(
    _state: &DevBridgeState,
    cmd: &str,
    _args: Option<&JsonValue>,
) -> Result<Option<JsonValue>, Box<dyn std::error::Error>> {
    let _ = cmd;
    Ok(None)
}
