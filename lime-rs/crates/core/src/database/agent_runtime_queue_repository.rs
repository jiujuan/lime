//! Agent runtime queue legacy 数据访问边界。
//!
//! 统一收口旧 `agent_runtime_queued_turns` 表的读取、校验与删除，
//! 避免上层业务边界继续散落 legacy SQL 和表名。

use rusqlite::Connection;
use serde_json::Value;

const LEGACY_RUNTIME_QUEUE_TABLE: &str = "agent_runtime_queued_turns";
const LEGACY_RUNTIME_QUEUE_SESSION_INDEX: &str = "idx_agent_runtime_queued_turns_session";

#[derive(Debug, Clone, PartialEq)]
pub struct LegacyRuntimeQueuedTurn {
    pub queued_turn_id: String,
    pub session_id: String,
    pub event_name: String,
    pub message_preview: String,
    pub message_text: String,
    pub payload: Value,
    pub image_count: usize,
    pub created_at: i64,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct LegacyRuntimeQueueSession {
    pub session_id: String,
    pub turns: Vec<LegacyRuntimeQueuedTurn>,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct LegacyRuntimeQueueSnapshot {
    pub sessions: Vec<LegacyRuntimeQueueSession>,
    pub invalid_turn_count: usize,
}

#[derive(Debug)]
struct LegacyRuntimeQueuedTurnRecord {
    queued_turn_id: String,
    session_id: String,
    event_name: String,
    message_preview: String,
    message_text: String,
    payload_json: String,
    image_count: usize,
    created_at: i64,
}

pub fn load_legacy_runtime_queue_snapshot(
    conn: &Connection,
) -> Result<Option<LegacyRuntimeQueueSnapshot>, String> {
    if !legacy_runtime_queue_table_exists(conn)? {
        return Ok(None);
    }

    let mut stmt = conn
        .prepare(
            "SELECT
                queued_turn_id,
                session_id,
                event_name,
                message_preview,
                message_text,
                payload_json,
                image_count,
                created_at
             FROM agent_runtime_queued_turns
             ORDER BY session_id ASC, id ASC",
        )
        .map_err(|error| format!("读取 legacy 排队 turn 失败: {error}"))?;
    let rows = stmt
        .query_map([], |row| {
            Ok(LegacyRuntimeQueuedTurnRecord {
                queued_turn_id: row.get(0)?,
                session_id: row.get(1)?,
                event_name: row.get(2)?,
                message_preview: row.get(3)?,
                message_text: row.get(4)?,
                payload_json: row.get(5)?,
                image_count: row.get::<_, i64>(6)? as usize,
                created_at: row.get(7)?,
            })
        })
        .map_err(|error| format!("读取 legacy 排队 turn 失败: {error}"))?;

    let mut sessions = Vec::new();
    let mut invalid_turn_count = 0usize;

    for row in rows {
        let record = row.map_err(|error| format!("读取 legacy 排队 turn 失败: {error}"))?;
        match serde_json::from_str::<Value>(&record.payload_json) {
            Ok(payload) => {
                if sessions
                    .last()
                    .map(|session: &LegacyRuntimeQueueSession| session.session_id.as_str())
                    != Some(record.session_id.as_str())
                {
                    sessions.push(LegacyRuntimeQueueSession {
                        session_id: record.session_id.clone(),
                        turns: Vec::new(),
                    });
                }

                if let Some(session) = sessions.last_mut() {
                    session.turns.push(LegacyRuntimeQueuedTurn {
                        queued_turn_id: record.queued_turn_id,
                        session_id: record.session_id,
                        event_name: record.event_name,
                        message_preview: record.message_preview,
                        message_text: record.message_text,
                        payload,
                        image_count: record.image_count,
                        created_at: record.created_at,
                    });
                }
            }
            Err(error) => {
                invalid_turn_count += 1;
                tracing::warn!(
                    "[AgentRuntimeQueueRepository] 跳过损坏的 legacy 排队 turn: session_id={}, queued_turn_id={}, error={}",
                    record.session_id,
                    record.queued_turn_id,
                    error
                );
            }
        }
    }

    Ok(Some(LegacyRuntimeQueueSnapshot {
        sessions,
        invalid_turn_count,
    }))
}

pub fn drop_legacy_runtime_queue_table(conn: &Connection) -> Result<(), String> {
    if !legacy_runtime_queue_table_exists(conn)? {
        return Ok(());
    }

    conn.execute_batch(
        "DROP INDEX IF EXISTS idx_agent_runtime_queued_turns_session;
         DROP TABLE IF EXISTS agent_runtime_queued_turns;",
    )
    .map_err(|error| format!("删除 legacy 排队表失败: {error}"))?;

    tracing::info!(
        "[AgentRuntimeQueueRepository] 已删除 legacy 排队表: table={}, index={}",
        LEGACY_RUNTIME_QUEUE_TABLE,
        LEGACY_RUNTIME_QUEUE_SESSION_INDEX
    );
    Ok(())
}

fn legacy_runtime_queue_table_exists(conn: &Connection) -> Result<bool, String> {
    match conn.query_row(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1 LIMIT 1",
        [LEGACY_RUNTIME_QUEUE_TABLE],
        |_| Ok(()),
    ) {
        Ok(()) => Ok(true),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(false),
        Err(error) => Err(format!("检测 legacy 排队表失败: {error}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_legacy_runtime_queue_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "
            CREATE TABLE agent_runtime_queued_turns (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                queued_turn_id TEXT NOT NULL,
                session_id TEXT NOT NULL,
                event_name TEXT NOT NULL,
                message_preview TEXT NOT NULL,
                message_text TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                image_count INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL
            );
            CREATE INDEX idx_agent_runtime_queued_turns_session
            ON agent_runtime_queued_turns(session_id);
            ",
        )
        .unwrap();
        conn
    }

    #[test]
    fn load_legacy_runtime_queue_snapshot_groups_sessions_and_skips_invalid_payloads() {
        let conn = setup_legacy_runtime_queue_db();
        conn.execute(
            "INSERT INTO agent_runtime_queued_turns
             (queued_turn_id, session_id, event_name, message_preview, message_text, payload_json, image_count, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            (
                "turn-1",
                "session-a",
                "agent_stream",
                "preview-1",
                "message-1",
                r#"{"message":"ok"}"#,
                1i64,
                100i64,
            ),
        )
        .unwrap();
        conn.execute(
            "INSERT INTO agent_runtime_queued_turns
             (queued_turn_id, session_id, event_name, message_preview, message_text, payload_json, image_count, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            (
                "turn-2",
                "session-b",
                "agent_stream",
                "preview-2",
                "message-2",
                "not-json",
                0i64,
                200i64,
            ),
        )
        .unwrap();

        let snapshot = load_legacy_runtime_queue_snapshot(&conn)
            .unwrap()
            .expect("snapshot should exist");

        assert_eq!(snapshot.invalid_turn_count, 1);
        assert_eq!(snapshot.sessions.len(), 1);
        assert_eq!(snapshot.sessions[0].session_id, "session-a");
        assert_eq!(snapshot.sessions[0].turns.len(), 1);
        assert_eq!(snapshot.sessions[0].turns[0].queued_turn_id, "turn-1");
        assert_eq!(
            snapshot.sessions[0].turns[0].payload,
            serde_json::json!({ "message": "ok" })
        );
    }

    #[test]
    fn drop_legacy_runtime_queue_table_removes_table_and_index() {
        let conn = setup_legacy_runtime_queue_db();
        drop_legacy_runtime_queue_table(&conn).unwrap();

        let table_exists = conn
            .query_row(
                "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1 LIMIT 1",
                [LEGACY_RUNTIME_QUEUE_TABLE],
                |_| Ok(()),
            )
            .is_ok();

        assert!(!table_exists);
    }
}
