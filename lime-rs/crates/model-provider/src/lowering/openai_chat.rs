use super::common::{
    ensure_has_input, function_tool_body, json_with_value_fields, output_to_string, unsupported,
    wire_request, ProtocolMappingError,
};
use app_server_protocol::ResolvedModelRoute;
use runtime_core::{LlmInputPart, LlmMessage, LlmRequest, LlmRole, ProviderWireRequest};
use serde_json::{json, Value};

pub(crate) fn build(
    route: &ResolvedModelRoute,
    request: &LlmRequest,
) -> Result<ProviderWireRequest, ProtocolMappingError> {
    ensure_has_input(request)?;
    let mut messages = Vec::new();
    if let Some(instructions) = super::common::non_empty(request.instructions.as_deref()) {
        messages.push(json!({
            "role": "system",
            "content": instructions,
        }));
    }
    for message in &request.messages {
        messages.push(openai_chat_message(message, route.protocol.clone())?);
    }

    let mut body = serde_json::Map::new();
    body.insert("model".to_string(), json!(route.model_ref.model_id));
    body.insert("messages".to_string(), Value::Array(messages));
    body.insert("stream".to_string(), json!(request.stream));
    super::common::insert_common_generation_options(&mut body, route, request);
    if !request.tools.is_empty() {
        body.insert(
            "tools".to_string(),
            Value::Array(
                request
                    .tools
                    .iter()
                    .map(|tool| {
                        json!({
                            "type": "function",
                            "function": function_tool_body(tool),
                        })
                    })
                    .collect(),
            ),
        );
    }

    Ok(wire_request(
        route.protocol.clone(),
        "chat/completions",
        Value::Object(body),
    ))
}

fn openai_chat_message(
    message: &LlmMessage,
    protocol: app_server_protocol::ProtocolKind,
) -> Result<Value, ProtocolMappingError> {
    if message.role == LlmRole::Tool {
        let (call_id, output) = first_tool_result(&message.parts, protocol.clone())?;
        return Ok(json!({
            "role": "tool",
            "tool_call_id": call_id,
            "content": output_to_string(output),
        }));
    }

    let tool_calls = chat_tool_calls(&message.parts);
    if message.role == LlmRole::Assistant && !tool_calls.is_empty() {
        let content = join_text_parts_if_any(&message.parts, protocol.clone())?;
        return Ok(json_with_value_fields(
            json!({
                "role": "assistant",
                "content": content,
                "tool_calls": tool_calls,
            }),
            [],
        ));
    }

    let content = chat_content(&message.parts, protocol.clone())?;
    Ok(json!({
        "role": wire_role(message.role),
        "content": content,
    }))
}

fn wire_role(role: LlmRole) -> &'static str {
    match role {
        LlmRole::System => "system",
        LlmRole::Developer => "developer",
        LlmRole::User => "user",
        LlmRole::Assistant => "assistant",
        LlmRole::Tool => "tool",
    }
}

fn chat_content(
    parts: &[LlmInputPart],
    protocol: app_server_protocol::ProtocolKind,
) -> Result<Value, ProtocolMappingError> {
    if parts.len() == 1 {
        if let Some(text) = super::common::text_part(&parts[0]) {
            return Ok(json!(text));
        }
    }

    let mut content = Vec::new();
    for part in parts {
        match part {
            LlmInputPart::Text { text } => content.push(json!({
                "type": "text",
                "text": text,
            })),
            LlmInputPart::Image { image_url, .. } => content.push(json!({
                "type": "image_url",
                "image_url": {
                    "url": image_url,
                },
            })),
            LlmInputPart::Audio { .. } => return Err(unsupported(protocol, "audio")),
            LlmInputPart::File { .. } => return Err(unsupported(protocol, "file")),
            LlmInputPart::ToolCall { .. } => return Err(unsupported(protocol, "tool_call")),
            LlmInputPart::ToolResult { .. } => return Err(unsupported(protocol, "tool_result")),
        }
    }
    Ok(Value::Array(content))
}

fn first_tool_result(
    parts: &[LlmInputPart],
    protocol: app_server_protocol::ProtocolKind,
) -> Result<(&str, &Value), ProtocolMappingError> {
    parts
        .iter()
        .find_map(|part| match part {
            LlmInputPart::ToolResult { call_id, output } => Some((call_id.as_str(), output)),
            _ => None,
        })
        .ok_or_else(|| unsupported(protocol, "tool"))
}

fn chat_tool_calls(parts: &[LlmInputPart]) -> Vec<Value> {
    parts
        .iter()
        .filter_map(|part| match part {
            LlmInputPart::ToolCall {
                call_id,
                name,
                arguments,
            } => Some(json!({
                "id": call_id,
                "type": "function",
                "function": {
                    "name": name,
                    "arguments": output_to_string(arguments),
                },
            })),
            _ => None,
        })
        .collect()
}

fn join_text_parts_if_any(
    parts: &[LlmInputPart],
    protocol: app_server_protocol::ProtocolKind,
) -> Result<Value, ProtocolMappingError> {
    let mut texts = Vec::new();
    for part in parts {
        match part {
            LlmInputPart::Text { text } => texts.push(text.as_str()),
            LlmInputPart::ToolCall { .. } => {}
            LlmInputPart::Image { .. } => return Err(unsupported(protocol, "image")),
            LlmInputPart::Audio { .. } => return Err(unsupported(protocol, "audio")),
            LlmInputPart::File { .. } => return Err(unsupported(protocol, "file")),
            LlmInputPart::ToolResult { .. } => return Err(unsupported(protocol, "tool_result")),
        }
    }
    if texts.is_empty() {
        Ok(Value::Null)
    } else {
        Ok(json!(texts.join("\n")))
    }
}
