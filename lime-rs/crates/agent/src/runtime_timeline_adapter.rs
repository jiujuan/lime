//! Aster runtime timeline adapter.
//!
//! Aster `TurnRuntime` / `ItemRuntime` stays behind this compat boundary;
//! callers receive Lime-owned timeline DTOs.

use aster::session::{ItemRuntime, ItemRuntimePayload, ItemStatus, TurnRuntime, TurnStatus};
use lime_core::database::dao::agent_timeline::{
    AgentRequestOption, AgentRequestQuestion, AgentThreadItem, AgentThreadItemPayload,
    AgentThreadTurn,
};
use tool_runtime::tool_result::extract_tool_result_text;

use crate::text_normalization::{
    normalize_legacy_runtime_status_title, normalize_legacy_turn_summary_text,
};

const ASK_USER_QUESTIONS_SCHEMA_KEY: &str = "x-lime-ask-user-questions";

fn dynamic_filtering_enabled() -> bool {
    lime_core::tool_calling::tool_calling_dynamic_filtering_enabled()
}

fn extract_tool_result_text_for_current_runtime<T: serde::Serialize>(result: &T) -> String {
    extract_tool_result_text(result, dynamic_filtering_enabled())
}

fn convert_aster_turn_status(
    status: TurnStatus,
) -> lime_core::database::dao::agent_timeline::AgentThreadTurnStatus {
    match status {
        TurnStatus::Queued | TurnStatus::Running => {
            lime_core::database::dao::agent_timeline::AgentThreadTurnStatus::Running
        }
        TurnStatus::Completed => {
            lime_core::database::dao::agent_timeline::AgentThreadTurnStatus::Completed
        }
        TurnStatus::Failed => {
            lime_core::database::dao::agent_timeline::AgentThreadTurnStatus::Failed
        }
        TurnStatus::Aborted => {
            lime_core::database::dao::agent_timeline::AgentThreadTurnStatus::Aborted
        }
    }
}

pub(crate) fn convert_aster_turn_runtime(turn: TurnRuntime) -> AgentThreadTurn {
    AgentThreadTurn {
        id: turn.id,
        thread_id: turn.thread_id,
        prompt_text: turn.input_text.unwrap_or_default(),
        status: convert_aster_turn_status(turn.status),
        started_at: turn.started_at.unwrap_or(turn.created_at).to_rfc3339(),
        completed_at: turn.completed_at.map(|value| value.to_rfc3339()),
        error_message: turn.error_message,
        created_at: turn.created_at.to_rfc3339(),
        updated_at: turn.updated_at.to_rfc3339(),
    }
}

fn convert_aster_item_status(
    status: ItemStatus,
) -> lime_core::database::dao::agent_timeline::AgentThreadItemStatus {
    match status {
        ItemStatus::InProgress => {
            lime_core::database::dao::agent_timeline::AgentThreadItemStatus::InProgress
        }
        ItemStatus::Completed => {
            lime_core::database::dao::agent_timeline::AgentThreadItemStatus::Completed
        }
        ItemStatus::Failed => {
            lime_core::database::dao::agent_timeline::AgentThreadItemStatus::Failed
        }
    }
}

fn format_runtime_status_text(title: &str, detail: &str, checkpoints: &[String]) -> String {
    let mut lines = Vec::new();

    let trimmed_title = normalize_legacy_runtime_status_title(title);
    if !trimmed_title.is_empty() {
        lines.push(trimmed_title);
    }

    let trimmed_detail = detail.trim();
    if !trimmed_detail.is_empty() {
        lines.push(trimmed_detail.to_string());
    }

    for checkpoint in checkpoints {
        let trimmed = checkpoint.trim();
        if !trimmed.is_empty() {
            lines.push(format!("• {trimmed}"));
        }
    }

    normalize_legacy_turn_summary_text(&lines.join("\n"))
}

fn extract_request_options(value: &serde_json::Value) -> Option<Vec<AgentRequestOption>> {
    let options = value.as_array()?;
    let normalized = options
        .iter()
        .filter_map(|item| match item {
            serde_json::Value::String(label) => {
                let trimmed = label.trim();
                if trimmed.is_empty() {
                    None
                } else {
                    Some(AgentRequestOption {
                        label: trimmed.to_string(),
                        description: None,
                    })
                }
            }
            serde_json::Value::Object(map) => {
                let label = map
                    .get("label")
                    .and_then(serde_json::Value::as_str)
                    .or_else(|| map.get("value").and_then(serde_json::Value::as_str))
                    .map(str::trim)
                    .filter(|value| !value.is_empty())?;
                let description = map
                    .get("description")
                    .and_then(serde_json::Value::as_str)
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(ToString::to_string);

                Some(AgentRequestOption {
                    label: label.to_string(),
                    description,
                })
            }
            _ => None,
        })
        .collect::<Vec<_>>();

    if normalized.is_empty() {
        None
    } else {
        Some(normalized)
    }
}

fn extract_request_questions_from_schema(
    requested_schema: Option<&serde_json::Value>,
) -> Option<Vec<AgentRequestQuestion>> {
    let schema = requested_schema?.as_object()?;
    let raw_questions = schema.get(ASK_USER_QUESTIONS_SCHEMA_KEY)?.as_array()?;
    let normalized = raw_questions
        .iter()
        .filter_map(|item| {
            let record = item.as_object()?;
            let question = record
                .get("question")
                .and_then(serde_json::Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())?
                .to_string();
            let header = record
                .get("header")
                .and_then(serde_json::Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToString::to_string);
            let options = record.get("options").and_then(extract_request_options);
            let multi_select = match record
                .get("multiSelect")
                .or_else(|| record.get("multi_select"))
            {
                Some(serde_json::Value::Bool(value)) => Some(*value),
                _ => None,
            };

            Some(AgentRequestQuestion {
                question,
                header,
                options,
                multi_select,
            })
        })
        .collect::<Vec<_>>();

    if normalized.is_empty() {
        None
    } else {
        Some(normalized)
    }
}

fn convert_aster_item_payload(payload: ItemRuntimePayload) -> Option<AgentThreadItemPayload> {
    match payload {
        ItemRuntimePayload::TranscriptMessage { .. } => None,
        ItemRuntimePayload::UserMessage { content } => {
            Some(AgentThreadItemPayload::UserMessage { content })
        }
        ItemRuntimePayload::AgentMessage { text } => {
            Some(AgentThreadItemPayload::AgentMessage { text, phase: None })
        }
        ItemRuntimePayload::Plan { text } => Some(AgentThreadItemPayload::Plan { text }),
        ItemRuntimePayload::RuntimeStatus {
            phase,
            title,
            detail,
            checkpoints,
        } => {
            let mut metadata = crate::protocol::build_diagnostics_runtime_status_metadata();
            metadata.insert(
                "runtimeStatus".to_string(),
                serde_json::json!({
                    "phase": phase,
                }),
            );
            Some(AgentThreadItemPayload::TurnSummary {
                text: format_runtime_status_text(&title, &detail, &checkpoints),
                metadata: Some(
                    serde_json::to_value(metadata)
                        .expect("runtime status diagnostics metadata should serialize"),
                ),
            })
        }
        ItemRuntimePayload::FileArtifact {
            path,
            source,
            content,
            metadata,
        } => Some(AgentThreadItemPayload::FileArtifact {
            path,
            source,
            content,
            metadata,
        }),
        ItemRuntimePayload::Reasoning {
            text,
            summary,
            metadata,
        } => Some(AgentThreadItemPayload::Reasoning {
            text,
            summary,
            metadata,
        }),
        ItemRuntimePayload::ToolCall {
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
            Some(AgentThreadItemPayload::ToolCall {
                tool_name,
                arguments,
                output: output_text,
                success,
                error,
                metadata,
            })
        }
        ItemRuntimePayload::ApprovalRequest {
            request_id,
            action_type,
            prompt,
            tool_name,
            arguments,
            response,
        } => Some(AgentThreadItemPayload::ApprovalRequest {
            request_id,
            action_type,
            prompt,
            tool_name,
            arguments,
            response,
        }),
        ItemRuntimePayload::RequestUserInput {
            request_id,
            action_type,
            prompt,
            requested_schema,
            response,
        } => Some(AgentThreadItemPayload::RequestUserInput {
            request_id,
            action_type,
            prompt,
            questions: extract_request_questions_from_schema(requested_schema.as_ref()),
            response,
        }),
    }
}

pub(crate) fn convert_aster_item_runtime(item: ItemRuntime) -> Option<AgentThreadItem> {
    let payload = convert_aster_item_payload(item.payload)?;
    Some(AgentThreadItem {
        id: item.id,
        thread_id: item.thread_id,
        turn_id: item.turn_id,
        sequence: item.sequence,
        status: convert_aster_item_status(item.status),
        started_at: item.started_at.to_rfc3339(),
        completed_at: item.completed_at.map(|value| value.to_rfc3339()),
        updated_at: item.updated_at.to_rfc3339(),
        payload,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use aster::conversation::message::MessageContent;

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
            lime_core::database::dao::agent_timeline::AgentThreadItemStatus::Completed
        );
        match &item.payload {
            AgentThreadItemPayload::ToolCall {
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
            AgentThreadItemPayload::Plan { text } => {
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
            AgentThreadItemPayload::Reasoning {
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
            AgentThreadItemPayload::FileArtifact {
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
            AgentThreadItemPayload::TurnSummary { text, metadata } => {
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
                    ASK_USER_QUESTIONS_SCHEMA_KEY: [
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
            lime_core::database::dao::agent_timeline::AgentThreadItemStatus::InProgress
        );
        match &item.payload {
            AgentThreadItemPayload::RequestUserInput {
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
                    &Some(vec![AgentRequestQuestion {
                        question: "请补充发布渠道".to_string(),
                        header: Some("channel".to_string()),
                        options: Some(vec![
                            AgentRequestOption {
                                label: "小红书".to_string(),
                                description: Some("适合图文种草".to_string()),
                            },
                            AgentRequestOption {
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
}
