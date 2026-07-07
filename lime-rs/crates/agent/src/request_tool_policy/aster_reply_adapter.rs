use super::aster_event_adapter::AsterEventProjector;
use super::{
    stream_message_reply_with_policy_with_options, ReplyAttemptError, ReplyInput,
    RequestToolPolicy, StreamReplyExecution, StreamReplyPolicyExecutionOptions,
    CANCELLED_TURN_CONTEXT_MARKER,
};
use crate::aster_runtime_projection::project_aster_runtime_event_with_turn_context;
use crate::credential_bridge::ConfiguredReplyProvider;
use crate::model_request_policy::{
    native_tool_policy_disallowed_tool_names, native_tool_policy_from_turn_context,
};
use crate::protocol::{AgentEvent as RuntimeAgentEvent, AgentRuntimeStatus};
use crate::provider_configuration::ConfiguredSessionProvider;
use crate::runtime_state::AgentRuntimeState;
use crate::session_config_adapter::to_aster_session_config;
use agent_protocol::action_required::ActionRequiredScope as RuntimeActionRequiredScope;
use agent_runtime::event_stream::EventProjector;
use agent_runtime::reply_host::{
    RuntimeReplyPolicyHost, RuntimeReplyStartError, RuntimeReplyStartRequest,
    RuntimeReplyStartResult, RuntimeReplyStreamHost,
};
use agent_runtime::reply_input::{
    RuntimeActionRequiredResponseInput as ActionRequiredResponseInput,
    RuntimeReplyAttemptInput as ReplyAttemptInput,
};
use agent_runtime::reply_message::{
    RuntimeReplyMessage, RuntimeReplyMessageContent, RuntimeReplyMessageRole,
};
use agent_runtime::reply_session::{
    attach_reply_disallowed_tools, attach_reply_provider_wire_shape,
};
use agent_runtime::reply_stream::RuntimeReplyStreamEvent;
use agent_runtime::session_config::AgentSessionConfig;
use aster::agents::{Agent, AgentEvent as AsterAgentEvent};
use aster::conversation::message::{
    ActionRequired, ActionRequiredData, ActionRequiredScope, Message, MessageContent,
};
use aster::permission::{Permission, PermissionConfirmation, PrincipalType};
use aster::providers::formats::openai_responses::{
    provider_stream_event_notification_payload_from_message,
    PROVIDER_STREAM_EVENT_KIND_SAFETY_BUFFERING,
};
use aster::session::SessionManager;
use futures::future::BoxFuture;
use futures::stream::{BoxStream, StreamExt};
use model_provider::provider_stream::{
    RuntimeProviderBackend, RuntimeReplyProviderHandle, RuntimeReplyProviderStreamEvent,
    RuntimeReplyStreamRequest,
};
use std::path::Path;
use tokio_util::sync::CancellationToken;

pub(super) struct AsterReplyRuntimeHost<'a> {
    agent: &'a Agent,
    provider: Option<ConfiguredReplyProvider>,
}

impl<'a> AsterReplyRuntimeHost<'a> {
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

    pub(super) fn uses_pinned_provider(&self) -> bool {
        self.provider.is_some()
    }

    pub(super) fn provider_handle(&self) -> Option<&RuntimeReplyProviderHandle> {
        self.provider
            .as_ref()
            .map(ConfiguredReplyProvider::runtime_handle)
    }

    pub(super) async fn start_reply_stream(
        &self,
        start_request: RuntimeReplyStartRequest,
    ) -> Result<
        (
            BoxStream<'a, anyhow::Result<RuntimeReplyStreamEvent<RuntimeAgentEvent>>>,
            usize,
        ),
        ReplyAttemptError,
    > {
        start_aster_reply_stream(self.agent, self.provider.as_ref(), start_request).await
    }

    pub(super) async fn emit_runtime_status<F>(
        &self,
        session_config: &AgentSessionConfig,
        status: AgentRuntimeStatus,
        on_event: &mut F,
    ) where
        F: FnMut(&RuntimeAgentEvent) + Send,
    {
        let aster_session_config = to_aster_session_config(session_config.clone());
        match self
            .agent
            .upsert_runtime_status_item(
                &aster_session_config,
                status.phase.clone(),
                status.title.clone(),
                status.detail.clone(),
                status.checkpoints.clone(),
            )
            .await
        {
            Ok(agent_event) => {
                for event in project_aster_runtime_event_with_turn_context(
                    agent_event,
                    session_config.turn_context.as_ref(),
                ) {
                    on_event(&event);
                }
            }
            Err(error) => {
                tracing::warn!(
                    "[AgentRuntime][RuntimeStatus] 写入 runtime item 失败，降级仅发 transient 事件: {}",
                    error
                );
            }
        }

        let event = RuntimeAgentEvent::RuntimeStatus { status };
        on_event(&event);
    }

    pub(super) async fn persist_cancelled_turn_context_marker(&self, session_id: &str) {
        persist_cancelled_turn_context_marker(self.agent, session_id).await;
    }
}

impl RuntimeReplyStreamHost<RuntimeAgentEvent> for AsterReplyRuntimeHost<'_> {
    fn uses_pinned_provider(&self) -> bool {
        AsterReplyRuntimeHost::uses_pinned_provider(self)
    }

    fn provider_handle(&self) -> Option<&RuntimeReplyProviderHandle> {
        AsterReplyRuntimeHost::provider_handle(self)
    }

    fn start_reply_stream<'a>(
        &'a self,
        start_request: RuntimeReplyStartRequest,
    ) -> BoxFuture<'a, RuntimeReplyStartResult<'a, RuntimeAgentEvent>> {
        Box::pin(async move {
            AsterReplyRuntimeHost::start_reply_stream(self, start_request)
                .await
                .map_err(|error| RuntimeReplyStartError::new(error.message, error.emitted_any))
        })
    }
}

impl RuntimeReplyPolicyHost<RuntimeAgentEvent, AgentRuntimeStatus> for AsterReplyRuntimeHost<'_> {
    fn emit_runtime_status<'a, F>(
        &'a self,
        session_config: &'a AgentSessionConfig,
        status: AgentRuntimeStatus,
        on_event: &'a mut F,
    ) -> BoxFuture<'a, ()>
    where
        F: FnMut(&RuntimeAgentEvent) + Send + 'a,
    {
        Box::pin(async move {
            AsterReplyRuntimeHost::emit_runtime_status(self, session_config, status, on_event)
                .await;
        })
    }

    fn persist_cancelled_turn_context_marker<'a>(
        &'a self,
        session_id: &'a str,
    ) -> BoxFuture<'a, ()> {
        Box::pin(async move {
            AsterReplyRuntimeHost::persist_cancelled_turn_context_marker(self, session_id).await;
        })
    }
}

pub(crate) fn action_required_response_input(
    request_id: impl Into<String>,
    user_data: serde_json::Value,
    scope: Option<RuntimeActionRequiredScope>,
) -> ActionRequiredResponseInput {
    ActionRequiredResponseInput::new(request_id, user_data, scope)
}

pub(crate) async fn stream_runtime_reply_with_policy<F>(
    agent_state: &AgentRuntimeState,
    message_text: &str,
    working_directory: Option<&Path>,
    session_config: AgentSessionConfig,
    cancel_token: Option<CancellationToken>,
    request_tool_policy: &RequestToolPolicy,
    on_event: F,
) -> Result<StreamReplyExecution, ReplyAttemptError>
where
    F: FnMut(&RuntimeAgentEvent) + Send,
{
    let agent_arc = agent_state.get_agent_arc();
    let agent_guard = agent_arc.read().await;
    let agent = agent_guard
        .as_ref()
        .ok_or_else(runtime_not_initialized_error)?;
    stream_reply_with_policy(
        agent,
        message_text,
        working_directory,
        session_config,
        cancel_token,
        request_tool_policy,
        on_event,
    )
    .await
}

pub(crate) async fn stream_runtime_message_reply_with_policy<F>(
    agent_state: &AgentRuntimeState,
    input: ReplyInput,
    working_directory: Option<&Path>,
    session_config: AgentSessionConfig,
    cancel_token: Option<CancellationToken>,
    request_tool_policy: &RequestToolPolicy,
    on_event: F,
) -> Result<StreamReplyExecution, ReplyAttemptError>
where
    F: FnMut(&RuntimeAgentEvent) + Send,
{
    let agent_arc = agent_state.get_agent_arc();
    let agent_guard = agent_arc.read().await;
    let agent = agent_guard
        .as_ref()
        .ok_or_else(runtime_not_initialized_error)?;
    stream_message_reply_with_policy(
        agent,
        input,
        working_directory,
        session_config,
        cancel_token,
        request_tool_policy,
        on_event,
    )
    .await
}

pub(crate) async fn stream_runtime_reply_with_configured_provider<F>(
    agent_state: &AgentRuntimeState,
    message_text: &str,
    working_directory: Option<&Path>,
    session_config: AgentSessionConfig,
    cancel_token: Option<CancellationToken>,
    request_tool_policy: &RequestToolPolicy,
    configured_provider: &ConfiguredSessionProvider,
    on_event: F,
) -> Result<StreamReplyExecution, ReplyAttemptError>
where
    F: FnMut(&RuntimeAgentEvent) + Send,
{
    let agent_arc = agent_state.get_agent_arc();
    let agent_guard = agent_arc.read().await;
    let agent = agent_guard
        .as_ref()
        .ok_or_else(runtime_not_initialized_error)?;
    stream_reply_with_policy_and_configured_provider(
        agent,
        message_text,
        working_directory,
        session_config,
        cancel_token,
        request_tool_policy,
        configured_provider,
        on_event,
    )
    .await
}

pub(crate) async fn stream_runtime_reply_with_configured_provider_for_direct_generation<F>(
    agent_state: &AgentRuntimeState,
    message_text: &str,
    working_directory: Option<&Path>,
    session_config: AgentSessionConfig,
    cancel_token: Option<CancellationToken>,
    request_tool_policy: &RequestToolPolicy,
    configured_provider: &ConfiguredSessionProvider,
    on_event: F,
) -> Result<StreamReplyExecution, ReplyAttemptError>
where
    F: FnMut(&RuntimeAgentEvent) + Send,
{
    let agent_arc = agent_state.get_agent_arc();
    let agent_guard = agent_arc.read().await;
    let agent = agent_guard
        .as_ref()
        .ok_or_else(runtime_not_initialized_error)?;
    stream_reply_with_policy_and_configured_provider_for_direct_generation(
        agent,
        message_text,
        working_directory,
        session_config,
        cancel_token,
        request_tool_policy,
        configured_provider,
        on_event,
    )
    .await
}

pub(crate) async fn stream_runtime_action_required_response_with_policy<F>(
    agent_state: &AgentRuntimeState,
    response: ActionRequiredResponseInput,
    working_directory: Option<&Path>,
    session_config: AgentSessionConfig,
    cancel_token: Option<CancellationToken>,
    request_tool_policy: &RequestToolPolicy,
    on_event: F,
) -> Result<StreamReplyExecution, ReplyAttemptError>
where
    F: FnMut(&RuntimeAgentEvent) + Send,
{
    let agent_arc = agent_state.get_agent_arc();
    let agent_guard = agent_arc.read().await;
    let agent = agent_guard
        .as_ref()
        .ok_or_else(runtime_not_initialized_error)?;
    stream_action_required_response_with_policy(
        agent,
        response,
        working_directory,
        session_config,
        cancel_token,
        request_tool_policy,
        on_event,
    )
    .await
}

pub(crate) async fn submit_runtime_tool_action_confirmation(
    agent_state: &AgentRuntimeState,
    request_id: String,
    confirmed: bool,
) -> Result<(), ReplyAttemptError> {
    let agent_arc = agent_state.get_agent_arc();
    let agent_guard = agent_arc.read().await;
    let agent = agent_guard
        .as_ref()
        .ok_or_else(runtime_not_initialized_error)?;
    submit_tool_action_confirmation(agent, request_id, confirmed).await;
    Ok(())
}

fn runtime_not_initialized_error() -> ReplyAttemptError {
    ReplyAttemptError {
        message: "Agent runtime is not initialized".to_string(),
        emitted_any: false,
    }
}

/// 统一流式执行器：执行可选诊断 preflight + reply 流，并复用统一的策略校验。
pub async fn stream_reply_with_policy<F>(
    agent: &Agent,
    message_text: &str,
    working_directory: Option<&Path>,
    session_config: AgentSessionConfig,
    cancel_token: Option<CancellationToken>,
    request_tool_policy: &RequestToolPolicy,
    on_event: F,
) -> Result<StreamReplyExecution, ReplyAttemptError>
where
    F: FnMut(&RuntimeAgentEvent) + Send,
{
    stream_message_reply_with_policy(
        agent,
        ReplyInput::text(message_text),
        working_directory,
        session_config,
        cancel_token,
        request_tool_policy,
        on_event,
    )
    .await
}

pub(crate) async fn stream_message_reply_with_policy<F>(
    agent: &Agent,
    input: ReplyInput,
    working_directory: Option<&Path>,
    session_config: AgentSessionConfig,
    cancel_token: Option<CancellationToken>,
    request_tool_policy: &RequestToolPolicy,
    on_event: F,
) -> Result<StreamReplyExecution, ReplyAttemptError>
where
    F: FnMut(&RuntimeAgentEvent) + Send,
{
    let reply_host = AsterReplyRuntimeHost::new(agent);
    stream_message_reply_with_policy_with_options(
        &reply_host,
        input.into(),
        working_directory,
        session_config,
        cancel_token,
        request_tool_policy,
        on_event,
        StreamReplyPolicyExecutionOptions::from_env(),
    )
    .await
}

async fn stream_action_required_response_with_policy<F>(
    agent: &Agent,
    response: ActionRequiredResponseInput,
    working_directory: Option<&Path>,
    session_config: AgentSessionConfig,
    cancel_token: Option<CancellationToken>,
    request_tool_policy: &RequestToolPolicy,
    on_event: F,
) -> Result<StreamReplyExecution, ReplyAttemptError>
where
    F: FnMut(&RuntimeAgentEvent) + Send,
{
    let reply_host = AsterReplyRuntimeHost::new(agent);
    stream_message_reply_with_policy_with_options(
        &reply_host,
        ReplyAttemptInput::ActionRequiredResponse(response),
        working_directory,
        session_config,
        cancel_token,
        request_tool_policy,
        on_event,
        StreamReplyPolicyExecutionOptions::from_env(),
    )
    .await
}

async fn stream_reply_with_policy_and_configured_provider<F>(
    agent: &Agent,
    message_text: &str,
    working_directory: Option<&Path>,
    session_config: AgentSessionConfig,
    cancel_token: Option<CancellationToken>,
    request_tool_policy: &RequestToolPolicy,
    configured_provider: &ConfiguredSessionProvider,
    on_event: F,
) -> Result<StreamReplyExecution, ReplyAttemptError>
where
    F: FnMut(&RuntimeAgentEvent) + Send,
{
    let reply_host =
        AsterReplyRuntimeHost::with_reply_provider(agent, configured_provider.reply_provider());
    stream_message_reply_with_policy_with_options(
        &reply_host,
        ReplyInput::text(message_text).into(),
        working_directory,
        session_config,
        cancel_token,
        request_tool_policy,
        on_event,
        StreamReplyPolicyExecutionOptions::from_env(),
    )
    .await
}

async fn stream_reply_with_policy_and_configured_provider_for_direct_generation<F>(
    agent: &Agent,
    message_text: &str,
    working_directory: Option<&Path>,
    session_config: AgentSessionConfig,
    cancel_token: Option<CancellationToken>,
    request_tool_policy: &RequestToolPolicy,
    configured_provider: &ConfiguredSessionProvider,
    on_event: F,
) -> Result<StreamReplyExecution, ReplyAttemptError>
where
    F: FnMut(&RuntimeAgentEvent) + Send,
{
    let reply_host =
        AsterReplyRuntimeHost::with_reply_provider(agent, configured_provider.reply_provider());
    stream_message_reply_with_policy_with_options(
        &reply_host,
        ReplyInput::text(message_text).into(),
        working_directory,
        session_config,
        cancel_token,
        request_tool_policy,
        on_event,
        StreamReplyPolicyExecutionOptions::direct_generation(),
    )
    .await
}

async fn start_aster_reply_stream<'a>(
    agent: &'a Agent,
    provider: Option<&ConfiguredReplyProvider>,
    start_request: RuntimeReplyStartRequest,
) -> Result<
    (
        BoxStream<'a, anyhow::Result<RuntimeReplyStreamEvent<RuntimeAgentEvent>>>,
        usize,
    ),
    ReplyAttemptError,
> {
    let RuntimeReplyStartRequest {
        request,
        mut session_config,
        cancel_token,
        emitted_any,
    } = start_request;
    let (runtime_message, stream_request) = request.into_parts();
    let message_chars = stream_request.message_chars;
    let user_message = lower_aster_reply_message(runtime_message);
    tracing::debug!(
        provider_backend = ?stream_request.provider_backend(),
        provider_name = ?stream_request.provider_name(),
        model_name = ?stream_request.model_name(),
        use_responses_lite = ?stream_request.model_request_policy.as_ref().map(|policy| policy.use_responses_lite()),
        reasoning_context = ?stream_request.model_request_policy.as_ref().and_then(|policy| policy.reasoning_context()),
        parallel_tool_calls = ?stream_request.model_request_policy.as_ref().and_then(|policy| policy.parallel_tool_calls()),
        requires_responses_lite_header = ?stream_request.model_request_policy.as_ref().map(|policy| policy.requires_responses_lite_header()),
        input_kind = ?stream_request.input_kind,
        message_chars = stream_request.message_chars,
        "[AgentRuntime][ReplyPolicy] prepared provider reply stream request"
    );
    if let Some(error) = unsupported_aster_compat_wire_shape_error(&stream_request, emitted_any) {
        return Err(error);
    }
    attach_native_tool_policy_scope(&mut session_config);
    attach_provider_request_wire_shape(&mut session_config, &stream_request);
    let aster_session_config = to_aster_session_config(session_config);
    let stream_result = match provider {
        Some(provider) => {
            provider
                .stream_reply_with_agent(
                    &stream_request,
                    agent,
                    user_message,
                    aster_session_config,
                    cancel_token,
                )
                .await
        }
        None => {
            agent
                .reply(user_message, aster_session_config, cancel_token)
                .await
        }
    };

    stream_result
        .map(|stream| {
            (
                project_aster_reply_stream(stream, stream_request),
                message_chars,
            )
        })
        .map_err(|error| ReplyAttemptError {
            message: format!("Agent error: {error}"),
            emitted_any,
        })
}

fn attach_native_tool_policy_scope(session_config: &mut AgentSessionConfig) {
    let native_policy = native_tool_policy_from_turn_context(session_config.turn_context.as_ref());
    let disallowed_tools = native_tool_policy_disallowed_tool_names(native_policy.as_ref());
    attach_reply_disallowed_tools(session_config, disallowed_tools);
}

fn attach_provider_request_wire_shape(
    session_config: &mut AgentSessionConfig,
    stream_request: &RuntimeReplyStreamRequest,
) {
    if stream_request.model_request_policy.is_none() {
        return;
    }
    if !attach_reply_provider_wire_shape(session_config, stream_request) {
        tracing::warn!(
            "[AgentRuntime][ReplyPolicy] provider request wire shape 序列化失败，已跳过 metadata 注入"
        );
    }
}

fn unsupported_aster_compat_wire_shape_error(
    stream_request: &RuntimeReplyStreamRequest,
    emitted_any: bool,
) -> Option<ReplyAttemptError> {
    let wire_shape = stream_request.provider_request_wire_shape();
    if !wire_shape.requires_responses_lite_wire_support() {
        return None;
    }
    if stream_request.provider_backend() == Some(RuntimeProviderBackend::Current) {
        return None;
    }
    if aster_compat_provider_supports_responses_lite_wire(stream_request) {
        return None;
    }

    tracing::warn!(
        provider_backend = ?stream_request.provider_backend(),
        provider_name = ?stream_request.provider_name(),
        model_name = ?stream_request.model_name(),
        use_responses_lite = wire_shape.use_responses_lite,
        reasoning_context = ?wire_shape.reasoning_context,
        headers = ?wire_shape.headers,
        "[AgentRuntime][ReplyPolicy] Aster compat backend cannot safely apply Responses Lite request policy"
    );
    Some(ReplyAttemptError {
        message: "Provider request policy requires Responses Lite wire support, but the current Aster compat backend does not apply the required header/reasoning payload yet; refusing to stream instead of silently dropping the policy.".to_string(),
        emitted_any,
    })
}

fn aster_compat_provider_supports_responses_lite_wire(
    stream_request: &RuntimeReplyStreamRequest,
) -> bool {
    let Some(provider) = stream_request.provider.as_ref() else {
        return false;
    };
    provider.backend == RuntimeProviderBackend::AsterCompat
        && provider.identity.provider_name == "openai"
        && provider
            .identity
            .protocol
            .as_ref()
            .is_some_and(model_provider::ModelProviderProtocol::uses_responses_api)
}

fn project_aster_reply_stream<'a>(
    stream: BoxStream<'a, anyhow::Result<AsterAgentEvent>>,
    stream_request: RuntimeReplyStreamRequest,
) -> BoxStream<'a, anyhow::Result<RuntimeReplyStreamEvent<RuntimeAgentEvent>>> {
    Box::pin(async_stream::try_stream! {
        let mut stream = stream;
        let mut runtime_event_projector = AsterEventProjector::new();
        while let Some(event_result) = stream.next().await {
            let agent_event = event_result?;
            if let AsterAgentEvent::Message(message) = &agent_event {
                if let Some(provider_event) =
                    provider_stream_event_from_aster_message(&stream_request, message)
                {
                    yield RuntimeReplyStreamEvent::ProviderStreamEvent(provider_event);
                    continue;
                }
            }
            if let Some(provider_error) = extract_inline_agent_provider_error(&agent_event) {
                yield RuntimeReplyStreamEvent::SuppressedInlineProviderError(provider_error);
                continue;
            }

            for runtime_event in runtime_event_projector.project(agent_event) {
                yield RuntimeReplyStreamEvent::Event(runtime_event);
            }
        }
    })
}

fn provider_stream_event_from_aster_message(
    stream_request: &RuntimeReplyStreamRequest,
    message: &Message,
) -> Option<RuntimeReplyProviderStreamEvent> {
    let payload = provider_stream_event_notification_payload_from_message(message)?;
    let event_kind = payload
        .get("eventKind")
        .and_then(serde_json::Value::as_str)?;
    match event_kind {
        PROVIDER_STREAM_EVENT_KIND_SAFETY_BUFFERING => {
            let response_event = payload.get("responseEvent")?;
            let headers = provider_stream_event_headers(&payload);
            RuntimeReplyProviderStreamEvent::safety_buffering_from_response_event(
                stream_request,
                response_event,
                headers
                    .iter()
                    .map(|(name, value)| (name.as_str(), value.as_str())),
            )
        }
        _ => None,
    }
}

fn provider_stream_event_headers(payload: &serde_json::Value) -> Vec<(String, String)> {
    payload
        .get("headers")
        .and_then(serde_json::Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|header| {
            let name = header.get("name").and_then(serde_json::Value::as_str)?;
            let value = header.get("value").and_then(serde_json::Value::as_str)?;
            Some((name.to_string(), value.to_string()))
        })
        .collect()
}

fn lower_aster_reply_message(message: RuntimeReplyMessage) -> Message {
    let mut aster_message = match message.role {
        RuntimeReplyMessageRole::User => Message::user(),
    };

    for content in message.content {
        aster_message = match content {
            RuntimeReplyMessageContent::Text(text) => aster_message.with_text(text),
            RuntimeReplyMessageContent::Image { data, media_type } => {
                aster_message.with_image(data, media_type)
            }
            RuntimeReplyMessageContent::ActionRequiredResponse {
                request_id,
                user_data,
                scope,
            } => aster_message.with_content(build_aster_action_required_response_content(
                request_id, user_data, scope,
            )),
        };
    }

    if message.agent_only {
        aster_message = aster_message.agent_only();
    }
    aster_message
}

fn build_aster_action_required_response_content(
    request_id: String,
    user_data: serde_json::Value,
    scope: Option<RuntimeActionRequiredScope>,
) -> MessageContent {
    MessageContent::ActionRequired(ActionRequired {
        data: ActionRequiredData::ElicitationResponse {
            id: request_id,
            user_data,
        },
        scope: scope.and_then(to_aster_action_required_scope),
    })
}

fn to_aster_action_required_scope(
    scope: RuntimeActionRequiredScope,
) -> Option<ActionRequiredScope> {
    if scope.session_id.is_none() && scope.thread_id.is_none() && scope.turn_id.is_none() {
        return None;
    }

    Some(ActionRequiredScope {
        session_id: scope.session_id,
        thread_id: scope.thread_id,
        turn_id: scope.turn_id,
    })
}

async fn submit_tool_action_confirmation(
    agent: &Agent,
    request_id: impl Into<String>,
    confirmed: bool,
) {
    let permission = if confirmed {
        Permission::AllowOnce
    } else {
        Permission::DenyOnce
    };
    let confirmation = PermissionConfirmation {
        principal_type: PrincipalType::Tool,
        permission,
    };

    agent
        .handle_confirmation(request_id.into(), confirmation)
        .await;
}

fn cancelled_turn_context_marker_message() -> Message {
    Message::assistant()
        .with_text(CANCELLED_TURN_CONTEXT_MARKER)
        .agent_only()
}

async fn persist_cancelled_turn_context_marker(agent: &Agent, session_id: &str) {
    let message = cancelled_turn_context_marker_message();
    let result = if let Some(store) = agent.session_store() {
        store.add_message(session_id, &message).await
    } else {
        SessionManager::add_message(session_id, &message).await
    };

    if let Err(error) = result {
        tracing::warn!(
            "[AgentRuntime][ReplyPolicy] 写入取消上下文标记失败，已降级继续: session_id={}, error={}",
            session_id,
            error
        );
    }
}

fn extract_inline_agent_provider_error(event: &AsterAgentEvent) -> Option<String> {
    let AsterAgentEvent::Message(message) = event else {
        return None;
    };
    let text = message.as_concat_text();
    let text = text.trim();
    if text.is_empty() {
        return None;
    }
    if !text.contains("Ran into this error:") {
        return None;
    }
    if !text.contains("Please retry if you think this is a transient or recoverable error.") {
        return None;
    }

    let after_prefix = text.split_once("Ran into this error:")?.1.trim();
    let detail = after_prefix
        .split_once("\n\nPlease retry if you think this is a transient or recoverable error.")
        .map(|(left, _)| left.trim())
        .unwrap_or(after_prefix)
        .trim_end_matches('.');

    if detail.is_empty() {
        return Some("Agent provider execution failed".to_string());
    }

    Some(format!("Agent provider execution failed: {detail}"))
}

#[cfg(test)]
mod tests;
