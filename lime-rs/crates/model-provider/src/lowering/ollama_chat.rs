use super::common::{ensure_has_input, join_text_parts, wire_request, ProtocolMappingError};
use app_server_protocol::ResolvedModelRoute;
use runtime_core::{LlmRequest, LlmRole, ProviderWireRequest};
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
        messages.push(json!({
            "role": ollama_role(message.role),
            "content": join_text_parts(&message.parts, route.protocol.clone())?,
        }));
    }

    let mut body = serde_json::Map::new();
    body.insert("model".to_string(), json!(route.model_ref.model_id));
    body.insert("messages".to_string(), Value::Array(messages));
    body.insert("stream".to_string(), json!(request.stream));
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
                            "function": super::common::function_tool_body(tool),
                        })
                    })
                    .collect(),
            ),
        );
    }

    Ok(wire_request(
        route.protocol.clone(),
        "api/chat",
        Value::Object(body),
    ))
}

fn ollama_role(role: LlmRole) -> &'static str {
    match role {
        LlmRole::System => "system",
        LlmRole::Assistant => "assistant",
        _ => "user",
    }
}
