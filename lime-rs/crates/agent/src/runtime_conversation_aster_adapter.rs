//! Aster runtime conversation item adapter.
//!
//! Aster store/item payloads stay behind `runtime_store_aster_adapter`;
//! current read paths consume `thread-store` conversation records.

use anyhow::Result;
use aster::{Message, TurnRuntime};
use chrono::{DateTime, Utc};
use std::sync::Arc;
use thread_store::conversation_transcript::{
    build_transcript_item_record, ConversationMessageRecord, ConversationMessageRole,
    TranscriptItemRecordInput,
};
use thread_store::runtime_snapshot::RuntimeItemSnapshotRecord;
use thread_store::runtime_store::{collect_runtime_conversation_records, RuntimeStore};

use crate::runtime_store_aster_adapter::runtime_read_store_from_aster;
use crate::runtime_support::require_runtime_store;

pub(crate) async fn collect_conversation_records_from_aster_runtime_store(
    session_id: &str,
) -> Result<Vec<ConversationMessageRecord>, String> {
    let store = require_runtime_read_store()?;
    collect_runtime_conversation_records(store.as_ref(), session_id)
        .await
        .map_err(|error| format!("读取 runtime conversation records 失败: {error}"))
}

pub(crate) fn require_runtime_read_store() -> Result<Arc<dyn RuntimeStore>, String> {
    Ok(runtime_read_store_from_aster(require_runtime_store()?))
}

pub(crate) fn transcript_item_record_from_aster_message(
    turn: &TurnRuntime,
    message: &Message,
    sequence: i64,
) -> Result<RuntimeItemSnapshotRecord> {
    let now = timestamp_to_utc(message.created).unwrap_or_else(Utc::now);
    Ok(build_transcript_item_record(TranscriptItemRecordInput {
        thread_id: turn.thread_id.clone(),
        turn_id: turn.id.clone(),
        sequence,
        role: message_role(message),
        content_json: serde_json::to_value(&message.content)?,
        metadata_json: serde_json::to_value(&message.metadata)?,
        created_timestamp: message.created,
        message_id: message.id.clone(),
        recorded_at: now,
    }))
}

fn message_role(message: &Message) -> ConversationMessageRole {
    let role_debug = format!("{:?}", message.role);
    if role_debug.contains("User") {
        ConversationMessageRole::User
    } else {
        ConversationMessageRole::Assistant
    }
}

fn timestamp_to_utc(timestamp: i64) -> Option<DateTime<Utc>> {
    DateTime::from_timestamp(timestamp, 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transcript_item_record_from_aster_message_uses_current_record_builder() {
        let turn = TurnRuntime::new("turn-1", "session-1", "thread-1", None, None);
        let mut message = Message::user().with_text("hello");
        message.id = Some("message-1".to_string());
        message.created = 42;

        let item = transcript_item_record_from_aster_message(&turn, &message, 7).expect("record");

        assert_eq!(item.id, "transcript:message-1");
        assert_eq!(item.thread_id, "thread-1");
        assert_eq!(item.turn_id, "turn-1");
        assert_eq!(item.sequence, 7);
        assert!(matches!(
            item.payload,
            thread_store::runtime_snapshot::RuntimeItemPayloadRecord::InternalTranscript { .. }
        ));
    }
}
