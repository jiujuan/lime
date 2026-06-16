use app_server_protocol::AgentInput;
use serde_json::Value;

const PLACEHOLDER_TITLES: &[&str] = &["新对话", "新话题", "新任务", "未命名", "未命名对话"];
const USER_MESSAGE_BEGIN: &str = "<|user_message|>";
const TITLE_MAX_CHARS: usize = 80;

pub(crate) fn resolve_session_title(
    explicit_title: Option<String>,
    first_user_message: Option<String>,
) -> Option<String> {
    let explicit_title = normalize_title(explicit_title.as_deref());
    if explicit_title
        .as_deref()
        .is_some_and(|title| !is_placeholder_title(title))
    {
        return explicit_title;
    }

    normalize_title(first_user_message.as_deref()).or(explicit_title)
}

pub(crate) fn first_user_message_from_agent_input(input: &AgentInput) -> Option<String> {
    normalize_title(Some(&input.text))
}

pub(crate) fn first_user_message_from_runtime_payload(payload: &Value) -> Option<String> {
    payload
        .get("input")
        .and_then(|value| serde_json::from_value::<AgentInput>(value.clone()).ok())
        .and_then(|input| first_user_message_from_agent_input(&input))
        .or_else(|| {
            nested_string(payload, &["content", "text"])
                .or_else(|| nested_string(payload, &["content", "message"]))
                .or_else(|| string_field(payload, "text"))
                .and_then(|text| normalize_title(Some(&text)))
        })
}

pub(crate) fn normalize_title(value: Option<&str>) -> Option<String> {
    let value = value?.trim();
    if value.is_empty() {
        return None;
    }
    let value = strip_user_message_prefix(value);
    if value.is_empty() {
        return None;
    }
    Some(truncate_chars(value, TITLE_MAX_CHARS))
}

fn strip_user_message_prefix(value: &str) -> &str {
    match value.find(USER_MESSAGE_BEGIN) {
        Some(index) => value[index + USER_MESSAGE_BEGIN.len()..].trim(),
        None => value,
    }
}

fn is_placeholder_title(value: &str) -> bool {
    let value = value.trim();
    value.is_empty() || PLACEHOLDER_TITLES.iter().any(|title| *title == value)
}

fn truncate_chars(value: &str, max_chars: usize) -> String {
    let mut chars = value.chars();
    let mut title = chars.by_ref().take(max_chars).collect::<String>();
    if chars.next().is_some() {
        title.push('…');
    }
    title
}

fn string_field(value: &Value, key: &str) -> Option<String> {
    value.get(key).and_then(Value::as_str).map(str::to_string)
}

fn nested_string(value: &Value, path: &[&str]) -> Option<String> {
    let mut current = value;
    for key in path {
        current = current.get(*key)?;
    }
    current.as_str().map(str::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn preserves_explicit_title() {
        assert_eq!(
            resolve_session_title(Some("手动标题".to_string()), Some("用户消息".to_string())),
            Some("手动标题".to_string())
        );
    }

    #[test]
    fn replaces_placeholder_title_with_first_user_message() {
        assert_eq!(
            resolve_session_title(
                Some("新对话".to_string()),
                Some("整理今天的新闻".to_string())
            ),
            Some("整理今天的新闻".to_string())
        );
    }

    #[test]
    fn strips_user_message_prefix() {
        assert_eq!(
            resolve_session_title(
                Some("未命名对话".to_string()),
                Some("prior context <|user_message|>修复标题生成".to_string())
            ),
            Some("修复标题生成".to_string())
        );
    }

    #[test]
    fn extracts_user_message_from_runtime_payload() {
        assert_eq!(
            first_user_message_from_runtime_payload(&json!({
                "input": {
                    "text": "生成项目摘要",
                    "attachments": []
                }
            })),
            Some("生成项目摘要".to_string())
        );
    }
}
