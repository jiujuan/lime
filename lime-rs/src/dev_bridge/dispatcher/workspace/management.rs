use super::DynError;
use crate::dev_bridge::DevBridgeState;
use serde_json::Value as JsonValue;

pub(super) fn try_handle(
    _state: &DevBridgeState,
    _cmd: &str,
    _args: Option<&JsonValue>,
) -> Result<Option<JsonValue>, DynError> {
    Ok(None)
}
