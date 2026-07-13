//! Event-to-typed Thread/Turn/Item materialization.
//!
//! Event payloads are an adapter boundary only.  The result of this module is
//! always the canonical `agent_protocol` DTOs; callers do not receive a raw
//! `serde_json::Value` item projection.

use super::change_set::{ChangeSetAccumulator, MaterializationError};
use agent_protocol::{
    ApprovalAction, ApprovalDecision, ApprovalScope, CollabAgentOperation, FileChangeStatus,
    ItemId, ItemStatus, SessionId, SubAgentActivityKind, ThreadHistoryChangeSet, ThreadId,
    ThreadItem, ThreadItemPayload, ToolOutput, Turn, TurnApprovalState, TurnError, TurnId,
    TurnItemsView, TurnQueueState, TurnStatus,
};
use app_server_protocol::AgentEvent;
use chrono::{DateTime, FixedOffset};
use serde_json::{Map, Value};
use std::collections::HashMap;

/// Materialize durable AgentEvents.  Events may contain gaps, but must be in
/// canonical sequence order; lower-sequence records are stale and ignored.
pub(in crate::runtime) fn materialize_events(
    events: &[AgentEvent],
    default_session_id: &str,
    default_thread_id: &str,
) -> Result<ThreadHistoryChangeSet, MaterializationError> {
    let mut materializer = Materializer::new(default_session_id, default_thread_id);
    for event in events {
        materializer.apply(event)?;
    }
    Ok(materializer.finish())
}

/// Adapt an in-memory RuntimeEvent into the durable event shape before
/// materialization. RuntimeEvent has no durable identity of its own, so the
/// embedded event metadata is preferred and a deterministic synthetic id is
/// used only at this boundary.
pub(super) fn materialize_runtime_events(
    events: &[super::super::RuntimeEvent],
    default_session_id: &str,
    default_thread_id: &str,
) -> Result<ThreadHistoryChangeSet, MaterializationError> {
    let adapted = events
        .iter()
        .enumerate()
        .map(|(index, event)| AgentEvent {
            event_id: value_string(&event.payload, &["eventId", "event_id"])
                .unwrap_or_else(|| format!("runtime-{index}")),
            sequence: value_u64(&event.payload, &["sequence", "ordinal"])
                .unwrap_or(index as u64 + 1),
            session_id: value_string(&event.payload, &["sessionId", "session_id"])
                .unwrap_or_else(|| default_session_id.to_string()),
            thread_id: value_string(&event.payload, &["threadId", "thread_id"])
                .or_else(|| Some(default_thread_id.to_string())),
            turn_id: value_string(&event.payload, &["turnId", "turn_id"]),
            event_type: event.event_type.clone(),
            timestamp: value_string(&event.payload, &["timestamp", "createdAt", "created_at"])
                .unwrap_or_else(|| "1970-01-01T00:00:00Z".to_string()),
            payload: event.payload.clone(),
        })
        .collect::<Vec<_>>();
    materialize_events(&adapted, default_session_id, default_thread_id)
}

struct Materializer<'a> {
    default_session_id: &'a str,
    default_thread_id: &'a str,
    seen_event_ids: HashMap<String, u64>,
    seen_sequences: HashMap<u64, String>,
    latest_sequence: u64,
    accumulator: ChangeSetAccumulator,
}

impl<'a> Materializer<'a> {
    fn new(default_session_id: &'a str, default_thread_id: &'a str) -> Self {
        Self {
            default_session_id,
            default_thread_id,
            seen_event_ids: HashMap::new(),
            seen_sequences: HashMap::new(),
            latest_sequence: 0,
            accumulator: ChangeSetAccumulator::default(),
        }
    }

    fn apply(&mut self, event: &AgentEvent) -> Result<(), MaterializationError> {
        if let Some(previous_sequence) = self.seen_event_ids.get(&event.event_id).copied() {
            if previous_sequence == event.sequence {
                return Ok(());
            }
            return Err(MaterializationError::EventIdentityCollision {
                event_id: event.event_id.clone(),
                previous_sequence,
                sequence: event.sequence,
            });
        }
        if let Some(previous_event_id) = self.seen_sequences.get(&event.sequence) {
            if previous_event_id != &event.event_id {
                return Err(MaterializationError::SequenceCollision {
                    sequence: event.sequence,
                    previous_event_id: previous_event_id.clone(),
                    event_id: event.event_id.clone(),
                });
            }
        }
        self.seen_event_ids
            .insert(event.event_id.clone(), event.sequence);
        self.seen_sequences
            .insert(event.sequence, event.event_id.clone());
        if event.sequence < self.latest_sequence {
            return Ok(());
        }
        self.latest_sequence = event.sequence;

        if let Some(target) = rollback_target(event) {
            self.accumulator.rollback(target);
        }

        if matches!(event.event_type.as_str(), "turn.removed" | "turn.deleted") {
            if let Some(turn_id) = event
                .turn_id
                .clone()
                .or_else(|| value_string(&event.payload, &["turnId", "turn_id"]))
            {
                self.accumulator.remove_turn(turn_id);
            }
            return Ok(());
        }
        if event.event_type == "queue.removed" {
            if let Some(turn_id) = queued_turn_id(event) {
                self.accumulator.remove_turn(turn_id);
            }
            return Ok(());
        }
        if event.event_type == "queue.promoted" {
            return Ok(());
        }
        if matches!(
            event.event_type.as_str(),
            "item.removed" | "item.deleted" | "message.removed" | "tool.removed"
        ) {
            if let Some(item_id) = explicit_item_id(payload_source(&event.payload)) {
                self.accumulator.remove_item(ItemId::new(item_id));
            }
        }

        let payload_turn_id = value_string(&event.payload, &["turnId", "turn_id"]);
        let queue_added_turn_id = (event.event_type == "queue.added")
            .then(|| queued_turn_id(event))
            .flatten();
        let turn_id = if event.event_type == "queue.added" {
            queue_added_turn_id.as_deref()
        } else {
            event.turn_id.as_deref().or(payload_turn_id.as_deref())
        };
        if let Some(turn_id) = turn_id {
            self.accumulator.push_turn(
                turn_snapshot(
                    event,
                    self.default_session_id,
                    self.default_thread_id,
                    turn_id,
                ),
                event.sequence,
            );
        }

        if let Some(item) = item_from_event(event, self.default_session_id, self.default_thread_id)
        {
            self.accumulator.push_item(item);
        }
        Ok(())
    }

    fn finish(self) -> ThreadHistoryChangeSet {
        self.accumulator.finish(self.latest_sequence)
    }
}

fn item_from_event(
    event: &AgentEvent,
    default_session_id: &str,
    default_thread_id: &str,
) -> Option<ThreadItem> {
    if let Some(item) = canonical_item_from_event(event, default_session_id, default_thread_id) {
        return Some(item);
    }

    let event_type = event.event_type.as_str();
    let payload_turn_id = value_string(&event.payload, &["turnId", "turn_id"]);
    let turn_id = event.turn_id.as_deref().or(payload_turn_id.as_deref())?;
    let session_id = non_empty(&event.session_id).unwrap_or(default_session_id);
    let payload_thread_id = value_string(&event.payload, &["threadId", "thread_id"]);
    let thread_id = event
        .thread_id
        .as_deref()
        .or(payload_thread_id.as_deref())
        .unwrap_or(default_thread_id);
    let family = item_family(event_type, &event.payload)?;
    let approval_source =
        matches!(family, ItemFamily::Approval).then(|| approval_payload_source(&event.payload));
    let source = approval_source
        .as_ref()
        .unwrap_or_else(|| payload_source(&event.payload));
    let item_id = ItemId::new(
        family
            .explicit_item_id(source)
            .unwrap_or_else(|| family.fallback_id(turn_id, &event.event_id)),
    );
    let timestamp = event_timestamp_ms(event);
    let status = item_status(event_type, &event.payload);
    let payload = typed_payload(family, event_type, source, item_id.as_str(), timestamp);
    let completed_at_ms = status.is_terminal().then_some(timestamp);
    Some(ThreadItem {
        session_id: SessionId::new(session_id),
        thread_id: ThreadId::new(thread_id),
        turn_id: TurnId::new(turn_id),
        item_id,
        sequence: event.sequence,
        ordinal: map_u64(source, &["ordinal", "itemOrdinal", "item_ordinal"])
            .unwrap_or(event.sequence),
        created_at_ms: timestamp,
        updated_at_ms: timestamp,
        completed_at_ms,
        kind: payload.kind(),
        status,
        payload,
        metadata: source.get("metadata").cloned().unwrap_or(Value::Null),
    })
}

fn canonical_item_from_event(
    event: &AgentEvent,
    default_session_id: &str,
    default_thread_id: &str,
) -> Option<ThreadItem> {
    if !matches!(
        event.event_type.as_str(),
        "item.started" | "item.updated" | "item.completed"
    ) {
        return None;
    }

    let mut item = serde_json::from_value::<ThreadItem>(event.payload.get("item")?.clone()).ok()?;
    let turn_id = event.turn_id.as_deref()?;
    let timestamp = parse_timestamp_ms(&event.timestamp).unwrap_or(event.sequence as i64);

    item.session_id = SessionId::new(non_empty(&event.session_id).unwrap_or(default_session_id));
    item.thread_id = ThreadId::new(
        event
            .thread_id
            .as_deref()
            .and_then(non_empty)
            .unwrap_or(default_thread_id),
    );
    item.turn_id = TurnId::new(turn_id);
    item.sequence = event.sequence;
    item.created_at_ms = timestamp;
    item.updated_at_ms = timestamp;
    item.status = canonical_item_lifecycle_status(event.event_type.as_str(), item.status);
    item.completed_at_ms = item.status.is_terminal().then_some(timestamp);
    Some(item)
}

fn canonical_item_lifecycle_status(event_type: &str, nested_status: ItemStatus) -> ItemStatus {
    match event_type {
        "item.started" | "item.updated" => ItemStatus::InProgress,
        "item.completed" => match nested_status {
            ItemStatus::Failed | ItemStatus::Interrupted | ItemStatus::Cancelled => nested_status,
            _ => ItemStatus::Completed,
        },
        _ => nested_status,
    }
}

fn turn_snapshot(
    event: &AgentEvent,
    default_session_id: &str,
    default_thread_id: &str,
    turn_id: &str,
) -> Turn {
    let timestamp = event_timestamp_ms(event);
    let status = match event.event_type.as_str() {
        "turn.completed" => TurnStatus::Completed,
        "turn.failed" => TurnStatus::Failed,
        "turn.canceled" | "turn.cancelled" => TurnStatus::Interrupted,
        _ => TurnStatus::InProgress,
    };
    let error = if status == TurnStatus::Failed {
        value_string(&event.payload, &["error", "message", "reason"]).map(|message| TurnError {
            message,
            code: value_string(&event.payload, &["code", "errorCode", "error_code"]),
            details: value_string(
                &event.payload,
                &["details", "errorDetails", "error_details"],
            ),
        })
    } else {
        None
    };
    let started_at_ms = (event.event_type == "turn.started").then_some(timestamp);
    let completed_at_ms = status.is_terminal().then_some(timestamp);
    let payload_thread_id = value_string(&event.payload, &["threadId", "thread_id"]);
    Turn {
        session_id: SessionId::new(non_empty(&event.session_id).unwrap_or(default_session_id)),
        thread_id: ThreadId::new(
            event
                .thread_id
                .as_deref()
                .or(payload_thread_id.as_deref())
                .unwrap_or(default_thread_id),
        ),
        turn_id: TurnId::new(turn_id),
        status,
        admission: Default::default(),
        queue: turn_queue_state(event),
        approval: turn_approval_state(event),
        items: Vec::new(),
        items_view: TurnItemsView::NotLoaded,
        error,
        created_at_ms: timestamp,
        updated_at_ms: timestamp,
        started_at_ms,
        completed_at_ms,
        duration_ms: value_u64(&event.payload, &["durationMs", "duration_ms"]),
    }
}

#[derive(Clone, Copy)]
enum ItemFamily {
    UserMessage,
    AgentMessage,
    Reasoning,
    Tool,
    McpToolCall,
    CollabAgentToolCall,
    Approval,
    Command,
    File,
    Media,
    SubAgent,
    ContextCompaction,
}

impl ItemFamily {
    fn explicit_item_id(self, payload: &Map<String, Value>) -> Option<String> {
        if matches!(self, Self::Approval) {
            return map_string(
                payload,
                &[
                    "itemId",
                    "item_id",
                    "requestId",
                    "request_id",
                    "actionId",
                    "action_id",
                    "id",
                ],
            );
        }
        explicit_item_id(payload)
    }

    fn stable_name(self) -> &'static str {
        match self {
            Self::UserMessage => "user",
            Self::AgentMessage => "agent",
            Self::Reasoning => "reasoning",
            Self::Tool => "tool",
            Self::McpToolCall => "mcp-tool",
            Self::CollabAgentToolCall => "collab-tool",
            Self::Approval => "approval",
            Self::Command => "command",
            Self::File => "file",
            Self::Media => "media",
            Self::SubAgent => "subagent",
            Self::ContextCompaction => "compaction",
        }
    }

    fn fallback_id(self, turn_id: &str, event_id: &str) -> String {
        match self {
            Self::UserMessage | Self::AgentMessage | Self::Reasoning | Self::ContextCompaction => {
                format!("{}-{turn_id}", self.stable_name())
            }
            _ => format!("{}-{event_id}", self.stable_name()),
        }
    }
}

fn item_family(event_type: &str, payload: &Value) -> Option<ItemFamily> {
    let normalized = event_type.to_ascii_lowercase();
    if normalized.starts_with("item.") {
        let source = payload_source(payload);
        let kind =
            map_string(source, &["kind", "type", "itemType", "item_type"])?.to_ascii_lowercase();
        return match kind.as_str() {
            "user_message" | "usermessage" | "user" => Some(ItemFamily::UserMessage),
            "agent_message" | "agentmessage" | "assistant" | "message" => {
                Some(ItemFamily::AgentMessage)
            }
            "reasoning" | "reasoning_message" => Some(ItemFamily::Reasoning),
            "tool" | "tool_call" | "tool_result" | "web_search" => Some(tool_family(source)),
            "mcp_tool" | "mcp_tool_call" => Some(ItemFamily::McpToolCall),
            "collab_agent_tool_call" | "subagent_tool_call" => {
                Some(ItemFamily::CollabAgentToolCall)
            }
            "approval" | "action_required" | "request_user_input" => Some(ItemFamily::Approval),
            "command" | "command_execution" => Some(ItemFamily::Command),
            "file" | "file_change" | "patch" => Some(ItemFamily::File),
            "media" | "artifact" | "image" | "video" | "audio" => Some(ItemFamily::Media),
            "subagent" | "sub_agent" | "subagent_activity" => Some(ItemFamily::SubAgent),
            "context_compaction" | "compaction" => Some(ItemFamily::ContextCompaction),
            _ => None,
        };
    }
    if normalized.starts_with("message.") {
        let role = value_string(payload, &["role", "author"]).unwrap_or_default();
        let user = normalized == "message.created"
            || role.eq_ignore_ascii_case("user")
            || payload.get("input").is_some();
        return Some(if user {
            ItemFamily::UserMessage
        } else {
            ItemFamily::AgentMessage
        });
    }
    if normalized.starts_with("reasoning.") {
        return Some(ItemFamily::Reasoning);
    }
    if matches!(normalized.as_str(), "tool.progress" | "tool.output.delta") {
        return Some(tool_family(payload_source(payload)));
    }
    if normalized.starts_with("mcp.") {
        return Some(ItemFamily::McpToolCall);
    }
    if normalized.starts_with("collab.") {
        return Some(ItemFamily::CollabAgentToolCall);
    }
    if normalized.starts_with("action.") || normalized.starts_with("approval.") {
        return Some(ItemFamily::Approval);
    }
    if normalized.starts_with("command.") {
        return Some(ItemFamily::Command);
    }
    if normalized.starts_with("patch.") || normalized.starts_with("file.") {
        return Some(ItemFamily::File);
    }
    if normalized.starts_with("artifact.") || normalized.starts_with("media.") {
        return Some(ItemFamily::Media);
    }
    if normalized.starts_with("subagent.") || normalized.starts_with("sub_agent.") {
        return Some(ItemFamily::SubAgent);
    }
    if normalized.starts_with("context.compaction") {
        return Some(ItemFamily::ContextCompaction);
    }
    None
}

fn tool_family(payload: &Map<String, Value>) -> ItemFamily {
    if map_string(
        payload,
        &["serverName", "server_name", "mcpServer", "mcp_server"],
    )
    .is_some()
    {
        return ItemFamily::McpToolCall;
    }
    let operation = map_string(
        payload,
        &["operation", "collabOperation", "collab_operation"],
    );
    let name = map_string(payload, &["toolName", "tool_name", "name"])
        .unwrap_or_default()
        .to_ascii_lowercase();
    if operation.is_some()
        || matches!(
            name.as_str(),
            "spawn_agent"
                | "send_message"
                | "followup_task"
                | "wait_agent"
                | "interrupt_agent"
                | "resume_agent"
                | "close_agent"
        )
    {
        ItemFamily::CollabAgentToolCall
    } else {
        ItemFamily::Tool
    }
}

fn typed_payload(
    family: ItemFamily,
    event_type: &str,
    payload: &Map<String, Value>,
    fallback_call_id: &str,
    timestamp_ms: i64,
) -> ThreadItemPayload {
    match family {
        ItemFamily::UserMessage => ThreadItemPayload::UserMessage {
            content: message_text(payload),
            client_id: map_string(payload, &["clientId", "client_id"]),
        },
        ItemFamily::AgentMessage => ThreadItemPayload::AgentMessage {
            text: message_text(payload),
            phase: map_string(payload, &["phase", "messagePhase", "message_phase"]),
        },
        ItemFamily::Reasoning => ThreadItemPayload::Reasoning {
            summary: string_list(payload, &["summary", "summaries"]),
            content: string_list(payload, &["content", "text", "delta"]),
        },
        ItemFamily::Tool => ThreadItemPayload::Tool {
            call_id: call_id(payload, fallback_call_id),
            name: map_string(payload, &["toolName", "tool_name", "name"])
                .unwrap_or_else(|| "tool".to_string()),
            arguments: tool_arguments(payload),
            output: tool_output(payload),
        },
        ItemFamily::McpToolCall => ThreadItemPayload::McpToolCall {
            call_id: call_id(payload, fallback_call_id),
            server_name: map_string(
                payload,
                &["serverName", "server_name", "mcpServer", "mcp_server"],
            )
            .unwrap_or_else(|| "unknown".to_string()),
            tool_name: map_string(payload, &["toolName", "tool_name", "name"])
                .unwrap_or_else(|| "tool".to_string()),
            arguments: tool_arguments(payload),
            output: tool_output(payload),
        },
        ItemFamily::CollabAgentToolCall => ThreadItemPayload::CollabAgentToolCall {
            call_id: call_id(payload, fallback_call_id),
            operation: collab_operation(payload),
            target_thread_id: map_string(
                payload,
                &[
                    "targetThreadId",
                    "target_thread_id",
                    "childThreadId",
                    "child_thread_id",
                ],
            )
            .map(ThreadId::new),
            message: map_string(payload, &["message", "prompt", "detail"]),
            output: tool_output(payload),
        },
        ItemFamily::Approval => {
            let decision = approval_decision(event_type, payload);
            let resolved = is_action_resolution_event(event_type);
            let scope = approval_scope(payload, decision);
            ThreadItemPayload::Approval {
                request_id: map_string(
                    payload,
                    &["requestId", "request_id", "actionId", "action_id"],
                )
                .unwrap_or_else(|| fallback_call_id.to_string()),
                action: ApprovalAction {
                    kind: map_string(
                        payload,
                        &["actionType", "action_type", "actionKind", "action_kind"],
                    )
                    .unwrap_or_else(|| "approval".to_string()),
                    description: map_string(
                        payload,
                        &["description", "prompt", "message", "reason"],
                    )
                    .unwrap_or_default(),
                },
                scope,
                available_decisions: approval_available_decisions(payload),
                decision,
                requested_at_ms: (!resolved).then_some(timestamp_ms),
                resolved_at_ms: resolved.then_some(timestamp_ms),
                reason_code: map_string(payload, &["reasonCode", "reason_code", "code"]),
                expires_at_ms: map_i64(payload, &["expiresAtMs", "expires_at_ms"]),
            }
        }
        ItemFamily::Command => ThreadItemPayload::Command {
            command: map_string(payload, &["command", "cmd"])
                .unwrap_or_else(|| "command".to_string()),
            cwd: map_string(payload, &["cwd", "workingDirectory", "working_dir"]),
            output: map_string(payload, &["output", "stdout", "stderr", "result"]),
            exit_code: map_i64(payload, &["exitCode", "exit_code"]).map(|value| value as i32),
        },
        ItemFamily::File => ThreadItemPayload::File {
            path: map_string(payload, &["path", "filePath", "file_path"])
                .unwrap_or_else(|| "unknown".to_string()),
            diff: map_string(payload, &["diff", "patch", "content"]),
            status: file_change_status(event_type, payload),
        },
        ItemFamily::Media => ThreadItemPayload::Media {
            uri: map_string(
                payload,
                &["uri", "url", "artifactRef", "artifact_ref", "path"],
            )
            .unwrap_or_else(|| "unknown".to_string()),
            mime_type: map_string(
                payload,
                &["mimeType", "mime_type", "contentType", "content_type"],
            )
            .unwrap_or_else(|| "application/octet-stream".to_string()),
            preview: map_string(payload, &["preview", "thumbnail", "summary"]),
        },
        ItemFamily::SubAgent => ThreadItemPayload::SubAgent {
            child_thread_id: ThreadId::new(
                map_string(
                    payload,
                    &["childThreadId", "child_thread_id", "threadId", "thread_id"],
                )
                .unwrap_or_else(|| "unknown".to_string()),
            ),
            activity: subagent_activity(event_type, payload),
            detail: map_string(payload, &["detail", "message", "reason", "status"]),
        },
        ItemFamily::ContextCompaction => ThreadItemPayload::ContextCompaction {
            summary: map_string(payload, &["summary", "message", "text"]),
            window_id: map_string(payload, &["windowId", "window_id", "contextWindowId"]),
        },
    }
}

fn payload_source(payload: &Value) -> &Map<String, Value> {
    payload
        .get("item")
        .and_then(Value::as_object)
        .or_else(|| payload.get("data").and_then(Value::as_object))
        .unwrap_or_else(|| payload.as_object().unwrap_or_else(|| empty_object()))
}

fn approval_payload_source(payload: &Value) -> Map<String, Value> {
    let Some(top_level) = payload.as_object() else {
        return Map::new();
    };
    let runtime_event = top_level.get("runtimeEvent").and_then(Value::as_object);
    let mut source = runtime_event
        .and_then(|event| event.get("data"))
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    if let Some(data) = top_level.get("data").and_then(Value::as_object) {
        source.extend(data.clone());
    }
    if let Some(runtime_event) = runtime_event {
        source.extend(
            runtime_event
                .iter()
                .filter(|(key, _)| !matches!(key.as_str(), "type" | "data"))
                .map(|(key, value)| (key.clone(), value.clone())),
        );
    }
    source.extend(
        top_level
            .iter()
            .filter(|(key, _)| {
                !matches!(key.as_str(), "data" | "runtimeEvent")
                    && !(key.as_str() == "request_id"
                        && runtime_event.is_some_and(|event| event.contains_key("request_id")))
            })
            .map(|(key, value)| (key.clone(), value.clone())),
    );
    source
}

fn explicit_item_id(payload: &Map<String, Value>) -> Option<String> {
    map_string(
        payload,
        &[
            "itemId",
            "item_id",
            "messageId",
            "message_id",
            "toolCallId",
            "tool_call_id",
            "commandId",
            "command_id",
            "patchId",
            "patch_id",
            "actionId",
            "action_id",
            "requestId",
            "request_id",
            "artifactId",
            "artifact_id",
            "id",
        ],
    )
}

fn empty_object() -> &'static Map<String, Value> {
    static EMPTY: std::sync::OnceLock<Map<String, Value>> = std::sync::OnceLock::new();
    EMPTY.get_or_init(Map::new)
}

fn value_string(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        value.get(*key).and_then(|candidate| match candidate {
            Value::String(text) if !text.trim().is_empty() => Some(text.clone()),
            Value::Number(number) => Some(number.to_string()),
            Value::Bool(boolean) => Some(boolean.to_string()),
            _ => None,
        })
    })
}

fn value_u64(value: &Value, keys: &[&str]) -> Option<u64> {
    keys.iter().find_map(|key| {
        value.get(*key).and_then(|candidate| match candidate {
            Value::Number(number) => number.as_u64(),
            Value::String(text) => text.parse().ok(),
            _ => None,
        })
    })
}

fn value_i64(value: &Value, keys: &[&str]) -> Option<i64> {
    keys.iter().find_map(|key| {
        value.get(*key).and_then(|candidate| match candidate {
            Value::Number(number) => number.as_i64(),
            Value::String(text) => text.parse().ok(),
            _ => None,
        })
    })
}

fn map_string(value: &Map<String, Value>, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        value.get(*key).and_then(|candidate| match candidate {
            Value::String(text) if !text.trim().is_empty() => Some(text.clone()),
            Value::Number(number) => Some(number.to_string()),
            Value::Bool(boolean) => Some(boolean.to_string()),
            _ => None,
        })
    })
}

fn map_u64(value: &Map<String, Value>, keys: &[&str]) -> Option<u64> {
    keys.iter().find_map(|key| {
        value.get(*key).and_then(|candidate| match candidate {
            Value::Number(number) => number.as_u64(),
            Value::String(text) => text.parse().ok(),
            _ => None,
        })
    })
}

fn map_bool(value: &Map<String, Value>, keys: &[&str]) -> Option<bool> {
    keys.iter().find_map(|key| {
        value.get(*key).and_then(|candidate| match candidate {
            Value::Bool(value) => Some(*value),
            Value::String(value) => value.parse().ok(),
            _ => None,
        })
    })
}

fn map_i64(value: &Map<String, Value>, keys: &[&str]) -> Option<i64> {
    keys.iter().find_map(|key| {
        value.get(*key).and_then(|candidate| match candidate {
            Value::Number(number) => number.as_i64(),
            Value::String(text) => text.parse().ok(),
            _ => None,
        })
    })
}

fn non_empty(value: &str) -> Option<&str> {
    (!value.trim().is_empty()).then_some(value)
}

fn message_text(payload: &Map<String, Value>) -> String {
    map_string(payload, &["text", "delta", "message", "content"])
        .or_else(|| payload.get("content").and_then(content_text))
        .or_else(|| payload.get("deltas").and_then(content_text))
        .or_else(|| {
            payload.get("input").and_then(|input| {
                value_string(input, &["text", "message", "content"])
                    .or_else(|| input.get("content").and_then(content_text))
            })
        })
        .unwrap_or_default()
}

fn content_text(content: &Value) -> Option<String> {
    match content {
        Value::Object(_) => value_string(content, &["text", "message", "content"]),
        Value::Array(parts) => {
            let text = parts
                .iter()
                .filter_map(|part| {
                    part.as_str()
                        .map(str::to_string)
                        .or_else(|| value_string(part, &["text", "message", "content"]))
                })
                .collect::<Vec<_>>()
                .join("");
            (!text.is_empty()).then_some(text)
        }
        Value::String(text) if !text.is_empty() => Some(text.clone()),
        _ => None,
    }
}

fn string_list(payload: &Map<String, Value>, keys: &[&str]) -> Vec<String> {
    keys.iter()
        .find_map(|key| payload.get(*key))
        .map(|value| match value {
            Value::Array(values) => values
                .iter()
                .filter_map(|value| value.as_str().map(str::to_string))
                .collect(),
            Value::String(value) => vec![value.clone()],
            _ => Vec::new(),
        })
        .unwrap_or_default()
}

fn tool_arguments(payload: &Map<String, Value>) -> Vec<agent_protocol::ToolArgument> {
    let Some(arguments) = ["arguments", "args", "input"]
        .iter()
        .find_map(|key| payload.get(*key))
    else {
        return Vec::new();
    };
    match arguments {
        Value::Object(object) => object
            .iter()
            .map(|(name, value)| agent_protocol::ToolArgument {
                name: name.clone(),
                value: compact_value(value),
            })
            .collect(),
        Value::Array(values) => values
            .iter()
            .enumerate()
            .map(|(index, value)| agent_protocol::ToolArgument {
                name: index.to_string(),
                value: compact_value(value),
            })
            .collect(),
        _ => Vec::new(),
    }
}

fn call_id(payload: &Map<String, Value>, fallback: &str) -> String {
    map_string(
        payload,
        &["callId", "call_id", "toolCallId", "tool_call_id"],
    )
    .unwrap_or_else(|| fallback.to_string())
}

fn tool_output(payload: &Map<String, Value>) -> Option<ToolOutput> {
    let raw_output = ["output", "result"]
        .iter()
        .find_map(|key| payload.get(*key));
    let text = raw_output
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| map_string(payload, &["outputText", "output_text"]));
    let structured_content = payload
        .get("structuredContent")
        .or_else(|| payload.get("structured_content"))
        .cloned()
        .or_else(|| raw_output.filter(|value| !value.is_string()).cloned());
    let output = ToolOutput {
        text,
        structured_content,
        error: map_string(payload, &["error", "errorMessage", "error_message"]),
        duration_ms: map_u64(payload, &["durationMs", "duration_ms"]),
        truncated: map_bool(
            payload,
            &["truncated", "outputTruncated", "output_truncated"],
        )
        .unwrap_or(false),
        output_ref: map_string(
            payload,
            &[
                "outputRef",
                "output_ref",
                super::super::output_refs::SIDECAR_REF_FIELD,
                "sidecar_ref",
            ],
        ),
    };
    (output != ToolOutput::default()).then_some(output)
}

fn collab_operation(payload: &Map<String, Value>) -> CollabAgentOperation {
    let value = map_string(
        payload,
        &[
            "operation",
            "collabOperation",
            "collab_operation",
            "toolName",
            "tool_name",
            "name",
        ],
    )
    .unwrap_or_default()
    .to_ascii_lowercase();
    match value.as_str() {
        "send_message" | "sendmessage" => CollabAgentOperation::SendMessage,
        "follow_up" | "followup" | "followup_task" => CollabAgentOperation::FollowUp,
        "wait" | "wait_agent" => CollabAgentOperation::Wait,
        "interrupt" | "interrupt_agent" => CollabAgentOperation::Interrupt,
        "resume" | "resume_agent" => CollabAgentOperation::Resume,
        "close" | "close_agent" => CollabAgentOperation::Close,
        _ => CollabAgentOperation::Spawn,
    }
}

fn compact_value(value: &Value) -> String {
    value
        .as_str()
        .map(str::to_string)
        .unwrap_or_else(|| value.to_string())
}

fn item_status(event_type: &str, payload: &Value) -> ItemStatus {
    if let Some(status) = value_string(payload, &["status", "state"]) {
        match status.to_ascii_lowercase().as_str() {
            "completed" | "complete" | "success" | "succeeded" | "applied" => {
                return ItemStatus::Completed
            }
            "failed" | "error" => return ItemStatus::Failed,
            "cancelled" | "canceled" => return ItemStatus::Cancelled,
            "interrupted" => return ItemStatus::Interrupted,
            _ => {}
        }
    }
    if event_type.ends_with("completed")
        || event_type.ends_with("result")
        || event_type.ends_with("exited")
        || event_type.ends_with("applied")
        || event_type.ends_with("resolved")
    {
        ItemStatus::Completed
    } else if event_type.ends_with("failed") || event_type.ends_with("denied") {
        ItemStatus::Failed
    } else if event_type.ends_with("cancelled") || event_type.ends_with("canceled") {
        ItemStatus::Cancelled
    } else if event_type.ends_with("started") || event_type.ends_with("delta") {
        ItemStatus::InProgress
    } else {
        ItemStatus::Pending
    }
}

fn approval_decision(event_type: &str, payload: &Map<String, Value>) -> Option<ApprovalDecision> {
    let explicit = map_string(
        payload,
        &["decision", "approvalDecision", "approval_decision"],
    )
    .unwrap_or_default()
    .to_ascii_lowercase();
    if explicit.contains("approve")
        || explicit == "allow"
        || explicit == "allowed"
        || explicit == "allow_once"
        || explicit == "allow_for_session"
    {
        if explicit == "allow_for_session"
            || explicit == "approved_for_session"
            || explicit == "approvedforsession"
        {
            Some(ApprovalDecision::ApprovedForSession)
        } else {
            Some(ApprovalDecision::Approved)
        }
    } else if explicit.contains("deny")
        || explicit == "decline"
        || explicit == "declined"
        || explicit == "reject"
        || explicit == "rejected"
    {
        Some(ApprovalDecision::Denied)
    } else if explicit.contains("timeout") || event_type.ends_with("expired") {
        Some(ApprovalDecision::TimedOut)
    } else if matches!(explicit.as_str(), "cancel" | "cancelled" | "canceled")
        || event_type.ends_with("cancelled")
        || event_type.ends_with("canceled")
    {
        Some(ApprovalDecision::Abort)
    } else if event_type.ends_with("required") || explicit == "pending" {
        None
    } else {
        None
    }
}

fn is_action_resolution_event(event_type: &str) -> bool {
    event_type.ends_with("resolved")
        || event_type.ends_with("cancelled")
        || event_type.ends_with("canceled")
        || event_type.ends_with("expired")
}

fn approval_scope(
    payload: &Map<String, Value>,
    decision: Option<ApprovalDecision>,
) -> ApprovalScope {
    if decision == Some(ApprovalDecision::ApprovedForSession) {
        return ApprovalScope::Session;
    }
    match map_string(
        payload,
        &[
            "decisionScope",
            "decision_scope",
            "approvalScope",
            "approval_scope",
            "scope",
        ],
    )
    .unwrap_or_default()
    .to_ascii_lowercase()
    .as_str()
    {
        "turn" => ApprovalScope::Turn,
        "session" => ApprovalScope::Session,
        _ => ApprovalScope::Once,
    }
}

fn approval_available_decisions(payload: &Map<String, Value>) -> Vec<ApprovalDecision> {
    let Some(values) = ["availableDecisions", "available_decisions", "decisions"]
        .iter()
        .find_map(|key| payload.get(*key))
        .and_then(Value::as_array)
    else {
        return Vec::new();
    };
    values
        .iter()
        .filter_map(Value::as_str)
        .filter_map(approval_decision_value)
        .collect()
}

fn approval_decision_value(value: &str) -> Option<ApprovalDecision> {
    match value.to_ascii_lowercase().as_str() {
        "approved" | "approve" | "allow" | "allowed" | "allow_once" => {
            Some(ApprovalDecision::Approved)
        }
        "approved_for_session" | "approvedforsession" | "allow_for_session" => {
            Some(ApprovalDecision::ApprovedForSession)
        }
        "denied" | "deny" | "decline" | "declined" | "reject" | "rejected" => {
            Some(ApprovalDecision::Denied)
        }
        "abort" | "cancelled" | "canceled" | "cancel" => Some(ApprovalDecision::Abort),
        "timed_out" | "timedout" | "timeout" => Some(ApprovalDecision::TimedOut),
        _ => None,
    }
}

fn file_change_status(event_type: &str, payload: &Map<String, Value>) -> FileChangeStatus {
    match map_string(payload, &["status", "state"])
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "applied" => FileChangeStatus::Applied,
        "rejected" | "denied" => FileChangeStatus::Rejected,
        "failed" | "error" => FileChangeStatus::Failed,
        _ if event_type.ends_with("applied") => FileChangeStatus::Applied,
        _ if event_type.ends_with("failed") => FileChangeStatus::Failed,
        _ => FileChangeStatus::Proposed,
    }
}

fn subagent_activity(event_type: &str, payload: &Map<String, Value>) -> SubAgentActivityKind {
    let value = map_string(payload, &["activity", "kind", "status"])
        .unwrap_or_else(|| {
            event_type
                .rsplit('.')
                .next()
                .unwrap_or_default()
                .to_string()
        })
        .to_ascii_lowercase();
    match value.as_str() {
        "spawned" | "started" => SubAgentActivityKind::Spawned,
        "message" | "message_sent" | "sent" => SubAgentActivityKind::MessageSent,
        "waiting" => SubAgentActivityKind::Waiting,
        "resumed" => SubAgentActivityKind::Resumed,
        "completed" | "complete" => SubAgentActivityKind::Completed,
        "failed" | "error" => SubAgentActivityKind::Failed,
        "closed" | "cancelled" | "canceled" => SubAgentActivityKind::Closed,
        _ => SubAgentActivityKind::Waiting,
    }
}

fn turn_queue_state(event: &AgentEvent) -> TurnQueueState {
    match event.event_type.as_str() {
        "turn.queued" | "queue.added" => TurnQueueState::Queued {
            position: value_u64(
                &event.payload,
                &["position", "queuePosition", "queue_position"],
            )
            .map(|value| value.min(u32::MAX as u64) as u32),
        },
        "turn.accepted" | "turn.started" => TurnQueueState::Running,
        _ => TurnQueueState::default(),
    }
}

fn queued_turn_id(event: &AgentEvent) -> Option<String> {
    value_string(&event.payload, &["queuedTurnId", "queued_turn_id"])
}

fn turn_approval_state(event: &AgentEvent) -> TurnApprovalState {
    match event.event_type.as_str() {
        "action.required" | "approval.required" => TurnApprovalState::Pending,
        "action.resolved" | "approval.resolved" => {
            match approval_decision(event.event_type.as_str(), payload_source(&event.payload)) {
                Some(ApprovalDecision::Approved | ApprovalDecision::ApprovedForSession) => {
                    TurnApprovalState::Approved
                }
                Some(ApprovalDecision::Denied) => TurnApprovalState::Denied,
                Some(ApprovalDecision::Abort) => TurnApprovalState::Cancelled,
                Some(ApprovalDecision::TimedOut) => TurnApprovalState::TimedOut,
                None => TurnApprovalState::Resolved,
            }
        }
        "action.cancelled" | "action.canceled" | "approval.cancelled" => {
            TurnApprovalState::Cancelled
        }
        "action.expired" | "approval.expired" => TurnApprovalState::TimedOut,
        _ => TurnApprovalState::default(),
    }
}

fn event_timestamp_ms(event: &AgentEvent) -> i64 {
    parse_timestamp_ms(&event.timestamp)
        .or_else(|| {
            value_i64(
                &event.payload,
                &["timestampMs", "timestamp_ms", "createdAtMs"],
            )
        })
        .unwrap_or(event.sequence as i64)
}

fn parse_timestamp_ms(value: &str) -> Option<i64> {
    DateTime::<FixedOffset>::parse_from_rfc3339(value)
        .ok()
        .map(|date| date.timestamp_millis())
}

fn rollback_target(event: &AgentEvent) -> Option<u64> {
    if !matches!(
        event.event_type.as_str(),
        "turn.rollback" | "history.rollback" | "thread.rollback" | "turn.canceled"
    ) {
        return value_u64(
            &event.payload,
            &["rollbackToSequence", "rollback_to_sequence"],
        );
    }
    value_u64(
        &event.payload,
        &[
            "rollbackToSequence",
            "rollback_to_sequence",
            "targetSequence",
            "target_sequence",
            "sequence",
        ],
    )
}
