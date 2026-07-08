//! Reply stream 的 current envelope contract。
//!
//! 该类型只描述 runtime reply stream 如何携带 current event 或边界诊断，
//! 不绑定 Aster `AgentEvent`，也不反向依赖 lime-agent 的协议实现。

use futures::stream::{BoxStream, StreamExt};
use model_provider::provider_stream::RuntimeReplyProviderStreamEvent;
use std::collections::VecDeque;
use std::time::Duration;

pub const MIN_PROVIDER_STREAM_FIRST_EVENT_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Clone, Debug, PartialEq)]
pub enum RuntimeReplyStreamEvent<E> {
    Event(E),
    ProviderStreamEvent(RuntimeReplyProviderStreamEvent),
    SuppressedInlineProviderError(String),
}

impl<E> RuntimeReplyStreamEvent<E> {
    pub fn event(event: E) -> Self {
        Self::Event(event)
    }

    pub fn provider_stream_event(event: RuntimeReplyProviderStreamEvent) -> Self {
        Self::ProviderStreamEvent(event)
    }

    pub fn suppressed_inline_provider_error(message: impl Into<String>) -> Self {
        Self::SuppressedInlineProviderError(message.into())
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RuntimeReplyInlineProviderError {
    pub message: String,
}

impl RuntimeReplyInlineProviderError {
    const ERROR_PREFIX: &'static str = "Ran into this error:";
    const RETRY_SUFFIX: &'static str =
        "Please retry if you think this is a transient or recoverable error.";
    const RETRY_SEPARATOR: &'static str =
        "\n\nPlease retry if you think this is a transient or recoverable error.";

    pub fn from_text(text: &str) -> Option<Self> {
        let text = text.trim();
        if text.is_empty() {
            return None;
        }
        if !text.contains(Self::ERROR_PREFIX) || !text.contains(Self::RETRY_SUFFIX) {
            return None;
        }

        let after_prefix = text.split_once(Self::ERROR_PREFIX)?.1;
        let detail = after_prefix
            .split_once(Self::RETRY_SEPARATOR)
            .map(|(left, _)| left.trim())
            .unwrap_or_else(|| after_prefix.trim())
            .trim_end_matches('.');

        if detail.is_empty() {
            return Some(Self {
                message: "Agent provider execution failed".to_string(),
            });
        }

        Some(Self {
            message: format!("Agent provider execution failed: {detail}"),
        })
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct RuntimeReplyStreamProjection<E> {
    provider_stream_event: Option<RuntimeReplyProviderStreamEvent>,
    inline_provider_error: Option<RuntimeReplyInlineProviderError>,
    events: Vec<E>,
}

impl<E> RuntimeReplyStreamProjection<E> {
    pub fn from_parts(
        provider_stream_event: Option<RuntimeReplyProviderStreamEvent>,
        inline_provider_error: Option<RuntimeReplyInlineProviderError>,
        events: Vec<E>,
    ) -> Self {
        Self {
            provider_stream_event,
            inline_provider_error,
            events,
        }
    }

    pub fn events(events: Vec<E>) -> Self {
        Self::from_parts(None, None, events)
    }

    pub fn into_events(self) -> Vec<RuntimeReplyStreamEvent<E>> {
        if let Some(event) = self.provider_stream_event {
            return vec![RuntimeReplyStreamEvent::provider_stream_event(event)];
        }

        if let Some(error) = self.inline_provider_error {
            return vec![RuntimeReplyStreamEvent::suppressed_inline_provider_error(
                error.message,
            )];
        }

        self.events
            .into_iter()
            .map(RuntimeReplyStreamEvent::event)
            .collect()
    }
}

pub trait RuntimeReplyStreamProjector<SourceEvent, RuntimeEvent> {
    fn project_reply_stream_event(
        &mut self,
        event: SourceEvent,
    ) -> Vec<RuntimeReplyStreamEvent<RuntimeEvent>>;
}

struct RuntimeReplyStreamProjectionState<'a, SourceEvent, RuntimeEvent, Projector> {
    stream: BoxStream<'a, anyhow::Result<SourceEvent>>,
    projector: Projector,
    pending: VecDeque<RuntimeReplyStreamEvent<RuntimeEvent>>,
}

pub fn project_reply_stream<'a, SourceEvent, RuntimeEvent, Projector>(
    stream: BoxStream<'a, anyhow::Result<SourceEvent>>,
    projector: Projector,
) -> BoxStream<'a, anyhow::Result<RuntimeReplyStreamEvent<RuntimeEvent>>>
where
    SourceEvent: 'a,
    RuntimeEvent: Send + 'a,
    Projector: RuntimeReplyStreamProjector<SourceEvent, RuntimeEvent> + Send + 'a,
{
    let state = RuntimeReplyStreamProjectionState {
        stream,
        projector,
        pending: VecDeque::new(),
    };

    Box::pin(futures::stream::try_unfold(state, |mut state| async move {
        loop {
            if let Some(event) = state.pending.pop_front() {
                return Ok(Some((event, state)));
            }

            let Some(source_event) = state.stream.next().await else {
                return Ok(None);
            };
            state.pending = state
                .projector
                .project_reply_stream_event(source_event?)
                .into();
        }
    }))
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct RuntimeReplyStreamIdleTimeout {
    pub timeout: Duration,
}

impl RuntimeReplyStreamIdleTimeout {
    pub fn new(timeout: Duration) -> Self {
        Self { timeout }
    }

    pub fn message(&self) -> String {
        format!(
            "Agent provider execution failed: stream idle timeout after {}ms without provider event",
            self.timeout.as_millis()
        )
    }
}

#[derive(Debug, Default)]
pub struct RuntimeReplyStreamState {
    stream_event_seen: bool,
    inline_provider_error: Option<String>,
}

impl RuntimeReplyStreamState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn mark_stream_event_seen(&mut self) {
        self.stream_event_seen = true;
    }

    pub fn stream_event_seen(&self) -> bool {
        self.stream_event_seen
    }

    pub fn next_timeout(&self, stream_idle_timeout: Option<Duration>) -> Option<Duration> {
        stream_idle_timeout.map(|timeout| {
            if self.stream_event_seen {
                timeout
            } else {
                timeout.max(MIN_PROVIDER_STREAM_FIRST_EVENT_TIMEOUT)
            }
        })
    }

    pub fn capture_inline_provider_error(&mut self, message: impl Into<String>) {
        if self.inline_provider_error.is_none() {
            self.inline_provider_error = Some(message.into());
        }
    }

    pub fn take_inline_provider_error(&mut self) -> Option<String> {
        self.inline_provider_error.take()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reply_stream_event_wraps_current_event_without_backend_type() {
        let event = RuntimeReplyStreamEvent::event("text_delta");

        assert_eq!(event, RuntimeReplyStreamEvent::Event("text_delta"));
    }

    #[test]
    fn reply_stream_event_carries_provider_stream_event() {
        use model_provider::safety::{
            ProviderSafetyBufferingRetryModelSource, ProviderSafetyBufferingRuntimeEventPayload,
            SAFETY_BUFFERING_RUNTIME_EVENT_KIND,
        };

        let event = RuntimeReplyStreamEvent::<()>::provider_stream_event(
            RuntimeReplyProviderStreamEvent::SafetyBuffering(
                ProviderSafetyBufferingRuntimeEventPayload {
                    kind: SAFETY_BUFFERING_RUNTIME_EVENT_KIND,
                    provider: Some("openai".to_string()),
                    model: Some("gpt-5-codex".to_string()),
                    use_cases: vec!["policy".to_string()],
                    reasons: vec!["buffering".to_string()],
                    show_buffering_ui: true,
                    retry_model: Some("gpt-5-mini".to_string()),
                    fallback_header_model: None,
                    source: ProviderSafetyBufferingRetryModelSource::PayloadRetryModel,
                },
            ),
        );

        assert!(matches!(
            event,
            RuntimeReplyStreamEvent::ProviderStreamEvent(
                RuntimeReplyProviderStreamEvent::SafetyBuffering(_)
            )
        ));
    }

    #[test]
    fn reply_stream_event_carries_suppressed_provider_error() {
        let event =
            RuntimeReplyStreamEvent::<()>::suppressed_inline_provider_error("provider failed");

        assert_eq!(
            event,
            RuntimeReplyStreamEvent::SuppressedInlineProviderError("provider failed".to_string(),)
        );
    }

    #[test]
    fn inline_provider_error_projects_provider_failure_text() {
        let error = RuntimeReplyInlineProviderError::from_text(
            "Ran into this error: provider overloaded.\n\nPlease retry if you think this is a transient or recoverable error.",
        )
        .expect("inline provider error");

        assert_eq!(
            error.message,
            "Agent provider execution failed: provider overloaded"
        );
    }

    #[test]
    fn inline_provider_error_uses_generic_message_for_empty_detail() {
        let error = RuntimeReplyInlineProviderError::from_text(
            "Ran into this error:\n\nPlease retry if you think this is a transient or recoverable error.",
        )
        .expect("inline provider error");

        assert_eq!(error.message, "Agent provider execution failed");
    }

    #[test]
    fn inline_provider_error_ignores_regular_text() {
        assert!(RuntimeReplyInlineProviderError::from_text("normal assistant reply").is_none());
    }

    fn safety_buffering_event() -> RuntimeReplyProviderStreamEvent {
        use model_provider::safety::{
            ProviderSafetyBufferingRetryModelSource, ProviderSafetyBufferingRuntimeEventPayload,
            SAFETY_BUFFERING_RUNTIME_EVENT_KIND,
        };

        RuntimeReplyProviderStreamEvent::SafetyBuffering(
            ProviderSafetyBufferingRuntimeEventPayload {
                kind: SAFETY_BUFFERING_RUNTIME_EVENT_KIND,
                provider: Some("openai".to_string()),
                model: Some("gpt-5-codex".to_string()),
                use_cases: vec!["policy".to_string()],
                reasons: vec!["buffering".to_string()],
                show_buffering_ui: true,
                retry_model: Some("gpt-5-mini".to_string()),
                fallback_header_model: None,
                source: ProviderSafetyBufferingRetryModelSource::PayloadRetryModel,
            },
        )
    }

    #[test]
    fn reply_stream_projection_prefers_provider_event_over_inline_error_and_events() {
        let projection = RuntimeReplyStreamProjection::from_parts(
            Some(safety_buffering_event()),
            Some(RuntimeReplyInlineProviderError {
                message: "Agent provider execution failed: ignored".to_string(),
            }),
            vec!["runtime.event"],
        );

        assert!(matches!(
            projection.into_events().as_slice(),
            [RuntimeReplyStreamEvent::ProviderStreamEvent(_)]
        ));
    }

    #[test]
    fn reply_stream_projection_prefers_inline_error_over_regular_events() {
        let projection = RuntimeReplyStreamProjection::from_parts(
            None,
            Some(RuntimeReplyInlineProviderError {
                message: "Agent provider execution failed: provider failed".to_string(),
            }),
            vec!["runtime.event"],
        );

        assert_eq!(
            projection.into_events(),
            vec![RuntimeReplyStreamEvent::SuppressedInlineProviderError(
                "Agent provider execution failed: provider failed".to_string()
            )]
        );
    }

    #[test]
    fn reply_stream_projection_wraps_regular_events() {
        let projection = RuntimeReplyStreamProjection::events(vec!["runtime.event"]);

        assert_eq!(
            projection.into_events(),
            vec![RuntimeReplyStreamEvent::Event("runtime.event")]
        );
    }

    struct TextReplyStreamProjector;

    impl RuntimeReplyStreamProjector<&str, String> for TextReplyStreamProjector {
        fn project_reply_stream_event(
            &mut self,
            event: &str,
        ) -> Vec<RuntimeReplyStreamEvent<String>> {
            vec![RuntimeReplyStreamEvent::event(event.trim().to_string())]
        }
    }

    #[test]
    fn reply_stream_projector_contract_is_source_agnostic() {
        let mut projector = TextReplyStreamProjector;

        assert_eq!(
            projector.project_reply_stream_event("  turn.item  "),
            vec![RuntimeReplyStreamEvent::Event("turn.item".to_string())]
        );
    }

    #[test]
    fn project_reply_stream_maps_source_stream_without_backend_type() {
        use futures::{stream, StreamExt};

        let source_stream = stream::iter(vec![Ok("  first  "), Ok("second")]).boxed();

        let events = futures::executor::block_on(
            project_reply_stream(source_stream, TextReplyStreamProjector).collect::<Vec<_>>(),
        );

        let events = events
            .into_iter()
            .collect::<anyhow::Result<Vec<_>>>()
            .expect("projected stream");
        assert_eq!(
            events,
            vec![
                RuntimeReplyStreamEvent::Event("first".to_string()),
                RuntimeReplyStreamEvent::Event("second".to_string())
            ]
        );
    }

    #[test]
    fn project_reply_stream_preserves_source_error() {
        use futures::{stream, StreamExt};

        let source_stream =
            stream::iter(vec![Ok("first"), Err(anyhow::anyhow!("source failed"))]).boxed();

        let events = futures::executor::block_on(
            project_reply_stream(source_stream, TextReplyStreamProjector).collect::<Vec<_>>(),
        );

        assert!(matches!(
            events.as_slice(),
            [Ok(RuntimeReplyStreamEvent::Event(_)), Err(_)]
        ));
        assert_eq!(events[1].as_ref().unwrap_err().to_string(), "source failed");
    }

    #[test]
    fn reply_stream_idle_timeout_builds_current_error_message() {
        let timeout = RuntimeReplyStreamIdleTimeout::new(Duration::from_millis(250));

        assert_eq!(
            timeout.message(),
            "Agent provider execution failed: stream idle timeout after 250ms without provider event"
        );
    }

    #[test]
    fn reply_stream_state_extends_first_event_timeout_only_until_first_event() {
        let mut state = RuntimeReplyStreamState::new();
        let timeout = Duration::from_millis(200);

        assert_eq!(
            state.next_timeout(Some(timeout)),
            Some(MIN_PROVIDER_STREAM_FIRST_EVENT_TIMEOUT)
        );

        state.mark_stream_event_seen();

        assert!(state.stream_event_seen());
        assert_eq!(state.next_timeout(Some(timeout)), Some(timeout));
    }

    #[test]
    fn reply_stream_state_preserves_first_inline_provider_error() {
        let mut state = RuntimeReplyStreamState::new();

        state.capture_inline_provider_error("first provider error");
        state.capture_inline_provider_error("second provider error");

        assert_eq!(
            state.take_inline_provider_error(),
            Some("first provider error".to_string())
        );
        assert_eq!(state.take_inline_provider_error(), None);
    }
}
