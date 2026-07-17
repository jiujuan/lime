use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProviderTraceStage {
    RequestStarted,
    FirstEventReceived,
    FirstTextDeltaReceived,
    Failed,
    Canceled,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProviderTraceFailure {
    pub failure_category: String,
    pub retryable: bool,
    pub non_retryable_provider_rejection: bool,
}

impl ProviderTraceFailure {
    pub fn new(
        failure_category: impl Into<String>,
        retryable: bool,
        non_retryable_provider_rejection: bool,
    ) -> Self {
        Self {
            failure_category: failure_category.into(),
            retryable,
            non_retryable_provider_rejection,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProviderTraceResponseContext {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_request_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_request_id_header: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub runtime_provider_backend: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub runtime_provider_selector: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub runtime_provider_protocol: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub runtime_provider_active_model: Option<String>,
}

impl ProviderTraceResponseContext {
    pub fn new(
        provider_request_id: Option<String>,
        provider_request_id_header: Option<String>,
    ) -> Self {
        Self {
            provider_request_id,
            provider_request_id_header,
            runtime_provider_backend: None,
            runtime_provider_selector: None,
            runtime_provider_protocol: None,
            runtime_provider_active_model: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProviderTraceEvent {
    pub stage: ProviderTraceStage,
    pub provider: String,
    pub model: String,
    pub attempt: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub elapsed_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text_chars: Option<usize>,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub failure_category: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retryable: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub non_retryable_provider_rejection: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cancel_reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_request_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_request_id_header: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub runtime_provider_backend: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub runtime_provider_selector: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub runtime_provider_protocol: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub runtime_provider_active_model: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tool_names: Vec<String>,
}

impl ProviderTraceEvent {
    pub fn request_started(
        provider: impl Into<String>,
        model: impl Into<String>,
        attempt: u32,
    ) -> Self {
        Self {
            stage: ProviderTraceStage::RequestStarted,
            provider: provider.into(),
            model: model.into(),
            attempt,
            elapsed_ms: Some(0),
            text_chars: None,
            status: "running".to_string(),
            failure_category: None,
            retryable: None,
            non_retryable_provider_rejection: None,
            cancel_reason: None,
            provider_request_id: None,
            provider_request_id_header: None,
            runtime_provider_backend: None,
            runtime_provider_selector: None,
            runtime_provider_protocol: None,
            runtime_provider_active_model: None,
            tool_names: Vec::new(),
        }
    }

    pub fn first_event_received(
        provider: impl Into<String>,
        model: impl Into<String>,
        attempt: u32,
        elapsed_ms: u64,
    ) -> Self {
        Self {
            stage: ProviderTraceStage::FirstEventReceived,
            provider: provider.into(),
            model: model.into(),
            attempt,
            elapsed_ms: Some(elapsed_ms),
            text_chars: None,
            status: "running".to_string(),
            failure_category: None,
            retryable: None,
            non_retryable_provider_rejection: None,
            cancel_reason: None,
            provider_request_id: None,
            provider_request_id_header: None,
            runtime_provider_backend: None,
            runtime_provider_selector: None,
            runtime_provider_protocol: None,
            runtime_provider_active_model: None,
            tool_names: Vec::new(),
        }
    }

    pub fn first_text_delta_received(
        provider: impl Into<String>,
        model: impl Into<String>,
        attempt: u32,
        elapsed_ms: u64,
        text_chars: usize,
    ) -> Self {
        Self {
            stage: ProviderTraceStage::FirstTextDeltaReceived,
            provider: provider.into(),
            model: model.into(),
            attempt,
            elapsed_ms: Some(elapsed_ms),
            text_chars: Some(text_chars),
            status: "running".to_string(),
            failure_category: None,
            retryable: None,
            non_retryable_provider_rejection: None,
            cancel_reason: None,
            provider_request_id: None,
            provider_request_id_header: None,
            runtime_provider_backend: None,
            runtime_provider_selector: None,
            runtime_provider_protocol: None,
            runtime_provider_active_model: None,
            tool_names: Vec::new(),
        }
    }

    pub fn failed(
        provider: impl Into<String>,
        model: impl Into<String>,
        attempt: u32,
        elapsed_ms: u64,
        failure: ProviderTraceFailure,
    ) -> Self {
        Self {
            stage: ProviderTraceStage::Failed,
            provider: provider.into(),
            model: model.into(),
            attempt,
            elapsed_ms: Some(elapsed_ms),
            text_chars: None,
            status: "failed".to_string(),
            failure_category: Some(failure.failure_category),
            retryable: Some(failure.retryable),
            non_retryable_provider_rejection: Some(failure.non_retryable_provider_rejection),
            cancel_reason: None,
            provider_request_id: None,
            provider_request_id_header: None,
            runtime_provider_backend: None,
            runtime_provider_selector: None,
            runtime_provider_protocol: None,
            runtime_provider_active_model: None,
            tool_names: Vec::new(),
        }
    }

    pub fn canceled(
        provider: impl Into<String>,
        model: impl Into<String>,
        attempt: u32,
        elapsed_ms: u64,
        reason: impl Into<String>,
    ) -> Self {
        Self {
            stage: ProviderTraceStage::Canceled,
            provider: provider.into(),
            model: model.into(),
            attempt,
            elapsed_ms: Some(elapsed_ms),
            text_chars: None,
            status: "canceled".to_string(),
            failure_category: None,
            retryable: None,
            non_retryable_provider_rejection: None,
            cancel_reason: Some(reason.into()),
            provider_request_id: None,
            provider_request_id_header: None,
            runtime_provider_backend: None,
            runtime_provider_selector: None,
            runtime_provider_protocol: None,
            runtime_provider_active_model: None,
            tool_names: Vec::new(),
        }
    }

    pub fn with_response_context(mut self, context: Option<&ProviderTraceResponseContext>) -> Self {
        if let Some(context) = context {
            self.provider_request_id = context.provider_request_id.clone();
            self.provider_request_id_header = context.provider_request_id_header.clone();
            self.runtime_provider_backend = context.runtime_provider_backend.clone();
            self.runtime_provider_selector = context.runtime_provider_selector.clone();
            self.runtime_provider_protocol = context.runtime_provider_protocol.clone();
            self.runtime_provider_active_model = context.runtime_provider_active_model.clone();
        }
        self
    }

    pub fn with_runtime_provider_metadata(
        mut self,
        backend: Option<String>,
        selector: Option<String>,
        protocol: Option<String>,
        active_model: Option<String>,
    ) -> Self {
        self.runtime_provider_backend = backend;
        self.runtime_provider_selector = selector;
        self.runtime_provider_protocol = protocol;
        self.runtime_provider_active_model = active_model;
        self
    }

    pub fn with_tool_names(mut self, tool_names: impl IntoIterator<Item = String>) -> Self {
        self.tool_names = tool_names.into_iter().collect();
        self.tool_names.sort();
        self.tool_names.dedup();
        self
    }
}

pub fn runtime_event_type_for_provider_trace_stage(stage: ProviderTraceStage) -> &'static str {
    match stage {
        ProviderTraceStage::RequestStarted => "provider.request.started",
        ProviderTraceStage::FirstEventReceived => "provider.first_event.received",
        ProviderTraceStage::FirstTextDeltaReceived => "provider.first_text_delta.received",
        ProviderTraceStage::Failed => "provider.failed",
        ProviderTraceStage::Canceled => "provider.canceled",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_trace_stage_uses_snake_case_wire_values() {
        let value = serde_json::to_value(ProviderTraceStage::FirstTextDeltaReceived)
            .expect("serialize provider trace stage");

        assert_eq!(value, serde_json::json!("first_text_delta_received"));
    }

    #[test]
    fn provider_trace_event_attaches_response_context() {
        let event = ProviderTraceEvent::first_text_delta_received("openai", "gpt-4.1", 1, 25, 4)
            .with_response_context(Some(&ProviderTraceResponseContext::new(
                Some("req-provider-1".to_string()),
                Some("x-request-id".to_string()),
            )));

        assert_eq!(event.stage, ProviderTraceStage::FirstTextDeltaReceived);
        assert_eq!(event.elapsed_ms, Some(25));
        assert_eq!(event.text_chars, Some(4));
        assert_eq!(event.provider_request_id.as_deref(), Some("req-provider-1"));
        assert_eq!(
            event.provider_request_id_header.as_deref(),
            Some("x-request-id")
        );
    }

    #[test]
    fn provider_trace_event_attaches_runtime_provider_metadata() {
        let event = ProviderTraceEvent::request_started("", "", 1).with_runtime_provider_metadata(
            Some("current".to_string()),
            Some("codex".to_string()),
            Some("responses".to_string()),
            Some("gpt-4.1".to_string()),
        );

        assert_eq!(event.runtime_provider_backend.as_deref(), Some("current"));
        assert_eq!(event.runtime_provider_selector.as_deref(), Some("codex"));
        assert_eq!(
            event.runtime_provider_protocol.as_deref(),
            Some("responses")
        );
        assert_eq!(
            event.runtime_provider_active_model.as_deref(),
            Some("gpt-4.1")
        );
    }

    #[test]
    fn provider_trace_event_attaches_stable_tool_snapshot() {
        let event = ProviderTraceEvent::request_started("openai", "gpt-4.1", 1)
            .with_tool_names(["Read", "apply_patch", "Read"].map(str::to_string));

        assert_eq!(event.tool_names, vec!["Read", "apply_patch"]);
        assert_eq!(
            serde_json::to_value(event).expect("serialize provider trace")["tool_names"],
            serde_json::json!(["Read", "apply_patch"])
        );
    }

    #[test]
    fn provider_trace_stage_maps_to_runtime_event_type() {
        assert_eq!(
            runtime_event_type_for_provider_trace_stage(ProviderTraceStage::RequestStarted),
            "provider.request.started"
        );
        assert_eq!(
            runtime_event_type_for_provider_trace_stage(ProviderTraceStage::FirstTextDeltaReceived),
            "provider.first_text_delta.received"
        );
        assert_eq!(
            runtime_event_type_for_provider_trace_stage(ProviderTraceStage::Canceled),
            "provider.canceled"
        );
    }
}
