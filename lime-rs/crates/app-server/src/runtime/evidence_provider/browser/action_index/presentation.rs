use super::BrowserActionItem;
use serde_json::json;
use serde_json::Map;
use serde_json::Value;
use std::collections::BTreeMap;

pub(super) fn increment_count(counts: &mut BTreeMap<String, usize>, key: &str) {
    *counts.entry(key.to_string()).or_insert(0) += 1;
}

pub(super) fn count_entries(counts: BTreeMap<String, usize>, key_name: &str) -> Vec<Value> {
    counts
        .into_iter()
        .map(|(key, count)| {
            let mut value = Map::new();
            value.insert(key_name.to_string(), json!(key));
            value.insert("count".to_string(), json!(count));
            Value::Object(value)
        })
        .collect()
}

pub(super) fn browser_action_item_value(item: BrowserActionItem) -> Value {
    let mut value = Map::new();
    insert_optional(&mut value, "artifact_path", item.artifact_path);
    value.insert("artifact_kind".to_string(), json!(item.artifact_kind));
    insert_optional(&mut value, "tool_name", item.tool_name);
    insert_optional(&mut value, "action", item.action);
    insert_optional(&mut value, "action_id", item.action_id);
    value.insert("status".to_string(), json!(item.status));
    if let Some(success) = item.success {
        value.insert("success".to_string(), json!(success));
    }
    insert_optional(&mut value, "session_id", item.session_id);
    insert_optional(&mut value, "target_id", item.target_id);
    insert_optional(&mut value, "tab_id", item.tab_id);
    insert_optional(&mut value, "profile_key", item.profile_key);
    insert_optional(&mut value, "backend", item.backend);
    insert_optional(&mut value, "request_id", item.request_id);
    insert_optional(
        &mut value,
        "confirmation_request_id",
        item.confirmation_request_id,
    );
    insert_optional(&mut value, "control_mode", item.control_mode);
    insert_optional(&mut value, "lifecycle_state", item.lifecycle_state);
    insert_optional(&mut value, "human_reason", item.human_reason);
    insert_optional(&mut value, "thread_id", item.thread_id);
    insert_optional(&mut value, "turn_id", item.turn_id);
    insert_optional(&mut value, "content_id", item.content_id);
    insert_optional(&mut value, "executor", item.executor);
    if !item.evidence_refs.is_empty() {
        value.insert("evidence_refs".to_string(), json!(item.evidence_refs));
    }
    insert_optional(&mut value, "last_url", item.last_url);
    insert_optional(&mut value, "title", item.title);
    if let Some(attempt_count) = item.attempt_count {
        value.insert("attempt_count".to_string(), json!(attempt_count));
    }
    value.insert(
        "observation_available".to_string(),
        json!(item.observation_available),
    );
    value.insert(
        "screenshot_available".to_string(),
        json!(item.screenshot_available),
    );
    Value::Object(value)
}

fn insert_optional(value: &mut Map<String, Value>, key: &str, item: Option<String>) {
    if let Some(item) = item {
        value.insert(key.to_string(), json!(item));
    }
}

pub(super) fn browser_artifact_title(item: &BrowserActionItem) -> String {
    match item.artifact_kind.as_str() {
        "browser_snapshot" => item
            .title
            .clone()
            .unwrap_or_else(|| "Browser snapshot".to_string()),
        "browser_session" => item
            .session_id
            .as_ref()
            .map(|session_id| format!("Browser session {session_id}"))
            .unwrap_or_else(|| "Browser session".to_string()),
        _ => item.artifact_kind.clone(),
    }
}

pub(super) fn item_dedupe_key(item: &BrowserActionItem, fallback: &str) -> String {
    format!(
        "{}:{}:{}:{}",
        item.artifact_kind,
        item.artifact_path.as_deref().unwrap_or_default(),
        item.request_id.as_deref().unwrap_or(fallback),
        item.action.as_deref().unwrap_or_default()
    )
}
