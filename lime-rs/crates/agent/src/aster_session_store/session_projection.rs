use anyhow::Result;
use aster::model::ModelConfig;
use aster::session::{Session, SessionType};
use std::path::PathBuf;
use thread_store::session_record::{
    parse_optional_json, SessionRecordProjection, SessionRecordRow, DEFAULT_MODEL_NAME,
};

pub(super) fn parse_session_working_dir(
    conn: &rusqlite::Connection,
    working_dir: Option<String>,
) -> PathBuf {
    match working_dir {
        Some(path) if !path.trim().is_empty() => {
            super::LimeSessionStore::normalize_working_dir(PathBuf::from(path))
        }
        _ => super::LimeSessionStore::resolve_session_working_dir(conn),
    }
}

pub(super) fn map_session_listing_row(
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

fn build_session_from_record_projection(
    conn: &rusqlite::Connection,
    projection: SessionRecordProjection,
) -> Session {
    let session_type = projection
        .session_type
        .parse::<SessionType>()
        .unwrap_or(SessionType::User);
    let working_dir = parse_session_working_dir(conn, projection.working_dir);

    Session {
        id: projection.id,
        working_dir,
        name: projection.title,
        user_set_name: projection.user_set_name,
        session_type,
        created_at: projection.created_at,
        updated_at: projection.updated_at,
        extension_data: parse_optional_json(Some(projection.extension_data_json))
            .unwrap_or_default(),
        total_tokens: projection.total_tokens,
        input_tokens: projection.input_tokens,
        output_tokens: projection.output_tokens,
        cached_input_tokens: projection.cached_input_tokens,
        cache_creation_input_tokens: projection.cache_creation_input_tokens,
        accumulated_total_tokens: projection.accumulated_total_tokens,
        accumulated_input_tokens: projection.accumulated_input_tokens,
        accumulated_output_tokens: projection.accumulated_output_tokens,
        schedule_id: projection.schedule_id,
        recipe: parse_optional_json(projection.recipe_json),
        user_recipe_values: parse_optional_json(projection.user_recipe_values_json),
        conversation: None,
        message_count: projection.message_count,
        provider_name: projection.provider_name,
        model_config: parse_optional_json(projection.model_config_json).or_else(
            || match projection.model.trim() {
                "" | DEFAULT_MODEL_NAME => None,
                model_name => ModelConfig::new(model_name).ok(),
            },
        ),
    }
}

pub(super) fn build_session_from_listing_row(
    conn: &rusqlite::Connection,
    row: SessionRecordRow,
) -> Session {
    build_session_from_record_projection(conn, row.project())
}

pub(super) fn load_listed_sessions<P>(
    conn: &rusqlite::Connection,
    sql: &str,
    params: P,
) -> Result<Vec<SessionRecordRow>>
where
    P: rusqlite::Params,
{
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map(params, map_session_listing_row)?;
    Ok(rows.filter_map(|row| row.ok()).collect())
}
