//! PowerShell current surface tool
//!
//! 对齐当前工具面：
//! - PowerShell

use super::base::{PermissionCheckResult, Tool};
use super::context::{ToolContext, ToolOptions, ToolResult};
use super::error::ToolError;
use super::task::{TaskManager, TaskShell};
use crate::sandbox::{execute_in_sandbox_with_options, ExecutorOptions, ExecutorResult};
use async_trait::async_trait;
use serde::Deserialize;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;
use tokio::process::Command;
use tool_runtime::command_semantics::interpret_powershell_command_result;
use tool_runtime::shell_analysis::{
    command_references_wsl_drive_mount, detect_blocked_sleep_pattern,
    missing_powershell_read_targets,
};
use tool_runtime::shell_permission::{
    check_powershell_command_permission, ShellPermissionDecision,
};
use tool_runtime::shell_runtime::detect_powershell_executable;
use tool_runtime::subprocess::{
    configure_command_for_gui, decode_process_output, summarize_decoded_with,
    wrap_powershell_command_for_utf8,
};
use tracing::{debug, warn};

const POWERSHELL_TOOL_NAME: &str = "PowerShell";
const POWERSHELL_TOOL_DESCRIPTION: &str = "Executes a given PowerShell command with optional timeout. Working directory persists between commands; shell state (variables, functions) does not.";
const DEFAULT_TIMEOUT_MS: u64 = 300_000;
const MAX_TIMEOUT_MS: u64 = 1_800_000;
const MAX_OUTPUT_LENGTH: usize = 128 * 1024;

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct PowerShellToolInput {
    command: String,
    #[serde(default)]
    timeout: Option<u64>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default, alias = "runInBackground")]
    run_in_background: Option<bool>,
}

#[derive(Debug)]
pub struct PowerShellTool {
    task_manager: Arc<TaskManager>,
    executable_path: Option<PathBuf>,
}

impl PowerShellTool {
    pub fn new() -> Self {
        Self::with_task_manager(Arc::new(TaskManager::new()))
    }

    pub fn with_task_manager(task_manager: Arc<TaskManager>) -> Self {
        Self {
            task_manager,
            executable_path: detect_powershell_executable(),
        }
    }

    #[cfg(test)]
    fn with_executable_path(
        task_manager: Arc<TaskManager>,
        executable_path: Option<PathBuf>,
    ) -> Self {
        Self {
            task_manager,
            executable_path,
        }
    }

    pub fn is_runtime_available() -> bool {
        detect_powershell_executable().is_some()
    }

    pub fn is_available(&self) -> bool {
        self.executable_path.is_some()
    }

    fn executable_path(&self) -> Result<&Path, ToolError> {
        self.executable_path.as_deref().ok_or_else(|| {
            ToolError::execution_failed(
                "PowerShell runtime unavailable: neither `pwsh` nor Windows PowerShell was found.",
            )
        })
    }

    fn build_command(&self, command: &str, context: &ToolContext) -> Result<Command, ToolError> {
        let executable_path = self.executable_path()?;
        let command = wrap_powershell_command_for_utf8(command);
        let mut cmd = Command::new(executable_path);
        configure_command_for_gui(&mut cmd);
        cmd.args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            command.as_str(),
        ]);
        cmd.current_dir(&context.working_directory);
        cmd.env("ASTER_TERMINAL", "1");
        for (key, value) in &context.environment {
            cmd.env(key, value);
        }
        Ok(cmd)
    }

    fn truncate_output(&self, output: &str) -> String {
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

    async fn execute_foreground(
        &self,
        command: &str,
        timeout_ms: u64,
        context: &ToolContext,
    ) -> Result<ToolResult, ToolError> {
        if context.is_cancelled() {
            return Err(ToolError::Cancelled);
        }

        let effective_timeout_ms = timeout_ms.min(MAX_TIMEOUT_MS);
        if timeout_ms > MAX_TIMEOUT_MS {
            warn!(
                "Requested PowerShell timeout {}ms exceeds maximum, using {}ms",
                timeout_ms, MAX_TIMEOUT_MS
            );
        }
        let effective_timeout = Duration::from_millis(effective_timeout_ms);
        let executable_path = self.executable_path()?.to_path_buf();

        debug!(
            "Executing PowerShell command with timeout {:?}: {}",
            effective_timeout, command
        );

        if let Some(sandbox_config) = context.workspace_sandbox.as_ref() {
            let command = wrap_powershell_command_for_utf8(command);
            let result = execute_in_sandbox_with_options(
                ExecutorOptions {
                    command: executable_path.display().to_string(),
                    args: vec![
                        "-NoProfile".to_string(),
                        "-NonInteractive".to_string(),
                        "-Command".to_string(),
                        command.clone(),
                    ],
                    timeout: Some(effective_timeout.as_millis() as u64),
                    env: context.environment.clone(),
                    working_dir: Some(context.working_directory.display().to_string()),
                },
                sandbox_config,
            )
            .await
            .map_err(|error| {
                ToolError::execution_failed(format!(
                    "Failed to execute sandboxed PowerShell command: {error}"
                ))
            })?;

            return self.tool_result_from_executor_result(
                &command,
                &context.working_directory,
                result,
                Some("workspace"),
            );
        }

        let mut cmd = self.build_command(command, context)?;
        let result = tokio::time::timeout(effective_timeout, async {
            cmd.stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .stdin(Stdio::null())
                .kill_on_drop(true)
                .output()
                .await
        })
        .await;

        match result {
            Ok(Ok(output)) => {
                let stdout_output = decode_process_output(&output.stdout);
                let stderr_output = decode_process_output(&output.stderr);
                let stdout_encoding = stdout_output.encoding;
                let stderr_encoding = stderr_output.encoding;
                let decoded_with = summarize_decoded_with(&[&stdout_output, &stderr_output]);
                let stdout = stdout_output.text;
                let stderr = stderr_output.text;
                let exit_code = output.status.code().unwrap_or(-1);
                let interpretation =
                    interpret_powershell_command_result(command, exit_code, &stdout, &stderr);
                let formatted = self.truncate_output(&self.format_output_with_message(
                    &stdout,
                    &stderr,
                    exit_code,
                    interpretation.message.as_deref(),
                ));

                if interpretation.is_error {
                    Ok(ToolResult::error(formatted)
                        .with_metadata("exit_code", json!(exit_code))
                        .with_metadata("stdout_length", json!(stdout.len()))
                        .with_metadata("stderr_length", json!(stderr.len()))
                        .with_metadata("stdout_bytes", json!(output.stdout.len()))
                        .with_metadata("stderr_bytes", json!(output.stderr.len()))
                        .with_metadata("stdout", json!(self.truncate_output(&stdout)))
                        .with_metadata("stderr", json!(self.truncate_output(&stderr)))
                        .with_metadata("shell", json!("powershell"))
                        .with_metadata("command", json!(command))
                        .with_metadata(
                            "cwd",
                            json!(context.working_directory.display().to_string()),
                        )
                        .with_metadata("execution_surface", json!("embedded"))
                        .with_metadata("encoding", json!(stdout_encoding))
                        .with_metadata("stderr_encoding", json!(stderr_encoding))
                        .with_metadata("decoded_with", json!(decoded_with)))
                } else {
                    let mut result = ToolResult::success(formatted)
                        .with_metadata("exit_code", json!(exit_code))
                        .with_metadata("stdout_length", json!(stdout.len()))
                        .with_metadata("stderr_length", json!(stderr.len()))
                        .with_metadata("stdout_bytes", json!(output.stdout.len()))
                        .with_metadata("stderr_bytes", json!(output.stderr.len()))
                        .with_metadata("stdout", json!(self.truncate_output(&stdout)))
                        .with_metadata("stderr", json!(self.truncate_output(&stderr)))
                        .with_metadata("shell", json!("powershell"))
                        .with_metadata("command", json!(command))
                        .with_metadata(
                            "cwd",
                            json!(context.working_directory.display().to_string()),
                        )
                        .with_metadata("execution_surface", json!("embedded"))
                        .with_metadata("encoding", json!(stdout_encoding))
                        .with_metadata("stderr_encoding", json!(stderr_encoding))
                        .with_metadata("decoded_with", json!(decoded_with));
                    if exit_code != 0 {
                        result = result.with_metadata("reported_success", json!(true));
                    }
                    Ok(result)
                }
            }
            Ok(Err(error)) => Err(ToolError::execution_failed(format!(
                "Failed to execute PowerShell command: {}",
                error
            ))),
            Err(_) => Err(ToolError::timeout(effective_timeout)),
        }
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
        let exit_code = executor_result.exit_code;
        let interpretation =
            interpret_powershell_command_result(command, exit_code, &stdout, &stderr);
        let formatted = self.truncate_output(&self.format_output_with_message(
            &stdout,
            &stderr,
            exit_code,
            interpretation.message.as_deref(),
        ));
        let mut result = if interpretation.is_error {
            ToolResult::error(formatted)
        } else {
            ToolResult::success(formatted)
        }
        .with_metadata("exit_code", json!(exit_code))
        .with_metadata("stdout_length", json!(stdout.len()))
        .with_metadata("stderr_length", json!(stderr.len()))
        .with_metadata("stdout_bytes", json!(stdout.len()))
        .with_metadata("stderr_bytes", json!(stderr.len()))
        .with_metadata("stdout", json!(self.truncate_output(&stdout)))
        .with_metadata("stderr", json!(self.truncate_output(&stderr)))
        .with_metadata("shell", json!("powershell"))
        .with_metadata("command", json!(command))
        .with_metadata("cwd", json!(working_directory.display().to_string()))
        .with_metadata("execution_surface", json!("embedded"))
        .with_metadata("sandboxed", json!(executor_result.sandboxed))
        .with_metadata(
            "sandbox_type",
            json!(format!("{:?}", executor_result.sandbox_type).to_ascii_lowercase()),
        );

        if let Some(scope) = sandbox_scope {
            result = result.with_metadata("sandbox_scope", json!(scope));
        }
        if let Some(duration) = executor_result.duration {
            result = result.with_metadata("duration_ms", json!(duration));
        }
        if exit_code != 0 && result.success {
            result = result.with_metadata("reported_success", json!(true));
        }

        Ok(result)
    }

    async fn execute_background(
        &self,
        command: &str,
        description: Option<&str>,
        context: &ToolContext,
    ) -> Result<ToolResult, ToolError> {
        if context.is_cancelled() {
            return Err(ToolError::Cancelled);
        }

        let executable_path = self.executable_path()?.to_path_buf();
        let task_id = self
            .task_manager
            .start_with_shell(
                command,
                context,
                TaskShell::PowerShell {
                    executable_path: executable_path.clone(),
                },
            )
            .await?;
        let output_file = self.task_manager.get_output_file_path(&task_id).await;
        let output_file_text = output_file.as_ref().map(|path| path.display().to_string());

        let summary = description
            .filter(|value| !value.trim().is_empty())
            .unwrap_or(command);
        let mut result = ToolResult::success(match output_file_text.as_deref() {
            Some(path) => format!(
                "PowerShell command running in background with ID: {task_id}\nSummary: {summary}\nOutput file: {path}"
            ),
            None => format!("PowerShell command running in background with ID: {task_id}"),
        })
        .with_metadata("task_id", json!(task_id))
        .with_metadata("background", json!(true))
        .with_metadata("shell", json!("powershell"))
        .with_metadata("command", json!(command))
        .with_metadata(
            "cwd",
            json!(context.working_directory.display().to_string()),
        )
        .with_metadata("execution_surface", json!("embedded"))
        .with_metadata("summary", json!(summary))
        .with_metadata("executable", json!(executable_path.display().to_string()));

        if let Some(path) = output_file_text {
            result = result.with_metadata("output_file", json!(path));
        }

        Ok(result)
    }
}

impl Default for PowerShellTool {
    fn default() -> Self {
        Self::new()
    }
}

fn build_missing_read_target_result(paths: &[PathBuf]) -> ToolResult {
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
        .with_metadata("preflight_check", json!("missing_read_target"))
        .with_metadata("missing_paths", json!(path_values))
}

fn build_windows_wsl_drive_mount_result(command: &str) -> ToolResult {
    ToolResult::error(
        "当前是 Windows 原生 PowerShell 运行时，不应使用 `/mnt/c`、`/mnt/d` 这类 WSL/Linux 挂载路径。请改用 Windows 原生路径，或先用 `$env:SystemDrive` / `Get-PSDrive -PSProvider FileSystem` 确认系统盘后再继续。",
    )
    .with_metadata("preflight_check", json!("windows_wsl_drive_mount"))
    .with_metadata("shell", json!("powershell"))
    .with_metadata("command", json!(command))
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

fn preflight_powershell_read_targets(command: &str, cwd: &Path) -> Option<ToolResult> {
    let missing_paths = missing_powershell_read_targets(command, cwd);
    (!missing_paths.is_empty()).then(|| build_missing_read_target_result(&missing_paths))
}

fn dynamic_description() -> String {
    [
        POWERSHELL_TOOL_DESCRIPTION.to_string(),
        String::new(),
        "IMPORTANT: This tool is for terminal operations via PowerShell. Do not use it for file read/write/search operations when specialized tools already exist.".to_string(),
        "Do not guess file paths. If you are not sure whether a target exists, list or search the parent directory first.".to_string(),
        String::new(),
        "Parameters:".to_string(),
        "- `command`: required PowerShell command string.".to_string(),
        format!(
            "- `timeout`: optional timeout in milliseconds. Default: {DEFAULT_TIMEOUT_MS}, max: {MAX_TIMEOUT_MS}."
        ),
        "- `description`: optional concise summary for background execution.".to_string(),
        "- `run_in_background`: optional boolean to run the command asynchronously.".to_string(),
        String::new(),
        "Prefer the dedicated Sleep tool over `Start-Sleep` when you intentionally need to wait.".to_string(),
    ]
    .join("\n")
}

#[async_trait]
impl Tool for PowerShellTool {
    fn name(&self) -> &str {
        POWERSHELL_TOOL_NAME
    }

    fn description(&self) -> &str {
        POWERSHELL_TOOL_DESCRIPTION
    }

    fn dynamic_description(&self) -> Option<String> {
        Some(dynamic_description())
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "additionalProperties": false,
            "properties": {
                "command": {
                    "type": "string",
                    "description": "The PowerShell command to execute"
                },
                "timeout": {
                    "type": "integer",
                    "description": format!("Optional timeout in milliseconds (default: {}, max: {})", DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS),
                    "minimum": 1,
                    "maximum": MAX_TIMEOUT_MS
                },
                "description": {
                    "type": "string",
                    "description": "Clear, concise description of what this command does"
                },
                "run_in_background": {
                    "type": "boolean",
                    "description": "Run the command in the background"
                }
            },
            "required": ["command"]
        })
    }

    fn options(&self) -> ToolOptions {
        ToolOptions::new()
            .with_max_retries(0)
            .with_base_timeout(Duration::from_millis(DEFAULT_TIMEOUT_MS))
            .with_dynamic_timeout(false)
    }

    async fn check_permissions(
        &self,
        params: &Value,
        context: &ToolContext,
    ) -> PermissionCheckResult {
        let input: PowerShellToolInput = match serde_json::from_value(params.clone()) {
            Ok(input) => input,
            Err(_) => return PermissionCheckResult::deny("Invalid PowerShell input"),
        };

        if input.run_in_background.unwrap_or(false)
            && detect_blocked_sleep_pattern(&input.command).is_some()
        {
            return PermissionCheckResult::allow();
        }

        match check_powershell_command_permission(&input.command, &context.working_directory) {
            ShellPermissionDecision::Allow => PermissionCheckResult::allow(),
            ShellPermissionDecision::Deny(reason) => PermissionCheckResult::deny(reason),
            ShellPermissionDecision::RequiresConfirmation(message) => {
                PermissionCheckResult::ask(message)
            }
        }
    }

    async fn execute(&self, params: Value, context: &ToolContext) -> Result<ToolResult, ToolError> {
        let input: PowerShellToolInput = serde_json::from_value(params)
            .map_err(|error| ToolError::invalid_params(format!("参数解析失败: {error}")))?;

        if input.command.trim().is_empty() {
            return Err(ToolError::invalid_params(
                "Missing required parameter: command",
            ));
        }

        if let Some(sleep_pattern) = detect_blocked_sleep_pattern(&input.command) {
            if !input.run_in_background.unwrap_or(false) {
                return Err(ToolError::invalid_params(format!(
                    "Blocked: {sleep_pattern}. Use the Sleep tool for intentional waiting, or set run_in_background to true if this command should keep running."
                )));
            }
        }

        if !input.run_in_background.unwrap_or(false) {
            if let Some(preflight_result) = preflight_windows_wsl_drive_mount(&input.command) {
                return Ok(preflight_result);
            }
            if let Some(preflight_result) =
                preflight_powershell_read_targets(&input.command, &context.working_directory)
            {
                return Ok(preflight_result);
            }
        }

        let timeout_ms = input.timeout.unwrap_or(DEFAULT_TIMEOUT_MS);
        if input.run_in_background.unwrap_or(false) {
            self.execute_background(&input.command, input.description.as_deref(), context)
                .await
        } else {
            self.execute_foreground(&input.command, timeout_ms, context)
                .await
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_powershell_tool_definition() {
        let tool = PowerShellTool::with_executable_path(Arc::new(TaskManager::new()), None);
        let definition = tool.get_definition();

        assert_eq!(definition.name, POWERSHELL_TOOL_NAME);
        assert!(definition.description.contains("run_in_background"));
        assert!(definition.description.contains("Do not guess file paths"));
        assert_eq!(
            definition
                .input_schema
                .get("required")
                .and_then(Value::as_array)
                .expect("required array"),
            &vec![Value::String("command".to_string())]
        );
    }

    #[test]
    fn test_detect_blocked_sleep_pattern() {
        assert_eq!(
            detect_blocked_sleep_pattern("Start-Sleep 5"),
            Some("standalone Start-Sleep 5".to_string())
        );
        assert_eq!(
            detect_blocked_sleep_pattern("sleep 4; Get-Process"),
            Some("Start-Sleep 4 followed by: Get-Process".to_string())
        );
        assert_eq!(
            detect_blocked_sleep_pattern("Start-Sleep -Milliseconds 500"),
            None
        );
        assert_eq!(detect_blocked_sleep_pattern("Start-Sleep 1"), None);
    }

    #[tokio::test]
    async fn test_powershell_tool_missing_runtime_returns_error() {
        let tool = PowerShellTool::with_executable_path(Arc::new(TaskManager::new()), None);

        let result = tool
            .execute(
                json!({
                    "command": "Write-Output 'hello'"
                }),
                &ToolContext::default(),
            )
            .await;

        assert!(matches!(result, Err(ToolError::ExecutionFailed(_))));
    }

    #[tokio::test]
    async fn test_powershell_tool_check_permissions_blocks_long_sleep() {
        let tool = PowerShellTool::with_executable_path(Arc::new(TaskManager::new()), None);

        let result = tool
            .check_permissions(
                &json!({
                    "command": "Start-Sleep 5"
                }),
                &ToolContext::default(),
            )
            .await;

        assert!(result.is_denied());
    }

    #[tokio::test]
    async fn test_powershell_tool_check_permissions_warns_set_content() {
        let tool = PowerShellTool::with_executable_path(Arc::new(TaskManager::new()), None);

        let result = tool
            .check_permissions(
                &json!({
                    "command": "Set-Content notes.txt 'hello'"
                }),
                &ToolContext::default(),
            )
            .await;

        assert!(result.requires_confirmation());
    }

    #[tokio::test]
    async fn test_powershell_tool_check_permissions_outside_workspace_mentions_path_scope() {
        let tool = PowerShellTool::with_executable_path(Arc::new(TaskManager::new()), None);

        let result = tool
            .check_permissions(
                &json!({
                    "command": "Set-Content ../notes.txt 'hello'"
                }),
                &ToolContext::new(PathBuf::from("/tmp/project")),
            )
            .await;

        assert!(result.requires_confirmation());
        assert!(result
            .message
            .as_deref()
            .unwrap_or_default()
            .contains("outside the current working directory"));
    }

    #[tokio::test]
    async fn test_powershell_tool_check_permissions_denies_git_reset_hard() {
        let tool = PowerShellTool::with_executable_path(Arc::new(TaskManager::new()), None);

        let result = tool
            .check_permissions(
                &json!({
                    "command": "git reset --hard HEAD~1"
                }),
                &ToolContext::default(),
            )
            .await;

        assert!(result.is_denied());
    }

    #[tokio::test]
    async fn test_powershell_tool_check_permissions_denies_relative_root_removal() {
        let tool = PowerShellTool::with_executable_path(Arc::new(TaskManager::new()), None);

        let result = tool
            .check_permissions(
                &json!({
                    "command": "Remove-Item ../../ -Recurse -Force"
                }),
                &ToolContext::new(PathBuf::from("/tmp/project")),
            )
            .await;

        assert!(result.is_denied());
        assert!(result
            .message
            .as_deref()
            .unwrap_or_default()
            .contains("protected path"));
    }

    #[tokio::test]
    async fn test_powershell_tool_check_permissions_denies_symlink_creation() {
        let tool = PowerShellTool::with_executable_path(Arc::new(TaskManager::new()), None);

        let result = tool
            .check_permissions(
                &json!({
                    "command": "New-Item -ItemType SymbolicLink -Path link -Target target"
                }),
                &ToolContext::default(),
            )
            .await;

        assert!(result.is_denied());
    }

    #[tokio::test]
    async fn test_powershell_tool_check_permissions_allows_null_redirection() {
        let tool = PowerShellTool::with_executable_path(Arc::new(TaskManager::new()), None);

        let result = tool
            .check_permissions(
                &json!({
                    "command": "Get-Content notes.txt > $null"
                }),
                &ToolContext::default(),
            )
            .await;

        assert!(result.is_allowed());
    }

    #[test]
    fn test_command_references_wsl_drive_mount_detects_screenshot_windows_probe() {
        assert!(command_references_wsl_drive_mount(
            "ls /mnt/c/Users/ 2>/dev/null || ls /mnt 2>/dev/null"
        ));
        assert!(command_references_wsl_drive_mount(
            "Get-Content '/run/desktop/mnt/host/c/Users/demo/file.txt'"
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
        .expect("应阻断 Windows 原生 PowerShell 中的 WSL 盘符探测");

        assert!(result.is_error());
        assert!(result.content().contains("Windows 原生 PowerShell"));
        assert_eq!(
            result.metadata.get("preflight_check"),
            Some(&json!("windows_wsl_drive_mount"))
        );
    }

    #[tokio::test]
    async fn test_powershell_tool_execute_preflights_missing_read_target() {
        use tempfile::tempdir;

        let temp_dir = tempdir().unwrap();
        let missing_path = temp_dir.path().join("missing.txt");
        let tool = PowerShellTool::with_executable_path(Arc::new(TaskManager::new()), None);

        let result = tool
            .execute(
                json!({
                    "command": format!("Get-Content {}", missing_path.display())
                }),
                &ToolContext::new(temp_dir.path().to_path_buf()),
            )
            .await
            .unwrap();

        assert!(result.is_error());
        assert!(result.message().unwrap_or_default().contains("路径不存在"));
        assert_eq!(
            result.metadata.get("preflight_check"),
            Some(&json!("missing_read_target"))
        );
    }

    #[test]
    fn test_powershell_tool_options() {
        let tool = PowerShellTool::with_executable_path(Arc::new(TaskManager::new()), None);
        let options = tool.options();

        assert_eq!(options.max_retries, 0);
        assert_eq!(
            options.base_timeout,
            Duration::from_millis(DEFAULT_TIMEOUT_MS)
        );
        assert!(!options.enable_dynamic_timeout);
    }

    #[test]
    fn test_format_output_uses_semantic_message_when_empty() {
        let tool = PowerShellTool::with_executable_path(Arc::new(TaskManager::new()), None);
        let result = tool.format_output_with_message("", "", 1, Some("No matches found"));
        assert_eq!(result, "No matches found");
    }
}
