#[cfg(test)]
use crate::turn_context_configuration::to_aster_turn_context;
use crate::turn_context_configuration::{to_agent_turn_context, AgentTurnContext};

pub(crate) fn current_agent_turn_context() -> Option<AgentTurnContext> {
    aster::session_context::current_turn_context().map(to_agent_turn_context)
}

#[cfg(test)]
pub(crate) async fn with_agent_turn_context<F>(
    turn_context: Option<AgentTurnContext>,
    future: F,
) -> F::Output
where
    F: std::future::Future,
{
    aster::session_context::with_turn_context(turn_context.map(to_aster_turn_context), future).await
}
