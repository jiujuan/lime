use super::common::{
    agent_app_runtime_event_name, invoke_agent_app_runtime_app_server_value,
    new_agent_app_runtime_session_id, non_empty, require_text,
};
use super::metadata::{build_agent_app_runtime_metadata, build_agent_app_runtime_task_message};
use super::model_preference::{
    insert_agent_app_runtime_model_preference_metadata, resolve_agent_app_runtime_model_preference,
};
use super::types::{AgentAppRuntimeStartTaskRequest, AgentAppRuntimeStartTaskResult};
use crate::agent::AsterAgentState;
use crate::app::LogState;
use crate::commands::api_key_provider_cmd::ApiKeyProviderServiceState;
use crate::commands::aster_agent_cmd::{
    create_runtime_session_internal_with_runtime_and_session_id, AgentTurnConfigSnapshot,
    AsterChatRequest, AsterExecutionStrategy,
};
use crate::config::GlobalConfigManagerState;
use crate::database::DbConnection;
use crate::mcp::McpManagerState;
use crate::services::automation_service::AutomationServiceState;
use chrono::Utc;
use serde_json::Value;
use tauri::{AppHandle, State};
use uuid::Uuid;

fn merge_missing_metadata_fields(target: &mut Value, source: &Value) {
    let (Some(target), Some(source)) = (target.as_object_mut(), source.as_object()) else {
        return;
    };

    for (key, value) in source {
        match target.get_mut(key) {
            Some(existing) => merge_missing_metadata_fields(existing, value),
            None => {
                target.insert(key.clone(), value.clone());
            }
        }
    }
}

fn merge_turn_config_metadata(
    mut metadata: Value,
    turn_config: Option<&AgentTurnConfigSnapshot>,
) -> Value {
    if let Some(turn_config_metadata) = turn_config.and_then(|config| config.metadata.as_ref()) {
        merge_missing_metadata_fields(&mut metadata, turn_config_metadata);
    }
    metadata
}

fn provider_preference_from_turn_config(
    turn_config: Option<&AgentTurnConfigSnapshot>,
) -> Option<String> {
    let turn_config = turn_config?;
    turn_config
        .provider_preference
        .clone()
        .or_else(|| {
            turn_config
                .provider_config
                .as_ref()
                .and_then(|config| config.provider_id.clone())
        })
        .or_else(|| {
            turn_config
                .provider_config
                .as_ref()
                .map(|config| config.provider_name.clone())
        })
}

fn model_preference_from_turn_config(
    turn_config: Option<&AgentTurnConfigSnapshot>,
) -> Option<String> {
    let turn_config = turn_config?;
    turn_config.model_preference.clone().or_else(|| {
        turn_config
            .provider_config
            .as_ref()
            .map(|config| config.model_name.clone())
    })
}

#[allow(clippy::too_many_arguments)]
fn build_agent_app_runtime_aster_chat_request(
    request: &AgentAppRuntimeStartTaskRequest,
    session_id: &str,
    workspace_id: &str,
    turn_id: &str,
    event_name: &str,
    message: String,
    metadata: Value,
    resolved_provider_preference: Option<&str>,
    resolved_model_preference: Option<&str>,
    queue_if_busy: bool,
    queued_turn_id: String,
) -> AsterChatRequest {
    let turn_config = request.turn_config.as_ref();
    AsterChatRequest {
        message,
        session_id: session_id.to_string(),
        event_name: event_name.to_string(),
        images: None,
        provider_config: turn_config.and_then(|config| config.provider_config.clone()),
        provider_preference: request
            .provider_preference
            .clone()
            .or_else(|| provider_preference_from_turn_config(turn_config))
            .or_else(|| resolved_provider_preference.map(str::to_string)),
        model_preference: request
            .model_preference
            .clone()
            .or_else(|| model_preference_from_turn_config(turn_config))
            .or_else(|| resolved_model_preference.map(str::to_string)),
        reasoning_effort: turn_config.and_then(|config| config.reasoning_effort.clone()),
        thinking_enabled: turn_config.and_then(|config| config.thinking_enabled),
        approval_policy: turn_config.and_then(|config| config.approval_policy.clone()),
        sandbox_policy: turn_config.and_then(|config| config.sandbox_policy.clone()),
        project_id: None,
        workspace_id: workspace_id.to_string(),
        web_search: turn_config.and_then(|config| config.web_search),
        search_mode: turn_config.and_then(|config| config.search_mode),
        execution_strategy: turn_config.and_then(|config| config.execution_strategy),
        auto_continue: turn_config.and_then(|config| config.auto_continue.clone()),
        system_prompt: turn_config.and_then(|config| config.system_prompt.clone()),
        metadata: Some(metadata),
        turn_id: Some(turn_id.to_string()),
        queue_if_busy: Some(queue_if_busy),
        queued_turn_id: Some(queued_turn_id),
    }
}

fn build_agent_app_runtime_host_options(
    request: &AgentAppRuntimeStartTaskRequest,
    aster_chat_request: &AsterChatRequest,
) -> Result<Value, String> {
    let mut host_request =
        serde_json::to_value(aster_chat_request).map_err(|error| error.to_string())?;
    if let (Some(root), Some(turn_config)) =
        (host_request.as_object_mut(), request.turn_config.as_ref())
    {
        root.insert(
            "turn_config".to_string(),
            serde_json::to_value(turn_config).map_err(|error| error.to_string())?,
        );
    }
    Ok(serde_json::json!({
        "asterChatRequest": host_request
    }))
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn agent_app_runtime_start_task(
    app: AppHandle,
    state: State<'_, AsterAgentState>,
    db: State<'_, DbConnection>,
    api_key_provider_service: State<'_, ApiKeyProviderServiceState>,
    _logs: State<'_, LogState>,
    _config_manager: State<'_, GlobalConfigManagerState>,
    mcp_manager: State<'_, McpManagerState>,
    _automation_state: State<'_, AutomationServiceState>,
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
    let metadata = merge_turn_config_metadata(metadata, request.turn_config.as_ref());
    let message = build_agent_app_runtime_task_message(&request);
    let queue_if_busy = request.queue_if_busy.unwrap_or(true);
    let skip_pre_submit_resume = request.skip_pre_submit_resume.unwrap_or(false);
    let queued_turn_id = format!("agent-app-queued-{task_id}");
    let provider_preference = model_preference
        .as_ref()
        .map(|preference| preference.provider_preference.as_str());
    let model_preference_value = model_preference
        .as_ref()
        .map(|preference| preference.model_preference.as_str());
    let aster_chat_request = build_agent_app_runtime_aster_chat_request(
        &request,
        &session_id,
        &workspace_id,
        &turn_id,
        &event_name,
        message.clone(),
        metadata.clone(),
        provider_preference,
        model_preference_value,
        queue_if_busy,
        queued_turn_id.clone(),
    );
    let host_options = build_agent_app_runtime_host_options(&request, &aster_chat_request)?;
    invoke_agent_app_runtime_app_server_value(
        app.clone(),
        format!("agent-app-runtime-session-{session_id}"),
        app_server::METHOD_AGENT_SESSION_START,
        app_server::AgentSessionStartParams {
            session_id: Some(session_id.clone()),
            thread_id: None,
            app_id: app_id.clone(),
            workspace_id: Some(workspace_id.clone()),
            business_object_ref: None,
            locale: None,
        },
        &[app_server::error_codes::SESSION_ALREADY_EXISTS],
    )
    .await?;
    invoke_agent_app_runtime_app_server_value(
        app,
        format!("agent-app-runtime-turn-{turn_id}"),
        app_server::METHOD_AGENT_SESSION_TURN_START,
        app_server::AgentSessionTurnStartParams {
            session_id: session_id.clone(),
            turn_id: Some(turn_id.clone()),
            input: app_server::AgentInput {
                text: message,
                attachments: Vec::new(),
            },
            runtime_options: Some(app_server::RuntimeOptions {
                capability_id: None,
                stream: true,
                event_name: Some(event_name.clone()),
                provider_preference: provider_preference.map(str::to_string),
                model_preference: model_preference_value.map(str::to_string),
                metadata: Some(metadata),
                queued_turn_id: Some(queued_turn_id),
                host_options: Some(host_options),
            }),
            queue_if_busy,
            skip_pre_submit_resume,
        },
        &[],
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
