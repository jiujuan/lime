use super::data_error;
use crate::ManagedObjectiveAuditUpdate;
use crate::RuntimeCoreError;
use app_server_protocol::AgentSessionObjectiveClearParams;
use app_server_protocol::AgentSessionObjectiveClearResponse;
use app_server_protocol::AgentSessionObjectiveReadParams;
use app_server_protocol::AgentSessionObjectiveReadResponse;
use app_server_protocol::AgentSessionObjectiveSetParams;
use app_server_protocol::AgentSessionObjectiveSetResponse;
use app_server_protocol::AgentSessionObjectiveStatusUpdateParams;
use app_server_protocol::AgentSessionObjectiveStatusUpdateResponse;
use app_server_protocol::ManagedObjective;
use app_server_protocol::ManagedObjectiveStatus;
use lime_core::database;
use lime_core::database::managed_objective_repository::clear_objective_by_owner;
use lime_core::database::managed_objective_repository::get_agent_session_workspace_id;
use lime_core::database::managed_objective_repository::get_objective_by_owner;
use lime_core::database::managed_objective_repository::update_objective_audit_by_owner;
use lime_core::database::managed_objective_repository::update_objective_status_by_owner;
use lime_core::database::managed_objective_repository::upsert_objective;
use lime_core::database::managed_objective_repository::ManagedObjectiveRecord as CoreManagedObjectiveRecord;
use lime_core::database::managed_objective_repository::ManagedObjectiveStatus as CoreManagedObjectiveStatus;
use lime_core::database::managed_objective_repository::ManagedObjectiveUpsert;
use lime_core::database::managed_objective_repository::MANAGED_OBJECTIVE_OWNER_AGENT_SESSION;
use lime_core::database::DbConnection;

pub(crate) fn read_agent_session_objective(
    db: &DbConnection,
    params: AgentSessionObjectiveReadParams,
) -> Result<AgentSessionObjectiveReadResponse, RuntimeCoreError> {
    let session_id = normalize_agent_session_objective_id(&params.session_id)?;
    let conn = database::lock_db(db).map_err(data_error)?;
    let objective =
        get_objective_by_owner(&conn, MANAGED_OBJECTIVE_OWNER_AGENT_SESSION, &session_id)
            .map_err(data_error)?
            .map(managed_objective_to_protocol);
    Ok(AgentSessionObjectiveReadResponse { objective })
}

pub(crate) fn set_agent_session_objective(
    db: &DbConnection,
    params: AgentSessionObjectiveSetParams,
) -> Result<AgentSessionObjectiveSetResponse, RuntimeCoreError> {
    let session_id = normalize_agent_session_objective_id(&params.session_id)?;
    let conn = database::lock_db(db).map_err(data_error)?;
    let workspace_id = match params.workspace_id {
        Some(workspace_id) if !workspace_id.trim().is_empty() => Some(workspace_id),
        _ => get_agent_session_workspace_id(&conn, &session_id).map_err(data_error)?,
    };
    let objective = upsert_objective(
        &conn,
        ManagedObjectiveUpsert {
            workspace_id,
            owner_kind: MANAGED_OBJECTIVE_OWNER_AGENT_SESSION.to_string(),
            owner_id: session_id,
            objective_text: params.objective_text,
            success_criteria: params.success_criteria,
            budget_policy: params.budget_policy,
            risk_policy: params.risk_policy,
            approval_policy: params.approval_policy,
            continuation_policy: params.continuation_policy,
        },
    )
    .map_err(data_error)?;
    Ok(AgentSessionObjectiveSetResponse {
        objective: managed_objective_to_protocol(objective),
    })
}

pub(crate) fn update_agent_session_objective_status(
    db: &DbConnection,
    params: AgentSessionObjectiveStatusUpdateParams,
) -> Result<AgentSessionObjectiveStatusUpdateResponse, RuntimeCoreError> {
    let session_id = normalize_agent_session_objective_id(&params.session_id)?;
    let blocker_reason = params
        .blocker_reason
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let conn = database::lock_db(db).map_err(data_error)?;
    let objective = update_objective_status_by_owner(
        &conn,
        MANAGED_OBJECTIVE_OWNER_AGENT_SESSION,
        &session_id,
        protocol_objective_status_to_core(params.status),
        blocker_reason,
    )
    .map_err(data_error)?
    .map(managed_objective_to_protocol);
    Ok(AgentSessionObjectiveStatusUpdateResponse { objective })
}

pub(crate) fn clear_agent_session_objective(
    db: &DbConnection,
    params: AgentSessionObjectiveClearParams,
) -> Result<AgentSessionObjectiveClearResponse, RuntimeCoreError> {
    let session_id = normalize_agent_session_objective_id(&params.session_id)?;
    let conn = database::lock_db(db).map_err(data_error)?;
    let cleared =
        clear_objective_by_owner(&conn, MANAGED_OBJECTIVE_OWNER_AGENT_SESSION, &session_id)
            .map_err(data_error)?;
    Ok(AgentSessionObjectiveClearResponse { cleared })
}

pub(crate) fn read_managed_objective_by_owner(
    db: &DbConnection,
    owner_kind: String,
    owner_id: String,
) -> Result<Option<ManagedObjective>, RuntimeCoreError> {
    let owner_kind = normalize_managed_objective_owner_kind(&owner_kind)?;
    let owner_id = normalize_managed_objective_owner_id(&owner_id)?;
    let conn = database::lock_db(db).map_err(data_error)?;
    get_objective_by_owner(&conn, &owner_kind, &owner_id)
        .map_err(data_error)
        .map(|objective| objective.map(managed_objective_to_protocol))
}

pub(crate) fn audit_agent_session_objective(
    db: &DbConnection,
    owner_kind: String,
    owner_id: String,
    update: ManagedObjectiveAuditUpdate,
) -> Result<Option<ManagedObjective>, RuntimeCoreError> {
    let owner_kind = normalize_managed_objective_owner_kind(&owner_kind)?;
    let owner_id = normalize_managed_objective_owner_id(&owner_id)?;
    let conn = database::lock_db(db).map_err(data_error)?;
    let objective = update_objective_audit_by_owner(
        &conn,
        &owner_kind,
        &owner_id,
        lime_core::database::managed_objective_repository::ManagedObjectiveAuditUpdate {
            status: protocol_objective_status_to_core(update.status),
            last_audit_summary: update.last_audit_summary,
            last_evidence_pack_ref: update.last_evidence_pack_ref,
            last_artifact_refs: update.last_artifact_refs,
            blocker_reason: update.blocker_reason,
        },
    )
    .map_err(data_error)?
    .map(managed_objective_to_protocol);
    Ok(objective)
}

fn normalize_agent_session_objective_id(value: &str) -> Result<String, RuntimeCoreError> {
    let session_id = value.trim();
    if session_id.is_empty() {
        return Err(RuntimeCoreError::Backend(
            "sessionId is required for agentSession/objective".to_string(),
        ));
    }
    Ok(session_id.to_string())
}

fn normalize_managed_objective_owner_kind(value: &str) -> Result<String, RuntimeCoreError> {
    let owner_kind = value.trim();
    if owner_kind.is_empty() {
        return Err(RuntimeCoreError::Backend(
            "ownerKind is required for agentSession/objective/audit".to_string(),
        ));
    }
    Ok(owner_kind.to_string())
}

fn normalize_managed_objective_owner_id(value: &str) -> Result<String, RuntimeCoreError> {
    let owner_id = value.trim();
    if owner_id.is_empty() {
        return Err(RuntimeCoreError::Backend(
            "ownerId is required for agentSession/objective/audit".to_string(),
        ));
    }
    Ok(owner_id.to_string())
}

fn protocol_objective_status_to_core(status: ManagedObjectiveStatus) -> CoreManagedObjectiveStatus {
    match status {
        ManagedObjectiveStatus::Active => CoreManagedObjectiveStatus::Active,
        ManagedObjectiveStatus::Verifying => CoreManagedObjectiveStatus::Verifying,
        ManagedObjectiveStatus::NeedsInput => CoreManagedObjectiveStatus::NeedsInput,
        ManagedObjectiveStatus::Blocked => CoreManagedObjectiveStatus::Blocked,
        ManagedObjectiveStatus::BudgetLimited => CoreManagedObjectiveStatus::BudgetLimited,
        ManagedObjectiveStatus::Paused => CoreManagedObjectiveStatus::Paused,
        ManagedObjectiveStatus::Completed => CoreManagedObjectiveStatus::Completed,
        ManagedObjectiveStatus::Failed => CoreManagedObjectiveStatus::Failed,
    }
}

fn core_objective_status_to_protocol(status: CoreManagedObjectiveStatus) -> ManagedObjectiveStatus {
    match status {
        CoreManagedObjectiveStatus::Active => ManagedObjectiveStatus::Active,
        CoreManagedObjectiveStatus::Verifying => ManagedObjectiveStatus::Verifying,
        CoreManagedObjectiveStatus::NeedsInput => ManagedObjectiveStatus::NeedsInput,
        CoreManagedObjectiveStatus::Blocked => ManagedObjectiveStatus::Blocked,
        CoreManagedObjectiveStatus::BudgetLimited => ManagedObjectiveStatus::BudgetLimited,
        CoreManagedObjectiveStatus::Paused => ManagedObjectiveStatus::Paused,
        CoreManagedObjectiveStatus::Completed => ManagedObjectiveStatus::Completed,
        CoreManagedObjectiveStatus::Failed => ManagedObjectiveStatus::Failed,
    }
}

fn managed_objective_to_protocol(record: CoreManagedObjectiveRecord) -> ManagedObjective {
    ManagedObjective {
        objective_id: record.objective_id,
        workspace_id: record.workspace_id,
        owner_kind: record.owner_kind,
        owner_id: record.owner_id,
        objective_text: record.objective_text,
        success_criteria: record.success_criteria,
        status: core_objective_status_to_protocol(record.status),
        budget_policy: record.budget_policy,
        risk_policy: record.risk_policy,
        approval_policy: record.approval_policy,
        continuation_policy: record.continuation_policy,
        last_audit_summary: record.last_audit_summary,
        last_evidence_pack_ref: record.last_evidence_pack_ref,
        last_artifact_refs: record.last_artifact_refs,
        blocker_reason: record.blocker_reason,
        created_at: record.created_at,
        updated_at: record.updated_at,
    }
}
