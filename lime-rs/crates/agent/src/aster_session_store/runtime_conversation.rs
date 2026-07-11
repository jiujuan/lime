use anyhow::Result;
use aster::Conversation;
use aster::Message;
use aster::TurnRuntime;
use std::path::Path;
use thread_store::conversation_transcript::{
    count_selected_messages, select_conversation_messages, ConversationMessageRecord,
    ConversationMessageRole,
};
use thread_store::runtime_store::{
    collect_runtime_conversation_records, delete_runtime_transcript_items,
    ensure_runtime_turn_record, next_runtime_item_sequence_for_thread, upsert_runtime_item_record,
    RuntimeItemStore, RuntimeStore, RuntimeTurnEnsureInput, RuntimeTurnScopeInput,
};

use crate::runtime_conversation_aster_adapter::transcript_item_record_from_aster_message;
use crate::runtime_store_aster_adapter::{
    aster_turn_from_runtime_record, runtime_item_store_from_aster, runtime_read_store_from_aster,
    runtime_thread_turn_store_from_aster, AsterThreadRuntimeStore,
};
use crate::runtime_support::require_runtime_store;
use crate::turn_context_configuration::to_agent_turn_context;

pub(super) async fn load_runtime_conversation(session_id: &str) -> Result<Option<Conversation>> {
    let store = require_runtime_store_for_conversation()?;
    let read_store = runtime_read_store_from_aster(store);
    load_runtime_conversation_from_store(read_store.as_ref(), session_id).await
}

pub(super) async fn count_runtime_messages(session_id: &str) -> Result<Option<usize>> {
    let store = require_runtime_store_for_conversation()?;
    let read_store = runtime_read_store_from_aster(store);
    let records = collect_runtime_conversation_records(read_store.as_ref(), session_id).await?;
    let count = count_selected_messages(&records);
    if count == 0 {
        return Ok(None);
    }

    Ok(Some(count))
}

pub(super) async fn append_runtime_message(
    session_id: &str,
    working_dir: &Path,
    message: &Message,
) -> Result<usize> {
    let store = require_runtime_store_for_conversation()?;
    let item_store = runtime_item_store_from_aster(store.clone());
    let turn = ensure_runtime_turn(store.clone(), session_id, working_dir).await?;
    let next_sequence =
        next_runtime_item_sequence_for_thread(item_store.as_ref(), &turn.thread_id).await?;
    let item = transcript_item_record_from_aster_message(&turn, message, next_sequence)?;
    upsert_runtime_item_record(item_store.as_ref(), item).await?;

    Ok(count_runtime_messages(session_id).await?.unwrap_or(1))
}

pub(super) async fn replace_runtime_conversation(
    session_id: &str,
    working_dir: &Path,
    conversation: &Conversation,
) -> Result<usize> {
    let store = require_runtime_store_for_conversation()?;
    let item_store = runtime_item_store_from_aster(store.clone());
    delete_transcript_items(item_store.as_ref(), session_id).await?;
    let turn = ensure_runtime_turn(store.clone(), session_id, working_dir).await?;

    for (index, message) in conversation.messages().iter().enumerate() {
        let item = transcript_item_record_from_aster_message(&turn, message, index as i64 + 1)?;
        upsert_runtime_item_record(item_store.as_ref(), item).await?;
    }

    Ok(conversation.messages().len())
}

fn require_runtime_store_for_conversation() -> Result<std::sync::Arc<AsterThreadRuntimeStore>> {
    require_runtime_store().map_err(anyhow::Error::msg)
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
    store: &(impl RuntimeItemStore + ?Sized),
    session_id: &str,
) -> Result<()> {
    Ok(delete_runtime_transcript_items(store, session_id).await?)
}

async fn load_runtime_conversation_from_store(
    store: &(impl RuntimeStore + ?Sized),
    session_id: &str,
) -> Result<Option<Conversation>> {
    let records = collect_runtime_conversation_records(store, session_id).await?;
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
    store: std::sync::Arc<AsterThreadRuntimeStore>,
    session_id: &str,
    working_dir: &Path,
) -> Result<TurnRuntime> {
    let scope = aster::current_action_scope();
    let turn_store = runtime_thread_turn_store_from_aster(store);
    let turn = ensure_runtime_turn_record(
        turn_store.as_ref(),
        RuntimeTurnEnsureInput {
            session_id: session_id.to_string(),
            working_dir: working_dir.to_path_buf(),
            scope: RuntimeTurnScopeInput {
                thread_id: scope.as_ref().and_then(|scope| scope.thread_id.clone()),
                turn_id: scope.as_ref().and_then(|scope| scope.turn_id.clone()),
            },
            input_text: None,
            context_override: aster::current_turn_context().map(to_agent_turn_context),
            output_schema_runtime: None,
        },
    )
    .await?;

    Ok(aster_turn_from_runtime_record(turn))
}

fn text_message(message: Message, text: String) -> Option<Message> {
    let text = text.trim();
    if text.is_empty() {
        None
    } else {
        Some(message.with_text(text))
    }
}
