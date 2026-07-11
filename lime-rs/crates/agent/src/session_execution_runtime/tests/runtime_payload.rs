use super::{
    build_session_execution_runtime, runtime_snapshot_record, runtime_thread_snapshot_record,
};
use crate::session_execution_runtime::runtime_payload::{
    apply_usage_to_cost_state, detect_runtime_limit_event,
};
use crate::{SessionExecutionRuntimeCostState, SessionExecutionRuntimeLimitEvent};
use agent_protocol::turn_context::TurnContextOverride;
use aster::Session;
use chrono::Utc;
use serde_json::json;
use std::path::PathBuf;
use thread_store::runtime_snapshot::{RuntimeTurnSnapshotRecord, RuntimeTurnStatusRecord};

#[test]
fn extracts_task_routing_and_limit_state_from_lime_runtime_metadata() {
    let now = Utc::now();
    let snapshot = runtime_snapshot_record(
        "session-routing",
        vec![runtime_thread_snapshot_record(
            "thread-1",
            "session-routing",
            PathBuf::from("/tmp/workspace"),
            vec![RuntimeTurnSnapshotRecord {
                id: "turn-1".to_string(),
                session_id: "session-routing".to_string(),
                thread_id: "thread-1".to_string(),
                status: RuntimeTurnStatusRecord::Completed,
                input_text: Some("继续处理翻译任务".to_string()),
                error_message: None,
                context_override: Some(TurnContextOverride {
                    metadata: [(
                        "lime_runtime".to_string(),
                        json!({
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
                                "estimatedCostClass": "low",
                                "settingsSource": "service_models.translation",
                                "serviceModelSlot": "translation"
                            },
                            "limit_state": {
                                "status": "single_candidate_only",
                                "singleCandidateOnly": true,
                                "providerLocked": true,
                                "settingsLocked": true,
                                "oemLocked": false,
                                "candidateCount": 1,
                                "notes": ["命中设置中的翻译模型"]
                            },
                            "permission_state": {
                                "status": "requires_confirmation",
                                "requiredProfileKeys": ["read_files", "write_artifacts", "request_user_input"],
                                "askProfileKeys": ["read_files", "write_artifacts"],
                                "blockingProfileKeys": [],
                                "decisionSource": "execution_profile_registry",
                                "decisionScope": "declared_permission_profiles_only",
                                "confirmationStatus": "not_requested",
                                "confirmationSource": "declared_profile_only",
                                "notes": ["只记录声明，不执行真实授权。"]
                            }
                        }),
                    )]
                    .into_iter()
                    .collect(),
                    ..TurnContextOverride::default()
                }),
                output_schema_runtime: None,
                created_at: now,
                started_at: Some(now),
                completed_at: Some(now),
                updated_at: now,
            }],
            Vec::new(),
        )],
    );

    let runtime =
        build_session_execution_runtime("session-routing", None, None, Some(&snapshot), None)
            .expect("runtime");

    assert_eq!(
        runtime
            .task_profile
            .as_ref()
            .map(|value| value.kind.as_str()),
        Some("translation")
    );
    assert_eq!(
        runtime
            .routing_decision
            .as_ref()
            .map(|value| value.decision_source.as_str()),
        Some("service_model_setting")
    );
    assert_eq!(
        runtime
            .limit_state
            .as_ref()
            .map(|value| value.single_candidate_only),
        Some(true)
    );
    let permission_state = runtime
        .permission_state
        .as_ref()
        .expect("permission state should be extracted");
    assert_eq!(permission_state.status, "requires_confirmation");
    assert_eq!(
        permission_state.required_profile_keys,
        vec![
            "read_files".to_string(),
            "write_artifacts".to_string(),
            "request_user_input".to_string()
        ]
    );
    assert_eq!(
        permission_state.ask_profile_keys,
        vec!["read_files".to_string(), "write_artifacts".to_string()]
    );
    assert!(permission_state.blocking_profile_keys.is_empty());
    assert_eq!(
        permission_state.confirmation_status.as_deref(),
        Some("not_requested")
    );
    assert!(permission_state.confirmation_request_id.is_none());
    assert_eq!(
        permission_state.confirmation_source.as_deref(),
        Some("declared_profile_only")
    );
    assert_eq!(
        runtime
            .cost_state
            .as_ref()
            .and_then(|value| value.estimated_cost_class.as_deref()),
        None
    );
    assert!(runtime.limit_event.is_none());
}

#[test]
fn extracts_plugin_scope_from_lime_runtime_summary_fallback() {
    let now = Utc::now();
    let snapshot = runtime_snapshot_record(
        "session-plugin",
        vec![runtime_thread_snapshot_record(
            "thread-1",
            "session-plugin",
            PathBuf::from("/tmp/workspace"),
            vec![RuntimeTurnSnapshotRecord {
                id: "turn-1".to_string(),
                session_id: "session-plugin".to_string(),
                thread_id: "thread-1".to_string(),
                status: RuntimeTurnStatusRecord::Completed,
                input_text: Some("内容工厂任务".to_string()),
                error_message: None,
                context_override: Some(TurnContextOverride {
                    metadata: [(
                        "lime_runtime".to_string(),
                        json!({
                            "surface": "plugin",
                            "app_id": "content-factory-app",
                            "task_id": "task-1",
                            "trace_id": "trace-1",
                            "task_kind": "content_factory.copy.generate"
                        }),
                    )]
                    .into_iter()
                    .collect(),
                    ..TurnContextOverride::default()
                }),
                output_schema_runtime: None,
                created_at: now,
                started_at: Some(now),
                completed_at: Some(now),
                updated_at: now,
            }],
            Vec::new(),
        )],
    );

    let runtime =
        build_session_execution_runtime("session-plugin", None, None, Some(&snapshot), None)
            .expect("runtime");
    let summary = runtime.runtime_summary.expect("plugin scope summary");

    assert_eq!(summary.surface.as_deref(), Some("plugin"));
    assert_eq!(summary.app_id.as_deref(), Some("content-factory-app"));
    assert_eq!(summary.task_id.as_deref(), Some("task-1"));
    assert_eq!(summary.trace_id.as_deref(), Some("trace-1"));
    assert_eq!(
        summary.task_kind.as_deref(),
        Some("content_factory.copy.generate")
    );
}

#[test]
fn extracts_cost_state_and_limit_event_from_latest_turn() {
    let now = Utc::now();
    let session = Session {
        id: "session-cost".to_string(),
        input_tokens: Some(1200),
        output_tokens: Some(300),
        cached_input_tokens: Some(100),
        cache_creation_input_tokens: Some(50),
        ..Session::default()
    };

    let snapshot = runtime_snapshot_record(
        "session-cost",
        vec![runtime_thread_snapshot_record(
            "thread-1",
            "session-cost",
            PathBuf::from("/tmp/workspace"),
            vec![RuntimeTurnSnapshotRecord {
                id: "turn-1".to_string(),
                session_id: "session-cost".to_string(),
                thread_id: "thread-1".to_string(),
                status: RuntimeTurnStatusRecord::Failed,
                input_text: Some("继续".to_string()),
                error_message: Some("429 Too Many Requests".to_string()),
                context_override: Some(TurnContextOverride {
                    metadata: [(
                        "lime_runtime".to_string(),
                        json!({
                            "cost_state": {
                                "status": "estimated",
                                "estimatedCostClass": "low",
                                "inputPerMillion": 1.0,
                                "outputPerMillion": 5.0,
                                "cacheReadPerMillion": 0.5,
                                "cacheWritePerMillion": 1.5,
                                "currency": "USD"
                            }
                        }),
                    )]
                    .into_iter()
                    .collect(),
                    ..TurnContextOverride::default()
                }),
                output_schema_runtime: None,
                created_at: now,
                started_at: Some(now),
                completed_at: Some(now),
                updated_at: now,
            }],
            Vec::new(),
        )],
    );

    let runtime = build_session_execution_runtime(
        "session-cost",
        Some(&session),
        None,
        Some(&snapshot),
        None,
    )
    .expect("runtime");

    let cost_state = runtime.cost_state.expect("应提取 cost_state");
    assert_eq!(cost_state.status, "recorded");
    assert_eq!(cost_state.total_tokens, Some(1500));
    assert_eq!(cost_state.cached_input_tokens, Some(100));
    assert_eq!(cost_state.cache_creation_input_tokens, Some(50));
    assert!(cost_state
        .estimated_total_cost
        .is_some_and(|value| (value - 0.002825).abs() < 1e-12));
    assert_eq!(
        runtime.limit_event,
        Some(SessionExecutionRuntimeLimitEvent {
            event_kind: "rate_limit_hit".to_string(),
            message: "429 Too Many Requests".to_string(),
            retryable: true,
        })
    );
}

#[test]
fn extracts_limit_event_from_turn_metadata_without_error_text() {
    let now = Utc::now();
    let snapshot = runtime_snapshot_record(
        "session-oem-limit",
        vec![runtime_thread_snapshot_record(
            "thread-1",
            "session-oem-limit",
            PathBuf::from("/tmp/workspace"),
            vec![RuntimeTurnSnapshotRecord {
                id: "turn-1".to_string(),
                session_id: "session-oem-limit".to_string(),
                thread_id: "thread-1".to_string(),
                status: RuntimeTurnStatusRecord::Completed,
                input_text: Some("继续".to_string()),
                error_message: None,
                context_override: Some(TurnContextOverride {
                    metadata: [(
                        "lime_runtime".to_string(),
                        json!({
                            "limit_event": {
                                "eventKind": "quota_low",
                                "message": "OEM 云端额度偏低",
                                "retryable": true
                            },
                            "oem_policy": {
                                "tenantId": "tenant-1",
                                "providerSource": "oem_cloud",
                                "quotaStatus": "low"
                            },
                            "runtime_summary": {
                                "limitEventKind": "quota_low",
                                "limitEventMessage": "OEM 云端额度偏低",
                                "quotaLow": true
                            }
                        }),
                    )]
                    .into_iter()
                    .collect(),
                    ..TurnContextOverride::default()
                }),
                output_schema_runtime: None,
                created_at: now,
                started_at: Some(now),
                completed_at: Some(now),
                updated_at: now,
            }],
            Vec::new(),
        )],
    );

    let runtime =
        build_session_execution_runtime("session-oem-limit", None, None, Some(&snapshot), None)
            .expect("runtime");

    assert_eq!(
        runtime.limit_event,
        Some(SessionExecutionRuntimeLimitEvent {
            event_kind: "quota_low".to_string(),
            message: "OEM 云端额度偏低".to_string(),
            retryable: true,
        })
    );
    assert_eq!(
        runtime
            .oem_policy
            .as_ref()
            .and_then(|value| value.tenant_id.clone().into()),
        Some("tenant-1".to_string())
    );
    assert_eq!(
        runtime
            .runtime_summary
            .as_ref()
            .and_then(|value| value.limit_event_kind.as_deref()),
        Some("quota_low")
    );
}

#[test]
fn apply_usage_to_cost_state_should_calculate_estimated_total_cost() {
    let cost_state = SessionExecutionRuntimeCostState {
        status: "estimated".to_string(),
        estimated_cost_class: Some("medium".to_string()),
        input_per_million: Some(2.0),
        output_per_million: Some(8.0),
        cache_read_per_million: Some(0.5),
        cache_write_per_million: Some(1.0),
        currency: Some("USD".to_string()),
        estimated_total_cost: None,
        input_tokens: None,
        output_tokens: None,
        total_tokens: None,
        cached_input_tokens: None,
        cache_creation_input_tokens: None,
    };
    let usage = crate::protocol::AgentTokenUsage {
        input_tokens: 1000,
        output_tokens: 500,
        cached_input_tokens: Some(200),
        cache_creation_input_tokens: Some(50),
    };

    let applied = apply_usage_to_cost_state(cost_state, &usage);

    assert_eq!(applied.status, "recorded");
    assert_eq!(applied.total_tokens, Some(1500));
    assert!(applied
        .estimated_total_cost
        .is_some_and(|value| (value - 0.00615).abs() < 1e-12));
}

#[test]
fn detect_runtime_limit_event_should_classify_rate_limit_and_quota() {
    assert_eq!(
        detect_runtime_limit_event(Some("429 Too Many Requests")),
        Some(SessionExecutionRuntimeLimitEvent {
            event_kind: "rate_limit_hit".to_string(),
            message: "429 Too Many Requests".to_string(),
            retryable: true,
        })
    );
    assert_eq!(
        detect_runtime_limit_event(Some("余额不足，请充值后继续")),
        Some(SessionExecutionRuntimeLimitEvent {
            event_kind: "quota_blocked".to_string(),
            message: "余额不足，请充值后继续".to_string(),
            retryable: false,
        })
    );
    assert_eq!(
        detect_runtime_limit_event(Some("available_quota_low: credits running low")),
        Some(SessionExecutionRuntimeLimitEvent {
            event_kind: "quota_low".to_string(),
            message: "available_quota_low: credits running low".to_string(),
            retryable: true,
        })
    );
    assert!(detect_runtime_limit_event(Some("unknown error")).is_none());
}
