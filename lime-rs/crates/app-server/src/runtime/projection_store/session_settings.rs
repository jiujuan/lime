use super::ProjectionStore;
use app_server_protocol::AgentSession;
use chrono::{DateTime, SecondsFormat, Utc};
use rusqlite::{params, OptionalExtension, TransactionBehavior};
use serde_json::Value;

impl ProjectionStore {
    pub(in crate::runtime) fn persist_session_metadata(
        &self,
        session: &mut AgentSession,
    ) -> Result<(), String> {
        let mut conn = self.open_projection_store()?;
        let tx = conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|error| format!("cannot begin session metadata transaction: {error}"))?;

        let canonical = tx
            .query_row(
                "SELECT session_id, thread_json, archived, rollout_path
                 FROM canonical_threads WHERE thread_id = ?1",
                params![session.thread_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, i64>(2)?,
                        row.get::<_, Option<String>>(3)?,
                    ))
                },
            )
            .optional()
            .map_err(|error| format!("cannot read canonical thread metadata: {error}"))?
            .ok_or_else(|| format!("thread not found: {}", session.thread_id))?;
        if canonical.0 != session.session_id {
            return Err(format!(
                "session/thread identity mismatch for thread {}",
                session.thread_id
            ));
        }
        if canonical.2 != 0 {
            return Err(format!("thread is archived: {}", session.thread_id));
        }
        if self.rollout_store().is_some() && canonical.3.is_none() {
            return Err(format!(
                "thread {} has no rollout_path; migration is required",
                session.thread_id
            ));
        }

        let metadata = session
            .business_object_ref
            .as_ref()
            .and_then(|reference| reference.metadata.clone())
            .unwrap_or_else(|| Value::Object(Default::default()));
        let mut thread: agent_protocol::Thread = serde_json::from_str(&canonical.1)
            .map_err(|error| format!("cannot decode canonical thread metadata: {error}"))?;
        if thread.thread_id.as_str() != session.thread_id
            || thread.session_id.as_str() != session.session_id
        {
            return Err(format!(
                "canonical thread identity mismatch for {}",
                session.thread_id
            ));
        }
        let expected_thread = thread.clone();
        thread.metadata = metadata.clone();
        thread.updated_at_ms = timestamp_millis(&session.updated_at)?;
        if let (Some(store), Some(path)) = (self.rollout_store(), canonical.3.as_deref()) {
            thread.updated_at_ms =
                store.append_metadata(std::path::Path::new(path), &expected_thread, &thread)?;
            session.updated_at = timestamp(thread.updated_at_ms)?;
        }
        let thread_json = serde_json::to_string(&thread)
            .map_err(|error| format!("cannot encode canonical thread metadata: {error}"))?;
        tx.execute(
            "UPDATE canonical_threads SET thread_json = ?1, updated_at_ms = ?2 WHERE thread_id = ?3",
            params![thread_json, thread.updated_at_ms, session.thread_id],
        )
        .map_err(|error| format!("cannot persist canonical thread metadata: {error}"))?;

        let projected_thread_id = tx
            .query_row(
                "SELECT thread_id FROM projected_sessions WHERE session_id = ?1",
                params![session.session_id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|error| format!("cannot read projected session identity: {error}"))?;
        if projected_thread_id
            .as_deref()
            .is_some_and(|thread_id| thread_id != session.thread_id)
        {
            return Err(format!(
                "projected session identity mismatch for {}",
                session.session_id
            ));
        }

        let metadata_json = serde_json::to_string(&metadata)
            .map_err(|error| format!("cannot encode projected session metadata: {error}"))?;
        let title = session
            .business_object_ref
            .as_ref()
            .and_then(|reference| reference.title.as_deref())
            .or_else(|| metadata_string(&metadata, &["title"]));
        let model = metadata_string(&metadata, &["modelName", "model"]);
        let working_dir = metadata_string(&metadata, &["workingDir", "cwd"]);
        let execution_strategy =
            metadata_string(&metadata, &["executionStrategy", "execution_strategy"]);
        tx.execute(
            r#"
            INSERT INTO projected_sessions (
                session_id, thread_id, status, created_at, updated_at, title, model,
                workspace_id, working_dir, execution_strategy, metadata_json,
                last_event_sequence
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 0)
            ON CONFLICT(session_id) DO UPDATE SET
                status = excluded.status,
                updated_at = excluded.updated_at,
                title = COALESCE(excluded.title, projected_sessions.title),
                model = COALESCE(excluded.model, projected_sessions.model),
                workspace_id = COALESCE(excluded.workspace_id, projected_sessions.workspace_id),
                working_dir = COALESCE(excluded.working_dir, projected_sessions.working_dir),
                execution_strategy = COALESCE(
                    excluded.execution_strategy,
                    projected_sessions.execution_strategy
                ),
                metadata_json = excluded.metadata_json
            "#,
            params![
                session.session_id,
                session.thread_id,
                super::super::status::agent_session_status_label(session.status),
                session.created_at,
                session.updated_at,
                title,
                model,
                session.workspace_id,
                working_dir,
                execution_strategy,
                metadata_json,
            ],
        )
        .map_err(|error| format!("cannot persist projected session metadata: {error}"))?;

        tx.commit()
            .map_err(|error| format!("cannot commit session metadata transaction: {error}"))
    }
}

fn metadata_string<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a str> {
    keys.iter()
        .find_map(|key| value.get(*key))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn timestamp_millis(value: &str) -> Result<i64, String> {
    chrono::DateTime::parse_from_rfc3339(value)
        .map(|value| value.timestamp_millis())
        .map_err(|error| format!("invalid session timestamp: {error}"))
}

fn timestamp(value: i64) -> Result<String, String> {
    DateTime::<Utc>::from_timestamp_millis(value)
        .map(|value| value.to_rfc3339_opts(SecondsFormat::Millis, true))
        .ok_or_else(|| "session timestamp is outside the supported range".to_string())
}
