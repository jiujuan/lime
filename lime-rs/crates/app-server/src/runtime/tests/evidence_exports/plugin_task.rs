use super::*;

#[tokio::test]
async fn export_evidence_pack_includes_plugin_agent_task_events_and_refs() {
    let core = RuntimeCore::default();
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_plugin_task_evidence".to_string()),
        thread_id: Some("thread_plugin_task_evidence".to_string()),
        app_id: "content-studio".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");
    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_plugin_task_evidence".to_string(),
            turn_id: Some("turn_plugin_task_evidence".to_string()),
            input: AgentInput {
                text: "运行插件 Agent task".to_string(),
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
    core.append_external_runtime_events(
        "sess_plugin_task_evidence",
        Some("turn_plugin_task_evidence"),
        vec![
            RuntimeEvent::new(
                "plugin_worker.hook",
                json!({
                    "source": "plugin_task_worker",
                    "message": "Plugin worker 已记录运行证据",
                    "metadata": {
                        "pluginWorker": {
                            "appId": "content-factory-app",
                            "entryKey": "content_factory",
                            "taskId": "plugin-task-1"
                        },
                        "pluginWorkflow": {
                            "source": "plugin_worker_workflow",
                            "workflowId": "content-factory",
                            "runId": "plugin-run-1",
                            "status": "running"
                        }
                    },
                    "evidenceRefs": ["evidence://plugin-task-1/hook"]
                }),
            ),
            RuntimeEvent::new(
                "artifact.snapshot",
                json!({
                    "artifactId": "plugin-artifact-1",
                    "path": ".lime/artifacts/plugin/content-batch.json",
                    "metadata": {
                        "pluginWorker": {
                            "appId": "content-factory-app",
                            "taskId": "plugin-task-1"
                        },
                        "contentFactoryWorkspacePatch": {
                            "kind": "content_factory.workspace_patch",
                            "objects": [
                                {
                                    "id": "post-1",
                                    "title": "插件生成内容"
                                }
                            ]
                        }
                    }
                }),
            ),
        ],
    )
    .expect("append plugin task evidence events");

    let response = core
        .export_evidence(EvidenceExportParams {
            session_id: "sess_plugin_task_evidence".to_string(),
            turn_id: Some("turn_plugin_task_evidence".to_string()),
            include_events: Some(true),
            include_artifacts: Some(true),
            include_evidence_pack: Some(true),
        })
        .await
        .expect("export plugin task evidence");

    assert_eq!(response.session.session_id, "sess_plugin_task_evidence");
    assert_eq!(response.session.thread_id, "thread_plugin_task_evidence");
    let plugin_event = response
        .events
        .iter()
        .find(|event| event.event_type == "plugin_worker.hook")
        .expect("plugin worker hook event");
    assert_eq!(plugin_event.session_id, "sess_plugin_task_evidence");
    assert_eq!(
        plugin_event.thread_id.as_deref(),
        Some("thread_plugin_task_evidence")
    );
    assert_eq!(
        plugin_event.turn_id.as_deref(),
        Some("turn_plugin_task_evidence")
    );
    assert_eq!(
        plugin_event
            .payload
            .pointer("/metadata/pluginWorker/taskId")
            .and_then(serde_json::Value::as_str),
        Some("plugin-task-1")
    );
    assert_eq!(
        plugin_event
            .payload
            .get("evidenceRefs")
            .and_then(serde_json::Value::as_array)
            .and_then(|refs| refs.first())
            .and_then(serde_json::Value::as_str),
        Some("evidence://plugin-task-1/hook")
    );
    assert!(response.artifacts.iter().any(|artifact| {
        artifact.artifact_ref == "plugin-artifact-1"
            && artifact.path.as_deref() == Some(".lime/artifacts/plugin/content-batch.json")
    }));

    let evidence_pack = response.evidence_pack.expect("evidence pack");
    assert_eq!(evidence_pack.turn_count, 1);
    assert!(evidence_pack
        .artifacts
        .iter()
        .any(|artifact| { artifact.relative_path == ".lime/artifacts/plugin/content-batch.json" }));
}
