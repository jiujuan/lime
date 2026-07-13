use super::sidecar_store::{
    session_scoped_relative_path, SidecarRef, SidecarStore, SidecarWriteRequest,
};
use super::RuntimeCoreError;
use agent_protocol::{ItemStatus, ThreadItem, ThreadItemPayload};
use app_server_protocol::{AgentEvent, AgentSession, AgentTurn};
use chrono::{SecondsFormat, Utc};
use serde_json::{json, Value};

const COMPACTION_ARTIFACT_SCHEMA: &str = "session_context_compaction.v1";
const MAX_SUMMARY_CHARS: usize = 12_000;
const MAX_TAIL_TURNS: usize = 4;

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct SessionContextCompaction {
    pub(crate) compaction_id: String,
    pub(crate) context_epoch: u64,
    pub(crate) tail_start_turn_id: Option<String>,
    pub(crate) summary: String,
    pub(crate) artifact: Value,
    pub(crate) sidecar_ref: Option<SidecarRef>,
}

pub(crate) fn build_session_context_compaction(
    session: &AgentSession,
    turns: &[AgentTurn],
    events: &[AgentEvent],
    sidecar_store: Option<&SidecarStore>,
) -> Result<SessionContextCompaction, RuntimeCoreError> {
    let context_epoch = existing_compaction_count(events).saturating_add(1);
    let compaction_id = format!(
        "ctx_compact_{}_{}",
        safe_id_part(&session.session_id),
        context_epoch
    );
    let tail_start_turn_id = tail_start_turn_id(turns);
    let summary = build_summary(session, turns, events, tail_start_turn_id.as_deref());
    let artifact = json!({
        "schema": COMPACTION_ARTIFACT_SCHEMA,
        "compactionId": compaction_id,
        "sessionId": session.session_id,
        "threadId": session.thread_id,
        "contextEpoch": context_epoch,
        "tailStartTurnId": tail_start_turn_id,
        "turnCount": turns.len(),
        "eventCount": events.len(),
        "createdAt": Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true),
        "summary": summary,
        "policy": {
            "historyRewrite": false,
            "longTermMemoryWrite": false,
            "artifactScope": "session"
        }
    });
    let sidecar_ref = if let Some(sidecar_store) = sidecar_store {
        let content = serde_json::to_string_pretty(&artifact).map_err(|error| {
            RuntimeCoreError::Backend(format!("failed to encode compaction artifact: {error}"))
        })?;
        Some(
            sidecar_store
                .write_text(&SidecarWriteRequest {
                    session_id: session.session_id.clone(),
                    kind: "context_compaction".to_string(),
                    logical_id: compaction_id.clone(),
                    relative_path: session_scoped_relative_path(
                        &session.session_id,
                        &format!("context-compaction/{compaction_id}.json"),
                    ),
                    content,
                })
                .map_err(RuntimeCoreError::Backend)?,
        )
    } else {
        None
    };

    Ok(SessionContextCompaction {
        compaction_id,
        context_epoch,
        tail_start_turn_id,
        summary,
        artifact,
        sidecar_ref,
    })
}

fn existing_compaction_count(events: &[AgentEvent]) -> u64 {
    events
        .iter()
        .filter(|event| event.event_type == "context.compaction.completed")
        .count() as u64
}

fn tail_start_turn_id(turns: &[AgentTurn]) -> Option<String> {
    let completed = turns
        .iter()
        .filter(|turn| matches!(turn.status, app_server_protocol::AgentTurnStatus::Completed))
        .collect::<Vec<_>>();
    if completed.len() <= MAX_TAIL_TURNS {
        return completed.first().map(|turn| turn.turn_id.clone());
    }
    completed
        .get(completed.len().saturating_sub(MAX_TAIL_TURNS))
        .map(|turn| turn.turn_id.clone())
}

fn build_summary(
    session: &AgentSession,
    turns: &[AgentTurn],
    events: &[AgentEvent],
    tail_start_turn_id: Option<&str>,
) -> String {
    let mut lines = vec![
        "# Session Context Compaction".to_string(),
        format!("- Session: {}", session.session_id),
        format!("- Thread: {}", session.thread_id),
        format!("- Turns: {}", turns.len()),
    ];
    if let Some(tail_start_turn_id) = tail_start_turn_id {
        lines.push(format!("- Tail starts at turn: {tail_start_turn_id}"));
    }
    lines.push(String::new());
    lines.push("## Retained Recent Turns".to_string());

    let tail_turn_ids = tail_turn_ids(turns, tail_start_turn_id);
    for turn_id in tail_turn_ids {
        lines.push(format!("### {turn_id}"));
        for event in events
            .iter()
            .filter(|event| event.turn_id.as_deref() == Some(turn_id.as_str()))
        {
            if let Some(text) = event_summary_line(event) {
                lines.push(format!("- {text}"));
            }
        }
    }

    lines.push(String::new());
    lines.push("## Guardrails".to_string());
    lines.push("- This artifact summarizes session context for continuation only.".to_string());
    lines.push(
        "- It does not rewrite turn history and does not write long-term memory.".to_string(),
    );
    lines.push("- Use original events or tools for details that matter.".to_string());

    truncate_chars(&lines.join("\n"), MAX_SUMMARY_CHARS)
}

fn tail_turn_ids(turns: &[AgentTurn], tail_start_turn_id: Option<&str>) -> Vec<String> {
    let Some(tail_start_turn_id) = tail_start_turn_id else {
        return turns.iter().map(|turn| turn.turn_id.clone()).collect();
    };
    let start = turns
        .iter()
        .position(|turn| turn.turn_id == tail_start_turn_id)
        .unwrap_or(0);
    turns[start..]
        .iter()
        .map(|turn| turn.turn_id.clone())
        .collect()
}

fn event_summary_line(event: &AgentEvent) -> Option<String> {
    match event.event_type.as_str() {
        "message.created" => payload_text(&event.payload).map(|text| format!("User: {text}")),
        "message.delta" | "message.delta_batch" | "message.batch" => {
            payload_text(&event.payload).map(|text| format!("Assistant: {text}"))
        }
        "item.started" => canonical_tool(event).map(|(name, _)| format!("Tool started: {name}")),
        "item.completed" => canonical_tool(event).and_then(|(name, status)| {
            let state = match status {
                ItemStatus::Completed => "completed",
                ItemStatus::Failed => "failed",
                ItemStatus::Interrupted => "interrupted",
                ItemStatus::Cancelled => "cancelled",
                ItemStatus::Pending | ItemStatus::InProgress => return None,
            };
            Some(format!("Tool {state}: {name}"))
        }),
        "turn.completed" => Some("Turn completed.".to_string()),
        "turn.failed" => Some(format!(
            "Turn failed: {}",
            payload_string(&event.payload, &["message", "error"]).unwrap_or("unknown")
        )),
        "turn.canceled" => Some("Turn canceled.".to_string()),
        _ => None,
    }
    .map(|line| truncate_chars(&line, 500))
}

fn canonical_tool(event: &AgentEvent) -> Option<(String, ItemStatus)> {
    let item = serde_json::from_value::<ThreadItem>(event.payload.get("item")?.clone()).ok()?;
    let ThreadItemPayload::Tool { name, .. } = item.payload else {
        return None;
    };
    Some((name, item.status))
}

fn payload_text(payload: &Value) -> Option<String> {
    payload_string(payload, &["text"])
        .or_else(|| {
            payload
                .get("content")
                .and_then(|content| payload_string(content, &["text", "message"]))
        })
        .or_else(|| {
            payload
                .get("input")
                .and_then(|input| payload_string(input, &["text"]))
        })
        .map(str::to_string)
}

fn payload_string<'a>(payload: &'a Value, keys: &[&str]) -> Option<&'a str> {
    keys.iter()
        .filter_map(|key| payload.get(*key))
        .find_map(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn truncate_chars(value: &str, max_chars: usize) -> String {
    let mut output = value.chars().take(max_chars).collect::<String>();
    if value.chars().count() > max_chars {
        output.push_str("\n[truncated]");
    }
    output
}

fn safe_id_part(value: &str) -> String {
    let part = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_') {
                ch
            } else {
                '_'
            }
        })
        .collect::<String>();
    let part = part.trim_matches('_');
    if part.is_empty() {
        "session".to_string()
    } else {
        part.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_protocol::{
        ItemId, ItemKind, ItemStatus, SessionId, ThreadId, ToolArgument, ToolOutput, TurnId,
    };
    use app_server_protocol::{AgentSessionStatus, AgentTurnStatus};

    fn tool_event(sequence: u64, event_type: &str, status: ItemStatus) -> AgentEvent {
        let item = ThreadItem {
            session_id: SessionId::new("sess"),
            thread_id: ThreadId::new("thread"),
            turn_id: TurnId::new("turn_1"),
            item_id: ItemId::new("call-read"),
            sequence,
            ordinal: 1,
            created_at_ms: 1,
            updated_at_ms: 2,
            completed_at_ms: status.is_terminal().then_some(2),
            kind: ItemKind::Tool,
            status,
            payload: ThreadItemPayload::Tool {
                call_id: "call-read".to_string(),
                name: "Read".to_string(),
                arguments: vec![ToolArgument {
                    name: "path".to_string(),
                    value: "README.md".to_string(),
                }],
                output: Some(ToolOutput {
                    text: Some("contents".to_string()),
                    ..ToolOutput::default()
                }),
            },
            metadata: Value::Null,
        };
        AgentEvent {
            event_id: format!("evt-{sequence}"),
            sequence,
            session_id: "sess".to_string(),
            thread_id: Some("thread".to_string()),
            turn_id: Some("turn_1".to_string()),
            event_type: event_type.to_string(),
            timestamp: "now".to_string(),
            payload: json!({ "item": item }),
        }
    }

    #[test]
    fn compaction_artifact_does_not_claim_memory_write() {
        let session = AgentSession {
            session_id: "sess".to_string(),
            thread_id: "thread".to_string(),
            app_id: "desktop".to_string(),
            workspace_id: None,
            business_object_ref: None,
            status: AgentSessionStatus::Idle,
            created_at: "now".to_string(),
            updated_at: "now".to_string(),
        };
        let turns = vec![AgentTurn {
            turn_id: "turn_1".to_string(),
            session_id: "sess".to_string(),
            thread_id: "thread".to_string(),
            status: AgentTurnStatus::Completed,
            started_at: None,
            completed_at: None,
        }];
        let events = vec![AgentEvent {
            event_id: "evt".to_string(),
            sequence: 1,
            session_id: "sess".to_string(),
            thread_id: Some("thread".to_string()),
            turn_id: Some("turn_1".to_string()),
            event_type: "message.created".to_string(),
            timestamp: "now".to_string(),
            payload: json!({"content": {"text": "hello"}}),
        }];

        let artifact =
            build_session_context_compaction(&session, &turns, &events, None).expect("artifact");

        assert_eq!(artifact.context_epoch, 1);
        assert_eq!(artifact.artifact["policy"]["historyRewrite"], false);
        assert_eq!(artifact.artifact["policy"]["longTermMemoryWrite"], false);
        assert!(artifact.summary.contains("User: hello"));
    }

    #[test]
    fn tool_summary_uses_canonical_nested_thread_item() {
        assert_eq!(
            event_summary_line(&tool_event(1, "item.started", ItemStatus::InProgress)),
            Some("Tool started: Read".to_string())
        );
        for (sequence, status, expected) in [
            (2, ItemStatus::Completed, "Tool completed: Read"),
            (3, ItemStatus::Failed, "Tool failed: Read"),
            (4, ItemStatus::Interrupted, "Tool interrupted: Read"),
            (5, ItemStatus::Cancelled, "Tool cancelled: Read"),
        ] {
            assert_eq!(
                event_summary_line(&tool_event(sequence, "item.completed", status)),
                Some(expected.to_string())
            );
        }
        assert_eq!(
            event_summary_line(&tool_event(6, "item.completed", ItemStatus::InProgress)),
            None
        );
    }

    #[test]
    fn raw_tool_events_do_not_enter_compaction_summary() {
        for event_type in [
            "tool.started",
            "tool.result",
            "tool.failed",
            "tool.completed",
        ] {
            let event = AgentEvent {
                event_id: format!("evt-{event_type}"),
                sequence: 1,
                session_id: "sess".to_string(),
                thread_id: Some("thread".to_string()),
                turn_id: Some("turn_1".to_string()),
                event_type: event_type.to_string(),
                timestamp: "now".to_string(),
                payload: json!({ "toolName": "Read" }),
            };
            assert_eq!(event_summary_line(&event), None, "{event_type}");
        }
    }
}
