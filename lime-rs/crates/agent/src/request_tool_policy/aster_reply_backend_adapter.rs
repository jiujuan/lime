use super::provider_reply_exit_source::ReplyExitSource;
use crate::credential_bridge::ConfiguredReplyProvider;
use crate::model_request_policy::{
    native_tool_policy_disallowed_tool_names, native_tool_policy_from_turn_context,
};
use crate::protocol::AgentEvent as RuntimeAgentEvent;
use agent_runtime::reply_backend::{
    run_reply_source, RuntimeReplyBackend, RuntimeReplyBackendStart,
};
use agent_runtime::reply_host::{RuntimeReplyStartRequest, RuntimeReplyStartResult};
use aster::agents::Agent;
use futures::future::BoxFuture;
use model_provider::provider_stream::RuntimeReplyProviderHandle;

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
    let source = ReplyExitSource::new(agent, provider);
    let (outcome, stream_request, stream_result) = run_reply_source(source, backend_run).await;

    drop(stream_request);
    outcome.finish_stream(stream_result)
}
