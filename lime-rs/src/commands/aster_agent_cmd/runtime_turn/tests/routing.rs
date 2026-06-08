use super::*;

#[test]
fn resolve_turn_execution_profile_should_use_fast_chat_for_plain_general_message() {
    let request = build_runtime_turn_test_request(
        "你好",
        Some(json!({
            "harness": {
                "theme": "general",
                "chat_mode": "general",
                "session_mode": "general_workbench"
            }
        })),
    );
    let policy = lime_agent::resolve_request_tool_policy(Some(false), false);

    assert_eq!(
        resolve_turn_execution_profile(
            &request,
            RuntimeChatMode::General,
            &policy,
            false,
            AsterExecutionStrategy::React,
        ),
        TurnExecutionProfile::FastChat
    );
}

#[test]
fn resolve_turn_execution_profile_should_not_use_full_runtime_for_plain_react_strategy() {
    let request = build_runtime_turn_test_request(
        "继续修复消息历史切换后图片卡片丢失的问题，并补一个回归测试",
        Some(json!({
            "harness": {
                "theme": "general",
                "chat_mode": "general",
                "preferences": {
                    "web_search": false,
                    "thinking": false,
                    "task": false,
                    "subagent": false
                }
            }
        })),
    );
    let policy = lime_agent::resolve_request_tool_policy(Some(false), false);

    assert_eq!(
        resolve_turn_execution_profile(
            &request,
            RuntimeChatMode::General,
            &policy,
            false,
            AsterExecutionStrategy::React,
        ),
        TurnExecutionProfile::FastChat
    );
}

#[test]
fn legacy_code_orchestrated_effective_strategy_should_resolve_to_react() {
    assert_eq!(
        AsterExecutionStrategy::from_db_value(Some("code_orchestrated")),
        AsterExecutionStrategy::React
    );
}

#[test]
fn resolve_turn_execution_profile_should_keep_fast_chat_for_default_browser_assist_hint() {
    let request = build_runtime_turn_test_request(
        "你好",
        Some(json!({
            "harness": {
                "theme": "general",
                "chat_mode": "general",
                "browser_assist": {
                    "enabled": true,
                    "profile_key": "general_browser_assist",
                    "auto_launch": true,
                    "stream_mode": "both"
                }
            }
        })),
    );
    let policy = lime_agent::resolve_request_tool_policy(Some(false), false);

    assert_eq!(
        resolve_turn_execution_profile(
            &request,
            RuntimeChatMode::General,
            &policy,
            false,
            AsterExecutionStrategy::React,
        ),
        TurnExecutionProfile::FastChat
    );
}

#[test]
fn resolve_turn_execution_profile_should_use_full_runtime_for_service_skill_launch() {
    let request = build_runtime_turn_test_request(
        "请帮我抓取站点内容",
        Some(json!({
            "harness": {
                "theme": "general",
                "chat_mode": "general",
                "service_skill_launch": {
                    "adapter_name": "github/search"
                }
            }
        })),
    );
    let policy = lime_agent::resolve_request_tool_policy(Some(false), false);

    assert_eq!(
        resolve_turn_execution_profile(
            &request,
            RuntimeChatMode::General,
            &policy,
            false,
            AsterExecutionStrategy::React,
        ),
        TurnExecutionProfile::FullRuntime
    );
}

#[test]
fn resolve_turn_execution_profile_should_use_full_runtime_for_expert_metadata() {
    let request = build_runtime_turn_test_request(
        "请以营销策略专家身份分析这个活动方案",
        Some(json!({
            "harness": {
                "theme": "general",
                "chat_mode": "general",
                "expert": {
                    "expert_id": "marketing-strategist",
                    "release_id": "rel-marketing-strategist-20260515",
                    "persona_ref": "expert-persona:marketing-strategist@1.0.0",
                    "memory_enabled": true,
                    "workflow_enabled": true,
                    "personality_boundary": {
                        "inherits_global_soul": true,
                        "global_soul_scope": "communication_rhythm",
                        "expert_persona_scope": "current_expert_session",
                        "writes_back_to_global_soul": false,
                        "formal_artifact_voice_source": "generation_brief_only"
                    }
                }
            }
        })),
    );
    let policy = lime_agent::resolve_request_tool_policy(Some(false), false);

    assert!(request_metadata_contains_full_runtime_context(
        request.metadata.as_ref()
    ));
    assert_eq!(
        resolve_turn_execution_profile(
            &request,
            RuntimeChatMode::General,
            &policy,
            false,
            AsterExecutionStrategy::React,
        ),
        TurnExecutionProfile::FullRuntime
    );
}

#[test]
fn resolve_turn_execution_profile_should_use_full_runtime_for_image_skill_launch_without_model_skill_flag(
) {
    let request = build_runtime_turn_test_request(
        "@配图 生成 一张春日咖啡馆插画",
        Some(json!({
            "harness": {
                "theme": "general",
                "chat_mode": "general",
                "image_skill_launch": {
                    "image_task": {
                        "mode": "generate",
                        "prompt": "一张春日咖啡馆插画"
                    }
                }
            }
        })),
    );
    let policy = lime_agent::resolve_request_tool_policy(Some(false), false);

    assert_eq!(
        resolve_turn_execution_profile(
            &request,
            RuntimeChatMode::General,
            &policy,
            false,
            AsterExecutionStrategy::React,
        ),
        TurnExecutionProfile::FullRuntime
    );
}

#[test]
fn resolve_turn_execution_profile_should_keep_fast_chat_for_allowed_web_search() {
    let mut request = build_runtime_turn_test_request("帮我搜今天的新闻", None);
    request.web_search = Some(true);
    let policy = lime_agent::resolve_request_tool_policy(Some(true), false);

    assert_eq!(
        resolve_turn_execution_profile(
            &request,
            RuntimeChatMode::General,
            &policy,
            false,
            AsterExecutionStrategy::React,
        ),
        TurnExecutionProfile::FastChat
    );
}

#[test]
fn natural_language_news_turn_should_leave_search_mode_to_model_tool_choice() {
    let request = build_runtime_turn_test_request("整理今天的国际新闻", None);
    let policy = lime_agent::resolve_request_tool_policy_with_mode(None, None, true);

    assert_eq!(policy.search_mode, RequestToolPolicyMode::Allowed);
    assert!(policy.allows_web_search());
    assert!(!policy.requires_web_search());
    assert_eq!(
        resolve_turn_execution_profile(
            &request,
            RuntimeChatMode::General,
            &policy,
            false,
            AsterExecutionStrategy::React,
        ),
        TurnExecutionProfile::FastChat
    );
    assert_eq!(
        resolve_fast_chat_tool_surface_mode(&request, TurnExecutionProfile::FastChat, &policy),
        None
    );
}

#[test]
fn natural_language_news_turn_should_respect_explicit_search_disabled() {
    let request = build_runtime_turn_test_request("整理今天的国际新闻", None);
    let policy = lime_agent::resolve_request_tool_policy_with_mode(Some(false), None, true);

    assert_eq!(policy.search_mode, RequestToolPolicyMode::Disabled);
    assert!(!policy.allows_web_search());
}

#[test]
fn resolve_turn_execution_profile_should_use_full_runtime_for_required_web_search() {
    let mut request = build_runtime_turn_test_request("帮我搜今天的新闻", None);
    request.web_search = Some(true);
    request.search_mode = Some(RequestToolPolicyMode::Required);
    let policy = lime_agent::resolve_request_tool_policy_with_mode(
        Some(true),
        Some(RequestToolPolicyMode::Required),
        false,
    );

    assert_eq!(
        resolve_turn_execution_profile(
            &request,
            RuntimeChatMode::General,
            &policy,
            false,
            AsterExecutionStrategy::React,
        ),
        TurnExecutionProfile::FullRuntime
    );
}

#[test]
fn should_prewarm_mcp_runtime_should_skip_web_search_only_required_turn() {
    let mut request = build_runtime_turn_test_request("帮我搜今天的新闻", None);
    request.web_search = Some(true);
    request.search_mode = Some(RequestToolPolicyMode::Required);
    let policy = lime_agent::resolve_request_tool_policy_with_mode(
        Some(true),
        Some(RequestToolPolicyMode::Required),
        false,
    );

    assert!(!should_prewarm_mcp_runtime(
        &request,
        TurnExecutionProfile::FullRuntime,
        RuntimeChatMode::General,
        &policy,
    ));
    assert_eq!(
        resolve_mcp_prewarm_skip_reason(
            &request,
            TurnExecutionProfile::FullRuntime,
            RuntimeChatMode::General,
            &policy,
        ),
        Some("web_search_only_native_tools")
    );
}

#[test]
fn should_prewarm_mcp_runtime_should_skip_pending_runtime_permission_confirmation() {
    let request = build_runtime_turn_test_request(
        "请先确认本轮运行时权限",
        Some(json!({
            "lime_runtime": {
                "permission_state": {
                    "status": "requires_confirmation",
                    "requiredProfileKeys": ["browser_control", "web_search"],
                    "askProfileKeys": ["browser_control", "web_search"],
                    "blockingProfileKeys": [],
                    "decisionSource": "execution_profile_registry",
                    "decisionScope": "declared_permission_profiles_only",
                    "confirmationStatus": "not_requested",
                    "confirmationSource": "declared_profile_only"
                }
            }
        })),
    );
    let policy = lime_agent::resolve_request_tool_policy(Some(false), false);

    assert!(!should_prewarm_mcp_runtime(
        &request,
        TurnExecutionProfile::FullRuntime,
        RuntimeChatMode::General,
        &policy,
    ));
    assert_eq!(
        resolve_mcp_prewarm_skip_reason(
            &request,
            TurnExecutionProfile::FullRuntime,
            RuntimeChatMode::General,
            &policy,
        ),
        Some("runtime_permission_confirmation_pending")
    );
}

#[test]
fn should_prewarm_mcp_runtime_should_skip_explicit_harness_request() {
    let request = build_runtime_turn_test_request(
        "请修复 fixture 并运行校验",
        Some(json!({
            "harness": {
                "skip_mcp_prewarm": true,
                "code_runtime_fixture": {
                    "scenario_id": "natural-language-code-runtime-fixture"
                }
            }
        })),
    );
    let policy = lime_agent::resolve_request_tool_policy(Some(false), false);

    assert!(!should_prewarm_mcp_runtime(
        &request,
        TurnExecutionProfile::FullRuntime,
        RuntimeChatMode::General,
        &policy,
    ));
    assert_eq!(
        resolve_mcp_prewarm_skip_reason(
            &request,
            TurnExecutionProfile::FullRuntime,
            RuntimeChatMode::General,
            &policy,
        ),
        Some("request_skip_mcp_prewarm")
    );
}

#[test]
fn should_prewarm_mcp_runtime_should_skip_explicit_camel_case_harness_request() {
    let request = build_runtime_turn_test_request(
        "请修复 fixture 并运行校验",
        Some(json!({
            "harness": {
                "skipMcpPrewarm": true
            }
        })),
    );
    let policy = lime_agent::resolve_request_tool_policy(Some(false), false);

    assert!(!should_prewarm_mcp_runtime(
        &request,
        TurnExecutionProfile::FullRuntime,
        RuntimeChatMode::General,
        &policy,
    ));
    assert_eq!(
        resolve_mcp_prewarm_skip_reason(
            &request,
            TurnExecutionProfile::FullRuntime,
            RuntimeChatMode::General,
            &policy,
        ),
        Some("request_skip_mcp_prewarm")
    );
}

#[test]
fn should_prewarm_mcp_runtime_should_keep_full_context_turns_warm() {
    let mut request = build_runtime_turn_test_request(
        "请帮我抓取站点内容",
        Some(json!({
            "harness": {
                "theme": "general",
                "chat_mode": "general",
                "service_skill_launch": {
                    "adapter_name": "github/search"
                }
            }
        })),
    );
    request.web_search = Some(true);
    let policy = lime_agent::resolve_request_tool_policy(Some(true), false);

    assert!(should_prewarm_mcp_runtime(
        &request,
        TurnExecutionProfile::FullRuntime,
        RuntimeChatMode::General,
        &policy,
    ));
}

#[test]
fn resolve_fast_chat_tool_surface_mode_should_use_direct_answer_for_plain_greeting() {
    let request = build_runtime_turn_test_request("你好", None);
    let policy = lime_agent::resolve_request_tool_policy(Some(false), false);

    assert_eq!(
        resolve_fast_chat_tool_surface_mode(&request, TurnExecutionProfile::FastChat, &policy,),
        Some(FAST_CHAT_TOOL_SURFACE_DIRECT_ANSWER)
    );
}

#[test]
fn resolve_fast_chat_tool_surface_mode_should_use_local_workspace_for_explicit_local_path() {
    let temp_dir = tempfile::TempDir::new().expect("create temp dir");
    let repo_dir = temp_dir.path().join("claudecode");
    std::fs::create_dir_all(&repo_dir).expect("create repo dir");
    let request =
        build_runtime_turn_test_request(&format!("请读取并分析项目 {}", repo_dir.display()), None);
    let policy = lime_agent::resolve_request_tool_policy(Some(false), false);

    assert_eq!(
        resolve_fast_chat_tool_surface_mode(&request, TurnExecutionProfile::FastChat, &policy,),
        Some(FAST_CHAT_TOOL_SURFACE_LOCAL_WORKSPACE)
    );
}

#[test]
fn resolve_fast_chat_tool_surface_mode_should_not_infer_local_workspace_from_repo_keywords() {
    let request = build_runtime_turn_test_request("帮我看看这个仓库哪里慢", None);
    let policy = lime_agent::resolve_request_tool_policy(Some(false), false);

    assert_eq!(
        resolve_fast_chat_tool_surface_mode(&request, TurnExecutionProfile::FastChat, &policy,),
        Some(FAST_CHAT_TOOL_SURFACE_DIRECT_ANSWER)
    );
}

#[test]
fn resolve_runtime_turn_base_system_prompt_should_prefer_frontend_for_fast_chat() {
    let (prompt, source) = resolve_runtime_turn_base_system_prompt(
        TurnExecutionProfile::FastChat,
        Some("项目长提示".to_string()),
        Some("会话长提示".to_string()),
        Some("快速响应短提示"),
    );

    assert_eq!(source, TurnSystemPromptSource::Frontend);
    assert_eq!(prompt.as_deref(), Some("快速响应短提示"));
}

#[test]
fn resolve_runtime_turn_base_system_prompt_should_keep_full_runtime_priority() {
    let (prompt, source) = resolve_runtime_turn_base_system_prompt(
        TurnExecutionProfile::FullRuntime,
        Some("项目长提示".to_string()),
        Some("会话长提示".to_string()),
        Some("快速响应短提示"),
    );

    assert_eq!(source, TurnSystemPromptSource::Project);
    assert_eq!(prompt.as_deref(), Some("项目长提示"));
}

#[test]
fn resolve_runtime_turn_base_system_prompt_should_fallback_to_session_for_fast_chat() {
    let (prompt, source) = resolve_runtime_turn_base_system_prompt(
        TurnExecutionProfile::FastChat,
        None,
        Some("会话长提示".to_string()),
        Some("   "),
    );

    assert_eq!(source, TurnSystemPromptSource::Session);
    assert_eq!(prompt.as_deref(), Some("会话长提示"));
}

#[test]
fn should_override_system_prompt_for_fast_response_requires_metadata_and_short_frontend_prompt() {
    let metadata = json!({
        "harness": {
            "fast_response_routing": {
                "mode": "auto",
                "reason": "first-turn-short-prompt",
                "provider": "deepseek",
                "model": "deepseek-chat"
            }
        }
    });

    assert!(should_override_system_prompt_for_fast_response(
        TurnExecutionProfile::FastChat,
        TurnSystemPromptSource::Frontend,
        Some("短提示"),
        Some(&metadata),
    ));
    assert!(!should_override_system_prompt_for_fast_response(
        TurnExecutionProfile::FullRuntime,
        TurnSystemPromptSource::Frontend,
        Some("短提示"),
        Some(&metadata),
    ));
    assert!(!should_override_system_prompt_for_fast_response(
        TurnExecutionProfile::FastChat,
        TurnSystemPromptSource::Session,
        Some("短提示"),
        Some(&metadata),
    ));
    assert!(!should_override_system_prompt_for_fast_response(
        TurnExecutionProfile::FastChat,
        TurnSystemPromptSource::Frontend,
        Some("短提示"),
        None,
    ));
}

#[test]
fn should_override_system_prompt_for_fast_response_rejects_long_prompt() {
    let metadata = json!({
        "harness": {
            "fast_response_routing": {
                "mode": "auto",
                "reason": "first-turn-short-prompt",
                "provider": "deepseek",
                "model": "deepseek-chat"
            }
        }
    });
    let long_prompt = "你".repeat(FAST_RESPONSE_SYSTEM_PROMPT_OVERRIDE_MAX_CHARS + 1);

    assert!(!should_override_system_prompt_for_fast_response(
        TurnExecutionProfile::FastChat,
        TurnSystemPromptSource::Frontend,
        Some(&long_prompt),
        Some(&metadata),
    ));
}
