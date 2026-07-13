use super::common::{
    ensure_has_input, function_tool_body, insert_gemini_generation_config, unsupported,
    wire_request, ProtocolMappingError,
};
use app_server_protocol::ResolvedModelRoute;
use runtime_core::{LlmInputPart, LlmRequest, LlmRole, ProviderWireRequest};
use serde_json::{json, Value};

pub(crate) fn build(
    route: &ResolvedModelRoute,
    request: &LlmRequest,
) -> Result<ProviderWireRequest, ProtocolMappingError> {
    ensure_has_input(request)?;
    let mut system_parts = Vec::new();
    if let Some(instructions) = super::common::non_empty(request.instructions.as_deref()) {
        system_parts.push(json!({ "text": instructions }));
    }

    let mut contents = Vec::new();
    for message in &request.messages {
        if matches!(message.role, LlmRole::System | LlmRole::Developer) {
            for part in gemini_parts(&message.parts, route.protocol.clone())? {
                system_parts.push(part);
            }
            continue;
        }
        contents.push(json!({
            "role": gemini_role(message.role),
            "parts": gemini_parts(&message.parts, route.protocol.clone())?,
        }));
    }

    let mut body = serde_json::Map::new();
    body.insert("contents".to_string(), Value::Array(contents));
    if !system_parts.is_empty() {
        body.insert(
            "system_instruction".to_string(),
            json!({ "parts": system_parts }),
        );
    }
    insert_gemini_generation_config(&mut body, request);
    if !request.tools.is_empty() {
        body.insert(
            "tools".to_string(),
            Value::Array(vec![json!({
                "function_declarations": request.tools.iter().map(function_tool_body).collect::<Vec<_>>()
            })]),
        );
    }

    let operation = if request.stream {
        "streamGenerateContent"
    } else {
        "generateContent"
    };
    Ok(wire_request(
        route.protocol.clone(),
        &format!("models/{}:{operation}", route.model_ref.model_id),
        Value::Object(body),
    ))
}

fn gemini_role(role: LlmRole) -> &'static str {
    match role {
        LlmRole::Assistant => "model",
        _ => "user",
    }
}

fn gemini_parts(
    parts: &[LlmInputPart],
    protocol: app_server_protocol::ProtocolKind,
) -> Result<Vec<Value>, ProtocolMappingError> {
    let mut values = Vec::new();
    for part in parts {
        match part {
            LlmInputPart::Text { text } => values.push(json!({ "text": text })),
            LlmInputPart::Image {
                image_url,
                mime_type,
                ..
            }
            | LlmInputPart::File {
                file_url: image_url,
                mime_type,
            } => values.push(json!({
                "file_data": {
                    "mime_type": mime_type.as_deref().unwrap_or("application/octet-stream"),
                    "file_uri": image_url,
                },
            })),
            LlmInputPart::ToolResult { call_id, output } => values.push(json!({
                "function_response": {
                    "name": call_id,
                    "response": output,
                },
            })),
            LlmInputPart::ToolCall {
                name, arguments, ..
            } => values.push(json!({
                "function_call": {
                    "name": name,
                    "args": arguments,
                },
            })),
            LlmInputPart::Audio { .. } => return Err(unsupported(protocol, "audio")),
        }
    }
    Ok(values)
}
