//! current provider reply facade。
//!
//! 所有 provider sampling、tool transcript 和请求 lowering 均委托给
//! `current_provider_turn` 与 `agent-runtime::provider_turn`。本模块只保留历史调用点
//! 所需的窄接口，不包含第二套 reply loop，也不依赖 Agent。

use super::{ReplyAttemptError, ReplyInput, RequestToolPolicy, StreamReplyExecution};
use crate::current_provider_turn::stream_current_provider_turn;
use crate::protocol::AgentEvent;
use crate::provider_configuration::ConfiguredSessionProvider;
use crate::runtime_state::AgentRuntimeState;
use agent_runtime::session_config::AgentSessionConfig;
use std::path::Path;
use tokio_util::sync::CancellationToken;

pub(crate) async fn stream_runtime_reply_with_policy<F>(
    state: &AgentRuntimeState,
    text: &str,
    working_directory: Option<&Path>,
    session_config: AgentSessionConfig,
    cancel_token: Option<CancellationToken>,
    policy: &RequestToolPolicy,
    agent_control_gateway: Option<tool_runtime::agent_control::AgentControlGatewayHandle>,
    on_event: F,
) -> Result<StreamReplyExecution, ReplyAttemptError>
where
    F: FnMut(&AgentEvent) + Send,
{
    stream_current(
        state,
        None,
        ReplyInput::text(text),
        working_directory,
        session_config,
        cancel_token,
        policy,
        agent_control_gateway,
        on_event,
    )
    .await
}

pub(crate) async fn stream_runtime_message_reply_with_policy<F>(
    state: &AgentRuntimeState,
    input: ReplyInput,
    working_directory: Option<&Path>,
    session_config: AgentSessionConfig,
    cancel_token: Option<CancellationToken>,
    policy: &RequestToolPolicy,
    on_event: F,
) -> Result<StreamReplyExecution, ReplyAttemptError>
where
    F: FnMut(&AgentEvent) + Send,
{
    stream_current(
        state,
        None,
        input,
        working_directory,
        session_config,
        cancel_token,
        policy,
        None,
        on_event,
    )
    .await
}

pub(crate) async fn stream_runtime_reply_with_configured_provider<F>(
    state: &AgentRuntimeState,
    text: &str,
    working_directory: Option<&Path>,
    session_config: AgentSessionConfig,
    cancel_token: Option<CancellationToken>,
    policy: &RequestToolPolicy,
    configured: &ConfiguredSessionProvider,
    on_event: F,
) -> Result<StreamReplyExecution, ReplyAttemptError>
where
    F: FnMut(&AgentEvent) + Send,
{
    stream_current(
        state,
        Some(configured.provider()),
        ReplyInput::text(text),
        working_directory,
        session_config,
        cancel_token,
        policy,
        None,
        on_event,
    )
    .await
}

pub(crate) async fn stream_runtime_reply_with_configured_provider_for_direct_generation<F>(
    state: &AgentRuntimeState,
    text: &str,
    working_directory: Option<&Path>,
    session_config: AgentSessionConfig,
    cancel_token: Option<CancellationToken>,
    policy: &RequestToolPolicy,
    configured: &ConfiguredSessionProvider,
    on_event: F,
) -> Result<StreamReplyExecution, ReplyAttemptError>
where
    F: FnMut(&AgentEvent) + Send,
{
    stream_runtime_reply_with_configured_provider(
        state,
        text,
        working_directory,
        session_config,
        cancel_token,
        policy,
        configured,
        on_event,
    )
    .await
}

async fn stream_current<F>(
    state: &AgentRuntimeState,
    provider: Option<crate::credential_bridge::ConfiguredReplyProvider>,
    input: ReplyInput,
    working_directory: Option<&Path>,
    session_config: AgentSessionConfig,
    cancel_token: Option<CancellationToken>,
    policy: &RequestToolPolicy,
    agent_control_gateway: Option<tool_runtime::agent_control::AgentControlGatewayHandle>,
    on_event: F,
) -> Result<StreamReplyExecution, ReplyAttemptError>
where
    F: FnMut(&AgentEvent) + Send,
{
    let session_id = session_config.id.clone();
    let provider = match provider {
        Some(provider) => provider,
        None => state
            .provider_for_session(&session_id)
            .await
            .ok_or_else(|| ReplyAttemptError::new("Provider is not configured", false))?,
    };
    stream_current_provider_turn(
        state,
        provider,
        input,
        Vec::new(),
        working_directory,
        session_config,
        cancel_token,
        None,
        policy,
        agent_control_gateway,
        on_event,
    )
    .await
}

pub async fn stream_reply_with_policy<F>(
    state: &AgentRuntimeState,
    text: &str,
    working_directory: Option<&Path>,
    session_config: AgentSessionConfig,
    cancel_token: Option<CancellationToken>,
    policy: &RequestToolPolicy,
    agent_control_gateway: Option<tool_runtime::agent_control::AgentControlGatewayHandle>,
    on_event: F,
) -> Result<StreamReplyExecution, ReplyAttemptError>
where
    F: FnMut(&AgentEvent) + Send,
{
    stream_runtime_reply_with_policy(
        state,
        text,
        working_directory,
        session_config,
        cancel_token,
        policy,
        agent_control_gateway,
        on_event,
    )
    .await
}
