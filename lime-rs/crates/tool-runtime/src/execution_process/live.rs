use app_server_protocol::{
    ExecutionProcessDrainOutputParams, ExecutionProcessDrainOutputResponse,
    ExecutionProcessIdParams, ExecutionProcessOutputDelta, ExecutionProcessOutputKind,
    ExecutionProcessSnapshot, ExecutionProcessStartParams, ExecutionProcessStartResponse,
    ExecutionProcessStatus, ExecutionProcessStatusResponse,
};
use async_trait::async_trait;
use rmcp::model::{CallToolResult, Content, ErrorCode, ErrorData, Meta};
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;
use tokio_util::sync::CancellationToken;

pub const RUNTIME_LIVE_EXECUTION_PROCESS_ID_PREFIX: &str = "process-";
pub const RUNTIME_LIVE_EXECUTION_DRAIN_LIMIT: u16 = 128;
pub const RUNTIME_LIVE_EXECUTION_DEFAULT_DRAIN_MAX_BYTES: u64 = 64 * 1024;
const RUNTIME_LIVE_EXECUTION_POLL_INTERVAL: Duration = Duration::from_millis(50);

pub type RuntimeLiveExecutionNotificationSink = Arc<dyn Fn(Value) + Send + Sync>;

#[async_trait]
pub trait RuntimeLiveExecutionGateway: Send + Sync {
    async fn start_process(
        &self,
        params: ExecutionProcessStartParams,
    ) -> Result<ExecutionProcessStartResponse, String>;

    fn terminate(
        &self,
        params: ExecutionProcessIdParams,
    ) -> Result<ExecutionProcessStatusResponse, String>;

    fn status(
        &self,
        params: ExecutionProcessIdParams,
    ) -> Result<ExecutionProcessStatusResponse, String>;

    fn drain_output(
        &self,
        params: ExecutionProcessDrainOutputParams,
    ) -> Result<ExecutionProcessDrainOutputResponse, String>;
}

#[derive(Clone)]
pub struct RuntimeLiveExecutionRequest {
    pub process_id: String,
    pub tool_id: String,
    pub tool_name: String,
    pub command_text: String,
    pub command: Vec<String>,
    pub working_directory: String,
    pub approval_policy: Option<String>,
    pub sandbox_policy: Option<String>,
    pub runtime_metadata: Option<Value>,
    pub output_drain_max_bytes: u64,
    pub output_truncation_policy: crate::tool_io::ToolOutputTruncationPolicy,
    pub env: HashMap<String, String>,
    pub cancellation_token: Option<CancellationToken>,
}

pub async fn run_runtime_live_execution_process(
    gateway: Arc<dyn RuntimeLiveExecutionGateway>,
    request: RuntimeLiveExecutionRequest,
    notification_sink: RuntimeLiveExecutionNotificationSink,
) -> Result<CallToolResult, ErrorData> {
    let start_response = gateway
        .start_process(ExecutionProcessStartParams {
            process_id: request.process_id.clone(),
            tool_id: request.tool_id.clone(),
            tool_name: request.tool_name.clone(),
            command: request.command.clone(),
            working_directory: request.working_directory.clone(),
            approval_policy: request.approval_policy.clone(),
            sandbox_policy: request.sandbox_policy.clone(),
            runtime_metadata: request.runtime_metadata.clone(),
            cwd: Some(request.working_directory.clone()),
            env: request.env.clone(),
        })
        .await
        .map_err(execution_error)?;

    send_notification(
        &notification_sink,
        snapshot_notification_data(&request, &start_response.snapshot, "started"),
    );

    let mut after_sequence = None;
    loop {
        after_sequence = drain_process_output(
            &request,
            gateway.as_ref(),
            &notification_sink,
            after_sequence,
        )?;

        if request
            .cancellation_token
            .as_ref()
            .is_some_and(|token| token.is_cancelled())
        {
            let _ = gateway.terminate(ExecutionProcessIdParams {
                process_id: request.process_id.clone(),
            });
        }

        let status_response = gateway
            .status(ExecutionProcessIdParams {
                process_id: request.process_id.clone(),
            })
            .map_err(execution_error)?;
        if process_status_is_terminal(status_response.snapshot.status) {
            after_sequence = drain_process_output(
                &request,
                gateway.as_ref(),
                &notification_sink,
                after_sequence,
            )?;
            let _ = after_sequence;
            send_notification(
                &notification_sink,
                snapshot_notification_data(&request, &status_response.snapshot, "completed"),
            );
            return Ok(call_tool_result_from_snapshot(
                &request,
                status_response.snapshot,
            ));
        }

        tokio::time::sleep(RUNTIME_LIVE_EXECUTION_POLL_INTERVAL).await;
    }
}

fn drain_process_output(
    request: &RuntimeLiveExecutionRequest,
    gateway: &dyn RuntimeLiveExecutionGateway,
    notification_sink: &RuntimeLiveExecutionNotificationSink,
    after_sequence: Option<u64>,
) -> Result<Option<u64>, ErrorData> {
    let response = gateway
        .drain_output(ExecutionProcessDrainOutputParams {
            process_id: Some(request.process_id.clone()),
            after_sequence,
            limit: Some(RUNTIME_LIVE_EXECUTION_DRAIN_LIMIT),
            max_bytes: Some(request.output_drain_max_bytes),
        })
        .map_err(execution_error)?;
    for delta in response.deltas {
        send_notification(
            notification_sink,
            output_delta_notification_data(request, &delta),
        );
    }
    Ok(response.next_sequence.or(after_sequence))
}

fn send_notification(sink: &RuntimeLiveExecutionNotificationSink, data: Value) {
    sink(data);
}

fn call_tool_result_from_snapshot(
    request: &RuntimeLiveExecutionRequest,
    snapshot: ExecutionProcessSnapshot,
) -> CallToolResult {
    let success = snapshot.status == ExecutionProcessStatus::Exited
        && snapshot.exit_code.unwrap_or_default() == 0
        && snapshot.failure.is_none();
    let mut metadata = snapshot_metadata(request, &snapshot);
    metadata.insert(
        "executionProcessControlStatus".to_string(),
        json!("registered"),
    );
    metadata.insert(
        "execution_process_control_status".to_string(),
        json!("registered"),
    );
    insert_stdin_writable_metadata(&mut metadata, snapshot.status);
    let raw_text = if !snapshot.retained_output.trim().is_empty() {
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
    let text =
        crate::tool_io::format_tool_output_for_model(&raw_text, request.output_truncation_policy);
    CallToolResult {
        content: vec![Content::text(text)],
        structured_content: Some(Value::Object(metadata.clone())),
        is_error: Some(!success),
        meta: Some(Meta(metadata)),
    }
}

fn snapshot_notification_data(
    request: &RuntimeLiveExecutionRequest,
    snapshot: &ExecutionProcessSnapshot,
    phase: &str,
) -> Value {
    let mut metadata = snapshot_metadata(request, snapshot);
    metadata.insert("phase".to_string(), json!(phase));
    metadata.insert("message".to_string(), json!(""));
    metadata.insert("delta".to_string(), json!(""));
    Value::Object(metadata)
}

fn output_delta_notification_data(
    request: &RuntimeLiveExecutionRequest,
    delta: &ExecutionProcessOutputDelta,
) -> Value {
    let mut metadata = base_metadata(request);
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
    request: &RuntimeLiveExecutionRequest,
    snapshot: &ExecutionProcessSnapshot,
) -> Map<String, Value> {
    let mut metadata = base_metadata(request);
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

fn base_metadata(request: &RuntimeLiveExecutionRequest) -> Map<String, Value> {
    Map::from_iter([
        ("processId".to_string(), json!(request.process_id)),
        ("process_id".to_string(), json!(request.process_id)),
        ("toolId".to_string(), json!(request.tool_id)),
        ("tool_id".to_string(), json!(request.tool_id)),
        ("toolName".to_string(), json!(request.tool_name)),
        ("tool_name".to_string(), json!(request.tool_name)),
        ("command".to_string(), json!(request.command_text)),
        ("cwd".to_string(), json!(request.working_directory)),
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

pub fn runtime_live_execution_process_id(tool_id: &str) -> String {
    format!("{RUNTIME_LIVE_EXECUTION_PROCESS_ID_PREFIX}{tool_id}")
}

pub fn runtime_live_execution_canonical_shell_tool_name(tool_name: &str) -> Option<&'static str> {
    match tool_name {
        "Bash" | "BashTool" => Some("Bash"),
        "PowerShell" | "PowerShellTool" => Some("PowerShell"),
        _ => None,
    }
}

pub fn runtime_live_execution_shell_background_requested(tool_name: &str, params: &Value) -> bool {
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

pub fn runtime_live_execution_shell_command(tool_name: &str, command: &str) -> Vec<String> {
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

fn execution_error(error: String) -> ErrorData {
    ErrorData::new(ErrorCode::INTERNAL_ERROR, error, None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use app_server_protocol::{
        ExecutionProcessOutputKind, ExecutionProcessStatus, ExecutionProcessStatusResponse,
    };
    use std::collections::VecDeque;
    use std::sync::Mutex;

    #[derive(Default)]
    struct TestGateway {
        output: Mutex<VecDeque<ExecutionProcessOutputDelta>>,
        retained_output: Mutex<Option<String>>,
        snapshot: Mutex<Option<ExecutionProcessSnapshot>>,
    }

    impl TestGateway {
        fn with_retained_output(output: impl Into<String>) -> Self {
            Self {
                retained_output: Mutex::new(Some(output.into())),
                ..Self::default()
            }
        }
    }

    #[async_trait]
    impl RuntimeLiveExecutionGateway for TestGateway {
        async fn start_process(
            &self,
            params: ExecutionProcessStartParams,
        ) -> Result<ExecutionProcessStartResponse, String> {
            let output = self
                .retained_output
                .lock()
                .expect("retained output lock")
                .clone()
                .unwrap_or_else(|| "live-process".to_string());
            let snapshot = ExecutionProcessSnapshot {
                process_id: params.process_id.clone(),
                tool_id: params.tool_id.clone(),
                tool_name: params.tool_name,
                status: ExecutionProcessStatus::Exited,
                exit_code: Some(0),
                elapsed_ms: 1,
                output_bytes: output.len() as u64,
                output_omitted_bytes: 0,
                output_truncated: false,
                retained_output: output.clone(),
                failure: None,
            };
            self.output
                .lock()
                .expect("output lock")
                .push_back(ExecutionProcessOutputDelta {
                    process_id: params.process_id,
                    tool_id: params.tool_id,
                    sequence: 1,
                    kind: ExecutionProcessOutputKind::Stdout,
                    delta: output,
                    bytes: 12,
                    omitted_bytes: 0,
                    truncated: false,
                });
            *self.snapshot.lock().expect("snapshot lock") = Some(snapshot.clone());
            Ok(ExecutionProcessStartResponse { snapshot })
        }

        fn terminate(
            &self,
            _params: ExecutionProcessIdParams,
        ) -> Result<ExecutionProcessStatusResponse, String> {
            Ok(ExecutionProcessStatusResponse {
                snapshot: self
                    .snapshot
                    .lock()
                    .expect("snapshot lock")
                    .clone()
                    .unwrap(),
            })
        }

        fn status(
            &self,
            _params: ExecutionProcessIdParams,
        ) -> Result<ExecutionProcessStatusResponse, String> {
            Ok(ExecutionProcessStatusResponse {
                snapshot: self
                    .snapshot
                    .lock()
                    .expect("snapshot lock")
                    .clone()
                    .unwrap(),
            })
        }

        fn drain_output(
            &self,
            _params: ExecutionProcessDrainOutputParams,
        ) -> Result<ExecutionProcessDrainOutputResponse, String> {
            let mut output = self.output.lock().expect("output lock");
            Ok(ExecutionProcessDrainOutputResponse {
                deltas: output.drain(..).collect(),
                next_sequence: Some(1),
            })
        }
    }

    fn request() -> RuntimeLiveExecutionRequest {
        RuntimeLiveExecutionRequest {
            process_id: runtime_live_execution_process_id("tool-live-test"),
            tool_id: "tool-live-test".to_string(),
            tool_name: "Bash".to_string(),
            command_text: "printf live-process".to_string(),
            command: runtime_live_execution_shell_command("Bash", "printf live-process"),
            working_directory: ".".to_string(),
            approval_policy: Some("never".to_string()),
            sandbox_policy: Some("danger-full-access".to_string()),
            runtime_metadata: None,
            output_drain_max_bytes: RUNTIME_LIVE_EXECUTION_DEFAULT_DRAIN_MAX_BYTES,
            output_truncation_policy: crate::tool_io::ToolOutputTruncationPolicy::Bytes(
                RUNTIME_LIVE_EXECUTION_DEFAULT_DRAIN_MAX_BYTES as usize,
            ),
            env: HashMap::new(),
            cancellation_token: None,
        }
    }

    #[tokio::test]
    async fn runner_returns_tool_result_and_notifications() {
        let notifications = Arc::new(Mutex::new(Vec::new()));
        let sink = {
            let notifications = Arc::clone(&notifications);
            Arc::new(move |notification| {
                notifications
                    .lock()
                    .expect("notifications lock")
                    .push(notification);
            })
        };

        let result =
            run_runtime_live_execution_process(Arc::new(TestGateway::default()), request(), sink)
                .await
                .expect("live execution should succeed");

        assert_eq!(result.is_error, Some(false));
        assert_eq!(
            result
                .meta
                .as_ref()
                .and_then(|meta| meta.0.get("processId"))
                .and_then(Value::as_str),
            Some("process-tool-live-test")
        );
        assert!(notifications
            .lock()
            .expect("notifications lock")
            .iter()
            .any(|notification| notification.get("delta") == Some(&json!("live-process"))));
    }

    #[tokio::test]
    async fn runner_applies_token_truncation_to_final_output() {
        let output = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda ".repeat(20);
        let mut request = request();
        request.output_truncation_policy = crate::tool_io::ToolOutputTruncationPolicy::Tokens(12);

        let result = run_runtime_live_execution_process(
            Arc::new(TestGateway::with_retained_output(output)),
            request,
            Arc::new(|_notification| {}),
        )
        .await
        .expect("live execution should succeed");
        let text: &str = result
            .content
            .iter()
            .find_map(|content| content.as_text())
            .map(|content| content.text.as_ref())
            .expect("text output");

        assert!(text.starts_with("Warning: truncated output"));
        assert!(text.contains("tokens truncated"));
    }
}
