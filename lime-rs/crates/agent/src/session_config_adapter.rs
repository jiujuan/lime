use crate::turn_context_configuration::to_aster_turn_context;
use agent_runtime::session_config::AgentSessionConfig;

pub(crate) fn to_aster_session_config(config: AgentSessionConfig) -> aster::SessionConfig {
    aster::SessionConfig {
        id: config.id,
        thread_id: config.thread_id,
        turn_id: config.turn_id,
        schedule_id: config.schedule_id,
        max_turns: config.max_turns,
        retry_config: None,
        system_prompt: config.system_prompt,
        system_prompt_override: config.system_prompt_override,
        include_context_trace: config.include_context_trace,
        turn_context: config.turn_context.map(to_aster_turn_context),
    }
}
