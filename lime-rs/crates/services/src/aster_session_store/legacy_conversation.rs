use anyhow::Result;
use aster::conversation::message::{Message, MessageContent, MessageMetadata};
use aster::conversation::Conversation;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedConversationMessageRecord {
    content: Vec<MessageContent>,
    #[serde(default = "persisted_visibility_default_true")]
    user_visible: bool,
    #[serde(default = "persisted_visibility_default_true")]
    agent_visible: bool,
}

fn persisted_visibility_default_true() -> bool {
    true
}

#[cfg(test)]
pub(super) fn serialize_persisted_message_content(message: &Message) -> Result<String> {
    serde_json::to_string(&PersistedConversationMessageRecord {
        content: message.content.clone(),
        user_visible: message.metadata.user_visible,
        agent_visible: message.metadata.agent_visible,
    })
    .map_err(|e| anyhow::anyhow!("序列化消息内容失败: {e}"))
}

fn deserialize_persisted_message_content(
    content_json: &str,
) -> Option<PersistedConversationMessageRecord> {
    if let Ok(record) = serde_json::from_str::<PersistedConversationMessageRecord>(content_json) {
        return Some(record);
    }

    let content: Vec<MessageContent> = serde_json::from_str(content_json).ok()?;
    Some(PersistedConversationMessageRecord {
        content,
        user_visible: true,
        agent_visible: true,
    })
}

/// 从旧消息表读取迁移输入；运行期产品读回不得直接返回此结果。
pub(super) fn load_for_migration(
    conn: &rusqlite::Connection,
    session_id: &str,
) -> Result<Conversation> {
    let mut stmt = conn.prepare(
        "SELECT role, content_json, timestamp, tool_calls_json, tool_call_id
         FROM agent_messages WHERE session_id = ? ORDER BY id ASC",
    )?;

    let messages: Vec<Message> = stmt
        .query_map([session_id], |row| {
            let role: String = row.get(0)?;
            let content_json: String = row.get(1)?;
            let _timestamp: String = row.get(2)?;
            let _tool_calls_json: Option<String> = row.get(3)?;
            let _tool_call_id: Option<String> = row.get(4)?;

            Ok((role, content_json))
        })?
        .filter_map(|r| r.ok())
        .filter_map(|(role, content_json)| {
            let persisted = deserialize_persisted_message_content(&content_json)?;

            let mut message = if role == "assistant" {
                Message::assistant()
            } else {
                Message::user()
            };

            for content in persisted.content {
                message = message.with_content(content);
            }

            message = message.with_metadata(MessageMetadata {
                user_visible: persisted.user_visible,
                agent_visible: persisted.agent_visible,
            });

            Some(message)
        })
        .collect();

    Ok(Conversation::new_unvalidated(messages))
}
