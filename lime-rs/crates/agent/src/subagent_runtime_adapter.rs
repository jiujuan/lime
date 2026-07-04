//! Aster subagent runtime adapter.
//!
//! This compat module keeps Aster runtime snapshot / item DTOs out of
//! `subagent_control` and session-store presentation code.

use aster::session::{ItemRuntimePayload, SessionRuntimeSnapshot, TurnRuntime};

use crate::subagent_control::{SubagentLatestTurnProjection, SubagentTurnStatus};

pub(crate) fn project_aster_subagent_latest_turn(
    snapshot: &SessionRuntimeSnapshot,
) -> Option<SubagentLatestTurnProjection> {
    snapshot
        .threads
        .iter()
        .flat_map(|thread| thread.turns.iter())
        .max_by(|left, right| {
            left.updated_at
                .cmp(&right.updated_at)
                .then_with(|| left.created_at.cmp(&right.created_at))
                .then_with(|| left.id.cmp(&right.id))
        })
        .map(|turn| {
            let turn_id = turn.id.clone();
            SubagentLatestTurnProjection {
                tool_count: count_aster_tool_items_for_turn(snapshot, &turn_id),
                duration_ms: resolve_aster_turn_duration_ms(turn),
                result_ref: resolve_aster_worker_result_ref(snapshot, &turn.thread_id, &turn_id),
                turn_id,
                status: project_aster_subagent_turn_status(turn.status),
            }
        })
}

fn project_aster_subagent_turn_status(status: aster::session::TurnStatus) -> SubagentTurnStatus {
    match status {
        aster::session::TurnStatus::Queued => SubagentTurnStatus::Queued,
        aster::session::TurnStatus::Running => SubagentTurnStatus::Running,
        aster::session::TurnStatus::Completed => SubagentTurnStatus::Completed,
        aster::session::TurnStatus::Failed => SubagentTurnStatus::Failed,
        aster::session::TurnStatus::Aborted => SubagentTurnStatus::Aborted,
    }
}

fn resolve_aster_turn_duration_ms(turn: &TurnRuntime) -> Option<u64> {
    let started_at = turn.started_at.unwrap_or(turn.created_at);
    let finished_at = turn.completed_at.unwrap_or(turn.updated_at);
    let duration_ms = finished_at
        .signed_duration_since(started_at)
        .num_milliseconds();
    (duration_ms >= 0).then_some(duration_ms as u64)
}

fn count_aster_tool_items_for_turn(snapshot: &SessionRuntimeSnapshot, turn_id: &str) -> usize {
    snapshot
        .threads
        .iter()
        .flat_map(|thread| thread.items.iter())
        .filter(|item| {
            item.turn_id == turn_id && matches!(&item.payload, ItemRuntimePayload::ToolCall { .. })
        })
        .count()
}

fn build_runtime_item_ref(
    session_id: &str,
    thread_id: &str,
    turn_id: &str,
    item_id: &str,
) -> String {
    format!("agent-runtime://session/{session_id}/thread/{thread_id}/turn/{turn_id}/item/{item_id}")
}

fn resolve_aster_worker_result_ref(
    snapshot: &SessionRuntimeSnapshot,
    thread_id: &str,
    turn_id: &str,
) -> Option<String> {
    snapshot
        .threads
        .iter()
        .filter(|thread| thread.thread.id == thread_id)
        .flat_map(|thread| {
            thread
                .items
                .iter()
                .filter(move |item| {
                    item.turn_id == turn_id
                        && matches!(&item.payload, ItemRuntimePayload::AgentMessage { .. })
                })
                .map(move |item| (thread.thread.session_id.as_str(), item))
        })
        .max_by(|(_, left), (_, right)| {
            left.sequence
                .cmp(&right.sequence)
                .then_with(|| left.updated_at.cmp(&right.updated_at))
                .then_with(|| left.id.cmp(&right.id))
        })
        .map(|(session_id, item)| {
            build_runtime_item_ref(session_id, &item.thread_id, &item.turn_id, &item.id)
        })
}

#[cfg(test)]
mod tests {
    use super::project_aster_subagent_latest_turn;
    use crate::subagent_control::SubagentTurnStatus;
    use aster::session::{
        ItemRuntime, ItemRuntimePayload, ItemStatus, SessionRuntimeSnapshot, ThreadRuntime,
        ThreadRuntimeSnapshot, TurnRuntime, TurnStatus,
    };
    use chrono::Utc;

    #[test]
    fn project_aster_subagent_latest_turn_should_include_duration_tool_count_and_result_ref() {
        let started_at = Utc::now();
        let completed_at = started_at + chrono::Duration::milliseconds(1_250);
        let turn = TurnRuntime {
            id: "turn-1".to_string(),
            session_id: "child-1".to_string(),
            thread_id: "thread-1".to_string(),
            status: TurnStatus::Completed,
            input_text: Some("整理结果".to_string()),
            error_message: None,
            context_override: None,
            output_schema_runtime: None,
            created_at: started_at,
            started_at: Some(started_at),
            completed_at: Some(completed_at),
            updated_at: completed_at,
        };
        let tool_item = ItemRuntime {
            id: "item-tool-1".to_string(),
            thread_id: "thread-1".to_string(),
            turn_id: "turn-1".to_string(),
            sequence: 1,
            status: ItemStatus::Completed,
            started_at,
            completed_at: Some(completed_at),
            updated_at: completed_at,
            payload: ItemRuntimePayload::ToolCall {
                tool_name: "read_file".to_string(),
                arguments: None,
                output: None,
                success: Some(true),
                error: None,
                metadata: None,
            },
        };
        let text_item = ItemRuntime {
            id: "item-text-1".to_string(),
            thread_id: "thread-1".to_string(),
            turn_id: "turn-1".to_string(),
            sequence: 2,
            status: ItemStatus::Completed,
            started_at,
            completed_at: Some(completed_at),
            updated_at: completed_at,
            payload: ItemRuntimePayload::AgentMessage {
                text: "完成".to_string(),
            },
        };
        let snapshot = SessionRuntimeSnapshot {
            session_id: "child-1".to_string(),
            threads: vec![ThreadRuntimeSnapshot {
                thread: ThreadRuntime::new("thread-1", "child-1", std::path::PathBuf::from("/tmp")),
                turns: vec![turn],
                items: vec![tool_item, text_item],
            }],
        };

        let projection = project_aster_subagent_latest_turn(&snapshot).expect("应存在最新 turn");

        assert_eq!(projection.turn_id, "turn-1");
        assert_eq!(projection.status, SubagentTurnStatus::Completed);
        assert_eq!(projection.duration_ms, Some(1_250));
        assert_eq!(projection.tool_count, 1);
        assert_eq!(
            projection.result_ref.as_deref(),
            Some("agent-runtime://session/child-1/thread/thread-1/turn/turn-1/item/item-text-1")
        );
    }
}
