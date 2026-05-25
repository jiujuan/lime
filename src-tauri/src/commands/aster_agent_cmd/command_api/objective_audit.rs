use super::*;
use crate::database::lock_db;
use crate::services::managed_objective_audit_service::build_managed_objective_audit_update;
use crate::services::runtime_evidence_pack_service::{
    export_runtime_evidence_pack_with_owner_runs_and_locale, resolve_runtime_export_workspace_root,
};
use crate::services::thread_reliability_projection_service::sync_thread_reliability_projection;
use lime_core::database::dao::agent_run::AgentRunDao;
use lime_core::database::managed_objective_repository::{
    get_objective_by_owner, update_objective_audit_by_owner, ManagedObjectiveRecord,
    ManagedObjectiveStatus, MANAGED_OBJECTIVE_OWNER_AGENT_SESSION,
    MANAGED_OBJECTIVE_OWNER_AUTOMATION_JOB,
};
use std::path::PathBuf;

use super::objective_support::normalize_session_id;
use super::thread_read_projection::{
    hydrate_thread_read_managed_objective, hydrate_thread_read_with_latest_model_delta_timing,
};

#[derive(Debug, Clone, PartialEq, Eq)]
struct ManagedObjectiveAuditOwner {
    owner_kind: String,
    owner_id: String,
}

#[derive(Debug)]
struct ManagedObjectiveAuditRuntimeContext {
    detail: SessionDetail,
    thread_read: AgentRuntimeThreadReadModel,
    workspace_root: PathBuf,
}

#[tauri::command]
pub async fn agent_runtime_audit_objective(
    app: AppHandle,
    state: State<'_, AsterAgentState>,
    db: State<'_, DbConnection>,
    api_key_provider_service: State<'_, ApiKeyProviderServiceState>,
    logs: State<'_, LogState>,
    config_manager: State<'_, GlobalConfigManagerState>,
    mcp_manager: State<'_, McpManagerState>,
    automation_state: State<'_, AutomationServiceState>,
    request: AgentRuntimeSessionObjectiveRequest,
) -> Result<ManagedObjectiveRecord, String> {
    let session_id = normalize_session_id(&request.session_id)?;
    let audit_owner = resolve_managed_objective_audit_owner(&request, &session_id)?;
    let evidence_locale = config_manager.0.config().language;
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
    let objective = load_audit_owner_objective(runtime.db(), &audit_owner)?;
    let context = load_managed_objective_audit_context(&runtime, &session_id).await?;
    let owner_runs = {
        let conn = lock_db(runtime.db())?;
        AgentRunDao::list_runs_by_session(&conn, &session_id, 20)
            .map_err(|error| format!("查询目标审计 owner runs 失败: {error}"))?
    };
    let evidence_pack = export_runtime_evidence_pack_with_owner_runs_and_locale(
        &context.detail,
        &context.thread_read,
        &context.workspace_root,
        &owner_runs,
        Some(evidence_locale.as_str()),
    )?;
    let audit_update =
        build_managed_objective_audit_update(&objective, &context.thread_read, &evidence_pack);

    let conn = lock_db(runtime.db())?;
    update_objective_audit_by_owner(
        &conn,
        &audit_owner.owner_kind,
        &audit_owner.owner_id,
        audit_update,
    )?
    .ok_or_else(|| "保存目标审计结果后读取失败".to_string())
}

fn resolve_managed_objective_audit_owner(
    request: &AgentRuntimeSessionObjectiveRequest,
    session_id: &str,
) -> Result<ManagedObjectiveAuditOwner, String> {
    let owner_kind = request
        .owner_kind
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(MANAGED_OBJECTIVE_OWNER_AGENT_SESSION);

    match owner_kind {
        MANAGED_OBJECTIVE_OWNER_AGENT_SESSION => Ok(ManagedObjectiveAuditOwner {
            owner_kind: MANAGED_OBJECTIVE_OWNER_AGENT_SESSION.to_string(),
            owner_id: normalize_optional_owner_id(request.owner_id.as_deref(), session_id)?,
        }),
        MANAGED_OBJECTIVE_OWNER_AUTOMATION_JOB => {
            let owner_id = request
                .owner_id
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| "自动化目标审计缺少 owner_id".to_string())?;
            Ok(ManagedObjectiveAuditOwner {
                owner_kind: MANAGED_OBJECTIVE_OWNER_AUTOMATION_JOB.to_string(),
                owner_id: owner_id.to_string(),
            })
        }
        other => Err(format!("不支持的目标审计 owner_kind: {other}")),
    }
}

fn normalize_optional_owner_id(
    owner_id: Option<&str>,
    fallback_session_id: &str,
) -> Result<String, String> {
    match owner_id.map(str::trim).filter(|value| !value.is_empty()) {
        Some(value) => Ok(value.to_string()),
        None => normalize_session_id(fallback_session_id),
    }
}

fn load_audit_owner_objective(
    db: &DbConnection,
    audit_owner: &ManagedObjectiveAuditOwner,
) -> Result<ManagedObjectiveRecord, String> {
    let conn = lock_db(db)?;
    get_objective_by_owner(&conn, &audit_owner.owner_kind, &audit_owner.owner_id)?.ok_or_else(
        || {
            if audit_owner.owner_kind == MANAGED_OBJECTIVE_OWNER_AGENT_SESSION {
                "当前会话还没有目标".to_string()
            } else {
                "当前目标 owner 还没有目标".to_string()
            }
        },
    )
}

async fn load_managed_objective_audit_context(
    runtime: &RuntimeCommandContext,
    session_id: &str,
) -> Result<ManagedObjectiveAuditRuntimeContext, String> {
    let detail = AsterAgentWrapper::get_runtime_session_detail(runtime.db(), session_id).await?;
    let queued_turns = if detail.is_persisted_empty() {
        Vec::new()
    } else {
        list_runtime_queue_snapshots_service(session_id).await?
    };
    let projection = sync_thread_reliability_projection(runtime.db(), &detail)?;
    let interrupt_marker = runtime.state().get_interrupt_marker(session_id).await;
    let mut thread_read = AgentRuntimeThreadReadModel::from_parts(
        &detail,
        &queued_turns,
        projection.pending_requests,
        projection.last_outcome,
        projection.incidents,
        interrupt_marker.as_ref(),
    );
    hydrate_thread_read_with_latest_model_delta_timing(runtime.db(), session_id, &mut thread_read)?;
    hydrate_thread_read_managed_objective(runtime.db(), session_id, &mut thread_read)?;

    let workspace_root = resolve_runtime_export_workspace_root(runtime.db(), &detail)?;

    Ok(ManagedObjectiveAuditRuntimeContext {
        detail,
        thread_read,
        workspace_root,
    })
}

#[allow(dead_code)]
fn _objective_audit_status_guard(status: ManagedObjectiveStatus) -> bool {
    matches!(
        status,
        ManagedObjectiveStatus::Active
            | ManagedObjectiveStatus::Verifying
            | ManagedObjectiveStatus::NeedsInput
            | ManagedObjectiveStatus::Blocked
            | ManagedObjectiveStatus::BudgetLimited
            | ManagedObjectiveStatus::Paused
            | ManagedObjectiveStatus::Completed
            | ManagedObjectiveStatus::Failed
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(
        session_id: &str,
        owner_kind: Option<&str>,
        owner_id: Option<&str>,
    ) -> AgentRuntimeSessionObjectiveRequest {
        AgentRuntimeSessionObjectiveRequest {
            session_id: session_id.to_string(),
            owner_kind: owner_kind.map(str::to_string),
            owner_id: owner_id.map(str::to_string),
        }
    }

    #[test]
    fn audit_owner_defaults_to_agent_session() {
        let owner =
            resolve_managed_objective_audit_owner(&request("session-1", None, None), "session-1")
                .unwrap();

        assert_eq!(
            owner,
            ManagedObjectiveAuditOwner {
                owner_kind: MANAGED_OBJECTIVE_OWNER_AGENT_SESSION.to_string(),
                owner_id: "session-1".to_string(),
            }
        );
    }

    #[test]
    fn audit_owner_accepts_automation_job_target() {
        let owner = resolve_managed_objective_audit_owner(
            &request(
                "session-1",
                Some(MANAGED_OBJECTIVE_OWNER_AUTOMATION_JOB),
                Some("job-1"),
            ),
            "session-1",
        )
        .unwrap();

        assert_eq!(
            owner,
            ManagedObjectiveAuditOwner {
                owner_kind: MANAGED_OBJECTIVE_OWNER_AUTOMATION_JOB.to_string(),
                owner_id: "job-1".to_string(),
            }
        );
    }

    #[test]
    fn audit_owner_rejects_empty_automation_job_owner_id() {
        let error = resolve_managed_objective_audit_owner(
            &request(
                "session-1",
                Some(MANAGED_OBJECTIVE_OWNER_AUTOMATION_JOB),
                Some("  "),
            ),
            "session-1",
        )
        .unwrap_err();

        assert_eq!(error, "自动化目标审计缺少 owner_id");
    }

    #[test]
    fn audit_owner_rejects_unknown_owner_kind() {
        let error = resolve_managed_objective_audit_owner(
            &request("session-1", Some("legacy_goal"), Some("goal-1")),
            "session-1",
        )
        .unwrap_err();

        assert_eq!(error, "不支持的目标审计 owner_kind: legacy_goal");
    }
}
