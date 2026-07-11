use super::*;
use serde_json::json;
use std::collections::HashMap;
use std::path::PathBuf;
use tempfile::tempdir;

fn request<'a>(params: &'a Value, working_directory: PathBuf) -> RuntimeShellToolRequest<'a> {
    request_with_tool_name("Bash", params, working_directory)
}

fn request_with_tool_name<'a>(
    tool_name: &'a str,
    params: &'a Value,
    working_directory: PathBuf,
) -> RuntimeShellToolRequest<'a> {
    RuntimeShellToolRequest {
        tool_name,
        params,
        working_directory,
        session_id: "shell-session".to_string(),
        environment: HashMap::new(),
        has_workspace_sandbox: false,
        cancel_token: None,
        turn_context: None,
    }
}

fn request_with_turn_context<'a>(
    params: &'a Value,
    working_directory: PathBuf,
    turn_context: &'a RuntimeToolTurnContext,
) -> RuntimeShellToolRequest<'a> {
    RuntimeShellToolRequest {
        tool_name: "Bash",
        params,
        working_directory,
        session_id: "shell-session".to_string(),
        environment: HashMap::new(),
        has_workspace_sandbox: false,
        cancel_token: None,
        turn_context: Some(turn_context),
    }
}

fn sandbox_request<'a>(
    params: &'a Value,
    working_directory: PathBuf,
) -> RuntimeShellToolRequest<'a> {
    RuntimeShellToolRequest {
        tool_name: "Bash",
        params,
        working_directory,
        session_id: "shell-session".to_string(),
        environment: HashMap::new(),
        has_workspace_sandbox: true,
        cancel_token: None,
        turn_context: None,
    }
}

#[test]
fn shell_tool_definitions_are_current_model_visible_contract() {
    let definitions = shell_tool_definitions();

    assert!(definitions.iter().any(|definition| {
        definition.name == BASH_TOOL_NAME
            && definition.input_schema.get("required") == Some(&json!(["command"]))
    }));
    assert!(definitions
        .iter()
        .any(|definition| definition.name == POWERSHELL_TOOL_NAME));
    assert_eq!(
        shell_canonical_tool_name("shell_command"),
        Some(BASH_TOOL_NAME)
    );
    assert_eq!(
        shell_canonical_tool_name("exec_command"),
        Some(BASH_TOOL_NAME)
    );
    assert_eq!(
        shell_canonical_tool_name("PowerShellTool"),
        Some(POWERSHELL_TOOL_NAME)
    );
}

#[tokio::test]
async fn unknown_tool_returns_none_for_registry_fallback() {
    let params = json!({ "command": "printf ignored" });

    let result = execute_runtime_shell_tool(RuntimeShellToolRequest {
        tool_name: "Read",
        params: &params,
        working_directory: PathBuf::from("."),
        session_id: "shell-session".to_string(),
        environment: HashMap::new(),
        has_workspace_sandbox: false,
        cancel_token: None,
        turn_context: None,
    })
    .await;

    assert!(result.is_none());
}

#[tokio::test]
async fn workspace_sandbox_request_is_handled_by_current_guard() {
    let params = json!({ "command": "printf sandbox" });
    let dir = tempdir().expect("tempdir");

    let result = execute_runtime_shell_tool(sandbox_request(&params, dir.path().to_path_buf()))
        .await
        .expect("workspace sandbox shell must not fall back to Aster registry")
        .expect("workspace sandbox guard should produce a structured tool result");

    assert_eq!(result.is_error, Some(true));
    let metadata = result.structured_content.expect("metadata");
    assert_eq!(
        metadata.get("execution_surface"),
        Some(&json!("current_workspace_sandbox_guard"))
    );
    assert_eq!(
        metadata.get("reasonCode"),
        Some(&json!("workspace_sandbox_current_executor_missing"))
    );
    assert_eq!(metadata.get("sandboxBackendEnforced"), Some(&json!(true)));
}

#[tokio::test]
async fn background_request_starts_current_background_process() {
    let params = json!({ "command": "printf background", "background": true });
    let dir = tempdir().expect("tempdir");

    let result = execute_runtime_shell_tool(request(&params, dir.path().to_path_buf()))
        .await
        .expect("background Bash should be handled by current shell owner")
        .expect("background Bash should start");

    assert_eq!(result.is_error, Some(false));
    let metadata = result.structured_content.expect("metadata");
    assert_eq!(metadata.get("background"), Some(&json!(true)));
    assert_eq!(metadata.get("execution_surface"), Some(&json!("embedded")));
    assert!(metadata.get("task_id").and_then(Value::as_str).is_some());
    let output_file = metadata
        .get("output_file")
        .and_then(Value::as_str)
        .expect("output file metadata");
    assert!(!output_file.contains("aster_tasks"));

    let mut captured = String::new();
    for _ in 0..20 {
        captured = tokio::fs::read_to_string(output_file)
            .await
            .unwrap_or_default();
        if captured.contains("background") {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(25)).await;
    }
    assert!(captured.contains("background"));
}

#[tokio::test]
async fn dangerous_command_fails_before_execution() {
    let params = json!({ "command": "rm -rf /" });
    let dir = tempdir().expect("tempdir");

    let result = execute_runtime_shell_tool(request(&params, dir.path().to_path_buf()))
        .await
        .expect("Bash should be handled by current shell owner");

    let Err(error) = result else {
        panic!("dangerous command must fail");
    };
    assert!(error.message.contains("dangerous") || error.message.contains("high risk"));
}

#[tokio::test]
async fn foreground_bash_executes_with_current_metadata() {
    let params = json!({ "command": "printf shell-current" });
    let dir = tempdir().expect("tempdir");

    let result = execute_runtime_shell_tool(request(&params, dir.path().to_path_buf()))
        .await
        .expect("Bash should be handled by current shell owner")
        .expect("Bash execution should succeed");

    assert_eq!(result.is_error, Some(false));
    assert_eq!(
        result
            .content
            .iter()
            .find_map(|content| content.as_text())
            .map(|text| text.text.as_ref()),
        Some("shell-current")
    );
    let metadata = result.structured_content.expect("metadata");
    assert_eq!(
        metadata.get("command"),
        Some(&json!("printf shell-current"))
    );
    assert_eq!(metadata.get("execution_surface"), Some(&json!("embedded")));
}

#[tokio::test]
async fn legacy_shell_aliases_are_handled_by_current_owner() {
    let params = json!({ "cmd": "printf alias-current" });
    let dir = tempdir().expect("tempdir");

    for tool_name in [
        "BashTool",
        "Shell",
        "developer__shell",
        "mcp__system__shell",
        "shell_command",
        "exec_command",
        "local_shell_call",
    ] {
        let result = execute_runtime_shell_tool(request_with_tool_name(
            tool_name,
            &params,
            dir.path().to_path_buf(),
        ))
        .await
        .expect("legacy shell alias must not fall back to Aster registry")
        .expect("legacy shell alias should execute through current shell owner");

        assert_eq!(result.is_error, Some(false), "{tool_name}");
        let metadata = result.structured_content.expect("metadata");
        assert_eq!(
            metadata.get("execution_surface"),
            Some(&json!("embedded")),
            "{tool_name}"
        );
        assert_eq!(
            metadata.get("command"),
            Some(&json!("printf alias-current")),
            "{tool_name}"
        );
    }
}

#[tokio::test]
async fn warning_command_without_full_access_returns_current_guard() {
    let params = json!({ "command": "printf warning; export PATH=/tmp" });
    let dir = tempdir().expect("tempdir");
    let turn_context = RuntimeToolTurnContext {
        approval_policy: Some("on-request".to_string()),
        sandbox_policy: Some("workspace-write".to_string()),
        ..RuntimeToolTurnContext::default()
    };

    let result = execute_runtime_shell_tool(request_with_turn_context(
        &params,
        dir.path().to_path_buf(),
        &turn_context,
    ))
    .await;

    let result = result
        .expect("known Bash warning must not fall back to Aster registry")
        .expect("warning guard should produce a structured tool result");

    assert_eq!(result.is_error, Some(true));
    let metadata = result.structured_content.expect("metadata");
    assert_eq!(
        metadata.get("execution_surface"),
        Some(&json!("current_shell_permission_guard"))
    );
    assert_eq!(
        metadata.get("reasonCode"),
        Some(&json!("shell_confirmation_required"))
    );
    assert_eq!(metadata.get("confirmationRequired"), Some(&json!(true)));
    assert_eq!(
        metadata.get("failureCategory"),
        Some(&json!("approval_required"))
    );
}

#[tokio::test]
async fn warning_command_with_full_access_sandbox_executes_without_registry_fallback() {
    let params = json!({ "command": "printf full-access; export PATH=/tmp" });
    let dir = tempdir().expect("tempdir");
    let turn_context = RuntimeToolTurnContext {
        approval_policy: Some("on-request".to_string()),
        sandbox_policy: Some("danger-full-access".to_string()),
        ..RuntimeToolTurnContext::default()
    };

    let result = execute_runtime_shell_tool(request_with_turn_context(
        &params,
        dir.path().to_path_buf(),
        &turn_context,
    ))
    .await
    .expect("full-access shell warning should be handled by current shell owner")
    .expect("full-access shell warning should execute without approval fallback");

    assert_eq!(result.is_error, Some(false));
    assert_eq!(
        result
            .content
            .iter()
            .find_map(|content| content.as_text())
            .map(|text| text.text.as_ref()),
        Some("full-access")
    );
}

#[tokio::test]
async fn missing_read_target_returns_preflight_error() {
    let params = json!({ "command": "cat missing-file.txt" });
    let dir = tempdir().expect("tempdir");

    let result = execute_runtime_shell_tool(request(&params, dir.path().to_path_buf()))
        .await
        .expect("Bash should be handled by current shell owner")
        .expect("preflight should return a tool result");

    assert_eq!(result.is_error, Some(true));
    let metadata = result.structured_content.expect("metadata");
    assert_eq!(
        metadata.get("preflight_check"),
        Some(&json!("missing_read_target"))
    );
}
