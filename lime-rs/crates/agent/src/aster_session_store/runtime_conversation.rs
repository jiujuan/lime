use anyhow::Result;
use aster::conversation::message::Message;
use aster::conversation::Conversation;
use aster::session::{
    require_shared_session_runtime_store, ItemRuntime, ItemRuntimePayload, ItemStatus,
    ThreadRuntime, TurnRuntime,
};
use chrono::{DateTime, Utc};
use std::path::Path;
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

    let mut transcript_count = 0usize;
    let mut projection_count = 0usize;
    for thread in threads {
        for item in store.list_items(&thread.id).await? {
            match item.payload {
                ItemRuntimePayload::TranscriptMessage { .. } => transcript_count += 1,
                ItemRuntimePayload::UserMessage { .. }
                | ItemRuntimePayload::AgentMessage { .. } => {
                    projection_count += 1;
                }
                _ => {}
            }
        }
    }

    Ok(Some(if transcript_count > 0 {
        transcript_count
    } else {
        projection_count
    }))
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
    let mut transcript_messages = Vec::new();
    let mut projection_messages = Vec::new();

    for thread in threads {
        for item in store.list_items(&thread.id).await? {
            match item.payload {
                ItemRuntimePayload::TranscriptMessage {
                    role,
                    content,
                    metadata,
                    created_timestamp,
                } => {
                    let mut message = if role == "assistant" {
                        Message::assistant()
                    } else {
                        Message::user()
                    };
                    message.created = created_timestamp;
                    message.content = content;
                    message.metadata = metadata;
                    if !message.content.is_empty() {
                        transcript_messages.push(message);
                    }
                }
                ItemRuntimePayload::UserMessage { content } => {
                    if let Some(message) = text_message(Message::user(), content) {
                        projection_messages.push(message);
                    }
                }
                ItemRuntimePayload::AgentMessage { text } => {
                    if let Some(message) = text_message(Message::assistant(), text) {
                        projection_messages.push(message);
                    }
                }
                _ => {}
            }
        }
    }

    let messages = if transcript_messages.is_empty() {
        projection_messages
    } else {
        transcript_messages
    };

    if messages.is_empty() {
        Ok(None)
    } else {
        Ok(Some(Conversation::new_unvalidated(messages)))
    }
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
        id: transcript_item_id(turn, message, sequence),
        thread_id: turn.thread_id.clone(),
        turn_id: turn.id.clone(),
        sequence,
        status: ItemStatus::Completed,
        started_at: now,
        completed_at: Some(now),
        updated_at: now,
        payload: ItemRuntimePayload::TranscriptMessage {
            role: message_role(message),
            content: message.content.clone(),
            metadata: message.metadata.clone(),
            created_timestamp: message.created,
        },
    }
}

fn transcript_item_id(turn: &TurnRuntime, message: &Message, sequence: i64) -> String {
    message
        .id
        .as_ref()
        .filter(|value| !value.trim().is_empty())
        .map(|id| format!("transcript:{id}"))
        .unwrap_or_else(|| format!("transcript:{}:{sequence}", turn.id))
}

fn message_role(message: &Message) -> String {
    let role_debug = format!("{:?}", message.role);
    if role_debug.contains("User") {
        "user".to_string()
    } else {
        "assistant".to_string()
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
