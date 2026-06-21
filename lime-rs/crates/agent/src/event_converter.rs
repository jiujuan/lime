//! Aster 事件转换器
//!
//! 将 Aster AgentEvent 转换为 Tauri 可用的事件格式
//! 用于前端实时显示流式响应

use aster::agents::AgentEvent;
use aster::conversation::message::{
    ActionRequiredData, ActionRequiredScope, Message, MessageContent,
};
use aster::session::{
    ItemRuntime, ItemRuntimePayload, ItemStatus, TurnContextOverride, TurnRuntime, TurnStatus,
};
use lime_core::database::dao::agent_timeline::{
    AgentRequestOption, AgentRequestQuestion, AgentThreadItem, AgentThreadItemPayload,
    AgentThreadTurn,
};
use regex::Regex;

pub use crate::protocol::{
    AgentActionRequiredScope as TauriActionRequiredScope,
    AgentArtifactSignal as TauriArtifactSnapshot, AgentContextBudget as TauriContextBudget,
    AgentContextTraceStep as TauriContextTraceStep, AgentEvent as TauriAgentEvent,
    AgentMessage as TauriMessage, AgentMessageContent as TauriMessageContent,
    AgentMissingContextFact as TauriMissingContextFact, AgentRetrievalRef as TauriRetrievalRef,
    AgentRuntimeStatus as TauriRuntimeStatus, AgentTeamMemoryRef as TauriTeamMemoryRef,
    AgentTokenUsage as TauriTokenUsage, AgentToolImage as TauriToolImage,
    AgentToolProgressPayload as TauriToolProgressPayload, AgentToolResult as TauriToolResult,
    AgentTurnContextSummary as TauriTurnContextSummary,
};
use crate::text_normalization::{
    normalize_legacy_runtime_status_title, normalize_legacy_turn_summary_text,
};
use crate::tool_io_offload::{maybe_offload_tool_arguments, maybe_offload_tool_result_payload};
use rmcp::model::ServerNotification;
use std::collections::HashMap;

const JSON_RECURSION_LIMIT: usize = 50;
const JSON_TRAVERSAL_NODE_LIMIT: usize = 4_096;
const TOOL_RESULT_MAX_TEXT_PARTS: usize = 256;
const TOOL_RESULT_MAX_OUTPUT_CHARS: usize = 4_000;
const TOOL_RESULT_MAX_IMAGES: usize = 12;
const TOOL_RESULT_TRUNCATED_NOTICE: &str = "\n\n[event_converter] 工具输出已截断";
const TOOL_NOTIFICATION_MAX_DELTA_CHARS: usize = 1_200;
const TOOL_RESULT_DIAG_WARN_JSON_BYTES: usize = 64 * 1024;
const TOOL_RESULT_DIAG_WARN_OUTPUT_CHARS: usize = 4_000;
const TOOL_RESULT_DIAG_WARN_IMAGE_COUNT: usize = 4;
const ASK_USER_QUESTIONS_SCHEMA_KEY: &str = "x-lime-ask-user-questions";

fn enhance_execution_error_text(raw: &str) -> String {
    if !raw.contains("Execution error: No such file or directory (os error 2)") {
        return raw.to_string();
    }

    if raw.contains("排查建议：") {
        return raw.to_string();
    }

    format!(
        "{raw}\n\n排查建议：\n1) 检查工作区目录是否仍然存在（目录被移动/删除会触发该错误）。\n2) 若使用本地 CLI Provider，请确认对应命令已安装且在 PATH 中。\n3) 重启应用后重试；若仍失败，请复制该错误并附上系统信息。"
    )
}

fn dedupe_preserve_order(items: Vec<String>) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    let mut deduped = Vec::new();
    for item in items {
        if seen.insert(item.clone()) {
            deduped.push(item);
        }
    }
    deduped
}

#[derive(Debug, Default)]
struct TextCollectState {
    collected_chars: usize,
    truncated: bool,
}

fn truncate_chars(text: &str, max_chars: usize) -> (String, bool) {
    if max_chars == 0 {
        return (String::new(), !text.is_empty());
    }

    let mut char_count = 0usize;
    for (idx, _) in text.char_indices() {
        if char_count == max_chars {
            return (text[..idx].to_string(), true);
        }
        char_count += 1;
    }

    (text.to_string(), false)
}

fn truncate_notification_text(text: impl Into<String>) -> String {
    let text = text.into();
    let (mut limited, truncated) = truncate_chars(&text, TOOL_NOTIFICATION_MAX_DELTA_CHARS);
    if truncated {
        limited.push_str("\n\n[event_converter] 工具流式通知已截断");
    }
    limited
}

fn metadata_with_kind(kind: &str) -> HashMap<String, serde_json::Value> {
    let mut metadata = HashMap::new();
    metadata.insert(
        "notification_kind".to_string(),
        serde_json::Value::String(kind.to_string()),
    );
    metadata
}

fn value_to_notification_text(value: &serde_json::Value) -> String {
    if let Some(text) = value.as_str() {
        return truncate_notification_text(text);
    }

    truncate_notification_text(serde_json::to_string(value).unwrap_or_else(|_| value.to_string()))
}

fn maybe_text_from_custom_notification_params(
    params: Option<&serde_json::Value>,
) -> Option<String> {
    let params = params?;
    if let Some(text) = params.as_str() {
        return Some(truncate_notification_text(text));
    }

    let object = params.as_object()?;
    for key in ["delta", "text", "message", "output"] {
        if let Some(value) = object.get(key).and_then(serde_json::Value::as_str) {
            let text = value.trim();
            if !text.is_empty() {
                return Some(truncate_notification_text(text));
            }
        }
    }

    None
}

fn convert_mcp_notification(
    tool_id: String,
    notification: ServerNotification,
) -> Vec<TauriAgentEvent> {
    match notification {
        ServerNotification::ProgressNotification(notification) => {
            let mut metadata = metadata_with_kind("mcp_progress");
            metadata.insert(
                "progress_token".to_string(),
                serde_json::to_value(&notification.params.progress_token)
                    .unwrap_or(serde_json::Value::Null),
            );

            vec![TauriAgentEvent::ToolProgress {
                tool_id,
                progress: TauriToolProgressPayload {
                    message: notification.params.message.map(truncate_notification_text),
                    progress: Some(notification.params.progress),
                    total: notification.params.total,
                    metadata: Some(metadata),
                },
            }]
        }
        ServerNotification::LoggingMessageNotification(notification) => {
            let mut metadata = metadata_with_kind("mcp_log");
            metadata.insert(
                "level".to_string(),
                serde_json::to_value(notification.params.level).unwrap_or_else(|_| {
                    serde_json::Value::String(format!("{:?}", notification.params.level))
                }),
            );
            if let Some(logger) = notification.params.logger {
                metadata.insert("logger".to_string(), serde_json::Value::String(logger));
            }

            vec![TauriAgentEvent::ToolOutputDelta {
                tool_id,
                delta: value_to_notification_text(&notification.params.data),
                output_kind: Some("log".to_string()),
                metadata: Some(metadata),
            }]
        }
        ServerNotification::CancelledNotification(notification) => {
            let mut metadata = metadata_with_kind("mcp_cancelled");
            metadata.insert(
                "request_id".to_string(),
                serde_json::to_value(&notification.params.request_id)
                    .unwrap_or(serde_json::Value::Null),
            );
            vec![TauriAgentEvent::ToolProgress {
                tool_id,
                progress: TauriToolProgressPayload {
                    message: notification
                        .params
                        .reason
                        .map(truncate_notification_text)
                        .or_else(|| Some("工具请求已取消".to_string())),
                    progress: None,
                    total: None,
                    metadata: Some(metadata),
                },
            }]
        }
        ServerNotification::ResourceUpdatedNotification(notification) => {
            let mut metadata = metadata_with_kind("mcp_resource_updated");
            metadata.insert(
                "uri".to_string(),
                serde_json::Value::String(notification.params.uri.clone()),
            );
            vec![TauriAgentEvent::ToolProgress {
                tool_id,
                progress: TauriToolProgressPayload {
                    message: Some(truncate_notification_text(format!(
                        "资源已更新：{}",
                        notification.params.uri
                    ))),
                    progress: None,
                    total: None,
                    metadata: Some(metadata),
                },
            }]
        }
        ServerNotification::ResourceListChangedNotification(_) => {
            vec![TauriAgentEvent::ToolProgress {
                tool_id,
                progress: TauriToolProgressPayload {
                    message: Some("工具服务资源列表已更新".to_string()),
                    progress: None,
                    total: None,
                    metadata: Some(metadata_with_kind("mcp_resources_changed")),
                },
            }]
        }
        ServerNotification::ToolListChangedNotification(_) => {
            vec![TauriAgentEvent::ToolProgress {
                tool_id,
                progress: TauriToolProgressPayload {
                    message: Some("工具服务能力列表已更新".to_string()),
                    progress: None,
                    total: None,
                    metadata: Some(metadata_with_kind("mcp_tools_changed")),
                },
            }]
        }
        ServerNotification::PromptListChangedNotification(_) => {
            vec![TauriAgentEvent::ToolProgress {
                tool_id,
                progress: TauriToolProgressPayload {
                    message: Some("工具服务提示词列表已更新".to_string()),
                    progress: None,
                    total: None,
                    metadata: Some(metadata_with_kind("mcp_prompts_changed")),
                },
            }]
        }
        ServerNotification::CustomNotification(notification) => {
            let mut metadata = metadata_with_kind("mcp_custom");
            metadata.insert(
                "method".to_string(),
                serde_json::Value::String(notification.method.clone()),
            );
            if let Some(delta) =
                maybe_text_from_custom_notification_params(notification.params.as_ref())
            {
                return vec![TauriAgentEvent::ToolOutputDelta {
                    tool_id,
                    delta,
                    output_kind: Some("custom".to_string()),
                    metadata: Some(metadata),
                }];
            }

            vec![TauriAgentEvent::ToolProgress {
                tool_id,
                progress: TauriToolProgressPayload {
                    message: Some(truncate_notification_text(format!(
                        "收到工具通知：{}",
                        notification.method
                    ))),
                    progress: None,
                    total: None,
                    metadata: Some(metadata),
                },
            }]
        }
    }
}

fn push_non_empty_limited(
    target: &mut Vec<String>,
    value: Option<&str>,
    state: &mut TextCollectState,
) {
    let Some(raw) = value else {
        return;
    };
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return;
    }
    if target.len() >= TOOL_RESULT_MAX_TEXT_PARTS
        || state.collected_chars >= TOOL_RESULT_MAX_OUTPUT_CHARS
    {
        state.truncated = true;
        return;
    }

    let remaining = TOOL_RESULT_MAX_OUTPUT_CHARS.saturating_sub(state.collected_chars);
    let (snippet, was_truncated) = truncate_chars(trimmed, remaining);
    if snippet.is_empty() {
        state.truncated = true;
        return;
    }

    state.collected_chars += snippet.chars().count();
    state.truncated |= was_truncated;
    target.push(snippet);
}

fn collect_tool_result_text(value: &serde_json::Value, target: &mut Vec<String>) -> bool {
    let mut stack = vec![(value, 0usize)];
    let mut visited_nodes = 0usize;
    let mut state = TextCollectState::default();

    while let Some((current, depth)) = stack.pop() {
        visited_nodes += 1;
        if visited_nodes > JSON_TRAVERSAL_NODE_LIMIT {
            state.truncated = true;
            break;
        }
        if depth >= JSON_RECURSION_LIMIT {
            state.truncated = true;
            continue;
        }

        match current {
            serde_json::Value::String(text) => {
                push_non_empty_limited(target, Some(text), &mut state);
            }
            serde_json::Value::Array(items) => {
                for item in items.iter().rev() {
                    stack.push((item, depth + 1));
                }
            }
            serde_json::Value::Object(obj) => {
                for key in ["text", "output", "stdout", "stderr", "message", "error"] {
                    push_non_empty_limited(
                        target,
                        obj.get(key).and_then(|v| v.as_str()),
                        &mut state,
                    );
                }
                if let Some(value) = obj.get("value") {
                    stack.push((value, depth + 1));
                }
                if let Some(content) = obj.get("content") {
                    stack.push((content, depth + 1));
                }
            }
            _ => {}
        }
    }

    state.truncated
}

fn extract_tool_result_text<T: serde::Serialize>(result: &T) -> String {
    if let Ok(json) = serde_json::to_value(result) {
        let mut parts = Vec::new();
        let traversal_truncated = collect_tool_result_text(&json, &mut parts);
        let deduped = dedupe_preserve_order(parts);
        if !deduped.is_empty() {
            let filtered = maybe_filter_web_content(&deduped.join("\n"));
            let (mut limited, output_truncated) =
                truncate_chars(&filtered, TOOL_RESULT_MAX_OUTPUT_CHARS);
            if traversal_truncated || output_truncated {
                limited.push_str(TOOL_RESULT_TRUNCATED_NOTICE);
            }
            return limited;
        }
    }
    String::new()
}

fn dynamic_filtering_enabled() -> bool {
    lime_core::tool_calling::tool_calling_dynamic_filtering_enabled()
}

fn maybe_filter_web_content(raw: &str) -> String {
    if !dynamic_filtering_enabled() {
        return raw.to_string();
    }

    let lowered = raw.to_ascii_lowercase();
    let looks_like_html =
        (lowered.contains("<html") || lowered.contains("<body") || lowered.contains("</div>"))
            && raw.len() > 4_000;
    if !looks_like_html {
        return raw.to_string();
    }

    let script_re = Regex::new(r"(?is)<script[^>]*>.*?</script>").ok();
    let style_re = Regex::new(r"(?is)<style[^>]*>.*?</style>").ok();
    let tag_re = Regex::new(r"(?is)<[^>]+>").ok();
    let space_re = Regex::new(r"[ \t]{2,}").ok();
    let newline_re = Regex::new(r"\n{3,}").ok();

    let mut cleaned = raw.to_string();
    if let Some(re) = script_re.as_ref() {
        cleaned = re.replace_all(&cleaned, " ").to_string();
    }
    if let Some(re) = style_re.as_ref() {
        cleaned = re.replace_all(&cleaned, " ").to_string();
    }
    if let Some(re) = tag_re.as_ref() {
        cleaned = re.replace_all(&cleaned, "\n").to_string();
    }
    if let Some(re) = space_re.as_ref() {
        cleaned = re.replace_all(&cleaned, " ").to_string();
    }
    if let Some(re) = newline_re.as_ref() {
        cleaned = re.replace_all(&cleaned, "\n\n").to_string();
    }
    cleaned = cleaned
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n");

    const MAX_FILTERED_CHARS: usize = 8_000;
    if cleaned.chars().count() > MAX_FILTERED_CHARS {
        let shortened = cleaned.chars().take(MAX_FILTERED_CHARS).collect::<String>();
        return format!(
            "{}\n\n[dynamic_filtering] 内容已裁剪，原始长度 {} 字符",
            shortened,
            cleaned.chars().count()
        );
    }

    cleaned
}

#[derive(Debug, Clone)]
struct ExtractedToolResult {
    output: String,
    images: Vec<TauriToolImage>,
    diagnostics: ToolResultDiagnostics,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct ToolResultDiagnostics {
    raw_json_bytes: Option<usize>,
    output_chars: usize,
    image_count: usize,
    text_truncated: bool,
    images_truncated: bool,
}

fn log_tool_result_diagnostics(tool_id: &str, diagnostics: &ToolResultDiagnostics) {
    let raw_json_bytes = diagnostics.raw_json_bytes.unwrap_or(0);
    let should_warn = diagnostics.text_truncated
        || diagnostics.images_truncated
        || raw_json_bytes >= TOOL_RESULT_DIAG_WARN_JSON_BYTES
        || diagnostics.output_chars >= TOOL_RESULT_DIAG_WARN_OUTPUT_CHARS
        || diagnostics.image_count >= TOOL_RESULT_DIAG_WARN_IMAGE_COUNT;

    if should_warn {
        tracing::warn!(
            "[AsterAgent][Diag] tool_end payload summary: tool_id={}, raw_json_bytes={}, output_chars={}, image_count={}, text_truncated={}, images_truncated={}",
            tool_id,
            raw_json_bytes,
            diagnostics.output_chars,
            diagnostics.image_count,
            diagnostics.text_truncated,
            diagnostics.images_truncated
        );
    } else {
        tracing::debug!(
            "[AsterAgent][Diag] tool_end payload summary: tool_id={}, raw_json_bytes={}, output_chars={}, image_count={}",
            tool_id,
            raw_json_bytes,
            diagnostics.output_chars,
            diagnostics.image_count
        );
    }
}

fn parse_mime_type_from_data_url(data_url: &str) -> Option<String> {
    let normalized = data_url.trim();
    if !normalized.starts_with("data:image/") {
        return None;
    }

    let comma_index = normalized.find(',')?;
    let meta = &normalized[5..comma_index];
    let mut parts = meta.split(';');
    let mime_type = parts.next()?.trim();
    if mime_type.starts_with("image/") {
        Some(mime_type.to_string())
    } else {
        None
    }
}

fn build_tool_image_from_data_url(raw: &str, origin: &str) -> Option<TauriToolImage> {
    let normalized = raw.trim();
    if !normalized.starts_with("data:image/") {
        return None;
    }

    let comma_index = normalized.find(',')?;
    let meta = &normalized[..comma_index];
    if !meta.to_ascii_lowercase().contains(";base64") {
        return None;
    }

    Some(TauriToolImage {
        src: normalized.to_string(),
        mime_type: parse_mime_type_from_data_url(normalized),
        origin: Some(origin.to_string()),
    })
}

fn build_tool_image_from_base64_parts(
    data: &str,
    mime_type: &str,
    origin: &str,
) -> Option<TauriToolImage> {
    let normalized_data = data.trim();
    let normalized_mime_type = mime_type.trim();
    if normalized_data.is_empty() || !normalized_mime_type.starts_with("image/") {
        return None;
    }

    Some(TauriToolImage {
        src: format!("data:{normalized_mime_type};base64,{normalized_data}"),
        mime_type: Some(normalized_mime_type.to_string()),
        origin: Some(origin.to_string()),
    })
}

fn build_tool_image_from_image_content_object(
    obj: &serde_json::Map<String, serde_json::Value>,
) -> Option<TauriToolImage> {
    let content_type = obj.get("type").and_then(serde_json::Value::as_str)?;
    if content_type != "image" {
        return None;
    }

    let data = obj.get("data").and_then(serde_json::Value::as_str)?;
    let mime_type = obj
        .get("mimeType")
        .or_else(|| obj.get("mime_type"))
        .or_else(|| obj.get("mediaType"))
        .or_else(|| obj.get("media_type"))
        .and_then(serde_json::Value::as_str)?;
    build_tool_image_from_base64_parts(data, mime_type, "tool_content")
}

fn extract_data_urls_from_text(text: &str) -> Vec<String> {
    const PREFIX: &str = "data:image/";
    let mut urls = Vec::new();
    let mut offset = 0usize;

    while offset < text.len() {
        let Some(relative_start) = text[offset..].find(PREFIX) else {
            break;
        };
        let start = offset + relative_start;
        let slice = &text[start..];

        let end = slice
            .char_indices()
            .find_map(|(idx, ch)| {
                if ch.is_whitespace()
                    || ch == '"'
                    || ch == '\''
                    || ch == ')'
                    || ch == ']'
                    || ch == '>'
                    || ch == '<'
                {
                    Some(idx)
                } else {
                    None
                }
            })
            .unwrap_or(slice.len());

        let candidate = slice[..end].trim_end_matches(['.', ',', ';']);
        if candidate.starts_with(PREFIX) {
            urls.push(candidate.to_string());
        }

        if end == 0 {
            break;
        }
        offset = start + end;
    }

    urls
}

fn push_tool_image_if_new(
    target: &mut Vec<TauriToolImage>,
    seen_sources: &mut std::collections::HashSet<String>,
    candidate: Option<TauriToolImage>,
) {
    if let Some(image) = candidate {
        if seen_sources.insert(image.src.clone()) {
            target.push(image);
        }
    }
}

fn collect_tool_result_images(
    value: &serde_json::Value,
    target: &mut Vec<TauriToolImage>,
    seen_sources: &mut std::collections::HashSet<String>,
) -> bool {
    let mut stack = vec![(value, 0usize)];
    let mut visited_nodes = 0usize;
    let mut truncated = false;

    while let Some((current, depth)) = stack.pop() {
        visited_nodes += 1;
        if visited_nodes > JSON_TRAVERSAL_NODE_LIMIT {
            truncated = true;
            break;
        }
        if depth >= JSON_RECURSION_LIMIT {
            truncated = true;
            continue;
        }
        if target.len() >= TOOL_RESULT_MAX_IMAGES {
            truncated = true;
            break;
        }

        match current {
            serde_json::Value::String(text) => {
                for data_url in extract_data_urls_from_text(text) {
                    if target.len() >= TOOL_RESULT_MAX_IMAGES {
                        truncated = true;
                        break;
                    }
                    push_tool_image_if_new(
                        target,
                        seen_sources,
                        build_tool_image_from_data_url(&data_url, "data_url"),
                    );
                }
            }
            serde_json::Value::Array(items) => {
                for item in items.iter().rev() {
                    stack.push((item, depth + 1));
                }
            }
            serde_json::Value::Object(obj) => {
                push_tool_image_if_new(
                    target,
                    seen_sources,
                    build_tool_image_from_image_content_object(obj),
                );
                for key in ["image_url", "url", "data"] {
                    if target.len() >= TOOL_RESULT_MAX_IMAGES {
                        truncated = true;
                        break;
                    }
                    if let Some(serde_json::Value::String(raw)) = obj.get(key) {
                        push_tool_image_if_new(
                            target,
                            seen_sources,
                            build_tool_image_from_data_url(raw, "tool_payload"),
                        );
                    }
                }
                for nested in obj.values() {
                    stack.push((nested, depth + 1));
                }
            }
            _ => {}
        }
    }

    truncated
}

fn extract_tool_result_data<T: serde::Serialize>(result: &T) -> ExtractedToolResult {
    let output = extract_tool_result_text(result);
    let mut images = Vec::new();
    let mut seen_sources = std::collections::HashSet::new();
    let mut raw_json_bytes = None;
    let mut images_truncated = false;

    for data_url in extract_data_urls_from_text(&output) {
        push_tool_image_if_new(
            &mut images,
            &mut seen_sources,
            build_tool_image_from_data_url(&data_url, "data_url"),
        );
    }

    if let Ok(json) = serde_json::to_value(result) {
        raw_json_bytes = serde_json::to_vec(&json).ok().map(|bytes| bytes.len());
        images_truncated = collect_tool_result_images(&json, &mut images, &mut seen_sources);
    }

    let output_chars = output.chars().count();
    let image_count = images.len();
    let text_truncated = output.contains(TOOL_RESULT_TRUNCATED_NOTICE);

    ExtractedToolResult {
        output,
        images,
        diagnostics: ToolResultDiagnostics {
            raw_json_bytes,
            output_chars,
            image_count,
            text_truncated,
            images_truncated,
        },
    }
}

fn extract_tool_result_metadata<T: serde::Serialize>(
    result: &T,
) -> Option<std::collections::HashMap<String, serde_json::Value>> {
    fn find_metadata(
        value: &serde_json::Value,
        depth: usize,
    ) -> Option<std::collections::HashMap<String, serde_json::Value>> {
        if depth >= JSON_RECURSION_LIMIT {
            return None;
        }

        let object = value.as_object()?;

        for key in ["metadata", "meta", "_meta"] {
            let Some(nested) = object.get(key) else {
                continue;
            };

            if let Some(record) = nested.as_object() {
                if !record.is_empty() {
                    return Some(
                        record
                            .iter()
                            .map(|(key, value)| (key.clone(), value.clone()))
                            .collect(),
                    );
                }
            }

            if let Some(found) = find_metadata(nested, depth + 1) {
                return Some(found);
            }
        }

        for nested in object.values() {
            if let Some(found) = find_metadata(nested, depth + 1) {
                return Some(found);
            }
        }

        None
    }

    serde_json::to_value(result)
        .ok()
        .and_then(|value| find_metadata(&value, 0))
}

fn extract_tool_result_structured_content<T: serde::Serialize>(
    result: &T,
) -> Option<serde_json::Value> {
    fn find_structured_content(
        value: &serde_json::Value,
        depth: usize,
    ) -> Option<serde_json::Value> {
        if depth >= JSON_RECURSION_LIMIT {
            return None;
        }

        let object = value.as_object()?;
        for key in ["structuredContent", "structured_content"] {
            if let Some(value) = object.get(key).filter(|value| !value.is_null()) {
                return Some(value.clone());
            }
        }

        for nested in object.values() {
            if let Some(found) = find_structured_content(nested, depth + 1) {
                return Some(found);
            }
        }

        None
    }

    serde_json::to_value(result)
        .ok()
        .and_then(|value| find_structured_content(&value, 0))
}

fn legacy_message_tool_response_metadata(
    metadata: Option<std::collections::HashMap<String, serde_json::Value>>,
) -> std::collections::HashMap<String, serde_json::Value> {
    let mut metadata = metadata.unwrap_or_default();
    metadata.insert(
        "source".to_string(),
        serde_json::json!("legacy_message_tool_response"),
    );
    metadata.insert("sourceType".to_string(), serde_json::json!("tool_end"));
    metadata.insert("compat".to_string(), serde_json::json!(true));
    metadata.insert("canonical".to_string(), serde_json::json!(false));
    metadata
}

fn read_object_string(
    object: &serde_json::Map<String, serde_json::Value>,
    keys: &[&str],
) -> Option<String> {
    keys.iter()
        .filter_map(|key| object.get(*key))
        .find_map(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn read_metadata_string(
    metadata: &HashMap<String, serde_json::Value>,
    keys: &[&str],
) -> Option<String> {
    keys.iter()
        .filter_map(|key| metadata.get(*key))
        .find_map(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn read_object_u32(
    object: &serde_json::Map<String, serde_json::Value>,
    keys: &[&str],
) -> Option<u32> {
    keys.iter()
        .filter_map(|key| object.get(*key))
        .find_map(serde_json::Value::as_u64)
        .and_then(|value| u32::try_from(value).ok())
}

fn read_object_i64(
    object: &serde_json::Map<String, serde_json::Value>,
    keys: &[&str],
) -> Option<i64> {
    keys.iter()
        .filter_map(|key| object.get(*key))
        .find_map(|value| {
            value
                .as_i64()
                .or_else(|| value.as_u64().and_then(|value| i64::try_from(value).ok()))
        })
}

fn read_object_f64(
    object: &serde_json::Map<String, serde_json::Value>,
    keys: &[&str],
) -> Option<f64> {
    keys.iter()
        .filter_map(|key| object.get(*key))
        .find_map(serde_json::Value::as_f64)
}

fn metadata_object<'a>(
    metadata: &'a HashMap<String, serde_json::Value>,
    keys: &[&str],
) -> Option<&'a serde_json::Map<String, serde_json::Value>> {
    keys.iter()
        .filter_map(|key| metadata.get(*key))
        .find_map(serde_json::Value::as_object)
}

fn nested_object<'a>(
    object: &'a serde_json::Map<String, serde_json::Value>,
    keys: &[&str],
) -> Option<&'a serde_json::Map<String, serde_json::Value>> {
    keys.iter()
        .filter_map(|key| object.get(*key))
        .find_map(serde_json::Value::as_object)
}

fn nested_array<'a>(
    object: &'a serde_json::Map<String, serde_json::Value>,
    keys: &[&str],
) -> Option<&'a Vec<serde_json::Value>> {
    keys.iter()
        .filter_map(|key| object.get(*key))
        .find_map(serde_json::Value::as_array)
}

fn build_context_budget_from_object(
    object: &serde_json::Map<String, serde_json::Value>,
) -> Option<TauriContextBudget> {
    let budget = TauriContextBudget {
        used_tokens: read_object_u32(object, &["used_tokens", "usedTokens"]),
        max_tokens: read_object_u32(
            object,
            &["max_tokens", "maxTokens", "token_limit", "tokenLimit"],
        ),
        remaining_tokens: read_object_i64(object, &["remaining_tokens", "remainingTokens"]),
        status: read_object_string(object, &["status"]),
        source: read_object_string(object, &["source"]),
    };

    if budget.used_tokens.is_none()
        && budget.max_tokens.is_none()
        && budget.remaining_tokens.is_none()
        && budget.status.is_none()
        && budget.source.is_none()
    {
        None
    } else {
        Some(budget)
    }
}

fn build_missing_context_from_object(
    object: &serde_json::Map<String, serde_json::Value>,
    index: usize,
) -> Option<TauriMissingContextFact> {
    let label = read_object_string(object, &["label", "title", "path", "id"])
        .unwrap_or_else(|| format!("missing_context:{index}"));
    Some(TauriMissingContextFact {
        id: read_object_string(object, &["id"]),
        kind: read_object_string(object, &["kind"]).unwrap_or_else(|| "context".to_string()),
        label,
        status: read_object_string(object, &["status"]).unwrap_or_else(|| "unknown".to_string()),
        reason: read_object_string(object, &["reason", "message", "detail"]),
        source: read_object_string(object, &["source"]),
    })
}

fn build_retrieval_ref_from_object(
    object: &serde_json::Map<String, serde_json::Value>,
    index: usize,
) -> Option<TauriRetrievalRef> {
    let source_id = read_object_string(object, &["source_id", "sourceId", "id"])
        .or_else(|| read_object_string(object, &["path", "url"]))
        .unwrap_or_else(|| format!("retrieval_ref:{index}"));
    Some(TauriRetrievalRef {
        source_id,
        kind: read_object_string(object, &["kind"]).unwrap_or_else(|| "context".to_string()),
        title: read_object_string(object, &["title", "label", "name"]),
        path: read_object_string(
            object,
            &[
                "path",
                "file_path",
                "filePath",
                "relative_path",
                "relativePath",
            ],
        ),
        url: read_object_string(object, &["url"]),
        score: read_object_f64(object, &["score"]),
        scope: read_object_string(object, &["scope"]),
        status: read_object_string(object, &["status"]),
        source: read_object_string(object, &["source"]),
    })
}

fn build_team_memory_ref_from_object(
    object: &serde_json::Map<String, serde_json::Value>,
    repo_scope: Option<String>,
    index: usize,
) -> Option<TauriTeamMemoryRef> {
    let key = read_object_string(object, &["key", "id", "label"])?;
    Some(TauriTeamMemoryRef {
        key,
        repo_scope: read_object_string(object, &["repo_scope", "repoScope"]).or(repo_scope),
        updated_at: read_object_i64(object, &["updated_at", "updatedAt"]),
        priority: read_object_u32(object, &["priority"]).or_else(|| u32::try_from(index).ok()),
        source: read_object_string(object, &["source"])
            .or_else(|| Some("team_memory_shadow".to_string())),
    })
}

fn extract_agentui_context_object(
    metadata: &HashMap<String, serde_json::Value>,
) -> Option<&serde_json::Map<String, serde_json::Value>> {
    metadata_object(metadata, &["agentui_context", "agentUiContext"]).or_else(|| {
        metadata_object(metadata, &["harness"])
            .and_then(|harness| nested_object(harness, &["agentui_context", "agentUiContext"]))
    })
}

fn extract_team_memory_shadow_object(
    metadata: &HashMap<String, serde_json::Value>,
) -> Option<&serde_json::Map<String, serde_json::Value>> {
    metadata_object(metadata, &["team_memory_shadow", "teamMemoryShadow"]).or_else(|| {
        metadata_object(metadata, &["harness"])
            .and_then(|harness| nested_object(harness, &["team_memory_shadow", "teamMemoryShadow"]))
    })
}

pub(crate) fn build_turn_context_summary(
    turn_context: Option<&TurnContextOverride>,
) -> Option<TauriTurnContextSummary> {
    let metadata = &turn_context?.metadata;
    let agentui_context = extract_agentui_context_object(metadata);
    let mut summary = TauriTurnContextSummary::default();

    if let Some(context) = agentui_context {
        summary.memory_budget = nested_object(
            context,
            &[
                "memory_budget",
                "memoryBudget",
                "context_budget",
                "contextBudget",
            ],
        )
        .and_then(build_context_budget_from_object);

        if let Some(items) = nested_array(context, &["missing_context", "missingContext"]) {
            summary
                .missing_context
                .extend(items.iter().enumerate().filter_map(|(index, value)| {
                    value
                        .as_object()
                        .and_then(|object| build_missing_context_from_object(object, index))
                }));
        }

        if let Some(items) = nested_array(context, &["retrieval_refs", "retrievalRefs"]) {
            summary
                .retrieval_refs
                .extend(items.iter().enumerate().filter_map(|(index, value)| {
                    value
                        .as_object()
                        .and_then(|object| build_retrieval_ref_from_object(object, index))
                }));
        }

        if let Some(items) = nested_array(context, &["team_memory_refs", "teamMemoryRefs"]) {
            summary
                .team_memory_refs
                .extend(items.iter().enumerate().filter_map(|(index, value)| {
                    value
                        .as_object()
                        .and_then(|object| build_team_memory_ref_from_object(object, None, index))
                }));
        }
    }

    if let Some(shadow) = extract_team_memory_shadow_object(metadata) {
        let repo_scope = read_object_string(shadow, &["repo_scope", "repoScope"]);
        if let Some(entries) = nested_array(shadow, &["entries"]) {
            summary
                .team_memory_refs
                .extend(entries.iter().enumerate().filter_map(|(index, value)| {
                    value.as_object().and_then(|object| {
                        build_team_memory_ref_from_object(object, repo_scope.clone(), index)
                    })
                }));
        }
    }

    let mut seen_retrieval_refs = std::collections::HashSet::new();
    summary
        .retrieval_refs
        .retain(|item| seen_retrieval_refs.insert(item.source_id.clone()));
    let mut seen_team_memory_refs = std::collections::HashSet::new();
    summary.team_memory_refs.retain(|item| {
        seen_team_memory_refs.insert(format!(
            "{}:{}",
            item.repo_scope.as_deref().unwrap_or_default(),
            item.key
        ))
    });

    if summary.memory_budget.is_none()
        && summary.missing_context.is_empty()
        && summary.retrieval_refs.is_empty()
        && summary.team_memory_refs.is_empty()
    {
        None
    } else {
        Some(summary)
    }
}

fn extract_turn_execution_strategy(turn_context: Option<&TurnContextOverride>) -> Option<String> {
    let metadata = &turn_context?.metadata;
    read_metadata_string(
        metadata,
        &[
            "effective_execution_strategy",
            "effectiveExecutionStrategy",
            "execution_strategy",
            "executionStrategy",
        ],
    )
    .map(|_| "react".to_string())
}

/// 将 Aster AgentEvent 转换为 TauriAgentEvent 列表
///
/// 一个 AgentEvent 可能产生多个 TauriAgentEvent
pub fn convert_agent_event(event: AgentEvent) -> Vec<TauriAgentEvent> {
    match event {
        AgentEvent::TurnStarted { turn } => {
            let context_summary = build_turn_context_summary(turn.context_override.as_ref());
            let execution_strategy =
                extract_turn_execution_strategy(turn.context_override.as_ref());
            let approval_policy = turn
                .context_override
                .as_ref()
                .and_then(|context| context.approval_policy.clone());
            let sandbox_policy = turn
                .context_override
                .as_ref()
                .and_then(|context| context.sandbox_policy.clone());
            let turn_context_event = if turn.context_override.is_some()
                || turn.output_schema_runtime.is_some()
                || context_summary.is_some()
            {
                Some(TauriAgentEvent::TurnContext {
                    session_id: turn.session_id.clone(),
                    thread_id: turn.thread_id.clone(),
                    turn_id: turn.id.clone(),
                    execution_strategy,
                    output_schema_runtime: turn.output_schema_runtime.clone(),
                    context_summary,
                    approval_policy,
                    sandbox_policy,
                })
            } else {
                None
            };
            let thread_id = turn.thread_id.clone();
            let mut events = vec![
                TauriAgentEvent::ThreadStarted { thread_id },
                TauriAgentEvent::TurnStarted {
                    turn: convert_turn_runtime(turn),
                },
            ];
            if let Some(turn_context_event) = turn_context_event {
                events.push(turn_context_event);
            }
            events
        }
        AgentEvent::ItemStarted { item } => convert_item_runtime(item)
            .map(|item| TauriAgentEvent::ItemStarted { item })
            .into_iter()
            .collect(),
        AgentEvent::ItemUpdated { item } => convert_item_runtime(item)
            .map(|item| TauriAgentEvent::ItemUpdated { item })
            .into_iter()
            .collect(),
        AgentEvent::ItemCompleted { item } => convert_item_runtime(item)
            .map(|item| TauriAgentEvent::ItemCompleted { item })
            .into_iter()
            .collect(),
        AgentEvent::Message(message) => convert_message(message),
        AgentEvent::McpNotification((tool_id, notification)) => {
            convert_mcp_notification(tool_id, notification)
        }
        AgentEvent::ToolInputDelta {
            tool_id,
            tool_name,
            delta,
            accumulated_arguments,
            provider,
        } => vec![TauriAgentEvent::ToolInputDelta {
            tool_id,
            tool_name,
            delta,
            accumulated_arguments,
            provider,
        }],
        AgentEvent::ModelChange { model, mode } => {
            vec![TauriAgentEvent::ModelChange { model, mode }]
        }
        AgentEvent::HistoryReplaced(_conversation) => vec![],
        AgentEvent::ContextTrace { steps } => vec![TauriAgentEvent::ContextTrace {
            steps: steps
                .into_iter()
                .map(|step| TauriContextTraceStep {
                    stage: step.stage,
                    detail: step.detail,
                })
                .collect(),
        }],
        AgentEvent::ContextCompactionStarted {
            item_id,
            trigger,
            detail,
        } => vec![TauriAgentEvent::ContextCompactionStarted {
            item_id,
            trigger,
            detail,
        }],
        AgentEvent::ContextCompactionCompleted {
            item_id,
            trigger,
            detail,
        } => vec![TauriAgentEvent::ContextCompactionCompleted {
            item_id,
            trigger,
            detail,
        }],
        AgentEvent::ContextCompactionWarning { message } => vec![TauriAgentEvent::Warning {
            code: Some("context_compaction_accuracy".to_string()),
            message,
        }],
    }
}

fn convert_action_required_scope(
    scope: Option<&ActionRequiredScope>,
) -> Option<TauriActionRequiredScope> {
    let scope = scope?;
    if scope.session_id.is_none() && scope.thread_id.is_none() && scope.turn_id.is_none() {
        return None;
    }

    Some(TauriActionRequiredScope {
        session_id: scope.session_id.clone(),
        thread_id: scope.thread_id.clone(),
        turn_id: scope.turn_id.clone(),
    })
}

fn convert_turn_status(
    status: TurnStatus,
) -> lime_core::database::dao::agent_timeline::AgentThreadTurnStatus {
    match status {
        TurnStatus::Queued | TurnStatus::Running => {
            lime_core::database::dao::agent_timeline::AgentThreadTurnStatus::Running
        }
        TurnStatus::Completed => {
            lime_core::database::dao::agent_timeline::AgentThreadTurnStatus::Completed
        }
        TurnStatus::Failed => {
            lime_core::database::dao::agent_timeline::AgentThreadTurnStatus::Failed
        }
        TurnStatus::Aborted => {
            lime_core::database::dao::agent_timeline::AgentThreadTurnStatus::Aborted
        }
    }
}

pub fn convert_turn_runtime(turn: TurnRuntime) -> AgentThreadTurn {
    AgentThreadTurn {
        id: turn.id,
        thread_id: turn.thread_id,
        prompt_text: turn.input_text.unwrap_or_default(),
        status: convert_turn_status(turn.status),
        started_at: turn.started_at.unwrap_or(turn.created_at).to_rfc3339(),
        completed_at: turn.completed_at.map(|value| value.to_rfc3339()),
        error_message: turn.error_message,
        created_at: turn.created_at.to_rfc3339(),
        updated_at: turn.updated_at.to_rfc3339(),
    }
}

fn convert_item_status(
    status: ItemStatus,
) -> lime_core::database::dao::agent_timeline::AgentThreadItemStatus {
    match status {
        ItemStatus::InProgress => {
            lime_core::database::dao::agent_timeline::AgentThreadItemStatus::InProgress
        }
        ItemStatus::Completed => {
            lime_core::database::dao::agent_timeline::AgentThreadItemStatus::Completed
        }
        ItemStatus::Failed => {
            lime_core::database::dao::agent_timeline::AgentThreadItemStatus::Failed
        }
    }
}

fn format_runtime_status_text(title: &str, detail: &str, checkpoints: &[String]) -> String {
    let mut lines = Vec::new();

    let trimmed_title = normalize_legacy_runtime_status_title(title);
    if !trimmed_title.is_empty() {
        lines.push(trimmed_title);
    }

    let trimmed_detail = detail.trim();
    if !trimmed_detail.is_empty() {
        lines.push(trimmed_detail.to_string());
    }

    for checkpoint in checkpoints {
        let trimmed = checkpoint.trim();
        if !trimmed.is_empty() {
            lines.push(format!("• {trimmed}"));
        }
    }

    normalize_legacy_turn_summary_text(&lines.join("\n"))
}

fn extract_request_options(value: &serde_json::Value) -> Option<Vec<AgentRequestOption>> {
    let options = value.as_array()?;
    let normalized = options
        .iter()
        .filter_map(|item| match item {
            serde_json::Value::String(label) => {
                let trimmed = label.trim();
                if trimmed.is_empty() {
                    None
                } else {
                    Some(AgentRequestOption {
                        label: trimmed.to_string(),
                        description: None,
                    })
                }
            }
            serde_json::Value::Object(map) => {
                let label = map
                    .get("label")
                    .and_then(serde_json::Value::as_str)
                    .or_else(|| map.get("value").and_then(serde_json::Value::as_str))
                    .map(str::trim)
                    .filter(|value| !value.is_empty())?;
                let description = map
                    .get("description")
                    .and_then(serde_json::Value::as_str)
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(ToString::to_string);

                Some(AgentRequestOption {
                    label: label.to_string(),
                    description,
                })
            }
            _ => None,
        })
        .collect::<Vec<_>>();

    if normalized.is_empty() {
        None
    } else {
        Some(normalized)
    }
}

fn extract_request_questions_from_schema(
    requested_schema: Option<&serde_json::Value>,
) -> Option<Vec<AgentRequestQuestion>> {
    let schema = requested_schema?.as_object()?;
    let raw_questions = schema.get(ASK_USER_QUESTIONS_SCHEMA_KEY)?.as_array()?;
    let normalized = raw_questions
        .iter()
        .filter_map(|item| {
            let record = item.as_object()?;
            let question = record
                .get("question")
                .and_then(serde_json::Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())?
                .to_string();
            let header = record
                .get("header")
                .and_then(serde_json::Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToString::to_string);
            let options = record.get("options").and_then(extract_request_options);
            let multi_select = match record
                .get("multiSelect")
                .or_else(|| record.get("multi_select"))
            {
                Some(serde_json::Value::Bool(value)) => Some(*value),
                _ => None,
            };

            Some(AgentRequestQuestion {
                question,
                header,
                options,
                multi_select,
            })
        })
        .collect::<Vec<_>>();

    if normalized.is_empty() {
        None
    } else {
        Some(normalized)
    }
}

fn convert_item_payload(payload: ItemRuntimePayload) -> Option<AgentThreadItemPayload> {
    match payload {
        ItemRuntimePayload::TranscriptMessage { .. } => None,
        ItemRuntimePayload::UserMessage { content } => {
            Some(AgentThreadItemPayload::UserMessage { content })
        }
        ItemRuntimePayload::AgentMessage { text } => {
            Some(AgentThreadItemPayload::AgentMessage { text, phase: None })
        }
        ItemRuntimePayload::Plan { text } => Some(AgentThreadItemPayload::Plan { text }),
        ItemRuntimePayload::RuntimeStatus {
            phase,
            title,
            detail,
            checkpoints,
        } => {
            let mut metadata = crate::protocol::build_diagnostics_runtime_status_metadata();
            metadata.insert(
                "runtimeStatus".to_string(),
                serde_json::json!({
                    "phase": phase,
                }),
            );
            Some(AgentThreadItemPayload::TurnSummary {
                text: format_runtime_status_text(&title, &detail, &checkpoints),
                metadata: Some(
                    serde_json::to_value(metadata)
                        .expect("runtime status diagnostics metadata should serialize"),
                ),
            })
        }
        ItemRuntimePayload::FileArtifact {
            path,
            source,
            content,
            metadata,
        } => Some(AgentThreadItemPayload::FileArtifact {
            path,
            source,
            content,
            metadata,
        }),
        ItemRuntimePayload::Reasoning { text, summary } => {
            Some(AgentThreadItemPayload::Reasoning { text, summary })
        }
        ItemRuntimePayload::ToolCall {
            tool_name,
            arguments,
            output,
            success,
            error,
            metadata,
        } => {
            let output_text = output
                .as_ref()
                .map(extract_tool_result_text)
                .filter(|text| !text.is_empty());
            Some(AgentThreadItemPayload::ToolCall {
                tool_name,
                arguments,
                output: output_text,
                success,
                error,
                metadata,
            })
        }
        ItemRuntimePayload::ApprovalRequest {
            request_id,
            action_type,
            prompt,
            tool_name,
            arguments,
            response,
        } => Some(AgentThreadItemPayload::ApprovalRequest {
            request_id,
            action_type,
            prompt,
            tool_name,
            arguments,
            response,
        }),
        ItemRuntimePayload::RequestUserInput {
            request_id,
            action_type,
            prompt,
            requested_schema,
            response,
        } => Some(AgentThreadItemPayload::RequestUserInput {
            request_id,
            action_type,
            prompt,
            questions: extract_request_questions_from_schema(requested_schema.as_ref()),
            response,
        }),
    }
}

pub fn convert_item_runtime(item: ItemRuntime) -> Option<AgentThreadItem> {
    let payload = convert_item_payload(item.payload)?;
    Some(AgentThreadItem {
        id: item.id,
        thread_id: item.thread_id,
        turn_id: item.turn_id,
        sequence: item.sequence,
        status: convert_item_status(item.status),
        started_at: item.started_at.to_rfc3339(),
        completed_at: item.completed_at.map(|value| value.to_rfc3339()),
        updated_at: item.updated_at.to_rfc3339(),
        payload,
    })
}

/// 将 Aster Message 转换为 TauriAgentEvent 列表
fn convert_message(message: Message) -> Vec<TauriAgentEvent> {
    let mut events = vec![TauriAgentEvent::Message {
        message: convert_to_tauri_message(&message),
    }];

    for content in &message.content {
        match content {
            MessageContent::Text(text_content) => {
                events.push(TauriAgentEvent::TextDelta {
                    text: enhance_execution_error_text(&text_content.text),
                });
            }
            MessageContent::Thinking(thinking) => {
                events.push(TauriAgentEvent::ThinkingDelta {
                    text: thinking.thinking.clone(),
                });
            }
            MessageContent::ToolRequest(tool_request) => match &tool_request.tool_call {
                Ok(call) => {
                    let arguments_value = serde_json::to_value(&call.arguments).unwrap_or_default();
                    events.push(TauriAgentEvent::ToolStart {
                        tool_name: call.name.to_string(),
                        tool_id: tool_request.id.clone(),
                        arguments: serde_json::to_string(&maybe_offload_tool_arguments(
                            &tool_request.id,
                            &arguments_value,
                        ))
                        .ok(),
                    });
                }
                Err(e) => {
                    events.push(TauriAgentEvent::Error {
                        message: format!("Invalid tool call: {e}"),
                    });
                }
            },
            MessageContent::ToolResponse(tool_response) => {
                let (success, output, error, structured_content, images, metadata) =
                    match &tool_response.tool_result {
                        Ok(result) => {
                            let extracted = extract_tool_result_data(result);
                            let structured_content = extract_tool_result_structured_content(result);
                            log_tool_result_diagnostics(&tool_response.id, &extracted.diagnostics);
                            let offloaded = maybe_offload_tool_result_payload(
                                &tool_response.id,
                                &extracted.output,
                                result,
                                Some(legacy_message_tool_response_metadata(
                                    extract_tool_result_metadata(result),
                                )),
                            );
                            (
                                true,
                                offloaded.output,
                                None,
                                structured_content,
                                if extracted.images.is_empty() {
                                    None
                                } else {
                                    Some(extracted.images)
                                },
                                if offloaded.metadata.is_empty() {
                                    None
                                } else {
                                    Some(offloaded.metadata)
                                },
                            )
                        }
                        Err(e) => (
                            false,
                            String::new(),
                            Some(e.to_string()),
                            None,
                            None,
                            Some(legacy_message_tool_response_metadata(None)),
                        ),
                    };

                events.push(TauriAgentEvent::ToolEnd {
                    tool_id: tool_response.id.clone(),
                    result: TauriToolResult {
                        success,
                        output,
                        error,
                        structured_content,
                        images,
                        metadata,
                    },
                });
            }
            MessageContent::ActionRequired(action_required) => {
                let scope = convert_action_required_scope(action_required.scope.as_ref());
                let (request_id, action_type, data) = match &action_required.data {
                    ActionRequiredData::ToolConfirmation {
                        id,
                        tool_name,
                        arguments,
                        prompt,
                    } => (
                        id.clone(),
                        "tool_confirmation".to_string(),
                        serde_json::json!({
                            "tool_name": tool_name,
                            "arguments": arguments,
                            "prompt": prompt,
                        }),
                    ),
                    ActionRequiredData::Elicitation {
                        id,
                        message,
                        requested_schema,
                    } => (
                        id.clone(),
                        "elicitation".to_string(),
                        serde_json::json!({
                            "message": message,
                            "requested_schema": requested_schema,
                        }),
                    ),
                    ActionRequiredData::ElicitationResponse { id, user_data } => (
                        id.clone(),
                        "elicitation_response".to_string(),
                        serde_json::json!({
                            "user_data": user_data,
                        }),
                    ),
                };

                events.push(TauriAgentEvent::ActionRequired {
                    request_id,
                    action_type,
                    data,
                    scope,
                });
            }
            MessageContent::SystemNotification(notification) => {
                // 系统通知转换为文本
                events.push(TauriAgentEvent::TextDelta {
                    text: notification.msg.clone(),
                });
            }
            MessageContent::Image(image) => {
                // 图片内容暂时忽略
                tracing::debug!("Image content: {}", image.mime_type);
            }
            MessageContent::ToolConfirmationRequest(req) => {
                events.push(TauriAgentEvent::ActionRequired {
                    request_id: req.id.clone(),
                    action_type: "tool_confirmation".to_string(),
                    data: serde_json::json!({
                        "tool_name": req.tool_name,
                        "arguments": req.arguments,
                        "prompt": req.prompt,
                    }),
                    scope: None,
                });
            }
            MessageContent::FrontendToolRequest(req) => match &req.tool_call {
                Ok(call) => {
                    events.push(TauriAgentEvent::ToolStart {
                        tool_name: call.name.to_string(),
                        tool_id: req.id.clone(),
                        arguments: serde_json::to_string(&call.arguments).ok(),
                    });
                }
                Err(e) => {
                    events.push(TauriAgentEvent::Error {
                        message: format!("Invalid frontend tool call: {e}"),
                    });
                }
            },
            MessageContent::ToolInputDelta(delta) => {
                events.push(TauriAgentEvent::ToolInputDelta {
                    tool_id: delta.id.clone(),
                    tool_name: delta.tool_name.clone(),
                    delta: delta.delta.clone(),
                    accumulated_arguments: delta.accumulated_arguments.clone(),
                    provider: delta.provider.clone(),
                });
            }
            MessageContent::RedactedThinking(_) => {
                // 隐藏的思考内容，忽略
            }
        }
    }

    events
}

/// 将 Aster Message 转换为 TauriMessage
pub fn convert_to_tauri_message(message: &Message) -> TauriMessage {
    let content = message
        .content
        .iter()
        .filter_map(convert_message_content)
        .collect();

    TauriMessage {
        id: message.id.clone(),
        role: format!("{:?}", message.role).to_lowercase(),
        content,
        timestamp: message.created,
        usage: None,
    }
}

/// 将 MessageContent 转换为 TauriMessageContent
fn convert_message_content(content: &MessageContent) -> Option<TauriMessageContent> {
    match content {
        MessageContent::Text(text) => Some(TauriMessageContent::Text {
            text: text.text.clone(),
        }),
        MessageContent::Thinking(thinking) => Some(TauriMessageContent::Thinking {
            text: thinking.thinking.clone(),
        }),
        MessageContent::ToolRequest(req) => req.tool_call.as_ref().ok().map(|call| {
            let arguments_value = serde_json::to_value(&call.arguments).unwrap_or_default();
            TauriMessageContent::ToolRequest {
                id: req.id.clone(),
                tool_name: call.name.to_string(),
                arguments: maybe_offload_tool_arguments(&req.id, &arguments_value),
            }
        }),
        MessageContent::ToolResponse(resp) => {
            let (success, output, error, structured_content, images, metadata) =
                match &resp.tool_result {
                    Ok(result) => {
                        let extracted = extract_tool_result_data(result);
                        let structured_content = extract_tool_result_structured_content(result);
                        let offloaded = maybe_offload_tool_result_payload(
                            &resp.id,
                            &extracted.output,
                            result,
                            extract_tool_result_metadata(result),
                        );
                        (
                            true,
                            offloaded.output,
                            None,
                            structured_content,
                            if extracted.images.is_empty() {
                                None
                            } else {
                                Some(extracted.images)
                            },
                            if offloaded.metadata.is_empty() {
                                None
                            } else {
                                Some(offloaded.metadata)
                            },
                        )
                    }
                    Err(e) => (false, String::new(), Some(e.to_string()), None, None, None),
                };
            Some(TauriMessageContent::ToolResponse {
                id: resp.id.clone(),
                success,
                output,
                error,
                structured_content,
                images,
                metadata,
            })
        }
        MessageContent::ActionRequired(action) => {
            let scope = convert_action_required_scope(action.scope.as_ref());
            let (id, action_type, data) = match &action.data {
                ActionRequiredData::ToolConfirmation {
                    id,
                    tool_name,
                    arguments,
                    prompt,
                } => (
                    id.clone(),
                    "tool_confirmation".to_string(),
                    serde_json::json!({
                        "tool_name": tool_name,
                        "arguments": arguments,
                        "prompt": prompt,
                    }),
                ),
                ActionRequiredData::Elicitation {
                    id,
                    message,
                    requested_schema,
                } => (
                    id.clone(),
                    "elicitation".to_string(),
                    serde_json::json!({
                        "message": message,
                        "requested_schema": requested_schema,
                    }),
                ),
                ActionRequiredData::ElicitationResponse { id, user_data } => (
                    id.clone(),
                    "elicitation_response".to_string(),
                    user_data.clone(),
                ),
            };
            Some(TauriMessageContent::ActionRequired {
                id,
                action_type,
                data,
                scope,
            })
        }
        MessageContent::Image(image) => Some(TauriMessageContent::Image {
            mime_type: image.mime_type.clone(),
            data: image.data.clone(),
        }),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_convert_text_delta() {
        let message = Message::assistant().with_text("Hello, world!");
        let events = convert_message(message);

        assert_eq!(events.len(), 2);
        assert!(matches!(events[0], TauriAgentEvent::Message { .. }));
        assert!(matches!(
            &events[1],
            TauriAgentEvent::TextDelta { text } if text == "Hello, world!"
        ));
    }

    #[test]
    fn test_convert_action_required_scope_for_event_and_message_content() {
        let message = Message::assistant().with_content(MessageContent::ActionRequired(
            aster::conversation::message::ActionRequired {
                data: ActionRequiredData::Elicitation {
                    id: "req-1".to_string(),
                    message: "请补充发布渠道".to_string(),
                    requested_schema: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "channel": { "type": "string" }
                        }
                    }),
                },
                scope: Some(ActionRequiredScope {
                    session_id: Some("session-1".to_string()),
                    thread_id: Some("thread-1".to_string()),
                    turn_id: Some("turn-1".to_string()),
                }),
            },
        ));

        let tauri_message = convert_to_tauri_message(&message);
        assert_eq!(tauri_message.content.len(), 1);
        match &tauri_message.content[0] {
            TauriMessageContent::ActionRequired {
                id,
                action_type,
                data,
                scope,
            } => {
                assert_eq!(id, "req-1");
                assert_eq!(action_type, "elicitation");
                assert_eq!(
                    data.get("message").and_then(serde_json::Value::as_str),
                    Some("请补充发布渠道")
                );
                let scope = scope.as_ref().expect("expected action scope");
                assert_eq!(scope.session_id.as_deref(), Some("session-1"));
                assert_eq!(scope.thread_id.as_deref(), Some("thread-1"));
                assert_eq!(scope.turn_id.as_deref(), Some("turn-1"));
            }
            other => panic!("Expected ActionRequired message content, got {other:?}"),
        }

        let events = convert_message(message);
        assert_eq!(events.len(), 2);
        match &events[1] {
            TauriAgentEvent::ActionRequired {
                request_id,
                action_type,
                data,
                scope,
            } => {
                assert_eq!(request_id, "req-1");
                assert_eq!(action_type, "elicitation");
                assert_eq!(
                    data.get("message").and_then(serde_json::Value::as_str),
                    Some("请补充发布渠道")
                );
                let scope = scope.as_ref().expect("expected action scope");
                assert_eq!(scope.session_id.as_deref(), Some("session-1"));
                assert_eq!(scope.thread_id.as_deref(), Some("thread-1"));
                assert_eq!(scope.turn_id.as_deref(), Some("turn-1"));
            }
            other => panic!("Expected ActionRequired event, got {other:?}"),
        }
    }

    #[test]
    fn test_convert_model_change() {
        let event = AgentEvent::ModelChange {
            model: "claude-3".to_string(),
            mode: "chat".to_string(),
        };
        let events = convert_agent_event(event);

        assert_eq!(events.len(), 1);
        match &events[0] {
            TauriAgentEvent::ModelChange { model, mode } => {
                assert_eq!(model, "claude-3");
                assert_eq!(mode, "chat");
            }
            _ => panic!("Expected ModelChange event"),
        }
    }

    #[test]
    fn test_convert_context_trace() {
        let event = AgentEvent::ContextTrace {
            steps: vec![aster::context::ContextTraceStep {
                stage: "memory_injection".to_string(),
                detail: "query_len=10,injected=2".to_string(),
            }],
        };

        let events = convert_agent_event(event);
        assert_eq!(events.len(), 1);
        match &events[0] {
            TauriAgentEvent::ContextTrace { steps } => {
                assert_eq!(steps.len(), 1);
                assert_eq!(steps[0].stage, "memory_injection");
                assert_eq!(steps[0].detail, "query_len=10,injected=2");
            }
            _ => panic!("Expected ContextTrace event"),
        }
    }

    #[test]
    fn test_convert_mcp_notifications_to_tool_stream_events() {
        use rmcp::model::{
            LoggingLevel, LoggingMessageNotification, LoggingMessageNotificationMethod,
            LoggingMessageNotificationParam, NumberOrString, ProgressNotification,
            ProgressNotificationMethod, ProgressNotificationParam, ProgressToken,
            ServerNotification,
        };

        let progress_events = convert_agent_event(AgentEvent::McpNotification((
            "tool-1".to_string(),
            ServerNotification::ProgressNotification(ProgressNotification {
                method: ProgressNotificationMethod,
                params: ProgressNotificationParam {
                    progress_token: ProgressToken(NumberOrString::Number(7)),
                    progress: 2.0,
                    total: Some(4.0),
                    message: Some("正在处理第 2 项".to_string()),
                },
                extensions: Default::default(),
            }),
        )));

        assert_eq!(progress_events.len(), 1);
        match &progress_events[0] {
            TauriAgentEvent::ToolProgress { tool_id, progress } => {
                assert_eq!(tool_id, "tool-1");
                assert_eq!(progress.message.as_deref(), Some("正在处理第 2 项"));
                assert_eq!(progress.progress, Some(2.0));
                assert_eq!(progress.total, Some(4.0));
                assert_eq!(
                    progress
                        .metadata
                        .as_ref()
                        .and_then(|metadata| metadata.get("notification_kind"))
                        .and_then(serde_json::Value::as_str),
                    Some("mcp_progress")
                );
            }
            other => panic!("Expected ToolProgress event, got {other:?}"),
        }

        let output_events = convert_agent_event(AgentEvent::McpNotification((
            "tool-1".to_string(),
            ServerNotification::LoggingMessageNotification(LoggingMessageNotification {
                method: LoggingMessageNotificationMethod,
                params: LoggingMessageNotificationParam {
                    level: LoggingLevel::Info,
                    logger: Some("runner".to_string()),
                    data: serde_json::json!({
                        "message": "已生成一段工具输出"
                    }),
                },
                extensions: Default::default(),
            }),
        )));

        assert_eq!(output_events.len(), 1);
        match &output_events[0] {
            TauriAgentEvent::ToolOutputDelta {
                tool_id,
                delta,
                output_kind,
                metadata,
            } => {
                assert_eq!(tool_id, "tool-1");
                assert!(delta.contains("已生成一段工具输出"));
                assert_eq!(output_kind.as_deref(), Some("log"));
                assert_eq!(
                    metadata
                        .as_ref()
                        .and_then(|metadata| metadata.get("notification_kind"))
                        .and_then(serde_json::Value::as_str),
                    Some("mcp_log")
                );
            }
            other => panic!("Expected ToolOutputDelta event, got {other:?}"),
        }
    }

    #[test]
    fn test_convert_provider_tool_input_delta_event() {
        let events = convert_agent_event(AgentEvent::ToolInputDelta {
            tool_id: "tool-1".to_string(),
            tool_name: Some("read_file".to_string()),
            delta: "{\"path\"".to_string(),
            accumulated_arguments: Some("{\"path\"".to_string()),
            provider: Some("openai_compatible".to_string()),
        });

        assert_eq!(events.len(), 1);
        match &events[0] {
            TauriAgentEvent::ToolInputDelta {
                tool_id,
                tool_name,
                delta,
                accumulated_arguments,
                provider,
            } => {
                assert_eq!(tool_id, "tool-1");
                assert_eq!(tool_name.as_deref(), Some("read_file"));
                assert_eq!(delta, "{\"path\"");
                assert_eq!(accumulated_arguments.as_deref(), Some("{\"path\""));
                assert_eq!(provider.as_deref(), Some("openai_compatible"));
            }
            other => panic!("Expected ToolInputDelta event, got {other:?}"),
        }
    }

    #[test]
    fn test_convert_history_replaced_returns_empty_for_runtime_projection() {
        let event = AgentEvent::HistoryReplaced(aster::conversation::Conversation::empty());

        let events = convert_agent_event(event);
        assert!(events.is_empty());
    }

    #[test]
    fn test_convert_context_compaction_lifecycle_events() {
        let started_events = convert_agent_event(AgentEvent::ContextCompactionStarted {
            item_id: "compact-1".to_string(),
            trigger: "manual".to_string(),
            detail: Some("压缩最近 8 轮历史".to_string()),
        });
        assert_eq!(started_events.len(), 1);
        match &started_events[0] {
            TauriAgentEvent::ContextCompactionStarted {
                item_id,
                trigger,
                detail,
            } => {
                assert_eq!(item_id, "compact-1");
                assert_eq!(trigger, "manual");
                assert_eq!(detail.as_deref(), Some("压缩最近 8 轮历史"));
            }
            other => panic!("Expected ContextCompactionStarted event, got {other:?}"),
        }

        let completed_events = convert_agent_event(AgentEvent::ContextCompactionCompleted {
            item_id: "compact-1".to_string(),
            trigger: "auto".to_string(),
            detail: Some("已生成摘要并替换旧上下文".to_string()),
        });
        assert_eq!(completed_events.len(), 1);
        match &completed_events[0] {
            TauriAgentEvent::ContextCompactionCompleted {
                item_id,
                trigger,
                detail,
            } => {
                assert_eq!(item_id, "compact-1");
                assert_eq!(trigger, "auto");
                assert_eq!(detail.as_deref(), Some("已生成摘要并替换旧上下文"));
            }
            other => panic!("Expected ContextCompactionCompleted event, got {other:?}"),
        }

        let warning_events = convert_agent_event(AgentEvent::ContextCompactionWarning {
            message: "长对话和多次上下文压缩会降低模型准确性；如果后续结果开始漂移，建议新开会话。"
                .to_string(),
        });
        assert_eq!(warning_events.len(), 1);
        match &warning_events[0] {
            TauriAgentEvent::Warning { code, message } => {
                assert_eq!(code.as_deref(), Some("context_compaction_accuracy"));
                assert_eq!(
                    message,
                    "长对话和多次上下文压缩会降低模型准确性；如果后续结果开始漂移，建议新开会话。"
                );
            }
            other => panic!("Expected Warning event, got {other:?}"),
        }
    }

    #[test]
    fn test_convert_turn_started() {
        let turn = TurnRuntime::new(
            "turn-1",
            "session-1",
            "thread-1",
            Some("帮我总结".to_string()),
            None,
        );
        let events = convert_agent_event(AgentEvent::TurnStarted { turn });

        assert_eq!(events.len(), 2);
        match &events[0] {
            TauriAgentEvent::ThreadStarted { thread_id } => {
                assert_eq!(thread_id, "thread-1");
            }
            _ => panic!("Expected ThreadStarted event"),
        }
        match &events[1] {
            TauriAgentEvent::TurnStarted { turn } => {
                assert_eq!(turn.id, "turn-1");
                assert_eq!(turn.thread_id, "thread-1");
                assert_eq!(turn.prompt_text, "帮我总结");
            }
            _ => panic!("Expected TurnStarted event"),
        }
    }

    #[test]
    fn test_convert_turn_started_with_output_schema_runtime_emits_turn_context() {
        let turn = TurnRuntime::new(
            "turn-2",
            "session-2",
            "thread-2",
            Some("输出结构化结果".to_string()),
            Some(aster::session::TurnContextOverride {
                model: Some("gpt-5.4".to_string()),
                ..aster::session::TurnContextOverride::default()
            }),
        )
        .with_output_schema_runtime(Some(aster::session::TurnOutputSchemaRuntime {
            source: aster::session::TurnOutputSchemaSource::Turn,
            strategy: aster::session::TurnOutputSchemaStrategy::Native,
            provider_name: Some("openai".to_string()),
            model_name: Some("gpt-5.4".to_string()),
        }));

        let events = convert_agent_event(AgentEvent::TurnStarted { turn });

        assert_eq!(events.len(), 3);
        match &events[2] {
            TauriAgentEvent::TurnContext {
                session_id,
                thread_id,
                turn_id,
                output_schema_runtime,
                context_summary,
                ..
            } => {
                assert_eq!(session_id, "session-2");
                assert_eq!(thread_id, "thread-2");
                assert_eq!(turn_id, "turn-2");
                assert!(context_summary.is_none());
                let runtime = output_schema_runtime
                    .as_ref()
                    .expect("expected output schema runtime");
                assert_eq!(runtime.provider_name.as_deref(), Some("openai"));
                assert_eq!(runtime.model_name.as_deref(), Some("gpt-5.4"));
            }
            other => panic!("Expected TurnContext event, got {other:?}"),
        }
    }

    #[test]
    fn test_convert_turn_started_with_execution_strategy_emits_turn_context() {
        let mut metadata = HashMap::new();
        metadata.insert(
            "effective_execution_strategy".to_string(),
            serde_json::Value::String("react".to_string()),
        );
        let turn = TurnRuntime::new(
            "turn-code",
            "session-code",
            "thread-code",
            Some("修复图片卡片回归".to_string()),
            Some(aster::session::TurnContextOverride {
                metadata,
                ..aster::session::TurnContextOverride::default()
            }),
        );

        let events = convert_agent_event(AgentEvent::TurnStarted { turn });

        assert_eq!(events.len(), 3);
        match &events[2] {
            TauriAgentEvent::TurnContext {
                session_id,
                thread_id,
                turn_id,
                execution_strategy,
                ..
            } => {
                assert_eq!(session_id, "session-code");
                assert_eq!(thread_id, "thread-code");
                assert_eq!(turn_id, "turn-code");
                assert_eq!(execution_strategy.as_deref(), Some("react"));
            }
            other => panic!("Expected TurnContext event, got {other:?}"),
        }
    }

    #[test]
    fn test_convert_turn_started_with_context_summary_facts() {
        let mut metadata = HashMap::new();
        metadata.insert(
            "agentui_context".to_string(),
            serde_json::json!({
                "memory_budget": {
                    "used_tokens": 640,
                    "max_tokens": 1200,
                    "status": "ready",
                    "source": "knowledge_context_resolver"
                },
                "retrieval_refs": [
                    {
                        "source_id": "knowledge_pack:brand:compiled/splits/brief.md",
                        "kind": "knowledge_pack",
                        "title": "brand:brief",
                        "path": "compiled/splits/brief.md",
                        "scope": "workspace",
                        "status": "ready",
                        "source": "knowledge_context_resolver"
                    }
                ],
                "missing_context": [
                    {
                        "id": "knowledge_warning:0",
                        "kind": "knowledge_warning",
                        "label": "sources/missing.md",
                        "status": "unknown",
                        "reason": "缺少来源",
                        "source": "knowledge_context_resolver"
                    }
                ]
            }),
        );
        metadata.insert(
            "team_memory_shadow".to_string(),
            serde_json::json!({
                "repo_scope": "/repo/lime",
                "entries": [
                    {
                        "key": "team.selection",
                        "content": "不要把 memory 正文透出到 AgentUI refs",
                        "updated_at": 1710000000
                    }
                ]
            }),
        );
        let turn = TurnRuntime::new(
            "turn-context",
            "session-context",
            "thread-context",
            Some("使用项目资料".to_string()),
            Some(aster::session::TurnContextOverride {
                approval_policy: Some("on-request".to_string()),
                sandbox_policy: Some("workspace-write".to_string()),
                metadata,
                ..aster::session::TurnContextOverride::default()
            }),
        );

        let events = convert_agent_event(AgentEvent::TurnStarted { turn });

        assert_eq!(events.len(), 3);
        match &events[2] {
            TauriAgentEvent::TurnContext {
                session_id,
                thread_id,
                turn_id,
                context_summary: Some(summary),
                approval_policy,
                sandbox_policy,
                ..
            } => {
                assert_eq!(session_id, "session-context");
                assert_eq!(thread_id, "thread-context");
                assert_eq!(turn_id, "turn-context");
                assert_eq!(approval_policy.as_deref(), Some("on-request"));
                assert_eq!(sandbox_policy.as_deref(), Some("workspace-write"));
                let budget = summary.memory_budget.as_ref().expect("context budget");
                assert_eq!(budget.used_tokens, Some(640));
                assert_eq!(budget.max_tokens, Some(1200));
                assert_eq!(summary.retrieval_refs.len(), 1);
                assert_eq!(
                    summary.retrieval_refs[0].source_id,
                    "knowledge_pack:brand:compiled/splits/brief.md"
                );
                assert_eq!(summary.missing_context[0].status, "unknown");
                assert_eq!(summary.team_memory_refs.len(), 1);
                assert_eq!(summary.team_memory_refs[0].key, "team.selection");
                assert_eq!(
                    summary.team_memory_refs[0].repo_scope.as_deref(),
                    Some("/repo/lime")
                );
            }
            other => panic!("Expected TurnContext with context_summary, got {other:?}"),
        }
    }

    #[test]
    fn test_convert_item_completed_tool_call() {
        let now = chrono::Utc::now();
        let item = ItemRuntime {
            id: "tool-1".to_string(),
            thread_id: "thread-1".to_string(),
            turn_id: "turn-1".to_string(),
            sequence: 2,
            status: ItemStatus::Completed,
            started_at: now,
            completed_at: Some(now),
            updated_at: now,
            payload: ItemRuntimePayload::ToolCall {
                tool_name: "web_search".to_string(),
                arguments: Some(serde_json::json!({ "q": "codex" })),
                output: Some(serde_json::json!({
                    "content": [
                        { "type": "text", "text": "Codex 是一个智能体编码系统" }
                    ]
                })),
                success: Some(true),
                error: None,
                metadata: Some(serde_json::json!({ "source": "native_item_runtime" })),
            },
        };

        let events = convert_agent_event(AgentEvent::ItemCompleted { item });
        assert_eq!(events.len(), 1);
        match &events[0] {
            TauriAgentEvent::ItemCompleted { item } => {
                assert_eq!(item.id, "tool-1");
                assert_eq!(item.sequence, 2);
                assert_eq!(
                    item.status,
                    lime_core::database::dao::agent_timeline::AgentThreadItemStatus::Completed
                );
                match &item.payload {
                    AgentThreadItemPayload::ToolCall {
                        tool_name,
                        arguments,
                        output,
                        success,
                        error,
                        metadata,
                    } => {
                        assert_eq!(tool_name, "web_search");
                        assert_eq!(
                            arguments.as_ref(),
                            Some(&serde_json::json!({ "q": "codex" }))
                        );
                        assert_eq!(output.as_deref(), Some("Codex 是一个智能体编码系统"));
                        assert_eq!(*success, Some(true));
                        assert_eq!(error, &None);
                        assert_eq!(
                            metadata.as_ref(),
                            Some(&serde_json::json!({ "source": "native_item_runtime" }))
                        );
                    }
                    other => panic!("Unexpected payload: {other:?}"),
                }
            }
            other => panic!("Expected ItemCompleted event, got {other:?}"),
        }
    }

    #[test]
    fn test_transcript_runtime_item_is_internal_only() {
        let now = chrono::Utc::now();
        let item = ItemRuntime {
            id: "transcript:turn-1:1".to_string(),
            thread_id: "thread-1".to_string(),
            turn_id: "turn-1".to_string(),
            sequence: 1,
            status: ItemStatus::Completed,
            started_at: now,
            completed_at: Some(now),
            updated_at: now,
            payload: ItemRuntimePayload::TranscriptMessage {
                role: "user".to_string(),
                content: vec![MessageContent::text("完整历史")],
                metadata: Default::default(),
                created_timestamp: now.timestamp(),
            },
        };

        let events = convert_agent_event(AgentEvent::ItemCompleted { item });

        assert!(events.is_empty());
    }

    #[test]
    fn test_convert_item_started_plan_runtime_item() {
        let now = chrono::Utc::now();
        let item = ItemRuntime {
            id: "plan:turn-1".to_string(),
            thread_id: "thread-1".to_string(),
            turn_id: "turn-1".to_string(),
            sequence: 2,
            status: ItemStatus::InProgress,
            started_at: now,
            completed_at: None,
            updated_at: now,
            payload: ItemRuntimePayload::Plan {
                text: "- 调研\n- 实现".to_string(),
            },
        };

        let events = convert_agent_event(AgentEvent::ItemStarted { item });
        assert_eq!(events.len(), 1);
        match &events[0] {
            TauriAgentEvent::ItemStarted { item } => match &item.payload {
                AgentThreadItemPayload::Plan { text } => {
                    assert_eq!(text, "- 调研\n- 实现");
                }
                other => panic!("Unexpected payload: {other:?}"),
            },
            other => panic!("Expected ItemStarted event, got {other:?}"),
        }
    }

    #[test]
    fn test_convert_item_started_reasoning_runtime_item_preserves_summary() {
        let now = chrono::Utc::now();
        let item = ItemRuntime {
            id: "reasoning-1".to_string(),
            thread_id: "thread-1".to_string(),
            turn_id: "turn-1".to_string(),
            sequence: 3,
            status: ItemStatus::InProgress,
            started_at: now,
            completed_at: None,
            updated_at: now,
            payload: ItemRuntimePayload::Reasoning {
                text: "先判断任务类型\n\n再决定是否联网".to_string(),
                summary: Some(vec![
                    "先判断任务类型".to_string(),
                    "再决定是否联网".to_string(),
                ]),
            },
        };

        let events = convert_agent_event(AgentEvent::ItemStarted { item });
        assert_eq!(events.len(), 1);
        match &events[0] {
            TauriAgentEvent::ItemStarted { item } => match &item.payload {
                AgentThreadItemPayload::Reasoning { text, summary } => {
                    assert_eq!(text, "先判断任务类型\n\n再决定是否联网");
                    assert_eq!(
                        summary.as_ref(),
                        Some(&vec![
                            "先判断任务类型".to_string(),
                            "再决定是否联网".to_string(),
                        ])
                    );
                }
                other => panic!("Unexpected payload: {other:?}"),
            },
            other => panic!("Expected ItemStarted event, got {other:?}"),
        }
    }

    #[test]
    fn test_convert_item_started_file_artifact_runtime_item() {
        let now = chrono::Utc::now();
        let item = ItemRuntime {
            id: "artifact-1".to_string(),
            thread_id: "thread-1".to_string(),
            turn_id: "turn-1".to_string(),
            sequence: 3,
            status: ItemStatus::Completed,
            started_at: now,
            completed_at: Some(now),
            updated_at: now,
            payload: ItemRuntimePayload::FileArtifact {
                path: "/tmp/result.md".to_string(),
                source: "tool_result".to_string(),
                content: None,
                metadata: Some(serde_json::json!({
                    "output_file": "/tmp/result.md",
                    "artifact_id": "artifact-1"
                })),
            },
        };

        let events = convert_agent_event(AgentEvent::ItemStarted { item });
        assert_eq!(events.len(), 1);
        match &events[0] {
            TauriAgentEvent::ItemStarted { item } => match &item.payload {
                AgentThreadItemPayload::FileArtifact {
                    path,
                    source,
                    content,
                    metadata,
                } => {
                    assert_eq!(path, "/tmp/result.md");
                    assert_eq!(source, "tool_result");
                    assert_eq!(content, &None);
                    assert_eq!(
                        metadata.as_ref().and_then(|value| value.get("artifact_id")),
                        Some(&serde_json::json!("artifact-1"))
                    );
                }
                other => panic!("Unexpected payload: {other:?}"),
            },
            other => panic!("Expected ItemStarted event, got {other:?}"),
        }
    }

    #[test]
    fn test_convert_item_updated_runtime_status_runtime_item() {
        let now = chrono::Utc::now();
        let item = ItemRuntime {
            id: "turn_summary:turn-1".to_string(),
            thread_id: "thread-1".to_string(),
            turn_id: "turn-1".to_string(),
            sequence: 4,
            status: ItemStatus::InProgress,
            started_at: now,
            completed_at: None,
            updated_at: now,
            payload: ItemRuntimePayload::RuntimeStatus {
                phase: "routing".to_string(),
                title: "已决定：先规划再输出".to_string(),
                detail: "当前请求更像计划拆解，会先输出结构化行动路径。".to_string(),
                checkpoints: vec!["检测到计划需求".to_string(), "优先整理关键步骤".to_string()],
            },
        };

        let events = convert_agent_event(AgentEvent::ItemUpdated { item });
        assert_eq!(events.len(), 1);
        match &events[0] {
            TauriAgentEvent::ItemUpdated { item } => match &item.payload {
                AgentThreadItemPayload::TurnSummary { text, metadata } => {
                    assert!(text.contains("先规划再输出"));
                    assert!(!text.contains("已决定："));
                    assert!(text.contains("当前请求更像计划拆解"));
                    assert!(text.contains("• 检测到计划需求"));
                    let metadata = metadata.as_ref().expect("runtime status metadata");
                    assert_eq!(
                        metadata
                            .get("sourceType")
                            .and_then(serde_json::Value::as_str),
                        Some("runtime_status")
                    );
                    assert_eq!(
                        metadata
                            .get("visibility")
                            .and_then(serde_json::Value::as_str),
                        Some("diagnostics")
                    );
                }
                other => panic!("Unexpected payload: {other:?}"),
            },
            other => panic!("Expected ItemUpdated event, got {other:?}"),
        }
    }

    #[test]
    fn test_convert_item_started_request_user_input() {
        let now = chrono::Utc::now();
        let item = ItemRuntime {
            id: "request-1".to_string(),
            thread_id: "thread-1".to_string(),
            turn_id: "turn-1".to_string(),
            sequence: 3,
            status: ItemStatus::InProgress,
            started_at: now,
            completed_at: None,
            updated_at: now,
            payload: ItemRuntimePayload::RequestUserInput {
                request_id: "request-1".to_string(),
                action_type: "elicitation".to_string(),
                prompt: Some("请补充发布渠道".to_string()),
                requested_schema: Some(serde_json::json!({
                    ASK_USER_QUESTIONS_SCHEMA_KEY: [
                        {
                            "question": "请补充发布渠道",
                            "header": "channel",
                            "options": [
                                {
                                    "label": "小红书",
                                    "description": "适合图文种草"
                                },
                                {
                                    "value": "wechat-video",
                                    "label": "视频号"
                                }
                            ],
                            "multiSelect": false
                        }
                    ],
                    "type": "object",
                    "properties": {
                        "channel": { "type": "string" }
                    }
                })),
                response: None,
            },
        };

        let events = convert_agent_event(AgentEvent::ItemStarted { item });
        assert_eq!(events.len(), 1);
        match &events[0] {
            TauriAgentEvent::ItemStarted { item } => {
                assert_eq!(item.id, "request-1");
                assert_eq!(
                    item.status,
                    lime_core::database::dao::agent_timeline::AgentThreadItemStatus::InProgress
                );
                match &item.payload {
                    AgentThreadItemPayload::RequestUserInput {
                        request_id,
                        action_type,
                        prompt,
                        questions,
                        response,
                    } => {
                        assert_eq!(request_id, "request-1");
                        assert_eq!(action_type, "elicitation");
                        assert_eq!(prompt.as_deref(), Some("请补充发布渠道"));
                        assert_eq!(
                            questions,
                            &Some(vec![AgentRequestQuestion {
                                question: "请补充发布渠道".to_string(),
                                header: Some("channel".to_string()),
                                options: Some(vec![
                                    AgentRequestOption {
                                        label: "小红书".to_string(),
                                        description: Some("适合图文种草".to_string()),
                                    },
                                    AgentRequestOption {
                                        label: "视频号".to_string(),
                                        description: None,
                                    },
                                ]),
                                multi_select: Some(false),
                            }])
                        );
                        assert_eq!(response, &None);
                    }
                    other => panic!("Unexpected payload: {other:?}"),
                }
            }
            other => panic!("Expected ItemStarted event, got {other:?}"),
        }
    }

    #[test]
    fn test_extract_tool_result_text_should_handle_nested_content_and_error() {
        let payload = serde_json::json!({
            "status": "success",
            "value": {
                "content": [
                    { "type": "text", "text": "任务已启动" },
                    { "type": "text", "text": "任务 ID: 123" }
                ]
            }
        });
        let text = extract_tool_result_text(&payload);
        assert!(text.contains("任务已启动"));
        assert!(text.contains("任务 ID: 123"));

        let error_payload = serde_json::json!({
            "status": "error",
            "error": "-32603: Tool not found"
        });
        let error_text = extract_tool_result_text(&error_payload);
        assert_eq!(error_text, "-32603: Tool not found");
    }

    #[test]
    fn test_extract_tool_result_data_extracts_image_data_url_from_text() {
        let payload = serde_json::json!({
            "content": [
                {
                    "type": "text",
                    "text": "图片如下 data:image/png;base64,aGVsbG8= 结束"
                }
            ]
        });

        let extracted = extract_tool_result_data(&payload);
        assert_eq!(
            extracted.output,
            "图片如下 data:image/png;base64,aGVsbG8= 结束"
        );
        assert_eq!(extracted.images.len(), 1);
        assert_eq!(extracted.images[0].src, "data:image/png;base64,aGVsbG8=");
        assert_eq!(extracted.images[0].mime_type.as_deref(), Some("image/png"));
    }

    #[test]
    fn test_extract_tool_result_data_should_dedupe_same_image() {
        let payload = serde_json::json!({
            "content": [
                {
                    "type": "text",
                    "text": "data:image/png;base64,aGVsbG8="
                },
                {
                    "type": "text",
                    "text": "重复 data:image/png;base64,aGVsbG8="
                }
            ]
        });

        let extracted = extract_tool_result_data(&payload);
        assert_eq!(extracted.images.len(), 1);
        assert_eq!(extracted.images[0].src, "data:image/png;base64,aGVsbG8=");
    }

    #[test]
    fn test_extract_tool_result_data_extracts_rmcp_image_content() {
        let payload = serde_json::json!({
            "content": [
                {
                    "type": "text",
                    "text": "Viewed image: sample.png"
                },
                {
                    "type": "image",
                    "data": "aGVsbG8=",
                    "mimeType": "image/png"
                }
            ]
        });

        let extracted = extract_tool_result_data(&payload);
        assert!(extracted.output.contains("Viewed image: sample.png"));
        assert_eq!(extracted.images.len(), 1);
        assert_eq!(extracted.images[0].src, "data:image/png;base64,aGVsbG8=");
        assert_eq!(extracted.images[0].mime_type.as_deref(), Some("image/png"));
        assert_eq!(extracted.images[0].origin.as_deref(), Some("tool_content"));
    }

    #[test]
    fn test_maybe_filter_web_content_should_strip_html_noise() {
        let html = format!(
            "<html><head><style>body{{color:red}}</style><script>alert(1)</script></head><body>{}</body></html>",
            "正文".repeat(2500)
        );
        let filtered = maybe_filter_web_content(&html);
        assert!(!filtered.to_ascii_lowercase().contains("<html"));
        assert!(!filtered.to_ascii_lowercase().contains("<script"));
        assert!(filtered.contains("正文"));
    }

    #[test]
    fn test_extract_tool_result_text_should_stop_on_excessive_depth() {
        let mut nested = serde_json::json!({ "text": "不会到达" });
        for _ in 0..(JSON_RECURSION_LIMIT + 10) {
            nested = serde_json::json!({ "value": nested });
        }

        let text = extract_tool_result_text(&nested);
        assert_eq!(text, "");
    }

    #[test]
    fn test_extract_tool_result_text_should_truncate_large_payload() {
        let payload = serde_json::json!({
            "content": [
                {
                    "type": "text",
                    "text": "A".repeat(TOOL_RESULT_MAX_OUTPUT_CHARS + 128)
                }
            ]
        });

        let text = extract_tool_result_text(&payload);
        assert!(text.contains("[event_converter] 工具输出已截断"));
        assert!(text.chars().count() <= TOOL_RESULT_MAX_OUTPUT_CHARS + 64);
    }

    #[test]
    fn test_extract_tool_result_data_should_limit_image_count() {
        let payload = serde_json::json!({
            "images": (0..(TOOL_RESULT_MAX_IMAGES + 4))
                .map(|index| {
                    serde_json::json!({
                        "data": format!("data:image/png;base64,image{index}")
                    })
                })
                .collect::<Vec<_>>()
        });

        let extracted = extract_tool_result_data(&payload);
        assert_eq!(extracted.images.len(), TOOL_RESULT_MAX_IMAGES);
        assert!(extracted.diagnostics.images_truncated);
    }

    #[test]
    fn test_extract_tool_result_data_should_record_diagnostics() {
        let payload = serde_json::json!({
            "content": [
                {
                    "type": "text",
                    "text": "hello"
                }
            ]
        });

        let extracted = extract_tool_result_data(&payload);
        assert_eq!(extracted.diagnostics.output_chars, 5);
        assert_eq!(extracted.diagnostics.image_count, 0);
        assert!(!extracted.diagnostics.text_truncated);
        assert!(extracted.diagnostics.raw_json_bytes.is_some());
    }

    #[test]
    fn test_extract_tool_result_metadata_should_read_meta_object() {
        let payload = serde_json::json!({
            "content": [
                {
                    "type": "text",
                    "text": "任务已完成"
                }
            ],
            "meta": {
                "exit_code": 1,
                "output_file": "/tmp/aster_tasks/task-1.log"
            }
        });

        let metadata = extract_tool_result_metadata(&payload).expect("metadata should exist");
        assert_eq!(metadata.get("exit_code"), Some(&serde_json::json!(1)));
        assert_eq!(
            metadata.get("output_file"),
            Some(&serde_json::json!("/tmp/aster_tasks/task-1.log"))
        );
    }

    #[test]
    fn test_extract_tool_result_metadata_should_not_treat_structured_content_as_metadata() {
        let payload = serde_json::json!({
            "content": [
                {
                    "type": "text",
                    "text": "任务已完成"
                }
            ],
            "structuredContent": {
                "answer": "ok"
            }
        });

        assert!(extract_tool_result_metadata(&payload).is_none());
        assert_eq!(
            extract_tool_result_structured_content(&payload),
            Some(serde_json::json!({ "answer": "ok" }))
        );
    }

    #[test]
    fn test_convert_message_tool_response_preserves_mcp_structured_content() {
        let message = Message::assistant().with_tool_response(
            "tool-mcp-structured",
            Ok(rmcp::model::CallToolResult {
                content: vec![rmcp::model::Content::text("任务已完成")],
                structured_content: Some(serde_json::json!({
                    "answer": "ok",
                    "ids": ["doc-1"]
                })),
                meta: Some(rmcp::model::Meta(serde_json::Map::from_iter([(
                    "source".to_string(),
                    serde_json::json!("mcp"),
                )]))),
                is_error: None,
            }),
        );

        let events = convert_message(message);

        let tool_end = events
            .iter()
            .find_map(|event| match event {
                TauriAgentEvent::ToolEnd { result, .. } => Some(result),
                _ => None,
            })
            .expect("expected tool_end event");
        assert_eq!(
            tool_end.structured_content.as_ref(),
            Some(&serde_json::json!({
                "answer": "ok",
                "ids": ["doc-1"]
            }))
        );
        assert_eq!(
            tool_end
                .metadata
                .as_ref()
                .and_then(|metadata| metadata.get("source"))
                .and_then(serde_json::Value::as_str),
            Some("legacy_message_tool_response")
        );
    }

    #[test]
    fn test_convert_message_tool_response_marks_legacy_tool_end_as_compat() {
        let message = Message::assistant().with_tool_response(
            "tool-legacy-1",
            Ok(rmcp::model::CallToolResult {
                content: vec![rmcp::model::Content::text("任务已完成")],
                structured_content: None,
                meta: Some(rmcp::model::Meta(serde_json::Map::from_iter([
                    ("exit_code".to_string(), serde_json::json!(0)),
                    ("source".to_string(), serde_json::json!("tool_payload")),
                    ("sourceType".to_string(), serde_json::json!("custom_result")),
                    ("compat".to_string(), serde_json::json!(false)),
                    ("canonical".to_string(), serde_json::json!(true)),
                ]))),
                is_error: None,
            }),
        );

        let events = convert_message(message);

        let tool_end = events
            .iter()
            .find_map(|event| match event {
                TauriAgentEvent::ToolEnd { result, .. } => Some(result),
                _ => None,
            })
            .expect("expected legacy tool_end event");
        let metadata = tool_end
            .metadata
            .as_ref()
            .expect("legacy tool_end metadata");
        assert_eq!(
            metadata.get("source"),
            Some(&serde_json::json!("legacy_message_tool_response"))
        );
        assert_eq!(
            metadata.get("sourceType"),
            Some(&serde_json::json!("tool_end"))
        );
        assert_eq!(metadata.get("compat"), Some(&serde_json::json!(true)));
        assert_eq!(metadata.get("canonical"), Some(&serde_json::json!(false)));
        assert_eq!(metadata.get("exit_code"), Some(&serde_json::json!(0)));
    }

    #[test]
    fn test_convert_failed_message_tool_response_marks_legacy_tool_end_as_compat() {
        let message = Message::assistant().with_tool_response(
            "tool-legacy-failed",
            Err(rmcp::model::ErrorData::new(
                rmcp::model::ErrorCode::INTERNAL_ERROR,
                "tool failed",
                None,
            )),
        );

        let events = convert_message(message);

        let tool_end = events
            .iter()
            .find_map(|event| match event {
                TauriAgentEvent::ToolEnd { result, .. } => Some(result),
                _ => None,
            })
            .expect("expected legacy failed tool_end event");
        assert!(!tool_end.success);
        assert_eq!(tool_end.error.as_deref(), Some("-32603: tool failed"));
        let metadata = tool_end
            .metadata
            .as_ref()
            .expect("legacy failed tool_end metadata");
        assert_eq!(
            metadata.get("source"),
            Some(&serde_json::json!("legacy_message_tool_response"))
        );
        assert_eq!(metadata.get("compat"), Some(&serde_json::json!(true)));
        assert_eq!(metadata.get("canonical"), Some(&serde_json::json!(false)));
    }

    #[test]
    fn test_convert_message_emits_full_message_event_with_id() {
        let message = Message::assistant().with_id("resp-1").with_text("hello");

        let events = convert_agent_event(AgentEvent::Message(message));

        assert!(events.iter().any(
            |event| matches!(event, TauriAgentEvent::Message { message } if message.id.as_deref() == Some("resp-1"))
        ));
        assert!(events
            .iter()
            .any(|event| matches!(event, TauriAgentEvent::TextDelta { text } if text == "hello")));
    }
}
