use super::*;
use crate::{EventLogWriter, ProjectionStore, StorageRoots};
use app_server_protocol::ConversationImportThreadStatus;

#[test]
fn committing_same_codex_thread_reuses_existing_imported_session() {
    let temp = tempfile::tempdir().expect("tempdir");
    let rollout_path = temp.path().join("rollout-thread-idempotent.jsonl");
    fs::write(
        &rollout_path,
        [
            codex_session_meta_line(
                "thread-idempotent",
                "/workspace/idempotent",
                "idempotent import",
            ),
            serde_json::json!({
                "timestamp": "2026-06-16T00:00:02.000Z",
                "type": "event_msg",
                "payload": {
                    "type": "agent_message",
                    "message": "idempotent reply"
                }
            })
            .to_string(),
        ]
        .join("\n"),
    )
    .expect("write rollout");
    let core = RuntimeCore::default();

    let first = commit::commit_conversation_import_thread(
        &core,
        ConversationImportThreadCommitParams {
            source_root: Some(temp.path().to_string_lossy().into_owned()),
            source_path: Some(rollout_path.to_string_lossy().into_owned()),
            confirmed: true,
            ..Default::default()
        },
    )
    .expect("first commit");
    let second = commit::commit_conversation_import_thread(
        &core,
        ConversationImportThreadCommitParams {
            source_root: Some(temp.path().to_string_lossy().into_owned()),
            source_path: Some(rollout_path.to_string_lossy().into_owned()),
            confirmed: true,
            ..Default::default()
        },
    )
    .expect("second commit");

    assert_eq!(second.session.session_id, first.session.session_id);
    assert_eq!(
        second.thread.import_status,
        ConversationImportThreadStatus::Imported
    );
    assert_eq!(second.imported_messages, first.imported_messages);
    assert_eq!(second.imported_turns, first.imported_turns);
    assert_eq!(
        core.state
            .lock()
            .expect("runtime core state mutex poisoned")
            .sessions
            .len(),
        1
    );
}

#[tokio::test]
async fn committing_same_codex_thread_after_restart_reuses_projected_session() {
    let temp = tempfile::tempdir().expect("tempdir");
    let roots = StorageRoots::initialize(temp.path().join("app-server")).expect("roots");
    let event_log_writer = Arc::new(EventLogWriter::new(&roots.event_log_root).expect("writer"));
    let projection_store =
        Arc::new(ProjectionStore::initialize(&roots.projection_db_path).expect("projection"));
    let db_path = temp.path().join("state_5.sqlite");
    let rollout_path = temp.path().join("rollout-thread-restarted.jsonl");
    fs::write(
        &rollout_path,
        [
            codex_session_meta_line("thread-restarted", "/workspace/restarted", "restart import"),
            serde_json::json!({
                "timestamp": "2026-06-16T00:00:02.000Z",
                "type": "event_msg",
                "payload": {
                    "type": "agent_message",
                    "message": "restart reply"
                }
            })
            .to_string(),
        ]
        .join("\n"),
    )
    .expect("write rollout");
    let conn = Connection::open(&db_path).expect("db");
    create_legacy_threads_table(&conn);
    insert_thread(
        &conn,
        "thread-restarted",
        "Restart import",
        "/workspace/restarted",
        &rollout_path.to_string_lossy(),
        1,
        2,
        false,
    );
    let first_core = RuntimeCore::default()
        .with_event_log_writer(event_log_writer.clone())
        .with_projection_store(projection_store.clone());

    let first = commit::commit_conversation_import_thread(
        &first_core,
        ConversationImportThreadCommitParams {
            source_root: Some(temp.path().to_string_lossy().into_owned()),
            source_thread_id: Some("thread-restarted".to_string()),
            confirmed: true,
            ..Default::default()
        },
    )
    .expect("first commit");
    assert!(projection_store
        .read_session_projection(&first.session.session_id)
        .expect("projection read")
        .is_some());

    let backend = Arc::new(RecordingBackend::default());
    let restarted_core = RuntimeCore::with_backend(backend.clone())
        .with_event_log_writer(event_log_writer)
        .with_projection_store(projection_store);
    let second = commit::commit_conversation_import_thread(
        &restarted_core,
        ConversationImportThreadCommitParams {
            source_root: Some(temp.path().to_string_lossy().into_owned()),
            source_thread_id: Some("thread-restarted".to_string()),
            confirmed: true,
            ..Default::default()
        },
    )
    .expect("second commit after restart");

    assert_eq!(second.session.session_id, first.session.session_id);
    assert_eq!(
        second.thread.import_status,
        ConversationImportThreadStatus::Imported
    );
    assert_eq!(second.imported_messages, first.imported_messages);
    assert_eq!(second.imported_turns, first.imported_turns);
    assert_eq!(
        restarted_core
            .state
            .lock()
            .expect("runtime core state mutex poisoned")
            .sessions
            .len(),
        0
    );

    let rescan = restarted_core
        .scan_conversation_import_source(ConversationImportSourceScanParams {
            source_root: Some(temp.path().to_string_lossy().into_owned()),
            project_path: Some("/workspace/restarted".to_string()),
            ..Default::default()
        })
        .await
        .expect("rescan after restart");
    assert_eq!(
        rescan.threads[0].import_status,
        ConversationImportThreadStatus::Imported
    );

    let preview = restarted_core
        .preview_conversation_import_thread(ConversationImportThreadPreviewParams {
            source_root: Some(temp.path().to_string_lossy().into_owned()),
            source_thread_id: Some("thread-restarted".to_string()),
            ..Default::default()
        })
        .await
        .expect("preview after restart");
    assert_eq!(
        preview.thread.import_status,
        ConversationImportThreadStatus::Imported
    );
    assert!(!preview.summary.dry_run.will_create_session);
    assert!(preview.summary.dry_run.will_append_to_existing_session);

    let read = restarted_core
        .read_session_current(AgentSessionReadParams {
            session_id: first.session.session_id.clone(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .await
        .expect("read imported session after restart");
    let business_object_ref = read
        .session
        .business_object_ref
        .as_ref()
        .expect("import business object ref after restart");
    assert_eq!(
        business_object_ref.kind,
        import_status::IMPORTED_CONVERSATION_KIND
    );
    assert_eq!(business_object_ref.id, "thread-restarted");
    assert_eq!(
        business_object_ref
            .metadata
            .as_ref()
            .and_then(|metadata| metadata.get("sourceThreadId"))
            .and_then(serde_json::Value::as_str),
        Some("thread-restarted")
    );

    restarted_core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: first.session.session_id.clone(),
                turn_id: Some("turn-after-restart".to_string()),
                input: AgentInput {
                    text: "continue after restart".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: None,
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("continue imported session after restart");
    let requests = backend.requests.lock().expect("requests mutex poisoned");
    let request = requests.last().expect("recorded continuation request");
    assert_eq!(request.provider_preference.as_deref(), Some("openai"));
    assert_eq!(
        request
            .runtime_options
            .as_ref()
            .and_then(|options| options.host_options.as_ref())
            .and_then(|value| value.pointer("/asterChatRequest/turn_config/cwd"))
            .and_then(serde_json::Value::as_str),
        Some("/workspace/restarted")
    );
}

#[tokio::test]
async fn scan_and_preview_mark_previously_imported_codex_thread() {
    let temp = tempfile::tempdir().expect("tempdir");
    let db_path = temp.path().join("state_5.sqlite");
    let rollout_path = temp.path().join("rollout-thread-status.jsonl");
    fs::write(
        &rollout_path,
        codex_session_meta_line("thread-status", "/workspace/status", "status import"),
    )
    .expect("write rollout");
    let conn = Connection::open(&db_path).expect("db");
    create_legacy_threads_table(&conn);
    insert_thread(
        &conn,
        "thread-status",
        "Status import",
        "/workspace/status",
        &rollout_path.to_string_lossy(),
        1,
        2,
        false,
    );
    let core = RuntimeCore::default();

    let initial_scan = core
        .scan_conversation_import_source(ConversationImportSourceScanParams {
            source_root: Some(temp.path().to_string_lossy().into_owned()),
            project_path: Some("/workspace/status".to_string()),
            ..Default::default()
        })
        .await
        .expect("initial scan");
    assert_eq!(
        initial_scan.threads[0].import_status,
        ConversationImportThreadStatus::NotImported
    );

    commit::commit_conversation_import_thread(
        &core,
        ConversationImportThreadCommitParams {
            source_root: Some(temp.path().to_string_lossy().into_owned()),
            source_thread_id: Some("thread-status".to_string()),
            confirmed: true,
            ..Default::default()
        },
    )
    .expect("commit");

    let rescan = core
        .scan_conversation_import_source(ConversationImportSourceScanParams {
            source_root: Some(temp.path().to_string_lossy().into_owned()),
            project_path: Some("/workspace/status".to_string()),
            ..Default::default()
        })
        .await
        .expect("rescan");
    assert_eq!(
        rescan.threads[0].import_status,
        ConversationImportThreadStatus::Imported
    );

    let preview = core
        .preview_conversation_import_thread(ConversationImportThreadPreviewParams {
            source_root: Some(temp.path().to_string_lossy().into_owned()),
            source_thread_id: Some("thread-status".to_string()),
            ..Default::default()
        })
        .await
        .expect("preview");
    assert_eq!(
        preview.thread.import_status,
        ConversationImportThreadStatus::Imported
    );
}
