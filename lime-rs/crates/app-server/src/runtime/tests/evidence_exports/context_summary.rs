use super::*;

#[tokio::test]
async fn export_evidence_pack_includes_context_fragment_summary_from_turn_metadata() {
    let core = RuntimeCore::default();
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_context_evidence".to_string()),
        thread_id: Some("thread_context_evidence".to_string()),
        app_id: "content-studio".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");
    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_context_evidence".to_string(),
            turn_id: Some("turn_context_evidence".to_string()),
            input: AgentInput {
                text: "导出 context evidence".to_string(),
                attachments: Vec::new(),
            },
            runtime_options: Some(RuntimeOptions {
                runtime_request: Some(RuntimeRequest {
                    metadata: Some(json!({
                    "context_packet_telemetry": {
                        "schema": "context_packet_assembly.v1",
                        "packetCount": 2,
                        "admittedCount": 2,
                        "rejectedCount": 0,
                        "totalTokens": 1708,
                        "packets": [
                            {
                                "id": "session.context_compaction",
                                "kind": "session_context_compaction",
                                "source": "session.compaction",
                                "actualTokens": 1600,
                                "admitted": true,
                                "fragmentEnvelope": {
                                    "fragment_id": "session.context_compaction",
                                    "source": {
                                        "kind": "session.compaction",
                                        "label": "session_context_compaction"
                                    },
                                    "model_visible_preview": "SHOULD_NOT_EXPORT_CONTEXT_PREVIEW",
                                    "sidecar_reference": {
                                        "kind": "session_context_compaction",
                                        "uri": "sessions/sess_context_evidence/context/session-summary.md",
                                        "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                                    },
                                    "budget_decision": {
                                        "estimated_tokens": 2200,
                                        "max_model_visible_tokens": 1600,
                                        "status": "preview_with_reference"
                                    }
                                }
                            },
                            {
                                "id": "memory.summary",
                                "kind": "long_term_memory_summary",
                                "source": "memory.store",
                                "actualTokens": 108,
                                "admitted": true,
                                "fragmentEnvelope": {
                                    "fragment_id": "memory.summary",
                                    "source": {
                                        "kind": "memory.store",
                                        "label": "long_term_memory_summary"
                                    },
                                    "model_visible_preview": "ALSO_REDACTED_CONTEXT_PREVIEW",
                                    "budget_decision": {
                                        "estimated_tokens": 108,
                                        "max_model_visible_tokens": 1200,
                                        "status": "inline"
                                    }
                                }
                            }
                        ]
                    }
                    })),
                    ..RuntimeRequest::default()
                }),
                ..RuntimeOptions::default()
            }),
            queue_if_busy: false,
            skip_pre_submit_resume: false,
        },
        RuntimeHostContext::default(),
    )
    .await
    .expect("turn");

    let response = core
        .export_evidence(EvidenceExportParams {
            session_id: "sess_context_evidence".to_string(),
            turn_id: Some("turn_context_evidence".to_string()),
            include_events: Some(true),
            include_artifacts: Some(true),
            include_evidence_pack: Some(true),
        })
        .await
        .expect("export evidence");

    let evidence_pack = response.evidence_pack.expect("evidence pack");
    let context_summary = evidence_pack
        .observability_summary
        .as_ref()
        .and_then(|summary| summary.get("context"))
        .expect("context evidence summary");
    assert_eq!(
        context_summary["schemaVersion"],
        "context-evidence-summary.v1"
    );
    assert_eq!(context_summary["packetCount"], 2);
    assert_eq!(context_summary["admittedCount"], 2);
    assert_eq!(context_summary["rejectedCount"], 0);
    assert_eq!(context_summary["fragmentCount"], 2);
    assert_eq!(context_summary["modelPreviewRedactedCount"], 2);
    assert_eq!(context_summary["sidecarReferenceCount"], 1);
    assert_eq!(
        context_summary["budgetStatusBreakdown"]["preview_with_reference"],
        1
    );
    assert_eq!(context_summary["budgetStatusBreakdown"]["inline"], 1);
    assert_json_array_contains(context_summary, "sourceTurnIds", "turn_context_evidence");
    assert_context_source_count(
        context_summary,
        "session.compaction",
        "session_context_compaction",
        1,
    );
    assert_context_source_count(
        context_summary,
        "memory.store",
        "long_term_memory_summary",
        1,
    );
    assert!(context_summary["sidecarReferences"]
        .as_array()
        .is_some_and(|items| items.iter().any(|item| {
            item["kind"] == "session_context_compaction"
                && item["uri"] == "sessions/sess_context_evidence/context/session-summary.md"
                && item["sha256Present"] == true
                && item.get("sha256").is_none()
        })));
    let summary_text = context_summary.to_string();
    assert!(!summary_text.contains("SHOULD_NOT_EXPORT_CONTEXT_PREVIEW"));
    assert!(!summary_text.contains("ALSO_REDACTED_CONTEXT_PREVIEW"));
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

fn assert_context_source_count(
    value: &serde_json::Value,
    kind: &str,
    label: &str,
    expected_count: u64,
) {
    assert!(
        value
            .get("sources")
            .and_then(serde_json::Value::as_array)
            .is_some_and(|items| items.iter().any(|item| {
                item["kind"] == kind && item["label"] == label && item["count"] == expected_count
            })),
        "sources should contain {kind}/{label} count {expected_count}; actual={:?}",
        value.get("sources")
    );
}
