use super::*;

#[derive(Clone, Copy)]
enum CanonicalOutputFamily {
    Tool,
    Mcp,
    Collab,
}

fn canonical_output_item_events(
    session_id: &str,
    thread_id: &str,
    turn_id: &str,
    call_id: &str,
    family: CanonicalOutputFamily,
    output: String,
) -> Vec<RuntimeEvent> {
    vec![
        RuntimeEvent::new(
            "item.started",
            canonical_output_item_payload(
                session_id, thread_id, turn_id, call_id, family, None, None,
            ),
        ),
        RuntimeEvent::new(
            "item.completed",
            canonical_output_item_payload(
                session_id,
                thread_id,
                turn_id,
                call_id,
                family,
                Some(output),
                None,
            ),
        ),
    ]
}

fn canonical_output_item_payload(
    session_id: &str,
    thread_id: &str,
    turn_id: &str,
    call_id: &str,
    family: CanonicalOutputFamily,
    output_text: Option<String>,
    output_ref: Option<&str>,
) -> serde_json::Value {
    let terminal = output_text.is_some();
    let status = if terminal { "completed" } else { "inProgress" };
    let output = output_text.map(|text| {
        let mut output = json!({ "text": text });
        if let Some(output_ref) = output_ref {
            output["outputRef"] = serde_json::Value::String(output_ref.to_string());
        }
        output
    });
    let (kind, payload) = match family {
        CanonicalOutputFamily::Tool => (
            "tool",
            json!({
                "type": "tool",
                "call_id": call_id,
                "name": "Bash",
                "arguments": [],
                "output": output,
            }),
        ),
        CanonicalOutputFamily::Mcp => (
            "mcpToolCall",
            json!({
                "type": "mcpToolCall",
                "call_id": call_id,
                "server_name": "workspace",
                "tool_name": "read_resource",
                "arguments": [],
                "output": output,
            }),
        ),
        CanonicalOutputFamily::Collab => (
            "collabAgentToolCall",
            json!({
                "type": "collabAgentToolCall",
                "call_id": call_id,
                "operation": "sendMessage",
                "target_thread_id": "thread-child",
                "output": output,
            }),
        ),
    };
    json!({
        "item": {
            "sessionId": session_id,
            "threadId": thread_id,
            "turnId": turn_id,
            "itemId": format!("item-{call_id}"),
            "sequence": 1,
            "ordinal": 1,
            "createdAtMs": 1,
            "updatedAtMs": terminal.then_some(2).unwrap_or(1),
            "completedAtMs": terminal.then_some(2),
            "kind": kind,
            "status": status,
            "payload": payload,
            "metadata": {},
        }
    })
}

#[tokio::test]
async fn coding_file_changed_artifact_refs_join_read_model_and_evidence() {
    let (core, session_id, turn_id) = runtime_with_active_turn(
        "sess_coding_artifact_refs",
        "thread_coding_artifact_refs",
        "turn_coding_artifact_refs",
    )
    .await;

    core.append_external_runtime_events(
        &session_id,
        Some(&turn_id),
        vec![RuntimeEvent::new(
            "file.changed",
            json!({
                "path": "src/App.tsx",
                "artifactId": "artifact_src_app_after",
                "artifactRefs": ["artifact_src_app_after", "artifact_src_app_before"],
                "changeKind": "modified",
                "checkpointRef": "checkpoint_src_app_after",
                "contentRef": "content://src-app-after",
                "diffRef": "diff://src-app",
                "preview": "changed App component"
            }),
        )],
    )
    .expect("file changed should append");

    let read = read_session(&core, &session_id);
    let detail = read.detail.expect("session detail");
    let artifacts = detail["artifacts"].as_array().expect("detail artifacts");
    assert!(artifacts.iter().any(|artifact| {
        artifact["artifactRef"].as_str() == Some("artifact_src_app_after")
            && artifact["path"].as_str() == Some("src/App.tsx")
    }));
    assert!(artifacts.iter().any(|artifact| {
        artifact["artifactRef"].as_str() == Some("artifact_src_app_before")
            && artifact["path"].as_str() == Some("src/App.tsx")
    }));
    let app_artifact = artifacts
        .iter()
        .find(|artifact| artifact["artifactRef"].as_str() == Some("artifact_src_app_after"))
        .expect("app artifact");
    assert_eq!(
        app_artifact["metadata"]["previewText"].as_str(),
        Some("changed App component")
    );
    assert_eq!(
        app_artifact["metadata"]["changeKind"].as_str(),
        Some("modified")
    );
    assert_eq!(
        app_artifact["metadata"]["checkpointRef"].as_str(),
        Some("checkpoint_src_app_after")
    );
    assert_eq!(
        app_artifact["metadata"]["contentRef"].as_str(),
        Some("content://src-app-after")
    );
    assert_eq!(
        app_artifact["metadata"]["diffRef"].as_str(),
        Some("diff://src-app")
    );

    let artifact_read = core
        .read_artifacts(ArtifactReadParams {
            session_id: session_id.clone(),
            turn_id: Some(turn_id.clone()),
            artifact_ref: Some("artifact_src_app_after".to_string()),
            include_content: Some(false),
            cursor: None,
            limit: None,
        })
        .expect("artifact read");
    assert_eq!(artifact_read.artifacts.len(), 1);
    assert_eq!(
        artifact_read.artifacts[0].artifact_ref,
        "artifact_src_app_after"
    );
    assert_eq!(
        artifact_read.artifacts[0].path.as_deref(),
        Some("src/App.tsx")
    );
    assert_eq!(
        artifact_read.artifacts[0]
            .metadata
            .as_ref()
            .and_then(|metadata| metadata.get("previewText"))
            .and_then(serde_json::Value::as_str),
        Some("changed App component")
    );
    assert_eq!(
        artifact_read.artifacts[0]
            .metadata
            .as_ref()
            .and_then(|metadata| metadata.get("diffRef"))
            .and_then(serde_json::Value::as_str),
        Some("diff://src-app")
    );

    let evidence = core
        .export_evidence(EvidenceExportParams {
            session_id,
            turn_id: Some(turn_id),
            include_events: Some(true),
            include_artifacts: Some(true),
            include_evidence_pack: Some(false),
        })
        .await
        .expect("evidence export");
    let artifact_refs = evidence
        .artifacts
        .iter()
        .map(|artifact| artifact.artifact_ref.as_str())
        .collect::<Vec<_>>();
    assert!(artifact_refs.contains(&"artifact_src_app_after"));
    assert!(artifact_refs.contains(&"artifact_src_app_before"));
}

#[tokio::test]
async fn tool_terminal_large_output_is_normalized_to_output_ref() {
    let (core, session_id, turn_id) = runtime_with_active_turn(
        "sess_coding_large_output",
        "thread_coding_large_output",
        "turn_coding_large_output",
    )
    .await;
    let large_output = "x".repeat(40_000);

    let appended = core
        .append_external_runtime_events(
            &session_id,
            Some(&turn_id),
            canonical_output_item_events(
                "sess_coding_large_output",
                "thread_coding_large_output",
                &turn_id,
                "tool-large-output",
                CanonicalOutputFamily::Tool,
                large_output,
            ),
        )
        .expect("large tool output should append as refs");

    assert_eq!(appended.len(), 2);
    let terminal = appended.last().expect("tool terminal event");
    assert_eq!(terminal.event_type, "item.completed");
    assert!(terminal.payload["outputRef"]
        .as_str()
        .is_some_and(|value| value.starts_with("output:runtime:")));
    assert_eq!(terminal.payload["outputTruncated"].as_bool(), Some(true));
    assert!(terminal.payload["outputPreview"]
        .as_str()
        .is_some_and(|value| value.chars().count() <= 1_201));
    assert!(terminal.payload["item"]["payload"]["output"]["text"]
        .as_str()
        .is_some_and(|value| value.chars().count() <= 1_201));
    assert_eq!(
        terminal.payload["item"]["payload"]["output"]["outputRef"].as_str(),
        terminal.payload["outputRef"].as_str()
    );
}

#[tokio::test]
async fn mcp_and_collab_terminal_large_outputs_use_canonical_sidecar_projection() {
    for (family, suffix) in [
        (CanonicalOutputFamily::Mcp, "mcp"),
        (CanonicalOutputFamily::Collab, "collab"),
    ] {
        let session_name = format!("sess_coding_{suffix}_large_output");
        let thread_name = format!("thread_coding_{suffix}_large_output");
        let turn_name = format!("turn_coding_{suffix}_large_output");
        let call_id = format!("{suffix}-large-output");
        let large_output = format!("{suffix}:{}", "x".repeat(40_000));
        let (core, session_id, turn_id) =
            runtime_with_active_turn(&session_name, &thread_name, &turn_name).await;

        let appended = core
            .append_external_runtime_events(
                &session_id,
                Some(&turn_id),
                canonical_output_item_events(
                    &session_id,
                    &thread_name,
                    &turn_id,
                    &call_id,
                    family,
                    large_output.clone(),
                ),
            )
            .expect("canonical typed large output should append");
        let terminal = appended.last().expect("canonical terminal event");
        let output_ref = terminal.payload["outputRef"]
            .as_str()
            .expect("canonical output ref");

        assert_eq!(terminal.event_type, "item.completed");
        assert_eq!(
            terminal.payload["item"]["payload"]["output"]["outputRef"].as_str(),
            Some(output_ref)
        );
        assert_eq!(
            terminal.payload["item"]["payload"]["output"]["truncated"].as_bool(),
            Some(true)
        );

        let artifact_read = core
            .read_artifacts(ArtifactReadParams {
                session_id: session_id.clone(),
                turn_id: Some(turn_id.clone()),
                artifact_ref: Some(output_ref.to_string()),
                include_content: Some(true),
                cursor: None,
                limit: None,
            })
            .expect("canonical typed output artifact");
        assert_eq!(
            artifact_read.artifacts[0].content.as_deref(),
            Some(large_output.as_str())
        );
    }
}

#[tokio::test]
async fn tool_terminal_large_output_is_readable_from_output_owner() {
    let (core, session_id, turn_id) = runtime_with_active_turn(
        "sess_coding_output_owner",
        "thread_coding_output_owner",
        "turn_coding_output_owner",
    )
    .await;
    let large_output = format!("start\n{}\nend", "x".repeat(40_000));

    let appended = core
        .append_external_runtime_events(
            &session_id,
            Some(&turn_id),
            canonical_output_item_events(
                "sess_coding_output_owner",
                "thread_coding_output_owner",
                &turn_id,
                "tool-output-owner",
                CanonicalOutputFamily::Tool,
                large_output.clone(),
            ),
        )
        .expect("large tool output should append");
    let output_ref = appended[1].payload["outputRef"]
        .as_str()
        .expect("output ref")
        .to_string();

    let read = read_session(&core, &session_id);
    let detail = read.detail.expect("session detail");
    let outputs = detail["outputs"].as_array().expect("detail outputs");
    assert!(outputs.iter().any(|output| {
        output["outputRef"].as_str() == Some(output_ref.as_str())
            && output["outputTruncated"].as_bool() == Some(true)
    }));
    let tool_calls = detail["thread_read"]["tool_calls"]
        .as_array()
        .expect("tool calls");
    assert!(tool_calls.iter().any(|tool_call| {
        tool_call["output_ref"].as_str() == Some(output_ref.as_str())
            && tool_call["output_truncated"].as_bool() == Some(true)
    }));

    let artifact_read = core
        .read_artifacts(ArtifactReadParams {
            session_id: session_id.clone(),
            turn_id: Some(turn_id.clone()),
            artifact_ref: Some(output_ref.clone()),
            include_content: Some(true),
            cursor: None,
            limit: None,
        })
        .expect("read output artifact");
    assert_eq!(artifact_read.artifacts.len(), 1);
    assert_eq!(artifact_read.artifacts[0].artifact_ref, output_ref);
    assert_eq!(
        artifact_read.artifacts[0].kind.as_deref(),
        Some("tool_output")
    );
    assert_eq!(
        artifact_read.artifacts[0].content.as_deref(),
        Some(large_output.as_str())
    );
    assert_eq!(
        artifact_read.artifacts[0].content_status,
        ArtifactContentStatus::Available
    );

    let evidence = core
        .export_evidence(EvidenceExportParams {
            session_id,
            turn_id: Some(turn_id),
            include_events: Some(true),
            include_artifacts: Some(true),
            include_evidence_pack: Some(false),
        })
        .await
        .expect("evidence export");
    assert!(evidence
        .artifacts
        .iter()
        .any(|artifact| artifact.artifact_ref == artifact_read.artifacts[0].artifact_ref));
}

#[tokio::test]
async fn tool_terminal_large_output_persists_to_filesystem_snapshot_owner() {
    let snapshot_root = unique_temp_dir("lime-runtime-output-snapshots");
    let core = RuntimeCore::default().with_output_snapshot_store(Arc::new(
        FilesystemOutputSnapshotStore::with_base_dir(snapshot_root.clone()),
    ));
    let (core, session_id, turn_id) = runtime_with_active_turn_using_core(
        core,
        "sess_coding_output_snapshot_owner",
        "thread_coding_output_snapshot_owner",
        "turn_coding_output_snapshot_owner",
    )
    .await;
    let large_output = format!("snapshot-start\n{}\nsnapshot-end", "z".repeat(40_000));

    let appended = core
        .append_external_runtime_events(
            &session_id,
            Some(&turn_id),
            canonical_output_item_events(
                "sess_coding_output_snapshot_owner",
                "thread_coding_output_snapshot_owner",
                &turn_id,
                "tool-output-snapshot-owner",
                CanonicalOutputFamily::Tool,
                large_output.clone(),
            ),
        )
        .expect("large tool output should append");
    let output_ref = appended[1].payload["outputRef"]
        .as_str()
        .expect("output ref")
        .to_string();
    let event_sidecar_ref = appended[1].payload["sidecarRef"]
        .as_object()
        .expect("output sidecar ref")
        .clone();
    assert_eq!(
        event_sidecar_ref
            .get("kind")
            .and_then(serde_json::Value::as_str),
        Some("tool_output")
    );
    assert!(event_sidecar_ref
        .get("relativePath")
        .and_then(serde_json::Value::as_str)
        .is_some_and(|value| value
            .starts_with("sessions/sess_coding_output_snapshot_owner/runtime-outputs/")));
    assert!(event_sidecar_ref
        .get("sha256")
        .and_then(serde_json::Value::as_str)
        .is_some_and(|value| value.starts_with("sha256:")));

    let snapshot_file = {
        let state = core
            .state
            .lock()
            .expect("runtime core state mutex poisoned");
        let stored = state.sessions.get(&session_id).expect("stored session");
        let output = stored
            .output_blobs
            .get(output_ref.as_str())
            .expect("stored output blob");
        assert!(
            output.content.is_none(),
            "filesystem snapshot owner should remove inline content from stored output record"
        );
        let snapshot_file = output
            .snapshot_file
            .clone()
            .expect("stored output snapshot file");
        assert!(snapshot_file.starts_with("runtime-outputs/"));
        let sidecar_ref = output
            .sidecar_ref
            .as_ref()
            .expect("stored output sidecar ref");
        assert_eq!(sidecar_ref.kind, "tool_output");
        assert_eq!(
            sidecar_ref.relative_path,
            event_sidecar_ref
                .get("relativePath")
                .and_then(serde_json::Value::as_str)
                .expect("event sidecar relative path")
        );
        snapshot_file
    };
    let snapshot_path = snapshot_root
        .join("sessions")
        .join(session_id.as_str())
        .join(snapshot_file.as_str());
    assert_eq!(
        std::fs::read_to_string(snapshot_path).expect("stored output snapshot"),
        large_output
    );

    let read = read_session(&core, &session_id);
    let detail = read.detail.expect("session detail");
    let outputs = detail["outputs"].as_array().expect("detail outputs");
    assert!(outputs.iter().any(|output| {
        output["outputRef"].as_str() == Some(output_ref.as_str())
            && output["outputSnapshotFile"].as_str() == Some(snapshot_file.as_str())
            && output["sidecarRef"]["sha256"]
                .as_str()
                .is_some_and(|value| value.starts_with("sha256:"))
    }));

    let artifact_read = core
        .read_artifacts(ArtifactReadParams {
            session_id: session_id.clone(),
            turn_id: Some(turn_id),
            artifact_ref: Some(output_ref.clone()),
            include_content: Some(true),
            cursor: None,
            limit: None,
        })
        .expect("read output artifact");
    assert_eq!(artifact_read.artifacts.len(), 1);
    assert_eq!(artifact_read.artifacts[0].artifact_ref, output_ref);
    assert_eq!(
        artifact_read.artifacts[0].content.as_deref(),
        Some(large_output.as_str())
    );
    assert_eq!(
        artifact_read.artifacts[0].content_status,
        ArtifactContentStatus::Available
    );
}

#[tokio::test]
async fn start_turn_hydrates_persisted_coding_snapshot_refs_into_runtime_state() {
    let snapshot_root = unique_temp_dir("lime-runtime-hydrated-snapshots");
    let session_id = "sess_coding_hydrate";
    let turn_id = "turn_coding_hydrate";
    let output_ref = "output://hydrated-tool";
    let output_snapshot_file = "runtime-outputs/hydrated-tool.txt";
    let checkpoint_snapshot_file = "runtime-file-checkpoints/hydrated-app.txt";
    let output_content = "hydrated output\n".repeat(1024);
    let previous_content = "export function App() {\n  return null;\n}";
    let workspace_root = unique_temp_dir("lime-runtime-hydrated-workspace");
    let hydrated_started_payload = canonical_output_item_payload(
        session_id,
        "thread_coding_hydrate",
        turn_id,
        "tool_hydrated",
        CanonicalOutputFamily::Tool,
        None,
        None,
    );
    let mut hydrated_completed_payload = canonical_output_item_payload(
        session_id,
        "thread_coding_hydrate",
        turn_id,
        "tool_hydrated",
        CanonicalOutputFamily::Tool,
        Some("hydrated output".to_string()),
        Some(output_ref),
    );
    let hydrated_completed = hydrated_completed_payload
        .as_object_mut()
        .expect("hydrated canonical payload");
    hydrated_completed.insert(
        "outputRef".to_string(),
        serde_json::Value::String(output_ref.to_string()),
    );
    hydrated_completed.insert("refIds".to_string(), json!([output_ref]));
    hydrated_completed.insert(
        "outputPreview".to_string(),
        serde_json::Value::String("hydrated output".to_string()),
    );
    hydrated_completed.insert("outputTruncated".to_string(), serde_json::Value::Bool(true));
    hydrated_completed.insert("outputBytes".to_string(), json!(output_content.len()));
    hydrated_completed.insert(
        "outputSnapshotFile".to_string(),
        serde_json::Value::String(output_snapshot_file.to_string()),
    );
    std::fs::create_dir_all(
        snapshot_root
            .join("sessions")
            .join(session_id)
            .join("runtime-outputs"),
    )
    .expect("output snapshot dir");
    std::fs::create_dir_all(
        snapshot_root
            .join("sessions")
            .join(session_id)
            .join("runtime-file-checkpoints"),
    )
    .expect("checkpoint snapshot dir");
    std::fs::write(
        snapshot_root
            .join("sessions")
            .join(session_id)
            .join(output_snapshot_file),
        output_content.as_str(),
    )
    .expect("output snapshot");
    std::fs::write(
        snapshot_root
            .join("sessions")
            .join(session_id)
            .join(checkpoint_snapshot_file),
        previous_content,
    )
    .expect("checkpoint snapshot");
    std::fs::create_dir_all(workspace_root.join("src")).expect("workspace src");
    std::fs::write(workspace_root.join("src").join("App.tsx"), "<main />").expect("live file");

    let persisted_session = AgentSession {
        session_id: session_id.to_string(),
        thread_id: "thread_coding_hydrate".to_string(),
        app_id: "agent-runtime".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: Some(app_server_protocol::BusinessObjectRef {
            kind: "agent.session".to_string(),
            id: session_id.to_string(),
            title: Some("Hydrated Coding".to_string()),
            uri: None,
            metadata: Some(json!({
                "workingDir": workspace_root.to_string_lossy(),
                "executionStrategy": "runtime-core"
            })),
        }),
        status: AgentSessionStatus::Completed,
        created_at: "2026-06-12T00:00:00.000Z".to_string(),
        updated_at: "2026-06-12T00:00:05.000Z".to_string(),
    };
    let persisted_turn = AgentTurn {
        turn_id: turn_id.to_string(),
        session_id: session_id.to_string(),
        thread_id: "thread_coding_hydrate".to_string(),
        status: AgentTurnStatus::Completed,
        started_at: Some("2026-06-12T00:00:01.000Z".to_string()),
        completed_at: Some("2026-06-12T00:00:05.000Z".to_string()),
    };
    let persisted = AgentSessionReadResponse {
        session: persisted_session,
        turns: vec![persisted_turn],
        detail: Some(json!({
            "id": session_id,
            "session_id": session_id,
            "thread_id": "thread_coding_hydrate",
            "working_dir": workspace_root.to_string_lossy(),
            "events": [
                {
                    "eventId": "evt_hydrated_output_started",
                    "sequence": 1,
                    "sessionId": session_id,
                    "threadId": "thread_coding_hydrate",
                    "turnId": turn_id,
                    "eventType": "item.started",
                    "timestamp": "2026-06-12T00:00:01.500Z",
                    "payload": hydrated_started_payload
                },
                {
                    "eventId": "evt_hydrated_output_completed",
                    "sequence": 3,
                    "sessionId": session_id,
                    "threadId": "thread_coding_hydrate",
                    "turnId": turn_id,
                    "eventType": "item.completed",
                    "timestamp": "2026-06-12T00:00:02.000Z",
                    "payload": hydrated_completed_payload
                }
            ],
            "outputs": [
                {
                    "outputRef": output_ref,
                    "refIds": [output_ref],
                    "preview": "hydrated output",
                    "outputBytes": output_content.len(),
                    "eventId": "evt_hydrated_output_completed",
                    "sequence": 3,
                    "turnId": turn_id,
                    "timestamp": "2026-06-12T00:00:02.000Z",
                    "toolCallId": "tool_hydrated",
                    "outputSnapshotFile": output_snapshot_file
                }
            ],
            "items": [
                {
                    "id": "checkpoint_hydrated_app",
                    "type": "file_artifact",
                    "thread_id": "thread_coding_hydrate",
                    "turn_id": turn_id,
                    "path": "src/App.tsx",
                    "source": "runtime",
                    "status": "completed",
                    "updated_at": "2026-06-12T00:00:03.000Z",
                    "metadata": {
                        "artifactId": "artifact_hydrated_app",
                        "artifactRequestId": "evt_hydrated_file",
                        "artifactVersionId": "checkpoint_hydrated_app",
                        "artifactVersionNo": 2,
                        "artifactKind": "code_file",
                        "artifactStatus": "ready",
                        "checkpointRef": "checkpoint_hydrated_app",
                        "checkpointSnapshotFile": checkpoint_snapshot_file,
                        "file_change": {
                            "previousContentSnapshotFile": checkpoint_snapshot_file
                        }
                    }
                }
            ]
        })),
    };
    let app_data_source = Arc::new(TestSessionDataSource::new(persisted));
    let core = RuntimeCore::with_backend(Arc::new(CodingLifecycleBackend))
        .with_app_data_source(app_data_source)
        .with_output_snapshot_store(Arc::new(FilesystemOutputSnapshotStore::with_base_dir(
            snapshot_root.clone(),
        )))
        .with_file_checkpoint_snapshot_store(Arc::new(
            FilesystemFileCheckpointSnapshotStore::with_base_dir(snapshot_root.clone()),
        ));

    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: session_id.to_string(),
            turn_id: Some("turn_after_hydrate".to_string()),
            input: AgentInput {
                text: "继续 coding".to_string(),
                attachments: Vec::new(),
            },
            runtime_options: None,
            queue_if_busy: false,
            skip_pre_submit_resume: false,
        },
        RuntimeHostContext::default(),
    )
    .await
    .expect("hydrate then continue");

    let read = read_session(&core, session_id);
    let detail = read.detail.expect("hydrated detail");
    assert!(detail["outputs"]
        .as_array()
        .expect("outputs")
        .iter()
        .any(|output| output["outputRef"].as_str() == Some(output_ref)
            && output["outputSnapshotFile"].as_str() == Some(output_snapshot_file)
            && output["eventType"].as_str() == Some("item.completed")));
    assert!(detail["items"]
        .as_array()
        .expect("items")
        .iter()
        .any(
            |item| item["id"].as_str() == Some("checkpoint_hydrated_app")
                && item["metadata"]["checkpointSnapshotFile"].as_str()
                    == Some(checkpoint_snapshot_file)
        ));

    let artifact_read = core
        .read_artifacts(ArtifactReadParams {
            session_id: session_id.to_string(),
            turn_id: Some(turn_id.to_string()),
            artifact_ref: Some(output_ref.to_string()),
            include_content: Some(true),
            cursor: None,
            limit: None,
        })
        .expect("read hydrated output artifact");
    assert_eq!(artifact_read.artifacts.len(), 1);
    assert_eq!(
        artifact_read.artifacts[0].content.as_deref(),
        Some(output_content.as_str())
    );

    let checkpoint = core
        .get_agent_session_file_checkpoint(AgentSessionFileCheckpointGetParams {
            session_id: session_id.to_string(),
            checkpoint_id: "checkpoint_hydrated_app".to_string(),
        })
        .await
        .expect("hydrated file checkpoint");
    assert_eq!(checkpoint.content.as_deref(), Some(previous_content));
}
