use super::RuntimeCore;
use super::RuntimeCoreError;
use super::RuntimeEvent;
use crate::runtime::agent_app_worker_workflow::runtime_event_from_worker_progress_envelope;
use app_server_protocol::AgentAppTaskRuntimeContract;
use serde_json::json;
use serde_json::Map;
use serde_json::Value;
use std::io::BufRead;
use std::io::BufReader;
use std::io::Read;
use std::io::Write;
use std::path::Path;
use std::path::PathBuf;
use std::process::Command;
use std::process::Stdio;
use std::sync::mpsc;
use std::sync::mpsc::Receiver;
use std::thread::JoinHandle;
use std::time::Duration;
use std::time::Instant;

const DEFAULT_WORKER_TIMEOUT_MS: u64 = 30_000;
const DEFAULT_HOOK_TIMEOUT_MS: u64 = 5_000;
const MAX_WORKER_STDOUT_BYTES: usize = 2 * 1024 * 1024;
const MAX_WORKER_STDERR_BYTES: usize = 512 * 1024;
const CONTENT_FACTORY_WORKSPACE_PATCH_KIND: &str = "content_factory.workspace_patch";

#[derive(Debug, Clone)]
pub(super) struct AgentAppWorkerRunRequest {
    pub package_root: PathBuf,
    pub task_runtime: AgentAppTaskRuntimeContract,
    pub request: Value,
    pub timeout_ms: u64,
}

#[derive(Debug, Clone)]
pub(super) struct AgentAppHookRunRequest {
    pub package_root: PathBuf,
    pub hook_entrypoint: String,
    pub request: Value,
    pub timeout_ms: u64,
}

impl AgentAppHookRunRequest {
    pub(super) fn new(
        package_root: impl Into<PathBuf>,
        hook_entrypoint: impl Into<String>,
        request: Value,
    ) -> Self {
        Self {
            package_root: package_root.into(),
            hook_entrypoint: hook_entrypoint.into(),
            request,
            timeout_ms: DEFAULT_HOOK_TIMEOUT_MS,
        }
    }
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
    #[cfg(test)]
    pub(in crate::runtime) fn run_agent_app_worker(
        &self,
        request: AgentAppWorkerRunRequest,
    ) -> Result<Vec<RuntimeEvent>, RuntimeCoreError> {
        let mut ignore_progress = |_event: RuntimeEvent| Ok(());
        self.run_agent_app_worker_with_progress(request, &mut ignore_progress)
    }

    pub(in crate::runtime) fn run_agent_app_worker_with_progress(
        &self,
        request: AgentAppWorkerRunRequest,
        on_progress_event: &mut dyn FnMut(RuntimeEvent) -> Result<(), RuntimeCoreError>,
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
            on_progress_event,
        )?;
        worker_response_to_runtime_events(
            output,
            &request.request,
            &request.task_runtime,
            self.sidecar_store.is_some(),
        )
    }

    pub(in crate::runtime) fn run_agent_app_hook(
        &self,
        request: AgentAppHookRunRequest,
    ) -> Result<Value, RuntimeCoreError> {
        let entrypoint = resolve_package_entrypoint(
            &request.package_root,
            Some(request.hook_entrypoint.as_str()),
            "Agent App hook",
        )?;
        let node = node_binary();
        invoke_node_json_process(
            "Agent App hook",
            &node,
            &request.package_root,
            &entrypoint,
            &request.request,
            request.timeout_ms,
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

fn resolve_package_entrypoint(
    package_root: &Path,
    entrypoint: Option<&str>,
    label: &str,
) -> Result<PathBuf, RuntimeCoreError> {
    let entrypoint = entrypoint
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| RuntimeCoreError::Backend(format!("{label} entrypoint is missing.")))?;
    if entrypoint.starts_with("http://")
        || entrypoint.starts_with("https://")
        || entrypoint.contains("..")
    {
        return Err(RuntimeCoreError::Backend(format!(
            "{label} entrypoint must be a package-relative file path."
        )));
    }
    let path = package_root.join(entrypoint.trim_start_matches("./"));
    if !path.is_file() {
        return Err(RuntimeCoreError::Backend(format!(
            "{label} entrypoint was not found: {}",
            path.display()
        )));
    }
    Ok(path)
}

fn resolve_worker_entrypoint(
    package_root: &Path,
    entrypoint: Option<&str>,
) -> Result<PathBuf, RuntimeCoreError> {
    resolve_package_entrypoint(package_root, entrypoint, "Agent App worker")
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
    on_progress_event: &mut dyn FnMut(RuntimeEvent) -> Result<(), RuntimeCoreError>,
) -> Result<Value, RuntimeCoreError> {
    invoke_worker_json_process(
        "Agent App worker",
        node,
        package_root,
        entrypoint,
        request,
        timeout_ms,
        on_progress_event,
    )
}

fn invoke_worker_json_process(
    label: &str,
    node: &str,
    package_root: &Path,
    entrypoint: &Path,
    request: &Value,
    timeout_ms: u64,
    on_progress_event: &mut dyn FnMut(RuntimeEvent) -> Result<(), RuntimeCoreError>,
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

    let mut child = command
        .spawn()
        .map_err(|error| RuntimeCoreError::Backend(format!("failed to spawn {label}: {error}")))?;
    let (stdout_reader, stdout_rx) = child
        .stdout
        .take()
        .map(|stdout| spawn_worker_stdout_line_reader(stdout))
        .map(|(reader, rx)| (Some(reader), Some(rx)))
        .unwrap_or((None, None));
    let stderr_reader = child
        .stderr
        .take()
        .map(|stderr| spawn_worker_output_reader(stderr, "stderr"));
    write_worker_request(child.stdin.take(), request)?;
    let started = Instant::now();
    let timeout = Duration::from_millis(timeout_ms);
    let mut stdout_bytes = 0usize;
    let mut response: Option<Value> = None;

    loop {
        if started.elapsed() > timeout {
            let _ = child.kill();
            let _ = child.wait();
            drain_worker_stdout_lines(
                label,
                stdout_rx.as_ref(),
                &mut stdout_bytes,
                &mut response,
                on_progress_event,
            )?;
            let _ = join_worker_stdout_line_reader(stdout_reader, "stdout");
            let _ = join_worker_output_reader(stderr_reader, "stderr", MAX_WORKER_STDERR_BYTES);
            return Err(RuntimeCoreError::Backend(format!(
                "{label} timed out after {timeout_ms}ms"
            )));
        }

        drain_worker_stdout_lines(
            label,
            stdout_rx.as_ref(),
            &mut stdout_bytes,
            &mut response,
            on_progress_event,
        )?;

        match child.try_wait() {
            Ok(Some(status)) => {
                drain_worker_stdout_lines(
                    label,
                    stdout_rx.as_ref(),
                    &mut stdout_bytes,
                    &mut response,
                    on_progress_event,
                )?;
                join_worker_stdout_line_reader(stdout_reader, "stdout")?;
                drain_worker_stdout_lines(
                    label,
                    stdout_rx.as_ref(),
                    &mut stdout_bytes,
                    &mut response,
                    on_progress_event,
                )?;
                let stderr =
                    join_worker_output_reader(stderr_reader, "stderr", MAX_WORKER_STDERR_BYTES)?;
                if !status.success() {
                    return Err(RuntimeCoreError::Backend(format!(
                        "{label} exited with {}: {}",
                        status,
                        String::from_utf8_lossy(&stderr).trim()
                    )));
                }
                return response.ok_or_else(|| {
                    RuntimeCoreError::Backend(format!("{label} returned empty stdout."))
                });
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(10)),
            Err(error) => {
                return Err(RuntimeCoreError::Backend(format!(
                    "failed to poll {label}: {error}"
                )));
            }
        }
    }
}

fn invoke_node_json_process(
    label: &str,
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

    let mut child = command
        .spawn()
        .map_err(|error| RuntimeCoreError::Backend(format!("failed to spawn {label}: {error}")))?;
    let stdout_reader = child
        .stdout
        .take()
        .map(|stdout| spawn_worker_output_reader(stdout, "stdout"));
    let stderr_reader = child
        .stderr
        .take()
        .map(|stderr| spawn_worker_output_reader(stderr, "stderr"));
    write_worker_request(child.stdin.take(), request)?;
    let started = Instant::now();
    let timeout = Duration::from_millis(timeout_ms);
    loop {
        if started.elapsed() > timeout {
            let _ = child.kill();
            let _ = child.wait();
            let _ = join_worker_output_reader(stdout_reader, "stdout", MAX_WORKER_STDOUT_BYTES);
            let _ = join_worker_output_reader(stderr_reader, "stderr", MAX_WORKER_STDERR_BYTES);
            return Err(RuntimeCoreError::Backend(format!(
                "{label} timed out after {timeout_ms}ms"
            )));
        }
        match child.try_wait() {
            Ok(Some(status)) => {
                let stdout =
                    join_worker_output_reader(stdout_reader, "stdout", MAX_WORKER_STDOUT_BYTES)?;
                let stderr =
                    join_worker_output_reader(stderr_reader, "stderr", MAX_WORKER_STDERR_BYTES)?;
                if !status.success() {
                    return Err(RuntimeCoreError::Backend(format!(
                        "{label} exited with {}: {}",
                        status,
                        String::from_utf8_lossy(&stderr).trim()
                    )));
                }
                return decode_node_stdout(label, &stdout);
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(10)),
            Err(error) => {
                return Err(RuntimeCoreError::Backend(format!(
                    "failed to poll {label}: {error}"
                )));
            }
        }
    }
}

fn spawn_worker_output_reader<R>(
    mut reader: R,
    label: &'static str,
) -> JoinHandle<Result<Vec<u8>, String>>
where
    R: Read + Send + 'static,
{
    std::thread::spawn(move || {
        let mut output = Vec::new();
        reader
            .read_to_end(&mut output)
            .map_err(|error| format!("failed to collect Agent App worker {label}: {error}"))?;
        Ok(output)
    })
}

fn spawn_worker_stdout_line_reader<R>(
    reader: R,
) -> (
    JoinHandle<Result<(), String>>,
    Receiver<Result<String, String>>,
)
where
    R: Read + Send + 'static,
{
    let (tx, rx) = mpsc::channel();
    let handle = std::thread::spawn(move || {
        let mut reader = BufReader::new(reader);
        let mut line = String::new();
        loop {
            line.clear();
            let bytes = reader
                .read_line(&mut line)
                .map_err(|error| format!("failed to collect Agent App worker stdout: {error}"))?;
            if bytes == 0 {
                return Ok(());
            }
            let text = line.trim_end_matches(['\r', '\n']).to_string();
            if tx.send(Ok(text)).is_err() {
                return Ok(());
            }
        }
    });
    (handle, rx)
}

fn drain_worker_stdout_lines(
    label: &str,
    rx: Option<&Receiver<Result<String, String>>>,
    stdout_bytes: &mut usize,
    response: &mut Option<Value>,
    on_progress_event: &mut dyn FnMut(RuntimeEvent) -> Result<(), RuntimeCoreError>,
) -> Result<(), RuntimeCoreError> {
    let Some(rx) = rx else {
        return Ok(());
    };
    loop {
        match rx.try_recv() {
            Ok(Ok(line)) => handle_worker_stdout_line(
                label,
                line.as_str(),
                stdout_bytes,
                response,
                on_progress_event,
            )?,
            Ok(Err(error)) => return Err(RuntimeCoreError::Backend(error)),
            Err(mpsc::TryRecvError::Empty) | Err(mpsc::TryRecvError::Disconnected) => return Ok(()),
        }
    }
}

fn handle_worker_stdout_line(
    label: &str,
    line: &str,
    stdout_bytes: &mut usize,
    response: &mut Option<Value>,
    on_progress_event: &mut dyn FnMut(RuntimeEvent) -> Result<(), RuntimeCoreError>,
) -> Result<(), RuntimeCoreError> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return Ok(());
    }
    *stdout_bytes = stdout_bytes.saturating_add(trimmed.len());
    if *stdout_bytes > MAX_WORKER_STDOUT_BYTES {
        return Err(RuntimeCoreError::Backend(format!(
            "{label} stdout exceeded the size limit."
        )));
    }
    let value = serde_json::from_str::<Value>(trimmed).map_err(|error| {
        RuntimeCoreError::Backend(format!("failed to decode {label} stdout line: {error}"))
    })?;
    if let Some(event) = runtime_event_from_worker_progress_envelope(&value)
        .map_err(|error| RuntimeCoreError::Backend(format!("{label} {error}")))?
    {
        on_progress_event(event)?;
        return Ok(());
    }
    if response.is_some() {
        return Err(RuntimeCoreError::Backend(format!(
            "{label} returned multiple final JSON responses."
        )));
    }
    *response = Some(value);
    Ok(())
}

fn join_worker_stdout_line_reader(
    reader: Option<JoinHandle<Result<(), String>>>,
    label: &'static str,
) -> Result<(), RuntimeCoreError> {
    let Some(reader) = reader else {
        return Ok(());
    };
    reader
        .join()
        .map_err(|_| {
            RuntimeCoreError::Backend(format!(
                "failed to collect Agent App worker {label}: panicked"
            ))
        })?
        .map_err(RuntimeCoreError::Backend)
}

fn join_worker_output_reader(
    reader: Option<JoinHandle<Result<Vec<u8>, String>>>,
    label: &'static str,
    max_bytes: usize,
) -> Result<Vec<u8>, RuntimeCoreError> {
    let Some(reader) = reader else {
        return Ok(Vec::new());
    };
    let output = reader.join().map_err(|_| {
        RuntimeCoreError::Backend(format!(
            "failed to collect Agent App worker {label}: panicked"
        ))
    })?;
    let output = output.map_err(RuntimeCoreError::Backend)?;
    if output.len() > max_bytes {
        return Err(RuntimeCoreError::Backend(format!(
            "Agent App worker {label} exceeded the size limit."
        )));
    }
    Ok(output)
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
    stdin.flush().map_err(|error| {
        RuntimeCoreError::Backend(format!("failed to flush Agent App worker request: {error}"))
    })?;
    drop(stdin);
    Ok(())
}

fn decode_node_stdout(label: &str, stdout: &[u8]) -> Result<Value, RuntimeCoreError> {
    let text = std::str::from_utf8(stdout).map_err(|error| {
        RuntimeCoreError::Backend(format!("{label} stdout must be UTF-8: {error}"))
    })?;
    let line = text
        .lines()
        .find(|line| !line.trim().is_empty())
        .ok_or_else(|| RuntimeCoreError::Backend(format!("{label} returned empty stdout.")))?;
    serde_json::from_str(line).map_err(|error| {
        RuntimeCoreError::Backend(format!("failed to decode {label} response: {error}"))
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
    let workspace_patch = metadata
        .get("contentFactoryWorkspacePatch")
        .or_else(|| metadata.get("workspace_patch"));
    let output_object_count = workspace_patch
        .and_then(|patch| patch.get("objects"))
        .and_then(Value::as_array)
        .and_then(|objects| u64::try_from(objects.len()).ok());
    let output_summary = output_object_count.map(|count| format!("{count} product objects"));
    let agent_app_worker = metadata
        .entry("agentAppWorker".to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    if !agent_app_worker.is_object() {
        *agent_app_worker = Value::Object(Map::new());
    }
    let agent_app_worker = agent_app_worker
        .as_object_mut()
        .expect("agentAppWorker metadata is object");
    insert_missing_metadata_field(
        agent_app_worker,
        "appId",
        json!(string_field(request, &["appId", "app_id"])),
    );
    insert_missing_metadata_field(
        agent_app_worker,
        "taskId",
        json!(string_field(request, &["taskId", "task_id"])),
    );
    insert_missing_metadata_field(
        agent_app_worker,
        "taskKind",
        json!(string_field(request, &["taskKind", "task_kind"])),
    );
    insert_missing_metadata_field(
        agent_app_worker,
        "turnId",
        json!(string_field(request, &["turnId", "turn_id"])),
    );
    insert_missing_metadata_field(agent_app_worker, "status", json!("completed"));
    insert_missing_metadata_field(
        agent_app_worker,
        "workerEntrypoint",
        json!(task_runtime.worker_entrypoint.as_deref()),
    );
    insert_missing_metadata_field(
        agent_app_worker,
        "inputSummary",
        json!(string_field(request, &["prompt"])
            .map(|prompt| format!("prompt={}", truncate_chars(&prompt, 80)))),
    );
    insert_missing_metadata_field(agent_app_worker, "outputSummary", json!(output_summary));
    insert_missing_metadata_field(
        agent_app_worker,
        "outputObjectCount",
        json!(output_object_count),
    );
    insert_missing_metadata_field(
        agent_app_worker,
        "outputArtifactKind",
        json!(task_runtime.output_artifact_kind.as_deref()),
    );
    insert_missing_metadata_field(
        agent_app_worker,
        "workflowKey",
        request
            .get("workflowKey")
            .or_else(|| request.get("workflow_key"))
            .cloned()
            .unwrap_or(Value::Null),
    );
    insert_missing_metadata_field(
        agent_app_worker,
        "subagents",
        request
            .get("subagents")
            .or_else(|| request.get("sub_agents"))
            .cloned()
            .unwrap_or(Value::Null),
    );
    insert_missing_metadata_field(
        agent_app_worker,
        "skillRefs",
        request
            .get("skillRefs")
            .or_else(|| request.get("skill_refs"))
            .cloned()
            .unwrap_or(Value::Null),
    );
    insert_missing_metadata_field(
        agent_app_worker,
        "cliRefs",
        request
            .get("cliRefs")
            .or_else(|| request.get("cli_refs"))
            .cloned()
            .unwrap_or(Value::Null),
    );
    insert_missing_metadata_field(
        agent_app_worker,
        "connectorRefs",
        request
            .get("connectorRefs")
            .or_else(|| request.get("connector_refs"))
            .cloned()
            .unwrap_or(Value::Null),
    );
    insert_missing_metadata_field(
        agent_app_worker,
        "hookPolicy",
        request
            .get("hookPolicy")
            .or_else(|| request.get("hook_policy"))
            .cloned()
            .unwrap_or(Value::Null),
    );
    insert_missing_metadata_field(
        agent_app_worker,
        "orchestration",
        request.get("orchestration").cloned().unwrap_or(Value::Null),
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

fn insert_missing_metadata_field(object: &mut Map<String, Value>, key: &str, value: Value) {
    if !metadata_value_is_meaningful(&value) {
        return;
    }
    let should_insert = object
        .get(key)
        .map(|current| !metadata_value_is_meaningful(current))
        .unwrap_or(true);
    if should_insert {
        object.insert(key.to_string(), value);
    }
}

fn metadata_value_is_meaningful(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::String(value) => !value.trim().is_empty(),
        Value::Array(value) => !value.is_empty(),
        Value::Object(value) => !value.is_empty(),
        Value::Bool(_) | Value::Number(_) => true,
    }
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
        let contract = build_agent_app_task_runtime_contract(&state, Some(&fixture_root));

        let core = RuntimeCore::default();
        let mut progress_events = Vec::new();
        let events = core
            .run_agent_app_worker_with_progress(
                AgentAppWorkerRunRequest::new(fixture_root, contract, sample_request),
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
    fn worker_adapter_completes_existing_agent_app_worker_metadata() {
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
        let contract = build_agent_app_task_runtime_contract(&state, None);
        let response = json!({
            "status": "completed",
            "artifacts": [
                {
                    "kind": "artifact.snapshot",
                    "artifactId": "task-article:workspace-patch",
                    "title": "Content Factory workspace patch",
                    "metadata": {
                        "agentAppWorker": {
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

        let metadata = &events[0].payload["artifact"]["metadata"]["agentAppWorker"];
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
        let contract = AgentAppTaskRuntimeContract {
            enabled: true,
            package_root_path: Some(temp.path().to_string_lossy().to_string()),
            worker_entrypoint: Some("./worker.mjs".to_string()),
            output_artifact_kind: Some(CONTENT_FACTORY_WORKSPACE_PATCH_KIND.to_string()),
            ..AgentAppTaskRuntimeContract::default()
        };

        let core = RuntimeCore::default();
        let events = core
            .run_agent_app_worker(
                AgentAppWorkerRunRequest::new(temp.path(), contract, json!({}))
                    .with_timeout_ms(1_000),
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
        let contract = AgentAppTaskRuntimeContract {
            enabled: true,
            package_root_path: Some(temp.path().to_string_lossy().to_string()),
            worker_entrypoint: Some("./worker.mjs".to_string()),
            output_artifact_kind: Some(CONTENT_FACTORY_WORKSPACE_PATCH_KIND.to_string()),
            ..AgentAppTaskRuntimeContract::default()
        };

        let core = RuntimeCore::default();
        let events = core
            .run_agent_app_worker(
                AgentAppWorkerRunRequest::new(
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
            .join("src/features/agent-app/testing/fixtures");
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
