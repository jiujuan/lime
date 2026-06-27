use crate::execution_process::ExecutionProcessServer;
use app_server_protocol::{
    ExecutionProcessDrainOutputParams, ExecutionProcessIdParams, ExecutionProcessOutputDelta,
    ExecutionProcessOutputKind, ExecutionProcessSnapshot, ExecutionProcessStartParams,
    ExecutionProcessStatus,
};
use aster::agents::{NativeToolExecutionHook, NativeToolExecutionRequest, ToolCallResult};
use futures::channel::mpsc::{unbounded, UnboundedSender};
use futures::FutureExt;
use lime_agent::agent_tools::execution::{
    decide_tool_execution, ToolExecutionDecisionInput, ToolExecutionDecisionKind,
    ToolExecutionResolverInput,
};
use rmcp::model::{
    CallToolResult, Content, ErrorCode, ErrorData, LoggingLevel, LoggingMessageNotification,
    LoggingMessageNotificationMethod, LoggingMessageNotificationParam, Meta, ServerNotification,
};
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::path::Path;
use std::time::Duration;
use tokio::sync::oneshot;
use tokio_util::sync::CancellationToken;

const PROCESS_ID_PREFIX: &str = "process-";
const DRAIN_LIMIT: u16 = 128;
const DRAIN_MAX_BYTES: u64 = 64 * 1024;
const POLL_INTERVAL: Duration = Duration::from_millis(50);

#[derive(Clone)]
pub(super) struct RuntimeLiveExecutionProcessHook {
    server: ExecutionProcessServer,
}

#[derive(Clone)]
struct PreparedLiveExecution {
    server: ExecutionProcessServer,
    process_id: String,
    tool_id: String,
    tool_name: String,
    command_text: String,
    command: Vec<String>,
    working_directory: String,
    approval_policy: Option<String>,
    sandbox_policy: Option<String>,
    runtime_metadata: Option<Value>,
    env: HashMap<String, String>,
    cancellation_token: Option<CancellationToken>,
}

impl RuntimeLiveExecutionProcessHook {
    pub(super) fn new(server: ExecutionProcessServer) -> Self {
        Self { server }
    }
}

impl NativeToolExecutionHook for RuntimeLiveExecutionProcessHook {
    fn execute_native_tool(&self, request: NativeToolExecutionRequest) -> Option<ToolCallResult> {
        let prepared = prepare_live_execution(self.server.clone(), request)?;
        let (notification_tx, notification_rx) = unbounded();
        let (result_tx, result_rx) = oneshot::channel();

        tokio::spawn(async move {
            let result = run_live_execution_process(prepared, notification_tx).await;
            let _ = result_tx.send(result);
        });

        Some(ToolCallResult {
            result: Box::new(
                async move {
                    result_rx.await.unwrap_or_else(|_| {
                        Err(ErrorData::new(
                            ErrorCode::INTERNAL_ERROR,
                            "Live execution process task ended before returning a result",
                            None,
                        ))
                    })
                }
                .boxed(),
            ),
            notification_stream: Some(Box::new(notification_rx)),
        })
    }
}

fn prepare_live_execution(
    server: ExecutionProcessServer,
    request: NativeToolExecutionRequest,
) -> Option<PreparedLiveExecution> {
    let tool_name = canonical_shell_tool_name(&request.tool_name)?;
    if request.context.workspace_sandbox.is_some() {
        return None;
    }
    if shell_background_requested(tool_name, &request.params) {
        return None;
    }
    let command_text = request
        .params
        .get("command")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())?
        .to_string();
    let turn_context = aster::session_context::current_turn_context();
    let runtime_metadata = turn_context_metadata(turn_context.as_ref());
    let approval_policy = turn_context
        .as_ref()
        .and_then(|context| context.approval_policy.clone());
    let sandbox_policy = turn_context
        .as_ref()
        .and_then(|context| context.sandbox_policy.clone());
    let decision = decide_tool_execution(ToolExecutionDecisionInput {
        tool_name,
        params: &json!({ "command": command_text.clone() }),
        working_directory: &request.context.working_directory,
        surface: "runtime_live_process",
        auto_mode: false,
        bypass_restrictions: false,
        approval_policy: approval_policy.as_deref(),
        requested_sandbox_policy: sandbox_policy.as_deref(),
        resolver_input: ToolExecutionResolverInput {
            persisted_policy: None,
            request_metadata: runtime_metadata.as_ref(),
        },
    });
    if !matches!(decision.kind, ToolExecutionDecisionKind::Allow)
        || decision.requires_sandboxed_execution()
    {
        return None;
    }

    let mut env = request.context.environment.clone();
    env.insert("ASTER_TERMINAL".to_string(), "1".to_string());
    let command = shell_argv(tool_name, &command_text);
    let working_directory = request
        .context
        .working_directory
        .to_string_lossy()
        .to_string();

    Some(PreparedLiveExecution {
        server,
        process_id: format!("{PROCESS_ID_PREFIX}{}", request.tool_id),
        tool_id: request.tool_id,
        tool_name: tool_name.to_string(),
        command_text,
        command,
        working_directory,
        approval_policy,
        sandbox_policy,
        runtime_metadata,
        env,
        cancellation_token: request.context.cancellation_token,
    })
}

async fn run_live_execution_process(
    prepared: PreparedLiveExecution,
    notification_tx: UnboundedSender<ServerNotification>,
) -> Result<CallToolResult, ErrorData> {
    let start_response = prepared
        .server
        .start_process(ExecutionProcessStartParams {
            process_id: prepared.process_id.clone(),
            tool_id: prepared.tool_id.clone(),
            tool_name: prepared.tool_name.clone(),
            command: prepared.command.clone(),
            working_directory: prepared.working_directory.clone(),
            approval_policy: prepared.approval_policy.clone(),
            sandbox_policy: prepared.sandbox_policy.clone(),
            runtime_metadata: prepared.runtime_metadata.clone(),
            cwd: Some(prepared.working_directory.clone()),
            env: prepared.env.clone(),
        })
        .await
        .map_err(execution_error)?;

    send_notification(
        &notification_tx,
        snapshot_notification_data(&prepared, &start_response.snapshot, "started"),
    );

    let mut after_sequence = None;
    loop {
        after_sequence = drain_process_output(&prepared, &notification_tx, after_sequence)?;

        if prepared
            .cancellation_token
            .as_ref()
            .is_some_and(|token| token.is_cancelled())
        {
            let _ = prepared.server.terminate(ExecutionProcessIdParams {
                process_id: prepared.process_id.clone(),
            });
        }

        let status_response = prepared
            .server
            .status(ExecutionProcessIdParams {
                process_id: prepared.process_id.clone(),
            })
            .map_err(execution_error)?;
        if process_status_is_terminal(status_response.snapshot.status) {
            after_sequence = drain_process_output(&prepared, &notification_tx, after_sequence)?;
            let _ = after_sequence;
            send_notification(
                &notification_tx,
                snapshot_notification_data(&prepared, &status_response.snapshot, "completed"),
            );
            return Ok(call_tool_result_from_snapshot(
                &prepared,
                status_response.snapshot,
            ));
        }

        tokio::time::sleep(POLL_INTERVAL).await;
    }
}

fn drain_process_output(
    prepared: &PreparedLiveExecution,
    notification_tx: &UnboundedSender<ServerNotification>,
    after_sequence: Option<u64>,
) -> Result<Option<u64>, ErrorData> {
    let response = prepared
        .server
        .drain_output(ExecutionProcessDrainOutputParams {
            process_id: Some(prepared.process_id.clone()),
            after_sequence,
            limit: Some(DRAIN_LIMIT),
            max_bytes: Some(DRAIN_MAX_BYTES),
        })
        .map_err(execution_error)?;
    for delta in response.deltas {
        send_notification(
            notification_tx,
            output_delta_notification_data(prepared, &delta),
        );
    }
    Ok(response.next_sequence.or(after_sequence))
}

fn send_notification(sender: &UnboundedSender<ServerNotification>, data: Value) {
    let _ = sender.unbounded_send(ServerNotification::LoggingMessageNotification(
        LoggingMessageNotification {
            method: LoggingMessageNotificationMethod,
            params: LoggingMessageNotificationParam {
                level: LoggingLevel::Info,
                logger: Some("runtime_live_process".to_string()),
                data,
            },
            extensions: Default::default(),
        },
    ));
}

fn call_tool_result_from_snapshot(
    prepared: &PreparedLiveExecution,
    snapshot: ExecutionProcessSnapshot,
) -> CallToolResult {
    let success = snapshot.status == ExecutionProcessStatus::Exited
        && snapshot.exit_code.unwrap_or_default() == 0
        && snapshot.failure.is_none();
    let mut metadata = snapshot_metadata(prepared, &snapshot);
    metadata.insert(
        "executionProcessControlStatus".to_string(),
        json!("registered"),
    );
    metadata.insert(
        "execution_process_control_status".to_string(),
        json!("registered"),
    );
    insert_stdin_writable_metadata(&mut metadata, snapshot.status);
    let text = if !snapshot.retained_output.trim().is_empty() {
        snapshot.retained_output.clone()
    } else if let Some(failure) = snapshot.failure.as_ref() {
        failure.clone()
    } else {
        format!(
            "Process {} finished with status {}",
            snapshot.process_id,
            process_status_label(snapshot.status)
        )
    };
    CallToolResult {
        content: vec![Content::text(text)],
        structured_content: Some(Value::Object(metadata.clone())),
        is_error: Some(!success),
        meta: Some(Meta(metadata)),
    }
}

fn snapshot_notification_data(
    prepared: &PreparedLiveExecution,
    snapshot: &ExecutionProcessSnapshot,
    phase: &str,
) -> Value {
    let mut metadata = snapshot_metadata(prepared, snapshot);
    metadata.insert("phase".to_string(), json!(phase));
    metadata.insert("message".to_string(), json!(""));
    metadata.insert("delta".to_string(), json!(""));
    Value::Object(metadata)
}

fn output_delta_notification_data(
    prepared: &PreparedLiveExecution,
    delta: &ExecutionProcessOutputDelta,
) -> Value {
    let mut metadata = base_metadata(prepared);
    metadata.insert("delta".to_string(), json!(delta.delta));
    metadata.insert("message".to_string(), json!(delta.delta));
    metadata.insert("executionProcessStatus".to_string(), json!("running"));
    metadata.insert("execution_process_status".to_string(), json!("running"));
    metadata.insert("outputSequence".to_string(), json!(delta.sequence));
    metadata.insert("output_sequence".to_string(), json!(delta.sequence));
    metadata.insert(
        "outputKind".to_string(),
        json!(output_kind_label(delta.kind)),
    );
    metadata.insert(
        "output_kind".to_string(),
        json!(output_kind_label(delta.kind)),
    );
    metadata.insert("outputBytes".to_string(), json!(delta.bytes));
    metadata.insert("output_bytes".to_string(), json!(delta.bytes));
    metadata.insert("outputOmittedBytes".to_string(), json!(delta.omitted_bytes));
    metadata.insert(
        "output_omitted_bytes".to_string(),
        json!(delta.omitted_bytes),
    );
    metadata.insert("outputTruncated".to_string(), json!(delta.truncated));
    metadata.insert("output_truncated".to_string(), json!(delta.truncated));
    Value::Object(metadata)
}

fn snapshot_metadata(
    prepared: &PreparedLiveExecution,
    snapshot: &ExecutionProcessSnapshot,
) -> Map<String, Value> {
    let mut metadata = base_metadata(prepared);
    metadata.insert(
        "executionProcessStatus".to_string(),
        json!(process_status_label(snapshot.status)),
    );
    metadata.insert(
        "execution_process_status".to_string(),
        json!(process_status_label(snapshot.status)),
    );
    metadata.insert("exit_code".to_string(), json!(snapshot.exit_code));
    metadata.insert("elapsedMs".to_string(), json!(snapshot.elapsed_ms));
    metadata.insert("elapsed_ms".to_string(), json!(snapshot.elapsed_ms));
    metadata.insert("outputBytes".to_string(), json!(snapshot.output_bytes));
    metadata.insert("output_bytes".to_string(), json!(snapshot.output_bytes));
    metadata.insert(
        "outputOmittedBytes".to_string(),
        json!(snapshot.output_omitted_bytes),
    );
    metadata.insert(
        "output_omitted_bytes".to_string(),
        json!(snapshot.output_omitted_bytes),
    );
    metadata.insert(
        "outputTruncated".to_string(),
        json!(snapshot.output_truncated),
    );
    metadata.insert(
        "output_truncated".to_string(),
        json!(snapshot.output_truncated),
    );
    if let Some(failure) = snapshot.failure.as_ref() {
        metadata.insert("failure".to_string(), json!(failure));
    }
    insert_stdin_writable_metadata(&mut metadata, snapshot.status);
    metadata
}

fn base_metadata(prepared: &PreparedLiveExecution) -> Map<String, Value> {
    Map::from_iter([
        ("processId".to_string(), json!(prepared.process_id)),
        ("process_id".to_string(), json!(prepared.process_id)),
        ("toolId".to_string(), json!(prepared.tool_id)),
        ("tool_id".to_string(), json!(prepared.tool_id)),
        ("toolName".to_string(), json!(prepared.tool_name)),
        ("tool_name".to_string(), json!(prepared.tool_name)),
        ("command".to_string(), json!(prepared.command_text)),
        ("cwd".to_string(), json!(prepared.working_directory)),
        (
            "executionProcessControlStatus".to_string(),
            json!("registered"),
        ),
        (
            "execution_process_control_status".to_string(),
            json!("registered"),
        ),
        ("executionSurface".to_string(), json!("live_process")),
        ("execution_surface".to_string(), json!("live_process")),
    ])
}

fn insert_stdin_writable_metadata(
    metadata: &mut Map<String, Value>,
    status: ExecutionProcessStatus,
) {
    let writable = !process_status_is_terminal(status);
    metadata.insert("stdinWritable".to_string(), json!(writable));
    metadata.insert("stdin_writable".to_string(), json!(writable));
}

fn canonical_shell_tool_name(tool_name: &str) -> Option<&'static str> {
    match tool_name {
        "Bash" | "BashTool" => Some("Bash"),
        "PowerShell" | "PowerShellTool" => Some("PowerShell"),
        _ => None,
    }
}

fn shell_background_requested(tool_name: &str, params: &Value) -> bool {
    match tool_name {
        "Bash" => params
            .get("background")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        "PowerShell" => params
            .get("run_in_background")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        _ => false,
    }
}

fn shell_argv(tool_name: &str, command: &str) -> Vec<String> {
    match tool_name {
        "PowerShell" => vec![
            powershell_program(),
            "-NoProfile".to_string(),
            "-NonInteractive".to_string(),
            "-Command".to_string(),
            command.to_string(),
        ],
        _ => bash_argv(command),
    }
}

fn bash_argv(command: &str) -> Vec<String> {
    if cfg!(target_os = "windows") {
        vec![
            "cmd.exe".to_string(),
            "/D".to_string(),
            "/S".to_string(),
            "/C".to_string(),
            command.to_string(),
        ]
    } else {
        vec!["sh".to_string(), "-c".to_string(), command.to_string()]
    }
}

fn powershell_program() -> String {
    ["pwsh", "powershell", "powershell.exe"]
        .into_iter()
        .find(|candidate| executable_exists_on_path(candidate))
        .unwrap_or("pwsh")
        .to_string()
}

fn executable_exists_on_path(program: &str) -> bool {
    let path = Path::new(program);
    if path.components().count() > 1 {
        return path.exists();
    }
    let Some(paths) = std::env::var_os("PATH") else {
        return false;
    };
    std::env::split_paths(&paths).any(|dir| executable_candidate_exists(&dir, program))
}

fn executable_candidate_exists(dir: &Path, program: &str) -> bool {
    let direct = dir.join(program);
    if direct.is_file() {
        return true;
    }
    if !cfg!(target_os = "windows") {
        return false;
    }
    let extensions = std::env::var_os("PATHEXT")
        .map(|value| {
            value
                .to_string_lossy()
                .split(';')
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_else(|| vec![".EXE".to_string(), ".CMD".to_string(), ".BAT".to_string()]);
    extensions
        .iter()
        .any(|extension| dir.join(format!("{program}{extension}")).is_file())
}

fn turn_context_metadata(
    turn_context: Option<&aster::session::TurnContextOverride>,
) -> Option<Value> {
    let metadata = &turn_context?.metadata;
    (!metadata.is_empty()).then(|| Value::Object(Map::from_iter(metadata.clone())))
}

fn process_status_is_terminal(status: ExecutionProcessStatus) -> bool {
    matches!(
        status,
        ExecutionProcessStatus::Exited
            | ExecutionProcessStatus::Interrupted
            | ExecutionProcessStatus::Terminated
            | ExecutionProcessStatus::Failed
    )
}

fn process_status_label(status: ExecutionProcessStatus) -> &'static str {
    match status {
        ExecutionProcessStatus::Starting => "starting",
        ExecutionProcessStatus::Running => "running",
        ExecutionProcessStatus::Exited => "exited",
        ExecutionProcessStatus::Interrupted => "interrupted",
        ExecutionProcessStatus::Terminated => "terminated",
        ExecutionProcessStatus::Failed => "failed",
    }
}

fn output_kind_label(kind: ExecutionProcessOutputKind) -> &'static str {
    match kind {
        ExecutionProcessOutputKind::Stdout => "stdout",
        ExecutionProcessOutputKind::Stderr => "stderr",
        ExecutionProcessOutputKind::Combined => "combined",
    }
}

fn execution_error(error: crate::execution_process::ExecutionProcessError) -> ErrorData {
    ErrorData::new(ErrorCode::INTERNAL_ERROR, error.to_string(), None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use aster::tools::ToolContext;
    use std::path::PathBuf;

    #[tokio::test]
    async fn hook_runs_bash_through_shared_execution_process_server() {
        let server = ExecutionProcessServer::default();
        let hook = RuntimeLiveExecutionProcessHook::new(server.clone());
        let turn_context = aster::session::TurnContextOverride {
            approval_policy: Some("never".to_string()),
            sandbox_policy: Some("danger-full-access".to_string()),
            ..aster::session::TurnContextOverride::default()
        };
        let tool_call = aster::session_context::with_turn_context(Some(turn_context), async {
            hook.execute_native_tool(NativeToolExecutionRequest {
                tool_name: "Bash".to_string(),
                tool_id: "tool-live-test".to_string(),
                params: json!({ "command": "printf live-process" }),
                context: ToolContext::new(std::env::current_dir().unwrap_or_default()),
            })
        })
        .await
        .expect("bash should be handled by live execution hook");

        let result = tool_call.result.await.expect("tool result should succeed");

        assert_eq!(result.is_error, Some(false));
        assert_eq!(
            result
                .meta
                .as_ref()
                .and_then(|meta| meta.0.get("processId"))
                .and_then(Value::as_str),
            Some("process-tool-live-test")
        );
        assert_eq!(
            result
                .meta
                .as_ref()
                .and_then(|meta| meta.0.get("executionProcessControlStatus"))
                .and_then(Value::as_str),
            Some("registered")
        );
        assert_eq!(
            result
                .meta
                .as_ref()
                .and_then(|meta| meta.0.get("stdinWritable"))
                .and_then(Value::as_bool),
            Some(false)
        );
        let drained = server
            .drain_output(ExecutionProcessDrainOutputParams {
                process_id: Some("process-tool-live-test".to_string()),
                after_sequence: None,
                limit: Some(16),
                max_bytes: Some(1024),
            })
            .expect("shared server should retain live process output");
        assert!(drained
            .deltas
            .iter()
            .any(|delta| delta.delta.contains("live-process")));
    }

    #[test]
    fn hook_ignores_background_shell_requests() {
        let hook = RuntimeLiveExecutionProcessHook::new(ExecutionProcessServer::default());
        let result = hook.execute_native_tool(NativeToolExecutionRequest {
            tool_name: "Bash".to_string(),
            tool_id: "tool-background".to_string(),
            params: json!({ "command": "sleep 1", "background": true }),
            context: ToolContext::new(PathBuf::from(".")),
        });

        assert!(result.is_none());
    }
}
