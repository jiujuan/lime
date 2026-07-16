use app_server_protocol::{
    ExecutionProcessDrainOutputParams, ExecutionProcessDrainOutputResponse,
    ExecutionProcessEmptyResponse, ExecutionProcessIdParams, ExecutionProcessOutputDelta,
    ExecutionProcessOutputKind, ExecutionProcessSnapshot, ExecutionProcessStartParams,
    ExecutionProcessStartResponse, ExecutionProcessStatus, ExecutionProcessStatusResponse,
    ExecutionProcessWriteStdinParams,
};
use serde_json::json;
use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tool_runtime::execution_decision::{
    decide_tool_execution, ToolExecutionDecisionInput, ToolExecutionDecisionKind,
    ToolExecutionPolicyDecisionOptions,
};
use tool_runtime::execution_policy::{
    ToolExecutionPolicy, ToolExecutionRestrictionProfile, ToolExecutionSandboxProfile,
    ToolExecutionWarningPolicy,
};
use tool_runtime::execution_policy_service::ToolExecutionResolverInput;
use tool_runtime::execution_process::{
    start_local_execution_process, ExecutionOutputDelta as RuntimeExecutionOutputDelta,
    ExecutionOutputKind as RuntimeExecutionOutputKind,
    ExecutionProcessSnapshot as RuntimeExecutionProcessSnapshot,
    ExecutionProcessStatus as RuntimeExecutionProcessStatus, LiveExecutionProcessRegistry,
    LocalExecutionProcessControlHandle, LocalExecutionRequest,
};
use tool_runtime::sandbox::{prepare_sandbox_command, SandboxCommandRequest};
use tool_runtime::shell::{is_shell_tool_name, shell_command_text_from_argv};
use tool_runtime::shell_permission::{check_shell_command_permission, ShellPermissionDecision};

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
    #[error("Execution process working directory is invalid: {0}")]
    WorkingDirectory(String),
    #[error("Failed to start execution process: {0}")]
    Start(String),
    #[error("Execution process rejected by policy: {0}")]
    Policy(String),
    #[error("Execution process only supports shell tools")]
    UnsupportedTool,
    #[error("Failed to prepare sandboxed execution process: {0}")]
    Sandbox(String),
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
        let requested_working_directory = PathBuf::from(&params.working_directory);
        let working_directory =
            std::fs::canonicalize(&requested_working_directory).map_err(|error| {
                ExecutionProcessError::WorkingDirectory(format!(
                    "{}: {error}",
                    requested_working_directory.display()
                ))
            })?;
        if !working_directory.is_dir() {
            return Err(ExecutionProcessError::WorkingDirectory(format!(
                "{} is not a directory",
                working_directory.display()
            )));
        }
        let canonical_tool_name = canonical_shell_tool_name(&params.tool_name)
            .ok_or(ExecutionProcessError::UnsupportedTool)?;
        let command_text = shell_command_text_from_argv(&params.command);
        let decision = decide_tool_execution(
            ToolExecutionDecisionInput {
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
            },
            app_server_tool_execution_policy_options(),
        );
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
        validate_shell_execution_process_command(
            canonical_tool_name,
            &command_text,
            &working_directory,
            params.approval_policy.as_deref(),
            params.sandbox_policy.as_deref(),
        )
        .map_err(ExecutionProcessError::Policy)?;

        {
            let state = self.inner.lock().map_err(|_| ExecutionProcessError::Lock)?;
            if state.processes.contains_key(&params.process_id) {
                return Err(ExecutionProcessError::ProcessExists(params.process_id));
            }
        }

        let command = if decision.workspace_sandbox_backend_enforced() {
            prepare_sandbox_command(SandboxCommandRequest {
                backend: decision.sandbox_backend().ok_or_else(|| {
                    ExecutionProcessError::Sandbox(
                        "execution decision did not identify a sandbox backend".to_string(),
                    )
                })?,
                requested_policy: params.sandbox_policy.as_deref(),
                command: params.command,
                working_directory: &working_directory,
            })
            .map_err(|error| ExecutionProcessError::Sandbox(error.to_string()))?
        } else {
            params.command
        };
        let request = LocalExecutionRequest {
            process_id: params.process_id.clone(),
            tool_id: params.tool_id,
            tool_name: canonical_tool_name.to_string(),
            command,
            cwd: Some(working_directory),
            env: params.env,
            tty: params.tty,
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

fn canonical_shell_tool_name(tool_name: &str) -> Option<&'static str> {
    is_shell_tool_name(tool_name).then_some(tool_runtime::unified_exec::EXEC_COMMAND_TOOL_NAME)
}

fn app_server_tool_execution_policy_options() -> ToolExecutionPolicyDecisionOptions {
    ToolExecutionPolicyDecisionOptions {
        default_policy_for_tool: app_server_default_tool_execution_policy,
        tool_names_match: app_server_tool_names_match,
    }
}

fn app_server_default_tool_execution_policy(tool_name: &str) -> ToolExecutionPolicy {
    if canonical_shell_tool_name(tool_name).is_some() {
        return ToolExecutionPolicy {
            warning_policy: ToolExecutionWarningPolicy::ShellCommandRisk,
            restriction_profile: ToolExecutionRestrictionProfile::WorkspaceShellCommand,
            sandbox_profile: ToolExecutionSandboxProfile::WorkspaceCommand,
        };
    }
    ToolExecutionPolicy::default()
}

fn app_server_tool_names_match(left: &str, right: &str) -> bool {
    normalized_tool_name(left) == normalized_tool_name(right)
}

fn validate_shell_execution_process_command(
    tool_name: &str,
    command_text: &str,
    working_directory: &PathBuf,
    approval_policy: Option<&str>,
    sandbox_policy: Option<&str>,
) -> Result<(), String> {
    match check_shell_command_permission(tool_name, command_text, working_directory) {
        ShellPermissionDecision::Allow => Ok(()),
        ShellPermissionDecision::Deny(reason) => Err(reason),
        ShellPermissionDecision::RequiresConfirmation(message)
            if approval_policy.is_some_and(|policy| policy.eq_ignore_ascii_case("never"))
                || sandbox_policy
                    .is_some_and(|policy| policy.eq_ignore_ascii_case("danger-full-access")) =>
        {
            Ok(())
        }
        ShellPermissionDecision::RequiresConfirmation(message) => Err(message),
    }
}

fn normalized_tool_name(tool_name: &str) -> String {
    tool_name
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .map(|character| character.to_ascii_lowercase())
        .collect()
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
#[path = "execution_process/tests.rs"]
mod tests;
