//! Bash Tool Implementation
//!
//! This module implements the `BashTool` for executing shell commands with:
//! - Cross-platform support (Windows PowerShell/CMD, macOS, Linux)
//! - Safety checks for dangerous commands
//! - Warning pattern detection
//! - Background task execution
//! - Configurable timeout
//! - Output truncation
//!
//! Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9

use std::path::Path;
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use tokio::io::{AsyncRead, AsyncReadExt};
use tokio::process::Command;
use tool_runtime::command_semantics::interpret_bash_command_result;
use tool_runtime::shell_analysis::{command_references_wsl_drive_mount, missing_bash_read_targets};
use tool_runtime::shell_permission::{check_bash_command_permission, ShellPermissionDecision};
use tool_runtime::shell_runtime::build_platform_shell_command;
use tool_runtime::subprocess::{decode_process_output, summarize_decoded_with};
use tracing::{debug, warn};

use crate::sandbox::output_buffer::{BoundedOutputBuffer, CapturedOutput};
use crate::sandbox::{execute_in_sandbox_with_options, ExecutorOptions, ExecutorResult};

use super::base::{PermissionCheckResult, Tool};
use super::context::{ToolContext, ToolOptions, ToolResult};
use super::error::ToolError;
use super::task::TaskManager;

/// Maximum output length before truncation (128KB)
pub const MAX_OUTPUT_LENGTH: usize = 128 * 1024;

/// Default timeout for command execution (5 minutes)
pub const DEFAULT_TIMEOUT_SECS: u64 = 300;

/// Maximum timeout allowed (30 minutes)
pub const MAX_TIMEOUT_SECS: u64 = 1800;

/// Sandbox configuration for command execution
#[derive(Debug, Clone, Default)]
pub struct SandboxConfig {
    /// Whether sandbox is enabled
    pub enabled: bool,
    /// Allowed directories for file access
    pub allowed_directories: Vec<String>,
    /// Environment variables to set
    pub environment: std::collections::HashMap<String, String>,
}

struct CapturedProcessOutput {
    exit_code: i32,
    stdout: CapturedOutput,
    stderr: CapturedOutput,
}

/// Bash Tool for executing shell commands
///
/// Provides secure shell command execution with:
/// - Dangerous command blacklist
/// - Warning pattern detection
/// - Cross-platform support
/// - Timeout control
/// - Output truncation
///
/// Requirements: 3.1
#[derive(Debug)]
pub struct BashTool {
    /// Task manager for background execution
    task_manager: Arc<TaskManager>,
    /// Sandbox configuration
    sandbox_config: Option<SandboxConfig>,
}

impl Default for BashTool {
    fn default() -> Self {
        Self::new()
    }
}

impl BashTool {
    /// Create a new BashTool with default settings
    pub fn new() -> Self {
        Self {
            task_manager: Arc::new(TaskManager::new()),
            sandbox_config: None,
        }
    }

    /// Create a BashTool with custom task manager
    pub fn with_task_manager(task_manager: Arc<TaskManager>) -> Self {
        Self {
            task_manager,
            sandbox_config: None,
        }
    }

    /// Set sandbox configuration
    pub fn with_sandbox(mut self, config: SandboxConfig) -> Self {
        self.sandbox_config = Some(config);
        self
    }

    /// Get the task manager
    pub fn task_manager(&self) -> &Arc<TaskManager> {
        &self.task_manager
    }
}

fn build_missing_read_target_result(paths: &[std::path::PathBuf]) -> ToolResult {
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

    ToolResult::error(message)
        .with_metadata("preflight_check", serde_json::json!("missing_read_target"))
        .with_metadata("missing_paths", serde_json::json!(path_values))
}

fn build_windows_wsl_drive_mount_result(command: &str) -> ToolResult {
    ToolResult::error(
        "当前是 Windows 原生 shell 运行时，不应使用 `/mnt/c`、`/mnt/d` 这类 WSL/Linux 挂载路径。请改用 Windows 原生路径，或先用 PowerShell 查询 `$env:SystemDrive` / `Get-PSDrive -PSProvider FileSystem` 后再继续。",
    )
    .with_metadata("preflight_check", serde_json::json!("windows_wsl_drive_mount"))
    .with_metadata("shell", serde_json::json!("powershell"))
    .with_metadata("command", serde_json::json!(command))
}

fn preflight_windows_wsl_drive_mount_for(
    command: &str,
    is_windows_native_runtime: bool,
) -> Option<ToolResult> {
    (is_windows_native_runtime && command_references_wsl_drive_mount(command))
        .then(|| build_windows_wsl_drive_mount_result(command))
}

fn preflight_windows_wsl_drive_mount(command: &str) -> Option<ToolResult> {
    preflight_windows_wsl_drive_mount_for(command, cfg!(target_os = "windows"))
}

fn resolved_shell_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "powershell"
    } else {
        "sh"
    }
}

fn preflight_bash_read_targets(command: &str, cwd: &Path) -> Option<ToolResult> {
    let missing_paths = missing_bash_read_targets(command, cwd);
    (!missing_paths.is_empty()).then(|| build_missing_read_target_result(&missing_paths))
}

// =============================================================================
// Foreground Execution Implementation (Requirements: 3.1, 3.5)
// =============================================================================

impl BashTool {
    /// Execute a command in the foreground with timeout
    ///
    /// Supports cross-platform execution:
    /// - Windows: Uses PowerShell or CMD
    /// - macOS/Linux: Uses sh -c
    ///
    /// Requirements: 3.1, 3.5
    pub async fn execute_foreground(
        &self,
        command: &str,
        timeout: Duration,
        context: &ToolContext,
    ) -> Result<ToolResult, ToolError> {
        // Check for cancellation
        if context.is_cancelled() {
            return Err(ToolError::Cancelled);
        }

        // Enforce maximum timeout
        let effective_timeout = if timeout.as_secs() > MAX_TIMEOUT_SECS {
            warn!(
                "Requested timeout {:?} exceeds maximum, using {} seconds",
                timeout, MAX_TIMEOUT_SECS
            );
            Duration::from_secs(MAX_TIMEOUT_SECS)
        } else {
            timeout
        };

        debug!(
            "Executing command with timeout {:?}: {}",
            effective_timeout, command
        );

        if let Some(sandbox_config) = context.workspace_sandbox.as_ref() {
            let result = execute_in_sandbox_with_options(
                ExecutorOptions {
                    command: resolved_shell_program().to_string(),
                    args: resolved_shell_args(command),
                    timeout: Some(effective_timeout.as_millis() as u64),
                    env: context.environment.clone(),
                    working_dir: Some(context.working_directory.display().to_string()),
                },
                sandbox_config,
            )
            .await
            .map_err(|error| {
                ToolError::execution_failed(format!("Failed to execute sandboxed command: {error}"))
            })?;

            return self.tool_result_from_executor_result(
                command,
                &context.working_directory,
                result,
                Some("workspace"),
            );
        }

        let result = self
            .execute_embedded_command(command, effective_timeout, context)
            .await;

        match result {
            Ok(output) => {
                let stdout_output = decode_process_output(&output.stdout.retained);
                let stderr_output = decode_process_output(&output.stderr.retained);
                let stdout_encoding = stdout_output.encoding;
                let stderr_encoding = stderr_output.encoding;
                let decoded_with = summarize_decoded_with(&[&stdout_output, &stderr_output]);
                let stdout = stdout_output.text;
                let stderr = stderr_output.text;
                let stdout_bytes = output.stdout.bytes;
                let stderr_bytes = output.stderr.bytes;
                let stdout_omitted_bytes = output.stdout.omitted_bytes;
                let stderr_omitted_bytes = output.stderr.omitted_bytes;
                let stdout_truncated = output.stdout.truncated;
                let stderr_truncated = output.stderr.truncated;
                let output_bytes = stdout_bytes.saturating_add(stderr_bytes);
                let output_omitted_bytes =
                    stdout_omitted_bytes.saturating_add(stderr_omitted_bytes);
                let output_truncated = stdout_truncated || stderr_truncated;
                let exit_code = output.exit_code;

                debug!(
                    "Command completed with exit code {}, stdout: {} bytes, stderr: {} bytes",
                    exit_code, stdout_bytes, stderr_bytes
                );

                let interpretation =
                    interpret_bash_command_result(command, exit_code, &stdout, &stderr);

                // Combine and truncate output
                let combined_output = self.format_output_with_message(
                    &stdout,
                    &stderr,
                    exit_code,
                    interpretation.message.as_deref(),
                );
                let truncated_output = self.truncate_output(&combined_output);

                if interpretation.is_error {
                    Ok(ToolResult::error(truncated_output)
                        .with_metadata("exit_code", serde_json::json!(exit_code))
                        .with_metadata("stdout_length", serde_json::json!(stdout.len()))
                        .with_metadata("stderr_length", serde_json::json!(stderr.len()))
                        .with_metadata("stdout_bytes", serde_json::json!(stdout_bytes))
                        .with_metadata("stderr_bytes", serde_json::json!(stderr_bytes))
                        .with_metadata(
                            "stdout_omitted_bytes",
                            serde_json::json!(stdout_omitted_bytes),
                        )
                        .with_metadata(
                            "stderr_omitted_bytes",
                            serde_json::json!(stderr_omitted_bytes),
                        )
                        .with_metadata("stdout_truncated", serde_json::json!(stdout_truncated))
                        .with_metadata("stderr_truncated", serde_json::json!(stderr_truncated))
                        .with_metadata("outputBytes", serde_json::json!(output_bytes))
                        .with_metadata(
                            "outputOmittedBytes",
                            serde_json::json!(output_omitted_bytes),
                        )
                        .with_metadata("outputTruncated", serde_json::json!(output_truncated))
                        .with_metadata("stdout", serde_json::json!(self.truncate_output(&stdout)))
                        .with_metadata("stderr", serde_json::json!(self.truncate_output(&stderr)))
                        .with_metadata("shell", serde_json::json!(resolved_shell_name()))
                        .with_metadata("command", serde_json::json!(command))
                        .with_metadata(
                            "cwd",
                            serde_json::json!(context.working_directory.display().to_string()),
                        )
                        .with_metadata("execution_surface", serde_json::json!("embedded"))
                        .with_metadata("encoding", serde_json::json!(stdout_encoding))
                        .with_metadata("stderr_encoding", serde_json::json!(stderr_encoding))
                        .with_metadata("decoded_with", serde_json::json!(decoded_with)))
                } else {
                    let mut result = ToolResult::success(truncated_output)
                        .with_metadata("exit_code", serde_json::json!(exit_code))
                        .with_metadata("stdout_length", serde_json::json!(stdout.len()))
                        .with_metadata("stderr_length", serde_json::json!(stderr.len()))
                        .with_metadata("stdout_bytes", serde_json::json!(stdout_bytes))
                        .with_metadata("stderr_bytes", serde_json::json!(stderr_bytes))
                        .with_metadata(
                            "stdout_omitted_bytes",
                            serde_json::json!(stdout_omitted_bytes),
                        )
                        .with_metadata(
                            "stderr_omitted_bytes",
                            serde_json::json!(stderr_omitted_bytes),
                        )
                        .with_metadata("stdout_truncated", serde_json::json!(stdout_truncated))
                        .with_metadata("stderr_truncated", serde_json::json!(stderr_truncated))
                        .with_metadata("outputBytes", serde_json::json!(output_bytes))
                        .with_metadata(
                            "outputOmittedBytes",
                            serde_json::json!(output_omitted_bytes),
                        )
                        .with_metadata("outputTruncated", serde_json::json!(output_truncated))
                        .with_metadata("stdout", serde_json::json!(self.truncate_output(&stdout)))
                        .with_metadata("stderr", serde_json::json!(self.truncate_output(&stderr)))
                        .with_metadata("shell", serde_json::json!(resolved_shell_name()))
                        .with_metadata("command", serde_json::json!(command))
                        .with_metadata(
                            "cwd",
                            serde_json::json!(context.working_directory.display().to_string()),
                        )
                        .with_metadata("execution_surface", serde_json::json!("embedded"))
                        .with_metadata("encoding", serde_json::json!(stdout_encoding))
                        .with_metadata("stderr_encoding", serde_json::json!(stderr_encoding))
                        .with_metadata("decoded_with", serde_json::json!(decoded_with));
                    if exit_code != 0 {
                        result = result.with_metadata("reported_success", serde_json::json!(true));
                    }
                    Ok(result)
                }
            }
            Err(ToolError::Timeout(_)) => {
                warn!("Command timed out after {:?}", effective_timeout);
                Err(ToolError::timeout(effective_timeout))
            }
            Err(e) => {
                warn!("Command execution failed: {}", e);
                Err(e)
            }
        }
    }

    async fn execute_embedded_command(
        &self,
        command: &str,
        timeout: Duration,
        context: &ToolContext,
    ) -> Result<CapturedProcessOutput, ToolError> {
        let mut cmd = self.build_platform_command(command, context);
        cmd.stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .stdin(Stdio::null())
            .kill_on_drop(true);
        let mut child = cmd.spawn().map_err(|error| {
            ToolError::execution_failed(format!("Failed to execute command: {error}"))
        })?;
        let stdout_reader = child
            .stdout
            .take()
            .map(|stdout| tokio::spawn(read_bounded_output_stream(stdout)));
        let stderr_reader = child
            .stderr
            .take()
            .map(|stderr| tokio::spawn(read_bounded_output_stream(stderr)));

        let status = match tokio::time::timeout(timeout, child.wait()).await {
            Ok(Ok(status)) => status,
            Ok(Err(error)) => {
                return Err(ToolError::execution_failed(format!(
                    "Failed to execute command: {error}"
                )));
            }
            Err(_) => {
                let _ = child.kill().await;
                let _ = child.wait().await;
                return Err(ToolError::timeout(timeout));
            }
        };

        Ok(CapturedProcessOutput {
            exit_code: status.code().unwrap_or(-1),
            stdout: join_bounded_output_reader(stdout_reader, "stdout").await?,
            stderr: join_bounded_output_reader(stderr_reader, "stderr").await?,
        })
    }

    fn tool_result_from_executor_result(
        &self,
        command: &str,
        working_directory: &Path,
        executor_result: ExecutorResult,
        sandbox_scope: Option<&str>,
    ) -> Result<ToolResult, ToolError> {
        let stdout = executor_result.stdout;
        let stderr = executor_result.stderr;
        let stdout_bytes = executor_result.stdout_bytes;
        let stderr_bytes = executor_result.stderr_bytes;
        let stdout_omitted_bytes = executor_result.stdout_omitted_bytes;
        let stderr_omitted_bytes = executor_result.stderr_omitted_bytes;
        let stdout_truncated = executor_result.stdout_truncated;
        let stderr_truncated = executor_result.stderr_truncated;
        let output_bytes = stdout_bytes.saturating_add(stderr_bytes);
        let output_omitted_bytes = stdout_omitted_bytes.saturating_add(stderr_omitted_bytes);
        let output_truncated = stdout_truncated || stderr_truncated;
        let exit_code = executor_result.exit_code;
        let interpretation = interpret_bash_command_result(command, exit_code, &stdout, &stderr);
        let combined_output = self.format_output_with_message(
            &stdout,
            &stderr,
            exit_code,
            interpretation.message.as_deref(),
        );
        let truncated_output = self.truncate_output(&combined_output);
        let mut result = if interpretation.is_error {
            ToolResult::error(truncated_output)
        } else {
            ToolResult::success(truncated_output)
        }
        .with_metadata("exit_code", serde_json::json!(exit_code))
        .with_metadata("stdout_length", serde_json::json!(stdout.len()))
        .with_metadata("stderr_length", serde_json::json!(stderr.len()))
        .with_metadata("stdout_bytes", serde_json::json!(stdout_bytes))
        .with_metadata("stderr_bytes", serde_json::json!(stderr_bytes))
        .with_metadata(
            "stdout_omitted_bytes",
            serde_json::json!(stdout_omitted_bytes),
        )
        .with_metadata(
            "stderr_omitted_bytes",
            serde_json::json!(stderr_omitted_bytes),
        )
        .with_metadata("stdout_truncated", serde_json::json!(stdout_truncated))
        .with_metadata("stderr_truncated", serde_json::json!(stderr_truncated))
        .with_metadata("outputBytes", serde_json::json!(output_bytes))
        .with_metadata(
            "outputOmittedBytes",
            serde_json::json!(output_omitted_bytes),
        )
        .with_metadata("outputTruncated", serde_json::json!(output_truncated))
        .with_metadata("stdout", serde_json::json!(self.truncate_output(&stdout)))
        .with_metadata("stderr", serde_json::json!(self.truncate_output(&stderr)))
        .with_metadata("shell", serde_json::json!(resolved_shell_name()))
        .with_metadata("command", serde_json::json!(command))
        .with_metadata(
            "cwd",
            serde_json::json!(working_directory.display().to_string()),
        )
        .with_metadata("execution_surface", serde_json::json!("embedded"))
        .with_metadata("sandboxed", serde_json::json!(executor_result.sandboxed))
        .with_metadata(
            "sandbox_type",
            serde_json::json!(format!("{:?}", executor_result.sandbox_type).to_ascii_lowercase()),
        );

        if let Some(scope) = sandbox_scope {
            result = result.with_metadata("sandbox_scope", serde_json::json!(scope));
        }
        if let Some(duration) = executor_result.duration {
            result = result.with_metadata("duration_ms", serde_json::json!(duration));
        }
        if exit_code != 0 && result.success {
            result = result.with_metadata("reported_success", serde_json::json!(true));
        }

        Ok(result)
    }

    /// Build a platform-specific command
    fn build_platform_command(&self, command: &str, context: &ToolContext) -> Command {
        let mut cmd = build_platform_shell_command(command);

        // Set working directory
        cmd.current_dir(&context.working_directory);

        // Set environment variables
        cmd.env("ASTER_TERMINAL", "1");
        for (key, value) in &context.environment {
            cmd.env(key, value);
        }

        // Apply sandbox environment if configured
        if let Some(ref sandbox) = self.sandbox_config {
            for (key, value) in &sandbox.environment {
                cmd.env(key, value);
            }
        }

        cmd
    }

    /// Format command output combining stdout and stderr
    fn format_output(&self, stdout: &str, stderr: &str, exit_code: i32) -> String {
        self.format_output_with_message(stdout, stderr, exit_code, None)
    }

    fn format_output_with_message(
        &self,
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
                output = format!("Command exited with code {}", exit_code);
            }
        }

        output
    }
}

fn resolved_shell_program() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        "cmd.exe"
    }

    #[cfg(not(target_os = "windows"))]
    {
        "sh"
    }
}

fn resolved_shell_args(command: &str) -> Vec<String> {
    #[cfg(target_os = "windows")]
    {
        vec![
            "/D".to_string(),
            "/S".to_string(),
            "/C".to_string(),
            command.to_string(),
        ]
    }

    #[cfg(not(target_os = "windows"))]
    {
        vec!["-c".to_string(), command.to_string()]
    }
}

async fn read_bounded_output_stream<R>(mut stream: R) -> anyhow::Result<CapturedOutput>
where
    R: AsyncRead + Unpin,
{
    let mut output = BoundedOutputBuffer::default();
    let mut buffer = [0u8; 8192];
    loop {
        let read_bytes = stream.read(&mut buffer).await?;
        if read_bytes == 0 {
            break;
        }
        output.push_chunk(&buffer[..read_bytes]);
    }
    Ok(output.into_captured_output())
}

async fn join_bounded_output_reader(
    reader: Option<tokio::task::JoinHandle<anyhow::Result<CapturedOutput>>>,
    stream_name: &str,
) -> Result<CapturedOutput, ToolError> {
    match reader {
        Some(reader) => reader
            .await
            .map_err(|error| {
                ToolError::execution_failed(format!("{stream_name} reader task failed: {error}"))
            })?
            .map_err(|error| {
                ToolError::execution_failed(format!("Failed to read {stream_name} output: {error}"))
            }),
        None => Ok(CapturedOutput::from_bytes(&[])),
    }
}

// =============================================================================
// Background Execution Implementation (Requirements: 3.4)
// =============================================================================

impl BashTool {
    /// Execute a command in the background
    ///
    /// Returns a task_id that can be used to query status and output.
    /// The actual task management is delegated to TaskManager.
    ///
    /// Requirements: 3.4
    pub async fn execute_background(
        &self,
        command: &str,
        context: &ToolContext,
    ) -> Result<ToolResult, ToolError> {
        // Check for cancellation
        if context.is_cancelled() {
            return Err(ToolError::Cancelled);
        }

        // Delegate to task manager
        let task_id = self.task_manager.start(command, context).await?;
        let output_file = self.task_manager.get_output_file_path(&task_id).await;
        let output_file_text = output_file.as_ref().map(|path| path.display().to_string());

        let mut result = ToolResult::success(match output_file_text.as_deref() {
            Some(path) => format!(
                "Background task started with ID: {task_id}\nOutput file: {path}\nRead the output file path for logs."
            ),
            None => format!("Background task started with ID: {task_id}"),
        })
        .with_metadata("task_id", serde_json::json!(task_id))
        .with_metadata("background", serde_json::json!(true))
        .with_metadata("shell", serde_json::json!(resolved_shell_name()))
        .with_metadata("command", serde_json::json!(command))
        .with_metadata(
            "cwd",
            serde_json::json!(context.working_directory.display().to_string()),
        )
        .with_metadata("execution_surface", serde_json::json!("embedded"));

        if let Some(path) = output_file_text {
            result = result.with_metadata("output_file", serde_json::json!(path));
        }

        Ok(result)
    }
}

// =============================================================================
// Tool Trait Implementation (Requirements: 3.6, 3.7, 3.8)
// =============================================================================

#[async_trait]
impl Tool for BashTool {
    /// Returns the tool name
    fn name(&self) -> &str {
        "Bash"
    }

    /// Returns the tool description
    fn description(&self) -> &str {
        "Execute shell commands with safety checks and timeout control. \
         Supports both foreground and background execution. \
         Use 'background: true' parameter for long-running commands."
    }

    fn dynamic_description(&self) -> Option<String> {
        Some(
            [
                self.description().to_string(),
                String::new(),
                "IMPORTANT: Prefer Read / Glob / Grep for file inspection before reaching for shell commands.".to_string(),
                "Do not guess file paths. If you are not sure whether a target exists, list or search the parent directory first.".to_string(),
            ]
            .join("\n"),
        )
    }

    /// Returns the JSON Schema for input parameters
    fn input_schema(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "The shell command to execute"
                },
                "timeout": {
                    "type": "integer",
                    "description": "Timeout in seconds (default: 300, max: 1800)",
                    "default": 300,
                    "minimum": 1,
                    "maximum": 1800
                },
                "background": {
                    "type": "boolean",
                    "description": "Run command in background and return task_id",
                    "default": false
                }
            },
            "required": ["command"]
        })
    }

    /// Execute the bash command
    ///
    /// Requirements: 3.6, 3.7
    async fn execute(
        &self,
        params: serde_json::Value,
        context: &ToolContext,
    ) -> Result<ToolResult, ToolError> {
        // Extract command parameter
        let command = params
            .get("command")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::invalid_params("Missing required parameter: command"))?;

        // Extract timeout parameter (default: 300 seconds)
        let timeout_secs = params
            .get("timeout")
            .and_then(|v| v.as_u64())
            .unwrap_or(DEFAULT_TIMEOUT_SECS);
        let timeout = Duration::from_secs(timeout_secs);

        // Extract background parameter (default: false)
        let background = params
            .get("background")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        if let Some(preflight_result) = preflight_windows_wsl_drive_mount(command) {
            return Ok(preflight_result);
        }

        if !background {
            if let Some(preflight_result) =
                preflight_bash_read_targets(command, &context.working_directory)
            {
                return Ok(preflight_result);
            }
        }

        // Execute based on mode
        if background {
            self.execute_background(command, context).await
        } else {
            self.execute_foreground(command, timeout, context).await
        }
    }

    /// Check permissions before execution
    ///
    /// Performs safety check and returns appropriate permission result.
    ///
    /// Requirements: 3.8
    async fn check_permissions(
        &self,
        params: &serde_json::Value,
        context: &ToolContext,
    ) -> PermissionCheckResult {
        // Extract command for safety check
        let command = match params.get("command").and_then(|v| v.as_str()) {
            Some(cmd) => cmd,
            None => return PermissionCheckResult::deny("Missing command parameter"),
        };

        match check_bash_command_permission(command, &context.working_directory) {
            ShellPermissionDecision::Allow => PermissionCheckResult::allow(),
            ShellPermissionDecision::Deny(reason) => PermissionCheckResult::deny(reason),
            ShellPermissionDecision::RequiresConfirmation(message) => {
                PermissionCheckResult::ask(message)
            }
        }
    }

    /// Get tool options
    fn options(&self) -> ToolOptions {
        ToolOptions::new()
            .with_max_retries(0) // Don't retry shell commands by default
            .with_base_timeout(Duration::from_secs(DEFAULT_TIMEOUT_SECS))
            .with_dynamic_timeout(false)
    }
}

// =============================================================================
// Output Truncation Implementation (Requirements: 3.9)
// =============================================================================

impl BashTool {
    /// Truncate output if it exceeds MAX_OUTPUT_LENGTH
    ///
    /// Adds a truncation indicator when output is truncated.
    ///
    /// Requirements: 3.9
    pub fn truncate_output(&self, output: &str) -> String {
        if output.len() <= MAX_OUTPUT_LENGTH {
            return output.to_string();
        }

        // Calculate how much to keep
        let truncation_message = format!(
            "\n\n... [Output truncated. Showing first {} of {} bytes]",
            MAX_OUTPUT_LENGTH,
            output.len()
        );
        let keep_length = MAX_OUTPUT_LENGTH - truncation_message.len();

        // Find a valid UTF-8 char boundary at or before keep_length
        let mut safe_length = keep_length;
        while safe_length > 0 && !output.is_char_boundary(safe_length) {
            safe_length -= 1;
        }

        // Try to truncate at a line boundary
        let truncated = output.get(..safe_length).unwrap_or(output);
        let last_newline = truncated.rfind('\n').unwrap_or(truncated.len());

        format!(
            "{}{}",
            output.get(..last_newline).unwrap_or(output),
            truncation_message
        )
    }

    /// Check if output would be truncated
    pub fn would_truncate(&self, output: &str) -> bool {
        output.len() > MAX_OUTPUT_LENGTH
    }
}

// =============================================================================
// Unit Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn create_test_context() -> ToolContext {
        ToolContext::new(PathBuf::from("/tmp"))
            .with_session_id("test-session")
            .with_user("test-user")
    }

    // Output Truncation Tests

    #[test]
    fn test_truncate_short_output() {
        let tool = BashTool::new();
        let output = "Hello, World!";
        let result = tool.truncate_output(output);
        assert_eq!(result, output);
    }

    #[test]
    fn test_truncate_long_output() {
        let tool = BashTool::new();
        let output = "x".repeat(MAX_OUTPUT_LENGTH + 1000);
        let result = tool.truncate_output(&output);
        assert!(result.len() <= MAX_OUTPUT_LENGTH + 100); // Allow for truncation message
        assert!(result.contains("[Output truncated"));
    }

    #[test]
    fn test_would_truncate() {
        let tool = BashTool::new();
        assert!(!tool.would_truncate("short"));
        assert!(tool.would_truncate(&"x".repeat(MAX_OUTPUT_LENGTH + 1)));
    }

    // Tool Trait Tests

    #[test]
    fn test_tool_name() {
        let tool = BashTool::new();
        assert_eq!(tool.name(), "Bash");
    }

    #[test]
    fn test_tool_description() {
        let tool = BashTool::new();
        assert!(!tool.description().is_empty());
        assert!(tool.description().contains("shell"));
    }

    #[test]
    fn test_tool_definition_mentions_path_guidance() {
        let tool = BashTool::new();
        let definition = tool.get_definition();
        assert!(definition.description.contains("Do not guess file paths"));
    }

    #[test]
    fn test_tool_input_schema() {
        let tool = BashTool::new();
        let schema = tool.input_schema();
        assert_eq!(schema["type"], "object");
        assert!(schema["properties"]["command"].is_object());
        assert!(schema["properties"]["timeout"].is_object());
        assert!(schema["properties"]["background"].is_object());
    }

    #[test]
    fn test_tool_options() {
        let tool = BashTool::new();
        let options = tool.options();
        assert_eq!(options.max_retries, 0);
        assert_eq!(
            options.base_timeout,
            Duration::from_secs(DEFAULT_TIMEOUT_SECS)
        );
    }

    // Permission Check Tests

    #[tokio::test]
    async fn test_check_permissions_safe_command() {
        let tool = BashTool::new();
        let context = create_test_context();
        let params = serde_json::json!({"command": "echo 'hello'"});

        let result = tool.check_permissions(&params, &context).await;
        assert!(result.is_allowed());
    }

    #[tokio::test]
    async fn test_check_permissions_dangerous_command() {
        let tool = BashTool::new();
        let context = create_test_context();
        let params = serde_json::json!({"command": "rm -rf /"});

        let result = tool.check_permissions(&params, &context).await;
        assert!(result.is_denied());
    }

    #[tokio::test]
    async fn test_check_permissions_warning_command() {
        let tool = BashTool::new();
        let context = create_test_context();
        let params = serde_json::json!({"command": "sudo ls"});

        let result = tool.check_permissions(&params, &context).await;
        assert!(result.requires_confirmation());
    }

    #[tokio::test]
    async fn test_check_permissions_write_redirection_requires_confirmation() {
        let tool = BashTool::new();
        let context = create_test_context();
        let params = serde_json::json!({"command": "echo hello > note.txt"});

        let result = tool.check_permissions(&params, &context).await;
        assert!(result.requires_confirmation());
    }

    #[tokio::test]
    async fn test_check_permissions_write_outside_workspace_mentions_path_scope() {
        let tool = BashTool::new();
        let context = ToolContext::new(PathBuf::from("/tmp/project"));
        let params = serde_json::json!({"command": "echo hello > ../note.txt"});

        let result = tool.check_permissions(&params, &context).await;
        assert!(result.requires_confirmation());
        assert!(result
            .message
            .as_deref()
            .unwrap_or_default()
            .contains("outside the current working directory"));
    }

    #[tokio::test]
    async fn test_check_permissions_sed_in_place_requires_confirmation() {
        let tool = BashTool::new();
        let context = create_test_context();
        let params = serde_json::json!({"command": "sed -i 's/a/b/' file.txt"});

        let result = tool.check_permissions(&params, &context).await;
        assert!(result.requires_confirmation());
    }

    #[tokio::test]
    async fn test_check_permissions_git_reset_hard_is_denied() {
        let tool = BashTool::new();
        let context = create_test_context();
        let params = serde_json::json!({"command": "git reset --hard HEAD~1"});

        let result = tool.check_permissions(&params, &context).await;
        assert!(result.is_denied());
    }

    #[tokio::test]
    async fn test_check_permissions_relative_root_removal_is_denied() {
        let tool = BashTool::new();
        let context = ToolContext::new(PathBuf::from("/tmp/project"));
        let params = serde_json::json!({"command": "rm -rf ../../"});

        let result = tool.check_permissions(&params, &context).await;
        assert!(result.is_denied());
        assert!(result
            .message
            .as_deref()
            .unwrap_or_default()
            .contains("dangerous pattern"));
    }

    #[tokio::test]
    async fn test_check_permissions_dev_null_redirection_stays_allowed() {
        let tool = BashTool::new();
        let context = create_test_context();
        let params = serde_json::json!({"command": "grep foo file.txt >/dev/null"});

        let result = tool.check_permissions(&params, &context).await;
        assert!(result.is_allowed());
    }

    #[tokio::test]
    async fn test_check_permissions_missing_command() {
        let tool = BashTool::new();
        let context = create_test_context();
        let params = serde_json::json!({});

        let result = tool.check_permissions(&params, &context).await;
        assert!(result.is_denied());
    }

    // Execution Tests

    #[tokio::test]
    async fn test_execute_simple_command() {
        let tool = BashTool::new();
        let context = create_test_context();
        let params = serde_json::json!({
            "command": "echo 'hello world'"
        });

        let result = tool.execute(params, &context).await;
        assert!(result.is_ok());
        let tool_result = result.unwrap();
        assert!(tool_result.is_success());
        assert!(tool_result.output.unwrap().contains("hello world"));
    }

    #[tokio::test]
    async fn test_execute_with_exit_code() {
        let tool = BashTool::new();
        let context = create_test_context();
        let params = serde_json::json!({
            "command": "exit 1"
        });

        let result = tool.execute(params, &context).await;
        assert!(result.is_ok());
        let tool_result = result.unwrap();
        assert!(tool_result.is_error());
        assert_eq!(
            tool_result.metadata.get("exit_code"),
            Some(&serde_json::json!(1))
        );
    }

    #[tokio::test]
    async fn test_execute_missing_command() {
        let tool = BashTool::new();
        let context = create_test_context();
        let params = serde_json::json!({});

        let result = tool.execute(params, &context).await;
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), ToolError::InvalidParams(_)));
    }

    #[tokio::test]
    async fn test_execute_with_timeout() {
        let tool = BashTool::new();
        let context = create_test_context();

        // Use a very short timeout
        let params = serde_json::json!({
            "command": if cfg!(target_os = "windows") { "timeout /t 5" } else { "sleep 5" },
            "timeout": 1
        });

        let result = tool.execute(params, &context).await;
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), ToolError::Timeout(_)));
    }

    #[tokio::test]
    #[cfg(not(target_os = "windows"))]
    async fn test_execute_large_output_reports_bounded_capture_metadata() {
        let tool = BashTool::new();
        let context = create_test_context();
        let result = tool
            .execute(
                serde_json::json!({
                    "command": "i=0; while [ $i -lt 40000 ]; do printf 'line\\n'; i=$((i+1)); done; printf tail-marker",
                    "timeout": 5
                }),
                &context,
            )
            .await
            .expect("large output command should run");

        assert!(result.is_success());
        assert_eq!(
            result.metadata.get("outputTruncated"),
            Some(&serde_json::json!(true))
        );
        assert!(result
            .metadata
            .get("outputOmittedBytes")
            .and_then(serde_json::Value::as_u64)
            .is_some_and(|value| value > 0));
        assert!(result.content().contains("tail-marker"));
    }

    #[tokio::test]
    async fn test_execute_background() {
        use tempfile::TempDir;

        let temp_dir = TempDir::new().unwrap();
        let task_manager =
            Arc::new(TaskManager::new().with_output_directory(temp_dir.path().to_path_buf()));
        let tool = BashTool::with_task_manager(task_manager.clone());
        let context = create_test_context();
        let params = serde_json::json!({
            "command": "echo 'hello'",
            "background": true
        });

        let result = tool.execute(params, &context).await;
        // Background execution is now implemented
        assert!(result.is_ok());
        let tool_result = result.unwrap();
        assert!(tool_result.is_success());
        assert!(tool_result.metadata.contains_key("task_id"));
        assert!(tool_result.metadata.contains_key("background"));
        assert!(tool_result.metadata.contains_key("output_file"));

        // Clean up
        let _ = task_manager.kill_all().await;
    }

    #[tokio::test]
    async fn test_execute_preflights_missing_head_target() {
        use tempfile::TempDir;

        let temp_dir = TempDir::new().unwrap();
        let missing_path = temp_dir.path().join("missing.txt");
        let tool = BashTool::new();
        let context = ToolContext::new(temp_dir.path().to_path_buf());
        let params = serde_json::json!({
            "command": format!("head -20 {}", missing_path.display())
        });

        let result = tool.execute(params, &context).await.unwrap();
        assert!(result.is_error());
        assert!(result.message().unwrap_or_default().contains("路径不存在"));
        assert_eq!(
            result.metadata.get("preflight_check"),
            Some(&serde_json::json!("missing_read_target"))
        );
    }

    #[test]
    fn test_command_references_wsl_drive_mount_detects_screenshot_windows_probe() {
        assert!(command_references_wsl_drive_mount(
            "ls /mnt/c/Users/ 2>/dev/null || ls /mnt 2>/dev/null"
        ));
        assert!(command_references_wsl_drive_mount(
            "cat '/run/desktop/mnt/host/c/Users/demo/file.txt'"
        ));
        assert!(!command_references_wsl_drive_mount(
            r#"Get-ChildItem "C:\Users\demo""#
        ));
    }

    #[test]
    fn test_preflight_windows_wsl_drive_mount_blocks_screenshot_probe_on_windows_runtime() {
        let result = preflight_windows_wsl_drive_mount_for(
            "ls /mnt/c/Users/ 2>/dev/null || ls /mnt 2>/dev/null",
            true,
        )
        .expect("应阻断 Windows 原生运行时中的 WSL 盘符探测");

        assert!(result.is_error());
        assert!(result.content().contains("Windows 原生 shell"));
        assert_eq!(
            result.metadata.get("preflight_check"),
            Some(&serde_json::json!("windows_wsl_drive_mount"))
        );
    }

    #[test]
    fn test_executor_result_metadata_preserves_output_truncation_stats() {
        let tool = BashTool::new();
        let result = tool
            .tool_result_from_executor_result(
                "printf lots",
                Path::new("/tmp"),
                ExecutorResult {
                    exit_code: 0,
                    stdout: "headtail".to_string(),
                    stderr: "err".to_string(),
                    stdout_bytes: 1_000,
                    stderr_bytes: 3,
                    stdout_omitted_bytes: 992,
                    stderr_omitted_bytes: 0,
                    stdout_truncated: true,
                    stderr_truncated: false,
                    sandboxed: true,
                    sandbox_type: crate::sandbox::SandboxType::RestrictedToken,
                    duration: Some(42),
                },
                Some("workspace"),
            )
            .expect("executor result should convert");

        assert!(result.is_success());
        assert_eq!(
            result.metadata.get("stdout_bytes"),
            Some(&serde_json::json!(1_000))
        );
        assert_eq!(
            result.metadata.get("stderr_bytes"),
            Some(&serde_json::json!(3))
        );
        assert_eq!(
            result.metadata.get("stdout_omitted_bytes"),
            Some(&serde_json::json!(992))
        );
        assert_eq!(
            result.metadata.get("outputBytes"),
            Some(&serde_json::json!(1_003))
        );
        assert_eq!(
            result.metadata.get("outputOmittedBytes"),
            Some(&serde_json::json!(992))
        );
        assert_eq!(
            result.metadata.get("outputTruncated"),
            Some(&serde_json::json!(true))
        );
        assert_eq!(
            result.metadata.get("sandbox_scope"),
            Some(&serde_json::json!("workspace"))
        );
    }

    // Builder Tests

    #[test]
    fn test_builder_with_task_manager() {
        let task_manager = Arc::new(TaskManager::new());
        let tool = BashTool::with_task_manager(task_manager.clone());
        assert!(Arc::ptr_eq(&tool.task_manager, &task_manager));
    }

    #[test]
    fn test_builder_with_sandbox() {
        let sandbox = SandboxConfig {
            enabled: true,
            allowed_directories: vec!["/tmp".to_string()],
            environment: std::collections::HashMap::new(),
        };
        let tool = BashTool::new().with_sandbox(sandbox);
        assert!(tool.sandbox_config.is_some());
        assert!(tool.sandbox_config.unwrap().enabled);
    }

    // Format Output Tests

    #[test]
    fn test_format_output_stdout_only() {
        let tool = BashTool::new();
        let result = tool.format_output("stdout content", "", 0);
        assert_eq!(result, "stdout content");
    }

    #[test]
    fn test_format_output_stderr_only() {
        let tool = BashTool::new();
        let result = tool.format_output("", "stderr content", 1);
        assert_eq!(result, "stderr content");
    }

    #[test]
    fn test_format_output_both() {
        let tool = BashTool::new();
        let result = tool.format_output("stdout", "stderr", 0);
        assert!(result.contains("stdout"));
        assert!(result.contains("stderr"));
    }

    #[test]
    fn test_format_output_empty_with_error() {
        let tool = BashTool::new();
        let result = tool.format_output("", "", 1);
        assert!(result.contains("exited with code 1"));
    }

    #[test]
    fn test_format_output_empty_with_semantic_message() {
        let tool = BashTool::new();
        let result = tool.format_output_with_message("", "", 1, Some("No matches found"));
        assert_eq!(result, "No matches found");
    }
}
