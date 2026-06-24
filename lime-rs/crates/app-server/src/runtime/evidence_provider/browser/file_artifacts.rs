use app_server_protocol::AgentEvent;
use app_server_protocol::ArtifactSummary;
use app_server_protocol::EvidencePackArtifact;
use serde_json::json;
use serde_json::Map;
use serde_json::Value;
use std::collections::BTreeMap;
use std::collections::BTreeSet;

#[derive(Debug, Clone, Default)]
struct BrowserFileEvidenceItem {
    artifact_kind: String,
    artifact_path: String,
    title: Option<String>,
    status: Option<String>,
    session_id: Option<String>,
    tab_id: Option<String>,
    action_id: Option<String>,
    evidence_refs: Vec<String>,
    entry_count: Option<u64>,
    bytes: usize,
}

pub(super) fn browser_file_evidence_summary(
    events: &[AgentEvent],
    artifacts: &[ArtifactSummary],
) -> Option<Value> {
    let items = collect_browser_file_items(events, artifacts);
    if items.is_empty() {
        return None;
    }

    let mut kind_counts = BTreeMap::new();
    let mut session_ids = BTreeSet::new();
    let mut tab_ids = BTreeSet::new();
    let mut action_ids = BTreeSet::new();
    let mut evidence_ref_count = 0usize;

    for item in &items {
        increment_count(&mut kind_counts, &item.artifact_kind);
        if let Some(session_id) = item.session_id.as_deref() {
            session_ids.insert(session_id.to_string());
        }
        if let Some(tab_id) = item.tab_id.as_deref() {
            tab_ids.insert(tab_id.to_string());
        }
        if let Some(action_id) = item.action_id.as_deref() {
            action_ids.insert(action_id.to_string());
        }
        evidence_ref_count += item.evidence_refs.len();
    }

    Some(json!({
        "artifact_count": items.len(),
        "network_log_count": items.iter().filter(|item| item.artifact_kind == "browser_network_log").count(),
        "console_log_count": items.iter().filter(|item| item.artifact_kind == "browser_console_log").count(),
        "screenshot_count": items.iter().filter(|item| item.artifact_kind == "browser_screenshot").count(),
        "dom_snapshot_count": items.iter().filter(|item| item.artifact_kind == "browser_dom_snapshot").count(),
        "accessibility_snapshot_count": items.iter().filter(|item| item.artifact_kind == "browser_accessibility_snapshot").count(),
        "evidence_ref_count": evidence_ref_count,
        "kind_counts": count_entries(kind_counts, "artifact_kind"),
        "session_ids": session_ids.into_iter().collect::<Vec<_>>(),
        "tab_ids": tab_ids.into_iter().collect::<Vec<_>>(),
        "action_ids": action_ids.into_iter().collect::<Vec<_>>(),
        "items": items.into_iter().map(browser_file_item_value).collect::<Vec<_>>(),
    }))
}

pub(super) fn browser_file_evidence_artifacts(
    events: &[AgentEvent],
    artifacts: &[ArtifactSummary],
) -> Vec<EvidencePackArtifact> {
    collect_browser_file_items(events, artifacts)
        .into_iter()
        .map(|item| EvidencePackArtifact {
            kind: item.artifact_kind.clone(),
            title: browser_file_artifact_title(&item),
            relative_path: item.artifact_path.clone(),
            absolute_path: None,
            bytes: item.bytes,
        })
        .collect()
}

fn collect_browser_file_items(
    events: &[AgentEvent],
    artifacts: &[ArtifactSummary],
) -> Vec<BrowserFileEvidenceItem> {
    let mut items = Vec::new();
    let mut seen = BTreeSet::new();

    for event in events {
        for candidate in browser_file_candidate_values(&event.payload) {
            if let Some(item) =
                browser_file_item_from_candidate(candidate, Some(event.event_type.as_str()), None)
            {
                let key = item_dedupe_key(&item, event.event_id.as_str());
                if seen.insert(key) {
                    items.push(item);
                }
            }
        }
    }

    for artifact in artifacts {
        let Some(metadata) = artifact.metadata.as_ref() else {
            continue;
        };
        for candidate in browser_file_candidate_values(metadata) {
            if let Some(item) = browser_file_item_from_candidate(candidate, None, Some(artifact)) {
                let key = item_dedupe_key(&item, artifact.artifact_ref.as_str());
                if seen.insert(key) {
                    items.push(item);
                }
            }
        }
    }

    items
}

fn browser_file_item_from_candidate(
    candidate: &Value,
    event_type: Option<&str>,
    artifact: Option<&ArtifactSummary>,
) -> Option<BrowserFileEvidenceItem> {
    let artifact_kind = first_string(candidate, &["artifactKind", "artifact_kind", "kind"])
        .or_else(|| artifact.and_then(|artifact| artifact.kind.clone()))
        .and_then(|kind| canonical_file_kind(kind.as_str()))
        .or_else(|| infer_file_kind(candidate))?;
    let artifact_path = first_string(
        candidate,
        &[
            "artifactPath",
            "artifact_path",
            "relativePath",
            "relative_path",
            "browserNetworkLogPath",
            "browser_network_log_path",
            "networkLogPath",
            "network_log_path",
            "browserConsoleLogPath",
            "browser_console_log_path",
            "consoleLogPath",
            "console_log_path",
            "browserScreenshotPath",
            "browser_screenshot_path",
            "screenshotPath",
            "screenshot_path",
            "browserDomSnapshotPath",
            "browser_dom_snapshot_path",
            "domSnapshotPath",
            "dom_snapshot_path",
            "browserAccessibilitySnapshotPath",
            "browser_accessibility_snapshot_path",
            "accessibilitySnapshotPath",
            "accessibility_snapshot_path",
        ],
    )
    .or_else(|| artifact.and_then(|artifact| artifact.path.clone()))
    .or_else(|| artifact.map(|artifact| artifact.artifact_ref.clone()))?;

    Some(BrowserFileEvidenceItem {
        artifact_kind,
        artifact_path,
        title: first_string(candidate, &["title", "artifactTitle", "artifact_title"])
            .or_else(|| artifact.and_then(|artifact| artifact.title.clone())),
        status: first_string(candidate, &["status"])
            .or_else(|| artifact.and_then(|artifact| artifact.status.clone()))
            .or_else(|| event_type.map(event_status_label).map(ToOwned::to_owned)),
        session_id: first_string(
            candidate,
            &[
                "browserSessionId",
                "browser_session_id",
                "sessionId",
                "session_id",
            ],
        ),
        tab_id: first_string(candidate, &["tabId", "tab_id", "targetId", "target_id"]),
        action_id: first_string(
            candidate,
            &[
                "actionId",
                "action_id",
                "commandId",
                "command_id",
                "requestId",
                "request_id",
            ],
        ),
        evidence_refs: first_string_list(candidate, &["evidenceRefs", "evidence_refs"]),
        entry_count: first_u64(
            candidate,
            &["entryCount", "entry_count", "messageCount", "message_count"],
        ),
        bytes: first_u64(candidate, &["bytes", "byteCount", "byte_count"])
            .and_then(|bytes| usize::try_from(bytes).ok())
            .unwrap_or(0),
    })
}

fn browser_file_candidate_values(value: &Value) -> Vec<&Value> {
    let mut candidates = Vec::new();
    push_candidate(value, &mut candidates);
    for path in [
        &["metadata"][..],
        &["result"][..],
        &["result", "data"][..],
        &["result", "data", "browser_network_log"][..],
        &["result", "data", "browserNetworkLog"][..],
        &["result", "data", "browser_console_log"][..],
        &["result", "data", "browserConsoleLog"][..],
        &["result", "data", "browser_screenshot"][..],
        &["result", "data", "browserScreenshot"][..],
        &["result", "data", "browser_dom_snapshot"][..],
        &["result", "data", "browserDomSnapshot"][..],
        &["result", "data", "browser_accessibility_snapshot"][..],
        &["result", "data", "browserAccessibilitySnapshot"][..],
        &["data"][..],
        &["data", "browser_network_log"][..],
        &["data", "browserNetworkLog"][..],
        &["data", "browser_console_log"][..],
        &["data", "browserConsoleLog"][..],
        &["data", "browser_screenshot"][..],
        &["data", "browserScreenshot"][..],
        &["data", "browser_dom_snapshot"][..],
        &["data", "browserDomSnapshot"][..],
        &["data", "browser_accessibility_snapshot"][..],
        &["data", "browserAccessibilitySnapshot"][..],
        &["browser_network_log"][..],
        &["browserNetworkLog"][..],
        &["browser_console_log"][..],
        &["browserConsoleLog"][..],
        &["browser_screenshot"][..],
        &["browserScreenshot"][..],
        &["browser_dom_snapshot"][..],
        &["browserDomSnapshot"][..],
        &["browser_accessibility_snapshot"][..],
        &["browserAccessibilitySnapshot"][..],
        &["item", "payload"][..],
        &["item", "payload", "result"][..],
        &["item", "payload", "result", "data"][..],
        &["item", "payload", "result", "data", "browser_network_log"][..],
        &["item", "payload", "result", "data", "browserNetworkLog"][..],
        &["item", "payload", "result", "data", "browser_console_log"][..],
        &["item", "payload", "result", "data", "browserConsoleLog"][..],
        &["item", "payload", "result", "data", "browser_screenshot"][..],
        &["item", "payload", "result", "data", "browserScreenshot"][..],
        &["item", "payload", "result", "data", "browser_dom_snapshot"][..],
        &["item", "payload", "result", "data", "browserDomSnapshot"][..],
        &[
            "item",
            "payload",
            "result",
            "data",
            "browser_accessibility_snapshot",
        ][..],
        &[
            "item",
            "payload",
            "result",
            "data",
            "browserAccessibilitySnapshot",
        ][..],
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

fn canonical_file_kind(kind: &str) -> Option<String> {
    match kind.trim() {
        "browser_network_log" | "browser_network_requests" => {
            Some("browser_network_log".to_string())
        }
        "browser_console_log" | "browser_console_messages" => {
            Some("browser_console_log".to_string())
        }
        "browser_screenshot" | "browser_screenshot_file" => Some("browser_screenshot".to_string()),
        "browser_dom_snapshot" | "browser_dom" => Some("browser_dom_snapshot".to_string()),
        "browser_accessibility_snapshot" | "browser_accessibility" => {
            Some("browser_accessibility_snapshot".to_string())
        }
        _ => None,
    }
}

fn infer_file_kind(candidate: &Value) -> Option<String> {
    if has_any_key(
        candidate,
        &[
            "browserNetworkLogPath",
            "browser_network_log_path",
            "networkLogPath",
            "network_log_path",
        ],
    ) {
        return Some("browser_network_log".to_string());
    }
    if has_any_key(
        candidate,
        &[
            "browserConsoleLogPath",
            "browser_console_log_path",
            "consoleLogPath",
            "console_log_path",
        ],
    ) {
        return Some("browser_console_log".to_string());
    }
    if has_any_key(
        candidate,
        &[
            "browserScreenshotPath",
            "browser_screenshot_path",
            "screenshotPath",
            "screenshot_path",
        ],
    ) {
        return Some("browser_screenshot".to_string());
    }
    if has_any_key(
        candidate,
        &[
            "browserDomSnapshotPath",
            "browser_dom_snapshot_path",
            "domSnapshotPath",
            "dom_snapshot_path",
        ],
    ) {
        return Some("browser_dom_snapshot".to_string());
    }
    if has_any_key(
        candidate,
        &[
            "browserAccessibilitySnapshotPath",
            "browser_accessibility_snapshot_path",
            "accessibilitySnapshotPath",
            "accessibility_snapshot_path",
        ],
    ) {
        return Some("browser_accessibility_snapshot".to_string());
    }
    None
}

fn first_string(candidate: &Value, keys: &[&str]) -> Option<String> {
    for key in keys {
        if let Some(value) = candidate.get(*key).and_then(value_string) {
            return Some(value);
        }
    }
    None
}

fn first_string_list(candidate: &Value, keys: &[&str]) -> Vec<String> {
    let mut values = Vec::new();
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
    values
}

fn push_unique_string(values: &mut Vec<String>, value: String) {
    if !values.iter().any(|existing| existing == &value) {
        values.push(value);
    }
}

fn first_u64(candidate: &Value, keys: &[&str]) -> Option<u64> {
    for key in keys {
        if let Some(value) = candidate.get(*key).and_then(Value::as_u64) {
            return Some(value);
        }
    }
    None
}

fn has_any_key(candidate: &Value, keys: &[&str]) -> bool {
    keys.iter().any(|key| candidate.get(*key).is_some())
}

fn value_string(value: &Value) -> Option<String> {
    value
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn event_status_label(event_type: &str) -> &'static str {
    match event_type {
        "tool.failed" => "failed",
        "item.completed" | "tool.result" => "completed",
        "item.started" | "item.updated" | "tool.started" => "started",
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

fn browser_file_item_value(item: BrowserFileEvidenceItem) -> Value {
    let mut value = Map::new();
    value.insert("artifact_kind".to_string(), json!(item.artifact_kind));
    value.insert("artifact_path".to_string(), json!(item.artifact_path));
    insert_optional(&mut value, "title", item.title);
    insert_optional(&mut value, "status", item.status);
    insert_optional(&mut value, "session_id", item.session_id);
    insert_optional(&mut value, "tab_id", item.tab_id);
    insert_optional(&mut value, "action_id", item.action_id);
    if !item.evidence_refs.is_empty() {
        value.insert("evidence_refs".to_string(), json!(item.evidence_refs));
    }
    if let Some(entry_count) = item.entry_count {
        value.insert("entry_count".to_string(), json!(entry_count));
    }
    if item.bytes > 0 {
        value.insert("bytes".to_string(), json!(item.bytes));
    }
    Value::Object(value)
}

fn insert_optional(value: &mut Map<String, Value>, key: &str, item: Option<String>) {
    if let Some(item) = item {
        value.insert(key.to_string(), json!(item));
    }
}

fn browser_file_artifact_title(item: &BrowserFileEvidenceItem) -> String {
    item.title
        .clone()
        .unwrap_or_else(|| match item.artifact_kind.as_str() {
            "browser_network_log" => "Browser network log".to_string(),
            "browser_console_log" => "Browser console log".to_string(),
            "browser_screenshot" => "Browser screenshot".to_string(),
            "browser_dom_snapshot" => "Browser DOM snapshot".to_string(),
            "browser_accessibility_snapshot" => "Browser accessibility snapshot".to_string(),
            _ => item.artifact_kind.clone(),
        })
}

fn item_dedupe_key(item: &BrowserFileEvidenceItem, fallback: &str) -> String {
    format!(
        "{}:{}:{}",
        item.artifact_kind,
        item.artifact_path,
        item.action_id.as_deref().unwrap_or(fallback)
    )
}
