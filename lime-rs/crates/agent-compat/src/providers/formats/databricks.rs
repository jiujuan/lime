use crate::conversation::message::{Message, MessageContent};
use crate::model::ModelConfig;
use crate::providers::formats::google as gemini_schema;
use crate::providers::formats::tool_description_with_examples;
use crate::providers::utils::{
    convert_image, detect_image_path, is_valid_function_name, load_image_file,
    parse_tool_arguments_json_object, sanitize_function_name, ImageFormat,
};
use anyhow::{anyhow, Error};
use rmcp::model::{
    object, AnnotateAble, CallToolRequestParam, Content, ErrorCode, ErrorData, RawContent,
    ResourceContents, Role, Tool,
};
use serde::Serialize;
use serde_json::{json, Value};
use std::borrow::Cow;

#[derive(Serialize)]
struct DatabricksMessage {
    content: Value,
    role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_calls: Option<Vec<Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_call_id: Option<String>,
}

fn format_text_content(text: &str, image_format: &ImageFormat) -> (Vec<Value>, bool) {
    let mut items = vec![json!({"type": "text", "text": text})];
    let has_image = if let Some(path) = detect_image_path(text) {
        if let Ok(image) = load_image_file(path) {
            items.push(convert_image(&image, image_format));
        }
        true
    } else {
        false
    };
    (items, has_image)
}

fn format_tool_response(
    response: &crate::conversation::message::ToolResponse,
    image_format: &ImageFormat,
) -> Vec<DatabricksMessage> {
    let mut result = Vec::new();

    match &response.tool_result {
        Ok(call_result) => {
            let abridged: Vec<_> = call_result
                .content
                .iter()
                .filter(|c| c.audience().is_none_or(|a| a.contains(&Role::Assistant)))
                .map(|c| c.raw.clone())
                .collect();

            let mut tool_content = Vec::new();
            let mut image_messages = Vec::new();

            for content in abridged {
                match content {
                    RawContent::Image(image) => {
                        tool_content.push(Content::text(
                            "This tool result included an image that is uploaded in the next message.",
                        ));
                        image_messages.push(DatabricksMessage {
                            role: "user".to_string(),
                            content: [convert_image(&image.no_annotation(), image_format)].into(),
                            tool_calls: None,
                            tool_call_id: None,
                        });
                    }
                    RawContent::Resource(resource) => {
                        let text = match &resource.resource {
                            ResourceContents::TextResourceContents { text, .. } => text.clone(),
                            _ => String::new(),
                        };
                        tool_content.push(Content::text(text));
                    }
                    _ => tool_content.push(content.no_annotation()),
                }
            }

            let tool_response_content: Value = json!(tool_content
                .iter()
                .filter_map(|c| c.as_text().map(|t| t.text.clone()))
                .collect::<Vec<String>>()
                .join(" "));

            result.push(DatabricksMessage {
                content: tool_response_content,
                role: "tool".to_string(),
                tool_call_id: Some(response.id.clone()),
                tool_calls: None,
            });
            result.extend(image_messages);
        }
        Err(e) => {
            result.push(DatabricksMessage {
                role: "tool".to_string(),
                content: format!("The tool call returned the following error:\n{}", e).into(),
                tool_call_id: Some(response.id.clone()),
                tool_calls: None,
            });
        }
    }

    result
}

/// Convert internal Message format to Databricks' API message specification
///   Databricks is mostly OpenAI compatible, but has some differences (reasoning type, etc)
///   some openai compatible endpoints use the anthropic image spec at the content level
///   even though the message structure is otherwise following openai, the enum switches this
fn format_messages(messages: &[Message], image_format: &ImageFormat) -> Vec<DatabricksMessage> {
    let mut result = Vec::new();
    for message in messages.iter().filter(|m| m.is_agent_visible()) {
        let mut converted = DatabricksMessage {
            content: Value::Null,
            role: match message.role {
                Role::User => "user".to_string(),
                Role::Assistant => "assistant".to_string(),
            },
            tool_calls: None,
            tool_call_id: None,
        };

        let mut content_array = Vec::new();
        let mut has_tool_calls = false;
        let mut has_multiple_content = false;

        for content in &message.content {
            match content {
                MessageContent::Text(text) => {
                    if !text.text.is_empty() {
                        let (items, multi) = format_text_content(&text.text, image_format);
                        content_array.extend(items);
                        has_multiple_content |= multi;
                    }
                }
                MessageContent::Thinking(content) => {
                    has_multiple_content = true;
                    content_array.push(json!({
                        "type": "reasoning",
                        "summary": [{
                            "type": "summary_text",
                            "text": content.thinking,
                            "signature": content.signature
                        }]
                    }));
                }
                MessageContent::RedactedThinking(content) => {
                    has_multiple_content = true;
                    content_array.push(json!({
                        "type": "reasoning",
                        "summary": [{"type": "summary_encrypted_text", "data": content.data}]
                    }));
                }
                MessageContent::ToolRequest(request) => {
                    has_tool_calls = true;
                    match &request.tool_call {
                        Ok(tool_call) => {
                            let sanitized_name = sanitize_function_name(&tool_call.name);
                            let arguments_str = tool_call
                                .arguments
                                .as_ref()
                                .map(|args| {
                                    serde_json::to_string(args).unwrap_or_else(|_| "{}".to_string())
                                })
                                .unwrap_or_else(|| "{}".to_string());

                            converted.tool_calls.get_or_insert_default().push(json!({
                                "id": request.id,
                                "type": "function",
                                "function": {"name": sanitized_name, "arguments": arguments_str}
                            }));
                        }
                        Err(e) => {
                            content_array
                                .push(json!({"type": "text", "text": format!("Error: {}", e)}));
                        }
                    }
                }
                MessageContent::ToolResponse(response) => {
                    result.extend(format_tool_response(response, image_format));
                }
                MessageContent::Image(image) => {
                    content_array.push(convert_image(image, image_format));
                }
                MessageContent::FrontendToolRequest(req) => {
                    let text = match &req.tool_call {
                        Ok(tool_call) => format!(
                            "Frontend tool request: {} ({})",
                            tool_call.name,
                            serde_json::to_string_pretty(&tool_call.arguments).unwrap()
                        ),
                        Err(e) => format!("Frontend tool request error: {}", e),
                    };
                    content_array.push(json!({"type": "text", "text": text}));
                }
                MessageContent::SystemNotification(_)
                | MessageContent::ToolConfirmationRequest(_)
                | MessageContent::ToolInputDelta(_)
                | MessageContent::ActionRequired(_) => {}
            }
        }

        if !content_array.is_empty() {
            converted.content = if content_array.len() == 1
                && !has_multiple_content
                && content_array[0]["type"] == "text"
            {
                json!(content_array[0]["text"])
            } else {
                json!(content_array)
            };
        }

        if !content_array.is_empty() || has_tool_calls {
            result.push(converted);
        }
    }

    result
}

pub fn format_tools(tools: &[Tool], model_name: &str) -> anyhow::Result<Vec<Value>> {
    let mut tool_names = std::collections::HashSet::new();
    let mut result = Vec::new();

    let is_gemini = model_name.contains("gemini");

    for tool in tools {
        if !tool_names.insert(&tool.name) {
            return Err(anyhow!("Duplicate tool name: {}", tool.name));
        }

        let parameters = if is_gemini {
            gemini_schema::process_map(tool.input_schema.as_ref(), None)
        } else {
            json!(tool.input_schema)
        };

        result.push(json!({
            "type": "function",
            "function": {
                "name": tool.name,
                "description": tool_description_with_examples(tool),
                "parameters": parameters,
            }
        }));
    }

    Ok(result)
}

/// Convert Databricks' API response to internal Message format
#[allow(clippy::too_many_lines)]
pub fn response_to_message(response: &Value) -> anyhow::Result<Message> {
    let original = &response["choices"][0]["message"];
    let mut content = Vec::new();

    // Handle array-based content
    if let Some(content_array) = original.get("content").and_then(|c| c.as_array()) {
        for content_item in content_array {
            match content_item.get("type").and_then(|t| t.as_str()) {
                Some("text") => {
                    if let Some(text) = content_item.get("text").and_then(|t| t.as_str()) {
                        content.push(MessageContent::text(text));
                    }
                }
                Some("reasoning") => {
                    if let Some(summary_array) =
                        content_item.get("summary").and_then(|s| s.as_array())
                    {
                        for summary in summary_array {
                            match summary.get("type").and_then(|t| t.as_str()) {
                                Some("summary_text") => {
                                    let text = summary
                                        .get("text")
                                        .and_then(|t| t.as_str())
                                        .unwrap_or_default();
                                    let signature = summary
                                        .get("signature")
                                        .and_then(|s| s.as_str())
                                        .unwrap_or_default();
                                    content.push(MessageContent::thinking(text, signature));
                                }
                                Some("summary_encrypted_text") => {
                                    if let Some(data) = summary.get("data").and_then(|d| d.as_str())
                                    {
                                        content.push(MessageContent::redacted_thinking(data));
                                    }
                                }
                                _ => continue,
                            }
                        }
                    }
                }
                _ => continue,
            }
        }
    } else if let Some(text) = original.get("content").and_then(|t| t.as_str()) {
        // Handle legacy single string content
        content.push(MessageContent::text(text));
    }

    // Handle tool calls
    if let Some(tool_calls) = original.get("tool_calls") {
        if let Some(tool_calls_array) = tool_calls.as_array() {
            for tool_call in tool_calls_array {
                let id = tool_call["id"].as_str().unwrap_or_default().to_string();
                let function_name = tool_call["function"]["name"]
                    .as_str()
                    .unwrap_or_default()
                    .to_string();

                // Get the raw arguments string from the LLM.
                let arguments_str = tool_call["function"]["arguments"]
                    .as_str()
                    .unwrap_or_default()
                    .to_string();

                // If arguments_str is empty, default to an empty JSON object string.
                let arguments_str = if arguments_str.is_empty() {
                    "{}".to_string()
                } else {
                    arguments_str
                };

                if !is_valid_function_name(&function_name) {
                    let error = ErrorData {
                        code: ErrorCode::INVALID_REQUEST,
                        message: Cow::from(format!(
                            "The provided function name '{}' had invalid characters, it must match this regex [a-zA-Z0-9_-]+",
                            function_name
                        )),
                        data: None,
                    };
                    content.push(MessageContent::tool_request(id, Err(error)));
                } else {
                    match parse_tool_arguments_json_object(&arguments_str) {
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

/// Check if the model name indicates a Claude/Anthropic model that supports cache control.
fn is_claude_model(model_name: &str) -> bool {
    model_name.contains("claude")
}

/// Add Anthropic-style cache_control fields to the request payload for Claude models.
/// This enables prompt caching to reduce costs when using Claude via Databricks.
///
/// Cache control is added to:
/// - The system message
/// - The last two user messages (for incremental caching across turns)
/// - The last tool definition (so all tools are cached as a single prefix)
pub fn apply_cache_control_for_claude(payload: &mut Value) {
    if let Some(messages_spec) = payload
        .as_object_mut()
        .and_then(|obj| obj.get_mut("messages"))
        .and_then(|messages| messages.as_array_mut())
    {
        // Add cache_control to the last two user messages for incremental caching.
        // The last message gets cached so future turns can read from it.
        // The second-to-last user message is also cached to read from the previous cache.
        let mut user_count = 0;
        for message in messages_spec.iter_mut().rev() {
            if message.get("role") == Some(&json!("user")) {
                if let Some(content) = message.get_mut("content") {
                    if let Some(content_str) = content.as_str() {
                        *content = json!([{
                            "type": "text",
                            "text": content_str,
                            "cache_control": { "type": "ephemeral" }
                        }]);
                    } else if let Some(content_array) = content.as_array_mut() {
                        // Content is already an array, add cache_control to the last element
                        if let Some(last_content) = content_array.last_mut() {
                            if let Some(obj) = last_content.as_object_mut() {
                                obj.insert(
                                    "cache_control".to_string(),
                                    json!({ "type": "ephemeral" }),
                                );
                            }
                        }
                    }
                }
                user_count += 1;
                if user_count >= 2 {
                    break;
                }
            }
        }

        // Add cache_control to the system message
        if let Some(system_message) = messages_spec
            .iter_mut()
            .find(|msg| msg.get("role") == Some(&json!("system")))
        {
            if let Some(content) = system_message.get_mut("content") {
                if let Some(content_str) = content.as_str() {
                    *system_message = json!({
                        "role": "system",
                        "content": [{
                            "type": "text",
                            "text": content_str,
                            "cache_control": { "type": "ephemeral" }
                        }]
                    });
                }
            }
        }
    }

    // Add cache_control to the last tool definition
    if let Some(tools_spec) = payload
        .as_object_mut()
        .and_then(|obj| obj.get_mut("tools"))
        .and_then(|tools| tools.as_array_mut())
    {
        if let Some(last_tool) = tools_spec.last_mut() {
            if let Some(function) = last_tool.get_mut("function") {
                if let Some(obj) = function.as_object_mut() {
                    obj.insert("cache_control".to_string(), json!({ "type": "ephemeral" }));
                }
            }
        }
    }
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
fn ensure_valid_json_schema(schema: &mut Value) {
    if let Some(params_obj) = schema.as_object_mut() {
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
                        if prop.is_object()
                            && prop.get("type").and_then(|t| t.as_str()) == Some("object")
                        {
                            ensure_valid_json_schema(prop);
                        }
                    }
                }
            }
        }
    }
}

fn split_reasoning_effort_suffix(model_name: &str) -> (String, Option<String>) {
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

fn resolve_reasoning_effort(
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
        let (model_name, suffix_effort) = split_reasoning_effort_suffix(&model_config.model_name);
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

#[allow(clippy::too_many_lines)]
pub fn create_request(
    model_config: &ModelConfig,
    system: &str,
    messages: &[Message],
    tools: &[Tool],
    image_format: &ImageFormat,
) -> anyhow::Result<Value, Error> {
    if model_config.model_name.starts_with("o1-mini") {
        return Err(anyhow!(
            "o1-mini model is not currently supported since aster uses tool calling and o1-mini does not support it. Please use o1 or o3 models instead."
        ));
    }

    let model_name = model_config.model_name.to_string();
    let is_o1 = model_name.starts_with("o1") || model_name.starts_with("aster-o1");
    let is_o3 = model_name.starts_with("o3") || model_name.starts_with("aster-o3");
    let is_gpt_5 = model_name.starts_with("gpt-5") || model_name.starts_with("aster-gpt-5");
    let is_openai_reasoning_model = is_o1 || is_o3 || is_gpt_5;
    let is_claude_sonnet =
        model_name.contains("claude-3-7-sonnet") || model_name.contains("claude-4-sonnet"); // can be aster- or databricks-

    let (model_name, reasoning_effort) =
        resolve_reasoning_effort(model_config, is_openai_reasoning_model);

    let system_message = DatabricksMessage {
        role: "system".to_string(),
        content: system.into(),
        tool_calls: None,
        tool_call_id: None,
    };

    let messages_spec = format_messages(messages, image_format);
    let mut tools_spec = if !tools.is_empty() {
        format_tools(tools, &model_config.model_name)?
    } else {
        vec![]
    };

    // Validate tool schemas
    validate_tool_schemas(&mut tools_spec);

    let mut messages_array = vec![system_message];
    messages_array.extend(messages_spec);

    let mut payload = json!({
        "model": model_name,
        "messages": messages_array
    });

    if let Some(effort) = reasoning_effort {
        payload
            .as_object_mut()
            .unwrap()
            .insert("reasoning_effort".to_string(), json!(effort));
    }

    if !tools_spec.is_empty() {
        payload
            .as_object_mut()
            .unwrap()
            .insert("tools".to_string(), json!(tools_spec));
    }

    let is_thinking_enabled = std::env::var("CLAUDE_THINKING_ENABLED").is_ok();
    if is_claude_sonnet && is_thinking_enabled {
        // Minimum budget_tokens is 1024
        let budget_tokens = std::env::var("CLAUDE_THINKING_BUDGET")
            .unwrap_or_else(|_| "16000".to_string())
            .parse()
            .unwrap_or(16000);

        // For Claude models with thinking enabled, we need to add max_tokens + budget_tokens
        // Default to 8192 (Claude max output) + budget if not specified
        let max_completion_tokens = model_config.max_tokens.unwrap_or(8192);
        payload.as_object_mut().unwrap().insert(
            "max_tokens".to_string(),
            json!(max_completion_tokens + budget_tokens),
        );

        payload.as_object_mut().unwrap().insert(
            "thinking".to_string(),
            json!({
                "type": "enabled",
                "budget_tokens": budget_tokens
            }),
        );

        payload
            .as_object_mut()
            .unwrap()
            .insert("temperature".to_string(), json!(2));
    } else {
        // open ai reasoning models currently don't support temperature
        if !is_openai_reasoning_model {
            if let Some(temp) = model_config.temperature {
                payload
                    .as_object_mut()
                    .unwrap()
                    .insert("temperature".to_string(), json!(temp));
            }
        }

        // open ai reasoning models use max_completion_tokens instead of max_tokens
        if let Some(tokens) = model_config.max_tokens {
            let key = if is_openai_reasoning_model {
                "max_completion_tokens"
            } else {
                "max_tokens"
            };
            payload
                .as_object_mut()
                .unwrap()
                .insert(key.to_string(), json!(tokens));
        }
    }

    // Apply cache control for Claude models to enable prompt caching
    if is_claude_model(&model_config.model_name) {
        apply_cache_control_for_claude(&mut payload);
    }

    Ok(payload)
}
