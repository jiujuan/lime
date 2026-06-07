use super::common::invoke_agent_app_runtime_app_server;
use super::types::{
    AgentAppRuntimeSubmitHostResponseRequest, AgentAppRuntimeSubmitHostResponseResult,
};
use crate::agent::AsterAgentState;
use crate::commands::aster_agent_cmd::AgentRuntimeActionType;
use crate::database::DbConnection;
use serde_json::Value;
use tauri::{AppHandle, State};

fn app_server_action_type(
    action_type: AgentRuntimeActionType,
) -> app_server::AgentSessionActionType {
    match action_type {
        AgentRuntimeActionType::ToolConfirmation => {
            app_server::AgentSessionActionType::ToolConfirmation
        }
        AgentRuntimeActionType::AskUser => app_server::AgentSessionActionType::AskUser,
        AgentRuntimeActionType::Elicitation => app_server::AgentSessionActionType::Elicitation,
    }
}

#[tauri::command]
pub async fn agent_app_runtime_submit_host_response(
    app: AppHandle,
    _state: State<'_, AsterAgentState>,
    _db: State<'_, DbConnection>,
    request: AgentAppRuntimeSubmitHostResponseRequest,
) -> Result<AgentAppRuntimeSubmitHostResponseResult, String> {
    let runtime_request = request.runtime_request;
    let action_scope =
        runtime_request
            .action_scope
            .map(|scope| app_server::AgentSessionActionScope {
                session_id: scope.session_id,
                thread_id: scope.thread_id,
                turn_id: scope.turn_id,
            });
    let params = app_server::AgentSessionActionRespondParams {
        session_id: runtime_request.session_id.clone(),
        request_id: runtime_request.request_id.clone(),
        action_type: app_server_action_type(runtime_request.action_type),
        confirmed: runtime_request.confirmed,
        response: runtime_request.response,
        user_data: runtime_request.user_data,
        metadata: runtime_request.metadata,
        event_name: runtime_request.event_name,
        action_scope,
    };
    let _: Value = invoke_agent_app_runtime_app_server(
        app,
        format!(
            "agent-app-runtime-host-response-{}-{}",
            runtime_request.session_id, runtime_request.request_id
        ),
        app_server::METHOD_AGENT_SESSION_ACTION_RESPOND,
        params,
    )
    .await?;

    Ok(AgentAppRuntimeSubmitHostResponseResult {
        app_id: request.app_id,
        task_id: request.task_id,
        status: "submitted".to_string(),
    })
}
