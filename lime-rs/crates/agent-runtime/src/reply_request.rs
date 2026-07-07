//! Reply request 的 current contract。
//!
//! 这里把 Turn 输入 materialize 成 provider/reply backend 可消费的请求骨架。
//! 具体 backend 的 wire DTO 继续留在 adapter 边界转换。

use crate::reply_input::RuntimeReplyAttemptInput;
use crate::reply_message::RuntimeReplyMessage;
use model_provider::provider_stream::{
    RuntimeReplyModelRequestPolicy, RuntimeReplyProviderHandle, RuntimeReplyStreamRequest,
};

#[derive(Clone, Debug, PartialEq)]
pub struct RuntimeReplyRequest {
    pub message: RuntimeReplyMessage,
    pub stream_request: RuntimeReplyStreamRequest,
}

impl RuntimeReplyRequest {
    pub fn from_attempt_input(
        session_id: impl Into<String>,
        input: RuntimeReplyAttemptInput,
        provider: Option<RuntimeReplyProviderHandle>,
        model_request_policy: Option<RuntimeReplyModelRequestPolicy>,
    ) -> Self {
        let input_kind = input.runtime_input_kind();
        let message = RuntimeReplyMessage::from_attempt_input(input);
        let message_chars = message.concat_text().chars().count();
        let stream_request =
            RuntimeReplyStreamRequest::new(session_id, input_kind, message_chars, provider)
                .with_model_request_policy(model_request_policy);

        Self {
            message,
            stream_request,
        }
    }

    pub fn into_parts(self) -> (RuntimeReplyMessage, RuntimeReplyStreamRequest) {
        (self.message, self.stream_request)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::reply_input::{RuntimeActionRequiredResponseInput, RuntimeReplyInput};
    use model_provider::provider_stream::RuntimeReplyInputKind;
    use serde_json::json;

    #[test]
    fn reply_request_builds_user_stream_request_from_current_input() {
        let request = RuntimeReplyRequest::from_attempt_input(
            "session-1",
            RuntimeReplyInput::text("hello").into(),
            None,
            None,
        );

        assert_eq!(request.stream_request.session_id, "session-1");
        assert_eq!(
            request.stream_request.input_kind,
            RuntimeReplyInputKind::UserMessage
        );
        assert_eq!(request.stream_request.message_chars, 5);
        assert_eq!(request.message.concat_text(), "hello");
        assert!(request.stream_request.model_request_policy.is_none());
    }

    #[test]
    fn reply_request_builds_action_response_without_text_chars() {
        let request = RuntimeReplyRequest::from_attempt_input(
            "session-2",
            RuntimeReplyAttemptInput::ActionRequiredResponse(
                RuntimeActionRequiredResponseInput::new("request-1", json!({"answer": "ok"}), None),
            ),
            None,
            None,
        );

        assert_eq!(
            request.stream_request.input_kind,
            RuntimeReplyInputKind::ActionRequiredResponse
        );
        assert_eq!(request.stream_request.message_chars, 0);
        assert_eq!(request.message.concat_text(), "");
    }
}
