use crate::dev_bridge::DevBridgeState;
use serde_json::Value as JsonValue;

mod management;
mod queries;
mod readiness;

type DynError = Box<dyn std::error::Error>;

pub(super) fn try_handle(
    state: &DevBridgeState,
    cmd: &str,
    args: Option<&JsonValue>,
) -> Result<Option<JsonValue>, DynError> {
    if let Some(result) = management::try_handle(state, cmd, args)? {
        return Ok(Some(result));
    }

    if let Some(result) = queries::try_handle(state, cmd, args)? {
        return Ok(Some(result));
    }

    readiness::try_handle(state, cmd, args)
}
