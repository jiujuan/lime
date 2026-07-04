use super::*;

#[test]
fn session_config_appends_memory_context_to_system_prompt() {
    let mut request = request_for_test(
        "hello",
        None,
        Some(json!({
            crate::runtime::memory_prompt::MEMORY_PROMPT_CONTEXT_KEY: {
                "scope": "workspace",
                "path": "memory_summary.md",
                "content": "Use direct language.",
                "truncated": false,
                "citation": {
                    "startLineNumber": 1,
                    "endLineNumber": 1
                }
            }
        })),
    );
    let options = request.runtime_options.as_mut().expect("runtime options");
    options.provider_preference = Some("openai".to_string());
    options.model_preference = Some("gpt-4.1".to_string());
    let host_request = aster_chat_request_from_request(&request);
    let scope = session_scope_from_request(&request).expect("session scope");
    let selection = selection_from_explicit_preferences(&request).expect("selection");
    let policy = request_tool_policy_from_request(host_request.as_ref());

    let config = session_config_from_request(
        &request,
        host_request.as_ref(),
        &scope,
        &selection,
        &policy,
        None,
    );

    let prompt = config.system_prompt.expect("system prompt");
    assert!(prompt.contains("## Long-Term Memory Summary"));
    assert!(prompt.contains("不是用户本轮输入"));
    assert!(prompt.contains("Use direct language."));
}

#[test]
fn session_config_appends_project_agent_skills_metadata_to_system_prompt() {
    let workspace = TempDir::new().expect("workspace");
    let skill_dir = workspace.path().join(".agents/skills/research");
    std::fs::create_dir_all(&skill_dir).expect("skill dir");
    std::fs::write(
        skill_dir.join("SKILL.md"),
        r#"---
name: Research
description: Use source-backed research.
---

# Research

Full body should not be rendered.
"#,
    )
    .expect("skill file");
    let mut request = request_for_test(
        "hello",
        None,
        Some(json!({
            "harness": {
                "workspace_root": workspace.path().to_string_lossy(),
                "cwd": workspace.path().to_string_lossy()
            }
        })),
    );
    let options = request.runtime_options.as_mut().expect("runtime options");
    options.provider_preference = Some("openai".to_string());
    options.model_preference = Some("gpt-4.1".to_string());
    let host_request = aster_chat_request_from_request(&request);
    let scope = session_scope_from_request(&request).expect("session scope");
    let selection = selection_from_explicit_preferences(&request).expect("selection");
    let policy = request_tool_policy_from_request(host_request.as_ref());

    let config = session_config_from_request(
        &request,
        host_request.as_ref(),
        &scope,
        &selection,
        &policy,
        None,
    );

    let prompt = config.system_prompt.expect("system prompt");
    assert!(prompt.contains("## 可用 Agent Skills"));
    assert!(prompt.contains("`research`"));
    assert!(prompt.contains("Use source-backed research."));
    assert!(prompt.contains("必须先读取对应 `SKILL.md`"));
    assert!(!prompt.contains("Full body should not be rendered."));
    assert!(!prompt.contains("allow_model_skills"));
}

#[test]
fn fast_response_with_default_auto_search_uses_compact_tool_surface() {
    let request = request_for_test(
        "帮我快速说明 TTFT 优化重点",
        None,
        Some(json!({
            "harness": {
                "fast_response_routing": {
                    "mode": "auto",
                    "service_model_slot": "responsive_chat"
                }
            }
        })),
    );
    let host_request = aster_chat_request_from_request(&request);
    let policy = request_tool_policy_from_request(host_request.as_ref());

    assert!(!should_defer_tool_surface_for_fast_response(
        &request, &policy
    ));
    assert!(should_use_compact_tool_surface_for_fast_response(
        &request, &policy
    ));
}

#[test]
fn fast_response_with_required_search_keeps_full_tool_surface_preparation() {
    let request = request_for_test(
        "帮我快速说明 TTFT 优化重点",
        Some(json!({
            "asterChatRequest": {
                "search_mode": "required"
            }
        })),
        Some(json!({
            "harness": {
                "fast_response_routing": {
                    "mode": "auto",
                    "service_model_slot": "responsive_chat"
                }
            }
        })),
    );
    let host_request = aster_chat_request_from_request(&request);
    let policy = request_tool_policy_from_request(host_request.as_ref());

    assert_eq!(policy.search_mode, RequestToolPolicyMode::Required);
    assert!(!should_defer_tool_surface_for_fast_response(
        &request, &policy
    ));
    assert!(!should_use_compact_tool_surface_for_fast_response(
        &request, &policy
    ));
}

#[test]
fn fast_response_with_explicit_search_disabled_can_defer_tool_surface_preparation() {
    let request = request_for_test(
        "帮我快速说明 TTFT 优化重点",
        Some(json!({
            "asterChatRequest": {
                "web_search": false
            }
        })),
        Some(json!({
            "harness": {
                "fast_response_routing": {
                    "mode": "auto",
                    "service_model_slot": "responsive_chat"
                }
            }
        })),
    );
    let host_request = aster_chat_request_from_request(&request);
    let policy = request_tool_policy_from_request(host_request.as_ref());

    assert_eq!(policy.search_mode, RequestToolPolicyMode::Disabled);
    assert!(should_defer_tool_surface_for_fast_response(
        &request, &policy
    ));
    assert!(!should_use_compact_tool_surface_for_fast_response(
        &request, &policy
    ));
}

#[test]
fn fast_response_with_plugin_activation_keeps_tool_surface_preparation() {
    let request = request_for_test(
        "@创作工作台 写一篇公众号文章",
        None,
        Some(json!({
            "harness": {
                "fast_response_routing": {
                    "mode": "auto",
                    "service_model_slot": "responsive_chat"
                },
                "plugin_activation": {
                    "source": "plugin_explicit_mention",
                    "trigger": "@创作工作台",
                    "session_id": "session-1",
                    "plugin_id": "creator-workbench"
                }
            }
        })),
    );
    let host_request = aster_chat_request_from_request(&request);
    let policy = request_tool_policy_from_request(host_request.as_ref());

    assert!(!should_defer_tool_surface_for_fast_response(
        &request, &policy
    ));
    assert!(!should_use_compact_tool_surface_for_fast_response(
        &request, &policy
    ));
}

#[test]
fn session_config_defers_agent_skills_context_when_fast_response_search_disabled() {
    let workspace = TempDir::new().expect("workspace");
    let runtime_agents_dir = workspace.path().join(".lime");
    std::fs::create_dir_all(&runtime_agents_dir).expect("runtime agents dir");
    std::fs::write(
        runtime_agents_dir.join("AGENTS.md"),
        "FAST_RESPONSE_SHOULD_NOT_LOAD_RUNTIME_AGENTS",
    )
    .expect("runtime agents file");
    let skill_dir = workspace.path().join(".agents/skills/research");
    std::fs::create_dir_all(&skill_dir).expect("skill dir");
    std::fs::write(
        skill_dir.join("SKILL.md"),
        r#"---
name: Research
description: Use source-backed research.
---

# Research

Full body should not be rendered.
"#,
    )
    .expect("skill file");
    let mut request = request_for_test(
        "帮我快速说明 TTFT 优化重点",
        Some(json!({
            "asterChatRequest": {
                "web_search": false
            }
        })),
        Some(json!({
            "harness": {
                "workspace_root": workspace.path().to_string_lossy(),
                "cwd": workspace.path().to_string_lossy(),
                "memory_store_prompt_context": {
                    "scope": "workspace",
                    "path": "memory_summary.md",
                    "content": "FAST_RESPONSE_SHOULD_NOT_LOAD_MEMORY_CONTEXT"
                },
                "fast_response_routing": {
                    "mode": "auto",
                    "service_model_slot": "responsive_chat"
                }
            }
        })),
    );
    let options = request.runtime_options.as_mut().expect("runtime options");
    options.provider_preference = Some("openai".to_string());
    options.model_preference = Some("gpt-4.1".to_string());
    let host_request = aster_chat_request_from_request(&request);
    let scope = session_scope_from_request(&request).expect("session scope");
    let selection = selection_from_explicit_preferences(&request).expect("selection");
    let policy = request_tool_policy_from_request(host_request.as_ref());
    let config_metadata = json!({
        "memory": {
            "soul": {
                "source": "memory.soul",
                "summary": "FAST_RESPONSE_SHOULD_LOAD_SOUL_CONTEXT"
            }
        }
    });

    let config = session_config_from_request(
        &request,
        host_request.as_ref(),
        &scope,
        &selection,
        &policy,
        Some(config_metadata),
    );
    assert_eq!(config.include_context_trace, Some(false));

    let prompt = config.system_prompt.expect("system prompt");
    assert!(prompt.contains("你是 Lime 桌面端中的 AI 助手"));
    assert!(prompt.contains("## Interaction Soul"));
    assert!(prompt.contains("FAST_RESPONSE_SHOULD_LOAD_SOUL_CONTEXT"));
    assert!(!prompt.contains("【Lime Runtime AGENTS 指令】"));
    assert!(!prompt.contains("FAST_RESPONSE_SHOULD_NOT_LOAD_RUNTIME_AGENTS"));
    assert!(!prompt.contains("## 可用 Agent Skills"));
    assert!(!prompt.contains("`research`"));
    assert!(!prompt.contains("Use source-backed research."));
    assert!(!prompt.contains("FAST_RESPONSE_SHOULD_NOT_LOAD_MEMORY_CONTEXT"));
    let turn_context = config.turn_context.expect("turn context");
    assert!(!turn_context.metadata.contains_key("tool_scope"));
    assert_eq!(
        turn_context
            .metadata
            .get("lime_runtime")
            .and_then(|metadata| metadata.get("auto_compact"))
            .and_then(Value::as_bool),
        Some(false)
    );
    assert_eq!(
        turn_context
            .metadata
            .get("lime_runtime")
            .and_then(|metadata| metadata.get("tool_surface"))
            .and_then(Value::as_str),
        Some("direct_answer")
    );
    assert_eq!(
        turn_context
            .metadata
            .get("lime_runtime")
            .and_then(|metadata| metadata.get("source"))
            .and_then(Value::as_str),
        Some("fast_response_routing")
    );
}

#[test]
fn session_config_uses_compact_tools_when_fast_response_allows_auto_search() {
    let workspace = TempDir::new().expect("workspace");
    let runtime_agents_dir = workspace.path().join(".lime");
    std::fs::create_dir_all(&runtime_agents_dir).expect("runtime agents dir");
    std::fs::write(
        runtime_agents_dir.join("AGENTS.md"),
        "FAST_RESPONSE_AUTO_SHOULD_NOT_LOAD_RUNTIME_AGENTS",
    )
    .expect("runtime agents file");
    let skill_dir = workspace.path().join(".agents/skills/research");
    std::fs::create_dir_all(&skill_dir).expect("skill dir");
    std::fs::write(
        skill_dir.join("SKILL.md"),
        r#"---
name: Research
description: Use source-backed research.
---

# Research

Full body should not be rendered.
"#,
    )
    .expect("skill file");
    let mut request = request_for_test(
        "帮我快速说明 TTFT 优化重点",
        Some(json!({
            "asterChatRequest": {
                "webSearch": true
            }
        })),
        Some(json!({
            "harness": {
                "workspace_root": workspace.path().to_string_lossy(),
                "cwd": workspace.path().to_string_lossy(),
                "memory_store_prompt_context": {
                    "scope": "workspace",
                    "path": "memory_summary.md",
                    "content": "FAST_RESPONSE_AUTO_SHOULD_NOT_LOAD_MEMORY_CONTEXT"
                },
                "fast_response_routing": {
                    "mode": "auto",
                    "service_model_slot": "responsive_chat"
                }
            }
        })),
    );
    let options = request.runtime_options.as_mut().expect("runtime options");
    options.provider_preference = Some("openai".to_string());
    options.model_preference = Some("gpt-4.1".to_string());
    let host_request = aster_chat_request_from_request(&request);
    let scope = session_scope_from_request(&request).expect("session scope");
    let selection = selection_from_explicit_preferences(&request).expect("selection");
    let policy = request_tool_policy_from_request(host_request.as_ref());
    assert!(policy.allows_web_search());
    let config_metadata = json!({
        "memory": {
            "soul": {
                "source": "memory.soul",
                "summary": "FAST_RESPONSE_AUTO_SHOULD_LOAD_SOUL_CONTEXT"
            }
        }
    });

    let config = session_config_from_request(
        &request,
        host_request.as_ref(),
        &scope,
        &selection,
        &policy,
        Some(config_metadata),
    );
    assert_eq!(config.include_context_trace, Some(false));
    let turn_context = config.turn_context.as_ref().expect("turn context");
    assert_eq!(
        turn_context
            .metadata
            .get("lime_runtime")
            .and_then(|metadata| metadata.get("tool_surface"))
            .and_then(Value::as_str),
        Some("compact_tools")
    );
    assert_eq!(
        turn_context
            .metadata
            .get("lime_runtime")
            .and_then(|metadata| metadata.get("source"))
            .and_then(Value::as_str),
        Some("fast_response_routing")
    );
    assert_eq!(
        turn_context
            .metadata
            .get("web_search_enabled")
            .and_then(Value::as_bool),
        Some(true)
    );

    let prompt = config.system_prompt.expect("system prompt");
    assert!(prompt.contains("你是 Lime 桌面端中的 AI 助手"));
    assert!(prompt.contains("## Interaction Soul"));
    assert!(prompt.contains("FAST_RESPONSE_AUTO_SHOULD_LOAD_SOUL_CONTEXT"));
    assert!(!prompt.contains("【Lime Runtime AGENTS 指令】"));
    assert!(!prompt.contains("FAST_RESPONSE_AUTO_SHOULD_NOT_LOAD_RUNTIME_AGENTS"));
    assert!(!prompt.contains("## 可用 Agent Skills"));
    assert!(!prompt.contains("`research`"));
    assert!(!prompt.contains("Use source-backed research."));
    assert!(!prompt.contains("FAST_RESPONSE_AUTO_SHOULD_NOT_LOAD_MEMORY_CONTEXT"));
}
