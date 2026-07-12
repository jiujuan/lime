//! Reply backend 的 current execution contract。
//!
//! 该模块描述 Turn reply backend 如何消费已 materialize 的 current start request，
//! 不绑定 Agent `Agent::reply`、provider trait 或事件 source。

use crate::reply_host::{
    RuntimeReplyStartError, RuntimeReplyStartRequest, RuntimeReplyStartResult, RuntimeReplyStream,
};
use crate::reply_message::RuntimeReplyMessage;
use crate::reply_session::{attach_reply_disallowed_tools, attach_reply_provider_wire_shape};
use crate::session_config::AgentSessionConfig;
use futures::future::BoxFuture;
use model_provider::provider_stream::{
    RuntimeReplyProviderHandle, RuntimeReplyProviderStreamStart,
    RuntimeReplyProviderWireSupportIssue, RuntimeReplyStreamRequest,
};
use std::path::PathBuf;
use tokio_util::sync::CancellationToken;

pub struct RuntimeReplyBackendStart {
    message: RuntimeReplyMessage,
    stream_request: RuntimeReplyStreamRequest,
    session_config: AgentSessionConfig,
    working_directory: Option<PathBuf>,
    cancel_token: Option<CancellationToken>,
    emitted_any: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuntimeReplyBackendTrace<'a> {
    pub provider_backend: Option<model_provider::provider_stream::RuntimeProviderBackend>,
    pub provider_name: Option<&'a str>,
    pub model_name: Option<&'a str>,
    pub use_responses_lite: Option<bool>,
    pub reasoning_context: Option<&'a str>,
    pub parallel_tool_calls: Option<bool>,
    pub requires_responses_lite_header: Option<bool>,
    pub input_kind: model_provider::provider_stream::RuntimeReplyInputKind,
    pub message_chars: usize,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct RuntimeReplySessionPreparation {
    pub provider_wire_shape_requested: bool,
    pub provider_wire_shape_attached: bool,
}

impl RuntimeReplySessionPreparation {
    pub fn provider_wire_shape_failed(self) -> bool {
        self.provider_wire_shape_requested && !self.provider_wire_shape_attached
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RuntimeReplyBackendRunPath {
    Default,
    Provider(RuntimeReplyProviderStreamStart),
}

#[derive(Debug)]
pub struct RuntimeReplyBackendRun {
    message: RuntimeReplyMessage,
    stream_request: RuntimeReplyStreamRequest,
    session_config: AgentSessionConfig,
    working_directory: Option<PathBuf>,
    cancel_token: Option<CancellationToken>,
    emitted_any: bool,
    message_chars: usize,
    path: RuntimeReplyBackendRunPath,
    session_preparation: RuntimeReplySessionPreparation,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RuntimeReplyBackendRunOutcome {
    message_chars: usize,
    emitted_any: bool,
}

impl RuntimeReplyBackendRun {
    pub fn message_chars(&self) -> usize {
        self.message_chars
    }

    pub fn session_preparation(&self) -> RuntimeReplySessionPreparation {
        self.session_preparation
    }

    pub fn outcome(&self) -> RuntimeReplyBackendRunOutcome {
        RuntimeReplyBackendRunOutcome {
            message_chars: self.message_chars,
            emitted_any: self.emitted_any,
        }
    }

    pub fn into_parts(
        self,
    ) -> (
        RuntimeReplyMessage,
        RuntimeReplyBackendRunPath,
        RuntimeReplyStreamRequest,
        AgentSessionConfig,
        Option<PathBuf>,
        Option<CancellationToken>,
        bool,
    ) {
        (
            self.message,
            self.path,
            self.stream_request,
            self.session_config,
            self.working_directory,
            self.cancel_token,
            self.emitted_any,
        )
    }
}

impl RuntimeReplyBackendRunOutcome {
    pub fn finish_stream<'a, E, Err>(
        self,
        stream_result: Result<RuntimeReplyStream<'a, E>, Err>,
    ) -> RuntimeReplyStartResult<'a, E>
    where
        Err: std::fmt::Display,
    {
        stream_result
            .map(|stream| (stream, self.message_chars))
            .map_err(|error| {
                RuntimeReplyStartError::new(format!("Agent error: {error}"), self.emitted_any)
            })
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RuntimeReplyBackendPrepareError {
    ProviderWireSupport {
        issue: RuntimeReplyProviderWireSupportIssue,
        error: RuntimeReplyStartError,
    },
    ProviderStart(RuntimeReplyStartError),
}

impl RuntimeReplyBackendPrepareError {
    pub fn provider_wire_support_issue(&self) -> Option<&RuntimeReplyProviderWireSupportIssue> {
        match self {
            Self::ProviderWireSupport { issue, .. } => Some(issue),
            Self::ProviderStart(_) => None,
        }
    }

    pub fn into_start_error(self) -> RuntimeReplyStartError {
        match self {
            Self::ProviderWireSupport { error, .. } | Self::ProviderStart(error) => error,
        }
    }
}

impl RuntimeReplyBackendStart {
    pub fn from_start_request(start_request: RuntimeReplyStartRequest) -> Self {
        let RuntimeReplyStartRequest {
            request,
            session_config,
            working_directory,
            cancel_token,
            emitted_any,
        } = start_request;
        let (message, stream_request) = request.into_parts();

        Self {
            message,
            stream_request,
            session_config,
            working_directory,
            cancel_token,
            emitted_any,
        }
    }

    pub fn stream_request(&self) -> &RuntimeReplyStreamRequest {
        &self.stream_request
    }

    pub fn session_config(&self) -> &AgentSessionConfig {
        &self.session_config
    }

    pub fn message_chars(&self) -> usize {
        self.stream_request.message_chars
    }

    pub fn trace(&self) -> RuntimeReplyBackendTrace<'_> {
        RuntimeReplyBackendTrace {
            provider_backend: self.stream_request.provider_backend(),
            provider_name: self.stream_request.provider_name(),
            model_name: self.stream_request.model_name(),
            use_responses_lite: self
                .stream_request
                .model_request_policy
                .as_ref()
                .map(|policy| policy.use_responses_lite()),
            reasoning_context: self
                .stream_request
                .model_request_policy
                .as_ref()
                .and_then(|policy| policy.reasoning_context()),
            parallel_tool_calls: self
                .stream_request
                .model_request_policy
                .as_ref()
                .and_then(|policy| policy.parallel_tool_calls()),
            requires_responses_lite_header: self
                .stream_request
                .model_request_policy
                .as_ref()
                .map(|policy| policy.requires_responses_lite_header()),
            input_kind: self.stream_request.input_kind,
            message_chars: self.stream_request.message_chars,
        }
    }

    pub fn provider_wire_support_start_error(
        &self,
    ) -> Option<(RuntimeReplyProviderWireSupportIssue, RuntimeReplyStartError)> {
        let issue = self.stream_request.provider_request_wire_support_issue()?;
        let error =
            RuntimeReplyStartError::from_provider_wire_support_issue(&issue, self.emitted_any);
        Some((issue, error))
    }

    pub fn provider_stream_start(
        &self,
        provider_handle: &RuntimeReplyProviderHandle,
    ) -> Result<RuntimeReplyProviderStreamStart, RuntimeReplyStartError> {
        RuntimeReplyProviderStreamStart::new(self.stream_request.clone(), provider_handle)
            .map_err(|error| RuntimeReplyStartError::new(error.message, self.emitted_any))
    }

    pub fn prepare_session_metadata<I, S>(
        &mut self,
        disallowed_tools: I,
    ) -> RuntimeReplySessionPreparation
    where
        I: IntoIterator<Item = S>,
        S: AsRef<str>,
    {
        attach_reply_disallowed_tools(&mut self.session_config, disallowed_tools);
        let provider_wire_shape_requested = self.stream_request.model_request_policy.is_some();
        let provider_wire_shape_attached =
            attach_reply_provider_wire_shape(&mut self.session_config, &self.stream_request);

        RuntimeReplySessionPreparation {
            provider_wire_shape_requested,
            provider_wire_shape_attached,
        }
    }

    pub fn prepare_run<I, S>(
        mut self,
        provider_handle: Option<&RuntimeReplyProviderHandle>,
        disallowed_tools: I,
    ) -> Result<RuntimeReplyBackendRun, RuntimeReplyBackendPrepareError>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<str>,
    {
        if let Some((issue, error)) = self.provider_wire_support_start_error() {
            return Err(RuntimeReplyBackendPrepareError::ProviderWireSupport { issue, error });
        }

        let session_preparation = self.prepare_session_metadata(disallowed_tools);
        let path = match provider_handle {
            Some(provider_handle) => RuntimeReplyBackendRunPath::Provider(
                self.provider_stream_start(provider_handle)
                    .map_err(RuntimeReplyBackendPrepareError::ProviderStart)?,
            ),
            None => RuntimeReplyBackendRunPath::Default,
        };
        let message_chars = self.message_chars();
        let (message, stream_request, session_config, working_directory, cancel_token, emitted_any) =
            self.into_parts();

        Ok(RuntimeReplyBackendRun {
            message,
            stream_request,
            session_config,
            working_directory,
            cancel_token,
            emitted_any,
            message_chars,
            path,
            session_preparation,
        })
    }

    pub fn into_parts(
        self,
    ) -> (
        RuntimeReplyMessage,
        RuntimeReplyStreamRequest,
        AgentSessionConfig,
        Option<PathBuf>,
        Option<CancellationToken>,
        bool,
    ) {
        (
            self.message,
            self.stream_request,
            self.session_config,
            self.working_directory,
            self.cancel_token,
            self.emitted_any,
        )
    }
}

pub trait RuntimeReplyBackend<E> {
    fn uses_pinned_provider(&self) -> bool;

    fn provider_handle(&self) -> Option<&RuntimeReplyProviderHandle>;

    fn start_reply_stream<'a>(
        &'a self,
        start_request: RuntimeReplyStartRequest,
    ) -> BoxFuture<'a, RuntimeReplyStartResult<'a, E>>;
}

#[cfg(test)]
mod tests;
