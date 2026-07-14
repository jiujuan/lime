use super::{AgentEvent, ToolItemLifecycleContext};
use agent_protocol::{
    ItemId, ItemStatus, SubAgentActivityKind, ThreadId, ThreadItem, ThreadItemPayload, TurnId,
};
use serde_json::json;
use tool_runtime::agent_control::{
    SubAgentProjectionActivity, FOLLOWUP_TASK_TOOL_NAME, INTERRUPT_AGENT_TOOL_NAME,
    SEND_MESSAGE_TOOL_NAME, SPAWN_AGENT_TOOL_NAME,
};
use tool_runtime::tool_lifecycle::{ToolLifecycleEvent, ToolLifecyclePhase};

pub(crate) struct CanonicalSubAgentActivity {
    turn_id: String,
    call_id: String,
    child_thread_id: ThreadId,
    activity: SubAgentActivityKind,
    detail: Option<String>,
}

impl CanonicalSubAgentActivity {
    pub(crate) fn from_tool_event(event: &ToolLifecycleEvent) -> Option<Self> {
        if event.phase != ToolLifecyclePhase::Completed {
            return None;
        }
        let output = event.output.as_ref()?;
        if !output.success || output.agent_control_projection_facts.len() != 1 {
            return None;
        }
        let fact = output.agent_control_projection_facts.first()?;
        if fact.target_thread_id.as_str().trim().is_empty() {
            return None;
        }
        let expected_activity = match event.tool_name.as_str() {
            SPAWN_AGENT_TOOL_NAME => SubAgentProjectionActivity::Started,
            SEND_MESSAGE_TOOL_NAME | FOLLOWUP_TASK_TOOL_NAME => {
                SubAgentProjectionActivity::Interacted
            }
            INTERRUPT_AGENT_TOOL_NAME => SubAgentProjectionActivity::Interrupted,
            _ => return None,
        };
        if fact.activity != expected_activity {
            return None;
        }
        let activity = match fact.activity {
            SubAgentProjectionActivity::Started => SubAgentActivityKind::Started,
            SubAgentProjectionActivity::Interacted => SubAgentActivityKind::Interacted,
            SubAgentProjectionActivity::Interrupted => SubAgentActivityKind::Interrupted,
        };
        Some(Self {
            turn_id: event.turn_id.clone(),
            call_id: event.call_id.clone(),
            child_thread_id: fact.target_thread_id.clone(),
            activity,
            detail: fact.detail.clone(),
        })
    }

    pub(crate) fn into_event(self, context: ToolItemLifecycleContext) -> AgentEvent {
        let item = ThreadItem {
            session_id: context.session_id,
            thread_id: context.thread_id,
            turn_id: TurnId::new(self.turn_id),
            item_id: ItemId::new(format!("{}:subagent", self.call_id)),
            sequence: context.sequence,
            ordinal: context.ordinal,
            created_at_ms: context.created_at_ms,
            updated_at_ms: context.updated_at_ms,
            completed_at_ms: Some(context.updated_at_ms),
            kind: agent_protocol::ItemKind::SubAgent,
            status: ItemStatus::Completed,
            payload: ThreadItemPayload::SubAgent {
                child_thread_id: self.child_thread_id,
                activity: self.activity,
                detail: self.detail,
            },
            metadata: json!({
                "source": "agent_control_projection_fact",
                "tool_call_id": self.call_id,
            }),
        };
        AgentEvent::ItemCompleted { item }
    }
}
