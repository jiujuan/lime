//! Legacy conversation import read model.
//!
//! This module owns the shape and defaults for the old `agent_messages`
//! `content_json` payload. Runtime-specific adapters should only translate the
//! parsed JSON values into their own message DTOs.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::conversation_transcript::ConversationMessageRole;

#[derive(Clone, Debug, PartialEq)]
pub struct LegacyConversationMessageContentRecord {
    pub content: Vec<Value>,
    pub user_visible: bool,
    pub agent_visible: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub struct LegacyConversationMessageRecord {
    pub role: ConversationMessageRole,
    pub content: Vec<Value>,
    pub user_visible: bool,
    pub agent_visible: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedLegacyConversationMessageContentRecord {
    content: Vec<Value>,
    #[serde(default = "visibility_default_true")]
    user_visible: bool,
    #[serde(default = "visibility_default_true")]
    agent_visible: bool,
}

fn visibility_default_true() -> bool {
    true
}

pub fn serialize_persisted_legacy_message_content_record(
    content: Vec<Value>,
    user_visible: bool,
    agent_visible: bool,
) -> serde_json::Result<String> {
    serde_json::to_string(&PersistedLegacyConversationMessageContentRecord {
        content,
        user_visible,
        agent_visible,
    })
}

pub fn deserialize_persisted_legacy_message_content_record(
    content_json: &str,
) -> Option<LegacyConversationMessageContentRecord> {
    if let Ok(record) =
        serde_json::from_str::<PersistedLegacyConversationMessageContentRecord>(content_json)
    {
        return Some(LegacyConversationMessageContentRecord {
            content: record.content,
            user_visible: record.user_visible,
            agent_visible: record.agent_visible,
        });
    }

    let content: Vec<Value> = serde_json::from_str(content_json).ok()?;
    Some(LegacyConversationMessageContentRecord {
        content,
        user_visible: true,
        agent_visible: true,
    })
}

pub fn project_legacy_conversation_message_record(
    role: &str,
    content_json: &str,
) -> Option<LegacyConversationMessageRecord> {
    let content = deserialize_persisted_legacy_message_content_record(content_json)?;
    Some(LegacyConversationMessageRecord {
        role: ConversationMessageRole::from_role_name(role),
        content: content.content,
        user_visible: content.user_visible,
        agent_visible: content.agent_visible,
    })
}

#[cfg(test)]
mod tests {
    use super::{
        deserialize_persisted_legacy_message_content_record,
        project_legacy_conversation_message_record,
        serialize_persisted_legacy_message_content_record,
    };
    use crate::conversation_transcript::ConversationMessageRole;

    #[test]
    fn deserialize_persisted_legacy_message_content_record_should_read_envelope_visibility() {
        let raw = serialize_persisted_legacy_message_content_record(
            vec![serde_json::json!({ "type": "text", "text": "hidden" })],
            false,
            true,
        )
        .expect("serialize legacy content");

        let record = deserialize_persisted_legacy_message_content_record(&raw)
            .expect("deserialize legacy content");

        assert_eq!(record.content.len(), 1);
        assert!(!record.user_visible);
        assert!(record.agent_visible);
    }

    #[test]
    fn deserialize_persisted_legacy_message_content_record_should_default_old_array_visibility() {
        let record = deserialize_persisted_legacy_message_content_record(
            r#"[{"type":"text","text":"hello"}]"#,
        )
        .expect("deserialize old array content");

        assert_eq!(record.content.len(), 1);
        assert!(record.user_visible);
        assert!(record.agent_visible);
    }

    #[test]
    fn project_legacy_conversation_message_record_should_normalize_role() {
        let assistant = project_legacy_conversation_message_record(
            "assistant",
            r#"[{"type":"text","text":"reply"}]"#,
        )
        .expect("assistant record");
        let user = project_legacy_conversation_message_record(
            "system",
            r#"[{"type":"text","text":"prompt"}]"#,
        )
        .expect("user record");

        assert_eq!(assistant.role, ConversationMessageRole::Assistant);
        assert_eq!(user.role, ConversationMessageRole::User);
    }
}
