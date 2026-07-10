use crate::command_semantics::{
    interpret_bash_command_result, interpret_powershell_command_result, CommandInterpretation,
};
use crate::shell_analysis::{
    command_references_wsl_drive_mount, detect_blocked_sleep_pattern, missing_bash_read_targets,
    missing_powershell_read_targets,
};
use crate::shell_permission::{check_shell_command_permission, ShellPermissionDecision};
use crate::shell_runtime::{build_platform_shell_command, detect_powershell_executable};
use crate::subprocess::{
    configure_command_for_gui, decode_process_output, summarize_decoded_with,
    wrap_powershell_command_for_utf8,
};
use crate::tool_executor::RuntimeToolTurnContext;
use crate::tool_result_projection::{
    runtime_tool_result_to_call_tool_result, RuntimeToolResultParts,
};
use rmcp::model::{CallToolResult, ErrorCode, ErrorData};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;
use tokio::io::{AsyncRead, AsyncReadExt};
use tokio::process::Command;
use tokio_util::sync::CancellationToken;

const MAX_OUTPUT_LENGTH: usize = 128 * 1024;
const DEFAULT_BASH_TIMEOUT_SECS: u64 = 300;
const MAX_BASH_TIMEOUT_SECS: u64 = 1800;
const DEFAULT_POWERSHELL_TIMEOUT_MS: u64 = 300_000;
const MAX_POWERSHELL_TIMEOUT_MS: u64 = 1_800_000;

pub struct RuntimeShellToolRequest<'a> {
    pub tool_name: &'a str,
    pub params: &'a Value,
    pub working_directory: PathBuf,
    pub session_id: String,
    pub environment: HashMap<String, String>,
    pub has_workspace_sandbox: bool,
    pub cancel_token: Option<CancellationToken>,
    pub turn_context: Option<&'a RuntimeToolTurnContext>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RuntimeShellToolKind {
    Bash,
    PowerShell,
}

#[derive(Debug, Deserialize)]
struct BashInput {
    command: String,
    #[serde(default)]
    timeout: Option<u64>,
    #[serde(default)]
    background: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct PowerShellInput {
    command: String,
    #[serde(default)]
    timeout: Option<u64>,
    #[serde(default, alias = "runInBackground")]
    run_in_background: Option<bool>,
}

#[derive(Debug)]
struct CapturedProcessOutput {
    exit_code: i32,
    stdout: CapturedOutput,
    stderr: CapturedOutput,
}

#[derive(Debug, Clone)]
struct CapturedOutput {
    retained: Vec<u8>,
    bytes: usize,
    omitted_bytes: usize,
    truncated: bool,
}

#[derive(Debug, Clone)]
struct BoundedOutputBuffer {
    data: Vec<u8>,
    bytes: usize,
    omitted_bytes: usize,
    limit: usize,
}

impl BoundedOutputBuffer {
    fn new(limit: usize) -> Self {
        Self {
            data: Vec::new(),
            bytes: 0,
            omitted_bytes: 0,
            limit,
        }
    }

    fn push_chunk(&mut self, data: &[u8]) {
        self.bytes = self.bytes.saturating_add(data.len());
        let retained = self.limit.saturating_sub(self.data.len()).min(data.len());
        self.data.extend_from_slice(&data[..retained]);
        self.omitted_bytes = self
            .omitted_bytes
            .saturating_add(data.len().saturating_sub(retained));
    }

    fn into_captured_output(self) -> CapturedOutput {
        CapturedOutput {
            retained: self.data,
            bytes: self.bytes,
            omitted_bytes: self.omitted_bytes,
            truncated: self.omitted_bytes > 0,
        }
    }
}

impl CapturedOutput {
    fn empty() -> Self {
        Self {
            retained: Vec::new(),
            bytes: 0,
            omitted_bytes: 0,
            truncated: false,
        }
    }
}

pub async fn execute_runtime_shell_tool(
    request: RuntimeShellToolRequest<'_>,
) -> Option<Result<CallToolResult, ErrorData>> {
    let kind = runtime_shell_tool_kind(request.tool_name)?;
    if request.has_workspace_sandbox {
        return None;
    }

    let input = match parse_shell_input(kind, request.params) {
        Ok(input) => input,
        Err(error) => return Some(Err(runtime_shell_error(error))),
    };
    if input.background {
        return None;
    }

    match shell_permission_decision(
        kind,
        &input.command,
        &request.working_directory,
        request.turn_context,
    ) {
        RuntimeShellPermissionOutcome::Allow => {}
        RuntimeShellPermissionOutcome::Deny(message) => {
            return Some(Err(runtime_shell_error(message)));
        }
        RuntimeShellPermissionOutcome::FallbackToRegistry => return None,
    }

    if request
        .cancel_token
        .as_ref()
        .is_some_and(CancellationToken::is_cancelled)
    {
        return Some(Err(runtime_shell_error("Tool execution cancelled")));
    }

    let mut environment = request.environment;
    environment.insert("AGENT_TERMINAL".to_string(), "1".to_string());

    Some(
        execute_foreground_shell(
            kind,
            &input.command,
            input.timeout,
            &request.working_directory,
            environment,
            request.cancel_token,
        )
        .await,
    )
}

fn runtime_shell_tool_kind(tool_name: &str) -> Option<RuntimeShellToolKind> {
    match tool_name.trim() {
        "Bash" | "BashTool" => Some(RuntimeShellToolKind::Bash),
        "PowerShell" | "PowerShellTool" => Some(RuntimeShellToolKind::PowerShell),
        _ => None,
    }
}

#[derive(Debug)]
struct ShellExecutionInput {
    command: String,
    timeout: Duration,
    background: bool,
}

fn parse_shell_input(
    kind: RuntimeShellToolKind,
    params: &Value,
) -> Result<ShellExecutionInput, String> {
    match kind {
        RuntimeShellToolKind::Bash => {
            let input: BashInput = serde_json::from_value(params.clone())
                .map_err(|error| format!("Bash 参数无效: {error}"))?;
            let command = normalize_command(input.command, "command")?;
            let timeout_secs = input
                .timeout
                .unwrap_or(DEFAULT_BASH_TIMEOUT_SECS)
                .min(MAX_BASH_TIMEOUT_SECS);
            Ok(ShellExecutionInput {
                command,
                timeout: Duration::from_secs(timeout_secs),
                background: input.background.unwrap_or(false),
            })
        }
        RuntimeShellToolKind::PowerShell => {
            let input: PowerShellInput = serde_json::from_value(params.clone())
                .map_err(|error| format!("PowerShell 参数无效: {error}"))?;
            let command = normalize_command(input.command, "command")?;
            let timeout_ms = input
                .timeout
                .unwrap_or(DEFAULT_POWERSHELL_TIMEOUT_MS)
                .min(MAX_POWERSHELL_TIMEOUT_MS);
            Ok(ShellExecutionInput {
                command,
                timeout: Duration::from_millis(timeout_ms),
                background: input.run_in_background.unwrap_or(false),
            })
        }
    }
}

fn normalize_command(command: String, field: &str) -> Result<String, String> {
    let command = command.trim();
    if command.is_empty() {
        return Err(format!("Missing required parameter: {field}"));
    }
    Ok(command.to_string())
}

enum RuntimeShellPermissionOutcome {
    Allow,
    Deny(String),
    FallbackToRegistry,
}

fn shell_permission_decision(
    kind: RuntimeShellToolKind,
    command: &str,
    working_directory: &Path,
    turn_context: Option<&RuntimeToolTurnContext>,
) -> RuntimeShellPermissionOutcome {
    match check_shell_command_permission(shell_tool_name(kind), command, working_directory) {
        ShellPermissionDecision::Allow => RuntimeShellPermissionOutcome::Allow,
        ShellPermissionDecision::Deny(reason) => RuntimeShellPermissionOutcome::Deny(reason),
        ShellPermissionDecision::RequiresConfirmation(_) => {
            if turn_context_allows_shell_without_confirmation(turn_context) {
                RuntimeShellPermissionOutcome::Allow
            } else {
                RuntimeShellPermissionOutcome::FallbackToRegistry
            }
        }
    }
}

fn turn_context_allows_shell_without_confirmation(
    turn_context: Option<&RuntimeToolTurnContext>,
) -> bool {
    turn_context.is_some_and(|context| {
        policy_is_full_access(context.approval_policy.as_deref())
            || policy_is_full_access(context.sandbox_policy.as_deref())
            || context_metadata_is_full_access(&context.metadata)
    })
}

fn policy_is_full_access(policy: Option<&str>) -> bool {
    policy.map(str::trim).is_some_and(|policy| {
        policy.eq_ignore_ascii_case("never")
            || policy.eq_ignore_ascii_case("full-access")
            || policy.eq_ignore_ascii_case("full_access")
            || policy.eq_ignore_ascii_case("danger-full-access")
            || policy.eq_ignore_ascii_case("danger_full_access")
    })
}

fn context_metadata_is_full_access(metadata: &HashMap<String, Value>) -> bool {
    ["accessMode", "access_mode"].iter().any(|key| {
        metadata
            .get(*key)
            .and_then(Value::as_str)
            .is_some_and(|value| {
                value.trim().eq_ignore_ascii_case("full-access")
                    || value.trim().eq_ignore_ascii_case("full_access")
            })
    })
}

async fn execute_foreground_shell(
    kind: RuntimeShellToolKind,
    command: &str,
    timeout: Duration,
    working_directory: &Path,
    environment: HashMap<String, String>,
    cancel_token: Option<CancellationToken>,
) -> Result<CallToolResult, ErrorData> {
    if let Some(preflight_result) = preflight_shell(kind, command, working_directory) {
        return Ok(preflight_result);
    }

    let output = execute_embedded_command(
        kind,
        command,
        timeout,
        working_directory,
        &environment,
        cancel_token,
    )
    .await?;
    Ok(call_tool_result_from_process_output(
        kind,
        command,
        working_directory,
        output,
    ))
}

fn preflight_shell(
    kind: RuntimeShellToolKind,
    command: &str,
    working_directory: &Path,
) -> Option<CallToolResult> {
    match kind {
        RuntimeShellToolKind::Bash => {
            if cfg!(target_os = "windows") && command_references_wsl_drive_mount(command) {
                return Some(error_result_with_metadata(
                    "当前是 Windows 原生 shell 运行时，不应使用 `/mnt/c`、`/mnt/d` 这类 WSL/Linux 挂载路径。请改用 Windows 原生路径，或先用 PowerShell 查询 `$env:SystemDrive` / `Get-PSDrive -PSProvider FileSystem` 后再继续。",
                    HashMap::from([
                        ("preflight_check".to_string(), json!("windows_wsl_drive_mount")),
                        ("shell".to_string(), json!("powershell")),
                        ("command".to_string(), json!(command)),
                    ]),
                ));
            }
            let missing = missing_bash_read_targets(command, working_directory);
            if !missing.is_empty() {
                return Some(missing_read_target_result(&missing));
            }
        }
        RuntimeShellToolKind::PowerShell => {
            if detect_blocked_sleep_pattern(command).is_some() {
                return Some(error_result_with_metadata(
                    "Blocked: long Start-Sleep commands should use the Sleep tool or run_in_background.",
                    HashMap::from([
                        ("preflight_check".to_string(), json!("blocked_sleep")),
                        ("shell".to_string(), json!("powershell")),
                        ("command".to_string(), json!(command)),
                    ]),
                ));
            }
            if cfg!(target_os = "windows") && command_references_wsl_drive_mount(command) {
                return Some(error_result_with_metadata(
                    "当前是 Windows 原生 PowerShell 运行时，不应使用 `/mnt/c`、`/mnt/d` 这类 WSL/Linux 挂载路径。请改用 Windows 原生路径，或先用 `$env:SystemDrive` / `Get-PSDrive -PSProvider FileSystem` 确认系统盘后再继续。",
                    HashMap::from([
                        ("preflight_check".to_string(), json!("windows_wsl_drive_mount")),
                        ("shell".to_string(), json!("powershell")),
                        ("command".to_string(), json!(command)),
                    ]),
                ));
            }
            let missing = missing_powershell_read_targets(command, working_directory);
            if !missing.is_empty() {
                return Some(missing_read_target_result(&missing));
            }
        }
    }
    None
}

fn missing_read_target_result(paths: &[PathBuf]) -> CallToolResult {
    let path_values = paths
        .iter()
        .map(|path| path.display().to_string())
        .collect::<Vec<_>>();
    let message = if path_values.len() == 1 {
        format!(
            "路径不存在：{}。请先确认父目录，或先列目录再继续读取。",
            path_values[0]
        )
    } else {
        format!(
            "以下路径不存在：{}。请先确认父目录，或先列目录再继续读取。",
            path_values.join(", ")
        )
    };

    error_result_with_metadata(
        message,
        HashMap::from([
            ("preflight_check".to_string(), json!("missing_read_target")),
            ("missing_paths".to_string(), json!(path_values)),
        ]),
    )
}

fn error_result_with_metadata(
    error: impl Into<String>,
    metadata: HashMap<String, Value>,
) -> CallToolResult {
    runtime_tool_result_to_call_tool_result(RuntimeToolResultParts {
        success: false,
        output: None,
        error: Some(error.into()),
        metadata,
    })
}

async fn execute_embedded_command(
    kind: RuntimeShellToolKind,
    command: &str,
    timeout: Duration,
    working_directory: &Path,
    environment: &HashMap<String, String>,
    cancel_token: Option<CancellationToken>,
) -> Result<CapturedProcessOutput, ErrorData> {
    let mut child = build_command(kind, command, working_directory, environment)?
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .map_err(|error| runtime_shell_error(format!("Failed to execute command: {error}")))?;
    let stdout_reader = child
        .stdout
        .take()
        .map(|stdout| tokio::spawn(read_bounded_output_stream(stdout)));
    let stderr_reader = child
        .stderr
        .take()
        .map(|stderr| tokio::spawn(read_bounded_output_stream(stderr)));

    let wait_result = if let Some(cancel_token) = cancel_token {
        tokio::select! {
            status = tokio::time::timeout(timeout, child.wait()) => status,
            _ = cancel_token.cancelled() => {
                let _ = child.kill().await;
                let _ = child.wait().await;
                return Err(runtime_shell_error("Tool execution cancelled"));
            }
        }
    } else {
        tokio::time::timeout(timeout, child.wait()).await
    };

    let status = match wait_result {
        Ok(Ok(status)) => status,
        Ok(Err(error)) => {
            return Err(runtime_shell_error(format!(
                "Failed to execute command: {error}"
            )));
        }
        Err(_) => {
            let _ = child.kill().await;
            let _ = child.wait().await;
            return Err(runtime_shell_error(format!(
                "Command timed out after {}ms",
                timeout.as_millis()
            )));
        }
    };

    Ok(CapturedProcessOutput {
        exit_code: status.code().unwrap_or(-1),
        stdout: join_bounded_output_reader(stdout_reader, "stdout").await?,
        stderr: join_bounded_output_reader(stderr_reader, "stderr").await?,
    })
}

fn build_command(
    kind: RuntimeShellToolKind,
    command: &str,
    working_directory: &Path,
    environment: &HashMap<String, String>,
) -> Result<Command, ErrorData> {
    let mut cmd = match kind {
        RuntimeShellToolKind::Bash => build_platform_shell_command(command),
        RuntimeShellToolKind::PowerShell => {
            let executable_path = detect_powershell_executable().ok_or_else(|| {
                runtime_shell_error(
                    "PowerShell runtime unavailable: neither `pwsh` nor Windows PowerShell was found.",
                )
            })?;
            let command = wrap_powershell_command_for_utf8(command);
            let mut cmd = Command::new(executable_path);
            configure_command_for_gui(&mut cmd);
            cmd.args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                command.as_str(),
            ]);
            cmd
        }
    };

    cmd.current_dir(working_directory);
    for (key, value) in environment {
        cmd.env(key, value);
    }
    Ok(cmd)
}

async fn read_bounded_output_stream<R>(mut stream: R) -> Result<CapturedOutput, String>
where
    R: AsyncRead + Unpin,
{
    let mut output = BoundedOutputBuffer::new(MAX_OUTPUT_LENGTH);
    let mut buffer = [0u8; 8192];
    loop {
        let read_bytes = stream
            .read(&mut buffer)
            .await
            .map_err(|error| error.to_string())?;
        if read_bytes == 0 {
            break;
        }
        output.push_chunk(&buffer[..read_bytes]);
    }
    Ok(output.into_captured_output())
}

async fn join_bounded_output_reader(
    reader: Option<tokio::task::JoinHandle<Result<CapturedOutput, String>>>,
    stream_name: &str,
) -> Result<CapturedOutput, ErrorData> {
    match reader {
        Some(reader) => reader
            .await
            .map_err(|error| {
                runtime_shell_error(format!("{stream_name} reader task failed: {error}"))
            })?
            .map_err(|error| {
                runtime_shell_error(format!("Failed to read {stream_name} output: {error}"))
            }),
        None => Ok(CapturedOutput::empty()),
    }
}

fn call_tool_result_from_process_output(
    kind: RuntimeShellToolKind,
    command: &str,
    working_directory: &Path,
    output: CapturedProcessOutput,
) -> CallToolResult {
    let stdout_output = decode_process_output(&output.stdout.retained);
    let stderr_output = decode_process_output(&output.stderr.retained);
    let stdout_encoding = stdout_output.encoding;
    let stderr_encoding = stderr_output.encoding;
    let decoded_with = summarize_decoded_with(&[&stdout_output, &stderr_output]);
    let stdout = stdout_output.text;
    let stderr = stderr_output.text;
    let interpretation =
        interpret_command_result(kind, command, output.exit_code, &stdout, &stderr);
    let formatted = truncate_output(&format_output_with_message(
        &stdout,
        &stderr,
        output.exit_code,
        interpretation.message.as_deref(),
    ));
    let output_bytes = output.stdout.bytes.saturating_add(output.stderr.bytes);
    let output_omitted_bytes = output
        .stdout
        .omitted_bytes
        .saturating_add(output.stderr.omitted_bytes);
    let output_truncated = output.stdout.truncated || output.stderr.truncated;
    let mut metadata = HashMap::from([
        ("exit_code".to_string(), json!(output.exit_code)),
        ("stdout_length".to_string(), json!(stdout.len())),
        ("stderr_length".to_string(), json!(stderr.len())),
        ("stdout_bytes".to_string(), json!(output.stdout.bytes)),
        ("stderr_bytes".to_string(), json!(output.stderr.bytes)),
        (
            "stdout_omitted_bytes".to_string(),
            json!(output.stdout.omitted_bytes),
        ),
        (
            "stderr_omitted_bytes".to_string(),
            json!(output.stderr.omitted_bytes),
        ),
        (
            "stdout_truncated".to_string(),
            json!(output.stdout.truncated),
        ),
        (
            "stderr_truncated".to_string(),
            json!(output.stderr.truncated),
        ),
        ("outputBytes".to_string(), json!(output_bytes)),
        (
            "outputOmittedBytes".to_string(),
            json!(output_omitted_bytes),
        ),
        ("outputTruncated".to_string(), json!(output_truncated)),
        ("stdout".to_string(), json!(truncate_output(&stdout))),
        ("stderr".to_string(), json!(truncate_output(&stderr))),
        ("shell".to_string(), json!(shell_name(kind))),
        ("command".to_string(), json!(command)),
        (
            "cwd".to_string(),
            json!(working_directory.display().to_string()),
        ),
        ("execution_surface".to_string(), json!("embedded")),
        ("encoding".to_string(), json!(stdout_encoding)),
        ("stderr_encoding".to_string(), json!(stderr_encoding)),
        ("decoded_with".to_string(), json!(decoded_with)),
    ]);

    let success = !interpretation.is_error;
    if output.exit_code != 0 && success {
        metadata.insert("reported_success".to_string(), json!(true));
    }

    runtime_tool_result_to_call_tool_result(RuntimeToolResultParts {
        success,
        output: success.then_some(formatted.clone()),
        error: (!success).then_some(formatted),
        metadata,
    })
}

fn interpret_command_result(
    kind: RuntimeShellToolKind,
    command: &str,
    exit_code: i32,
    stdout: &str,
    stderr: &str,
) -> CommandInterpretation {
    match kind {
        RuntimeShellToolKind::Bash => {
            interpret_bash_command_result(command, exit_code, stdout, stderr)
        }
        RuntimeShellToolKind::PowerShell => {
            interpret_powershell_command_result(command, exit_code, stdout, stderr)
        }
    }
}

fn shell_tool_name(kind: RuntimeShellToolKind) -> &'static str {
    match kind {
        RuntimeShellToolKind::Bash => "Bash",
        RuntimeShellToolKind::PowerShell => "PowerShell",
    }
}

fn shell_name(kind: RuntimeShellToolKind) -> &'static str {
    match kind {
        RuntimeShellToolKind::Bash if cfg!(target_os = "windows") => "powershell",
        RuntimeShellToolKind::Bash => "sh",
        RuntimeShellToolKind::PowerShell => "powershell",
    }
}

fn format_output_with_message(
    stdout: &str,
    stderr: &str,
    exit_code: i32,
    fallback_message: Option<&str>,
) -> String {
    let mut output = String::new();
    if !stdout.is_empty() {
        output.push_str(stdout);
    }
    if !stderr.is_empty() {
        if !output.is_empty() && !output.ends_with('\n') {
            output.push('\n');
        }
        if !stdout.is_empty() {
            output.push_str("--- stderr ---\n");
        }
        output.push_str(stderr);
    }
    if output.is_empty() {
        if let Some(message) = fallback_message {
            output = message.to_string();
        } else if exit_code != 0 {
            output = format!("Command exited with code {exit_code}");
        }
    }
    output
}

fn truncate_output(output: &str) -> String {
    if output.len() <= MAX_OUTPUT_LENGTH {
        return output.to_string();
    }

    let truncation_message = format!(
        "\n\n... [Output truncated. Showing first {} of {} bytes]",
        MAX_OUTPUT_LENGTH,
        output.len()
    );
    let keep_length = MAX_OUTPUT_LENGTH.saturating_sub(truncation_message.len());
    let mut safe_length = keep_length;
    while safe_length > 0 && !output.is_char_boundary(safe_length) {
        safe_length -= 1;
    }
    let truncated = output.get(..safe_length).unwrap_or(output);
    let last_newline = truncated.rfind('\n').unwrap_or(truncated.len());

    format!(
        "{}{}",
        output.get(..last_newline).unwrap_or(output),
        truncation_message
    )
}

fn runtime_shell_error(message: impl Into<String>) -> ErrorData {
    ErrorData::new(ErrorCode::INTERNAL_ERROR, message.into(), None)
}

#[cfg(test)]
#[path = "shell_execution/tests.rs"]
mod tests;
