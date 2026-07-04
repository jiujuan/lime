use anyhow::Result;
use aster::session::{ChatHistoryMatch, Session};

use super::runtime_conversation;

fn runtime_message_role(message: &aster::conversation::message::Message) -> String {
    let role_debug = format!("{:?}", message.role);
    if role_debug.contains("User") {
        "user".to_string()
    } else {
        "assistant".to_string()
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

    let normalized_query = normalized_query.to_ascii_lowercase();
    let mut matches = Vec::new();
    for session in sessions {
        if matches.len() >= limit {
            break;
        }
        let Some(conversation) =
            runtime_conversation::load_runtime_conversation(&session.id).await?
        else {
            continue;
        };
        for message in conversation.messages() {
            let content = message.as_concat_text();
            if !content.to_ascii_lowercase().contains(&normalized_query) {
                continue;
            }
            matches.push(ChatHistoryMatch {
                session_id: session.id.clone(),
                session_name: session.name.clone(),
                message_role: runtime_message_role(message),
                message_content: content,
                timestamp: chrono::DateTime::from_timestamp(message.created, 0)
                    .unwrap_or(session.updated_at),
                relevance_score: 1.0,
            });
            if matches.len() >= limit {
                break;
            }
        }
    }

    Ok(matches)
}
