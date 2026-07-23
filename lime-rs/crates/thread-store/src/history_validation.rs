use super::ThreadHistoryBuilderError;
use agent_protocol::{SessionId, ThreadId, ThreadItem, ThreadItemPayload};

pub(super) fn validate_identity(
    expected_session: &mut Option<SessionId>,
    expected_thread: &mut Option<ThreadId>,
    session_id: &SessionId,
    thread_id: &ThreadId,
) -> Result<(), ThreadHistoryBuilderError> {
    match expected_session {
        Some(expected) if expected != session_id => {
            return Err(ThreadHistoryBuilderError::SessionIdentityMismatch {
                expected: expected.clone(),
                actual: session_id.clone(),
            });
        }
        None => *expected_session = Some(session_id.clone()),
        _ => {}
    }
    match expected_thread {
        Some(expected) if expected != thread_id => {
            return Err(ThreadHistoryBuilderError::ThreadIdentityMismatch {
                expected: expected.clone(),
                actual: thread_id.clone(),
            });
        }
        None => *expected_thread = Some(thread_id.clone()),
        _ => {}
    }
    Ok(())
}

pub(super) fn validate_item_content(item: &ThreadItem) -> Result<(), ThreadHistoryBuilderError> {
    let safe = match &item.payload {
        ThreadItemPayload::UserMessage { content, .. } => {
            !content.is_empty()
                && content.iter().all(|part| part.validate().is_ok())
                && !content.iter().all(|part| {
                    matches!(part, agent_protocol::AgentInput::Text { text, .. } if text.trim().is_empty())
                })
        }
        ThreadItemPayload::AgentMessage { content_parts, .. } => {
            content_parts.iter().all(|part| part.is_safe())
        }
        ThreadItemPayload::Media {
            uri,
            mime_type,
            preview,
        } => {
            !uri.trim().is_empty()
                && !mime_type.trim().is_empty()
                && !is_inline_payload_uri(uri)
                && preview
                    .as_deref()
                    .is_none_or(|uri| !is_inline_payload_uri(uri))
        }
        _ => true,
    };
    if safe {
        Ok(())
    } else {
        Err(ThreadHistoryBuilderError::UnsafeItemContent {
            item_id: item.item_id.clone(),
        })
    }
}

fn is_inline_payload_uri(uri: &str) -> bool {
    uri.trim_start().to_ascii_lowercase().starts_with("data:")
}
