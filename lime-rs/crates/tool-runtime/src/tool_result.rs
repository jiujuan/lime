use regex::Regex;
use serde::Serialize;
use serde_json::Value;
use std::collections::{HashMap, HashSet};

const JSON_RECURSION_LIMIT: usize = 50;
const JSON_TRAVERSAL_NODE_LIMIT: usize = 4_096;
const TOOL_RESULT_MAX_TEXT_PARTS: usize = 256;
const TOOL_RESULT_MAX_OUTPUT_CHARS: usize = 4_000;
const TOOL_RESULT_MAX_IMAGES: usize = 12;
pub const TOOL_RESULT_TRUNCATED_NOTICE: &str = "\n\n[event_converter] 工具输出已截断";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ToolResultImageProjection {
    pub src: String,
    pub mime_type: Option<String>,
    pub origin: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ExtractedToolResult {
    pub output: String,
    pub images: Vec<ToolResultImageProjection>,
    pub diagnostics: ToolResultDiagnostics,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ToolResultDiagnostics {
    pub raw_json_bytes: Option<usize>,
    pub output_chars: usize,
    pub image_count: usize,
    pub text_truncated: bool,
    pub images_truncated: bool,
}

#[derive(Debug, Default)]
struct TextCollectState {
    collected_chars: usize,
    truncated: bool,
}

fn dedupe_preserve_order(items: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut deduped = Vec::new();
    for item in items {
        if seen.insert(item.clone()) {
            deduped.push(item);
        }
    }
    deduped
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

fn collect_tool_result_text(value: &Value, target: &mut Vec<String>) -> bool {
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
            Value::String(text) => {
                push_non_empty_limited(target, Some(text), &mut state);
            }
            Value::Array(items) => {
                for item in items.iter().rev() {
                    stack.push((item, depth + 1));
                }
            }
            Value::Object(obj) => {
                for key in ["text", "output", "stdout", "stderr", "message", "error"] {
                    push_non_empty_limited(
                        target,
                        obj.get(key).and_then(Value::as_str),
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

pub fn extract_tool_result_text<T: Serialize>(
    result: &T,
    dynamic_filtering_enabled: bool,
) -> String {
    if let Ok(json) = serde_json::to_value(result) {
        let mut parts = Vec::new();
        let traversal_truncated = collect_tool_result_text(&json, &mut parts);
        let deduped = dedupe_preserve_order(parts);
        if !deduped.is_empty() {
            let filtered = maybe_filter_web_content(&deduped.join("\n"), dynamic_filtering_enabled);
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

pub fn maybe_filter_web_content(raw: &str, dynamic_filtering_enabled: bool) -> String {
    if !dynamic_filtering_enabled {
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

fn build_tool_image_from_data_url(raw: &str, origin: &str) -> Option<ToolResultImageProjection> {
    let normalized = raw.trim();
    if !normalized.starts_with("data:image/") {
        return None;
    }

    let comma_index = normalized.find(',')?;
    let meta = &normalized[..comma_index];
    if !meta.to_ascii_lowercase().contains(";base64") {
        return None;
    }

    Some(ToolResultImageProjection {
        src: normalized.to_string(),
        mime_type: parse_mime_type_from_data_url(normalized),
        origin: Some(origin.to_string()),
    })
}

fn build_tool_image_from_base64_parts(
    data: &str,
    mime_type: &str,
    origin: &str,
) -> Option<ToolResultImageProjection> {
    let normalized_data = data.trim();
    let normalized_mime_type = mime_type.trim();
    if normalized_data.is_empty() || !normalized_mime_type.starts_with("image/") {
        return None;
    }

    Some(ToolResultImageProjection {
        src: format!("data:{normalized_mime_type};base64,{normalized_data}"),
        mime_type: Some(normalized_mime_type.to_string()),
        origin: Some(origin.to_string()),
    })
}

fn build_tool_image_from_image_content_object(
    obj: &serde_json::Map<String, Value>,
) -> Option<ToolResultImageProjection> {
    let content_type = obj.get("type").and_then(Value::as_str)?;
    if content_type != "image" {
        return None;
    }

    let data = obj.get("data").and_then(Value::as_str)?;
    let mime_type = obj
        .get("mimeType")
        .or_else(|| obj.get("mime_type"))
        .or_else(|| obj.get("mediaType"))
        .or_else(|| obj.get("media_type"))
        .and_then(Value::as_str)?;
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
    target: &mut Vec<ToolResultImageProjection>,
    seen_sources: &mut HashSet<String>,
    candidate: Option<ToolResultImageProjection>,
) {
    if let Some(image) = candidate {
        if seen_sources.insert(image.src.clone()) {
            target.push(image);
        }
    }
}

fn collect_tool_result_images(
    value: &Value,
    target: &mut Vec<ToolResultImageProjection>,
    seen_sources: &mut HashSet<String>,
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
            Value::String(text) => {
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
            Value::Array(items) => {
                for item in items.iter().rev() {
                    stack.push((item, depth + 1));
                }
            }
            Value::Object(obj) => {
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
                    if let Some(Value::String(raw)) = obj.get(key) {
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

pub fn extract_tool_result_data<T: Serialize>(
    result: &T,
    dynamic_filtering_enabled: bool,
) -> ExtractedToolResult {
    let output = extract_tool_result_text(result, dynamic_filtering_enabled);
    let mut images = Vec::new();
    let mut seen_sources = HashSet::new();
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

pub fn extract_tool_result_metadata<T: Serialize>(result: &T) -> Option<HashMap<String, Value>> {
    fn find_metadata(value: &Value, depth: usize) -> Option<HashMap<String, Value>> {
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

pub fn extract_tool_result_structured_content<T: Serialize>(result: &T) -> Option<Value> {
    fn find_structured_content(value: &Value, depth: usize) -> Option<Value> {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_tool_result_text_should_handle_nested_content_and_error() {
        let payload = serde_json::json!({
            "status": "success",
            "value": {
                "content": [
                    { "type": "text", "text": "任务已启动" },
                    { "type": "text", "text": "任务 ID: 123" }
                ]
            }
        });
        let text = extract_tool_result_text(&payload, true);
        assert!(text.contains("任务已启动"));
        assert!(text.contains("任务 ID: 123"));

        let error_payload = serde_json::json!({
            "status": "error",
            "error": "-32603: Tool not found"
        });
        let error_text = extract_tool_result_text(&error_payload, true);
        assert_eq!(error_text, "-32603: Tool not found");
    }

    #[test]
    fn extract_tool_result_data_extracts_image_data_url_from_text() {
        let payload = serde_json::json!({
            "content": [
                {
                    "type": "text",
                    "text": "图片如下 data:image/png;base64,aGVsbG8= 结束"
                }
            ]
        });

        let extracted = extract_tool_result_data(&payload, true);
        assert_eq!(
            extracted.output,
            "图片如下 data:image/png;base64,aGVsbG8= 结束"
        );
        assert_eq!(extracted.images.len(), 1);
        assert_eq!(extracted.images[0].src, "data:image/png;base64,aGVsbG8=");
        assert_eq!(extracted.images[0].mime_type.as_deref(), Some("image/png"));
    }

    #[test]
    fn extract_tool_result_data_should_dedupe_same_image() {
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

        let extracted = extract_tool_result_data(&payload, true);
        assert_eq!(extracted.images.len(), 1);
        assert_eq!(extracted.images[0].src, "data:image/png;base64,aGVsbG8=");
    }

    #[test]
    fn extract_tool_result_data_extracts_rmcp_image_content() {
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

        let extracted = extract_tool_result_data(&payload, true);
        assert!(extracted.output.contains("Viewed image: sample.png"));
        assert_eq!(extracted.images.len(), 1);
        assert_eq!(extracted.images[0].src, "data:image/png;base64,aGVsbG8=");
        assert_eq!(extracted.images[0].mime_type.as_deref(), Some("image/png"));
        assert_eq!(extracted.images[0].origin.as_deref(), Some("tool_content"));
    }

    #[test]
    fn maybe_filter_web_content_should_strip_html_noise() {
        let html = format!(
            "<html><head><style>body{{color:red}}</style><script>alert(1)</script></head><body>{}</body></html>",
            "正文".repeat(2500)
        );
        let filtered = maybe_filter_web_content(&html, true);
        assert!(!filtered.to_ascii_lowercase().contains("<html"));
        assert!(!filtered.to_ascii_lowercase().contains("<script"));
        assert!(filtered.contains("正文"));
    }

    #[test]
    fn extract_tool_result_text_should_stop_on_excessive_depth() {
        let mut nested = serde_json::json!({ "text": "不会到达" });
        for _ in 0..(JSON_RECURSION_LIMIT + 10) {
            nested = serde_json::json!({ "value": nested });
        }

        let text = extract_tool_result_text(&nested, true);
        assert_eq!(text, "");
    }

    #[test]
    fn extract_tool_result_text_should_truncate_large_payload() {
        let payload = serde_json::json!({
            "content": [
                {
                    "type": "text",
                    "text": "A".repeat(TOOL_RESULT_MAX_OUTPUT_CHARS + 128)
                }
            ]
        });

        let text = extract_tool_result_text(&payload, true);
        assert!(text.contains(TOOL_RESULT_TRUNCATED_NOTICE));
        assert!(text.chars().count() <= TOOL_RESULT_MAX_OUTPUT_CHARS + 64);
    }

    #[test]
    fn extract_tool_result_data_should_limit_image_count() {
        let payload = serde_json::json!({
            "images": (0..(TOOL_RESULT_MAX_IMAGES + 4))
                .map(|index| {
                    serde_json::json!({
                        "data": format!("data:image/png;base64,image{index}")
                    })
                })
                .collect::<Vec<_>>()
        });

        let extracted = extract_tool_result_data(&payload, true);
        assert_eq!(extracted.images.len(), TOOL_RESULT_MAX_IMAGES);
        assert!(extracted.diagnostics.images_truncated);
    }

    #[test]
    fn extract_tool_result_data_should_record_diagnostics() {
        let payload = serde_json::json!({
            "content": [
                {
                    "type": "text",
                    "text": "hello"
                }
            ]
        });

        let extracted = extract_tool_result_data(&payload, true);
        assert_eq!(extracted.diagnostics.output_chars, 5);
        assert_eq!(extracted.diagnostics.image_count, 0);
        assert!(!extracted.diagnostics.text_truncated);
        assert!(extracted.diagnostics.raw_json_bytes.is_some());
    }

    #[test]
    fn extract_tool_result_metadata_should_read_meta_object() {
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
    fn extract_tool_result_metadata_should_not_treat_structured_content_as_metadata() {
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
}
