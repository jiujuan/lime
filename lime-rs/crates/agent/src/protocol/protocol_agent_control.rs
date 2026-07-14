use super::{AgentEvent, ToolItemLifecycleContext};
use agent_protocol::{
    ItemId, ItemStatus, SubAgentActivityKind, ThreadItem, ThreadItemPayload, TurnId,
};
use serde_json::json;
use tool_runtime::agent_control::{
    SubAgentProjectionActivity, SubAgentProjectionFact, FOLLOWUP_TASK_TOOL_NAME,
    INTERRUPT_AGENT_TOOL_NAME, SEND_MESSAGE_TOOL_NAME, SPAWN_AGENT_TOOL_NAME,
};
use tool_runtime::tool_lifecycle::{ToolLifecycleEvent, ToolLifecyclePhase};

pub(crate) struct CanonicalSubAgentActivity {
    turn_id: String,
    call_id: String,
    tool_name: String,
    fact: SubAgentProjectionFact,
}

impl CanonicalSubAgentActivity {
    pub(crate) fn from_tool_event(event: &ToolLifecycleEvent) -> Option<Self> {
        if event.phase != ToolLifecyclePhase::Completed {
            return None;
        }
        let expected_activity = expected_activity(&event.tool_name)?;
        let output = event.output.as_ref()?;
        if !output.success {
            return None;
        }
        let mut facts = output.agent_control_projection_facts.clone();
        if facts.len() != 1 {
            return None;
        }
        let fact = facts.pop()?;
        if fact.activity != expected_activity || fact.target_thread_id.as_str().trim().is_empty() {
            return None;
        }
        Some(Self {
            turn_id: event.turn_id.clone(),
            call_id: event.call_id.clone(),
            tool_name: event.tool_name.clone(),
            fact,
        })
    }

    pub(crate) fn into_event(self, context: ToolItemLifecycleContext) -> AgentEvent {
        let payload = ThreadItemPayload::SubAgent {
            child_thread_id: self.fact.target_thread_id,
            activity: protocol_activity(self.fact.activity),
            detail: self.fact.detail,
        };
        AgentEvent::ItemCompleted {
            item: ThreadItem {
                session_id: context.session_id,
                thread_id: context.thread_id,
                turn_id: TurnId::new(self.turn_id),
                item_id: ItemId::new(format!("subagent-{}", self.call_id)),
                sequence: context.sequence,
                ordinal: context.ordinal,
                created_at_ms: context.created_at_ms,
                updated_at_ms: context.updated_at_ms,
                completed_at_ms: Some(context.updated_at_ms),
                kind: payload.kind(),
                status: ItemStatus::Completed,
                payload,
                metadata: json!({
                    "source_tool_call_id": self.call_id,
                    "source_tool_name": self.tool_name,
                }),
            },
        }
    }
}

fn expected_activity(tool_name: &str) -> Option<SubAgentProjectionActivity> {
    match tool_name {
        SPAWN_AGENT_TOOL_NAME => Some(SubAgentProjectionActivity::Started),
        SEND_MESSAGE_TOOL_NAME | FOLLOWUP_TASK_TOOL_NAME => {
            Some(SubAgentProjectionActivity::Interacted)
        }
        INTERRUPT_AGENT_TOOL_NAME => Some(SubAgentProjectionActivity::Interrupted),
        _ => None,
    }
}

fn protocol_activity(activity: SubAgentProjectionActivity) -> SubAgentActivityKind {
    match activity {
        SubAgentProjectionActivity::Started => SubAgentActivityKind::Started,
        SubAgentProjectionActivity::Interacted => SubAgentActivityKind::Interacted,
        SubAgentProjectionActivity::Interrupted => SubAgentActivityKind::Interrupted,
    }
}
