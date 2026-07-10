use crate::model::ModelConfig;
use crate::providers::base::Usage;
use crate::providers::errors::ProviderError;
use crate::providers::formats::tool_description_with_examples;
use crate::providers::utils::{is_valid_function_name, sanitize_function_name};
use anyhow::Result;
use rmcp::model::{
    object, AnnotateAble, CallToolRequestParam, ErrorCode, ErrorData, RawContent, Role, Tool,
};
use serde::Serialize;
use std::borrow::Cow;
use uuid::Uuid;

use crate::conversation::message::{Message, MessageContent, ProviderMetadata};
use serde_json::{json, Map, Value};
use std::ops::Deref;

pub const THOUGHT_SIGNATURE_KEY: &str = "thoughtSignature";

pub fn metadata_with_signature(signature: &str) -> ProviderMetadata {
    let mut map = ProviderMetadata::new();
    map.insert(THOUGHT_SIGNATURE_KEY.to_string(), json!(signature));
    map
}

pub fn get_thought_signature(metadata: &Option<ProviderMetadata>) -> Option<&str> {
    metadata
        .as_ref()
        .and_then(|m| m.get(THOUGHT_SIGNATURE_KEY))
        .and_then(|v| v.as_str())
}

/// Convert internal Message format to Google's API message specification
pub fn format_messages(messages: &[Message]) -> Vec<Value> {
    messages
        .iter()
        .filter(|m| m.is_agent_visible())
        .filter(|message| {
            message.content.iter().any(|content| {
                !matches!(
                    content,
                    MessageContent::ToolConfirmationRequest(_) | MessageContent::ActionRequired(_)
                )
            })
        })
        .map(|message| {
            let role = if message.role == Role::User {
                "user"
            } else {
                "model"
            };
            let mut parts = Vec::new();
            for message_content in message.content.iter() {
                match message_content {
                    MessageContent::Text(text) => {
                        if !text.text.is_empty() {
                            parts.push(json!({"text": text.text}));
                        }
                    }
                    MessageContent::Image(image) => {
                        if !image.mime_type.is_empty() && !image.data.is_empty() {
                            parts.push(json!({
                                "inline_data": {
                                    "mime_type": image.mime_type,
                                    "data": image.data,
                                }
                            }));
                        }
                    }
                    MessageContent::ToolRequest(request) => match &request.tool_call {
                        Ok(tool_call) => {
                            let mut function_call_part = Map::new();
                            function_call_part.insert(
                                "name".to_string(),
                                json!(sanitize_function_name(&tool_call.name)),
                            );

                            if let Some(args) = &tool_call.arguments {
                                if !args.is_empty() {
                                    function_call_part
                                        .insert("args".to_string(), args.clone().into());
                                }
                            }

                            let mut part = Map::new();
                            part.insert("functionCall".to_string(), json!(function_call_part));

                            if let Some(signature) = get_thought_signature(&request.metadata) {
                                part.insert(THOUGHT_SIGNATURE_KEY.to_string(), json!(signature));
                            }

                            parts.push(json!(part));
                        }
                        Err(e) => {
                            parts.push(json!({"text":format!("Error: {}", e)}));
                        }
                    },
                    MessageContent::ToolResponse(response) => {
                        match &response.tool_result {
                            Ok(result) => {
                                // Send only contents with no audience or with Assistant in the audience
                                let abridged: Vec<_> = result
                                    .content
                                    .iter()
                                    .filter(|content| {
                                        content.audience().is_none_or(|audience| {
                                            audience.contains(&Role::Assistant)
                                        })
                                    })
                                    .map(|content| content.raw.clone())
                                    .collect();

                                let mut tool_content = Vec::new();
                                for content in abridged {
                                    match content {
                                        RawContent::Image(image) => {
                                            parts.push(json!({
                                                "inline_data": {
                                                    "mime_type": image.mime_type,
                                                    "data": image.data,
                                                }
                                            }));
                                        }
                                        _ => {
                                            tool_content.push(content.no_annotation());
                                        }
                                    }
                                }
                                let mut text = tool_content
                                    .iter()
                                    .filter_map(|c| match c.deref() {
                                        RawContent::Text(t) => Some(t.text.clone()),
                                        RawContent::Resource(raw_embedded_resource) => Some(
                                            raw_embedded_resource
                                                .clone()
                                                .no_annotation()
                                                .get_text(),
                                        ),
                                        _ => None,
                                    })
                                    .collect::<Vec<_>>()
                                    .join("\n");

                                if text.is_empty() {
                                    text = "Tool call is done.".to_string();
                                }
                                let mut part = Map::new();
                                let mut function_response = Map::new();
                                function_response.insert("name".to_string(), json!(response.id));
                                function_response.insert(
                                    "response".to_string(),
                                    json!({"content": {"text": text}}),
                                );
                                part.insert(
                                    "functionResponse".to_string(),
                                    json!(function_response),
                                );
                                if let Some(signature) = get_thought_signature(&response.metadata) {
                                    part.insert(
                                        THOUGHT_SIGNATURE_KEY.to_string(),
                                        json!(signature),
                                    );
                                }
                                parts.push(json!(part));
                            }
                            Err(e) => {
                                let mut part = Map::new();
                                let mut function_response = Map::new();
                                function_response.insert("name".to_string(), json!(response.id));
                                function_response.insert(
                                    "response".to_string(),
                                    json!({"content": {"text": format!("Error: {}", e)}}),
                                );
                                part.insert(
                                    "functionResponse".to_string(),
                                    json!(function_response),
                                );
                                if let Some(signature) = get_thought_signature(&response.metadata) {
                                    part.insert(
                                        THOUGHT_SIGNATURE_KEY.to_string(),
                                        json!(signature),
                                    );
                                }
                                parts.push(json!(part));
                            }
                        }
                    }
                    MessageContent::Thinking(thinking) => {
                        let mut part = Map::new();
                        part.insert("text".to_string(), json!(thinking.thinking));
                        part.insert("thoughtSignature".to_string(), json!(thinking.signature));
                        parts.push(json!(part));
                    }

                    _ => {}
                }
            }
            json!({"role": role, "parts": parts})
        })
        .collect()
}

pub fn format_tools(tools: &[Tool]) -> Vec<Value> {
    tools
        .iter()
        .map(|tool| {
            let mut parameters = Map::new();
            parameters.insert("name".to_string(), json!(tool.name));
            parameters.insert(
                "description".to_string(),
                json!(tool_description_with_examples(tool)),
            );
            let tool_input_schema = &tool.input_schema;

            if tool_input_schema
                .get("properties")
                .and_then(|v| v.as_object())
                .is_some_and(|p| !p.is_empty())
            {
                parameters.insert(
                    "parameters".to_string(),
                    process_map(tool_input_schema, None),
                );
            }
            json!(parameters)
        })
        .collect()
}

pub fn get_accepted_keys(parent_key: Option<&str>) -> Vec<&str> {
    match parent_key {
        Some("properties") => vec![
            "anyOf",
            "allOf",
            "type",
            "description",
            "nullable",
            "enum",
            "properties",
            "required",
            "items",
        ],
        Some("items") => vec!["type", "properties", "items", "required"],
        _ => vec!["type", "properties", "required", "anyOf", "allOf"],
    }
}

pub fn process_value(value: &Value, parent_key: Option<&str>) -> Value {
    match value {
        Value::Object(map) => process_map(map, parent_key),
        Value::Array(arr) if parent_key == Some("type") => arr
            .iter()
            .find(|v| v.as_str() != Some("null"))
            .cloned()
            .unwrap_or_else(|| json!("string")),
        _ => value.clone(),
    }
}

/// Process a JSON map to filter out unsupported attributes, mirroring the logic
/// from the official Google Gemini CLI.
/// See: https://github.com/google-gemini/gemini-cli/blob/8a6509ffeba271a8e7ccb83066a9a31a5d72a647/packages/core/src/tools/tool-registry.ts#L356
pub fn process_map(map: &Map<String, Value>, parent_key: Option<&str>) -> Value {
    let accepted_keys = get_accepted_keys(parent_key);

    let filtered_map: Map<String, Value> = map
        .iter()
        .filter_map(|(key, value)| {
            if !accepted_keys.contains(&key.as_str()) {
                return None;
            }

            let processed_value = match key.as_str() {
                "properties" => {
                    if let Some(nested_map) = value.as_object() {
                        let processed_properties: Map<String, Value> = nested_map
                            .iter()
                            .map(|(prop_key, prop_value)| {
                                if let Some(prop_obj) = prop_value.as_object() {
                                    (prop_key.clone(), process_map(prop_obj, Some("properties")))
                                } else {
                                    (prop_key.clone(), prop_value.clone())
                                }
                            })
                            .collect();
                        Value::Object(processed_properties)
                    } else {
                        value.clone()
                    }
                }
                "items" => {
                    if let Some(items_map) = value.as_object() {
                        process_map(items_map, Some("items"))
                    } else {
                        value.clone()
                    }
                }
                "anyOf" | "allOf" => {
                    if let Some(arr) = value.as_array() {
                        let processed_arr: Vec<Value> = arr
                            .iter()
                            .map(|item| {
                                item.as_object().map_or_else(
                                    || item.clone(),
                                    |obj| process_map(obj, parent_key),
                                )
                            })
                            .collect();
                        Value::Array(processed_arr)
                    } else {
                        value.clone()
                    }
                }
                _ => process_value(value, Some(key.as_str())),
            };

            Some((key.clone(), processed_value))
        })
        .collect();

    Value::Object(filtered_map)
}

#[derive(Clone, Copy)]
enum SignedTextHandling {
    SkipSignedText,
    SignedTextAsThinking,
    SignedTextAsRegularText,
}

pub fn process_response_part(
    part: &Value,
    last_signature: &mut Option<String>,
) -> Option<MessageContent> {
    // For streaming: skip text with signatures (matches Anthropic/OpenAI behavior)
    process_response_part_impl(part, last_signature, SignedTextHandling::SkipSignedText)
}

fn process_response_part_non_streaming(
    part: &Value,
    last_signature: &mut Option<String>,
    has_function_calls: bool,
) -> Option<MessageContent> {
    // For non-streaming: signed text is thinking only if there are function calls
    let handling = if has_function_calls {
        SignedTextHandling::SignedTextAsThinking
    } else {
        SignedTextHandling::SignedTextAsRegularText
    };
    process_response_part_impl(part, last_signature, handling)
}

fn process_response_part_impl(
    part: &Value,
    last_signature: &mut Option<String>,
    signed_text_handling: SignedTextHandling,
) -> Option<MessageContent> {
    let signature = part.get(THOUGHT_SIGNATURE_KEY).and_then(|v| v.as_str());

    if let Some(sig) = signature {
        *last_signature = Some(sig.to_string());
    }

    let text_value = part.get("text");
    if let Some(text) = text_value.and_then(|v| v.as_str()) {
        if text.is_empty() {
            return None;
        }
        match (signature, signed_text_handling) {
            (Some(_), SignedTextHandling::SkipSignedText) => None,
            (Some(sig), SignedTextHandling::SignedTextAsThinking) => {
                Some(MessageContent::thinking(text.to_string(), sig.to_string()))
            }
            _ => Some(MessageContent::text(text.to_string())),
        }
    } else if text_value.is_some() {
        tracing::warn!(
            "Google response part has 'text' field but it's not a string: {:?}",
            text_value
        );
        None
    } else if let Some(function_call) = part.get("functionCall") {
        let id = Uuid::new_v4().to_string();
        let name = function_call["name"].as_str().unwrap_or_default();

        if !is_valid_function_name(name) {
            let error = ErrorData {
                code: ErrorCode::INVALID_REQUEST,
                message: Cow::from(format!(
                    "The provided function name '{}' had invalid characters, it must match this regex [a-zA-Z0-9_-]+",
                    name
                )),
                data: None,
            };
            Some(MessageContent::tool_request(id, Err(error)))
        } else {
            let arguments = function_call
                .get("args")
                .map(|params| object(params.clone()));
            let effective_signature = signature.or(last_signature.as_deref());
            let metadata = effective_signature.map(metadata_with_signature);

            Some(MessageContent::tool_request_with_metadata(
                id,
                Ok(CallToolRequestParam {
                    name: name.to_string().into(),
                    arguments,
                }),
                metadata.as_ref(),
            ))
        }
    } else {
        None
    }
}

pub fn response_to_message(response: Value) -> Result<Message> {
    let role = Role::Assistant;
    let created = chrono::Utc::now().timestamp();

    let parts = response
        .get("candidates")
        .and_then(|v| v.as_array())
        .and_then(|c| c.first())
        .and_then(|c| c.get("content"))
        .and_then(|c| c.get("parts"))
        .and_then(|p| p.as_array());

    let Some(parts) = parts else {
        return Ok(Message::new(role, created, Vec::new()));
    };

    let has_function_calls = parts.iter().any(|p| p.get("functionCall").is_some());

    let mut content = Vec::new();
    let mut last_signature: Option<String> = None;

    for part in parts {
        if let Some(msg_content) =
            process_response_part_non_streaming(part, &mut last_signature, has_function_calls)
        {
            content.push(msg_content);
        }
    }
    Ok(Message::new(role, created, content))
}

/// Extract usage information from Google's API response
pub fn get_usage(data: &Value) -> Result<Usage> {
    if let Some(usage_meta_data) = data.get("usageMetadata") {
        let input_tokens = usage_meta_data
            .get("promptTokenCount")
            .and_then(|v| v.as_u64())
            .map(|v| v as i32);
        let output_tokens = usage_meta_data
            .get("candidatesTokenCount")
            .and_then(|v| v.as_u64())
            .map(|v| v as i32);
        let total_tokens = usage_meta_data
            .get("totalTokenCount")
            .and_then(|v| v.as_u64())
            .map(|v| v as i32);
        Ok(Usage::new(input_tokens, output_tokens, total_tokens))
    } else {
        tracing::debug!(
            "Failed to get usage data: {}",
            ProviderError::UsageError("No usage data found in response".to_string())
        );
        // If no usage data, return None for all values
        Ok(Usage::new(None, None, None))
    }
}

pub fn response_to_streaming_message<S>(
    mut stream: S,
) -> impl futures::Stream<
    Item = anyhow::Result<(
        Option<Message>,
        Option<crate::providers::base::ProviderUsage>,
    )>,
> + 'static
where
    S: futures::Stream<Item = anyhow::Result<String>> + Unpin + Send + 'static,
{
    use async_stream::try_stream;
    use futures::StreamExt;

    try_stream! {
        let mut final_usage: Option<crate::providers::base::ProviderUsage> = None;
        let mut last_signature: Option<String> = None;
        let stream_id = Uuid::new_v4().to_string();
        let mut incomplete_data: Option<String> = None;

        while let Some(line_result) = stream.next().await {
            let line = line_result?;

            if line.trim().is_empty() {
                continue;
            }

            let data_part = if line.starts_with("data: ") {
                line.strip_prefix("data: ").unwrap()
            } else if line.starts_with("event:") || line.starts_with("id:") || line.starts_with("retry:") {
                continue;
            } else if incomplete_data.is_some() {
                &line
            } else {
                continue;
            };

            if data_part.trim() == "[DONE]" {
                break;
            }

            let chunk: Value = if let Some(ref mut incomplete) = incomplete_data {
                incomplete.push_str(data_part);
                match serde_json::from_str(incomplete) {
                    Ok(v) => {
                        incomplete_data = None;
                        v
                    }
                    Err(e) => {
                        if e.is_eof() {
                            continue;
                        }
                        tracing::warn!("Failed to parse streaming chunk: {}", e);
                        incomplete_data = None;
                        continue;
                    }
                }
            } else {
                match serde_json::from_str(data_part) {
                    Ok(v) => v,
                    Err(e) => {
                        if e.is_eof() {
                            incomplete_data = Some(data_part.to_string());
                            continue;
                        }
                        tracing::warn!("Failed to parse streaming chunk: {}", e);
                        continue;
                    }
                }
            };

            if let Some(error) = chunk.get("error") {
                let message = error
                    .get("message")
                    .and_then(|m| m.as_str())
                    .unwrap_or("Unknown error");
                let status = error
                    .get("status")
                    .and_then(|s| s.as_str())
                    .unwrap_or("UNKNOWN");
                Err(anyhow::anyhow!("Google API error ({}): {}", status, message))?;
            }

            if let Ok(usage) = get_usage(&chunk) {
                if usage.input_tokens.is_some() || usage.output_tokens.is_some() {
                    let model = chunk.get("modelVersion")
                        .and_then(|v| v.as_str())
                        .unwrap_or("unknown")
                        .to_string();
                    final_usage = Some(crate::providers::base::ProviderUsage::new(model, usage));
                }
            }

            let parts = chunk
                .get("candidates")
                .and_then(|v| v.as_array())
                .and_then(|c| c.first())
                .and_then(|c| c.get("content"))
                .and_then(|c| c.get("parts"))
                .and_then(|p| p.as_array());

            if let Some(parts) = parts {
                for part in parts {
                    if let Some(content) = process_response_part(part, &mut last_signature) {
                        let message = Message::new(
                            Role::Assistant,
                            chrono::Utc::now().timestamp(),
                            vec![content],
                        ).with_id(stream_id.clone());
                        yield (Some(message), None);
                    }
                }
            }
        }

        if let Some(usage) = final_usage {
            yield (None, Some(usage));
        }
    }
}

#[derive(Serialize)]
struct TextPart<'a> {
    text: &'a str,
}

#[derive(Serialize)]
struct SystemInstruction<'a> {
    parts: [TextPart<'a>; 1],
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ToolsWrapper {
    function_declarations: Vec<Value>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GenerationConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_output_tokens: Option<i32>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GoogleRequest<'a> {
    system_instruction: SystemInstruction<'a>,
    contents: Vec<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<ToolsWrapper>,
    #[serde(skip_serializing_if = "Option::is_none")]
    generation_config: Option<GenerationConfig>,
}

pub fn create_request(
    model_config: &ModelConfig,
    system: &str,
    messages: &[Message],
    tools: &[Tool],
) -> Result<Value> {
    let tools_wrapper = if tools.is_empty() {
        None
    } else {
        Some(ToolsWrapper {
            function_declarations: format_tools(tools),
        })
    };

    let generation_config =
        if model_config.temperature.is_some() || model_config.max_tokens.is_some() {
            Some(GenerationConfig {
                temperature: model_config.temperature.map(|t| t as f64),
                max_output_tokens: model_config.max_tokens,
            })
        } else {
            None
        };

    let request = GoogleRequest {
        system_instruction: SystemInstruction {
            parts: [TextPart { text: system }],
        },
        contents: format_messages(messages),
        tools: tools_wrapper,
        generation_config,
    };

    Ok(serde_json::to_value(request)?)
}
