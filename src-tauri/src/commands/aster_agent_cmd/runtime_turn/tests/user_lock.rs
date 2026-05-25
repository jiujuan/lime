use super::*;

#[test]
fn user_lock_capability_gap_should_block_before_model_execution() {
    let limit_state = lime_agent::SessionExecutionRuntimeLimitState {
        status: "user_locked_capability_gap".to_string(),
        single_candidate_only: true,
        provider_locked: true,
        settings_locked: false,
        oem_locked: false,
        candidate_count: 1,
        capability_gap: Some("browser_reasoning_candidate_missing".to_string()),
        notes: Vec::new(),
    };
    let routing_decision = lime_agent::SessionExecutionRuntimeRoutingDecision {
        routing_mode: "single_candidate".to_string(),
        decision_source: "request_override".to_string(),
        decision_reason: "用户显式选择模型".to_string(),
        selected_provider: Some("openai".to_string()),
        selected_model: Some("gpt-5.4-mini".to_string()),
        requested_provider: Some("openai".to_string()),
        requested_model: Some("gpt-5.4-mini".to_string()),
        candidate_count: 1,
        estimated_cost_class: Some("low".to_string()),
        capability_gap: Some("browser_reasoning_candidate_missing".to_string()),
        fallback_chain: Vec::new(),
        settings_source: None,
        service_model_slot: None,
    };
    let task_profile = lime_agent::SessionExecutionRuntimeTaskProfile {
        kind: "browser_control".to_string(),
        source: "browser_assist".to_string(),
        traits: Vec::new(),
        modality_contract_key: Some("browser_control".to_string()),
        routing_slot: Some("browser_reasoning_model".to_string()),
        execution_profile_key: Some("browser_control_profile".to_string()),
        executor_adapter_key: Some("browser:browser_assist".to_string()),
        executor_kind: Some("browser".to_string()),
        executor_binding_key: Some("browser_assist".to_string()),
        permission_profile_keys: Vec::new(),
        user_lock_policy: Some("honor_explicit_model_lock_with_capability_check".to_string()),
        service_model_slot: None,
        scene_kind: None,
        scene_skill_id: None,
        entry_source: None,
    };

    assert!(limit_state_requires_user_lock_capability_gating(
        &limit_state
    ));
    let error = format_user_lock_capability_gating_error(
        &limit_state,
        Some(&routing_decision),
        Some(&task_profile),
    );
    assert!(error.contains("模型执行前阻断"));
    assert!(error.contains("routingSlot=browser_reasoning_model"));
    assert!(error.contains("capabilityGap=browser_reasoning_candidate_missing"));
    let status = build_runtime_user_lock_capability_status_from_state(&limit_state)
        .expect("应生成 user lock capability status");
    assert_eq!(status.phase, "routing");
    assert_eq!(
        status
            .metadata
            .as_ref()
            .and_then(|metadata| metadata.get("turn_gating"))
            .and_then(Value::as_bool),
        Some(true)
    );
}

#[test]
fn user_lock_capability_request_should_create_for_gap_once_per_turn() {
    let limit_state = lime_agent::SessionExecutionRuntimeLimitState {
        status: "user_locked_capability_gap".to_string(),
        single_candidate_only: true,
        provider_locked: true,
        settings_locked: false,
        oem_locked: false,
        candidate_count: 1,
        capability_gap: Some("browser_reasoning_candidate_missing".to_string()),
        notes: Vec::new(),
    };
    assert!(should_create_runtime_user_lock_capability_request(
        &limit_state,
        None,
        "turn-1"
    ));

    let requested_metadata = json!({
        "lime_runtime": {
            "user_lock_capability_recovery": {
                "status": "requested",
                "requestId": "runtime_user_lock_capability:turn-1",
                "source": "runtime_action_required"
            }
        }
    });
    assert!(!should_create_runtime_user_lock_capability_request(
        &limit_state,
        Some(&requested_metadata),
        "turn-1"
    ));

    let normal_limit_state = lime_agent::SessionExecutionRuntimeLimitState {
        status: "single_candidate_only".to_string(),
        capability_gap: None,
        ..limit_state
    };
    assert!(!should_create_runtime_user_lock_capability_request(
        &normal_limit_state,
        None,
        "turn-1"
    ));
}

#[test]
fn user_lock_capability_projection_should_release_request_model_preference() {
    let mut request = build_runtime_turn_test_request("重试浏览器任务", Some(json!({})));
    request.turn_id = Some("turn-1".to_string());
    request.provider_preference = Some("openai".to_string());
    request.model_preference = Some("gpt-5.4-mini".to_string());

    let applied = apply_runtime_user_lock_capability_projection_to_request(
        &mut request,
        &RuntimeUserLockCapabilityProjection {
            status: "resolved",
            request_id: "runtime_user_lock_capability:turn-1".to_string(),
            source: "runtime_action_required",
            note: "用户允许取消本轮显式模型锁定并重新走模型解析",
        },
    );

    assert!(applied);
    assert!(request.provider_preference.is_none());
    assert!(request.model_preference.is_none());
    let recovery = request
        .metadata
        .as_ref()
        .and_then(|metadata| metadata.get("lime_runtime"))
        .and_then(|runtime| runtime.get("user_lock_capability_recovery"))
        .expect("应写入 user lock recovery 元数据");
    assert_eq!(
        recovery.get("status").and_then(Value::as_str),
        Some("resolved")
    );
    assert_eq!(
        recovery.get("action").and_then(Value::as_str),
        Some("release_explicit_model_lock")
    );
    assert_eq!(
        recovery
            .get("originalModelPreference")
            .and_then(Value::as_str),
        Some("gpt-5.4-mini")
    );
    assert_eq!(
        recovery
            .get("releasedExplicitModelLock")
            .and_then(Value::as_bool),
        Some(true)
    );
}

#[test]
fn user_lock_capability_projection_should_not_release_other_turn() {
    let mut request = build_runtime_turn_test_request("新的显式模型请求", Some(json!({})));
    request.turn_id = Some("turn-2".to_string());
    request.provider_preference = Some("openai".to_string());
    request.model_preference = Some("gpt-5.4-mini".to_string());

    let applied = apply_runtime_user_lock_capability_projection_to_request(
        &mut request,
        &RuntimeUserLockCapabilityProjection {
            status: "resolved",
            request_id: "runtime_user_lock_capability:turn-1".to_string(),
            source: "runtime_action_required",
            note: "用户允许取消本轮显式模型锁定并重新走模型解析",
        },
    );

    assert!(!applied);
    assert_eq!(request.provider_preference.as_deref(), Some("openai"));
    assert_eq!(request.model_preference.as_deref(), Some("gpt-5.4-mini"));
}

#[test]
fn user_lock_capability_response_should_treat_keep_locked_answer_as_denied() {
    let response = json!({
        "confirmed": true,
        "response": "{\"answer\":\"保持锁定并停止\"}",
        "userData": { "answer": "保持锁定并停止" },
        "source": "runtime_user_lock_capability_confirmation"
    });

    assert_eq!(
        runtime_user_lock_capability_response_confirmed(Some(&response)),
        Some(false)
    );
}
