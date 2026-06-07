use super::*;
use crate::commands::aster_agent_cmd::app_server_host::{
    build_desktop_aster_app_server, submit_desktop_aster_chat_request, DesktopAsterChatSubmitInput,
};
use crate::database::lock_db;
use lime_core::database::managed_objective_repository::{
    clear_objective_by_owner, get_agent_session_workspace_id, get_objective_by_owner,
    update_objective_status_by_owner, upsert_objective, ManagedObjectiveRecord,
    ManagedObjectiveStatus, ManagedObjectiveUpsert, MANAGED_OBJECTIVE_OWNER_AGENT_SESSION,
};
use serde_json::Value;

use super::objective_continuation::{
    build_objective_continuation_request_with_workspace, ManagedObjectiveContinuationSource,
};
use super::objective_support::{
    load_active_objective, normalize_session_id, resolve_objective_workspace_id,
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRuntimeSetObjectiveRequest {
    #[serde(alias = "session_id")]
    pub session_id: String,
    #[serde(default, alias = "workspace_id")]
    pub workspace_id: Option<String>,
    #[serde(alias = "objective_text")]
    pub objective_text: String,
    #[serde(default, alias = "success_criteria")]
    pub success_criteria: Vec<String>,
    #[serde(default, alias = "budget_policy")]
    pub budget_policy: Option<Value>,
    #[serde(default, alias = "risk_policy")]
    pub risk_policy: Option<Value>,
    #[serde(default, alias = "approval_policy")]
    pub approval_policy: Option<Value>,
    #[serde(default, alias = "continuation_policy")]
    pub continuation_policy: Option<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRuntimeObjectiveStatusRequest {
    #[serde(alias = "session_id")]
    pub session_id: String,
    pub status: ManagedObjectiveStatus,
    #[serde(default, alias = "blocker_reason")]
    pub blocker_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRuntimeSessionObjectiveRequest {
    #[serde(alias = "session_id")]
    pub session_id: String,
    #[serde(default, alias = "owner_kind")]
    pub owner_kind: Option<String>,
    #[serde(default, alias = "owner_id")]
    pub owner_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct AgentRuntimeClearObjectiveResult {
    pub cleared: bool,
}

#[derive(Debug, Serialize)]
pub struct AgentRuntimeContinueObjectiveResult {
    pub submitted: bool,
    pub queued_turn_id: String,
    pub objective: ManagedObjectiveRecord,
}

#[tauri::command]
pub async fn agent_runtime_get_objective(
    db: State<'_, DbConnection>,
    session_id: String,
) -> Result<Option<ManagedObjectiveRecord>, String> {
    let session_id = normalize_session_id(&session_id)?;
    let conn = lock_db(db.inner())?;
    get_objective_by_owner(&conn, MANAGED_OBJECTIVE_OWNER_AGENT_SESSION, &session_id)
}

#[tauri::command]
pub async fn agent_runtime_set_objective(
    db: State<'_, DbConnection>,
    request: AgentRuntimeSetObjectiveRequest,
) -> Result<ManagedObjectiveRecord, String> {
    let session_id = normalize_session_id(&request.session_id)?;
    let conn = lock_db(db.inner())?;
    let workspace_id = match request.workspace_id {
        Some(workspace_id) if !workspace_id.trim().is_empty() => Some(workspace_id),
        _ => get_agent_session_workspace_id(&conn, &session_id)?,
    };

    upsert_objective(
        &conn,
        ManagedObjectiveUpsert {
            workspace_id,
            owner_kind: MANAGED_OBJECTIVE_OWNER_AGENT_SESSION.to_string(),
            owner_id: session_id,
            objective_text: request.objective_text,
            success_criteria: request.success_criteria,
            budget_policy: request.budget_policy,
            risk_policy: request.risk_policy,
            approval_policy: request.approval_policy,
            continuation_policy: request.continuation_policy,
        },
    )
}

#[tauri::command]
pub async fn agent_runtime_update_objective_status(
    db: State<'_, DbConnection>,
    request: AgentRuntimeObjectiveStatusRequest,
) -> Result<Option<ManagedObjectiveRecord>, String> {
    let session_id = normalize_session_id(&request.session_id)?;
    let blocker_reason = request
        .blocker_reason
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let conn = lock_db(db.inner())?;
    update_objective_status_by_owner(
        &conn,
        MANAGED_OBJECTIVE_OWNER_AGENT_SESSION,
        &session_id,
        request.status,
        blocker_reason,
    )
}

#[tauri::command]
pub async fn agent_runtime_clear_objective(
    db: State<'_, DbConnection>,
    request: AgentRuntimeSessionObjectiveRequest,
) -> Result<AgentRuntimeClearObjectiveResult, String> {
    let session_id = normalize_session_id(&request.session_id)?;
    let conn = lock_db(db.inner())?;
    let cleared =
        clear_objective_by_owner(&conn, MANAGED_OBJECTIVE_OWNER_AGENT_SESSION, &session_id)?;
    Ok(AgentRuntimeClearObjectiveResult { cleared })
}

#[tauri::command]
pub async fn agent_runtime_continue_objective(
    app: AppHandle,
    state: State<'_, AsterAgentState>,
    db: State<'_, DbConnection>,
    api_key_provider_service: State<'_, ApiKeyProviderServiceState>,
    logs: State<'_, LogState>,
    config_manager: State<'_, GlobalConfigManagerState>,
    mcp_manager: State<'_, McpManagerState>,
    automation_state: State<'_, AutomationServiceState>,
    request: AgentRuntimeSessionObjectiveRequest,
) -> Result<AgentRuntimeContinueObjectiveResult, String> {
    let session_id = normalize_session_id(&request.session_id)?;
    let runtime = build_runtime_command_context(
        app,
        state,
        db,
        api_key_provider_service,
        logs,
        config_manager,
        mcp_manager,
        automation_state,
    );
    let objective = load_active_objective(runtime.db(), &session_id)?;
    assert_objective_can_continue(&objective)?;
    assert_runtime_can_continue(&runtime, &session_id).await?;

    let request = build_objective_continuation_request_with_workspace(
        &objective,
        ManagedObjectiveContinuationSource::ManualGui,
        resolve_objective_workspace_id(runtime.db(), &objective)?,
    );
    let app_server = build_desktop_aster_app_server(runtime);
    let queued_turn_id = submit_desktop_aster_chat_request(
        &app_server,
        DesktopAsterChatSubmitInput {
            client_name: "managed-objective",
            client_title: "Managed Objective",
            app_id: "desktop",
            request,
            queue_if_busy: false,
            skip_pre_submit_resume: false,
        },
    )
    .await?;

    Ok(AgentRuntimeContinueObjectiveResult {
        submitted: true,
        queued_turn_id,
        objective,
    })
}

fn assert_objective_can_continue(objective: &ManagedObjectiveRecord) -> Result<(), String> {
    if objective.status.allows_manual_continue() {
        return Ok(());
    }
    Err(format!(
        "当前目标状态为 {}，不能继续推进",
        objective.status.as_str()
    ))
}

async fn assert_runtime_can_continue(
    runtime: &RuntimeCommandContext,
    session_id: &str,
) -> Result<(), String> {
    let detail = AsterAgentWrapper::get_runtime_session_detail(runtime.db(), session_id).await?;
    if detail.turns.iter().any(|turn| {
        matches!(
            turn.status,
            lime_core::database::dao::agent_timeline::AgentThreadTurnStatus::Running
        )
    }) {
        return Err("当前会话正在执行，不能重复推进目标".to_string());
    }

    let pending_requests = build_pending_requests(&detail);
    if !pending_requests.is_empty() {
        return Err("当前会话还有待确认请求，先处理后再继续目标".to_string());
    }

    let queued_turns = list_runtime_queue_snapshots_service(session_id).await?;
    if !queued_turns.is_empty() {
        return Err("当前会话已有排队任务，先处理队列后再继续目标".to_string());
    }

    if runtime
        .state()
        .get_interrupt_marker(session_id)
        .await
        .is_some()
    {
        return Err("当前会话处于停止处理中，不能继续目标".to_string());
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::aster_agent_cmd::command_api::objective_continuation::build_objective_continuation_request;

    fn objective_with_status(status: ManagedObjectiveStatus) -> ManagedObjectiveRecord {
        ManagedObjectiveRecord {
            objective_id: "objective-1".to_string(),
            workspace_id: Some("workspace-1".to_string()),
            owner_kind: MANAGED_OBJECTIVE_OWNER_AGENT_SESSION.to_string(),
            owner_id: "session-1".to_string(),
            objective_text: "修到本地验证通过".to_string(),
            success_criteria: vec!["npm run verify:local 通过".to_string()],
            status,
            budget_policy: None,
            risk_policy: None,
            approval_policy: None,
            continuation_policy: None,
            last_audit_summary: None,
            last_evidence_pack_ref: None,
            last_artifact_refs: Vec::new(),
            blocker_reason: None,
            created_at: "2026-05-24T00:00:00Z".to_string(),
            updated_at: "2026-05-24T00:00:00Z".to_string(),
        }
    }

    #[test]
    fn paused_objective_rejects_manual_continue() {
        let objective = objective_with_status(ManagedObjectiveStatus::Paused);
        let error = assert_objective_can_continue(&objective).unwrap_err();
        assert!(error.contains("paused"));
    }

    #[test]
    fn continuation_request_carries_managed_objective_metadata() {
        let objective = objective_with_status(ManagedObjectiveStatus::Active);
        let request = build_objective_continuation_request(
            &objective,
            ManagedObjectiveContinuationSource::ManualGui,
        );

        assert_eq!(request.session_id, "session-1");
        assert!(request.message.contains("修到本地验证通过"));
        assert_eq!(
            request
                .metadata
                .as_ref()
                .and_then(|value| value.pointer("/harness/managed_objective/objective_id"))
                .and_then(Value::as_str),
            Some("objective-1")
        );
        assert_eq!(
            request
                .metadata
                .as_ref()
                .and_then(|value| value.pointer("/harness/managed_objective/continuation_source"))
                .and_then(Value::as_str),
            Some("manual_gui")
        );
    }
}
