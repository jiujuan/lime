//! Reply input 的 current contract。
//!
//! 这里定义 Lime runtime 主链可传递的 reply input / action response input。
//! 具体后端需要的消息格式由对应 adapter 在边界转换。

use agent_protocol::action_required::ActionRequiredScope;
use model_provider::provider_stream::RuntimeReplyInputKind;
use serde_json::Value;

#[derive(Clone, Debug)]
pub struct RuntimeReplyInputImage {
    pub data: String,
    pub media_type: String,
}

#[derive(Clone, Debug)]
pub struct RuntimeReplyInput {
    pub text: String,
    pub images: Vec<RuntimeReplyInputImage>,
    pub agent_only: bool,
}

impl RuntimeReplyInput {
    pub fn text(text: impl Into<String>) -> Self {
        Self {
            text: text.into(),
            images: Vec::new(),
            agent_only: false,
        }
    }

    pub fn agent_only_text(text: impl Into<String>) -> Self {
        Self {
            text: text.into(),
            images: Vec::new(),
            agent_only: true,
        }
    }
}

#[derive(Clone, Debug)]
pub struct RuntimeActionRequiredResponseInput {
    pub request_id: String,
    pub user_data: Value,
    pub scope: Option<ActionRequiredScope>,
}

impl RuntimeActionRequiredResponseInput {
    pub fn new(
        request_id: impl Into<String>,
        user_data: Value,
        scope: Option<ActionRequiredScope>,
    ) -> Self {
        Self {
            request_id: request_id.into(),
            user_data,
            scope,
        }
    }
}

#[derive(Clone, Debug)]
pub enum RuntimeReplyAttemptInput {
    Current(RuntimeReplyInput),
    ActionRequiredResponse(RuntimeActionRequiredResponseInput),
}

impl RuntimeReplyAttemptInput {
    pub fn as_concat_text(&self) -> String {
        match self {
            Self::Current(input) => input.text.clone(),
            Self::ActionRequiredResponse(_) => String::new(),
        }
    }

    pub fn runtime_input_kind(&self) -> RuntimeReplyInputKind {
        match self {
            Self::Current(_) => RuntimeReplyInputKind::UserMessage,
            Self::ActionRequiredResponse(_) => RuntimeReplyInputKind::ActionRequiredResponse,
        }
    }
}

impl From<RuntimeReplyInput> for RuntimeReplyAttemptInput {
    fn from(input: RuntimeReplyInput) -> Self {
        Self::Current(input)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn reply_input_builds_user_and_agent_only_messages() {
        let user = RuntimeReplyInput::text("hello");
        let agent_only = RuntimeReplyInput::agent_only_text("continue");

        assert_eq!(user.text, "hello");
        assert!(!user.agent_only);
        assert_eq!(agent_only.text, "continue");
        assert!(agent_only.agent_only);
    }

    #[test]
    fn reply_attempt_input_reports_kind_without_backend_message() {
        let user = RuntimeReplyAttemptInput::from(RuntimeReplyInput::text("hello"));
        let action = RuntimeReplyAttemptInput::ActionRequiredResponse(
            RuntimeActionRequiredResponseInput::new("request-1", json!({"answer": "ok"}), None),
        );

        assert_eq!(user.as_concat_text(), "hello");
        assert_eq!(
            user.runtime_input_kind(),
            RuntimeReplyInputKind::UserMessage
        );
        assert_eq!(
            action.runtime_input_kind(),
            RuntimeReplyInputKind::ActionRequiredResponse
        );
    }
}
