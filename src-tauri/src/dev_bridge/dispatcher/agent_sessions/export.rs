use super::{args_or_default, get_string_arg, DynError};
use serde_json::Value as JsonValue;
use tauri::{AppHandle, Manager};

pub(super) async fn handle_export_evidence_pack(
    app_handle: &AppHandle,
    args: Option<&JsonValue>,
) -> Result<JsonValue, DynError> {
    let args = args_or_default(args);
    let session_id = get_string_arg(&args, "sessionId", "session_id")?;
    let aster_state = app_handle.state::<crate::agent::AsterAgentState>();
    let db = app_handle.state::<crate::database::DbConnection>();
    let api_key_provider_service =
        app_handle.state::<crate::commands::api_key_provider_cmd::ApiKeyProviderServiceState>();
    let logs = app_handle.state::<crate::app::LogState>();
    let config_manager = app_handle.state::<crate::config::GlobalConfigManagerState>();
    let mcp_manager = app_handle.state::<crate::mcp::McpManagerState>();
    let automation_state =
        app_handle.state::<crate::services::automation_service::AutomationServiceState>();

    Ok(serde_json::to_value(
        crate::commands::aster_agent_cmd::agent_runtime_export_evidence_pack(
            app_handle.clone(),
            aster_state,
            db,
            api_key_provider_service,
            logs,
            config_manager,
            mcp_manager,
            automation_state,
            session_id,
        )
        .await?,
    )?)
}
