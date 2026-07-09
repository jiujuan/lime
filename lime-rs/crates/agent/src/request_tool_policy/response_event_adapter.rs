use crate::protocol::AgentEvent as RuntimeAgentEvent;
use agent_runtime::reply_stream::{
    project_runtime_event_as_response_event, RuntimeReplyResponseEvent,
    RuntimeReplyResponseEventHints, RuntimeReplyResponseEventMapper, RuntimeReplyResponseItem,
    RuntimeReplyResponseItemPayload, RuntimeReplyStreamEvent,
};
use lime_core::database::dao::agent_timeline::{AgentThreadItem, AgentThreadItemPayload};

pub(super) fn response_stream_events_from_runtime_events(
    hints: RuntimeReplyResponseEventHints,
    runtime_events: Vec<RuntimeAgentEvent>,
) -> Vec<RuntimeReplyStreamEvent<RuntimeAgentEvent>> {
    let mut mapper = RuntimeAgentResponseEventMapper;
    runtime_events
        .into_iter()
        .map(|event| project_runtime_event_as_response_event(&mut mapper, event, &hints))
        .collect()
}

struct RuntimeAgentResponseEventMapper;

impl RuntimeReplyResponseEventMapper<RuntimeAgentEvent> for RuntimeAgentResponseEventMapper {
    fn map_response_event(
        &mut self,
        event: &RuntimeAgentEvent,
        hints: &RuntimeReplyResponseEventHints,
    ) -> Option<RuntimeReplyResponseEvent> {
        match event {
            RuntimeAgentEvent::TextDelta { text } => {
                Some(RuntimeReplyResponseEvent::TextDelta { text: text.clone() })
            }
            RuntimeAgentEvent::ThinkingDelta { text } => {
                Some(RuntimeReplyResponseEvent::ReasoningDelta {
                    item_id: hints.item_id.clone()?,
                    delta: text.clone(),
                })
            }
            RuntimeAgentEvent::ToolInputDelta {
                tool_id,
                tool_name,
                delta,
                accumulated_arguments,
                provider,
            } => Some(RuntimeReplyResponseEvent::ToolCallInputDelta {
                call_id: tool_id.clone(),
                tool_name: tool_name.clone(),
                delta: delta.clone(),
                accumulated_arguments: accumulated_arguments.clone(),
                provider: provider.clone(),
            }),
            RuntimeAgentEvent::ItemStarted { item } => response_item_from_agent_thread_item(item)
                .map(|item| RuntimeReplyResponseEvent::OutputItemAdded { item }),
            RuntimeAgentEvent::ItemCompleted { item } => response_item_from_agent_thread_item(item)
                .map(|item| RuntimeReplyResponseEvent::OutputItemDone { item }),
            _ => None,
        }
    }
}

fn response_item_from_agent_thread_item(
    item: &AgentThreadItem,
) -> Option<RuntimeReplyResponseItem> {
    let payload = match &item.payload {
        AgentThreadItemPayload::AgentMessage { text, phase } => {
            RuntimeReplyResponseItemPayload::AgentMessage {
                text: text.clone(),
                phase: phase.clone(),
            }
        }
        AgentThreadItemPayload::Reasoning {
            text,
            summary,
            metadata,
        } => RuntimeReplyResponseItemPayload::Reasoning {
            text: text.clone(),
            summary: summary.clone(),
            metadata: metadata.clone(),
        },
        AgentThreadItemPayload::ToolCall {
            tool_name,
            arguments,
            output,
            success,
            error,
            metadata,
        } => RuntimeReplyResponseItemPayload::ToolCall {
            tool_name: tool_name.clone(),
            arguments: arguments.clone(),
            output: output.clone(),
            success: *success,
            error: error.clone(),
            metadata: metadata.clone(),
        },
        _ => return None,
    };

    Some(RuntimeReplyResponseItem::new(
        item.id.clone(),
        item.payload.kind(),
        payload,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use lime_core::database::dao::agent_timeline::{
        AgentThreadItem, AgentThreadItemPayload, AgentThreadItemStatus,
    };
    use serde_json::json;

    fn tool_item(id: &str) -> AgentThreadItem {
        AgentThreadItem {
            id: id.to_string(),
            thread_id: "thread-1".to_string(),
            turn_id: "turn-1".to_string(),
            sequence: 7,
            status: AgentThreadItemStatus::InProgress,
            started_at: "2026-07-10T00:00:00Z".to_string(),
            completed_at: None,
            updated_at: "2026-07-10T00:00:00Z".to_string(),
            payload: AgentThreadItemPayload::ToolCall {
                tool_name: "apply_patch".to_string(),
                arguments: Some(json!({ "patch": "*** Begin Patch" })),
                output: None,
                success: None,
                error: None,
                metadata: None,
            },
        }
    }

    fn warning_item(id: &str) -> AgentThreadItem {
        AgentThreadItem {
            id: id.to_string(),
            thread_id: "thread-1".to_string(),
            turn_id: "turn-1".to_string(),
            sequence: 8,
            status: AgentThreadItemStatus::InProgress,
            started_at: "2026-07-10T00:00:00Z".to_string(),
            completed_at: None,
            updated_at: "2026-07-10T00:00:00Z".to_string(),
            payload: AgentThreadItemPayload::Warning {
                message: "keep runtime warning".to_string(),
                code: Some("warn".to_string()),
            },
        }
    }

    #[test]
    fn runtime_tool_item_started_projects_as_output_item_added_response_event() {
        let events = response_stream_events_from_runtime_events(
            RuntimeReplyResponseEventHints::new(),
            vec![RuntimeAgentEvent::ItemStarted {
                item: tool_item("call-3"),
            }],
        );

        let [RuntimeReplyStreamEvent::ResponseEvent(RuntimeReplyResponseEvent::OutputItemAdded {
            item,
        })] = events.as_slice()
        else {
            panic!("expected output item added response event");
        };
        assert_eq!(item.item_id, "call-3");
        assert_eq!(item.item_kind, "tool_call");
        let RuntimeReplyResponseItemPayload::ToolCall {
            tool_name,
            arguments,
            ..
        } = &item.payload
        else {
            panic!("expected tool call payload");
        };
        assert_eq!(tool_name, "apply_patch");
        assert_eq!(
            arguments.as_ref().and_then(|value| value.get("patch")),
            Some(&json!("*** Begin Patch"))
        );
    }

    #[test]
    fn runtime_tool_item_completed_projects_as_output_item_done_response_event() {
        let events = response_stream_events_from_runtime_events(
            RuntimeReplyResponseEventHints::new(),
            vec![RuntimeAgentEvent::ItemCompleted {
                item: tool_item("call-4"),
            }],
        );

        assert!(matches!(
            events.as_slice(),
            [RuntimeReplyStreamEvent::ResponseEvent(RuntimeReplyResponseEvent::OutputItemDone {
                item,
            })] if item.item_id == "call-4" && item.item_kind == "tool_call"
        ));
    }

    #[test]
    fn unsupported_item_payload_stays_runtime_event() {
        let events = response_stream_events_from_runtime_events(
            RuntimeReplyResponseEventHints::new(),
            vec![RuntimeAgentEvent::ItemStarted {
                item: warning_item("warn-1"),
            }],
        );

        assert!(matches!(
            events.as_slice(),
            [RuntimeReplyStreamEvent::Event(RuntimeAgentEvent::ItemStarted { item })]
                if item.id == "warn-1"
        ));
    }
}
