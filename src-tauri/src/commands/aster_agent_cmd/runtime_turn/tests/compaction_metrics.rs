use super::*;

#[tokio::test]
async fn update_compaction_session_metrics_should_move_summary_tokens_to_current_window() {
    ensure_runtime_turn_test_session_manager().await;

    let session = create_managed_session(
        PathBuf::from("."),
        "压缩统计测试".to_string(),
        SessionType::User,
    )
    .await
    .expect("创建测试会话失败");

    apply_session_update(&session.id, |update| {
        update
            .schedule_id(Some("job-before".to_string()))
            .total_tokens(Some(90))
            .input_tokens(Some(60))
            .output_tokens(Some(30))
            .cached_input_tokens(Some(12))
            .cache_creation_input_tokens(Some(4))
            .accumulated_total_tokens(Some(300))
            .accumulated_input_tokens(Some(200))
            .accumulated_output_tokens(Some(100))
    })
    .await
    .expect("预置 token 统计失败");

    let mut session_config = SessionConfigBuilder::new(&session.id).build();
    session_config.schedule_id = Some("job-compact".to_string());

    let usage = ProviderUsage::new(
        "gpt-4.1".to_string(),
        Usage::new(Some(120), Some(45), Some(165))
            .with_cached_input_tokens(Some(90))
            .with_cache_creation_input_tokens(Some(30)),
    );

    update_compaction_session_metrics(&session_config, &usage)
        .await
        .expect("更新压缩 token 统计失败");

    let updated = query_session(&session.id, false)
        .await
        .expect("读取更新后的会话失败");

    assert_eq!(updated.schedule_id.as_deref(), Some("job-compact"));
    assert_eq!(updated.total_tokens, Some(45));
    assert_eq!(updated.input_tokens, Some(45));
    assert_eq!(updated.output_tokens, Some(0));
    assert_eq!(updated.cached_input_tokens, Some(90));
    assert_eq!(updated.cache_creation_input_tokens, Some(30));
    assert_eq!(updated.accumulated_total_tokens, Some(465));
    assert_eq!(updated.accumulated_input_tokens, Some(320));
    assert_eq!(updated.accumulated_output_tokens, Some(145));

    delete_managed_session(&session.id)
        .await
        .expect("清理测试会话失败");
}

#[tokio::test]
async fn update_compaction_session_metrics_should_reset_current_window_when_usage_tokens_missing() {
    ensure_runtime_turn_test_session_manager().await;

    let session = create_managed_session(
        PathBuf::from("."),
        "压缩统计缺字段测试".to_string(),
        SessionType::User,
    )
    .await
    .expect("创建测试会话失败");

    apply_session_update(&session.id, |update| {
        update
            .schedule_id(Some("job-before".to_string()))
            .total_tokens(Some(180))
            .input_tokens(Some(120))
            .output_tokens(Some(60))
            .cached_input_tokens(Some(24))
            .cache_creation_input_tokens(Some(8))
            .accumulated_total_tokens(Some(700))
            .accumulated_input_tokens(Some(500))
            .accumulated_output_tokens(Some(200))
    })
    .await
    .expect("预置 token 统计失败");

    let mut session_config = SessionConfigBuilder::new(&session.id).build();
    session_config.schedule_id = Some("job-compact-missing".to_string());

    let usage = ProviderUsage::new("gpt-4.1".to_string(), Usage::default());

    update_compaction_session_metrics(&session_config, &usage)
        .await
        .expect("更新压缩 token 统计失败");

    let updated = query_session(&session.id, false)
        .await
        .expect("读取更新后的会话失败");

    assert_eq!(updated.schedule_id.as_deref(), Some("job-compact-missing"));
    assert_eq!(updated.total_tokens, Some(0));
    assert_eq!(updated.input_tokens, Some(0));
    assert_eq!(updated.output_tokens, Some(0));
    assert_eq!(updated.cached_input_tokens, Some(0));
    assert_eq!(updated.cache_creation_input_tokens, Some(0));
    assert_eq!(updated.accumulated_total_tokens, Some(700));
    assert_eq!(updated.accumulated_input_tokens, Some(500));
    assert_eq!(updated.accumulated_output_tokens, Some(200));

    delete_managed_session(&session.id)
        .await
        .expect("清理测试会话失败");
}

#[tokio::test]
async fn update_compaction_session_metrics_should_preserve_existing_schedule_id_when_request_is_empty(
) {
    ensure_runtime_turn_test_session_manager().await;

    let session = create_managed_session(
        PathBuf::from("."),
        "压缩统计保留任务测试".to_string(),
        SessionType::User,
    )
    .await
    .expect("创建测试会话失败");

    apply_session_update(&session.id, |update| {
        update
            .schedule_id(Some("job-existing".to_string()))
            .total_tokens(Some(20))
            .input_tokens(Some(10))
            .output_tokens(Some(10))
            .cached_input_tokens(Some(6))
            .cache_creation_input_tokens(Some(2))
            .accumulated_total_tokens(Some(200))
            .accumulated_input_tokens(Some(120))
            .accumulated_output_tokens(Some(80))
    })
    .await
    .expect("预置 token 统计失败");

    let session_config = SessionConfigBuilder::new(&session.id).build();
    let usage = ProviderUsage::new(
        "gpt-4.1".to_string(),
        Usage::new(Some(30), Some(15), Some(45))
            .with_cached_input_tokens(Some(18))
            .with_cache_creation_input_tokens(Some(6)),
    );

    update_compaction_session_metrics(&session_config, &usage)
        .await
        .expect("更新压缩 token 统计失败");

    let updated = query_session(&session.id, false)
        .await
        .expect("读取更新后的会话失败");

    assert_eq!(updated.schedule_id.as_deref(), Some("job-existing"));
    assert_eq!(updated.total_tokens, Some(15));
    assert_eq!(updated.input_tokens, Some(15));
    assert_eq!(updated.output_tokens, Some(0));
    assert_eq!(updated.cached_input_tokens, Some(18));
    assert_eq!(updated.cache_creation_input_tokens, Some(6));
    assert_eq!(updated.accumulated_total_tokens, Some(245));
    assert_eq!(updated.accumulated_input_tokens, Some(150));
    assert_eq!(updated.accumulated_output_tokens, Some(95));

    delete_managed_session(&session.id)
        .await
        .expect("清理测试会话失败");
}

#[tokio::test]
async fn resolve_runtime_final_done_event_should_include_usage_from_session() {
    ensure_runtime_turn_test_session_manager().await;

    let session = create_managed_session(
        PathBuf::from("."),
        "final_done usage 测试".to_string(),
        SessionType::User,
    )
    .await
    .expect("创建测试会话失败");

    apply_session_update(&session.id, |update| {
        update
            .input_tokens(Some(204))
            .output_tokens(Some(88))
            .cached_input_tokens(Some(160))
            .cache_creation_input_tokens(Some(48))
    })
    .await
    .expect("写入 usage 失败");

    let event = resolve_runtime_final_done_event(&session.id, None).await;
    match event {
        RuntimeAgentEvent::FinalDone { usage } => {
            assert_eq!(
                usage.map(|value| (
                    value.input_tokens,
                    value.output_tokens,
                    value.cached_input_tokens,
                    value.cache_creation_input_tokens,
                )),
                Some((204, 88, Some(160), Some(48)))
            );
        }
        other => panic!("收到意外事件: {:?}", other),
    }

    delete_managed_session(&session.id)
        .await
        .expect("清理测试会话失败");
}

#[tokio::test]
async fn resolve_runtime_final_done_event_should_fall_back_to_none_without_session_usage() {
    ensure_runtime_turn_test_session_manager().await;

    let session = create_managed_session(
        PathBuf::from("."),
        "final_done 无 usage 测试".to_string(),
        SessionType::User,
    )
    .await
    .expect("创建测试会话失败");

    let event = resolve_runtime_final_done_event(&session.id, None).await;
    match event {
        RuntimeAgentEvent::FinalDone { usage } => {
            assert!(usage.is_none(), "未写入 usage 时应返回 None");
        }
        other => panic!("收到意外事件: {:?}", other),
    }

    delete_managed_session(&session.id)
        .await
        .expect("清理测试会话失败");
}

#[tokio::test]
async fn resolve_runtime_final_done_event_should_fall_back_to_persisted_session_usage() {
    ensure_runtime_turn_test_session_manager().await;

    let conn = Connection::open_in_memory().expect("创建持久化回退数据库失败");
    create_tables(&conn).expect("初始化持久化回退表结构失败");
    let now = Utc::now().to_rfc3339();
    let session_id = format!("persisted-usage-{}", Uuid::new_v4());
    conn.execute(
        "INSERT INTO agent_sessions (
            id, model, system_prompt, title, created_at, updated_at, working_dir,
            execution_strategy, session_type, user_set_name, extension_data_json,
            input_tokens, output_tokens, cached_input_tokens, cache_creation_input_tokens
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
        rusqlite::params![
            session_id,
            "glm-4.5",
            Option::<String>::None,
            "persisted usage",
            now,
            now,
            ".",
            "react",
            "user",
            false,
            "{}",
            321i64,
            123i64,
            222i64,
            18i64
        ],
    )
    .expect("写入持久化 usage 会话失败");
    let db = Arc::new(Mutex::new(conn));

    let event = resolve_runtime_final_done_event(&session_id, Some(&db)).await;
    match event {
        RuntimeAgentEvent::FinalDone { usage } => {
            assert_eq!(
                usage.map(|value| (
                    value.input_tokens,
                    value.output_tokens,
                    value.cached_input_tokens,
                    value.cache_creation_input_tokens,
                )),
                Some((321, 123, Some(222), Some(18)))
            );
        }
        other => panic!("收到意外事件: {:?}", other),
    }
}
