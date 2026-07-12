use super::{
    CurrentProviderContent, CurrentProviderMessage, CurrentProviderRequest, CurrentProviderRole,
    CurrentProviderTool, CurrentProviderToolResult,
};
use crate::provider_stream::RuntimeReplyProviderRequestWireShape;
use crate::runtime_provider::RuntimeProviderConfig;
use serde_json::{json, Map, Value};

pub(super) fn chat_completions_request(
    config: &RuntimeProviderConfig,
    request: &CurrentProviderRequest,
    wire_shape: &RuntimeReplyProviderRequestWireShape,
) -> Value {
    let mut messages = Vec::new();
    if let Some(system_prompt) = request
        .system_prompt
        .as_deref()
        .filter(|value| !value.is_empty())
    {
        messages.push(json!({ "role": "system", "content": system_prompt }));
    }
    messages.extend(request.messages.iter().flat_map(chat_message));
    let mut object = Map::from_iter([
        ("model".to_string(), json!(config.model_name)),
        ("messages".to_string(), Value::Array(messages)),
        ("stream".to_string(), Value::Bool(true)),
        (
            "stream_options".to_string(),
            json!({ "include_usage": true }),
        ),
    ]);
    if !request.tools.is_empty() {
        object.insert(
            "tools".to_string(),
            Value::Array(request.tools.iter().map(chat_tool).collect()),
        );
        object.insert(
            "parallel_tool_calls".to_string(),
            json!(wire_shape.parallel_tool_calls.unwrap_or(true)),
        );
    }
    if let Some(reasoning_effort) = config.reasoning_effort.as_deref() {
        object.insert("reasoning_effort".to_string(), json!(reasoning_effort));
    }
    Value::Object(object)
}

pub(super) fn responses_request(
    config: &RuntimeProviderConfig,
    request: &CurrentProviderRequest,
    wire_shape: &RuntimeReplyProviderRequestWireShape,
) -> Value {
    let mut input = Vec::new();
    for message in &request.messages {
        input.extend(responses_message(message));
    }
    let mut object = Map::from_iter([
        ("model".to_string(), json!(config.model_name)),
        ("input".to_string(), Value::Array(input)),
        ("stream".to_string(), Value::Bool(true)),
        ("store".to_string(), Value::Bool(false)),
    ]);
    if let Some(instructions) = request
        .system_prompt
        .as_deref()
        .filter(|value| !value.is_empty())
    {
        object.insert("instructions".to_string(), json!(instructions));
    }
    if !request.tools.is_empty() {
        object.insert(
            "tools".to_string(),
            Value::Array(
                request
                    .tools
                    .iter()
                    .map(|tool| {
                        json!({
                            "type": "function",
                            "name": tool.name,
                            "description": tool.description,
                            "parameters": tool.input_schema,
                            "strict": false,
                        })
                    })
                    .collect(),
            ),
        );
        object.insert(
            "parallel_tool_calls".to_string(),
            json!(wire_shape.parallel_tool_calls.unwrap_or(true)),
        );
    }
    if let Some(reasoning_effort) = config.reasoning_effort.as_deref() {
        let mut reasoning = json!({ "effort": reasoning_effort });
        if let Some(summary) = wire_shape.reasoning_summary.as_deref() {
            reasoning["summary"] = json!(summary);
        }
        object.insert("reasoning".to_string(), reasoning);
    }
    if let Some(verbosity) = wire_shape.text_verbosity.as_deref() {
        object.insert("text".to_string(), json!({ "verbosity": verbosity }));
    }
    Value::Object(object)
}

pub(super) fn anthropic_request(
    config: &RuntimeProviderConfig,
    request: &CurrentProviderRequest,
) -> Value {
    let messages = request
        .messages
        .iter()
        .flat_map(anthropic_message)
        .collect::<Vec<_>>();
    let mut object = Map::from_iter([
        ("model".to_string(), json!(config.model_name)),
        ("messages".to_string(), Value::Array(messages)),
        ("max_tokens".to_string(), Value::Number(4096.into())),
        ("stream".to_string(), Value::Bool(true)),
    ]);
    if let Some(system) = request
        .system_prompt
        .as_deref()
        .filter(|value| !value.is_empty())
    {
        object.insert("system".to_string(), json!(system));
    }
    if !request.tools.is_empty() {
        object.insert(
            "tools".to_string(),
            Value::Array(
                request
                    .tools
                    .iter()
                    .map(|tool| {
                        json!({
                            "name": tool.name,
                            "description": tool.description,
                            "input_schema": tool.input_schema,
                        })
                    })
                    .collect(),
            ),
        );
    }
    Value::Object(object)
}

fn chat_message(message: &CurrentProviderMessage) -> Vec<Value> {
    match message.role {
        CurrentProviderRole::Tool => message
            .content
            .iter()
            .filter_map(|content| match content {
                CurrentProviderContent::ToolResult(result) => Some(json!({
                    "role": "tool",
                    "tool_call_id": result.call_id,
                    "content": tool_result_text(result),
                })),
                _ => None,
            })
            .collect(),
        CurrentProviderRole::Assistant => {
            let text = content_text(&message.content);
            let tool_calls = message
                .content
                .iter()
                .filter_map(|content| match content {
                    CurrentProviderContent::ToolCall(call) => Some(json!({
                        "id": call.id,
                        "type": "function",
                        "function": { "name": call.name, "arguments": call.raw_arguments },
                    })),
                    _ => None,
                })
                .collect::<Vec<_>>();
            let mut value = json!({ "role": "assistant", "content": text });
            if !tool_calls.is_empty() {
                value["tool_calls"] = Value::Array(tool_calls);
            }
            vec![value]
        }
        CurrentProviderRole::User => vec![json!({
            "role": "user",
            "content": chat_content(&message.content),
        })],
    }
}

fn chat_content(content: &[CurrentProviderContent]) -> Value {
    let has_image = content
        .iter()
        .any(|part| matches!(part, CurrentProviderContent::Image { .. }));
    if !has_image {
        return json!(content_text(content));
    }
    Value::Array(
        content
            .iter()
            .filter_map(|part| match part {
                CurrentProviderContent::Text(text) => Some(json!({ "type": "text", "text": text })),
                CurrentProviderContent::Image { data, .. } => Some(json!({
                    "type": "image_url",
                    "image_url": { "url": data },
                })),
                _ => None,
            })
            .collect(),
    )
}

fn chat_tool(tool: &CurrentProviderTool) -> Value {
    json!({
        "type": "function",
        "function": {
            "name": tool.name,
            "description": tool.description,
            "parameters": tool.input_schema,
            "strict": false,
        }
    })
}

fn responses_message(message: &CurrentProviderMessage) -> Vec<Value> {
    match message.role {
        CurrentProviderRole::Tool => message
            .content
            .iter()
            .filter_map(|content| match content {
                CurrentProviderContent::ToolResult(result) => Some(json!({
                    "type": "function_call_output",
                    "call_id": result.call_id,
                    "output": tool_result_text(result),
                })),
                _ => None,
            })
            .collect(),
        CurrentProviderRole::Assistant => {
            let mut items = Vec::new();
            let text = content_text(&message.content);
            if !text.is_empty() {
                items.push(json!({
                    "type": "message",
                    "role": "assistant",
                    "content": [{ "type": "output_text", "text": text }],
                }));
            }
            for content in &message.content {
                if let CurrentProviderContent::ToolCall(call) = content {
                    items.push(json!({
                        "type": "function_call",
                        "call_id": call.id,
                        "name": call.name,
                        "arguments": call.raw_arguments,
                    }));
                }
            }
            items
        }
        CurrentProviderRole::User => vec![json!({
            "role": "user",
            "content": responses_input_content(&message.content),
        })],
    }
}

fn responses_input_content(content: &[CurrentProviderContent]) -> Vec<Value> {
    content
        .iter()
        .filter_map(|part| match part {
            CurrentProviderContent::Text(text) => {
                Some(json!({ "type": "input_text", "text": text }))
            }
            CurrentProviderContent::Image { data, .. } => {
                Some(json!({ "type": "input_image", "image_url": data }))
            }
            _ => None,
        })
        .collect()
}

fn anthropic_message(message: &CurrentProviderMessage) -> Vec<Value> {
    let role = match message.role {
        CurrentProviderRole::Assistant => "assistant",
        CurrentProviderRole::User | CurrentProviderRole::Tool => "user",
    };
    let content = message
        .content
        .iter()
        .filter_map(|part| match part {
            CurrentProviderContent::Text(text) => Some(json!({ "type": "text", "text": text })),
            CurrentProviderContent::Reasoning(thinking) => {
                Some(json!({ "type": "thinking", "thinking": thinking }))
            }
            CurrentProviderContent::Image { data, media_type } => Some(json!({
                "type": "image",
                "source": { "type": "base64", "media_type": media_type, "data": image_payload(data) },
            })),
            CurrentProviderContent::ToolCall(call) => Some(json!({
                "type": "tool_use",
                "id": call.id,
                "name": call.name,
                "input": call.arguments,
            })),
            CurrentProviderContent::ToolResult(result) => Some(json!({
                "type": "tool_result",
                "tool_use_id": result.call_id,
                "content": tool_result_text(result),
                "is_error": !result.success,
            })),
        })
        .collect::<Vec<_>>();
    (!content.is_empty())
        .then_some(json!({ "role": role, "content": content }))
        .into_iter()
        .collect()
}

fn image_payload(data: &str) -> &str {
    data.split_once(',')
        .map(|(_, payload)| payload)
        .unwrap_or(data)
}

fn content_text(content: &[CurrentProviderContent]) -> String {
    content
        .iter()
        .filter_map(|part| match part {
            CurrentProviderContent::Text(text) | CurrentProviderContent::Reasoning(text) => {
                Some(text.as_str())
            }
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("")
}

fn tool_result_text(result: &CurrentProviderToolResult) -> String {
    match result.error.as_deref() {
        Some(error) if !result.success => format!("{}\n{error}", result.output),
        _ => result.output.clone(),
    }
}
