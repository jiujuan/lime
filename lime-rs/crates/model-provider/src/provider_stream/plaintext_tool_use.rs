use serde_json::{Map, Value};

pub const PROVIDER_STREAM_PLAINTEXT_TOOL_USE_OPEN_MARKER: &str = "<tool_use";
pub const PROVIDER_STREAM_PLAINTEXT_TOOL_USE_CLOSE_MARKER: &str = "</tool_use>";
pub const PROVIDER_STREAM_PLAINTEXT_TOOL_USE_PROVIDER: &str = "plaintext_tool_use";

#[derive(Clone, Debug, PartialEq)]
pub struct RuntimeReplyProviderPlaintextToolCall {
    pub name: String,
    pub arguments: Option<Map<String, Value>>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct RuntimeReplyProviderPlaintextToolUse {
    pub prefix: String,
    pub tool_calls: Vec<RuntimeReplyProviderPlaintextToolCall>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RuntimeReplyProviderPlaintextToolUseProgress {
    pub tool_name: Option<String>,
    pub delta: String,
    pub accumulated_arguments: Option<String>,
}

pub fn provider_stream_plaintext_tool_use_start(text: &str) -> Option<usize> {
    text.find(PROVIDER_STREAM_PLAINTEXT_TOOL_USE_OPEN_MARKER)
}

pub fn provider_stream_plaintext_tool_use_is_complete(text: &str) -> bool {
    let Some(open_pos) = provider_stream_plaintext_tool_use_start(text) else {
        return false;
    };
    text.get(open_pos..)
        .is_some_and(|tail| tail.contains(PROVIDER_STREAM_PLAINTEXT_TOOL_USE_CLOSE_MARKER))
}

pub fn provider_stream_plaintext_tool_uses(
    text: &str,
) -> Option<RuntimeReplyProviderPlaintextToolUse> {
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

        if !open_tag.starts_with(PROVIDER_STREAM_PLAINTEXT_TOOL_USE_OPEN_MARKER) {
            saw_tool_use = true;
            cursor = open_end + 1;
            continue;
        }

        let body_start = open_end + 1;
        let close_start = body_start
            + text
                .get(body_start..)?
                .find(PROVIDER_STREAM_PLAINTEXT_TOOL_USE_CLOSE_MARKER)?;
        let body = text.get(body_start..close_start)?;

        if let (Some(name), Some(arguments)) = (
            extract_plaintext_tool_use_name(open_tag),
            parse_plaintext_tool_use_arguments(body),
        ) {
            tool_calls.push(RuntimeReplyProviderPlaintextToolCall {
                name: normalize_plaintext_tool_alias_name(&name).unwrap_or(name),
                arguments: Some(arguments),
            });
        }

        saw_tool_use = true;
        cursor = close_start + PROVIDER_STREAM_PLAINTEXT_TOOL_USE_CLOSE_MARKER.len();
    }

    if tool_calls.is_empty() {
        None
    } else {
        Some(RuntimeReplyProviderPlaintextToolUse { prefix, tool_calls })
    }
}

pub fn provider_stream_plaintext_tool_use_progress(
    accumulated_text: &str,
    delta_text: &str,
) -> Option<RuntimeReplyProviderPlaintextToolUseProgress> {
    let start = accumulated_text.find(PROVIDER_STREAM_PLAINTEXT_TOOL_USE_OPEN_MARKER)?;
    let tail = accumulated_text.get(start..)?;
    let open_end = tail.find('>');
    let tool_name = open_end.and_then(|idx| extract_plaintext_tool_use_name(&tail[..=idx]));
    let accumulated_arguments = open_end
        .map(|idx| strip_plaintext_tool_use_markup(&tail[idx + 1..]))
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let delta = strip_plaintext_tool_use_markup(delta_text);

    Some(RuntimeReplyProviderPlaintextToolUseProgress {
        tool_name,
        delta,
        accumulated_arguments,
    })
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

fn extract_inline_plaintext_tool_call(
    open_tag: &str,
) -> Option<RuntimeReplyProviderPlaintextToolCall> {
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
    let mut arguments = Map::new();
    arguments.insert("query".to_string(), Value::String(query));
    Some(RuntimeReplyProviderPlaintextToolCall {
        name,
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

fn parse_plaintext_tool_use_arguments(raw: &str) -> Option<Map<String, Value>> {
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

fn find_next_plaintext_tool_tag(text: &str) -> Option<(usize, &'static str)> {
    [
        PROVIDER_STREAM_PLAINTEXT_TOOL_USE_OPEN_MARKER,
        "<WebSearch",
        "<websearch",
        "<Search",
        "<search",
    ]
    .iter()
    .filter_map(|marker| text.find(marker).map(|offset| (offset, *marker)))
    .min_by_key(|(offset, _)| *offset)
}

fn strip_plaintext_tool_use_markup(raw: &str) -> String {
    let mut value = raw;
    if let Some(open_start) = value.find(PROVIDER_STREAM_PLAINTEXT_TOOL_USE_OPEN_MARKER) {
        let tail = &value[open_start..];
        let Some(open_end) = tail.find('>') else {
            return String::new();
        };
        value = &tail[open_end + 1..];
    }
    if let Some(close_start) = value.find(PROVIDER_STREAM_PLAINTEXT_TOOL_USE_CLOSE_MARKER) {
        value = &value[..close_start];
    }
    value.to_string()
}
