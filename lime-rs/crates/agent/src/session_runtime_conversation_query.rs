//! Runtime conversation read model for session detail.
//!
//! Aster runtime store DTOs are treated as storage input here; runtime detail
//! receives Lime-owned protocol messages and window projection.

use agent_protocol::action_required::{
    elicitation_action, elicitation_response_message_action, tool_confirmation_action,
};
use agent_runtime::runtime_conversation::{
    project_runtime_conversation_window, RuntimeConversationMessageSource,
};
use serde_json::{Map, Value};
use thread_store::conversation_transcript::{
    select_conversation_messages, ConversationMessageRecord,
};

use crate::protocol::{
    AgentActionRequiredScope as RuntimeActionRequiredScope, AgentMessage as RuntimeAgentMessage,
    AgentMessageContent as RuntimeMessageContent, AgentToolImage as RuntimeToolImage,
};
use crate::runtime_conversation_aster_adapter::collect_conversation_records_from_aster_runtime_store;

pub(crate) async fn read_runtime_conversation_window(
    session_id: &str,
    history_limit: Option<usize>,
    history_offset: usize,
) -> Result<Option<Vec<RuntimeAgentMessage>>, String> {
    let records = collect_conversation_records_from_aster_runtime_store(session_id).await?;
    let sources = select_conversation_messages(records)
        .into_iter()
        .filter_map(project_runtime_message_source_from_record);
    let messages = project_runtime_conversation_window(sources, history_limit, history_offset);

    Ok((!messages.is_empty()).then_some(messages))
}

fn project_runtime_message_source_from_record(
    record: ConversationMessageRecord,
) -> Option<RuntimeConversationMessageSource<RuntimeAgentMessage>> {
    let user_visible = record_user_visible(record.metadata_json.as_ref());
    let timestamp = record.created_timestamp.unwrap_or(0);
    let content = match record.content_json.as_ref() {
        Some(content_json) => project_runtime_message_content(content_json),
        None => record
            .text
            .as_deref()
            .and_then(text_content)
            .into_iter()
            .collect(),
    };

    if content.is_empty() {
        return None;
    }

    Some(RuntimeConversationMessageSource {
        message: RuntimeAgentMessage {
            id: None,
            role: record.role.as_str().to_string(),
            content,
            timestamp,
            usage: None,
        },
        user_visible,
    })
}

fn record_user_visible(metadata_json: Option<&Value>) -> bool {
    metadata_json
        .and_then(Value::as_object)
        .and_then(|metadata| {
            metadata
                .get("userVisible")
                .or_else(|| metadata.get("user_visible"))
        })
        .and_then(Value::as_bool)
        .unwrap_or(true)
}

fn project_runtime_message_content(content_json: &Value) -> Vec<RuntimeMessageContent> {
    match content_json {
        Value::Array(items) => items.iter().filter_map(project_content_item).collect(),
        Value::String(text) => text_content(text).into_iter().collect(),
        Value::Object(_) => project_content_item(content_json).into_iter().collect(),
        _ => Vec::new(),
    }
}

fn project_content_item(value: &Value) -> Option<RuntimeMessageContent> {
    let object = value.as_object()?;
    match normalized_type(object).as_deref()? {
        "text" => string_field(object, &["text"]).and_then(|text| text_content(&text)),
        "thinking" => string_field(object, &["thinking", "text"])
            .and_then(|text| text_content(&text))
            .map(|content| match content {
                RuntimeMessageContent::Text { text } => RuntimeMessageContent::Thinking { text },
                other => other,
            }),
        "toolrequest" => project_tool_request_content(object),
        "toolresponse" => project_tool_response_content(object),
        "actionrequired" => project_action_required_content(object),
        "toolconfirmationrequest" => project_tool_confirmation_request_content(object),
        "frontendtoolrequest" => project_tool_request_content(object),
        "image" => project_image_content(object),
        _ => None,
    }
}

fn normalized_type(object: &Map<String, Value>) -> Option<String> {
    Some(
        string_field(object, &["type"])?
            .chars()
            .filter(|ch| *ch != '_' && *ch != '-')
            .flat_map(char::to_lowercase)
            .collect(),
    )
}

fn text_content(text: &str) -> Option<RuntimeMessageContent> {
    let text = text.trim();
    if text.is_empty() {
        None
    } else {
        Some(RuntimeMessageContent::Text {
            text: text.to_string(),
        })
    }
}

fn string_field(object: &Map<String, Value>, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| object.get(*key))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn object_field<'a>(
    object: &'a Map<String, Value>,
    keys: &[&str],
) -> Option<&'a Map<String, Value>> {
    keys.iter()
        .find_map(|key| object.get(*key))
        .and_then(Value::as_object)
}

fn value_field<'a>(object: &'a Map<String, Value>, keys: &[&str]) -> Option<&'a Value> {
    keys.iter().find_map(|key| object.get(*key))
}

fn project_tool_request_content(object: &Map<String, Value>) -> Option<RuntimeMessageContent> {
    let id = string_field(object, &["id"])?;
    let tool_call = value_field(object, &["toolCall", "tool_call"])?;
    let tool_call = tool_result_success_value(tool_call)?;
    let tool_call = tool_call.as_object()?;
    let tool_name = string_field(tool_call, &["name", "toolName", "tool_name"])?;
    let arguments = normalize_tool_arguments(value_field(tool_call, &["arguments"]).cloned());

    Some(RuntimeMessageContent::ToolRequest {
        id,
        tool_name,
        arguments,
    })
}

fn normalize_tool_arguments(arguments: Option<Value>) -> Value {
    match arguments {
        Some(value @ Value::Object(_)) => value,
        Some(Value::Null) | None => serde_json::json!({}),
        Some(other) => serde_json::json!({ "value": other }),
    }
}

fn tool_result_success_value(value: &Value) -> Option<&Value> {
    let Some(object) = value.as_object() else {
        return Some(value);
    };
    match string_field(object, &["status"]).as_deref() {
        Some("success") => object.get("value"),
        Some("error") => None,
        _ => Some(value),
    }
}

fn tool_result_error(value: &Value) -> Option<String> {
    let object = value.as_object()?;
    (string_field(object, &["status"]).as_deref() == Some("error"))
        .then(|| string_field(object, &["error"]).unwrap_or_else(|| "Tool execution failed".into()))
}

fn project_tool_response_content(object: &Map<String, Value>) -> Option<RuntimeMessageContent> {
    let id = string_field(object, &["id"])?;
    let tool_result = value_field(object, &["toolResult", "tool_result"])?;

    if let Some(error) = tool_result_error(tool_result) {
        return Some(RuntimeMessageContent::ToolResponse {
            id,
            success: false,
            output: String::new(),
            error: Some(error),
            structured_content: None,
            images: None,
            metadata: None,
        });
    }

    let value = tool_result_success_value(tool_result).unwrap_or(tool_result);
    let projection = project_call_tool_result_value(value);
    Some(RuntimeMessageContent::ToolResponse {
        id,
        success: !projection.is_error,
        output: projection.output,
        error: projection
            .is_error
            .then_some("Tool execution failed".to_string()),
        structured_content: projection.structured_content,
        images: projection.images,
        metadata: None,
    })
}

struct ToolResultValueProjection {
    output: String,
    structured_content: Option<Value>,
    images: Option<Vec<RuntimeToolImage>>,
    is_error: bool,
}

fn project_call_tool_result_value(value: &Value) -> ToolResultValueProjection {
    let structured_content = object_field_from_value(value)
        .and_then(|object| value_field(object, &["structuredContent", "structured_content"]))
        .cloned();
    let is_error = object_field_from_value(value)
        .and_then(|object| value_field(object, &["isError", "is_error"]))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let content_value = object_field_from_value(value)
        .and_then(|object| value_field(object, &["content"]))
        .unwrap_or(value);
    let (output_parts, images) = project_tool_result_content(content_value);
    let output = if output_parts.is_empty() {
        structured_content
            .as_ref()
            .and_then(|value| serde_json::to_string(value).ok())
            .unwrap_or_default()
    } else {
        output_parts.join("\n")
    };

    ToolResultValueProjection {
        output,
        structured_content,
        images: (!images.is_empty()).then_some(images),
        is_error,
    }
}

fn object_field_from_value(value: &Value) -> Option<&Map<String, Value>> {
    value.as_object()
}

fn project_tool_result_content(value: &Value) -> (Vec<String>, Vec<RuntimeToolImage>) {
    let mut output_parts = Vec::new();
    let mut images = Vec::new();
    let items = match value {
        Value::Array(items) => items.as_slice(),
        _ => std::slice::from_ref(value),
    };

    for item in items {
        match item {
            Value::String(text) => {
                if !text.trim().is_empty() {
                    output_parts.push(text.trim().to_string());
                }
            }
            Value::Object(object) => match normalized_type(object).as_deref() {
                Some("text") => {
                    if let Some(text) = string_field(object, &["text"]) {
                        output_parts.push(text);
                    }
                }
                Some("image") => {
                    if let Some(image) = project_tool_image(object) {
                        images.push(image);
                    }
                }
                _ => {
                    if let Some(text) = string_field(object, &["text"]) {
                        output_parts.push(text);
                    }
                }
            },
            other if !other.is_null() => {
                if let Ok(text) = serde_json::to_string(other) {
                    output_parts.push(text);
                }
            }
            _ => {}
        }
    }

    (output_parts, images)
}

fn project_tool_image(object: &Map<String, Value>) -> Option<RuntimeToolImage> {
    let data = string_field(object, &["data", "src"])?;
    Some(RuntimeToolImage {
        src: data,
        mime_type: string_field(object, &["mimeType", "mime_type"]),
        origin: string_field(object, &["origin"]),
    })
}

fn project_action_required_content(object: &Map<String, Value>) -> Option<RuntimeMessageContent> {
    let data = object_field(object, &["data"])?;
    let scope = value_field(object, &["scope"]).and_then(project_action_required_scope);
    let projection = match normalized_action_type(data).as_deref()? {
        "toolconfirmation" => tool_confirmation_action(
            string_field(data, &["id"])?,
            string_field(data, &["toolName", "tool_name"])?,
            value_field(data, &["arguments"])
                .cloned()
                .unwrap_or_else(|| serde_json::json!({})),
            string_field(data, &["prompt"]),
            scope,
        ),
        "elicitation" => elicitation_action(
            string_field(data, &["id"])?,
            string_field(data, &["message"])?,
            value_field(data, &["requestedSchema", "requested_schema"])
                .cloned()
                .unwrap_or(Value::Null),
            scope,
        ),
        "elicitationresponse" => elicitation_response_message_action(
            string_field(data, &["id"])?,
            value_field(data, &["userData", "user_data"])
                .cloned()
                .unwrap_or(Value::Null),
            scope,
        ),
        _ => return None,
    };

    Some(RuntimeMessageContent::ActionRequired {
        id: projection.id,
        action_type: projection.action_type,
        data: projection.data,
        scope: projection.scope,
    })
}

fn project_tool_confirmation_request_content(
    object: &Map<String, Value>,
) -> Option<RuntimeMessageContent> {
    let projection = tool_confirmation_action(
        string_field(object, &["id"])?,
        string_field(object, &["toolName", "tool_name"])?,
        value_field(object, &["arguments"])
            .cloned()
            .unwrap_or_else(|| serde_json::json!({})),
        string_field(object, &["prompt"]),
        None,
    );

    Some(RuntimeMessageContent::ActionRequired {
        id: projection.id,
        action_type: projection.action_type,
        data: projection.data,
        scope: projection.scope,
    })
}

fn normalized_action_type(object: &Map<String, Value>) -> Option<String> {
    Some(
        string_field(object, &["actionType", "action_type"])?
            .chars()
            .filter(|ch| *ch != '_' && *ch != '-')
            .flat_map(char::to_lowercase)
            .collect(),
    )
}

fn project_action_required_scope(value: &Value) -> Option<RuntimeActionRequiredScope> {
    let object = value.as_object()?;
    RuntimeActionRequiredScope::from_parts(
        string_field(object, &["sessionId", "session_id"]),
        string_field(object, &["threadId", "thread_id"]),
        string_field(object, &["turnId", "turn_id"]),
    )
}

fn project_image_content(object: &Map<String, Value>) -> Option<RuntimeMessageContent> {
    Some(RuntimeMessageContent::Image {
        mime_type: string_field(object, &["mimeType", "mime_type"])?,
        data: string_field(object, &["data"])?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use thread_store::conversation_transcript::ConversationMessageRole;

    fn transcript_record(content_json: Value, metadata_json: Value) -> ConversationMessageRecord {
        ConversationMessageRecord::transcript(
            ConversationMessageRole::Assistant,
            content_json,
            metadata_json,
            42,
        )
    }

    #[test]
    fn project_runtime_message_source_from_record_projects_current_protocol_content() {
        let source = project_runtime_message_source_from_record(transcript_record(
            serde_json::json!([
                { "type": "text", "text": "hello" },
                {
                    "type": "toolRequest",
                    "id": "call-1",
                    "toolCall": {
                        "status": "success",
                        "value": {
                            "name": "read_file",
                            "arguments": { "path": "README.md" }
                        }
                    }
                }
            ]),
            serde_json::json!({ "userVisible": true }),
        ))
        .expect("project message");

        assert!(source.user_visible);
        assert_eq!(source.message.role, "assistant");
        assert_eq!(source.message.timestamp, 42);
        assert!(matches!(
            source.message.content.first(),
            Some(RuntimeMessageContent::Text { text }) if text == "hello"
        ));
        assert!(source.message.content.iter().any(|content| matches!(
            content,
            RuntimeMessageContent::ToolRequest {
                id,
                tool_name,
                arguments
            } if id == "call-1" && tool_name == "read_file" && arguments["path"] == "README.md"
        )));
    }

    #[test]
    fn project_runtime_message_source_from_record_keeps_visibility_current() {
        let source = project_runtime_message_source_from_record(transcript_record(
            serde_json::json!([{ "type": "text", "text": "hidden" }]),
            serde_json::json!({ "userVisible": false }),
        ))
        .expect("project message");

        assert!(!source.user_visible);
    }
}
