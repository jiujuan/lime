use crate::provider_stream::RuntimeReplyProviderRequestWireShape;
use crate::runtime_provider::RuntimeProviderConfig;
use runtime_core::{CanonicalRequest, CanonicalRole, ContentPart, ToolResultValue};
use serde_json::{json, Map, Value};

pub(super) fn chat_completions_request(
    config: &RuntimeProviderConfig,
    request: &CanonicalRequest,
    wire_shape: &RuntimeReplyProviderRequestWireShape,
) -> Value {
    let mut messages = Vec::new();
    let system = text_from_parts(&request.system);
    if !system.is_empty() {
        messages.push(json!({ "role": "system", "content": system }));
    }
    messages.extend(request.messages.iter().flat_map(chat_message));
    let mut object = Map::from_iter([
        ("model".to_string(), json!(config.model_name)),
        ("messages".to_string(), Value::Array(messages)),
        ("stream".to_string(), Value::Bool(true)),
        (
            "stream_options".to_string(),
            json!({ "include_usage": true }),
        ),
    ]);
    if !request.tools.is_empty() {
        object.insert(
            "tools".to_string(),
            Value::Array(request.tools.iter().map(chat_tool).collect()),
        );
        object.insert(
            "parallel_tool_calls".to_string(),
            json!(wire_shape.parallel_tool_calls.unwrap_or(true)),
        );
    }
    Value::Object(object)
}

pub(super) fn responses_request(
    config: &RuntimeProviderConfig,
    request: &CanonicalRequest,
    wire_shape: &RuntimeReplyProviderRequestWireShape,
) -> Value {
    let mut input = Vec::new();
    for message in &request.messages {
        input.extend(responses_message(message));
    }
    let mut object = Map::from_iter([
        ("model".to_string(), json!(config.model_name)),
        ("input".to_string(), Value::Array(input)),
        ("stream".to_string(), Value::Bool(true)),
        ("store".to_string(), Value::Bool(false)),
    ]);
    let instructions = text_from_parts(&request.system);
    if !instructions.is_empty() {
        object.insert("instructions".to_string(), json!(instructions));
    }
    if !request.tools.is_empty() {
        object.insert(
            "tools".to_string(),
            Value::Array(
                request
                    .tools
                    .iter()
                    .map(|tool| {
                        json!({
                            "type": "function",
                            "name": tool.name,
                            "description": tool.description,
                            "parameters": tool.input_schema,
                            "strict": false,
                        })
                    })
                    .collect(),
            ),
        );
        object.insert(
            "parallel_tool_calls".to_string(),
            json!(wire_shape.parallel_tool_calls.unwrap_or(true)),
        );
    }
    Value::Object(object)
}

pub(super) fn anthropic_request(
    config: &RuntimeProviderConfig,
    request: &CanonicalRequest,
) -> Value {
    let messages = request
        .messages
        .iter()
        .flat_map(anthropic_message)
        .collect::<Vec<_>>();
    let mut object = Map::from_iter([
        ("model".to_string(), json!(config.model_name)),
        ("messages".to_string(), Value::Array(messages)),
        ("max_tokens".to_string(), json!(4096)),
        ("stream".to_string(), Value::Bool(true)),
    ]);
    let system = text_from_parts(&request.system);
    if !system.is_empty() {
        object.insert("system".to_string(), json!(system));
    }
    if !request.tools.is_empty() {
        object.insert(
            "tools".to_string(),
            Value::Array(
                request
                    .tools
                    .iter()
                    .map(|tool| {
                        json!({
                            "name": tool.name,
                            "description": tool.description,
                            "input_schema": tool.input_schema,
                        })
                    })
                    .collect(),
            ),
        );
    }
    Value::Object(object)
}

fn chat_message(message: &runtime_core::CanonicalMessage) -> Vec<Value> {
    match message.role {
        CanonicalRole::Tool => message
            .content
            .iter()
            .filter_map(|content| match content {
                ContentPart::ToolResult {
                    id, result, error, ..
                } => Some(json!({
                    "role": "tool",
                    "tool_call_id": id,
                    "content": tool_result_text(result, error.as_deref()),
                })),
                _ => None,
            })
            .collect(),
        CanonicalRole::Assistant => {
            let text = text_from_parts(&message.content);
            let tool_calls = message
                .content
                .iter()
                .filter_map(|content| match content {
                    ContentPart::ToolCall {
                        id, name, input, ..
                    } => Some(json!({
                        "id": id,
                        "type": "function",
                        "function": { "name": name, "arguments": input.to_string() },
                    })),
                    _ => None,
                })
                .collect::<Vec<_>>();
            let mut value = json!({ "role": "assistant", "content": text });
            if !tool_calls.is_empty() {
                value["tool_calls"] = Value::Array(tool_calls);
            }
            vec![value]
        }
        CanonicalRole::User | CanonicalRole::System | CanonicalRole::Developer => vec![json!({
            "role": wire_role(message.role),
            "content": chat_content(&message.content),
        })],
    }
}

fn wire_role(role: CanonicalRole) -> &'static str {
    match role {
        CanonicalRole::System => "system",
        CanonicalRole::Developer => "developer",
        CanonicalRole::User => "user",
        CanonicalRole::Assistant => "assistant",
        CanonicalRole::Tool => "tool",
    }
}

fn chat_content(content: &[ContentPart]) -> Value {
    let has_media = content
        .iter()
        .any(|part| matches!(part, ContentPart::Media { .. }));
    if !has_media {
        return json!(text_from_parts(content));
    }
    Value::Array(
        content
            .iter()
            .filter_map(|part| match part {
                ContentPart::Text { text, .. } => Some(json!({ "type": "text", "text": text })),
                ContentPart::Media {
                    uri, media_type, ..
                } => Some(json!({
                    "type": "image_url",
                    "image_url": { "url": uri, "media_type": media_type },
                })),
                _ => None,
            })
            .collect(),
    )
}

fn chat_tool(tool: &runtime_core::CanonicalToolDefinition) -> Value {
    json!({
        "type": "function",
        "function": {
            "name": tool.name,
            "description": tool.description,
            "parameters": tool.input_schema,
            "strict": false,
        }
    })
}

fn responses_message(message: &runtime_core::CanonicalMessage) -> Vec<Value> {
    match message.role {
        CanonicalRole::Tool => message
            .content
            .iter()
            .filter_map(|content| match content {
                ContentPart::ToolResult {
                    id, result, error, ..
                } => Some(json!({
                    "type": "function_call_output",
                    "call_id": id,
                    "output": tool_result_text(result, error.as_deref()),
                })),
                _ => None,
            })
            .collect(),
        CanonicalRole::Assistant => {
            let mut items = Vec::new();
            let text = text_from_parts(&message.content);
            if !text.is_empty() {
                items.push(json!({
                    "type": "message",
                    "role": "assistant",
                    "content": [{ "type": "output_text", "text": text }],
                }));
            }
            for part in &message.content {
                if let ContentPart::ToolCall {
                    id, name, input, ..
                } = part
                {
                    items.push(json!({
                        "type": "function_call",
                        "call_id": id,
                        "name": name,
                        "arguments": input.to_string(),
                    }));
                }
            }
            items
        }
        CanonicalRole::User | CanonicalRole::System | CanonicalRole::Developer => vec![json!({
            "type": "message",
            "role": wire_role(message.role),
            "content": responses_input_content(&message.content),
        })],
    }
}

fn responses_input_content(content: &[ContentPart]) -> Vec<Value> {
    content
        .iter()
        .filter_map(|part| match part {
            ContentPart::Text { text, .. } => Some(json!({ "type": "input_text", "text": text })),
            ContentPart::Media {
                uri, media_type, ..
            } => Some(json!({
                "type": "input_image",
                "image_url": uri,
                "media_type": media_type,
            })),
            _ => None,
        })
        .collect()
}

fn anthropic_message(message: &runtime_core::CanonicalMessage) -> Vec<Value> {
    let role = match message.role {
        CanonicalRole::Assistant => "assistant",
        _ => "user",
    };
    let content = message
        .content
        .iter()
        .filter_map(|part| match part {
            ContentPart::Text { text, .. } => Some(json!({ "type": "text", "text": text })),
            ContentPart::Reasoning { text, .. } => {
                Some(json!({ "type": "thinking", "thinking": text }))
            }
            ContentPart::Media {
                uri, media_type, ..
            } => Some(json!({
                "type": "image",
                "source": { "type": "url", "url": uri, "media_type": media_type },
            })),
            ContentPart::ToolCall {
                id, name, input, ..
            } => Some(json!({
                "type": "tool_use",
                "id": id,
                "name": name,
                "input": input,
            })),
            ContentPart::ToolResult {
                id, result, error, ..
            } => Some(json!({
                "type": "tool_result",
                "tool_use_id": id,
                "content": tool_result_text(result, error.as_deref()),
            })),
        })
        .collect::<Vec<_>>();
    vec![json!({ "role": role, "content": content })]
}

fn text_from_parts(parts: &[ContentPart]) -> String {
    parts
        .iter()
        .filter_map(|part| match part {
            ContentPart::Text { text, .. } => Some(text.as_str()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("")
}

fn tool_result_text(result: &ToolResultValue, error: Option<&str>) -> String {
    if let Some(error) = error.filter(|value| !value.trim().is_empty()) {
        return error.to_string();
    }
    match result {
        ToolResultValue::Text { value } => value.clone(),
        ToolResultValue::Json { value } | ToolResultValue::Error { value } => value.to_string(),
        ToolResultValue::Content { value } => text_from_parts(value),
    }
}
