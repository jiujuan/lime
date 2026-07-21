use super::sidecar_store::{
    session_scoped_relative_path, SidecarRef, SidecarStore, SidecarWriteRequest,
};
use super::RuntimeCoreError;
use agent_protocol::{ItemStatus, ThreadItem, ThreadItemPayload};
use app_server_protocol::{AgentEvent, AgentSession, AgentTurn};
use chrono::{SecondsFormat, Utc};
use serde_json::{json, Value};
use uuid::Uuid;

const COMPACTION_ARTIFACT_SCHEMA: &str = "session_context_compaction.v2";
const MAX_SUMMARY_CHARS: usize = 12_000;
const MAX_TAIL_TURNS: usize = 4;

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct SessionContextCompaction {
    pub(crate) compaction_id: String,
    pub(crate) context_epoch: u64,
    pub(crate) tail_start_turn_id: Option<String>,
    pub(crate) window: CompactionWindow,
    pub(crate) summary: String,
    pub(crate) artifact: Value,
    pub(crate) sidecar_ref: Option<SidecarRef>,
}

/// Durable context-window lineage for provider-visible history replacement.
///
/// `replacement_history` is the model-visible replacement for the compacted prefix. The raw
/// event history remains durable; only provider history uses this bounded replacement plus the
/// surviving tail.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct CompactionWindow {
    pub(crate) replacement_history: Vec<Value>,
    pub(crate) window_number: u64,
    pub(crate) first_window_id: String,
    pub(crate) previous_window_id: Option<String>,
    pub(crate) window_id: String,
}

pub(crate) fn build_session_context_compaction(
    session: &AgentSession,
    turns: &[AgentTurn],
    events: &[AgentEvent],
    sidecar_store: Option<&SidecarStore>,
) -> Result<SessionContextCompaction, RuntimeCoreError> {
    let context_epoch = next_compaction_window_number(events);
    let compaction_id = format!(
        "ctx_compact_{}_{}",
        safe_id_part(&session.session_id),
        context_epoch
    );
    let tail_start_turn_id = tail_start_turn_id(turns);
    let summary = build_summary(session, turns, events, tail_start_turn_id.as_deref());
    let window = build_compaction_window(
        context_epoch,
        &summary,
        turns,
        events,
        tail_start_turn_id.as_deref(),
    );
    let artifact = json!({
        "schema": COMPACTION_ARTIFACT_SCHEMA,
        "compactionId": compaction_id,
        "sessionId": session.session_id,
        "threadId": session.thread_id,
        "contextEpoch": context_epoch,
        "tailStartTurnId": tail_start_turn_id,
        "replacementHistory": window.replacement_history,
        "windowNumber": window.window_number,
        "firstWindowId": window.first_window_id,
        "previousWindowId": window.previous_window_id,
        "windowId": window.window_id,
        "turnCount": turns.len(),
        "eventCount": events.len(),
        "createdAt": Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true),
        "summary": summary,
        "policy": {
            "durableHistoryRewrite": false,
            "providerHistoryRewrite": true,
            "providerTailMode": "from_tail_start_turn",
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
        window,
        summary,
        artifact,
        sidecar_ref,
    })
}

fn build_compaction_window(
    window_number: u64,
    summary: &str,
    turns: &[AgentTurn],
    events: &[AgentEvent],
    tail_start_turn_id: Option<&str>,
) -> CompactionWindow {
    let window_id = Uuid::now_v7().to_string();
    let previous = latest_compaction_window(events);
    let first_window_id = previous
        .as_ref()
        .map(|window| window.first_window_id.clone())
        .unwrap_or_else(|| window_id.clone());
    let previous_window_id = previous.map(|window| window.window_id);

    CompactionWindow {
        replacement_history: build_replacement_history(summary, turns, events, tail_start_turn_id),
        window_number,
        first_window_id,
        previous_window_id,
        window_id,
    }
}

fn latest_compaction_window(events: &[AgentEvent]) -> Option<CompactionWindow> {
    events
        .iter()
        .rev()
        .find(|event| event.event_type == "context.compaction.completed")
        .and_then(|event| {
            let field = |name: &str| {
                event
                    .payload
                    .get("artifact")
                    .filter(|value| value.is_object())
                    .and_then(|artifact| artifact.get(name))
                    .or_else(|| event.payload.get(name))
            };
            let window_number = field("windowNumber")?.as_u64()?;
            let first_window_id = field("firstWindowId")?.as_str()?.to_string();
            let window_id = field("windowId")?.as_str()?.to_string();
            let replacement_history = field("replacementHistory")?.as_array()?.clone();
            if first_window_id.trim().is_empty() || window_id.trim().is_empty() {
                return None;
            }
            Some(CompactionWindow {
                replacement_history,
                window_number,
                first_window_id,
                previous_window_id: field("previousWindowId")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                window_id,
            })
        })
}

fn build_replacement_history(
    summary: &str,
    turns: &[AgentTurn],
    events: &[AgentEvent],
    tail_start_turn_id: Option<&str>,
) -> Vec<Value> {
    // Keep the most recent user boundaries within the budget, then append the summary. The
    // durable event log remains unchanged.
    let compacted_turn_ids = compacted_turn_ids(turns, tail_start_turn_id);
    let mut selected = Vec::new();
    let mut remaining_chars = MAX_SUMMARY_CHARS;
    for event in events
        .iter()
        .rev()
        .filter(|event| is_compacted_user_message(event, &compacted_turn_ids))
    {
        let Some(text) = payload_text(&event.payload) else {
            continue;
        };
        if remaining_chars == 0 {
            break;
        }
        let text = truncate_chars(&text, remaining_chars);
        remaining_chars = remaining_chars.saturating_sub(text.chars().count());
        let mut item = json!({
            "type": "message",
            "role": "user",
            "content": [{"type": "input_text", "text": text}],
        });
        if let Some(turn_id) = event.turn_id.as_deref() {
            item["turnId"] = json!(turn_id);
        }
        selected.push(item);
    }
    selected.reverse();
    let mut history = selected;
    history.push(json!({
        "type": "message",
        "role": "user",
        "content": [{
            "type": "input_text",
            "text": if summary.is_empty() { "(no summary available)" } else { summary }
        }],
    }));
    history
}

fn is_compacted_user_message(event: &AgentEvent, compacted_turn_ids: &[String]) -> bool {
    event.event_type == "message.created"
        && event
            .turn_id
            .as_deref()
            .is_some_and(|turn_id| compacted_turn_ids.iter().any(|id| id == turn_id))
}

fn next_compaction_window_number(events: &[AgentEvent]) -> u64 {
    latest_compaction_window(events)
        .map(|window| window.window_number.saturating_add(1))
        .unwrap_or_else(|| existing_compaction_count(events).saturating_add(1))
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
    lines.push("## Compacted Earlier Turns".to_string());

    let compacted_turn_ids = compacted_turn_ids(turns, tail_start_turn_id);
    if compacted_turn_ids.is_empty() {
        lines.push(
            "- No earlier turns were removed; the provider retains the bounded recent tail."
                .to_string(),
        );
    }
    for turn_id in compacted_turn_ids {
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

fn compacted_turn_ids(turns: &[AgentTurn], tail_start_turn_id: Option<&str>) -> Vec<String> {
    let Some(tail_start_turn_id) = tail_start_turn_id else {
        return Vec::new();
    };
    let start = turns
        .iter()
        .position(|turn| turn.turn_id == tail_start_turn_id)
        .unwrap_or(turns.len());
    turns[..start]
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
        "message.completed" => {
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
        assert_eq!(artifact.window.window_number, 1);
        assert_eq!(
            uuid::Uuid::parse_str(&artifact.window.first_window_id)
                .expect("first window id")
                .get_version_num(),
            7
        );
        assert_eq!(artifact.window.previous_window_id, None);
        assert_eq!(artifact.window.window_id, artifact.window.first_window_id);
        assert_eq!(artifact.artifact["windowNumber"].as_u64(), Some(1));
        assert_eq!(artifact.artifact["replacementHistory"][0]["role"], "user");
        assert_eq!(
            artifact.artifact["replacementHistory"][0]["type"],
            "message"
        );
        assert_eq!(artifact.artifact["policy"]["durableHistoryRewrite"], false);
        assert_eq!(artifact.artifact["policy"]["providerHistoryRewrite"], true);
        assert_eq!(artifact.artifact["policy"]["longTermMemoryWrite"], false);
        assert!(artifact.summary.contains("No earlier turns were removed"));
    }

    #[test]
    fn replacement_history_keeps_compacted_user_boundaries_before_summary() {
        let session = AgentSession {
            session_id: "sess-prefix".to_string(),
            thread_id: "thread-prefix".to_string(),
            app_id: "desktop".to_string(),
            workspace_id: None,
            business_object_ref: None,
            status: AgentSessionStatus::Idle,
            created_at: "now".to_string(),
            updated_at: "now".to_string(),
        };
        let turns = (1..=5)
            .map(|index| AgentTurn {
                turn_id: format!("turn-{index}"),
                session_id: session.session_id.clone(),
                thread_id: session.thread_id.clone(),
                status: AgentTurnStatus::Completed,
                started_at: None,
                completed_at: None,
            })
            .collect::<Vec<_>>();
        let events = vec![
            AgentEvent {
                event_id: "evt-old".to_string(),
                sequence: 1,
                session_id: session.session_id.clone(),
                thread_id: Some(session.thread_id.clone()),
                turn_id: Some("turn-1".to_string()),
                event_type: "message.created".to_string(),
                timestamp: "now".to_string(),
                payload: json!({"input": {"text": "old boundary"}}),
            },
            AgentEvent {
                event_id: "evt-tail".to_string(),
                sequence: 2,
                session_id: session.session_id.clone(),
                thread_id: Some(session.thread_id.clone()),
                turn_id: Some("turn-5".to_string()),
                event_type: "message.created".to_string(),
                timestamp: "now".to_string(),
                payload: json!({"input": {"text": "tail boundary"}}),
            },
        ];

        let artifact =
            build_session_context_compaction(&session, &turns, &events, None).expect("artifact");
        let replacement = artifact
            .artifact
            .get("replacementHistory")
            .and_then(Value::as_array)
            .expect("replacement history");
        assert_eq!(replacement.len(), 2);
        assert_eq!(replacement[0]["role"], "user");
        assert_eq!(replacement[0]["turnId"], "turn-1");
        assert_eq!(replacement[0]["content"][0]["text"], "old boundary");
        assert_eq!(
            replacement[1]["content"][0]["text"].as_str(),
            Some(artifact.summary.as_str())
        );
    }

    #[test]
    fn replacement_history_keeps_the_most_recent_user_boundaries_within_budget() {
        let turns = (1..=4)
            .map(|index| AgentTurn {
                turn_id: format!("turn-{index}"),
                session_id: "sess-budget".to_string(),
                thread_id: "thread-budget".to_string(),
                status: AgentTurnStatus::Completed,
                started_at: None,
                completed_at: None,
            })
            .collect::<Vec<_>>();
        let events = (1..=3)
            .map(|index| AgentEvent {
                event_id: format!("evt-{index}"),
                sequence: index,
                session_id: "sess-budget".to_string(),
                thread_id: Some("thread-budget".to_string()),
                turn_id: Some(format!("turn-{index}")),
                event_type: "message.created".to_string(),
                timestamp: "now".to_string(),
                payload: json!({"input": {"text": index.to_string().repeat(6_000)}}),
            })
            .collect::<Vec<_>>();

        let replacement = build_replacement_history("summary", &turns, &events, Some("turn-4"));

        assert_eq!(replacement.len(), 3);
        assert_eq!(replacement[0]["turnId"], "turn-2");
        assert_eq!(replacement[1]["turnId"], "turn-3");
        assert_eq!(replacement[2]["content"][0]["text"], "summary");
    }

    #[test]
    fn compaction_windows_preserve_replacement_history_lineage() {
        let session = AgentSession {
            session_id: "sess-lineage".to_string(),
            thread_id: "thread-lineage".to_string(),
            app_id: "desktop".to_string(),
            workspace_id: None,
            business_object_ref: None,
            status: AgentSessionStatus::Idle,
            created_at: "now".to_string(),
            updated_at: "now".to_string(),
        };
        let turns = vec![AgentTurn {
            turn_id: "turn-lineage".to_string(),
            session_id: "sess-lineage".to_string(),
            thread_id: "thread-lineage".to_string(),
            status: AgentTurnStatus::Completed,
            started_at: None,
            completed_at: None,
        }];
        let event = AgentEvent {
            event_id: "evt-lineage".to_string(),
            sequence: 1,
            session_id: "sess-lineage".to_string(),
            thread_id: Some("thread-lineage".to_string()),
            turn_id: Some("turn-lineage".to_string()),
            event_type: "message.created".to_string(),
            timestamp: "now".to_string(),
            payload: json!({"content": {"text": "hello"}}),
        };

        let first = build_session_context_compaction(&session, &turns, &[event], None)
            .expect("first compaction");
        let previous = AgentEvent {
            event_id: "evt-compaction-1".to_string(),
            sequence: 2,
            session_id: session.session_id.clone(),
            thread_id: Some(session.thread_id.clone()),
            turn_id: Some("turn-lineage".to_string()),
            event_type: "context.compaction.completed".to_string(),
            timestamp: "now".to_string(),
            payload: json!({"artifact": first.artifact}),
        };
        let second = build_session_context_compaction(&session, &turns, &[previous], None)
            .expect("second compaction");

        assert_eq!(second.window.window_number, 2);
        assert_eq!(second.window.first_window_id, first.window.first_window_id);
        assert_eq!(
            second.window.previous_window_id,
            Some(first.window.window_id.clone())
        );
        assert_ne!(second.window.window_id, first.window.window_id);
        assert_eq!(
            Uuid::parse_str(&second.window.window_id)
                .expect("second window id")
                .get_version_num(),
            7
        );
        assert_eq!(second.window.replacement_history.len(), 1);

        let imported = AgentEvent {
            event_id: "evt-imported-compaction".to_string(),
            sequence: 3,
            session_id: session.session_id.clone(),
            thread_id: Some(session.thread_id.clone()),
            turn_id: Some("turn-lineage".to_string()),
            event_type: "context.compaction.completed".to_string(),
            timestamp: "now".to_string(),
            payload: json!({
                "windowNumber": 7,
                "firstWindowId": "ctx_window_imported_1",
                "previousWindowId": "ctx_window_imported_6",
                "windowId": "ctx_window_imported_7",
                "replacementHistory": [{"role": "assistant", "content": "summary"}]
            }),
        };
        let resumed = build_session_context_compaction(&session, &turns, &[imported], None)
            .expect("imported compaction");
        assert_eq!(resumed.window.window_number, 8);
        assert_eq!(resumed.window.first_window_id, "ctx_window_imported_1");
        assert_eq!(
            resumed.window.previous_window_id,
            Some("ctx_window_imported_7".to_string())
        );
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
