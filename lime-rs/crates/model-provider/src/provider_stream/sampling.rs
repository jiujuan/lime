pub const PROVIDER_EMPTY_STREAM_RETRY_MARKER: &str =
    "Anthropic stream ended without assistant content or tool call";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RuntimeReplyProviderSamplingMode {
    Streaming,
    NonStreaming,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RuntimeReplyProviderSamplingRequest {
    pub provider_name: String,
    pub model_name: String,
    pub message_count: usize,
    pub tool_count: usize,
    pub system_chars: usize,
    pub tool_surface: Option<String>,
    pub supports_streaming: bool,
}

impl RuntimeReplyProviderSamplingRequest {
    pub fn new(
        provider_name: impl Into<String>,
        model_name: impl Into<String>,
        message_count: usize,
        tool_count: usize,
        system_chars: usize,
        tool_surface: Option<String>,
        supports_streaming: bool,
    ) -> Self {
        Self {
            provider_name: provider_name.into(),
            model_name: model_name.into(),
            message_count,
            tool_count,
            system_chars,
            tool_surface,
            supports_streaming,
        }
    }

    pub fn sampling_mode(&self) -> RuntimeReplyProviderSamplingMode {
        if self.supports_streaming {
            RuntimeReplyProviderSamplingMode::Streaming
        } else {
            RuntimeReplyProviderSamplingMode::NonStreaming
        }
    }
}

pub fn provider_stream_should_retry_empty_first_content(
    first_provider_content_seen: bool,
    error: impl std::fmt::Display,
) -> bool {
    !first_provider_content_seen
        && error
            .to_string()
            .contains(PROVIDER_EMPTY_STREAM_RETRY_MARKER)
}
