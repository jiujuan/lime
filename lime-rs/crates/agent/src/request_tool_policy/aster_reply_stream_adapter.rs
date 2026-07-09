use super::aster_event_adapter::AsterEventProjector;
use super::response_event_adapter::response_stream_events_from_runtime_events;
use crate::protocol::AgentEvent as RuntimeAgentEvent;
use agent_runtime::event_stream::EventProjector;
use agent_runtime::reply_stream::{
    project_reply_stream, RuntimeReplyInlineProviderError, RuntimeReplyResponseEvent,
    RuntimeReplyResponseEventHints, RuntimeReplyStreamEvent, RuntimeReplyStreamProjection,
    RuntimeReplyStreamProjector,
};
use aster::agents::AgentEvent as AsterAgentEvent;
use aster::conversation::message::Message;
use aster::providers::formats::openai_responses::provider_stream_event_notification_payload_from_message;
use futures::stream::BoxStream;
use model_provider::provider_stream::{RuntimeReplyProviderStreamEvent, RuntimeReplyStreamRequest};

pub(super) fn project_aster_reply_stream<'a>(
    stream: BoxStream<'a, anyhow::Result<AsterAgentEvent>>,
    stream_request: RuntimeReplyStreamRequest,
) -> BoxStream<'a, anyhow::Result<RuntimeReplyStreamEvent<RuntimeAgentEvent>>> {
    project_reply_stream(stream, AsterReplyStreamProjector::new(stream_request))
}

struct AsterReplyStreamProjector {
    stream_request: RuntimeReplyStreamRequest,
    runtime_event_projector: AsterEventProjector,
}

impl AsterReplyStreamProjector {
    fn new(stream_request: RuntimeReplyStreamRequest) -> Self {
        Self {
            stream_request,
            runtime_event_projector: AsterEventProjector::new(),
        }
    }
}

impl RuntimeReplyStreamProjector<AsterAgentEvent, RuntimeAgentEvent> for AsterReplyStreamProjector {
    fn project_reply_stream_event(
        &mut self,
        agent_event: AsterAgentEvent,
    ) -> Vec<RuntimeReplyStreamEvent<RuntimeAgentEvent>> {
        if let AsterAgentEvent::Message(message) = agent_event {
            let provider_event =
                provider_stream_event_from_aster_message(&self.stream_request, &message);
            let provider_error = inline_provider_error_from_aster_message(&message);
            if provider_event.is_some() || provider_error.is_some() {
                return RuntimeReplyStreamProjection::from_parts(
                    provider_event,
                    provider_error,
                    Vec::new(),
                )
                .into_events();
            }

            let runtime_events = self
                .runtime_event_projector
                .project(AsterAgentEvent::Message(message.clone()));
            return response_stream_events_from_runtime_events(
                response_event_hints_from_aster_message(Some(&message)),
                runtime_events,
            );
        }

        response_stream_events_from_runtime_events(
            response_event_hints_from_aster_message(None),
            self.runtime_event_projector.project(agent_event),
        )
    }
}

fn response_event_hints_from_aster_message(
    message: Option<&Message>,
) -> RuntimeReplyResponseEventHints {
    message
        .map(|message| {
            RuntimeReplyResponseEventHints::new()
                .with_item_id(response_item_id_from_aster_message(message, "reasoning"))
        })
        .unwrap_or_default()
}

fn response_item_id_from_aster_message(message: &Message, prefix: &str) -> String {
    message
        .id
        .as_ref()
        .filter(|id| !id.trim().is_empty())
        .map(|id| format!("{prefix}:{id}"))
        .unwrap_or_else(|| format!("{prefix}:aster-message:{}", message.created))
}

pub(super) fn provider_stream_event_from_aster_message(
    stream_request: &RuntimeReplyStreamRequest,
    message: &Message,
) -> Option<RuntimeReplyProviderStreamEvent> {
    let payload = provider_stream_event_notification_payload_from_message(message)?;
    RuntimeReplyProviderStreamEvent::from_notification_payload(stream_request, &payload)
}

fn inline_provider_error_from_aster_message(
    message: &Message,
) -> Option<RuntimeReplyInlineProviderError> {
    RuntimeReplyInlineProviderError::from_text(&message.as_concat_text())
}

#[cfg(test)]
mod tests {
    use super::*;
    use aster::conversation::message::Message;
    use model_provider::provider_stream::{RuntimeReplyInputKind, RuntimeReplyStreamRequest};

    fn stream_request() -> RuntimeReplyStreamRequest {
        RuntimeReplyStreamRequest::new("session-1", RuntimeReplyInputKind::UserMessage, 0, None)
    }

    #[test]
    fn aster_text_message_delta_projects_as_response_event() {
        let mut projector = AsterReplyStreamProjector::new(stream_request());
        let events = projector.project_reply_stream_event(AsterAgentEvent::Message(
            Message::assistant()
                .with_id("resp-1")
                .with_text("hello from aster"),
        ));

        assert!(events.iter().any(|event| {
            matches!(
                event,
                RuntimeReplyStreamEvent::Event(RuntimeAgentEvent::Message { message })
                    if message.id.as_deref() == Some("resp-1")
            )
        }));
        assert!(events.iter().any(|event| {
            matches!(
                event,
                RuntimeReplyStreamEvent::ResponseEvent(RuntimeReplyResponseEvent::TextDelta { text })
                    if text == "hello from aster"
            )
        }));
        assert!(!events.iter().any(|event| {
            matches!(
                event,
                RuntimeReplyStreamEvent::Event(RuntimeAgentEvent::TextDelta { .. })
            )
        }));
    }

    #[test]
    fn aster_thinking_message_delta_projects_as_response_event() {
        let mut projector = AsterReplyStreamProjector::new(stream_request());
        let events = projector.project_reply_stream_event(AsterAgentEvent::Message(
            Message::assistant()
                .with_id("resp-1")
                .with_thinking("先分析", "sig"),
        ));

        assert!(events.iter().any(|event| {
            matches!(
                event,
                RuntimeReplyStreamEvent::ResponseEvent(
                    RuntimeReplyResponseEvent::ReasoningDelta { item_id, delta }
                ) if item_id == "reasoning:resp-1" && delta == "先分析"
            )
        }));
        assert!(!events.iter().any(|event| {
            matches!(
                event,
                RuntimeReplyStreamEvent::Event(RuntimeAgentEvent::ThinkingDelta { .. })
            )
        }));
    }

    #[test]
    fn aster_tool_input_delta_projects_as_response_event() {
        let mut projector = AsterReplyStreamProjector::new(stream_request());
        let events = projector.project_reply_stream_event(AsterAgentEvent::Message(
            Message::assistant().with_tool_input_delta(
                "call-1",
                Some("apply_patch"),
                "{\"patch\"",
                Some("{\"patch\""),
                Some("openai"),
            ),
        ));

        assert!(events.iter().any(|event| {
            matches!(
                event,
                RuntimeReplyStreamEvent::ResponseEvent(
                    RuntimeReplyResponseEvent::ToolCallInputDelta {
                        call_id,
                        tool_name,
                        delta,
                        accumulated_arguments,
                        provider
                    }
                ) if call_id == "call-1"
                    && tool_name.as_deref() == Some("apply_patch")
                    && delta == "{\"patch\""
                    && accumulated_arguments.as_deref() == Some("{\"patch\"")
                    && provider.as_deref() == Some("openai")
            )
        }));
        assert!(!events.iter().any(|event| {
            matches!(
                event,
                RuntimeReplyStreamEvent::Event(RuntimeAgentEvent::ToolInputDelta { .. })
            )
        }));
    }

    #[test]
    fn aster_agent_tool_input_delta_projects_as_response_event() {
        let mut projector = AsterReplyStreamProjector::new(stream_request());
        let events = projector.project_reply_stream_event(AsterAgentEvent::ToolInputDelta {
            tool_id: "call-2".to_string(),
            tool_name: Some("web_search".to_string()),
            delta: "{\"query\"".to_string(),
            accumulated_arguments: Some("{\"query\"".to_string()),
            provider: Some("openai".to_string()),
        });

        assert!(events.iter().any(|event| {
            matches!(
                event,
                RuntimeReplyStreamEvent::ResponseEvent(
                    RuntimeReplyResponseEvent::ToolCallInputDelta {
                        call_id,
                        tool_name,
                        delta,
                        accumulated_arguments,
                        provider
                    }
                ) if call_id == "call-2"
                    && tool_name.as_deref() == Some("web_search")
                    && delta == "{\"query\""
                    && accumulated_arguments.as_deref() == Some("{\"query\"")
                    && provider.as_deref() == Some("openai")
            )
        }));
        assert!(!events.iter().any(|event| {
            matches!(
                event,
                RuntimeReplyStreamEvent::Event(RuntimeAgentEvent::ToolInputDelta { .. })
            )
        }));
    }
}
