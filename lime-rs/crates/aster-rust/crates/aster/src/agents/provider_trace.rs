use std::time::Instant;

use crate::providers::errors::ProviderError;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProviderTraceStage {
    RequestStarted,
    FirstEventReceived,
    FirstTextDeltaReceived,
    Failed,
    Canceled,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ProviderTraceEvent {
    pub stage: ProviderTraceStage,
    pub provider: String,
    pub model: String,
    pub attempt: u32,
    pub elapsed_ms: Option<u64>,
    pub text_chars: Option<usize>,
    pub status: &'static str,
    pub failure_category: Option<String>,
    pub retryable: Option<bool>,
    pub non_retryable_provider_rejection: Option<bool>,
    pub cancel_reason: Option<String>,
    pub provider_request_id: Option<String>,
    pub provider_request_id_header: Option<String>,
}

impl ProviderTraceEvent {
    pub(crate) fn request_started(provider: &str, model: &str, attempt: u32) -> Self {
        Self {
            stage: ProviderTraceStage::RequestStarted,
            provider: provider.to_string(),
            model: model.to_string(),
            attempt,
            elapsed_ms: Some(0),
            text_chars: None,
            status: "running",
            failure_category: None,
            retryable: None,
            non_retryable_provider_rejection: None,
            cancel_reason: None,
            provider_request_id: None,
            provider_request_id_header: None,
        }
    }

    pub(crate) fn first_event_received(
        provider: &str,
        model: &str,
        attempt: u32,
        started_at: &Instant,
    ) -> Self {
        Self {
            stage: ProviderTraceStage::FirstEventReceived,
            provider: provider.to_string(),
            model: model.to_string(),
            attempt,
            elapsed_ms: Some(elapsed_ms_since(started_at)),
            text_chars: None,
            status: "running",
            failure_category: None,
            retryable: None,
            non_retryable_provider_rejection: None,
            cancel_reason: None,
            provider_request_id: None,
            provider_request_id_header: None,
        }
    }

    pub(crate) fn first_text_delta_received(
        provider: &str,
        model: &str,
        attempt: u32,
        started_at: &Instant,
        text_chars: usize,
    ) -> Self {
        Self {
            stage: ProviderTraceStage::FirstTextDeltaReceived,
            provider: provider.to_string(),
            model: model.to_string(),
            attempt,
            elapsed_ms: Some(elapsed_ms_since(started_at)),
            text_chars: Some(text_chars),
            status: "running",
            failure_category: None,
            retryable: None,
            non_retryable_provider_rejection: None,
            cancel_reason: None,
            provider_request_id: None,
            provider_request_id_header: None,
        }
    }

    pub(crate) fn failed(
        provider: &str,
        model: &str,
        attempt: u32,
        started_at: &Instant,
        error: &ProviderError,
    ) -> Self {
        Self {
            stage: ProviderTraceStage::Failed,
            provider: provider.to_string(),
            model: model.to_string(),
            attempt,
            elapsed_ms: Some(elapsed_ms_since(started_at)),
            text_chars: None,
            status: "failed",
            failure_category: Some(error.telemetry_type().to_string()),
            retryable: Some(error.is_retryable()),
            non_retryable_provider_rejection: Some(error.is_non_retryable_provider_rejection()),
            cancel_reason: None,
            provider_request_id: None,
            provider_request_id_header: None,
        }
    }

    pub(crate) fn canceled(
        provider: &str,
        model: &str,
        attempt: u32,
        started_at: &Instant,
        reason: &str,
    ) -> Self {
        Self {
            stage: ProviderTraceStage::Canceled,
            provider: provider.to_string(),
            model: model.to_string(),
            attempt,
            elapsed_ms: Some(elapsed_ms_since(started_at)),
            text_chars: None,
            status: "canceled",
            failure_category: None,
            retryable: None,
            non_retryable_provider_rejection: None,
            cancel_reason: Some(reason.to_string()),
            provider_request_id: None,
            provider_request_id_header: None,
        }
    }

    pub(crate) fn with_provider_response_context(
        mut self,
        context: Option<&crate::session_context::ProviderResponseContext>,
    ) -> Self {
        if let Some(context) = context {
            self.provider_request_id = context.provider_request_id.clone();
            self.provider_request_id_header = context.provider_request_id_header.clone();
        }
        self
    }
}

fn elapsed_ms_since(started_at: &Instant) -> u64 {
    u64::try_from(started_at.elapsed().as_millis()).unwrap_or(u64::MAX)
}
