use aster::session::{query_session, query_subagent_session, Session};

pub(crate) async fn read_session(
    session_id: &str,
    with_conversation: bool,
    error_context: &str,
) -> Result<Session, String> {
    query_session(session_id, with_conversation)
        .await
        .map_err(|error| format!("{error_context}: {error}"))
}

pub(crate) async fn read_subagent_session(
    session_id: &str,
    error_context: &str,
) -> Result<Session, String> {
    query_subagent_session(session_id)
        .await
        .map_err(|error| format!("{error_context}: {error}"))
}
