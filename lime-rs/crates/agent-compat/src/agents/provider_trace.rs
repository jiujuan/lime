use std::time::Instant;

use model_provider::provider_stream::{provider_stream_trace_failure, RuntimeReplyProviderFailure};

pub use model_provider::provider_stream::RuntimeReplyProviderTraceEvent as ProviderTraceEvent;

pub(crate) fn provider_trace_request_started(
    provider: &str,
    model: &str,
    attempt: u32,
) -> ProviderTraceEvent {
    ProviderTraceEvent::request_started(provider.to_string(), model.to_string(), attempt)
}

pub(crate) fn provider_trace_first_event_received(
    provider: &str,
    model: &str,
    attempt: u32,
    started_at: &Instant,
) -> ProviderTraceEvent {
    ProviderTraceEvent::first_event_received(
        provider.to_string(),
        model.to_string(),
        attempt,
        elapsed_ms_since(started_at),
    )
}

pub(crate) fn provider_trace_first_text_delta_received(
    provider: &str,
    model: &str,
    attempt: u32,
    started_at: &Instant,
    text_chars: usize,
) -> ProviderTraceEvent {
    ProviderTraceEvent::first_text_delta_received(
        provider.to_string(),
        model.to_string(),
        attempt,
        elapsed_ms_since(started_at),
        text_chars,
    )
}

pub(crate) fn provider_trace_failed(
    provider: &str,
    model: &str,
    attempt: u32,
    started_at: &Instant,
    failure: RuntimeReplyProviderFailure,
) -> ProviderTraceEvent {
    ProviderTraceEvent::failed(
        provider.to_string(),
        model.to_string(),
        attempt,
        elapsed_ms_since(started_at),
        provider_stream_trace_failure(failure),
    )
}

pub(crate) fn provider_trace_canceled(
    provider: &str,
    model: &str,
    attempt: u32,
    started_at: &Instant,
    reason: &str,
) -> ProviderTraceEvent {
    ProviderTraceEvent::canceled(
        provider.to_string(),
        model.to_string(),
        attempt,
        elapsed_ms_since(started_at),
        reason.to_string(),
    )
}

fn elapsed_ms_since(started_at: &Instant) -> u64 {
    u64::try_from(started_at.elapsed().as_millis()).unwrap_or(u64::MAX)
}
