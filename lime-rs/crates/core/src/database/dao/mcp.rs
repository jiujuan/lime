use crate::models::McpServer;
use rusqlite::types::Value as SqlValue;
use rusqlite::{params, Connection};
use serde_json::Value as JsonValue;

pub struct McpDao;

impl McpDao {
    pub fn get_all(conn: &Connection) -> Result<Vec<McpServer>, rusqlite::Error> {
        let mut stmt = conn.prepare(
            "SELECT id, name, server_config, description, enabled_lime,
                    enabled_claude, enabled_codex, enabled_gemini, created_at
             FROM mcp_servers ORDER BY created_at",
        )?;

        let servers = stmt.query_map([], |row| {
            let config_str: String = row.get(2)?;
            let server_config: JsonValue =
                serde_json::from_str(&config_str).unwrap_or(JsonValue::Null);
            let created_at_raw: Option<SqlValue> = row.get(8)?;

            Ok(McpServer {
                id: row.get(0)?,
                name: row.get(1)?,
                server_config,
                description: row.get(3)?,
                enabled_lime: row.get::<_, i32>(4)? == 1,
                enabled_claude: row.get::<_, i32>(5)? == 1,
                enabled_codex: row.get::<_, i32>(6)? == 1,
                enabled_gemini: row.get::<_, i32>(7)? == 1,
                created_at: created_at_raw.and_then(normalize_created_at),
            })
        })?;

        servers.collect()
    }

    pub fn insert(conn: &Connection, server: &McpServer) -> Result<(), rusqlite::Error> {
        conn.execute(
            "INSERT INTO mcp_servers (id, name, server_config, description,
                                     enabled_lime, enabled_claude, enabled_codex,
                                     enabled_gemini, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                server.id,
                server.name,
                serde_json::to_string(&server.server_config).unwrap_or_default(),
                server.description,
                if server.enabled_lime { 1 } else { 0 },
                if server.enabled_claude { 1 } else { 0 },
                if server.enabled_codex { 1 } else { 0 },
                if server.enabled_gemini { 1 } else { 0 },
                server.created_at,
            ],
        )?;
        Ok(())
    }

    pub fn update(conn: &Connection, server: &McpServer) -> Result<(), rusqlite::Error> {
        conn.execute(
            "UPDATE mcp_servers SET name = ?1, server_config = ?2, description = ?3,
             enabled_lime = ?4, enabled_claude = ?5, enabled_codex = ?6, enabled_gemini = ?7
             WHERE id = ?8",
            params![
                server.name,
                serde_json::to_string(&server.server_config).unwrap_or_default(),
                server.description,
                if server.enabled_lime { 1 } else { 0 },
                if server.enabled_claude { 1 } else { 0 },
                if server.enabled_codex { 1 } else { 0 },
                if server.enabled_gemini { 1 } else { 0 },
                server.id,
            ],
        )?;
        Ok(())
    }

    pub fn delete(conn: &Connection, id: &str) -> Result<(), rusqlite::Error> {
        conn.execute("DELETE FROM mcp_servers WHERE id = ?", [id])?;
        Ok(())
    }

    pub fn toggle_enabled(
        conn: &Connection,
        id: &str,
        app_type: &str,
        enabled: bool,
    ) -> Result<(), rusqlite::Error> {
        let column = match app_type {
            "lime" => "enabled_lime",
            "claude" => "enabled_claude",
            "codex" => "enabled_codex",
            "gemini" => "enabled_gemini",
            _ => {
                return Err(rusqlite::Error::InvalidParameterName(format!(
                    "Invalid app_type: {app_type}"
                )))
            }
        };

        let sql = format!("UPDATE mcp_servers SET {column} = ? WHERE id = ?");
        conn.execute(&sql, params![if enabled { 1 } else { 0 }, id])?;
        Ok(())
    }
}

fn normalize_created_at(value: SqlValue) -> Option<i64> {
    match value {
        SqlValue::Integer(ts) => Some(ts),
        SqlValue::Real(ts) => Some(ts as i64),
        SqlValue::Text(text) => parse_timestamp_text(&text),
        SqlValue::Null | SqlValue::Blob(_) => None,
    }
}

fn parse_timestamp_text(text: &str) -> Option<i64> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return None;
    }

    if let Ok(ts) = trimmed.parse::<i64>() {
        return Some(ts);
    }

    chrono::DateTime::parse_from_rfc3339(trimmed)
        .ok()
        .map(|dt| dt.timestamp())
}

#[cfg(test)]
mod tests {
    use super::McpDao;
    use rusqlite::Connection;
    use serde_json::json;

    fn setup_conn() -> Connection {
        let conn = Connection::open_in_memory().expect("创建内存数据库失败");
        conn.execute(
            "CREATE TABLE mcp_servers (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                server_config TEXT NOT NULL,
                description TEXT,
                enabled_lime INTEGER DEFAULT 0,
                enabled_claude INTEGER DEFAULT 0,
                enabled_codex INTEGER DEFAULT 0,
                enabled_gemini INTEGER DEFAULT 0,
                created_at
            )",
            [],
        )
        .expect("创建 mcp_servers 表失败");
        conn
    }

    #[test]
    fn get_all_should_parse_integer_created_at() {
        let conn = setup_conn();
        conn.execute(
            "INSERT INTO mcp_servers (
                id, name, server_config, description,
                enabled_lime, enabled_claude, enabled_codex, enabled_gemini, created_at
            ) VALUES (?1, ?2, ?3, ?4, 1, 0, 0, 0, ?5)",
            rusqlite::params![
                "srv-int",
                "int-server",
                json!({"command":"npx"}).to_string(),
                "desc",
                1_710_000_000_i64
            ],
        )
        .expect("插入整数 created_at 数据失败");

        let servers = McpDao::get_all(&conn).expect("查询服务器失败");
        assert_eq!(servers.len(), 1);
        assert_eq!(servers[0].created_at, Some(1_710_000_000));
    }

    #[test]
    fn get_all_should_parse_rfc3339_created_at() {
        let conn = setup_conn();
        conn.execute(
            "INSERT INTO mcp_servers (
                id, name, server_config, description,
                enabled_lime, enabled_claude, enabled_codex, enabled_gemini, created_at
            ) VALUES (?1, ?2, ?3, ?4, 1, 0, 0, 0, ?5)",
            rusqlite::params![
                "srv-text",
                "text-server",
                json!({"command":"npx"}).to_string(),
                "desc",
                "2026-03-04T01:19:53.599Z"
            ],
        )
        .expect("插入文本 created_at 数据失败");

        let servers = McpDao::get_all(&conn).expect("查询服务器失败");
        assert_eq!(servers.len(), 1);
        assert_eq!(servers[0].created_at, Some(1_772_587_193));
    }
}
