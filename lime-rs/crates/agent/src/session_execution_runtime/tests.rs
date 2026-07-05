use super::{
    reconcile_session_execution_runtime_permission_fallback, SessionExecutionRuntime,
    SessionExecutionRuntimeAccessMode, SessionExecutionRuntimePreferences,
    SessionExecutionRuntimeRecentTeamRole, SessionExecutionRuntimeRecentTeamSelection,
    SessionExecutionRuntimeRoutingDecision, SessionExecutionRuntimeSource,
};
use aster::model::ModelConfig;
use aster::session::{
    Session, SessionRuntimeSnapshot, ThreadRuntime, ThreadRuntimeSnapshot, TurnContextOverride,
    TurnOutputSchemaRuntime, TurnOutputSchemaSource, TurnOutputSchemaStrategy, TurnRuntime,
    TurnStatus,
};
use chrono::{Duration, Utc};
use lime_core::database::dao::agent_timeline::{
    AgentThreadItem, AgentThreadItemPayload, AgentThreadItemStatus,
};
use serde_json::json;
use std::path::PathBuf;

fn build_session_execution_runtime(
    session_id: &str,
    session: Option<&Session>,
    execution_strategy: Option<String>,
    snapshot: Option<&SessionRuntimeSnapshot>,
    provider_selector: Option<String>,
) -> Option<SessionExecutionRuntime> {
    let session_projection = session.map(
        crate::session_execution_runtime_adapter::project_aster_session_execution_runtime_session,
    );
    let snapshot_projection = snapshot.map(
        crate::session_execution_runtime_adapter::project_aster_session_execution_runtime_snapshot,
    );
    super::build_session_execution_runtime(
        session_id,
        session_projection.as_ref(),
        execution_strategy,
        snapshot_projection.as_ref(),
        provider_selector,
    )
}

#[test]
fn falls_back_to_session_when_runtime_snapshot_missing() {
    let session = Session {
        id: "session-1".to_string(),
        provider_name: Some("openai".to_string()),
        model_config: Some(ModelConfig::new("gpt-5.1").expect("model config")),
        ..Session::default()
    };

    let runtime = build_session_execution_runtime(
        "session-1",
        Some(&session),
        Some("react".to_string()),
        None,
        Some("openai".to_string()),
    )
    .expect("runtime");

    assert_eq!(runtime.source, SessionExecutionRuntimeSource::Session);
    assert_eq!(runtime.provider_selector.as_deref(), Some("openai"));
    assert_eq!(runtime.provider_name.as_deref(), Some("openai"));
    assert_eq!(runtime.model_name.as_deref(), Some("gpt-5.1"));
    assert_eq!(runtime.execution_strategy.as_deref(), Some("react"));
    assert!(runtime.output_schema_runtime.is_none());
    assert!(runtime.recent_preferences.is_none());
}

#[test]
fn prefers_latest_runtime_snapshot_with_output_schema_runtime() {
    let now = Utc::now();
    let session = Session {
        id: "session-2".to_string(),
        provider_name: Some("openai".to_string()),
        model_config: Some(ModelConfig::new("gpt-5.1").expect("model config")),
        ..Session::default()
    };

    let latest_turn = TurnRuntime {
        id: "turn-new".to_string(),
        session_id: "session-2".to_string(),
        thread_id: "thread-1".to_string(),
        status: TurnStatus::Running,
        input_text: Some("hello".to_string()),
        error_message: None,
        context_override: Some(TurnContextOverride {
            model: Some("gpt-5.2".to_string()),
            ..TurnContextOverride::default()
        }),
        output_schema_runtime: Some(TurnOutputSchemaRuntime {
            source: TurnOutputSchemaSource::Turn,
            strategy: TurnOutputSchemaStrategy::Native,
            provider_name: Some("openai".to_string()),
            model_name: Some("gpt-5.2".to_string()),
        }),
        created_at: now - Duration::seconds(30),
        started_at: Some(now - Duration::seconds(30)),
        completed_at: None,
        updated_at: now,
    };
    let snapshot = SessionRuntimeSnapshot {
        session_id: "session-2".to_string(),
        threads: vec![ThreadRuntimeSnapshot {
            thread: ThreadRuntime::new("thread-1", "session-2", PathBuf::from("/tmp/workspace")),
            turns: vec![
                TurnRuntime {
                    id: "turn-old".to_string(),
                    session_id: "session-2".to_string(),
                    thread_id: "thread-1".to_string(),
                    status: TurnStatus::Completed,
                    input_text: Some("old".to_string()),
                    error_message: None,
                    context_override: None,
                    output_schema_runtime: None,
                    created_at: now - Duration::minutes(2),
                    started_at: Some(now - Duration::minutes(2)),
                    completed_at: Some(now - Duration::minutes(1)),
                    updated_at: now - Duration::minutes(1),
                },
                latest_turn.clone(),
            ],
            items: Vec::new(),
        }],
    };

    let runtime = build_session_execution_runtime(
        "session-2",
        Some(&session),
        Some("auto".to_string()),
        Some(&snapshot),
        Some("openai".to_string()),
    )
    .expect("runtime");

    assert_eq!(
        runtime.source,
        SessionExecutionRuntimeSource::RuntimeSnapshot
    );
    assert_eq!(runtime.latest_turn_id.as_deref(), Some("turn-new"));
    assert_eq!(runtime.latest_turn_status.as_deref(), Some("running"));
    assert_eq!(runtime.model_name.as_deref(), Some("gpt-5.2"));
    assert_eq!(
        runtime
            .output_schema_runtime
            .as_ref()
            .and_then(|value| value.model_name.as_deref()),
        Some("gpt-5.2")
    );
    assert!(runtime.recent_preferences.is_none());
}

#[test]
fn prefers_effective_execution_strategy_from_latest_turn_context_metadata() {
    let now = Utc::now();
    let latest_turn = TurnRuntime {
        id: "turn-code".to_string(),
        session_id: "session-code".to_string(),
        thread_id: "thread-code".to_string(),
        status: TurnStatus::Completed,
        input_text: Some("修复代码并运行校验".to_string()),
        error_message: None,
        context_override: Some(TurnContextOverride {
            metadata: std::collections::HashMap::from([(
                "effective_execution_strategy".to_string(),
                json!("react"),
            )]),
            ..TurnContextOverride::default()
        }),
        output_schema_runtime: None,
        created_at: now - Duration::seconds(10),
        started_at: Some(now - Duration::seconds(10)),
        completed_at: Some(now),
        updated_at: now,
    };
    let snapshot = SessionRuntimeSnapshot {
        session_id: "session-code".to_string(),
        threads: vec![ThreadRuntimeSnapshot {
            thread: ThreadRuntime::new(
                "thread-code",
                "session-code",
                PathBuf::from("/tmp/workspace"),
            ),
            turns: vec![latest_turn],
            items: Vec::new(),
        }],
    };

    let runtime = build_session_execution_runtime(
        "session-code",
        None,
        Some("react".to_string()),
        Some(&snapshot),
        None,
    )
    .expect("runtime");

    assert_eq!(
        runtime.source,
        SessionExecutionRuntimeSource::RuntimeSnapshot
    );
    assert_eq!(runtime.latest_turn_id.as_deref(), Some("turn-code"));
    assert_eq!(runtime.execution_strategy.as_deref(), Some("react"));
}

#[test]
fn projects_context_summary_from_latest_turn_metadata() {
    let now = Utc::now();
    let snapshot = SessionRuntimeSnapshot {
        session_id: "session-context".to_string(),
        threads: vec![ThreadRuntimeSnapshot {
            thread: ThreadRuntime::new(
                "thread-context",
                "session-context",
                PathBuf::from("/tmp/workspace"),
            ),
            turns: vec![TurnRuntime {
                id: "turn-context".to_string(),
                session_id: "session-context".to_string(),
                thread_id: "thread-context".to_string(),
                status: TurnStatus::Running,
                input_text: Some("使用项目资料".to_string()),
                error_message: None,
                context_override: Some(TurnContextOverride {
                    metadata: [(
                        "agentui_context".to_string(),
                        json!({
                            "memory_budget": {
                                "used_tokens": 640,
                                "max_tokens": 1200,
                                "status": "ready",
                                "source": "knowledge_context_resolver"
                            },
                            "retrieval_refs": [
                                {
                                    "source_id": "knowledge_pack:brand:compiled/splits/brief.md",
                                    "kind": "knowledge_pack",
                                    "title": "brand:brief",
                                    "path": "compiled/splits/brief.md",
                                    "scope": "workspace",
                                    "status": "ready",
                                    "source": "knowledge_context_resolver"
                                }
                            ],
                            "missing_context": [
                                {
                                    "id": "knowledge_warning:0",
                                    "kind": "knowledge_warning",
                                    "label": "sources/missing.md",
                                    "status": "unknown",
                                    "reason": "缺少来源",
                                    "source": "knowledge_context_resolver"
                                }
                            ]
                        }),
                    )]
                    .into_iter()
                    .collect(),
                    ..TurnContextOverride::default()
                }),
                output_schema_runtime: None,
                created_at: now,
                started_at: Some(now),
                completed_at: None,
                updated_at: now,
            }],
            items: Vec::new(),
        }],
    };

    let runtime = build_session_execution_runtime(
        "session-context",
        None,
        Some("react".to_string()),
        Some(&snapshot),
        None,
    )
    .expect("runtime");
    let summary = runtime.context_summary.expect("context summary");

    assert_eq!(
        summary.memory_budget.and_then(|budget| budget.used_tokens),
        Some(640)
    );
    assert_eq!(summary.retrieval_refs.len(), 1);
    assert_eq!(
        summary.retrieval_refs[0].source_id,
        "knowledge_pack:brand:compiled/splits/brief.md"
    );
    assert_eq!(summary.missing_context.len(), 1);
    assert_eq!(summary.missing_context[0].label, "sources/missing.md");
}

mod recent_settings;
mod runtime_payload;

#[test]
fn permission_fallback_warning_prefers_persisted_session_model_in_runtime_view() {
    let mut runtime = SessionExecutionRuntime {
        session_id: "session-fallback".to_string(),
        provider_selector: Some("custom-mimo".to_string()),
        provider_name: Some("anthropic".to_string()),
        model_name: Some("mimo-v2-flash".to_string()),
        execution_strategy: Some("react".to_string()),
        output_schema_runtime: None,
        source: SessionExecutionRuntimeSource::RuntimeSnapshot,
        mode: None,
        latest_turn_id: Some("turn-fallback".to_string()),
        latest_turn_status: Some("completed".to_string()),
        context_summary: None,
        recent_access_mode: None,
        recent_preferences: None,
        recent_team_selection: None,
        recent_theme: None,
        recent_session_mode: None,
        recent_gate_key: None,
        recent_run_title: None,
        recent_content_id: None,
        recent_response_language: None,
        task_profile: None,
        routing_decision: Some(SessionExecutionRuntimeRoutingDecision {
            routing_mode: "multi_candidate".to_string(),
            decision_source: "request_override".to_string(),
            decision_reason: "当前回合的 provider/model 选择优先遵循显式偏好，其次回退到会话默认。"
                .to_string(),
            selected_provider: Some("custom-mimo".to_string()),
            selected_model: Some("mimo-v2-flash".to_string()),
            requested_provider: Some("custom-mimo".to_string()),
            requested_model: Some("mimo-v2-flash".to_string()),
            candidate_count: 7,
            estimated_cost_class: Some("medium".to_string()),
            capability_gap: None,
            fallback_chain: Vec::new(),
            settings_source: None,
            service_model_slot: None,
        }),
        limit_state: None,
        cost_state: None,
        permission_state: None,
        limit_event: None,
        oem_policy: None,
        runtime_summary: None,
    };
    let items = vec![AgentThreadItem {
        id: "warning-1".to_string(),
        thread_id: "session-fallback".to_string(),
        turn_id: "turn-fallback".to_string(),
        sequence: 1,
        status: AgentThreadItemStatus::Completed,
        started_at: Utc::now().to_rfc3339(),
        completed_at: Some(Utc::now().to_rfc3339()),
        updated_at: Utc::now().to_rfc3339(),
        payload: AgentThreadItemPayload::Warning {
            message: "当前模型暂不可用，已自动切换到兼容候选。".to_string(),
            code: Some("runtime_model_permission_fallback".to_string()),
        },
    }];

    reconcile_session_execution_runtime_permission_fallback(
        &mut runtime,
        &items,
        Some("mimo-v2.5-pro"),
    );

    assert_eq!(runtime.model_name.as_deref(), Some("mimo-v2.5-pro"));
    assert_eq!(
        runtime
            .routing_decision
            .as_ref()
            .and_then(|value| value.selected_model.as_deref()),
        Some("mimo-v2.5-pro")
    );
    assert_eq!(
        runtime
            .routing_decision
            .as_ref()
            .and_then(|value| value.requested_model.as_deref()),
        Some("mimo-v2-flash")
    );
}
