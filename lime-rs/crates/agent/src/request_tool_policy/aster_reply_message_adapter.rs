use super::CANCELLED_TURN_CONTEXT_MARKER;
use agent_protocol::action_required::ActionRequiredScope as RuntimeActionRequiredScope;
use agent_runtime::reply_message::{
    RuntimeReplyMessage, RuntimeReplyMessageContent, RuntimeReplyMessageRole,
};
use aster::{ActionRequired, ActionRequiredData, ActionRequiredScope, Message, MessageContent};

pub(crate) fn lower_aster_reply_message(message: RuntimeReplyMessage) -> Message {
    let mut aster_message = match message.role {
        RuntimeReplyMessageRole::User => Message::user(),
    };

    for content in message.content {
        aster_message = match content {
            RuntimeReplyMessageContent::Text(text) => aster_message.with_text(text),
            RuntimeReplyMessageContent::Image { data, media_type } => {
                aster_message.with_image(data, media_type)
            }
            RuntimeReplyMessageContent::ActionRequiredResponse {
                request_id,
                user_data,
                scope,
            } => aster_message.with_content(build_aster_action_required_response_content(
                request_id, user_data, scope,
            )),
        };
    }

    if message.agent_only {
        aster_message = aster_message.agent_only();
    }
    aster_message
}

pub(super) fn cancelled_turn_context_marker_message() -> Message {
    Message::assistant()
        .with_text(CANCELLED_TURN_CONTEXT_MARKER)
        .agent_only()
}

fn build_aster_action_required_response_content(
    request_id: String,
    user_data: serde_json::Value,
    scope: Option<RuntimeActionRequiredScope>,
) -> MessageContent {
    MessageContent::ActionRequired(ActionRequired {
        data: ActionRequiredData::ElicitationResponse {
            id: request_id,
            user_data,
        },
        scope: scope.and_then(to_aster_action_required_scope),
    })
}

fn to_aster_action_required_scope(
    scope: RuntimeActionRequiredScope,
) -> Option<ActionRequiredScope> {
    if scope.session_id.is_none() && scope.thread_id.is_none() && scope.turn_id.is_none() {
        return None;
    }

    Some(ActionRequiredScope {
        session_id: scope.session_id,
        thread_id: scope.thread_id,
        turn_id: scope.turn_id,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_runtime::reply_input::{
        RuntimeActionRequiredResponseInput, RuntimeReplyInput, RuntimeReplyInputImage,
    };
    use aster::{ActionRequiredData, MessageContent};
    use serde_json::json;

    #[test]
    fn lowers_current_text_image_and_agent_only_message_to_aster_message() {
        let message = RuntimeReplyMessage::from_input(RuntimeReplyInput {
            text: "look".to_string(),
            images: vec![RuntimeReplyInputImage {
                data: "data:image/png;base64,abc".to_string(),
                media_type: "image/png".to_string(),
            }],
            agent_only: true,
        });

        let message = lower_aster_reply_message(message);

        assert_eq!(message.as_concat_text(), "look");
        assert!(message
            .content
            .iter()
            .any(|content| matches!(content, MessageContent::Image(_))));
        assert!(!message.is_user_visible());
        assert!(message.is_agent_visible());
    }

    #[test]
    fn lowers_current_action_required_response_scope_to_aster_message() {
        let message = RuntimeReplyMessage::from_action_required_response(
            RuntimeActionRequiredResponseInput::new(
                "request-1",
                json!({"answer": "ok"}),
                Some(RuntimeActionRequiredScope {
                    session_id: Some("session-1".to_string()),
                    thread_id: None,
                    turn_id: Some("turn-1".to_string()),
                }),
            ),
        );

        let message = lower_aster_reply_message(message);

        assert!(matches!(
            message.content.as_slice(),
            [MessageContent::ActionRequired(action_required)]
                if matches!(
                    &action_required.data,
                    ActionRequiredData::ElicitationResponse { id, user_data }
                        if id == "request-1" && user_data == &json!({"answer": "ok"})
                )
                && action_required.scope.as_ref().is_some_and(|scope| {
                    scope.session_id.as_deref() == Some("session-1")
                        && scope.thread_id.is_none()
                        && scope.turn_id.as_deref() == Some("turn-1")
                })
        ));
    }

    #[test]
    fn builds_agent_only_cancelled_turn_context_marker() {
        let message = cancelled_turn_context_marker_message();

        assert_eq!(message.as_concat_text(), CANCELLED_TURN_CONTEXT_MARKER);
        assert!(!message.is_user_visible());
        assert!(message.is_agent_visible());
    }
}
