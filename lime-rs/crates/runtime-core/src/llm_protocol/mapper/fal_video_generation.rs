use super::super::types::{LlmRequest, ProviderWireRequest};
use super::common::{non_empty, text_only_generation_prompt, wire_request, ProtocolMappingError};
use app_server_protocol::ProtocolKind;
use serde_json::{json, Map, Value};

const STRING_METADATA_FIELDS: &[&str] = &[
    "provider_id",
    "aspect_ratio",
    "resolution",
    "image_url",
    "end_image_url",
    "user",
];

pub(crate) fn build_for_model(
    model_id: &str,
    request: &LlmRequest,
) -> Result<ProviderWireRequest, ProtocolMappingError> {
    let prompt = text_only_generation_prompt(request, ProtocolKind::Fal)?;

    let mut body = Map::new();
    body.insert("prompt".to_string(), json!(prompt));
    if let Some(model_id) = non_empty(Some(model_id)) {
        body.insert("model".to_string(), json!(model_id));
    }
    insert_string_metadata(&mut body, request);
    insert_u64_metadata(&mut body, request, "duration");
    insert_bool_metadata(&mut body, request, "generate_audio");
    insert_bool_metadata(&mut body, request, "camera_fixed");
    insert_scalar_metadata(&mut body, request, "seed");

    Ok(wire_request(
        ProtocolKind::Fal,
        "videos/generations",
        Value::Object(body),
    ))
}

pub(crate) fn body_for_model(
    model_id: &str,
    request: &LlmRequest,
) -> Result<Value, ProtocolMappingError> {
    Ok(build_for_model(model_id, request)?.body)
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

fn insert_u64_metadata(body: &mut Map<String, Value>, request: &LlmRequest, key: &str) {
    let Some(value) = request.metadata.get(key).and_then(metadata_u64) else {
        return;
    };
    body.insert(key.to_string(), json!(value));
}

fn insert_bool_metadata(body: &mut Map<String, Value>, request: &LlmRequest, key: &str) {
    let Some(value) = request.metadata.get(key).and_then(metadata_bool) else {
        return;
    };
    body.insert(key.to_string(), json!(value));
}

fn insert_scalar_metadata(body: &mut Map<String, Value>, request: &LlmRequest, key: &str) {
    let Some(value) = request.metadata.get(key) else {
        return;
    };
    if matches!(value, Value::Bool(_) | Value::Number(_) | Value::String(_)) {
        body.insert(key.to_string(), value.clone());
    }
}

fn metadata_u64(value: &Value) -> Option<u64> {
    match value {
        Value::Number(number) => number.as_u64(),
        Value::String(raw) => raw.trim().parse::<u64>().ok(),
        _ => None,
    }
}

fn metadata_bool(value: &Value) -> Option<bool> {
    match value {
        Value::Bool(value) => Some(*value),
        Value::String(raw) => match raw.trim() {
            "true" | "1" | "yes" => Some(true),
            "false" | "0" | "no" => Some(false),
            _ => None,
        },
        _ => None,
    }
}
