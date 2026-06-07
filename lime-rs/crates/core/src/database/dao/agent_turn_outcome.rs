use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AgentTurnOutcomeRecord {
    pub turn_id: String,
    pub thread_id: String,
    pub outcome_type: String,
    pub summary: String,
    pub primary_cause: Option<String>,
    pub retryable: bool,
    pub details_json: Option<String>,
    pub ended_at: String,
    pub created_at: String,
    pub updated_at: String,
}

pub struct AgentTurnOutcomeDao;

impl AgentTurnOutcomeDao {
    pub fn upsert(
        conn: &Connection,
        record: &AgentTurnOutcomeRecord,
    ) -> Result<(), rusqlite::Error> {
        conn.execute(
            "INSERT INTO agent_turn_outcomes (
                turn_id, thread_id, outcome_type, summary, primary_cause, retryable,
                details_json, ended_at, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
            ON CONFLICT(turn_id) DO UPDATE SET
                thread_id = excluded.thread_id,
                outcome_type = excluded.outcome_type,
                summary = excluded.summary,
                primary_cause = excluded.primary_cause,
                retryable = excluded.retryable,
                details_json = excluded.details_json,
                ended_at = excluded.ended_at,
                updated_at = excluded.updated_at",
            params![
                record.turn_id,
                record.thread_id,
                record.outcome_type,
                record.summary,
                record.primary_cause,
                if record.retryable { 1 } else { 0 },
                record.details_json,
                record.ended_at,
                record.created_at,
                record.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn get_by_turn(
        conn: &Connection,
        turn_id: &str,
    ) -> Result<Option<AgentTurnOutcomeRecord>, rusqlite::Error> {
        conn.query_row(
            "SELECT turn_id, thread_id, outcome_type, summary, primary_cause, retryable,
                    details_json, ended_at, created_at, updated_at
             FROM agent_turn_outcomes
             WHERE turn_id = ?1",
            [turn_id],
            map_outcome_row,
        )
        .optional()
    }
}

fn map_outcome_row(row: &rusqlite::Row<'_>) -> Result<AgentTurnOutcomeRecord, rusqlite::Error> {
    Ok(AgentTurnOutcomeRecord {
        turn_id: row.get(0)?,
        thread_id: row.get(1)?,
        outcome_type: row.get(2)?,
        summary: row.get(3)?,
        primary_cause: row.get(4)?,
        retryable: row.get::<_, i64>(5)? != 0,
        details_json: row.get(6)?,
        ended_at: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::schema::create_tables;
    use rusqlite::Connection;

    #[test]
    fn should_upsert_and_query_turn_outcome() {
        let conn = Connection::open_in_memory().expect("创建内存数据库失败");
        create_tables(&conn).expect("创建表结构失败");

        let record = AgentTurnOutcomeRecord {
            turn_id: "turn-1".to_string(),
            thread_id: "thread-1".to_string(),
            outcome_type: "failed_provider".to_string(),
            summary: "Provider 请求失败".to_string(),
            primary_cause: Some("429 rate limit".to_string()),
            retryable: true,
            details_json: Some(r#"{"source":"test"}"#.to_string()),
            ended_at: "2026-03-23T10:00:00Z".to_string(),
            created_at: "2026-03-23T10:00:00Z".to_string(),
            updated_at: "2026-03-23T10:00:00Z".to_string(),
        };

        AgentTurnOutcomeDao::upsert(&conn, &record).expect("首次 upsert 应成功");

        let updated = AgentTurnOutcomeRecord {
            summary: "Provider 请求失败（已重试）".to_string(),
            updated_at: "2026-03-23T10:01:00Z".to_string(),
            ..record.clone()
        };

        AgentTurnOutcomeDao::upsert(&conn, &updated).expect("二次 upsert 应成功");

        let stored = AgentTurnOutcomeDao::get_by_turn(&conn, "turn-1")
            .expect("查询 outcome 应成功")
            .expect("应存在 outcome");

        assert_eq!(stored.summary, "Provider 请求失败（已重试）");
        assert_eq!(stored.primary_cause.as_deref(), Some("429 rate limit"));
        assert!(stored.retryable);
    }
}
