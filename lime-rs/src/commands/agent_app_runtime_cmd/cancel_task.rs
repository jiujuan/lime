use super::common::{invoke_agent_app_runtime_app_server, non_empty};
use super::types::{AgentAppRuntimeCancelTaskRequest, AgentAppRuntimeCancelTaskResult};
use crate::agent::AsterAgentState;
use serde_json::Value;
use tauri::{AppHandle, State};

fn active_turn_id(read_response: &Value) -> Option<String> {
    let turns = read_response.get("turns")?.as_array()?;
    turns.iter().rev().find_map(|turn| {
        let status = turn.get("status").and_then(Value::as_str)?;
        if !matches!(status, "accepted" | "queued" | "running" | "waitingAction") {
            return None;
        }
        turn.get("turnId")
            .or_else(|| turn.get("turn_id"))
            .and_then(Value::as_str)
            .and_then(|value| non_empty(Some(value.as_ref())))
    })
}

#[tauri::command]
pub async fn agent_app_runtime_cancel_task(
    app: AppHandle,
    _state: State<'_, AsterAgentState>,
    request: AgentAppRuntimeCancelTaskRequest,
) -> Result<AgentAppRuntimeCancelTaskResult, String> {
    let session_id = request.session_id.clone();
    let turn_id = match non_empty(request.turn_id.as_deref()) {
        Some(turn_id) => Some(turn_id),
        None => {
            let read_response: Value = invoke_agent_app_runtime_app_server(
                app.clone(),
                format!("agent-app-runtime-read-before-cancel-{session_id}"),
                app_server::METHOD_AGENT_SESSION_READ,
                serde_json::json!({
                    "sessionId": session_id.clone(),
                }),
            )
            .await?;
            active_turn_id(&read_response)
        }
    };

    let cancelled = if let Some(turn_id) = turn_id {
        let _: Value = invoke_agent_app_runtime_app_server(
            app,
            format!("agent-app-runtime-cancel-{session_id}-{turn_id}"),
            app_server::METHOD_AGENT_SESSION_TURN_CANCEL,
            serde_json::json!({
                "sessionId": session_id.clone(),
                "turnId": turn_id,
            }),
        )
        .await?;
        true
    } else {
        false
    };

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
