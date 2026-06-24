use app_server_protocol::AgentEvent;
use app_server_protocol::ArtifactSummary;
use app_server_protocol::EvidencePackArtifact;
use serde_json::json;
use serde_json::Map;
use serde_json::Value;
use std::collections::BTreeMap;
use std::collections::BTreeSet;

#[derive(Debug, Clone, Default)]
struct BrowserActionItem {
    artifact_path: Option<String>,
    artifact_kind: String,
    tool_name: Option<String>,
    action: Option<String>,
    action_id: Option<String>,
    status: String,
    success: Option<bool>,
    session_id: Option<String>,
    target_id: Option<String>,
    tab_id: Option<String>,
    profile_key: Option<String>,
    backend: Option<String>,
    request_id: Option<String>,
    thread_id: Option<String>,
    turn_id: Option<String>,
    content_id: Option<String>,
    executor: Option<String>,
    evidence_refs: Vec<String>,
    last_url: Option<String>,
    title: Option<String>,
    attempt_count: Option<u64>,
    observation_available: bool,
    screenshot_available: bool,
}

pub(super) fn browser_action_index_summary(
    events: &[AgentEvent],
    artifacts: &[ArtifactSummary],
) -> Option<Value> {
    let items = collect_browser_action_items(events, artifacts);
    if items.is_empty() {
        return None;
    }

    let mut session_ids = BTreeSet::new();
    let mut target_ids = BTreeSet::new();
    let mut profile_keys = BTreeSet::new();
    let mut status_counts = BTreeMap::new();
    let mut artifact_kind_counts = BTreeMap::new();
    let mut action_counts = BTreeMap::new();
    let mut backend_counts = BTreeMap::new();
    let mut executor_counts = BTreeMap::new();
    let mut thread_ids = BTreeSet::new();
    let mut turn_ids = BTreeSet::new();
    let mut content_ids = BTreeSet::new();
    let mut last_url = None;

    for item in &items {
        if let Some(thread_id) = item.thread_id.as_deref() {
            thread_ids.insert(thread_id.to_string());
        }
        if let Some(turn_id) = item.turn_id.as_deref() {
            turn_ids.insert(turn_id.to_string());
        }
        if let Some(content_id) = item.content_id.as_deref() {
            content_ids.insert(content_id.to_string());
        }
        if let Some(session_id) = item.session_id.as_deref() {
            session_ids.insert(session_id.to_string());
        }
        if let Some(target_id) = item.target_id.as_deref() {
            target_ids.insert(target_id.to_string());
        }
        if let Some(profile_key) = item.profile_key.as_deref() {
            profile_keys.insert(profile_key.to_string());
        }
        if let Some(action) = item.action.as_deref() {
            increment_count(&mut action_counts, action);
        }
        if let Some(backend) = item.backend.as_deref() {
            increment_count(&mut backend_counts, backend);
        }
        if let Some(executor) = item.executor.as_deref() {
            increment_count(&mut executor_counts, executor);
        }
        increment_count(&mut status_counts, &item.status);
        increment_count(&mut artifact_kind_counts, &item.artifact_kind);
        if item.last_url.is_some() {
            last_url = item.last_url.clone();
        }
    }

    Some(json!({
        "action_count": items.len(),
        "session_count": session_ids.len(),
        "observation_count": items.iter().filter(|item| item.observation_available).count(),
        "screenshot_count": items.iter().filter(|item| item.screenshot_available).count(),
        "last_url": last_url,
        "thread_ids": thread_ids.into_iter().collect::<Vec<_>>(),
        "turn_ids": turn_ids.into_iter().collect::<Vec<_>>(),
        "content_ids": content_ids.into_iter().collect::<Vec<_>>(),
        "session_ids": session_ids.into_iter().collect::<Vec<_>>(),
        "target_ids": target_ids.into_iter().collect::<Vec<_>>(),
        "profile_keys": profile_keys.into_iter().collect::<Vec<_>>(),
        "status_counts": count_entries(status_counts, "status"),
        "artifact_kind_counts": count_entries(artifact_kind_counts, "artifact_kind"),
        "action_counts": count_entries(action_counts, "action"),
        "backend_counts": count_entries(backend_counts, "backend"),
        "executor_counts": count_entries(executor_counts, "executor"),
        "items": items.into_iter().map(browser_action_item_value).collect::<Vec<_>>(),
    }))
}

pub(super) fn browser_evidence_artifacts(
    events: &[AgentEvent],
    artifacts: &[ArtifactSummary],
) -> Vec<EvidencePackArtifact> {
    collect_browser_action_items(events, artifacts)
        .into_iter()
        .filter_map(|item| {
            let relative_path = item.artifact_path.clone()?;
            Some(EvidencePackArtifact {
                kind: item.artifact_kind.clone(),
                title: browser_artifact_title(&item),
                relative_path,
                absolute_path: None,
                bytes: 0,
            })
        })
        .collect()
}

fn collect_browser_action_items(
    events: &[AgentEvent],
    artifacts: &[ArtifactSummary],
) -> Vec<BrowserActionItem> {
    let mut items = Vec::new();
    let mut seen = BTreeSet::new();

    for event in events {
        if let Some(item) = browser_action_item_from_event(event) {
            let key = item_dedupe_key(&item, event.event_id.as_str());
            if seen.insert(key) {
                items.push(item);
            }
        }
    }

    for artifact in artifacts {
        if let Some(item) = browser_action_item_from_artifact(artifact) {
            let key = item_dedupe_key(&item, artifact.artifact_ref.as_str());
            if seen.insert(key) {
                items.push(item);
            }
        }
    }

    items
}

fn browser_action_item_from_event(event: &AgentEvent) -> Option<BrowserActionItem> {
    let candidates = browser_candidate_values(&event.payload);
    let tool_name = tool_name_from_event(event);
    let action = first_string(&candidates, &["action", "operation"])
        .or_else(|| infer_action_from_tool_name(tool_name.as_deref()));
    let artifact_kind = first_string(
        &candidates,
        &[
            "artifactKind",
            "artifact_kind",
            "kind",
            "evidenceKind",
            "evidence_kind",
        ],
    )
    .or_else(|| infer_browser_artifact_kind(action.as_deref(), &candidates, tool_name.as_deref()));
    let artifact_path = first_string(
        &candidates,
        &[
            "artifactPath",
            "artifact_path",
            "relativePath",
            "relative_path",
            "browserSessionArtifactPath",
            "browser_session_artifact_path",
            "browserSnapshotArtifactPath",
            "browser_snapshot_artifact_path",
            "snapshotPath",
            "snapshot_path",
            "screenshotPath",
            "screenshot_path",
        ],
    );

    if !is_browser_record(
        &candidates,
        tool_name.as_deref(),
        action.as_deref(),
        artifact_kind.as_deref(),
    ) || is_empty_browser_start_event(
        event.event_type.as_str(),
        &candidates,
        artifact_path.as_deref(),
    ) {
        return None;
    }

    let status = browser_action_status_from_candidates(&candidates)
        .unwrap_or_else(|| event_status_label(event.event_type.as_str()).to_string());
    let success = first_bool(&candidates, &["success", "ok"]);
    let observation_available = first_bool(
        &candidates,
        &["observationAvailable", "observation_available"],
    )
    .unwrap_or(false)
        || action.as_deref().is_some_and(|action| {
            matches!(action, "read_page" | "get_page_info" | "get_page_text")
        })
        || has_any_key(
            &candidates,
            &["page_info", "pageInfo", "markdown", "accessibility"],
        );
    let screenshot_available = first_bool(
        &candidates,
        &["screenshotAvailable", "screenshot_available"],
    )
    .unwrap_or(false)
        || has_any_key(
            &candidates,
            &[
                "screenshot",
                "screenshotPath",
                "screenshot_path",
                "screenshotUrl",
                "screenshot_url",
            ],
        );

    Some(BrowserActionItem {
        artifact_path,
        artifact_kind: artifact_kind.unwrap_or_else(|| "browser_session".to_string()),
        tool_name: tool_name.clone(),
        action,
        action_id: first_string(
            &candidates,
            &[
                "actionId",
                "action_id",
                "commandId",
                "command_id",
                "requestId",
                "request_id",
            ],
        ),
        status,
        success,
        session_id: first_string(
            &candidates,
            &[
                "browserSessionId",
                "browser_session_id",
                "sessionId",
                "session_id",
            ],
        ),
        target_id: first_string(&candidates, &["targetId", "target_id", "tabId", "tab_id"]),
        tab_id: first_string(&candidates, &["tabId", "tab_id", "targetId", "target_id"]),
        profile_key: first_string(&candidates, &["profileKey", "profile_key"]),
        backend: first_string(
            &candidates,
            &[
                "backend",
                "transportKind",
                "transport_kind",
                "adapterKind",
                "adapter_kind",
            ],
        ),
        request_id: first_string(
            &candidates,
            &[
                "requestId",
                "request_id",
                "toolCallId",
                "tool_call_id",
                "actionId",
                "action_id",
                "commandId",
                "command_id",
            ],
        )
        .or_else(|| Some(event.event_id.clone())),
        thread_id: event.thread_id.clone().or_else(|| {
            first_string(
                &candidates,
                &[
                    "threadId",
                    "thread_id",
                    "sessionThreadId",
                    "session_thread_id",
                ],
            )
        }),
        turn_id: event.turn_id.clone().or_else(|| {
            first_string(
                &candidates,
                &["turnId", "turn_id", "sessionTurnId", "session_turn_id"],
            )
        }),
        content_id: first_string(
            &candidates,
            &[
                "contentId",
                "content_id",
                "itemId",
                "item_id",
                "messageId",
                "message_id",
                "artifactId",
                "artifact_id",
            ],
        ),
        executor: first_string(
            &candidates,
            &[
                "executor",
                "executorKind",
                "executor_kind",
                "executorId",
                "executor_id",
                "toolExecutor",
                "tool_executor",
            ],
        )
        .or_else(|| infer_executor_from_tool_name(tool_name.as_deref())),
        evidence_refs: first_string_list(&candidates, &["evidenceRefs", "evidence_refs"]),
        last_url: first_string(
            &candidates,
            &[
                "lastUrl",
                "last_url",
                "url",
                "href",
                "targetUrl",
                "target_url",
            ],
        ),
        title: first_string(&candidates, &["title", "targetTitle", "target_title"]),
        attempt_count: first_u64(&candidates, &["attemptCount", "attempt_count"]),
        observation_available,
        screenshot_available,
    })
}

fn browser_action_item_from_artifact(artifact: &ArtifactSummary) -> Option<BrowserActionItem> {
    let metadata = artifact.metadata.as_ref()?;
    let candidates = browser_candidate_values(metadata);
    let artifact_kind = first_string(&candidates, &["artifactKind", "artifact_kind", "kind"])
        .or_else(|| artifact.kind.clone())
        .filter(|kind| is_browser_artifact_kind(kind));
    if artifact_kind.is_none()
        && !is_browser_record(&candidates, None, None, artifact.kind.as_deref())
    {
        return None;
    }

    let artifact_path = first_string(
        &candidates,
        &[
            "artifactPath",
            "artifact_path",
            "relativePath",
            "relative_path",
        ],
    )
    .or_else(|| artifact.path.clone())
    .or_else(|| Some(artifact.artifact_ref.clone()));
    let action = first_string(&candidates, &["action", "operation"]);
    let observation_available = first_bool(
        &candidates,
        &["observationAvailable", "observation_available"],
    )
    .unwrap_or(false)
        || has_any_key(&candidates, &["page_info", "pageInfo", "markdown"]);
    let screenshot_available = first_bool(
        &candidates,
        &["screenshotAvailable", "screenshot_available"],
    )
    .unwrap_or(false)
        || has_any_key(
            &candidates,
            &["screenshot", "screenshotPath", "screenshot_path"],
        );

    Some(BrowserActionItem {
        artifact_path,
        artifact_kind: artifact_kind.unwrap_or_else(|| "browser_snapshot".to_string()),
        tool_name: first_string(&candidates, &["toolName", "tool_name"]),
        action,
        action_id: first_string(
            &candidates,
            &[
                "actionId",
                "action_id",
                "commandId",
                "command_id",
                "requestId",
                "request_id",
            ],
        ),
        status: first_string(&candidates, &["status"])
            .or_else(|| artifact.status.clone())
            .unwrap_or_else(|| "completed".to_string()),
        success: first_bool(&candidates, &["success", "ok"]),
        session_id: first_string(
            &candidates,
            &[
                "browserSessionId",
                "browser_session_id",
                "sessionId",
                "session_id",
            ],
        ),
        target_id: first_string(&candidates, &["targetId", "target_id", "tabId", "tab_id"]),
        tab_id: first_string(&candidates, &["tabId", "tab_id", "targetId", "target_id"]),
        profile_key: first_string(&candidates, &["profileKey", "profile_key"]),
        backend: first_string(&candidates, &["backend", "transportKind", "transport_kind"]),
        request_id: first_string(
            &candidates,
            &[
                "requestId",
                "request_id",
                "actionId",
                "action_id",
                "commandId",
                "command_id",
            ],
        ),
        thread_id: first_string(&candidates, &["threadId", "thread_id"]),
        turn_id: artifact
            .turn_id
            .clone()
            .or_else(|| first_string(&candidates, &["turnId", "turn_id"])),
        content_id: artifact.artifact_id.clone().or_else(|| {
            first_string(
                &candidates,
                &[
                    "contentId",
                    "content_id",
                    "itemId",
                    "item_id",
                    "messageId",
                    "message_id",
                    "artifactId",
                    "artifact_id",
                ],
            )
        }),
        executor: first_string(
            &candidates,
            &[
                "executor",
                "executorKind",
                "executor_kind",
                "executorId",
                "executor_id",
                "toolExecutor",
                "tool_executor",
            ],
        )
        .or_else(|| {
            infer_executor_from_tool_name(
                first_string(&candidates, &["toolName", "tool_name"]).as_deref(),
            )
        }),
        evidence_refs: first_string_list(&candidates, &["evidenceRefs", "evidence_refs"]),
        last_url: first_string(
            &candidates,
            &[
                "lastUrl",
                "last_url",
                "url",
                "href",
                "targetUrl",
                "target_url",
            ],
        ),
        title: first_string(&candidates, &["title", "targetTitle", "target_title"])
            .or_else(|| artifact.title.clone()),
        attempt_count: first_u64(&candidates, &["attemptCount", "attempt_count"]),
        observation_available,
        screenshot_available,
    })
}

fn browser_candidate_values(value: &Value) -> Vec<&Value> {
    let mut candidates = Vec::new();
    push_candidate(value, &mut candidates);
    for path in [
        &["metadata"][..],
        &["arguments"][..],
        &["payload"][..],
        &["payload", "browser_action_trace"][..],
        &["payload", "browserActionTrace"][..],
        &["payload", "browser_action"][..],
        &["payload", "browserAction"][..],
        &["result"][..],
        &["result", "browser_action_trace"][..],
        &["result", "browserActionTrace"][..],
        &["result", "metadata"][..],
        &["result", "data"][..],
        &["result", "data", "browser_action_trace"][..],
        &["result", "data", "browserActionTrace"][..],
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

fn is_browser_record(
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
                "browser_snapshot",
                "browserSnapshot",
            ],
        )
}

fn is_empty_browser_start_event(
    event_type: &str,
    candidates: &[&Value],
    artifact_path: Option<&str>,
) -> bool {
    matches!(event_type, "tool.started" | "item.started")
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

fn tool_name_from_event(event: &AgentEvent) -> Option<String> {
    first_string(
        &browser_candidate_values(&event.payload),
        &["toolName", "tool_name", "name"],
    )
}

fn infer_action_from_tool_name(tool_name: Option<&str>) -> Option<String> {
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

fn infer_executor_from_tool_name(tool_name: Option<&str>) -> Option<String> {
    let normalized = tool_name?.trim().to_ascii_lowercase();
    if normalized.contains("mcp__lime-browser__") {
        Some("mcp__lime-browser".to_string())
    } else if normalized.contains("browser") {
        Some("browser".to_string())
    } else {
        None
    }
}

fn infer_browser_artifact_kind(
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
            | "javascript"
            | "scroll"
            | "find"
    )
}

fn is_browser_artifact_kind(kind: &str) -> bool {
    matches!(kind.trim(), "browser_session" | "browser_snapshot")
}

fn first_string(candidates: &[&Value], keys: &[&str]) -> Option<String> {
    for candidate in candidates {
        for key in keys {
            if let Some(value) = candidate.get(*key).and_then(value_string) {
                return Some(value);
            }
        }
    }
    None
}

fn first_bool(candidates: &[&Value], keys: &[&str]) -> Option<bool> {
    for candidate in candidates {
        for key in keys {
            if let Some(value) = candidate.get(*key).and_then(Value::as_bool) {
                return Some(value);
            }
        }
    }
    None
}

fn first_string_list(candidates: &[&Value], keys: &[&str]) -> Vec<String> {
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

fn first_u64(candidates: &[&Value], keys: &[&str]) -> Option<u64> {
    for candidate in candidates {
        for key in keys {
            if let Some(value) = candidate.get(*key).and_then(Value::as_u64) {
                return Some(value);
            }
        }
    }
    None
}

fn has_any_key(candidates: &[&Value], keys: &[&str]) -> bool {
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

fn browser_action_status_from_candidates(candidates: &[&Value]) -> Option<String> {
    first_string(candidates, &["status"]).or_else(|| {
        first_string(candidates, &["type"]).and_then(|event_type| match event_type.trim() {
            "command_completed" => Some("completed".to_string()),
            "command_failed" => Some("failed".to_string()),
            "command_started" => Some("started".to_string()),
            _ => None,
        })
    })
}

fn event_status_label(event_type: &str) -> &'static str {
    match event_type {
        "tool.failed" => "failed",
        "item.completed" | "tool.result" => "completed",
        "item.started" | "item.updated" | "tool.started" => "started",
        "action.required" => "pending",
        "action.resolved" => "completed",
        _ => "recorded",
    }
}

fn increment_count(counts: &mut BTreeMap<String, usize>, key: &str) {
    *counts.entry(key.to_string()).or_insert(0) += 1;
}

fn count_entries(counts: BTreeMap<String, usize>, key_name: &str) -> Vec<Value> {
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

fn browser_action_item_value(item: BrowserActionItem) -> Value {
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

fn browser_artifact_title(item: &BrowserActionItem) -> String {
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

fn item_dedupe_key(item: &BrowserActionItem, fallback: &str) -> String {
    format!(
        "{}:{}:{}:{}",
        item.artifact_kind,
        item.artifact_path.as_deref().unwrap_or_default(),
        item.request_id.as_deref().unwrap_or(fallback),
        item.action.as_deref().unwrap_or_default()
    )
}
