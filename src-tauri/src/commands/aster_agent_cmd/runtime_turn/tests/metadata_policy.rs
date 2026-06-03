use super::*;

#[test]
fn resolve_provider_config_apply_mode_prefers_direct_for_ollama_without_api_key() {
    let provider_config = ConfigureProviderRequest {
        provider_id: Some("ollama".to_string()),
        provider_name: "ollama".to_string(),
        model_name: "deepseek-r1:latest".to_string(),
        api_key: None,
        base_url: None,
        model_capabilities: None,
        tool_call_strategy: None,
        toolshim_model: None,
    };

    assert_eq!(
        resolve_provider_config_apply_mode(&provider_config),
        ProviderConfigApplyMode::Direct
    );
}

#[test]
fn should_auto_capture_runtime_memory_turn_for_long_turn_content() {
    let user_message = "请记下这个团队的偏好：所有需求都先回到主线任务，再给出下一步明确行动。";
    let assistant_output = "好的，我会把这条协作规则当作后续回合的默认执行约束，并在继续实现前先说明当前主线、当前阶段以及下一刀要推进的内容，同时避免把工作扩散到无关页面或额外配置面。";

    assert!(should_auto_capture_runtime_memory_turn(
        user_message,
        assistant_output
    ));
}

#[test]
fn should_auto_capture_runtime_memory_turn_for_memory_signal_keywords() {
    let user_message = "记住：以后回复先给结论";
    let assistant_output = "收到，我以后会先给结论。";

    assert!(should_auto_capture_runtime_memory_turn(
        user_message,
        assistant_output
    ));
}

#[test]
fn should_not_auto_capture_runtime_memory_turn_for_short_generic_turn() {
    let user_message = "你好";
    let assistant_output = "收到";

    assert!(!should_auto_capture_runtime_memory_turn(
        user_message,
        assistant_output
    ));
}

#[test]
fn service_skill_launch_stage_should_preserve_simple_user_message_and_force_site_run_first() {
    let user_message = "请帮我使用 GitHub 查一下 AI Agent 项目";
    let metadata = json!({
        "harness": {
            "browser_assist": {
                "enabled": true,
                "profile_key": "attached-github",
            },
            "service_skill_launch": {
                "kind": "site_adapter",
                "skill_title": "GitHub 仓库线索检索",
                "adapter_name": "github/search",
                "args": {
                    "query": "AI Agent",
                    "limit": 10
                },
                "save_mode": "current_content",
                "content_id": "content-1",
                "project_id": "project-1",
                "launch_readiness": {
                    "status": "ready",
                    "message": "已检测到 github.com 的真实浏览器页面。",
                    "target_id": "tab-github"
                }
            }
        }
    });

    let prompt_with_web_search =
        Some("基础系统提示\n- 如果需要可使用 WebSearch 补充信息。".to_string());
    let prompt_with_service_skill_launch = merge_system_prompt_with_service_skill_launch(
        prompt_with_web_search.clone(),
        Some(&metadata),
    )
    .expect("service skill prompt");

    let mut turn_input_builder =
        TurnInputEnvelopeBuilder::new("session-service-skill", "workspace-service-skill");
    turn_input_builder
        .set_base_system_prompt(
            TurnSystemPromptSource::Frontend,
            Some("基础系统提示".to_string()),
        )
        .set_turn_context_metadata_from_value(Some(&metadata))
        .set_effective_user_message(user_message)
        .apply_prompt_stage(
            TurnPromptAugmentationStageKind::WebSearch,
            prompt_with_web_search,
        )
        .apply_prompt_stage(
            TurnPromptAugmentationStageKind::ServiceSkillLaunch,
            Some(prompt_with_service_skill_launch.clone()),
        );

    let envelope = turn_input_builder.build();
    let diagnostics = envelope.diagnostics_snapshot();
    let final_prompt = envelope.system_prompt().expect("final prompt");
    let service_skill_stage = diagnostics
        .prompt_augmentation_stages
        .iter()
        .find(|stage| stage.stage == TurnPromptAugmentationStageKind::ServiceSkillLaunch)
        .expect("service skill stage");

    assert_eq!(
        diagnostics.effective_user_message_len,
        user_message.chars().count()
    );
    assert!(diagnostics.has_turn_context_metadata);
    assert!(diagnostics
        .turn_context_metadata_keys
        .contains(&"harness".to_string()));
    assert!(service_skill_stage.changed);
    assert!(final_prompt.contains(SERVICE_SKILL_LAUNCH_PROMPT_MARKER));
    assert!(final_prompt.contains("第一步优先调用 lime_site_run"));
    assert!(final_prompt.contains("不要先用 WebSearch、research、webReader"));
    assert!(final_prompt.contains("不要直接调用 mcp__lime-browser__browser_navigate"));
    assert!(final_prompt.contains("第一工具调用示例(lime_site_run 参数 JSON)"));
    assert!(final_prompt.contains("profile_key=attached-github"));
    assert!(final_prompt.contains("target_id=tab-github"));
    assert!(final_prompt.contains("\"adapter_name\":\"github/search\""));
    assert!(final_prompt.contains("attached_session_required、no_matching_context"));
}

#[test]
fn backfill_runtime_access_policies_should_derive_from_legacy_harness_access_mode() {
    let mut request = AsterChatRequest {
        message: "继续执行".to_string(),
        session_id: "session-access-legacy".to_string(),
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
        workspace_id: "workspace-access".to_string(),
        web_search: None,
        search_mode: None,
        execution_strategy: None,
        auto_continue: None,
        system_prompt: None,
        metadata: Some(json!({
            "harness": {
                "access_mode": "full-access"
            }
        })),
        turn_id: None,
        queue_if_busy: None,
        queued_turn_id: None,
    };

    backfill_runtime_access_policies(&mut request);

    assert_eq!(request.approval_policy.as_deref(), Some("never"));
    assert_eq!(
        request.sandbox_policy.as_deref(),
        Some("danger-full-access")
    );
}

#[test]
fn backfill_runtime_access_policies_should_default_to_full_access_when_request_missing() {
    let mut request = AsterChatRequest {
        message: "继续执行".to_string(),
        session_id: "session-access-default".to_string(),
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
        workspace_id: "workspace-access".to_string(),
        web_search: None,
        search_mode: None,
        execution_strategy: None,
        auto_continue: None,
        system_prompt: None,
        metadata: None,
        turn_id: None,
        queue_if_busy: None,
        queued_turn_id: None,
    };

    backfill_runtime_access_policies(&mut request);

    assert_eq!(request.approval_policy.as_deref(), Some("never"));
    assert_eq!(
        request.sandbox_policy.as_deref(),
        Some("danger-full-access")
    );
}
