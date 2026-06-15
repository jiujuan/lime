use super::data_error;
use super::workspaces;
use crate::LegacyAgentMessage;
use crate::LegacyAgentSessionTranscript;
use crate::RuntimeCoreError;
use app_server_protocol::AgentSessionListParams;
use lime_core::database;
use lime_core::database::DbConnection;
use rusqlite::params;
use rusqlite::OptionalExtension;
use rusqlite::Row;
use serde_json::Value;

const LEGACY_MESSAGE_LIST_MAX_LIMIT: usize = 1_000;

pub(crate) fn list_legacy_agent_message_transcripts(
    db: &DbConnection,
    params: AgentSessionListParams,
) -> Result<Vec<LegacyAgentSessionTranscript>, RuntimeCoreError> {
    let workspace_id = workspaces::normalize_workspace_filter(params.workspace_id.as_deref());
    let include_archived = params.include_archived.unwrap_or(false);
    let archived_only = params.archived_only.unwrap_or(false);
    let limit = params
        .limit
        .map(|value| (value as usize).min(LEGACY_MESSAGE_LIST_MAX_LIMIT));
    let conn = database::lock_db(db).map_err(data_error)?;
    if !legacy_agent_message_tables_available(&conn).map_err(data_error)? {
        return Ok(Vec::new());
    }
    let mut sessions = query_legacy_message_only_session_rows(
        &conn,
        include_archived,
        archived_only,
        workspace_id,
        limit,
    )
    .map_err(data_error)?;
    for session in &mut sessions {
        session.messages =
            query_legacy_agent_messages(&conn, &session.session_id).map_err(data_error)?;
    }
    Ok(sessions)
}

pub(crate) fn read_legacy_agent_message_transcript(
    db: &DbConnection,
    session_id: &str,
) -> Result<Option<LegacyAgentSessionTranscript>, RuntimeCoreError> {
    let conn = database::lock_db(db).map_err(data_error)?;
    if !legacy_agent_message_tables_available(&conn).map_err(data_error)? {
        return Ok(None);
    }
    let Some(mut session) =
        query_legacy_message_only_session_row(&conn, session_id).map_err(data_error)?
    else {
        return Ok(None);
    };
    session.messages =
        query_legacy_agent_messages(&conn, &session.session_id).map_err(data_error)?;
    Ok(Some(session))
}

pub(crate) fn clear_legacy_agent_message_sessions(
    db: &DbConnection,
    session_ids: &[String],
) -> Result<usize, RuntimeCoreError> {
    if session_ids.is_empty() {
        return Ok(0);
    }
    let mut conn = database::lock_db(db).map_err(data_error)?;
    if !legacy_agent_message_tables_available(&conn).map_err(data_error)? {
        return Ok(0);
    }
    let tx = conn.transaction().map_err(data_error)?;
    let mut deleted = 0usize;
    for session_id in session_ids {
        let normalized = session_id.trim();
        if normalized.is_empty() {
            continue;
        }
        deleted += tx
            .execute(
                "DELETE FROM a2ui_forms
                 WHERE session_id = ?1
                   AND NOT EXISTS (SELECT 1 FROM agent_thread_turns t WHERE t.session_id = ?1)
                   AND NOT EXISTS (SELECT 1 FROM agent_thread_items i WHERE i.session_id = ?1)",
                params![normalized],
            )
            .map_err(data_error)?;
        deleted += tx
            .execute(
                "DELETE FROM agent_messages
                 WHERE session_id = ?1
                   AND EXISTS (SELECT 1 FROM agent_sessions s WHERE s.id = ?1)
                   AND NOT EXISTS (SELECT 1 FROM agent_thread_turns t WHERE t.session_id = ?1)
                   AND NOT EXISTS (SELECT 1 FROM agent_thread_items i WHERE i.session_id = ?1)",
                params![normalized],
            )
            .map_err(data_error)?;
        deleted += tx
            .execute(
                "DELETE FROM agent_sessions
                 WHERE id = ?1
                   AND NOT EXISTS (SELECT 1 FROM agent_messages m WHERE m.session_id = ?1)
                   AND NOT EXISTS (SELECT 1 FROM agent_thread_turns t WHERE t.session_id = ?1)
                   AND NOT EXISTS (SELECT 1 FROM agent_thread_items i WHERE i.session_id = ?1)",
                params![normalized],
            )
            .map_err(data_error)?;
    }
    tx.commit().map_err(data_error)?;
    Ok(deleted)
}

pub(crate) fn drop_empty_legacy_agent_message_tables(
    db: &DbConnection,
) -> Result<usize, RuntimeCoreError> {
    let conn = database::lock_db(db).map_err(data_error)?;
    for table_name in ["agent_messages", "a2ui_forms"] {
        if !table_exists(&conn, table_name).map_err(data_error)? {
            continue;
        }
        let count = table_row_count(&conn, table_name).map_err(data_error)?;
        if count > 0 {
            return Err(RuntimeCoreError::Backend(format!(
                "refuse to drop {table_name}: {count} rows remain"
            )));
        }
    }
    let mut dropped = 0usize;
    for table_name in ["a2ui_forms", "agent_messages"] {
        if table_exists(&conn, table_name).map_err(data_error)? {
            conn.execute(drop_legacy_table_sql(table_name), [])
                .map_err(data_error)?;
            dropped += 1;
        }
    }
    Ok(dropped)
}

fn query_legacy_message_only_session_rows(
    conn: &rusqlite::Connection,
    include_archived: bool,
    archived_only: bool,
    workspace_id: Option<&str>,
    limit: Option<usize>,
) -> Result<Vec<LegacyAgentSessionTranscript>, String> {
    let limit = limit.unwrap_or(LEGACY_MESSAGE_LIST_MAX_LIMIT);
    let mut stmt = conn
        .prepare(
            "SELECT
                s.id,
                s.title,
                s.model,
                s.created_at,
                s.updated_at,
                s.archived_at,
                w.id AS workspace_id,
                s.working_dir,
                s.execution_strategy,
                s.provider_name
             FROM agent_sessions s
             LEFT JOIN workspaces w ON w.root_path = s.working_dir
             WHERE (
                    (?1 = 1 AND s.archived_at IS NOT NULL)
                    OR (?1 = 0 AND (?2 = 1 OR s.archived_at IS NULL))
                )
               AND (?3 IS NULL OR w.id = ?3)
               AND EXISTS (SELECT 1 FROM agent_messages m WHERE m.session_id = s.id)
               AND NOT EXISTS (SELECT 1 FROM agent_thread_turns t WHERE t.session_id = s.id)
               AND NOT EXISTS (SELECT 1 FROM agent_thread_items i WHERE i.session_id = s.id)
               AND NOT (
                    s.model = 'lime-fixture-chat'
                    OR s.title LIKE 'Agent QC approval %'
                    OR s.title LIKE 'Code runtime fixture %'
                    OR instr(s.id, 'title-gen-') = 1
                    OR instr(s.id, 'persona-gen-') = 1
                    OR instr(s.id, 'knowledge-builder-session-') = 1
                    OR instr(s.id, '__lime_theme_context_search__-') = 1
                    OR instr(s.id, 'persisted-usage-') = 1
                    OR CASE
                        WHEN json_valid(s.extension_data_json) THEN
                            COALESCE(json_extract(s.extension_data_json, '$.\"lime_harness.v0\".hiddenFromUserRecents') = 1, 0)
                            OR COALESCE(json_extract(s.extension_data_json, '$.\"lime_harness.v0\".hidden_from_user_recents') = 1, 0)
                        ELSE 0
                    END
                )
             ORDER BY s.updated_at DESC, s.id DESC
             LIMIT ?4",
        )
        .map_err(|error| format!("prepare legacy message transcript list failed: {error}"))?;
    let rows = stmt
        .query_map(
            params![archived_only, include_archived, workspace_id, limit as i64],
            legacy_session_transcript_row,
        )
        .map_err(|error| format!("query legacy message transcript list failed: {error}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("read legacy message transcript list failed: {error}"))
}

fn table_exists(conn: &rusqlite::Connection, table_name: &str) -> Result<bool, String> {
    conn.query_row(
        "SELECT EXISTS(
            SELECT 1 FROM sqlite_master
            WHERE type = 'table' AND name = ?1
        )",
        params![table_name],
        |row| row.get::<_, bool>(0),
    )
    .map_err(|error| format!("check legacy table existence failed: {error}"))
}

fn legacy_agent_message_tables_available(conn: &rusqlite::Connection) -> Result<bool, String> {
    Ok(table_exists(conn, "agent_messages")? && table_exists(conn, "a2ui_forms")?)
}

fn table_row_count(conn: &rusqlite::Connection, table_name: &str) -> Result<i64, String> {
    let sql = format!("SELECT COUNT(1) FROM {table_name}");
    conn.query_row(&sql, [], |row| row.get::<_, i64>(0))
        .map_err(|error| format!("count legacy table rows failed: {error}"))
}

fn drop_legacy_table_sql(table_name: &str) -> &'static str {
    match table_name {
        "a2ui_forms" => "DROP TABLE a2ui_forms",
        "agent_messages" => "DROP TABLE agent_messages",
        _ => unreachable!("legacy table name is fixed by migration source"),
    }
}

fn query_legacy_message_only_session_row(
    conn: &rusqlite::Connection,
    session_id: &str,
) -> Result<Option<LegacyAgentSessionTranscript>, String> {
    conn.query_row(
        "SELECT
            s.id,
            s.title,
            s.model,
            s.created_at,
            s.updated_at,
            s.archived_at,
            w.id AS workspace_id,
            s.working_dir,
            s.execution_strategy,
            s.provider_name
         FROM agent_sessions s
         LEFT JOIN workspaces w ON w.root_path = s.working_dir
         WHERE s.id = ?1
           AND EXISTS (SELECT 1 FROM agent_messages m WHERE m.session_id = s.id)
           AND NOT EXISTS (SELECT 1 FROM agent_thread_turns t WHERE t.session_id = s.id)
           AND NOT EXISTS (SELECT 1 FROM agent_thread_items i WHERE i.session_id = s.id)",
        params![session_id],
        legacy_session_transcript_row,
    )
    .optional()
    .map_err(|error| format!("read legacy message transcript failed: {error}"))
}

fn legacy_session_transcript_row(
    row: &Row<'_>,
) -> Result<LegacyAgentSessionTranscript, rusqlite::Error> {
    Ok(LegacyAgentSessionTranscript {
        session_id: row.get(0)?,
        title: row.get(1)?,
        model: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
        archived_at: row.get(5)?,
        workspace_id: row.get(6)?,
        working_dir: row.get(7)?,
        execution_strategy: row.get(8)?,
        provider_name: row.get(9)?,
        messages: Vec::new(),
    })
}

fn query_legacy_agent_messages(
    conn: &rusqlite::Connection,
    session_id: &str,
) -> Result<Vec<LegacyAgentMessage>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, role, content_json, timestamp
             FROM agent_messages
             WHERE session_id = ?1
             ORDER BY id ASC",
        )
        .map_err(|error| format!("prepare legacy agent messages failed: {error}"))?;
    let rows = stmt
        .query_map(params![session_id], |row| {
            let content_json: String = row.get(2)?;
            Ok(LegacyAgentMessage {
                message_id: row.get(0)?,
                role: row.get(1)?,
                text: legacy_message_text(&content_json),
                timestamp: row.get(3)?,
            })
        })
        .map_err(|error| format!("query legacy agent messages failed: {error}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("read legacy agent messages failed: {error}"))
}

fn legacy_message_text(content_json: &str) -> String {
    if let Ok(text) = serde_json::from_str::<String>(content_json) {
        return text.trim().to_string();
    }
    let Ok(value) = serde_json::from_str::<Value>(content_json) else {
        return content_json.trim().to_string();
    };
    let mut texts = Vec::new();
    collect_legacy_text(&value, &mut texts, 0);
    texts
        .into_iter()
        .map(|text| text.trim().to_string())
        .filter(|text| !text.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

fn collect_legacy_text(value: &Value, texts: &mut Vec<String>, depth: usize) {
    if depth > 12 {
        return;
    }
    match value {
        Value::String(text) => texts.push(text.clone()),
        Value::Array(items) => {
            for item in items {
                collect_legacy_text(item, texts, depth + 1);
            }
        }
        Value::Object(object) => {
            for key in [
                "text",
                "content",
                "message",
                "output",
                "output_text",
                "outputText",
            ] {
                if let Some(text) = object.get(key).and_then(Value::as_str) {
                    texts.push(text.to_string());
                }
            }
            if let Some(content) = object.get("content").filter(|value| !value.is_string()) {
                collect_legacy_text(content, texts, depth + 1);
            }
            if let Some(value) = object.get("value") {
                collect_legacy_text(value, texts, depth + 1);
            }
            if let Some(text) = object
                .get("Text")
                .and_then(|value| value.as_str().or_else(|| value.get("text")?.as_str()))
            {
                texts.push(text.to_string());
            }
        }
        _ => {}
    }
}
