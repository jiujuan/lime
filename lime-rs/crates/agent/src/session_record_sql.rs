use anyhow::Result;
use thread_store::session_record::SessionRecordRow;
use thread_store::session_repository::SessionListQuery;

pub(crate) const SESSION_RECORD_SELECT_COLUMNS: &str =
    "id, model, title, created_at, updated_at, working_dir,
    session_type, user_set_name, extension_data_json,
    total_tokens, input_tokens, output_tokens, cached_input_tokens, cache_creation_input_tokens,
    accumulated_total_tokens, accumulated_input_tokens, accumulated_output_tokens,
    schedule_id, recipe_json, user_recipe_values_json,
    provider_name, model_config_json,
    0 AS message_count";

pub(crate) fn map_session_record_row(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<SessionRecordRow> {
    Ok(SessionRecordRow {
        id: row.get(0)?,
        model: row.get(1)?,
        title: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
        working_dir: row.get(5)?,
        session_type: row.get(6)?,
        user_set_name: row.get(7)?,
        extension_data_json: row.get(8)?,
        total_tokens: row.get(9)?,
        input_tokens: row.get(10)?,
        output_tokens: row.get(11)?,
        cached_input_tokens: row.get(12)?,
        cache_creation_input_tokens: row.get(13)?,
        accumulated_total_tokens: row.get(14)?,
        accumulated_input_tokens: row.get(15)?,
        accumulated_output_tokens: row.get(16)?,
        schedule_id: row.get(17)?,
        recipe_json: row.get(18)?,
        user_recipe_values_json: row.get(19)?,
        provider_name: row.get(20)?,
        model_config_json: row.get(21)?,
        message_count: row.get::<_, i64>(22)? as usize,
    })
}

pub(crate) fn load_session_record_rows<P>(
    conn: &rusqlite::Connection,
    sql: &str,
    params: P,
) -> Result<Vec<SessionRecordRow>>
where
    P: rusqlite::Params,
{
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map(params, map_session_record_row)?;
    let rows: rusqlite::Result<Vec<_>> = rows.collect();
    Ok(rows?)
}

pub(crate) fn load_session_record_row_by_id(
    conn: &rusqlite::Connection,
    session_id: &str,
) -> Result<Option<SessionRecordRow>> {
    let sql = format!("SELECT {SESSION_RECORD_SELECT_COLUMNS} FROM agent_sessions WHERE id = ?1");
    Ok(load_session_record_rows(conn, &sql, [session_id])?
        .into_iter()
        .next())
}

pub(crate) fn load_session_record_rows_for_query(
    conn: &rusqlite::Connection,
    query: &SessionListQuery,
) -> Result<Vec<SessionRecordRow>> {
    let mut sql = format!("SELECT {SESSION_RECORD_SELECT_COLUMNS} FROM agent_sessions");
    if query.session_type.is_some() {
        sql.push_str(" WHERE session_type = ?1");
    }
    sql.push_str(" ORDER BY updated_at DESC");
    append_limit_offset(&mut sql, query.limit, query.offset);

    match query.session_type.as_deref() {
        Some(session_type) => load_session_record_rows(conn, &sql, [session_type]),
        None => load_session_record_rows(conn, &sql, []),
    }
}

fn append_limit_offset(sql: &mut String, limit: Option<usize>, offset: Option<usize>) {
    if let Some(limit) = limit {
        sql.push_str(&format!(" LIMIT {limit}"));
    }
    if let Some(offset) = offset {
        if limit.is_none() {
            sql.push_str(" LIMIT -1");
        }
        sql.push_str(&format!(" OFFSET {offset}"));
    }
}

#[cfg(test)]
mod tests {
    use super::{load_session_record_row_by_id, load_session_record_rows_for_query};
    use thread_store::session_repository::SessionListQuery;

    fn create_session_record_table(conn: &rusqlite::Connection) {
        conn.execute(
            "CREATE TABLE agent_sessions (
                id TEXT PRIMARY KEY,
                model TEXT NOT NULL,
                title TEXT NOT NULL,
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

    fn insert_session_record(
        conn: &rusqlite::Connection,
        id: &str,
        session_type: &str,
        updated_at: &str,
    ) {
        conn.execute(
            "INSERT INTO agent_sessions (
                id, model, title, created_at, updated_at, working_dir,
                session_type, user_set_name, extension_data_json
            ) VALUES (?1, 'agent:default', ?1, 'created', ?2, '/tmp/project', ?3, 0, '{}')",
            rusqlite::params![id, updated_at, session_type],
        )
        .expect("insert session");
    }

    #[test]
    fn load_session_record_row_by_id_should_return_current_row() {
        let conn = rusqlite::Connection::open_in_memory().expect("open in-memory db");
        create_session_record_table(&conn);
        insert_session_record(&conn, "session-1", "user", "2026-01-01T00:00:00Z");

        let row = load_session_record_row_by_id(&conn, "session-1")
            .expect("load session")
            .expect("session should exist");

        assert_eq!(row.id, "session-1");
        assert_eq!(row.session_type, Some("user".to_string()));
        assert_eq!(
            load_session_record_row_by_id(&conn, "missing").expect("load missing"),
            None
        );
    }

    #[test]
    fn load_session_record_rows_for_query_should_filter_order_and_page() {
        let conn = rusqlite::Connection::open_in_memory().expect("open in-memory db");
        create_session_record_table(&conn);
        insert_session_record(&conn, "user-old", "user", "2026-01-01T00:00:00Z");
        insert_session_record(&conn, "hidden", "hidden", "2026-01-02T00:00:00Z");
        insert_session_record(&conn, "user-new", "user", "2026-01-03T00:00:00Z");

        let rows = load_session_record_rows_for_query(
            &conn,
            &SessionListQuery {
                session_type: Some("user".to_string()),
                limit: Some(1),
                offset: Some(1),
                ..SessionListQuery::default()
            },
        )
        .expect("load rows");

        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].id, "user-old");
    }

    #[test]
    fn load_session_record_rows_should_fail_on_row_mapping_error() {
        let conn = rusqlite::Connection::open_in_memory().expect("open in-memory db");
        create_session_record_table(&conn);
        conn.execute(
            "INSERT INTO agent_sessions (
                id, model, title, created_at, updated_at, working_dir,
                session_type, user_set_name, extension_data_json, total_tokens
            ) VALUES ('broken', 'agent:default', 'broken', 'created', 'updated',
                '/tmp/project', 'user', 0, '{}', 'not-a-number')",
            [],
        )
        .expect("insert malformed session");

        let error = load_session_record_rows_for_query(&conn, &SessionListQuery::default())
            .expect_err("row mapping errors must not be dropped");

        assert!(
            error.to_string().contains("Invalid column type"),
            "unexpected error: {error}"
        );
    }
}
