use super::super::types::{LlmInputPart, LlmRequest, LlmRole, ProviderWireRequest};
use super::common::{
    ensure_has_input, insert_common_generation_options, json_with_optional_fields,
    json_with_value_fields, output_to_string, route_protocol_for_responses, unsupported,
    wire_request, ProtocolMappingError,
};
use app_server_protocol::ResolvedModelRoute;
use serde_json::{json, Value};

pub(crate) fn build(
    route: &ResolvedModelRoute,
    request: &LlmRequest,
) -> Result<ProviderWireRequest, ProtocolMappingError> {
    ensure_has_input(request)?;
    let mut body = serde_json::Map::new();
    body.insert("model".to_string(), json!(route.model_ref.model_id));
    body.insert("input".to_string(), Value::Array(responses_input(request)?));
    body.insert("stream".to_string(), json!(request.stream));
    insert_common_generation_options(&mut body, route, request);
    if let Some(instructions) = super::common::non_empty(request.instructions.as_deref()) {
        body.insert("instructions".to_string(), json!(instructions));
    }
    if !request.tools.is_empty() {
        body.insert(
            "tools".to_string(),
            Value::Array(request.tools.iter().map(responses_tool_body).collect()),
        );
    }

    Ok(wire_request(
        route.protocol.clone(),
        "responses",
        Value::Object(body),
    ))
}

fn responses_tool_body(tool: &super::super::types::LlmToolDefinition) -> Value {
    json_with_value_fields(
        json!({
            "type": "function",
            "name": tool.name,
            "parameters": tool.parameters,
        }),
        [(
            "description",
            tool.description.as_ref().map(|value| json!(value)),
        )],
    )
}

fn responses_input(request: &LlmRequest) -> Result<Vec<Value>, ProtocolMappingError> {
    let mut items = Vec::new();
    for message in &request.messages {
        match message.role {
            LlmRole::Tool => {
                for part in &message.parts {
                    match part {
                        LlmInputPart::ToolResult { call_id, output } => {
                            items.push(json!({
                                "type": "function_call_output",
                                "call_id": call_id,
                                "output": responses_tool_output(output),
                            }));
                        }
                        _ => return Err(unsupported(route_protocol_for_responses(), "tool")),
                    }
                }
            }
            LlmRole::Assistant => {
                let mut content = Vec::new();
                for part in &message.parts {
                    match part {
                        LlmInputPart::Text { text } => content.push(json!({
                            "type": "output_text",
                            "text": text,
                        })),
                        LlmInputPart::ToolCall {
                            call_id,
                            name,
                            arguments,
                        } => {
                            if !content.is_empty() {
                                items.push(json!({
                                    "type": "message",
                                    "role": "assistant",
                                    "content": content,
                                }));
                                content = Vec::new();
                            }
                            items.push(json!({
                                "type": "function_call",
                                "call_id": call_id,
                                "name": name,
                                "arguments": output_to_string(arguments),
                            }));
                        }
                        LlmInputPart::ToolResult { .. } => {
                            return Err(unsupported(route_protocol_for_responses(), "tool_result"));
                        }
                        LlmInputPart::Image { .. } => {
                            return Err(unsupported(route_protocol_for_responses(), "image"));
                        }
                        LlmInputPart::Audio { .. } => {
                            return Err(unsupported(route_protocol_for_responses(), "audio"));
                        }
                        LlmInputPart::File { .. } => {
                            return Err(unsupported(route_protocol_for_responses(), "file"));
                        }
                    }
                }
                if !content.is_empty() {
                    items.push(json!({
                        "type": "message",
                        "role": "assistant",
                        "content": content,
                    }));
                }
            }
            _ => {
                let mut content = Vec::new();
                for part in &message.parts {
                    match part {
                        LlmInputPart::Text { text } => content.push(json!({
                            "type": "input_text",
                            "text": text,
                        })),
                        LlmInputPart::Image {
                            image_url, detail, ..
                        } => content.push(json_with_optional_fields(
                            json!({
                                "type": "input_image",
                                "image_url": image_url,
                            }),
                            [("detail", detail.as_deref())],
                        )),
                        LlmInputPart::File {
                            file_url,
                            mime_type,
                        } => content.push(json_with_value_fields(
                            json!({
                                "type": "input_file",
                                "file_url": file_url,
                            }),
                            [("mime_type", mime_type.as_ref().map(|value| json!(value)))],
                        )),
                        LlmInputPart::ToolCall { .. } => {
                            return Err(unsupported(route_protocol_for_responses(), "tool_call"));
                        }
                        LlmInputPart::ToolResult { .. } => {
                            return Err(unsupported(route_protocol_for_responses(), "tool_result"));
                        }
                        LlmInputPart::Audio { .. } => {
                            return Err(unsupported(route_protocol_for_responses(), "audio"));
                        }
                    }
                }
                if !content.is_empty() {
                    items.push(json!({
                        "type": "message",
                        "role": message.role.as_wire_role(),
                        "content": content,
                    }));
                }
            }
        }
    }
    Ok(items)
}

fn responses_tool_output(output: &Value) -> Value {
    match output {
        Value::String(_) | Value::Array(_) => output.clone(),
        value => Value::String(value.to_string()),
    }
}
