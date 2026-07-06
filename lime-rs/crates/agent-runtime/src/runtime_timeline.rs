use serde_json::Value;
use std::collections::HashMap;

const LEGACY_DECISION_PREFIXES: [&str; 2] = ["已决定：", "已决定:"];
pub const RUNTIME_REQUEST_QUESTIONS_SCHEMA_KEY: &str = "x-lime-ask-user-questions";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RuntimeTimelineTurnStatus {
    Running,
    Completed,
    Failed,
    Aborted,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RuntimeTimelineTurnStatusSource {
    Queued,
    Running,
    Completed,
    Failed,
    Aborted,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuntimeTimelineTurnProjection {
    pub id: String,
    pub thread_id: String,
    pub prompt_text: String,
    pub status: RuntimeTimelineTurnStatus,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub error_message: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuntimeTimelineTurnSource {
    pub id: String,
    pub thread_id: String,
    pub input_text: Option<String>,
    pub status: RuntimeTimelineTurnStatusSource,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub error_message: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RuntimeTimelineItemStatus {
    InProgress,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RuntimeTimelineItemStatusSource {
    InProgress,
    Completed,
    Failed,
}

#[derive(Debug, Clone, PartialEq)]
pub struct RuntimeTimelineRequestOption {
    pub label: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct RuntimeTimelineRequestQuestion {
    pub question: String,
    pub header: Option<String>,
    pub options: Option<Vec<RuntimeTimelineRequestOption>>,
    pub multi_select: Option<bool>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum RuntimeTimelineItemPayload {
    UserMessage {
        content: String,
    },
    AgentMessage {
        text: String,
        phase: Option<String>,
    },
    Plan {
        text: String,
    },
    Reasoning {
        text: String,
        summary: Option<Vec<String>>,
        metadata: Option<Value>,
    },
    ToolCall {
        tool_name: String,
        arguments: Option<Value>,
        output: Option<String>,
        success: Option<bool>,
        error: Option<String>,
        metadata: Option<Value>,
    },
    ApprovalRequest {
        request_id: String,
        action_type: String,
        prompt: Option<String>,
        tool_name: Option<String>,
        arguments: Option<Value>,
        response: Option<Value>,
    },
    RequestUserInput {
        request_id: String,
        action_type: String,
        prompt: Option<String>,
        questions: Option<Vec<RuntimeTimelineRequestQuestion>>,
        response: Option<Value>,
    },
    FileArtifact {
        path: String,
        source: String,
        content: Option<String>,
        metadata: Option<Value>,
    },
    TurnSummary {
        text: String,
        metadata: Option<Value>,
    },
}

#[derive(Debug, Clone, PartialEq)]
pub enum RuntimeTimelineItemPayloadSource {
    InternalTranscript,
    UserMessage {
        content: String,
    },
    AgentMessage {
        text: String,
    },
    Plan {
        text: String,
    },
    RuntimeStatus {
        phase: String,
        title: String,
        detail: String,
        checkpoints: Vec<String>,
    },
    FileArtifact {
        path: String,
        source: String,
        content: Option<String>,
        metadata: Option<Value>,
    },
    Reasoning {
        text: String,
        summary: Option<Vec<String>>,
        metadata: Option<Value>,
    },
    ToolCall {
        tool_name: String,
        arguments: Option<Value>,
        output_text: Option<String>,
        success: Option<bool>,
        error: Option<String>,
        metadata: Option<Value>,
    },
    ApprovalRequest {
        request_id: String,
        action_type: String,
        prompt: Option<String>,
        tool_name: Option<String>,
        arguments: Option<Value>,
        response: Option<Value>,
    },
    RequestUserInput {
        request_id: String,
        action_type: String,
        prompt: Option<String>,
        requested_schema: Option<Value>,
        response: Option<Value>,
    },
}

pub struct RuntimeStatusTimelineSource<'a> {
    pub phase: &'a str,
    pub title: &'a str,
    pub detail: &'a str,
    pub checkpoints: &'a [String],
}

#[derive(Debug, Clone, PartialEq)]
pub struct RuntimeTimelineItemProjection {
    pub id: String,
    pub thread_id: String,
    pub turn_id: String,
    pub sequence: i64,
    pub status: RuntimeTimelineItemStatus,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub updated_at: String,
    pub payload: RuntimeTimelineItemPayload,
}

#[derive(Debug, Clone, PartialEq)]
pub struct RuntimeTimelineItemSource {
    pub id: String,
    pub thread_id: String,
    pub turn_id: String,
    pub sequence: i64,
    pub status: RuntimeTimelineItemStatusSource,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub updated_at: String,
    pub payload: RuntimeTimelineItemPayloadSource,
}

#[derive(Clone, Debug, PartialEq)]
pub struct RuntimeTimelineSnapshotSource<Turn, Item> {
    pub threads: Vec<RuntimeTimelineSnapshotThread<Turn, Item>>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct RuntimeTimelineSnapshotThread<Turn, Item> {
    pub thread_id: String,
    pub turns: Vec<Turn>,
    pub items: Vec<Item>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct RuntimeTimelineSnapshotProjection<Turn, Item> {
    pub thread_id: Option<String>,
    pub turns: Vec<Turn>,
    pub items: Vec<Item>,
}

pub fn project_runtime_timeline_snapshot<Turn, Item>(
    snapshot: RuntimeTimelineSnapshotSource<Turn, Item>,
) -> RuntimeTimelineSnapshotProjection<Turn, Item> {
    let thread_id = snapshot
        .threads
        .first()
        .map(|thread| thread.thread_id.clone());
    let mut turns = Vec::new();
    let mut items = Vec::new();

    for thread in snapshot.threads {
        turns.extend(thread.turns);
        items.extend(thread.items);
    }

    RuntimeTimelineSnapshotProjection {
        thread_id,
        turns,
        items,
    }
}

pub fn project_runtime_timeline_turn(
    source: RuntimeTimelineTurnSource,
) -> RuntimeTimelineTurnProjection {
    RuntimeTimelineTurnProjection {
        id: source.id,
        thread_id: source.thread_id,
        prompt_text: source.input_text.unwrap_or_default(),
        status: project_runtime_timeline_turn_status(source.status),
        started_at: source
            .started_at
            .unwrap_or_else(|| source.created_at.clone()),
        completed_at: source.completed_at,
        error_message: source.error_message,
        created_at: source.created_at,
        updated_at: source.updated_at,
    }
}

pub fn project_runtime_timeline_turn_status(
    source: RuntimeTimelineTurnStatusSource,
) -> RuntimeTimelineTurnStatus {
    match source {
        RuntimeTimelineTurnStatusSource::Queued | RuntimeTimelineTurnStatusSource::Running => {
            RuntimeTimelineTurnStatus::Running
        }
        RuntimeTimelineTurnStatusSource::Completed => RuntimeTimelineTurnStatus::Completed,
        RuntimeTimelineTurnStatusSource::Failed => RuntimeTimelineTurnStatus::Failed,
        RuntimeTimelineTurnStatusSource::Aborted => RuntimeTimelineTurnStatus::Aborted,
    }
}

pub fn project_runtime_timeline_item(
    source: RuntimeTimelineItemSource,
) -> Option<RuntimeTimelineItemProjection> {
    let payload = project_runtime_timeline_item_payload(source.payload)?;
    Some(RuntimeTimelineItemProjection {
        id: source.id,
        thread_id: source.thread_id,
        turn_id: source.turn_id,
        sequence: source.sequence,
        status: project_runtime_timeline_item_status(source.status),
        started_at: source.started_at,
        completed_at: source.completed_at,
        updated_at: source.updated_at,
        payload,
    })
}

pub fn project_runtime_timeline_item_status(
    source: RuntimeTimelineItemStatusSource,
) -> RuntimeTimelineItemStatus {
    match source {
        RuntimeTimelineItemStatusSource::InProgress => RuntimeTimelineItemStatus::InProgress,
        RuntimeTimelineItemStatusSource::Completed => RuntimeTimelineItemStatus::Completed,
        RuntimeTimelineItemStatusSource::Failed => RuntimeTimelineItemStatus::Failed,
    }
}

pub fn normalize_legacy_runtime_status_title(title: &str) -> String {
    let trimmed = title.trim();

    for prefix in LEGACY_DECISION_PREFIXES {
        if let Some(stripped) = trimmed.strip_prefix(prefix) {
            return stripped.trim().to_string();
        }
    }

    trimmed.to_string()
}

pub fn normalize_legacy_turn_summary_text(text: &str) -> String {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    let mut lines = trimmed.lines();
    let Some(first_line) = lines.next() else {
        return String::new();
    };

    let normalized_first_line = normalize_legacy_runtime_status_title(first_line);
    let remaining = lines.collect::<Vec<_>>();

    if remaining.is_empty() {
        return normalized_first_line;
    }

    if normalized_first_line.is_empty() {
        return remaining.join("\n").trim().to_string();
    }

    format!("{normalized_first_line}\n{}", remaining.join("\n"))
}

pub fn build_diagnostics_runtime_status_metadata() -> HashMap<String, Value> {
    HashMap::from([
        (
            "sourceType".to_string(),
            Value::String("runtime_status".to_string()),
        ),
        (
            "source".to_string(),
            Value::String("runtime_status".to_string()),
        ),
        (
            "surface".to_string(),
            Value::String("runtime_status".to_string()),
        ),
        (
            "visibility".to_string(),
            Value::String("diagnostics".to_string()),
        ),
        (
            "persistence".to_string(),
            Value::String("transient".to_string()),
        ),
        (
            "agentui".to_string(),
            serde_json::json!({
                "eventClass": "run.status",
                "surface": "runtime_status",
                "visibility": "diagnostics",
            }),
        ),
    ])
}

pub fn format_runtime_status_timeline_text(
    title: &str,
    detail: &str,
    checkpoints: &[String],
) -> String {
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

pub fn project_runtime_status_timeline_payload(
    source: RuntimeStatusTimelineSource<'_>,
) -> RuntimeTimelineItemPayload {
    let mut metadata = build_diagnostics_runtime_status_metadata();
    metadata.insert(
        "runtimeStatus".to_string(),
        serde_json::json!({
            "phase": source.phase,
        }),
    );

    RuntimeTimelineItemPayload::TurnSummary {
        text: format_runtime_status_timeline_text(source.title, source.detail, source.checkpoints),
        metadata: Some(
            serde_json::to_value(metadata)
                .expect("runtime status diagnostics metadata should serialize"),
        ),
    }
}

pub fn project_runtime_timeline_item_payload(
    source: RuntimeTimelineItemPayloadSource,
) -> Option<RuntimeTimelineItemPayload> {
    match source {
        RuntimeTimelineItemPayloadSource::InternalTranscript => None,
        RuntimeTimelineItemPayloadSource::UserMessage { content } => {
            Some(RuntimeTimelineItemPayload::UserMessage { content })
        }
        RuntimeTimelineItemPayloadSource::AgentMessage { text } => {
            Some(RuntimeTimelineItemPayload::AgentMessage { text, phase: None })
        }
        RuntimeTimelineItemPayloadSource::Plan { text } => {
            Some(RuntimeTimelineItemPayload::Plan { text })
        }
        RuntimeTimelineItemPayloadSource::RuntimeStatus {
            phase,
            title,
            detail,
            checkpoints,
        } => Some(project_runtime_status_timeline_payload(
            RuntimeStatusTimelineSource {
                phase: &phase,
                title: &title,
                detail: &detail,
                checkpoints: &checkpoints,
            },
        )),
        RuntimeTimelineItemPayloadSource::FileArtifact {
            path,
            source,
            content,
            metadata,
        } => Some(RuntimeTimelineItemPayload::FileArtifact {
            path,
            source,
            content,
            metadata,
        }),
        RuntimeTimelineItemPayloadSource::Reasoning {
            text,
            summary,
            metadata,
        } => Some(RuntimeTimelineItemPayload::Reasoning {
            text,
            summary,
            metadata,
        }),
        RuntimeTimelineItemPayloadSource::ToolCall {
            tool_name,
            arguments,
            output_text,
            success,
            error,
            metadata,
        } => Some(RuntimeTimelineItemPayload::ToolCall {
            tool_name,
            arguments,
            output: output_text.filter(|text| !text.is_empty()),
            success,
            error,
            metadata,
        }),
        RuntimeTimelineItemPayloadSource::ApprovalRequest {
            request_id,
            action_type,
            prompt,
            tool_name,
            arguments,
            response,
        } => Some(RuntimeTimelineItemPayload::ApprovalRequest {
            request_id,
            action_type,
            prompt,
            tool_name,
            arguments,
            response,
        }),
        RuntimeTimelineItemPayloadSource::RequestUserInput {
            request_id,
            action_type,
            prompt,
            requested_schema,
            response,
        } => Some(RuntimeTimelineItemPayload::RequestUserInput {
            request_id,
            action_type,
            prompt,
            questions: extract_runtime_request_questions_from_schema(
                requested_schema.as_ref(),
                RUNTIME_REQUEST_QUESTIONS_SCHEMA_KEY,
            ),
            response,
        }),
    }
}

pub fn extract_runtime_request_questions_from_schema(
    requested_schema: Option<&Value>,
    questions_schema_key: &str,
) -> Option<Vec<RuntimeTimelineRequestQuestion>> {
    let schema = requested_schema?.as_object()?;
    let raw_questions = schema.get(questions_schema_key)?.as_array()?;
    let normalized = raw_questions
        .iter()
        .filter_map(|item| {
            let record = item.as_object()?;
            let question = record
                .get("question")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())?
                .to_string();
            let header = record
                .get("header")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToString::to_string);
            let options = record
                .get("options")
                .and_then(extract_runtime_request_options);
            let multi_select = match record
                .get("multiSelect")
                .or_else(|| record.get("multi_select"))
            {
                Some(Value::Bool(value)) => Some(*value),
                _ => None,
            };

            Some(RuntimeTimelineRequestQuestion {
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

fn extract_runtime_request_options(value: &Value) -> Option<Vec<RuntimeTimelineRequestOption>> {
    let options = value.as_array()?;
    let normalized = options
        .iter()
        .filter_map(|item| match item {
            Value::String(label) => {
                let trimmed = label.trim();
                if trimmed.is_empty() {
                    None
                } else {
                    Some(RuntimeTimelineRequestOption {
                        label: trimmed.to_string(),
                        description: None,
                    })
                }
            }
            Value::Object(map) => {
                let label = map
                    .get("label")
                    .and_then(Value::as_str)
                    .or_else(|| map.get("value").and_then(Value::as_str))
                    .map(str::trim)
                    .filter(|value| !value.is_empty())?;
                let description = map
                    .get("description")
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(ToString::to_string);

                Some(RuntimeTimelineRequestOption {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn timeline_snapshot_projector_flattens_threads_in_current_owner() {
        let projection = project_runtime_timeline_snapshot(RuntimeTimelineSnapshotSource {
            threads: vec![
                RuntimeTimelineSnapshotThread {
                    thread_id: "thread-1".to_string(),
                    turns: vec!["turn-1".to_string()],
                    items: vec!["item-1".to_string()],
                },
                RuntimeTimelineSnapshotThread {
                    thread_id: "thread-2".to_string(),
                    turns: vec!["turn-2".to_string()],
                    items: vec!["item-2".to_string()],
                },
            ],
        });

        assert_eq!(projection.thread_id.as_deref(), Some("thread-1"));
        assert_eq!(projection.turns, vec!["turn-1", "turn-2"]);
        assert_eq!(projection.items, vec!["item-1", "item-2"]);
    }

    #[test]
    fn request_questions_from_schema_normalizes_labels_and_options() {
        let questions = extract_runtime_request_questions_from_schema(
            Some(&serde_json::json!({
                "x-lime-ask-user-questions": [
                    {
                        "question": " 请选择渠道 ",
                        "header": "channel",
                        "options": [
                            "公众号",
                            { "value": "wechat-video", "label": "视频号" },
                            { "label": "小红书", "description": "适合图文种草" }
                        ],
                        "multi_select": true
                    }
                ]
            })),
            "x-lime-ask-user-questions",
        )
        .expect("应解析问题");

        assert_eq!(questions[0].question, "请选择渠道");
        assert_eq!(questions[0].multi_select, Some(true));
        assert_eq!(
            questions[0]
                .options
                .as_ref()
                .and_then(|options| options.get(2))
                .and_then(|option| option.description.as_deref()),
            Some("适合图文种草")
        );
    }

    #[test]
    fn turn_projector_folds_queued_into_running_and_uses_created_at_fallback() {
        let projection = project_runtime_timeline_turn(RuntimeTimelineTurnSource {
            id: "turn-1".to_string(),
            thread_id: "thread-1".to_string(),
            input_text: None,
            status: RuntimeTimelineTurnStatusSource::Queued,
            started_at: None,
            completed_at: None,
            error_message: None,
            created_at: "2026-07-06T00:00:00Z".to_string(),
            updated_at: "2026-07-06T00:00:01Z".to_string(),
        });

        assert_eq!(projection.prompt_text, "");
        assert_eq!(projection.status, RuntimeTimelineTurnStatus::Running);
        assert_eq!(projection.started_at, "2026-07-06T00:00:00Z");
    }

    #[test]
    fn item_projector_drops_internal_transcript_payloads() {
        assert_eq!(
            project_runtime_timeline_item(RuntimeTimelineItemSource {
                id: "item-1".to_string(),
                thread_id: "thread-1".to_string(),
                turn_id: "turn-1".to_string(),
                sequence: 1,
                status: RuntimeTimelineItemStatusSource::Completed,
                started_at: "2026-07-06T00:00:00Z".to_string(),
                completed_at: None,
                updated_at: "2026-07-06T00:00:00Z".to_string(),
                payload: RuntimeTimelineItemPayloadSource::InternalTranscript,
            }),
            None
        );
    }

    #[test]
    fn runtime_status_payload_normalizes_text_and_marks_diagnostics() {
        let payload = project_runtime_status_timeline_payload(RuntimeStatusTimelineSource {
            phase: "routing",
            title: "已决定：先规划再输出",
            detail: "当前请求更像计划拆解。",
            checkpoints: &["检测到计划需求".to_string(), "优先整理关键步骤".to_string()],
        });

        match payload {
            RuntimeTimelineItemPayload::TurnSummary { text, metadata } => {
                assert_eq!(
                    text,
                    "先规划再输出\n当前请求更像计划拆解。\n• 检测到计划需求\n• 优先整理关键步骤"
                );
                let metadata = metadata.expect("runtime status metadata");
                assert_eq!(
                    metadata.get("sourceType").and_then(Value::as_str),
                    Some("runtime_status")
                );
                assert_eq!(
                    metadata.get("visibility").and_then(Value::as_str),
                    Some("diagnostics")
                );
                assert_eq!(
                    metadata
                        .get("runtimeStatus")
                        .and_then(|value| value.get("phase"))
                        .and_then(Value::as_str),
                    Some("routing")
                );
            }
            other => panic!("Unexpected payload: {other:?}"),
        }
    }

    #[test]
    fn item_payload_projector_ignores_internal_transcript_and_normalizes_request_input() {
        assert_eq!(
            project_runtime_timeline_item_payload(
                RuntimeTimelineItemPayloadSource::InternalTranscript
            ),
            None
        );

        let payload = project_runtime_timeline_item_payload(
            RuntimeTimelineItemPayloadSource::RequestUserInput {
                request_id: "request-1".to_string(),
                action_type: "elicitation".to_string(),
                prompt: Some("请选择渠道".to_string()),
                requested_schema: Some(serde_json::json!({
                    RUNTIME_REQUEST_QUESTIONS_SCHEMA_KEY: [
                        {
                            "question": " 请选择渠道 ",
                            "header": "channel",
                            "options": ["公众号", { "value": "video", "label": "视频号" }],
                            "multiSelect": false
                        }
                    ]
                })),
                response: None,
            },
        )
        .expect("应投影 request-user-input payload");

        match payload {
            RuntimeTimelineItemPayload::RequestUserInput { questions, .. } => {
                let question = questions
                    .as_ref()
                    .and_then(|items| items.first())
                    .expect("应有问题");
                assert_eq!(question.question, "请选择渠道");
                assert_eq!(question.header.as_deref(), Some("channel"));
                assert_eq!(question.multi_select, Some(false));
            }
            other => panic!("Unexpected payload: {other:?}"),
        }
    }

    #[test]
    fn item_payload_projector_drops_empty_tool_output() {
        let payload =
            project_runtime_timeline_item_payload(RuntimeTimelineItemPayloadSource::ToolCall {
                tool_name: "web_search".to_string(),
                arguments: None,
                output_text: Some(String::new()),
                success: Some(true),
                error: None,
                metadata: None,
            })
            .expect("应投影 tool call payload");

        match payload {
            RuntimeTimelineItemPayload::ToolCall { output, .. } => {
                assert_eq!(output, None);
            }
            other => panic!("Unexpected payload: {other:?}"),
        }
    }
}
