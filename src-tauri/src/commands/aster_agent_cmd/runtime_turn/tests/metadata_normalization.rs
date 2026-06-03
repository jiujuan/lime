use super::*;

#[test]
fn normalize_runtime_turn_request_metadata_should_enable_artifact_prompt_before_turn_build() {
    let mut request = AsterChatRequest {
        message: "请基于目标先生成一版演示提纲".to_string(),
        session_id: "session-artifact".to_string(),
        event_name: "agent_stream".to_string(),
        images: None,
        provider_config: None,
        provider_preference: None,
        model_preference: None,
        reasoning_effort: None,
        thinking_enabled: None,
        approval_policy: None,
        sandbox_policy: None,
        project_id: None,
        workspace_id: "workspace-artifact".to_string(),
        web_search: None,
        search_mode: None,
        execution_strategy: None,
        auto_continue: None,
        system_prompt: None,
        metadata: Some(json!({
            "harness": {
                "theme": "general",
                "session_mode": "general_workbench",
                "content_id": "content-1"
            }
        })),
        turn_id: None,
        queue_if_busy: None,
        queued_turn_id: None,
    };

    let raw_prompt = merge_system_prompt_with_artifact_context(
        Some("基础系统提示".to_string()),
        request.metadata.as_ref(),
    )
    .expect("raw prompt");
    assert!(!raw_prompt.contains("【Artifact 交付策略】"));

    normalize_runtime_turn_request_metadata(&mut request, None, None, None, None, None, true);

    let normalized_metadata = request.metadata.as_ref().expect("normalized metadata");
    assert_eq!(
        normalized_metadata
            .pointer("/artifact/artifact_mode")
            .and_then(Value::as_str),
        Some("draft")
    );

    let prompt = merge_system_prompt_with_artifact_context(
        Some("基础系统提示".to_string()),
        Some(normalized_metadata),
    )
    .expect("normalized prompt");
    assert!(prompt.contains("【Artifact 交付策略】"));
    assert!(prompt.contains("【Artifact Stage 2 合同】"));
    assert!(prompt.contains("artifact:content-1"));

    let mut turn_input_builder =
        TurnInputEnvelopeBuilder::new(&request.session_id, &request.workspace_id);
    turn_input_builder
        .set_base_system_prompt(
            TurnSystemPromptSource::Frontend,
            Some("基础系统提示".to_string()),
        )
        .set_turn_context_metadata_from_value(request.metadata.as_ref())
        .set_effective_user_message(&request.message)
        .apply_prompt_stage(TurnPromptAugmentationStageKind::Artifact, Some(prompt));

    let envelope = turn_input_builder.build();
    let diagnostics = envelope.diagnostics_snapshot();
    let turn_context = envelope.turn_context_override().expect("turn context");

    assert!(diagnostics.has_turn_context_metadata);
    assert!(diagnostics
        .turn_context_metadata_keys
        .contains(&"artifact".to_string()));
    assert_eq!(
        turn_context
            .metadata
            .get("artifact")
            .and_then(|artifact| artifact.get("artifact_stage"))
            .and_then(Value::as_str),
        Some("stage2")
    );
}

#[test]
fn normalize_runtime_turn_request_metadata_should_backfill_content_id_from_session_runtime() {
    let mut request = AsterChatRequest {
        message: "继续完善当前文档".to_string(),
        session_id: "session-artifact-content-fallback".to_string(),
        event_name: "agent_stream".to_string(),
        images: None,
        provider_config: None,
        provider_preference: None,
        model_preference: None,
        reasoning_effort: None,
        thinking_enabled: None,
        approval_policy: None,
        sandbox_policy: None,
        project_id: None,
        workspace_id: "workspace-artifact".to_string(),
        web_search: None,
        search_mode: None,
        execution_strategy: None,
        auto_continue: None,
        system_prompt: None,
        metadata: Some(json!({
            "harness": {
                "theme": "general",
                "session_mode": "general_workbench"
            }
        })),
        turn_id: None,
        queue_if_busy: None,
        queued_turn_id: None,
    };

    normalize_runtime_turn_request_metadata(
        &mut request,
        Some("general"),
        Some("general_workbench"),
        None,
        None,
        Some("content-from-session"),
        true,
    );

    let normalized_metadata = request.metadata.as_ref().expect("normalized metadata");
    assert_eq!(
        normalized_metadata
            .pointer("/harness/theme")
            .and_then(Value::as_str),
        Some("general")
    );
    assert_eq!(
        normalized_metadata
            .pointer("/harness/session_mode")
            .and_then(Value::as_str),
        Some("general_workbench")
    );
    assert_eq!(
        normalized_metadata
            .pointer("/harness/content_id")
            .and_then(Value::as_str),
        Some("content-from-session")
    );
    assert_eq!(
        normalized_metadata
            .pointer("/artifact/artifact_request_id")
            .and_then(Value::as_str),
        Some("artifact:content-from-session")
    );
}

#[test]
fn normalize_runtime_turn_request_metadata_should_backfill_theme_and_session_mode_from_session_runtime(
) {
    let mut request = AsterChatRequest {
        message: "继续推进当前工作区编排".to_string(),
        session_id: "session-artifact-theme-fallback".to_string(),
        event_name: "agent_stream".to_string(),
        images: None,
        provider_config: None,
        provider_preference: None,
        model_preference: None,
        reasoning_effort: None,
        thinking_enabled: None,
        approval_policy: None,
        sandbox_policy: None,
        project_id: None,
        workspace_id: "workspace-artifact".to_string(),
        web_search: None,
        search_mode: None,
        execution_strategy: None,
        auto_continue: None,
        system_prompt: None,
        metadata: Some(json!({
            "harness": {
                "content_id": "content-from-session"
            }
        })),
        turn_id: None,
        queue_if_busy: None,
        queued_turn_id: None,
    };

    normalize_runtime_turn_request_metadata(
        &mut request,
        Some("general"),
        Some("general_workbench"),
        None,
        None,
        Some("content-from-session"),
        true,
    );

    let normalized_metadata = request.metadata.as_ref().expect("normalized metadata");
    assert_eq!(
        normalized_metadata
            .pointer("/harness/theme")
            .and_then(Value::as_str),
        Some("general")
    );
    assert_eq!(
        normalized_metadata
            .pointer("/harness/session_mode")
            .and_then(Value::as_str),
        Some("general_workbench")
    );
    assert_eq!(
        normalized_metadata
            .pointer("/harness/content_id")
            .and_then(Value::as_str),
        Some("content-from-session")
    );
}

#[test]
fn normalize_runtime_turn_request_metadata_should_backfill_gate_key_and_run_title_from_session_runtime(
) {
    let mut request = AsterChatRequest {
        message: "继续当前社媒运行".to_string(),
        session_id: "session-social-gate-fallback".to_string(),
        event_name: "agent_stream".to_string(),
        images: None,
        provider_config: None,
        provider_preference: None,
        model_preference: None,
        reasoning_effort: None,
        thinking_enabled: None,
        approval_policy: None,
        sandbox_policy: None,
        project_id: None,
        workspace_id: "workspace-general-fallback".to_string(),
        web_search: None,
        search_mode: None,
        execution_strategy: None,
        auto_continue: None,
        system_prompt: None,
        metadata: Some(json!({
            "harness": {
                "theme": "general",
                "session_mode": "general_workbench",
                "content_id": "content-social-1"
            }
        })),
        turn_id: None,
        queue_if_busy: None,
        queued_turn_id: None,
    };

    normalize_runtime_turn_request_metadata(
        &mut request,
        Some("general"),
        Some("general_workbench"),
        Some("write_mode"),
        Some("社媒初稿"),
        Some("content-social-1"),
        true,
    );

    let normalized_metadata = request.metadata.as_ref().expect("normalized metadata");
    assert_eq!(
        normalized_metadata
            .pointer("/harness/gate_key")
            .and_then(Value::as_str),
        Some("write_mode")
    );
    assert_eq!(
        normalized_metadata
            .pointer("/harness/run_title")
            .and_then(Value::as_str),
        Some("社媒初稿")
    );
}
