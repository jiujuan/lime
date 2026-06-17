use super::*;

#[test]
fn scan_rejects_sensitive_rollout_path_from_state_db() {
    let temp = tempfile::tempdir().expect("tempdir");
    let db_path = temp.path().join("state_5.sqlite");
    let sensitive_path = temp.path().join("auth.json");
    fs::write(
        &sensitive_path,
        codex_session_meta_line(
            "thread-sensitive-state",
            "/workspace/security",
            "sensitive file must not import",
        ),
    )
    .expect("write sensitive file");

    let conn = Connection::open(&db_path).expect("db");
    create_legacy_threads_table(&conn);
    insert_thread(
        &conn,
        "thread-sensitive-state",
        "Sensitive state path",
        "/workspace/security",
        &sensitive_path.to_string_lossy(),
        1,
        2,
        false,
    );

    let response = codex::scan_source(ConversationImportSourceScanParams {
        source_root: Some(temp.path().to_string_lossy().into_owned()),
        project_path: Some("/workspace/security".to_string()),
        limit: Some(10),
        ..Default::default()
    })
    .expect("scan");

    assert_eq!(response.source.thread_count, 0);
    assert!(response.threads.is_empty());
}

#[test]
fn preview_rejects_sensitive_source_path() {
    let temp = tempfile::tempdir().expect("tempdir");
    let sensitive_path = temp.path().join("auth.json");
    fs::write(
        &sensitive_path,
        codex_session_meta_line(
            "thread-sensitive-preview",
            "/workspace/security",
            "sensitive preview must fail",
        ),
    )
    .expect("write sensitive file");

    let err = codex::preview_thread(ConversationImportThreadPreviewParams {
        source_root: Some(temp.path().to_string_lossy().into_owned()),
        source_path: Some(sensitive_path.to_string_lossy().into_owned()),
        ..Default::default()
    })
    .expect_err("sensitive source path should be rejected");

    assert!(
        matches!(err, RuntimeCoreError::Backend(message) if message.contains("source path must be a Codex rollout JSONL file inside source root"))
    );
}

#[test]
fn commit_rejects_source_path_outside_source_root() {
    let source_root = tempfile::tempdir().expect("source root");
    let outside = tempfile::tempdir().expect("outside");
    let outside_rollout = outside.path().join("rollout-thread-outside.jsonl");
    fs::write(
        &outside_rollout,
        codex_session_meta_line(
            "thread-outside",
            "/workspace/security",
            "outside rollout must fail",
        ),
    )
    .expect("write outside rollout");

    let core = RuntimeCore::default();
    let err = commit::commit_conversation_import_thread(
        &core,
        ConversationImportThreadCommitParams {
            source_root: Some(source_root.path().to_string_lossy().into_owned()),
            source_path: Some(outside_rollout.to_string_lossy().into_owned()),
            confirmed: true,
            ..Default::default()
        },
    )
    .expect_err("outside source path should be rejected");

    assert!(
        matches!(err, RuntimeCoreError::Backend(message) if message.contains("source path must be a Codex rollout JSONL file inside source root"))
    );
    assert!(core
        .state
        .lock()
        .expect("runtime core state mutex poisoned")
        .sessions
        .is_empty());
}
