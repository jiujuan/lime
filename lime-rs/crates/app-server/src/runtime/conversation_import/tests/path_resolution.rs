use super::*;

#[test]
fn scans_codex_state_db_repairs_stale_rollout_path_from_sessions() {
    let temp = tempfile::tempdir().expect("tempdir");
    let db_path = temp.path().join("state_5.sqlite");
    let thread_id = "019ecac4-f2f2-7731-8745-53f9f1b8ef7b";
    let repaired_path = codex_rollout_path(temp.path(), "sessions", "2026/06/15", thread_id);
    fs::write(
        &repaired_path,
        codex_session_meta_line(thread_id, "/workspace/repaired", "repaired request"),
    )
    .expect("write repaired rollout");

    let conn = Connection::open(&db_path).expect("db");
    create_legacy_threads_table(&conn);
    insert_thread(
        &conn,
        thread_id,
        "Repair me",
        "/workspace/repaired",
        &temp
            .path()
            .join("sessions/2026/01/01/missing.jsonl")
            .to_string_lossy(),
        1,
        2,
        false,
    );
    insert_thread(
        &conn,
        "019e433f-2e9c-7b11-adf8-b8ace084934f",
        "Missing rollout",
        "/workspace/repaired",
        &temp
            .path()
            .join("sessions/2026/05/20/missing.jsonl")
            .to_string_lossy(),
        1,
        3,
        false,
    );

    let response = codex::scan_source(ConversationImportSourceScanParams {
        source_root: Some(temp.path().to_string_lossy().into_owned()),
        project_path: Some("/workspace/repaired".to_string()),
        limit: Some(10),
        ..Default::default()
    })
    .expect("scan");

    assert_eq!(response.source.thread_count, 1);
    assert_eq!(response.threads.len(), 1);
    assert_eq!(response.threads[0].source_thread_id, thread_id);
    assert_eq!(
        response.threads[0].source_path.as_deref(),
        Some(repaired_path.to_string_lossy().as_ref())
    );

    let preview = codex::preview_thread(ConversationImportThreadPreviewParams {
        source_root: Some(temp.path().to_string_lossy().into_owned()),
        source_thread_id: Some(thread_id.to_string()),
        ..Default::default()
    })
    .expect("preview repaired thread");

    assert_eq!(
        preview.thread.source_path.as_deref(),
        Some(repaired_path.to_string_lossy().as_ref())
    );
    assert_eq!(preview.messages[0].text, "repaired request");
}

#[test]
fn previews_archived_codex_thread_from_archived_sessions_when_db_path_is_stale() {
    let temp = tempfile::tempdir().expect("tempdir");
    let db_path = temp.path().join("state_5.sqlite");
    let thread_id = "019ec58b-476c-7893-a600-8230046991a9";
    let archived_path =
        codex_rollout_path(temp.path(), "archived_sessions", "2026/06/14", thread_id);
    fs::write(
        &archived_path,
        codex_session_meta_line(thread_id, "/workspace/archive", "archived request"),
    )
    .expect("write archived rollout");

    let conn = Connection::open(&db_path).expect("db");
    create_legacy_threads_table(&conn);
    insert_thread(
        &conn,
        thread_id,
        "Archived stale path",
        "/workspace/archive",
        &temp
            .path()
            .join("archived_sessions/2026/01/01/missing.jsonl")
            .to_string_lossy(),
        1,
        2,
        true,
    );

    let scan = codex::scan_source(ConversationImportSourceScanParams {
        source_root: Some(temp.path().to_string_lossy().into_owned()),
        project_path: Some("/workspace/archive".to_string()),
        include_archived: Some(true),
        limit: Some(10),
        ..Default::default()
    })
    .expect("scan archived");

    assert_eq!(scan.source.thread_count, 1);
    assert!(scan.threads[0].archived);
    assert_eq!(
        scan.threads[0].source_path.as_deref(),
        Some(archived_path.to_string_lossy().as_ref())
    );

    let preview = codex::preview_thread(ConversationImportThreadPreviewParams {
        source_root: Some(temp.path().to_string_lossy().into_owned()),
        source_thread_id: Some(thread_id.to_string()),
        ..Default::default()
    })
    .expect("preview archived");

    assert_eq!(preview.thread.source_thread_id, thread_id);
    assert!(preview.thread.archived);
    assert_eq!(preview.messages[0].text, "archived request");
}

#[test]
fn active_scan_does_not_cross_load_archived_rollout_for_stale_active_row() {
    let temp = tempfile::tempdir().expect("tempdir");
    let db_path = temp.path().join("state_5.sqlite");
    let thread_id = "019ec1f3-fd4a-7bb3-9cf6-986fa1392e10";
    let archived_path =
        codex_rollout_path(temp.path(), "archived_sessions", "2026/06/14", thread_id);
    fs::write(
        &archived_path,
        codex_session_meta_line(thread_id, "/workspace/mismatch", "archived mismatch"),
    )
    .expect("write archived rollout");

    let conn = Connection::open(&db_path).expect("db");
    create_legacy_threads_table(&conn);
    insert_thread(
        &conn,
        thread_id,
        "Active stale path with archived file",
        "/workspace/mismatch",
        &temp
            .path()
            .join("sessions/2026/06/14/missing.jsonl")
            .to_string_lossy(),
        1,
        2,
        false,
    );

    let scan = codex::scan_source(ConversationImportSourceScanParams {
        source_root: Some(temp.path().to_string_lossy().into_owned()),
        project_path: Some("/workspace/mismatch".to_string()),
        include_archived: Some(false),
        limit: Some(10),
        ..Default::default()
    })
    .expect("scan active");

    assert_eq!(scan.source.thread_count, 0);
    assert!(scan.threads.is_empty());
}

#[test]
fn previews_and_commits_compressed_codex_rollout() {
    let temp = tempfile::tempdir().expect("tempdir");
    let db_path = temp.path().join("state_5.sqlite");
    let thread_id = "019ebca5-b873-7ba0-8a3d-05444bbbfd7b";
    let plain_path = codex_rollout_path(temp.path(), "archived_sessions", "2026/06/13", thread_id);
    let compressed_path = plain_path.with_extension("jsonl.zst");
    write_compressed_rollout(
        &compressed_path,
        &[
            codex_session_meta_line(thread_id, "/workspace/compressed", "compressed request"),
            serde_json::json!({
                "timestamp": "2026-06-16T00:00:02.000Z",
                "type": "event_msg",
                "payload": {
                    "type": "agent_message",
                    "message": "compressed reply"
                }
            })
            .to_string(),
        ]
        .join("\n"),
    );

    let conn = Connection::open(&db_path).expect("db");
    create_legacy_threads_table(&conn);
    insert_thread(
        &conn,
        thread_id,
        "Compressed archived rollout",
        "/workspace/compressed",
        &plain_path.to_string_lossy(),
        1,
        2,
        true,
    );

    let preview = codex::preview_thread(ConversationImportThreadPreviewParams {
        source_root: Some(temp.path().to_string_lossy().into_owned()),
        source_thread_id: Some(thread_id.to_string()),
        ..Default::default()
    })
    .expect("preview compressed");

    assert_eq!(
        preview.thread.source_path.as_deref(),
        Some(compressed_path.to_string_lossy().as_ref())
    );
    assert_eq!(preview.summary.message_count, 2);
    assert_eq!(preview.messages[0].text, "compressed request");
    assert_eq!(preview.messages[1].text, "compressed reply");

    let core = RuntimeCore::default();
    let commit = commit::commit_conversation_import_thread(
        &core,
        ConversationImportThreadCommitParams {
            source_root: Some(temp.path().to_string_lossy().into_owned()),
            source_thread_id: Some(thread_id.to_string()),
            confirmed: true,
            ..Default::default()
        },
    )
    .expect("commit compressed");

    assert_eq!(commit.imported_messages, 2);
    assert_eq!(commit.imported_turns, 1);
    assert_eq!(
        commit.thread.source_path.as_deref(),
        Some(compressed_path.to_string_lossy().as_ref())
    );
}

fn write_compressed_rollout(path: &std::path::Path, contents: &str) {
    let parent = path.parent().expect("compressed rollout parent");
    fs::create_dir_all(parent).expect("create compressed rollout parent");
    let file = fs::File::create(path).expect("create compressed rollout");
    let mut encoder = zstd::stream::write::Encoder::new(file, 3).expect("zstd encoder");
    use std::io::Write;
    encoder
        .write_all(contents.as_bytes())
        .expect("write compressed rollout");
    encoder.finish().expect("finish compressed rollout");
}
