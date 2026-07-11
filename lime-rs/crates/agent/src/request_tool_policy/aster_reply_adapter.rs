use super::aster_reply_backend_adapter::AsterReplyBackend;
use super::aster_reply_message_adapter::cancelled_turn_context_marker_message;
use super::runtime_request_item;
use super::runtime_status_item;
use super::{
    stream_message_reply_with_policy_with_options, ReplyAttemptError, ReplyInput,
    RequestToolPolicy, StreamReplyExecution, StreamReplyPolicyExecutionOptions,
};
use crate::credential_bridge::ConfiguredReplyProvider;
use crate::protocol::{AgentEvent as RuntimeAgentEvent, AgentRuntimeStatus};
use crate::provider_configuration::ConfiguredSessionProvider;
use crate::runtime_state::AgentRuntimeState;
use crate::runtime_store_aster_adapter::AsterThreadRuntimeStore;
use agent_protocol::action_required::ActionRequiredScope as RuntimeActionRequiredScope;
use agent_runtime::reply_host::{RuntimeReplyPolicyHost, RuntimeReplyStreamHost};
use agent_runtime::reply_input::{
    RuntimeActionRequiredResponseInput as ActionRequiredResponseInput,
    RuntimeReplyAttemptInput as ReplyAttemptInput,
};
use agent_runtime::session_config::AgentSessionConfig;
use aster::{Agent, Permission, PermissionConfirmation, PrincipalType};
use futures::future::BoxFuture;
use std::path::Path;
use std::sync::Arc;
use tokio_util::sync::CancellationToken;

pub(super) struct AsterReplyRuntimeHost<'a> {
    backend: AsterReplyBackend<'a>,
    runtime_store: Arc<AsterThreadRuntimeStore>,
}

impl<'a> AsterReplyRuntimeHost<'a> {
    pub(super) fn new(agent: &'a Agent) -> Self {
        Self {
            backend: AsterReplyBackend::new(agent),
            runtime_store: agent.thread_runtime_store(),
        }
    }

    pub(super) fn with_reply_provider(agent: &'a Agent, provider: ConfiguredReplyProvider) -> Self {
        Self {
            backend: AsterReplyBackend::with_reply_provider(agent, provider),
            runtime_store: agent.thread_runtime_store(),
        }
    }

    fn agent(&self) -> &Agent {
        self.backend.agent()
    }

    pub(super) async fn emit_runtime_status<F>(
        &self,
        session_config: &AgentSessionConfig,
        status: AgentRuntimeStatus,
        on_event: &mut F,
    ) where
        F: FnMut(&RuntimeAgentEvent) + Send,
    {
        match runtime_status_item::upsert_runtime_status_item(
            self.runtime_store.clone(),
            session_config,
            &status,
        )
        .await
        {
            Ok(Some(event)) => {
                on_event(&event);
            }
            Ok(None) => {}
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
        persist_cancelled_turn_context_marker(self.agent(), session_id).await;
    }
}

impl<'a> RuntimeReplyStreamHost<RuntimeAgentEvent> for AsterReplyRuntimeHost<'a> {
    type Backend = AsterReplyBackend<'a>;

    fn reply_backend(&self) -> &Self::Backend {
        &self.backend
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
    let response = serde_json::json!({ "confirmed": confirmed });
    if let Err(error) = runtime_request_item::complete_runtime_request_item(
        agent.thread_runtime_store(),
        &request_id,
        Some(response),
    )
    .await
    {
        tracing::warn!(
            request_id = %request_id,
            "[AgentRuntime][RequestItem] 写入 approval completion 失败: {}",
            error
        );
    }
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
    mut on_event: F,
) -> Result<StreamReplyExecution, ReplyAttemptError>
where
    F: FnMut(&RuntimeAgentEvent) + Send,
{
    match runtime_request_item::complete_runtime_request_item(
        agent.thread_runtime_store(),
        &response.request_id,
        Some(response.user_data.clone()),
    )
    .await
    {
        Ok(Some(event)) => on_event(&event),
        Ok(None) => {}
        Err(error) => {
            tracing::warn!(
                request_id = %response.request_id,
                "[AgentRuntime][RequestItem] 写入 request_user_input completion 失败: {}",
                error
            );
        }
    }
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

async fn persist_cancelled_turn_context_marker(agent: &Agent, session_id: &str) {
    let message = cancelled_turn_context_marker_message();
    let Some(store) = agent.session_store() else {
        tracing::warn!(
            "[AgentRuntime][ReplyPolicy] 写入取消上下文标记失败，Agent 未注入 session store: session_id={}",
            session_id
        );
        return;
    };

    let result = store.add_message(session_id, &message).await;
    if let Err(error) = result {
        tracing::warn!(
            "[AgentRuntime][ReplyPolicy] 写入取消上下文标记失败，已降级继续: session_id={}, error={}",
            session_id,
            error
        );
    }
}

#[cfg(test)]
mod tests;
