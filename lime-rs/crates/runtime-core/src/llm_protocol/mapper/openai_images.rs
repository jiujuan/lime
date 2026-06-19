use super::super::types::{LlmRequest, ProviderWireRequest};
use super::common::{non_empty, text_only_generation_prompt, wire_request, ProtocolMappingError};
use app_server_protocol::ResolvedModelRoute;
use serde_json::{json, Map, Value};

const STRING_METADATA_FIELDS: &[&str] = &[
    "size",
    "quality",
    "background",
    "style",
    "response_format",
    "output_format",
    "moderation",
    "user",
];

pub(crate) fn build(
    route: &ResolvedModelRoute,
    request: &LlmRequest,
) -> Result<ProviderWireRequest, ProtocolMappingError> {
    build_for_model(route.protocol.clone(), &route.model_ref.model_id, request)
}

pub(crate) fn build_for_model(
    protocol: app_server_protocol::ProtocolKind,
    model_id: &str,
    request: &LlmRequest,
) -> Result<ProviderWireRequest, ProtocolMappingError> {
    let prompt = text_only_generation_prompt(request, protocol.clone())?;

    let mut body = Map::new();
    body.insert("model".to_string(), json!(model_id));
    body.insert("prompt".to_string(), json!(prompt));
    insert_string_metadata(&mut body, request);
    insert_image_count(&mut body, request);

    Ok(wire_request(
        protocol,
        "images/generations",
        Value::Object(body),
    ))
}

pub(crate) fn body_for_model(
    model_id: &str,
    request: &LlmRequest,
) -> Result<Value, ProtocolMappingError> {
    Ok(build_for_model(
        app_server_protocol::ProtocolKind::OpenaiImages,
        model_id,
        request,
    )?
    .body)
}

fn insert_string_metadata(body: &mut Map<String, Value>, request: &LlmRequest) {
    for key in STRING_METADATA_FIELDS {
        if let Some(value) = request
            .metadata
            .get(*key)
            .and_then(Value::as_str)
            .and_then(|value| non_empty(Some(value)))
        {
            body.insert((*key).to_string(), json!(value));
        }
    }
}

fn insert_image_count(body: &mut Map<String, Value>, request: &LlmRequest) {
    let Some(count) = request.metadata.get("n").and_then(metadata_positive_u64) else {
        return;
    };
    body.insert("n".to_string(), json!(count));
}

fn metadata_positive_u64(value: &Value) -> Option<u64> {
    match value {
        Value::Number(number) => number.as_u64().filter(|value| *value > 0),
        Value::String(raw) => raw.trim().parse::<u64>().ok().filter(|value| *value > 0),
        _ => None,
    }
}
