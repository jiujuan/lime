use super::*;

#[test]
fn request_working_dir_uses_host_turn_config_absolute_directory() {
    let workspace = TempDir::new().expect("create workspace");
    let request = request_for_test(
        "hello",
        Some(json!({
            "asterChatRequest": {
                "turn_config": {
                    "working_dir": workspace.path().to_string_lossy()
                }
            }
        })),
        None,
    );
    let host_request = aster_chat_request_from_request(&request);

    let working_dir = request_workspace_scope(&request, host_request.as_ref())
        .working_dir
        .expect("working dir");

    assert_eq!(working_dir, workspace.path());
}

#[test]
fn request_working_dir_prefers_turn_config_over_host_top_level() {
    let top_level_workspace = TempDir::new().expect("create top-level workspace");
    let turn_workspace = TempDir::new().expect("create turn workspace");
    let request = request_for_test(
        "hello",
        Some(json!({
            "asterChatRequest": {
                "working_dir": top_level_workspace.path().to_string_lossy(),
                "turn_config": {
                    "working_dir": turn_workspace.path().to_string_lossy()
                }
            }
        })),
        None,
    );
    let host_request = aster_chat_request_from_request(&request);

    let working_dir = request_workspace_scope(&request, host_request.as_ref())
        .working_dir
        .expect("working dir");

    assert_eq!(working_dir, turn_workspace.path());
}

#[test]
fn request_working_dir_rejects_relative_directory() {
    let request = request_for_test(
        "hello",
        Some(json!({
            "asterChatRequest": {
                "working_dir": "relative-workspace"
            }
        })),
        None,
    );
    let host_request = aster_chat_request_from_request(&request);

    assert!(request_workspace_scope(&request, host_request.as_ref())
        .working_dir
        .is_none());
}

#[test]
fn request_workspace_scope_keeps_project_root_and_working_dir_distinct() {
    let workspace = TempDir::new().expect("create workspace");
    let repo = workspace.path().join("repo");
    let nested = repo.join("apps").join("writer");
    std::fs::create_dir_all(&nested).expect("create nested");
    let request = request_for_test(
        "hello",
        Some(json!({
            "asterChatRequest": {
                "projectRoot": repo.to_string_lossy(),
                "turnConfig": {
                    "workingDir": nested.to_string_lossy()
                }
            }
        })),
        None,
    );
    let host_request = aster_chat_request_from_request(&request);

    let scope = request_workspace_scope(&request, host_request.as_ref());

    assert_eq!(scope.working_dir.as_deref(), Some(nested.as_path()));
    assert_eq!(scope.project_root.as_deref(), Some(repo.as_path()));
}

#[test]
fn request_workspace_scope_falls_back_to_project_root_when_working_dir_missing() {
    let workspace = TempDir::new().expect("create workspace");
    let request = request_for_test(
        "hello",
        None,
        Some(json!({
            "workspaceRoot": workspace.path().to_string_lossy()
        })),
    );

    let scope = request_workspace_scope(&request, None);

    assert_eq!(scope.working_dir.as_deref(), Some(workspace.path()));
    assert_eq!(scope.project_root.as_deref(), Some(workspace.path()));
}

#[test]
fn session_config_merges_turn_prompt_runtime_agents_and_tool_policy() {
    let workspace = TempDir::new().expect("create workspace");
    let runtime_agents_path = workspace.path().join(".lime").join("AGENTS.md");
    std::fs::create_dir_all(runtime_agents_path.parent().expect("runtime agents parent"))
        .expect("create runtime agents parent");
    std::fs::write(&runtime_agents_path, "- 工作区动态指令").expect("write runtime agents");
    let request = request_for_test(
        "需要联网核实最新信息",
        Some(json!({
            "asterChatRequest": {
                "turn_config": {
                    "system_prompt": "请求级系统提示",
                    "working_dir": workspace.path().to_string_lossy(),
                    "web_search": true,
                    "search_mode": "required"
                }
            }
        })),
        None,
    );
    let host_request = aster_chat_request_from_request(&request);
    let scope = session_scope_from_request(&request).expect("scope");
    let selection = RuntimeModelSelection {
        provider: "openai".to_string(),
        model: "gpt-4.1".to_string(),
        source: "test",
        reasoning_effort: Some("high".to_string()),
    };
    let policy = request_tool_policy_from_request(host_request.as_ref());

    let config = session_config_from_request(
        &request,
        host_request.as_ref(),
        &scope,
        &selection,
        &policy,
        None,
    );
    let system_prompt = config.system_prompt.expect("system prompt");

    assert!(system_prompt.contains("请求级系统提示"));
    assert!(system_prompt.contains("【Lime Runtime AGENTS 指令】"));
    assert!(system_prompt.contains("工作区动态指令"));
    assert!(system_prompt.contains("【请求级工具策略】"));
}

#[test]
fn session_config_merges_hierarchical_runtime_agents_layers() {
    let workspace = TempDir::new().expect("create workspace");
    let repo = workspace.path().join("repo");
    let nested = repo.join("apps").join("writer");
    std::fs::create_dir_all(nested.join(".lime")).expect("create nested runtime agents dir");
    std::fs::create_dir_all(repo.join(".lime")).expect("create root runtime agents dir");
    std::fs::write(repo.join(".git"), "").expect("write project marker");
    std::fs::write(repo.join(".lime").join("AGENTS.md"), "- 根共享规则")
        .expect("write root shared runtime agents");
    std::fs::write(repo.join(".lime").join("AGENTS.local.md"), "- 根本地规则")
        .expect("write root local runtime agents");
    std::fs::write(nested.join(".lime").join("AGENTS.md"), "- 子目录共享规则")
        .expect("write nested shared runtime agents");
    std::fs::write(
        nested.join(".lime").join("AGENTS.local.md"),
        "- 子目录本地规则",
    )
    .expect("write nested local runtime agents");
    let request = request_for_test(
        "请按项目规则处理",
        Some(json!({
            "asterChatRequest": {
                "turn_config": {
                    "system_prompt": "请求级系统提示",
                    "working_dir": nested.to_string_lossy()
                }
            }
        })),
        None,
    );
    let host_request = aster_chat_request_from_request(&request);
    let scope = session_scope_from_request(&request).expect("scope");
    let selection = RuntimeModelSelection {
        provider: "openai".to_string(),
        model: "gpt-4.1".to_string(),
        source: "test",
        reasoning_effort: None,
    };
    let policy = request_tool_policy_from_request(host_request.as_ref());

    let config = session_config_from_request(
        &request,
        host_request.as_ref(),
        &scope,
        &selection,
        &policy,
        None,
    );
    let system_prompt = config.system_prompt.expect("system prompt");
    let root_shared = system_prompt.find("根共享规则").expect("root shared");
    let root_local = system_prompt.find("根本地规则").expect("root local");
    let nested_shared = system_prompt.find("子目录共享规则").expect("nested shared");
    let nested_local = system_prompt.find("子目录本地规则").expect("nested local");

    assert!(system_prompt.contains("请求级系统提示"));
    assert!(root_shared < root_local);
    assert!(root_local < nested_shared);
    assert!(nested_shared < nested_local);
}

#[test]
fn session_config_uses_explicit_project_root_for_runtime_agents_boundary() {
    let workspace = TempDir::new().expect("create workspace");
    let parent = workspace.path().join("parent");
    let repo = parent.join("repo");
    let nested = repo.join("apps").join("writer");
    std::fs::create_dir_all(parent.join(".lime")).expect("create parent runtime agents dir");
    std::fs::create_dir_all(repo.join(".lime")).expect("create root runtime agents dir");
    std::fs::create_dir_all(nested.join(".lime")).expect("create nested runtime agents dir");
    std::fs::write(
        parent.join(".lime").join("AGENTS.md"),
        "- 父目录规则不应出现",
    )
    .expect("write parent runtime agents");
    std::fs::write(repo.join(".lime").join("AGENTS.md"), "- 显式根规则")
        .expect("write root runtime agents");
    std::fs::write(
        nested.join(".lime").join("AGENTS.override.md"),
        "- 子目录覆盖规则",
    )
    .expect("write nested override runtime agents");
    std::fs::write(
        nested.join(".lime").join("AGENTS.local.md"),
        "- 子目录本地规则",
    )
    .expect("write nested local runtime agents");
    let request = request_for_test(
        "请按项目规则处理",
        Some(json!({
            "asterChatRequest": {
                "projectRoot": repo.to_string_lossy(),
                "turnConfig": {
                    "systemPrompt": "请求级系统提示",
                    "workingDir": nested.to_string_lossy()
                }
            }
        })),
        None,
    );
    let host_request = aster_chat_request_from_request(&request);
    let scope = session_scope_from_request(&request).expect("scope");
    let selection = RuntimeModelSelection {
        provider: "openai".to_string(),
        model: "gpt-4.1".to_string(),
        source: "test",
        reasoning_effort: None,
    };
    let policy = request_tool_policy_from_request(host_request.as_ref());

    let config = session_config_from_request(
        &request,
        host_request.as_ref(),
        &scope,
        &selection,
        &policy,
        None,
    );
    let system_prompt = config.system_prompt.expect("system prompt");
    let root_rule = system_prompt.find("显式根规则").expect("root rule");
    let nested_override = system_prompt
        .find("子目录覆盖规则")
        .expect("nested override rule");
    let nested_local = system_prompt
        .find("子目录本地规则")
        .expect("nested local rule");
    let turn_context = config.turn_context.expect("turn context");
    let runtime_metadata = turn_context
        .metadata
        .get("app_server_runtime_backend")
        .expect("runtime metadata");
    let nested_string = nested.to_string_lossy().to_string();
    let repo_string = repo.to_string_lossy().to_string();

    assert!(system_prompt.contains("# AGENTS.md instructions"));
    assert!(system_prompt.contains("<INSTRUCTIONS>"));
    assert!(root_rule < nested_override);
    assert!(nested_override < nested_local);
    assert!(!system_prompt.contains("父目录规则不应出现"));
    assert_eq!(turn_context.cwd.as_deref(), Some(nested.as_path()));
    assert_eq!(
        runtime_metadata["workingDir"].as_str(),
        Some(nested_string.as_str()),
    );
    assert_eq!(
        runtime_metadata["projectRoot"].as_str(),
        Some(repo_string.as_str()),
    );
}

#[test]
fn host_turn_config_reasoning_and_thinking_are_preserved() {
    let request = request_for_test(
        "hello",
        Some(json!({
            "asterChatRequest": {
                "reasoning_effort": "low",
                "thinking_enabled": false,
                "turn_config": {
                    "reasoning_effort": "high",
                    "thinking_enabled": true
                }
            }
        })),
        None,
    );
    let host_request = aster_chat_request_from_request(&request).expect("host request");

    assert_eq!(
        host_reasoning_effort(&host_request).as_deref(),
        Some("high")
    );
    assert_eq!(host_thinking_enabled(&host_request), Some(true));

    let scope = session_scope_from_request(&request).expect("scope");
    let selection = RuntimeModelSelection {
        provider: "openai".to_string(),
        model: "gpt-4.1".to_string(),
        source: "test",
        reasoning_effort: Some("high".to_string()),
    };
    let turn_context =
        turn_context_from_request(&request, Some(&host_request), &scope, &selection, None)
            .expect("turn context");
    let runtime_metadata = turn_context
        .metadata
        .get("app_server_runtime_backend")
        .expect("runtime metadata");

    assert_eq!(runtime_metadata["thinkingEnabled"], true);
}
