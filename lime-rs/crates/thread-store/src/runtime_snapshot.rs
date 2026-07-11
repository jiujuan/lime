use agent_protocol::turn_context::{TurnContextOverride, TurnOutputSchemaRuntime};
use chrono::{DateTime, Utc};
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RuntimeTurnStatusRecord {
    Queued,
    Running,
    Completed,
    Failed,
    Aborted,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RuntimeItemStatusRecord {
    InProgress,
    Completed,
    Failed,
}

#[derive(Debug, Clone, PartialEq)]
pub struct RuntimeSessionSnapshotRecord {
    pub session_id: String,
    pub threads: Vec<RuntimeThreadSnapshotRecord>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct RuntimeThreadSnapshotRecord {
    pub id: String,
    pub session_id: String,
    pub working_dir: PathBuf,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub metadata: HashMap<String, Value>,
    pub turns: Vec<RuntimeTurnSnapshotRecord>,
    pub items: Vec<RuntimeItemSnapshotRecord>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct RuntimeTurnSnapshotRecord {
    pub id: String,
    pub session_id: String,
    pub thread_id: String,
    pub status: RuntimeTurnStatusRecord,
    pub input_text: Option<String>,
    pub error_message: Option<String>,
    pub context_override: Option<TurnContextOverride>,
    pub output_schema_runtime: Option<TurnOutputSchemaRuntime>,
    pub created_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct RuntimeItemSnapshotRecord {
    pub id: String,
    pub thread_id: String,
    pub turn_id: String,
    pub sequence: i64,
    pub status: RuntimeItemStatusRecord,
    pub started_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
    pub updated_at: DateTime<Utc>,
    pub payload: RuntimeItemPayloadRecord,
}

#[derive(Debug, Clone, PartialEq)]
pub enum RuntimeItemPayloadRecord {
    InternalTranscript {
        role: String,
        content_json: Value,
        metadata_json: Value,
        created_timestamp: i64,
    },
    UserMessage {
        content: String,
    },
    AgentMessage {
        text: String,
    },
    Plan {
        text: String,
    },
    RuntimeStatus {
        phase: String,
        title: String,
        detail: String,
        checkpoints: Vec<String>,
    },
    FileArtifact {
        path: String,
        source: String,
        content: Option<String>,
        metadata: Option<Value>,
    },
    Reasoning {
        text: String,
        summary: Option<Vec<String>>,
        metadata: Option<Value>,
    },
    ToolCall {
        tool_name: String,
        arguments: Option<Value>,
        output: Option<Value>,
        success: Option<bool>,
        error: Option<String>,
        metadata: Option<Value>,
    },
    ApprovalRequest {
        request_id: String,
        action_type: String,
        prompt: Option<String>,
        tool_name: Option<String>,
        arguments: Option<Value>,
        response: Option<Value>,
    },
    RequestUserInput {
        request_id: String,
        action_type: String,
        prompt: Option<String>,
        requested_schema: Option<Value>,
        response: Option<Value>,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn runtime_snapshot_record_keeps_thread_turn_and_item_records_together() {
        let now = Utc::now();
        let snapshot = RuntimeSessionSnapshotRecord {
            session_id: "session-1".to_string(),
            threads: vec![RuntimeThreadSnapshotRecord {
                id: "thread-1".to_string(),
                session_id: "session-1".to_string(),
                working_dir: PathBuf::from("/tmp/workspace"),
                created_at: now,
                updated_at: now,
                metadata: HashMap::new(),
                turns: vec![RuntimeTurnSnapshotRecord {
                    id: "turn-1".to_string(),
                    session_id: "session-1".to_string(),
                    thread_id: "thread-1".to_string(),
                    status: RuntimeTurnStatusRecord::Completed,
                    input_text: Some("整理结果".to_string()),
                    error_message: None,
                    context_override: None,
                    output_schema_runtime: None,
                    created_at: now,
                    started_at: Some(now),
                    completed_at: Some(now),
                    updated_at: now,
                }],
                items: vec![RuntimeItemSnapshotRecord {
                    id: "item-1".to_string(),
                    thread_id: "thread-1".to_string(),
                    turn_id: "turn-1".to_string(),
                    sequence: 1,
                    status: RuntimeItemStatusRecord::Completed,
                    started_at: now,
                    completed_at: Some(now),
                    updated_at: now,
                    payload: RuntimeItemPayloadRecord::AgentMessage {
                        text: "完成".to_string(),
                    },
                }],
            }],
        };

        assert_eq!(snapshot.session_id, "session-1");
        assert_eq!(snapshot.threads[0].turns[0].id, "turn-1");
        assert_eq!(snapshot.threads[0].items[0].turn_id, "turn-1");
    }
}
