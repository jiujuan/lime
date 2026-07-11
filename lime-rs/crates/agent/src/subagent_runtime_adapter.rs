//! Subagent runtime adapter.
//!
//! This module keeps snapshot record conversion out of `subagent_control` and
//! session-store presentation code.

use agent_runtime::session_execution::{
    project_subagent_latest_turn, project_subagent_runtime_item_kind, SubagentLatestTurnProjection,
    SubagentRuntimeItemKindSource, SubagentRuntimeItemProjection,
    SubagentRuntimeSnapshotProjection, SubagentRuntimeThreadProjection,
    SubagentRuntimeTurnProjection, SubagentTurnStatus,
};
use thread_store::runtime_snapshot::{
    RuntimeItemPayloadRecord, RuntimeItemSnapshotRecord, RuntimeSessionSnapshotRecord,
    RuntimeTurnSnapshotRecord, RuntimeTurnStatusRecord,
};

pub(crate) fn project_subagent_latest_turn_record(
    snapshot: &RuntimeSessionSnapshotRecord,
) -> Option<SubagentLatestTurnProjection> {
    project_subagent_latest_turn(&subagent_runtime_snapshot_from_record(snapshot))
}

fn subagent_runtime_snapshot_from_record(
    snapshot: &RuntimeSessionSnapshotRecord,
) -> SubagentRuntimeSnapshotProjection {
    SubagentRuntimeSnapshotProjection {
        threads: snapshot
            .threads
            .iter()
            .map(|thread| SubagentRuntimeThreadProjection {
                session_id: thread.session_id.clone(),
                thread_id: thread.id.clone(),
                turns: thread
                    .turns
                    .iter()
                    .map(subagent_runtime_turn_from_record)
                    .collect(),
                items: thread
                    .items
                    .iter()
                    .map(subagent_runtime_item_from_record)
                    .collect(),
            })
            .collect(),
    }
}

fn subagent_runtime_turn_from_record(
    turn: &RuntimeTurnSnapshotRecord,
) -> SubagentRuntimeTurnProjection {
    SubagentRuntimeTurnProjection {
        id: turn.id.clone(),
        thread_id: turn.thread_id.clone(),
        status: project_runtime_subagent_turn_status(turn.status),
        created_at_ms: turn.created_at.timestamp_millis(),
        started_at_ms: turn.started_at.map(|value| value.timestamp_millis()),
        completed_at_ms: turn.completed_at.map(|value| value.timestamp_millis()),
        updated_at_ms: turn.updated_at.timestamp_millis(),
    }
}

fn subagent_runtime_item_from_record(
    item: &RuntimeItemSnapshotRecord,
) -> SubagentRuntimeItemProjection {
    SubagentRuntimeItemProjection {
        id: item.id.clone(),
        thread_id: item.thread_id.clone(),
        turn_id: item.turn_id.clone(),
        sequence: item.sequence,
        updated_at_ms: item.updated_at.timestamp_millis(),
        kind: project_subagent_runtime_item_kind(subagent_runtime_item_kind_source_from_record(
            &item.payload,
        )),
    }
}

fn subagent_runtime_item_kind_source_from_record(
    payload: &RuntimeItemPayloadRecord,
) -> SubagentRuntimeItemKindSource {
    match payload {
        RuntimeItemPayloadRecord::ToolCall { .. } => SubagentRuntimeItemKindSource::ToolCall,
        RuntimeItemPayloadRecord::AgentMessage { .. } => {
            SubagentRuntimeItemKindSource::AgentMessage
        }
        _ => SubagentRuntimeItemKindSource::Other,
    }
}

fn project_runtime_subagent_turn_status(status: RuntimeTurnStatusRecord) -> SubagentTurnStatus {
    match status {
        RuntimeTurnStatusRecord::Queued => SubagentTurnStatus::Queued,
        RuntimeTurnStatusRecord::Running => SubagentTurnStatus::Running,
        RuntimeTurnStatusRecord::Completed => SubagentTurnStatus::Completed,
        RuntimeTurnStatusRecord::Failed => SubagentTurnStatus::Failed,
        RuntimeTurnStatusRecord::Aborted => SubagentTurnStatus::Aborted,
    }
}

#[cfg(test)]
mod tests {
    use super::project_subagent_latest_turn_record;
    use agent_runtime::session_execution::SubagentTurnStatus;
    use chrono::Utc;
    use thread_store::runtime_snapshot::{
        RuntimeItemPayloadRecord, RuntimeItemSnapshotRecord, RuntimeItemStatusRecord,
        RuntimeSessionSnapshotRecord, RuntimeThreadSnapshotRecord, RuntimeTurnSnapshotRecord,
        RuntimeTurnStatusRecord,
    };

    #[test]
    fn project_subagent_latest_turn_record_should_include_duration_tool_count_and_result_ref() {
        let started_at = Utc::now();
        let completed_at = started_at + chrono::Duration::milliseconds(1_250);
        let turn = RuntimeTurnSnapshotRecord {
            id: "turn-1".to_string(),
            session_id: "child-1".to_string(),
            thread_id: "thread-1".to_string(),
            status: RuntimeTurnStatusRecord::Completed,
            input_text: Some("整理结果".to_string()),
            error_message: None,
            context_override: None,
            output_schema_runtime: None,
            created_at: started_at,
            started_at: Some(started_at),
            completed_at: Some(completed_at),
            updated_at: completed_at,
        };
        let tool_item = RuntimeItemSnapshotRecord {
            id: "item-tool-1".to_string(),
            thread_id: "thread-1".to_string(),
            turn_id: "turn-1".to_string(),
            sequence: 1,
            status: RuntimeItemStatusRecord::Completed,
            started_at,
            completed_at: Some(completed_at),
            updated_at: completed_at,
            payload: RuntimeItemPayloadRecord::ToolCall {
                tool_name: "read_file".to_string(),
                arguments: None,
                output: None,
                success: Some(true),
                error: None,
                metadata: None,
            },
        };
        let text_item = RuntimeItemSnapshotRecord {
            id: "item-text-1".to_string(),
            thread_id: "thread-1".to_string(),
            turn_id: "turn-1".to_string(),
            sequence: 2,
            status: RuntimeItemStatusRecord::Completed,
            started_at,
            completed_at: Some(completed_at),
            updated_at: completed_at,
            payload: RuntimeItemPayloadRecord::AgentMessage {
                text: "完成".to_string(),
            },
        };
        let snapshot_record = RuntimeSessionSnapshotRecord {
            session_id: "child-1".to_string(),
            threads: vec![RuntimeThreadSnapshotRecord {
                id: "thread-1".to_string(),
                session_id: "child-1".to_string(),
                working_dir: std::path::PathBuf::from("/tmp"),
                created_at: started_at,
                updated_at: completed_at,
                metadata: Default::default(),
                turns: vec![turn],
                items: vec![tool_item, text_item],
            }],
        };

        let projection =
            project_subagent_latest_turn_record(&snapshot_record).expect("应存在最新 turn");

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
