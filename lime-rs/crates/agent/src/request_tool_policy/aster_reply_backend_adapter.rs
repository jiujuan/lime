use super::aster_reply_message_adapter::lower_aster_reply_message;
use super::aster_reply_stream_adapter::project_aster_reply_stream;
use super::runtime_turn_event;
use crate::credential_bridge::{CompatReplyProvider, ConfiguredReplyProvider};
use crate::model_request_policy::{
    native_tool_policy_disallowed_tool_names, native_tool_policy_from_turn_context,
};
use crate::protocol::AgentEvent as RuntimeAgentEvent;
use crate::runtime_store_aster_adapter::AsterThreadRuntimeStore;
use crate::session_config_adapter::to_aster_session_config;
use agent_runtime::reply_backend::{
    RuntimeReplyBackend, RuntimeReplyBackendRunPath, RuntimeReplyBackendStart,
};
use agent_runtime::reply_host::{
    RuntimeReplyStartRequest, RuntimeReplyStartResult, RuntimeReplyStream,
};
use aster::Agent;
use futures::future::BoxFuture;
use model_provider::provider_stream::{RuntimeReplyProviderHandle, RuntimeReplyStreamRequest};
use std::path::PathBuf;
use std::sync::Arc;
use thread_store::runtime_snapshot::RuntimeTurnStatusRecord;
use tokio_util::sync::CancellationToken;

pub(super) struct AsterReplyBackend<'a> {
    agent: &'a Agent,
    provider: Option<ConfiguredReplyProvider>,
}

impl<'a> AsterReplyBackend<'a> {
    pub(super) fn new(agent: &'a Agent) -> Self {
        Self {
            agent,
            provider: None,
        }
    }

    pub(super) fn with_reply_provider(agent: &'a Agent, provider: ConfiguredReplyProvider) -> Self {
        Self {
            agent,
            provider: Some(provider),
        }
    }

    pub(super) fn agent(&self) -> &Agent {
        self.agent
    }
}

impl<'backend> RuntimeReplyBackend<RuntimeAgentEvent> for AsterReplyBackend<'backend> {
    fn uses_pinned_provider(&self) -> bool {
        self.provider.is_some()
    }

    fn provider_handle(&self) -> Option<&RuntimeReplyProviderHandle> {
        self.provider
            .as_ref()
            .map(ConfiguredReplyProvider::runtime_handle)
    }

    fn start_reply_stream<'a>(
        &'a self,
        start_request: RuntimeReplyStartRequest,
    ) -> BoxFuture<'a, RuntimeReplyStartResult<'a, RuntimeAgentEvent>> {
        let agent = self.agent();
        let provider = self.provider.as_ref();
        Box::pin(start_aster_reply_stream(agent, provider, start_request))
    }
}

pub(super) async fn start_aster_reply_stream<'a>(
    agent: &'a Agent,
    provider: Option<&'a ConfiguredReplyProvider>,
    start_request: RuntimeReplyStartRequest,
) -> RuntimeReplyStartResult<'a, RuntimeAgentEvent> {
    let backend_start = RuntimeReplyBackendStart::from_start_request(start_request);
    let trace = backend_start.trace();
    tracing::debug!(
        provider_backend = ?trace.provider_backend,
        provider_name = ?trace.provider_name,
        model_name = ?trace.model_name,
        use_responses_lite = ?trace.use_responses_lite,
        reasoning_context = ?trace.reasoning_context,
        parallel_tool_calls = ?trace.parallel_tool_calls,
        requires_responses_lite_header = ?trace.requires_responses_lite_header,
        input_kind = ?trace.input_kind,
        message_chars = trace.message_chars,
        "[AgentRuntime][ReplyPolicy] prepared provider reply stream request"
    );
    let native_policy =
        native_tool_policy_from_turn_context(backend_start.session_config().turn_context.as_ref());
    let backend_run = match backend_start.prepare_run(
        provider.map(ConfiguredReplyProvider::runtime_handle),
        native_tool_policy_disallowed_tool_names(native_policy.as_ref()),
    ) {
        Ok(backend_run) => backend_run,
        Err(error) => {
            if let Some(issue) = error.provider_wire_support_issue() {
                tracing::warn!(
                    provider_backend = ?issue.provider_backend,
                    provider_name = ?issue.provider_name,
                    model_name = ?issue.model_name,
                    use_responses_lite = issue.wire_shape.use_responses_lite,
                    reasoning_context = ?issue.wire_shape.reasoning_context,
                    headers = ?issue.wire_shape.headers,
                    "[AgentRuntime][ReplyPolicy] provider backend cannot safely apply Responses Lite request policy"
                );
            }
            return Err(error.into_start_error());
        }
    };
    let session_preparation = backend_run.session_preparation();
    if session_preparation.provider_wire_shape_failed() {
        tracing::warn!(
            "[AgentRuntime][ReplyPolicy] provider request wire shape 序列化失败，已跳过 metadata 注入"
        );
    }
    let outcome = backend_run.outcome();
    let (message, path, stream_request, session_config, working_directory, cancel_token, _) =
        backend_run.into_parts();
    let runtime_store = agent.thread_runtime_store();
    let input_text = non_empty_input_text(message.concat_text());
    let initial_turn_id = match runtime_turn_event::ensure_current_turn(
        runtime_store.clone(),
        &session_config,
        input_text,
        working_directory.as_deref(),
    )
    .await
    {
        Ok(turn_id) => turn_id,
        Err(error) => {
            tracing::warn!(
                error = %error,
                "[AgentRuntime][ReplyPolicy] failed to ensure current runtime turn before Aster reply stream"
            );
            None
        }
    };
    let compat_provider = match path {
        RuntimeReplyBackendRunPath::Default => match agent.provider().await {
            Ok(provider) => CompatReplyProvider::from_aster_provider(provider),
            Err(error) => {
                complete_start_error_turn(
                    runtime_store.clone(),
                    initial_turn_id.as_deref(),
                    error.to_string(),
                )
                .await;
                return outcome.finish_stream(Err(error));
            }
        },
        RuntimeReplyBackendRunPath::Provider(_) => match provider {
            Some(provider) => provider.clone().into_compat_provider(),
            None => {
                let error = anyhow::anyhow!("Provider reply path requires a configured provider");
                complete_start_error_turn(
                    runtime_store.clone(),
                    initial_turn_id.as_deref(),
                    error.to_string(),
                )
                .await;
                return outcome.finish_stream(Err(error));
            }
        },
    };
    let request = AsterReplyBackendRequest::from_current(
        message,
        stream_request,
        session_config,
        working_directory,
        cancel_token,
    );
    let stream_result = run_aster_reply_backend(
        agent,
        compat_provider,
        runtime_store.clone(),
        initial_turn_id.clone(),
        request,
    )
    .await;
    if let Err(error) = &stream_result {
        complete_start_error_turn(runtime_store, initial_turn_id.as_deref(), error.to_string())
            .await;
    }
    outcome.finish_stream(stream_result)
}

fn non_empty_input_text(input_text: String) -> Option<String> {
    let input_text = input_text.trim();
    (!input_text.is_empty()).then(|| input_text.to_string())
}

async fn complete_start_error_turn(
    runtime_store: Arc<AsterThreadRuntimeStore>,
    turn_id: Option<&str>,
    error_message: String,
) {
    let Some(turn_id) = turn_id else {
        return;
    };
    if let Err(error) = runtime_turn_event::complete_aster_turn(
        runtime_store,
        turn_id,
        RuntimeTurnStatusRecord::Failed,
        Some(error_message),
    )
    .await
    {
        tracing::warn!(
            turn_id = %turn_id,
            error = %error,
            "[AgentRuntime][ReplyPolicy] failed to mark start-error runtime turn as failed"
        );
    }
}

struct AsterReplyBackendRequest {
    user_message: aster::Message,
    stream_request: RuntimeReplyStreamRequest,
    session_config: aster::SessionConfig,
    working_directory: Option<PathBuf>,
    cancel_token: Option<CancellationToken>,
}

impl AsterReplyBackendRequest {
    fn from_current(
        message: agent_runtime::reply_message::RuntimeReplyMessage,
        stream_request: RuntimeReplyStreamRequest,
        session_config: agent_runtime::session_config::AgentSessionConfig,
        working_directory: Option<PathBuf>,
        cancel_token: Option<CancellationToken>,
    ) -> Self {
        Self {
            user_message: lower_aster_reply_message(message),
            stream_request,
            session_config: to_aster_session_config(session_config),
            working_directory,
            cancel_token,
        }
    }
}

async fn run_aster_reply_backend<'a>(
    agent: &'a Agent,
    provider: CompatReplyProvider,
    runtime_store: Arc<AsterThreadRuntimeStore>,
    initial_turn_id: Option<String>,
    request: AsterReplyBackendRequest,
) -> Result<RuntimeReplyStream<'a, RuntimeAgentEvent>, anyhow::Error> {
    let stream = agent
        .reply_with_provider(
            request.user_message,
            request.session_config,
            request.cancel_token.clone(),
            provider.into_aster_provider(),
        )
        .await?;

    Ok(project_aster_reply_stream(
        stream,
        request.stream_request,
        runtime_store,
        request.working_directory,
        request.cancel_token,
        initial_turn_id,
    ))
}
