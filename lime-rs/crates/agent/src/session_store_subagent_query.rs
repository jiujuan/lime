//! Subagent session DB read model.
//!
//! The UI-visible subagent list reads current `agent_sessions` rows directly.
//! Agent session queries stay out of this path.

use lime_core::database::{lock_db, DbConnection};
use rusqlite::OptionalExtension;

use super::session_store_subagent_context::SubagentSessionProjection;
use super::session_store_subagent_projection::project_session_record_subagent_session;
use crate::session_record_sql::{
    load_session_record_rows, map_session_record_row, SESSION_RECORD_SELECT_COLUMNS,
};

const SUBAGENT_SESSION_TYPE: &str = "sub_agent";

pub(super) fn load_child_subagent_session_projections(
    db: &DbConnection,
    parent_session_id: &str,
) -> Result<Vec<SubagentSessionProjection>, String> {
    let parent_session_id = parent_session_id.trim();
    if parent_session_id.is_empty() {
        return Ok(Vec::new());
    }

    let conn = lock_db(db)?;
    let sql = format!(
        "SELECT {SESSION_RECORD_SELECT_COLUMNS}
         FROM agent_sessions
         WHERE session_type = ?1
         ORDER BY updated_at DESC"
    );
    let rows = load_session_record_rows(&conn, &sql, [SUBAGENT_SESSION_TYPE])
        .map_err(|error| format!("读取 child subagent sessions 失败: {error}"))?;

    Ok(rows
        .into_iter()
        .filter_map(project_session_record_subagent_session)
        .filter(|session| session.presentation.parent_session_id == parent_session_id)
        .collect())
}

pub(super) fn read_subagent_session_projection(
    db: &DbConnection,
    session_id: &str,
    error_context: &str,
) -> Result<Option<SubagentSessionProjection>, String> {
    let conn = lock_db(db)?;
    let sql = format!("SELECT {SESSION_RECORD_SELECT_COLUMNS} FROM agent_sessions WHERE id = ?1");
    let mut stmt = conn
        .prepare(&sql)
        .map_err(|error| format!("{error_context}: {error}"))?;
    let row = stmt
        .query_row([session_id], map_session_record_row)
        .optional()
        .map_err(|error| format!("{error_context}: {error}"))?;

    Ok(row.and_then(project_session_record_subagent_session))
}

pub(super) fn read_session_name_projection(
    db: &DbConnection,
    session_id: &str,
    error_context: &str,
) -> Result<Option<String>, String> {
    let conn = lock_db(db)?;
    let sql = format!("SELECT {SESSION_RECORD_SELECT_COLUMNS} FROM agent_sessions WHERE id = ?1");
    let mut stmt = conn
        .prepare(&sql)
        .map_err(|error| format!("{error_context}: {error}"))?;
    let row = stmt
        .query_row([session_id], map_session_record_row)
        .optional()
        .map_err(|error| format!("{error_context}: {error}"))?;

    Ok(row.map(|row| row.project().title))
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use std::sync::{Arc, Mutex};

    fn create_agent_sessions_table(conn: &Connection) {
        conn.execute(
            "CREATE TABLE agent_sessions (
                id TEXT PRIMARY KEY,
                model TEXT NOT NULL,
                title TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                working_dir TEXT,
                session_type TEXT NOT NULL,
                user_set_name INTEGER NOT NULL DEFAULT 0,
                extension_data_json TEXT NOT NULL DEFAULT '{}',
                total_tokens INTEGER,
                input_tokens INTEGER,
                output_tokens INTEGER,
                cached_input_tokens INTEGER,
                cache_creation_input_tokens INTEGER,
                accumulated_total_tokens INTEGER,
                accumulated_input_tokens INTEGER,
                accumulated_output_tokens INTEGER,
                schedule_id TEXT,
                recipe_json TEXT,
                user_recipe_values_json TEXT,
                provider_name TEXT,
                model_config_json TEXT
            )",
            [],
        )
        .expect("create agent_sessions");
    }

    fn insert_session(
        conn: &Connection,
        id: &str,
        title: &str,
        session_type: &str,
        updated_at: &str,
        extension_data_json: &str,
    ) {
        conn.execute(
            "INSERT INTO agent_sessions (
                id, model, title, created_at, updated_at, working_dir,
                session_type, user_set_name, extension_data_json, provider_name
            ) VALUES (?1, 'gpt-5.1', ?2, '2026-07-01T00:00:00Z', ?3, '/tmp/project',
                ?4, 0, ?5, 'openai')",
            rusqlite::params![id, title, updated_at, session_type, extension_data_json],
        )
        .expect("insert session");
    }

    fn child_extension(parent_session_id: &str) -> String {
        serde_json::json!({
            "subagent_session.v0": {
                "parent_session_id": parent_session_id,
                "origin_tool": "Agent",
                "task_summary": "检查迁移"
            }
        })
        .to_string()
    }

    #[test]
    fn loads_child_subagent_sessions_from_current_agent_sessions() {
        let conn = Connection::open_in_memory().expect("open db");
        create_agent_sessions_table(&conn);
        insert_session(
            &conn,
            "parent-1",
            "父会话",
            "user",
            "2026-07-01T00:00:00Z",
            "{}",
        );
        insert_session(
            &conn,
            "child-old",
            "旧子代理",
            SUBAGENT_SESSION_TYPE,
            "2026-07-02T00:00:00Z",
            &child_extension("parent-2"),
        );
        insert_session(
            &conn,
            "child-new",
            "新子代理",
            SUBAGENT_SESSION_TYPE,
            "2026-07-03T00:00:00Z",
            &child_extension("parent-1"),
        );

        let db = Arc::new(Mutex::new(conn));
        let sessions =
            load_child_subagent_session_projections(&db, "parent-1").expect("load children");

        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].id, "child-new");
        assert_eq!(sessions[0].presentation.parent_session_id, "parent-1");
        assert_eq!(
            sessions[0].presentation.task_summary.as_deref(),
            Some("检查迁移")
        );
    }

    #[test]
    fn reads_parent_session_name_from_current_agent_sessions() {
        let conn = Connection::open_in_memory().expect("open db");
        create_agent_sessions_table(&conn);
        insert_session(
            &conn,
            "parent-1",
            " 父会话 ",
            "user",
            "2026-07-01T00:00:00Z",
            "{}",
        );
        let db = Arc::new(Mutex::new(conn));

        let name = read_session_name_projection(&db, "parent-1", "读取 parent session 失败")
            .expect("read parent");

        assert_eq!(name.as_deref(), Some("父会话"));
    }
}
