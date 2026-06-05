use anyhow::Result;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;

use async_stream::try_stream;
use futures::stream::StreamExt;
use serde_json::Value;
use tracing::debug;
use uuid::Uuid;

use super::super::agents::Agent;
use crate::conversation::message::{Message, MessageContent, ToolRequest};
use crate::conversation::Conversation;
use crate::model::ModelConfig;
use crate::providers::base::{stream_from_single_message, MessageStream, Provider, ProviderUsage};
use crate::providers::canonical::maybe_get_canonical_model;
use crate::providers::errors::ProviderError;
use crate::providers::toolshim::{
    augment_message_with_tool_calls, convert_tool_messages_to_text,
    modify_system_prompt_for_tool_json, OllamaInterpreter,
};
use crate::session_context::current_turn_context;
use crate::tools::{ToolRegistry, VIEW_IMAGE_TOOL_NAME};

use crate::agents::code_execution_extension::EXTENSION_NAME as CODE_EXECUTION_EXTENSION;
use crate::agents::subagent_tool::AGENT_TOOL_NAME;
use crate::agents::tool_argument_coercion::coerce_tool_arguments;
use crate::session::{apply_session_update, query_session, SessionStore, TokenStatsUpdate};
#[cfg(test)]
use crate::session::{SessionManager, SessionType};
use rmcp::model::{CallToolRequestParam, Content, Tool};

const LIME_RUNTIME_METADATA_KEY: &str = "lime_runtime";
const LIME_RUNTIME_TOOL_SURFACE_KEY: &str = "tool_surface";
const LIME_RUNTIME_IMAGE_INPUT_POLICY_KEY: &str = "image_input_policy";
const TURN_TOOL_SURFACE_DIRECT_ANSWER: &str = "direct_answer";
const TURN_TOOL_SURFACE_LOCAL_WORKSPACE: &str = "local_workspace";
const TURN_TOOL_SURFACE_COMPACT_TOOLS: &str = "compact_tools";
const PLAINTEXT_TOOL_USE_OPEN_MARKER: &str = "<tool_use";
const PLAINTEXT_TOOL_USE_CLOSE_MARKER: &str = "</tool_use>";
const LOCAL_WORKSPACE_TOOL_NAMES: &[&str] = &[
    "Bash",
    "Read",
    VIEW_IMAGE_TOOL_NAME,
    "Write",
    "Edit",
    "Glob",
    "Grep",
];
const COMPACT_TOOL_SURFACE_TOOL_NAMES: &[&str] = &[
    "ToolSearch",
    "ListMcpResourcesTool",
    "ReadMcpResourceTool",
    "extensionmanager__search_available_extensions",
    "extensionmanager__manage_extensions",
    "Read",
    VIEW_IMAGE_TOOL_NAME,
    "Glob",
    "Grep",
    "Bash",
    "Edit",
    "Write",
    "Agent",
    "WebSearch",
    "WebFetch",
    "StructuredOutput",
];
const DIRECT_ANSWER_TURN_GUIDANCE: &str = "【当前回合执行约束】本回合应优先直接回答。除非信息明显不足或用户明确要求，否则不要调用工具，也不要把简单回复扩展成多阶段流程。";
const LOCAL_WORKSPACE_TURN_GUIDANCE: &str = "【当前回合执行约束】本回合只允许使用本地工作区工具。先用最少的侦查动作定位关键文件，优先小范围目录/文件列表与精确搜索；通常先控制在 3 到 6 次工具调用内拿到关键证据，只有前一步明确暴露新线索时再继续深入。若需要连续侦查，请把相互独立的读取/搜索收敛成一批，并在同一条回复里一起发起 2 到 4 个彼此独立的只读工具调用，让运行时并行执行；先完成这一批，再直接输出 1 到 2 句用户可见的结论正文，说明已经确认了什么、还缺什么、为什么还要继续，不要额外输出“阶段结论”标题，再决定是否继续下一批。如果用户消息里已经点名绝对路径、仓库根或具体文件，就把这些显式路径当作本回合唯一优先入口；第一批只围绕这些路径展开，不要先扫描当前默认工作区或无关目录。读取文件时聚焦与问题直接相关的入口、注册表、配置和代码片段，避免重复枚举大目录、避免一次性展开超长目录或整文件全文，也不要把大段原文直接抄回最终回答，改用结论加文件路径。";

fn image_input_policy_disables_provider_images() -> bool {
    let Some(turn_context) = current_turn_context() else {
        return false;
    };
    let Some(Value::Object(runtime_metadata)) =
        turn_context.metadata.get(LIME_RUNTIME_METADATA_KEY)
    else {
        return false;
    };
    let Some(Value::Object(policy)) = runtime_metadata
        .get(LIME_RUNTIME_IMAGE_INPUT_POLICY_KEY)
        .or_else(|| runtime_metadata.get("imageInputPolicy"))
    else {
        return false;
    };

    let provider_supports_vision = policy
        .get("providerSupportsVision")
        .or_else(|| policy.get("provider_supports_vision"))
        .and_then(Value::as_bool);
    let dropped_image_count = policy
        .get("droppedImageCount")
        .or_else(|| policy.get("dropped_image_count"))
        .and_then(Value::as_u64)
        .unwrap_or(0);

    provider_supports_vision == Some(false) || dropped_image_count > 0
}

fn model_config_supports_image_input(
    provider_name: &str,
    model_config: &ModelConfig,
) -> Option<bool> {
    maybe_get_canonical_model(provider_name, &model_config.model_name).map(|model| {
        model
            .input_modalities
            .iter()
            .any(|modality| modality.eq_ignore_ascii_case("image"))
    })
}

fn filter_tools_for_image_input_support(
    mut tools: Vec<Tool>,
    model_supports_image_input: Option<bool>,
) -> Vec<Tool> {
    if model_supports_image_input == Some(false) || image_input_policy_disables_provider_images() {
        tools.retain(|tool| tool.name.as_ref() != VIEW_IMAGE_TOOL_NAME);
    }
    tools
}

fn strip_images_for_text_only_provider(messages: &[Message]) -> Conversation {
    let mut removed_total = 0usize;
    let stripped_messages = messages
        .iter()
        .cloned()
        .map(|mut message| {
            let mut removed_from_message = 0usize;

            let mut stripped_content = Vec::with_capacity(message.content.len());
            for mut content in std::mem::take(&mut message.content) {
                match &mut content {
                    MessageContent::Image(_) => {
                        removed_from_message += 1;
                    }
                    MessageContent::ToolResponse(tool_response) => {
                        if let Ok(result) = tool_response.tool_result.as_mut() {
                            let before = result.content.len();
                            result.content.retain(|content| content.as_image().is_none());
                            let removed_from_tool_result = before.saturating_sub(result.content.len());
                            if removed_from_tool_result > 0 {
                                removed_from_message += removed_from_tool_result;
                                result.content.push(Content::text(format!(
                                    "[系统提示] 这个工具结果包含 {} 张图片，但当前模型不支持图片输入；图片已在发送给模型前省略。",
                                    removed_from_tool_result
                                )));
                            }
                        }
                        stripped_content.push(content);
                    }
                    _ => stripped_content.push(content),
                }
            }
            message.content = stripped_content;

            if removed_from_message > 0 {
                removed_total += removed_from_message;
                message = message.with_text(format!(
                    "[系统提示] 这条历史消息包含 {} 张图片，但当前模型不支持图片输入；图片已在发送给模型前省略。",
                    removed_from_message
                ));
            }

            message
        })
        .collect::<Vec<_>>();

    if removed_total > 0 {
        tracing::warn!(
            removed_total,
            "[AsterAgent] 当前模型不支持图片输入，已在 provider 请求前省略图片内容"
        );
    }

    Conversation::new_unvalidated(stripped_messages)
}

fn resolve_turn_tool_surface_mode() -> Option<String> {
    current_turn_context()?
        .metadata
        .get(LIME_RUNTIME_METADATA_KEY)
        .and_then(|value| value.get(LIME_RUNTIME_TOOL_SURFACE_KEY))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn is_local_workspace_tool(tool_name: &str) -> bool {
    LOCAL_WORKSPACE_TOOL_NAMES
        .iter()
        .any(|candidate| candidate.eq_ignore_ascii_case(tool_name))
}

fn is_compact_tool_surface_tool(tool_name: &str) -> bool {
    COMPACT_TOOL_SURFACE_TOOL_NAMES
        .iter()
        .any(|candidate| candidate.eq_ignore_ascii_case(tool_name))
}

fn is_compact_tool_surface_tool_or_allowed(tool_name: &str, allowed_tools: &[String]) -> bool {
    is_compact_tool_surface_tool(tool_name) || matches_turn_tool_scope(tool_name, allowed_tools)
}

fn normalize_turn_metadata_tool_list(value: Option<&Value>) -> Vec<String> {
    let Some(items) = value.and_then(Value::as_array) else {
        return Vec::new();
    };

    let mut normalized = Vec::new();
    for item in items {
        let Some(name) = item
            .as_str()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        else {
            continue;
        };
        if normalized
            .iter()
            .any(|existing: &String| existing.eq_ignore_ascii_case(name))
        {
            continue;
        }
        normalized.push(name.to_string());
    }
    normalized
}

fn extract_turn_scoped_tool_scope(metadata: &HashMap<String, Value>) -> (Vec<String>, Vec<String>) {
    let scope = metadata
        .get("tool_scope")
        .or_else(|| metadata.get("toolScope"))
        .and_then(Value::as_object)
        .or_else(|| metadata.get("subagent").and_then(Value::as_object));

    let allowed_tools = normalize_turn_metadata_tool_list(scope.and_then(|value| {
        value
            .get("allowed_tools")
            .or_else(|| value.get("allowedTools"))
    }));
    let disallowed_tools = normalize_turn_metadata_tool_list(scope.and_then(|value| {
        value
            .get("disallowed_tools")
            .or_else(|| value.get("disallowedTools"))
    }));

    (allowed_tools, disallowed_tools)
}

fn matches_turn_tool_scope(tool_name: &str, scope: &[String]) -> bool {
    scope
        .iter()
        .any(|candidate| candidate.eq_ignore_ascii_case(tool_name))
}

fn resolve_turn_tool_scope() -> (Vec<String>, Vec<String>) {
    current_turn_context()
        .map(|context| extract_turn_scoped_tool_scope(&context.metadata))
        .unwrap_or_default()
}

fn filter_tools_for_turn_scope(
    mut tools: Vec<Tool>,
    allowed_tools: &[String],
    disallowed_tools: &[String],
) -> Vec<Tool> {
    if !allowed_tools.is_empty() {
        tools.retain(|tool| matches_turn_tool_scope(&tool.name, allowed_tools));
    }
    if !disallowed_tools.is_empty() {
        tools.retain(|tool| !matches_turn_tool_scope(&tool.name, disallowed_tools));
    }
    tools
}

fn filter_tools_for_turn_surface(
    mut tools: Vec<Tool>,
    tool_surface_mode: Option<&str>,
    allowed_tools: &[String],
) -> Vec<Tool> {
    match tool_surface_mode {
        Some(TURN_TOOL_SURFACE_DIRECT_ANSWER) => Vec::new(),
        Some(TURN_TOOL_SURFACE_LOCAL_WORKSPACE) => {
            tools.retain(|tool| is_local_workspace_tool(&tool.name));
            tools
        }
        Some(TURN_TOOL_SURFACE_COMPACT_TOOLS) => {
            tools.retain(|tool| is_compact_tool_surface_tool_or_allowed(&tool.name, allowed_tools));
            tools
        }
        _ => tools,
    }
}

fn should_strip_extension_prompt_context(tool_surface_mode: Option<&str>) -> bool {
    matches!(
        tool_surface_mode,
        Some(TURN_TOOL_SURFACE_DIRECT_ANSWER | TURN_TOOL_SURFACE_LOCAL_WORKSPACE)
    )
}

fn turn_surface_prompt_guidance(tool_surface_mode: Option<&str>) -> Option<&'static str> {
    match tool_surface_mode {
        Some(TURN_TOOL_SURFACE_DIRECT_ANSWER) => Some(DIRECT_ANSWER_TURN_GUIDANCE),
        Some(TURN_TOOL_SURFACE_LOCAL_WORKSPACE) => Some(LOCAL_WORKSPACE_TURN_GUIDANCE),
        _ => None,
    }
}

fn normalize_response_tool_requests(response: &Message, tool_requests: &[ToolRequest]) -> Message {
    let mut normalized_response = response.clone();
    let mut normalized_content = Vec::with_capacity(response.content.len());
    let mut tool_request_index = 0;

    for content in &response.content {
        match content {
            MessageContent::ToolRequest(_) => {
                if let Some(request) = tool_requests.get(tool_request_index) {
                    normalized_content.push(MessageContent::ToolRequest(request.clone()));
                }
                tool_request_index += 1;
            }
            _ => normalized_content.push(content.clone()),
        }
    }

    debug_assert_eq!(
        tool_request_index,
        tool_requests.len(),
        "normalized tool request count should match response tool request count",
    );

    normalized_response.content = normalized_content;
    normalized_response
}

fn current_surface_tool_name(tools: &[Tool], name: &str) -> Option<String> {
    tools
        .iter()
        .find(|tool| tool.name.as_ref() == name)
        .or_else(|| {
            tools
                .iter()
                .find(|tool| tool.name.as_ref().eq_ignore_ascii_case(name))
        })
        .map(|tool| tool.name.to_string())
}

fn normalize_current_surface_tool_call(
    tool_call: &mut rmcp::model::CallToolRequestParam,
    tools: &[Tool],
    registry: &ToolRegistry,
) {
    let requested_name = tool_call.name.as_ref().trim();
    if requested_name.is_empty() {
        return;
    }

    if let Some(surface_name) = current_surface_tool_name(tools, requested_name) {
        tool_call.name = surface_name.into();
        return;
    }

    let Some(canonical_name) = registry.canonical_name(requested_name) else {
        return;
    };
    if let Some(surface_name) = current_surface_tool_name(tools, &canonical_name) {
        tool_call.name = surface_name.into();
    }
}

fn integer_argument(arguments: &serde_json::Map<String, Value>, key: &str) -> Option<i64> {
    arguments
        .get(key)
        .and_then(|value| match value {
            Value::Number(number) => number.as_i64(),
            Value::String(text) => text.trim().parse::<i64>().ok(),
            _ => None,
        })
        .filter(|value| *value > 0)
}

fn copy_string_argument_if_missing(
    arguments: &mut serde_json::Map<String, Value>,
    from: &str,
    to: &str,
) {
    if arguments.contains_key(to) {
        return;
    }
    let Some(value) = arguments
        .get(from)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
    else {
        return;
    };
    arguments.insert(to.to_string(), Value::String(value));
}

fn normalize_current_surface_tool_arguments(tool_call: &mut CallToolRequestParam) {
    let Some(arguments) = tool_call.arguments.as_mut() else {
        return;
    };

    match tool_call.name.as_ref() {
        "Read" => {
            copy_string_argument_if_missing(arguments, "file_path", "path");
            copy_string_argument_if_missing(arguments, "filePath", "path");
            if !arguments.contains_key("end_line") {
                if let Some(head) = integer_argument(arguments, "head") {
                    arguments.insert("end_line".to_string(), Value::Number(head.into()));
                    arguments
                        .entry("start_line".to_string())
                        .or_insert_with(|| Value::Number(1.into()));
                }
            }
        }
        "Write" | "Edit" => {
            copy_string_argument_if_missing(arguments, "file_path", "path");
            copy_string_argument_if_missing(arguments, "filePath", "path");
        }
        "Glob" | "Grep" => {
            copy_string_argument_if_missing(arguments, "query", "pattern");
        }
        _ => {}
    }
}

fn extract_plaintext_tool_use_name(open_tag: &str) -> Option<String> {
    let normalized = open_tag.replace("\\\"", "\"").replace("\\'", "'");
    let name_pos = normalized.find("name=")?;
    let after_name = normalized.get(name_pos + "name=".len()..)?.trim_start();
    let quote = after_name.chars().next()?;
    if quote != '"' && quote != '\'' {
        return None;
    }
    let value_start = quote.len_utf8();
    let value_end = after_name.get(value_start..)?.find(quote)?;
    let value = after_name.get(value_start..value_start + value_end)?.trim();
    if value.is_empty() {
        None
    } else {
        Some(value.to_string())
    }
}

fn extract_xml_attribute(open_tag: &str, attr_name: &str) -> Option<String> {
    let normalized = open_tag.replace("\\\"", "\"").replace("\\'", "'");
    let needle = format!("{attr_name}=");
    let name_pos = normalized.find(&needle)?;
    let after_name = normalized.get(name_pos + needle.len()..)?.trim_start();
    let quote = after_name.chars().next()?;
    if quote != '"' && quote != '\'' {
        return None;
    }
    let value_start = quote.len_utf8();
    let value_end = after_name.get(value_start..)?.find(quote)?;
    let value = after_name.get(value_start..value_start + value_end)?.trim();
    if value.is_empty() {
        None
    } else {
        Some(value.to_string())
    }
}

fn normalize_plaintext_tool_alias_name(raw_name: &str) -> Option<String> {
    let normalized = raw_name.trim();
    if normalized.is_empty() {
        return None;
    }
    if normalized.eq_ignore_ascii_case("search") {
        return Some("WebSearch".to_string());
    }
    Some(normalized.to_string())
}

fn extract_inline_plaintext_tool_call(open_tag: &str) -> Option<CallToolRequestParam> {
    let tag_body = open_tag
        .trim()
        .strip_prefix('<')?
        .trim()
        .trim_end_matches('>')
        .trim()
        .trim_end_matches('/')
        .trim();
    let raw_name = tag_body.split_whitespace().next()?.trim();
    let name = normalize_plaintext_tool_alias_name(raw_name)?;
    if !name.eq_ignore_ascii_case("WebSearch") {
        return None;
    }
    let query = extract_xml_attribute(open_tag, "query")?;
    let mut arguments = serde_json::Map::new();
    arguments.insert("query".to_string(), Value::String(query));
    Some(CallToolRequestParam {
        name: name.into(),
        arguments: Some(arguments),
    })
}

fn strip_json_code_fence(raw: &str) -> &str {
    let trimmed = raw.trim();
    if !trimmed.starts_with("```") {
        return trimmed;
    }

    let Some(first_line_end) = trimmed.find('\n') else {
        return trimmed;
    };
    let without_opening = &trimmed[first_line_end + 1..];
    without_opening
        .strip_suffix("```")
        .map(str::trim)
        .unwrap_or(without_opening.trim())
}

fn parse_plaintext_tool_use_arguments(raw: &str) -> Option<serde_json::Map<String, Value>> {
    let candidate = strip_json_code_fence(raw);
    let parsed = match serde_json::from_str::<Value>(candidate) {
        Ok(value) => value,
        Err(_) => {
            let start = candidate.find('{')?;
            let end = candidate.rfind('}')?;
            serde_json::from_str::<Value>(&candidate[start..=end]).ok()?
        }
    };
    match parsed {
        Value::Object(arguments) => Some(arguments),
        _ => None,
    }
}

fn extract_plaintext_tool_uses(text: &str) -> Option<(String, Vec<CallToolRequestParam>)> {
    let mut cursor = 0usize;
    let mut prefix = String::new();
    let mut tool_calls = Vec::new();
    let mut saw_tool_use = false;

    while let Some(start_offset) =
        find_next_plaintext_tool_tag(text.get(cursor..)?).map(|(offset, _)| offset)
    {
        let start = cursor + start_offset;
        if !saw_tool_use {
            prefix.push_str(text.get(cursor..start).unwrap_or_default());
        }

        let open_end = start + text.get(start..)?.find('>')?;
        let open_tag = text.get(start..=open_end)?;
        if let Some(tool_call) = extract_inline_plaintext_tool_call(open_tag) {
            tool_calls.push(tool_call);
            saw_tool_use = true;
            cursor = open_end + 1;
            continue;
        }

        if !open_tag.starts_with(PLAINTEXT_TOOL_USE_OPEN_MARKER) {
            saw_tool_use = true;
            cursor = open_end + 1;
            continue;
        }

        let body_start = open_end + 1;
        let close_start = body_start
            + text
                .get(body_start..)?
                .find(PLAINTEXT_TOOL_USE_CLOSE_MARKER)?;
        let body = text.get(body_start..close_start)?;

        if let (Some(name), Some(arguments)) = (
            extract_plaintext_tool_use_name(open_tag),
            parse_plaintext_tool_use_arguments(body),
        ) {
            tool_calls.push(CallToolRequestParam {
                name: normalize_plaintext_tool_alias_name(&name)
                    .unwrap_or(name)
                    .into(),
                arguments: Some(arguments),
            });
        }

        saw_tool_use = true;
        cursor = close_start + PLAINTEXT_TOOL_USE_CLOSE_MARKER.len();
    }

    if tool_calls.is_empty() {
        None
    } else {
        Some((prefix, tool_calls))
    }
}

fn find_next_plaintext_tool_tag(text: &str) -> Option<(usize, &'static str)> {
    [
        PLAINTEXT_TOOL_USE_OPEN_MARKER,
        "<WebSearch",
        "<websearch",
        "<Search",
        "<search",
    ]
    .iter()
    .filter_map(|marker| text.find(marker).map(|offset| (offset, *marker)))
    .min_by_key(|(offset, _)| *offset)
}

fn assistant_single_text_content(message: &Message) -> Option<&str> {
    if message.role != rmcp::model::Role::Assistant || message.content.len() != 1 {
        return None;
    }

    message.content.first()?.as_text()
}

fn message_with_single_text(message: &Message, text: String) -> Message {
    let mut next = message.clone();
    next.content = vec![MessageContent::text(text)];
    next
}

fn plaintext_tool_use_is_complete(text: &str) -> bool {
    let Some(open_pos) = text.find(PLAINTEXT_TOOL_USE_OPEN_MARKER) else {
        return false;
    };
    text.get(open_pos..)
        .is_some_and(|tail| tail.contains(PLAINTEXT_TOOL_USE_CLOSE_MARKER))
}

fn normalize_plaintext_tool_use_message(message: Message) -> Message {
    normalize_plaintext_tool_use_message_with_ids(message, &[])
}

fn normalize_plaintext_tool_use_message_with_ids(
    message: Message,
    preallocated_tool_ids: &[String],
) -> Message {
    if message.role != rmcp::model::Role::Assistant
        || message
            .content
            .iter()
            .any(|content| matches!(content, MessageContent::ToolRequest(_)))
    {
        return message;
    }

    let mut normalized_message = message;
    let original_content = std::mem::take(&mut normalized_message.content);
    let mut normalized_content = Vec::with_capacity(original_content.len());
    let mut converted_any = false;

    for content in original_content {
        match content {
            MessageContent::Text(text) if !converted_any => {
                if let Some((prefix, tool_calls)) = extract_plaintext_tool_uses(&text.text) {
                    converted_any = true;
                    let visible_prefix = prefix.trim();
                    if !visible_prefix.is_empty() {
                        normalized_content.push(MessageContent::text(visible_prefix.to_string()));
                    }
                    for (idx, tool_call) in tool_calls.into_iter().enumerate() {
                        let tool_request_id = preallocated_tool_ids
                            .get(idx)
                            .cloned()
                            .unwrap_or_else(|| Uuid::new_v4().to_string());
                        normalized_content
                            .push(MessageContent::tool_request(tool_request_id, Ok(tool_call)));
                    }
                } else {
                    normalized_content.push(MessageContent::Text(text));
                }
            }
            MessageContent::Text(_) if converted_any => {
                // 模型在 XML tool_use 后追加的自然语言通常是“未暴露工具”的误判结论；
                // 工具已被提升为结构化调用后，后续结论应由下一轮基于工具结果生成。
            }
            other => normalized_content.push(other),
        }
    }

    if converted_any {
        normalized_message.content = normalized_content;
        normalized_message
    } else {
        normalized_message.content = normalized_content;
        normalized_message
    }
}

#[derive(Default)]
struct PlaintextToolUseStreamNormalizer {
    pending_message: Option<Message>,
    pending_text: String,
    pending_tool_ids: Vec<String>,
}

impl PlaintextToolUseStreamNormalizer {
    fn finish(&mut self) -> Option<Message> {
        let pending_message = self.pending_message.take()?;
        let pending_text = std::mem::take(&mut self.pending_text);
        self.pending_tool_ids.clear();
        Some(message_with_single_text(&pending_message, pending_text))
    }

    fn finish_normalized(&mut self) -> Option<Message> {
        let pending_message = self.pending_message.take()?;
        let pending_text = std::mem::take(&mut self.pending_text);
        let pending_tool_ids = std::mem::take(&mut self.pending_tool_ids);
        Some(normalize_plaintext_tool_use_message_with_ids(
            message_with_single_text(&pending_message, pending_text),
            &pending_tool_ids,
        ))
    }

    fn pending_tool_input_delta(&self, base: &Message, delta_text: &str) -> Option<Message> {
        let tool_id = self.pending_tool_ids.first()?;
        let progress = extract_plaintext_tool_use_progress(self.pending_text.as_str(), delta_text)?;
        let mut message = base.clone();
        message.content = vec![MessageContent::tool_input_delta(
            tool_id.clone(),
            progress.tool_name,
            progress.delta,
            progress.accumulated_arguments,
            Some("plaintext_tool_use".to_string()),
        )];
        Some(message)
    }

    fn process(&mut self, response: Message) -> Vec<Message> {
        if self.pending_message.is_some() {
            if let Some(text) = assistant_single_text_content(&response) {
                self.pending_text.push_str(text);
                if plaintext_tool_use_is_complete(&self.pending_text) {
                    if let Some(message) = self.finish_normalized() {
                        return vec![message];
                    }
                }
                return self
                    .pending_tool_input_delta(&response, text)
                    .into_iter()
                    .collect();
            }

            let mut output = Vec::new();
            if let Some(pending) = self.finish() {
                output.push(normalize_plaintext_tool_use_message(pending));
            }
            output.extend(self.process(response));
            return output;
        }

        let Some(text) = assistant_single_text_content(&response) else {
            return vec![normalize_plaintext_tool_use_message(response)];
        };
        let Some(tool_start) = text.find(PLAINTEXT_TOOL_USE_OPEN_MARKER) else {
            return vec![normalize_plaintext_tool_use_message(response)];
        };
        if plaintext_tool_use_is_complete(text) {
            return vec![normalize_plaintext_tool_use_message(response)];
        }

        let prefix = text[..tool_start].trim().to_string();
        let pending = text[tool_start..].to_string();
        let mut output = Vec::new();
        if !prefix.trim().is_empty() {
            output.push(message_with_single_text(&response, prefix));
        }

        let mut pending_message = response;
        pending_message.content.clear();
        let tool_id = Uuid::new_v4().to_string();
        self.pending_message = Some(pending_message);
        self.pending_tool_ids = vec![tool_id];
        self.pending_text.push_str(&pending);
        if let Some(pending_message) = self.pending_message.as_ref() {
            if let Some(delta_message) =
                self.pending_tool_input_delta(pending_message, self.pending_text.as_str())
            {
                output.push(delta_message);
            }
        }
        output
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct PlaintextToolUseProgress {
    tool_name: Option<String>,
    delta: String,
    accumulated_arguments: Option<String>,
}

fn strip_plaintext_tool_use_markup(raw: &str) -> String {
    let mut value = raw;
    if let Some(open_start) = value.find(PLAINTEXT_TOOL_USE_OPEN_MARKER) {
        let tail = &value[open_start..];
        let Some(open_end) = tail.find('>') else {
            return String::new();
        };
        value = &tail[open_end + 1..];
    }
    if let Some(close_start) = value.find(PLAINTEXT_TOOL_USE_CLOSE_MARKER) {
        value = &value[..close_start];
    }
    value.to_string()
}

fn extract_plaintext_tool_use_progress(
    accumulated_text: &str,
    delta_text: &str,
) -> Option<PlaintextToolUseProgress> {
    let start = accumulated_text.find(PLAINTEXT_TOOL_USE_OPEN_MARKER)?;
    let tail = accumulated_text.get(start..)?;
    let open_end = tail.find('>');
    let tool_name = open_end.and_then(|idx| extract_plaintext_tool_use_name(&tail[..=idx]));
    let accumulated_arguments = open_end
        .map(|idx| strip_plaintext_tool_use_markup(&tail[idx + 1..]))
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let delta = strip_plaintext_tool_use_markup(delta_text);

    Some(PlaintextToolUseProgress {
        tool_name,
        delta,
        accumulated_arguments,
    })
}

async fn toolshim_postprocess(
    response: Message,
    toolshim_tools: &[Tool],
    toolshim_model: Option<&str>,
) -> Result<Message, ProviderError> {
    let interpreter = OllamaInterpreter::new_with_model(toolshim_model.map(str::to_string))
        .map_err(|e| {
            ProviderError::ExecutionError(format!("Failed to create OllamaInterpreter: {}", e))
        })?;

    augment_message_with_tool_calls(&interpreter, response, toolshim_tools)
        .await
        .map_err(|e| ProviderError::ExecutionError(format!("Failed to augment message: {}", e)))
}

impl Agent {
    pub async fn prepare_tools_and_prompt(
        &self,
        working_dir: &std::path::Path,
        session_prompt: Option<&str>,
        session_prompt_override: bool,
        model_config: &ModelConfig,
    ) -> Result<(Vec<Tool>, Vec<Tool>, String)> {
        let started_at = Instant::now();
        // Get tools from extension manager
        let mut tools = self.list_tools(None).await;

        // Add frontend tools
        let frontend_tools = self.frontend_tools.lock().await;
        for frontend_tool in frontend_tools.values() {
            tools.push(frontend_tool.tool.clone());
        }

        let turn_tool_surface_mode = resolve_turn_tool_surface_mode();
        let code_execution_active = self
            .extension_manager
            .is_extension_enabled(CODE_EXECUTION_EXTENSION)
            .await;
        if code_execution_active && turn_tool_surface_mode.is_none() {
            let code_exec_prefix = format!("{CODE_EXECUTION_EXTENSION}__");
            tools.retain(|tool| tool.name.starts_with(&code_exec_prefix));
        }

        let (turn_allowed_tools, turn_disallowed_tools) = resolve_turn_tool_scope();
        tools = filter_tools_for_turn_surface(
            tools,
            turn_tool_surface_mode.as_deref(),
            &turn_allowed_tools,
        );
        tools = filter_tools_for_turn_scope(tools, &turn_allowed_tools, &turn_disallowed_tools);
        let provider_name = self
            .provider()
            .await
            .ok()
            .map(|provider| provider.get_name().to_string());
        let model_supports_image_input = provider_name
            .as_deref()
            .and_then(|name| model_config_supports_image_input(name, model_config));
        tools = filter_tools_for_image_input_support(tools, model_supports_image_input);
        let subagents_enabled = tools.iter().any(|tool| tool.name == AGENT_TOOL_NAME);

        // Stable tool ordering is important for multi session prompt caching.
        tools.sort_by(|a, b| a.name.cmp(&b.name));

        // Prepare system prompt
        let mut extensions_info = self.extension_manager.get_extensions_info().await;
        let (mut extension_count, mut tool_count) =
            self.extension_manager.get_extension_and_tool_counts().await;
        if should_strip_extension_prompt_context(turn_tool_surface_mode.as_deref()) {
            extensions_info.clear();
            extension_count = 0;
            tool_count = tools.len();
        }

        let final_output_instruction = self
            .final_output_tool
            .lock()
            .await
            .as_ref()
            .map(|tool| tool.system_prompt());

        let prompt_manager = self.prompt_manager.lock().await;
        let mut system_prompt = prompt_manager
            .builder()
            .with_extensions(extensions_info.into_iter())
            .with_frontend_instructions(self.frontend_instructions.lock().await.clone())
            .with_additional_instruction(final_output_instruction)
            .with_extension_and_tool_counts(extension_count, tool_count)
            .with_code_execution_mode(code_execution_active)
            .with_hints(working_dir)
            .with_enable_subagents(subagents_enabled)
            .with_session_prompt(session_prompt.map(|s| s.to_string()))
            .with_session_prompt_override(session_prompt_override)
            .build();
        if let Some(guidance) = turn_surface_prompt_guidance(turn_tool_surface_mode.as_deref()) {
            system_prompt.push_str("\n\n");
            system_prompt.push_str(guidance);
        }
        // Handle toolshim if enabled
        let mut toolshim_tools = vec![];
        if model_config.toolshim {
            // If tool interpretation is enabled, modify the system prompt
            system_prompt = modify_system_prompt_for_tool_json(&system_prompt, &tools);
            // Make a copy of tools before emptying
            toolshim_tools = tools.clone();
            // Empty the tools vector for provider completion
            tools = vec![];
        }

        tracing::info!(
            "[AsterAgent][TTFT] tools/prompt prepared: model={}, tool_surface={:?}, tools={}, toolshim_tools={}, system_chars={}, elapsed_ms={}",
            model_config.model_name,
            turn_tool_surface_mode,
            tools.len(),
            toolshim_tools.len(),
            system_prompt.chars().count(),
            started_at.elapsed().as_millis()
        );

        Ok((tools, toolshim_tools, system_prompt))
    }

    /// Stream a response from the LLM provider.
    /// Handles toolshim transformations if needed
    pub(crate) async fn stream_response_from_provider(
        provider: Arc<dyn Provider>,
        model_config: &ModelConfig,
        system_prompt: &str,
        messages: &[Message],
        tools: &[Tool],
        toolshim_tools: &[Tool],
    ) -> Result<MessageStream, ProviderError> {
        let started_at = Instant::now();
        // Convert tool messages to text if toolshim is enabled
        let messages_for_provider = if model_config.toolshim {
            convert_tool_messages_to_text(messages)
        } else {
            Conversation::new_unvalidated(messages.to_vec())
        };
        let messages_for_provider = if image_input_policy_disables_provider_images() {
            strip_images_for_text_only_provider(messages_for_provider.messages())
        } else {
            messages_for_provider
        };

        // Clone owned data to move into the async stream
        let model_config = model_config.clone();
        let system_prompt = system_prompt.to_owned();
        let tools = tools.to_owned();
        let toolshim_tools = toolshim_tools.to_owned();
        let provider = provider.clone();
        let turn_tool_surface_mode = resolve_turn_tool_surface_mode();

        // Capture errors during stream creation and return them as part of the stream
        // so they can be handled by the existing error handling logic in the agent
        let stream_result = if provider.supports_streaming() {
            tracing::info!(
                "[AsterAgent][TTFT] provider stream request start: provider={}, model={}, messages={}, tools={}, tool_surface={:?}, system_chars={}",
                provider.get_name(),
                model_config.model_name,
                messages_for_provider.messages().len(),
                tools.len(),
                turn_tool_surface_mode,
                system_prompt.chars().count()
            );
            debug!("WAITING_LLM_STREAM_START");
            let result = provider
                .stream_with_model(
                    &model_config,
                    system_prompt.as_str(),
                    messages_for_provider.messages(),
                    &tools,
                )
                .await;
            let elapsed_ms = started_at.elapsed().as_millis();
            match &result {
                Ok(_) => tracing::info!(
                    "[AsterAgent][TTFT] provider stream response headers received: provider={}, model={}, elapsed_ms={}",
                    provider.get_name(),
                    model_config.model_name,
                    elapsed_ms
                ),
                Err(error) => {
                    if error.is_non_retryable_provider_rejection() {
                        tracing::info!(
                            "[AsterAgent][TTFT] provider stream request rejected before body: provider={}, model={}, elapsed_ms={}, error={}",
                            provider.get_name(),
                            model_config.model_name,
                            elapsed_ms,
                            error
                        );
                    } else {
                        tracing::warn!(
                            "[AsterAgent][TTFT] provider stream request failed before body: provider={}, model={}, elapsed_ms={}, error={}",
                            provider.get_name(),
                            model_config.model_name,
                            elapsed_ms,
                            error
                        );
                    }
                }
            }
            debug!("WAITING_LLM_STREAM_END");
            result
        } else {
            tracing::info!(
                "[AsterAgent][TTFT] provider non-stream request start: provider={}, model={}, messages={}, tools={}, tool_surface={:?}, system_chars={}",
                provider.get_name(),
                model_config.model_name,
                messages_for_provider.messages().len(),
                tools.len(),
                turn_tool_surface_mode,
                system_prompt.chars().count()
            );
            debug!("WAITING_LLM_START");
            let complete_result = provider
                .complete_with_model(
                    &model_config,
                    system_prompt.as_str(),
                    messages_for_provider.messages(),
                    &tools,
                )
                .await;
            tracing::info!(
                "[AsterAgent][TTFT] provider non-stream response complete: provider={}, model={}, elapsed_ms={}",
                provider.get_name(),
                model_config.model_name,
                started_at.elapsed().as_millis()
            );
            debug!("WAITING_LLM_END");

            match complete_result {
                Ok((message, usage)) => Ok(stream_from_single_message(message, usage)),
                Err(e) => Err(e),
            }
        };

        // If there was an error creating the stream, return a stream that yields that error
        let mut stream = match stream_result {
            Ok(s) => s,
            Err(e) => {
                // Return a stream that immediately yields the error
                // This allows the error to be caught by existing error handling in agent.rs
                return Ok(Box::pin(try_stream! {
                    yield Err(e)?;
                }));
            }
        };

        Ok(Box::pin(try_stream! {
            let mut first_provider_content_seen = false;
            let mut plaintext_tool_use_normalizer = PlaintextToolUseStreamNormalizer::default();
            while let Some(next) = stream.next().await {
                let (mut message, usage) = match next {
                    Ok(next) => next,
                    Err(error)
                        if !first_provider_content_seen
                            && error.to_string().contains(
                                "Anthropic stream ended without assistant content or tool call",
                            ) =>
                    {
                        tracing::warn!(
                            "[AsterAgent][TTFT] empty provider stream before first message, retrying non-stream fallback: provider={}, model={}, elapsed_ms={}, error={}",
                            provider.get_name(),
                            model_config.model_name,
                            started_at.elapsed().as_millis(),
                            error
                        );
                        let (message, usage) = provider
                            .complete_with_model(
                                &model_config,
                                system_prompt.as_str(),
                                messages_for_provider.messages(),
                                &tools,
                            )
                            .await?;
                        (Some(message), Some(usage))
                    }
                    Err(error) => Err(error)?,
                };
                if message.is_some() && !first_provider_content_seen {
                    first_provider_content_seen = true;
                    tracing::info!(
                        "[AsterAgent][TTFT] first provider stream message decoded: provider={}, model={}, elapsed_ms={}",
                        provider.get_name(),
                        model_config.model_name,
                        started_at.elapsed().as_millis()
                    );
                }
                // Store the model information in the global store
                if let Some(usage) = usage.as_ref() {
                    crate::providers::base::set_current_model(&usage.model);
                }

                // Post-process / structure the response only if tool interpretation is enabled
                if message.is_some() && model_config.toolshim {
                    message = Some(
                        toolshim_postprocess(
                            message.unwrap(),
                            &toolshim_tools,
                            model_config.toolshim_model.as_deref(),
                        )
                        .await?,
                    );
                }
                if let Some(response) = message.take() {
                    let mut usage_to_emit = usage;
                    let normalized_messages = plaintext_tool_use_normalizer.process(response);
                    let mut emitted_message = false;
                    for normalized_message in normalized_messages {
                        emitted_message = true;
                        yield (Some(normalized_message), usage_to_emit.take());
                    }
                    if usage_to_emit.is_some() {
                        if let Some(pending_message) = plaintext_tool_use_normalizer.finish() {
                            emitted_message = true;
                            yield (
                                Some(normalize_plaintext_tool_use_message(pending_message)),
                                usage_to_emit.take(),
                            );
                        }
                    }
                    if !emitted_message && usage_to_emit.is_some() {
                        yield (None, usage_to_emit);
                    }
                    continue;
                }

                yield (message, usage);
            }
            if let Some(pending_message) = plaintext_tool_use_normalizer.finish() {
                yield (Some(normalize_plaintext_tool_use_message(pending_message)), None);
            }
        }))
    }

    /// Categorize tool requests from the response into different types
    /// Returns:
    /// - frontend_requests: Tool requests that should be handled by the frontend
    /// - other_requests: All other tool requests (including requests to enable extensions)
    /// - filtered_message: The original message with frontend tool requests removed
    pub(crate) async fn categorize_tool_requests(
        &self,
        response: &Message,
        tools: &[Tool],
    ) -> (Vec<ToolRequest>, Vec<ToolRequest>, Message, Message) {
        // First collect all tool requests with coercion applied
        let tool_requests: Vec<ToolRequest> = {
            let registry = self.tool_registry.read().await;
            response
                .content
                .iter()
                .filter_map(|content| {
                    if let MessageContent::ToolRequest(req) = content {
                        let mut coerced_req = req.clone();

                        if let Ok(ref mut tool_call) = coerced_req.tool_call {
                            normalize_current_surface_tool_call(tool_call, tools, &registry);
                            normalize_current_surface_tool_arguments(tool_call);

                            if let Some(tool) = tools
                                .iter()
                                .find(|t| t.name.as_ref() == tool_call.name.as_ref())
                            {
                                let schema_value =
                                    Value::Object(tool.input_schema.as_ref().clone());
                                tool_call.arguments = coerce_tool_arguments(
                                    tool_call.arguments.clone(),
                                    &schema_value,
                                );

                                if let Some(ref meta) = tool.meta {
                                    coerced_req.tool_meta = serde_json::to_value(meta).ok();
                                }
                            }
                        }

                        Some(coerced_req)
                    } else {
                        None
                    }
                })
                .collect()
        };

        // Create a filtered message with frontend tool requests removed
        let mut filtered_content = Vec::new();
        let mut tool_request_index = 0;

        for content in &response.content {
            match content {
                MessageContent::ToolRequest(_) => {
                    if tool_request_index < tool_requests.len() {
                        let coerced_req = &tool_requests[tool_request_index];
                        tool_request_index += 1;

                        let should_include = if let Ok(tool_call) = &coerced_req.tool_call {
                            !self.is_frontend_tool(&tool_call.name).await
                        } else {
                            true
                        };

                        if should_include {
                            filtered_content.push(MessageContent::ToolRequest(coerced_req.clone()));
                        }
                    }
                }
                _ => {
                    filtered_content.push(content.clone());
                }
            }
        }

        let mut filtered_message =
            Message::new(response.role.clone(), response.created, filtered_content);

        // Preserve the ID if it exists
        if let Some(id) = response.id.clone() {
            filtered_message = filtered_message.with_id(id);
        }

        let normalized_response = normalize_response_tool_requests(response, &tool_requests);

        // Categorize tool requests
        let mut frontend_requests = Vec::new();
        let mut other_requests = Vec::new();

        for request in tool_requests {
            if let Ok(tool_call) = &request.tool_call {
                if self.is_frontend_tool(&tool_call.name).await {
                    frontend_requests.push(request);
                } else {
                    other_requests.push(request);
                }
            } else {
                // If there's an error in the tool call, add it to other_requests
                other_requests.push(request);
            }
        }

        (
            frontend_requests,
            other_requests,
            filtered_message,
            normalized_response,
        )
    }

    pub(crate) async fn update_session_metrics(
        session_config: &crate::agents::types::SessionConfig,
        usage: &ProviderUsage,
        is_compaction_usage: bool,
        session_store: Option<&Arc<dyn SessionStore>>,
    ) -> Result<()> {
        let session_id = session_config.id.as_str();
        let session = if let Some(store) = session_store {
            store.get_session(session_id, false).await?
        } else {
            query_session(session_id, false).await?
        };

        let accumulate = |a: Option<i32>, b: Option<i32>| -> Option<i32> {
            match (a, b) {
                (Some(x), Some(y)) => Some(x + y),
                _ => a.or(b),
            }
        };

        let accumulated_total =
            accumulate(session.accumulated_total_tokens, usage.usage.total_tokens);
        let accumulated_input =
            accumulate(session.accumulated_input_tokens, usage.usage.input_tokens);
        let accumulated_output =
            accumulate(session.accumulated_output_tokens, usage.usage.output_tokens);

        let (current_total, current_input, current_output) = if is_compaction_usage {
            // After compaction: summary output becomes new input context
            let new_input = usage.usage.output_tokens;
            (new_input, new_input, None)
        } else {
            (
                usage.usage.total_tokens,
                usage.usage.input_tokens,
                usage.usage.output_tokens,
            )
        };
        let current_cached_input = if is_compaction_usage {
            Some(0)
        } else {
            usage.usage.cached_input_tokens
        };
        let current_cache_creation_input = if is_compaction_usage {
            Some(0)
        } else {
            usage.usage.cache_creation_input_tokens
        };

        if let Some(store) = session_store {
            store
                .update_token_stats(
                    session_id,
                    TokenStatsUpdate {
                        schedule_id: session_config.schedule_id.clone(),
                        total_tokens: current_total,
                        input_tokens: current_input,
                        output_tokens: current_output,
                        cached_input_tokens: current_cached_input,
                        cache_creation_input_tokens: current_cache_creation_input,
                        accumulated_total,
                        accumulated_input,
                        accumulated_output,
                    },
                )
                .await?;
        } else {
            apply_session_update(session_id, |update| {
                update
                    .schedule_id(session_config.schedule_id.clone())
                    .total_tokens(current_total)
                    .input_tokens(current_input)
                    .output_tokens(current_output)
                    .cached_input_tokens(current_cached_input)
                    .cache_creation_input_tokens(current_cache_creation_input)
                    .accumulated_total_tokens(accumulated_total)
                    .accumulated_input_tokens(accumulated_input)
                    .accumulated_output_tokens(accumulated_output)
            })
            .await?;
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agents::mcp_client::{Error as McpClientError, McpClientTrait};
    use crate::conversation::message::{Message, MessageContent, ToolRequest};
    use crate::model::ModelConfig;
    use crate::providers::base::{Provider, ProviderUsage, Usage};
    use crate::providers::errors::ProviderError;
    use crate::scheduler::{ScheduledJob, SchedulerError};
    use crate::scheduler_trait::SchedulerTrait;
    use crate::session::{Session, TurnContextOverride};
    use async_trait::async_trait;
    use chrono::{DateTime, Utc};
    use rmcp::model::{
        CallToolResult, GetPromptResult, Implementation, InitializeResult, JsonObject,
        ListPromptsResult, ListResourcesResult, ListToolsResult, ProtocolVersion,
        ReadResourceResult, ResourcesCapability, ServerCapabilities, ServerInfo,
        ServerNotification,
    };
    use rmcp::object;
    use serde_json::json;
    use std::collections::HashMap;
    use std::path::PathBuf;
    use tokio::sync::{mpsc, Mutex};
    use tokio_util::sync::CancellationToken;

    const MCP_CONTEXT_SENTINEL: &str = "MCP_CONTEXT_SENTINEL_SHOULD_STAY";

    #[test]
    fn normalize_plaintext_tool_use_message_extracts_claude_code_xml_blocks() {
        let message = Message::assistant().with_text(
            "我先做只读验证。\n\
            <tool_use name=\"mcp__system__shell\">{\"command\":\"pwd\"}</tool_use>\n\
            <tool_use name=\"mcp__system__read_file\">```json\n{\"path\":\"package.json\",\"head\":20}\n```</tool_use>\n\
            抱歉，当前环境没有暴露工具接口。",
        );

        let normalized = normalize_plaintext_tool_use_message(message);
        let text = normalized.as_concat_text();
        let requests = normalized
            .content
            .iter()
            .filter_map(|content| content.as_tool_request())
            .collect::<Vec<_>>();

        assert_eq!(text, "我先做只读验证。");
        assert_eq!(requests.len(), 2);
        assert_eq!(
            requests[0].tool_call.as_ref().expect("shell call").name,
            "mcp__system__shell"
        );
        assert_eq!(
            requests[0]
                .tool_call
                .as_ref()
                .expect("shell call")
                .arguments
                .as_ref()
                .and_then(|arguments| arguments.get("command"))
                .and_then(Value::as_str),
            Some("pwd")
        );
        assert_eq!(
            requests[1].tool_call.as_ref().expect("read call").name,
            "mcp__system__read_file"
        );
        assert_eq!(
            requests[1]
                .tool_call
                .as_ref()
                .expect("read call")
                .arguments
                .as_ref()
                .and_then(|arguments| arguments.get("head"))
                .and_then(Value::as_i64),
            Some(20)
        );
        assert!(
            !normalized.as_concat_text().contains("<tool_use"),
            "XML tool_use 不应继续作为正文展示"
        );
    }

    #[test]
    fn plaintext_tool_use_stream_normalizer_buffers_split_xml_blocks() {
        let mut normalizer = PlaintextToolUseStreamNormalizer::default();

        let first_output = normalizer
            .process(Message::assistant().with_text("<tool_use name=\"mcp__system__shell\">"));
        assert_eq!(first_output.len(), 1);
        let MessageContent::ToolInputDelta(first_delta) = &first_output[0].content[0] else {
            panic!("首个分片应立即转成工具输入占位");
        };
        assert_eq!(first_delta.tool_name.as_deref(), Some("mcp__system__shell"));
        let pending_tool_id = first_delta.id.clone();

        let second_output =
            normalizer.process(Message::assistant().with_text("{\"command\":\"pwd\"}"));
        assert_eq!(second_output.len(), 1);
        let MessageContent::ToolInputDelta(second_delta) = &second_output[0].content[0] else {
            panic!("参数分片应继续更新同一个工具输入占位");
        };
        assert_eq!(second_delta.id, pending_tool_id);
        assert_eq!(
            second_delta.accumulated_arguments.as_deref(),
            Some("{\"command\":\"pwd\"}")
        );
        let output = normalizer.process(Message::assistant().with_text("</tool_use>"));

        assert_eq!(output.len(), 1);
        let requests = output[0]
            .content
            .iter()
            .filter_map(|content| content.as_tool_request())
            .collect::<Vec<_>>();
        assert_eq!(requests.len(), 1);
        assert_eq!(requests[0].id, pending_tool_id);
        assert_eq!(
            requests[0].tool_call.as_ref().expect("tool call").name,
            "mcp__system__shell"
        );
        assert!(
            !output[0].as_concat_text().contains("<tool_use"),
            "分片 XML tool_use 不应作为正文透出"
        );
    }

    #[test]
    fn plaintext_tool_use_stream_normalizer_emits_prefix_before_buffering_tool_block() {
        let mut normalizer = PlaintextToolUseStreamNormalizer::default();
        let output = normalizer.process(
            Message::assistant().with_text("我先确认。\n<tool_use name=\"mcp__system__shell\">"),
        );

        assert_eq!(output.len(), 2);
        assert_eq!(output[0].as_concat_text(), "我先确认。");
        assert!(
            matches!(
                output[1].content.first(),
                Some(MessageContent::ToolInputDelta(_))
            ),
            "前缀输出后应立即补一个工具输入占位"
        );

        let output =
            normalizer.process(Message::assistant().with_text("{\"command\":\"pwd\"}</tool_use>"));
        assert_eq!(output.len(), 1);
        assert_eq!(
            output[0]
                .content
                .iter()
                .filter_map(|c| c.as_tool_request())
                .count(),
            1
        );
    }

    #[test]
    fn normalize_plaintext_tool_use_message_converts_inline_web_search_tag() {
        let message = Message::assistant().with_text(
            "我需要检索最新信息。\n<WebSearch query=\"2026年6月1日 国际新闻 今日 要闻\" />\n如果没有结果再说明。",
        );

        let normalized = normalize_plaintext_tool_use_message(message);
        let text = normalized.as_concat_text();
        let requests = normalized
            .content
            .iter()
            .filter_map(|content| content.as_tool_request())
            .collect::<Vec<_>>();

        assert_eq!(text, "我需要检索最新信息。");
        assert_eq!(requests.len(), 1);
        let tool_call = requests[0].tool_call.as_ref().expect("tool call");
        assert_eq!(tool_call.name.as_ref(), "WebSearch");
        assert_eq!(
            tool_call
                .arguments
                .as_ref()
                .and_then(|arguments| arguments.get("query"))
                .and_then(Value::as_str),
            Some("2026年6月1日 国际新闻 今日 要闻")
        );
        assert!(!normalized.as_concat_text().contains("<WebSearch"));
    }

    #[test]
    fn normalize_plaintext_tool_use_message_converts_search_alias_tag() {
        let message =
            Message::assistant().with_text("<Search query=\"today international news\" />");

        let normalized = normalize_plaintext_tool_use_message(message);
        let requests = normalized
            .content
            .iter()
            .filter_map(|content| content.as_tool_request())
            .collect::<Vec<_>>();

        assert_eq!(requests.len(), 1);
        let tool_call = requests[0].tool_call.as_ref().expect("tool call");
        assert_eq!(tool_call.name.as_ref(), "WebSearch");
        assert_eq!(
            tool_call
                .arguments
                .as_ref()
                .and_then(|arguments| arguments.get("query"))
                .and_then(Value::as_str),
            Some("today international news")
        );
    }

    #[test]
    fn normalize_current_surface_tool_arguments_accepts_reference_alias_params() {
        let mut read_call = CallToolRequestParam {
            name: "Read".into(),
            arguments: Some(object!({
                "file_path": "package.json",
                "head": "20"
            })),
        };

        normalize_current_surface_tool_arguments(&mut read_call);
        let read_args = read_call.arguments.expect("read args");
        assert_eq!(
            read_args.get("path").and_then(Value::as_str),
            Some("package.json")
        );
        assert_eq!(read_args.get("start_line").and_then(Value::as_i64), Some(1));
        assert_eq!(read_args.get("end_line").and_then(Value::as_i64), Some(20));

        let mut write_call = CallToolRequestParam {
            name: "Write".into(),
            arguments: Some(object!({
                "filePath": "notes.txt",
                "content": "ok"
            })),
        };

        normalize_current_surface_tool_arguments(&mut write_call);
        let write_args = write_call.arguments.expect("write args");
        assert_eq!(
            write_args.get("path").and_then(Value::as_str),
            Some("notes.txt")
        );

        let mut grep_call = CallToolRequestParam {
            name: "Grep".into(),
            arguments: Some(object!({
                "query": "normalize_shell_command_params",
                "path": "lime-rs"
            })),
        };

        normalize_current_surface_tool_arguments(&mut grep_call);
        let grep_args = grep_call.arguments.expect("grep args");
        assert_eq!(
            grep_args.get("pattern").and_then(Value::as_str),
            Some("normalize_shell_command_params")
        );
    }

    #[derive(Clone)]
    struct MockProvider {
        model_config: ModelConfig,
        observed_models: Option<std::sync::Arc<std::sync::Mutex<Vec<String>>>>,
    }

    #[async_trait]
    impl Provider for MockProvider {
        fn metadata() -> crate::providers::base::ProviderMetadata {
            crate::providers::base::ProviderMetadata::empty()
        }

        fn get_name(&self) -> &str {
            "mock"
        }

        fn get_model_config(&self) -> ModelConfig {
            self.model_config.clone()
        }

        async fn complete_with_model(
            &self,
            model_config: &ModelConfig,
            _system: &str,
            _messages: &[Message],
            _tools: &[Tool],
        ) -> anyhow::Result<(Message, ProviderUsage), ProviderError> {
            if let Some(observed_models) = &self.observed_models {
                observed_models
                    .lock()
                    .expect("record model override")
                    .push(model_config.model_name.clone());
            }
            Ok((
                Message::assistant().with_text("ok"),
                ProviderUsage::new(model_config.model_name.clone(), Usage::default()),
            ))
        }
    }

    #[derive(Clone)]
    struct RecordingProvider {
        model_config: ModelConfig,
        observed_messages: std::sync::Arc<std::sync::Mutex<Vec<Vec<Message>>>>,
    }

    #[async_trait]
    impl Provider for RecordingProvider {
        fn metadata() -> crate::providers::base::ProviderMetadata {
            crate::providers::base::ProviderMetadata::empty()
        }

        fn get_name(&self) -> &str {
            "recording"
        }

        fn get_model_config(&self) -> ModelConfig {
            self.model_config.clone()
        }

        async fn complete_with_model(
            &self,
            model_config: &ModelConfig,
            _system: &str,
            messages: &[Message],
            _tools: &[Tool],
        ) -> anyhow::Result<(Message, ProviderUsage), ProviderError> {
            self.observed_messages
                .lock()
                .expect("record provider messages")
                .push(messages.to_vec());
            Ok((
                Message::assistant().with_text("ok"),
                ProviderUsage::new(model_config.model_name.clone(), Usage::default()),
            ))
        }
    }

    struct PromptContextMockClient;

    #[async_trait]
    impl McpClientTrait for PromptContextMockClient {
        fn get_info(&self) -> Option<&InitializeResult> {
            None
        }

        async fn list_resources(
            &self,
            _next_cursor: Option<String>,
            _cancellation_token: CancellationToken,
        ) -> Result<ListResourcesResult, McpClientError> {
            Err(McpClientError::TransportClosed)
        }

        async fn read_resource(
            &self,
            _uri: &str,
            _cancellation_token: CancellationToken,
        ) -> Result<ReadResourceResult, McpClientError> {
            Err(McpClientError::TransportClosed)
        }

        async fn list_tools(
            &self,
            _next_cursor: Option<String>,
            _cancellation_token: CancellationToken,
        ) -> Result<ListToolsResult, McpClientError> {
            Ok(ListToolsResult {
                tools: vec![Tool::new(
                    "heavy_tool".to_string(),
                    "Heavy MCP tool that should stay out of compact provider payload".to_string(),
                    object!({ "type": "object", "properties": {} }),
                )],
                next_cursor: None,
                meta: None,
            })
        }

        async fn call_tool(
            &self,
            _name: &str,
            _arguments: Option<JsonObject>,
            _cancellation_token: CancellationToken,
        ) -> Result<CallToolResult, McpClientError> {
            Err(McpClientError::TransportClosed)
        }

        async fn list_prompts(
            &self,
            _next_cursor: Option<String>,
            _cancellation_token: CancellationToken,
        ) -> Result<ListPromptsResult, McpClientError> {
            Err(McpClientError::TransportClosed)
        }

        async fn get_prompt(
            &self,
            _name: &str,
            _arguments: Value,
            _cancellation_token: CancellationToken,
        ) -> Result<GetPromptResult, McpClientError> {
            Err(McpClientError::TransportClosed)
        }

        async fn subscribe(&self) -> mpsc::Receiver<ServerNotification> {
            let (_tx, rx) = mpsc::channel(1);
            rx
        }
    }

    fn prompt_context_server_info() -> ServerInfo {
        ServerInfo {
            protocol_version: ProtocolVersion::V_2025_03_26,
            capabilities: ServerCapabilities {
                resources: Some(ResourcesCapability::default()),
                ..Default::default()
            },
            server_info: Implementation {
                name: "latency-probe".to_string(),
                ..Default::default()
            },
            instructions: Some(MCP_CONTEXT_SENTINEL.to_string()),
        }
    }

    /// Mock scheduler for testing
    struct MockScheduler;

    #[async_trait]
    impl SchedulerTrait for MockScheduler {
        async fn add_scheduled_job(
            &self,
            _job: ScheduledJob,
            _copy_recipe: bool,
        ) -> Result<(), SchedulerError> {
            Ok(())
        }
        async fn schedule_recipe(
            &self,
            _recipe_path: PathBuf,
            _cron_schedule: Option<String>,
        ) -> anyhow::Result<(), SchedulerError> {
            Ok(())
        }
        async fn list_scheduled_jobs(&self) -> Vec<ScheduledJob> {
            vec![]
        }
        async fn remove_scheduled_job(
            &self,
            _id: &str,
            _remove_recipe: bool,
        ) -> Result<(), SchedulerError> {
            Ok(())
        }
        async fn pause_schedule(&self, _id: &str) -> Result<(), SchedulerError> {
            Ok(())
        }
        async fn unpause_schedule(&self, _id: &str) -> Result<(), SchedulerError> {
            Ok(())
        }
        async fn run_now(&self, _id: &str) -> Result<String, SchedulerError> {
            Ok("mock-session".to_string())
        }
        async fn sessions(
            &self,
            _sched_id: &str,
            _limit: usize,
        ) -> Result<Vec<(String, Session)>, SchedulerError> {
            Ok(vec![])
        }
        async fn update_schedule(
            &self,
            _sched_id: &str,
            _new_cron: String,
        ) -> Result<(), SchedulerError> {
            Ok(())
        }
        async fn kill_running_job(&self, _sched_id: &str) -> Result<(), SchedulerError> {
            Ok(())
        }
        async fn get_running_job_info(
            &self,
            _sched_id: &str,
        ) -> Result<Option<(String, DateTime<Utc>)>, SchedulerError> {
            Ok(None)
        }
    }

    #[tokio::test]
    async fn prepare_tools_sorts_and_includes_frontend_and_list_tools() -> anyhow::Result<()> {
        let agent = crate::agents::Agent::new();

        // 设置 mock scheduler 以便 current cron tools 可用
        agent
            .set_scheduler(std::sync::Arc::new(MockScheduler))
            .await;

        let session = SessionManager::create_session(
            std::path::PathBuf::default(),
            "test-prepare-tools".to_string(),
            SessionType::Hidden,
        )
        .await?;

        let model_config = ModelConfig::new("test-model").unwrap();
        let provider = std::sync::Arc::new(MockProvider {
            model_config,
            observed_models: None,
        });
        agent.update_provider(provider, &session.id).await?;

        // Add unsorted frontend tools
        let frontend_tools = vec![
            Tool::new(
                "frontend__z_tool".to_string(),
                "Z tool".to_string(),
                object!({ "type": "object", "properties": { } }),
            ),
            Tool::new(
                "frontend__a_tool".to_string(),
                "A tool".to_string(),
                object!({ "type": "object", "properties": { } }),
            ),
        ];

        agent
            .add_extension(crate::agents::extension::ExtensionConfig::Frontend {
                name: "frontend".to_string(),
                description: "desc".to_string(),
                tools: frontend_tools,
                instructions: None,
                bundled: None,
                available_tools: vec![],
                deferred_loading: false,
                always_expose_tools: vec![],
                allowed_caller: None,
            })
            .await
            .unwrap();

        let working_dir = std::env::current_dir()?;
        let (tools, _toolshim_tools, _system_prompt) = agent
            .prepare_tools_and_prompt(
                &working_dir,
                None,
                false,
                &ModelConfig::new("test-model").unwrap(),
            )
            .await?;

        // Ensure both current cron tools and frontend tools are present
        let names: Vec<String> = tools.iter().map(|t| t.name.clone().into_owned()).collect();
        assert!(names.iter().any(|n| n == "CronCreate"));
        assert!(names.iter().any(|n| n == "CronList"));
        assert!(names.iter().any(|n| n == "CronDelete"));
        assert!(names.iter().any(|n| n == "EnterWorktree"));
        assert!(names.iter().any(|n| n == "ExitWorktree"));
        assert!(names.iter().any(|n| n == "SendUserMessage"));
        assert!(!names.iter().any(|n| n == "platform__manage_schedule"));
        assert!(names.iter().any(|n| n == "frontend__a_tool"));
        assert!(names.iter().any(|n| n == "frontend__z_tool"));

        // Verify the names are sorted ascending
        let mut sorted = names.clone();
        sorted.sort();
        assert_eq!(names, sorted);

        Ok(())
    }

    #[tokio::test]
    async fn prepare_tools_and_prompt_includes_turn_output_instruction() -> anyhow::Result<()> {
        let agent = crate::agents::Agent::new();

        let session = SessionManager::create_session(
            std::path::PathBuf::default(),
            "test-prepare-tools-output-schema".to_string(),
            SessionType::Hidden,
        )
        .await?;

        let model_config = ModelConfig::new("test-model").unwrap();
        let provider = std::sync::Arc::new(MockProvider {
            model_config,
            observed_models: None,
        });
        agent.update_provider(provider, &session.id).await?;
        agent
            .add_final_output_tool(serde_json::json!({
                "type": "object",
                "properties": {
                    "answer": {"type": "string"}
                }
            }))
            .await?;

        let working_dir = std::env::current_dir()?;
        let (_tools, _toolshim_tools, system_prompt) = agent
            .prepare_tools_and_prompt(
                &working_dir,
                None,
                false,
                &ModelConfig::new("test-model").unwrap(),
            )
            .await?;

        assert!(system_prompt.contains("# Structured Output Instructions"));
        assert!(system_prompt.contains("StructuredOutput"));
        assert!(system_prompt.contains("\"answer\""));
        Ok(())
    }

    fn build_turn_context_with_tool_surface(mode: &str) -> TurnContextOverride {
        let mut runtime_metadata = serde_json::Map::new();
        runtime_metadata.insert(
            LIME_RUNTIME_TOOL_SURFACE_KEY.to_string(),
            Value::String(mode.to_string()),
        );

        let mut metadata = HashMap::new();
        metadata.insert(
            LIME_RUNTIME_METADATA_KEY.to_string(),
            Value::Object(runtime_metadata),
        );

        TurnContextOverride {
            metadata,
            ..TurnContextOverride::default()
        }
    }

    fn build_turn_context_with_tool_scope(
        allowed_tools: Vec<&str>,
        disallowed_tools: Vec<&str>,
    ) -> TurnContextOverride {
        let mut metadata = HashMap::new();
        metadata.insert(
            "subagent".to_string(),
            json!({
                "allowed_tools": allowed_tools,
                "disallowed_tools": disallowed_tools,
            }),
        );

        TurnContextOverride {
            metadata,
            ..TurnContextOverride::default()
        }
    }

    fn build_turn_context_with_image_input_policy(
        provider_supports_vision: bool,
    ) -> TurnContextOverride {
        let mut metadata = HashMap::new();
        metadata.insert(
            LIME_RUNTIME_METADATA_KEY.to_string(),
            json!({
                "image_input_policy": {
                    "submittedImageCount": 1,
                    "forwardedImageCount": if provider_supports_vision { 1 } else { 0 },
                    "droppedImageCount": if provider_supports_vision { 0 } else { 1 },
                    "providerSupportsVision": provider_supports_vision,
                }
            }),
        );

        TurnContextOverride {
            metadata,
            ..TurnContextOverride::default()
        }
    }

    #[test]
    fn model_config_supports_image_input_uses_canonical_modalities() {
        assert_eq!(
            model_config_supports_image_input(
                "openai",
                &ModelConfig::new("gpt-5.2").expect("model config"),
            ),
            Some(true)
        );
        assert_eq!(
            model_config_supports_image_input(
                "deepseek",
                &ModelConfig::new("deepseek-r1").expect("model config"),
            ),
            Some(false)
        );
        assert_eq!(
            model_config_supports_image_input(
                "unknown-provider",
                &ModelConfig::new("unknown-model").expect("model config"),
            ),
            None
        );
    }

    #[tokio::test]
    async fn prepare_tools_and_prompt_hides_all_tools_for_direct_answer_turn_surface(
    ) -> anyhow::Result<()> {
        let agent = crate::agents::Agent::new();

        let session = SessionManager::create_session(
            std::path::PathBuf::default(),
            "test-direct-answer-tool-surface".to_string(),
            SessionType::Hidden,
        )
        .await?;

        let model_config = ModelConfig::new("test-model").unwrap();
        let provider = std::sync::Arc::new(MockProvider {
            model_config,
            observed_models: None,
        });
        agent.update_provider(provider, &session.id).await?;

        let working_dir = std::env::current_dir()?;
        let (tools, _toolshim_tools, _system_prompt) = crate::session_context::with_turn_context(
            Some(build_turn_context_with_tool_surface(
                TURN_TOOL_SURFACE_DIRECT_ANSWER,
            )),
            async {
                agent
                    .prepare_tools_and_prompt(
                        &working_dir,
                        None,
                        false,
                        &ModelConfig::new("test-model").unwrap(),
                    )
                    .await
            },
        )
        .await?;

        assert!(tools.is_empty());
        Ok(())
    }

    #[tokio::test]
    async fn prepare_tools_and_prompt_keeps_only_local_workspace_tools_for_local_workspace_turn_surface(
    ) -> anyhow::Result<()> {
        let agent = crate::agents::Agent::new();
        agent
            .set_scheduler(std::sync::Arc::new(MockScheduler))
            .await;

        let session = SessionManager::create_session(
            std::path::PathBuf::default(),
            "test-local-workspace-tool-surface".to_string(),
            SessionType::Hidden,
        )
        .await?;

        let model_config = ModelConfig::new("test-model").unwrap();
        let provider = std::sync::Arc::new(MockProvider {
            model_config,
            observed_models: None,
        });
        agent.update_provider(provider, &session.id).await?;

        let working_dir = std::env::current_dir()?;
        let (tools, _toolshim_tools, _system_prompt) = crate::session_context::with_turn_context(
            Some(build_turn_context_with_tool_surface(
                TURN_TOOL_SURFACE_LOCAL_WORKSPACE,
            )),
            async {
                agent
                    .prepare_tools_and_prompt(
                        &working_dir,
                        None,
                        false,
                        &ModelConfig::new("test-model").unwrap(),
                    )
                    .await
            },
        )
        .await?;

        assert!(!tools.is_empty());
        assert!(tools.iter().all(|tool| is_local_workspace_tool(&tool.name)));
        Ok(())
    }

    #[tokio::test]
    async fn prepare_tools_and_prompt_keeps_only_compact_broker_tools_for_compact_turn_surface(
    ) -> anyhow::Result<()> {
        let agent = crate::agents::Agent::new();
        agent
            .set_scheduler(std::sync::Arc::new(MockScheduler))
            .await;

        let session = SessionManager::create_session(
            std::path::PathBuf::default(),
            "test-compact-tool-surface".to_string(),
            SessionType::User,
        )
        .await?;

        let model_config = ModelConfig::new("claude-sonnet-4-5").unwrap();
        let provider = std::sync::Arc::new(MockProvider {
            model_config,
            observed_models: None,
        });
        agent.update_provider(provider, &session.id).await?;

        let working_dir = std::env::current_dir()?;
        let (tools, _toolshim_tools, _system_prompt) = crate::session_context::with_turn_context(
            Some(build_turn_context_with_tool_surface(
                TURN_TOOL_SURFACE_COMPACT_TOOLS,
            )),
            async {
                agent
                    .prepare_tools_and_prompt(
                        &working_dir,
                        None,
                        false,
                        &ModelConfig::new("claude-sonnet-4-5").unwrap(),
                    )
                    .await
            },
        )
        .await?;

        let names: Vec<String> = tools.iter().map(|tool| tool.name.to_string()).collect();
        assert!(!names.is_empty());
        assert!(names.len() <= COMPACT_TOOL_SURFACE_TOOL_NAMES.len());
        assert!(names.iter().all(|name| is_compact_tool_surface_tool(name)));
        assert!(names.iter().any(|name| name == "ToolSearch"));
        assert!(names.iter().any(|name| name == "WebSearch"));
        assert!(names.iter().any(|name| name == "Read"));
        assert!(!names.iter().any(|name| name == "TeamCreate"));
        assert!(!names.iter().any(|name| name == "TeamDelete"));

        Ok(())
    }

    #[tokio::test]
    async fn compact_turn_surface_keeps_native_web_tools_when_code_execution_extension_exists(
    ) -> anyhow::Result<()> {
        let agent = crate::agents::Agent::new();
        agent
            .set_scheduler(std::sync::Arc::new(MockScheduler))
            .await;

        let session = SessionManager::create_session(
            std::path::PathBuf::default(),
            "test-compact-tool-surface-code-execution".to_string(),
            SessionType::User,
        )
        .await?;

        let model_config = ModelConfig::new("claude-sonnet-4-5").unwrap();
        let provider = std::sync::Arc::new(MockProvider {
            model_config,
            observed_models: None,
        });
        agent.update_provider(provider, &session.id).await?;
        agent
            .add_extension(crate::agents::extension::ExtensionConfig::Platform {
                name: CODE_EXECUTION_EXTENSION.to_string(),
                description: "Execute JavaScript code in a sandboxed environment".to_string(),
                bundled: Some(true),
                available_tools: vec![],
                deferred_loading: false,
                always_expose_tools: Vec::new(),
                allowed_caller: None,
            })
            .await?;

        let working_dir = std::env::current_dir()?;
        let (tools, _toolshim_tools, _system_prompt) = crate::session_context::with_turn_context(
            Some(build_turn_context_with_tool_surface(
                TURN_TOOL_SURFACE_COMPACT_TOOLS,
            )),
            async {
                agent
                    .prepare_tools_and_prompt(
                        &working_dir,
                        None,
                        false,
                        &ModelConfig::new("claude-sonnet-4-5").unwrap(),
                    )
                    .await
            },
        )
        .await?;

        let names: Vec<String> = tools.iter().map(|tool| tool.name.to_string()).collect();
        assert!(names.iter().any(|name| name == "WebSearch"));
        assert!(names.iter().any(|name| name == "WebFetch"));
        assert!(names.iter().all(|name| is_compact_tool_surface_tool(name)));

        Ok(())
    }

    #[tokio::test]
    async fn compact_turn_surface_preserves_extension_prompt_context() -> anyhow::Result<()> {
        let agent = crate::agents::Agent::new();
        agent
            .set_scheduler(std::sync::Arc::new(MockScheduler))
            .await;

        let session = SessionManager::create_session(
            std::path::PathBuf::default(),
            "test-compact-extension-prompt-context".to_string(),
            SessionType::User,
        )
        .await?;

        let model_config = ModelConfig::new("claude-sonnet-4-5").unwrap();
        let provider = std::sync::Arc::new(MockProvider {
            model_config,
            observed_models: None,
        });
        agent.update_provider(provider, &session.id).await?;

        let client: std::sync::Arc<Mutex<Box<dyn McpClientTrait>>> =
            std::sync::Arc::new(Mutex::new(Box::new(PromptContextMockClient)));
        agent
            .extension_manager
            .add_client(
                "mcp__latency_probe".to_string(),
                crate::agents::extension::ExtensionConfig::Builtin {
                    name: "mcp__latency_probe".to_string(),
                    display_name: Some("latency-probe".to_string()),
                    description: "Latency probe MCP".to_string(),
                    timeout: None,
                    bundled: Some(false),
                    available_tools: Vec::new(),
                    deferred_loading: false,
                    always_expose_tools: Vec::new(),
                    allowed_caller: None,
                },
                client,
                Some(prompt_context_server_info()),
                None,
            )
            .await;

        let working_dir = std::env::current_dir()?;
        let (tools, _toolshim_tools, system_prompt) = crate::session_context::with_turn_context(
            Some(build_turn_context_with_tool_surface(
                TURN_TOOL_SURFACE_COMPACT_TOOLS,
            )),
            async {
                agent
                    .prepare_tools_and_prompt(
                        &working_dir,
                        None,
                        false,
                        &ModelConfig::new("claude-sonnet-4-5").unwrap(),
                    )
                    .await
            },
        )
        .await?;

        let names: Vec<String> = tools.iter().map(|tool| tool.name.to_string()).collect();
        assert!(names.iter().all(|name| is_compact_tool_surface_tool(name)));
        assert!(names.iter().any(|name| name == "ListMcpResourcesTool"));
        assert!(names.iter().any(|name| name == "ReadMcpResourceTool"));
        assert!(!names
            .iter()
            .any(|name| name == "mcp__latency_probe__heavy_tool"));
        assert!(system_prompt.contains(MCP_CONTEXT_SENTINEL));
        assert!(system_prompt.contains("ListMcpResourcesTool"));
        assert!(!system_prompt.contains("【当前回合执行约束】"));

        Ok(())
    }

    #[tokio::test]
    async fn prepare_tools_and_prompt_filters_turn_scoped_allowed_tools() -> anyhow::Result<()> {
        let agent = crate::agents::Agent::new();

        let session = SessionManager::create_session(
            std::path::PathBuf::default(),
            "test-turn-scoped-allowed-tools".to_string(),
            SessionType::Hidden,
        )
        .await?;

        let model_config = ModelConfig::new("test-model").unwrap();
        let provider = std::sync::Arc::new(MockProvider {
            model_config,
            observed_models: None,
        });
        agent.update_provider(provider, &session.id).await?;

        let working_dir = std::env::current_dir()?;
        let (tools, _toolshim_tools, _system_prompt) = crate::session_context::with_turn_context(
            Some(build_turn_context_with_tool_scope(
                vec!["Read", "Grep"],
                Vec::new(),
            )),
            async {
                agent
                    .prepare_tools_and_prompt(
                        &working_dir,
                        None,
                        false,
                        &ModelConfig::new("test-model").unwrap(),
                    )
                    .await
            },
        )
        .await?;

        let names: Vec<String> = tools.iter().map(|tool| tool.name.to_string()).collect();
        assert_eq!(names, vec!["Grep".to_string(), "Read".to_string()]);

        Ok(())
    }

    #[tokio::test]
    async fn prepare_tools_and_prompt_applies_tool_scope_after_compact_surface(
    ) -> anyhow::Result<()> {
        let agent = crate::agents::Agent::new();

        let session = SessionManager::create_session(
            std::path::PathBuf::default(),
            "test-compact-tool-scope".to_string(),
            SessionType::Hidden,
        )
        .await?;

        let model_config = ModelConfig::new("claude-sonnet-4-5").unwrap();
        let provider = std::sync::Arc::new(MockProvider {
            model_config,
            observed_models: None,
        });
        agent.update_provider(provider, &session.id).await?;

        let mut turn_context =
            build_turn_context_with_tool_surface(TURN_TOOL_SURFACE_COMPACT_TOOLS);
        turn_context.metadata.insert(
            "subagent".to_string(),
            json!({
                "allowed_tools": ["Read", "Grep", "ListMcpResourcesTool"],
                "disallowed_tools": ["Grep"],
            }),
        );

        let working_dir = std::env::current_dir()?;
        let (tools, _toolshim_tools, _system_prompt) =
            crate::session_context::with_turn_context(Some(turn_context), async {
                agent
                    .prepare_tools_and_prompt(
                        &working_dir,
                        None,
                        false,
                        &ModelConfig::new("claude-sonnet-4-5").unwrap(),
                    )
                    .await
            })
            .await?;

        let names: Vec<String> = tools.iter().map(|tool| tool.name.to_string()).collect();
        assert_eq!(names, vec!["Read".to_string()]);

        Ok(())
    }

    #[tokio::test]
    async fn prepare_tools_and_prompt_extends_compact_surface_with_turn_scoped_allowed_tools(
    ) -> anyhow::Result<()> {
        let agent = crate::agents::Agent::new();

        let session = SessionManager::create_session(
            std::path::PathBuf::default(),
            "test-compact-tool-scope-extension".to_string(),
            SessionType::Hidden,
        )
        .await?;

        let model_config = ModelConfig::new("test-model").unwrap();
        let provider = std::sync::Arc::new(MockProvider {
            model_config,
            observed_models: None,
        });
        agent.update_provider(provider, &session.id).await?;

        let mut turn_context =
            build_turn_context_with_tool_surface(TURN_TOOL_SURFACE_COMPACT_TOOLS);
        turn_context.metadata.insert(
            "tool_scope".to_string(),
            json!({
                "allowed_tools": ["Bash", "NotebookEdit", VIEW_IMAGE_TOOL_NAME],
            }),
        );

        let working_dir = std::env::current_dir()?;
        let (tools, _toolshim_tools, _system_prompt) =
            crate::session_context::with_turn_context(Some(turn_context), async {
                agent
                    .prepare_tools_and_prompt(
                        &working_dir,
                        None,
                        false,
                        &ModelConfig::new("test-model").unwrap(),
                    )
                    .await
            })
            .await?;

        let names: Vec<String> = tools.iter().map(|tool| tool.name.to_string()).collect();
        assert_eq!(
            names,
            vec![
                "Bash".to_string(),
                "NotebookEdit".to_string(),
                VIEW_IMAGE_TOOL_NAME.to_string(),
            ]
        );

        Ok(())
    }

    #[tokio::test]
    async fn prepare_tools_and_prompt_filters_turn_scoped_disallowed_tools() -> anyhow::Result<()> {
        let agent = crate::agents::Agent::new();

        let session = SessionManager::create_session(
            std::path::PathBuf::default(),
            "test-turn-scoped-disallowed-tools".to_string(),
            SessionType::Hidden,
        )
        .await?;

        let model_config = ModelConfig::new("test-model").unwrap();
        let provider = std::sync::Arc::new(MockProvider {
            model_config,
            observed_models: None,
        });
        agent.update_provider(provider, &session.id).await?;

        let working_dir = std::env::current_dir()?;
        let (tools, _toolshim_tools, _system_prompt) = crate::session_context::with_turn_context(
            Some(build_turn_context_with_tool_scope(
                Vec::new(),
                vec!["Read", "Grep"],
            )),
            async {
                agent
                    .prepare_tools_and_prompt(
                        &working_dir,
                        None,
                        false,
                        &ModelConfig::new("test-model").unwrap(),
                    )
                    .await
            },
        )
        .await?;

        let names: Vec<String> = tools.iter().map(|tool| tool.name.to_string()).collect();
        assert!(!names.iter().any(|name| name == "Read"));
        assert!(!names.iter().any(|name| name == "Grep"));

        Ok(())
    }

    #[tokio::test]
    async fn stream_response_from_provider_uses_explicit_model_config() -> anyhow::Result<()> {
        let observed_models = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let provider = std::sync::Arc::new(MockProvider {
            model_config: ModelConfig::new("default-model").unwrap(),
            observed_models: Some(observed_models.clone()),
        });
        let override_model_config = ModelConfig::new("override-model").unwrap();
        let messages = vec![Message::user().with_text("hello")];

        let mut stream = Agent::stream_response_from_provider(
            provider,
            &override_model_config,
            "",
            &messages,
            &[],
            &[],
        )
        .await?;

        let first = stream.next().await.expect("stream item should exist")?;
        let usage = first.1.expect("usage should exist");
        assert_eq!(usage.model, "override-model");
        assert_eq!(
            observed_models
                .lock()
                .expect("read observed model")
                .as_slice(),
            ["override-model"]
        );
        Ok(())
    }

    #[tokio::test]
    async fn stream_response_from_provider_strips_images_when_turn_policy_disables_vision(
    ) -> anyhow::Result<()> {
        let observed_messages = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let provider = std::sync::Arc::new(RecordingProvider {
            model_config: ModelConfig::new("deepseek-reasoner").unwrap(),
            observed_messages: observed_messages.clone(),
        });
        let messages = vec![
            Message::user()
                .with_text("请分析截图")
                .with_image("aGVsbG8=", "image/png"),
            Message::user().with_tool_response(
                "tool-image",
                Ok(CallToolResult {
                    content: vec![
                        Content::text("Viewed image: sample.png"),
                        Content::image("aGVsbG8=", "image/png"),
                    ],
                    structured_content: None,
                    is_error: Some(false),
                    meta: None,
                }),
            ),
            Message::assistant().with_text("上一轮回复"),
        ];

        let mut stream = crate::session_context::with_turn_context(
            Some(build_turn_context_with_image_input_policy(false)),
            async {
                Agent::stream_response_from_provider(
                    provider,
                    &ModelConfig::new("deepseek-reasoner").unwrap(),
                    "",
                    &messages,
                    &[],
                    &[],
                )
                .await
            },
        )
        .await?;
        let _ = stream.next().await.expect("stream item should exist")?;

        let observed = observed_messages
            .lock()
            .expect("read observed messages")
            .clone();
        assert_eq!(observed.len(), 1);
        assert!(observed[0].iter().all(|message| {
            message
                .content
                .iter()
                .all(|content| !matches!(content, MessageContent::Image(_)))
        }));
        assert!(observed[0][0]
            .as_concat_text()
            .contains("当前模型不支持图片输入"));
        let tool_response = observed[0]
            .iter()
            .flat_map(|message| message.content.iter())
            .find_map(|content| match content {
                MessageContent::ToolResponse(response) => Some(response),
                _ => None,
            })
            .expect("tool response should stay in history");
        let result = tool_response
            .tool_result
            .as_ref()
            .expect("tool response result should stay successful");
        assert!(result
            .content
            .iter()
            .all(|content| content.as_image().is_none()));
        assert!(result.content.iter().any(|content| {
            content
                .as_text()
                .is_some_and(|text| text.text.contains("工具结果包含 1 张图片"))
        }));

        Ok(())
    }

    #[derive(Clone)]
    struct MockStreamingErrorProvider {
        model_config: ModelConfig,
    }

    #[async_trait]
    impl Provider for MockStreamingErrorProvider {
        fn metadata() -> crate::providers::base::ProviderMetadata {
            crate::providers::base::ProviderMetadata::empty()
        }

        fn get_name(&self) -> &str {
            "mock-streaming-error"
        }

        fn get_model_config(&self) -> ModelConfig {
            self.model_config.clone()
        }

        fn supports_streaming(&self) -> bool {
            true
        }

        async fn complete_with_model(
            &self,
            _model_config: &ModelConfig,
            _system: &str,
            _messages: &[Message],
            _tools: &[Tool],
        ) -> anyhow::Result<(Message, ProviderUsage), ProviderError> {
            unreachable!("streaming path should be used in this test");
        }

        async fn stream(
            &self,
            _system: &str,
            _messages: &[Message],
            _tools: &[Tool],
        ) -> anyhow::Result<MessageStream, ProviderError> {
            let usage = ProviderUsage::new(self.model_config.model_name.clone(), Usage::default());
            Ok(Box::pin(futures::stream::iter(vec![
                Ok((Some(Message::assistant().with_text("partial")), Some(usage))),
                Err(ProviderError::RequestFailed("stream exploded".to_string())),
            ])))
        }
    }

    #[tokio::test]
    async fn stream_response_from_provider_propagates_stream_errors() -> anyhow::Result<()> {
        let provider = std::sync::Arc::new(MockStreamingErrorProvider {
            model_config: ModelConfig::new("test-model").unwrap(),
        });
        let messages = vec![Message::user().with_text("hello")];

        let mut stream = Agent::stream_response_from_provider(
            provider,
            &ModelConfig::new("test-model").unwrap(),
            "",
            &messages,
            &[],
            &[],
        )
        .await?;

        let first = stream
            .next()
            .await
            .expect("first stream item should exist")?;
        assert_eq!(
            first.0.expect("message should exist").as_concat_text(),
            "partial"
        );

        let error = stream
            .next()
            .await
            .expect("second stream item should exist")
            .expect_err("stream error should be propagated");
        assert_eq!(
            error,
            ProviderError::RequestFailed("stream exploded".to_string())
        );
        Ok(())
    }

    fn bash_tool() -> Tool {
        Tool::new(
            "Bash",
            "Bash test tool",
            object!({
                "type": "object",
                "properties": {
                    "command": { "type": "string" },
                    "timeout": { "type": "integer" }
                },
                "required": ["command"]
            }),
        )
    }

    fn read_tool() -> Tool {
        Tool::new(
            "Read",
            "Read test tool",
            object!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "start_line": { "type": "integer" }
                },
                "required": ["path"]
            }),
        )
    }

    fn web_search_tool() -> Tool {
        Tool::new(
            "WebSearch",
            "WebSearch test tool",
            object!({
                "type": "object",
                "properties": {
                    "query": { "type": "string" },
                    "allowed_domains": {
                        "type": "array",
                        "items": { "type": "string" }
                    }
                },
                "required": ["query"]
            }),
        )
    }

    struct AliasMatrixRegistryTool {
        name: String,
    }

    #[async_trait]
    impl crate::tools::Tool for AliasMatrixRegistryTool {
        fn name(&self) -> &str {
            &self.name
        }

        fn description(&self) -> &str {
            "alias matrix registry tool"
        }

        fn input_schema(&self) -> Value {
            json!({
                "type": "object",
                "properties": {}
            })
        }

        async fn execute(
            &self,
            _params: Value,
            _context: &crate::tools::ToolContext,
        ) -> std::result::Result<crate::tools::ToolResult, crate::tools::ToolError> {
            Ok(crate::tools::ToolResult::success(format!(
                "executed:{}",
                self.name
            )))
        }
    }

    async fn register_alias_matrix_tools(agent: &Agent) {
        let mut registry = agent.tool_registry().write().await;
        for (canonical, _) in crate::tools::registry::DEFAULT_NATIVE_ALIAS_PAIRS {
            registry.register(Box::new(AliasMatrixRegistryTool {
                name: canonical.to_string(),
            }));
        }
    }

    fn alias_matrix_surface_tools() -> Vec<Tool> {
        crate::tools::registry::DEFAULT_NATIVE_ALIAS_PAIRS
            .iter()
            .map(|(canonical, _)| {
                Tool::new(
                    *canonical,
                    format!("{canonical} visible test tool"),
                    object!({
                        "type": "object",
                        "properties": {}
                    }),
                )
            })
            .collect()
    }

    fn call_tool_request(
        id: &str,
        name: &str,
        arguments: Option<serde_json::Map<String, Value>>,
    ) -> ToolRequest {
        ToolRequest {
            id: id.to_string(),
            tool_call: Ok(rmcp::model::CallToolRequestParam {
                name: name.to_string().into(),
                arguments,
            }),
            metadata: None,
            tool_meta: None,
        }
    }

    fn tool_call(request: &ToolRequest) -> &rmcp::model::CallToolRequestParam {
        request
            .tool_call
            .as_ref()
            .expect("tool request should contain a successful tool call")
    }

    fn message_tool_requests(message: &Message) -> Vec<&ToolRequest> {
        message
            .content
            .iter()
            .filter_map(|content| match content {
                MessageContent::ToolRequest(request) => Some(request),
                _ => None,
            })
            .collect()
    }

    fn message_tool_request_names(message: &Message) -> Vec<String> {
        message_tool_requests(message)
            .iter()
            .map(|request| tool_call(request).name.to_string())
            .collect()
    }

    fn assert_tool_call_summary(
        request: &ToolRequest,
        expected_id: &str,
        expected_name: &str,
        expected_arguments: Value,
    ) {
        assert_eq!(request.id, expected_id);
        let tool_call = tool_call(request);
        assert_eq!(tool_call.name.as_ref(), expected_name);
        assert_eq!(
            Value::Object(tool_call.arguments.clone().unwrap_or_default()),
            expected_arguments,
        );
    }

    #[tokio::test]
    async fn categorize_tool_requests_normalizes_native_aliases_before_dispatch() {
        let agent = crate::agents::Agent::new();
        let response = Message::assistant()
            .with_content(MessageContent::ToolRequest(call_tool_request(
                "shell-alias-call",
                "BashTool",
                Some(object!({
                    "command": "pwd",
                    "timeout": "60"
                })),
            )))
            .with_content(MessageContent::ToolRequest(call_tool_request(
                "read-alias-call",
                "FileReadTool",
                Some(object!({
                    "path": "src/main.rs",
                    "start_line": "3"
                })),
            )))
            .with_content(MessageContent::ToolRequest(call_tool_request(
                "search-alias-call",
                "WebSearchTool",
                Some(object!({
                    "query": "OpenAI GPT-5",
                    "allowed_domains": ["openai.com"]
                })),
            )))
            .with_content(MessageContent::ToolRequest(call_tool_request(
                "namespaced-shell-call",
                "functions.Bash",
                Some(object!({
                    "command": "pwd"
                })),
            )));
        let tools = vec![bash_tool(), read_tool(), web_search_tool()];

        let (frontend_requests, other_requests, filtered_message, normalized_response) =
            agent.categorize_tool_requests(&response, &tools).await;

        assert!(frontend_requests.is_empty());
        assert_eq!(other_requests.len(), 4);
        assert_tool_call_summary(
            &other_requests[0],
            "shell-alias-call",
            "Bash",
            json!({
                "command": "pwd",
                "timeout": 60
            }),
        );
        assert_tool_call_summary(
            &other_requests[1],
            "read-alias-call",
            "Read",
            json!({
                "path": "src/main.rs",
                "start_line": 3
            }),
        );
        assert_tool_call_summary(
            &other_requests[2],
            "search-alias-call",
            "WebSearch",
            json!({
                "query": "OpenAI GPT-5",
                "allowed_domains": ["openai.com"]
            }),
        );
        assert_tool_call_summary(
            &other_requests[3],
            "namespaced-shell-call",
            "Bash",
            json!({
                "command": "pwd"
            }),
        );
        let expected_names = vec![
            "Bash".to_string(),
            "Read".to_string(),
            "WebSearch".to_string(),
            "Bash".to_string(),
        ];
        assert_eq!(
            message_tool_request_names(&filtered_message),
            expected_names
        );
        assert_eq!(
            message_tool_request_names(&normalized_response),
            expected_names
        );
    }

    #[tokio::test]
    async fn categorize_tool_requests_normalizes_all_default_native_aliases_before_dispatch() {
        let agent = crate::agents::Agent::new();
        register_alias_matrix_tools(&agent).await;

        let mut response = Message::assistant();
        let mut expected_names = Vec::new();
        let mut request_count = 0usize;
        for (canonical, aliases) in crate::tools::registry::DEFAULT_NATIVE_ALIAS_PAIRS {
            for alias in *aliases {
                response = response.with_content(MessageContent::ToolRequest(call_tool_request(
                    &format!("alias-call-{request_count}"),
                    alias,
                    Some(object!({})),
                )));
                expected_names.push(canonical.to_string());
                request_count += 1;
            }
        }
        let tools = alias_matrix_surface_tools();

        let (frontend_requests, other_requests, filtered_message, normalized_response) =
            agent.categorize_tool_requests(&response, &tools).await;

        assert!(frontend_requests.is_empty());
        assert_eq!(
            other_requests.len(),
            request_count,
            "every default alias should stay dispatchable through the current visible surface"
        );
        assert_eq!(
            other_requests
                .iter()
                .map(|request| tool_call(request).name.to_string())
                .collect::<Vec<_>>(),
            expected_names
        );
        assert_eq!(
            message_tool_request_names(&filtered_message),
            expected_names
        );
        assert_eq!(
            message_tool_request_names(&normalized_response),
            expected_names
        );
    }

    #[tokio::test]
    async fn categorize_tool_requests_keeps_exact_current_surface_name_before_alias_lookup() {
        let agent = crate::agents::Agent::new();
        let response = Message::assistant().with_content(MessageContent::ToolRequest(
            call_tool_request("exact-call", "PowerShellTool", Some(object!({}))),
        ));
        let tools = vec![Tool::new(
            "PowerShellTool",
            "Visible MCP-style tool",
            object!({ "type": "object", "properties": {} }),
        )];

        let (frontend_requests, other_requests, filtered_message, normalized_response) =
            agent.categorize_tool_requests(&response, &tools).await;

        assert!(frontend_requests.is_empty());
        assert_eq!(other_requests.len(), 1);
        assert_tool_call_summary(
            &other_requests[0],
            "exact-call",
            "PowerShellTool",
            json!({}),
        );
        let expected_names = vec!["PowerShellTool".to_string()];
        assert_eq!(
            message_tool_request_names(&filtered_message),
            expected_names
        );
        assert_eq!(
            message_tool_request_names(&normalized_response),
            expected_names
        );
    }

    #[tokio::test]
    async fn categorize_tool_requests_keeps_unknown_tool_names_unknown() {
        let agent = crate::agents::Agent::new();
        let response =
            Message::assistant().with_content(MessageContent::ToolRequest(call_tool_request(
                "unknown-call",
                "web search news",
                Some(object!({ "q": "news" })),
            )));
        let tools = vec![bash_tool()];

        let (frontend_requests, other_requests, filtered_message, normalized_response) =
            agent.categorize_tool_requests(&response, &tools).await;

        assert!(frontend_requests.is_empty());
        assert_eq!(other_requests.len(), 1);
        assert_tool_call_summary(
            &other_requests[0],
            "unknown-call",
            "web search news",
            json!({ "q": "news" }),
        );
        assert_eq!(
            message_tool_request_names(&filtered_message),
            vec!["web search news".to_string()],
        );
        assert_eq!(
            message_tool_request_names(&normalized_response),
            vec!["web search news".to_string()],
        );
    }

    #[tokio::test]
    async fn categorize_tool_requests_does_not_enable_hidden_native_aliases() {
        let agent = crate::agents::Agent::new();
        let response = Message::assistant()
            .with_content(MessageContent::ToolRequest(call_tool_request(
                "bash-alias-call",
                "BashTool",
                Some(object!({ "command": "pwd" })),
            )))
            .with_content(MessageContent::ToolRequest(call_tool_request(
                "bash-namespace-call",
                "functions.Bash",
                Some(object!({ "command": "pwd" })),
            )));
        let tools = vec![web_search_tool()];

        let (frontend_requests, other_requests, filtered_message, normalized_response) =
            agent.categorize_tool_requests(&response, &tools).await;

        assert!(frontend_requests.is_empty());
        assert_eq!(other_requests.len(), 2);
        assert_tool_call_summary(
            &other_requests[0],
            "bash-alias-call",
            "BashTool",
            json!({ "command": "pwd" }),
        );
        assert_tool_call_summary(
            &other_requests[1],
            "bash-namespace-call",
            "functions.Bash",
            json!({ "command": "pwd" }),
        );
        assert_eq!(
            message_tool_request_names(&filtered_message),
            vec!["BashTool".to_string(), "functions.Bash".to_string()],
        );
        assert_eq!(
            message_tool_request_names(&normalized_response),
            vec!["BashTool".to_string(), "functions.Bash".to_string()],
        );
    }

    #[tokio::test]
    async fn categorize_tool_requests_does_not_enable_hidden_default_native_aliases() {
        let agent = crate::agents::Agent::new();
        register_alias_matrix_tools(&agent).await;

        let mut response = Message::assistant();
        let mut expected_alias_names = Vec::new();
        let mut request_count = 0usize;
        for (_, aliases) in crate::tools::registry::DEFAULT_NATIVE_ALIAS_PAIRS {
            for alias in *aliases {
                response = response.with_content(MessageContent::ToolRequest(call_tool_request(
                    &format!("hidden-alias-call-{request_count}"),
                    alias,
                    Some(object!({})),
                )));
                expected_alias_names.push(alias.to_string());
                request_count += 1;
            }
        }
        let tools = vec![Tool::new(
            "VisibleOnly",
            "Only this non-native tool is visible",
            object!({ "type": "object", "properties": {} }),
        )];

        let (frontend_requests, other_requests, filtered_message, normalized_response) =
            agent.categorize_tool_requests(&response, &tools).await;

        assert!(frontend_requests.is_empty());
        assert_eq!(other_requests.len(), request_count);
        assert_eq!(
            message_tool_request_names(&filtered_message),
            expected_alias_names
        );
        assert_eq!(
            message_tool_request_names(&normalized_response),
            expected_alias_names
        );
    }

    #[tokio::test]
    async fn categorize_tool_requests_does_not_infer_empty_tool_names_from_arguments() {
        let agent = crate::agents::Agent::new();
        let response = Message::assistant().with_content(MessageContent::ToolRequest(
            call_tool_request("empty-name-call", "", Some(object!({ "command": "pwd" }))),
        ));
        let tools = vec![bash_tool()];

        let (frontend_requests, other_requests, filtered_message, normalized_response) =
            agent.categorize_tool_requests(&response, &tools).await;

        assert!(frontend_requests.is_empty());
        assert_eq!(other_requests.len(), 1);
        assert_tool_call_summary(
            &other_requests[0],
            "empty-name-call",
            "",
            json!({ "command": "pwd" }),
        );
        assert_eq!(
            message_tool_request_names(&filtered_message),
            vec!["".to_string()],
        );
        assert_eq!(
            message_tool_request_names(&normalized_response),
            vec!["".to_string()],
        );
    }

    #[test]
    fn normalize_response_tool_requests_keeps_thinking_and_original_request_order() {
        let response = Message::assistant()
            .with_thinking("先分析问题。", "")
            .with_text("准备并行调用两个工具。")
            .with_tool_request(
                "tool-1",
                Ok(rmcp::model::CallToolRequestParam {
                    name: "developer__shell".into(),
                    arguments: Some(object!({"command": "ls"})),
                }),
            )
            .with_tool_request(
                "tool-2",
                Ok(rmcp::model::CallToolRequestParam {
                    name: "developer__read".into(),
                    arguments: Some(object!({"path": "Cargo.toml"})),
                }),
            );

        let normalized = normalize_response_tool_requests(
            &response,
            &[
                ToolRequest {
                    id: "tool-1".to_string(),
                    tool_call: Ok(rmcp::model::CallToolRequestParam {
                        name: "developer__shell".into(),
                        arguments: Some(object!({"command": "ls"})),
                    }),
                    metadata: Some(serde_json::Map::from_iter([(
                        "source".to_string(),
                        Value::String("normalized-1".to_string()),
                    )])),
                    tool_meta: Some(json!({"title": "Shell"})),
                },
                ToolRequest {
                    id: "tool-2".to_string(),
                    tool_call: Ok(rmcp::model::CallToolRequestParam {
                        name: "developer__read".into(),
                        arguments: Some(object!({"path": "Cargo.toml"})),
                    }),
                    metadata: Some(serde_json::Map::from_iter([(
                        "source".to_string(),
                        Value::String("normalized-2".to_string()),
                    )])),
                    tool_meta: Some(json!({"title": "Read"})),
                },
            ],
        );

        assert_eq!(normalized.content.len(), 4);
        assert!(matches!(normalized.content[0], MessageContent::Thinking(_)));
        assert!(matches!(normalized.content[1], MessageContent::Text(_)));

        let MessageContent::ToolRequest(first_request) = &normalized.content[2] else {
            panic!("third content should be the first normalized tool request");
        };
        let MessageContent::ToolRequest(second_request) = &normalized.content[3] else {
            panic!("fourth content should be the second normalized tool request");
        };

        assert_eq!(
            first_request
                .metadata
                .as_ref()
                .and_then(|value| value.get("source"))
                .and_then(|value| value.as_str()),
            Some("normalized-1"),
        );
        assert_eq!(
            second_request
                .metadata
                .as_ref()
                .and_then(|value| value.get("source"))
                .and_then(|value| value.as_str()),
            Some("normalized-2"),
        );
        assert_eq!(
            first_request
                .tool_meta
                .as_ref()
                .and_then(|value| value.get("title"))
                .and_then(|value| value.as_str()),
            Some("Shell"),
        );
        assert_eq!(
            second_request
                .tool_meta
                .as_ref()
                .and_then(|value| value.get("title"))
                .and_then(|value| value.as_str()),
            Some("Read"),
        );
    }
}
