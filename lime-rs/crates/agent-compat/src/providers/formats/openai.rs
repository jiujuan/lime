use crate::conversation::message::{Message, MessageContent, MessageMetadata};
use crate::model::ModelConfig;
use crate::providers::base::{ProviderUsage, Usage};
use crate::providers::formats::tool_description_with_examples;
use crate::providers::utils::{
    convert_image, detect_image_path, load_image_file, parse_tool_arguments_json_object,
    sanitize_function_name, ImageFormat,
};
use anyhow::{anyhow, Error};
use async_stream::try_stream;
use chrono;
use futures::Stream;
use rmcp::model::{
    object, AnnotateAble, CallToolRequestParam, Content, ErrorCode, ErrorData, RawContent,
    ResourceContents, Role, Tool,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::borrow::Cow;
use std::ops::Deref;

#[derive(Serialize, Deserialize, Debug)]
struct DeltaToolCallFunction {
    name: Option<String>,
    namespace: Option<String>,
    arguments: Option<Value>, // chunk of encoded JSON,
}

#[derive(Serialize, Deserialize, Debug)]
struct DeltaToolCall {
    id: Option<String>,
    function: Option<DeltaToolCallFunction>,
    name: Option<String>,
    namespace: Option<String>,
    arguments: Option<Value>,
    index: Option<i32>,
    r#type: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
struct Delta {
    content: Option<String>,
    role: Option<String>,
    tool_calls: Option<Vec<DeltaToolCall>>,
    /// OpenAI-compatible 推理内容，兼容 DeepSeek(`reasoning_content`) 与 Ollama(`reasoning`)
    reasoning_content: Option<String>,
    reasoning: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
struct StreamingChoice {
    delta: Delta,
    index: Option<i32>,
    finish_reason: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
struct StreamingChunk {
    choices: Vec<StreamingChoice>,
    created: Option<i64>,
    id: Option<String>,
    usage: Option<Value>,
    model: Option<String>,
}

#[derive(Debug, Default)]
struct StreamingToolCallAccumulator {
    id: Option<String>,
    name: Option<String>,
    arguments: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OpenAiSystemPromptRolePolicy {
    /// OpenAI-compatible providers are safest with the broadly supported system role.
    System,
    /// First-party OpenAI reasoning chat models expect the newer developer role.
    DeveloperForOpenAiReasoningModels,
}

fn is_openai_reasoning_chat_model(model_name: &str) -> bool {
    model_name.starts_with("o1")
        || model_name.starts_with("o2")
        || model_name.starts_with("o3")
        || model_name.starts_with("o4")
        || model_name.starts_with("gpt-5")
}

fn system_prompt_role_for_model(
    policy: OpenAiSystemPromptRolePolicy,
    model_name: &str,
) -> &'static str {
    match policy {
        OpenAiSystemPromptRolePolicy::DeveloperForOpenAiReasoningModels
            if is_openai_reasoning_chat_model(model_name) =>
        {
            "developer"
        }
        _ => "system",
    }
}

fn split_openai_reasoning_effort_suffix(model_name: &str) -> (String, Option<String>) {
    let parts: Vec<&str> = model_name.split('-').collect();
    let Some(last_part) = parts.last() else {
        return (model_name.to_string(), None);
    };

    match *last_part {
        "low" | "medium" | "high" if parts.len() > 1 => (
            parts[..parts.len() - 1].join("-"),
            Some(last_part.to_string()),
        ),
        _ => (model_name.to_string(), None),
    }
}

fn resolve_openai_reasoning_effort(
    model_config: &ModelConfig,
    is_reasoning_model: bool,
) -> (String, Option<String>) {
    let explicit_effort = model_config
        .reasoning_effort
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string);

    if is_reasoning_model {
        let (model_name, suffix_effort) =
            split_openai_reasoning_effort_suffix(&model_config.model_name);
        if explicit_effort.is_some() {
            return (model_name, explicit_effort);
        }
        return (
            model_name,
            Some(suffix_effort.unwrap_or_else(|| "medium".to_string())),
        );
    }

    (model_config.model_name.to_string(), explicit_effort)
}

fn tool_input_delta_message(
    id: String,
    name: Option<String>,
    delta: String,
    accumulated_arguments: String,
    provider: &str,
) -> Message {
    Message::assistant()
        .with_tool_input_delta(
            id,
            name,
            delta,
            Some(accumulated_arguments),
            Some(provider.to_string()),
        )
        .with_metadata(MessageMetadata::invisible())
}

fn json_value_as_tool_arguments(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => Some(text.clone()),
        Value::Object(_) => Some(value.to_string()),
        _ => None,
    }
}

fn trim_non_empty(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn join_provider_tool_name(namespace: Option<&str>, name: Option<&str>) -> Option<String> {
    let name = trim_non_empty(name)?;
    let Some(namespace) = trim_non_empty(namespace) else {
        return Some(name);
    };
    if name.contains('.') || name.contains("__") {
        return Some(name);
    }
    if namespace.ends_with('.') || namespace.ends_with('_') || namespace.ends_with('/') {
        Some(format!("{namespace}{name}"))
    } else {
        Some(format!("{namespace}.{name}"))
    }
}

fn is_valid_received_tool_name(name: &str) -> bool {
    let name = name.trim();
    !name.is_empty()
        && name
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '_' | '-' | '.' | '/'))
}

fn tool_call_name_from_value(tool_call: &Value) -> Option<String> {
    let function = tool_call.get("function");
    let name = function
        .and_then(|value| value.get("name"))
        .and_then(Value::as_str)
        .or_else(|| tool_call.get("name").and_then(Value::as_str));
    let namespace = function
        .and_then(|value| value.get("namespace"))
        .and_then(Value::as_str)
        .or_else(|| tool_call.get("namespace").and_then(Value::as_str));

    join_provider_tool_name(namespace, name)
}

fn tool_call_arguments_from_value(tool_call: &Value) -> String {
    tool_call
        .get("function")
        .and_then(|value| value.get("arguments"))
        .or_else(|| tool_call.get("arguments"))
        .and_then(json_value_as_tool_arguments)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "{}".to_string())
}

fn openai_compatible_tool_call_id(index: i32, id: Option<&str>) -> String {
    trim_non_empty(id).unwrap_or_else(|| format!("openai_tool_call_{index}"))
}

fn parse_openai_compatible_tool_arguments(raw_arguments: &str) -> anyhow::Result<Value> {
    parse_tool_arguments_json_object(raw_arguments)
}

fn merge_streaming_tool_call_delta(
    tool_call_data: &mut std::collections::HashMap<i32, StreamingToolCallAccumulator>,
    tool_call: &DeltaToolCall,
    fallback_index: usize,
) -> Option<Message> {
    let index = tool_call.index.unwrap_or(fallback_index as i32);
    let entry = tool_call_data.entry(index).or_default();
    if entry.id.is_none() {
        entry.id = Some(openai_compatible_tool_call_id(
            index,
            tool_call.id.as_deref(),
        ));
    }
    if let Some(name) = tool_call.tool_name() {
        entry.name = Some(name.clone());
    }
    let arguments_delta = tool_call.arguments_delta()?;
    if arguments_delta.is_empty() {
        return None;
    }
    entry.arguments.push_str(&arguments_delta);
    Some(tool_input_delta_message(
        entry
            .id
            .clone()
            .unwrap_or_else(|| openai_compatible_tool_call_id(index, None)),
        entry.name.clone(),
        arguments_delta,
        entry.arguments.clone(),
        "openai_compatible",
    ))
}

impl DeltaToolCall {
    fn tool_name(&self) -> Option<String> {
        let function_name = self.function.as_ref().and_then(|function| {
            join_provider_tool_name(function.namespace.as_deref(), function.name.as_deref())
        });
        function_name
            .or_else(|| join_provider_tool_name(self.namespace.as_deref(), self.name.as_deref()))
    }

    fn arguments_delta(&self) -> Option<String> {
        self.function
            .as_ref()
            .and_then(|function| function.arguments.as_ref())
            .or(self.arguments.as_ref())
            .and_then(json_value_as_tool_arguments)
    }
}

pub fn format_messages(messages: &[Message], image_format: &ImageFormat) -> Vec<Value> {
    let mut messages_spec = Vec::new();
    for message in messages.iter().filter(|m| m.is_agent_visible()) {
        let mut converted = json!({
            "role": message.role
        });

        let mut output = Vec::new();
        let mut content_array = Vec::new();
        let mut text_array = Vec::new();
        // 收集完整 Thinking 内容用于 DeepSeek reasoner 的 reasoning_content
        let mut reasoning_content = String::new();

        for content in &message.content {
            match content {
                MessageContent::Text(text) => {
                    if !text.text.is_empty() {
                        if let Some(image_path) = detect_image_path(&text.text) {
                            if let Ok(image) = load_image_file(image_path) {
                                flush_text_parts_into_openai_content(
                                    &mut text_array,
                                    &mut content_array,
                                );
                                content_array.push(json!({"type": "text", "text": text.text}));
                                content_array.push(convert_image(&image, image_format));
                            } else {
                                push_openai_text_part(
                                    &mut text_array,
                                    &mut content_array,
                                    text.text.clone(),
                                );
                            }
                        } else {
                            push_openai_text_part(
                                &mut text_array,
                                &mut content_array,
                                text.text.clone(),
                            );
                        }
                    }
                }
                MessageContent::Thinking(thinking) => {
                    // 保留完整 Thinking 内容，避免多段推理在下一轮 tool 调用时丢失
                    if !thinking.thinking.is_empty() {
                        reasoning_content.push_str(&thinking.thinking);
                    }
                }
                MessageContent::RedactedThinking(_) => {
                    // Redacted thinking blocks are not directly used in OpenAI format
                    continue;
                }
                MessageContent::SystemNotification(_) => {
                    continue;
                }
                MessageContent::ToolRequest(request) => match &request.tool_call {
                    Ok(tool_call) => {
                        let sanitized_name = sanitize_function_name(&tool_call.name);
                        let arguments_str = match &tool_call.arguments {
                            Some(args) => {
                                serde_json::to_string(args).unwrap_or_else(|_| "{}".to_string())
                            }
                            None => "{}".to_string(),
                        };

                        let tool_calls = converted
                            .as_object_mut()
                            .unwrap()
                            .entry("tool_calls")
                            .or_insert(json!([]));

                        tool_calls.as_array_mut().unwrap().push(json!({
                            "id": request.id,
                            "type": "function",
                            "function": {
                                "name": sanitized_name,
                                "arguments": arguments_str,
                            }
                        }));
                    }
                    Err(e) => {
                        output.push(json!({
                            "role": "tool",
                            "content": format!("Error: {}", e),
                            "tool_call_id": request.id
                        }));
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
                                    content
                                        .audience()
                                        .is_none_or(|audience| audience.contains(&Role::Assistant))
                                })
                                .cloned()
                                .collect();

                            // Process all content, replacing images with placeholder text
                            let mut tool_content = Vec::new();
                            let mut image_messages = Vec::new();

                            for content in abridged {
                                match content.deref() {
                                    RawContent::Image(image) => {
                                        // Add placeholder text in the tool response
                                        tool_content.push(Content::text("This tool result included an image that is uploaded in the next message."));

                                        // Create a separate image message
                                        image_messages.push(json!({
                                            "role": "user",
                                            "content": [convert_image(&image.clone().no_annotation(), image_format)]
                                        }));
                                    }
                                    RawContent::Resource(resource) => {
                                        let text = match &resource.resource {
                                            ResourceContents::TextResourceContents {
                                                text, ..
                                            } => text.clone(),
                                            _ => String::new(),
                                        };
                                        tool_content.push(Content::text(text));
                                    }
                                    _ => {
                                        tool_content.push(content);
                                    }
                                }
                            }
                            let tool_response_content: Value = json!(tool_content
                                .iter()
                                .map(|content| match content.deref() {
                                    RawContent::Text(text) => text.text.clone(),
                                    _ => String::new(),
                                })
                                .collect::<Vec<String>>()
                                .join(" "));

                            // First add the tool response with all content
                            output.push(json!({
                                "role": "tool",
                                "content": tool_response_content,
                                "tool_call_id": response.id
                            }));
                            // Then add any image messages that need to follow
                            output.extend(image_messages);
                        }
                        Err(e) => {
                            // A tool result error is shown as output so the model can interpret the error message
                            output.push(json!({
                                "role": "tool",
                                "content": format!("The tool call returned the following error:\n{}", e),
                                "tool_call_id": response.id
                            }));
                        }
                    }
                }
                MessageContent::ToolConfirmationRequest(_) => {}
                MessageContent::ActionRequired(_) => {}
                MessageContent::ToolInputDelta(_) => {}
                MessageContent::Image(image) => {
                    flush_text_parts_into_openai_content(&mut text_array, &mut content_array);
                    content_array.push(convert_image(image, image_format));
                }
                MessageContent::FrontendToolRequest(request) => match &request.tool_call {
                    Ok(tool_call) => {
                        let sanitized_name = sanitize_function_name(&tool_call.name);
                        let arguments_str = match &tool_call.arguments {
                            Some(args) => {
                                serde_json::to_string(args).unwrap_or_else(|_| "{}".to_string())
                            }
                            None => "{}".to_string(),
                        };

                        let tool_calls = converted
                            .as_object_mut()
                            .unwrap()
                            .entry("tool_calls")
                            .or_insert(json!([]));

                        tool_calls.as_array_mut().unwrap().push(json!({
                            "id": request.id,
                            "type": "function",
                            "function": {
                                "name": sanitized_name,
                                "arguments": arguments_str,
                            }
                        }));
                    }
                    Err(e) => {
                        output.push(json!({
                            "role": "tool",
                            "content": format!("Error: {}", e),
                            "tool_call_id": request.id
                        }));
                    }
                },
            }
        }

        if !content_array.is_empty() {
            flush_text_parts_into_openai_content(&mut text_array, &mut content_array);
            converted["content"] = json!(content_array);
        } else if !text_array.is_empty() {
            converted["content"] = json!(text_array.join("\n"));
        }

        // 添加 reasoning_content 字段（用于 DeepSeek reasoner 模型）
        if !reasoning_content.is_empty() {
            converted["reasoning_content"] = json!(reasoning_content);
        }

        if converted.get("content").is_some() || converted.get("tool_calls").is_some() {
            output.insert(0, converted);
        }

        messages_spec.extend(output);
    }

    messages_spec
}

fn push_openai_text_part(
    text_array: &mut Vec<String>,
    content_array: &mut Vec<Value>,
    text: String,
) {
    if content_array.is_empty() {
        text_array.push(text);
        return;
    }

    content_array.push(json!({"type": "text", "text": text}));
}

fn flush_text_parts_into_openai_content(
    text_array: &mut Vec<String>,
    content_array: &mut Vec<Value>,
) {
    if text_array.is_empty() {
        return;
    }

    content_array.push(json!({
        "type": "text",
        "text": std::mem::take(text_array).join("\n"),
    }));
}

pub fn format_tools(tools: &[Tool]) -> anyhow::Result<Vec<Value>> {
    let mut tool_names = std::collections::HashSet::new();
    let mut result = Vec::new();

    for tool in tools {
        if !tool_names.insert(&tool.name) {
            return Err(anyhow!("Duplicate tool name: {}", tool.name));
        }

        result.push(json!({
            "type": "function",
            "function": {
                "name": tool.name,
                "description": tool_description_with_examples(tool),
                "parameters": tool.input_schema,
            }
        }));
    }

    Ok(result)
}

/// Convert OpenAI's API response to internal Message format
pub fn response_to_message(response: &Value) -> anyhow::Result<Message> {
    let Some(original) = response
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|m| m.get("message"))
    else {
        return Ok(Message::new(
            Role::Assistant,
            chrono::Utc::now().timestamp(),
            Vec::new(),
        ));
    };

    let mut content = Vec::new();

    if let Some(reasoning) = extract_openai_reasoning_text(original) {
        content.push(MessageContent::thinking(reasoning, ""));
    }

    if let Some(text) = original.get("content") {
        if let Some(text_str) = text.as_str() {
            content.push(MessageContent::text(text_str));
        }
    }

    if let Some(tool_calls) = original.get("tool_calls") {
        if let Some(tool_calls_array) = tool_calls.as_array() {
            for (fallback_index, tool_call) in tool_calls_array.iter().enumerate() {
                let id = openai_compatible_tool_call_id(
                    tool_call
                        .get("index")
                        .and_then(Value::as_i64)
                        .unwrap_or(fallback_index as i64) as i32,
                    tool_call.get("id").and_then(Value::as_str),
                );
                let function_name = tool_call_name_from_value(tool_call).unwrap_or_default();
                let arguments_str = tool_call_arguments_from_value(tool_call);

                if !is_valid_received_tool_name(&function_name) {
                    let error = ErrorData {
                        code: ErrorCode::INVALID_REQUEST,
                        message: Cow::from(format!(
                            "The provided function name '{}' was empty or had invalid characters",
                            function_name
                        )),
                        data: None,
                    };
                    content.push(MessageContent::tool_request(id, Err(error)));
                } else {
                    match parse_openai_compatible_tool_arguments(&arguments_str) {
                        Ok(params) => {
                            content.push(MessageContent::tool_request(
                                id,
                                Ok(CallToolRequestParam {
                                    name: function_name.into(),
                                    arguments: Some(object(params)),
                                }),
                            ));
                        }
                        Err(e) => {
                            let error = ErrorData {
                                code: ErrorCode::INVALID_PARAMS,
                                message: Cow::from(format!(
                                    "Could not interpret tool use parameters for id {}: {}. Raw arguments: '{}'",
                                    id, e, arguments_str
                                )),
                                data: None,
                            };
                            content.push(MessageContent::tool_request(id, Err(error)));
                        }
                    }
                }
            }
        }
    }

    Ok(Message::new(
        Role::Assistant,
        chrono::Utc::now().timestamp(),
        content,
    ))
}

pub fn get_usage(usage: &Value) -> Usage {
    let input_tokens = usage
        .get("prompt_tokens")
        .and_then(|v| v.as_i64())
        .map(|v| v as i32);

    let output_tokens = usage
        .get("completion_tokens")
        .and_then(|v| v.as_i64())
        .map(|v| v as i32);

    let total_tokens = usage
        .get("total_tokens")
        .and_then(|v| v.as_i64())
        .map(|v| v as i32)
        .or_else(|| match (input_tokens, output_tokens) {
            (Some(input), Some(output)) => Some(input + output),
            _ => None,
        });

    let cached_input_tokens = usage
        .get("prompt_tokens_details")
        .and_then(|details| details.get("cached_tokens"))
        .and_then(|v| v.as_i64())
        .map(|v| v as i32);

    Usage::new(input_tokens, output_tokens, total_tokens)
        .with_cached_input_tokens(cached_input_tokens)
}

/// Validates and fixes tool schemas to ensure they have proper parameter structure.
/// If parameters exist, ensures they have properties and required fields, or removes parameters entirely.
pub fn validate_tool_schemas(tools: &mut [Value]) {
    for tool in tools.iter_mut() {
        if let Some(function) = tool.get_mut("function") {
            if let Some(parameters) = function.get_mut("parameters") {
                if parameters.is_object() {
                    ensure_valid_json_schema(parameters);
                }
            }
        }
    }
}

/// Ensures that the given JSON value follows the expected JSON Schema structure.
pub(crate) fn ensure_valid_json_schema(schema: &mut Value) {
    if let Some(params_obj) = schema.as_object_mut() {
        if params_obj
            .get("type")
            .and_then(|t| t.as_str())
            .is_some_and(|t| t == "array")
        {
            params_obj.entry("items").or_insert_with(|| json!({}));
        }

        // Check if this is meant to be an object type schema
        let is_object_type = params_obj
            .get("type")
            .and_then(|t| t.as_str())
            .is_none_or(|t| t == "object"); // Default to true if no type is specified

        // Only apply full schema validation to object types
        if is_object_type {
            // Ensure required fields exist with default values
            params_obj.entry("properties").or_insert_with(|| json!({}));
            params_obj.entry("required").or_insert_with(|| json!([]));
            params_obj.entry("type").or_insert_with(|| json!("object"));

            // Recursively validate properties if it exists
            if let Some(properties) = params_obj.get_mut("properties") {
                if let Some(properties_obj) = properties.as_object_mut() {
                    for (_key, prop) in properties_obj.iter_mut() {
                        if prop.is_object() {
                            ensure_valid_json_schema(prop);
                        }
                    }
                }
            }
        }

        if let Some(items) = params_obj.get_mut("items") {
            ensure_valid_json_schema(items);
        }

        for keyword in ["oneOf", "anyOf", "allOf"] {
            if let Some(variants) = params_obj.get_mut(keyword).and_then(Value::as_array_mut) {
                for variant in variants.iter_mut() {
                    ensure_valid_json_schema(variant);
                }
            }
        }

        if let Some(additional_properties) = params_obj.get_mut("additionalProperties") {
            if additional_properties.is_object() {
                ensure_valid_json_schema(additional_properties);
            }
        }
    }
}

fn strip_data_prefix(line: &str) -> Option<&str> {
    line.strip_prefix("data: ").map(|s| s.trim())
}

fn normalized_openai_reasoning_text<'a>(
    reasoning_content: Option<&'a str>,
    reasoning: Option<&'a str>,
) -> Option<&'a str> {
    reasoning_content
        .filter(|value| !value.is_empty())
        .or_else(|| reasoning.filter(|value| !value.is_empty()))
}

fn extract_openai_reasoning_text(message: &Value) -> Option<&str> {
    normalized_openai_reasoning_text(
        message.get("reasoning_content").and_then(Value::as_str),
        message.get("reasoning").and_then(Value::as_str),
    )
}

fn extract_openai_stream_reasoning_delta(delta: &Delta) -> Option<&str> {
    normalized_openai_reasoning_text(
        delta.reasoning_content.as_deref(),
        delta.reasoning.as_deref(),
    )
}

fn streaming_chunk_usage(chunk: &StreamingChunk) -> Option<ProviderUsage> {
    chunk.usage.as_ref().and_then(|usage| {
        chunk.model.as_ref().map(|model| ProviderUsage {
            usage: get_usage(usage),
            model: model.clone(),
        })
    })
}

pub fn response_to_streaming_message<S>(
    mut stream: S,
) -> impl Stream<Item = anyhow::Result<(Option<Message>, Option<ProviderUsage>)>> + 'static
where
    S: Stream<Item = anyhow::Result<String>> + Unpin + Send + 'static,
{
    try_stream! {
        use futures::StreamExt;

        'outer: while let Some(response) = stream.next().await {
            if response.as_ref().is_ok_and(|s| s == "data: [DONE]") {
                break 'outer;
            }
            let response_str = response?;
            let line = strip_data_prefix(&response_str);

            if line.is_none() || line.is_some_and(|l| l.is_empty()) {
                continue
            }

            let chunk: StreamingChunk = serde_json::from_str(line
                .ok_or_else(|| anyhow!("unexpected stream format"))?)
                .map_err(|e| anyhow!("Failed to parse streaming chunk: {}: {:?}", e, &line))?;

            let usage = streaming_chunk_usage(&chunk);

            let Some(choice) = chunk.choices.first() else {
                yield (None, usage);
                continue;
            };

            if choice.delta.tool_calls.as_ref().is_some_and(|tc| !tc.is_empty()) {
                let mut tool_call_data: std::collections::HashMap<i32, StreamingToolCallAccumulator> =
                    std::collections::HashMap::new();
                let mut final_usage = usage;

                if let Some(tool_calls) = &choice.delta.tool_calls {
                    for (fallback_index, tool_call) in tool_calls.iter().enumerate() {
                        if let Some(delta_message) = merge_streaming_tool_call_delta(
                            &mut tool_call_data,
                            tool_call,
                            fallback_index,
                        ) {
                            yield (Some(delta_message), None);
                        }
                    }
                }

                while let Some(response_chunk) = stream.next().await {
                    if response_chunk.as_ref().is_ok_and(|s| s == "data: [DONE]") {
                        break;
                    }
                    let response_str = response_chunk?;
                    let Some(line) = strip_data_prefix(&response_str) else {
                        continue;
                    };
                    if line.is_empty() {
                        continue;
                    }

                    let tool_chunk: StreamingChunk = serde_json::from_str(line)
                        .map_err(|e| anyhow!("Failed to parse streaming chunk: {}: {:?}", e, &line))?;

                    let tool_usage = streaming_chunk_usage(&tool_chunk);
                    if tool_usage.is_some() {
                        final_usage = tool_usage;
                    }

                    let Some(tool_choice) = tool_chunk.choices.first() else {
                        continue;
                    };

                    // Process tool call deltas if present
                    if let Some(delta_tool_calls) = &tool_choice.delta.tool_calls {
                        for (fallback_index, delta_call) in delta_tool_calls.iter().enumerate() {
                            if let Some(delta_message) = merge_streaming_tool_call_delta(
                                &mut tool_call_data,
                                delta_call,
                                fallback_index,
                            ) {
                                yield (Some(delta_message), None);
                            }
                        }
                    }

                    // Check finish_reason after processing tool calls to ensure we don't miss the last delta
                    if tool_choice.finish_reason.is_some() {
                        break;
                    }
                }

                let mut contents = Vec::new();
                let mut sorted_indices: Vec<_> = tool_call_data.keys().cloned().collect();
                sorted_indices.sort();

                for index in sorted_indices {
                    if let Some(tool_call) = tool_call_data.get(&index) {
                        let Some(function_name) = tool_call.name.as_ref() else {
                            continue;
                        };
                        let id = tool_call
                            .id
                            .clone()
                            .unwrap_or_else(|| openai_compatible_tool_call_id(index, None));
                        let arguments = &tool_call.arguments;
                        let parsed = parse_openai_compatible_tool_arguments(arguments);

                        let content = match parsed {
                            Ok(params) => {
                                MessageContent::tool_request(
                                    id.clone(),
                                    Ok(CallToolRequestParam { name: function_name.clone().into(), arguments: Some(object(params)) }),
                                )
                            },
                            Err(e) => {
                                let error = ErrorData {
                                    code: ErrorCode::INVALID_PARAMS,
                                    message: Cow::from(format!(
                                        "Could not interpret tool use parameters for id {}: {}. Raw arguments: '{}'",
                                        id, e, arguments
                                    )),
                                    data: None,
                                };
                                MessageContent::tool_request(id.clone(), Err(error))
                            }
                        };
                        contents.push(content);
                    }
                }

                // 如果有推理内容，添加为 Thinking 内容
                if let Some(reasoning) =
                    extract_openai_stream_reasoning_delta(&choice.delta)
                {
                    contents.insert(0, MessageContent::thinking(reasoning.to_string(), ""));
                }

                let mut msg = Message::new(
                    Role::Assistant,
                    chrono::Utc::now().timestamp(),
                    contents,
                );

                // Add ID if present
                if let Some(id) = chunk.id {
                    msg = msg.with_id(id);
                }

                yield (
                    Some(msg),
                    final_usage,
                )
            } else if choice.delta.content.is_some()
                || extract_openai_stream_reasoning_delta(&choice.delta).is_some()
            {
                let mut contents = Vec::new();

                // 处理推理内容（兼容 reasoning_content / reasoning）
                if let Some(reasoning) =
                    extract_openai_stream_reasoning_delta(&choice.delta)
                {
                    contents.push(MessageContent::thinking(reasoning.to_string(), ""));
                }

                // 处理普通文本内容
                if let Some(text) = &choice.delta.content {
                    if !text.is_empty() {
                        contents.push(MessageContent::text(text));
                    }
                }

                if contents.is_empty() {
                    if usage.is_some() {
                        yield (None, usage);
                    }
                    continue;
                }

                let mut msg = Message::new(
                    Role::Assistant,
                    chrono::Utc::now().timestamp(),
                    contents,
                );

                // Add ID if present
                if let Some(id) = chunk.id {
                    msg = msg.with_id(id);
                }

                yield (
                    Some(msg),
                    if choice.finish_reason.is_some() {
                        usage
                    } else {
                        None
                    },
                )
            } else if usage.is_some() {
                yield (None, usage)
            }
        }
    }
}

pub fn create_request(
    model_config: &ModelConfig,
    system: &str,
    messages: &[Message],
    tools: &[Tool],
    image_format: &ImageFormat,
    for_streaming: bool,
) -> anyhow::Result<Value, Error> {
    create_request_with_system_prompt_role_policy(
        model_config,
        system,
        messages,
        tools,
        image_format,
        for_streaming,
        OpenAiSystemPromptRolePolicy::System,
    )
}

pub fn create_request_with_system_prompt_role_policy(
    model_config: &ModelConfig,
    system: &str,
    messages: &[Message],
    tools: &[Tool],
    image_format: &ImageFormat,
    for_streaming: bool,
    system_prompt_role_policy: OpenAiSystemPromptRolePolicy,
) -> anyhow::Result<Value, Error> {
    if model_config.model_name.starts_with("o1-mini") {
        return Err(anyhow!(
            "o1-mini model is not currently supported since aster uses tool calling and o1-mini does not support it. Please use o1 or o3 models instead."
        ));
    }

    let is_ox_model = is_openai_reasoning_chat_model(&model_config.model_name);

    let (model_name, reasoning_effort) = resolve_openai_reasoning_effort(model_config, is_ox_model);

    let system_message = json!({
        "role": system_prompt_role_for_model(system_prompt_role_policy, &model_config.model_name),
        "content": system
    });

    let messages_spec = format_messages(messages, image_format);
    let mut tools_spec = format_tools(tools)?;

    validate_tool_schemas(&mut tools_spec);

    let mut messages_array = vec![system_message];
    messages_array.extend(messages_spec);

    let mut payload = json!({
        "model": model_name,
        "messages": messages_array
    });

    if let Some(effort) = reasoning_effort {
        payload["reasoning_effort"] = json!(effort);
    }

    if !tools_spec.is_empty() {
        payload["tools"] = json!(tools_spec);
    }

    // o1, o3 models currently don't support temperature
    if !is_ox_model {
        if let Some(temp) = model_config.temperature {
            payload["temperature"] = json!(temp);
        }
    }

    // o1 models use max_completion_tokens instead of max_tokens
    if let Some(tokens) = model_config.max_tokens {
        let key = if is_ox_model {
            "max_completion_tokens"
        } else {
            "max_tokens"
        };
        payload
            .as_object_mut()
            .unwrap()
            .insert(key.to_string(), json!(tokens));
    }

    if for_streaming {
        payload["stream"] = json!(true);
        payload["stream_options"] = json!({"include_usage": true});
    }

    Ok(payload)
}
