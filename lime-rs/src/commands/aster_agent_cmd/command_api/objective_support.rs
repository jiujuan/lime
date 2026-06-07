use crate::database::{lock_db, DbConnection};
use lime_core::database::managed_objective_repository::{
    get_agent_session_workspace_id, get_objective_by_owner, ManagedObjectiveRecord,
    MANAGED_OBJECTIVE_OWNER_AGENT_SESSION,
};

pub(crate) fn normalize_session_id(session_id: &str) -> Result<String, String> {
    let session_id = session_id.trim();
    if session_id.is_empty() {
        return Err("会话 ID 不能为空".to_string());
    }
    Ok(session_id.to_string())
}

pub(crate) fn load_active_objective(
    db: &DbConnection,
    session_id: &str,
) -> Result<ManagedObjectiveRecord, String> {
    let conn = lock_db(db)?;
    get_objective_by_owner(&conn, MANAGED_OBJECTIVE_OWNER_AGENT_SESSION, session_id)?
        .ok_or_else(|| "当前会话还没有目标".to_string())
}

pub(crate) fn resolve_objective_workspace_id(
    db: &DbConnection,
    objective: &ManagedObjectiveRecord,
) -> Result<String, String> {
    if let Some(workspace_id) = objective
        .workspace_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return Ok(workspace_id.to_string());
    }

    let conn = lock_db(db)?;
    get_agent_session_workspace_id(&conn, &objective.owner_id)?
        .filter(|workspace_id| !workspace_id.trim().is_empty())
        .ok_or_else(|| "目标 owner 会话缺少 workspace，不能继续推进目标".to_string())
}
