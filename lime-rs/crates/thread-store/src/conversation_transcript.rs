use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConversationMessageRole {
    User,
    Assistant,
}

impl ConversationMessageRole {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::User => "user",
            Self::Assistant => "assistant",
        }
    }

    pub fn from_role_name(role: &str) -> Self {
        if role.trim().eq_ignore_ascii_case("assistant") {
            Self::Assistant
        } else {
            Self::User
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConversationMessageSource {
    Transcript,
    RuntimeProjection,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ConversationMessageRecord {
    pub source: ConversationMessageSource,
    pub role: ConversationMessageRole,
    pub content_json: Option<Value>,
    pub text: Option<String>,
    pub metadata_json: Option<Value>,
    pub created_timestamp: Option<i64>,
}

impl ConversationMessageRecord {
    pub fn transcript(
        role: ConversationMessageRole,
        content_json: Value,
        metadata_json: Value,
        created_timestamp: i64,
    ) -> Self {
        Self {
            source: ConversationMessageSource::Transcript,
            role,
            content_json: Some(content_json),
            text: None,
            metadata_json: Some(metadata_json),
            created_timestamp: Some(created_timestamp),
        }
    }

    pub fn runtime_projection(role: ConversationMessageRole, text: String) -> Option<Self> {
        let text = text.trim();
        if text.is_empty() {
            return None;
        }

        Some(Self {
            source: ConversationMessageSource::RuntimeProjection,
            role,
            content_json: None,
            text: Some(text.to_string()),
            metadata_json: None,
            created_timestamp: None,
        })
    }

    pub fn has_content(&self) -> bool {
        if self
            .text
            .as_deref()
            .is_some_and(|text| !text.trim().is_empty())
        {
            return true;
        }

        match self.content_json.as_ref() {
            Some(Value::Array(values)) => !values.is_empty(),
            Some(Value::String(text)) => !text.trim().is_empty(),
            Some(Value::Null) | None => false,
            Some(_) => true,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum RuntimeConversationItemSource {
    TranscriptMessage {
        role: ConversationMessageRole,
        content_json: Value,
        metadata_json: Value,
        created_timestamp: i64,
    },
    UserMessage {
        text: String,
    },
    AgentMessage {
        text: String,
    },
}

pub fn project_runtime_conversation_record(
    source: RuntimeConversationItemSource,
) -> Option<ConversationMessageRecord> {
    match source {
        RuntimeConversationItemSource::TranscriptMessage {
            role,
            content_json,
            metadata_json,
            created_timestamp,
        } => Some(ConversationMessageRecord::transcript(
            role,
            content_json,
            metadata_json,
            created_timestamp,
        )),
        RuntimeConversationItemSource::UserMessage { text } => {
            ConversationMessageRecord::runtime_projection(ConversationMessageRole::User, text)
        }
        RuntimeConversationItemSource::AgentMessage { text } => {
            ConversationMessageRecord::runtime_projection(ConversationMessageRole::Assistant, text)
        }
    }
}

pub fn count_selected_messages(records: &[ConversationMessageRecord]) -> usize {
    let transcript_count = records
        .iter()
        .filter(|record| {
            record.source == ConversationMessageSource::Transcript && record.has_content()
        })
        .count();
    if transcript_count > 0 {
        return transcript_count;
    }

    records
        .iter()
        .filter(|record| {
            record.source == ConversationMessageSource::RuntimeProjection && record.has_content()
        })
        .count()
}

pub fn select_conversation_messages(
    records: Vec<ConversationMessageRecord>,
) -> Vec<ConversationMessageRecord> {
    let mut transcript_messages = Vec::new();
    let mut projection_messages = Vec::new();

    for record in records {
        if !record.has_content() {
            continue;
        }
        match record.source {
            ConversationMessageSource::Transcript => transcript_messages.push(record),
            ConversationMessageSource::RuntimeProjection => projection_messages.push(record),
        }
    }

    if transcript_messages.is_empty() {
        projection_messages
    } else {
        transcript_messages
    }
}

pub fn truncate_before_timestamp(
    records: Vec<ConversationMessageRecord>,
    timestamp: i64,
) -> Vec<ConversationMessageRecord> {
    records
        .into_iter()
        .filter(|record| {
            record
                .created_timestamp
                .is_some_and(|created| created < timestamp)
        })
        .collect()
}

pub fn transcript_item_id(turn_id: &str, message_id: Option<&str>, sequence: i64) -> String {
    message_id
        .filter(|value| !value.trim().is_empty())
        .map(|id| format!("transcript:{id}"))
        .unwrap_or_else(|| format!("transcript:{turn_id}:{sequence}"))
}

#[cfg(test)]
mod tests {
    use super::{
        count_selected_messages, project_runtime_conversation_record, select_conversation_messages,
        transcript_item_id, truncate_before_timestamp, ConversationMessageRecord,
        ConversationMessageRole, ConversationMessageSource, RuntimeConversationItemSource,
    };

    fn transcript(created_timestamp: i64) -> ConversationMessageRecord {
        ConversationMessageRecord::transcript(
            ConversationMessageRole::User,
            serde_json::json!([{ "type": "text", "text": "hello" }]),
            serde_json::json!({ "userVisible": true, "agentVisible": true }),
            created_timestamp,
        )
    }

    #[test]
    fn select_conversation_messages_should_prefer_transcript_records() {
        let selected = select_conversation_messages(vec![
            ConversationMessageRecord::runtime_projection(
                ConversationMessageRole::User,
                "projection".to_string(),
            )
            .expect("projection"),
            transcript(10),
        ]);

        assert_eq!(selected.len(), 1);
        assert_eq!(selected[0].created_timestamp, Some(10));
        assert_eq!(count_selected_messages(&selected), 1);
    }

    #[test]
    fn select_conversation_messages_should_fallback_to_projection_records() {
        let selected = select_conversation_messages(
            vec![
                ConversationMessageRecord::runtime_projection(
                    ConversationMessageRole::Assistant,
                    "  ".to_string(),
                ),
                ConversationMessageRecord::runtime_projection(
                    ConversationMessageRole::Assistant,
                    "reply".to_string(),
                ),
            ]
            .into_iter()
            .flatten()
            .collect(),
        );

        assert_eq!(selected.len(), 1);
        assert_eq!(selected[0].text.as_deref(), Some("reply"));
        assert_eq!(count_selected_messages(&selected), 1);
    }

    #[test]
    fn project_runtime_conversation_record_should_keep_item_selection_rules_current() {
        let transcript =
            project_runtime_conversation_record(RuntimeConversationItemSource::TranscriptMessage {
                role: ConversationMessageRole::Assistant,
                content_json: serde_json::json!([{ "type": "text", "text": "reply" }]),
                metadata_json: serde_json::json!({ "agentVisible": true }),
                created_timestamp: 42,
            })
            .expect("transcript record");
        let user_projection =
            project_runtime_conversation_record(RuntimeConversationItemSource::UserMessage {
                text: "  hello  ".to_string(),
            })
            .expect("user projection");
        let empty_projection =
            project_runtime_conversation_record(RuntimeConversationItemSource::AgentMessage {
                text: " ".to_string(),
            });

        assert_eq!(transcript.source, ConversationMessageSource::Transcript);
        assert_eq!(transcript.role, ConversationMessageRole::Assistant);
        assert_eq!(transcript.created_timestamp, Some(42));
        assert_eq!(
            user_projection.source,
            ConversationMessageSource::RuntimeProjection
        );
        assert_eq!(user_projection.text.as_deref(), Some("hello"));
        assert!(empty_projection.is_none());
    }

    #[test]
    fn truncate_before_timestamp_should_keep_only_older_transcript_records() {
        let records = truncate_before_timestamp(vec![transcript(10), transcript(20)], 20);

        assert_eq!(
            records
                .iter()
                .map(|record| record.created_timestamp)
                .collect::<Vec<_>>(),
            vec![Some(10)]
        );
    }

    #[test]
    fn transcript_item_id_should_prefer_stable_message_id() {
        assert_eq!(
            transcript_item_id("turn-1", Some("message-1"), 2),
            "transcript:message-1"
        );
        assert_eq!(
            transcript_item_id("turn-1", Some(" "), 2),
            "transcript:turn-1:2"
        );
    }
}
