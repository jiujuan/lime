use super::*;
use crate::AgentTurnContext;
use lime_core::config::{
    ToolExecutionOverrideConfig as ConfigToolExecutionOverrideConfig,
    ToolExecutionPolicyConfig as ConfigToolExecutionPolicyConfig,
    ToolExecutionSandboxProfileConfig as ConfigToolExecutionSandboxProfileConfig,
    ToolExecutionWarningPolicyConfig as ConfigToolExecutionWarningPolicyConfig,
};
use serde_json::json;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::time::Duration;
use tokio_util::sync::CancellationToken;
use tool_runtime::execution_process::{
    ExecutionOutputDelta, ExecutionProcessSnapshot, ExecutionProcessStatus,
    LiveExecutionProcessRegistry, LocalExecutionProcessControlHandle,
};
use tool_runtime::tool_executor::{
    RuntimeToolExecutionError, RuntimeToolExecutionFuture, RuntimeToolExecutionRequest,
    RuntimeToolExecutor, RuntimeToolExecutorHandle,
};

struct UnexpectedToolExecutor;

impl RuntimeToolExecutor for UnexpectedToolExecutor {
    fn execute<'a>(
        &'a self,
        _request: RuntimeToolExecutionRequest<'a>,
    ) -> RuntimeToolExecutionFuture<'a> {
        Box::pin(async {
            Err(RuntimeToolExecutionError::new(
                "live process should not fall back to registry executor".to_string(),
                None,
            ))
        })
    }
}

fn unexpected_tool_executor() -> RuntimeToolExecutorHandle {
    RuntimeToolExecutorHandle::new(Arc::new(UnexpectedToolExecutor))
}

#[derive(Default)]
struct RecordingLiveProcessRegistry {
    finished: Mutex<Vec<ExecutionProcessSnapshot>>,
}

impl LiveExecutionProcessRegistry for RecordingLiveProcessRegistry {
    fn register_live_process(
        &self,
        _handle: LocalExecutionProcessControlHandle,
        _snapshot: ExecutionProcessSnapshot,
    ) -> Result<(), String> {
        Ok(())
    }

    fn record_live_process_output(&self, _delta: ExecutionOutputDelta) -> Result<(), String> {
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
async fn live_shell_process_is_terminated_by_turn_cancel_token() {
    let live_registry = Arc::new(RecordingLiveProcessRegistry::default());
    let cancel_token = CancellationToken::new();
    let cancel_from_task = cancel_token.clone();
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(100)).await;
        cancel_from_task.cancel();
    });

    let batch = tokio::time::timeout(
        Duration::from_secs(5),
        execute_planned_tool_batch(
            ToolExecutionBatchInput {
                executor: unexpected_tool_executor(),
                session_id: "session-live-process-cancel".to_string(),
                working_directory: std::env::current_dir().unwrap_or_default(),
                cancel_token: Some(cancel_token),
                turn_context: Some(AgentTurnContext {
                    sandbox_policy: Some("workspace-write".to_string()),
                    approval_policy: Some("never".to_string()),
                    ..AgentTurnContext::default()
                }),
                persisted_execution_policy: Some(allow_live_shell_policy()),
                parallelism: 1,
                auto_mode: false,
                bypass_restrictions: false,
                live_process_registry: Some(live_registry.clone()),
            },
            vec![PlannedToolExecution {
                tool_name: "Bash".to_string(),
                tool_id: "tool-live-process-cancel".to_string(),
                arguments: Some(format!(r#"{{"command":"{}"}}"#, live_shell_sleep_command())),
                params: json!({ "command": live_shell_sleep_command() }),
            }],
        ),
    )
    .await
    .expect("turn cancel should terminate the live process promptly");

    let outcome = batch.outcomes.first().expect("tool outcome");
    assert!(!outcome.success);
    assert_eq!(
        outcome.error.as_deref(),
        Some("process terminated by turn cancellation")
    );
    let metadata = outcome.metadata.as_ref().expect("metadata");
    assert_eq!(
        metadata.get("executionProcessCancellation"),
        Some(&json!("turn_cancel"))
    );
    assert_eq!(
        metadata.get("execution_process_cancellation"),
        Some(&json!("turn_cancel"))
    );
    assert_eq!(
        metadata.get("executionProcessStatus"),
        Some(&json!("terminated"))
    );
    assert!(batch.events.iter().any(|event| matches!(
        event,
        RuntimeAgentEvent::ToolOutputDelta {
            tool_id,
            output_kind,
            metadata,
            ..
        } if tool_id == "tool-live-process-cancel"
            && output_kind.as_deref() == Some("process")
            && metadata
                .as_ref()
                .and_then(|metadata| metadata.get("executionProcessStatus"))
                == Some(&json!("terminated"))
    )));

    let finished = live_registry.finished.lock().expect("finished snapshots");
    assert_eq!(finished.len(), 1);
    assert_eq!(finished[0].status, ExecutionProcessStatus::Terminated);
}

fn allow_live_shell_policy() -> ConfigToolExecutionPolicyConfig {
    ConfigToolExecutionPolicyConfig {
        tool_overrides: HashMap::from([(
            "Bash".to_string(),
            ConfigToolExecutionOverrideConfig {
                warning_policy: Some(ConfigToolExecutionWarningPolicyConfig::None),
                restriction_profile: None,
                sandbox_profile: Some(ConfigToolExecutionSandboxProfileConfig::None),
            },
        )]),
        ..Default::default()
    }
}

fn live_shell_sleep_command() -> &'static str {
    if cfg!(windows) {
        "timeout /T 5 /NOBREAK >NUL"
    } else {
        "sleep 5"
    }
}
