use crate::turn_context_configuration::AgentTurnContext;

pub struct AgentSessionConfigurationRequest {
    pub session_id: String,
    pub thread_id: String,
    pub turn_id: String,
    pub system_prompt: Option<String>,
    pub turn_context: Option<AgentTurnContext>,
    pub include_context_trace: bool,
}

#[derive(Debug, Clone)]
pub struct AgentSessionConfig {
    pub id: String,
    pub thread_id: Option<String>,
    pub turn_id: Option<String>,
    pub schedule_id: Option<String>,
    pub max_turns: Option<u32>,
    pub system_prompt: Option<String>,
    pub system_prompt_override: Option<bool>,
    pub include_context_trace: Option<bool>,
    pub turn_context: Option<AgentTurnContext>,
}

pub fn build_agent_session_config(request: AgentSessionConfigurationRequest) -> AgentSessionConfig {
    AgentSessionConfig {
        id: request.session_id,
        thread_id: Some(request.thread_id),
        turn_id: Some(request.turn_id),
        schedule_id: None,
        max_turns: None,
        system_prompt: request.system_prompt,
        system_prompt_override: Some(true),
        include_context_trace: Some(request.include_context_trace),
        turn_context: request.turn_context,
    }
}

impl AgentSessionConfig {
    pub(crate) fn from_builder_parts(
        id: String,
        thread_id: Option<String>,
        turn_id: Option<String>,
        schedule_id: Option<String>,
        max_turns: Option<u32>,
        system_prompt: Option<String>,
        system_prompt_override: Option<bool>,
        include_context_trace: Option<bool>,
        turn_context: Option<AgentTurnContext>,
    ) -> Self {
        Self {
            id,
            thread_id,
            turn_id,
            schedule_id,
            max_turns,
            system_prompt,
            system_prompt_override,
            include_context_trace,
            turn_context,
        }
    }
}
