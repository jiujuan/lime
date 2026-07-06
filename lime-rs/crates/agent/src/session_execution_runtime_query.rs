//! Session execution runtime current DB read model.
//!
//! Runtime detail reads provider/model/usage/recent metadata from `agent_sessions`
//! directly instead of borrowing an Aster `Session`.

use agent_runtime::session_execution::{
    project_session_execution_runtime_session, SessionExecutionRuntimeSessionSource,
    SessionExecutionRuntimeUsageSource, SESSION_RECENT_ACCESS_MODE_EXTENSION_NAME,
    SESSION_RECENT_EXTENSION_VERSION, SESSION_RECENT_PREFERENCES_EXTENSION_NAME,
    SESSION_RECENT_TEAM_SELECTION_EXTENSION_NAME,
};
use lime_core::database::{lock_db, DbConnection};
use serde::Deserialize;
use serde_json::Value;
use thread_store::session_record::{
    parse_optional_json, SessionRecordProjection, SessionRecordRow, DEFAULT_MODEL_NAME,
};

use crate::session_execution_runtime::SessionExecutionRuntimeSessionProjection;
use crate::session_record_sql::{load_session_record_rows, SESSION_RECORD_SELECT_COLUMNS};
use crate::session_usage_projection::project_token_usage_source;

#[derive(Debug, Deserialize)]
struct ModelConfigNameSource {
    #[serde(default)]
    model_name: Option<String>,
}

fn normalize_optional_text(value: Option<String>) -> Option<String> {
    let trimmed = value?.trim().to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

fn extension_state_value(
    extension_data: &Value,
    extension_name: &str,
    version: &str,
) -> Option<Value> {
    let key = format!("{extension_name}.{version}");
    extension_data.as_object()?.get(&key).cloned()
}

fn extension_state_value_from_json(
    extension_data_json: &str,
    extension_name: &str,
) -> Option<Value> {
    let extension_data = serde_json::from_str::<Value>(extension_data_json).ok()?;
    extension_state_value(
        &extension_data,
        extension_name,
        SESSION_RECENT_EXTENSION_VERSION,
    )
}

fn resolve_session_record_model_name(projection: &SessionRecordProjection) -> Option<String> {
    parse_optional_json::<ModelConfigNameSource>(projection.model_config_json.clone())
        .and_then(|config| normalize_optional_text(config.model_name))
        .or_else(|| match projection.model.trim() {
            "" | DEFAULT_MODEL_NAME => None,
            value => Some(value.to_string()),
        })
}

pub(crate) fn project_session_record_execution_runtime_session(
    row: SessionRecordRow,
) -> SessionExecutionRuntimeSessionProjection {
    let projection = row.project();
    let extension_data_json = projection.extension_data_json.as_str();
    let model_name = resolve_session_record_model_name(&projection);
    project_session_execution_runtime_session(
        SessionExecutionRuntimeSessionSource {
            provider_name: projection.provider_name,
            model_name,
            usage: Some(SessionExecutionRuntimeUsageSource {
                input_tokens: projection.input_tokens,
                output_tokens: projection.output_tokens,
                cached_input_tokens: projection.cached_input_tokens,
                cache_creation_input_tokens: projection.cache_creation_input_tokens,
            }),
            recent_access_mode_state: extension_state_value_from_json(
                extension_data_json,
                SESSION_RECENT_ACCESS_MODE_EXTENSION_NAME,
            ),
            recent_preferences_state: extension_state_value_from_json(
                extension_data_json,
                SESSION_RECENT_PREFERENCES_EXTENSION_NAME,
            ),
            recent_team_selection_state: extension_state_value_from_json(
                extension_data_json,
                SESSION_RECENT_TEAM_SELECTION_EXTENSION_NAME,
            ),
        },
        project_token_usage_source,
    )
}

fn has_execution_runtime_session_data(
    projection: &SessionExecutionRuntimeSessionProjection,
) -> bool {
    projection.provider_name.is_some()
        || projection.model_name.is_some()
        || projection.usage.is_some()
        || projection.recent_access_mode.is_some()
        || projection.recent_preferences.is_some()
        || projection.recent_team_selection.is_some()
}

pub(crate) fn read_session_execution_runtime_session_projection(
    db: &DbConnection,
    session_id: &str,
) -> Result<Option<SessionExecutionRuntimeSessionProjection>, String> {
    let rows = {
        let conn = lock_db(db)?;
        let sql = format!(
            "SELECT {SESSION_RECORD_SELECT_COLUMNS}
             FROM agent_sessions
             WHERE id = ?1
             LIMIT 1"
        );
        load_session_record_rows(&conn, &sql, rusqlite::params![session_id])
            .map_err(|error| format!("读取 execution runtime session 失败: {error}"))?
    };

    Ok(rows
        .into_iter()
        .next()
        .map(project_session_record_execution_runtime_session)
        .filter(has_execution_runtime_session_data))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::session_execution_runtime::SessionExecutionRuntimeAccessMode;
    use rusqlite::Connection;
    use serde_json::json;
    use std::sync::{Arc, Mutex};

    fn create_agent_sessions_table(conn: &Connection) {
        conn.execute(
            "CREATE TABLE agent_sessions (
                id TEXT PRIMARY KEY,
                model TEXT NOT NULL,
                title TEXT,
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

    #[test]
    fn projects_execution_runtime_session_from_current_record_row() {
        let row = SessionRecordRow {
            id: "session-1".to_string(),
            model: DEFAULT_MODEL_NAME.to_string(),
            title: Some("session".to_string()),
            created_at: "2026-07-06T00:00:00Z".to_string(),
            updated_at: "2026-07-06T00:01:00Z".to_string(),
            working_dir: None,
            session_type: Some("user".to_string()),
            user_set_name: false,
            extension_data_json: json!({
                "lime_recent_access_mode.v0": "full-access"
            })
            .to_string(),
            total_tokens: None,
            input_tokens: Some(10),
            output_tokens: Some(2),
            cached_input_tokens: Some(3),
            cache_creation_input_tokens: Some(4),
            accumulated_total_tokens: None,
            accumulated_input_tokens: None,
            accumulated_output_tokens: None,
            schedule_id: None,
            recipe_json: None,
            user_recipe_values_json: None,
            provider_name: Some(" openai ".to_string()),
            model_config_json: Some(r#"{"model_name":" gpt-5.1 "}"#.to_string()),
            message_count: 0,
        };

        let projection = project_session_record_execution_runtime_session(row);

        assert_eq!(projection.provider_name.as_deref(), Some("openai"));
        assert_eq!(projection.model_name.as_deref(), Some("gpt-5.1"));
        assert_eq!(
            projection.recent_access_mode,
            Some(SessionExecutionRuntimeAccessMode::FullAccess)
        );
        let usage = projection.usage.expect("usage");
        assert_eq!(usage.input_tokens, 10);
        assert_eq!(usage.output_tokens, 2);
        assert_eq!(usage.cached_input_tokens, Some(3));
        assert_eq!(usage.cache_creation_input_tokens, Some(4));
    }

    #[test]
    fn reads_execution_runtime_session_from_agent_sessions() {
        let conn = Connection::open_in_memory().expect("open db");
        create_agent_sessions_table(&conn);
        conn.execute(
            "INSERT INTO agent_sessions (
                id, model, title, created_at, updated_at, working_dir, session_type,
                user_set_name, extension_data_json, input_tokens, output_tokens,
                provider_name, model_config_json
             ) VALUES (
                'session-1', 'agent:default', 'Session', '2026-07-06T00:00:00Z',
                '2026-07-06T00:01:00Z', NULL, 'user', 0, ?1, 5, 1, 'openai', ?2
             )",
            rusqlite::params![
                json!({"lime_recent_access_mode.v0": "current"}).to_string(),
                r#"{"model_name":"gpt-5.1"}"#,
            ],
        )
        .expect("insert session");
        let db = Arc::new(Mutex::new(conn));

        let projection = read_session_execution_runtime_session_projection(&db, "session-1")
            .expect("read execution runtime")
            .expect("projection");

        assert_eq!(projection.provider_name.as_deref(), Some("openai"));
        assert_eq!(projection.model_name.as_deref(), Some("gpt-5.1"));
        assert_eq!(
            projection.recent_access_mode,
            Some(SessionExecutionRuntimeAccessMode::Current)
        );
        assert_eq!(projection.usage.expect("usage").input_tokens, 5);
    }

    #[test]
    fn ignores_empty_execution_runtime_session_projection() {
        let conn = Connection::open_in_memory().expect("open db");
        create_agent_sessions_table(&conn);
        conn.execute(
            "INSERT INTO agent_sessions (
                id, model, title, created_at, updated_at, working_dir, session_type,
                user_set_name, extension_data_json
             ) VALUES (
                'session-empty', 'agent:default', 'Session', '2026-07-06T00:00:00Z',
                '2026-07-06T00:01:00Z', NULL, 'user', 0, '{}'
             )",
            [],
        )
        .expect("insert session");
        let db = Arc::new(Mutex::new(conn));

        let projection = read_session_execution_runtime_session_projection(&db, "session-empty")
            .expect("read execution runtime");

        assert!(projection.is_none());
    }
}
