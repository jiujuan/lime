use anyhow::Result;
use aster::Conversation;
use aster::{Message, MessageContent, MessageMetadata};
use thread_store::conversation_transcript::ConversationMessageRole;
use thread_store::legacy_conversation::{
    project_legacy_conversation_message_record, LegacyConversationMessageRecord,
};

#[cfg(test)]
use thread_store::legacy_conversation::serialize_persisted_legacy_message_content_record;

#[cfg(test)]
pub(super) fn serialize_persisted_message_content(message: &Message) -> Result<String> {
    let content = message
        .content
        .iter()
        .cloned()
        .map(serde_json::to_value)
        .collect::<serde_json::Result<Vec<_>>>()
        .map_err(|e| anyhow::anyhow!("序列化消息内容失败: {e}"))?;

    serialize_persisted_legacy_message_content_record(
        content,
        message.metadata.user_visible,
        message.metadata.agent_visible,
    )
    .map_err(|e| anyhow::anyhow!("序列化消息内容失败: {e}"))
}

/// 从旧消息表读取迁移输入；运行期产品读回不得直接返回此结果。
pub(super) fn load_for_migration(
    conn: &rusqlite::Connection,
    session_id: &str,
) -> Result<Conversation> {
    let mut stmt = match conn.prepare(
        "SELECT role, content_json, timestamp, tool_calls_json, tool_call_id
         FROM agent_messages WHERE session_id = ? ORDER BY id ASC",
    ) {
        Ok(stmt) => stmt,
        Err(rusqlite::Error::SqliteFailure(_, Some(message)))
            if message.contains("no such table: agent_messages") =>
        {
            return Ok(Conversation::new_unvalidated(Vec::new()));
        }
        Err(error) => return Err(error.into()),
    };

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
            let record = project_legacy_conversation_message_record(&role, &content_json)?;
            message_from_legacy_record(record)
        })
        .collect();

    Ok(Conversation::new_unvalidated(messages))
}

fn message_from_legacy_record(record: LegacyConversationMessageRecord) -> Option<Message> {
    let mut message = match record.role {
        ConversationMessageRole::Assistant => Message::assistant(),
        ConversationMessageRole::User => Message::user(),
    };

    for content_value in record.content {
        let content = serde_json::from_value::<MessageContent>(content_value).ok()?;
        message = message.with_content(content);
    }

    Some(message.with_metadata(MessageMetadata {
        user_visible: record.user_visible,
        agent_visible: record.agent_visible,
    }))
}
