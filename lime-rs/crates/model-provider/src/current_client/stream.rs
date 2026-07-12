use super::{
    CurrentProviderError, CurrentProviderEvent, CurrentProviderToolCall, CurrentProviderUsage,
};
use agent_protocol::{anthropic, openai};
use async_stream::try_stream;
use futures::{Stream, StreamExt};
use reqwest::Response;
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap, HashSet};

#[derive(Debug, Default)]
struct ToolCallAccumulator {
    id: Option<String>,
    name: Option<String>,
    arguments: String,
    emitted: bool,
}

impl ToolCallAccumulator {
    fn call_id(&self, fallback: &str) -> String {
        self.id.clone().unwrap_or_else(|| fallback.to_string())
    }

    fn into_call(&mut self, fallback: &str) -> Option<CurrentProviderToolCall> {
        if self.emitted {
            return None;
        }
        let name = self.name.clone()?;
        self.emitted = true;
        Some(CurrentProviderToolCall::from_raw(
            self.call_id(fallback),
            name,
            self.arguments.clone(),
        ))
    }
}

#[derive(Debug, Default)]
struct OpenAiStreamState {
    response_id: Option<String>,
    calls: BTreeMap<u32, ToolCallAccumulator>,
    emitted_tool_call: bool,
}

pub(super) fn openai_chat_sse(
    response: Response,
) -> impl Stream<Item = Result<CurrentProviderEvent, CurrentProviderError>> + Send {
    try_stream! {
        let mut state = OpenAiStreamState::default();
        let mut frames = Box::pin(sse_frames(response));
        while let Some(frame) = frames.next().await {
            let frame = frame?;
            if frame.data.trim() == "[DONE]" {
                for (index, call) in &mut state.calls {
                    if let Some(call) = call.into_call(&format!("call_{index}")) {
                        state.emitted_tool_call = true;
                        yield CurrentProviderEvent::ToolCall(call);
                    }
                }
                yield CurrentProviderEvent::Completed {
                    response_id: state.response_id.clone(),
                    end_turn: !state.emitted_tool_call,
                };
                return;
            }
            let chunk = serde_json::from_str::<openai::ChatCompletionChunk>(&frame.data)
                .map_err(|error| CurrentProviderError::new(format!("解析 OpenAI SSE chunk 失败: {error}")))?;
            state.response_id = Some(chunk.id.clone());
            if let Some(usage) = chunk.usage {
                yield CurrentProviderEvent::Usage(openai_usage(usage));
            }
            for choice in chunk.choices {
                if let Some(text) = choice.delta.content.filter(|value| !value.is_empty()) {
                    yield CurrentProviderEvent::TextDelta(text);
                }
                if let Some(reasoning) = choice.delta.reasoning_content.filter(|value| !value.is_empty()) {
                    yield CurrentProviderEvent::ReasoningDelta(reasoning);
                }
                for delta in choice.delta.tool_calls.unwrap_or_default() {
                    let index = delta.index;
                    let call = state.calls.entry(index).or_default();
                    if delta.id.is_some() {
                        call.id = delta.id;
                    }
                    if delta.function.name.is_some() {
                        call.name = delta.function.name;
                    }
                    if let Some(arguments) = delta.function.arguments {
                        call.arguments.push_str(&arguments);
                        yield CurrentProviderEvent::ToolCallInputDelta {
                            call_id: call.call_id(&format!("call_{index}")),
                            tool_name: call.name.clone(),
                            delta: arguments,
                            accumulated_arguments: call.arguments.clone(),
                        };
                    }
                }
                if choice.finish_reason.as_deref() == Some("tool_calls") {
                    for (index, call) in &mut state.calls {
                        if let Some(call) = call.into_call(&format!("call_{index}")) {
                            state.emitted_tool_call = true;
                            yield CurrentProviderEvent::ToolCall(call);
                        }
                    }
                }
            }
        }
        for (index, call) in &mut state.calls {
            if let Some(call) = call.into_call(&format!("call_{index}")) {
                state.emitted_tool_call = true;
                yield CurrentProviderEvent::ToolCall(call);
            }
        }
        yield CurrentProviderEvent::Completed {
            response_id: state.response_id,
            end_turn: !state.emitted_tool_call,
        };
    }
}

fn openai_usage(usage: openai::StreamUsage) -> CurrentProviderUsage {
    CurrentProviderUsage {
        input_tokens: usage.prompt_tokens,
        output_tokens: usage.completion_tokens,
        cached_input_tokens: usage
            .prompt_tokens_details
            .and_then(|details| details.cached_tokens),
        cache_creation_input_tokens: None,
    }
}

#[derive(Debug, Default)]
struct ResponsesStreamState {
    response_id: Option<String>,
    calls: HashMap<String, ToolCallAccumulator>,
    emitted_calls: HashSet<String>,
    emitted_tool_call: bool,
}

pub(super) fn responses_sse(
    response: Response,
) -> impl Stream<Item = Result<CurrentProviderEvent, CurrentProviderError>> + Send {
    try_stream! {
        let mut state = ResponsesStreamState::default();
        let mut frames = Box::pin(sse_frames(response));
        while let Some(frame) = frames.next().await {
            let frame = frame?;
            let payload: Value = serde_json::from_str(&frame.data)
                .map_err(|error| CurrentProviderError::new(format!("解析 Responses SSE event 失败: {error}")))?;
            let event_type = payload.get("type").and_then(Value::as_str).unwrap_or_default();
            match event_type {
                "response.output_text.delta" => {
                    if let Some(delta) = payload.get("delta").and_then(Value::as_str).filter(|value| !value.is_empty()) {
                        yield CurrentProviderEvent::TextDelta(delta.to_string());
                    }
                }
                "response.reasoning_text.delta" | "response.reasoning_summary_text.delta" => {
                    if let Some(delta) = payload.get("delta").and_then(Value::as_str).filter(|value| !value.is_empty()) {
                        yield CurrentProviderEvent::ReasoningDelta(delta.to_string());
                    }
                }
                "response.output_item.added" => {
                    if let Some(item) = payload.get("item") {
                        absorb_responses_call(item, &mut state);
                    }
                }
                "response.function_call_arguments.delta" => {
                    let key = response_call_key(&payload);
                    let call = state.calls.entry(key.clone()).or_default();
                    if let Some(call_id) = payload.get("call_id").and_then(Value::as_str) {
                        call.id = Some(call_id.to_string());
                    }
                    if let Some(name) = payload.get("name").and_then(Value::as_str) {
                        call.name = Some(name.to_string());
                    }
                    if let Some(delta) = payload.get("delta").and_then(Value::as_str) {
                        call.arguments.push_str(delta);
                        yield CurrentProviderEvent::ToolCallInputDelta {
                            call_id: call.call_id(&key),
                            tool_name: call.name.clone(),
                            delta: delta.to_string(),
                            accumulated_arguments: call.arguments.clone(),
                        };
                    }
                }
                "response.function_call_arguments.done" => {
                    let key = response_call_key(&payload);
                    let call = state.calls.entry(key.clone()).or_default();
                    if let Some(call_id) = payload.get("call_id").and_then(Value::as_str) {
                        call.id = Some(call_id.to_string());
                    }
                    if let Some(name) = payload.get("name").and_then(Value::as_str) {
                        call.name = Some(name.to_string());
                    }
                    if let Some(arguments) = payload.get("arguments").and_then(Value::as_str) {
                        call.arguments = arguments.to_string();
                    }
                    if let Some(call) = call.into_call(&key) {
                        state.emitted_tool_call = true;
                        state.emitted_calls.insert(call.id.clone());
                        yield CurrentProviderEvent::ToolCall(call);
                    }
                }
                "response.output_item.done" => {
                    if let Some(item) = payload.get("item") {
                        absorb_responses_call(item, &mut state);
                        if let Some(call) = response_item_tool_call(item) {
                            if state.emitted_calls.insert(call.id.clone()) {
                                state.emitted_tool_call = true;
                                yield CurrentProviderEvent::ToolCall(call);
                            }
                        }
                    }
                }
                "response.completed" => {
                    let response = payload.get("response").unwrap_or(&payload);
                    state.response_id = response.get("id").and_then(Value::as_str).map(ToOwned::to_owned);
                    if let Some(usage) = response.get("usage") {
                        yield CurrentProviderEvent::Usage(responses_usage(usage));
                    }
                    for item in response.get("output").and_then(Value::as_array).into_iter().flatten() {
                        if let Some(call) = response_item_tool_call(item) {
                            if state.emitted_calls.insert(call.id.clone()) {
                                state.emitted_tool_call = true;
                                yield CurrentProviderEvent::ToolCall(call);
                            }
                        }
                    }
                    yield CurrentProviderEvent::Completed {
                        response_id: state.response_id.clone(),
                        end_turn: !state.emitted_tool_call,
                    };
                    return;
                }
                "error" | "response.failed" => {
                    let message = payload
                        .pointer("/error/message")
                        .or_else(|| payload.get("message"))
                        .and_then(Value::as_str)
                        .unwrap_or("Responses provider stream failed");
                    Err(CurrentProviderError::new(message.to_string()))?;
                }
                _ => {}
            }
        }
        yield CurrentProviderEvent::Completed {
            response_id: state.response_id,
            end_turn: !state.emitted_tool_call,
        };
    }
}

fn response_call_key(payload: &Value) -> String {
    payload
        .get("call_id")
        .or_else(|| payload.get("item_id"))
        .or_else(|| payload.get("output_index"))
        .map(|value| match value {
            Value::String(value) => value.clone(),
            other => other.to_string(),
        })
        .unwrap_or_else(|| "response_call".to_string())
}

fn absorb_responses_call(item: &Value, state: &mut ResponsesStreamState) {
    if item.get("type").and_then(Value::as_str) != Some("function_call") {
        return;
    }
    let key = response_call_key(item);
    let call = state.calls.entry(key).or_default();
    call.id = item
        .get("call_id")
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
        .or(call.id.clone());
    call.name = item
        .get("name")
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
        .or(call.name.clone());
    if let Some(arguments) = item.get("arguments").and_then(Value::as_str) {
        call.arguments = arguments.to_string();
    }
}

pub(super) fn response_item_tool_call(item: &Value) -> Option<CurrentProviderToolCall> {
    (item.get("type").and_then(Value::as_str) == Some("function_call")).then_some(())?;
    let id = item.get("call_id").and_then(Value::as_str)?.to_string();
    let name = item.get("name").and_then(Value::as_str)?.to_string();
    let arguments = item
        .get("arguments")
        .and_then(Value::as_str)
        .unwrap_or("{}")
        .to_string();
    Some(CurrentProviderToolCall::from_raw(id, name, arguments))
}

fn responses_usage(value: &Value) -> CurrentProviderUsage {
    let number = |key: &str| {
        value
            .get(key)
            .and_then(Value::as_u64)
            .and_then(|value| u32::try_from(value).ok())
            .unwrap_or_default()
    };
    CurrentProviderUsage {
        input_tokens: number("input_tokens"),
        output_tokens: number("output_tokens"),
        cached_input_tokens: value
            .pointer("/input_tokens_details/cached_tokens")
            .and_then(Value::as_u64)
            .and_then(|value| u32::try_from(value).ok()),
        cache_creation_input_tokens: None,
    }
}

#[derive(Debug, Default)]
struct AnthropicStreamState {
    response_id: Option<String>,
    calls: BTreeMap<u32, ToolCallAccumulator>,
    emitted_tool_call: bool,
}

pub(super) fn anthropic_sse(
    response: Response,
) -> impl Stream<Item = Result<CurrentProviderEvent, CurrentProviderError>> + Send {
    try_stream! {
        let mut state = AnthropicStreamState::default();
        let mut frames = Box::pin(sse_frames(response));
        while let Some(frame) = frames.next().await {
            let frame = frame?;
            let event: anthropic::AnthropicStreamEvent = serde_json::from_str(&frame.data)
                .map_err(|error| CurrentProviderError::new(format!("解析 Anthropic SSE event 失败: {error}")))?;
            match event {
                anthropic::AnthropicStreamEvent::MessageStart { message } => {
                    state.response_id = Some(message.id);
                    if let Some(usage) = message.usage {
                        yield CurrentProviderEvent::Usage(anthropic_usage(usage));
                    }
                }
                anthropic::AnthropicStreamEvent::ContentBlockStart { index, content_block } => {
                    if let anthropic::AnthropicContentBlock::ToolUse { id, name, input } = content_block {
                        let call = state.calls.entry(index).or_default();
                        call.id = Some(id);
                        call.name = Some(name);
                        if input != Value::Null && input != json!({}) {
                            call.arguments = serde_json::to_string(&input).unwrap_or_else(|_| "{}".to_string());
                        }
                    }
                }
                anthropic::AnthropicStreamEvent::ContentBlockDelta { index, delta } => match delta {
                    anthropic::AnthropicDelta::TextDelta { text } => {
                        if !text.is_empty() {
                            yield CurrentProviderEvent::TextDelta(text);
                        }
                    }
                    anthropic::AnthropicDelta::ThinkingDelta { thinking } => {
                        if !thinking.is_empty() {
                            yield CurrentProviderEvent::ReasoningDelta(thinking);
                        }
                    }
                    anthropic::AnthropicDelta::InputJsonDelta { partial_json } => {
                        let call = state.calls.entry(index).or_default();
                        call.arguments.push_str(&partial_json);
                        yield CurrentProviderEvent::ToolCallInputDelta {
                            call_id: call.call_id(&format!("tool_{index}")),
                            tool_name: call.name.clone(),
                            delta: partial_json,
                            accumulated_arguments: call.arguments.clone(),
                        };
                    }
                    anthropic::AnthropicDelta::SignatureDelta { .. } => {}
                },
                anthropic::AnthropicStreamEvent::ContentBlockStop { index } => {
                    if let Some(call) = state.calls.get_mut(&index).and_then(|call| call.into_call(&format!("tool_{index}"))) {
                        state.emitted_tool_call = true;
                        yield CurrentProviderEvent::ToolCall(call);
                    }
                }
                anthropic::AnthropicStreamEvent::MessageDelta { usage, .. } => {
                    yield CurrentProviderEvent::Usage(anthropic_usage(usage));
                }
                anthropic::AnthropicStreamEvent::MessageStop => {
                    for (index, call) in &mut state.calls {
                        if let Some(call) = call.into_call(&format!("tool_{index}")) {
                            state.emitted_tool_call = true;
                            yield CurrentProviderEvent::ToolCall(call);
                        }
                    }
                    yield CurrentProviderEvent::Completed {
                        response_id: state.response_id.clone(),
                        end_turn: !state.emitted_tool_call,
                    };
                    return;
                }
            }
        }
        yield CurrentProviderEvent::Completed {
            response_id: state.response_id,
            end_turn: !state.emitted_tool_call,
        };
    }
}

fn anthropic_usage(usage: anthropic::AnthropicUsage) -> CurrentProviderUsage {
    CurrentProviderUsage {
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cached_input_tokens: usage.cache_read_input_tokens,
        cache_creation_input_tokens: usage.cache_creation_input_tokens,
    }
}

#[derive(Debug)]
pub(super) struct SseFrame {
    pub(super) data: String,
}

fn sse_frames(
    response: Response,
) -> impl Stream<Item = Result<SseFrame, CurrentProviderError>> + Send {
    try_stream! {
        let mut pending = Vec::new();
        let mut bytes = response.bytes_stream();
        while let Some(next) = bytes.next().await {
            let next = next.map_err(|error| CurrentProviderError::new(format!("读取 provider SSE 失败: {error}")))?;
            pending.extend_from_slice(&next);
            for frame in drain_sse_frames(&mut pending)? {
                yield frame;
            }
        }
        let pending = std::str::from_utf8(&pending)
            .map_err(|error| CurrentProviderError::new(format!("解析 provider SSE UTF-8 失败: {error}")))?;
        if let Some(frame) = parse_sse_frame(pending) {
            yield frame;
        }
    }
}

pub(super) fn drain_sse_frames(
    pending: &mut Vec<u8>,
) -> Result<Vec<SseFrame>, CurrentProviderError> {
    let mut frames = Vec::new();
    while let Some(frame_end) = find_sse_frame_end(pending) {
        let frame = std::str::from_utf8(&pending[..frame_end])
            .map_err(|error| {
                CurrentProviderError::new(format!("解析 provider SSE UTF-8 失败: {error}"))
            })?
            .to_string();
        let next_start = skip_sse_frame_end(pending, frame_end);
        pending.drain(..next_start);
        if let Some(frame) = parse_sse_frame(&frame) {
            frames.push(frame);
        }
    }
    Ok(frames)
}

fn find_sse_frame_end(value: &[u8]) -> Option<usize> {
    value
        .windows(2)
        .position(|window| window == b"\n\n")
        .or_else(|| value.windows(4).position(|window| window == b"\r\n\r\n"))
}

fn skip_sse_frame_end(value: &[u8], frame_end: usize) -> usize {
    if value[frame_end..].starts_with(b"\r\n\r\n") {
        frame_end + 4
    } else {
        frame_end + 2
    }
}

pub(super) fn parse_sse_frame(frame: &str) -> Option<SseFrame> {
    let data = frame
        .lines()
        .filter_map(|line| line.strip_prefix("data:"))
        .map(str::trim_start)
        .collect::<Vec<_>>()
        .join("\n");
    (!data.is_empty()).then_some(SseFrame { data })
}
