use super::common::invoke_agent_app_runtime_app_server;
use super::events::emit_agent_app_runtime_task_snapshot;
use super::types::{AgentAppRuntimeGetTaskRequest, AgentAppRuntimeTaskSnapshot};
use crate::agent::AsterAgentState;
use crate::app::LogState;
use crate::commands::api_key_provider_cmd::ApiKeyProviderServiceState;
use crate::config::GlobalConfigManagerState;
use crate::database::DbConnection;
use crate::mcp::McpManagerState;
use crate::services::automation_service::AutomationServiceState;
use serde_json::Value;
use tauri::{AppHandle, State};

fn runtime_summary_task_id(thread_read: &Value) -> Option<&str> {
    thread_read
        .get("runtime_summary")
        .or_else(|| thread_read.get("runtimeSummary"))
        .and_then(|summary| {
            summary
                .get("taskId")
                .or_else(|| summary.get("task_id"))
                .and_then(serde_json::Value::as_str)
        })
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn thread_read_value_from_app_server_read(read_response: &Value) -> Value {
    read_response
        .get("detail")
        .filter(|value| !value.is_null())
        .cloned()
        .unwrap_or_else(|| read_response.clone())
}

fn task_status_from_app_server_read(read_response: &Value) -> String {
    match read_response
        .get("session")
        .and_then(|session| session.get("status"))
        .and_then(Value::as_str)
    {
        Some("completed") => "completed",
        Some("failed") => "failed",
        Some("canceled") | Some("cancelled") => "cancelled",
        Some("waitingAction") => "blocked",
        Some("idle") => "idle",
        Some("running") => "running",
        _ => "thread_read_available",
    }
    .to_string()
}

#[tauri::command]
pub async fn agent_app_runtime_get_task(
    app: AppHandle,
    _state: State<'_, AsterAgentState>,
    _db: State<'_, DbConnection>,
    _api_key_provider_service: State<'_, ApiKeyProviderServiceState>,
    _logs: State<'_, LogState>,
    _config_manager: State<'_, GlobalConfigManagerState>,
    _mcp_manager: State<'_, McpManagerState>,
    _automation_state: State<'_, AutomationServiceState>,
    request: AgentAppRuntimeGetTaskRequest,
) -> Result<AgentAppRuntimeTaskSnapshot, String> {
    let app_handle = app.clone();
    let session_id = request.session_id.clone();
    let read_response: Value = invoke_agent_app_runtime_app_server(
        app,
        format!("agent-app-runtime-get-task-{session_id}"),
        app_server::METHOD_AGENT_SESSION_READ,
        serde_json::json!({
            "sessionId": session_id,
        }),
    )
    .await?;
    let task_status = task_status_from_app_server_read(&read_response);
    let thread_read_value = thread_read_value_from_app_server_read(&read_response);
    if runtime_summary_task_id(&thread_read_value).is_some_and(|value| value != request.task_id) {
        let snapshot = AgentAppRuntimeTaskSnapshot {
            app_id: request.app_id,
            task_id: request.task_id,
            session_id: request.session_id,
            status: "task_mismatch".to_string(),
            task_status: "task_mismatch".to_string(),
            task_events: Vec::new(),
            thread_read: thread_read_value,
        };
        emit_agent_app_runtime_task_snapshot(&app_handle, &snapshot);
        return Ok(snapshot);
    }

    let snapshot = AgentAppRuntimeTaskSnapshot {
        app_id: request.app_id,
        task_id: request.task_id,
        session_id: request.session_id,
        status: "thread_read_available".to_string(),
        task_status,
        task_events: Vec::new(),
        thread_read: thread_read_value,
    };
    emit_agent_app_runtime_task_snapshot(&app_handle, &snapshot);
    Ok(snapshot)
}

#[cfg(test)]
mod tests {
    use super::runtime_summary_task_id;
    use serde_json::json;

    #[test]
    fn runtime_summary_task_id_reads_camel_and_snake_case() {
        assert_eq!(
            runtime_summary_task_id(&json!({
                "runtime_summary": { "taskId": "task-camel" }
            })),
            Some("task-camel")
        );
        assert_eq!(
            runtime_summary_task_id(&json!({
                "runtimeSummary": { "task_id": "task-snake" }
            })),
            Some("task-snake")
        );
    }
}
