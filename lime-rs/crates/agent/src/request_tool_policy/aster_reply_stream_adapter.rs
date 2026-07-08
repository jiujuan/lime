use super::aster_event_adapter::AsterEventProjector;
use crate::protocol::AgentEvent as RuntimeAgentEvent;
use agent_runtime::event_stream::EventProjector;
use agent_runtime::reply_stream::{
    RuntimeReplyInlineProviderError, RuntimeReplyStreamEvent, RuntimeReplyStreamProjection,
    RuntimeReplyStreamProjector,
};
use aster::agents::AgentEvent as AsterAgentEvent;
use aster::conversation::message::Message;
use aster::providers::formats::openai_responses::provider_stream_event_notification_payload_from_message;
use futures::stream::{BoxStream, StreamExt};
use model_provider::provider_stream::{RuntimeReplyProviderStreamEvent, RuntimeReplyStreamRequest};

pub(super) fn project_aster_reply_stream<'a>(
    stream: BoxStream<'a, anyhow::Result<AsterAgentEvent>>,
    stream_request: RuntimeReplyStreamRequest,
) -> BoxStream<'a, anyhow::Result<RuntimeReplyStreamEvent<RuntimeAgentEvent>>> {
    Box::pin(async_stream::try_stream! {
        let mut stream = stream;
        let mut projector = AsterReplyStreamProjector::new(stream_request);
        while let Some(event_result) = stream.next().await {
            let agent_event = event_result?;
            for runtime_event in projector.project_reply_stream_event(agent_event) {
                yield runtime_event;
            }
        }
    })
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
        let (provider_event, provider_error) = match &agent_event {
            AsterAgentEvent::Message(message) => (
                provider_stream_event_from_aster_message(&self.stream_request, message),
                inline_provider_error_from_aster_message(message),
            ),
            _ => (None, None),
        };
        if provider_event.is_some() || provider_error.is_some() {
            return RuntimeReplyStreamProjection::from_parts(
                provider_event,
                provider_error,
                Vec::new(),
            )
            .into_events();
        }

        RuntimeReplyStreamProjection::events(self.runtime_event_projector.project(agent_event))
            .into_events()
    }
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
