use serde_json::Value;

pub(super) fn browser_candidate_values(value: &Value) -> Vec<&Value> {
    let mut candidates = Vec::new();
    push_candidate(value, &mut candidates);
    for path in [
        &["metadata"][..],
        &["arguments"][..],
        &["action_required"][..],
        &["actionRequired"][..],
        &["action_required", "arguments"][..],
        &["actionRequired", "arguments"][..],
        &["payload"][..],
        &["payload", "browser_action_trace"][..],
        &["payload", "browserActionTrace"][..],
        &["payload", "browser_action"][..],
        &["payload", "browserAction"][..],
        &["payload", "action_required"][..],
        &["payload", "actionRequired"][..],
        &["result"][..],
        &["result", "browser_action_trace"][..],
        &["result", "browserActionTrace"][..],
        &["result", "action_required"][..],
        &["result", "actionRequired"][..],
        &["result", "action_required", "arguments"][..],
        &["result", "actionRequired", "arguments"][..],
        &["result", "metadata"][..],
        &["result", "data"][..],
        &["result", "data", "browser_action_trace"][..],
        &["result", "data", "browserActionTrace"][..],
        &["result", "data", "action_required"][..],
        &["result", "data", "actionRequired"][..],
        &["result", "data", "action_required", "arguments"][..],
        &["result", "data", "actionRequired", "arguments"][..],
        &["result", "data", "browser_session"][..],
        &["result", "data", "browserSession"][..],
        &["result", "data", "browser_snapshot"][..],
        &["result", "data", "browserSnapshot"][..],
        &["result", "browser_session"][..],
        &["result", "browserSession"][..],
        &["result", "browser_snapshot"][..],
        &["result", "browserSnapshot"][..],
        &["result", "page_info"][..],
        &["result", "pageInfo"][..],
        &["data"][..],
        &["data", "browser_action_trace"][..],
        &["data", "browserActionTrace"][..],
        &["data", "action_required"][..],
        &["data", "actionRequired"][..],
        &["data", "action_required", "arguments"][..],
        &["data", "actionRequired", "arguments"][..],
        &["data", "browser_session"][..],
        &["data", "browserSession"][..],
        &["data", "browser_snapshot"][..],
        &["data", "browserSnapshot"][..],
        &["data", "page_info"][..],
        &["data", "pageInfo"][..],
        &["page_info"][..],
        &["pageInfo"][..],
        &["browser_action"][..],
        &["browserAction"][..],
        &["browser_action_trace"][..],
        &["browserActionTrace"][..],
        &["browser_session"][..],
        &["browserSession"][..],
        &["browser_snapshot"][..],
        &["browserSnapshot"][..],
        &["item"][..],
        &["item", "payload"][..],
        &["item", "payload", "browser_action_trace"][..],
        &["item", "payload", "browserActionTrace"][..],
        &["item", "payload", "metadata"][..],
        &["item", "payload", "arguments"][..],
        &["item", "payload", "result"][..],
        &["item", "payload", "result", "browser_action_trace"][..],
        &["item", "payload", "result", "browserActionTrace"][..],
        &["item", "payload", "result", "metadata"][..],
        &["item", "payload", "result", "data"][..],
        &["item", "payload", "result", "data", "browser_action_trace"][..],
        &["item", "payload", "result", "data", "browserActionTrace"][..],
        &["item", "payload", "result", "data", "browser_session"][..],
        &["item", "payload", "result", "data", "browserSession"][..],
        &["item", "payload", "result", "data", "browser_snapshot"][..],
        &["item", "payload", "result", "data", "browserSnapshot"][..],
        &["item", "payload", "result", "browser_session"][..],
        &["item", "payload", "result", "browserSession"][..],
        &["item", "payload", "result", "browser_snapshot"][..],
        &["item", "payload", "result", "browserSnapshot"][..],
        &["item", "payload", "result", "page_info"][..],
        &["item", "payload", "result", "pageInfo"][..],
    ] {
        if let Some(candidate) = value_at_path(value, path) {
            push_candidate(candidate, &mut candidates);
        }
    }
    candidates
}

fn push_candidate<'a>(value: &'a Value, candidates: &mut Vec<&'a Value>) {
    if value.is_object()
        && !candidates
            .iter()
            .any(|candidate| std::ptr::eq(*candidate, value))
    {
        candidates.push(value);
    }
}

fn value_at_path<'a>(value: &'a Value, path: &[&str]) -> Option<&'a Value> {
    let mut current = value;
    for key in path {
        current = current.get(*key)?;
    }
    Some(current)
}

pub(super) fn is_browser_record(
    candidates: &[&Value],
    tool_name: Option<&str>,
    action: Option<&str>,
    artifact_kind: Option<&str>,
) -> bool {
    tool_name.is_some_and(|tool_name| tool_name.to_ascii_lowercase().contains("browser"))
        || action.is_some_and(is_browser_action)
        || artifact_kind.is_some_and(is_browser_artifact_kind)
        || has_any_key(
            candidates,
            &[
                "browserSessionId",
                "browser_session_id",
                "browser_session",
                "browserSession",
                "browser_action",
                "browserAction",
                "browser_action_trace",
                "browserActionTrace",
                "action_required",
                "actionRequired",
                "browser_snapshot",
                "browserSnapshot",
            ],
        )
}

pub(super) fn is_empty_browser_start_event(
    event_type: &str,
    candidates: &[&Value],
    artifact_path: Option<&str>,
) -> bool {
    event_type == "item.started"
        && artifact_path.is_none()
        && !has_any_key(
            candidates,
            &[
                "browserSessionId",
                "browser_session_id",
                "sessionId",
                "session_id",
                "targetId",
                "target_id",
                "browser_action",
                "browserAction",
                "browser_session",
                "browserSession",
                "browser_snapshot",
                "browserSnapshot",
            ],
        )
}

pub(super) fn tool_name_from_value(value: &Value) -> Option<String> {
    first_string(
        &browser_candidate_values(value),
        &["toolName", "tool_name", "name"],
    )
}

pub(super) fn browser_confirmation_request_id(value: &Value) -> Option<String> {
    for path in [
        &["action_required", "requestId"][..],
        &["action_required", "request_id"][..],
        &["actionRequired", "requestId"][..],
        &["actionRequired", "request_id"][..],
        &["browser_action_trace", "requestId"][..],
        &["browser_action_trace", "request_id"][..],
        &["browserActionTrace", "requestId"][..],
        &["browserActionTrace", "request_id"][..],
        &["payload", "action_required", "requestId"][..],
        &["payload", "action_required", "request_id"][..],
        &["payload", "browser_action_trace", "requestId"][..],
        &["payload", "browser_action_trace", "request_id"][..],
        &["result", "action_required", "requestId"][..],
        &["result", "action_required", "request_id"][..],
        &["result", "browser_action_trace", "requestId"][..],
        &["result", "browser_action_trace", "request_id"][..],
        &["result", "data", "action_required", "requestId"][..],
        &["result", "data", "action_required", "request_id"][..],
        &["result", "data", "browser_action_trace", "requestId"][..],
        &["result", "data", "browser_action_trace", "request_id"][..],
        &["data", "action_required", "requestId"][..],
        &["data", "action_required", "request_id"][..],
        &["data", "browser_action_trace", "requestId"][..],
        &["data", "browser_action_trace", "request_id"][..],
    ] {
        if let Some(value) = value_at_path(value, path).and_then(value_string) {
            return Some(value);
        }
    }
    None
}

pub(super) fn infer_action_from_tool_name(tool_name: Option<&str>) -> Option<String> {
    let normalized = tool_name?.trim().to_ascii_lowercase();
    if normalized.contains("navigate") {
        Some("navigate".to_string())
    } else if normalized.contains("click") {
        Some("click".to_string())
    } else if normalized.contains("snapshot") || normalized.contains("observe") {
        Some("read_page".to_string())
    } else {
        None
    }
}

pub(super) fn infer_executor_from_tool_name(tool_name: Option<&str>) -> Option<String> {
    let normalized = tool_name?.trim().to_ascii_lowercase();
    if normalized.contains("mcp__lime-browser__") {
        Some("mcp__lime-browser".to_string())
    } else if normalized.contains("browser") {
        Some("browser".to_string())
    } else {
        None
    }
}

pub(super) fn infer_browser_artifact_kind(
    action: Option<&str>,
    candidates: &[&Value],
    tool_name: Option<&str>,
) -> Option<String> {
    if tool_name.is_some_and(|tool_name| tool_name.to_ascii_lowercase().contains("snapshot"))
        || action
            .is_some_and(|action| matches!(action, "read_page" | "get_page_info" | "get_page_text"))
        || has_any_key(
            candidates,
            &["page_info", "pageInfo", "markdown", "screenshot"],
        )
    {
        return Some("browser_snapshot".to_string());
    }
    if action.is_some_and(is_browser_action)
        || has_any_key(candidates, &["browserSessionId", "browser_session_id"])
    {
        return Some("browser_session".to_string());
    }
    None
}

fn is_browser_action(action: &str) -> bool {
    matches!(
        action.trim(),
        "navigate"
            | "read_page"
            | "get_page_info"
            | "get_page_text"
            | "read_console_messages"
            | "read_network_requests"
            | "click"
            | "type"
            | "form_input"
            | "submit"
            | "select"
            | "check"
            | "uncheck"
            | "press"
            | "drag"
            | "drop"
            | "upload"
            | "file_upload"
            | "download"
            | "javascript"
            | "execute_javascript"
            | "scroll"
            | "find"
    )
}

pub(super) fn is_browser_artifact_kind(kind: &str) -> bool {
    matches!(kind.trim(), "browser_session" | "browser_snapshot")
}

pub(super) fn first_string(candidates: &[&Value], keys: &[&str]) -> Option<String> {
    for candidate in candidates {
        for key in keys {
            if let Some(value) = candidate.get(*key).and_then(value_string) {
                return Some(value);
            }
        }
    }
    None
}

pub(super) fn first_bool(candidates: &[&Value], keys: &[&str]) -> Option<bool> {
    for candidate in candidates {
        for key in keys {
            if let Some(value) = candidate.get(*key).and_then(Value::as_bool) {
                return Some(value);
            }
        }
    }
    None
}

pub(super) fn first_string_list(candidates: &[&Value], keys: &[&str]) -> Vec<String> {
    let mut values = Vec::new();
    for candidate in candidates {
        for key in keys {
            let Some(value) = candidate.get(*key) else {
                continue;
            };
            match value {
                Value::Array(items) => {
                    for item in items {
                        if let Some(text) = value_string(item) {
                            push_unique_string(&mut values, text);
                        }
                    }
                }
                _ => {
                    if let Some(text) = value_string(value) {
                        push_unique_string(&mut values, text);
                    }
                }
            }
        }
    }
    values
}

fn push_unique_string(values: &mut Vec<String>, value: String) {
    if !values.iter().any(|existing| existing == &value) {
        values.push(value);
    }
}

pub(super) fn first_u64(candidates: &[&Value], keys: &[&str]) -> Option<u64> {
    for candidate in candidates {
        for key in keys {
            if let Some(value) = candidate.get(*key).and_then(Value::as_u64) {
                return Some(value);
            }
        }
    }
    None
}

pub(super) fn has_any_key(candidates: &[&Value], keys: &[&str]) -> bool {
    candidates
        .iter()
        .any(|candidate| keys.iter().any(|key| candidate.get(*key).is_some()))
}

fn value_string(value: &Value) -> Option<String> {
    value
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

pub(super) fn browser_action_status_from_candidates(candidates: &[&Value]) -> Option<String> {
    first_string(candidates, &["status"]).or_else(|| {
        first_string(candidates, &["type"]).and_then(|event_type| match event_type.trim() {
            "command_completed" => Some("completed".to_string()),
            "command_failed" => Some("failed".to_string()),
            "command_started" => Some("started".to_string()),
            _ => None,
        })
    })
}

pub(super) fn event_status_label(event_type: &str) -> &'static str {
    match event_type {
        "item.completed" => "completed",
        "item.started" | "item.updated" => "started",
        "action.required" => "pending",
        "action.resolved" => "completed",
        _ => "recorded",
    }
}
