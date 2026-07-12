use crate::turn_context_configuration::AgentTurnContext;

pub(crate) fn current_agent_turn_context() -> Option<AgentTurnContext> {
    agent_runtime::runtime_scope::current_turn_context()
}

#[cfg(test)]
pub(crate) async fn with_agent_turn_context<F>(
    turn_context: Option<AgentTurnContext>,
    future: F,
) -> F::Output
where
    F: std::future::Future,
{
    agent_runtime::runtime_scope::with_turn_context(turn_context, future).await
}
