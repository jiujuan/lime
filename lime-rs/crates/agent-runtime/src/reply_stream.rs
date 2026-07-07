//! Reply stream 的 current envelope contract。
//!
//! 该类型只描述 runtime reply stream 如何携带 current event 或边界诊断，
//! 不绑定 Aster `AgentEvent`，也不反向依赖 lime-agent 的协议实现。

use model_provider::provider_stream::RuntimeReplyProviderStreamEvent;

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
}
