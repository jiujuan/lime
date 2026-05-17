use super::types::{
    AgentAppRuntimeSubmitHostResponseRequest, AgentAppRuntimeSubmitHostResponseResult,
};
use crate::agent::AsterAgentState;
use crate::commands::aster_agent_cmd::action_runtime::agent_runtime_respond_action;
use crate::database::DbConnection;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn agent_app_runtime_submit_host_response(
    app: AppHandle,
    state: State<'_, AsterAgentState>,
    db: State<'_, DbConnection>,
    request: AgentAppRuntimeSubmitHostResponseRequest,
) -> Result<AgentAppRuntimeSubmitHostResponseResult, String> {
    agent_runtime_respond_action(app, state, db, request.runtime_request).await?;

    Ok(AgentAppRuntimeSubmitHostResponseResult {
        app_id: request.app_id,
        task_id: request.task_id,
        status: "submitted".to_string(),
    })
}
