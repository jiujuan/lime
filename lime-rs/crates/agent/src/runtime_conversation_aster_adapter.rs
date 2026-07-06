//! Aster runtime conversation item adapter.
//!
//! Aster `ItemRuntimePayload` stays behind this compat boundary; current read
//! paths consume `thread-store` conversation records.

use anyhow::Result;
use aster::conversation::message::Message;
use aster::session::{
    ItemRuntime, ItemRuntimePayload, ItemStatus, ThreadRuntimeStore, TurnRuntime,
};
use chrono::{DateTime, Utc};
use thread_store::conversation_transcript::{
    project_runtime_conversation_record, transcript_item_id, ConversationMessageRecord,
    ConversationMessageRole, RuntimeConversationItemSource,
};

use crate::runtime_support::require_runtime_store;

pub(crate) async fn collect_conversation_records_from_aster_runtime_store(
    session_id: &str,
) -> Result<Vec<ConversationMessageRecord>, String> {
    let store = require_runtime_store()?;
    collect_conversation_records_from_aster_store(store.as_ref(), session_id).await
}

async fn collect_conversation_records_from_aster_store(
    store: &(impl ThreadRuntimeStore + ?Sized),
    session_id: &str,
) -> Result<Vec<ConversationMessageRecord>, String> {
    let mut records = Vec::new();
    let threads = store
        .list_threads(session_id)
        .await
        .map_err(|error| format!("读取 runtime conversation threads 失败: {error}"))?;
    for thread in threads {
        let items = store
            .list_items(&thread.id)
            .await
            .map_err(|error| format!("读取 runtime conversation items 失败: {error}"))?;
        for item in items {
            if let Some(record) = conversation_record_from_aster_item(item)
                .map_err(|error| format!("投影 runtime conversation item 失败: {error}"))?
            {
                records.push(record);
            }
        }
    }
    Ok(records)
}

pub(crate) fn conversation_record_from_aster_item(
    item: ItemRuntime,
) -> Result<Option<ConversationMessageRecord>> {
    Ok(conversation_source_from_aster_payload(item.payload)?
        .and_then(project_runtime_conversation_record))
}

pub(crate) fn is_aster_transcript_item_payload(payload: &ItemRuntimePayload) -> bool {
    matches!(payload, ItemRuntimePayload::TranscriptMessage { .. })
}

pub(crate) fn build_aster_transcript_item(
    turn: &TurnRuntime,
    message: &Message,
    sequence: i64,
) -> ItemRuntime {
    let now = timestamp_to_utc(message.created).unwrap_or_else(Utc::now);
    ItemRuntime {
        id: transcript_item_id(&turn.id, message.id.as_deref(), sequence),
        thread_id: turn.thread_id.clone(),
        turn_id: turn.id.clone(),
        sequence,
        status: ItemStatus::Completed,
        started_at: now,
        completed_at: Some(now),
        updated_at: now,
        payload: ItemRuntimePayload::TranscriptMessage {
            role: message_role(message).as_str().to_string(),
            content: message.content.clone(),
            metadata: message.metadata.clone(),
            created_timestamp: message.created,
        },
    }
}

fn conversation_source_from_aster_payload(
    payload: ItemRuntimePayload,
) -> Result<Option<RuntimeConversationItemSource>> {
    match payload {
        ItemRuntimePayload::TranscriptMessage {
            role,
            content,
            metadata,
            created_timestamp,
        } => Ok(Some(RuntimeConversationItemSource::TranscriptMessage {
            role: ConversationMessageRole::from_role_name(&role),
            content_json: serde_json::to_value(content)?,
            metadata_json: serde_json::to_value(metadata)?,
            created_timestamp,
        })),
        ItemRuntimePayload::UserMessage { content } => {
            Ok(Some(RuntimeConversationItemSource::UserMessage {
                text: content,
            }))
        }
        ItemRuntimePayload::AgentMessage { text } => {
            Ok(Some(RuntimeConversationItemSource::AgentMessage { text }))
        }
        _ => Ok(None),
    }
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
    use chrono::Utc;

    fn runtime_item(payload: ItemRuntimePayload) -> ItemRuntime {
        let now = Utc::now();
        ItemRuntime {
            id: "item-1".to_string(),
            thread_id: "thread-1".to_string(),
            turn_id: "turn-1".to_string(),
            sequence: 1,
            status: ItemStatus::Completed,
            started_at: now,
            completed_at: Some(now),
            updated_at: now,
            payload,
        }
    }

    #[test]
    fn conversation_record_from_aster_item_projects_transcript_payload() {
        let record = conversation_record_from_aster_item(runtime_item(
            ItemRuntimePayload::TranscriptMessage {
                role: "assistant".to_string(),
                content: Message::assistant().with_text("hello").content,
                metadata: Message::assistant().metadata,
                created_timestamp: 42,
            },
        ))
        .expect("project item")
        .expect("record");

        assert_eq!(record.role, ConversationMessageRole::Assistant);
        assert_eq!(record.created_timestamp, Some(42));
        assert!(record.content_json.is_some());
    }

    #[test]
    fn conversation_record_from_aster_item_projects_runtime_message_fallbacks() {
        let user_record =
            conversation_record_from_aster_item(runtime_item(ItemRuntimePayload::UserMessage {
                content: "  hello  ".to_string(),
            }))
            .expect("project user")
            .expect("user record");
        let empty_agent_record =
            conversation_record_from_aster_item(runtime_item(ItemRuntimePayload::AgentMessage {
                text: " ".to_string(),
            }))
            .expect("project agent");

        assert_eq!(user_record.role, ConversationMessageRole::User);
        assert_eq!(user_record.text.as_deref(), Some("hello"));
        assert!(empty_agent_record.is_none());
    }

    #[test]
    fn build_aster_transcript_item_keeps_transcript_payload_behind_adapter() {
        let turn = TurnRuntime::new("turn-1", "session-1", "thread-1", None, None);
        let mut message = Message::user().with_text("hello");
        message.id = Some("message-1".to_string());
        message.created = 42;

        let item = build_aster_transcript_item(&turn, &message, 7);

        assert_eq!(item.id, "transcript:message-1");
        assert_eq!(item.thread_id, "thread-1");
        assert_eq!(item.turn_id, "turn-1");
        assert_eq!(item.sequence, 7);
        assert!(is_aster_transcript_item_payload(&item.payload));
    }
}
