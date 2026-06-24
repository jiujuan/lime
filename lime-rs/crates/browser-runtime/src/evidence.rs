use crate::types::BrowserEvent;
use serde_json::{json, Map, Value};

#[derive(Debug)]
pub struct BrowserActionEvidenceInput {
    pub session_id: String,
    pub tab_id: Option<String>,
    pub action_id: String,
    pub action: String,
    pub network_events: Vec<BrowserEvent>,
    pub console_events: Vec<BrowserEvent>,
    pub screenshot_bytes: Option<usize>,
    pub dom_snapshot_bytes: Option<usize>,
    pub accessibility_snapshot_bytes: Option<usize>,
    pub force_network_log: bool,
    pub force_console_log: bool,
}

pub fn new_browser_action_id() -> String {
    format!("browser-action-{}", uuid::Uuid::new_v4())
}

pub fn attach_browser_action_evidence(result: Value, input: BrowserActionEvidenceInput) -> Value {
    let mut object = match result {
        Value::Object(object) => object,
        value => {
            let mut object = Map::new();
            object.insert("value".to_string(), value);
            object
        }
    };

    object
        .entry("actionId".to_string())
        .or_insert_with(|| json!(input.action_id.clone()));

    if input.force_network_log || !input.network_events.is_empty() {
        object
            .entry("browser_network_log".to_string())
            .or_insert_with(|| {
                file_artifact_value(
                    "browser_network_log",
                    "network",
                    "json",
                    &input,
                    input.network_events.len(),
                    serialized_size(&input.network_events),
                    "browser_network",
                )
            });
    }

    if input.force_console_log || !input.console_events.is_empty() {
        object
            .entry("browser_console_log".to_string())
            .or_insert_with(|| {
                file_artifact_value(
                    "browser_console_log",
                    "console",
                    "json",
                    &input,
                    input.console_events.len(),
                    serialized_size(&input.console_events),
                    "browser_console",
                )
            });
    }

    if let Some(bytes) = input.screenshot_bytes {
        object
            .entry("browser_screenshot".to_string())
            .or_insert_with(|| {
                file_artifact_value(
                    "browser_screenshot",
                    "screenshots",
                    "png",
                    &input,
                    1,
                    bytes,
                    "browser_screenshot",
                )
            });
    }

    if let Some(bytes) = input.dom_snapshot_bytes {
        object
            .entry("browser_dom_snapshot".to_string())
            .or_insert_with(|| {
                file_artifact_value(
                    "browser_dom_snapshot",
                    "dom",
                    "json",
                    &input,
                    1,
                    bytes,
                    "browser_dom",
                )
            });
    }

    if let Some(bytes) = input.accessibility_snapshot_bytes {
        object
            .entry("browser_accessibility_snapshot".to_string())
            .or_insert_with(|| {
                file_artifact_value(
                    "browser_accessibility_snapshot",
                    "accessibility",
                    "json",
                    &input,
                    1,
                    bytes,
                    "browser_accessibility",
                )
            });
    }

    Value::Object(object)
}

fn file_artifact_value(
    artifact_kind: &str,
    folder: &str,
    extension: &str,
    input: &BrowserActionEvidenceInput,
    entry_count: usize,
    bytes: usize,
    evidence_ref_kind: &str,
) -> Value {
    json!({
        "artifactKind": artifact_kind,
        "artifactPath": browser_artifact_path(&input.session_id, folder, &input.action_id, extension),
        "title": format!("{} {}", input.action, artifact_kind),
        "status": "completed",
        "browserSessionId": input.session_id.clone(),
        "tabId": input.tab_id.clone(),
        "actionId": input.action_id.clone(),
        "entryCount": entry_count,
        "bytes": bytes,
        "evidenceRefs": [
            format!("browser_action:{}:{}", input.session_id, input.action_id),
            format!("{}:{}:{}", evidence_ref_kind, input.session_id, input.action_id),
        ],
    })
}

fn browser_artifact_path(
    session_id: &str,
    folder: &str,
    action_id: &str,
    extension: &str,
) -> String {
    format!(
        "browser/{}/{}/{}.{}",
        sanitize_path_segment(session_id),
        folder,
        sanitize_path_segment(action_id),
        extension
    )
}

fn sanitize_path_segment(value: &str) -> String {
    let sanitized = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_') {
                ch
            } else {
                '_'
            }
        })
        .collect::<String>();
    let trimmed = sanitized.trim_matches('_');
    if trimmed.is_empty() {
        "unknown".to_string()
    } else {
        trimmed.to_string()
    }
}

fn serialized_size<T: serde::Serialize>(value: &T) -> usize {
    serde_json::to_vec(value)
        .map(|bytes| bytes.len())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::BrowserEventPayload;

    #[test]
    fn attaches_network_console_and_screenshot_metadata() {
        let result = attach_browser_action_evidence(
            json!({ "page_info": { "title": "Example", "url": "https://example.test/" } }),
            BrowserActionEvidenceInput {
                session_id: "session:1".to_string(),
                tab_id: Some("tab-1".to_string()),
                action_id: "browser-action:1".to_string(),
                action: "read_page".to_string(),
                network_events: vec![event(BrowserEventPayload::NetworkRequest {
                    request_id: "request-1".to_string(),
                    url: "https://example.test/".to_string(),
                    method: "GET".to_string(),
                })],
                console_events: vec![event(BrowserEventPayload::ConsoleMessage {
                    level: "log".to_string(),
                    text: "ready".to_string(),
                    timestamp: 1,
                })],
                screenshot_bytes: Some(42),
                dom_snapshot_bytes: Some(512),
                accessibility_snapshot_bytes: Some(256),
                force_network_log: false,
                force_console_log: false,
            },
        );

        assert_eq!(result["actionId"], "browser-action:1");
        assert_eq!(
            result["browser_network_log"]["artifactPath"],
            "browser/session_1/network/browser-action_1.json"
        );
        assert_eq!(result["browser_network_log"]["entryCount"], 1);
        assert_eq!(result["browser_console_log"]["entryCount"], 1);
        assert_eq!(result["browser_screenshot"]["bytes"], 42);
        assert_eq!(result["browser_dom_snapshot"]["bytes"], 512);
        assert_eq!(result["browser_accessibility_snapshot"]["bytes"], 256);
        assert_eq!(
            result["browser_dom_snapshot"]["evidenceRefs"][1],
            "browser_dom:session:1:browser-action:1"
        );
        assert_eq!(
            result["browser_accessibility_snapshot"]["evidenceRefs"][1],
            "browser_accessibility:session:1:browser-action:1"
        );
    }

    #[test]
    fn can_force_empty_read_logs() {
        let result = attach_browser_action_evidence(
            json!({}),
            BrowserActionEvidenceInput {
                session_id: "session-1".to_string(),
                tab_id: None,
                action_id: "action-1".to_string(),
                action: "read_network_requests".to_string(),
                network_events: Vec::new(),
                console_events: Vec::new(),
                screenshot_bytes: None,
                dom_snapshot_bytes: None,
                accessibility_snapshot_bytes: None,
                force_network_log: true,
                force_console_log: false,
            },
        );

        assert_eq!(result["browser_network_log"]["entryCount"], 0);
        assert!(result.get("browser_console_log").is_none());
    }

    fn event(payload: BrowserEventPayload) -> BrowserEvent {
        BrowserEvent {
            session_id: "session-1".to_string(),
            sequence: 1,
            occurred_at: "2026-06-24T00:00:00Z".to_string(),
            payload,
        }
    }
}
