use super::events::{build_agent_app_runtime_task_events, emit_agent_app_runtime_task_snapshot};
use super::types::{AgentAppRuntimeGetTaskRequest, AgentAppRuntimeTaskSnapshot};
use crate::agent::AsterAgentState;
use crate::app::LogState;
use crate::commands::api_key_provider_cmd::ApiKeyProviderServiceState;
use crate::commands::aster_agent_cmd::agent_runtime_get_thread_read;
use crate::config::GlobalConfigManagerState;
use crate::database::DbConnection;
use crate::mcp::McpManagerState;
use crate::services::automation_service::AutomationServiceState;
use tauri::{AppHandle, State};

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn agent_app_runtime_get_task(
    app: AppHandle,
    state: State<'_, AsterAgentState>,
    db: State<'_, DbConnection>,
    api_key_provider_service: State<'_, ApiKeyProviderServiceState>,
    logs: State<'_, LogState>,
    config_manager: State<'_, GlobalConfigManagerState>,
    mcp_manager: State<'_, McpManagerState>,
    automation_state: State<'_, AutomationServiceState>,
    request: AgentAppRuntimeGetTaskRequest,
) -> Result<AgentAppRuntimeTaskSnapshot, String> {
    let app_handle = app.clone();
    let thread_read = agent_runtime_get_thread_read(
        app,
        state,
        db,
        api_key_provider_service,
        logs,
        config_manager,
        mcp_manager,
        automation_state,
        request.session_id.clone(),
    )
    .await?;
    let task_status = thread_read.profile_status.clone();
    let task_events = build_agent_app_runtime_task_events(&thread_read);
    let thread_read_value = serde_json::to_value(&thread_read)
        .map_err(|error| format!("序列化 AgentRuntimeThreadReadModel 失败: {error}"))?;

    let snapshot = AgentAppRuntimeTaskSnapshot {
        app_id: request.app_id,
        task_id: request.task_id,
        session_id: request.session_id,
        status: "thread_read_available".to_string(),
        task_status,
        task_events,
        thread_read: thread_read_value,
    };
    emit_agent_app_runtime_task_snapshot(&app_handle, &snapshot);
    Ok(snapshot)
}
