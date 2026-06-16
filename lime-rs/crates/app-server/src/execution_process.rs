use app_server_protocol::{
    ExecutionProcessDrainOutputParams, ExecutionProcessDrainOutputResponse,
    ExecutionProcessEmptyResponse, ExecutionProcessIdParams, ExecutionProcessOutputDelta,
    ExecutionProcessOutputKind, ExecutionProcessSnapshot, ExecutionProcessStartParams,
    ExecutionProcessStartResponse, ExecutionProcessStatus, ExecutionProcessStatusResponse,
    ExecutionProcessWriteStdinParams,
};
use aster::tools::{BashTool, ToolContext, ToolRegistry};
use lime_agent::agent_tools::catalog::tool_catalog_entry;
use lime_agent::agent_tools::execution::{
    decide_tool_execution, start_local_execution_process,
    ExecutionOutputDelta as AgentExecutionOutputDelta,
    ExecutionOutputKind as AgentExecutionOutputKind,
    ExecutionProcessSnapshot as AgentExecutionProcessSnapshot,
    ExecutionProcessStatus as AgentExecutionProcessStatus, LocalExecutionProcessControlHandle,
    LocalExecutionRequest, ToolExecutionDecisionInput, ToolExecutionDecisionKind,
    ToolExecutionResolverInput,
};
use serde_json::json;
use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

const DEFAULT_DRAIN_LIMIT: usize = 128;
const MAX_DRAIN_LIMIT: usize = 1024;
const OUTPUT_EVENT_CAP: usize = 4096;

#[derive(Debug, Clone, Default)]
pub struct ExecutionProcessServer {
    inner: Arc<Mutex<ExecutionProcessState>>,
}

#[derive(Debug, Default)]
struct ExecutionProcessState {
    processes: HashMap<String, ExecutionProcessEntry>,
    output: VecDeque<ExecutionProcessOutputDelta>,
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
    pub async fn start_process(
        &self,
        params: ExecutionProcessStartParams,
    ) -> Result<ExecutionProcessStartResponse, ExecutionProcessError> {
        if params.command.is_empty() {
            return Err(ExecutionProcessError::EmptyCommand);
        }
        let working_directory = PathBuf::from(params.working_directory.clone());
        let canonical_tool_name = shell_tool_name(&params.tool_name)?;
        let command_text = command_text_from_argv(&params.command);
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
        let mut registry = ToolRegistry::new();
        registry.register(Box::new(BashTool::new()));
        let tool_context = ToolContext::new(working_directory.clone());
        registry
            .check_tool_permissions(
                canonical_tool_name,
                json!({ "command": command_text }),
                &tool_context,
                None,
            )
            .await
            .map_err(|error| ExecutionProcessError::Policy(error.to_string()))?;

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
        let mut state = self.inner.lock().map_err(|_| ExecutionProcessError::Lock)?;
        let mut deltas = Vec::new();
        let mut retained = VecDeque::new();

        while let Some(delta) = state.output.pop_front() {
            if deltas.len() < limit
                && params
                    .process_id
                    .as_ref()
                    .is_none_or(|process_id| process_id == &delta.process_id)
            {
                deltas.push(delta);
            } else {
                retained.push_back(delta);
            }
        }
        state.output = retained;

        Ok(ExecutionProcessDrainOutputResponse { deltas })
    }
}

fn shell_tool_name(tool_name: &str) -> Result<&'static str, ExecutionProcessError> {
    match tool_catalog_entry(tool_name).map(|entry| entry.name) {
        Some("Bash") => Ok("Bash"),
        Some("PowerShell") => Ok("PowerShell"),
        _ => Err(ExecutionProcessError::UnsupportedTool),
    }
}

fn command_text_from_argv(command: &[String]) -> String {
    command
        .iter()
        .skip_while(|part| shell_wrapper_part(part))
        .map(String::as_str)
        .collect::<Vec<_>>()
        .join(" ")
}

fn shell_wrapper_part(part: &str) -> bool {
    matches!(
        part,
        "sh" | "bash"
            | "zsh"
            | "cmd"
            | "cmd.exe"
            | "powershell"
            | "powershell.exe"
            | "pwsh"
            | "pwsh.exe"
            | "-c"
            | "/C"
            | "/c"
            | "/D"
            | "/S"
            | "-NoProfile"
            | "-NonInteractive"
            | "-Command"
    )
}

fn push_output(state: &mut ExecutionProcessState, delta: ExecutionProcessOutputDelta) {
    state.output.push_back(delta);
    while state.output.len() > OUTPUT_EVENT_CAP {
        state.output.pop_front();
    }
}

fn map_snapshot(snapshot: AgentExecutionProcessSnapshot) -> ExecutionProcessSnapshot {
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

fn map_delta(delta: AgentExecutionOutputDelta) -> ExecutionProcessOutputDelta {
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

fn map_status(status: AgentExecutionProcessStatus) -> ExecutionProcessStatus {
    match status {
        AgentExecutionProcessStatus::Starting => ExecutionProcessStatus::Starting,
        AgentExecutionProcessStatus::Running => ExecutionProcessStatus::Running,
        AgentExecutionProcessStatus::Exited => ExecutionProcessStatus::Exited,
        AgentExecutionProcessStatus::Interrupted => ExecutionProcessStatus::Interrupted,
        AgentExecutionProcessStatus::Terminated => ExecutionProcessStatus::Terminated,
        AgentExecutionProcessStatus::Failed => ExecutionProcessStatus::Failed,
    }
}

fn map_output_kind(kind: AgentExecutionOutputKind) -> ExecutionProcessOutputKind {
    match kind {
        AgentExecutionOutputKind::Stdout => ExecutionProcessOutputKind::Stdout,
        AgentExecutionOutputKind::Stderr => ExecutionProcessOutputKind::Stderr,
        AgentExecutionOutputKind::Combined => ExecutionProcessOutputKind::Combined,
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

        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        let output = server
            .drain_output(ExecutionProcessDrainOutputParams {
                process_id: Some("process-test".to_string()),
                limit: None,
            })
            .expect("output should drain");
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
}
