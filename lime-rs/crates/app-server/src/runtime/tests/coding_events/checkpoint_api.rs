use super::*;

#[tokio::test]
async fn file_changed_projects_to_file_checkpoint_api() {
    let checkpoint_snapshot_root = unique_temp_dir("lime-runtime-coding-checkpoint-snapshots");
    let core = RuntimeCore::default().with_file_checkpoint_snapshot_store(Arc::new(
        FilesystemFileCheckpointSnapshotStore::with_base_dir(checkpoint_snapshot_root.clone()),
    ));
    let workspace_root = unique_temp_dir("lime-runtime-coding-checkpoints");
    std::fs::create_dir_all(&workspace_root).expect("workspace root");
    let app_path = workspace_root.join("src").join("App.tsx");
    std::fs::create_dir_all(app_path.parent().expect("app parent")).expect("src dir");
    let previous_content = "export function App() {\n  return null;\n}";
    let changed_content = "export function App() {\n  return <main />;\n}";
    std::fs::write(&app_path, changed_content).expect("live changed file");
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_coding_file_checkpoint".to_string()),
        thread_id: Some("thread_coding_file_checkpoint".to_string()),
        app_id: "content-studio".to_string(),
        workspace_id: Some("default".to_string()),
        business_object_ref: Some(app_server_protocol::BusinessObjectRef {
            kind: "project".to_string(),
            id: "coding-checkpoint".to_string(),
            title: Some("Coding Checkpoint".to_string()),
            uri: None,
            metadata: Some(json!({
                "workingDir": workspace_root.to_string_lossy(),
                "executionStrategy": "runtime-core"
            })),
        }),
        locale: None,
    })
    .expect("session");
    let turn = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: "sess_coding_file_checkpoint".to_string(),
                turn_id: Some("turn_coding_file_checkpoint".to_string()),
                input: AgentInput {
                    text: "update app".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: None,
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("turn")
        .response
        .turn;

    core.append_external_runtime_events(
        "sess_coding_file_checkpoint",
        Some(&turn.turn_id),
        vec![RuntimeEvent::new(
            "file.changed",
            json!({
                "path": "src/App.tsx",
                "artifactId": "artifact_src_app_after",
                "checkpointRef": "checkpoint_src_app_after",
                "contentRef": "content://src-app-after",
                "diffRef": "diff://src-app",
                "preview": "changed App component",
                "change": {
                    "previousContent": previous_content,
                    "diff": [
                        { "kind": "context", "value": "export function App() {" },
                        { "kind": "remove", "value": "  return null;" },
                        { "kind": "add", "value": "  return <main />;" },
                        { "kind": "context", "value": "}" }
                    ]
                }
            }),
        )],
    )
    .expect("file changed");
    let stored_events = core
        .events_for_session("sess_coding_file_checkpoint")
        .expect("stored events");
    let file_changed_event = stored_events
        .iter()
        .find(|event| event.event_type == "file.changed")
        .expect("stored file.changed event");
    let checkpoint_snapshot_file = file_changed_event.payload["checkpointSnapshotFile"]
        .as_str()
        .expect("checkpoint snapshot file")
        .to_string();
    assert!(checkpoint_snapshot_file.starts_with("runtime-file-checkpoints/"));
    assert!(file_changed_event.payload["sidecarRef"]["relativePath"]
        .as_str()
        .is_some_and(|value| value
            .starts_with("sessions/sess_coding_file_checkpoint/runtime-file-checkpoints/")));
    assert_eq!(
        file_changed_event.payload["sidecarRef"]["kind"].as_str(),
        Some("file_checkpoint")
    );
    assert!(file_changed_event.payload["sidecarRef"]["sha256"]
        .as_str()
        .is_some_and(|value| value.starts_with("sha256:")));
    assert!(
        file_changed_event.payload["change"]["previousContent"]
            .as_str()
            .is_none(),
        "checkpoint previous content should be stored through snapshot owner"
    );
    assert_eq!(
        file_changed_event.payload["change"]["previousContentSnapshotFile"].as_str(),
        Some(checkpoint_snapshot_file.as_str())
    );
    assert_eq!(
        std::fs::read_to_string(
            checkpoint_snapshot_root
                .join("sessions")
                .join("sess_coding_file_checkpoint")
                .join(checkpoint_snapshot_file.as_str())
        )
        .expect("stored checkpoint snapshot"),
        previous_content
    );

    let read = read_session(&core, "sess_coding_file_checkpoint");
    let items = read.detail.as_ref().expect("detail")["items"]
        .as_array()
        .expect("items");
    assert!(items.iter().any(|item| {
        item["type"].as_str() == Some("file_artifact")
            && item["id"].as_str() == Some("checkpoint_src_app_after")
            && item["path"].as_str() == Some("src/App.tsx")
    }));

    let list = core
        .list_agent_session_file_checkpoints(AgentSessionFileCheckpointListParams {
            session_id: "sess_coding_file_checkpoint".to_string(),
        })
        .await
        .expect("list file checkpoints");
    assert_eq!(list.checkpoint_count, 1);
    assert_eq!(
        list.checkpoints[0].checkpoint_id,
        "checkpoint_src_app_after"
    );
    assert_eq!(list.checkpoints[0].path, "src/App.tsx");
    assert_eq!(list.checkpoints[0].source, "runtime");
    assert_eq!(
        list.checkpoints[0].preview_text.as_deref(),
        Some("changed App component")
    );

    let detail = core
        .get_agent_session_file_checkpoint(AgentSessionFileCheckpointGetParams {
            session_id: "sess_coding_file_checkpoint".to_string(),
            checkpoint_id: "checkpoint_src_app_after".to_string(),
        })
        .await
        .expect("get file checkpoint");
    assert_eq!(detail.live_path, "src/App.tsx");
    assert_eq!(detail.snapshot_path, "src/App.tsx");
    assert_eq!(detail.content.as_deref(), Some(previous_content));
    assert_eq!(
        detail
            .metadata
            .as_ref()
            .and_then(|metadata| metadata.get("checkpointSnapshotFile"))
            .and_then(serde_json::Value::as_str),
        Some(checkpoint_snapshot_file.as_str())
    );
    assert_eq!(
        detail
            .metadata
            .as_ref()
            .and_then(|metadata| metadata.get("contentRef"))
            .and_then(serde_json::Value::as_str),
        Some("content://src-app-after")
    );

    let diff = core
        .diff_agent_session_file_checkpoint(AgentSessionFileCheckpointDiffParams {
            session_id: "sess_coding_file_checkpoint".to_string(),
            checkpoint_id: "checkpoint_src_app_after".to_string(),
        })
        .await
        .expect("diff file checkpoint");
    assert_eq!(
        diff.diff
            .as_ref()
            .and_then(|value| value.get("diffRef"))
            .and_then(serde_json::Value::as_str),
        Some("diff://src-app")
    );

    let restore = core
        .restore_agent_session_file_checkpoint(AgentSessionFileCheckpointRestoreParams {
            session_id: "sess_coding_file_checkpoint".to_string(),
            checkpoint_id: "checkpoint_src_app_after".to_string(),
            confirm_restore: true,
            create_backup: true,
        })
        .await
        .expect("restore file checkpoint");
    assert_eq!(restore.live_path, "src/App.tsx");
    assert_eq!(
        std::fs::read_to_string(&app_path).expect("restored live file"),
        previous_content
    );
    let backup_path = restore.backup_path.expect("restore backup path");
    assert_eq!(
        std::fs::read_to_string(workspace_root.join(backup_path)).expect("backup file"),
        changed_content
    );
}
