use super::*;

#[test]
fn queued_turn_task_should_materialize_turn_id_before_runtime_execution() {
    let request = build_runtime_turn_test_request("hello", None);

    let queued_task = build_queued_turn_task(request).expect("build queued task");
    let payload: AsterChatRequest =
        serde_json::from_value(queued_task.payload).expect("deserialize queued payload");

    assert!(
        payload
            .turn_id
            .as_deref()
            .is_some_and(|turn_id| !turn_id.trim().is_empty()),
        "queued runtime payload must carry a stable turn id"
    );
}

#[test]
fn queued_turn_task_should_preserve_plan_and_goal_metadata() {
    let request = build_runtime_turn_test_request(
        "先规划再持续推进",
        Some(json!({
            "harness": {
                "task_mode_enabled": true,
                "goal_mode_enabled": true,
                "preferences": {
                    "task": true,
                    "task_mode": true,
                    "goal": true,
                    "objective": true
                },
                "collaboration_mode": {
                    "mode": "plan",
                    "source": "inputbar"
                },
                "thread_goal": {
                    "enabled": true,
                    "source": "inputbar",
                    "status": "active",
                    "set": {
                        "threadId": "thread-workspace-plan-goal",
                        "objective": null,
                        "status": "active",
                        "tokenBudget": null
                    }
                }
            }
        })),
    );

    let queued_task = build_queued_turn_task(request).expect("build queued task");
    let payload: AsterChatRequest =
        serde_json::from_value(queued_task.payload).expect("deserialize queued payload");
    let metadata = payload.metadata.expect("queued payload metadata");

    assert_eq!(
        metadata.pointer("/harness/collaboration_mode/mode"),
        Some(&json!("plan"))
    );
    assert_eq!(
        metadata.pointer("/harness/thread_goal/set/threadId"),
        Some(&json!("thread-workspace-plan-goal"))
    );
    assert_eq!(
        metadata.pointer("/harness/goal_mode_enabled"),
        Some(&json!(true))
    );
    assert!(
        payload
            .turn_id
            .as_deref()
            .is_some_and(|turn_id| !turn_id.trim().is_empty()),
        "queued runtime payload must keep materialized turn id"
    );
}

#[tokio::test]
async fn compact_tool_surface_should_bound_provider_tools_in_runtime_crate() {
    ensure_runtime_turn_test_session_manager().await;

    let agent = Agent::new();

    let session = create_managed_session(
        PathBuf::from("."),
        "compact tool surface 集成测试".to_string(),
        SessionType::User,
    )
    .await
    .expect("创建测试会话失败");

    let model_config = ModelConfig::new("gpt-4.1").expect("测试模型应有效");
    let provider = Arc::new(AutoCompactThresholdTestProvider::new(Some(200_000)));
    agent
        .update_provider(provider, &session.id)
        .await
        .expect("设置测试 provider 失败");

    let working_dir = std::env::current_dir().expect("读取当前目录失败");
    let (tools, _toolshim_tools, _system_prompt) = aster::session_context::with_turn_context(
        Some(build_compact_tool_surface_turn_context()),
        async {
            agent
                .prepare_tools_and_prompt(&working_dir, None, false, &model_config)
                .await
        },
    )
    .await
    .expect("准备工具面失败");

    let names: Vec<String> = tools.iter().map(|tool| tool.name.to_string()).collect();
    assert!(!names.is_empty(), "compact 工具面不应为空");
    assert!(
        names.len() <= COMPACT_PROVIDER_BROKER_TOOL_NAMES.len(),
        "compact broker 工具面最多应有 {} 个工具，实际为 {}: {:?}",
        COMPACT_PROVIDER_BROKER_TOOL_NAMES.len(),
        names.len(),
        names
    );
    assert!(
        names.iter().all(|name| COMPACT_PROVIDER_BROKER_TOOL_NAMES
            .iter()
            .any(|candidate| candidate.eq_ignore_ascii_case(name))),
        "compact provider tools 只能包含 broker / deferred / 本地核心工具: {names:?}"
    );
    assert!(names.contains(&TOOL_SEARCH_TOOL_NAME.to_string()));
    assert!(names.contains(&"Read".to_string()));
    assert!(!names.contains(&"TeamCreate".to_string()));
    assert!(!names.contains(&"TeamDelete".to_string()));

    delete_managed_session(&session.id)
        .await
        .expect("清理测试会话失败");
}
