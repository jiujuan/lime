use super::*;

#[test]
fn should_inject_turn_context_metadata_when_workspace_auto_compaction_disabled() {
    let merged = merge_turn_context_with_workspace_auto_compaction(
        Some(TurnContextOverride::default()),
        &WorkspaceSettings {
            auto_compact: false,
            ..WorkspaceSettings::default()
        },
    )
    .expect("应返回 turn context");

    assert_eq!(
        merged
            .metadata
            .get(LIME_RUNTIME_METADATA_KEY)
            .and_then(|value| value.get(LIME_RUNTIME_AUTO_COMPACT_KEY))
            .and_then(Value::as_bool),
        Some(false)
    );
}

#[test]
fn should_keep_turn_context_unchanged_when_workspace_auto_compaction_enabled() {
    assert!(
        merge_turn_context_with_workspace_auto_compaction(None, &WorkspaceSettings::default())
            .is_none()
    );
}

#[test]
fn build_runtime_turn_context_snapshot_should_capture_final_turn_context_inputs() {
    let metadata = json!({
        "artifact": {
            "artifact_mode": "draft",
            "artifact_stage": "stage2",
            "artifact_kind": "analysis"
        },
        "harness": {
            "theme": "analysis"
        }
    });
    let workspace_settings = WorkspaceSettings {
        auto_compact: false,
        ..WorkspaceSettings::default()
    };

    let snapshot = build_runtime_turn_context_snapshot(Some(&metadata), &workspace_settings);
    let snapshot_metadata =
        build_runtime_turn_context_metadata_value(&snapshot).expect("snapshot metadata");

    assert_eq!(
        snapshot.output_schema_source,
        Some(aster::session::TurnOutputSchemaSource::Turn)
    );
    assert!(snapshot.output_schema.is_some());
    assert_eq!(
        snapshot_metadata
            .get(LIME_RUNTIME_METADATA_KEY)
            .and_then(|value| value.get(LIME_RUNTIME_AUTO_COMPACT_KEY))
            .and_then(Value::as_bool),
        Some(false)
    );
    assert_eq!(
        snapshot_metadata
            .get("harness")
            .and_then(|value| value.get("theme"))
            .and_then(Value::as_str),
        Some("analysis")
    );
}

#[test]
fn build_runtime_compaction_session_config_should_keep_minimal_control_turn_context() {
    let session_config = build_runtime_compaction_session_config(
        "session-compact",
        "thread-compact",
        "turn-compact",
        None,
    );

    assert_eq!(session_config.id, "session-compact");
    assert_eq!(session_config.thread_id.as_deref(), Some("thread-compact"));
    assert_eq!(session_config.turn_id.as_deref(), Some("turn-compact"));
    assert_eq!(session_config.system_prompt, None);
    assert_eq!(session_config.include_context_trace, None);
    assert!(session_config.turn_context.is_none());
}

#[test]
fn build_runtime_compaction_session_config_should_attach_history_compress_turn_context() {
    let metadata = build_history_compaction_runtime_metadata(
        RuntimeSessionCompactionTrigger::Manual,
        &AuxiliaryProviderResolution {
            service_model_slot: "history_compress".to_string(),
            task_kind: "history_compress".to_string(),
            decision_source: "session_default".to_string(),
            decision_reason:
                "当前未配置 service_models.history_compress，沿用当前 provider/model。".to_string(),
            selected_provider: Some("openai".to_string()),
            selected_model: Some("gpt-4o-mini".to_string()),
            requested_provider: None,
            requested_model: None,
            fallback_chain: Vec::new(),
            settings_source: None,
            estimated_cost_class: Some("low".to_string()),
        },
    );
    let session_config = build_runtime_compaction_session_config(
        "session-compact",
        "thread-compact",
        "turn-compact",
        build_auxiliary_turn_context_override(metadata),
    );

    let turn_context = session_config.turn_context.expect("turn context");
    let lime_runtime = turn_context
        .metadata
        .get("lime_runtime")
        .and_then(serde_json::Value::as_object)
        .expect("lime runtime");
    let task_profile = lime_runtime
        .get("task_profile")
        .and_then(serde_json::Value::as_object)
        .expect("task profile");

    assert_eq!(
        task_profile.get("kind").and_then(serde_json::Value::as_str),
        Some("history_compress")
    );
    assert_eq!(
        task_profile
            .get("source")
            .and_then(serde_json::Value::as_str),
        Some("context_compaction_manual")
    );
}

#[test]
fn build_history_compaction_runtime_metadata_should_project_history_compress_route() {
    let metadata = build_history_compaction_runtime_metadata(
        RuntimeSessionCompactionTrigger::Auto,
        &AuxiliaryProviderResolution {
            service_model_slot: "history_compress".to_string(),
            task_kind: "history_compress".to_string(),
            decision_source: "service_model_setting".to_string(),
            decision_reason: "命中 service_models.history_compress".to_string(),
            selected_provider: Some("openai".to_string()),
            selected_model: Some("gpt-5.4-mini".to_string()),
            requested_provider: Some("openai".to_string()),
            requested_model: Some("gpt-5.4-mini".to_string()),
            fallback_chain: Vec::new(),
            settings_source: Some("service_models.history_compress".to_string()),
            estimated_cost_class: Some("low".to_string()),
        },
    )
    .expect("metadata");

    let task_profile = extract_runtime_resolution_payload::<
        lime_agent::SessionExecutionRuntimeTaskProfile,
    >(Some(&metadata), "task_profile")
    .expect("task profile");
    let routing_decision = extract_runtime_resolution_payload::<
        lime_agent::SessionExecutionRuntimeRoutingDecision,
    >(Some(&metadata), "routing_decision")
    .expect("routing decision");
    let limit_state = extract_runtime_resolution_payload::<
        lime_agent::SessionExecutionRuntimeLimitState,
    >(Some(&metadata), "limit_state")
    .expect("limit state");
    let cost_state = extract_runtime_resolution_payload::<
        lime_agent::SessionExecutionRuntimeCostState,
    >(Some(&metadata), "cost_state")
    .expect("cost state");
    let permission_state = extract_runtime_resolution_payload::<
        lime_agent::SessionExecutionRuntimePermissionState,
    >(Some(&metadata), "permission_state")
    .expect("permission state");

    assert_eq!(task_profile.kind, "history_compress");
    assert_eq!(task_profile.source, "context_compaction_auto");
    assert_eq!(
        task_profile.service_model_slot.as_deref(),
        Some("history_compress")
    );
    assert_eq!(routing_decision.routing_mode, "single_candidate");
    assert_eq!(routing_decision.decision_source, "service_model_setting");
    assert_eq!(
        routing_decision.settings_source.as_deref(),
        Some("service_models.history_compress")
    );
    assert_eq!(
        routing_decision.selected_model.as_deref(),
        Some("gpt-5.4-mini")
    );
    assert!(limit_state.single_candidate_only);
    assert!(limit_state.settings_locked);
    assert_eq!(cost_state.estimated_cost_class.as_deref(), Some("low"));
    assert_eq!(permission_state.status, "not_required");
    assert!(permission_state.required_profile_keys.is_empty());
}
