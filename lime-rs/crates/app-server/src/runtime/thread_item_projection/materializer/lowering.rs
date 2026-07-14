use super::fields::{
    compact_value, explicit_item_id, map_bool, map_i64, map_string, map_u64, message_text,
    payload_source, string_list,
};
use super::lifecycle::{approval_decision, is_action_resolution_event};
use agent_protocol::{
    ApprovalAction, ApprovalDecision, ApprovalScope, CollabAgentOperation, FileChangeStatus,
    SubAgentActivityKind, ThreadId, ThreadItemPayload, ToolOutput,
};
use serde_json::{Map, Value};

#[derive(Clone, Copy)]
pub(super) enum ItemFamily {
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
    pub(super) fn explicit_item_id(self, payload: &Map<String, Value>) -> Option<String> {
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

    pub(super) fn fallback_id(self, turn_id: &str, event_id: &str) -> String {
        match self {
            Self::UserMessage | Self::AgentMessage | Self::Reasoning | Self::ContextCompaction => {
                format!("{}-{turn_id}", self.stable_name())
            }
            _ => format!("{}-{event_id}", self.stable_name()),
        }
    }
}

pub(super) fn item_family(event_type: &str, payload: &Value) -> Option<ItemFamily> {
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
        let role = super::fields::value_string(payload, &["role", "author"]).unwrap_or_default();
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
    if normalized == "approval.session_cache.hit" {
        return None;
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

pub(super) fn typed_payload(
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
                super::super::super::output_refs::SIDECAR_REF_FIELD,
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
        "started" => SubAgentActivityKind::Started,
        "interrupted" => SubAgentActivityKind::Interrupted,
        _ => SubAgentActivityKind::Interacted,
    }
}
