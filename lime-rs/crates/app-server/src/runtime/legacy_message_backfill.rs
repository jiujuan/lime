use super::EventLogWriter;
use super::LegacyMessageCleanupPolicy;
use super::ProjectionStore;
use super::RuntimeCore;
use super::RuntimeCoreError;
use app_server_protocol::AgentEvent;
use app_server_protocol::AgentInput;
use app_server_protocol::AgentSessionListParams;
use serde_json::json;
use std::collections::HashSet;

#[derive(Debug, Clone, PartialEq)]
pub struct LegacyAgentSessionTranscript {
    pub session_id: String,
    pub title: Option<String>,
    pub model: String,
    pub created_at: String,
    pub updated_at: String,
    pub archived_at: Option<String>,
    pub workspace_id: Option<String>,
    pub working_dir: Option<String>,
    pub execution_strategy: Option<String>,
    pub provider_name: Option<String>,
    pub messages: Vec<LegacyAgentMessage>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LegacyAgentMessage {
    pub message_id: i64,
    pub role: String,
    pub text: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LegacyBackfillReport {
    pub sessions_scanned: usize,
    pub sessions_backfilled: usize,
    pub events_written: usize,
    pub legacy_rows_cleared: usize,
    pub legacy_tables_dropped: usize,
}

impl RuntimeCore {
    pub(in crate::runtime) async fn backfill_legacy_agent_messages_for_list(
        &self,
        params: &AgentSessionListParams,
    ) -> Result<LegacyBackfillReport, RuntimeCoreError> {
        let Some(event_log_writer) = self.event_log_writer.as_ref() else {
            return Ok(LegacyBackfillReport::empty());
        };
        let Some(projection_store) = self.projection_store.as_ref() else {
            return Ok(LegacyBackfillReport::empty());
        };
        let transcripts = self
            .app_data_source
            .list_legacy_agent_message_transcripts(params.clone())
            .await?;
        self.backfill_legacy_agent_message_transcripts(
            event_log_writer.as_ref(),
            projection_store.as_ref(),
            transcripts,
        )
        .await
    }

    pub(in crate::runtime) async fn backfill_legacy_agent_messages_for_session(
        &self,
        session_id: &str,
    ) -> Result<LegacyBackfillReport, RuntimeCoreError> {
        let Some(event_log_writer) = self.event_log_writer.as_ref() else {
            return Ok(LegacyBackfillReport::empty());
        };
        let Some(projection_store) = self.projection_store.as_ref() else {
            return Ok(LegacyBackfillReport::empty());
        };
        let Some(transcript) = self
            .app_data_source
            .read_legacy_agent_message_transcript(session_id.to_string())
            .await?
        else {
            return Ok(LegacyBackfillReport::empty());
        };
        self.backfill_legacy_agent_message_transcripts(
            event_log_writer.as_ref(),
            projection_store.as_ref(),
            vec![transcript],
        )
        .await
    }

    async fn backfill_legacy_agent_message_transcripts(
        &self,
        event_log_writer: &EventLogWriter,
        projection_store: &ProjectionStore,
        transcripts: Vec<LegacyAgentSessionTranscript>,
    ) -> Result<LegacyBackfillReport, RuntimeCoreError> {
        let sessions_scanned = transcripts.len();
        let mut sessions_backfilled = 0;
        let mut events_written = 0;
        let mut migrated_session_ids = Vec::new();
        for transcript in transcripts {
            if transcript.messages.is_empty() {
                continue;
            }
            let expected_events = legacy_transcript_events(&transcript);
            let existing_records = event_log_writer
                .read_session_events(&transcript.session_id)
                .map_err(RuntimeCoreError::Backend)?;
            let existing_event_ids = existing_records
                .iter()
                .map(|record| record.event.event_id.as_str())
                .collect::<HashSet<_>>();
            for event in expected_events
                .iter()
                .filter(|event| !existing_event_ids.contains(event.event_id.as_str()))
            {
                event_log_writer
                    .append(event)
                    .map_err(RuntimeCoreError::Backend)?;
                events_written += 1;
            }
            let events = event_log_writer
                .read_session_events(&transcript.session_id)
                .map_err(RuntimeCoreError::Backend)?
                .into_iter()
                .map(|record| record.event)
                .collect::<Vec<_>>();
            projection_store
                .repair_session(&transcript.session_id, &events)
                .map_err(RuntimeCoreError::Backend)?;
            sessions_backfilled += 1;
            migrated_session_ids.push(transcript.session_id);
        }
        let legacy_rows_cleared = match self.legacy_message_cleanup_policy {
            LegacyMessageCleanupPolicy::Retain => 0,
            LegacyMessageCleanupPolicy::ClearRows | LegacyMessageCleanupPolicy::DropEmptyTables => {
                match self
                    .app_data_source
                    .clear_legacy_agent_message_sessions(migrated_session_ids)
                    .await
                {
                    Ok(count) => count,
                    Err(error) => {
                        tracing::warn!(
                            cleanup_error = %error,
                            "legacy agent_messages cleanup skipped after successful backfill"
                        );
                        0
                    }
                }
            }
        };
        let legacy_tables_dropped = match self.legacy_message_cleanup_policy {
            LegacyMessageCleanupPolicy::DropEmptyTables => match self
                .app_data_source
                .drop_empty_legacy_agent_message_tables()
                .await
            {
                Ok(count) => count,
                Err(error) => {
                    tracing::warn!(
                        cleanup_error = %error,
                        "legacy agent_messages empty-table drop skipped after successful backfill"
                    );
                    0
                }
            },
            LegacyMessageCleanupPolicy::Retain | LegacyMessageCleanupPolicy::ClearRows => 0,
        };
        Ok(LegacyBackfillReport {
            sessions_scanned,
            sessions_backfilled,
            events_written,
            legacy_rows_cleared,
            legacy_tables_dropped,
        })
    }
}

impl LegacyBackfillReport {
    fn empty() -> Self {
        Self {
            sessions_scanned: 0,
            sessions_backfilled: 0,
            events_written: 0,
            legacy_rows_cleared: 0,
            legacy_tables_dropped: 0,
        }
    }
}

fn legacy_transcript_events(transcript: &LegacyAgentSessionTranscript) -> Vec<AgentEvent> {
    let mut events = Vec::new();
    let mut sequence = 1;
    let mut current_user_turn: Option<String> = None;
    let thread_id = transcript.session_id.clone();
    let session_metadata = legacy_session_metadata(transcript);
    for message in &transcript.messages {
        let role = message.role.trim().to_ascii_lowercase();
        match role.as_str() {
            "user" => {
                let turn_id = legacy_turn_id(message.message_id);
                current_user_turn = Some(turn_id.clone());
                events.push(legacy_event(
                    transcript,
                    message,
                    &thread_id,
                    Some(turn_id.as_str()),
                    sequence,
                    "turn.accepted",
                    json!({
                        "source": "legacy_agent_messages_backfill",
                        "legacyMessageId": message.message_id,
                        "session": session_metadata,
                    }),
                ));
                sequence += 1;
                events.push(legacy_event(
                    transcript,
                    message,
                    &thread_id,
                    Some(turn_id.as_str()),
                    sequence,
                    "message.created",
                    json!({
                        "role": "user",
                        "visibility": "user_visible",
                        "input": AgentInput {
                            text: message.text.clone(),
                            attachments: Vec::new(),
                        },
                        "content": {
                            "kind": "inline_text",
                            "text": message.text,
                        },
                        "attachments": [],
                        "legacyMessageId": message.message_id,
                        "source": "legacy_agent_messages_backfill",
                    }),
                ));
                sequence += 1;
            }
            "assistant" => {
                let turn_id = current_user_turn
                    .clone()
                    .unwrap_or_else(|| legacy_turn_id(message.message_id));
                events.push(legacy_event(
                    transcript,
                    message,
                    &thread_id,
                    Some(turn_id.as_str()),
                    sequence,
                    "message.delta",
                    json!({
                        "text": message.text,
                        "legacyMessageId": message.message_id,
                        "source": "legacy_agent_messages_backfill",
                    }),
                ));
                sequence += 1;
                events.push(legacy_event(
                    transcript,
                    message,
                    &thread_id,
                    Some(turn_id.as_str()),
                    sequence,
                    "turn.completed",
                    json!({
                        "source": "legacy_agent_messages_backfill",
                        "legacyMessageId": message.message_id,
                    }),
                ));
                sequence += 1;
                current_user_turn = None;
            }
            _ => {
                events.push(legacy_event(
                    transcript,
                    message,
                    &thread_id,
                    current_user_turn.as_deref(),
                    sequence,
                    "legacy.message",
                    json!({
                        "role": role,
                        "text": message.text,
                        "legacyMessageId": message.message_id,
                        "source": "legacy_agent_messages_backfill",
                    }),
                ));
                sequence += 1;
            }
        }
    }
    if let Some(turn_id) = current_user_turn {
        events.push(AgentEvent {
            event_id: format!(
                "legacy:{}:{}:turn-completed",
                transcript.session_id, sequence
            ),
            sequence,
            session_id: transcript.session_id.clone(),
            thread_id: Some(thread_id),
            turn_id: Some(turn_id),
            event_type: "turn.completed".to_string(),
            timestamp: transcript.updated_at.clone(),
            payload: json!({
                "source": "legacy_agent_messages_backfill",
                "reason": "legacy_user_turn_without_assistant_message",
            }),
        });
    }
    events
}

fn legacy_event(
    transcript: &LegacyAgentSessionTranscript,
    message: &LegacyAgentMessage,
    thread_id: &str,
    turn_id: Option<&str>,
    sequence: u64,
    event_type: &str,
    payload: serde_json::Value,
) -> AgentEvent {
    AgentEvent {
        event_id: format!(
            "legacy:{}:{}:{}",
            transcript.session_id, message.message_id, event_type
        ),
        sequence,
        session_id: transcript.session_id.clone(),
        thread_id: Some(thread_id.to_string()),
        turn_id: turn_id.map(str::to_string),
        event_type: event_type.to_string(),
        timestamp: message.timestamp.clone(),
        payload,
    }
}

fn legacy_session_metadata(transcript: &LegacyAgentSessionTranscript) -> serde_json::Value {
    json!({
        "title": transcript.title,
        "model": transcript.model,
        "createdAt": transcript.created_at,
        "updatedAt": transcript.updated_at,
        "archivedAt": transcript.archived_at,
        "workspaceId": transcript.workspace_id,
        "workingDir": transcript.working_dir,
        "executionStrategy": transcript.execution_strategy,
        "providerName": transcript.provider_name,
    })
}

fn legacy_turn_id(message_id: i64) -> String {
    format!("legacy-turn-{message_id}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime::StorageRoots;
    use crate::ProjectionRepair;

    #[test]
    fn legacy_transcript_events_rebuild_user_and_assistant_messages() {
        let transcript = LegacyAgentSessionTranscript {
            session_id: "legacy-session".to_string(),
            title: Some("旧会话".to_string()),
            model: "agent:default".to_string(),
            created_at: "2026-03-13T00:00:00Z".to_string(),
            updated_at: "2026-03-13T00:00:02Z".to_string(),
            archived_at: None,
            workspace_id: None,
            working_dir: None,
            execution_strategy: Some("react".to_string()),
            provider_name: None,
            messages: vec![
                LegacyAgentMessage {
                    message_id: 1,
                    role: "user".to_string(),
                    text: "你好".to_string(),
                    timestamp: "2026-03-13T00:00:01Z".to_string(),
                },
                LegacyAgentMessage {
                    message_id: 2,
                    role: "assistant".to_string(),
                    text: "你好，有什么可以帮你？".to_string(),
                    timestamp: "2026-03-13T00:00:02Z".to_string(),
                },
            ],
        };

        let events = legacy_transcript_events(&transcript);

        assert_eq!(
            events
                .iter()
                .map(|event| event.event_type.as_str())
                .collect::<Vec<_>>(),
            vec![
                "turn.accepted",
                "message.created",
                "message.delta",
                "turn.completed"
            ]
        );
        assert_eq!(events[1].payload["input"]["text"], "你好");
        assert_eq!(events[2].payload["text"], "你好，有什么可以帮你？");
    }

    #[tokio::test]
    async fn legacy_backfill_writes_jsonl_and_repairs_projection() {
        let temp = tempfile::tempdir().expect("tempdir");
        let roots = StorageRoots::initialize(temp.path().join("app-server")).expect("roots");
        let writer = EventLogWriter::new(&roots.event_log_root).expect("writer");
        let projection =
            ProjectionStore::initialize(&roots.projection_db_path).expect("projection");
        let core = RuntimeCore::default();
        let report = core
            .backfill_legacy_agent_message_transcripts(
                &writer,
                &projection,
                vec![LegacyAgentSessionTranscript {
                    session_id: "legacy-session".to_string(),
                    title: Some("旧会话".to_string()),
                    model: "agent:default".to_string(),
                    created_at: "2026-03-13T00:00:00Z".to_string(),
                    updated_at: "2026-03-13T00:00:02Z".to_string(),
                    archived_at: None,
                    workspace_id: None,
                    working_dir: None,
                    execution_strategy: Some("react".to_string()),
                    provider_name: None,
                    messages: vec![
                        LegacyAgentMessage {
                            message_id: 1,
                            role: "user".to_string(),
                            text: "你好".to_string(),
                            timestamp: "2026-03-13T00:00:01Z".to_string(),
                        },
                        LegacyAgentMessage {
                            message_id: 2,
                            role: "assistant".to_string(),
                            text: "你好，有什么可以帮你？".to_string(),
                            timestamp: "2026-03-13T00:00:02Z".to_string(),
                        },
                    ],
                }],
            )
            .await
            .expect("backfill");

        assert_eq!(report.sessions_backfilled, 1);
        assert_eq!(report.events_written, 4);
        let records = writer
            .read_session_events("legacy-session")
            .expect("read jsonl");
        assert_eq!(records.len(), 4);
        let repair = ProjectionRepair::new(writer, projection);
        let (read, events) = repair
            .read_repaired_session("legacy-session")
            .expect("read repaired")
            .expect("session");
        assert_eq!(events.len(), 4);
        assert_eq!(read.session.session_id, "legacy-session");
        assert_eq!(read.turns.len(), 1);
    }
}
