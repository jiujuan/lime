use serde_json::Value;

pub(super) fn json_string_from_optional_value(
    value: Option<&Value>,
    path: &[&str],
) -> Option<String> {
    value.and_then(|value| json_string(value, path))
}

pub(super) fn json_string(value: &Value, path: &[&str]) -> Option<String> {
    for key in path {
        if let Some(value) = value.get(*key).and_then(Value::as_str) {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }
    None
}

pub(super) fn json_string_array(value: &Value, path: &[&str]) -> Vec<String> {
    for key in path {
        let Some(items) = value.get(*key).and_then(Value::as_array) else {
            continue;
        };
        let mut result = Vec::new();
        for item in items {
            let Some(raw) = item.as_str() else {
                continue;
            };
            let trimmed = raw.trim();
            if trimmed.is_empty() || result.iter().any(|existing| existing == trimmed) {
                continue;
            }
            result.push(trimmed.to_string());
        }
        return result;
    }
    Vec::new()
}
