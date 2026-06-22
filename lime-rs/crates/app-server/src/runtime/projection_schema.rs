use rusqlite::Connection;

pub(super) fn create_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        PRAGMA user_version = 1;

        CREATE TABLE IF NOT EXISTS projected_sessions (
            session_id TEXT PRIMARY KEY,
            thread_id TEXT NOT NULL,
            status TEXT NOT NULL,
            created_at TEXT,
            updated_at TEXT NOT NULL,
            archived_at TEXT,
            title TEXT,
            model TEXT,
            workspace_id TEXT,
            working_dir TEXT,
            execution_strategy TEXT,
            metadata_json TEXT,
            last_event_sequence INTEGER NOT NULL DEFAULT 0,
            last_event_id TEXT
        );

        CREATE TABLE IF NOT EXISTS projected_turns (
            turn_id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            thread_id TEXT NOT NULL,
            status TEXT NOT NULL,
            started_at TEXT,
            completed_at TEXT,
            last_event_sequence INTEGER NOT NULL,
            FOREIGN KEY(session_id) REFERENCES projected_sessions(session_id)
        );

        CREATE TABLE IF NOT EXISTS projected_items (
            event_id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            thread_id TEXT NOT NULL,
            turn_id TEXT,
            sequence INTEGER NOT NULL,
            item_type TEXT NOT NULL,
            payload_summary_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL,
            FOREIGN KEY(session_id) REFERENCES projected_sessions(session_id)
        );

        CREATE TABLE IF NOT EXISTS projection_watermarks (
            session_id TEXT PRIMARY KEY,
            last_sequence INTEGER NOT NULL,
            last_event_id TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_projected_sessions_updated
            ON projected_sessions(updated_at DESC);

        CREATE INDEX IF NOT EXISTS idx_projected_turns_session_sequence
            ON projected_turns(session_id, last_event_sequence);

        CREATE INDEX IF NOT EXISTS idx_projected_items_session_sequence
            ON projected_items(session_id, sequence);
        "#,
    )
    .map_err(|error| format!("无法初始化 Projection DB schema: {error}"))?;
    add_projected_session_column_if_missing(conn, "archived_at", "TEXT")?;
    add_projected_session_column_if_missing(conn, "title", "TEXT")?;
    add_projected_session_column_if_missing(conn, "model", "TEXT")?;
    add_projected_session_column_if_missing(conn, "workspace_id", "TEXT")?;
    add_projected_session_column_if_missing(conn, "working_dir", "TEXT")?;
    add_projected_session_column_if_missing(conn, "execution_strategy", "TEXT")?;
    add_projected_session_column_if_missing(conn, "metadata_json", "TEXT")?;
    Ok(())
}

fn add_projected_session_column_if_missing(
    conn: &Connection,
    column: &str,
    column_type: &str,
) -> Result<(), String> {
    let mut stmt = conn
        .prepare("PRAGMA table_info(projected_sessions)")
        .map_err(|error| format!("无法检查 projected_sessions schema: {error}"))?;
    let columns = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|error| format!("无法读取 projected_sessions schema: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("无法解析 projected_sessions schema: {error}"))?;
    if columns.iter().any(|existing| existing == column) {
        return Ok(());
    }
    conn.execute(
        &format!("ALTER TABLE projected_sessions ADD COLUMN {column} {column_type}"),
        [],
    )
    .map_err(|error| format!("无法迁移 projected_sessions.{column}: {error}"))?;
    Ok(())
}
