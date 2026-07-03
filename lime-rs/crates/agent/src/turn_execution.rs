use crate::aster_state::AsterAgentState;
use crate::protocol::AgentEvent as RuntimeAgentEvent;
use crate::request_tool_policy::{
    stream_reply_with_policy, ReplyAttemptError, RequestToolPolicy, StreamReplyExecution,
};

pub struct AgentTurnExecutionRequest<'a> {
    pub session_id: &'a str,
    pub input_text: &'a str,
    pub session_config: aster::agents::SessionConfig,
    pub request_tool_policy: &'a RequestToolPolicy,
}

pub async fn run_agent_turn_with_policy<F>(
    agent_state: &AsterAgentState,
    request: AgentTurnExecutionRequest<'_>,
    on_event: F,
) -> Result<StreamReplyExecution, ReplyAttemptError>
where
    F: FnMut(&RuntimeAgentEvent),
{
    let agent_arc = agent_state.get_agent_arc();
    let agent_guard = agent_arc.read().await;
    let agent = agent_guard.as_ref().ok_or_else(|| ReplyAttemptError {
        message: "Lime agent runtime failed to initialize Aster agent".to_string(),
        emitted_any: false,
    })?;
    let cancel_token = agent_state.create_cancel_token(request.session_id).await;
    let execution = stream_reply_with_policy(
        agent,
        request.input_text,
        None,
        request.session_config,
        Some(cancel_token),
        request.request_tool_policy,
        on_event,
    )
    .await;
    agent_state.remove_cancel_token(request.session_id).await;
    execution
}
