use super::RuntimeCore;
use super::RuntimeCoreError;
use super::RuntimeEvent;
use app_server_protocol::AgentAppTaskRuntimeContract;
use serde_json::json;
use serde_json::Map;
use serde_json::Value;
use std::io::Write;
use std::path::Path;
use std::path::PathBuf;
use std::process::Command;
use std::process::Stdio;
use std::time::Duration;
use std::time::Instant;

const DEFAULT_WORKER_TIMEOUT_MS: u64 = 30_000;
const MAX_WORKER_STDOUT_BYTES: usize = 2 * 1024 * 1024;
const CONTENT_FACTORY_WORKSPACE_PATCH_KIND: &str = "content_factory.workspace_patch";

#[derive(Debug, Clone)]
pub(super) struct AgentAppWorkerRunRequest {
    pub package_root: PathBuf,
    pub task_runtime: AgentAppTaskRuntimeContract,
    pub request: Value,
    pub timeout_ms: u64,
}

impl AgentAppWorkerRunRequest {
    pub(super) fn new(
        package_root: impl Into<PathBuf>,
        task_runtime: AgentAppTaskRuntimeContract,
        request: Value,
    ) -> Self {
        Self {
            package_root: package_root.into(),
            task_runtime,
            request,
            timeout_ms: DEFAULT_WORKER_TIMEOUT_MS,
        }
    }

    #[cfg(test)]
    fn with_timeout_ms(mut self, timeout_ms: u64) -> Self {
        self.timeout_ms = timeout_ms;
        self
    }
}

impl RuntimeCore {
    pub(in crate::runtime) fn run_agent_app_worker(
        &self,
        request: AgentAppWorkerRunRequest,
    ) -> Result<Vec<RuntimeEvent>, RuntimeCoreError> {
        validate_task_runtime(&request.task_runtime)?;
        let entrypoint = resolve_worker_entrypoint(
            &request.package_root,
            request.task_runtime.worker_entrypoint.as_deref(),
        )?;
        let node = node_binary();
        let output = invoke_worker_process(
            &node,
            &request.package_root,
            &entrypoint,
            &request.request,
            request.timeout_ms,
        )?;
        worker_response_to_runtime_events(
            output,
            &request.request,
            &request.task_runtime,
            self.sidecar_store.is_some(),
        )
    }
}

fn validate_task_runtime(contract: &AgentAppTaskRuntimeContract) -> Result<(), RuntimeCoreError> {
    if !contract.enabled {
        return Err(RuntimeCoreError::Backend(
            "Agent App worker runtime is not enabled.".to_string(),
        ));
    }
    if !contract.blockers.is_empty() {
        return Err(RuntimeCoreError::Backend(format!(
            "Agent App worker runtime has blockers: {}",
            contract.blockers.join(", ")
        )));
    }
    if contract.direct_provider_access {
        return Err(RuntimeCoreError::Backend(
            "Agent App worker direct provider access is unsupported.".to_string(),
        ));
    }
    if contract.direct_filesystem_access {
        return Err(RuntimeCoreError::Backend(
            "Agent App worker direct filesystem access is unsupported.".to_string(),
        ));
    }
    if contract.output_artifact_kind.as_deref() != Some(CONTENT_FACTORY_WORKSPACE_PATCH_KIND) {
        return Err(RuntimeCoreError::Backend(
            "Agent App worker output artifact kind is unsupported.".to_string(),
        ));
    }
    Ok(())
}

fn resolve_worker_entrypoint(
    package_root: &Path,
    entrypoint: Option<&str>,
) -> Result<PathBuf, RuntimeCoreError> {
    let entrypoint = entrypoint
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            RuntimeCoreError::Backend("Agent App worker entrypoint is missing.".to_string())
        })?;
    if entrypoint.starts_with("http://")
        || entrypoint.starts_with("https://")
        || entrypoint.contains("..")
    {
        return Err(RuntimeCoreError::Backend(
            "Agent App worker entrypoint must be a package-relative file path.".to_string(),
        ));
    }
    let path = package_root.join(entrypoint.trim_start_matches("./"));
    if !path.is_file() {
        return Err(RuntimeCoreError::Backend(format!(
            "Agent App worker entrypoint was not found: {}",
            path.display()
        )));
    }
    Ok(path)
}

fn node_binary() -> String {
    std::env::var("NODE").unwrap_or_else(|_| {
        if cfg!(windows) {
            "node.exe".to_string()
        } else {
            "node".to_string()
        }
    })
}

fn invoke_worker_process(
    node: &str,
    package_root: &Path,
    entrypoint: &Path,
    request: &Value,
    timeout_ms: u64,
) -> Result<Value, RuntimeCoreError> {
    let mut command = Command::new(node);
    command
        .arg(entrypoint)
        .current_dir(package_root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    for key in inherited_agent_app_secret_env_keys() {
        command.env_remove(key);
    }

    let mut child = command.spawn().map_err(|error| {
        RuntimeCoreError::Backend(format!("failed to spawn Agent App worker: {error}"))
    })?;
    write_worker_request(child.stdin.take(), request)?;
    let started = Instant::now();
    let timeout = Duration::from_millis(timeout_ms);
    loop {
        if started.elapsed() > timeout {
            let _ = child.kill();
            return Err(RuntimeCoreError::Backend(format!(
                "Agent App worker timed out after {timeout_ms}ms"
            )));
        }
        match child.try_wait() {
            Ok(Some(_status)) => {
                let output = child.wait_with_output().map_err(|error| {
                    RuntimeCoreError::Backend(format!(
                        "failed to collect Agent App worker output: {error}"
                    ))
                })?;
                if !output.status.success() {
                    return Err(RuntimeCoreError::Backend(format!(
                        "Agent App worker exited with {}: {}",
                        output.status,
                        String::from_utf8_lossy(&output.stderr).trim()
                    )));
                }
                if output.stdout.len() > MAX_WORKER_STDOUT_BYTES {
                    return Err(RuntimeCoreError::Backend(
                        "Agent App worker stdout exceeded the size limit.".to_string(),
                    ));
                }
                return decode_worker_stdout(&output.stdout);
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(10)),
            Err(error) => {
                return Err(RuntimeCoreError::Backend(format!(
                    "failed to poll Agent App worker: {error}"
                )));
            }
        }
    }
}

fn write_worker_request(
    stdin: Option<std::process::ChildStdin>,
    request: &Value,
) -> Result<(), RuntimeCoreError> {
    let mut stdin = stdin.ok_or_else(|| {
        RuntimeCoreError::Backend("Agent App worker stdin is unavailable.".to_string())
    })?;
    let input = serde_json::to_vec(request).map_err(|error| {
        RuntimeCoreError::Backend(format!(
            "failed to encode Agent App worker request: {error}"
        ))
    })?;
    stdin.write_all(&input).map_err(|error| {
        RuntimeCoreError::Backend(format!("failed to write Agent App worker request: {error}"))
    })?;
    stdin.write_all(b"\n").map_err(|error| {
        RuntimeCoreError::Backend(format!(
            "failed to finish Agent App worker request: {error}"
        ))
    })?;
    Ok(())
}

fn decode_worker_stdout(stdout: &[u8]) -> Result<Value, RuntimeCoreError> {
    let text = std::str::from_utf8(stdout).map_err(|error| {
        RuntimeCoreError::Backend(format!("Agent App worker stdout must be UTF-8: {error}"))
    })?;
    let line = text
        .lines()
        .find(|line| !line.trim().is_empty())
        .ok_or_else(|| {
            RuntimeCoreError::Backend("Agent App worker returned empty stdout.".to_string())
        })?;
    serde_json::from_str(line).map_err(|error| {
        RuntimeCoreError::Backend(format!(
            "failed to decode Agent App worker response: {error}"
        ))
    })
}

fn worker_response_to_runtime_events(
    response: Value,
    request: &Value,
    task_runtime: &AgentAppTaskRuntimeContract,
    persist_inline_artifact_content: bool,
) -> Result<Vec<RuntimeEvent>, RuntimeCoreError> {
    if response.get("status").and_then(Value::as_str) != Some("completed") {
        return Err(RuntimeCoreError::Backend(format!(
            "Agent App worker did not complete: {}",
            response
                .pointer("/error/code")
                .and_then(Value::as_str)
                .unwrap_or("WORKER_FAILED")
        )));
    }
    let artifacts = response
        .get("artifacts")
        .and_then(Value::as_array)
        .ok_or_else(|| {
            RuntimeCoreError::Backend("Agent App worker response missing artifacts.".to_string())
        })?;
    let mut events = Vec::new();
    for artifact in artifacts {
        if artifact.get("kind").and_then(Value::as_str) != Some("artifact.snapshot") {
            continue;
        }
        let mut artifact = artifact.clone();
        attach_worker_metadata(&mut artifact, request, task_runtime);
        if !persist_inline_artifact_content {
            remove_inline_artifact_content(&mut artifact);
        }
        events.push(RuntimeEvent::new(
            "artifact.snapshot",
            json!({
                "artifact": artifact
            }),
        ));
    }
    if events.is_empty() {
        return Err(RuntimeCoreError::Backend(
            "Agent App worker response did not include artifact.snapshot.".to_string(),
        ));
    }
    Ok(events)
}

fn remove_inline_artifact_content(artifact: &mut Value) {
    if let Some(object) = artifact.as_object_mut() {
        object.remove("content");
        object.remove("generatedContent");
        object.remove("generated_content");
    }
}

fn attach_worker_metadata(
    artifact: &mut Value,
    request: &Value,
    task_runtime: &AgentAppTaskRuntimeContract,
) {
    let metadata = ensure_object_field(artifact, "metadata");
    if metadata.get("agentAppWorker").is_some() {
        return;
    }
    let workspace_patch = metadata
        .get("contentFactoryWorkspacePatch")
        .or_else(|| metadata.get("workspace_patch"));
    let output_object_count = workspace_patch
        .and_then(|patch| patch.get("objects"))
        .and_then(Value::as_array)
        .and_then(|objects| u64::try_from(objects.len()).ok());
    let output_summary = output_object_count.map(|count| format!("{count} product objects"));
    metadata.insert(
        "agentAppWorker".to_string(),
        json!({
            "appId": string_field(request, &["appId", "app_id"]),
            "taskId": string_field(request, &["taskId", "task_id"]),
            "taskKind": string_field(request, &["taskKind", "task_kind"]),
            "turnId": string_field(request, &["turnId", "turn_id"]),
            "status": "completed",
            "workerEntrypoint": task_runtime.worker_entrypoint.as_deref(),
            "inputSummary": string_field(request, &["prompt"])
                .map(|prompt| format!("prompt={}", truncate_chars(&prompt, 80))),
            "outputSummary": output_summary,
            "outputObjectCount": output_object_count,
            "outputArtifactKind": task_runtime.output_artifact_kind.as_deref(),
        }),
    );
}

fn ensure_object_field<'a>(value: &'a mut Value, key: &str) -> &'a mut Map<String, Value> {
    if !value.is_object() {
        *value = Value::Object(Map::new());
    }
    let object = value.as_object_mut().expect("value is object");
    let entry = object
        .entry(key.to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    if !entry.is_object() {
        *entry = Value::Object(Map::new());
    }
    entry.as_object_mut().expect("field is object")
}

fn truncate_chars(value: &str, max_chars: usize) -> String {
    let mut result = String::new();
    for (index, ch) in value.chars().enumerate() {
        if index >= max_chars {
            result.push_str("...");
            break;
        }
        result.push(ch);
    }
    result
}

fn string_field(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .filter_map(|key| value.get(*key))
        .find_map(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn inherited_agent_app_secret_env_keys() -> &'static [&'static str] {
    &[
        "LIME_ACCESS_TOKEN",
        "OPENAI_API_KEY",
        "ANTHROPIC_API_KEY",
        "ANTHROPIC_AUTH_TOKEN",
        "GEMINI_API_KEY",
        "GOOGLE_API_KEY",
        "DEEPSEEK_API_KEY",
        "OPENROUTER_API_KEY",
        "MISTRAL_API_KEY",
        "XAI_API_KEY",
        "DASHSCOPE_API_KEY",
        "MOONSHOT_API_KEY",
        "ZHIPUAI_API_KEY",
        "GROQ_API_KEY",
        "FAL_KEY",
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime::agent_app_task_runtime::build_agent_app_task_runtime_contract;
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
    use std::sync::Arc;

    #[test]
    fn worker_adapter_runs_skeleton_and_projects_artifact_snapshot() {
        let Some(fixture_root) = fixture_root() else {
            return;
        };
        let sample_request: Value = serde_json::from_str(
            &fs::read_to_string(fixture_root.join("examples/runtime-request.sample.json"))
                .expect("sample request"),
        )
        .expect("sample json");
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
        let contract = build_agent_app_task_runtime_contract(&state, Some(&fixture_root));

        let core = RuntimeCore::default();
        let events = core
            .run_agent_app_worker(AgentAppWorkerRunRequest::new(
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
            events[0].payload["artifact"]["metadata"]["agentAppWorker"]["taskKind"],
            "content.image.generate"
        );
        assert_eq!(
            events[0].payload["artifact"]["metadata"]["agentAppWorker"]["outputArtifactKind"],
            CONTENT_FACTORY_WORKSPACE_PATCH_KIND
        );
        assert!(events[0].payload["artifact"]["content"].is_null());
    }

    #[tokio::test]
    async fn worker_adapter_events_materialize_in_session_read_model() {
        let Some(fixture_root) = fixture_root() else {
            return;
        };
        let sample_request: Value = serde_json::from_str(
            &fs::read_to_string(fixture_root.join("examples/runtime-request.sample.json"))
                .expect("sample request"),
        )
        .expect("sample json");
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
        let contract = build_agent_app_task_runtime_contract(&state, Some(&fixture_root));
        let core = RuntimeCore::default();
        let runtime_events = core
            .run_agent_app_worker(AgentAppWorkerRunRequest::new(
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
            detail["product_workspace"]["selectedObjectRef"]["kind"],
            "imageGenerationSet"
        );
        let image_object = detail["product_workspace"]["objects"]
            .as_array()
            .expect("product workspace objects")
            .iter()
            .find(|object| object["ref"]["kind"] == "imageGenerationSet")
            .expect("image generation object");
        assert_eq!(image_object["summary"], "Regenerated 2 image candidates.");
        assert_eq!(
            detail["product_workspace"]["workerEvidence"][0]["artifactKind"],
            CONTENT_FACTORY_WORKSPACE_PATCH_KIND
        );
    }

    #[tokio::test]
    async fn worker_adapter_persists_worker_artifact_content_to_sidecar() {
        let Some(fixture_root) = fixture_root() else {
            return;
        };
        let sample_request: Value = serde_json::from_str(
            &fs::read_to_string(fixture_root.join("examples/runtime-request.sample.json"))
                .expect("sample request"),
        )
        .expect("sample json");
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
        let contract = build_agent_app_task_runtime_contract(&state, Some(&fixture_root));
        let sidecar_root = tempfile::tempdir().expect("sidecar root");
        let core = RuntimeCore::default().with_sidecar_store(Arc::new(
            SidecarStore::new(sidecar_root.path()).expect("sidecar store"),
        ));
        let runtime_events = core
            .run_agent_app_worker(AgentAppWorkerRunRequest::new(
                fixture_root,
                contract,
                sample_request,
            ))
            .expect("worker events");
        assert!(runtime_events[0].payload["artifact"]["content"]
            .as_str()
            .is_some_and(|content| content.contains("product-workspace.v1")));
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
        assert!(content.contains("product-workspace.v1"));
        assert!(content.contains("Regenerated 2 image candidates."));
        assert!(artifact_read.artifacts[0]
            .metadata
            .as_ref()
            .and_then(|metadata| metadata.get("sidecarRef"))
            .is_some());
    }

    #[test]
    fn worker_adapter_rejects_runtime_blockers() {
        let temp = tempfile::tempdir().expect("temp dir");
        let contract = AgentAppTaskRuntimeContract {
            enabled: true,
            package_root_path: Some(temp.path().to_string_lossy().to_string()),
            worker_entrypoint: Some("./worker.mjs".to_string()),
            output_artifact_kind: Some(CONTENT_FACTORY_WORKSPACE_PATCH_KIND.to_string()),
            blockers: vec!["TASK_RUNTIME_WORKER_ENTRYPOINT_NOT_FOUND".to_string()],
            ..AgentAppTaskRuntimeContract::default()
        };

        let core = RuntimeCore::default();
        let error = core
            .run_agent_app_worker(AgentAppWorkerRunRequest::new(
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
        let contract = AgentAppTaskRuntimeContract {
            enabled: true,
            package_root_path: Some(temp.path().to_string_lossy().to_string()),
            worker_entrypoint: Some("./worker.mjs".to_string()),
            output_artifact_kind: Some(CONTENT_FACTORY_WORKSPACE_PATCH_KIND.to_string()),
            ..AgentAppTaskRuntimeContract::default()
        };

        let core = RuntimeCore::default();
        let error = core
            .run_agent_app_worker(
                AgentAppWorkerRunRequest::new(temp.path(), contract, json!({}))
                    .with_timeout_ms(100),
            )
            .expect_err("timeout");

        assert!(error.to_string().contains("timed out"), "{error}");
        assert!(!node.is_empty());
    }

    fn fixture_root() -> Option<PathBuf> {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../..")
            .join("src/features/agent-app/fixtures");
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
}
