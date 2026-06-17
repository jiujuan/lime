use super::super::types::{LlmInputPart, LlmRequest, LlmRole, ProviderWireRequest};
use super::common::{
    ensure_has_input, join_text_parts, output_to_string, unsupported, wire_request,
    ProtocolMappingError,
};
use app_server_protocol::ResolvedModelRoute;
use serde_json::{json, Value};

pub(crate) fn build(
    route: &ResolvedModelRoute,
    request: &LlmRequest,
) -> Result<ProviderWireRequest, ProtocolMappingError> {
    ensure_has_input(request)?;
    let mut system_parts = Vec::new();
    if let Some(instructions) = super::common::non_empty(request.instructions.as_deref()) {
        system_parts.push(instructions.to_string());
    }
    let mut messages = Vec::new();
    for message in &request.messages {
        if matches!(message.role, LlmRole::System | LlmRole::Developer) {
            let text = join_text_parts(&message.parts, route.protocol.clone())?;
            if let Some(text) = super::common::non_empty(Some(&text)) {
                system_parts.push(text.to_string());
            }
            continue;
        }
        messages.push(anthropic_message(message, route.protocol.clone())?);
    }

    let mut body = serde_json::Map::new();
    body.insert("model".to_string(), json!(route.model_ref.model_id));
    body.insert("messages".to_string(), Value::Array(messages));
    body.insert("stream".to_string(), json!(request.stream));
    super::common::insert_max_tokens(&mut body, request);
    super::common::insert_temperature(&mut body, request);
    if !system_parts.is_empty() {
        body.insert("system".to_string(), json!(system_parts.join("\n\n")));
    }
    if !request.tools.is_empty() {
        body.insert(
            "tools".to_string(),
            Value::Array(request.tools.iter().map(anthropic_tool).collect()),
        );
    }

    Ok(wire_request(
        route.protocol.clone(),
        "messages",
        Value::Object(body),
    ))
}

fn anthropic_message(
    message: &super::super::types::LlmMessage,
    protocol: app_server_protocol::ProtocolKind,
) -> Result<Value, ProtocolMappingError> {
    let mut content = Vec::new();
    for part in &message.parts {
        match part {
            LlmInputPart::Text { text } => content.push(json!({
                "type": "text",
                "text": text,
            })),
            LlmInputPart::Image {
                image_url,
                mime_type,
                ..
            } => content.push(json!({
                "type": "image",
                "source": {
                    "type": "url",
                    "url": image_url,
                    "media_type": mime_type.as_deref().unwrap_or("image/png"),
                },
            })),
            LlmInputPart::ToolResult { call_id, output } => content.push(json!({
                "type": "tool_result",
                "tool_use_id": call_id,
                "content": output_to_string(output),
            })),
            LlmInputPart::ToolCall {
                call_id,
                name,
                arguments,
            } => content.push(json!({
                "type": "tool_use",
                "id": call_id,
                "name": name,
                "input": arguments,
            })),
            LlmInputPart::Audio { .. } => return Err(unsupported(protocol, "audio")),
            LlmInputPart::File { .. } => return Err(unsupported(protocol, "file")),
        }
    }
    Ok(json!({
        "role": anthropic_role(message.role),
        "content": content,
    }))
}

fn anthropic_tool(tool: &super::super::types::LlmToolDefinition) -> Value {
    super::common::json_with_value_fields(
        json!({
            "name": tool.name,
            "input_schema": tool.parameters,
        }),
        [(
            "description",
            tool.description.as_ref().map(|value| json!(value)),
        )],
    )
}

fn anthropic_role(role: LlmRole) -> &'static str {
    match role {
        LlmRole::Assistant => "assistant",
        _ => "user",
    }
}
