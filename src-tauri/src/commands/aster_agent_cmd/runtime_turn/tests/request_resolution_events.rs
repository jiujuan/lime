use super::*;

#[test]
fn collect_runtime_request_resolution_side_events_should_emit_routing_chain() {
    let metadata = json!({
        "lime_runtime": {
            "task_profile": {
                "kind": "translation",
                "source": "translation_skill_launch",
                "traits": ["service_model_slot"],
                "serviceModelSlot": "translation"
            },
            "routing_decision": {
                "routingMode": "single_candidate",
                "decisionSource": "service_model_setting",
                "decisionReason": "命中 service_models.translation",
                "selectedProvider": "openai",
                "selectedModel": "gpt-4.1-mini",
                "candidateCount": 1,
                "fallbackChain": ["service_models.translation -> session_default"]
            },
            "limit_state": {
                "status": "single_candidate_only",
                "singleCandidateOnly": true,
                "providerLocked": true,
                "settingsLocked": true,
                "oemLocked": false,
                "candidateCount": 1,
                "capabilityGap": "tools_missing"
            },
            "cost_state": {
                "status": "estimated",
                "estimatedCostClass": "low"
            },
            "limit_event": {
                "eventKind": "quota_low",
                "message": "OEM 云端额度偏低",
                "retryable": true
            }
        }
    });

    let events = collect_runtime_request_resolution_side_events(Some(&metadata))
        .into_iter()
        .map(|event| {
            serde_json::to_value(event)
                .ok()
                .and_then(|value| {
                    value
                        .get("type")
                        .and_then(Value::as_str)
                        .map(str::to_string)
                })
                .expect("应能序列化 runtime event")
        })
        .collect::<Vec<_>>();

    assert_eq!(
        events,
        vec![
            "task_profile_resolved".to_string(),
            "candidate_set_resolved".to_string(),
            "routing_decision_made".to_string(),
            "routing_fallback_applied".to_string(),
            "limit_state_updated".to_string(),
            "single_candidate_only".to_string(),
            "single_candidate_capability_gap".to_string(),
            "cost_estimated".to_string(),
            "quota_low".to_string(),
        ]
    );
}

#[test]
fn collect_runtime_request_resolution_side_events_should_cover_generation_topic_current_chain() {
    let metadata = json!({
        "lime_runtime": {
            "task_profile": {
                "kind": "generation_topic",
                "source": "auxiliary_generation_topic",
                "traits": ["service_model_slot"],
                "serviceModelSlot": "generation_topic"
            },
            "routing_decision": {
                "routingMode": "single_candidate",
                "decisionSource": "service_model_setting",
                "decisionReason": "命中 service_models.generation_topic",
                "selectedProvider": "openai",
                "selectedModel": "gpt-5.4-mini",
                "candidateCount": 1,
                "fallbackChain": []
            },
            "limit_state": {
                "status": "single_candidate_only",
                "singleCandidateOnly": true,
                "providerLocked": false,
                "settingsLocked": true,
                "oemLocked": false,
                "candidateCount": 1
            },
            "cost_state": {
                "status": "estimated",
                "estimatedCostClass": "low"
            }
        }
    });

    let events = collect_runtime_request_resolution_side_events(Some(&metadata))
        .into_iter()
        .map(|event| {
            serde_json::to_value(event)
                .ok()
                .and_then(|value| {
                    value
                        .get("type")
                        .and_then(Value::as_str)
                        .map(str::to_string)
                })
                .expect("应能序列化 runtime event")
        })
        .collect::<Vec<_>>();

    assert_eq!(
        events,
        vec![
            "task_profile_resolved".to_string(),
            "candidate_set_resolved".to_string(),
            "routing_decision_made".to_string(),
            "limit_state_updated".to_string(),
            "single_candidate_only".to_string(),
            "cost_estimated".to_string(),
        ]
    );
}

#[test]
fn collect_runtime_request_resolution_side_events_should_emit_routing_not_possible() {
    let metadata = json!({
        "lime_runtime": {
            "routing_decision": {
                "routingMode": "no_candidate",
                "decisionSource": "auto_default",
                "decisionReason": "当前没有可用候选",
                "candidateCount": 0
            },
            "limit_state": {
                "status": "no_candidate",
                "singleCandidateOnly": false,
                "providerLocked": false,
                "settingsLocked": false,
                "oemLocked": false,
                "candidateCount": 0
            }
        }
    });

    let events = collect_runtime_request_resolution_side_events(Some(&metadata))
        .into_iter()
        .map(|event| {
            serde_json::to_value(event)
                .ok()
                .and_then(|value| {
                    value
                        .get("type")
                        .and_then(Value::as_str)
                        .map(str::to_string)
                })
                .expect("应能序列化 runtime event")
        })
        .collect::<Vec<_>>();

    assert_eq!(
        events,
        vec![
            "candidate_set_resolved".to_string(),
            "routing_decision_made".to_string(),
            "routing_not_possible".to_string(),
            "limit_state_updated".to_string(),
        ]
    );
}

#[test]
fn collect_runtime_request_resolution_side_events_should_emit_permission_review_status() {
    let metadata = json!({
        "lime_runtime": {
            "permission_state": {
                "status": "requires_confirmation",
                "requiredProfileKeys": ["read_files", "write_artifacts"],
                "askProfileKeys": ["read_files", "write_artifacts"],
                "blockingProfileKeys": [],
                "decisionSource": "modality_execution_profile",
                "decisionScope": "declared_profile",
                "confirmationStatus": "not_requested",
                "confirmationSource": "declared_profile_only"
            }
        }
    });

    let values = collect_runtime_request_resolution_side_events(Some(&metadata))
        .into_iter()
        .map(|event| serde_json::to_value(event).expect("应能序列化 runtime event"))
        .collect::<Vec<_>>();

    assert_eq!(values.len(), 1);
    assert_eq!(
        values[0].get("type").and_then(Value::as_str),
        Some("runtime_status")
    );
    let status = values[0]
        .get("status")
        .expect("runtime status event 应包含 status");
    assert_eq!(
        status.get("phase").and_then(Value::as_str),
        Some("permission_review")
    );
    assert_eq!(
        status
            .pointer("/metadata/permission_status")
            .and_then(Value::as_str),
        Some("requires_confirmation")
    );
    assert_eq!(
        status
            .pointer("/metadata/confirmation_status")
            .and_then(Value::as_str),
        Some("not_requested")
    );
    assert_eq!(
        status
            .pointer("/metadata/confirmation_request_id")
            .and_then(Value::as_str),
        None
    );
    assert_eq!(
        status
            .pointer("/metadata/confirmation_source")
            .and_then(Value::as_str),
        Some("declared_profile_only")
    );
    assert_eq!(
        status
            .pointer("/metadata/declared_only")
            .and_then(Value::as_bool),
        Some(true)
    );
    assert_eq!(
        status
            .pointer("/metadata/turn_gating")
            .and_then(Value::as_bool),
        Some(true)
    );
    assert_eq!(
        status
            .pointer("/metadata/ask_profile_keys")
            .and_then(Value::as_array)
            .map(Vec::len),
        Some(2)
    );
    assert!(status
        .get("detail")
        .and_then(Value::as_str)
        .is_some_and(|detail| detail.contains("模型执行前阻断")));
}

#[test]
fn collect_runtime_request_resolution_side_events_should_not_emit_permission_review_for_not_required(
) {
    let metadata = json!({
        "lime_runtime": {
            "permission_state": {
                "status": "not_required",
                "requiredProfileKeys": [],
                "askProfileKeys": [],
                "blockingProfileKeys": [],
                "decisionSource": "modality_execution_profile",
                "decisionScope": "declared_profile"
            }
        }
    });

    let events = collect_runtime_request_resolution_side_events(Some(&metadata));

    assert!(events.is_empty());
}
