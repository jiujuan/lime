use anyhow::Result;
use aster::{ChatHistoryMatch, Session};
use chrono::DateTime;
use thread_store::conversation_transcript::ConversationMessageRole;
use thread_store::history_search::{
    search_chat_history_records, ChatHistoryMatchRecord, ConversationHistoryMessageRecord,
    SessionHistorySearchRecord,
};

use super::runtime_conversation;

fn conversation_message_role_from_aster(message: &aster::Message) -> ConversationMessageRole {
    match message.role {
        rmcp::model::Role::User => ConversationMessageRole::User,
        rmcp::model::Role::Assistant => ConversationMessageRole::Assistant,
    }
}

pub(super) async fn search_chat_history(
    sessions: Vec<Session>,
    query: &str,
    limit: usize,
) -> Result<Vec<ChatHistoryMatch>> {
    let normalized_query = query.trim();
    if normalized_query.is_empty() {
        return Ok(Vec::new());
    }

    let mut records = Vec::new();
    for session in sessions {
        let Some(conversation) =
            runtime_conversation::load_runtime_conversation(&session.id).await?
        else {
            continue;
        };
        records.push(SessionHistorySearchRecord {
            id: session.id,
            name: session.name,
            updated_at: session.updated_at,
            messages: conversation
                .messages()
                .iter()
                .map(|message| ConversationHistoryMessageRecord {
                    role: conversation_message_role_from_aster(message),
                    content: message.as_concat_text(),
                    created_at: DateTime::from_timestamp(message.created, 0),
                })
                .collect(),
        });
    }

    Ok(
        search_chat_history_records(records, normalized_query, limit)
            .into_iter()
            .map(chat_history_match_from_record)
            .collect(),
    )
}

fn chat_history_match_from_record(record: ChatHistoryMatchRecord) -> ChatHistoryMatch {
    ChatHistoryMatch {
        session_id: record.session_id,
        session_name: record.session_name,
        message_role: record.message_role.as_str().to_string(),
        message_content: record.message_content,
        timestamp: record.timestamp,
        relevance_score: record.relevance_score,
    }
}

#[cfg(test)]
mod tests {
    use super::conversation_message_role_from_aster;
    use aster::Message;
    use thread_store::conversation_transcript::ConversationMessageRole;

    #[test]
    fn conversation_message_role_from_aster_should_project_rmcp_role() {
        assert_eq!(
            conversation_message_role_from_aster(&Message::user()),
            ConversationMessageRole::User
        );
        assert_eq!(
            conversation_message_role_from_aster(&Message::assistant()),
            ConversationMessageRole::Assistant
        );
    }
}
