use super::*;

#[test]
fn permission_turn_gating_should_block_not_requested_confirmation() {
    let permission_state: lime_agent::SessionExecutionRuntimePermissionState =
        serde_json::from_value(json!({
            "status": "requires_confirmation",
            "requiredProfileKeys": ["read_files"],
            "askProfileKeys": ["read_files"],
            "blockingProfileKeys": [],
            "decisionSource": "modality_execution_profile",
            "decisionScope": "declared_profile",
            "confirmationStatus": "not_requested",
            "confirmationSource": "declared_profile_only"
        }))
        .expect("应能解析 permission state");

    assert!(permission_state_requires_turn_gating(&permission_state));
    let error = format_permission_turn_gating_error(&permission_state);
    assert!(error.contains("confirmationStatus=not_requested"));
    assert!(error.contains("askProfileKeys=read_files"));
    assert!(error.contains("已创建真实权限确认请求"));
}

#[test]
fn permission_turn_gating_should_block_missing_confirmation_status() {
    let permission_state: lime_agent::SessionExecutionRuntimePermissionState =
        serde_json::from_value(json!({
            "status": "requires_confirmation",
            "requiredProfileKeys": ["write_artifacts"],
            "askProfileKeys": ["write_artifacts"],
            "blockingProfileKeys": [],
            "decisionSource": "modality_execution_profile",
            "decisionScope": "declared_profile"
        }))
        .expect("应能解析 permission state");

    assert!(permission_state_requires_turn_gating(&permission_state));
    assert!(format_permission_turn_gating_error(&permission_state)
        .contains("未记录 confirmationStatus"));
}

#[test]
fn permission_turn_gating_should_allow_resolved_confirmation() {
    let permission_state: lime_agent::SessionExecutionRuntimePermissionState =
        serde_json::from_value(json!({
            "status": "requires_confirmation",
            "requiredProfileKeys": ["read_files"],
            "askProfileKeys": ["read_files"],
            "blockingProfileKeys": [],
            "decisionSource": "modality_execution_profile",
            "decisionScope": "runtime_action_required",
            "confirmationStatus": "resolved",
            "confirmationRequestId": "approval-1",
            "confirmationSource": "runtime_action_required"
        }))
        .expect("应能解析 permission state");

    assert!(!permission_state_requires_turn_gating(&permission_state));
    let status =
        build_runtime_permission_review_status_from_state(&permission_state).expect("应生成状态");
    assert_eq!(
        status
            .metadata
            .as_ref()
            .and_then(|metadata| metadata.get("declared_only"))
            .and_then(Value::as_bool),
        Some(false)
    );
    assert_eq!(
        status
            .metadata
            .as_ref()
            .and_then(|metadata| metadata.get("turn_gating"))
            .and_then(Value::as_bool),
        Some(false)
    );
    assert!(status.detail.contains("允许继续模型执行"));
}

#[test]
fn permission_confirmation_projection_should_mark_runtime_metadata_resolved() {
    let mut metadata = Some(json!({
        "lime_runtime": {
            "permission_state": {
                "status": "requires_confirmation",
                "requiredProfileKeys": ["read_files"],
                "askProfileKeys": ["read_files"],
                "blockingProfileKeys": [],
                "decisionSource": "modality_execution_profile",
                "decisionScope": "declared_profile",
                "confirmationStatus": "not_requested",
                "confirmationSource": "declared_profile_only"
            }
        }
    }));

    let applied = apply_runtime_permission_confirmation_projection_to_metadata(
        &mut metadata,
        &RuntimePermissionConfirmationProjection {
            status: "resolved",
            request_id: "runtime_permission_confirmation:turn-1".to_string(),
            source: "runtime_action_required",
            note: "真实权限确认请求已完成",
        },
    );

    assert!(applied);
    let permission_state = extract_runtime_resolution_payload::<
        lime_agent::SessionExecutionRuntimePermissionState,
    >(metadata.as_ref(), "permission_state")
    .expect("应能读取更新后的 permission_state");
    assert_eq!(
        permission_state.confirmation_status.as_deref(),
        Some("resolved")
    );
    assert_eq!(
        permission_state.confirmation_request_id.as_deref(),
        Some("runtime_permission_confirmation:turn-1")
    );
    assert!(!permission_state_requires_turn_gating(&permission_state));
}

#[test]
fn permission_confirmation_response_should_treat_reject_answer_as_denied() {
    let response = json!({
        "confirmed": true,
        "response": "{\"answer\":\"拒绝\"}",
        "userData": { "answer": "拒绝" },
        "source": "runtime_permission_confirmation"
    });

    assert_eq!(
        runtime_permission_confirmation_response_confirmed(Some(&response)),
        Some(false)
    );
}

#[test]
fn permission_confirmation_request_should_only_create_for_not_requested() {
    let not_requested: lime_agent::SessionExecutionRuntimePermissionState =
        serde_json::from_value(json!({
            "status": "requires_confirmation",
            "requiredProfileKeys": ["read_files"],
            "askProfileKeys": ["read_files"],
            "blockingProfileKeys": [],
            "decisionSource": "modality_execution_profile",
            "decisionScope": "declared_profile",
            "confirmationStatus": "not_requested",
            "confirmationSource": "declared_profile_only"
        }))
        .expect("应能解析 permission state");
    let requested: lime_agent::SessionExecutionRuntimePermissionState =
        serde_json::from_value(json!({
            "status": "requires_confirmation",
            "requiredProfileKeys": ["read_files"],
            "askProfileKeys": ["read_files"],
            "blockingProfileKeys": [],
            "decisionSource": "modality_execution_profile",
            "decisionScope": "declared_profile",
            "confirmationStatus": "requested",
            "confirmationRequestId": "runtime_permission_confirmation:turn-1",
            "confirmationSource": "runtime_action_required"
        }))
        .expect("应能解析 permission state");

    assert!(should_create_runtime_permission_confirmation_request(
        &not_requested
    ));
    assert!(!should_create_runtime_permission_confirmation_request(
        &requested
    ));
}

#[test]
fn map_runtime_limit_event_to_runtime_agent_event_should_cover_quota_low() {
    let event = map_runtime_limit_event_to_runtime_agent_event(
        lime_agent::SessionExecutionRuntimeLimitEvent {
            event_kind: "quota_low".to_string(),
            message: "额度偏低".to_string(),
            retryable: true,
        },
    );

    let event_type = serde_json::to_value(event)
        .ok()
        .and_then(|value| {
            value
                .get("type")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .expect("应能序列化 runtime limit event");

    assert_eq!(event_type, "quota_low");
}
