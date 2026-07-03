use crate::turn_context_configuration::AgentTurnContext;
use crate::SessionConfigBuilder;

pub type AgentSessionConfig = aster::agents::SessionConfig;

pub struct AgentSessionConfigurationRequest {
    pub session_id: String,
    pub thread_id: String,
    pub turn_id: String,
    pub system_prompt: Option<String>,
    pub turn_context: Option<AgentTurnContext>,
    pub include_context_trace: bool,
}

pub fn build_agent_session_config(request: AgentSessionConfigurationRequest) -> AgentSessionConfig {
    let mut builder = SessionConfigBuilder::new(request.session_id)
        .thread_id(request.thread_id)
        .turn_id(request.turn_id)
        .include_context_trace(request.include_context_trace);
    if let Some(system_prompt) = request.system_prompt {
        builder = builder.system_prompt(system_prompt);
    }
    if let Some(turn_context) = request.turn_context {
        builder = builder.turn_context(turn_context);
    }
    builder.build()
}
