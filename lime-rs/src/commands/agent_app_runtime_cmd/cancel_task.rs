use super::types::{AgentAppRuntimeCancelTaskRequest, AgentAppRuntimeCancelTaskResult};
use crate::agent::AsterAgentState;
use crate::commands::aster_agent_cmd::{
    agent_runtime_interrupt_turn, AgentRuntimeInterruptTurnRequest,
};
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn agent_app_runtime_cancel_task(
    app: AppHandle,
    state: State<'_, AsterAgentState>,
    request: AgentAppRuntimeCancelTaskRequest,
) -> Result<AgentAppRuntimeCancelTaskResult, String> {
    let cancelled = agent_runtime_interrupt_turn(
        app,
        state,
        AgentRuntimeInterruptTurnRequest {
            session_id: request.session_id.clone(),
            turn_id: request.turn_id.clone(),
        },
    )
    .await?;

    Ok(AgentAppRuntimeCancelTaskResult {
        app_id: request.app_id,
        task_id: request.task_id,
        session_id: request.session_id,
        cancelled,
        status: (if cancelled {
            "cancelled"
        } else {
            "not_running"
        })
        .to_string(),
    })
}
