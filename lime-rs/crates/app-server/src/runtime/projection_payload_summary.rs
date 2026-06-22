use serde_json::Value;

pub(super) const PAYLOAD_TEXT_SUMMARY_MAX_BYTES: usize = 512;

pub(super) fn bounded_payload_summary(payload: &Value) -> String {
    let mut value = payload.clone();
    let truncated_text = value
        .get("text")
        .and_then(Value::as_str)
        .and_then(|text| truncate_text_summary(text, PAYLOAD_TEXT_SUMMARY_MAX_BYTES));
    if let Some(truncated_text) = truncated_text {
        value["text"] = Value::String(truncated_text);
    }
    serde_json::to_string(&value).unwrap_or_else(|_| "{}".to_string())
}

fn truncate_text_summary(text: &str, max_bytes: usize) -> Option<String> {
    if text.len() <= max_bytes {
        return None;
    }

    let mut end = max_bytes.min(text.len());
    while end > 0 && !text.is_char_boundary(end) {
        end -= 1;
    }
    Some(format!("{}...", &text[..end]))
}
