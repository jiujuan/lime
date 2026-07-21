use crate::current_provider_turn::stream_current_provider_turn;
use crate::protocol::AgentEvent as RuntimeAgentEvent;
use crate::provider_configuration::{
    configure_model_route_provider_for_session_with_provider_and_credential_ref,
    ModelRouteProviderConfiguration, SessionProviderConfig,
};
use crate::request_tool_policy::{ReplyAttemptError, RequestToolPolicy, StreamReplyExecution};
use crate::runtime_state::AgentRuntimeState;
use crate::AgentSessionConfig;
use agent_runtime::reply_input::RuntimeReplyInput;
use agent_runtime::session_loop::RuntimeSessionInputHandle;
use lime_core::database::DbConnection;
use model_provider::current_client::CurrentProviderMessage;
use tokio_util::sync::CancellationToken;
use tool_runtime::agent_control::AgentControlGatewayHandle;

pub struct AgentTurnExecutionRequest<'a> {
    pub session_id: &'a str,
    pub input: RuntimeReplyInput,
    pub initial_messages: Vec<CurrentProviderMessage>,
    pub session_config: AgentSessionConfig,
    pub request_tool_policy: &'a RequestToolPolicy,
    pub provider_configuration: Option<AgentTurnProviderConfiguration<'a>>,
    pub agent_control_gateway: Option<AgentControlGatewayHandle>,
    pub pending_input: Option<RuntimeSessionInputHandle>,
    pub cancellation_token: Option<CancellationToken>,
}

pub struct AgentTurnProviderConfiguration<'a> {
    pub db: &'a DbConnection,
    pub session_id: &'a str,
    pub route_configuration: ModelRouteProviderConfiguration,
    pub credential_ref: Option<&'a str>,
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
            configure_model_route_provider_for_session_with_provider_and_credential_ref(
                agent_state,
                provider_configuration.db,
                provider_configuration.session_id,
                provider_configuration.route_configuration,
                provider_configuration.credential_ref,
            )
            .await
            .map_err(|message| ReplyAttemptError::new(message, false))?,
        )
    } else {
        None
    };
    let owns_cancel_token = request.cancellation_token.is_none();
    let cancel_token = match request.cancellation_token {
        Some(token) => token,
        None => agent_state.create_cancel_token(request.session_id).await,
    };
    let working_directory = request
        .session_config
        .turn_context
        .as_ref()
        .and_then(|context| context.cwd.clone());
    let session_config = request.session_config;
    let provider = match configured_provider.as_ref() {
        Some(configured_provider) => Ok(configured_provider.provider()),
        None => agent_state
            .provider_for_session(request.session_id)
            .await
            .ok_or_else(|| ReplyAttemptError::new("Provider is not configured", false)),
    };
    let provider = match provider {
        Ok(provider) => provider,
        Err(error) => {
            if owns_cancel_token {
                agent_state.remove_cancel_token(request.session_id).await;
            }
            return Err(error);
        }
    };
    let execution = stream_current_provider_turn(
        agent_state,
        provider,
        request.input,
        request.initial_messages,
        working_directory.as_deref(),
        session_config,
        Some(cancel_token),
        request.pending_input,
        request.request_tool_policy,
        request.agent_control_gateway,
        on_event,
    )
    .await;
    if owns_cancel_token {
        agent_state.remove_cancel_token(request.session_id).await;
    }
    let stream = execution?;
    Ok(AgentTurnExecution {
        stream,
        provider_config: configured_provider.map(|configured| configured.into_config()),
    })
}
