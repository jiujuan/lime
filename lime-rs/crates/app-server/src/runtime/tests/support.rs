mod backends;
mod capability_fixture;
mod evidence_provider;
mod knowledge_executor;
mod session_data_source;

use crate::RuntimeEvent;
use agent_protocol::{
    ItemId, ItemStatus, SessionId, ThreadId, ThreadItem, ThreadItemPayload, ToolOutput, TurnId,
};
use serde_json::json;

pub(super) use backends::*;
pub(super) use capability_fixture::*;
pub(super) use evidence_provider::*;
pub(super) use knowledge_executor::*;
pub(super) use session_data_source::*;

pub(super) fn canonical_tool_started_event(
    session_id: &str,
    thread_id: &str,
    turn_id: &str,
    call_id: &str,
    tool_name: &str,
) -> RuntimeEvent {
    canonical_tool_event(
        session_id,
        thread_id,
        turn_id,
        call_id,
        tool_name,
        ItemStatus::InProgress,
        None,
    )
}

pub(super) fn canonical_tool_completed_event(
    session_id: &str,
    thread_id: &str,
    turn_id: &str,
    call_id: &str,
    tool_name: &str,
    output: &str,
) -> RuntimeEvent {
    canonical_tool_event(
        session_id,
        thread_id,
        turn_id,
        call_id,
        tool_name,
        ItemStatus::Completed,
        Some(ToolOutput {
            text: Some(output.to_string()),
            structured_content: None,
            error: None,
            duration_ms: None,
            truncated: false,
            output_ref: None,
        }),
    )
}

fn canonical_tool_event(
    session_id: &str,
    thread_id: &str,
    turn_id: &str,
    call_id: &str,
    tool_name: &str,
    status: ItemStatus,
    output: Option<ToolOutput>,
) -> RuntimeEvent {
    let payload = ThreadItemPayload::Tool {
        call_id: call_id.to_string(),
        name: tool_name.to_string(),
        arguments: Vec::new(),
        output,
    };
    let completed_at_ms = status.is_terminal().then_some(2);
    let event_type = if status.is_terminal() {
        "item.completed"
    } else {
        "item.started"
    };
    RuntimeEvent::new(
        event_type,
        json!({
            "item": ThreadItem {
                session_id: SessionId::new(session_id),
                thread_id: ThreadId::new(thread_id),
                turn_id: TurnId::new(turn_id),
                item_id: ItemId::new(format!("item_{call_id}")),
                sequence: 1,
                ordinal: 1,
                created_at_ms: 1,
                updated_at_ms: completed_at_ms.unwrap_or(1),
                completed_at_ms,
                kind: payload.kind(),
                status,
                payload,
                metadata: json!({}),
            }
        }),
    )
}
