use crate::protocol::AgentEvent as RuntimeAgentEvent;
use crate::provider_configuration::{
    configure_model_route_provider_for_session_with_provider, ConfiguredSessionProvider,
    ModelRouteProviderConfiguration, SessionProviderConfig,
};
use crate::request_tool_policy::{
    stream_reply_with_policy, stream_reply_with_policy_and_provider, ReplyAttemptError,
    RequestToolPolicy, StreamReplyExecution,
};
use crate::runtime_state::AgentRuntimeState;
use crate::AgentSessionConfig;
use lime_core::database::DbConnection;

pub struct AgentTurnExecutionRequest<'a> {
    pub session_id: &'a str,
    pub input_text: &'a str,
    pub session_config: AgentSessionConfig,
    pub request_tool_policy: &'a RequestToolPolicy,
    pub provider_configuration: Option<AgentTurnProviderConfiguration<'a>>,
}

pub struct AgentTurnProviderConfiguration<'a> {
    pub db: &'a DbConnection,
    pub session_id: &'a str,
    pub route_configuration: ModelRouteProviderConfiguration,
}

pub struct AgentTurnExecution {
    pub stream: StreamReplyExecution,
    pub provider_config: Option<SessionProviderConfig>,
}

pub async fn run_agent_turn_with_policy<F>(
    agent_state: &AgentRuntimeState,
    request: AgentTurnExecutionRequest<'_>,
    on_event: F,
) -> Result<AgentTurnExecution, ReplyAttemptError>
where
    F: FnMut(&RuntimeAgentEvent),
{
    let configured_provider = if let Some(provider_configuration) = request.provider_configuration {
        Some(
            configure_model_route_provider_for_session_with_provider(
                agent_state,
                provider_configuration.db,
                provider_configuration.session_id,
                provider_configuration.route_configuration,
            )
            .await
            .map_err(|message| ReplyAttemptError {
                message,
                emitted_any: false,
            })?,
        )
    } else {
        None
    };
    let agent_arc = agent_state.get_agent_arc();
    let agent_guard = agent_arc.read().await;
    let agent = agent_guard.as_ref().ok_or_else(|| ReplyAttemptError {
        message: "Lime agent runtime failed to initialize Aster agent".to_string(),
        emitted_any: false,
    })?;
    let cancel_token = agent_state.create_cancel_token(request.session_id).await;
    let session_config = request.session_config;
    let execution = match configured_provider.as_ref() {
        Some(ConfiguredSessionProvider { provider, .. }) => {
            stream_reply_with_policy_and_provider(
                agent,
                request.input_text,
                None,
                session_config,
                Some(cancel_token),
                request.request_tool_policy,
                provider.clone(),
                on_event,
            )
            .await
        }
        None => {
            stream_reply_with_policy(
                agent,
                request.input_text,
                None,
                session_config,
                Some(cancel_token),
                request.request_tool_policy,
                on_event,
            )
            .await
        }
    };
    agent_state.remove_cancel_token(request.session_id).await;
    let stream = execution?;
    Ok(AgentTurnExecution {
        stream,
        provider_config: configured_provider.map(|configured| configured.config),
    })
}
