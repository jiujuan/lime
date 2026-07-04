use std::future::Future;

use crate::turn_context_configuration::{
    to_agent_turn_context, to_aster_turn_context, AgentTurnContext,
};

pub fn current_agent_turn_context() -> Option<AgentTurnContext> {
    aster::session_context::current_turn_context().map(to_agent_turn_context)
}

pub async fn with_agent_turn_context<F>(
    turn_context: Option<AgentTurnContext>,
    future: F,
) -> F::Output
where
    F: Future,
{
    aster::session_context::with_turn_context(turn_context.map(to_aster_turn_context), future).await
}
