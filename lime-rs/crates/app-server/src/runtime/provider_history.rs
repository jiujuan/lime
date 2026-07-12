//! App Server current event store 到 provider transcript 的投影。
//!
//! Codex 的 history 是有序 response item，而不是 UI 聚合后的消息文本。本模块直接从
//! RuntimeCore 已持久化的 user/message/tool 事件恢复 provider 所需的最小 item 顺序，
//! 避免任何旧 session 或 provider adapter 参与多轮采样。

use super::output_refs;
use super::{OutputSnapshotStore, StoredSession};
use app_server_protocol::{AgentAttachment, AgentEvent, AgentInput};
use model_provider::current_client::{
    CurrentProviderContent, CurrentProviderMessage, CurrentProviderToolCall,
    CurrentProviderToolResult,
};
use serde_json::{json, Value};

pub(in crate::runtime) fn provider_history(
    stored: &StoredSession,
    output_snapshot_store: &dyn OutputSnapshotStore,
) -> Vec<CurrentProviderMessage> {
    messages_from_events(&stored.events, |output_ref| {
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
            "tool.started" => {
                flush_tool_results(&mut messages, &mut tool_results);
                if let Some(call) = tool_call_from_event(event) {
                    assistant_content.push(CurrentProviderContent::ToolCall(call));
                }
            }
            "tool.result" | "tool.failed" => {
                flush_assistant(&mut messages, &mut assistant_content);
                if let Some(result) = tool_result_from_event(event, &mut output_content) {
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

fn tool_call_from_event(event: &AgentEvent) -> Option<CurrentProviderToolCall> {
    let payload = provider_event_payload(&event.payload);
    let id = string_field(
        payload,
        &["tool_id", "toolId", "toolCallId", "tool_call_id", "id"],
    )?;
    let name = string_field(payload, &["tool_name", "toolName", "name"])?;
    let (arguments, raw_arguments) = tool_arguments(payload);
    Some(CurrentProviderToolCall {
        id,
        name,
        arguments,
        raw_arguments,
    })
}

fn tool_result_from_event<F>(
    event: &AgentEvent,
    output_content: &mut F,
) -> Option<CurrentProviderToolResult>
where
    F: FnMut(&str) -> Option<String>,
{
    let provider_payload = provider_event_payload(&event.payload);
    let result = provider_payload.get("result").unwrap_or(provider_payload);
    let call_id = string_field(
        &event.payload,
        &["tool_id", "toolId", "toolCallId", "tool_call_id", "id"],
    )
    .or_else(|| {
        string_field(
            provider_payload,
            &["tool_id", "toolId", "toolCallId", "tool_call_id", "id"],
        )
    })?;
    let name = string_field(&event.payload, &["tool_name", "toolName", "name"])
        .or_else(|| string_field(provider_payload, &["tool_name", "toolName", "name"]))
        .or_else(|| string_field(result, &["tool_name", "toolName", "name"]))
        .unwrap_or_else(|| "tool".to_string());
    let success = bool_field(result, &["success"])
        .or_else(|| bool_field(provider_payload, &["success"]))
        .or_else(|| bool_field(&event.payload, &["success"]))
        .unwrap_or(event.event_type == "tool.result");
    let output = output_ref(&event.payload)
        .or_else(|| output_ref(provider_payload))
        .and_then(|output_ref| output_content(&output_ref))
        .or_else(|| output_text(result))
        .or_else(|| output_text(provider_payload))
        .or_else(|| output_text(&event.payload))
        .unwrap_or_default();
    let error = string_field(result, &["error", "message", "reason"])
        .or_else(|| string_field(provider_payload, &["error", "message", "reason"]))
        .or_else(|| string_field(&event.payload, &["error", "message", "reason"]))
        .filter(|value| !value.is_empty());
    Some(CurrentProviderToolResult {
        call_id,
        name,
        success,
        output,
        error,
    })
}

fn provider_event_payload(payload: &Value) -> &Value {
    payload.get("runtimeEvent").unwrap_or(payload)
}

fn tool_arguments(payload: &Value) -> (Value, String) {
    let value = payload
        .get("arguments")
        .or_else(|| payload.get("input"))
        .cloned()
        .unwrap_or_else(|| json!({}));
    match value {
        Value::String(raw_arguments) => {
            let arguments = serde_json::from_str(&raw_arguments)
                .unwrap_or_else(|_| json!({ "_raw": raw_arguments }));
            (arguments, raw_arguments)
        }
        arguments => {
            let raw_arguments =
                serde_json::to_string(&arguments).unwrap_or_else(|_| "{}".to_string());
            (arguments, raw_arguments)
        }
    }
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

fn output_text(payload: &Value) -> Option<String> {
    payload
        .get("output")
        .or_else(|| payload.get("outputPreview"))
        .or_else(|| payload.get("output_preview"))
        .or_else(|| payload.get("text"))
        .or_else(|| payload.get("content"))
        .and_then(Value::as_str)
        .map(ToString::to_string)
}

fn output_ref(payload: &Value) -> Option<String> {
    string_field(
        payload,
        &["outputRef", "output_ref", "contentRef", "content_ref"],
    )
}

fn string_field(payload: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .filter_map(|key| payload.get(*key))
        .find_map(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn bool_field(payload: &Value, keys: &[&str]) -> Option<bool> {
    keys.iter()
        .filter_map(|key| payload.get(*key))
        .find_map(Value::as_bool)
}

#[cfg(test)]
mod tests {
    use super::*;

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

    #[test]
    fn history_preserves_user_assistant_tool_call_and_tool_result_order() {
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
                    "message.delta",
                    json!({ "runtimeEvent": { "text": "Done." } }),
                ),
            ],
            |_| None,
        );

        assert_eq!(messages.len(), 4);
        assert!(matches!(
            &messages[0].content[..],
            [CurrentProviderContent::Text(text)] if text == "read it"
        ));
        assert!(matches!(
            &messages[1].content[..],
            [CurrentProviderContent::Reasoning(reasoning), CurrentProviderContent::Text(text), CurrentProviderContent::ToolCall(call)]
                if reasoning == "inspect" && text == "I will read it." && call.id == "call-read" && call.raw_arguments == "{\"path\":\"README.md\"}"
        ));
        assert!(matches!(
            &messages[2].content[..],
            [CurrentProviderContent::ToolResult(result)] if result.call_id == "call-read" && result.output == "contents"
        ));
        assert!(matches!(
            &messages[3].content[..],
            [CurrentProviderContent::Text(text)] if text == "Done."
        ));
    }

    #[test]
    fn history_uses_persisted_output_when_tool_event_contains_only_preview() {
        let messages = messages_from_events(
            &[event(
                1,
                "tool.result",
                json!({
                    "toolCallId": "call-large",
                    "toolName": "Read",
                    "outputRef": "output://large",
                    "runtimeEvent": {
                        "tool_id": "call-large",
                        "tool_name": "Read",
                        "result": { "success": true, "output": "preview" }
                    }
                }),
            )],
            |output_ref| (output_ref == "output://large").then(|| "full output".to_string()),
        );

        assert!(matches!(
            &messages[0].content[..],
            [CurrentProviderContent::ToolResult(result)] if result.call_id == "call-large" && result.name == "Read" && result.output == "full output"
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
