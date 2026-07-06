use super::auto_compaction_projection::AutoCompactionProjectionState;
use crate::aster_runtime_projection::{
    project_aster_auto_compaction_event, project_aster_runtime_event_with_turn_context,
};
use crate::protocol::AgentEvent as RuntimeAgentEvent;
use crate::turn_context_configuration::{to_agent_turn_context, AgentTurnContext};
use aster::agents::AgentEvent as AsterAgentEvent;

pub(super) struct RuntimeEventProjector {
    auto_compaction: AutoCompactionProjectionState,
    active_turn_context: Option<AgentTurnContext>,
}

impl RuntimeEventProjector {
    pub(super) fn new() -> Self {
        Self {
            auto_compaction: AutoCompactionProjectionState,
            active_turn_context: None,
        }
    }

    pub(super) fn project(&mut self, event: AsterAgentEvent) -> Vec<RuntimeAgentEvent> {
        if let AsterAgentEvent::TurnStarted { turn } = &event {
            self.active_turn_context = turn.context_override.clone().map(to_agent_turn_context);
        }

        project_aster_auto_compaction_event(&event)
            .and_then(|event| self.auto_compaction.project_event(&event))
            .unwrap_or_else(|| {
                project_aster_runtime_event_with_turn_context(
                    event,
                    self.active_turn_context.as_ref(),
                )
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use aster::conversation::message::Message;
    use aster::session::{TurnContextOverride, TurnRuntime};
    use std::collections::HashMap;

    #[test]
    fn projector_applies_turn_context_truncation_to_later_tool_response() {
        let mut projector = RuntimeEventProjector::new();
        let turn = TurnRuntime::new(
            "turn-truncate",
            "session-truncate",
            "thread-truncate",
            Some("run mcp tool".to_string()),
            Some(TurnContextOverride {
                metadata: HashMap::from([(
                    "runtime_options".to_string(),
                    serde_json::json!({
                        "harness": {
                            "model_request_policy": {
                                "truncation_policy": {
                                    "mode": "tokens",
                                    "limit": 4
                                }
                            }
                        }
                    }),
                )]),
                ..TurnContextOverride::default()
            }),
        );
        projector.project(AsterAgentEvent::TurnStarted { turn });

        let message = Message::assistant().with_tool_response(
            "tool-mcp-truncated",
            Ok(rmcp::model::CallToolResult {
                content: vec![rmcp::model::Content::text(
                    "alpha beta gamma delta epsilon zeta eta theta iota kappa",
                )],
                structured_content: None,
                meta: None,
                is_error: None,
            }),
        );
        let events = projector.project(AsterAgentEvent::Message(message));

        let tool_end = events
            .iter()
            .find_map(|event| match event {
                RuntimeAgentEvent::ToolEnd { result, .. } => Some(result),
                _ => None,
            })
            .expect("expected tool_end event");
        assert!(tool_end
            .output
            .starts_with("Warning: truncated output (original token count:"));
        assert!(tool_end.output.contains("tokens truncated"));
        assert_eq!(
            tool_end
                .metadata
                .as_ref()
                .and_then(|metadata| metadata.get("source"))
                .and_then(serde_json::Value::as_str),
            Some("legacy_message_tool_response")
        );
    }
}
