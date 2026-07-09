//! Provider trace 的 current Turn lifecycle。
//!
//! 这里只记录 provider request attempt 的时间点和首事件状态，不绑定具体
//! provider 实现、Aster error 或 session context DTO。

use std::time::Instant;

use agent_protocol::provider_trace::{ProviderTraceEvent, ProviderTraceFailure};

#[derive(Debug, Clone)]
pub struct RuntimeProviderTraceAttempt {
    provider: String,
    model: String,
    attempt: u32,
    started_at: Instant,
    first_event_seen: bool,
    first_text_delta_seen: bool,
}

impl RuntimeProviderTraceAttempt {
    pub fn new(provider: impl Into<String>, model: impl Into<String>, attempt: u32) -> Self {
        Self {
            provider: provider.into(),
            model: model.into(),
            attempt,
            started_at: Instant::now(),
            first_event_seen: false,
            first_text_delta_seen: false,
        }
    }

    #[cfg(test)]
    fn new_started_at(
        provider: impl Into<String>,
        model: impl Into<String>,
        attempt: u32,
        started_at: Instant,
    ) -> Self {
        Self {
            provider: provider.into(),
            model: model.into(),
            attempt,
            started_at,
            first_event_seen: false,
            first_text_delta_seen: false,
        }
    }

    pub fn request_started(&self) -> ProviderTraceEvent {
        ProviderTraceEvent::request_started(self.provider.clone(), self.model.clone(), self.attempt)
    }

    pub fn first_event_received(&mut self) -> Option<ProviderTraceEvent> {
        if self.first_event_seen {
            return None;
        }
        self.first_event_seen = true;
        Some(ProviderTraceEvent::first_event_received(
            self.provider.clone(),
            self.model.clone(),
            self.attempt,
            self.elapsed_ms(),
        ))
    }

    pub fn first_text_delta_received(&mut self, text_chars: usize) -> Option<ProviderTraceEvent> {
        if self.first_text_delta_seen {
            return None;
        }
        self.first_text_delta_seen = true;
        Some(ProviderTraceEvent::first_text_delta_received(
            self.provider.clone(),
            self.model.clone(),
            self.attempt,
            self.elapsed_ms(),
            text_chars,
        ))
    }

    pub fn failed(&self, failure: ProviderTraceFailure) -> ProviderTraceEvent {
        ProviderTraceEvent::failed(
            self.provider.clone(),
            self.model.clone(),
            self.attempt,
            self.elapsed_ms(),
            failure,
        )
    }

    pub fn canceled(&self, reason: impl Into<String>) -> ProviderTraceEvent {
        ProviderTraceEvent::canceled(
            self.provider.clone(),
            self.model.clone(),
            self.attempt,
            self.elapsed_ms(),
            reason,
        )
    }

    fn elapsed_ms(&self) -> u64 {
        u64::try_from(self.started_at.elapsed().as_millis()).unwrap_or(u64::MAX)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_protocol::provider_trace::ProviderTraceStage;
    use std::time::Duration;

    #[test]
    fn emits_first_event_and_first_text_once() {
        let mut attempt = RuntimeProviderTraceAttempt::new_started_at(
            "openai",
            "gpt-4.1",
            2,
            Instant::now() - Duration::from_millis(5),
        );

        let first_event = attempt.first_event_received().expect("first event");
        let first_text = attempt
            .first_text_delta_received(4)
            .expect("first text delta");

        assert_eq!(first_event.stage, ProviderTraceStage::FirstEventReceived);
        assert_eq!(first_text.stage, ProviderTraceStage::FirstTextDeltaReceived);
        assert_eq!(first_text.text_chars, Some(4));
        assert!(attempt.first_event_received().is_none());
        assert!(attempt.first_text_delta_received(5).is_none());
    }

    #[test]
    fn failed_event_uses_current_failure_projection() {
        let attempt = RuntimeProviderTraceAttempt::new("openai", "gpt-4.1", 1);
        let event = attempt.failed(ProviderTraceFailure::new("rate_limit", true, false));

        assert_eq!(event.stage, ProviderTraceStage::Failed);
        assert_eq!(event.status, "failed");
        assert_eq!(event.failure_category.as_deref(), Some("rate_limit"));
        assert_eq!(event.retryable, Some(true));
        assert_eq!(event.non_retryable_provider_rejection, Some(false));
    }
}
