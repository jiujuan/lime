use super::*;
use crate::protocol::{AgentEvent as RuntimeAgentEvent, AgentToolResult};
use aster::session::TurnContextOverride;
use aster::tools::{PermissionCheckResult, Tool, ToolContext, ToolError, ToolRegistry, ToolResult};
use async_trait::async_trait;
use lime_core::config::{
    ToolExecutionOverrideConfig as ConfigToolExecutionOverrideConfig,
    ToolExecutionPolicyConfig as ConfigToolExecutionPolicyConfig,
    ToolExecutionSandboxProfileConfig as ConfigToolExecutionSandboxProfileConfig,
    ToolExecutionWarningPolicyConfig as ConfigToolExecutionWarningPolicyConfig,
};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::time::Duration;

struct EchoTool;

#[async_trait]
impl Tool for EchoTool {
    fn name(&self) -> &str {
        "Echo"
    }

    fn description(&self) -> &str {
        "测试工具"
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "text": { "type": "string" }
            }
        })
    }

    async fn execute(&self, params: Value, context: &ToolContext) -> Result<ToolResult, ToolError> {
        let text = params
            .get("text")
            .and_then(Value::as_str)
            .unwrap_or_default();
        Ok(ToolResult::success(format!(
            "{}:{}",
            context.session_id, text
        )))
    }
}

struct DeniedShellTool;

#[async_trait]
impl Tool for DeniedShellTool {
    fn name(&self) -> &str {
        "Bash"
    }

    fn description(&self) -> &str {
        "拒绝执行命令"
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "command": { "type": "string" }
            }
        })
    }

    async fn check_permissions(
        &self,
        _params: &Value,
        _context: &ToolContext,
    ) -> PermissionCheckResult {
        PermissionCheckResult::deny("policy denied this command")
    }

    async fn execute(
        &self,
        _params: Value,
        _context: &ToolContext,
    ) -> Result<ToolResult, ToolError> {
        Ok(ToolResult::success("should not execute"))
    }
}

struct AllowShellTool;

#[async_trait]
impl Tool for AllowShellTool {
    fn name(&self) -> &str {
        "Bash"
    }

    fn description(&self) -> &str {
        "测试 shell 工具"
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "command": { "type": "string" }
            }
        })
    }

    async fn execute(&self, params: Value, context: &ToolContext) -> Result<ToolResult, ToolError> {
        let command = params
            .get("command")
            .and_then(Value::as_str)
            .unwrap_or_default();
        Ok(
            ToolResult::success(format!("{}:{}", context.session_id, command)).with_metadata(
                "contextWorkspaceSandbox",
                json!(context.workspace_sandbox.is_some()),
            ),
        )
    }
}

struct DelayEchoTool;

#[async_trait]
impl Tool for DelayEchoTool {
    fn name(&self) -> &str {
        "DelayEcho"
    }

    fn description(&self) -> &str {
        "按参数延迟后回显"
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "text": { "type": "string" },
                "delayMs": { "type": "integer" }
            }
        })
    }

    async fn execute(
        &self,
        params: Value,
        _context: &ToolContext,
    ) -> Result<ToolResult, ToolError> {
        let delay_ms = params
            .get("delayMs")
            .and_then(Value::as_u64)
            .unwrap_or_default();
        if delay_ms > 0 {
            tokio::time::sleep(Duration::from_millis(delay_ms)).await;
        }
        let text = params
            .get("text")
            .and_then(Value::as_str)
            .unwrap_or_default();
        Ok(ToolResult::success(text.to_string()))
    }
}

#[tokio::test]
async fn execute_planned_tool_batch_emits_tool_start_and_terminal_events() {
    let registry = Arc::new(RwLock::new(ToolRegistry::new()));
    {
        let mut registry = registry.write().await;
        registry.register(Box::new(EchoTool));
    }

    let batch = execute_planned_tool_batch(
        ToolExecutionBatchInput {
            registry,
            session_id: "session-tool-batch".to_string(),
            working_directory: std::env::current_dir().unwrap_or_default(),
            cancel_token: None,
            turn_context: None,
            persisted_execution_policy: None,
            parallelism: 2,
            auto_mode: false,
            bypass_restrictions: false,
        },
        vec![PlannedToolExecution {
            tool_name: "Echo".to_string(),
            tool_id: "tool-1".to_string(),
            arguments: Some(r#"{"text":"hello"}"#.to_string()),
            params: json!({ "text": "hello" }),
        }],
    )
    .await;

    assert_eq!(batch.outcomes.len(), 1);
    assert!(batch.outcomes[0].success);
    assert_eq!(batch.outcomes[0].output, "session-tool-batch:hello");
    assert!(matches!(
        batch.events.first(),
        Some(RuntimeAgentEvent::ToolStart { tool_id, arguments, .. })
            if tool_id == "tool-1" && arguments.as_deref() == Some(r#"{"text":"hello"}"#)
    ));
    assert!(matches!(
        batch.events.last(),
        Some(RuntimeAgentEvent::ToolEnd { tool_id, result })
            if tool_id == "tool-1" && result.success
    ));
}

#[tokio::test]
async fn execute_planned_tool_batch_preserves_input_order_when_parallel() {
    let registry = Arc::new(RwLock::new(ToolRegistry::new()));
    {
        let mut registry = registry.write().await;
        registry.register(Box::new(DelayEchoTool));
    }

    let batch = execute_planned_tool_batch(
        ToolExecutionBatchInput {
            registry,
            session_id: "session-tool-order".to_string(),
            working_directory: std::env::current_dir().unwrap_or_default(),
            cancel_token: None,
            turn_context: None,
            persisted_execution_policy: None,
            parallelism: 2,
            auto_mode: false,
            bypass_restrictions: false,
        },
        vec![
            PlannedToolExecution {
                tool_name: "DelayEcho".to_string(),
                tool_id: "tool-slow".to_string(),
                arguments: Some(r#"{"text":"slow","delayMs":20}"#.to_string()),
                params: json!({ "text": "slow", "delayMs": 20 }),
            },
            PlannedToolExecution {
                tool_name: "DelayEcho".to_string(),
                tool_id: "tool-fast".to_string(),
                arguments: Some(r#"{"text":"fast","delayMs":0}"#.to_string()),
                params: json!({ "text": "fast", "delayMs": 0 }),
            },
        ],
    )
    .await;

    let event_tool_ids = batch
        .events
        .iter()
        .map(|event| match event {
            RuntimeAgentEvent::ToolStart { tool_id, .. }
            | RuntimeAgentEvent::ToolEnd { tool_id, .. } => tool_id.as_str(),
            _ => "",
        })
        .collect::<Vec<_>>();

    assert_eq!(
        event_tool_ids,
        vec!["tool-slow", "tool-fast", "tool-slow", "tool-fast"]
    );
    assert_eq!(
        batch
            .outcomes
            .iter()
            .map(|outcome| outcome.tool_id.as_str())
            .collect::<Vec<_>>(),
        vec!["tool-slow", "tool-fast"]
    );
    assert_eq!(batch.outcomes[0].output, "slow");
    assert_eq!(batch.outcomes[1].output, "fast");
}

#[tokio::test]
async fn execute_planned_tool_batch_attaches_policy_metadata_to_permission_denial() {
    let registry = Arc::new(RwLock::new(ToolRegistry::new()));
    {
        let mut registry = registry.write().await;
        registry.register(Box::new(DeniedShellTool));
    }

    let working_directory = std::env::current_dir().unwrap_or_default();
    let batch = execute_planned_tool_batch(
        ToolExecutionBatchInput {
            registry,
            session_id: "session-policy-denied".to_string(),
            working_directory: working_directory.clone(),
            cancel_token: None,
            turn_context: Some(TurnContextOverride {
                sandbox_policy: Some("workspace-write".to_string()),
                approval_policy: Some("never".to_string()),
                ..TurnContextOverride::default()
            }),
            persisted_execution_policy: None,
            parallelism: 1,
            auto_mode: false,
            bypass_restrictions: false,
        },
        vec![PlannedToolExecution {
            tool_name: "Bash".to_string(),
            tool_id: "tool-denied".to_string(),
            arguments: Some(r#"{"command":"rm -rf /tmp/outside"}"#.to_string()),
            params: json!({ "command": "rm -rf /tmp/outside" }),
        }],
    )
    .await;

    let outcome = batch.outcomes.first().expect("tool outcome");
    assert!(!outcome.success);
    let metadata = outcome.metadata.as_ref().expect("policy metadata");
    assert_eq!(
        metadata.get("eventClass"),
        Some(&json!("permission.denied"))
    );
    assert_eq!(
        metadata.get("failureCategory"),
        Some(&json!("permission_denied"))
    );
    assert_eq!(
        metadata.get("policyName"),
        Some(&json!("workspace_tool_execution"))
    );
    assert_eq!(metadata.get("policyProfile"), Some(&json!("workspace")));
    assert_eq!(metadata.get("toolSurface"), Some(&json!("runtime_tool")));
    assert_eq!(
        metadata.get("restrictionProfile"),
        Some(&json!("workspace_shell_command"))
    );
    assert_eq!(
        metadata.get("sandboxPolicy"),
        Some(&json!("workspace_command"))
    );
    assert_eq!(metadata.get("command"), Some(&json!("rm -rf /tmp/outside")));
    assert_eq!(
        metadata.get("cwd"),
        Some(&json!(working_directory.to_string_lossy().to_string()))
    );
    assert_eq!(
        metadata.get("requestedSandboxPolicy"),
        Some(&json!("workspace-write"))
    );
    assert_eq!(metadata.get("approvalPolicy"), Some(&json!("never")));
}

#[tokio::test]
async fn execute_planned_tool_batch_emits_action_required_for_shell_approval_policy() {
    let registry = Arc::new(RwLock::new(ToolRegistry::new()));
    {
        let mut registry = registry.write().await;
        registry.register(Box::new(AllowShellTool));
    }

    let working_directory = std::env::current_dir().unwrap_or_default();
    let batch = execute_planned_tool_batch(
        ToolExecutionBatchInput {
            registry,
            session_id: "session-action-required".to_string(),
            working_directory: working_directory.clone(),
            cancel_token: None,
            turn_context: Some(TurnContextOverride {
                sandbox_policy: Some("workspace-write".to_string()),
                approval_policy: Some("on_request".to_string()),
                ..TurnContextOverride::default()
            }),
            persisted_execution_policy: None,
            parallelism: 1,
            auto_mode: false,
            bypass_restrictions: false,
        },
        vec![PlannedToolExecution {
            tool_name: "Bash".to_string(),
            tool_id: "tool-approval".to_string(),
            arguments: Some(r#"{"command":"cargo test"}"#.to_string()),
            params: json!({ "command": "cargo test" }),
        }],
    )
    .await;

    assert_eq!(batch.outcomes.len(), 1);
    assert!(!batch.outcomes[0].success);
    let metadata = batch.outcomes[0].metadata.as_ref().expect("metadata");
    assert_eq!(metadata.get("eventClass"), Some(&json!("action.required")));
    assert_eq!(
        metadata.get("reasonCode"),
        Some(&json!("shell_command_requires_approval"))
    );
    assert!(batch.events.iter().any(|event| matches!(
        event,
        RuntimeAgentEvent::ActionRequired {
            request_id,
            action_type,
            data,
            ..
        } if request_id == "tool-approval"
            && action_type == "tool_confirmation"
            && data.get("command") == Some(&json!("cargo test"))
    )));
    assert!(matches!(
        batch.events.last(),
        Some(RuntimeAgentEvent::ToolEnd { tool_id, result })
            if tool_id == "tool-approval"
                && !result.success
                && result.metadata.as_ref().and_then(|metadata| metadata.get("eventClass"))
                    == Some(&json!("action.required"))
    ));
}

#[tokio::test]
async fn execute_planned_tool_batch_emits_sandbox_blocked_for_read_only_shell_write() {
    let registry = Arc::new(RwLock::new(ToolRegistry::new()));
    {
        let mut registry = registry.write().await;
        registry.register(Box::new(EchoTool));
    }

    let working_directory = std::env::current_dir().unwrap_or_default();
    let batch = execute_planned_tool_batch(
        ToolExecutionBatchInput {
            registry,
            session_id: "session-sandbox-blocked".to_string(),
            working_directory: working_directory.clone(),
            cancel_token: None,
            turn_context: Some(TurnContextOverride {
                sandbox_policy: Some("read-only".to_string()),
                approval_policy: Some("never".to_string()),
                ..TurnContextOverride::default()
            }),
            persisted_execution_policy: None,
            parallelism: 1,
            auto_mode: false,
            bypass_restrictions: false,
        },
        vec![PlannedToolExecution {
            tool_name: "Bash".to_string(),
            tool_id: "tool-sandbox".to_string(),
            arguments: Some(r#"{"command":"cargo test"}"#.to_string()),
            params: json!({ "command": "cargo test" }),
        }],
    )
    .await;

    assert_eq!(batch.outcomes.len(), 1);
    assert!(!batch.outcomes[0].success);
    let metadata = batch.outcomes[0].metadata.as_ref().expect("metadata");
    assert_eq!(metadata.get("eventClass"), Some(&json!("sandbox.blocked")));
    assert_eq!(
        metadata.get("failureCategory"),
        Some(&json!("sandbox_blocked"))
    );
    assert_eq!(
        metadata.get("reasonCode"),
        Some(&json!("read_only_sandbox_blocks_shell_command"))
    );
    assert_eq!(metadata.get("sandboxPolicy"), Some(&json!("read-only")));
    assert_eq!(metadata.get("command"), Some(&json!("cargo test")));
    assert!(matches!(
        batch.events.last(),
        Some(RuntimeAgentEvent::ToolEnd { tool_id, result })
            if tool_id == "tool-sandbox"
                && !result.success
                && result.metadata.as_ref().and_then(|metadata| metadata.get("eventClass"))
                    == Some(&json!("sandbox.blocked"))
    ));
}

#[tokio::test]
async fn execute_planned_tool_batch_respects_persisted_execution_policy() {
    let registry = Arc::new(RwLock::new(ToolRegistry::new()));
    {
        let mut registry = registry.write().await;
        registry.register(Box::new(AllowShellTool));
    }

    let batch = execute_planned_tool_batch(
        ToolExecutionBatchInput {
            registry,
            session_id: "session-persisted-policy".to_string(),
            working_directory: std::env::current_dir().unwrap_or_default(),
            cancel_token: None,
            turn_context: Some(TurnContextOverride {
                sandbox_policy: Some("workspace-write".to_string()),
                approval_policy: Some("on_request".to_string()),
                ..TurnContextOverride::default()
            }),
            persisted_execution_policy: Some(ConfigToolExecutionPolicyConfig {
                tool_overrides: HashMap::from([(
                    "Bash".to_string(),
                    ConfigToolExecutionOverrideConfig {
                        warning_policy: Some(ConfigToolExecutionWarningPolicyConfig::None),
                        restriction_profile: None,
                        sandbox_profile: Some(ConfigToolExecutionSandboxProfileConfig::None),
                    },
                )]),
                ..Default::default()
            }),
            parallelism: 1,
            auto_mode: false,
            bypass_restrictions: false,
        },
        vec![PlannedToolExecution {
            tool_name: "Bash".to_string(),
            tool_id: "tool-persisted-policy".to_string(),
            arguments: Some(format!(
                r#"{{"command":"{}"}}"#,
                live_shell_output_command()
            )),
            params: json!({ "command": live_shell_output_command() }),
        }],
    )
    .await;

    assert_eq!(batch.outcomes.len(), 1);
    assert!(batch.outcomes[0].success);
    assert!(batch.outcomes[0].output.contains("live-shell-output"));
    assert_eq!(
        batch.outcomes[0]
            .metadata
            .as_ref()
            .and_then(|metadata| metadata.get("executionSurface")),
        Some(&json!("live_process"))
    );
    assert!(!batch
        .events
        .iter()
        .any(|event| matches!(event, RuntimeAgentEvent::ActionRequired { .. })));
}

#[tokio::test]
async fn execute_planned_shell_tool_emits_process_output_delta_before_terminal_event() {
    let registry = Arc::new(RwLock::new(ToolRegistry::new()));
    {
        let mut registry = registry.write().await;
        registry.register(Box::new(AllowShellTool));
    }

    let batch = execute_planned_tool_batch(
        ToolExecutionBatchInput {
            registry,
            session_id: "session-process-delta".to_string(),
            working_directory: std::env::current_dir().unwrap_or_default(),
            cancel_token: None,
            turn_context: Some(TurnContextOverride {
                sandbox_policy: Some("workspace-write".to_string()),
                approval_policy: Some("never".to_string()),
                ..TurnContextOverride::default()
            }),
            persisted_execution_policy: Some(ConfigToolExecutionPolicyConfig {
                tool_overrides: HashMap::from([(
                    "Bash".to_string(),
                    ConfigToolExecutionOverrideConfig {
                        warning_policy: Some(ConfigToolExecutionWarningPolicyConfig::None),
                        restriction_profile: None,
                        sandbox_profile: Some(ConfigToolExecutionSandboxProfileConfig::None),
                    },
                )]),
                ..Default::default()
            }),
            parallelism: 1,
            auto_mode: false,
            bypass_restrictions: false,
        },
        vec![PlannedToolExecution {
            tool_name: "Bash".to_string(),
            tool_id: "tool-process".to_string(),
            arguments: Some(format!(
                r#"{{"command":"{}"}}"#,
                live_shell_output_command()
            )),
            params: json!({ "command": live_shell_output_command() }),
        }],
    )
    .await;

    let delta_index = batch
        .events
        .iter()
        .position(|event| matches!(event, RuntimeAgentEvent::ToolOutputDelta { .. }))
        .expect("shell output delta should be emitted");
    let terminal_index = batch
        .events
        .iter()
        .position(|event| matches!(event, RuntimeAgentEvent::ToolEnd { .. }))
        .expect("terminal event should be emitted");
    assert!(delta_index < terminal_index);

    assert!(matches!(
        &batch.events[delta_index],
        RuntimeAgentEvent::ToolOutputDelta {
            tool_id,
            delta,
            output_kind,
            metadata,
        } if tool_id == "tool-process"
            && delta.contains("live-shell-output")
            && output_kind.as_deref() == Some("stdout")
            && metadata.as_ref().and_then(|metadata| metadata.get("processId"))
                == Some(&json!("process-tool-process"))
            && metadata.as_ref().and_then(|metadata| metadata.get("outputBytes")).is_some()
    ));

    let terminal_metadata = batch.outcomes[0].metadata.as_ref().expect("metadata");
    assert_eq!(
        terminal_metadata.get("executionSurface"),
        Some(&json!("live_process"))
    );
    assert_eq!(
        terminal_metadata.get("executionProcessStatus"),
        Some(&json!("exited"))
    );
    assert_eq!(
        terminal_metadata.get("processId"),
        Some(&json!("process-tool-process"))
    );
    assert_eq!(terminal_metadata.get("exit_code"), Some(&json!(0)));
}

#[tokio::test]
async fn execute_planned_shell_tool_process_metadata_preserves_failure_exit_code() {
    let registry = Arc::new(RwLock::new(ToolRegistry::new()));
    {
        let mut registry = registry.write().await;
        registry.register(Box::new(AllowShellTool));
    }

    let batch = execute_planned_tool_batch(
        ToolExecutionBatchInput {
            registry,
            session_id: "session-process-failure".to_string(),
            working_directory: std::env::current_dir().unwrap_or_default(),
            cancel_token: None,
            turn_context: Some(TurnContextOverride {
                sandbox_policy: Some("workspace-write".to_string()),
                approval_policy: Some("never".to_string()),
                ..TurnContextOverride::default()
            }),
            persisted_execution_policy: Some(ConfigToolExecutionPolicyConfig {
                tool_overrides: HashMap::from([(
                    "Bash".to_string(),
                    ConfigToolExecutionOverrideConfig {
                        warning_policy: Some(ConfigToolExecutionWarningPolicyConfig::None),
                        restriction_profile: None,
                        sandbox_profile: Some(ConfigToolExecutionSandboxProfileConfig::None),
                    },
                )]),
                ..Default::default()
            }),
            parallelism: 1,
            auto_mode: false,
            bypass_restrictions: false,
        },
        vec![PlannedToolExecution {
            tool_name: "Bash".to_string(),
            tool_id: "tool-process-failure".to_string(),
            arguments: Some(format!(r#"{{"command":"{}"}}"#, live_shell_exit_command(7))),
            params: json!({ "command": live_shell_exit_command(7) }),
        }],
    )
    .await;

    assert!(!batch.outcomes[0].success);
    let metadata = batch.outcomes[0].metadata.as_ref().expect("metadata");
    assert_eq!(
        metadata.get("executionSurface"),
        Some(&json!("live_process"))
    );
    assert_eq!(metadata.get("exit_code"), Some(&json!(7)));
    assert_eq!(metadata.get("exitCode"), Some(&json!(7)));
    assert_eq!(
        metadata.get("executionProcessStatus"),
        Some(&json!("exited"))
    );
}

#[tokio::test]
async fn execute_planned_shell_live_process_uses_context_working_directory() {
    let registry = Arc::new(RwLock::new(ToolRegistry::new()));
    {
        let mut registry = registry.write().await;
        registry.register(Box::new(AllowShellTool));
    }

    let working_directory = std::env::current_dir().unwrap_or_default();
    let requested_cwd = std::env::temp_dir();
    let batch = execute_planned_tool_batch(
        ToolExecutionBatchInput {
            registry,
            session_id: "session-live-process-cwd".to_string(),
            working_directory: working_directory.clone(),
            cancel_token: None,
            turn_context: Some(TurnContextOverride {
                sandbox_policy: Some("danger-full-access".to_string()),
                approval_policy: Some("never".to_string()),
                ..TurnContextOverride::default()
            }),
            persisted_execution_policy: Some(ConfigToolExecutionPolicyConfig {
                tool_overrides: HashMap::from([(
                    "Bash".to_string(),
                    ConfigToolExecutionOverrideConfig {
                        warning_policy: Some(ConfigToolExecutionWarningPolicyConfig::None),
                        restriction_profile: None,
                        sandbox_profile: Some(ConfigToolExecutionSandboxProfileConfig::None),
                    },
                )]),
                ..Default::default()
            }),
            parallelism: 1,
            auto_mode: false,
            bypass_restrictions: false,
        },
        vec![PlannedToolExecution {
            tool_name: "Bash".to_string(),
            tool_id: "tool-live-process-cwd".to_string(),
            arguments: Some(r#"{"command":"pwd"}"#.to_string()),
            params: json!({
                "command": live_shell_pwd_command(),
                "cwd": requested_cwd.to_string_lossy().to_string(),
            }),
        }],
    )
    .await;

    assert!(batch.outcomes[0].success);
    let metadata = batch.outcomes[0].metadata.as_ref().expect("metadata");
    assert_eq!(
        metadata.get("executionSurface"),
        Some(&json!("live_process"))
    );
    assert_eq!(
        metadata.get("cwd"),
        Some(&json!(working_directory.to_string_lossy().to_string()))
    );
    assert_ne!(
        metadata.get("cwd"),
        Some(&json!(requested_cwd.to_string_lossy().to_string()))
    );
}

#[tokio::test]
async fn execute_planned_shell_live_process_respects_tool_permission_preflight() {
    let registry = Arc::new(RwLock::new(ToolRegistry::new()));
    {
        let mut registry = registry.write().await;
        registry.register(Box::new(DeniedShellTool));
    }

    let batch = execute_planned_tool_batch(
        ToolExecutionBatchInput {
            registry,
            session_id: "session-live-process-denied".to_string(),
            working_directory: std::env::current_dir().unwrap_or_default(),
            cancel_token: None,
            turn_context: Some(TurnContextOverride {
                sandbox_policy: Some("danger-full-access".to_string()),
                approval_policy: Some("never".to_string()),
                ..TurnContextOverride::default()
            }),
            persisted_execution_policy: Some(ConfigToolExecutionPolicyConfig {
                tool_overrides: HashMap::from([(
                    "Bash".to_string(),
                    ConfigToolExecutionOverrideConfig {
                        warning_policy: Some(ConfigToolExecutionWarningPolicyConfig::None),
                        restriction_profile: None,
                        sandbox_profile: Some(ConfigToolExecutionSandboxProfileConfig::None),
                    },
                )]),
                ..Default::default()
            }),
            parallelism: 1,
            auto_mode: false,
            bypass_restrictions: false,
        },
        vec![PlannedToolExecution {
            tool_name: "Bash".to_string(),
            tool_id: "tool-live-process-denied".to_string(),
            arguments: Some(format!(
                r#"{{"command":"{}"}}"#,
                live_shell_output_command()
            )),
            params: json!({ "command": live_shell_output_command() }),
        }],
    )
    .await;

    assert!(!batch.outcomes[0].success);
    assert!(!batch
        .events
        .iter()
        .any(|event| matches!(event, RuntimeAgentEvent::ToolOutputDelta { .. })));
    let metadata = batch.outcomes[0].metadata.as_ref().expect("metadata");
    assert_eq!(
        metadata.get("eventClass"),
        Some(&json!("permission.denied"))
    );
    assert_ne!(
        metadata.get("executionSurface"),
        Some(&json!("live_process"))
    );
}

#[tokio::test]
async fn execute_planned_tool_batch_attaches_workspace_sandbox_context_when_backend_ready() {
    let registry = Arc::new(RwLock::new(ToolRegistry::new()));
    {
        let mut registry = registry.write().await;
        registry.register(Box::new(AllowShellTool));
    }

    let mut metadata = HashMap::new();
    metadata.insert(
        "workspaceSandbox".to_string(),
        json!({
            "enabled": true,
            "strict": false
        }),
    );
    let batch = execute_planned_tool_batch(
        ToolExecutionBatchInput {
            registry,
            session_id: "session-workspace-sandbox".to_string(),
            working_directory: std::env::current_dir().unwrap_or_default(),
            cancel_token: None,
            turn_context: Some(TurnContextOverride {
                sandbox_policy: Some("workspace-write".to_string()),
                approval_policy: Some("never".to_string()),
                metadata,
                ..TurnContextOverride::default()
            }),
            persisted_execution_policy: None,
            parallelism: 1,
            auto_mode: false,
            bypass_restrictions: false,
        },
        vec![PlannedToolExecution {
            tool_name: "Bash".to_string(),
            tool_id: "tool-workspace-sandbox".to_string(),
            arguments: Some(r#"{"command":"pwd"}"#.to_string()),
            params: json!({ "command": "pwd" }),
        }],
    )
    .await;

    assert_eq!(batch.outcomes.len(), 1);
    assert!(batch.outcomes[0].success);
    let metadata = batch.outcomes[0].metadata.as_ref().expect("metadata");
    assert_eq!(metadata.get("workspaceSandboxEnabled"), Some(&json!(true)));
    assert_ne!(
        metadata.get("executionSurface"),
        Some(&json!("live_process"))
    );
    if metadata.get("sandboxBackendEnforced") == Some(&json!(true)) {
        assert_eq!(metadata.get("sandboxBackendStatus"), Some(&json!("ready")));
        assert_eq!(metadata.get("sandboxBackendEnforced"), Some(&json!(true)));
        assert_eq!(metadata.get("contextWorkspaceSandbox"), Some(&json!(true)));
    } else {
        assert_ne!(metadata.get("contextWorkspaceSandbox"), Some(&json!(true)));
    }
}

#[test]
fn workspace_sandbox_config_maps_restricted_token_backend() {
    let decision = ToolExecutionDecision {
        kind: ToolExecutionDecisionKind::Allow,
        reason_code: "allowed".to_string(),
        reason: "allowed".to_string(),
        policy_resolution: crate::agent_tools::execution::ToolExecutionPolicyResolution {
            policy: crate::agent_tools::execution::ToolExecutionPolicy::default(),
            warning_policy_source:
                crate::agent_tools::execution::ToolExecutionPolicySource::Default,
            restriction_profile_source:
                crate::agent_tools::execution::ToolExecutionPolicySource::Default,
            sandbox_profile_source:
                crate::agent_tools::execution::ToolExecutionPolicySource::Default,
        },
        metadata: HashMap::from([
            ("sandboxBackend".to_string(), json!("restricted_token")),
            (
                "requestedSandboxPolicy".to_string(),
                json!("workspace-write"),
            ),
        ]),
    };

    let config = workspace_sandbox_config(&decision, &PathBuf::from("/tmp/workspace"));

    assert!(config.enabled);
    assert_eq!(config.sandbox_type, SandboxType::RestrictedToken);
}

fn live_shell_output_command() -> &'static str {
    if cfg!(windows) {
        "echo live-shell-output"
    } else {
        "printf live-shell-output"
    }
}

fn live_shell_exit_command(code: i32) -> String {
    if cfg!(windows) {
        format!("exit /B {code}")
    } else {
        format!("exit {code}")
    }
}

fn live_shell_pwd_command() -> &'static str {
    if cfg!(windows) {
        "cd"
    } else {
        "pwd"
    }
}

#[test]
fn rewrite_tool_terminal_event_updates_matching_terminal_event() {
    let mut events = vec![RuntimeAgentEvent::ToolEnd {
        tool_id: "tool-1".to_string(),
        result: AgentToolResult {
            success: true,
            output: "old".to_string(),
            error: None,
            images: None,
            metadata: None,
        },
    }];
    let mut metadata = HashMap::new();
    metadata.insert("kind".to_string(), json!("preflight"));

    let rewritten = rewrite_tool_terminal_event(
        &mut events,
        &ToolTerminalEventUpdate {
            tool_id: "tool-1".to_string(),
            success: false,
            output: "new".to_string(),
            error: Some("missing usable link".to_string()),
            metadata: Some(metadata),
        },
    );

    assert!(rewritten);
    assert!(matches!(
        events.first(),
        Some(RuntimeAgentEvent::ToolEnd { result, .. })
            if !result.success
                && result.output == "new"
                && result.error.as_deref() == Some("missing usable link")
                && result.metadata.as_ref().and_then(|item| item.get("kind"))
                    == Some(&json!("preflight"))
    ));
}
