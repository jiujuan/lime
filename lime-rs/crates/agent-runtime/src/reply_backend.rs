//! Reply backend 的 current execution contract。
//!
//! 该模块描述 Turn reply backend 如何消费已 materialize 的 current start request，
//! 不绑定 Aster `Agent::reply`、provider trait 或事件 source。

use crate::reply_host::{
    RuntimeReplyStartError, RuntimeReplyStartRequest, RuntimeReplyStartResult, RuntimeReplyStream,
};
use crate::reply_message::RuntimeReplyMessage;
use crate::reply_session::{attach_reply_disallowed_tools, attach_reply_provider_wire_shape};
use crate::session_config::AgentSessionConfig;
use futures::future::BoxFuture;
use model_provider::provider_stream::{
    RuntimeReplyProviderHandle, RuntimeReplyProviderSourceBackend,
    RuntimeReplyProviderSourceBackendCall, RuntimeReplyProviderStreamStart,
    RuntimeReplyProviderStreamTrace, RuntimeReplyProviderWireSupportIssue,
    RuntimeReplyStreamRequest,
};
use tokio_util::sync::CancellationToken;

pub struct RuntimeReplyBackendStart {
    message: RuntimeReplyMessage,
    stream_request: RuntimeReplyStreamRequest,
    session_config: AgentSessionConfig,
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

#[derive(Debug)]
pub struct RuntimeReplyDefaultCall<M, C> {
    message: M,
    stream_request: RuntimeReplyStreamRequest,
    session_config: C,
    cancel_token: Option<CancellationToken>,
}

pub type RuntimeReplyDefaultSourceCall =
    RuntimeReplyDefaultCall<RuntimeReplyMessage, AgentSessionConfig>;

#[derive(Debug)]
pub struct RuntimeReplyProviderCall<M, C> {
    provider_start: RuntimeReplyProviderStreamStart,
    message: M,
    session_config: C,
    cancel_token: Option<CancellationToken>,
}

#[derive(Debug)]
pub struct RuntimeReplyProviderSourceRequest<M, C> {
    message: M,
    stream_request: RuntimeReplyStreamRequest,
    session_config: C,
    cancel_token: Option<CancellationToken>,
}

pub type RuntimeReplyProviderSourceBackendRequest =
    RuntimeReplyProviderSourceRequest<RuntimeReplyMessage, AgentSessionConfig>;

pub type RuntimeReplyProviderSourceRunCall =
    RuntimeReplyProviderSourceBackendCall<RuntimeReplyProviderSourceExecution>;

pub type RuntimeReplyProviderSourceCall =
    RuntimeReplyProviderCall<RuntimeReplyMessage, AgentSessionConfig>;

#[derive(Debug)]
pub struct RuntimeReplyProviderSourceExecution {
    request: RuntimeReplyProviderSourceBackendRequest,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuntimeReplyProviderSourceBindingError {
    message: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RuntimeReplyProviderSourceRunError<E> {
    Binding(RuntimeReplyProviderSourceBindingError),
    Source(E),
}

#[derive(Debug)]
pub enum RuntimeReplySourceCall<M, C> {
    Default(RuntimeReplyDefaultCall<M, C>),
    Provider(RuntimeReplyProviderCall<M, C>),
}

pub type RuntimeReplySourceRun = RuntimeReplySourceCall<RuntimeReplyMessage, AgentSessionConfig>;

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
        Option<CancellationToken>,
        bool,
    ) {
        (
            self.message,
            self.path,
            self.stream_request,
            self.session_config,
            self.cancel_token,
            self.emitted_any,
        )
    }
}

impl RuntimeReplyDefaultSourceCall {
    pub fn new(
        message: RuntimeReplyMessage,
        stream_request: RuntimeReplyStreamRequest,
        session_config: AgentSessionConfig,
        cancel_token: Option<CancellationToken>,
    ) -> Self {
        Self {
            message,
            stream_request,
            session_config,
            cancel_token,
        }
    }
}

impl<M, C> RuntimeReplyDefaultCall<M, C> {
    pub fn stream_request(&self) -> &RuntimeReplyStreamRequest {
        &self.stream_request
    }

    pub fn into_parts(self) -> (M, RuntimeReplyStreamRequest, C, Option<CancellationToken>) {
        (
            self.message,
            self.stream_request,
            self.session_config,
            self.cancel_token,
        )
    }

    pub fn into_source_request(self) -> RuntimeReplyProviderSourceRequest<M, C> {
        RuntimeReplyProviderSourceRequest {
            message: self.message,
            stream_request: self.stream_request,
            session_config: self.session_config,
            cancel_token: self.cancel_token,
        }
    }
}

impl RuntimeReplyProviderSourceCall {
    pub fn new(
        provider_start: RuntimeReplyProviderStreamStart,
        message: RuntimeReplyMessage,
        session_config: AgentSessionConfig,
        cancel_token: Option<CancellationToken>,
    ) -> Self {
        Self {
            provider_start,
            message,
            session_config,
            cancel_token,
        }
    }
}

impl<M, C> RuntimeReplyProviderCall<M, C> {
    pub fn provider_start(&self) -> &RuntimeReplyProviderStreamStart {
        &self.provider_start
    }

    pub fn trace(&self) -> RuntimeReplyProviderStreamTrace<'_> {
        self.provider_start.trace()
    }

    pub fn required_provider<'provider, P>(
        &self,
        provider: Option<&'provider P>,
    ) -> Result<&'provider P, RuntimeReplyProviderSourceBindingError> {
        provider
            .ok_or_else(|| RuntimeReplyProviderSourceBindingError::missing_provider(self.trace()))
    }

    pub fn into_source_request(self) -> RuntimeReplyProviderSourceRequest<M, C> {
        let stream_request = self.provider_start.stream_request().clone();
        RuntimeReplyProviderSourceRequest {
            message: self.message,
            stream_request,
            session_config: self.session_config,
            cancel_token: self.cancel_token,
        }
    }
}

impl<M, C> RuntimeReplyProviderSourceRequest<M, C> {
    pub fn stream_request(&self) -> &RuntimeReplyStreamRequest {
        &self.stream_request
    }

    pub fn into_parts(self) -> (M, RuntimeReplyStreamRequest, C, Option<CancellationToken>) {
        (
            self.message,
            self.stream_request,
            self.session_config,
            self.cancel_token,
        )
    }

    pub fn into_backend_call(self) -> RuntimeReplyProviderSourceBackendCall<Self> {
        RuntimeReplyProviderSourceBackendCall::new(self)
    }
}

impl RuntimeReplyProviderSourceBindingError {
    fn missing_provider(trace: RuntimeReplyProviderStreamTrace<'_>) -> Self {
        Self {
            message: format!(
                "Provider source path requires configured provider for session {}: provider={}/{}",
                trace.session_id,
                trace.provider_name.unwrap_or("<missing>"),
                trace.model_name.unwrap_or("<missing>")
            ),
        }
    }

    pub fn message(&self) -> &str {
        &self.message
    }
}

impl std::fmt::Display for RuntimeReplyProviderSourceBindingError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for RuntimeReplyProviderSourceBindingError {}

impl RuntimeReplyProviderSourceExecution {
    pub fn from_source_request(request: RuntimeReplyProviderSourceBackendRequest) -> Self {
        Self { request }
    }

    pub fn from_run_call(call: RuntimeReplyProviderSourceRunCall) -> Self {
        call.into_source_request()
    }

    pub fn into_backend_call(self) -> RuntimeReplyProviderSourceRunCall {
        RuntimeReplyProviderSourceBackendCall::new(self)
    }

    pub fn message(&self) -> &RuntimeReplyMessage {
        &self.request.message
    }

    pub fn session_config(&self) -> &AgentSessionConfig {
        &self.request.session_config
    }

    pub fn stream_request(&self) -> &RuntimeReplyStreamRequest {
        &self.request.stream_request
    }

    pub fn into_parts(
        self,
    ) -> (
        RuntimeReplyMessage,
        RuntimeReplyStreamRequest,
        AgentSessionConfig,
        Option<CancellationToken>,
    ) {
        self.request.into_parts()
    }
}

impl<E: std::fmt::Display> std::fmt::Display for RuntimeReplyProviderSourceRunError<E> {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Binding(error) => error.fmt(formatter),
            Self::Source(error) => error.fmt(formatter),
        }
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
            cancel_token,
            emitted_any,
        } = start_request;
        let (message, stream_request) = request.into_parts();

        Self {
            message,
            stream_request,
            session_config,
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
        let (message, stream_request, session_config, cancel_token, emitted_any) =
            self.into_parts();

        Ok(RuntimeReplyBackendRun {
            message,
            stream_request,
            session_config,
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
        Option<CancellationToken>,
        bool,
    ) {
        (
            self.message,
            self.stream_request,
            self.session_config,
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

pub trait RuntimeReplySource {
    type Stream<'a>
    where
        Self: 'a;
    type Error: std::fmt::Display;

    fn run<'a>(
        self,
        call: RuntimeReplySourceRun,
    ) -> BoxFuture<'a, Result<Self::Stream<'a>, Self::Error>>
    where
        Self: 'a;
}

pub trait RuntimeReplySourceExecutor<M, C> {
    type Stream<'a>
    where
        Self: 'a;
    type Error: std::fmt::Display;

    fn run_default<'a>(
        self,
        call: RuntimeReplyDefaultCall<M, C>,
    ) -> BoxFuture<'a, Result<Self::Stream<'a>, Self::Error>>
    where
        Self: 'a;

    fn run_provider<'a>(
        self,
        call: RuntimeReplyProviderCall<M, C>,
    ) -> BoxFuture<'a, Result<Self::Stream<'a>, Self::Error>>
    where
        Self: 'a;
}

impl<M, C> RuntimeReplySourceCall<M, C> {
    pub fn run_with<'a, X>(self, executor: X) -> BoxFuture<'a, Result<X::Stream<'a>, X::Error>>
    where
        X: RuntimeReplySourceExecutor<M, C> + Send + 'a,
        M: Send + 'a,
        C: Send + 'a,
    {
        Box::pin(async move {
            match self {
                RuntimeReplySourceCall::Default(call) => executor.run_default(call).await,
                RuntimeReplySourceCall::Provider(call) => executor.run_provider(call).await,
            }
        })
    }
}

pub fn run_provider_source_backend<'a, P, B, F>(
    call: RuntimeReplyProviderSourceCall,
    provider: Option<&'a P>,
    into_backend: F,
) -> BoxFuture<'a, Result<B::Stream<'a>, RuntimeReplyProviderSourceRunError<B::Error>>>
where
    P: Clone + Send + 'a,
    F: FnOnce(P) -> B + Send + 'a,
    B: RuntimeReplyProviderSourceBackend<RuntimeReplyProviderSourceExecution> + Send + 'a,
    B::Error: 'a,
{
    let provider = match call.required_provider(provider) {
        Ok(provider) => provider.clone(),
        Err(error) => {
            return Box::pin(
                async move { Err(RuntimeReplyProviderSourceRunError::Binding(error)) },
            );
        }
    };
    let source_execution =
        RuntimeReplyProviderSourceExecution::from_source_request(call.into_source_request());

    Box::pin(async move {
        into_backend(provider)
            .stream_reply(source_execution.into_backend_call())
            .await
            .map_err(RuntimeReplyProviderSourceRunError::Source)
    })
}

pub fn run_default_provider_source_backend<'a, P, B, F>(
    call: RuntimeReplyDefaultSourceCall,
    provider: P,
    into_backend: F,
) -> BoxFuture<'a, Result<B::Stream<'a>, B::Error>>
where
    P: Send + 'a,
    F: FnOnce(P) -> B + Send + 'a,
    B: RuntimeReplyProviderSourceBackend<RuntimeReplyProviderSourceExecution> + Send + 'a,
    B::Error: 'a,
{
    let source_execution =
        RuntimeReplyProviderSourceExecution::from_source_request(call.into_source_request());

    Box::pin(async move {
        into_backend(provider)
            .stream_reply(source_execution.into_backend_call())
            .await
    })
}

pub fn run_reply_source<'a, S>(
    source: S,
    run: RuntimeReplyBackendRun,
) -> BoxFuture<
    'a,
    (
        RuntimeReplyBackendRunOutcome,
        RuntimeReplyStreamRequest,
        Result<S::Stream<'a>, S::Error>,
    ),
>
where
    S: RuntimeReplySource + Send + 'a,
    S::Error: 'a,
{
    Box::pin(async move {
        let outcome = run.outcome();
        let (message, path, stream_request, session_config, cancel_token, _) = run.into_parts();
        let call = match path {
            RuntimeReplyBackendRunPath::Default => {
                RuntimeReplySourceCall::Default(RuntimeReplyDefaultSourceCall::new(
                    message,
                    stream_request.clone(),
                    session_config,
                    cancel_token,
                ))
            }
            RuntimeReplyBackendRunPath::Provider(provider_start) => {
                RuntimeReplySourceCall::Provider(RuntimeReplyProviderSourceCall::new(
                    provider_start,
                    message,
                    session_config,
                    cancel_token,
                ))
            }
        };
        let stream_result = source.run(call).await;

        (outcome, stream_request, stream_result)
    })
}

#[cfg(test)]
mod tests;
