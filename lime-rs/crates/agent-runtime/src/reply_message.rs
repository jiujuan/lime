//! Reply message 的 current contract。
//!
//! 该模块表达 Turn 执行链内部要发送给 provider/reply backend 的消息内容。
//! 后端专用 DTO 必须在 adapter 边界 lowering，不能把外部框架的 Message 类型变成事实源。

use crate::reply_input::{
    RuntimeActionRequiredResponseInput, RuntimeReplyAttemptInput, RuntimeReplyInput,
};
use agent_protocol::action_required::ActionRequiredScope;
use serde_json::Value;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum RuntimeReplyMessageRole {
    User,
}

#[derive(Clone, Debug, PartialEq)]
pub enum RuntimeReplyMessageContent {
    Text(String),
    Image {
        uri: String,
        media_type: String,
        provider_data: Option<String>,
    },
    ActionRequiredResponse {
        request_id: String,
        user_data: Value,
        scope: Option<ActionRequiredScope>,
    },
}

#[derive(Clone, Debug, PartialEq)]
pub struct RuntimeReplyMessage {
    pub role: RuntimeReplyMessageRole,
    pub content: Vec<RuntimeReplyMessageContent>,
    pub agent_only: bool,
}

impl RuntimeReplyMessage {
    pub fn user(content: Vec<RuntimeReplyMessageContent>) -> Self {
        Self {
            role: RuntimeReplyMessageRole::User,
            content,
            agent_only: false,
        }
    }

    pub fn from_input(input: RuntimeReplyInput) -> Self {
        let mut content = Vec::with_capacity(input.images.len() + 1);
        content.push(RuntimeReplyMessageContent::Text(input.text));
        content.extend(
            input
                .images
                .into_iter()
                .map(|image| RuntimeReplyMessageContent::Image {
                    uri: image.uri,
                    media_type: image.media_type,
                    provider_data: image.provider_data,
                }),
        );

        Self {
            role: RuntimeReplyMessageRole::User,
            content,
            agent_only: input.agent_only,
        }
    }

    pub fn from_action_required_response(input: RuntimeActionRequiredResponseInput) -> Self {
        Self::user(vec![RuntimeReplyMessageContent::ActionRequiredResponse {
            request_id: input.request_id,
            user_data: input.user_data,
            scope: input.scope,
        }])
    }

    pub fn from_attempt_input(input: RuntimeReplyAttemptInput) -> Self {
        match input {
            RuntimeReplyAttemptInput::Current(input) => Self::from_input(input),
            RuntimeReplyAttemptInput::ActionRequiredResponse(input) => {
                Self::from_action_required_response(input)
            }
        }
    }

    pub fn concat_text(&self) -> String {
        self.content
            .iter()
            .filter_map(|content| match content {
                RuntimeReplyMessageContent::Text(text) => Some(text.as_str()),
                RuntimeReplyMessageContent::Image { .. }
                | RuntimeReplyMessageContent::ActionRequiredResponse { .. } => None,
            })
            .collect::<Vec<_>>()
            .join("")
    }

    pub fn has_images(&self) -> bool {
        self.content
            .iter()
            .any(|content| matches!(content, RuntimeReplyMessageContent::Image { .. }))
    }
}

impl From<RuntimeReplyAttemptInput> for RuntimeReplyMessage {
    fn from(input: RuntimeReplyAttemptInput) -> Self {
        Self::from_attempt_input(input)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::reply_input::{RuntimeReplyInput, RuntimeReplyInputImage};
    use serde_json::json;

    #[test]
    fn reply_message_preserves_text_image_and_agent_only() {
        let input = RuntimeReplyInput {
            text: "look".to_string(),
            images: vec![RuntimeReplyInputImage {
                uri: "sidecar://image-1".to_string(),
                media_type: "image/png".to_string(),
                provider_data: Some("data:image/png;base64,abc".to_string()),
            }],
            agent_only: true,
        };

        let message = RuntimeReplyMessage::from_input(input);

        assert_eq!(message.role, RuntimeReplyMessageRole::User);
        assert!(message.agent_only);
        assert!(message.has_images());
        assert_eq!(message.concat_text(), "look");
        assert_eq!(
            message.content,
            vec![
                RuntimeReplyMessageContent::Text("look".to_string()),
                RuntimeReplyMessageContent::Image {
                    uri: "sidecar://image-1".to_string(),
                    media_type: "image/png".to_string(),
                    provider_data: Some("data:image/png;base64,abc".to_string()),
                },
            ]
        );
    }

    #[test]
    fn reply_message_preserves_action_required_response() {
        let message = RuntimeReplyMessage::from_action_required_response(
            RuntimeActionRequiredResponseInput::new(
                "request-1",
                json!({"answer": "ok"}),
                Some(ActionRequiredScope {
                    session_id: Some("session-1".to_string()),
                    thread_id: None,
                    turn_id: Some("turn-1".to_string()),
                }),
            ),
        );

        assert_eq!(message.concat_text(), "");
        assert!(!message.has_images());
        assert!(matches!(
            message.content.as_slice(),
            [RuntimeReplyMessageContent::ActionRequiredResponse {
                request_id,
                user_data,
                scope: Some(ActionRequiredScope {
                    session_id: Some(session_id),
                    thread_id: None,
                    turn_id: Some(turn_id),
                }),
            }] if request_id == "request-1"
                && user_data == &json!({"answer": "ok"})
                && session_id == "session-1"
                && turn_id == "turn-1"
        ));
    }
}
