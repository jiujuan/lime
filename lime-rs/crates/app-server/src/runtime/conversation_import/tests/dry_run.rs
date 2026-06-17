use super::*;
use app_server_protocol::ConversationImportThreadStatus;
use std::fs;

#[test]
fn preview_dry_run_summary_counts_full_timeline_beyond_preview_limit() {
    let temp = tempfile::tempdir().expect("tempdir");
    let rollout_path = temp.path().join("rollout-dry-run-summary.jsonl");
    fs::write(
        &rollout_path,
        [
            codex_session_meta_line("thread-dry-run", "/workspace/dry-run", "first"),
            serde_json::json!({
                "timestamp": "2026-06-16T00:00:02.000Z",
                "type": "event_msg",
                "payload": {
                    "type": "agent_message",
                    "message": "first reply"
                }
            })
            .to_string(),
            serde_json::json!({
                "timestamp": "2026-06-16T00:00:03.000Z",
                "type": "event_msg",
                "payload": {
                    "type": "user_message",
                    "message": "second",
                    "images": ["data:image/png;base64,abc"],
                    "image_details": ["high"]
                }
            })
            .to_string(),
            serde_json::json!({
                "timestamp": "2026-06-16T00:00:04.000Z",
                "type": "response_item",
                "payload": {
                    "type": "function_call",
                    "call_id": "call_exec",
                    "name": "exec_command",
                    "arguments": "{\"cmd\":\"npm test\"}"
                }
            })
            .to_string(),
            serde_json::json!({
                "timestamp": "2026-06-16T00:00:05.000Z",
                "type": "turn_context",
                "payload": {}
            })
            .to_string(),
        ]
        .join("\n"),
    )
    .expect("write rollout");

    let response = codex::preview_thread(ConversationImportThreadPreviewParams {
        source_root: Some(temp.path().to_string_lossy().into_owned()),
        source_path: Some(rollout_path.to_string_lossy().into_owned()),
        limit: Some(1),
        ..Default::default()
    })
    .expect("preview");

    assert!(response.summary.truncated);
    assert_eq!(response.messages.len(), 1);
    assert_eq!(response.summary.message_count, 3);
    assert_eq!(response.summary.unsupported_count, 1);
    assert_eq!(response.summary.rollout_event_items, 3);
    assert!(response.summary.dry_run.will_create_session);
    assert!(!response.summary.dry_run.will_append_to_existing_session);
    assert_eq!(response.summary.dry_run.will_import_messages, 3);
    assert_eq!(response.summary.dry_run.will_import_turns, 2);
    assert_eq!(response.summary.dry_run.will_import_timeline_items, 5);
    assert_eq!(response.summary.dry_run.will_import_attachments, 1);
    assert_eq!(response.summary.dry_run.unsupported_items, 1);
    assert_eq!(response.summary.fidelity.messages, 3);
    assert_eq!(response.summary.fidelity.attachments, 1);
    assert_eq!(response.summary.fidelity.tools, 1);
    assert_eq!(response.summary.fidelity.commands, 1);
    assert_eq!(response.summary.fidelity.unsupported, 1);
    assert_eq!(response.summary.fidelity.provenance_only, 1);
    assert_eq!(
        response.messages[0]
            .provenance
            .as_ref()
            .and_then(|provenance| provenance.source_thread_id.as_deref()),
        Some("thread-dry-run")
    );
    assert_eq!(
        response.messages[0]
            .provenance
            .as_ref()
            .and_then(|provenance| provenance.source_event_seq),
        Some(2)
    );
}

#[tokio::test]
async fn imported_preview_dry_run_marks_append_to_existing_session() {
    let temp = tempfile::tempdir().expect("tempdir");
    let rollout_path = temp.path().join("rollout-dry-run-imported.jsonl");
    fs::write(
        &rollout_path,
        codex_session_meta_line("thread-dry-run-imported", "/workspace/dry-run", "imported"),
    )
    .expect("write rollout");
    let core = RuntimeCore::default();

    commit::commit_conversation_import_thread(
        &core,
        ConversationImportThreadCommitParams {
            source_root: Some(temp.path().to_string_lossy().into_owned()),
            source_path: Some(rollout_path.to_string_lossy().into_owned()),
            confirmed: true,
            ..Default::default()
        },
    )
    .expect("commit");

    let preview = core
        .preview_conversation_import_thread(ConversationImportThreadPreviewParams {
            source_root: Some(temp.path().to_string_lossy().into_owned()),
            source_path: Some(rollout_path.to_string_lossy().into_owned()),
            ..Default::default()
        })
        .await
        .expect("preview");

    assert_eq!(
        preview.thread.import_status,
        ConversationImportThreadStatus::Imported
    );
    assert!(!preview.summary.dry_run.will_create_session);
    assert!(preview.summary.dry_run.will_append_to_existing_session);
}
