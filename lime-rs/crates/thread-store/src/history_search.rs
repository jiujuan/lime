//! Session history search read model.
//!
//! This module owns the pure chat-history matching rules. Runtime-specific
//! crates should only adapt their storage DTOs into these records.

use chrono::{DateTime, Utc};

use crate::conversation_transcript::ConversationMessageRole;

#[derive(Clone, Debug, PartialEq)]
pub struct ConversationHistoryMessageRecord {
    pub role: ConversationMessageRole,
    pub content: String,
    pub created_at: Option<DateTime<Utc>>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SessionHistorySearchRecord {
    pub id: String,
    pub name: String,
    pub updated_at: DateTime<Utc>,
    pub messages: Vec<ConversationHistoryMessageRecord>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ChatHistoryMatchRecord {
    pub session_id: String,
    pub session_name: String,
    pub message_role: ConversationMessageRole,
    pub message_content: String,
    pub timestamp: DateTime<Utc>,
    pub relevance_score: f32,
}

pub fn search_chat_history_records(
    sessions: impl IntoIterator<Item = SessionHistorySearchRecord>,
    query: &str,
    limit: usize,
) -> Vec<ChatHistoryMatchRecord> {
    if limit == 0 {
        return Vec::new();
    }

    let normalized_query = query.trim();
    if normalized_query.is_empty() {
        return Vec::new();
    }

    let normalized_query = normalized_query.to_ascii_lowercase();
    let mut matches = Vec::new();
    for session in sessions {
        if matches.len() >= limit {
            break;
        }

        for message in session.messages {
            if !message
                .content
                .to_ascii_lowercase()
                .contains(&normalized_query)
            {
                continue;
            }

            matches.push(ChatHistoryMatchRecord {
                session_id: session.id.clone(),
                session_name: session.name.clone(),
                message_role: message.role,
                message_content: message.content,
                timestamp: message.created_at.unwrap_or(session.updated_at),
                relevance_score: 1.0,
            });

            if matches.len() >= limit {
                break;
            }
        }
    }

    matches
}

#[cfg(test)]
mod tests {
    use super::{
        search_chat_history_records, ConversationHistoryMessageRecord, SessionHistorySearchRecord,
    };
    use crate::conversation_transcript::ConversationMessageRole;
    use chrono::{DateTime, Utc};

    fn timestamp(seconds: i64) -> DateTime<Utc> {
        DateTime::from_timestamp(seconds, 0).expect("valid timestamp")
    }

    fn session(
        id: &str,
        updated_at: i64,
        messages: Vec<ConversationHistoryMessageRecord>,
    ) -> SessionHistorySearchRecord {
        SessionHistorySearchRecord {
            id: id.to_string(),
            name: format!("{id} name"),
            updated_at: timestamp(updated_at),
            messages,
        }
    }

    fn message(
        role: ConversationMessageRole,
        content: &str,
        created_at: Option<i64>,
    ) -> ConversationHistoryMessageRecord {
        ConversationHistoryMessageRecord {
            role,
            content: content.to_string(),
            created_at: created_at.map(timestamp),
        }
    }

    #[test]
    fn search_chat_history_records_should_match_in_order_and_respect_limit() {
        let matches = search_chat_history_records(
            vec![
                session(
                    "session-1",
                    10,
                    vec![
                        message(ConversationMessageRole::User, "hello Codex", Some(11)),
                        message(ConversationMessageRole::Assistant, "hello again", Some(12)),
                    ],
                ),
                session(
                    "session-2",
                    20,
                    vec![message(ConversationMessageRole::User, "hello late", None)],
                ),
            ],
            "HELLO",
            2,
        );

        assert_eq!(matches.len(), 2);
        assert_eq!(matches[0].session_id, "session-1");
        assert_eq!(matches[0].message_role, ConversationMessageRole::User);
        assert_eq!(matches[0].timestamp, timestamp(11));
        assert_eq!(matches[1].message_content, "hello again");
    }

    #[test]
    fn search_chat_history_records_should_fallback_to_session_updated_at() {
        let matches = search_chat_history_records(
            vec![session(
                "session-1",
                42,
                vec![message(ConversationMessageRole::Assistant, "needle", None)],
            )],
            "needle",
            10,
        );

        assert_eq!(matches[0].timestamp, timestamp(42));
        assert_eq!(matches[0].relevance_score, 1.0);
    }

    #[test]
    fn search_chat_history_records_should_return_empty_for_blank_query_or_zero_limit() {
        let sessions = vec![session(
            "session-1",
            42,
            vec![message(ConversationMessageRole::Assistant, "needle", None)],
        )];

        assert!(search_chat_history_records(sessions.clone(), " ", 10).is_empty());
        assert!(search_chat_history_records(sessions, "needle", 0).is_empty());
    }
}
