use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AgentThreadIncidentRecord {
    pub id: String,
    pub thread_id: String,
    pub turn_id: Option<String>,
    pub item_id: Option<String>,
    pub incident_type: String,
    pub severity: String,
    pub status: String,
    pub title: String,
    pub details_json: Option<String>,
    pub detected_at: String,
    pub cleared_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

pub struct AgentThreadIncidentDao;

impl AgentThreadIncidentDao {
    pub fn upsert_active(
        conn: &Connection,
        record: &AgentThreadIncidentRecord,
    ) -> Result<(), rusqlite::Error> {
        conn.execute(
            "INSERT INTO agent_thread_incidents (
                id, thread_id, turn_id, item_id, incident_type, severity, status, title,
                details_json, detected_at, cleared_at, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
            ON CONFLICT(id) DO UPDATE SET
                thread_id = excluded.thread_id,
                turn_id = excluded.turn_id,
                item_id = excluded.item_id,
                incident_type = excluded.incident_type,
                severity = excluded.severity,
                status = excluded.status,
                title = excluded.title,
                details_json = excluded.details_json,
                detected_at = excluded.detected_at,
                cleared_at = excluded.cleared_at,
                updated_at = excluded.updated_at",
            params![
                record.id,
                record.thread_id,
                record.turn_id,
                record.item_id,
                record.incident_type,
                record.severity,
                record.status,
                record.title,
                record.details_json,
                record.detected_at,
                record.cleared_at,
                record.created_at,
                record.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn clear(
        conn: &Connection,
        id: &str,
        cleared_at: &str,
        updated_at: &str,
    ) -> Result<bool, rusqlite::Error> {
        let changed = conn.execute(
            "UPDATE agent_thread_incidents
             SET status = 'cleared',
                 cleared_at = ?2,
                 updated_at = ?3
             WHERE id = ?1
               AND status != 'cleared'",
            params![id, cleared_at, updated_at],
        )?;
        Ok(changed > 0)
    }

    pub fn list_active_by_thread(
        conn: &Connection,
        thread_id: &str,
    ) -> Result<Vec<AgentThreadIncidentRecord>, rusqlite::Error> {
        let mut stmt = conn.prepare(
            "SELECT id, thread_id, turn_id, item_id, incident_type, severity, status, title,
                    details_json, detected_at, cleared_at, created_at, updated_at
             FROM agent_thread_incidents
             WHERE thread_id = ?1
               AND status = 'active'
             ORDER BY detected_at DESC",
        )?;

        let iter = stmt.query_map([thread_id], map_incident_row)?;
        iter.collect()
    }
}

fn map_incident_row(row: &rusqlite::Row<'_>) -> Result<AgentThreadIncidentRecord, rusqlite::Error> {
    Ok(AgentThreadIncidentRecord {
        id: row.get(0)?,
        thread_id: row.get(1)?,
        turn_id: row.get(2)?,
        item_id: row.get(3)?,
        incident_type: row.get(4)?,
        severity: row.get(5)?,
        status: row.get(6)?,
        title: row.get(7)?,
        details_json: row.get(8)?,
        detected_at: row.get(9)?,
        cleared_at: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::schema::create_tables;
    use rusqlite::Connection;

    #[test]
    fn should_upsert_and_clear_active_incident() {
        let conn = Connection::open_in_memory().expect("创建内存数据库失败");
        create_tables(&conn).expect("创建表结构失败");

        let record = AgentThreadIncidentRecord {
            id: "incident-1".to_string(),
            thread_id: "thread-1".to_string(),
            turn_id: Some("turn-1".to_string()),
            item_id: None,
            incident_type: "approval_timeout".to_string(),
            severity: "high".to_string(),
            status: "active".to_string(),
            title: "审批等待超过阈值".to_string(),
            details_json: Some(r#"{"minutes":5}"#.to_string()),
            detected_at: "2026-03-23T10:00:00Z".to_string(),
            cleared_at: None,
            created_at: "2026-03-23T10:00:00Z".to_string(),
            updated_at: "2026-03-23T10:00:00Z".to_string(),
        };

        AgentThreadIncidentDao::upsert_active(&conn, &record).expect("应成功写入 incident");
        assert_eq!(
            AgentThreadIncidentDao::list_active_by_thread(&conn, "thread-1")
                .expect("查询 active incident 应成功")
                .len(),
            1
        );

        AgentThreadIncidentDao::clear(
            &conn,
            "incident-1",
            "2026-03-23T10:03:00Z",
            "2026-03-23T10:03:00Z",
        )
        .expect("清理 incident 应成功");

        assert!(
            AgentThreadIncidentDao::list_active_by_thread(&conn, "thread-1")
                .expect("查询 active incident 应成功")
                .is_empty()
        );
    }
}
