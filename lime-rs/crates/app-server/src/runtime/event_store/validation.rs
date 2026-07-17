use super::{is_approval_session_cache_auto_resolved, should_include_in_validation_context};
use crate::agent_ui_sequence_verifier::AgentEventSequenceValidator;
use crate::runtime::tool_lifecycle::ToolLifecycleValidator;
use app_server_protocol::AgentEvent;

pub(super) struct EventValidationContext {
    events: Vec<AgentEvent>,
    sequence: AgentEventSequenceValidator,
    tool_lifecycle: ToolLifecycleValidator,
}

impl EventValidationContext {
    pub(super) fn from_events(
        existing_events: &[AgentEvent],
        session_id: &str,
        turn_id: Option<&str>,
    ) -> Self {
        let events = existing_events
            .iter()
            .filter(|event| {
                event.turn_id.as_deref() == turn_id
                    && should_include_in_validation_context(event.event_type.as_str())
            })
            .cloned()
            .collect::<Vec<_>>();
        let sequence = AgentEventSequenceValidator::from_events(&events, session_id, turn_id);
        let tool_lifecycle = ToolLifecycleValidator::from_events(&events, session_id, turn_id);
        Self {
            events,
            sequence,
            tool_lifecycle,
        }
    }

    pub(super) fn events(&self) -> &[AgentEvent] {
        &self.events
    }

    pub(super) fn validate_and_observe(
        &mut self,
        event: &AgentEvent,
        validate_sequence: bool,
        validate_tool_lifecycle: bool,
    ) -> Result<(), String> {
        let include = should_include_in_validation_context(event.event_type.as_str());
        if validate_sequence {
            if is_approval_session_cache_auto_resolved(event) {
                self.sequence.observe_existing(event);
            } else {
                self.sequence.validate_and_observe(event)?;
            }
        } else if include {
            self.sequence.observe_existing(event);
        }
        if validate_tool_lifecycle {
            self.tool_lifecycle.validate_and_observe(event)?;
        }
        if include {
            self.events.push(event.clone());
        }
        Ok(())
    }
}
