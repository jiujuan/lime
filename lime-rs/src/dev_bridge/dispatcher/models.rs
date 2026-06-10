use serde_json::Value as JsonValue;

type DynError = Box<dyn std::error::Error>;

pub(super) async fn try_handle(
    _state: &crate::dev_bridge::DevBridgeState,
    _cmd: &str,
    _args: Option<&JsonValue>,
) -> Result<Option<JsonValue>, DynError> {
    Ok(None)
}
