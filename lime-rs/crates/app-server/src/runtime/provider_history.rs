//! App Server current event store 到 provider transcript 的投影。
//!
//! Codex 的 history 是有序 response item，而不是 UI 聚合后的消息文本。本模块直接从
//! RuntimeCore 已持久化的 user/message/tool 事件恢复 provider 所需的最小 item 顺序，
//! 避免任何旧 session 或 provider adapter 参与多轮采样。

use super::output_refs;
use super::{OutputSnapshotStore, StoredSession};
use agent_protocol::{ItemStatus, ThreadItem, ThreadItemPayload, ToolArgument};
use app_server_protocol::{AgentAttachment, AgentEvent, AgentInput};
use model_provider::current_client::{
    CurrentProviderContent, CurrentProviderMessage, CurrentProviderToolCall,
    CurrentProviderToolResult,
};
use serde_json::Value;

/// Current turn input is supplied separately to the provider. It remains durable and visible in
/// the canonical Item log, but must not be submitted twice in the same provider request.
pub(in crate::runtime) fn provider_history_excluding_current_turn_input(
    stored: &StoredSession,
    output_snapshot_store: &dyn OutputSnapshotStore,
    turn_id: &str,
) -> Vec<CurrentProviderMessage> {
    let events = stored
        .events
        .iter()
        .filter(|event| {
            event.turn_id.as_deref() != Some(turn_id)
                || !super::turn_input_events::is_turn_input_event(event)
        })
        .cloned()
        .collect::<Vec<_>>();
    messages_from_events(&events, |output_ref| {
        output_refs::output_content(
            &stored.output_blobs,
            output_snapshot_store,
            stored.session.session_id.as_str(),
            output_ref,
        )
    })
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

fn messages_from_events<F>(
    events: &[AgentEvent],
    mut output_content: F,
) -> Vec<CurrentProviderMessage>
where
    F: FnMut(&str) -> Option<String>,
{
    let mut messages = Vec::new();
    let mut assistant_content = Vec::new();
    let mut tool_results = Vec::new();

    for event in events {
        match event.event_type.as_str() {
            "message.created" => {
                flush_assistant(&mut messages, &mut assistant_content);
                flush_tool_results(&mut messages, &mut tool_results);
                if let Some(message) = user_message_from_event(event) {
                    messages.push(message);
                }
            }
            "message.delta" | "message.delta_batch" | "message.batch" => {
                flush_tool_results(&mut messages, &mut tool_results);
                if let Some(text) = text_from_payload(&event.payload) {
                    assistant_content.push(CurrentProviderContent::Text(text));
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
                if let Some(result) = canonical_tool_result_from_event(event, &mut output_content) {
                    flush_assistant(&mut messages, &mut assistant_content);
                    tool_results.push(CurrentProviderContent::ToolResult(result));
                }
            }
            _ => {}
        }
    }

    flush_assistant(&mut messages, &mut assistant_content);
    flush_tool_results(&mut messages, &mut tool_results);
    messages
}

fn flush_assistant(
    messages: &mut Vec<CurrentProviderMessage>,
    assistant_content: &mut Vec<CurrentProviderContent>,
) {
    if assistant_content.is_empty() {
        return;
    }
    messages.push(CurrentProviderMessage::assistant(std::mem::take(
        assistant_content,
    )));
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

fn canonical_tool_result_from_event<F>(
    event: &AgentEvent,
    output_content: &mut F,
) -> Option<CurrentProviderToolResult>
where
    F: FnMut(&str) -> Option<String>,
{
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
    let output_text = output_ref
        .as_deref()
        .and_then(output_content)
        .or(output.text)
        .or_else(|| output.structured_content.map(|content| content.to_string()))
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

fn user_message_from_event(event: &AgentEvent) -> Option<CurrentProviderMessage> {
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
        })?;
    user_message_from_input(&input)
}

fn user_message_from_input(input: &AgentInput) -> Option<CurrentProviderMessage> {
    let mut content = Vec::new();
    if !input.text.trim().is_empty() {
        content.push(CurrentProviderContent::Text(input.text.clone()));
    }
    content.extend(input.attachments.iter().filter_map(|attachment| {
        image_from_attachment(attachment).map(|image| CurrentProviderContent::Image {
            data: image.data,
            media_type: image.media_type,
        })
    }));
    (!content.is_empty()).then(|| CurrentProviderMessage::user(content))
}

fn image_from_attachment(
    attachment: &AgentAttachment,
) -> Option<agent_runtime::reply_input::RuntimeReplyInputImage> {
    let data = attachment
        .uri
        .as_deref()
        .map(str::trim)
        .filter(|uri| uri.starts_with("data:image/"))?
        .to_string();
    let media_type = attachment_media_type(attachment)
        .or_else(|| {
            data.split(';')
                .next()
                .map(|prefix| prefix.trim_start_matches("data:").to_string())
        })
        .filter(|media_type| media_type.starts_with("image/"))?;
    Some(agent_runtime::reply_input::RuntimeReplyInputImage { data, media_type })
}

fn attachment_media_type(attachment: &AgentAttachment) -> Option<String> {
    attachment
        .metadata
        .as_ref()
        .and_then(Value::as_object)
        .and_then(|metadata| {
            ["mediaType", "media_type", "mimeType", "mime_type"]
                .iter()
                .filter_map(|key| metadata.get(*key))
                .find_map(Value::as_str)
        })
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn provider_event_payload(payload: &Value) -> &Value {
    payload.get("runtimeEvent").unwrap_or(payload)
}

fn text_from_payload(payload: &Value) -> Option<String> {
    provider_event_payload(payload)
        .get("text")
        .or_else(|| provider_event_payload(payload).get("delta"))
        .or_else(|| provider_event_payload(payload).get("content"))
        .and_then(Value::as_str)
        .map(ToString::to_string)
        .filter(|value| !value.is_empty())
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
        let messages = messages_from_events(
            &[
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
            ],
            |_| None,
        );

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
        let messages = messages_from_events(
            &[canonical_tool_event(
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
            )],
            |_| None,
        );

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
    fn canonical_history_reads_persisted_output_ref() {
        let messages = messages_from_events(
            &[canonical_tool_event(
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
            )],
            |output_ref| (output_ref == "output://large").then(|| "full output".to_string()),
        );

        assert!(matches!(
            &messages[0].content[..],
            [CurrentProviderContent::ToolResult(result)]
                if result.call_id == "call-large" && result.output == "full output"
        ));
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

        let messages = messages_from_events(&[event], |output_ref| {
            (output_ref == "output://outer").then(|| "outer output".to_string())
        });

        assert!(matches!(
            &messages[0].content[..],
            [CurrentProviderContent::ToolResult(result)] if result.output == "preview"
        ));
    }

    #[test]
    fn raw_tool_events_do_not_enter_provider_history() {
        let messages = messages_from_events(
            &[
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
            ],
            |_| None,
        );

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
        assert_eq!(reply.images[0].media_type, "image/png");
    }
}
