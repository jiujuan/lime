//! Runtime timeline adapter.
//!
//! Snapshot projection consumes Lime-owned records. Event-level Aster wrappers
//! are thin compat shims that immediately convert to records.

use agent_runtime::runtime_timeline::{
    project_runtime_timeline_item, project_runtime_timeline_snapshot,
    project_runtime_timeline_turn, RuntimeTimelineItemPayloadSource, RuntimeTimelineItemProjection,
    RuntimeTimelineItemSource, RuntimeTimelineItemStatusSource, RuntimeTimelineSnapshotProjection,
    RuntimeTimelineSnapshotSource, RuntimeTimelineSnapshotThread, RuntimeTimelineTurnProjection,
    RuntimeTimelineTurnSource, RuntimeTimelineTurnStatusSource,
};
use aster::{ItemRuntime, TurnRuntime};
use thread_store::runtime_snapshot::{
    RuntimeItemPayloadRecord, RuntimeItemSnapshotRecord, RuntimeItemStatusRecord,
    RuntimeSessionSnapshotRecord, RuntimeTurnSnapshotRecord, RuntimeTurnStatusRecord,
};
use tool_runtime::tool_result::extract_tool_result_text;

use crate::runtime_store_aster_adapter::{
    runtime_item_record_from_aster, runtime_turn_record_from_aster,
};

pub(crate) type RuntimeTimelineSnapshotRecordProjection =
    RuntimeTimelineSnapshotProjection<RuntimeTimelineTurnProjection, RuntimeTimelineItemProjection>;

fn dynamic_filtering_enabled() -> bool {
    lime_core::tool_calling::tool_calling_dynamic_filtering_enabled()
}

fn extract_tool_result_text_for_current_runtime<T: serde::Serialize>(result: &T) -> String {
    extract_tool_result_text(result, dynamic_filtering_enabled())
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
    project_runtime_timeline_snapshot(RuntimeTimelineSnapshotSource {
        threads: snapshot
            .threads
            .iter()
            .map(|thread| RuntimeTimelineSnapshotThread {
                thread_id: thread.id.clone(),
                turns: thread
                    .turns
                    .iter()
                    .map(project_runtime_timeline_turn_record)
                    .collect(),
                items: thread
                    .items
                    .iter()
                    .filter_map(project_runtime_timeline_item_record)
                    .collect(),
            })
            .collect(),
    })
}

pub(crate) fn project_runtime_timeline_turn_record(
    turn: &RuntimeTurnSnapshotRecord,
) -> RuntimeTimelineTurnProjection {
    project_runtime_timeline_turn(RuntimeTimelineTurnSource {
        id: turn.id.clone(),
        thread_id: turn.thread_id.clone(),
        input_text: turn.input_text.clone(),
        status: convert_runtime_turn_status(turn.status),
        started_at: turn.started_at.map(|value| value.to_rfc3339()),
        completed_at: turn.completed_at.map(|value| value.to_rfc3339()),
        error_message: turn.error_message.clone(),
        created_at: turn.created_at.to_rfc3339(),
        updated_at: turn.updated_at.to_rfc3339(),
    })
}

fn convert_runtime_turn_status(status: RuntimeTurnStatusRecord) -> RuntimeTimelineTurnStatusSource {
    match status {
        RuntimeTurnStatusRecord::Queued => RuntimeTimelineTurnStatusSource::Queued,
        RuntimeTurnStatusRecord::Running => RuntimeTimelineTurnStatusSource::Running,
        RuntimeTurnStatusRecord::Completed => RuntimeTimelineTurnStatusSource::Completed,
        RuntimeTurnStatusRecord::Failed => RuntimeTimelineTurnStatusSource::Failed,
        RuntimeTurnStatusRecord::Aborted => RuntimeTimelineTurnStatusSource::Aborted,
    }
}

pub(crate) fn project_runtime_timeline_item_record(
    item: &RuntimeItemSnapshotRecord,
) -> Option<RuntimeTimelineItemProjection> {
    project_runtime_timeline_item(RuntimeTimelineItemSource {
        id: item.id.clone(),
        thread_id: item.thread_id.clone(),
        turn_id: item.turn_id.clone(),
        sequence: item.sequence,
        status: convert_runtime_item_status(item.status),
        started_at: item.started_at.to_rfc3339(),
        completed_at: item.completed_at.map(|value| value.to_rfc3339()),
        updated_at: item.updated_at.to_rfc3339(),
        payload: convert_runtime_item_payload_source(&item.payload),
    })
}

fn convert_runtime_item_status(status: RuntimeItemStatusRecord) -> RuntimeTimelineItemStatusSource {
    match status {
        RuntimeItemStatusRecord::InProgress => RuntimeTimelineItemStatusSource::InProgress,
        RuntimeItemStatusRecord::Completed => RuntimeTimelineItemStatusSource::Completed,
        RuntimeItemStatusRecord::Failed => RuntimeTimelineItemStatusSource::Failed,
    }
}

fn convert_runtime_item_payload_source(
    payload: &RuntimeItemPayloadRecord,
) -> RuntimeTimelineItemPayloadSource {
    match payload {
        RuntimeItemPayloadRecord::InternalTranscript => {
            RuntimeTimelineItemPayloadSource::InternalTranscript
        }
        RuntimeItemPayloadRecord::UserMessage { content } => {
            RuntimeTimelineItemPayloadSource::UserMessage {
                content: content.clone(),
            }
        }
        RuntimeItemPayloadRecord::AgentMessage { text } => {
            RuntimeTimelineItemPayloadSource::AgentMessage { text: text.clone() }
        }
        RuntimeItemPayloadRecord::Plan { text } => {
            RuntimeTimelineItemPayloadSource::Plan { text: text.clone() }
        }
        RuntimeItemPayloadRecord::RuntimeStatus {
            phase,
            title,
            detail,
            checkpoints,
        } => RuntimeTimelineItemPayloadSource::RuntimeStatus {
            phase: phase.clone(),
            title: title.clone(),
            detail: detail.clone(),
            checkpoints: checkpoints.clone(),
        },
        RuntimeItemPayloadRecord::FileArtifact {
            path,
            source,
            content,
            metadata,
        } => RuntimeTimelineItemPayloadSource::FileArtifact {
            path: path.clone(),
            source: source.clone(),
            content: content.clone(),
            metadata: metadata.clone(),
        },
        RuntimeItemPayloadRecord::Reasoning {
            text,
            summary,
            metadata,
        } => RuntimeTimelineItemPayloadSource::Reasoning {
            text: text.clone(),
            summary: summary.clone(),
            metadata: metadata.clone(),
        },
        RuntimeItemPayloadRecord::ToolCall {
            tool_name,
            arguments,
            output,
            success,
            error,
            metadata,
        } => {
            let output_text = output
                .as_ref()
                .map(extract_tool_result_text_for_current_runtime)
                .filter(|text| !text.is_empty());
            RuntimeTimelineItemPayloadSource::ToolCall {
                tool_name: tool_name.clone(),
                arguments: arguments.clone(),
                output_text,
                success: *success,
                error: error.clone(),
                metadata: metadata.clone(),
            }
        }
        RuntimeItemPayloadRecord::ApprovalRequest {
            request_id,
            action_type,
            prompt,
            tool_name,
            arguments,
            response,
        } => RuntimeTimelineItemPayloadSource::ApprovalRequest {
            request_id: request_id.clone(),
            action_type: action_type.clone(),
            prompt: prompt.clone(),
            tool_name: tool_name.clone(),
            arguments: arguments.clone(),
            response: response.clone(),
        },
        RuntimeItemPayloadRecord::RequestUserInput {
            request_id,
            action_type,
            prompt,
            requested_schema,
            response,
        } => RuntimeTimelineItemPayloadSource::RequestUserInput {
            request_id: request_id.clone(),
            action_type: action_type.clone(),
            prompt: prompt.clone(),
            requested_schema: requested_schema.clone(),
            response: response.clone(),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_runtime::runtime_timeline::{
        RuntimeTimelineItemPayload, RuntimeTimelineRequestOption, RuntimeTimelineRequestQuestion,
    };
    use aster::MessageContent;
    use aster::{
        ItemRuntime, ItemRuntimePayload, ItemStatus, SessionRuntimeSnapshot, ThreadRuntime,
        ThreadRuntimeSnapshot, TurnRuntime, TurnStatus,
    };

    #[test]
    fn test_convert_item_completed_tool_call() {
        let now = chrono::Utc::now();
        let item = ItemRuntime {
            id: "tool-1".to_string(),
            thread_id: "thread-1".to_string(),
            turn_id: "turn-1".to_string(),
            sequence: 2,
            status: ItemStatus::Completed,
            started_at: now,
            completed_at: Some(now),
            updated_at: now,
            payload: ItemRuntimePayload::ToolCall {
                tool_name: "web_search".to_string(),
                arguments: Some(serde_json::json!({ "q": "codex" })),
                output: Some(serde_json::json!({
                    "content": [
                        { "type": "text", "text": "Codex 是一个智能体编码系统" }
                    ]
                })),
                success: Some(true),
                error: None,
                metadata: Some(serde_json::json!({ "source": "native_item_runtime" })),
            },
        };

        let item = convert_aster_item_runtime(item).expect("expected projected item");

        assert_eq!(item.id, "tool-1");
        assert_eq!(item.sequence, 2);
        assert_eq!(
            item.status,
            agent_runtime::runtime_timeline::RuntimeTimelineItemStatus::Completed
        );
        match &item.payload {
            RuntimeTimelineItemPayload::ToolCall {
                tool_name,
                arguments,
                output,
                success,
                error,
                metadata,
            } => {
                assert_eq!(tool_name, "web_search");
                assert_eq!(
                    arguments.as_ref(),
                    Some(&serde_json::json!({ "q": "codex" }))
                );
                assert_eq!(output.as_deref(), Some("Codex 是一个智能体编码系统"));
                assert_eq!(*success, Some(true));
                assert_eq!(error, &None);
                assert_eq!(
                    metadata.as_ref(),
                    Some(&serde_json::json!({ "source": "native_item_runtime" }))
                );
            }
            other => panic!("Unexpected payload: {other:?}"),
        }
    }

    #[test]
    fn test_transcript_runtime_item_is_internal_only() {
        let now = chrono::Utc::now();
        let item = ItemRuntime {
            id: "transcript:turn-1:1".to_string(),
            thread_id: "thread-1".to_string(),
            turn_id: "turn-1".to_string(),
            sequence: 1,
            status: ItemStatus::Completed,
            started_at: now,
            completed_at: Some(now),
            updated_at: now,
            payload: ItemRuntimePayload::TranscriptMessage {
                role: "user".to_string(),
                content: vec![MessageContent::text("完整历史")],
                metadata: Default::default(),
                created_timestamp: now.timestamp(),
            },
        };

        assert!(convert_aster_item_runtime(item).is_none());
    }

    #[test]
    fn test_convert_item_started_plan_runtime_item() {
        let now = chrono::Utc::now();
        let item = ItemRuntime {
            id: "plan:turn-1".to_string(),
            thread_id: "thread-1".to_string(),
            turn_id: "turn-1".to_string(),
            sequence: 2,
            status: ItemStatus::InProgress,
            started_at: now,
            completed_at: None,
            updated_at: now,
            payload: ItemRuntimePayload::Plan {
                text: "- 调研\n- 实现".to_string(),
            },
        };

        let item = convert_aster_item_runtime(item).expect("expected projected item");
        match &item.payload {
            RuntimeTimelineItemPayload::Plan { text } => {
                assert_eq!(text, "- 调研\n- 实现");
            }
            other => panic!("Unexpected payload: {other:?}"),
        }
    }

    #[test]
    fn test_convert_item_started_reasoning_runtime_item_preserves_summary() {
        let now = chrono::Utc::now();
        let item = ItemRuntime {
            id: "reasoning-1".to_string(),
            thread_id: "thread-1".to_string(),
            turn_id: "turn-1".to_string(),
            sequence: 3,
            status: ItemStatus::InProgress,
            started_at: now,
            completed_at: None,
            updated_at: now,
            payload: ItemRuntimePayload::Reasoning {
                text: "先判断任务类型\n\n再决定是否联网".to_string(),
                summary: Some(vec![
                    "先判断任务类型".to_string(),
                    "再决定是否联网".to_string(),
                ]),
                metadata: Some(serde_json::json!({
                    "provider_metadata": {
                        "signature": "sig-anthropic"
                    }
                })),
            },
        };

        let item = convert_aster_item_runtime(item).expect("expected projected item");
        match &item.payload {
            RuntimeTimelineItemPayload::Reasoning {
                text,
                summary,
                metadata,
            } => {
                assert_eq!(text, "先判断任务类型\n\n再决定是否联网");
                assert_eq!(
                    summary.as_ref(),
                    Some(&vec![
                        "先判断任务类型".to_string(),
                        "再决定是否联网".to_string(),
                    ])
                );
                assert_eq!(
                    metadata.as_ref(),
                    Some(&serde_json::json!({
                        "provider_metadata": {
                            "signature": "sig-anthropic"
                        }
                    }))
                );
            }
            other => panic!("Unexpected payload: {other:?}"),
        }
    }

    #[test]
    fn test_convert_item_started_file_artifact_runtime_item() {
        let now = chrono::Utc::now();
        let item = ItemRuntime {
            id: "artifact-1".to_string(),
            thread_id: "thread-1".to_string(),
            turn_id: "turn-1".to_string(),
            sequence: 3,
            status: ItemStatus::Completed,
            started_at: now,
            completed_at: Some(now),
            updated_at: now,
            payload: ItemRuntimePayload::FileArtifact {
                path: "/tmp/result.md".to_string(),
                source: "tool_result".to_string(),
                content: None,
                metadata: Some(serde_json::json!({
                    "output_file": "/tmp/result.md",
                    "artifact_id": "artifact-1"
                })),
            },
        };

        let item = convert_aster_item_runtime(item).expect("expected projected item");
        match &item.payload {
            RuntimeTimelineItemPayload::FileArtifact {
                path,
                source,
                content,
                metadata,
            } => {
                assert_eq!(path, "/tmp/result.md");
                assert_eq!(source, "tool_result");
                assert_eq!(content, &None);
                assert_eq!(
                    metadata.as_ref().and_then(|value| value.get("artifact_id")),
                    Some(&serde_json::json!("artifact-1"))
                );
            }
            other => panic!("Unexpected payload: {other:?}"),
        }
    }

    #[test]
    fn test_convert_item_updated_runtime_status_runtime_item() {
        let now = chrono::Utc::now();
        let item = ItemRuntime {
            id: "turn_summary:turn-1".to_string(),
            thread_id: "thread-1".to_string(),
            turn_id: "turn-1".to_string(),
            sequence: 4,
            status: ItemStatus::InProgress,
            started_at: now,
            completed_at: None,
            updated_at: now,
            payload: ItemRuntimePayload::RuntimeStatus {
                phase: "routing".to_string(),
                title: "已决定：先规划再输出".to_string(),
                detail: "当前请求更像计划拆解，会先输出结构化行动路径。".to_string(),
                checkpoints: vec!["检测到计划需求".to_string(), "优先整理关键步骤".to_string()],
            },
        };

        let item = convert_aster_item_runtime(item).expect("expected projected item");
        match &item.payload {
            RuntimeTimelineItemPayload::TurnSummary { text, metadata } => {
                assert!(text.contains("先规划再输出"));
                assert!(!text.contains("已决定："));
                assert!(text.contains("当前请求更像计划拆解"));
                assert!(text.contains("• 检测到计划需求"));
                let metadata = metadata.as_ref().expect("runtime status metadata");
                assert_eq!(
                    metadata
                        .get("sourceType")
                        .and_then(serde_json::Value::as_str),
                    Some("runtime_status")
                );
                assert_eq!(
                    metadata
                        .get("visibility")
                        .and_then(serde_json::Value::as_str),
                    Some("diagnostics")
                );
            }
            other => panic!("Unexpected payload: {other:?}"),
        }
    }

    #[test]
    fn test_convert_item_started_request_user_input() {
        let now = chrono::Utc::now();
        let item = ItemRuntime {
            id: "request-1".to_string(),
            thread_id: "thread-1".to_string(),
            turn_id: "turn-1".to_string(),
            sequence: 3,
            status: ItemStatus::InProgress,
            started_at: now,
            completed_at: None,
            updated_at: now,
            payload: ItemRuntimePayload::RequestUserInput {
                request_id: "request-1".to_string(),
                action_type: "elicitation".to_string(),
                prompt: Some("请补充发布渠道".to_string()),
                requested_schema: Some(serde_json::json!({
                    agent_runtime::runtime_timeline::RUNTIME_REQUEST_QUESTIONS_SCHEMA_KEY: [
                        {
                            "question": "请补充发布渠道",
                            "header": "channel",
                            "options": [
                                {
                                    "label": "小红书",
                                    "description": "适合图文种草"
                                },
                                {
                                    "value": "wechat-video",
                                    "label": "视频号"
                                }
                            ],
                            "multiSelect": false
                        }
                    ],
                    "type": "object",
                    "properties": {
                        "channel": { "type": "string" }
                    }
                })),
                response: None,
            },
        };

        let item = convert_aster_item_runtime(item).expect("expected projected item");
        assert_eq!(item.id, "request-1");
        assert_eq!(
            item.status,
            agent_runtime::runtime_timeline::RuntimeTimelineItemStatus::InProgress
        );
        match &item.payload {
            RuntimeTimelineItemPayload::RequestUserInput {
                request_id,
                action_type,
                prompt,
                questions,
                response,
            } => {
                assert_eq!(request_id, "request-1");
                assert_eq!(action_type, "elicitation");
                assert_eq!(prompt.as_deref(), Some("请补充发布渠道"));
                assert_eq!(
                    questions,
                    &Some(vec![RuntimeTimelineRequestQuestion {
                        question: "请补充发布渠道".to_string(),
                        header: Some("channel".to_string()),
                        options: Some(vec![
                            RuntimeTimelineRequestOption {
                                label: "小红书".to_string(),
                                description: Some("适合图文种草".to_string()),
                            },
                            RuntimeTimelineRequestOption {
                                label: "视频号".to_string(),
                                description: None,
                            },
                        ]),
                        multi_select: Some(false),
                    }])
                );
                assert_eq!(response, &None);
            }
            other => panic!("Unexpected payload: {other:?}"),
        }
    }

    #[test]
    fn test_project_runtime_timeline_snapshot_record_flattens_threads() {
        let now = chrono::Utc::now();
        let completed_turn = TurnRuntime {
            id: "turn-1".to_string(),
            session_id: "session-1".to_string(),
            thread_id: "thread-1".to_string(),
            status: TurnStatus::Completed,
            input_text: Some("整理计划".to_string()),
            error_message: None,
            context_override: None,
            output_schema_runtime: None,
            created_at: now,
            started_at: Some(now),
            completed_at: Some(now),
            updated_at: now,
        };
        let queued_turn = TurnRuntime {
            id: "turn-2".to_string(),
            session_id: "session-1".to_string(),
            thread_id: "thread-2".to_string(),
            status: TurnStatus::Queued,
            input_text: None,
            error_message: None,
            context_override: None,
            output_schema_runtime: None,
            created_at: now,
            started_at: None,
            completed_at: None,
            updated_at: now,
        };
        let transcript_item = ItemRuntime {
            id: "transcript-1".to_string(),
            thread_id: "thread-1".to_string(),
            turn_id: "turn-1".to_string(),
            sequence: 1,
            status: ItemStatus::Completed,
            started_at: now,
            completed_at: Some(now),
            updated_at: now,
            payload: ItemRuntimePayload::TranscriptMessage {
                role: "user".to_string(),
                content: vec![MessageContent::text("只用于内部上下文")],
                metadata: Default::default(),
                created_timestamp: now.timestamp(),
            },
        };
        let user_item = ItemRuntime {
            id: "user-1".to_string(),
            thread_id: "thread-2".to_string(),
            turn_id: "turn-2".to_string(),
            sequence: 1,
            status: ItemStatus::Completed,
            started_at: now,
            completed_at: Some(now),
            updated_at: now,
            payload: ItemRuntimePayload::UserMessage {
                content: "用户输入".to_string(),
            },
        };
        let snapshot = SessionRuntimeSnapshot {
            session_id: "session-1".to_string(),
            threads: vec![
                ThreadRuntimeSnapshot {
                    thread: ThreadRuntime::new(
                        "thread-1",
                        "session-1",
                        std::path::PathBuf::from("/tmp/thread-1"),
                    ),
                    turns: vec![completed_turn],
                    items: vec![transcript_item],
                },
                ThreadRuntimeSnapshot {
                    thread: ThreadRuntime::new(
                        "thread-2",
                        "session-1",
                        std::path::PathBuf::from("/tmp/thread-2"),
                    ),
                    turns: vec![queued_turn],
                    items: vec![user_item],
                },
            ],
        };

        let snapshot_record =
            crate::runtime_store_aster_adapter::runtime_snapshot_record_from_aster(&snapshot);
        let projection = project_runtime_timeline_snapshot_record(&snapshot_record);

        assert_eq!(projection.thread_id.as_deref(), Some("thread-1"));
        assert_eq!(
            projection
                .turns
                .iter()
                .map(|turn| turn.id.as_str())
                .collect::<Vec<_>>(),
            vec!["turn-1", "turn-2"]
        );
        assert_eq!(
            projection
                .items
                .iter()
                .map(|item| item.id.as_str())
                .collect::<Vec<_>>(),
            vec!["user-1"]
        );
        assert_eq!(projection.turns[1].prompt_text, "");
    }
}
