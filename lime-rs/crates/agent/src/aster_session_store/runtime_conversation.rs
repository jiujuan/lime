use anyhow::Result;
use aster::conversation::message::Message;
use aster::conversation::Conversation;
use aster::session::{
    require_shared_session_runtime_store, ItemRuntime, ItemRuntimePayload, ItemStatus,
    ThreadRuntime, TurnRuntime,
};
use chrono::{DateTime, Utc};
use std::path::Path;
use thread_store::conversation_transcript::{
    count_selected_messages, select_conversation_messages, transcript_item_id,
    ConversationMessageRecord, ConversationMessageRole,
};
use uuid::Uuid;

pub(super) async fn load_runtime_conversation(session_id: &str) -> Result<Option<Conversation>> {
    let store = require_shared_session_runtime_store()?;
    load_runtime_conversation_from_store(store.as_ref(), session_id).await
}

pub(super) async fn count_runtime_messages(session_id: &str) -> Result<Option<usize>> {
    let store = require_shared_session_runtime_store()?;
    let threads = store.list_threads(session_id).await?;
    if threads.is_empty() {
        return Ok(None);
    }

    let records = collect_conversation_records_from_threads(store.as_ref(), threads).await?;
    Ok(Some(count_selected_messages(&records)))
}

pub(super) async fn append_runtime_message(
    session_id: &str,
    working_dir: &Path,
    message: &Message,
) -> Result<usize> {
    let store = require_shared_session_runtime_store()?;
    let turn = ensure_runtime_turn(store.as_ref(), session_id, working_dir).await?;
    let existing_items = store.list_items(&turn.thread_id).await?;
    let next_sequence = existing_items
        .iter()
        .map(|item| item.sequence)
        .max()
        .unwrap_or(0)
        + 1;
    let item = build_transcript_item(&turn, message, next_sequence);

    if store.get_item(&item.id).await?.is_some() {
        store.update_item(item).await?;
    } else {
        store.create_item(item).await?;
    }

    Ok(count_runtime_messages(session_id).await?.unwrap_or(1))
}

pub(super) async fn replace_runtime_conversation(
    session_id: &str,
    working_dir: &Path,
    conversation: &Conversation,
) -> Result<usize> {
    let store = require_shared_session_runtime_store()?;
    delete_transcript_items(store.as_ref(), session_id).await?;
    let turn = ensure_runtime_turn(store.as_ref(), session_id, working_dir).await?;

    for (index, message) in conversation.messages().iter().enumerate() {
        let item = build_transcript_item(&turn, message, index as i64 + 1);
        store.create_item(item).await?;
    }

    Ok(conversation.messages().len())
}

pub(super) async fn import_legacy_conversation_if_runtime_empty(
    session_id: &str,
    working_dir: &Path,
    conversation: &Conversation,
) -> Result<Option<usize>> {
    if count_runtime_messages(session_id).await?.unwrap_or(0) > 0 {
        return Ok(None);
    }

    replace_runtime_conversation(session_id, working_dir, conversation)
        .await
        .map(Some)
}

async fn delete_transcript_items(
    store: &(impl aster::session::ThreadRuntimeStore + ?Sized),
    session_id: &str,
) -> Result<()> {
    for thread in store.list_threads(session_id).await? {
        for item in store.list_items(&thread.id).await? {
            if matches!(item.payload, ItemRuntimePayload::TranscriptMessage { .. }) {
                store.delete_item(&item.id).await?;
            }
        }
    }
    Ok(())
}

pub(super) async fn truncate_runtime_conversation(
    session_id: &str,
    working_dir: &Path,
    timestamp: i64,
) -> Result<usize> {
    let current = load_runtime_conversation(session_id)
        .await?
        .unwrap_or_default();
    let messages = current
        .messages()
        .iter()
        .filter(|message| message.created < timestamp)
        .cloned()
        .collect::<Vec<_>>();
    let truncated = Conversation::new_unvalidated(messages);
    replace_runtime_conversation(session_id, working_dir, &truncated).await
}

async fn load_runtime_conversation_from_store(
    store: &(impl aster::session::ThreadRuntimeStore + ?Sized),
    session_id: &str,
) -> Result<Option<Conversation>> {
    let threads = store.list_threads(session_id).await?;
    let records = collect_conversation_records_from_threads(store, threads).await?;
    let messages = select_conversation_messages(records)
        .into_iter()
        .filter_map(|record| match conversation_record_to_message(record) {
            Ok(message) => message,
            Err(error) => {
                tracing::warn!(
                    "[SessionStore] runtime conversation record 转换失败，已跳过: error={}",
                    error
                );
                None
            }
        })
        .collect::<Vec<_>>();

    if messages.is_empty() {
        Ok(None)
    } else {
        Ok(Some(Conversation::new_unvalidated(messages)))
    }
}

async fn collect_conversation_records_from_threads(
    store: &(impl aster::session::ThreadRuntimeStore + ?Sized),
    threads: Vec<ThreadRuntime>,
) -> Result<Vec<ConversationMessageRecord>> {
    let mut records = Vec::new();
    for thread in threads {
        for item in store.list_items(&thread.id).await? {
            if let Some(record) = conversation_record_from_item(item)? {
                records.push(record);
            }
        }
    }
    Ok(records)
}

fn conversation_record_from_item(item: ItemRuntime) -> Result<Option<ConversationMessageRecord>> {
    match item.payload {
        ItemRuntimePayload::TranscriptMessage {
            role,
            content,
            metadata,
            created_timestamp,
        } => Ok(Some(ConversationMessageRecord::transcript(
            ConversationMessageRole::from_role_name(&role),
            serde_json::to_value(content)?,
            serde_json::to_value(metadata)?,
            created_timestamp,
        ))),
        ItemRuntimePayload::UserMessage { content } => Ok(
            ConversationMessageRecord::runtime_projection(ConversationMessageRole::User, content),
        ),
        ItemRuntimePayload::AgentMessage { text } => Ok(
            ConversationMessageRecord::runtime_projection(ConversationMessageRole::Assistant, text),
        ),
        _ => Ok(None),
    }
}

fn conversation_record_to_message(record: ConversationMessageRecord) -> Result<Option<Message>> {
    let mut message = match record.role {
        ConversationMessageRole::User => Message::user(),
        ConversationMessageRole::Assistant => Message::assistant(),
    };

    if let Some(created_timestamp) = record.created_timestamp {
        message.created = created_timestamp;
    }

    if let Some(content_json) = record.content_json {
        message.content = serde_json::from_value(content_json)?;
        if let Some(metadata_json) = record.metadata_json {
            message.metadata = serde_json::from_value(metadata_json)?;
        }
        return Ok((!message.content.is_empty()).then_some(message));
    }

    Ok(record.text.and_then(|text| text_message(message, text)))
}

async fn ensure_runtime_turn(
    store: &(impl aster::session::ThreadRuntimeStore + ?Sized),
    session_id: &str,
    working_dir: &Path,
) -> Result<TurnRuntime> {
    let scope = aster::session_context::current_action_scope();
    let thread_id = scope
        .as_ref()
        .and_then(|scope| scope.thread_id.clone())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| session_id.to_string());
    let turn_id = scope
        .as_ref()
        .and_then(|scope| scope.turn_id.clone())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    let thread = store
        .get_thread(&thread_id)
        .await?
        .unwrap_or_else(|| ThreadRuntime::new(&thread_id, session_id, working_dir.to_path_buf()));
    store.upsert_thread(thread).await?;

    if let Some(turn) = store.get_turn(&turn_id).await? {
        return Ok(turn);
    }

    store
        .create_turn(TurnRuntime::new(
            turn_id,
            session_id.to_string(),
            thread_id,
            None,
            aster::session_context::current_turn_context(),
        ))
        .await
}

fn build_transcript_item(turn: &TurnRuntime, message: &Message, sequence: i64) -> ItemRuntime {
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

fn text_message(message: Message, text: String) -> Option<Message> {
    let text = text.trim();
    if text.is_empty() {
        None
    } else {
        Some(message.with_text(text))
    }
}
