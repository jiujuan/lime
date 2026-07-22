use super::*;
use crate::runtime::plugin_task_runtime::build_plugin_task_runtime_contract;
use crate::runtime::sidecar_store::SidecarStore;
use crate::runtime::RuntimeCore;
use app_server_protocol::AgentInput;
use app_server_protocol::AgentSessionReadParams;
use app_server_protocol::AgentSessionStartParams;
use app_server_protocol::AgentSessionTurnStartParams;
use app_server_protocol::ArtifactContentStatus;
use app_server_protocol::ArtifactReadParams;
use serde_json::json;
use std::fs;
use std::process::Command;
use std::sync::Arc;

#[test]
fn worker_adapter_runs_skeleton_and_projects_artifact_snapshot() {
    let Some(fixture_root) = fixture_root() else {
        return;
    };
    let mut sample_request: Value = serde_json::from_str(
        &fs::read_to_string(fixture_root.join("examples/runtime-request.sample.json"))
            .expect("sample request"),
    )
    .expect("sample json");
    sample_request["taskId"] = json!("task-image-regenerate-1");
    sample_request["taskKind"] = json!("content.image.generate");
    sample_request["prompt"] = json!("为文章重新生成配图");
    let state = json!({
        "manifest": {
            "runtimePackage": {
                "worker": {
                    "entrypoint": "./src/runtime/content-factory-worker.mjs",
                    "contract": "./app.runtime.yaml",
                    "sampleRequest": "./examples/runtime-request.sample.json",
                    "outputArtifactKind": "content_factory.workspace_patch"
                }
            },
            "agentRuntime": {
                "worker": {
                    "directProviderAccess": false,
                    "directFilesystemAccess": false
                },
                "tasks": [
                    { "kind": "content.image.generate" }
                ]
            }
        }
    });
    let contract = build_plugin_task_runtime_contract(&state, Some(&fixture_root));

    let core = RuntimeCore::default();
    let events = core
        .run_plugin_worker(PluginWorkerRunRequest::new(
            fixture_root,
            contract,
            sample_request,
        ))
        .expect("worker events");

    assert_eq!(events.len(), 1);
    assert_eq!(events[0].event_type, "artifact.snapshot");
    assert_eq!(
        events[0].payload["artifact"]["metadata"]["kind"],
        CONTENT_FACTORY_WORKSPACE_PATCH_KIND
    );
    assert_eq!(
        events[0].payload["artifact"]["metadata"]["contentFactoryWorkspacePatch"]
            ["selectedObjectRef"]["kind"],
        "imageGenerationSet"
    );
    assert_eq!(
        events[0].payload["artifact"]["metadata"]["pluginWorker"]["taskKind"],
        "content.image.generate"
    );
    assert_eq!(
        events[0].payload["artifact"]["metadata"]["pluginWorker"]["outputArtifactKind"],
        CONTENT_FACTORY_WORKSPACE_PATCH_KIND
    );
    assert!(events[0].payload["artifact"]["content"].is_null());
}

#[test]
fn worker_adapter_streams_ndjson_progress_before_final_response() {
    let Some(fixture_root) = fixture_root() else {
        return;
    };
    let mut sample_request: Value = serde_json::from_str(
        &fs::read_to_string(fixture_root.join("examples/runtime-request.sample.json"))
            .expect("sample request"),
    )
    .expect("sample json");
    sample_request["taskKind"] = json!("content.article.generate");
    sample_request["prompt"] = json!("写一篇关于 AI Agent 工作流的公众号文章");
    sample_request["sourceObjectRef"] = Value::Null;
    sample_request["workflowKey"] = json!("content_article_workflow");
    sample_request["orchestration"] = json!([
        {
            "id": "research",
            "title": "资料检索",
            "subagent": "content-researcher",
            "skillRefs": ["article-research"],
        }
    ]);
    let state = json!({
        "manifest": {
            "runtimePackage": {
                "worker": {
                    "entrypoint": "./src/runtime/content-factory-worker.mjs",
                    "contract": "./app.runtime.yaml",
                    "sampleRequest": "./examples/runtime-request.sample.json",
                    "outputArtifactKind": "content_factory.workspace_patch"
                }
            },
            "agentRuntime": {
                "worker": {
                    "directProviderAccess": false,
                    "directFilesystemAccess": false
                },
                "tasks": [
                    { "kind": "content.article.generate" }
                ]
            }
        }
    });
    let contract = build_plugin_task_runtime_contract(&state, Some(&fixture_root));

    let core = RuntimeCore::default();
    let mut progress_events = Vec::new();
    let events = core
        .run_plugin_worker_with_progress(
            PluginWorkerRunRequest::new(fixture_root, contract, sample_request),
            &mut |event| {
                progress_events.push(event);
                Ok(())
            },
        )
        .expect("worker events");

    assert!(!progress_events.is_empty());
    assert!(progress_events
        .iter()
        .any(|event| event.event_type == "workflow.connector.requested"));
    let artifact_progress_events = progress_events
        .iter()
        .filter(|event| event.event_type == "artifact.snapshot")
        .collect::<Vec<_>>();
    assert!(!artifact_progress_events.is_empty());
    assert!(artifact_progress_events.iter().any(|event| {
        event.payload["artifact"]["status"] == "ready"
            || event.payload["artifact"]["status"] == "streaming"
    }));
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].event_type, "artifact.snapshot");
}

#[test]
fn worker_adapter_completes_existing_plugin_worker_metadata() {
    let state = json!({
        "manifest": {
            "runtimePackage": {
                "worker": {
                    "entrypoint": "./src/runtime/content-factory-worker.mjs",
                    "outputArtifactKind": "content_factory.workspace_patch"
                }
            },
            "agentRuntime": {
                "worker": {
                    "directProviderAccess": false,
                    "directFilesystemAccess": false
                }
            }
        }
    });
    let contract = build_plugin_task_runtime_contract(&state, None);
    let response = json!({
        "status": "completed",
        "artifacts": [
            {
                "kind": "artifact.snapshot",
                "artifactId": "task-article:workspace-patch",
                "title": "Content Factory workspace patch",
                "metadata": {
                    "pluginWorker": {
                        "taskId": "task-article",
                        "workflowKey": "",
                        "skillRefs": []
                    },
                    "contentFactoryWorkspacePatch": {
                        "objects": [
                            {
                                "ref": {
                                    "kind": "articleDraft",
                                    "id": "article-1"
                                }
                            }
                        ]
                    }
                }
            }
        ]
    });
    let request = json!({
        "appId": "content-factory-app",
        "taskId": "task-article",
        "taskKind": "content.article.generate",
        "turnId": "turn-article",
        "prompt": "写一篇文章",
        "workflowKey": "content_article_workflow",
        "subagents": ["article-writer"],
        "skillRefs": ["article-writing", "article-image-plan"],
        "cliRefs": ["content-factory"],
        "connectorRefs": ["web-research"],
        "hookPolicy": {
            "prompt": ["prompt-submit"]
        },
        "orchestration": [
            {
                "id": "draft",
                "subagent": "article-writer"
            }
        ]
    });

    let events = worker_response_to_runtime_events(response, &request, &contract, true)
        .expect("worker events");

    let metadata = &events[0].payload["artifact"]["metadata"]["pluginWorker"];
    assert_eq!(metadata["taskId"], "task-article");
    assert_eq!(metadata["taskKind"], "content.article.generate");
    assert_eq!(metadata["outputObjectCount"], 1);
    assert_eq!(metadata["workflowKey"], "content_article_workflow");
    assert_eq!(metadata["subagents"][0], "article-writer");
    assert_eq!(metadata["skillRefs"][1], "article-image-plan");
    assert_eq!(metadata["cliRefs"][0], "content-factory");
    assert_eq!(metadata["connectorRefs"][0], "web-research");
    assert_eq!(metadata["hookPolicy"]["prompt"][0], "prompt-submit");
    assert_eq!(metadata["orchestration"][0]["subagent"], "article-writer");
}

#[tokio::test]
async fn worker_adapter_events_materialize_in_session_read_model() {
    let Some(fixture_root) = fixture_root() else {
        return;
    };
    let mut sample_request: Value = serde_json::from_str(
        &fs::read_to_string(fixture_root.join("examples/runtime-request.sample.json"))
            .expect("sample request"),
    )
    .expect("sample json");
    sample_request["taskId"] = json!("task-image-regenerate-1");
    sample_request["taskKind"] = json!("content.image.generate");
    sample_request["prompt"] = json!("为文章重新生成配图");
    let state = json!({
        "manifest": {
            "runtimePackage": {
                "worker": {
                    "entrypoint": "./src/runtime/content-factory-worker.mjs",
                    "contract": "./app.runtime.yaml",
                    "sampleRequest": "./examples/runtime-request.sample.json",
                    "outputArtifactKind": "content_factory.workspace_patch"
                }
            },
            "agentRuntime": {
                "worker": {
                    "directProviderAccess": false,
                    "directFilesystemAccess": false
                },
                "tasks": [
                    { "kind": "content.image.generate" }
                ]
            }
        }
    });
    let contract = build_plugin_task_runtime_contract(&state, Some(&fixture_root));
    let core = RuntimeCore::default();
    let runtime_events = core
        .run_plugin_worker(PluginWorkerRunRequest::new(
            fixture_root,
            contract,
            sample_request,
        ))
        .expect("worker events");
    core.start_session(AgentSessionStartParams {
        session_id: Some("session-content-factory".to_string()),
        thread_id: Some("thread-content-factory".to_string()),
        app_id: "content-factory-app".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");
    let turn = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: "session-content-factory".to_string(),
                turn_id: Some("turn-action-1".to_string()),
                input: AgentInput {
                    text: "重新生成配图".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: None,
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            super::super::RuntimeHostContext::default(),
        )
        .await
        .expect("turn")
        .response
        .turn;

    core.append_external_runtime_events(
        "session-content-factory",
        Some(&turn.turn_id),
        runtime_events,
    )
    .expect("append worker events");

    let read = core
        .read_session(AgentSessionReadParams {
            session_id: "session-content-factory".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read session");
    let detail = read.detail.expect("detail");
    assert_eq!(
        detail["article_workspace"]["selectedObjectRef"]["kind"],
        "imageGenerationSet"
    );
    let image_object = detail["article_workspace"]["objects"]
        .as_array()
        .expect("article workspace objects")
        .iter()
        .find(|object| object["ref"]["kind"] == "imageGenerationSet")
        .expect("image generation object");
    assert_eq!(
        image_object["source"]["imageSlots"]
            .as_array()
            .expect("image slots")
            .len(),
        3
    );
    assert_eq!(
        detail["article_workspace"]["workerEvidence"][0]["artifactKind"],
        CONTENT_FACTORY_WORKSPACE_PATCH_KIND
    );
}

#[tokio::test]
async fn worker_adapter_persists_worker_artifact_content_to_sidecar() {
    let Some(fixture_root) = fixture_root() else {
        return;
    };
    let mut sample_request: Value = serde_json::from_str(
        &fs::read_to_string(fixture_root.join("examples/runtime-request.sample.json"))
            .expect("sample request"),
    )
    .expect("sample json");
    sample_request["taskId"] = json!("task-image-regenerate-1");
    sample_request["taskKind"] = json!("content.image.generate");
    sample_request["prompt"] = json!("为文章重新生成配图");
    let state = json!({
        "manifest": {
            "runtimePackage": {
                "worker": {
                    "entrypoint": "./src/runtime/content-factory-worker.mjs",
                    "contract": "./app.runtime.yaml",
                    "sampleRequest": "./examples/runtime-request.sample.json",
                    "outputArtifactKind": "content_factory.workspace_patch"
                }
            },
            "agentRuntime": {
                "worker": {
                    "directProviderAccess": false,
                    "directFilesystemAccess": false
                },
                "tasks": [
                    { "kind": "content.image.generate" }
                ]
            }
        }
    });
    let contract = build_plugin_task_runtime_contract(&state, Some(&fixture_root));
    let sidecar_root = tempfile::tempdir().expect("sidecar root");
    let core = RuntimeCore::default().with_sidecar_store(Arc::new(
        SidecarStore::new(sidecar_root.path()).expect("sidecar store"),
    ));
    let runtime_events = core
        .run_plugin_worker(PluginWorkerRunRequest::new(
            fixture_root,
            contract,
            sample_request,
        ))
        .expect("worker events");
    core.start_session(AgentSessionStartParams {
        session_id: Some("session-content-factory-sidecar".to_string()),
        thread_id: Some("thread-content-factory-sidecar".to_string()),
        app_id: "content-factory-app".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");
    let turn = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: "session-content-factory-sidecar".to_string(),
                turn_id: Some("turn-action-sidecar".to_string()),
                input: AgentInput {
                    text: "重新生成配图".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: None,
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            super::super::RuntimeHostContext::default(),
        )
        .await
        .expect("turn")
        .response
        .turn;

    core.append_external_runtime_events(
        "session-content-factory-sidecar",
        Some(&turn.turn_id),
        runtime_events,
    )
    .expect("append worker events");

    let artifact_read = core
        .read_artifacts(ArtifactReadParams {
            session_id: "session-content-factory-sidecar".to_string(),
            turn_id: Some(turn.turn_id),
            artifact_ref: Some("task-image-regenerate-1:workspace-patch".to_string()),
            include_content: Some(true),
            cursor: None,
            limit: None,
        })
        .expect("artifact read");
    assert_eq!(artifact_read.artifacts.len(), 1);
    assert_eq!(
        artifact_read.artifacts[0].content_status,
        ArtifactContentStatus::Available
    );
    let content = artifact_read.artifacts[0]
        .content
        .as_deref()
        .expect("worker artifact content");
    assert!(content.contains("\"schemaVersion\":\"article-workspace.v1\""));
    assert!(content.contains("\"imageGenerationSet\""));
    assert!(artifact_read.artifacts[0]
        .metadata
        .as_ref()
        .and_then(|metadata| metadata.get("sidecarRef"))
        .is_some());
}

#[test]
fn worker_adapter_rejects_runtime_blockers() {
    let temp = tempfile::tempdir().expect("temp dir");
    let contract = PluginTaskRuntimeContract {
        enabled: true,
        package_root_path: Some(temp.path().to_string_lossy().to_string()),
        worker_entrypoint: Some("./worker.mjs".to_string()),
        output_artifact_kind: Some(CONTENT_FACTORY_WORKSPACE_PATCH_KIND.to_string()),
        blockers: vec!["TASK_RUNTIME_WORKER_ENTRYPOINT_NOT_FOUND".to_string()],
        ..PluginTaskRuntimeContract::default()
    };

    let core = RuntimeCore::default();
    let error = core
        .run_plugin_worker(PluginWorkerRunRequest::new(
            temp.path(),
            contract,
            json!({}),
        ))
        .expect_err("blocked runtime");

    assert!(
        error
            .to_string()
            .contains("TASK_RUNTIME_WORKER_ENTRYPOINT_NOT_FOUND"),
        "{error}"
    );
}

#[test]
fn worker_adapter_times_out_worker_process() {
    let Some(node) = node_available() else {
        return;
    };
    let temp = tempfile::tempdir().expect("temp dir");
    let worker = temp.path().join("worker.mjs");
    fs::write(&worker, "setTimeout(() => {}, 10_000);\n").expect("worker");
    let contract = PluginTaskRuntimeContract {
        enabled: true,
        package_root_path: Some(temp.path().to_string_lossy().to_string()),
        worker_entrypoint: Some("./worker.mjs".to_string()),
        output_artifact_kind: Some(CONTENT_FACTORY_WORKSPACE_PATCH_KIND.to_string()),
        ..PluginTaskRuntimeContract::default()
    };

    let core = RuntimeCore::default();
    let error = core
        .run_plugin_worker(
            PluginWorkerRunRequest::new(temp.path(), contract, json!({})).with_timeout_ms(100),
        )
        .expect_err("timeout");

    assert!(error.to_string().contains("timed out"), "{error}");
    assert!(!node.is_empty());
}

#[test]
fn worker_adapter_preserves_failed_response_when_worker_exits_non_zero() {
    let Some(node) = node_available() else {
        return;
    };
    let temp = tempfile::tempdir().expect("temp dir");
    let worker = temp.path().join("worker.mjs");
    fs::write(
        &worker,
        r#"
process.stdout.write(JSON.stringify({
  status: "failed",
  error: { code: "HOST_MANAGED_GENERATION_REQUIRED" }
}) + "\n");
process.exitCode = 1;
"#,
    )
    .expect("worker");
    let contract = PluginTaskRuntimeContract {
        enabled: true,
        package_root_path: Some(temp.path().to_string_lossy().to_string()),
        worker_entrypoint: Some("./worker.mjs".to_string()),
        output_artifact_kind: Some(CONTENT_FACTORY_WORKSPACE_PATCH_KIND.to_string()),
        ..PluginTaskRuntimeContract::default()
    };

    let core = RuntimeCore::default();
    let error = core
        .run_plugin_worker(
            PluginWorkerRunRequest::new(temp.path(), contract, json!({})).with_timeout_ms(1_000),
        )
        .expect_err("failed worker response");

    assert!(
        error
            .to_string()
            .contains("HOST_MANAGED_GENERATION_REQUIRED"),
        "{error}"
    );
    assert!(!error.to_string().contains("exited with"), "{error}");
    assert!(!node.is_empty());
}

#[test]
fn worker_adapter_drains_large_stdout_while_waiting_for_exit() {
    let Some(node) = node_available() else {
        return;
    };
    let temp = tempfile::tempdir().expect("temp dir");
    let worker = temp.path().join("worker.mjs");
    fs::write(
        &worker,
        r#"
const payload = "x".repeat(256 * 1024);
process.stdout.write(JSON.stringify({
  status: "completed",
  artifacts: [
    {
      kind: "artifact.snapshot",
      artifactId: "large-output:workspace-patch",
      title: "Large worker output",
      contentType: "application/json",
      metadata: {
        kind: "content_factory.workspace_patch",
        contentFactoryWorkspacePatch: {
          schemaVersion: "article-workspace.v1",
          objects: [
            {
              ref: { kind: "articleDraft", id: "article-1" },
              source: { payload }
            }
          ]
        }
      }
    }
  ]
}) + "\n");
"#,
    )
    .expect("worker");
    let contract = PluginTaskRuntimeContract {
        enabled: true,
        package_root_path: Some(temp.path().to_string_lossy().to_string()),
        worker_entrypoint: Some("./worker.mjs".to_string()),
        output_artifact_kind: Some(CONTENT_FACTORY_WORKSPACE_PATCH_KIND.to_string()),
        ..PluginTaskRuntimeContract::default()
    };

    let core = RuntimeCore::default();
    let events = core
        .run_plugin_worker(
            PluginWorkerRunRequest::new(temp.path(), contract, json!({})).with_timeout_ms(1_000),
        )
        .expect("large output worker events");

    assert_eq!(events.len(), 1);
    assert_eq!(events[0].event_type, "artifact.snapshot");
    assert_eq!(
        events[0].payload["artifact"]["artifactId"],
        "large-output:workspace-patch"
    );
    assert!(!node.is_empty());
}

#[test]
fn worker_adapter_allows_large_cumulative_progress_stdout() {
    let Some(node) = node_available() else {
        return;
    };
    let temp = tempfile::tempdir().expect("temp dir");
    let worker = temp.path().join("worker.mjs");
    fs::write(
        &worker,
        r##"
const payload = "x".repeat(300 * 1024);
for (let index = 0; index < 9; index += 1) {
  process.stdout.write(JSON.stringify({
    kind: "runtime.event",
    eventType: "artifact.snapshot",
    payload: {
      artifact: {
        artifactId: `progress-${index}:workspace-patch`,
        status: "streaming",
        metadata: {
          complete: false,
          contentFactoryWorkspacePatch: {
            schemaVersion: "article-workspace.v1",
            objects: [
              {
                ref: { kind: "articleDraft", id: `article-${index}` },
                source: { documentText: payload }
              }
            ]
          }
        }
      }
    }
  }) + "\n");
}
process.stdout.write(JSON.stringify({
  status: "completed",
  artifacts: [
    {
      kind: "artifact.snapshot",
      artifactId: "progress-budget:workspace-patch",
      title: "Progress budget worker output",
      metadata: {
        kind: "content_factory.workspace_patch",
        contentFactoryWorkspacePatch: {
          schemaVersion: "article-workspace.v1",
          objects: [
            {
              ref: { kind: "articleDraft", id: "article-final" },
              source: {
                documentText: "# Done",
                finalMarkdown: "# Done"
              }
            }
          ]
        }
      }
    }
  ]
}) + "\n");
"##,
    )
    .expect("worker");
    let contract = PluginTaskRuntimeContract {
        enabled: true,
        package_root_path: Some(temp.path().to_string_lossy().to_string()),
        worker_entrypoint: Some("./worker.mjs".to_string()),
        output_artifact_kind: Some(CONTENT_FACTORY_WORKSPACE_PATCH_KIND.to_string()),
        ..PluginTaskRuntimeContract::default()
    };

    let core = RuntimeCore::default();
    let mut progress_events = Vec::new();
    let events = core
        .run_plugin_worker_with_progress(
            PluginWorkerRunRequest::new(temp.path(), contract, json!({})).with_timeout_ms(1_000),
            &mut |event| {
                progress_events.push(event);
                Ok(())
            },
        )
        .expect("progress output worker events");

    assert_eq!(progress_events.len(), 9);
    assert_eq!(events.len(), 1);
    assert_eq!(
        events[0].payload["artifact"]["artifactId"],
        "progress-budget:workspace-patch"
    );
    assert!(!node.is_empty());
}

#[test]
fn worker_adapter_closes_stdin_after_request() {
    let Some(node) = node_available() else {
        return;
    };
    let temp = tempfile::tempdir().expect("temp dir");
    let worker = temp.path().join("worker.mjs");
    fs::write(
        &worker,
        r##"
let input = "";
for await (const chunk of process.stdin) {
  input += chunk;
}
const request = JSON.parse(input);
process.stdout.write(JSON.stringify({
  status: "completed",
  artifacts: [
    {
      kind: "artifact.snapshot",
      artifactId: "stdin-eof:workspace-patch",
      title: "stdin eof worker output",
      contentType: "application/json",
      metadata: {
        kind: "content_factory.workspace_patch",
        contentFactoryWorkspacePatch: {
          schemaVersion: "article-workspace.v1",
          objects: [
            {
              ref: {
                appId: request.appId ?? "content-factory-app",
                kind: "articleDraft",
                id: "article-stdin-eof",
                sessionId: request.sessionId ?? "session-stdin-eof"
              },
              source: {
                documentText: "# Done",
                finalMarkdown: "# Done"
              }
            }
          ]
        }
      }
    }
  ]
}) + "\n");
"##,
    )
    .expect("worker");
    let contract = PluginTaskRuntimeContract {
        enabled: true,
        package_root_path: Some(temp.path().to_string_lossy().to_string()),
        worker_entrypoint: Some("./worker.mjs".to_string()),
        output_artifact_kind: Some(CONTENT_FACTORY_WORKSPACE_PATCH_KIND.to_string()),
        ..PluginTaskRuntimeContract::default()
    };

    let core = RuntimeCore::default();
    let events = core
        .run_plugin_worker(
            PluginWorkerRunRequest::new(
                temp.path(),
                contract,
                json!({
                    "appId": "content-factory-app",
                    "sessionId": "session-stdin-eof"
                }),
            )
            .with_timeout_ms(1_000),
        )
        .expect("stdin eof worker events");

    assert_eq!(events.len(), 1);
    assert_eq!(
        events[0].payload["artifact"]["artifactId"],
        "stdin-eof:workspace-patch"
    );
    assert!(!node.is_empty());
}

fn fixture_root() -> Option<PathBuf> {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../..")
        .join("src/features/plugin/testing/fixtures");
    root.join("src/runtime/content-factory-worker.mjs")
        .is_file()
        .then_some(root)
}

fn node_available() -> Option<String> {
    let node = node_binary();
    Command::new(&node)
        .arg("--version")
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|_| node)
}
