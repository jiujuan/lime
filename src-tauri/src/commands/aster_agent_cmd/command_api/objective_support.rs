use crate::database::{lock_db, DbConnection};
use lime_core::database::managed_objective_repository::{
    get_objective_by_owner, ManagedObjectiveRecord, MANAGED_OBJECTIVE_OWNER_AGENT_SESSION,
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
