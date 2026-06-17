use super::*;
use app_server_protocol::EvidenceExportParams;

#[tokio::test]
async fn imported_codex_thread_exports_evidence_with_source_provenance() {
    let temp = tempfile::tempdir().expect("tempdir");
    let rollout_path = temp.path().join("rollout-thread-evidence.jsonl");
    fs::write(
        &rollout_path,
        [
            codex_session_meta_line("thread-evidence", "/workspace/evidence", "evidence import"),
            serde_json::json!({
                "timestamp": "2026-06-16T00:00:02.000Z",
                "type": "event_msg",
                "payload": {
                    "type": "agent_message",
                    "message": "evidence reply"
                }
            })
            .to_string(),
        ]
        .join("\n"),
    )
    .expect("write rollout");
    let core = RuntimeCore::default();

    let commit = commit::commit_conversation_import_thread(
        &core,
        ConversationImportThreadCommitParams {
            source_root: Some(temp.path().to_string_lossy().into_owned()),
            source_path: Some(rollout_path.to_string_lossy().into_owned()),
            confirmed: true,
            ..Default::default()
        },
    )
    .expect("commit");

    let export = core
        .export_evidence(EvidenceExportParams {
            session_id: commit.session.session_id.clone(),
            turn_id: None,
            include_events: Some(true),
            include_artifacts: Some(true),
            include_evidence_pack: Some(true),
        })
        .await
        .expect("export evidence");

    assert_eq!(export.session.session_id, commit.session.session_id);
    assert_eq!(
        export
            .session
            .business_object_ref
            .as_ref()
            .map(|reference| reference.kind.as_str()),
        Some("conversation.import")
    );
    let metadata = export
        .session
        .business_object_ref
        .as_ref()
        .and_then(|reference| reference.metadata.as_ref())
        .expect("import metadata");
    assert_eq!(metadata["sourceClient"], "codex");
    assert_eq!(metadata["sourceThreadId"], "thread-evidence");
    assert_eq!(
        metadata["sourcePath"],
        rollout_path.to_string_lossy().as_ref()
    );
    assert_eq!(metadata["codexImportFidelity"]["messages"], 2);
    assert_eq!(export.turns.len(), 1);
    assert!(export.events.iter().any(|event| {
        event.event_type == "message.created"
            && event.payload["session"]["metadata"]["sourceThreadId"] == "thread-evidence"
            && event.payload["session"]["metadata"]["codexImportFidelity"]["messages"] == 2
    }));
    assert!(export.events.iter().any(|event| {
        event.event_type == "message.delta"
            && event.payload["sourceClient"] == "codex"
            && event.payload["text"] == "evidence reply"
            && event.payload["sourceProvenance"]["sourceEventType"] == "event_msg"
    }));
    let evidence_pack = export.evidence_pack.expect("evidence pack");
    assert_eq!(evidence_pack.turn_count, 1);
    assert!(evidence_pack.item_count >= 3);
}
