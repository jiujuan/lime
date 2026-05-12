//! Runtime evidence JSON 读取工具。
//!
//! 只处理 stable fact payload 的路径读取、字符串归一化和轻量内容判断，
//! 避免 evidence pack 主编排重复维护 JSON 兼容分支。

use serde_json::Value;

pub(crate) fn find_json_value_at_paths<'a>(
    value: &'a Value,
    paths: &[&[&str]],
) -> Option<&'a Value> {
    for path in paths {
        if let Some(found) = find_json_value(value, path) {
            return Some(found);
        }
    }
    None
}

pub(crate) fn find_json_value<'a>(value: &'a Value, path: &[&str]) -> Option<&'a Value> {
    let mut cursor = value;
    for segment in path {
        cursor = cursor.get(*segment)?;
    }
    Some(cursor)
}

pub(crate) fn read_json_string(value: &Value, paths: &[&[&str]]) -> Option<String> {
    let resolved = find_json_value_at_paths(value, paths)?;
    match resolved {
        Value::String(text) => normalize_optional_text(Some(text.clone())),
        Value::Number(number) => Some(number.to_string()),
        _ => None,
    }
}

pub(crate) fn read_json_string_array(value: &Value, paths: &[&[&str]]) -> Vec<String> {
    let Some(resolved) = find_json_value_at_paths(value, paths) else {
        return Vec::new();
    };

    match resolved {
        Value::Array(items) => items
            .iter()
            .filter_map(|item| match item {
                Value::String(text) => normalize_optional_text(Some(text.clone())),
                Value::Number(number) => Some(number.to_string()),
                _ => None,
            })
            .collect(),
        Value::String(text) => normalize_optional_text(Some(text.clone()))
            .map(|value| vec![value])
            .unwrap_or_default(),
        _ => Vec::new(),
    }
}

pub(crate) fn read_json_bool(value: &Value, paths: &[&[&str]]) -> Option<bool> {
    find_json_value_at_paths(value, paths).and_then(Value::as_bool)
}

pub(crate) fn read_json_usize(value: &Value, paths: &[&[&str]]) -> Option<usize> {
    let resolved = find_json_value_at_paths(value, paths)?;
    match resolved {
        Value::Number(number) => number.as_u64().map(|value| value as usize),
        Value::String(text) => text.parse::<usize>().ok(),
        _ => None,
    }
}

pub(crate) fn json_value_has_content(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::String(text) => !text.trim().is_empty(),
        Value::Array(items) => !items.is_empty(),
        Value::Object(fields) => !fields.is_empty(),
        _ => true,
    }
}

pub(crate) fn normalize_optional_text(value: Option<String>) -> Option<String> {
    let trimmed = value?.trim().to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}
