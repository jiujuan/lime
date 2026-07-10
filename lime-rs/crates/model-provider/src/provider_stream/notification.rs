use serde_json::{json, Value};

pub const PROVIDER_STREAM_EVENT_NOTIFICATION_PREFIX: &str = "__provider_stream_event__:";

pub fn provider_stream_notification_payload_from_text(text: &str) -> Option<Value> {
    let payload = text.strip_prefix(PROVIDER_STREAM_EVENT_NOTIFICATION_PREFIX)?;
    serde_json::from_str(payload).ok()
}

pub fn provider_stream_notification_payload_from_texts<'a>(
    texts: impl IntoIterator<Item = &'a str>,
) -> Option<Value> {
    texts
        .into_iter()
        .find_map(provider_stream_notification_payload_from_text)
}

pub fn provider_stream_has_notification_text<'a>(texts: impl IntoIterator<Item = &'a str>) -> bool {
    provider_stream_notification_payload_from_texts(texts).is_some()
}

pub fn provider_stream_notification_text(
    event_kind: &str,
    response_event: Value,
    headers: Vec<(String, String)>,
) -> String {
    let headers = headers
        .into_iter()
        .map(|(name, value)| json!({ "name": name, "value": value }))
        .collect::<Vec<_>>();
    let payload = json!({
        "eventKind": event_kind,
        "responseEvent": response_event,
        "headers": headers,
    });

    format!("{PROVIDER_STREAM_EVENT_NOTIFICATION_PREFIX}{payload}")
}
