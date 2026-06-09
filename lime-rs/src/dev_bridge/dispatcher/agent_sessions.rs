use super::{args_or_default, require_app_handle};
use crate::dev_bridge::DevBridgeState;
use serde_json::Value as JsonValue;
use tauri::Manager;

type DynError = Box<dyn std::error::Error>;

pub(super) async fn try_handle(
    state: &DevBridgeState,
    cmd: &str,
    args: Option<&JsonValue>,
) -> Result<Option<JsonValue>, DynError> {
    if !matches!(cmd, "agent_generate_title") {
        return Ok(None);
    }

    let app_handle = require_app_handle(state)?;
    let result = match cmd {
        "agent_generate_title" => {
            let args = args_or_default(args);
            let session_id = args
                .get("sessionId")
                .or_else(|| args.get("session_id"))
                .and_then(|value| value.as_str())
                .map(ToString::to_string);
            let preview_text = args
                .get("previewText")
                .or_else(|| args.get("preview_text"))
                .and_then(|value| value.as_str())
                .map(ToString::to_string);
            let title_kind = args
                .get("titleKind")
                .or_else(|| args.get("title_kind"))
                .and_then(|value| value.as_str())
                .map(ToString::to_string);
            let aster_state = app_handle.state::<crate::agent::AsterAgentState>();
            let db = app_handle.state::<crate::database::DbConnection>();
            let config_manager = app_handle.state::<crate::config::GlobalConfigManagerState>();

            serde_json::to_value(
                crate::commands::agent_cmd::agent_generate_title(
                    app_handle.clone(),
                    aster_state,
                    db,
                    config_manager,
                    session_id,
                    preview_text,
                    title_kind,
                )
                .await?,
            )?
        }
        _ => unreachable!("已通过前置 matches! 过滤 agent session 命令"),
    };

    Ok(Some(result))
}
