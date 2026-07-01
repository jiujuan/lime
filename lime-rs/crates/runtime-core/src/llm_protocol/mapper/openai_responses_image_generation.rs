use super::super::types::{
    LlmRequest, ProviderWireRequest, ResponsesImageGenerationInputShape,
    ResponsesImageGenerationOptions,
};
use super::common::{
    json_with_value_fields, non_empty, text_only_generation_prompt, wire_request,
    ProtocolMappingError,
};
use app_server_protocol::{ProtocolKind, ResolvedModelRoute};
use serde_json::{json, Value};

const DEFAULT_RESPONSES_IMAGE_GENERATION_OUTER_MODEL: &str = "gpt-5.5";

pub(crate) fn build(
    route: &ResolvedModelRoute,
    request: &LlmRequest,
    options: &ResponsesImageGenerationOptions,
) -> Result<ProviderWireRequest, ProtocolMappingError> {
    match route.protocol {
        ProtocolKind::OpenaiResponses | ProtocolKind::CodexResponses => {}
        _ => {
            return Err(ProtocolMappingError::UnsupportedProtocol(
                route.protocol.clone(),
            ))
        }
    }

    let prompt = text_only_generation_prompt(request, route.protocol.clone())?;
    Ok(wire_request(
        route.protocol.clone(),
        "responses",
        body_for_model_inner(&route.model_ref.model_id, &prompt, options),
    ))
}

pub(crate) fn body_for_model(
    model_id: &str,
    request: &LlmRequest,
    options: &ResponsesImageGenerationOptions,
) -> Result<Value, ProtocolMappingError> {
    let prompt = text_only_generation_prompt(request, ProtocolKind::OpenaiResponses)?;
    Ok(body_for_model_inner(model_id, &prompt, options))
}

fn body_for_model_inner(
    model_id: &str,
    prompt: &str,
    options: &ResponsesImageGenerationOptions,
) -> Value {
    json!({
        "model": options
            .outer_model
            .as_deref()
            .and_then(|value| non_empty(Some(value)))
            .unwrap_or(DEFAULT_RESPONSES_IMAGE_GENERATION_OUTER_MODEL),
        "input": responses_image_generation_input(
            prompt,
            options.input_shape,
            &options.reference_image_urls,
        ),
        "tools": [responses_image_generation_tool(model_id)],
        "stream": true,
    })
}

fn responses_image_generation_input(
    prompt: &str,
    input_shape: ResponsesImageGenerationInputShape,
    reference_image_urls: &[String],
) -> Value {
    let references: Vec<&str> = reference_image_urls
        .iter()
        .filter_map(|value| non_empty(Some(value)))
        .collect();
    if input_shape == ResponsesImageGenerationInputShape::PromptString && references.is_empty() {
        return json!(prompt);
    }

    let mut content = vec![json!({
        "type": "input_text",
        "text": prompt,
    })];
    content.extend(references.into_iter().map(|image_url| {
        json!({
            "type": "input_image",
            "image_url": image_url,
        })
    }));

    json!([
        {
            "role": "user",
            "content": content,
        }
    ])
}

fn responses_image_generation_tool(model: &str) -> Value {
    let normalized_model = normalize_responses_image_generation_tool_model(model);
    json_with_value_fields(
        json!({
            "type": "image_generation",
        }),
        [(
            "model",
            non_empty(Some(&normalized_model)).map(|value| json!(value)),
        )],
    )
}

fn normalize_responses_image_generation_tool_model(model: &str) -> String {
    let trimmed = model.trim();
    if let Some(version) = trimmed.strip_prefix("gpt-images-") {
        return format!("gpt-image-{version}");
    }

    trimmed.to_string()
}
