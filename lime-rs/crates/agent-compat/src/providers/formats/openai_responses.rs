use crate::conversation::message::{
    Message, MessageContent, MessageMetadata, SystemNotificationType,
};
use crate::model::ModelConfig;
use crate::providers::base::{ProviderUsage, Usage};
use crate::providers::formats::tool_description_with_examples;
use crate::providers::utils::parse_tool_arguments_json_object;
use anyhow::{anyhow, Error};
use async_stream::try_stream;
use chrono;
use futures::Stream;
use model_provider::provider_stream::{
    provider_stream_has_notification_text, provider_stream_notification_payload_from_text,
    provider_stream_notification_text, RuntimeReplyProviderStreamEvent,
};
use rmcp::model::{
    object, CallToolRequestParam, CallToolResult, ErrorCode, ErrorData, RawContent, Role, Tool,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::borrow::Cow;
use std::collections::HashMap;
use std::ops::Deref;

fn convert_image_to_input_image(mime_type: &str, data: &str) -> Value {
    json!({
        "type": "input_image",
        "image_url": format!("data:{mime_type};base64,{data}")
    })
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ResponsesRequestOptions {
    pub previous_response_id: Option<String>,
    pub store: bool,
    pub output_schema: Option<Value>,
    pub request_policy: ResponsesRequestPolicy,
}

impl ResponsesRequestOptions {
    pub fn with_previous_response_id(previous_response_id: impl Into<String>) -> Self {
        Self {
            previous_response_id: Some(previous_response_id.into()),
            store: true,
            output_schema: None,
            request_policy: ResponsesRequestPolicy::default(),
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ResponsesRequestPolicy {
    pub use_responses_lite: bool,
    pub reasoning_context: Option<String>,
    pub reasoning_summary: Option<String>,
    pub text_verbosity: Option<String>,
    pub parallel_tool_calls: Option<bool>,
    pub requires_responses_lite_header: bool,
}

impl ResponsesRequestPolicy {
    pub const RESPONSES_LITE_HEADER_NAME: &'static str = "x-openai-internal-codex-responses-lite";
    pub const RESPONSES_LITE_HEADER_VALUE: &'static str = "true";
}

fn create_json_schema_text_format(output_schema: &Value) -> Value {
    json!({
        "format": {
            "type": "json_schema",
            "name": "aster_structured_output",
            "strict": true,
            "schema": output_schema,
        }
    })
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ResponsesApiResponse {
    pub id: String,
    pub object: String,
    pub created_at: i64,
    pub status: String,
    pub model: String,
    pub output: Vec<ResponseOutputItem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning: Option<ResponseReasoningInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<ResponseUsage>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
#[serde(rename_all = "snake_case")]
pub enum ResponseOutputItem {
    Reasoning {
        id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        summary: Option<Vec<String>>,
    },
    Message {
        id: String,
        status: String,
        role: String,
        content: Vec<ResponseContentBlock>,
    },
    FunctionCall {
        id: String,
        status: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        call_id: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        namespace: Option<String>,
        #[serde(default)]
        name: String,
        #[serde(default)]
        arguments: String,
    },
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
#[serde(rename_all = "snake_case")]
pub enum ResponseContentBlock {
    OutputText {
        text: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        annotations: Option<Vec<Value>>,
    },
    ToolCall {
        id: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        namespace: Option<String>,
        name: String,
        input: Value,
    },
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ResponseReasoningInfo {
    pub effort: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ResponseUsage {
    pub input_tokens: i32,
    pub output_tokens: i32,
    pub total_tokens: i32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub input_tokens_details: Option<Value>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
#[serde(rename_all = "snake_case")]
pub enum ResponsesStreamEvent {
    #[serde(rename = "response.created")]
    ResponseCreated {
        sequence_number: i32,
        response: ResponseMetadata,
    },
    #[serde(rename = "response.in_progress")]
    ResponseInProgress {
        sequence_number: i32,
        response: ResponseMetadata,
    },
    #[serde(rename = "response.output_item.added")]
    OutputItemAdded {
        sequence_number: i32,
        output_index: i32,
        item: ResponseOutputItemInfo,
    },
    #[serde(rename = "response.content_part.added")]
    ContentPartAdded {
        sequence_number: i32,
        item_id: String,
        output_index: i32,
        content_index: i32,
        part: ContentPart,
    },
    #[serde(rename = "response.output_text.delta")]
    OutputTextDelta {
        sequence_number: i32,
        item_id: String,
        output_index: i32,
        content_index: i32,
        delta: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        logprobs: Option<Vec<Value>>,
        #[serde(skip_serializing_if = "Option::is_none")]
        obfuscation: Option<String>,
    },
    #[serde(rename = "response.output_item.done")]
    OutputItemDone {
        sequence_number: i32,
        output_index: i32,
        item: ResponseOutputItemInfo,
    },
    #[serde(rename = "response.content_part.done")]
    ContentPartDone {
        sequence_number: i32,
        item_id: String,
        output_index: i32,
        content_index: i32,
        part: ContentPart,
    },
    #[serde(rename = "response.output_text.done")]
    OutputTextDone {
        sequence_number: i32,
        item_id: String,
        output_index: i32,
        content_index: i32,
        text: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        logprobs: Option<Vec<Value>>,
    },
    #[serde(rename = "response.completed")]
    ResponseCompleted {
        sequence_number: i32,
        response: ResponseMetadata,
    },
    #[serde(rename = "response.failed")]
    ResponseFailed { sequence_number: i32, error: Value },
    #[serde(rename = "response.function_call_arguments.delta")]
    FunctionCallArgumentsDelta {
        sequence_number: i32,
        item_id: String,
        output_index: i32,
        delta: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        obfuscation: Option<String>,
    },
    #[serde(rename = "response.function_call_arguments.done")]
    FunctionCallArgumentsDone {
        sequence_number: i32,
        item_id: String,
        output_index: i32,
        arguments: String,
    },
    #[serde(rename = "error")]
    Error { error: Value },
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ResponseMetadata {
    pub id: String,
    pub object: String,
    pub created_at: i64,
    pub status: String,
    pub model: String,
    pub output: Vec<ResponseOutputItemInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<ResponseUsage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning: Option<ResponseReasoningInfo>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type")]
#[serde(rename_all = "snake_case")]
pub enum ResponseOutputItemInfo {
    Reasoning {
        id: String,
        summary: Vec<String>,
    },
    Message {
        id: String,
        status: String,
        role: String,
        content: Vec<ContentPart>,
    },
    FunctionCall {
        id: String,
        status: String,
        call_id: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        namespace: Option<String>,
        #[serde(default)]
        name: String,
        #[serde(default)]
        arguments: String,
    },
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type")]
#[serde(rename_all = "snake_case")]
pub enum ContentPart {
    OutputText {
        text: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        annotations: Option<Vec<Value>>,
        #[serde(skip_serializing_if = "Option::is_none")]
        logprobs: Option<Vec<Value>>,
    },
    ToolCall {
        id: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        namespace: Option<String>,
        name: String,
        arguments: String,
    },
}

#[derive(Debug, Clone, Default)]
struct ResponsesStreamingToolCall {
    tool_id: String,
    tool_name: Option<String>,
    accumulated_arguments: String,
}

pub fn provider_stream_event_notification_payload_from_message(message: &Message) -> Option<Value> {
    message.content.iter().find_map(|content| {
        let notification = content.as_system_notification()?;
        provider_stream_notification_payload_from_text(&notification.msg)
    })
}

pub fn is_provider_stream_event_notification(message: &Message) -> bool {
    provider_stream_has_notification_text(provider_stream_notification_texts_from_message(message))
}

fn provider_stream_notification_texts_from_message(
    message: &Message,
) -> impl Iterator<Item = &str> {
    message
        .content
        .iter()
        .filter_map(|content| content.as_system_notification())
        .map(|notification| notification.msg.as_str())
}

fn provider_stream_event_notification(
    event_kind: &str,
    response_event: Value,
    headers: Vec<(String, String)>,
) -> Message {
    Message::assistant()
        .with_system_notification(
            SystemNotificationType::InlineMessage,
            provider_stream_notification_text(event_kind, response_event, headers),
        )
        .with_metadata(MessageMetadata::invisible())
}

fn response_function_call_request_id(id: &str, call_id: Option<&str>) -> String {
    call_id
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(id)
        .to_string()
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

fn tool_request_content_from_name_and_arguments(
    id: String,
    namespace: Option<&str>,
    name: &str,
    arguments: &str,
) -> MessageContent {
    let Some(tool_name) = join_provider_tool_name(namespace, Some(name)) else {
        return MessageContent::tool_request(
            id,
            Err(ErrorData {
                code: ErrorCode::INVALID_REQUEST,
                message: Cow::from("The provided function name was empty"),
                data: None,
            }),
        );
    };
    if !is_valid_received_tool_name(&tool_name) {
        return MessageContent::tool_request(
            id,
            Err(ErrorData {
                code: ErrorCode::INVALID_REQUEST,
                message: Cow::from(format!(
                    "The provided function name '{}' was empty or had invalid characters",
                    tool_name
                )),
                data: None,
            }),
        );
    }

    let parsed_args = if arguments.is_empty() {
        Ok(json!({}))
    } else {
        parse_tool_arguments_json_object(arguments)
    };
    match parsed_args {
        Ok(parsed_args) => MessageContent::tool_request(
            id,
            Ok(CallToolRequestParam {
                name: tool_name.into(),
                arguments: Some(object(parsed_args)),
            }),
        ),
        Err(error) => MessageContent::tool_request(
            id.clone(),
            Err(ErrorData {
                code: ErrorCode::INVALID_PARAMS,
                message: Cow::from(format!(
                    "Could not interpret tool use parameters for id {}: {}. Raw arguments: '{}'",
                    id, error, arguments
                )),
                data: None,
            }),
        ),
    }
}

fn responses_tool_input_delta_message(
    id: String,
    name: Option<String>,
    delta: String,
    accumulated_arguments: String,
) -> Message {
    Message::assistant()
        .with_tool_input_delta(
            id,
            name,
            delta,
            Some(accumulated_arguments),
            Some("openai_responses"),
        )
        .with_metadata(MessageMetadata::invisible())
}

fn add_conversation_history(input_items: &mut Vec<Value>, messages: &[Message]) {
    for message in messages.iter().filter(|m| m.is_agent_visible()) {
        let has_only_tool_content = message.content.iter().all(|c| {
            matches!(
                c,
                MessageContent::ToolRequest(_) | MessageContent::ToolResponse(_)
            )
        });

        if has_only_tool_content {
            continue;
        }

        if message.role != Role::User && message.role != Role::Assistant {
            continue;
        }

        let role = match message.role {
            Role::User => "user",
            Role::Assistant => "assistant",
        };

        let mut content_items = Vec::new();
        for content in &message.content {
            match content {
                MessageContent::Text(text) => {
                    if !text.text.is_empty() {
                        let content_type = if message.role == Role::Assistant {
                            "output_text"
                        } else {
                            "input_text"
                        };
                        content_items.push(json!({
                            "type": content_type,
                            "text": text.text
                        }));
                    }
                }
                MessageContent::Image(image) => {
                    if message.role == Role::User
                        && !image.mime_type.is_empty()
                        && !image.data.is_empty()
                    {
                        content_items
                            .push(convert_image_to_input_image(&image.mime_type, &image.data));
                    }
                }
                _ => {}
            }
        }

        if !content_items.is_empty() {
            input_items.push(json!({
                "role": role,
                "content": content_items
            }));
        }
    }
}

fn add_function_calls(input_items: &mut Vec<Value>, messages: &[Message]) {
    for message in messages.iter().filter(|m| m.is_agent_visible()) {
        if message.role == Role::Assistant {
            for content in &message.content {
                if let MessageContent::ToolRequest(request) = content {
                    if let Ok(tool_call) = &request.tool_call {
                        let arguments_str = tool_call
                            .arguments
                            .as_ref()
                            .map(|args| {
                                serde_json::to_string(args).unwrap_or_else(|_| "{}".to_string())
                            })
                            .unwrap_or_else(|| "{}".to_string());

                        tracing::debug!(
                            "Replaying function_call with call_id: {}, name: {}",
                            request.id,
                            tool_call.name
                        );
                        input_items.push(json!({
                            "type": "function_call",
                            "call_id": request.id,
                            "name": tool_call.name,
                            "arguments": arguments_str
                        }));
                    }
                }
            }
        }
    }
}

fn responses_output_from_tool_result(result: &CallToolResult) -> Option<Value> {
    let mut content_items = Vec::new();
    let mut text_segments = Vec::new();
    let mut saw_image = false;

    for content in &result.content {
        match content.deref() {
            RawContent::Text(text) if !text.text.trim().is_empty() => {
                text_segments.push(text.text.clone());
            }
            RawContent::Image(image) if !image.data.trim().is_empty() => {
                if !text_segments.is_empty() {
                    content_items.push(json!({
                        "type": "input_text",
                        "text": text_segments.join("\n")
                    }));
                    text_segments.clear();
                }
                content_items.push(convert_image_to_input_image(&image.mime_type, &image.data));
                saw_image = true;
            }
            _ => {}
        }
    }

    if saw_image {
        if !text_segments.is_empty() {
            content_items.push(json!({
                "type": "input_text",
                "text": text_segments.join("\n")
            }));
        }
        Some(Value::Array(content_items))
    } else if text_segments.is_empty() {
        None
    } else {
        Some(json!(text_segments.join("\n")))
    }
}

fn add_function_call_outputs(input_items: &mut Vec<Value>, messages: &[Message]) {
    for message in messages.iter().filter(|m| m.is_agent_visible()) {
        for content in &message.content {
            if let MessageContent::ToolResponse(response) = content {
                match &response.tool_result {
                    Ok(contents) => {
                        if let Some(output) = responses_output_from_tool_result(contents) {
                            tracing::debug!(
                                "Sending function_call_output with call_id: {}",
                                response.id
                            );
                            input_items.push(json!({
                                "type": "function_call_output",
                                "call_id": response.id,
                                "output": output
                            }));
                        }
                    }
                    Err(error_data) => {
                        // Handle error responses - must send them back to the API
                        // to avoid "No tool output found" errors
                        tracing::debug!(
                            "Sending function_call_output error with call_id: {}",
                            response.id
                        );
                        input_items.push(json!({
                            "type": "function_call_output",
                            "call_id": response.id,
                            "output": format!("Error: {}", error_data.message)
                        }));
                    }
                }
            }
        }
    }
}

pub fn create_responses_request(
    model_config: &ModelConfig,
    system: &str,
    messages: &[Message],
    tools: &[Tool],
    options: &ResponsesRequestOptions,
) -> anyhow::Result<Value, Error> {
    let mut input_items = Vec::new();

    if !system.is_empty() && !options.request_policy.use_responses_lite {
        input_items.push(json!({
            "role": "system",
            "content": [{
                "type": "input_text",
                "text": system
            }]
        }));
    }

    add_conversation_history(&mut input_items, messages);
    add_function_calls(&mut input_items, messages);
    add_function_call_outputs(&mut input_items, messages);

    let tools_spec = if tools.is_empty() {
        None
    } else {
        let mut tools_spec: Vec<Value> = tools
            .iter()
            .map(|tool| {
                json!({
                    "type": "function",
                    "name": tool.name,
                    "description": tool_description_with_examples(tool),
                    "parameters": tool.input_schema,
                })
            })
            .collect();
        for tool in tools_spec.iter_mut() {
            if let Some(parameters) = tool.get_mut("parameters") {
                super::openai::ensure_valid_json_schema(parameters);
            }
        }
        Some(tools_spec)
    };

    if options.request_policy.use_responses_lite {
        let mut prefix = Vec::new();
        if let Some(tools_spec) = tools_spec.as_ref().filter(|tools| !tools.is_empty()) {
            prefix.push(json!({
                "type": "additional_tools",
                "role": "developer",
                "tools": tools_spec,
            }));
        }
        if !system.is_empty() {
            prefix.push(json!({
                "type": "message",
                "role": "developer",
                "content": [{
                    "type": "input_text",
                    "text": system
                }]
            }));
        }
        input_items.splice(0..0, prefix);
    }

    let mut payload = json!({
        "model": model_config.model_name,
        "input": input_items,
        "store": options.store,
    });

    if let Some(reasoning_effort) = model_config
        .reasoning_effort
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        payload.as_object_mut().unwrap().insert(
            "reasoning".to_string(),
            json!({
                "effort": reasoning_effort,
            }),
        );
    }

    if let Some(reasoning_context) = options
        .request_policy
        .reasoning_context
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty() && *value != "default")
    {
        let reasoning = payload
            .as_object_mut()
            .unwrap()
            .entry("reasoning".to_string())
            .or_insert_with(|| json!({}));
        if let Some(reasoning) = reasoning.as_object_mut() {
            reasoning.insert("context".to_string(), json!(reasoning_context));
        }
    }

    if let Some(reasoning_summary) = options
        .request_policy
        .reasoning_summary
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty() && *value != "none")
    {
        let reasoning = payload
            .as_object_mut()
            .unwrap()
            .entry("reasoning".to_string())
            .or_insert_with(|| json!({}));
        if let Some(reasoning) = reasoning.as_object_mut() {
            reasoning.insert("summary".to_string(), json!(reasoning_summary));
        }
    }

    if let Some(previous_response_id) = options.previous_response_id.as_ref() {
        payload.as_object_mut().unwrap().insert(
            "previous_response_id".to_string(),
            json!(previous_response_id),
        );
    }

    if let Some(output_schema) = options.output_schema.as_ref() {
        payload.as_object_mut().unwrap().insert(
            "text".to_string(),
            create_json_schema_text_format(output_schema),
        );
    }

    if let Some(text_verbosity) = options
        .request_policy
        .text_verbosity
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        let text = payload
            .as_object_mut()
            .unwrap()
            .entry("text".to_string())
            .or_insert_with(|| json!({}));
        if let Some(text) = text.as_object_mut() {
            text.insert("verbosity".to_string(), json!(text_verbosity));
        }
    }

    if !options.request_policy.use_responses_lite {
        if let Some(tools_spec) = tools_spec {
            payload
                .as_object_mut()
                .unwrap()
                .insert("tools".to_string(), json!(tools_spec));
        }
    }

    if let Some(parallel_tool_calls) = options
        .request_policy
        .parallel_tool_calls
        .or_else(|| options.request_policy.use_responses_lite.then_some(false))
    {
        payload.as_object_mut().unwrap().insert(
            "parallel_tool_calls".to_string(),
            json!(parallel_tool_calls),
        );
    }

    if let Some(temp) = model_config.temperature {
        payload
            .as_object_mut()
            .unwrap()
            .insert("temperature".to_string(), json!(temp));
    }

    if let Some(tokens) = model_config.max_tokens {
        payload
            .as_object_mut()
            .unwrap()
            .insert("max_output_tokens".to_string(), json!(tokens));
    }

    Ok(payload)
}

pub fn responses_api_to_message(response: &ResponsesApiResponse) -> anyhow::Result<Message> {
    let mut content = Vec::new();

    for item in &response.output {
        match item {
            ResponseOutputItem::Reasoning { .. } => {
                continue;
            }
            ResponseOutputItem::Message {
                content: msg_content,
                ..
            } => {
                for block in msg_content {
                    match block {
                        ResponseContentBlock::OutputText { text, .. } => {
                            if !text.is_empty() {
                                content.push(MessageContent::text(text));
                            }
                        }
                        ResponseContentBlock::ToolCall {
                            id,
                            namespace,
                            name,
                            input,
                        } => {
                            content.push(tool_request_content_from_name_and_arguments(
                                id.clone(),
                                namespace.as_deref(),
                                name,
                                &input.to_string(),
                            ));
                        }
                    }
                }
            }
            ResponseOutputItem::FunctionCall {
                id,
                call_id,
                namespace,
                name,
                arguments,
                ..
            } => {
                let request_id = response_function_call_request_id(id, call_id.as_deref());
                tracing::debug!(
                    "Received FunctionCall with id: {}, call_id: {}, name: {}",
                    id,
                    request_id,
                    name
                );
                content.push(tool_request_content_from_name_and_arguments(
                    request_id,
                    namespace.as_deref(),
                    name,
                    arguments,
                ));
            }
        }
    }

    let mut message = Message::new(Role::Assistant, chrono::Utc::now().timestamp(), content);

    message = message.with_id(response.id.clone());

    Ok(message)
}

pub fn get_responses_usage(response: &ResponsesApiResponse) -> Usage {
    response.usage.as_ref().map_or_else(Usage::default, |u| {
        Usage::new(
            Some(u.input_tokens),
            Some(u.output_tokens),
            Some(u.total_tokens),
        )
        .with_cached_input_tokens(
            u.input_tokens_details
                .as_ref()
                .and_then(|details| details.get("cached_tokens"))
                .and_then(|value| value.as_i64())
                .map(|value| value as i32),
        )
    })
}

fn process_streaming_output_items(
    output_items: Vec<ResponseOutputItemInfo>,
    is_text_response: bool,
) -> Vec<MessageContent> {
    let mut content = Vec::new();

    for item in output_items {
        match item {
            ResponseOutputItemInfo::Reasoning { .. } => {
                // Skip reasoning items
            }
            ResponseOutputItemInfo::Message { content: parts, .. } => {
                for part in parts {
                    match part {
                        ContentPart::OutputText { text, .. } => {
                            if !text.is_empty() && !is_text_response {
                                content.push(MessageContent::text(&text));
                            }
                        }
                        ContentPart::ToolCall {
                            id,
                            namespace,
                            name,
                            arguments,
                        } => {
                            content.push(tool_request_content_from_name_and_arguments(
                                id,
                                namespace.as_deref(),
                                &name,
                                &arguments,
                            ));
                        }
                    }
                }
            }
            ResponseOutputItemInfo::FunctionCall {
                call_id,
                namespace,
                name,
                arguments,
                ..
            } => {
                content.push(tool_request_content_from_name_and_arguments(
                    call_id,
                    namespace.as_deref(),
                    &name,
                    &arguments,
                ));
            }
        }
    }

    content
}

pub fn responses_api_to_streaming_message<S>(
    stream: S,
) -> impl Stream<Item = anyhow::Result<(Option<Message>, Option<ProviderUsage>)>> + 'static
where
    S: Stream<Item = anyhow::Result<String>> + Unpin + Send + 'static,
{
    responses_api_to_streaming_message_with_provider_stream_headers(stream, Vec::new())
}

pub fn responses_api_to_streaming_message_with_provider_stream_headers<S>(
    mut stream: S,
    provider_stream_headers: Vec<(String, String)>,
) -> impl Stream<Item = anyhow::Result<(Option<Message>, Option<ProviderUsage>)>> + 'static
where
    S: Stream<Item = anyhow::Result<String>> + Unpin + Send + 'static,
{
    try_stream! {
        use futures::StreamExt;

        let mut accumulated_text = String::new();
        let mut response_id: Option<String> = None;
        let mut model_name: Option<String> = None;
        let mut final_usage: Option<ProviderUsage> = None;
        let mut output_items: Vec<ResponseOutputItemInfo> = Vec::new();
        let mut is_text_response = false;
        let mut streaming_tool_calls: HashMap<String, ResponsesStreamingToolCall> = HashMap::new();

        'outer: while let Some(response) = stream.next().await {
            let response_str = response?;

            // Skip empty lines
            if response_str.trim().is_empty() {
                continue;
            }

            // Parse SSE format: "event: <type>\ndata: <json>"
            // For now, we only care about the data line
            let data_line = if response_str.starts_with("data: ") {
                response_str.strip_prefix("data: ").unwrap()
            } else if response_str.starts_with("event: ") {
                // Skip event type lines
                continue;
            } else {
                // Try to parse as-is in case there's no prefix
                &response_str
            };

            if data_line == "[DONE]" {
                break 'outer;
            }

            let response_event_json: Value = serde_json::from_str(data_line)
                .map_err(|e| anyhow!("Failed to parse Responses stream event JSON: {}: {:?}", e, data_line))?;
            if response_event_json
                .get("safety_buffering")
                .is_some_and(Value::is_object)
            {
                yield (
                    Some(provider_stream_event_notification(
                        RuntimeReplyProviderStreamEvent::NOTIFICATION_KIND_SAFETY_BUFFERING,
                        response_event_json.clone(),
                        provider_stream_headers.clone(),
                    )),
                    None,
                );
            }

            let event: ResponsesStreamEvent = serde_json::from_value(response_event_json)
                .map_err(|e| anyhow!("Failed to parse Responses stream event: {}: {:?}", e, data_line))?;

            match event {
                ResponsesStreamEvent::ResponseCreated { response, .. } |
                ResponsesStreamEvent::ResponseInProgress { response, .. } => {
                    response_id = Some(response.id);
                    model_name = Some(response.model);
                }

                ResponsesStreamEvent::OutputTextDelta { delta, .. } => {
                    is_text_response = true;
                    accumulated_text.push_str(&delta);

                    // Yield incremental text updates for true streaming
                    let mut content = Vec::new();
                    if !delta.is_empty() {
                        content.push(MessageContent::text(&delta));
                    }
                    let mut msg = Message::new(Role::Assistant, chrono::Utc::now().timestamp(), content);

                    // Add ID so desktop client knows these deltas are part of the same message
                    if let Some(id) = &response_id {
                        msg = msg.with_id(id.clone());
                    }

                    yield (Some(msg), None);
                }

                ResponsesStreamEvent::OutputItemAdded { item, .. } => {
                    if let ResponseOutputItemInfo::FunctionCall {
                        id,
                        call_id,
                        namespace,
                        name,
                        arguments,
                        ..
                    } = item
                    {
                        let existing = streaming_tool_calls.remove(&id).unwrap_or_default();
                        let accumulated_arguments = if existing.accumulated_arguments.is_empty() {
                            arguments
                        } else {
                            existing.accumulated_arguments
                        };
                        let tool_call = ResponsesStreamingToolCall {
                            tool_id: call_id.clone(),
                            tool_name: join_provider_tool_name(namespace.as_deref(), Some(&name)),
                            accumulated_arguments,
                        };
                        streaming_tool_calls.insert(
                            id,
                            tool_call.clone(),
                        );
                        streaming_tool_calls.insert(call_id, tool_call);
                    }
                }

                ResponsesStreamEvent::OutputItemDone { item, .. } => {
                    output_items.push(item);
                }

                ResponsesStreamEvent::OutputTextDone { .. } => {
                    // Text is already complete from deltas, this is just a summary event
                }

                ResponsesStreamEvent::ResponseCompleted { response, .. } => {
                    let model = model_name.as_ref().unwrap_or(&response.model);
                    let usage = response.usage.as_ref().map_or_else(
                        Usage::default,
                        |u| Usage::new(
                            Some(u.input_tokens),
                            Some(u.output_tokens),
                            Some(u.total_tokens),
                        )
                        .with_cached_input_tokens(
                            u.input_tokens_details
                                .as_ref()
                                .and_then(|details| details.get("cached_tokens"))
                                .and_then(|value| value.as_i64())
                                .map(|value| value as i32),
                        ),
                    );
                    final_usage = Some(ProviderUsage {
                        usage,
                        model: model.clone(),
                    });

                    // For complete output, use the response output items
                    if !response.output.is_empty() {
                        output_items = response.output;
                    }

                    break 'outer;
                }

                ResponsesStreamEvent::FunctionCallArgumentsDelta {
                    item_id, delta, ..
                } => {
                    if !delta.is_empty() {
                        let entry = streaming_tool_calls.entry(item_id.clone()).or_insert_with(|| {
                            ResponsesStreamingToolCall {
                                tool_id: String::new(),
                                tool_name: None,
                                accumulated_arguments: String::new(),
                            }
                        });
                        entry.accumulated_arguments.push_str(&delta);
                        if entry.tool_id.trim().is_empty() {
                            continue;
                        }
                        yield (
                            Some(responses_tool_input_delta_message(
                                entry.tool_id.clone(),
                                entry.tool_name.clone(),
                                delta,
                                entry.accumulated_arguments.clone(),
                            )),
                            None,
                        );
                    }
                }

                ResponsesStreamEvent::FunctionCallArgumentsDone {
                    item_id,
                    arguments,
                    ..
                } => {
                    let entry = streaming_tool_calls.entry(item_id.clone()).or_insert_with(|| {
                        ResponsesStreamingToolCall {
                            tool_id: String::new(),
                            tool_name: None,
                            accumulated_arguments: String::new(),
                        }
                    });
                    entry.accumulated_arguments = arguments;
                }

                ResponsesStreamEvent::ResponseFailed { error, .. } => {
                    Err(anyhow!("Responses API failed: {:?}", error))?;
                }

                ResponsesStreamEvent::Error { error } => {
                    Err(anyhow!("Responses API error: {:?}", error))?;
                }

                _ => {
                    // Ignore other event types (OutputItemAdded, ContentPartAdded, ContentPartDone)
                }
            }
        }

        // Process final output items and yield usage data
        let content = process_streaming_output_items(output_items, is_text_response);

        if !content.is_empty() {
            let mut message = Message::new(Role::Assistant, chrono::Utc::now().timestamp(), content);
            if let Some(id) = response_id {
                message = message.with_id(id);
            }
            yield (Some(message), final_usage);
        } else if let Some(usage) = final_usage {
            yield (None, Some(usage));
        }
    }
}
