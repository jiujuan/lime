use super::support::*;
use super::*;
use std::fs;
use std::path::Path;
use std::process::Command;
use std::sync::Arc;

#[tokio::test]
async fn product_profile_turn_runs_installed_worker_and_materializes_workspace_patch() {
    let Some(fixture_root) = content_factory_fixture_root() else {
        return;
    };
    let installed_state = content_factory_installed_state(&fixture_root);
    let data_source = TestSessionDataSource::new(empty_agent_session_read_response("unused"))
        .with_agent_app_installed_states(vec![installed_state]);
    let core = RuntimeCore::default().with_app_data_source(Arc::new(data_source));
    let session = core
        .start_session(AgentSessionStartParams {
            session_id: Some("session-content-factory".to_string()),
            thread_id: Some("thread-content-factory".to_string()),
            app_id: "content-factory-app".to_string(),
            workspace_id: Some("workspace-main".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session")
        .session;

    let output = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: session.session_id.clone(),
                turn_id: Some("turn-product-profile-action".to_string()),
                input: AgentInput {
                    text: "重新生成配图".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: Some(RuntimeOptions {
                    metadata: Some(product_profile_action_metadata()),
                    ..RuntimeOptions::default()
                }),
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("product profile worker turn");

    assert_eq!(output.response.turn.status, AgentTurnStatus::Completed);
    let event_types = output
        .events
        .iter()
        .map(|event| event.event_type.as_str())
        .collect::<Vec<_>>();
    assert_eq!(
        event_types,
        vec![
            "message.created",
            "turn.accepted",
            "artifact.snapshot",
            "turn.completed"
        ]
    );

    let read = core
        .read_session(AgentSessionReadParams {
            session_id: session.session_id,
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read session");
    let detail = read.detail.expect("detail");
    assert_eq!(
        detail["product_workspace"]["selectedObjectRef"]["kind"],
        "imageGenerationSet"
    );
    let action_history = detail["thread_read"]["product_profile_actions"]
        .as_array()
        .expect("action history");
    assert_eq!(action_history[0]["status"], "completed");
    assert_eq!(
        detail["product_workspace"]["workerEvidence"][0]["artifactKind"],
        "content_factory.workspace_patch"
    );
    let article = detail["product_workspace"]["objects"]
        .as_array()
        .expect("product objects")
        .iter()
        .find(|object| object["ref"]["kind"] == "articleDraft")
        .expect("article object");
    assert_eq!(article["title"], "公众号文章草稿");
    assert!(article["source"]["markdown"]
        .as_str()
        .expect("article markdown")
        .contains("点击小框后展开右侧 Product Profile"));
}

#[tokio::test]
async fn product_profile_worker_blocks_cloud_release_without_verified_signature_evidence() {
    let installed_state = cloud_release_installed_state_with_evidence(json!({
        "status": "blocked",
        "signaturePolicy": "required",
        "signatureVerificationStatus": "declared",
        "packageHashMatched": true,
        "manifestHashMatched": true,
        "packageVerificationStatus": "verified"
    }));
    let data_source = TestSessionDataSource::new(empty_agent_session_read_response("unused"))
        .with_agent_app_installed_states(vec![installed_state]);
    let core = RuntimeCore::default().with_app_data_source(Arc::new(data_source));
    let session = core
        .start_session(AgentSessionStartParams {
            session_id: Some("session-content-factory-signature-gate".to_string()),
            thread_id: Some("thread-content-factory-signature-gate".to_string()),
            app_id: "content-factory-app".to_string(),
            workspace_id: Some("workspace-main".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session")
        .session;

    let output = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: session.session_id,
                turn_id: Some("turn-product-profile-signature-gate".to_string()),
                input: AgentInput {
                    text: "重新生成配图".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: Some(RuntimeOptions {
                    metadata: Some(product_profile_action_metadata()),
                    ..RuntimeOptions::default()
                }),
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("product profile worker signature gate turn");

    assert_eq!(output.response.turn.status, AgentTurnStatus::Failed);
    let event_types = output
        .events
        .iter()
        .map(|event| event.event_type.as_str())
        .collect::<Vec<_>>();
    assert_eq!(
        event_types,
        vec![
            "message.created",
            "turn.accepted",
            "runtime.error",
            "turn.failed"
        ]
    );
    let runtime_error = output
        .events
        .iter()
        .find(|event| event.event_type == "runtime.error")
        .expect("runtime error");
    assert_eq!(
        runtime_error.payload["errorCode"],
        "AGENT_APP_WORKER_PACKAGE_SIGNATURE_UNVERIFIED"
    );
    assert_eq!(runtime_error.payload["failureCategory"], "configuration");
    assert_eq!(
        runtime_error.payload["retryAdvice"],
        "reinstall_verified_package"
    );
    assert_eq!(runtime_error.payload["retryable"], false);
}

#[tokio::test]
async fn product_profile_worker_fails_closed_for_unauthorized_output_artifact_kind() {
    let core = RuntimeCore::default();
    let session = core
        .start_session(AgentSessionStartParams {
            session_id: Some("session-content-factory-output-auth".to_string()),
            thread_id: Some("thread-content-factory-output-auth".to_string()),
            app_id: "content-factory-app".to_string(),
            workspace_id: Some("workspace-main".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session")
        .session;

    let output = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: session.session_id,
                turn_id: Some("turn-product-profile-output-auth".to_string()),
                input: AgentInput {
                    text: "重新生成配图".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: Some(RuntimeOptions {
                    metadata: Some(product_profile_action_metadata_with_output_kind(
                        "creator.workspace_patch",
                    )),
                    ..RuntimeOptions::default()
                }),
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("product profile worker unauthorized output turn");

    assert_eq!(output.response.turn.status, AgentTurnStatus::Failed);
    let event_types = output
        .events
        .iter()
        .map(|event| event.event_type.as_str())
        .collect::<Vec<_>>();
    assert_eq!(
        event_types,
        vec![
            "message.created",
            "turn.accepted",
            "runtime.error",
            "turn.failed"
        ]
    );
    let accepted = output
        .events
        .iter()
        .find(|event| event.event_type == "turn.accepted")
        .expect("accepted event");
    assert_eq!(accepted.payload["authorization"], "denied");
    assert_eq!(
        accepted.payload["reasonCode"],
        "AGENT_APP_WORKER_OUTPUT_UNAUTHORIZED"
    );

    let runtime_error = output
        .events
        .iter()
        .find(|event| event.event_type == "runtime.error")
        .expect("runtime error");
    assert_eq!(
        runtime_error.payload["errorCode"],
        "AGENT_APP_WORKER_OUTPUT_UNAUTHORIZED"
    );
    assert_eq!(
        runtime_error.payload["outputArtifactKind"],
        "creator.workspace_patch"
    );
    assert_eq!(runtime_error.payload["failureCategory"], "configuration");
    assert_eq!(runtime_error.payload["retryable"], false);
}

#[tokio::test]
async fn product_profile_worker_fails_closed_when_output_artifact_kind_is_missing() {
    let core = RuntimeCore::default();
    let session = core
        .start_session(AgentSessionStartParams {
            session_id: Some("session-content-factory-output-missing".to_string()),
            thread_id: Some("thread-content-factory-output-missing".to_string()),
            app_id: "content-factory-app".to_string(),
            workspace_id: Some("workspace-main".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session")
        .session;

    let output = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: session.session_id,
                turn_id: Some("turn-product-profile-output-missing".to_string()),
                input: AgentInput {
                    text: "重新生成配图".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: Some(RuntimeOptions {
                    metadata: Some(product_profile_action_metadata_without_output_kind()),
                    ..RuntimeOptions::default()
                }),
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("product profile worker missing output turn");

    assert_eq!(output.response.turn.status, AgentTurnStatus::Failed);
    let runtime_error = output
        .events
        .iter()
        .find(|event| event.event_type == "runtime.error")
        .expect("runtime error");
    assert_eq!(
        runtime_error.payload["errorCode"],
        "AGENT_APP_WORKER_OUTPUT_UNAUTHORIZED"
    );
    assert!(runtime_error.payload["outputArtifactKind"].is_null());
    assert_eq!(runtime_error.payload["retryable"], false);
}

#[tokio::test]
async fn product_profile_worker_retries_retryable_failure_and_completes() {
    if !node_available() {
        return;
    }
    let temp = tempfile::tempdir().expect("temp worker package");
    fs::write(temp.path().join("worker.mjs"), RETRY_THEN_COMPLETE_WORKER).expect("worker script");
    let installed_state = retry_worker_installed_state(temp.path());
    let data_source = TestSessionDataSource::new(empty_agent_session_read_response("unused"))
        .with_agent_app_installed_states(vec![installed_state]);
    let core = RuntimeCore::default().with_app_data_source(Arc::new(data_source));
    let session = core
        .start_session(AgentSessionStartParams {
            session_id: Some("session-content-factory-retry".to_string()),
            thread_id: Some("thread-content-factory-retry".to_string()),
            app_id: "content-factory-app".to_string(),
            workspace_id: Some("workspace-main".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session")
        .session;

    let output = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: session.session_id.clone(),
                turn_id: Some("turn-product-profile-retry".to_string()),
                input: AgentInput {
                    text: "重新生成配图".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: Some(RuntimeOptions {
                    metadata: Some(product_profile_action_metadata()),
                    ..RuntimeOptions::default()
                }),
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("product profile worker retry turn");

    assert_eq!(output.response.turn.status, AgentTurnStatus::Completed);
    let event_types = output
        .events
        .iter()
        .map(|event| event.event_type.as_str())
        .collect::<Vec<_>>();
    assert_eq!(
        event_types,
        vec![
            "message.created",
            "turn.accepted",
            "agent_app_worker.retry",
            "artifact.snapshot",
            "turn.completed"
        ]
    );
    let retry_event = output
        .events
        .iter()
        .find(|event| event.event_type == "agent_app_worker.retry")
        .expect("retry event");
    assert_eq!(
        retry_event.payload["errorCode"],
        "AGENT_APP_WORKER_RETRYABLE_FAILURE"
    );
    assert_eq!(retry_event.payload["retryAttempt"], 0);
    assert_eq!(retry_event.payload["retryMaxAttempts"], 1);

    let read = core
        .read_session(AgentSessionReadParams {
            session_id: session.session_id,
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read session");
    let detail = read.detail.expect("detail");
    assert_eq!(
        detail["product_workspace"]["selectedObjectRef"]["kind"],
        "imageGenerationSet"
    );
    let evidence = detail["product_workspace"]["workerEvidence"]
        .as_array()
        .expect("worker evidence");
    assert_eq!(evidence.len(), 2);
    assert_eq!(evidence[0]["eventType"], "agent_app_worker.retry");
    assert_eq!(evidence[0]["status"], "failed");
    assert_eq!(evidence[0]["retryAttempt"], 0);
    assert_eq!(evidence[0]["retryMaxAttempts"], 1);
    assert_eq!(evidence[1]["eventType"], "artifact.snapshot");
    assert_eq!(evidence[1]["status"], "completed");

    let action_history = detail["thread_read"]["product_profile_actions"]
        .as_array()
        .expect("action history");
    assert_eq!(action_history[0]["status"], "completed");
}

#[tokio::test]
async fn product_profile_worker_stops_after_retry_budget_is_exhausted() {
    if !node_available() {
        return;
    }
    let temp = tempfile::tempdir().expect("temp worker package");
    fs::write(
        temp.path().join("worker.mjs"),
        ALWAYS_RETRYABLE_FAILURE_WORKER,
    )
    .expect("worker script");
    let installed_state = retry_worker_installed_state(temp.path());
    let data_source = TestSessionDataSource::new(empty_agent_session_read_response("unused"))
        .with_agent_app_installed_states(vec![installed_state]);
    let core = RuntimeCore::default().with_app_data_source(Arc::new(data_source));
    let session = core
        .start_session(AgentSessionStartParams {
            session_id: Some("session-content-factory-retry-failed".to_string()),
            thread_id: Some("thread-content-factory-retry-failed".to_string()),
            app_id: "content-factory-app".to_string(),
            workspace_id: Some("workspace-main".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session")
        .session;

    let output = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: session.session_id,
                turn_id: Some("turn-product-profile-retry-failed".to_string()),
                input: AgentInput {
                    text: "重新生成配图".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: Some(RuntimeOptions {
                    metadata: Some(product_profile_action_metadata()),
                    ..RuntimeOptions::default()
                }),
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("product profile worker exhausted retry turn");

    assert_eq!(output.response.turn.status, AgentTurnStatus::Failed);
    let event_types = output
        .events
        .iter()
        .map(|event| event.event_type.as_str())
        .collect::<Vec<_>>();
    assert_eq!(
        event_types,
        vec![
            "message.created",
            "turn.accepted",
            "agent_app_worker.retry",
            "runtime.error",
            "turn.failed"
        ]
    );
    let runtime_error = output
        .events
        .iter()
        .find(|event| event.event_type == "runtime.error")
        .expect("runtime error");
    assert_eq!(runtime_error.payload["retryAttempt"], 1);
    assert_eq!(runtime_error.payload["retryMaxAttempts"], 1);
    assert_eq!(
        runtime_error.payload["errorCode"],
        "AGENT_APP_WORKER_RETRYABLE_FAILURE"
    );
}

fn content_factory_fixture_root() -> Option<std::path::PathBuf> {
    let root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../..")
        .join("src/features/agent-app/fixtures");
    root.join("src/runtime/content-factory-worker.mjs")
        .is_file()
        .then_some(root)
}

fn content_factory_installed_state(fixture_root: &std::path::Path) -> serde_json::Value {
    let manifest: serde_json::Value = serde_json::from_str(
        &std::fs::read_to_string(fixture_root.join("content-factory-app.json"))
            .expect("content factory manifest"),
    )
    .expect("manifest json");
    json!({
        "schemaVersion": "agent-app.installed-state.v1",
        "appId": "content-factory-app",
        "installMode": "runtime_backed",
        "disabled": false,
        "identity": {
            "appId": "content-factory-app",
            "sourceKind": "local_folder",
            "sourceUri": fixture_root.to_string_lossy(),
            "packageHash": "sha256:test-package",
            "manifestHash": "sha256:test-manifest"
        },
        "manifest": manifest,
    })
}

fn retry_worker_installed_state(package_root: &Path) -> serde_json::Value {
    json!({
        "schemaVersion": "agent-app.installed-state.v1",
        "appId": "content-factory-app",
        "installMode": "runtime_backed",
        "disabled": false,
        "identity": {
            "appId": "content-factory-app",
            "sourceKind": "local_folder",
            "sourceUri": package_root.to_string_lossy(),
            "packageHash": "sha256:test-package",
            "manifestHash": "sha256:test-manifest"
        },
        "manifest": {
            "runtimePackage": {
                "worker": {
                    "entrypoint": "./worker.mjs",
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
        },
    })
}

fn cloud_release_installed_state_with_evidence(evidence: serde_json::Value) -> serde_json::Value {
    json!({
        "schemaVersion": "agent-app.installed-state.v1",
        "appId": "content-factory-app",
        "installMode": "runtime_backed",
        "disabled": false,
        "identity": {
            "appId": "content-factory-app",
            "sourceKind": "cloud_release",
            "sourceUri": "https://lime.local/agent-apps/content-factory-app/releases/0.3.0/package.zip",
            "packageHash": "sha256:test-package",
            "manifestHash": "sha256:test-manifest"
        },
        "setup": {
            "cloudReleaseEvidence": evidence
        },
        "manifest": {
            "runtimePackage": {
                "worker": {
                    "entrypoint": "./worker.mjs",
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
        },
    })
}

fn node_available() -> bool {
    let node = std::env::var("NODE").unwrap_or_else(|_| {
        if cfg!(windows) {
            "node.exe".to_string()
        } else {
            "node".to_string()
        }
    });
    Command::new(node)
        .arg("--version")
        .output()
        .is_ok_and(|output| output.status.success())
}

fn product_profile_action_metadata() -> serde_json::Value {
    json!({
        "agent_app": {
            "source": "right_surface_product_profile",
            "app_id": "content-factory-app",
            "session_id": "session-content-factory",
            "workspace_id": "workspace-main",
            "product_profile_action": {
                "key": "regenerate",
                "intent": "regenerate",
                "risk": "write",
                "task_kind": "content.image.generate",
                "output_artifact_kind": "content_factory.workspace_patch",
                "prompt": "Regenerate the image set with two candidate images.",
                "object": {
                    "app_id": "content-factory-app",
                    "kind": "imageGenerationSet",
                    "id": "image-set-1",
                    "session_id": "session-content-factory",
                    "artifact_ids": ["artifact-image-set-1"],
                    "preview_artifact_id": "artifact-image-set-1"
                }
            }
        },
        "right_surface": {
            "surface_kind": "productProfile",
            "source": "product_workspace",
            "action_key": "regenerate"
        }
    })
}

fn product_profile_action_metadata_with_output_kind(
    output_artifact_kind: &str,
) -> serde_json::Value {
    let mut metadata = product_profile_action_metadata();
    metadata["agent_app"]["product_profile_action"]["output_artifact_kind"] =
        json!(output_artifact_kind);
    metadata
}

fn product_profile_action_metadata_without_output_kind() -> serde_json::Value {
    let mut metadata = product_profile_action_metadata();
    if let Some(action) = metadata["agent_app"]["product_profile_action"].as_object_mut() {
        action.remove("output_artifact_kind");
    }
    metadata
}

const RETRY_THEN_COMPLETE_WORKER: &str = r#"
import fs from 'node:fs';

let input = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) {
  input += chunk;
}
const request = JSON.parse(input);
const marker = './attempt.txt';
const attempt = fs.existsSync(marker) ? Number(fs.readFileSync(marker, 'utf8')) : 0;
fs.writeFileSync(marker, String(attempt + 1));

if (attempt === 0) {
  console.log(JSON.stringify({
    status: 'failed',
    error: { code: 'WORKER_RETRYABLE' }
  }));
  process.exit(0);
}

const objectRef = {
  appId: request.appId,
  kind: 'imageGenerationSet',
  id: 'image-set-retry',
  sessionId: request.sessionId,
  artifactIds: ['artifact-image-set-retry'],
  sourceTurnId: request.turnId,
  sourceTaskId: request.taskId
};
const patch = {
  schemaVersion: 'product-workspace.v1',
  appId: request.appId,
  sessionId: request.sessionId,
  workspaceId: request.workspaceId,
  selectedObjectRef: objectRef,
  objects: [
    {
      ref: objectRef,
      title: 'Retry image set',
      status: 'ready',
      summary: 'Retried successfully.',
      previewArtifactId: 'artifact-image-set-retry',
      source: {
        taskKind: request.taskKind,
        taskId: request.taskId,
        turnId: request.turnId,
        artifactIds: ['artifact-image-set-retry']
      }
    }
  ]
};
console.log(JSON.stringify({
  status: 'completed',
  artifacts: [
    {
      kind: 'artifact.snapshot',
      artifactId: `${request.taskId}:workspace-patch`,
      path: '.lime/artifacts/retry-workspace-patch.json',
      title: 'Retry workspace patch',
      metadata: {
        kind: 'content_factory.workspace_patch',
        contentFactoryWorkspacePatch: patch
      },
      content: JSON.stringify(patch)
    }
  ]
}));
"#;

const ALWAYS_RETRYABLE_FAILURE_WORKER: &str = r#"
console.log(JSON.stringify({
  status: 'failed',
  error: { code: 'WORKER_RETRYABLE' }
}));
"#;
