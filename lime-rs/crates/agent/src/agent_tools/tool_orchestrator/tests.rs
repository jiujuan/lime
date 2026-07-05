use super::*;
use crate::protocol::{AgentEvent as RuntimeAgentEvent, AgentToolResult};
use crate::AgentTurnContext;
use lime_core::config::{
    ToolExecutionOverrideConfig as ConfigToolExecutionOverrideConfig,
    ToolExecutionPolicyConfig as ConfigToolExecutionPolicyConfig,
    ToolExecutionSandboxProfileConfig as ConfigToolExecutionSandboxProfileConfig,
    ToolExecutionWarningPolicyConfig as ConfigToolExecutionWarningPolicyConfig,
};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::time::Duration;
use tool_runtime::execution_process::{
    ExecutionOutputDelta, ExecutionProcessSnapshot, LiveExecutionProcessRegistry,
    LocalExecutionProcessControlHandle,
};
use tool_runtime::tool_executor::{
    RuntimeToolExecutionError, RuntimeToolExecutionFuture, RuntimeToolExecutionRequest,
    RuntimeToolExecutionResult, RuntimeToolExecutor, RuntimeToolExecutorHandle,
    RuntimeToolPolicyErrorKind,
};

struct TestToolExecutor;

impl RuntimeToolExecutor for TestToolExecutor {
    fn execute<'a>(
        &'a self,
        request: RuntimeToolExecutionRequest<'a>,
    ) -> RuntimeToolExecutionFuture<'a> {
        Box::pin(async move { execute_test_tool(request).await })
    }
}

fn test_tool_executor() -> RuntimeToolExecutorHandle {
    RuntimeToolExecutorHandle::new(Arc::new(TestToolExecutor))
}

async fn execute_test_tool(
    request: RuntimeToolExecutionRequest<'_>,
) -> Result<RuntimeToolExecutionResult, RuntimeToolExecutionError> {
    let output = match request.tool_name {
        "Echo" => {
            let text = request
                .params
                .get("text")
                .and_then(Value::as_str)
                .unwrap_or_default();
            format!("{}:{text}", request.context.session_id())
        }
        "DelayEcho" => {
            let delay_ms = request
                .params
                .get("delayMs")
                .and_then(Value::as_u64)
                .unwrap_or_default();
            if delay_ms > 0 {
                tokio::time::sleep(Duration::from_millis(delay_ms)).await;
            }
            request
                .params
                .get("text")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string()
        }
        "Bash" | "BashTool" => {
            let command = request
                .params
                .get("command")
                .and_then(Value::as_str)
                .unwrap_or_default();
            format!("{}:{command}", request.context.session_id())
        }
        other => {
            let reason = format!("unsupported test tool: {other}");
            return Err(RuntimeToolExecutionError::new(
                reason.clone(),
                Some(RuntimeToolPolicyErrorKind::ExecutionFailed(reason)),
            ));
        }
    };

    Ok(RuntimeToolExecutionResult::new(
        true,
        output,
        None,
        HashMap::from([(
            "contextWorkspaceSandbox".to_string(),
            json!(request.context.has_workspace_sandbox()),
        )]),
    ))
}

#[derive(Default)]
struct RecordingLiveProcessRegistry {
    registered: Mutex<Vec<ExecutionProcessSnapshot>>,
    output: Mutex<Vec<ExecutionOutputDelta>>,
    finished: Mutex<Vec<ExecutionProcessSnapshot>>,
    control_statuses: Mutex<Vec<ExecutionProcessSnapshot>>,
}

impl LiveExecutionProcessRegistry for RecordingLiveProcessRegistry {
    fn register_live_process(
        &self,
        handle: LocalExecutionProcessControlHandle,
        snapshot: ExecutionProcessSnapshot,
    ) -> Result<(), String> {
        self.control_statuses
            .lock()
            .map_err(|_| "control status lock poisoned".to_string())?
            .push(handle.status());
        self.registered
            .lock()
            .map_err(|_| "registered lock poisoned".to_string())?
            .push(snapshot);
        Ok(())
    }

    fn record_live_process_output(&self, delta: ExecutionOutputDelta) -> Result<(), String> {
        self.output
            .lock()
            .map_err(|_| "output lock poisoned".to_string())?
            .push(delta);
        Ok(())
    }

    fn finish_live_process(&self, snapshot: ExecutionProcessSnapshot) -> Result<(), String> {
        self.finished
            .lock()
            .map_err(|_| "finished lock poisoned".to_string())?
            .push(snapshot);
        Ok(())
    }
}

#[tokio::test]
async fn check_shell_tool_permissions_uses_tool_runtime_permission_owner() {
    let cwd = std::env::current_dir().unwrap_or_default();

    let denied = check_shell_tool_permissions("Bash", "rm -rf /", cwd.clone()).await;
    assert!(
        denied
            .as_ref()
            .err()
            .is_some_and(|reason| reason.contains("dangerous pattern")),
        "expected current shell permission denial, got {denied:?}"
    );

    let allowed = check_shell_tool_permissions("BashTool", "echo ok", cwd).await;
    assert!(allowed.is_ok());
}

#[tokio::test]
async fn execute_planned_tool_batch_emits_tool_start_and_terminal_events() {
    let batch = execute_planned_tool_batch(
        ToolExecutionBatchInput {
            executor: test_tool_executor(),
            session_id: "session-tool-batch".to_string(),
            working_directory: std::env::current_dir().unwrap_or_default(),
            cancel_token: None,
            turn_context: None,
            persisted_execution_policy: None,
            parallelism: 2,
            auto_mode: false,
            bypass_restrictions: false,
            live_process_registry: None,
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
    let batch = execute_planned_tool_batch(
        ToolExecutionBatchInput {
            executor: test_tool_executor(),
            session_id: "session-tool-order".to_string(),
            working_directory: std::env::current_dir().unwrap_or_default(),
            cancel_token: None,
            turn_context: None,
            persisted_execution_policy: None,
            parallelism: 2,
            auto_mode: false,
            bypass_restrictions: false,
            live_process_registry: None,
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
    let working_directory = std::env::current_dir().unwrap_or_default();
    let batch = execute_planned_tool_batch(
        ToolExecutionBatchInput {
            executor: test_tool_executor(),
            session_id: "session-policy-denied".to_string(),
            working_directory: working_directory.clone(),
            cancel_token: None,
            turn_context: Some(AgentTurnContext {
                sandbox_policy: Some("workspace-write".to_string()),
                approval_policy: Some("never".to_string()),
                ..AgentTurnContext::default()
            }),
            persisted_execution_policy: None,
            parallelism: 1,
            auto_mode: false,
            bypass_restrictions: false,
            live_process_registry: None,
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
    let working_directory = std::env::current_dir().unwrap_or_default();
    let batch = execute_planned_tool_batch(
        ToolExecutionBatchInput {
            executor: test_tool_executor(),
            session_id: "session-action-required".to_string(),
            working_directory: working_directory.clone(),
            cancel_token: None,
            turn_context: Some(AgentTurnContext {
                sandbox_policy: Some("workspace-write".to_string()),
                approval_policy: Some("on_request".to_string()),
                ..AgentTurnContext::default()
            }),
            persisted_execution_policy: None,
            parallelism: 1,
            auto_mode: false,
            bypass_restrictions: false,
            live_process_registry: None,
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
    let working_directory = std::env::current_dir().unwrap_or_default();
    let batch = execute_planned_tool_batch(
        ToolExecutionBatchInput {
            executor: test_tool_executor(),
            session_id: "session-sandbox-blocked".to_string(),
            working_directory: working_directory.clone(),
            cancel_token: None,
            turn_context: Some(AgentTurnContext {
                sandbox_policy: Some("read-only".to_string()),
                approval_policy: Some("never".to_string()),
                ..AgentTurnContext::default()
            }),
            persisted_execution_policy: None,
            parallelism: 1,
            auto_mode: false,
            bypass_restrictions: false,
            live_process_registry: None,
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
    let batch = execute_planned_tool_batch(
        ToolExecutionBatchInput {
            executor: test_tool_executor(),
            session_id: "session-persisted-policy".to_string(),
            working_directory: std::env::current_dir().unwrap_or_default(),
            cancel_token: None,
            turn_context: Some(AgentTurnContext {
                sandbox_policy: Some("workspace-write".to_string()),
                approval_policy: Some("on_request".to_string()),
                ..AgentTurnContext::default()
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
            live_process_registry: None,
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
    let batch = execute_planned_tool_batch(
        ToolExecutionBatchInput {
            executor: test_tool_executor(),
            session_id: "session-process-delta".to_string(),
            working_directory: std::env::current_dir().unwrap_or_default(),
            cancel_token: None,
            turn_context: Some(AgentTurnContext {
                sandbox_policy: Some("workspace-write".to_string()),
                approval_policy: Some("never".to_string()),
                ..AgentTurnContext::default()
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
            live_process_registry: None,
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

    let process_delta_index = batch
        .events
        .iter()
        .position(|event| {
            matches!(
                event,
                RuntimeAgentEvent::ToolOutputDelta {
                    tool_id,
                    delta,
                    output_kind,
                    metadata,
                } if tool_id == "tool-process"
                    && delta.is_empty()
                    && output_kind.as_deref() == Some("process")
                    && metadata.as_ref().and_then(|metadata| metadata.get("processId"))
                        == Some(&json!("process-tool-process"))
                    && metadata
                        .as_ref()
                        .and_then(|metadata| metadata.get("executionProcessStatus"))
                        == Some(&json!("running"))
                    && metadata
                        .as_ref()
                        .and_then(|metadata| metadata.get("executionSurface"))
                        == Some(&json!("live_process"))
                    && metadata
                        .as_ref()
                        .and_then(|metadata| metadata.get("stdinWritable"))
                        == Some(&json!(true))
            )
        })
        .expect("process lifecycle delta should be emitted");
    let delta_index = batch
        .events
        .iter()
        .position(|event| {
            matches!(
                event,
                RuntimeAgentEvent::ToolOutputDelta { delta, .. }
                    if delta.contains("live-shell-output")
            )
        })
        .expect("shell output delta should be emitted");
    let terminal_process_delta_index = batch
        .events
        .iter()
        .position(|event| {
            matches!(
                event,
                RuntimeAgentEvent::ToolOutputDelta {
                    tool_id,
                    delta,
                    output_kind,
                    metadata,
                } if tool_id == "tool-process"
                    && delta.is_empty()
                    && output_kind.as_deref() == Some("process")
                    && metadata.as_ref().and_then(|metadata| metadata.get("processId"))
                        == Some(&json!("process-tool-process"))
                    && metadata
                        .as_ref()
                        .and_then(|metadata| metadata.get("executionProcessStatus"))
                        == Some(&json!("exited"))
                    && metadata
                        .as_ref()
                        .and_then(|metadata| metadata.get("executionSurface"))
                        == Some(&json!("live_process"))
                    && metadata.as_ref().and_then(|metadata| metadata.get("exit_code"))
                        == Some(&json!(0))
                    && metadata
                        .as_ref()
                        .and_then(|metadata| metadata.get("stdinWritable"))
                        == Some(&json!(false))
            )
        })
        .expect("terminal process lifecycle delta should be emitted");
    let terminal_index = batch
        .events
        .iter()
        .position(|event| matches!(event, RuntimeAgentEvent::ToolEnd { .. }))
        .expect("terminal event should be emitted");
    assert!(process_delta_index < delta_index);
    assert!(delta_index < terminal_index);
    assert!(delta_index < terminal_process_delta_index);
    assert!(terminal_process_delta_index < terminal_index);

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
async fn execute_planned_shell_live_process_updates_registry() {
    let live_registry = Arc::new(RecordingLiveProcessRegistry::default());

    let batch = execute_planned_tool_batch(
        ToolExecutionBatchInput {
            executor: test_tool_executor(),
            session_id: "session-process-registry".to_string(),
            working_directory: std::env::current_dir().unwrap_or_default(),
            cancel_token: None,
            turn_context: Some(AgentTurnContext {
                sandbox_policy: Some("workspace-write".to_string()),
                approval_policy: Some("never".to_string()),
                ..AgentTurnContext::default()
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
            live_process_registry: Some(live_registry.clone()),
        },
        vec![PlannedToolExecution {
            tool_name: "Bash".to_string(),
            tool_id: "tool-process-registry".to_string(),
            arguments: Some(format!(
                r#"{{"command":"{}"}}"#,
                live_shell_output_command()
            )),
            params: json!({ "command": live_shell_output_command() }),
        }],
    )
    .await;

    assert!(batch.outcomes[0].success);
    assert_eq!(
        batch.outcomes[0]
            .metadata
            .as_ref()
            .and_then(|metadata| metadata.get("executionProcessControlStatus")),
        Some(&json!("registered"))
    );
    let registered_start_delta = batch
        .events
        .iter()
        .find(|event| {
            matches!(
                event,
                RuntimeAgentEvent::ToolOutputDelta {
                    tool_id,
                    output_kind,
                    metadata,
                    ..
                } if tool_id == "tool-process-registry"
                    && output_kind.as_deref() == Some("process")
                    && metadata
                        .as_ref()
                        .and_then(|metadata| metadata.get("executionProcessStatus"))
                        == Some(&json!("running"))
            )
        })
        .expect("registered process should emit start lifecycle delta");
    let RuntimeAgentEvent::ToolOutputDelta { metadata, .. } = registered_start_delta else {
        unreachable!("matched lifecycle delta")
    };
    let metadata = metadata.as_ref().expect("lifecycle metadata");
    assert_eq!(
        metadata.get("executionProcessControlStatus"),
        Some(&json!("registered"))
    );
    assert_eq!(
        metadata.get("execution_process_control_status"),
        Some(&json!("registered"))
    );
    assert_eq!(metadata.get("stdinWritable"), Some(&json!(true)));

    let registered = live_registry.registered.lock().expect("registered");
    assert_eq!(registered.len(), 1);
    assert_eq!(registered[0].process_id, "process-tool-process-registry");
    assert_eq!(
        registered[0].status,
        crate::agent_tools::execution::ExecutionProcessStatus::Running
    );
    drop(registered);

    let control_statuses = live_registry
        .control_statuses
        .lock()
        .expect("control statuses");
    assert_eq!(control_statuses.len(), 1);
    assert_eq!(
        control_statuses[0].process_id,
        "process-tool-process-registry"
    );
    drop(control_statuses);

    let output = live_registry.output.lock().expect("output");
    assert!(output
        .iter()
        .any(|delta| delta.delta.contains("live-shell-output")));
    drop(output);

    let finished = live_registry.finished.lock().expect("finished");
    assert_eq!(finished.len(), 1);
    assert_eq!(finished[0].process_id, "process-tool-process-registry");
    assert_eq!(
        finished[0].status,
        crate::agent_tools::execution::ExecutionProcessStatus::Exited
    );
    assert_eq!(finished[0].exit_code, Some(0));
}

#[tokio::test]
async fn execute_planned_shell_tool_process_metadata_preserves_failure_exit_code() {
    let batch = execute_planned_tool_batch(
        ToolExecutionBatchInput {
            executor: test_tool_executor(),
            session_id: "session-process-failure".to_string(),
            working_directory: std::env::current_dir().unwrap_or_default(),
            cancel_token: None,
            turn_context: Some(AgentTurnContext {
                sandbox_policy: Some("workspace-write".to_string()),
                approval_policy: Some("never".to_string()),
                ..AgentTurnContext::default()
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
            live_process_registry: None,
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
    let working_directory = std::env::current_dir().unwrap_or_default();
    let requested_cwd = std::env::temp_dir();
    let batch = execute_planned_tool_batch(
        ToolExecutionBatchInput {
            executor: test_tool_executor(),
            session_id: "session-live-process-cwd".to_string(),
            working_directory: working_directory.clone(),
            cancel_token: None,
            turn_context: Some(AgentTurnContext {
                sandbox_policy: Some("danger-full-access".to_string()),
                approval_policy: Some("never".to_string()),
                ..AgentTurnContext::default()
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
            live_process_registry: None,
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
    let batch = execute_planned_tool_batch(
        ToolExecutionBatchInput {
            executor: test_tool_executor(),
            session_id: "session-live-process-denied".to_string(),
            working_directory: std::env::current_dir().unwrap_or_default(),
            cancel_token: None,
            turn_context: Some(AgentTurnContext {
                sandbox_policy: Some("danger-full-access".to_string()),
                approval_policy: Some("never".to_string()),
                ..AgentTurnContext::default()
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
            live_process_registry: None,
        },
        vec![PlannedToolExecution {
            tool_name: "Bash".to_string(),
            tool_id: "tool-live-process-denied".to_string(),
            arguments: Some(r#"{"command":"rm -rf /"}"#.to_string()),
            params: json!({ "command": "rm -rf /" }),
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
            executor: test_tool_executor(),
            session_id: "session-workspace-sandbox".to_string(),
            working_directory: std::env::current_dir().unwrap_or_default(),
            cancel_token: None,
            turn_context: Some(AgentTurnContext {
                sandbox_policy: Some("workspace-write".to_string()),
                approval_policy: Some("never".to_string()),
                metadata,
                ..AgentTurnContext::default()
            }),
            persisted_execution_policy: None,
            parallelism: 1,
            auto_mode: false,
            bypass_restrictions: false,
            live_process_registry: None,
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
            structured_content: None,
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
