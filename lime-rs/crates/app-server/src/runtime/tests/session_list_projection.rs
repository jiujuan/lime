use super::support::*;
use super::*;

struct ProjectionTestHarness {
    _temp: tempfile::TempDir,
    event_log_writer: Arc<EventLogWriter>,
    projection_store: Arc<ProjectionStore>,
    core: RuntimeCore,
}

fn projection_test_core() -> ProjectionTestHarness {
    let temp = tempfile::tempdir().expect("tempdir");
    let roots = StorageRoots::initialize(temp.path().join("app-server")).expect("roots");
    let event_log_writer = Arc::new(EventLogWriter::new(&roots.event_log_root).expect("writer"));
    let projection_store =
        Arc::new(ProjectionStore::initialize(&roots.projection_db_path).expect("projection"));
    let core = RuntimeCore::with_backend(Arc::new(CompletedBackend))
        .with_event_log_writer(event_log_writer.clone())
        .with_projection_store(projection_store.clone());
    ProjectionTestHarness {
        _temp: temp,
        event_log_writer,
        projection_store,
        core,
    }
}

async fn seed_projected_session(core: &RuntimeCore, session_id: &str, thread_id: &str) {
    seed_projected_session_with_working_dir(core, session_id, thread_id, "/tmp/projection").await;
}

async fn seed_projected_session_with_working_dir(
    core: &RuntimeCore,
    session_id: &str,
    thread_id: &str,
    working_dir: &str,
) {
    core.start_session(AgentSessionStartParams {
        session_id: Some(session_id.to_string()),
        thread_id: Some(thread_id.to_string()),
        app_id: "agent-chat".to_string(),
        workspace_id: Some("workspace-current".to_string()),
        business_object_ref: Some(app_server_protocol::BusinessObjectRef {
            kind: "agent.session".to_string(),
            id: session_id.to_string(),
            title: Some("Projection Title".to_string()),
            uri: None,
            metadata: Some(json!({
                "title": "Projection Title",
                "modelName": "projection-model",
                "workingDir": working_dir,
                "executionStrategy": "projection",
                "providerSelector": "fixture-provider",
                "recentAccessMode": "read-only",
            })),
        }),
        locale: None,
    })
    .expect("session");

    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: session_id.to_string(),
            turn_id: Some(format!("{thread_id}_turn")),
            input: AgentInput {
                text: "Projection DB 应该是列表事实源".to_string(),
                attachments: Vec::new(),
            },
            runtime_options: None,
            queue_if_busy: false,
            skip_pre_submit_resume: false,
        },
        RuntimeHostContext::default(),
    )
    .await
    .expect("turn");
}

#[tokio::test]
async fn list_agent_sessions_reads_projection_as_current_truth() {
    let harness = projection_test_core();
    seed_projected_session(
        &harness.core,
        "sess_projection_wins",
        "thread_projection_wins",
    )
    .await;

    let restarted_core = RuntimeCore::default()
        .with_event_log_writer(harness.event_log_writer)
        .with_projection_store(harness.projection_store);

    let listed = restarted_core
        .list_agent_sessions(AgentSessionListParams {
            workspace_id: Some("workspace-current".to_string()),
            limit: Some(20),
            ..AgentSessionListParams::default()
        })
        .await
        .expect("list sessions");

    assert_eq!(listed.sessions.len(), 1);
    let projected = listed
        .sessions
        .iter()
        .find(|session| session.session_id == "sess_projection_wins")
        .expect("projected session");
    assert_eq!(
        projected.thread_id.as_deref(),
        Some("thread_projection_wins")
    );
    assert_eq!(projected.title.as_deref(), Some("Projection Title"));
    assert_eq!(projected.model, "projection-model");
    assert_eq!(projected.working_dir.as_deref(), Some("/tmp/projection"));
    assert_eq!(projected.execution_strategy.as_deref(), Some("projection"));
    assert_eq!(projected.messages_count, 2);
}

#[tokio::test]
async fn list_agent_sessions_filters_projection_by_cwd() {
    let harness = projection_test_core();
    seed_projected_session_with_working_dir(
        &harness.core,
        "sess_projection_cwd_a",
        "thread_projection_cwd_a",
        "/tmp/projection-a",
    )
    .await;
    seed_projected_session_with_working_dir(
        &harness.core,
        "sess_projection_cwd_b",
        "thread_projection_cwd_b",
        "/tmp/projection-b",
    )
    .await;

    let restarted_core = RuntimeCore::default()
        .with_event_log_writer(harness.event_log_writer)
        .with_projection_store(harness.projection_store);

    let listed = restarted_core
        .list_agent_sessions(AgentSessionListParams {
            cwd: Some(AgentSessionCwdFilter::One("/tmp/projection-a".to_string())),
            limit: Some(20),
            ..AgentSessionListParams::default()
        })
        .await
        .expect("list sessions");

    assert!(listed
        .sessions
        .iter()
        .any(|session| session.session_id == "sess_projection_cwd_a"));
    assert!(!listed
        .sessions
        .iter()
        .any(|session| session.session_id == "sess_projection_cwd_b"));
}

#[tokio::test]
async fn list_agent_sessions_filters_projection_by_workspace_or_workspace_root() {
    let harness = projection_test_core();
    seed_projected_session_with_working_dir(
        &harness.core,
        "sess_projection_workspace_only",
        "thread_projection_workspace_only",
        "",
    )
    .await;
    seed_projected_session_with_working_dir(
        &harness.core,
        "sess_projection_cwd_only",
        "thread_projection_cwd_only",
        "/tmp/projection-root",
    )
    .await;

    let app_data_source = Arc::new(
        TestSessionDataSource::new(empty_agent_session_read_response("legacy_unexpected"))
            .with_workspace(json!({
                "id": "workspace-current",
                "rootPath": "/tmp/projection-root",
            })),
    );
    let restarted_core = RuntimeCore::default()
        .with_event_log_writer(harness.event_log_writer)
        .with_projection_store(harness.projection_store)
        .with_app_data_source(app_data_source);

    let listed = restarted_core
        .list_agent_sessions(AgentSessionListParams {
            workspace_id: Some("workspace-current".to_string()),
            limit: Some(20),
            ..AgentSessionListParams::default()
        })
        .await
        .expect("list sessions");
    let ids = listed
        .sessions
        .iter()
        .map(|session| session.session_id.as_str())
        .collect::<Vec<_>>();

    assert!(ids.contains(&"sess_projection_workspace_only"));
    assert!(ids.contains(&"sess_projection_cwd_only"));
}

#[tokio::test]
async fn update_agent_session_writes_projection_overview() {
    let harness = projection_test_core();
    seed_projected_session(
        &harness.core,
        "sess_projection_update",
        "thread_projection_update",
    )
    .await;

    let restarted_core = RuntimeCore::default()
        .with_event_log_writer(harness.event_log_writer)
        .with_projection_store(harness.projection_store);

    let updated = restarted_core
        .update_session_current(AgentSessionUpdateParams {
            session_id: "sess_projection_update".to_string(),
            title: Some("Updated Projection Title".to_string()),
            provider_selector: Some("updated-provider".to_string()),
            model_name: Some("updated-model".to_string()),
            execution_strategy: Some("updated-strategy".to_string()),
            recent_access_mode: Some("full-access".to_string()),
            recent_preferences: Some(json!({ "task": true, "webSearch": false })),
            recent_team_selection: Some(json!({ "disabled": true })),
            ..AgentSessionUpdateParams::default()
        })
        .await
        .expect("update session");

    assert_eq!(
        updated.session.title.as_deref(),
        Some("Updated Projection Title")
    );
    assert_eq!(updated.session.model, "updated-model");
    assert_eq!(
        updated.session.execution_strategy.as_deref(),
        Some("updated-strategy")
    );

    let detail = restarted_core
        .read_session_current(AgentSessionReadParams {
            session_id: "sess_projection_update".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .await
        .expect("read session");
    let metadata = detail
        .session
        .business_object_ref
        .as_ref()
        .and_then(|reference| reference.metadata.as_ref())
        .expect("projection metadata");
    assert_eq!(metadata["providerSelector"], "updated-provider");
    assert_eq!(metadata["recentAccessMode"], "full-access");
    assert_eq!(metadata["recentPreferences"]["task"], true);
    assert_eq!(metadata["recentTeamSelection"]["disabled"], true);
}

#[tokio::test]
async fn update_agent_session_with_live_runtime_state_also_writes_projection_overview() {
    let harness = projection_test_core();
    seed_projected_session(
        &harness.core,
        "sess_projection_live_update",
        "thread_projection_live_update",
    )
    .await;

    harness
        .core
        .update_session_current(AgentSessionUpdateParams {
            session_id: "sess_projection_live_update".to_string(),
            title: Some("Live Runtime Updated Title".to_string()),
            article_workspace_edited_draft: Some(json!({
                "objectKey": "content-factory-app:sess_projection_live_update:articleDraft:article-1",
                "objectRef": {
                    "appId": "content-factory-app",
                    "kind": "articleDraft",
                    "id": "article-1",
                    "sessionId": "sess_projection_live_update"
                },
                "markdown": "# 已回填正文\n\n![正文配图](https://example.com/article-image.png)",
                "updatedAt": "2026-07-04T10:00:00.000Z"
            })),
            ..AgentSessionUpdateParams::default()
        })
        .await
        .expect("update live runtime session");

    let restarted_core = RuntimeCore::default()
        .with_event_log_writer(harness.event_log_writer)
        .with_projection_store(harness.projection_store);
    let detail = restarted_core
        .read_session_current(AgentSessionReadParams {
            session_id: "sess_projection_live_update".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .await
        .expect("read projected live update session");
    let metadata = detail
        .session
        .business_object_ref
        .as_ref()
        .and_then(|reference| reference.metadata.as_ref())
        .expect("projection metadata");

    assert_eq!(
        detail
            .session
            .business_object_ref
            .as_ref()
            .and_then(|reference| reference.title.as_deref()),
        Some("Live Runtime Updated Title")
    );
    assert_eq!(
        metadata["articleWorkspaceEditedDraft"]["markdown"],
        "# 已回填正文\n\n![正文配图](https://example.com/article-image.png)"
    );
}

#[tokio::test]
async fn archive_many_agent_sessions_archives_projection_sessions() {
    let harness = projection_test_core();
    seed_projected_session(
        &harness.core,
        "sess_projection_archive",
        "thread_projection_archive",
    )
    .await;

    let restarted_core = RuntimeCore::default()
        .with_event_log_writer(harness.event_log_writer)
        .with_projection_store(harness.projection_store);

    let archived = restarted_core
        .archive_many_agent_sessions(AgentSessionArchiveManyParams {
            session_ids: vec!["sess_projection_archive".to_string()],
        })
        .await
        .expect("archive sessions");

    assert!(archived
        .sessions
        .iter()
        .any(|session| session.session_id == "sess_projection_archive"
            && session.archived_at.is_some()));

    let active = restarted_core
        .list_agent_sessions(AgentSessionListParams {
            include_archived: Some(false),
            ..AgentSessionListParams::default()
        })
        .await
        .expect("list active");
    assert!(!active
        .sessions
        .iter()
        .any(|session| session.session_id == "sess_projection_archive"));

    let archived_only = restarted_core
        .list_agent_sessions(AgentSessionListParams {
            archived_only: Some(true),
            ..AgentSessionListParams::default()
        })
        .await
        .expect("list archived");
    assert!(archived_only
        .sessions
        .iter()
        .any(|session| session.session_id == "sess_projection_archive"));
}
