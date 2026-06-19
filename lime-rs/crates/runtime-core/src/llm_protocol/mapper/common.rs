use super::super::types::{LlmRequest, LlmToolDefinition, ProviderWireRequest};
use app_server_protocol::{ProtocolKind, ResolvedModelRoute};
use serde_json::{json, Map, Value};
use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProtocolMappingError {
    UnsupportedProtocol(ProtocolKind),
    UnsupportedInputPart {
        protocol: ProtocolKind,
        part_type: &'static str,
    },
    EmptyInput,
}

impl fmt::Display for ProtocolMappingError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UnsupportedProtocol(protocol) => {
                write!(
                    f,
                    "unsupported protocol for canonical LLM request: {protocol:?}"
                )
            }
            Self::UnsupportedInputPart {
                protocol,
                part_type,
            } => write!(
                f,
                "input part `{part_type}` is not supported by protocol {protocol:?}"
            ),
            Self::EmptyInput => f.write_str("canonical LLM request must contain input"),
        }
    }
}

impl std::error::Error for ProtocolMappingError {}

pub(crate) fn ensure_has_input(request: &LlmRequest) -> Result<(), ProtocolMappingError> {
    if request
        .instructions
        .as_deref()
        .is_some_and(|value| !value.trim().is_empty())
        || request
            .messages
            .iter()
            .any(|message| !message.parts.is_empty())
    {
        Ok(())
    } else {
        Err(ProtocolMappingError::EmptyInput)
    }
}

pub(crate) fn insert_common_generation_options(
    body: &mut Map<String, Value>,
    route: &ResolvedModelRoute,
    request: &LlmRequest,
) {
    insert_temperature(body, request);
    insert_max_tokens(body, request);
    if let Some(effort) = request
        .reasoning_effort
        .as_deref()
        .or(route.defaults.reasoning_effort.as_deref())
        .and_then(|value| non_empty(Some(value)))
    {
        body.insert("reasoning".to_string(), json!({ "effort": effort }));
    }
    if !request.metadata.is_empty() {
        body.insert("metadata".to_string(), json!(request.metadata));
    }
}

pub(crate) fn insert_temperature(body: &mut Map<String, Value>, request: &LlmRequest) {
    if let Some(temperature) = request.temperature {
        body.insert("temperature".to_string(), json!(temperature));
    }
}

pub(crate) fn insert_max_tokens(body: &mut Map<String, Value>, request: &LlmRequest) {
    if let Some(max_output_tokens) = request.max_output_tokens {
        body.insert("max_tokens".to_string(), json!(max_output_tokens));
    }
}

pub(crate) fn insert_gemini_generation_config(body: &mut Map<String, Value>, request: &LlmRequest) {
    let mut config = Map::new();
    if let Some(temperature) = request.temperature {
        config.insert("temperature".to_string(), json!(temperature));
    }
    if let Some(max_output_tokens) = request.max_output_tokens {
        config.insert("max_output_tokens".to_string(), json!(max_output_tokens));
    }
    if !config.is_empty() {
        body.insert("generation_config".to_string(), Value::Object(config));
    }
}

pub(crate) fn wire_request(protocol: ProtocolKind, path: &str, body: Value) -> ProviderWireRequest {
    ProviderWireRequest {
        protocol,
        method: "POST".to_string(),
        path: path.to_string(),
        body,
    }
}

pub(crate) fn unsupported(protocol: ProtocolKind, part_type: &'static str) -> ProtocolMappingError {
    ProtocolMappingError::UnsupportedInputPart {
        protocol,
        part_type,
    }
}

pub(crate) fn route_protocol_for_responses() -> ProtocolKind {
    ProtocolKind::OpenaiResponses
}

pub(crate) fn json_with_optional_fields<const N: usize>(
    value: Value,
    fields: [(&str, Option<&str>); N],
) -> Value {
    let mut value = value;
    if let Some(object) = value.as_object_mut() {
        for (key, field) in fields {
            if let Some(field) = field.and_then(|value| non_empty(Some(value))) {
                object.insert(key.to_string(), json!(field));
            }
        }
    }
    value
}

pub(crate) fn json_with_value_fields<const N: usize>(
    value: Value,
    fields: [(&str, Option<Value>); N],
) -> Value {
    let mut value = value;
    if let Some(object) = value.as_object_mut() {
        for (key, field) in fields {
            if let Some(field) = field {
                object.insert(key.to_string(), field);
            }
        }
    }
    value
}

pub(crate) fn non_empty(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|value| !value.is_empty())
}

pub(crate) fn output_to_string(output: &Value) -> String {
    match output {
        Value::String(value) => value.clone(),
        value => value.to_string(),
    }
}

pub(crate) fn function_tool_body(tool: &LlmToolDefinition) -> Value {
    json_with_value_fields(
        json!({
            "name": tool.name,
            "parameters": tool.parameters,
        }),
        [(
            "description",
            tool.description.as_ref().map(|value| json!(value)),
        )],
    )
}

pub(crate) fn text_part(part: &super::super::types::LlmInputPart) -> Option<&str> {
    match part {
        super::super::types::LlmInputPart::Text { text } => Some(text),
        _ => None,
    }
}

pub(crate) fn join_text_parts(
    parts: &[super::super::types::LlmInputPart],
    protocol: ProtocolKind,
) -> Result<String, ProtocolMappingError> {
    let mut texts = Vec::new();
    for part in parts {
        match part {
            super::super::types::LlmInputPart::Text { text } => texts.push(text.as_str()),
            super::super::types::LlmInputPart::ToolResult { output, .. } => {
                return Ok(output_to_string(output));
            }
            super::super::types::LlmInputPart::ToolCall { .. } => {
                return Err(unsupported(protocol, "tool_call"));
            }
            super::super::types::LlmInputPart::Image { .. } => {
                return Err(unsupported(protocol, "image"));
            }
            super::super::types::LlmInputPart::Audio { .. } => {
                return Err(unsupported(protocol, "audio"));
            }
            super::super::types::LlmInputPart::File { .. } => {
                return Err(unsupported(protocol, "file"));
            }
        }
    }
    Ok(texts.join("\n"))
}

pub(crate) fn text_only_generation_prompt(
    request: &LlmRequest,
    protocol: ProtocolKind,
) -> Result<String, ProtocolMappingError> {
    if !request.tools.is_empty() {
        return Err(unsupported(protocol, "tools"));
    }

    let mut sections = Vec::new();
    if let Some(instructions) = non_empty(request.instructions.as_deref()) {
        sections.push(instructions.to_string());
    }

    for message in &request.messages {
        for part in &message.parts {
            match part {
                super::super::types::LlmInputPart::Text { text } => {
                    if let Some(text) = non_empty(Some(text)) {
                        sections.push(text.to_string());
                    }
                }
                super::super::types::LlmInputPart::Image { .. } => {
                    return Err(unsupported(protocol, "image"));
                }
                super::super::types::LlmInputPart::Audio { .. } => {
                    return Err(unsupported(protocol, "audio"));
                }
                super::super::types::LlmInputPart::File { .. } => {
                    return Err(unsupported(protocol, "file"));
                }
                super::super::types::LlmInputPart::ToolCall { .. } => {
                    return Err(unsupported(protocol, "tool_call"));
                }
                super::super::types::LlmInputPart::ToolResult { .. } => {
                    return Err(unsupported(protocol, "tool_result"));
                }
            }
        }
    }

    if sections.is_empty() {
        Err(ProtocolMappingError::EmptyInput)
    } else {
        Ok(sections.join("\n\n"))
    }
}
