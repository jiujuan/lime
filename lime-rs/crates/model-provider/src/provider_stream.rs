//! Provider reply stream 的 current contract。
//!
//! 该模块只描述 Lime runtime 侧可传递的 provider handle 和 stream request，
//! 不持有具体 provider trait object。Aster-backed provider 只能作为 compat backend
//! 被 adapter 包在内部，不能把 Aster 类型暴露给 current 调用面。

use crate::runtime_provider::{RuntimeProviderConfig, RuntimeProviderProtocol};
use crate::ModelProviderProtocol;
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RuntimeProviderBackend {
    Current,
    AsterCompat,
}

impl RuntimeProviderBackend {
    pub fn as_wire_str(self) -> &'static str {
        match self {
            Self::Current => "current",
            Self::AsterCompat => "aster_compat",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RuntimeReplyInputKind {
    UserMessage,
    ActionRequiredResponse,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct RuntimeReplyProviderIdentity {
    pub provider_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_selector: Option<String>,
    pub model_name: String,
    pub credential_uuid: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub protocol: Option<ModelProviderProtocol>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reasoning_effort: Option<String>,
    #[serde(default)]
    pub toolshim: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub toolshim_model: Option<String>,
}

impl RuntimeReplyProviderIdentity {
    pub fn from_config(config: &RuntimeProviderConfig) -> Self {
        Self {
            provider_name: config.provider_name.clone(),
            provider_selector: config.provider_selector.clone(),
            model_name: config.model_name.clone(),
            credential_uuid: config.credential_uuid.clone(),
            protocol: config
                .protocol
                .map(RuntimeProviderProtocol::to_model_provider_protocol),
            reasoning_effort: config.reasoning_effort.clone(),
            toolshim: config.toolshim,
            toolshim_model: config.toolshim_model.clone(),
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct RuntimeReplyProviderCapabilities {
    pub supports_streaming: bool,
    pub supports_embeddings: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_model_name: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct RuntimeReplyProviderHandle {
    pub identity: RuntimeReplyProviderIdentity,
    pub backend: RuntimeProviderBackend,
    #[serde(default)]
    pub capabilities: RuntimeReplyProviderCapabilities,
}

impl RuntimeReplyProviderHandle {
    pub fn from_config(config: &RuntimeProviderConfig, backend: RuntimeProviderBackend) -> Self {
        Self {
            identity: RuntimeReplyProviderIdentity::from_config(config),
            backend,
            capabilities: RuntimeReplyProviderCapabilities::default(),
        }
    }

    pub fn with_capabilities(mut self, capabilities: RuntimeReplyProviderCapabilities) -> Self {
        self.capabilities = capabilities;
        self
    }

    pub fn provider_name(&self) -> &str {
        &self.identity.provider_name
    }

    pub fn model_name(&self) -> &str {
        &self.identity.model_name
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct RuntimeReplyStreamRequest {
    pub session_id: String,
    pub input_kind: RuntimeReplyInputKind,
    pub message_chars: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider: Option<RuntimeReplyProviderHandle>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model_request_policy: Option<RuntimeReplyModelRequestPolicy>,
}

impl RuntimeReplyStreamRequest {
    pub fn new(
        session_id: impl Into<String>,
        input_kind: RuntimeReplyInputKind,
        message_chars: usize,
        provider: Option<RuntimeReplyProviderHandle>,
    ) -> Self {
        Self {
            session_id: session_id.into(),
            input_kind,
            message_chars,
            provider,
            model_request_policy: None,
        }
    }

    pub fn with_model_request_policy(
        mut self,
        model_request_policy: Option<RuntimeReplyModelRequestPolicy>,
    ) -> Self {
        self.model_request_policy = model_request_policy;
        self
    }

    pub fn provider_backend(&self) -> Option<RuntimeProviderBackend> {
        self.provider.as_ref().map(|provider| provider.backend)
    }

    pub fn provider_name(&self) -> Option<&str> {
        self.provider
            .as_ref()
            .map(RuntimeReplyProviderHandle::provider_name)
    }

    pub fn model_name(&self) -> Option<&str> {
        self.provider
            .as_ref()
            .map(RuntimeReplyProviderHandle::model_name)
    }

    pub fn provider_request_wire_shape(&self) -> RuntimeReplyProviderRequestWireShape {
        RuntimeReplyProviderRequestWireShape::from_model_request_policy(
            self.model_request_policy.as_ref(),
        )
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct RuntimeReplyModelRequestPolicy {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub responses: Option<RuntimeReplyResponsesPolicy>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call: Option<RuntimeReplyToolCallPolicy>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_output: Option<RuntimeReplyReasoningOutputPolicy>,
}

impl RuntimeReplyModelRequestPolicy {
    pub fn new(
        responses: Option<RuntimeReplyResponsesPolicy>,
        tool_call: Option<RuntimeReplyToolCallPolicy>,
        reasoning_output: Option<RuntimeReplyReasoningOutputPolicy>,
    ) -> Option<Self> {
        (responses.is_some() || tool_call.is_some() || reasoning_output.is_some()).then_some(Self {
            responses,
            tool_call,
            reasoning_output,
        })
    }

    pub fn use_responses_lite(&self) -> bool {
        self.responses
            .as_ref()
            .is_some_and(|policy| policy.use_responses_lite)
    }

    pub fn reasoning_context(&self) -> Option<&str> {
        self.responses
            .as_ref()
            .map(|policy| policy.reasoning_context.as_str())
    }

    pub fn requires_responses_lite_header(&self) -> bool {
        self.responses
            .as_ref()
            .is_some_and(|policy| policy.requires_responses_lite_header)
    }

    pub fn parallel_tool_calls(&self) -> Option<bool> {
        self.tool_call
            .as_ref()
            .map(|policy| policy.parallel_tool_calls)
    }

    pub fn reasoning_summary(&self) -> Option<&str> {
        self.reasoning_output
            .as_ref()
            .and_then(RuntimeReplyReasoningOutputPolicy::reasoning_summary)
    }

    pub fn text_verbosity(&self) -> Option<&str> {
        self.reasoning_output
            .as_ref()
            .and_then(RuntimeReplyReasoningOutputPolicy::text_verbosity)
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct RuntimeReplyProviderRequestWireShape {
    #[serde(default)]
    pub use_responses_lite: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reasoning_context: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reasoning_summary: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text_verbosity: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parallel_tool_calls: Option<bool>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub headers: Vec<RuntimeReplyProviderRequestHeader>,
}

impl RuntimeReplyProviderRequestWireShape {
    pub const TURN_CONTEXT_METADATA_KEY: &'static str = "provider_request_wire_shape";
    pub const RESPONSES_LITE_HEADER_NAME: &'static str = "x-openai-internal-codex-responses-lite";
    pub const RESPONSES_LITE_HEADER_VALUE: &'static str = "true";

    pub fn from_model_request_policy(policy: Option<&RuntimeReplyModelRequestPolicy>) -> Self {
        let Some(policy) = policy else {
            return Self::default();
        };

        let use_responses_lite = policy.use_responses_lite();
        let reasoning_context = policy.reasoning_context().map(ToOwned::to_owned);
        let reasoning_summary = policy.reasoning_summary().map(ToOwned::to_owned);
        let text_verbosity = policy.text_verbosity().map(ToOwned::to_owned);
        let parallel_tool_calls = policy.parallel_tool_calls();
        let headers = if policy.requires_responses_lite_header() {
            vec![RuntimeReplyProviderRequestHeader {
                name: Self::RESPONSES_LITE_HEADER_NAME.to_string(),
                value: Self::RESPONSES_LITE_HEADER_VALUE.to_string(),
            }]
        } else {
            Vec::new()
        };

        Self {
            use_responses_lite,
            reasoning_context,
            reasoning_summary,
            text_verbosity,
            parallel_tool_calls,
            headers,
        }
    }

    pub fn requires_responses_lite_wire_support(&self) -> bool {
        self.use_responses_lite
            || self.reasoning_context.as_deref() == Some("all_turns")
            || self
                .headers
                .iter()
                .any(RuntimeReplyProviderRequestHeader::is_responses_lite_header)
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct RuntimeReplyProviderRequestHeader {
    pub name: String,
    pub value: String,
}

impl RuntimeReplyProviderRequestHeader {
    pub fn is_responses_lite_header(&self) -> bool {
        self.name
            .eq_ignore_ascii_case(RuntimeReplyProviderRequestWireShape::RESPONSES_LITE_HEADER_NAME)
            && self.value == RuntimeReplyProviderRequestWireShape::RESPONSES_LITE_HEADER_VALUE
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct RuntimeReplyResponsesPolicy {
    pub use_responses_lite: bool,
    pub request_mode: String,
    pub instructions_location: String,
    pub tools_location: String,
    pub reasoning_context: String,
    pub parallel_tool_calls_allowed: bool,
    pub requires_responses_lite_header: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct RuntimeReplyToolCallPolicy {
    pub supports_parallel_tool_calls: bool,
    pub parallel_tool_calls: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct RuntimeReplyReasoningOutputPolicy {
    pub default_reasoning_summary: String,
    pub support_verbosity: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_verbosity: Option<String>,
    pub can_set_verbosity: bool,
}

impl RuntimeReplyReasoningOutputPolicy {
    pub fn reasoning_summary(&self) -> Option<&str> {
        let summary = self.default_reasoning_summary.trim();
        (!summary.is_empty() && summary != "none").then_some(summary)
    }

    pub fn text_verbosity(&self) -> Option<&str> {
        if !(self.support_verbosity && self.can_set_verbosity) {
            return None;
        }
        self.default_verbosity
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime_provider::{RuntimeProviderConfig, RuntimeProviderProtocol};

    fn runtime_config() -> RuntimeProviderConfig {
        RuntimeProviderConfig {
            provider_name: "openai".to_string(),
            provider_selector: Some("codex".to_string()),
            model_name: "gpt-5.3-codex".to_string(),
            api_key: None,
            base_url: Some("https://example.com/openai".to_string()),
            credential_uuid: "credential-1".to_string(),
            reasoning_effort: Some("medium".to_string()),
            protocol: Some(RuntimeProviderProtocol::Responses),
            toolshim: true,
            toolshim_model: Some("gpt-4o-mini".to_string()),
        }
    }

    #[test]
    fn provider_handle_projects_runtime_config_without_provider_trait() {
        let handle = RuntimeReplyProviderHandle::from_config(
            &runtime_config(),
            RuntimeProviderBackend::AsterCompat,
        )
        .with_capabilities(RuntimeReplyProviderCapabilities {
            supports_streaming: true,
            supports_embeddings: false,
            active_model_name: Some("gpt-5.3-codex".to_string()),
        });

        assert_eq!(handle.provider_name(), "openai");
        assert_eq!(handle.model_name(), "gpt-5.3-codex");
        assert_eq!(handle.backend, RuntimeProviderBackend::AsterCompat);
        assert_eq!(
            handle.identity.protocol,
            Some(ModelProviderProtocol::Responses)
        );
        assert!(handle.capabilities.supports_streaming);
    }

    #[test]
    fn stream_request_carries_current_provider_handle() {
        let handle = RuntimeReplyProviderHandle::from_config(
            &runtime_config(),
            RuntimeProviderBackend::AsterCompat,
        );
        let request = RuntimeReplyStreamRequest::new(
            "session-1",
            RuntimeReplyInputKind::UserMessage,
            42,
            Some(handle),
        );

        assert_eq!(request.session_id, "session-1");
        assert_eq!(
            request.provider_backend(),
            Some(RuntimeProviderBackend::AsterCompat)
        );
        assert_eq!(request.provider_name(), Some("openai"));
        assert_eq!(request.model_name(), Some("gpt-5.3-codex"));
    }

    #[test]
    fn stream_request_carries_model_request_policy() {
        let request = RuntimeReplyStreamRequest::new(
            "session-1",
            RuntimeReplyInputKind::UserMessage,
            42,
            None,
        )
        .with_model_request_policy(RuntimeReplyModelRequestPolicy::new(
            Some(RuntimeReplyResponsesPolicy {
                use_responses_lite: true,
                request_mode: "responses_lite".to_string(),
                instructions_location: "input_prefix".to_string(),
                tools_location: "input_prefix".to_string(),
                reasoning_context: "all_turns".to_string(),
                parallel_tool_calls_allowed: false,
                requires_responses_lite_header: true,
            }),
            Some(RuntimeReplyToolCallPolicy {
                supports_parallel_tool_calls: true,
                parallel_tool_calls: false,
            }),
            None,
        ));

        let policy = request.model_request_policy.as_ref().expect("policy");
        assert!(policy.use_responses_lite());
        assert_eq!(policy.reasoning_context(), Some("all_turns"));
        assert!(policy.requires_responses_lite_header());
        assert_eq!(policy.parallel_tool_calls(), Some(false));
    }

    #[test]
    fn stream_request_projects_responses_lite_wire_shape() {
        let request = RuntimeReplyStreamRequest::new(
            "session-1",
            RuntimeReplyInputKind::UserMessage,
            42,
            None,
        )
        .with_model_request_policy(RuntimeReplyModelRequestPolicy::new(
            Some(RuntimeReplyResponsesPolicy {
                use_responses_lite: true,
                request_mode: "responses_lite".to_string(),
                instructions_location: "input_prefix".to_string(),
                tools_location: "input_prefix".to_string(),
                reasoning_context: "all_turns".to_string(),
                parallel_tool_calls_allowed: false,
                requires_responses_lite_header: true,
            }),
            Some(RuntimeReplyToolCallPolicy {
                supports_parallel_tool_calls: true,
                parallel_tool_calls: false,
            }),
            None,
        ));

        let wire_shape = request.provider_request_wire_shape();

        assert!(wire_shape.use_responses_lite);
        assert_eq!(wire_shape.reasoning_context.as_deref(), Some("all_turns"));
        assert_eq!(wire_shape.parallel_tool_calls, Some(false));
        assert_eq!(
            wire_shape.headers,
            vec![RuntimeReplyProviderRequestHeader {
                name: RuntimeReplyProviderRequestWireShape::RESPONSES_LITE_HEADER_NAME.to_string(),
                value: RuntimeReplyProviderRequestWireShape::RESPONSES_LITE_HEADER_VALUE
                    .to_string(),
            }]
        );
        assert!(wire_shape.requires_responses_lite_wire_support());
    }

    #[test]
    fn stream_request_projects_plain_responses_parallel_tool_calls_without_lite_header() {
        let request = RuntimeReplyStreamRequest::new(
            "session-1",
            RuntimeReplyInputKind::UserMessage,
            42,
            None,
        )
        .with_model_request_policy(RuntimeReplyModelRequestPolicy::new(
            Some(RuntimeReplyResponsesPolicy {
                use_responses_lite: false,
                request_mode: "responses".to_string(),
                instructions_location: "request_field".to_string(),
                tools_location: "request_field".to_string(),
                reasoning_context: "default".to_string(),
                parallel_tool_calls_allowed: true,
                requires_responses_lite_header: false,
            }),
            Some(RuntimeReplyToolCallPolicy {
                supports_parallel_tool_calls: true,
                parallel_tool_calls: true,
            }),
            None,
        ));

        let wire_shape = request.provider_request_wire_shape();

        assert!(!wire_shape.use_responses_lite);
        assert_eq!(wire_shape.reasoning_context.as_deref(), Some("default"));
        assert_eq!(wire_shape.parallel_tool_calls, Some(true));
        assert!(wire_shape.headers.is_empty());
        assert!(!wire_shape.requires_responses_lite_wire_support());
    }

    #[test]
    fn stream_request_projects_reasoning_output_wire_shape() {
        let request = RuntimeReplyStreamRequest::new(
            "session-1",
            RuntimeReplyInputKind::UserMessage,
            42,
            None,
        )
        .with_model_request_policy(RuntimeReplyModelRequestPolicy::new(
            None,
            None,
            Some(RuntimeReplyReasoningOutputPolicy {
                default_reasoning_summary: "detailed".to_string(),
                support_verbosity: true,
                default_verbosity: Some("low".to_string()),
                can_set_verbosity: true,
            }),
        ));

        let wire_shape = request.provider_request_wire_shape();

        assert_eq!(wire_shape.reasoning_summary.as_deref(), Some("detailed"));
        assert_eq!(wire_shape.text_verbosity.as_deref(), Some("low"));
    }

    #[test]
    fn reasoning_output_wire_shape_omits_none_summary_and_unsupported_verbosity() {
        let request = RuntimeReplyStreamRequest::new(
            "session-1",
            RuntimeReplyInputKind::UserMessage,
            42,
            None,
        )
        .with_model_request_policy(RuntimeReplyModelRequestPolicy::new(
            None,
            None,
            Some(RuntimeReplyReasoningOutputPolicy {
                default_reasoning_summary: "none".to_string(),
                support_verbosity: false,
                default_verbosity: Some("high".to_string()),
                can_set_verbosity: false,
            }),
        ));

        let wire_shape = request.provider_request_wire_shape();

        assert_eq!(wire_shape.reasoning_summary, None);
        assert_eq!(wire_shape.text_verbosity, None);
    }
}
