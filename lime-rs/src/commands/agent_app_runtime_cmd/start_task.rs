use super::common::{
    agent_app_runtime_event_name, new_agent_app_runtime_session_id, non_empty, require_text,
};
use super::metadata::{build_agent_app_runtime_metadata, build_agent_app_runtime_task_message};
use super::model_preference::{
    insert_agent_app_runtime_model_preference_metadata, resolve_agent_app_runtime_model_preference,
};
use super::types::{AgentAppRuntimeStartTaskRequest, AgentAppRuntimeStartTaskResult};
use crate::agent::AsterAgentState;
use crate::app::LogState;
use crate::commands::api_key_provider_cmd::ApiKeyProviderServiceState;
use crate::commands::aster_agent_cmd::app_server_host::{
    build_tauri_aster_app_server, submit_desktop_app_server_turn, DesktopAppServerSubmitTurnInput,
};
use crate::commands::aster_agent_cmd::{
    create_runtime_session_internal_with_runtime_and_session_id, AsterExecutionStrategy,
    RuntimeCommandContext,
};
use crate::config::GlobalConfigManagerState;
use crate::database::DbConnection;
use crate::mcp::McpManagerState;
use crate::services::automation_service::AutomationServiceState;
use chrono::Utc;
use tauri::{AppHandle, State};
use uuid::Uuid;

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn agent_app_runtime_start_task(
    app: AppHandle,
    state: State<'_, AsterAgentState>,
    db: State<'_, DbConnection>,
    api_key_provider_service: State<'_, ApiKeyProviderServiceState>,
    logs: State<'_, LogState>,
    config_manager: State<'_, GlobalConfigManagerState>,
    mcp_manager: State<'_, McpManagerState>,
    automation_state: State<'_, AutomationServiceState>,
    request: AgentAppRuntimeStartTaskRequest,
) -> Result<AgentAppRuntimeStartTaskResult, String> {
    let app_id = require_text(Some(request.app_id.as_str()), "appId")?;
    let task_kind = require_text(Some(request.task_kind.as_str()), "taskKind")?;
    let workspace_id = require_text(request.workspace_id.as_deref(), "workspaceId")?;
    let task_id = non_empty(request.task_id.as_deref())
        .unwrap_or_else(|| format!("agent-app-task-{}", Uuid::new_v4()));
    let trace_id = format!("agent-app-trace-{}", Uuid::new_v4());
    let turn_id =
        non_empty(request.turn_id.as_deref()).unwrap_or_else(|| Uuid::new_v4().to_string());
    let event_name = non_empty(request.event_name.as_deref())
        .unwrap_or_else(|| agent_app_runtime_event_name(&app_id, &task_id));
    let requested_session_id = non_empty(request.session_id.as_deref());
    let model_preference = resolve_agent_app_runtime_model_preference(
        state.inner(),
        db.inner(),
        api_key_provider_service.inner(),
        &request,
    )
    .await;
    if requested_session_id.is_none() && model_preference.is_none() {
        return Err(
            "Agent App Runtime 无法解析可用模型，请先在 Lime 配置可用 AI 服务商，或由 App 传入 providerPreference / modelPreference。"
                .to_string(),
        );
    }
    let session_id = match requested_session_id {
        Some(session_id) => session_id,
        None => {
            create_runtime_session_internal_with_runtime_and_session_id(
                db.inner(),
                state.inner(),
                mcp_manager.inner(),
                new_agent_app_runtime_session_id(),
                None,
                workspace_id.clone(),
                non_empty(request.title.as_deref())
                    .or_else(|| Some(format!("Agent App · {task_kind}"))),
                Some(AsterExecutionStrategy::React),
                request.run_start_hooks.unwrap_or(true),
            )
            .await?
        }
    };
    let mut metadata = build_agent_app_runtime_metadata(&request, &task_id, &trace_id);
    if let Some(model_preference) = model_preference.as_ref() {
        insert_agent_app_runtime_model_preference_metadata(&mut metadata, model_preference);
    }
    let runtime = RuntimeCommandContext::new(
        app,
        state.inner(),
        db.inner(),
        api_key_provider_service.inner(),
        logs.inner(),
        config_manager.inner(),
        mcp_manager.inner(),
        automation_state.inner(),
    );
    let app_server = build_tauri_aster_app_server(runtime);
    submit_desktop_app_server_turn(
        &app_server,
        DesktopAppServerSubmitTurnInput {
            client_name: "agent-app-runtime",
            client_title: "Agent App Runtime",
            app_id: &app_id,
            session_id: &session_id,
            workspace_id: &workspace_id,
            turn_id: Some(&turn_id),
            event_name: &event_name,
            message: build_agent_app_runtime_task_message(&request),
            metadata: Some(metadata),
            provider_preference: model_preference
                .as_ref()
                .map(|preference| preference.provider_preference.as_str()),
            model_preference: model_preference
                .as_ref()
                .map(|preference| preference.model_preference.as_str()),
            queue_if_busy: request.queue_if_busy.unwrap_or(true),
            skip_pre_submit_resume: request.skip_pre_submit_resume.unwrap_or(false),
            queued_turn_id: Some(format!("agent-app-queued-{task_id}")),
            host_options: None,
        },
    )
    .await?;

    Ok(AgentAppRuntimeStartTaskResult {
        app_id,
        entry_key: request
            .entry_key
            .and_then(|value| non_empty(Some(value.as_str()))),
        task_id,
        trace_id,
        task_kind,
        session_id,
        turn_id,
        event_name,
        status: "accepted".to_string(),
        submitted_at: Utc::now().to_rfc3339(),
    })
}
