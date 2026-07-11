use aster::ModelConfig;
use aster::{Session, SessionType};
use lime_core::database::agent_session_repository::resolve_persisted_session_working_dir;
use thread_store::session_record::{
    parse_optional_json, SessionRecordProjection, SessionRecordRow, DEFAULT_MODEL_NAME,
};

fn build_session_from_record_projection(
    conn: &rusqlite::Connection,
    projection: SessionRecordProjection,
) -> Session {
    let session_type = projection
        .session_type
        .parse::<SessionType>()
        .unwrap_or(SessionType::User);
    let working_dir = resolve_persisted_session_working_dir(conn, projection.working_dir);

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
