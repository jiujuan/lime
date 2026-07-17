//! App Server current event store 到 provider transcript 的投影。
//!
//! Codex 的 history 是有序 response item，而不是 UI 聚合后的消息文本。本模块直接从
//! RuntimeCore 已持久化的 user/message/tool 事件恢复 provider 所需的最小 item 顺序，
//! 避免任何旧 session 或 provider adapter 参与多轮采样。

use super::StoredSession;
use agent_protocol::{ItemStatus, ThreadItem, ThreadItemPayload, ToolArgument};
use app_server_protocol::{AgentAttachment, AgentEvent, AgentInput};
use model_provider::current_client::{
    CurrentProviderContent, CurrentProviderMessage, CurrentProviderToolCall,
    CurrentProviderToolResult,
};
use serde_json::Value;
use std::collections::HashMap;

const PROVIDER_TOOL_OUTPUT_MAX_BYTES: usize = 10_000;

/// Current turn input is supplied separately to the provider. It remains durable and visible in
/// the canonical Item log, but must not be submitted twice in the same provider request.
pub(in crate::runtime) fn provider_history_excluding_current_turn_input(
    stored: &StoredSession,
    sidecar_store: Option<&super::SidecarStore>,
    turn_id: &str,
) -> Result<Vec<CurrentProviderMessage>, super::RuntimeCoreError> {
    let events = provider_history_events(stored)
        .into_iter()
        .filter(|event| {
            event.turn_id.as_deref() != Some(turn_id)
                || !super::turn_input_events::is_turn_input_event(event)
        })
        .collect::<Vec<_>>();
    messages_from_events_with_provider_input(&events, |input| {
        super::input_media::provider_input_from_references(input, sidecar_store)
    })
    .map_err(super::RuntimeCoreError::Backend)
}

fn provider_history_events(stored: &StoredSession) -> Vec<AgentEvent> {
    let Some(tail_start_turn_id) = stored
        .events
        .iter()
        .rev()
        .find(|event| event.event_type == "context.compaction.completed")
        .and_then(|event| event.payload.get("tailStartTurnId"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return stored.events.clone();
    };

    let Some(start_index) = stored
        .events
        .iter()
        .position(|event| event.turn_id.as_deref() == Some(tail_start_turn_id))
    else {
        // A malformed or imported compaction marker must never discard history.
        return stored.events.clone();
    };
    stored.events[start_index..].to_vec()
}

pub(crate) fn reply_input_from_agent_input(
    input: &AgentInput,
) -> agent_runtime::reply_input::RuntimeReplyInput {
    let images = input
        .attachments
        .iter()
        .filter_map(image_from_attachment)
        .collect();
    agent_runtime::reply_input::RuntimeReplyInput {
        text: input.text.clone(),
        images,
        agent_only: false,
    }
}

#[cfg(test)]
fn messages_from_events(events: &[AgentEvent]) -> Vec<CurrentProviderMessage> {
    messages_from_events_with_provider_input(events, |input| Ok(input.clone()))
        .expect("identity provider input projection cannot fail")
}

fn messages_from_events_with_provider_input<G>(
    events: &[AgentEvent],
    mut provider_input: G,
) -> Result<Vec<CurrentProviderMessage>, String>
where
    G: FnMut(&AgentInput) -> Result<AgentInput, String>,
{
    let mut messages = Vec::new();
    let mut assistant_content = Vec::new();
    let mut assistant_text_by_item = HashMap::new();
    let mut tool_results = Vec::new();

    for event in events {
        match event.event_type.as_str() {
            "message.created" => {
                flush_assistant(
                    &mut messages,
                    &mut assistant_content,
                    &mut assistant_text_by_item,
                );
                flush_tool_results(&mut messages, &mut tool_results);
                if let Some(message) = user_message_from_event(event, &mut provider_input)? {
                    messages.push(message);
                }
            }
            "message.delta" | "message.delta_batch" | "message.batch" => {
                flush_tool_results(&mut messages, &mut tool_results);
                if let Some(text) = text_from_payload(&event.payload) {
                    assistant_text_by_item
                        .entry(message_item_key(event))
                        .or_insert_with(String::new)
                        .push_str(&text);
                    assistant_content.push(CurrentProviderContent::Text(text));
                }
            }
            "message.completed" => {
                flush_tool_results(&mut messages, &mut tool_results);
                if let Some(snapshot) = text_from_payload(&event.payload) {
                    append_completed_message_snapshot(
                        &mut assistant_content,
                        &mut assistant_text_by_item,
                        message_item_key(event),
                        snapshot,
                    );
                }
            }
            "reasoning.delta" => {
                flush_tool_results(&mut messages, &mut tool_results);
                if let Some(text) = text_from_payload(&event.payload) {
                    assistant_content.push(CurrentProviderContent::Reasoning(text));
                }
            }
            "item.started" => {
                if let Some(call) = canonical_tool_call_from_event(event) {
                    flush_tool_results(&mut messages, &mut tool_results);
                    assistant_content.push(CurrentProviderContent::ToolCall(call));
                }
            }
            "item.completed" => {
                if let Some(result) = canonical_tool_result_from_event(event) {
                    flush_assistant(
                        &mut messages,
                        &mut assistant_content,
                        &mut assistant_text_by_item,
                    );
                    tool_results.push(CurrentProviderContent::ToolResult(result));
                }
            }
            _ => {}
        }
    }

    flush_assistant(
        &mut messages,
        &mut assistant_content,
        &mut assistant_text_by_item,
    );
    flush_tool_results(&mut messages, &mut tool_results);
    Ok(messages)
}

fn flush_assistant(
    messages: &mut Vec<CurrentProviderMessage>,
    assistant_content: &mut Vec<CurrentProviderContent>,
    assistant_text_by_item: &mut HashMap<String, String>,
) {
    if assistant_content.is_empty() {
        assistant_text_by_item.clear();
        return;
    }
    messages.push(CurrentProviderMessage::assistant(std::mem::take(
        assistant_content,
    )));
    assistant_text_by_item.clear();
}

fn append_completed_message_snapshot(
    assistant_content: &mut Vec<CurrentProviderContent>,
    assistant_text_by_item: &mut HashMap<String, String>,
    item_key: String,
    snapshot: String,
) {
    let aggregate = assistant_content
        .iter()
        .filter_map(|content| match content {
            CurrentProviderContent::Text(text) => Some(text.as_str()),
            _ => None,
        })
        .collect::<String>();
    if snapshot == aggregate || aggregate.starts_with(&snapshot) {
        return;
    }
    if !aggregate.is_empty() && snapshot.starts_with(&aggregate) {
        assistant_content.push(CurrentProviderContent::Text(
            snapshot[aggregate.len()..].to_string(),
        ));
        assistant_text_by_item.insert(item_key, snapshot);
        return;
    }

    let accumulated = assistant_text_by_item.entry(item_key).or_default();
    let suffix = if accumulated.is_empty() {
        snapshot.as_str()
    } else if snapshot == *accumulated || accumulated.starts_with(&snapshot) {
        ""
    } else if snapshot.starts_with(accumulated.as_str()) {
        &snapshot[accumulated.len()..]
    } else {
        snapshot.as_str()
    };
    if !suffix.is_empty() {
        assistant_content.push(CurrentProviderContent::Text(suffix.to_string()));
    }
    if accumulated.is_empty() || snapshot.starts_with(accumulated.as_str()) {
        *accumulated = snapshot;
    } else if !accumulated.starts_with(&snapshot) {
        accumulated.push_str(&snapshot);
    }
}

fn message_item_key(event: &AgentEvent) -> String {
    let payload = provider_event_payload(&event.payload);
    ["itemId", "item_id", "messageId", "message_id", "id"]
        .iter()
        .find_map(|key| payload.get(*key).and_then(Value::as_str))
        .or_else(|| event.turn_id.as_deref())
        .unwrap_or(event.event_id.as_str())
        .to_string()
}

fn flush_tool_results(
    messages: &mut Vec<CurrentProviderMessage>,
    tool_results: &mut Vec<CurrentProviderContent>,
) {
    if tool_results.is_empty() {
        return;
    }
    messages.push(CurrentProviderMessage::tool(std::mem::take(tool_results)));
}

fn canonical_tool_call_from_event(event: &AgentEvent) -> Option<CurrentProviderToolCall> {
    let item = canonical_tool_item(event)?;
    let ThreadItemPayload::Tool {
        call_id,
        name,
        arguments,
        ..
    } = item.payload
    else {
        return None;
    };
    let (arguments, raw_arguments) = canonical_tool_arguments(&arguments);
    Some(CurrentProviderToolCall {
        id: call_id,
        name,
        arguments,
        raw_arguments,
    })
}

fn canonical_tool_result_from_event(event: &AgentEvent) -> Option<CurrentProviderToolResult> {
    let item = canonical_tool_item(event)?;
    let status = item.status;
    let ThreadItemPayload::Tool {
        call_id,
        name,
        output,
        ..
    } = item.payload
    else {
        return None;
    };
    let output = output?;
    let output_ref = output.output_ref;
    let output_text = output
        .text
        .filter(|text| !text.trim().is_empty())
        .or_else(|| output.structured_content.map(|content| content.to_string()))
        .map(|text| {
            tool_runtime::tool_io::format_tool_output_for_model(
                &text,
                tool_runtime::tool_io::ToolOutputTruncationPolicy::Bytes(
                    PROVIDER_TOOL_OUTPUT_MAX_BYTES,
                ),
            )
        })
        .or_else(|| {
            output_ref.as_deref().map(|reference| {
                format!(
                    "Tool output was omitted from context; retained artifact reference: {reference}"
                )
            })
        })
        .unwrap_or_default();
    Some(CurrentProviderToolResult {
        call_id,
        name,
        success: status == ItemStatus::Completed,
        output: output_text,
        error: output.error.filter(|error| !error.trim().is_empty()),
    })
}

fn canonical_tool_item(event: &AgentEvent) -> Option<ThreadItem> {
    if !matches!(event.event_type.as_str(), "item.started" | "item.completed") {
        return None;
    }
    serde_json::from_value(event.payload.get("item")?.clone()).ok()
}

fn canonical_tool_arguments(arguments: &[ToolArgument]) -> (Value, String) {
    let arguments = if let [argument] = arguments {
        if argument.name == "value" {
            serde_json::from_str(&argument.value)
                .unwrap_or_else(|_| Value::String(argument.value.clone()))
        } else {
            canonical_tool_argument_object(arguments)
        }
    } else {
        canonical_tool_argument_object(arguments)
    };
    let raw_arguments = serde_json::to_string(&arguments).unwrap_or_else(|_| "{}".to_string());
    (arguments, raw_arguments)
}

fn canonical_tool_argument_object(arguments: &[ToolArgument]) -> Value {
    Value::Object(
        arguments
            .iter()
            .map(|argument| {
                let value = serde_json::from_str(&argument.value)
                    .unwrap_or_else(|_| Value::String(argument.value.clone()));
                (argument.name.clone(), value)
            })
            .collect(),
    )
}

fn user_message_from_event<G>(
    event: &AgentEvent,
    provider_input: &mut G,
) -> Result<Option<CurrentProviderMessage>, String>
where
    G: FnMut(&AgentInput) -> Result<AgentInput, String>,
{
    let input = event
        .payload
        .get("input")
        .cloned()
        .and_then(|value| serde_json::from_value::<AgentInput>(value).ok())
        .or_else(|| {
            let text = event
                .payload
                .get("content")
                .and_then(|content| content.get("text").or_else(|| content.get("message")))
                .and_then(Value::as_str)
                .or_else(|| event.payload.get("text").and_then(Value::as_str))?
                .to_string();
            let attachments = event
                .payload
                .get("attachments")
                .cloned()
                .and_then(|value| serde_json::from_value(value).ok())
                .unwrap_or_default();
            Some(AgentInput { text, attachments })
        });
    let Some(input) = input else {
        return Ok(None);
    };
    let input = provider_input(&input)?;
    Ok(user_message_from_input(&input))
}

fn user_message_from_input(input: &AgentInput) -> Option<CurrentProviderMessage> {
    let mut content = Vec::new();
    if !input.text.trim().is_empty() {
        content.push(CurrentProviderContent::Text(input.text.clone()));
    }
    content.extend(input.attachments.iter().filter_map(|attachment| {
        image_from_attachment(attachment).map(|image| CurrentProviderContent::Image {
            uri: image.uri,
            media_type: image.media_type,
            provider_data: image.provider_data,
        })
    }));
    (!content.is_empty()).then(|| CurrentProviderMessage::user(content))
}

fn image_from_attachment(
    attachment: &AgentAttachment,
) -> Option<agent_runtime::reply_input::RuntimeReplyInputImage> {
    let attachment_uri = attachment.uri.as_deref().map(str::trim)?;
    let provider_data = attachment_uri
        .starts_with("data:image/")
        .then(|| attachment_uri.to_string());
    let uri = super::input_media::attachment_reference_uri(attachment)?;
    let media_type = super::input_media::attachment_media_type(attachment)
        .or_else(|| {
            provider_data
                .as_deref()?
                .split(';')
                .next()
                .map(|prefix| prefix.trim_start_matches("data:").to_string())
        })
        .filter(|media_type| media_type.starts_with("image/"))?;
    Some(agent_runtime::reply_input::RuntimeReplyInputImage {
        uri,
        media_type,
        provider_data,
    })
}

fn provider_event_payload(payload: &Value) -> &Value {
    payload.get("runtimeEvent").unwrap_or(payload)
}

fn text_from_payload(payload: &Value) -> Option<String> {
    text_from_message_value(provider_event_payload(payload))
}

fn text_from_message_value(value: &Value) -> Option<String> {
    if let Some(text) = value.as_str().filter(|text| !text.is_empty()) {
        return Some(text.to_string());
    }
    if let Some(text) = [
        "text",
        "delta",
        "content",
        "message",
        "outputText",
        "output_text",
    ]
    .iter()
    .find_map(|key| value.get(*key).and_then(Value::as_str))
    .filter(|text| !text.is_empty())
    {
        return Some(text.to_string());
    }
    if let Some(text) = value
        .get("content")
        .and_then(|content| text_from_message_value(content))
    {
        return Some(text);
    }
    for key in ["deltas", "messages", "items", "parts", "content"] {
        let Some(values) = value.get(key).and_then(Value::as_array) else {
            continue;
        };
        let text = values
            .iter()
            .filter_map(text_from_message_value)
            .collect::<String>();
        if !text.is_empty() {
            return Some(text);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_protocol::{ItemId, ItemKind, SessionId, ThreadId, ToolOutput, TurnId};
    use serde_json::json;

    fn event(sequence: u64, event_type: &str, payload: Value) -> AgentEvent {
        AgentEvent {
            event_id: format!("evt-{sequence}"),
            sequence,
            session_id: "session-1".to_string(),
            thread_id: Some("thread-1".to_string()),
            turn_id: Some("turn-1".to_string()),
            event_type: event_type.to_string(),
            timestamp: "2026-07-12T00:00:00.000Z".to_string(),
            payload,
        }
    }

    fn canonical_tool_event(
        sequence: u64,
        event_type: &str,
        status: ItemStatus,
        call_id: &str,
        name: &str,
        arguments: Value,
        output: Option<ToolOutput>,
    ) -> AgentEvent {
        let arguments = arguments
            .as_object()
            .expect("canonical tool arguments object")
            .iter()
            .map(|(name, value)| ToolArgument {
                name: name.clone(),
                value: value
                    .as_str()
                    .map(str::to_string)
                    .unwrap_or_else(|| value.to_string()),
            })
            .collect();
        let item = ThreadItem {
            session_id: SessionId::new("session-1"),
            thread_id: ThreadId::new("thread-1"),
            turn_id: TurnId::new("turn-1"),
            item_id: ItemId::new(call_id),
            sequence,
            ordinal: 1,
            created_at_ms: 1,
            updated_at_ms: 2,
            completed_at_ms: status.is_terminal().then_some(2),
            kind: ItemKind::Tool,
            status,
            payload: ThreadItemPayload::Tool {
                call_id: call_id.to_string(),
                name: name.to_string(),
                arguments,
                output,
            },
            metadata: Value::Null,
        };
        event(sequence, event_type, json!({ "item": item }))
    }

    #[test]
    fn canonical_history_preserves_tool_call_result_and_order() {
        let arguments = json!({ "path": "README.md" });
        let messages = messages_from_events(&[
            event(
                1,
                "message.created",
                json!({ "input": { "text": "read it", "attachments": [] } }),
            ),
            canonical_tool_event(
                2,
                "item.started",
                ItemStatus::InProgress,
                "call-read",
                "Read",
                arguments.clone(),
                None,
            ),
            canonical_tool_event(
                3,
                "item.completed",
                ItemStatus::Completed,
                "call-read",
                "Read",
                arguments,
                Some(ToolOutput {
                    text: Some("contents".to_string()),
                    ..ToolOutput::default()
                }),
            ),
            event(4, "message.delta", json!({ "text": "Done." })),
        ]);

        assert_eq!(messages.len(), 4);
        assert!(matches!(
            &messages[1].content[..],
            [CurrentProviderContent::ToolCall(call)]
                if call.id == "call-read"
                    && call.name == "Read"
                    && call.arguments == json!({ "path": "README.md" })
        ));
        assert!(matches!(
            &messages[2].content[..],
            [CurrentProviderContent::ToolResult(result)]
                if result.call_id == "call-read" && result.success && result.output == "contents"
        ));
        assert!(matches!(
            &messages[3].content[..],
            [CurrentProviderContent::Text(text)] if text == "Done."
        ));
    }

    #[test]
    fn canonical_history_preserves_failed_tool_result() {
        let messages = messages_from_events(&[canonical_tool_event(
            1,
            "item.completed",
            ItemStatus::Failed,
            "call-failed",
            "Read",
            json!({ "path": "missing.md" }),
            Some(ToolOutput {
                text: Some("read failed".to_string()),
                error: Some("not found".to_string()),
                ..ToolOutput::default()
            }),
        )]);

        assert!(matches!(
            &messages[0].content[..],
            [CurrentProviderContent::ToolResult(result)]
                if result.call_id == "call-failed"
                    && !result.success
                    && result.output == "read failed"
                    && result.error.as_deref() == Some("not found")
        ));
    }

    #[test]
    fn canonical_history_merges_completed_full_text_without_duplicate_delta() {
        let messages = messages_from_events(&[
            event(
                1,
                "message.delta",
                json!({"itemId": "agent-1", "text": "Hello "}),
            ),
            event(
                2,
                "message.completed",
                json!({"itemId": "agent-1", "text": "Hello world", "status": "completed"}),
            ),
        ]);

        assert_eq!(messages.len(), 1);
        let text = messages[0]
            .content
            .iter()
            .filter_map(|content| match content {
                CurrentProviderContent::Text(text) => Some(text.as_str()),
                _ => None,
            })
            .collect::<String>();
        assert_eq!(text, "Hello world");
    }

    #[test]
    fn canonical_history_reads_message_delta_batch_parts() {
        let messages = messages_from_events(&[event(
            1,
            "message.delta_batch",
            json!({
                "itemId": "agent-1",
                "deltas": [
                    {"text": "batched "},
                    {"delta": "answer"}
                ]
            }),
        )]);

        assert!(matches!(
            &messages[0].content[..],
            [CurrentProviderContent::Text(text)] if text == "batched answer"
        ));
    }

    #[test]
    fn canonical_history_deduplicates_turn_wide_completed_snapshot() {
        let messages = messages_from_events(&[
            event(
                1,
                "message.delta",
                json!({"itemId": "commentary-1", "text": "inspect "}),
            ),
            event(
                2,
                "message.delta",
                json!({"itemId": "final-1", "text": "done"}),
            ),
            event(
                3,
                "message.completed",
                json!({"itemId": "final-1", "text": "inspect done", "status": "completed"}),
            ),
        ]);

        let text = messages[0]
            .content
            .iter()
            .filter_map(|content| match content {
                CurrentProviderContent::Text(text) => Some(text.as_str()),
                _ => None,
            })
            .collect::<String>();
        assert_eq!(text, "inspect done");
    }

    #[test]
    fn canonical_history_prefers_bounded_preview_over_persisted_output_ref() {
        let messages = messages_from_events(&[canonical_tool_event(
            1,
            "item.completed",
            ItemStatus::Completed,
            "call-large",
            "Read",
            json!({ "path": "large.txt" }),
            Some(ToolOutput {
                text: Some("preview".to_string()),
                truncated: true,
                output_ref: Some("output://large".to_string()),
                ..ToolOutput::default()
            }),
        )]);

        assert!(matches!(
            &messages[0].content[..],
            [CurrentProviderContent::ToolResult(result)]
                if result.call_id == "call-large" && result.output == "preview"
        ));
    }

    #[test]
    fn canonical_history_bounds_unoffloaded_inline_tool_output() {
        let messages = messages_from_events(&[canonical_tool_event(
            1,
            "item.completed",
            ItemStatus::Completed,
            "call-inline",
            "Read",
            json!({ "path": "large.txt" }),
            Some(ToolOutput {
                text: Some("x".repeat(PROVIDER_TOOL_OUTPUT_MAX_BYTES * 2)),
                ..ToolOutput::default()
            }),
        )]);

        let CurrentProviderContent::ToolResult(result) = &messages[0].content[0] else {
            panic!("expected tool result");
        };
        assert!(result.output.len() < PROVIDER_TOOL_OUTPUT_MAX_BYTES * 2);
        assert!(result.output.contains("Warning: truncated output"));
    }

    #[test]
    fn canonical_history_ignores_outer_event_output_ref() {
        let mut event = canonical_tool_event(
            1,
            "item.completed",
            ItemStatus::Completed,
            "call-large",
            "Read",
            json!({ "path": "large.txt" }),
            Some(ToolOutput {
                text: Some("preview".to_string()),
                ..ToolOutput::default()
            }),
        );
        event.payload["outputRef"] = json!("output://outer");

        let messages = messages_from_events(&[event]);

        assert!(matches!(
            &messages[0].content[..],
            [CurrentProviderContent::ToolResult(result)] if result.output == "preview"
        ));
    }

    #[test]
    fn raw_tool_events_do_not_enter_provider_history() {
        let messages = messages_from_events(&[
            event(
                1,
                "message.created",
                json!({ "input": { "text": "read it", "attachments": [] } }),
            ),
            event(
                2,
                "reasoning.delta",
                json!({ "runtimeEvent": { "text": "inspect" } }),
            ),
            event(
                3,
                "message.delta",
                json!({ "runtimeEvent": { "text": "I will read it." } }),
            ),
            event(
                4,
                "tool.started",
                json!({ "runtimeEvent": { "tool_id": "call-read", "tool_name": "Read", "arguments": "{\"path\":\"README.md\"}" } }),
            ),
            event(
                5,
                "tool.result",
                json!({ "runtimeEvent": { "tool_id": "call-read", "tool_name": "Read", "result": { "success": true, "output": "contents" } } }),
            ),
            event(
                6,
                "tool.failed",
                json!({ "toolId": "call-failed", "toolName": "Read", "error": "failed" }),
            ),
            event(
                7,
                "tool.completed",
                json!({ "toolId": "call-completed", "toolName": "Read", "output": "done" }),
            ),
            event(
                8,
                "message.delta",
                json!({ "runtimeEvent": { "text": "Done." } }),
            ),
        ]);

        assert_eq!(messages.len(), 2);
        assert!(matches!(
            &messages[0].content[..],
            [CurrentProviderContent::Text(text)] if text == "read it"
        ));
        assert!(matches!(
            &messages[1].content[..],
            [CurrentProviderContent::Reasoning(reasoning), CurrentProviderContent::Text(before), CurrentProviderContent::Text(after)]
                if reasoning == "inspect" && before == "I will read it." && after == "Done."
        ));
    }

    #[test]
    fn inline_image_input_is_preserved_for_current_provider() {
        let input = AgentInput {
            text: "describe it".to_string(),
            attachments: vec![AgentAttachment {
                kind: "image".to_string(),
                uri: Some("data:image/png;base64,abc".to_string()),
                metadata: Some(json!({ "mimeType": "image/png" })),
            }],
        };

        let reply = reply_input_from_agent_input(&input);
        assert_eq!(reply.images.len(), 1);
        assert_eq!(reply.images[0].uri, "data:image/png;base64,abc");
        assert_eq!(reply.images[0].media_type, "image/png");
        assert_eq!(
            reply.images[0].provider_data.as_deref(),
            Some("data:image/png;base64,abc")
        );
    }

    #[test]
    fn persisted_image_history_is_hydrated_without_rewriting_canonical_reference() {
        const PNG_DATA_URL: &str = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==";
        let root = tempfile::tempdir().expect("sidecar root");
        let store =
            super::super::sidecar_store::SidecarStore::new(root.path()).expect("sidecar store");
        let mut input = AgentInput {
            text: "describe it".to_string(),
            attachments: vec![AgentAttachment {
                kind: "image".to_string(),
                uri: Some(PNG_DATA_URL.to_string()),
                metadata: Some(json!({ "mediaType": "image/png" })),
            }],
        };
        super::super::input_media::persist_inline_input_media(
            &mut input,
            Some(&store),
            "session-1",
        )
        .expect("persist input media");
        let reference_uri = input.attachments[0].uri.clone().expect("reference uri");
        let messages = messages_from_events_with_provider_input(
            &[event(1, "message.created", json!({ "input": input }))],
            |input| super::super::input_media::provider_input_from_references(input, Some(&store)),
        )
        .expect("provider history");

        assert!(matches!(
            &messages[0].content[..],
            [CurrentProviderContent::Text(text), CurrentProviderContent::Image {
                uri,
                media_type,
                provider_data: Some(provider_data),
            }] if text == "describe it"
                && uri == &reference_uri
                && media_type == "image/png"
                && provider_data == PNG_DATA_URL
        ));
    }
}
