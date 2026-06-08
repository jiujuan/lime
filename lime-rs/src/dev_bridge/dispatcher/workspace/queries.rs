use crate::dev_bridge::DevBridgeState;
use serde_json::Value as JsonValue;

pub(super) fn try_handle(
    _state: &DevBridgeState,
    cmd: &str,
    _args: Option<&JsonValue>,
) -> Result<Option<JsonValue>, Box<dyn std::error::Error>> {
    let _ = cmd;
    Ok(None)
}
