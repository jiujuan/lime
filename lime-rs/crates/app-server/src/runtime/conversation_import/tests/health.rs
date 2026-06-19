use super::*;

#[test]
fn scans_session_index_fallback_reports_read_only_health() {
    let temp = tempfile::tempdir().expect("tempdir");
    let rollout_path = codex_rollout_path(temp.path(), "sessions", "2026/06/15", "thread-index");
    fs::write(
        &rollout_path,
        codex_session_meta_line("thread-index", "/workspace/index", "from index"),
    )
    .expect("write rollout");
    fs::write(
        temp.path().join("session_index.jsonl"),
        serde_json::json!({
            "id": "thread-index",
            "title": "Index fallback",
            "cwd": "/workspace/index",
            "path": rollout_path.to_string_lossy()
        })
        .to_string(),
    )
    .expect("write session index");

    let response = codex::scan_source(ConversationImportSourceScanParams {
        source_root: Some(temp.path().to_string_lossy().into_owned()),
        project_path: Some("/workspace/index".to_string()),
        limit: Some(10),
        ..Default::default()
    })
    .expect("scan session index fallback");

    assert_eq!(
        response.source.status,
        ConversationImportSourceStatus::Ready
    );
    assert!(response.source.source_home_exists);
    assert!(!response.source.state_db_readable);
    assert_eq!(response.source.rollout_file_count, 1);
    assert_eq!(response.source.thread_count, 1);
    assert_eq!(response.threads[0].source_thread_id, "thread-index");
}

#[test]
fn scans_missing_source_reports_read_only_health() {
    let temp = tempfile::tempdir().expect("tempdir");
    let missing_root = temp.path().join("missing-codex-home");

    let response = codex::scan_source(ConversationImportSourceScanParams {
        source_root: Some(missing_root.to_string_lossy().into_owned()),
        ..Default::default()
    })
    .expect("scan missing source");

    assert_eq!(
        response.source.status,
        ConversationImportSourceStatus::Missing
    );
    assert!(!response.source.readable);
    assert!(!response.source.source_home_exists);
    assert!(!response.source.state_db_readable);
    assert_eq!(response.source.rollout_file_count, 0);
    assert_eq!(response.source.thread_count, 0);
    assert!(response.threads.is_empty());
}
