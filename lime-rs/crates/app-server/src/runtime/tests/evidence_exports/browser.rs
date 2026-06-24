use super::*;

#[tokio::test]
async fn export_evidence_pack_includes_browser_session_and_snapshot_artifacts() {
    let core = RuntimeCore::default();
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_browser_evidence".to_string()),
        thread_id: Some("thread_browser_evidence".to_string()),
        app_id: "agent-runtime".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");
    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_browser_evidence".to_string(),
            turn_id: Some("turn_browser_evidence".to_string()),
            input: AgentInput {
                text: "打开浏览器并读取页面".to_string(),
                attachments: Vec::new(),
            },
            runtime_options: None,
            queue_if_busy: false,
            skip_pre_submit_resume: false,
        },
        RuntimeHostContext::default(),
    )
    .await
    .expect("turn");
    core.append_external_runtime_events(
        "sess_browser_evidence",
        Some("turn_browser_evidence"),
        vec![
            RuntimeEvent::new(
                "tool.started",
                json!({
                    "toolCallId": "browser_tool_navigate_1"
                }),
            ),
            RuntimeEvent::new(
                "tool.result",
                json!({
                    "toolCallId": "browser_tool_navigate_1",
                    "toolName": "mcp__lime-browser__navigate",
                    "result": {
                        "data": {
                            "browser_session": {
                                "artifactKind": "browser_session",
                                "artifactPath": "browser/sess_browser_1/session.json",
                                "action": "navigate",
                                "status": "completed",
                                "success": true,
                                "browserSessionId": "browser-session-1",
                                "targetId": "target-1",
                                "profileKey": "task-profile-1",
                                "backend": "cdp",
                                "requestId": "browser-action-1",
                                "lastUrl": "https://example.test/",
                                "title": "Example"
                            },
                            "browser_action_trace": {
                                "schemaVersion": "browser-action-trace.v1",
                                "sessionId": "browser-session-1",
                                "tabId": "target-1",
                                "actionId": "browser-action-1",
                                "action": "navigate",
                                "contentId": "content-browser-1",
                                "executor": "mcp__lime-browser",
                                "status": "completed",
                                "success": true,
                                "evidenceRefs": [
                                    "browser_session:browser-session-1",
                                    "browser_action:browser-session-1:browser-action-1",
                                    "browser_network:browser-session-1:browser-action-1",
                                    "browser_console:browser-session-1:browser-action-1",
                                    "browser_screenshot:browser-session-1:browser-action-1",
                                    "browser_dom:browser-session-1:browser-action-1",
                                    "browser_accessibility:browser-session-1:browser-action-1"
                                ]
                            },
                            "browser_network_log": {
                                "artifactKind": "browser_network_log",
                                "artifactPath": "browser/sess_browser_1/network/network-1.json",
                                "status": "completed",
                                "browserSessionId": "browser-session-1",
                                "tabId": "target-1",
                                "actionId": "browser-action-1",
                                "entryCount": 2,
                                "bytes": 320,
                                "evidenceRefs": [
                                    "browser_action:browser-session-1:browser-action-1",
                                    "browser_network:browser-session-1:browser-action-1"
                                ]
                            },
                            "browser_console_log": {
                                "artifactKind": "browser_console_log",
                                "artifactPath": "browser/sess_browser_1/console/console-1.json",
                                "status": "completed",
                                "browserSessionId": "browser-session-1",
                                "tabId": "target-1",
                                "actionId": "browser-action-1",
                                "entryCount": 1,
                                "bytes": 128,
                                "evidenceRefs": [
                                    "browser_action:browser-session-1:browser-action-1",
                                    "browser_console:browser-session-1:browser-action-1"
                                ]
                            },
                            "browser_screenshot": {
                                "artifactKind": "browser_screenshot",
                                "artifactPath": "browser/sess_browser_1/screenshots/browser-action-1.png",
                                "status": "completed",
                                "browserSessionId": "browser-session-1",
                                "tabId": "target-1",
                                "actionId": "browser-action-1",
                                "entryCount": 1,
                                "bytes": 2048,
                                "evidenceRefs": [
                                    "browser_action:browser-session-1:browser-action-1",
                                    "browser_screenshot:browser-session-1:browser-action-1"
                                ]
                            },
                            "browser_dom_snapshot": {
                                "artifactKind": "browser_dom_snapshot",
                                "artifactPath": "browser/sess_browser_1/dom/dom-1.json",
                                "status": "completed",
                                "browserSessionId": "browser-session-1",
                                "tabId": "target-1",
                                "actionId": "browser-action-1",
                                "entryCount": 1,
                                "bytes": 4096,
                                "evidenceRefs": [
                                    "browser_action:browser-session-1:browser-action-1",
                                    "browser_dom:browser-session-1:browser-action-1"
                                ]
                            },
                            "browser_accessibility_snapshot": {
                                "artifactKind": "browser_accessibility_snapshot",
                                "artifactPath": "browser/sess_browser_1/accessibility/ax-1.json",
                                "status": "completed",
                                "browserSessionId": "browser-session-1",
                                "tabId": "target-1",
                                "actionId": "browser-action-1",
                                "entryCount": 1,
                                "bytes": 1536,
                                "evidenceRefs": [
                                    "browser_action:browser-session-1:browser-action-1",
                                    "browser_accessibility:browser-session-1:browser-action-1"
                                ]
                            },
                            "page_info": {
                                "url": "https://example.test/",
                                "title": "Example"
                            }
                        }
                    }
                }),
            ),
            RuntimeEvent::new(
                "artifact.snapshot",
                json!({
                    "artifact": {
                            "artifactId": "browser_snapshot_1",
                            "path": "browser/sess_browser_1/snapshots/snapshot-1.json",
                        "kind": "browser_snapshot",
                        "title": "Example snapshot",
                        "metadata": {
                            "artifactKind": "browser_snapshot",
                            "action": "read_page",
                            "status": "completed",
                            "browserSessionId": "browser-session-1",
                            "targetId": "target-1",
                            "profileKey": "task-profile-1",
                            "backend": "cdp",
                            "requestId": "browser-action-2",
                            "threadId": "thread_browser_evidence",
                            "contentId": "content-browser-2",
                            "executor": "mcp__lime-browser",
                            "lastUrl": "https://example.test/",
                            "title": "Example snapshot",
                            "observationAvailable": true,
                            "screenshotAvailable": true,
                            "screenshotPath": "browser/sess_browser_1/screenshots/snapshot-1.png"
                        }
                    }
                }),
            ),
        ],
    )
    .expect("append browser evidence events");

    let response = core
        .export_evidence(EvidenceExportParams {
            session_id: "sess_browser_evidence".to_string(),
            turn_id: Some("turn_browser_evidence".to_string()),
            include_events: Some(true),
            include_artifacts: Some(true),
            include_evidence_pack: Some(true),
        })
        .await
        .expect("export browser evidence");

    let evidence_pack = response.evidence_pack.expect("evidence pack");
    assert!(evidence_pack.artifacts.iter().any(|artifact| {
        artifact.kind == "browser_session"
            && artifact.relative_path == "browser/sess_browser_1/session.json"
    }));
    assert!(evidence_pack.artifacts.iter().any(|artifact| {
        artifact.kind == "browser_snapshot"
            && artifact.relative_path == "browser/sess_browser_1/snapshots/snapshot-1.json"
    }));
    assert!(evidence_pack.artifacts.iter().any(|artifact| {
        artifact.kind == "browser_network_log"
            && artifact.relative_path == "browser/sess_browser_1/network/network-1.json"
            && artifact.bytes == 320
    }));
    assert!(evidence_pack.artifacts.iter().any(|artifact| {
        artifact.kind == "browser_console_log"
            && artifact.relative_path == "browser/sess_browser_1/console/console-1.json"
            && artifact.bytes == 128
    }));
    assert!(evidence_pack.artifacts.iter().any(|artifact| {
        artifact.kind == "browser_screenshot"
            && artifact.relative_path == "browser/sess_browser_1/screenshots/browser-action-1.png"
            && artifact.bytes == 2048
    }));
    assert!(evidence_pack.artifacts.iter().any(|artifact| {
        artifact.kind == "browser_dom_snapshot"
            && artifact.relative_path == "browser/sess_browser_1/dom/dom-1.json"
            && artifact.bytes == 4096
    }));
    assert!(evidence_pack.artifacts.iter().any(|artifact| {
        artifact.kind == "browser_accessibility_snapshot"
            && artifact.relative_path == "browser/sess_browser_1/accessibility/ax-1.json"
            && artifact.bytes == 1536
    }));
    assert!(evidence_pack.artifacts.iter().any(|artifact| {
        artifact.kind == "browser_screenshot"
            && artifact.relative_path == "browser/sess_browser_1/screenshots/snapshot-1.png"
    }));

    let browser_action_index = evidence_pack
        .observability_summary
        .as_ref()
        .and_then(|summary| summary.get("modality_runtime_contracts"))
        .and_then(|contracts| contracts.get("snapshot_index"))
        .and_then(|snapshot_index| snapshot_index.get("browser_action_index"))
        .expect("browser action index");
    assert_eq!(browser_action_index["action_count"], 2);
    assert_eq!(browser_action_index["session_count"], 1);
    assert_eq!(browser_action_index["observation_count"], 2);
    assert_eq!(browser_action_index["screenshot_count"], 1);
    assert_eq!(browser_action_index["last_url"], "https://example.test/");
    assert_json_array_contains(
        browser_action_index,
        "thread_ids",
        "thread_browser_evidence",
    );
    assert_json_array_contains(browser_action_index, "turn_ids", "turn_browser_evidence");
    assert_json_array_contains(browser_action_index, "content_ids", "content-browser-1");
    assert_json_array_contains(browser_action_index, "content_ids", "browser_snapshot_1");
    assert_json_array_contains(browser_action_index, "session_ids", "browser-session-1");
    assert_json_array_contains(browser_action_index, "target_ids", "target-1");
    assert_json_array_contains(browser_action_index, "profile_keys", "task-profile-1");
    assert_count_entry(
        browser_action_index,
        "executor_counts",
        "executor",
        "mcp__lime-browser",
        2,
    );
    let trace_item = browser_action_index["items"]
        .as_array()
        .and_then(|items| {
            items.iter().find(|item| {
                item.get("action").and_then(serde_json::Value::as_str) == Some("navigate")
            })
        })
        .expect("navigate trace item");
    assert_eq!(trace_item["action_id"], "browser-action-1");
    assert_eq!(trace_item["thread_id"], "thread_browser_evidence");
    assert_eq!(trace_item["turn_id"], "turn_browser_evidence");
    assert_eq!(trace_item["content_id"], "content-browser-1");
    assert_eq!(trace_item["executor"], "mcp__lime-browser");
    assert_eq!(trace_item["tab_id"], "target-1");
    assert_json_array_contains(
        trace_item,
        "evidence_refs",
        "browser_action:browser-session-1:browser-action-1",
    );
    assert_json_array_contains(
        trace_item,
        "evidence_refs",
        "browser_network:browser-session-1:browser-action-1",
    );
    assert_json_array_contains(
        trace_item,
        "evidence_refs",
        "browser_console:browser-session-1:browser-action-1",
    );
    assert_json_array_contains(
        trace_item,
        "evidence_refs",
        "browser_screenshot:browser-session-1:browser-action-1",
    );
    assert_json_array_contains(
        trace_item,
        "evidence_refs",
        "browser_dom:browser-session-1:browser-action-1",
    );
    assert_json_array_contains(
        trace_item,
        "evidence_refs",
        "browser_accessibility:browser-session-1:browser-action-1",
    );

    let modality_runtime_contracts = evidence_pack
        .observability_summary
        .as_ref()
        .and_then(|summary| summary.get("modality_runtime_contracts"))
        .expect("modality runtime contracts");
    assert_eq!(modality_runtime_contracts["snapshot_count"], 2);
    let browser_file_artifacts = modality_runtime_contracts
        .get("file_evidence")
        .and_then(|file_evidence| file_evidence.get("browser_file_artifacts"))
        .expect("browser file artifacts");
    assert_eq!(browser_file_artifacts["artifact_count"], 6);
    assert_eq!(browser_file_artifacts["network_log_count"], 1);
    assert_eq!(browser_file_artifacts["console_log_count"], 1);
    assert_eq!(browser_file_artifacts["screenshot_count"], 2);
    assert_eq!(browser_file_artifacts["dom_snapshot_count"], 1);
    assert_eq!(browser_file_artifacts["accessibility_snapshot_count"], 1);
    assert_eq!(browser_file_artifacts["evidence_ref_count"], 10);
    assert_json_array_contains(browser_file_artifacts, "session_ids", "browser-session-1");
    assert_json_array_contains(browser_file_artifacts, "tab_ids", "target-1");
    assert_json_array_contains(browser_file_artifacts, "action_ids", "browser-action-1");
    let network_item = browser_file_artifacts["items"]
        .as_array()
        .and_then(|items| {
            items.iter().find(|item| {
                item.get("artifact_kind")
                    .and_then(serde_json::Value::as_str)
                    == Some("browser_network_log")
            })
        })
        .expect("network file item");
    assert_eq!(network_item["entry_count"], 2);
    assert_json_array_contains(
        network_item,
        "evidence_refs",
        "browser_network:browser-session-1:browser-action-1",
    );
}

fn assert_json_array_contains(value: &serde_json::Value, key: &str, expected: &str) {
    assert!(
        value
            .get(key)
            .and_then(serde_json::Value::as_array)
            .is_some_and(|items| items.iter().any(|item| item.as_str() == Some(expected))),
        "{key} should contain {expected}; actual={:?}",
        value.get(key)
    );
}

fn assert_count_entry(
    value: &serde_json::Value,
    key: &str,
    field: &str,
    expected: &str,
    expected_count: u64,
) {
    assert!(
        value
            .get(key)
            .and_then(serde_json::Value::as_array)
            .is_some_and(|items| {
                items.iter().any(|item| {
                    item.get(field).and_then(serde_json::Value::as_str) == Some(expected)
                        && item.get("count").and_then(serde_json::Value::as_u64)
                            == Some(expected_count)
                })
            }),
        "{key} should contain {field}={expected} count={expected_count}; actual={:?}",
        value.get(key)
    );
}
