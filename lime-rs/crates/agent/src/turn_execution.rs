use crate::current_provider_turn::stream_current_provider_turn;
use crate::protocol::AgentEvent as RuntimeAgentEvent;
use crate::provider_configuration::{
    configure_model_route_provider_for_session_with_provider, ModelRouteProviderConfiguration,
    SessionProviderConfig,
};
use crate::request_tool_policy::{ReplyAttemptError, RequestToolPolicy, StreamReplyExecution};
use crate::runtime_state::AgentRuntimeState;
use crate::AgentSessionConfig;
use agent_runtime::reply_input::RuntimeReplyInput;
use lime_core::database::DbConnection;
use model_provider::current_client::CurrentProviderMessage;
use tool_runtime::agent_control::AgentControlGatewayHandle;

pub struct AgentTurnExecutionRequest<'a> {
    pub session_id: &'a str,
    pub input: RuntimeReplyInput,
    pub initial_messages: Vec<CurrentProviderMessage>,
    pub session_config: AgentSessionConfig,
    pub request_tool_policy: &'a RequestToolPolicy,
    pub provider_configuration: Option<AgentTurnProviderConfiguration<'a>>,
    pub agent_control_gateway: Option<AgentControlGatewayHandle>,
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
    F: FnMut(&RuntimeAgentEvent) + Send,
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
    let cancel_token = agent_state.create_cancel_token(request.session_id).await;
    let session_config = request.session_config;
    let provider = match configured_provider.as_ref() {
        Some(configured_provider) => configured_provider.provider(),
        None => agent_state
            .provider()
            .await
            .ok_or_else(|| ReplyAttemptError {
                message: "Provider is not configured".to_string(),
                emitted_any: false,
            })?,
    };
    let execution = stream_current_provider_turn(
        agent_state,
        provider,
        request.input,
        request.initial_messages,
        None,
        session_config,
        Some(cancel_token),
        request.request_tool_policy,
        request.agent_control_gateway,
        on_event,
    )
    .await;
    agent_state.remove_cancel_token(request.session_id).await;
    let stream = execution?;
    Ok(AgentTurnExecution {
        stream,
        provider_config: configured_provider.map(|configured| configured.into_config()),
    })
}
