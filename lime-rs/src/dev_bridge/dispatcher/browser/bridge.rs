use super::super::{args_or_default, get_string_arg, parse_nested_arg};
use super::DynError;
use crate::dev_bridge::DevBridgeState;
use serde_json::Value as JsonValue;

pub(super) async fn try_handle(
    _state: &DevBridgeState,
    cmd: &str,
    args: Option<&JsonValue>,
) -> Result<Option<JsonValue>, DynError> {
    let result = match cmd {
        "close_chrome_profile_session" => {
            let args = args_or_default(args);
            let profile_key = get_string_arg(&args, "profileKey", "profile_key")?;
            serde_json::to_value(
                crate::commands::webview_cmd::close_chrome_profile_session_global(profile_key)
                    .await?,
            )?
        }
        "cleanup_gui_smoke_chrome_profiles" => serde_json::to_value(
            crate::commands::webview_cmd::cleanup_gui_smoke_chrome_profiles_global().await?,
        )?,
        "disconnect_browser_connector_session" => {
            let args = args_or_default(args);
            let profile_key = args
                .get("profileKey")
                .or_else(|| args.get("profile_key"))
                .and_then(|value| value.as_str())
                .map(|value| value.to_string());
            serde_json::to_value(
                crate::commands::webview_cmd::disconnect_browser_connector_session(profile_key)
                    .await?,
            )?
        }
        "set_browser_backend_policy" => {
            let policy: crate::commands::webview_cmd::BrowserBackendPolicy =
                parse_nested_arg(&args_or_default(args), "policy")?;
            serde_json::to_value(
                crate::commands::webview_cmd::set_browser_backend_policy_global(policy).await?,
            )?
        }
        _ => return Ok(None),
    };

    Ok(Some(result))
}
