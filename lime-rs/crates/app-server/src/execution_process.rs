use app_server_protocol::{
    ExecutionProcessDrainOutputParams, ExecutionProcessDrainOutputResponse,
    ExecutionProcessEmptyResponse, ExecutionProcessIdParams, ExecutionProcessOutputDelta,
    ExecutionProcessOutputKind, ExecutionProcessSnapshot, ExecutionProcessStartParams,
    ExecutionProcessStartResponse, ExecutionProcessStatus, ExecutionProcessStatusResponse,
    ExecutionProcessWriteStdinParams,
};
use lime_agent::agent_tools::execution::{
    decide_tool_execution, ToolExecutionDecisionInput, ToolExecutionDecisionKind,
    ToolExecutionResolverInput,
};
use lime_agent::agent_tools::tool_orchestrator::{
    canonical_shell_tool_name, check_shell_tool_permissions, LiveExecutionProcessRegistry,
};
use serde_json::json;
use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tool_runtime::execution_process::{
    start_local_execution_process, ExecutionOutputDelta as RuntimeExecutionOutputDelta,
    ExecutionOutputKind as RuntimeExecutionOutputKind,
    ExecutionProcessSnapshot as RuntimeExecutionProcessSnapshot,
    ExecutionProcessStatus as RuntimeExecutionProcessStatus, LocalExecutionProcessControlHandle,
    LocalExecutionRequest,
};
use tool_runtime::shell::shell_command_text_from_argv;

const DEFAULT_DRAIN_LIMIT: usize = 128;
const MAX_DRAIN_LIMIT: usize = 1024;
const OUTPUT_EVENT_CAP: usize = 4096;
const OUTPUT_BYTE_CAP: usize = 4 * 1024 * 1024;

#[derive(Debug, Clone, Default)]
pub struct ExecutionProcessServer {
    inner: Arc<Mutex<ExecutionProcessState>>,
}

#[derive(Debug, Default)]
struct ExecutionProcessState {
    processes: HashMap<String, ExecutionProcessEntry>,
    output: VecDeque<ExecutionProcessOutputDelta>,
    output_bytes: usize,
}

#[derive(Debug)]
struct ExecutionProcessEntry {
    handle: Option<LocalExecutionProcessControlHandle>,
    final_snapshot: Option<ExecutionProcessSnapshot>,
}

#[derive(Debug, thiserror::Error)]
pub enum ExecutionProcessError {
    #[error("Execution process command must not be empty")]
    EmptyCommand,
    #[error("Execution process already exists: {0}")]
    ProcessExists(String),
    #[error("Execution process not found: {0}")]
    ProcessNotFound(String),
    #[error("Failed to start execution process: {0}")]
    Start(String),
    #[error("Execution process rejected by policy: {0}")]
    Policy(String),
    #[error("Execution process only supports shell tools")]
    UnsupportedTool,
    #[error("Execution process requires sandbox backend and must use the sandbox executor")]
    SandboxRequired,
    #[error("Failed to control execution process: {0}")]
    Control(String),
    #[error("Execution process state is unavailable")]
    Lock,
}

impl ExecutionProcessServer {
    pub fn register_process_handle(
        &self,
        handle: LocalExecutionProcessControlHandle,
        snapshot: RuntimeExecutionProcessSnapshot,
    ) -> Result<(), ExecutionProcessError> {
        if handle.process_id() != snapshot.process_id {
            return Err(ExecutionProcessError::Control(format!(
                "control handle process id {} does not match snapshot process id {}",
                handle.process_id(),
                snapshot.process_id
            )));
        }
        let process_id = snapshot.process_id.clone();
        let snapshot = map_snapshot(snapshot);
        let is_terminal = matches!(
            snapshot.status,
            ExecutionProcessStatus::Exited
                | ExecutionProcessStatus::Interrupted
                | ExecutionProcessStatus::Terminated
                | ExecutionProcessStatus::Failed
        );
        let mut state = self.inner.lock().map_err(|_| ExecutionProcessError::Lock)?;
        if state.processes.contains_key(&process_id) {
            return Err(ExecutionProcessError::ProcessExists(process_id));
        }
        state.processes.insert(
            process_id,
            ExecutionProcessEntry {
                handle: if is_terminal { None } else { Some(handle) },
                final_snapshot: if is_terminal { Some(snapshot) } else { None },
            },
        );
        Ok(())
    }

    pub fn record_process_output(
        &self,
        delta: RuntimeExecutionOutputDelta,
    ) -> Result<(), ExecutionProcessError> {
        let mut state = self.inner.lock().map_err(|_| ExecutionProcessError::Lock)?;
        if !state.processes.contains_key(&delta.process_id) {
            return Err(ExecutionProcessError::ProcessNotFound(delta.process_id));
        }
        push_output(&mut state, map_delta(delta));
        Ok(())
    }

    pub fn finish_process(
        &self,
        snapshot: RuntimeExecutionProcessSnapshot,
    ) -> Result<(), ExecutionProcessError> {
        let process_id = snapshot.process_id.clone();
        let snapshot = map_snapshot(snapshot);
        let mut state = self.inner.lock().map_err(|_| ExecutionProcessError::Lock)?;
        let entry = state
            .processes
            .get_mut(&process_id)
            .ok_or_else(|| ExecutionProcessError::ProcessNotFound(process_id.clone()))?;
        entry.handle = None;
        entry.final_snapshot = Some(snapshot);
        Ok(())
    }

    pub async fn start_process(
        &self,
        params: ExecutionProcessStartParams,
    ) -> Result<ExecutionProcessStartResponse, ExecutionProcessError> {
        if params.command.is_empty() {
            return Err(ExecutionProcessError::EmptyCommand);
        }
        let working_directory = PathBuf::from(params.working_directory.clone());
        let canonical_tool_name = canonical_shell_tool_name(&params.tool_name)
            .ok_or(ExecutionProcessError::UnsupportedTool)?;
        let command_text = shell_command_text_from_argv(&params.command);
        let decision = decide_tool_execution(ToolExecutionDecisionInput {
            tool_name: canonical_tool_name,
            params: &json!({ "command": command_text }),
            working_directory: &working_directory,
            surface: "execution_process",
            auto_mode: false,
            bypass_restrictions: false,
            approval_policy: params.approval_policy.as_deref(),
            requested_sandbox_policy: params.sandbox_policy.as_deref(),
            resolver_input: ToolExecutionResolverInput {
                persisted_policy: None,
                request_metadata: params.runtime_metadata.as_ref(),
            },
        });
        match decision.kind {
            ToolExecutionDecisionKind::Allow => {}
            ToolExecutionDecisionKind::RequiresApproval
            | ToolExecutionDecisionKind::Deny
            | ToolExecutionDecisionKind::SandboxBlocked => {
                return Err(ExecutionProcessError::Policy(format!(
                    "{}: {}",
                    decision.reason_code, decision.reason
                )));
            }
        }
        if decision.requires_sandboxed_execution() {
            return Err(ExecutionProcessError::SandboxRequired);
        }
        check_shell_tool_permissions(
            canonical_tool_name,
            &command_text,
            working_directory.clone(),
        )
        .await
        .map_err(ExecutionProcessError::Policy)?;

        {
            let state = self.inner.lock().map_err(|_| ExecutionProcessError::Lock)?;
            if state.processes.contains_key(&params.process_id) {
                return Err(ExecutionProcessError::ProcessExists(params.process_id));
            }
        }

        let request = LocalExecutionRequest {
            process_id: params.process_id.clone(),
            tool_id: params.tool_id,
            tool_name: canonical_tool_name.to_string(),
            command: params.command,
            cwd: Some(working_directory),
            env: params.env,
        };
        let mut handle = start_local_execution_process(request)
            .map_err(|error| ExecutionProcessError::Start(error.to_string()))?;
        let snapshot = map_snapshot(handle.status());
        let process_id = params.process_id.clone();
        let control_handle = handle.control_handle();
        let inner = Arc::clone(&self.inner);

        {
            let mut state = self.inner.lock().map_err(|_| ExecutionProcessError::Lock)?;
            state.processes.insert(
                params.process_id,
                ExecutionProcessEntry {
                    handle: Some(control_handle),
                    final_snapshot: None,
                },
            );
        }

        tokio::spawn(async move {
            while let Some(delta) = handle.recv_output().await {
                if let Ok(mut state) = inner.lock() {
                    push_output(&mut state, map_delta(delta));
                }
            }
            let final_snapshot = handle.wait().await.ok().map(map_snapshot);
            if let Ok(mut state) = inner.lock() {
                if let Some(entry) = state.processes.get_mut(&process_id) {
                    entry.handle = None;
                    entry.final_snapshot = final_snapshot;
                }
            }
        });

        Ok(ExecutionProcessStartResponse { snapshot })
    }

    pub fn write_stdin(
        &self,
        params: ExecutionProcessWriteStdinParams,
    ) -> Result<ExecutionProcessEmptyResponse, ExecutionProcessError> {
        let state = self.inner.lock().map_err(|_| ExecutionProcessError::Lock)?;
        let entry = state
            .processes
            .get(&params.process_id)
            .ok_or_else(|| ExecutionProcessError::ProcessNotFound(params.process_id.clone()))?;
        let Some(handle) = entry.handle.as_ref() else {
            return Err(ExecutionProcessError::ProcessNotFound(params.process_id));
        };
        handle
            .write_stdin(params.data.into_bytes())
            .map_err(|error| ExecutionProcessError::Control(format!("{error:?}")))?;
        Ok(ExecutionProcessEmptyResponse {})
    }

    pub fn interrupt(
        &self,
        params: ExecutionProcessIdParams,
    ) -> Result<ExecutionProcessStatusResponse, ExecutionProcessError> {
        let state = self.inner.lock().map_err(|_| ExecutionProcessError::Lock)?;
        let entry = state
            .processes
            .get(&params.process_id)
            .ok_or_else(|| ExecutionProcessError::ProcessNotFound(params.process_id.clone()))?;
        let Some(handle) = entry.handle.as_ref() else {
            return Ok(ExecutionProcessStatusResponse {
                snapshot: entry.final_snapshot.clone().ok_or_else(|| {
                    ExecutionProcessError::ProcessNotFound(params.process_id.clone())
                })?,
            });
        };
        handle
            .interrupt()
            .map_err(|error| ExecutionProcessError::Control(format!("{error:?}")))?;
        Ok(ExecutionProcessStatusResponse {
            snapshot: map_snapshot(handle.status()),
        })
    }

    pub fn terminate(
        &self,
        params: ExecutionProcessIdParams,
    ) -> Result<ExecutionProcessStatusResponse, ExecutionProcessError> {
        let state = self.inner.lock().map_err(|_| ExecutionProcessError::Lock)?;
        let entry = state
            .processes
            .get(&params.process_id)
            .ok_or_else(|| ExecutionProcessError::ProcessNotFound(params.process_id.clone()))?;
        let Some(handle) = entry.handle.as_ref() else {
            return Ok(ExecutionProcessStatusResponse {
                snapshot: entry.final_snapshot.clone().ok_or_else(|| {
                    ExecutionProcessError::ProcessNotFound(params.process_id.clone())
                })?,
            });
        };
        handle
            .terminate()
            .map_err(|error| ExecutionProcessError::Control(format!("{error:?}")))?;
        Ok(ExecutionProcessStatusResponse {
            snapshot: map_snapshot(handle.status()),
        })
    }

    pub fn status(
        &self,
        params: ExecutionProcessIdParams,
    ) -> Result<ExecutionProcessStatusResponse, ExecutionProcessError> {
        let state = self.inner.lock().map_err(|_| ExecutionProcessError::Lock)?;
        let entry = state
            .processes
            .get(&params.process_id)
            .ok_or_else(|| ExecutionProcessError::ProcessNotFound(params.process_id.clone()))?;
        if let Some(snapshot) = &entry.final_snapshot {
            return Ok(ExecutionProcessStatusResponse {
                snapshot: snapshot.clone(),
            });
        }
        let Some(handle) = entry.handle.as_ref() else {
            return Err(ExecutionProcessError::ProcessNotFound(params.process_id));
        };
        Ok(ExecutionProcessStatusResponse {
            snapshot: map_snapshot(handle.status()),
        })
    }

    pub fn drain_output(
        &self,
        params: ExecutionProcessDrainOutputParams,
    ) -> Result<ExecutionProcessDrainOutputResponse, ExecutionProcessError> {
        let limit = params
            .limit
            .map(usize::from)
            .unwrap_or(DEFAULT_DRAIN_LIMIT)
            .min(MAX_DRAIN_LIMIT);
        let max_bytes = params
            .max_bytes
            .and_then(|value| usize::try_from(value).ok())
            .unwrap_or(usize::MAX);
        let after_sequence = params.after_sequence.unwrap_or_default();
        let state = self.inner.lock().map_err(|_| ExecutionProcessError::Lock)?;
        let mut deltas = Vec::new();
        let mut bytes = 0usize;
        let mut next_sequence = params.after_sequence;

        for delta in state.output.iter() {
            if deltas.len() >= limit {
                break;
            }
            if params
                .process_id
                .as_ref()
                .is_some_and(|process_id| process_id != &delta.process_id)
            {
                continue;
            }
            if delta.sequence <= after_sequence {
                continue;
            }
            let delta_bytes = delta.delta.len();
            if !deltas.is_empty() && bytes.saturating_add(delta_bytes) > max_bytes {
                break;
            }
            bytes = bytes.saturating_add(delta_bytes);
            next_sequence = Some(next_sequence.unwrap_or_default().max(delta.sequence));
            deltas.push(delta.clone());
        }

        Ok(ExecutionProcessDrainOutputResponse {
            deltas,
            next_sequence,
        })
    }
}

impl LiveExecutionProcessRegistry for ExecutionProcessServer {
    fn register_live_process(
        &self,
        handle: LocalExecutionProcessControlHandle,
        snapshot: RuntimeExecutionProcessSnapshot,
    ) -> Result<(), String> {
        self.register_process_handle(handle, snapshot)
            .map_err(|error| error.to_string())
    }

    fn record_live_process_output(&self, delta: RuntimeExecutionOutputDelta) -> Result<(), String> {
        self.record_process_output(delta)
            .map_err(|error| error.to_string())
    }

    fn finish_live_process(&self, snapshot: RuntimeExecutionProcessSnapshot) -> Result<(), String> {
        self.finish_process(snapshot)
            .map_err(|error| error.to_string())
    }
}

fn push_output(state: &mut ExecutionProcessState, delta: ExecutionProcessOutputDelta) {
    state.output_bytes = state.output_bytes.saturating_add(delta.delta.len());
    state.output.push_back(delta);
    while state.output.len() > OUTPUT_EVENT_CAP || state.output_bytes > OUTPUT_BYTE_CAP {
        let Some(evicted) = state.output.pop_front() else {
            state.output_bytes = 0;
            break;
        };
        state.output_bytes = state.output_bytes.saturating_sub(evicted.delta.len());
    }
}

fn map_snapshot(snapshot: RuntimeExecutionProcessSnapshot) -> ExecutionProcessSnapshot {
    ExecutionProcessSnapshot {
        process_id: snapshot.process_id,
        tool_id: snapshot.tool_id,
        tool_name: snapshot.tool_name,
        status: map_status(snapshot.status),
        exit_code: snapshot.exit_code,
        elapsed_ms: snapshot.elapsed_ms,
        output_bytes: snapshot.output_bytes,
        output_omitted_bytes: snapshot.output_omitted_bytes,
        output_truncated: snapshot.output_truncated,
        retained_output: snapshot.retained_output,
        failure: snapshot.failure,
    }
}

fn map_delta(delta: RuntimeExecutionOutputDelta) -> ExecutionProcessOutputDelta {
    ExecutionProcessOutputDelta {
        process_id: delta.process_id,
        tool_id: delta.tool_id,
        sequence: delta.sequence,
        kind: map_output_kind(delta.kind),
        delta: delta.delta,
        bytes: delta.bytes,
        omitted_bytes: delta.omitted_bytes,
        truncated: delta.truncated,
    }
}

fn map_status(status: RuntimeExecutionProcessStatus) -> ExecutionProcessStatus {
    match status {
        RuntimeExecutionProcessStatus::Starting => ExecutionProcessStatus::Starting,
        RuntimeExecutionProcessStatus::Running => ExecutionProcessStatus::Running,
        RuntimeExecutionProcessStatus::Exited => ExecutionProcessStatus::Exited,
        RuntimeExecutionProcessStatus::Interrupted => ExecutionProcessStatus::Interrupted,
        RuntimeExecutionProcessStatus::Terminated => ExecutionProcessStatus::Terminated,
        RuntimeExecutionProcessStatus::Failed => ExecutionProcessStatus::Failed,
    }
}

fn map_output_kind(kind: RuntimeExecutionOutputKind) -> ExecutionProcessOutputKind {
    match kind {
        RuntimeExecutionOutputKind::Stdout => ExecutionProcessOutputKind::Stdout,
        RuntimeExecutionOutputKind::Stderr => ExecutionProcessOutputKind::Stderr,
        RuntimeExecutionOutputKind::Combined => ExecutionProcessOutputKind::Combined,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn execution_process_server_streams_output_and_status() {
        let server = ExecutionProcessServer::default();
        let response = server
            .start_process(ExecutionProcessStartParams {
                process_id: "process-test".to_string(),
                tool_id: "tool-test".to_string(),
                tool_name: "Bash".to_string(),
                command: vec![
                    "sh".to_string(),
                    "-c".to_string(),
                    "printf hello".to_string(),
                ],
                working_directory: std::env::current_dir()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string(),
                approval_policy: Some("never".to_string()),
                sandbox_policy: Some("danger-full-access".to_string()),
                runtime_metadata: None,
                cwd: None,
                env: HashMap::new(),
            })
            .await
            .expect("process should start");
        assert_eq!(response.snapshot.status, ExecutionProcessStatus::Running);

        let mut output = ExecutionProcessDrainOutputResponse {
            deltas: Vec::new(),
            next_sequence: None,
        };
        for _ in 0..20 {
            let next = server
                .drain_output(ExecutionProcessDrainOutputParams {
                    process_id: Some("process-test".to_string()),
                    after_sequence: None,
                    limit: None,
                    max_bytes: None,
                })
                .expect("output should drain");
            output.deltas.extend(next.deltas);
            if output
                .deltas
                .iter()
                .any(|delta| delta.delta.contains("hello"))
            {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(25)).await;
        }
        assert!(output
            .deltas
            .iter()
            .any(|delta| delta.delta.contains("hello")));

        let status = server
            .status(ExecutionProcessIdParams {
                process_id: "process-test".to_string(),
            })
            .expect("status should read");
        assert_eq!(status.snapshot.status, ExecutionProcessStatus::Exited);
    }

    #[tokio::test]
    async fn execution_process_output_replays_until_cursor_advances() {
        let server = ExecutionProcessServer::default();
        server
            .start_process(ExecutionProcessStartParams {
                process_id: "process-replay".to_string(),
                tool_id: "tool-replay".to_string(),
                tool_name: "Bash".to_string(),
                command: vec![
                    "sh".to_string(),
                    "-c".to_string(),
                    "printf replay".to_string(),
                ],
                working_directory: std::env::current_dir()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string(),
                approval_policy: Some("never".to_string()),
                sandbox_policy: Some("danger-full-access".to_string()),
                runtime_metadata: None,
                cwd: None,
                env: HashMap::new(),
            })
            .await
            .expect("process should start");

        let mut first = ExecutionProcessDrainOutputResponse {
            deltas: Vec::new(),
            next_sequence: None,
        };
        for _ in 0..20 {
            first = server
                .drain_output(ExecutionProcessDrainOutputParams {
                    process_id: Some("process-replay".to_string()),
                    after_sequence: None,
                    limit: None,
                    max_bytes: None,
                })
                .expect("output should replay");
            if first
                .deltas
                .iter()
                .any(|delta| delta.delta.contains("replay"))
            {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(25)).await;
        }
        assert!(first
            .deltas
            .iter()
            .any(|delta| delta.delta.contains("replay")));
        let cursor = first.next_sequence.expect("cursor should advance");

        let repeated = server
            .drain_output(ExecutionProcessDrainOutputParams {
                process_id: Some("process-replay".to_string()),
                after_sequence: None,
                limit: None,
                max_bytes: None,
            })
            .expect("output should remain replayable");
        assert_eq!(repeated.deltas, first.deltas);

        let after_cursor = server
            .drain_output(ExecutionProcessDrainOutputParams {
                process_id: Some("process-replay".to_string()),
                after_sequence: Some(cursor),
                limit: None,
                max_bytes: None,
            })
            .expect("cursor read should succeed");
        assert!(after_cursor.deltas.is_empty());
        assert_eq!(after_cursor.next_sequence, Some(cursor));
    }

    #[tokio::test]
    async fn execution_process_server_tracks_registered_live_process() {
        let server = ExecutionProcessServer::default();
        let mut handle = start_local_execution_process(LocalExecutionRequest {
            process_id: "process-registered".to_string(),
            tool_id: "tool-registered".to_string(),
            tool_name: "Bash".to_string(),
            command: shell_output_command("registered-output"),
            cwd: Some(std::env::current_dir().unwrap_or_default()),
            env: HashMap::new(),
        })
        .expect("local process should start");

        server
            .register_live_process(handle.control_handle(), handle.status())
            .expect("registered process should attach");
        let running = server
            .status(ExecutionProcessIdParams {
                process_id: "process-registered".to_string(),
            })
            .expect("registered status should read");
        assert_eq!(running.snapshot.status, ExecutionProcessStatus::Running);

        let mut saw_output = false;
        while let Some(delta) = handle.recv_output().await {
            saw_output |= delta.delta.contains("registered-output");
            server
                .record_live_process_output(delta)
                .expect("registered output should record");
        }
        assert!(saw_output);

        let final_snapshot = handle.wait().await.expect("process should finish");
        server
            .finish_live_process(final_snapshot)
            .expect("registered process should finish");
        let output = server
            .drain_output(ExecutionProcessDrainOutputParams {
                process_id: Some("process-registered".to_string()),
                after_sequence: None,
                limit: None,
                max_bytes: None,
            })
            .expect("registered output should drain");
        assert!(output
            .deltas
            .iter()
            .any(|delta| delta.delta.contains("registered-output")));

        let status = server
            .status(ExecutionProcessIdParams {
                process_id: "process-registered".to_string(),
            })
            .expect("final registered status should read");
        assert_eq!(status.snapshot.status, ExecutionProcessStatus::Exited);
        assert_eq!(status.snapshot.exit_code, Some(0));
    }

    #[tokio::test]
    async fn execution_process_server_rejects_dangerous_shell_command() {
        let server = ExecutionProcessServer::default();
        let error = server
            .start_process(ExecutionProcessStartParams {
                process_id: "process-danger".to_string(),
                tool_id: "tool-danger".to_string(),
                tool_name: "Bash".to_string(),
                command: vec!["sh".to_string(), "-c".to_string(), "rm -rf /".to_string()],
                working_directory: std::env::current_dir()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string(),
                approval_policy: Some("never".to_string()),
                sandbox_policy: Some("danger-full-access".to_string()),
                runtime_metadata: None,
                cwd: None,
                env: HashMap::new(),
            })
            .await
            .expect_err("dangerous command should be rejected");

        assert!(matches!(error, ExecutionProcessError::Policy(_)));
    }

    #[tokio::test]
    async fn execution_process_server_rejects_workspace_sandbox_process() {
        let server = ExecutionProcessServer::default();
        let error = server
            .start_process(ExecutionProcessStartParams {
                process_id: "process-sandbox".to_string(),
                tool_id: "tool-sandbox".to_string(),
                tool_name: "Bash".to_string(),
                command: vec![
                    "sh".to_string(),
                    "-c".to_string(),
                    "printf blocked".to_string(),
                ],
                working_directory: std::env::current_dir()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string(),
                approval_policy: Some("never".to_string()),
                sandbox_policy: Some("workspace-write".to_string()),
                runtime_metadata: None,
                cwd: None,
                env: HashMap::new(),
            })
            .await
            .expect_err("workspace sandbox command should not use bare process");

        assert!(matches!(error, ExecutionProcessError::SandboxRequired));
    }

    fn shell_output_command(output: &str) -> Vec<String> {
        if cfg!(windows) {
            vec![
                "cmd".to_string(),
                "/D".to_string(),
                "/S".to_string(),
                "/C".to_string(),
                format!("echo {output}"),
            ]
        } else {
            vec![
                "sh".to_string(),
                "-c".to_string(),
                format!("printf {output}"),
            ]
        }
    }
}
