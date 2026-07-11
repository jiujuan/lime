use super::aster_event_adapter::AsterEventProjector;
use super::response_event_adapter::response_stream_events_from_runtime_events;
use super::runtime_item_event;
use super::runtime_turn_event;
use crate::protocol::AgentEvent as RuntimeAgentEvent;
use crate::runtime_store_aster_adapter::AsterThreadRuntimeStore;
use agent_runtime::event_stream::EventProjector;
use agent_runtime::reply_stream::{
    project_reply_stream, RuntimeReplyInlineProviderError, RuntimeReplyResponseEventHints,
    RuntimeReplyStreamEvent, RuntimeReplyStreamProjection, RuntimeReplyStreamProjector,
};
use aster::Message;
use aster::{
    provider_stream_event_notification_payload_from_message, AgentEvent as AsterAgentEvent,
};
use futures::{stream::BoxStream, StreamExt};
use model_provider::provider_stream::{RuntimeReplyProviderStreamEvent, RuntimeReplyStreamRequest};
use std::path::PathBuf;
use std::sync::Arc;
use thread_store::runtime_snapshot::RuntimeTurnStatusRecord;
use tokio_util::sync::CancellationToken;

pub(super) fn project_aster_reply_stream<'a>(
    stream: BoxStream<'a, anyhow::Result<AsterAgentEvent>>,
    stream_request: RuntimeReplyStreamRequest,
    runtime_store: Arc<AsterThreadRuntimeStore>,
    working_directory: Option<PathBuf>,
    cancel_token: Option<CancellationToken>,
    initial_turn_id: Option<String>,
) -> BoxStream<'a, anyhow::Result<RuntimeReplyStreamEvent<RuntimeAgentEvent>>> {
    let stream = persist_aster_runtime_events(
        stream,
        runtime_store,
        working_directory,
        cancel_token,
        initial_turn_id,
    );
    project_reply_stream(stream, AsterReplyStreamProjector::new(stream_request))
}

fn persist_aster_runtime_events<'a>(
    stream: BoxStream<'a, anyhow::Result<AsterAgentEvent>>,
    runtime_store: Arc<AsterThreadRuntimeStore>,
    working_directory: Option<PathBuf>,
    cancel_token: Option<CancellationToken>,
    initial_turn_id: Option<String>,
) -> BoxStream<'a, anyhow::Result<AsterAgentEvent>> {
    Box::pin(async_stream::try_stream! {
        let mut stream = stream;
        let mut active_turn_id = initial_turn_id;

        while let Some(event_result) = stream.next().await {
            let event = match event_result {
                Ok(event) => event,
                Err(error) => {
                    complete_active_turn(
                        runtime_store.clone(),
                        active_turn_id.as_deref(),
                        cancel_token.as_ref(),
                        Some(error.to_string()),
                    )
                    .await;
                    Err(error)?;
                    unreachable!();
                }
            };

            match runtime_turn_event::persist_aster_turn_started_event(
                runtime_store.clone(),
                &event,
                working_directory.as_deref(),
            )
            .await
            {
                Ok(Some(turn_id)) => active_turn_id = Some(turn_id),
                Ok(None) => {}
                Err(error) => {
                    tracing::warn!(
                        error = %error,
                        "failed to persist Aster runtime turn event through current store boundary"
                    );
                }
            }
            if let Err(error) =
                runtime_item_event::persist_aster_item_event(runtime_store.clone(), &event).await
            {
                tracing::warn!(
                    error = %error,
                    "failed to persist Aster runtime item event through current store boundary"
                );
            }
            yield event;
        }

        complete_active_turn(
            runtime_store,
            active_turn_id.as_deref(),
            cancel_token.as_ref(),
            None,
        )
        .await;
    })
}

async fn complete_active_turn(
    runtime_store: Arc<AsterThreadRuntimeStore>,
    turn_id: Option<&str>,
    cancel_token: Option<&CancellationToken>,
    error_message: Option<String>,
) {
    let Some(turn_id) = turn_id else {
        return;
    };
    let status = if cancel_token.is_some_and(CancellationToken::is_cancelled) {
        RuntimeTurnStatusRecord::Aborted
    } else if error_message.is_some() {
        RuntimeTurnStatusRecord::Failed
    } else {
        RuntimeTurnStatusRecord::Completed
    };
    if let Err(error) =
        runtime_turn_event::complete_aster_turn(runtime_store, turn_id, status, error_message).await
    {
        tracing::warn!(
            turn_id = %turn_id,
            error = %error,
            "failed to complete Aster runtime turn through current store boundary"
        );
    }
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
    use agent_runtime::reply_stream::RuntimeReplyResponseEvent;
    use aster::Message;
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
