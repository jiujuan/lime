//! Runtime timeline adapter.
//!
//! Snapshot projection consumes Lime-owned records. Event-level Aster wrappers
//! are thin compat shims that immediately convert to records.

use agent_runtime::runtime_timeline::{
    RuntimeTimelineItemProjection, RuntimeTimelineTurnProjection,
};
use agent_runtime::runtime_timeline_record::{
    project_runtime_timeline_item_record as project_runtime_timeline_item_record_with_policy,
    project_runtime_timeline_snapshot_record as project_runtime_timeline_snapshot_record_with_policy,
    project_runtime_timeline_turn_record, RuntimeTimelineSnapshotRecordProjection,
};
use aster::{ItemRuntime, TurnRuntime};
use thread_store::runtime_snapshot::{RuntimeItemSnapshotRecord, RuntimeSessionSnapshotRecord};

use crate::runtime_store_aster_adapter::{
    runtime_item_record_from_aster, runtime_turn_record_from_aster,
};

fn dynamic_filtering_enabled() -> bool {
    lime_core::tool_calling::tool_calling_dynamic_filtering_enabled()
}

pub(crate) fn convert_aster_turn_runtime(turn: TurnRuntime) -> RuntimeTimelineTurnProjection {
    project_runtime_timeline_turn_record(&runtime_turn_record_from_aster(&turn))
}

pub(crate) fn convert_aster_item_runtime(
    item: ItemRuntime,
) -> Option<RuntimeTimelineItemProjection> {
    project_runtime_timeline_item_record(&runtime_item_record_from_aster(&item))
}

pub(crate) fn project_runtime_timeline_snapshot_record(
    snapshot: &RuntimeSessionSnapshotRecord,
) -> RuntimeTimelineSnapshotRecordProjection {
    project_runtime_timeline_snapshot_record_with_policy(snapshot, dynamic_filtering_enabled())
}

pub(crate) fn project_runtime_timeline_item_record(
    item: &RuntimeItemSnapshotRecord,
) -> Option<RuntimeTimelineItemProjection> {
    project_runtime_timeline_item_record_with_policy(item, dynamic_filtering_enabled())
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_runtime::runtime_timeline::{RuntimeTimelineItemPayload, RuntimeTimelineTurnStatus};
    use aster::MessageContent;
    use aster::{ItemRuntimePayload, ItemStatus, TurnStatus};

    fn runtime_item(payload: ItemRuntimePayload) -> ItemRuntime {
        let now = chrono::Utc::now();
        ItemRuntime {
            id: "item-1".to_string(),
            thread_id: "thread-1".to_string(),
            turn_id: "turn-1".to_string(),
            sequence: 1,
            status: ItemStatus::Completed,
            started_at: now,
            completed_at: Some(now),
            updated_at: now,
            payload,
        }
    }

    #[test]
    fn aster_turn_maps_through_current_record_projector() {
        let now = chrono::Utc::now();
        let turn = TurnRuntime {
            id: "turn-1".to_string(),
            session_id: "session-1".to_string(),
            thread_id: "thread-1".to_string(),
            status: TurnStatus::Completed,
            input_text: Some("整理结果".to_string()),
            error_message: None,
            context_override: None,
            output_schema_runtime: None,
            created_at: now,
            started_at: Some(now),
            completed_at: Some(now),
            updated_at: now,
        };

        let turn = convert_aster_turn_runtime(turn);

        assert_eq!(turn.id, "turn-1");
        assert_eq!(turn.status, RuntimeTimelineTurnStatus::Completed);
        assert_eq!(turn.prompt_text, "整理结果");
    }

    #[test]
    fn aster_tool_call_maps_through_current_record_projector() {
        let item = runtime_item(ItemRuntimePayload::ToolCall {
            tool_name: "web_search".to_string(),
            arguments: Some(serde_json::json!({ "q": "codex" })),
            output: Some(serde_json::json!({
                "content": [
                    { "type": "text", "text": "Codex 是一个智能体编码系统" }
                ]
            })),
            success: Some(true),
            error: None,
            metadata: Some(serde_json::json!({ "source": "aster_adapter" })),
        });

        let item = convert_aster_item_runtime(item).expect("expected projected item");

        match item.payload {
            RuntimeTimelineItemPayload::ToolCall {
                tool_name,
                arguments,
                output,
                success,
                error,
                metadata,
            } => {
                assert_eq!(tool_name, "web_search");
                assert_eq!(arguments, Some(serde_json::json!({ "q": "codex" })));
                assert_eq!(output.as_deref(), Some("Codex 是一个智能体编码系统"));
                assert_eq!(success, Some(true));
                assert_eq!(error, None);
                assert_eq!(
                    metadata,
                    Some(serde_json::json!({ "source": "aster_adapter" }))
                );
            }
            other => panic!("unexpected payload: {other:?}"),
        }
    }

    #[test]
    fn aster_transcript_maps_to_internal_only_record() {
        let item = runtime_item(ItemRuntimePayload::TranscriptMessage {
            role: "user".to_string(),
            content: vec![MessageContent::text("完整历史")],
            metadata: Default::default(),
            created_timestamp: 42,
        });

        assert!(convert_aster_item_runtime(item).is_none());
    }
}
