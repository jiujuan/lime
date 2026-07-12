use agent_protocol::turn_context::TurnContextOverride as AgentTurnContext;

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

/// 会话配置构建器。
///
/// 该 builder 只生成 Lime current session config；Agent SessionConfig 转换必须留在
/// lime-agent 的 session_config_adapter 兼容边界。
pub struct SessionConfigBuilder {
    id: String,
    thread_id: Option<String>,
    turn_id: Option<String>,
    schedule_id: Option<String>,
    max_turns: Option<u32>,
    system_prompt: Option<String>,
    system_prompt_override: Option<bool>,
    include_context_trace: Option<bool>,
    turn_context: Option<AgentTurnContext>,
}

impl SessionConfigBuilder {
    pub fn new(id: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            thread_id: None,
            turn_id: None,
            schedule_id: None,
            max_turns: None,
            system_prompt: None,
            system_prompt_override: None,
            include_context_trace: None,
            turn_context: None,
        }
    }

    pub fn thread_id(mut self, thread_id: impl Into<String>) -> Self {
        self.thread_id = Some(thread_id.into());
        self
    }

    pub fn turn_id(mut self, turn_id: impl Into<String>) -> Self {
        self.turn_id = Some(turn_id.into());
        self
    }

    pub fn schedule_id(mut self, schedule_id: impl Into<String>) -> Self {
        self.schedule_id = Some(schedule_id.into());
        self
    }

    pub fn max_turns(mut self, turns: u32) -> Self {
        self.max_turns = Some(turns);
        self
    }

    pub fn system_prompt(mut self, prompt: impl Into<String>) -> Self {
        self.system_prompt = Some(prompt.into());
        self
    }

    pub fn system_prompt_override(mut self, enabled: bool) -> Self {
        self.system_prompt_override = Some(enabled);
        self
    }

    pub fn include_context_trace(mut self, include: bool) -> Self {
        self.include_context_trace = Some(include);
        self
    }

    pub fn turn_context(mut self, turn_context: AgentTurnContext) -> Self {
        self.turn_context = Some(turn_context);
        self
    }

    pub fn build(self) -> AgentSessionConfig {
        AgentSessionConfig {
            id: self.id,
            thread_id: self.thread_id,
            turn_id: self.turn_id,
            schedule_id: self.schedule_id,
            max_turns: self.max_turns,
            system_prompt: self.system_prompt,
            system_prompt_override: self.system_prompt_override,
            include_context_trace: self.include_context_trace,
            turn_context: self.turn_context,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_agent_session_config_projects_request() {
        let config = build_agent_session_config(AgentSessionConfigurationRequest {
            session_id: "session-1".to_string(),
            thread_id: "thread-1".to_string(),
            turn_id: "turn-1".to_string(),
            system_prompt: Some("system".to_string()),
            turn_context: None,
            include_context_trace: true,
        });

        assert_eq!(config.id, "session-1");
        assert_eq!(config.thread_id.as_deref(), Some("thread-1"));
        assert_eq!(config.turn_id.as_deref(), Some("turn-1"));
        assert_eq!(config.system_prompt.as_deref(), Some("system"));
        assert_eq!(config.system_prompt_override, Some(true));
        assert_eq!(config.include_context_trace, Some(true));
    }

    #[test]
    fn session_config_builder_preserves_optional_runtime_fields() {
        let config = SessionConfigBuilder::new("session-1")
            .thread_id("thread-1")
            .turn_id("turn-1")
            .schedule_id("schedule-1")
            .max_turns(3)
            .system_prompt("system")
            .system_prompt_override(true)
            .include_context_trace(false)
            .build();

        assert_eq!(config.id, "session-1");
        assert_eq!(config.thread_id.as_deref(), Some("thread-1"));
        assert_eq!(config.turn_id.as_deref(), Some("turn-1"));
        assert_eq!(config.schedule_id.as_deref(), Some("schedule-1"));
        assert_eq!(config.max_turns, Some(3));
        assert_eq!(config.system_prompt.as_deref(), Some("system"));
        assert_eq!(config.system_prompt_override, Some(true));
        assert_eq!(config.include_context_trace, Some(false));
    }
}
