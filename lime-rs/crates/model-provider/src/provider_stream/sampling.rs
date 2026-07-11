pub const PROVIDER_EMPTY_STREAM_RETRY_MARKER: &str =
    "Anthropic stream ended without assistant content or tool call";

use std::future::Future;
use std::time::Instant;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RuntimeReplyProviderSamplingMode {
    Streaming,
    NonStreaming,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RuntimeReplyProviderSamplingFailureLogLevel {
    Info,
    Warn,
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

#[derive(Debug)]
pub struct RuntimeReplyProviderSamplingSession {
    request: RuntimeReplyProviderSamplingRequest,
    started_at: Instant,
}

impl RuntimeReplyProviderSamplingSession {
    pub fn start(request: RuntimeReplyProviderSamplingRequest) -> Self {
        Self {
            request,
            started_at: Instant::now(),
        }
    }

    pub fn request(&self) -> &RuntimeReplyProviderSamplingRequest {
        &self.request
    }

    pub fn elapsed_ms(&self) -> u128 {
        self.started_at.elapsed().as_millis()
    }

    pub fn started_at(&self) -> &Instant {
        &self.started_at
    }

    pub async fn open_stream<Stream, CompleteOutput, Error, StreamFuture, CompleteFuture>(
        &self,
        open_stream: impl FnOnce() -> StreamFuture,
        complete: impl FnOnce() -> CompleteFuture,
        stream_from_complete: impl FnOnce(CompleteOutput) -> Stream,
        failure_log_level: impl Fn(&Error) -> RuntimeReplyProviderSamplingFailureLogLevel,
    ) -> Result<Stream, Error>
    where
        StreamFuture: Future<Output = Result<Stream, Error>>,
        CompleteFuture: Future<Output = Result<CompleteOutput, Error>>,
        Error: std::fmt::Display,
    {
        match self.request.sampling_mode() {
            RuntimeReplyProviderSamplingMode::Streaming => {
                self.log_stream_request_start();
                let result = open_stream().await;
                match &result {
                    Ok(_) => self.log_stream_headers_received(),
                    Err(error) => {
                        self.log_stream_request_failed(error, failure_log_level(error));
                    }
                }
                result
            }
            RuntimeReplyProviderSamplingMode::NonStreaming => {
                self.log_non_stream_request_start();
                let result = complete().await;
                self.log_non_stream_response_complete();
                result.map(stream_from_complete)
            }
        }
    }

    pub fn log_empty_first_content_retry(&self, error: impl std::fmt::Display) {
        tracing::warn!(
            "[ModelProvider][TTFT] empty provider stream before first message, retrying non-stream fallback: provider={}, model={}, elapsed_ms={}, error={}",
            self.request.provider_name,
            self.request.model_name,
            self.elapsed_ms(),
            error
        );
    }

    pub fn log_first_content_decoded(&self) {
        tracing::info!(
            "[ModelProvider][TTFT] first provider stream message decoded: provider={}, model={}, elapsed_ms={}",
            self.request.provider_name,
            self.request.model_name,
            self.elapsed_ms()
        );
    }

    fn log_stream_request_start(&self) {
        tracing::info!(
            "[ModelProvider][TTFT] provider stream request start: provider={}, model={}, messages={}, tools={}, tool_surface={:?}, system_chars={}",
            self.request.provider_name,
            self.request.model_name,
            self.request.message_count,
            self.request.tool_count,
            self.request.tool_surface,
            self.request.system_chars
        );
    }

    fn log_stream_headers_received(&self) {
        tracing::info!(
            "[ModelProvider][TTFT] provider stream response headers received: provider={}, model={}, elapsed_ms={}",
            self.request.provider_name,
            self.request.model_name,
            self.elapsed_ms()
        );
    }

    fn log_stream_request_failed(
        &self,
        error: impl std::fmt::Display,
        level: RuntimeReplyProviderSamplingFailureLogLevel,
    ) {
        match level {
            RuntimeReplyProviderSamplingFailureLogLevel::Info => {
                tracing::info!(
                    "[ModelProvider][TTFT] provider stream request rejected before body: provider={}, model={}, elapsed_ms={}, error={}",
                    self.request.provider_name,
                    self.request.model_name,
                    self.elapsed_ms(),
                    error
                );
            }
            RuntimeReplyProviderSamplingFailureLogLevel::Warn => {
                tracing::warn!(
                    "[ModelProvider][TTFT] provider stream request failed before body: provider={}, model={}, elapsed_ms={}, error={}",
                    self.request.provider_name,
                    self.request.model_name,
                    self.elapsed_ms(),
                    error
                );
            }
        }
    }

    fn log_non_stream_request_start(&self) {
        tracing::info!(
            "[ModelProvider][TTFT] provider non-stream request start: provider={}, model={}, messages={}, tools={}, tool_surface={:?}, system_chars={}",
            self.request.provider_name,
            self.request.model_name,
            self.request.message_count,
            self.request.tool_count,
            self.request.tool_surface,
            self.request.system_chars
        );
    }

    fn log_non_stream_response_complete(&self) {
        tracing::info!(
            "[ModelProvider][TTFT] provider non-stream response complete: provider={}, model={}, elapsed_ms={}",
            self.request.provider_name,
            self.request.model_name,
            self.elapsed_ms()
        );
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
