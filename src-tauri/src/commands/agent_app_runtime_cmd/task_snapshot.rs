use super::events::{
    build_agent_app_runtime_task_events, emit_agent_app_runtime_task_snapshot,
    task_events_mark_business_completed,
};
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

fn runtime_summary_task_id(thread_read: &serde_json::Value) -> Option<&str> {
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
    let task_events = build_agent_app_runtime_task_events(&thread_read);
    let task_status = if task_events_mark_business_completed(&task_events) {
        "completed".to_string()
    } else {
        thread_read.profile_status.clone()
    };
    let thread_read_value = serde_json::to_value(&thread_read)
        .map_err(|error| format!("序列化 AgentRuntimeThreadReadModel 失败: {error}"))?;
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
        task_events,
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
