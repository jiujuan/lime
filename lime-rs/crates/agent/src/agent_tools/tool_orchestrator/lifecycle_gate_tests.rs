use super::*;
use crate::protocol::AgentEvent as RuntimeAgentEvent;
use crate::AgentTurnContext;
use serde_json::json;
use std::sync::Arc;
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
                "policy gate should stop before executor".to_string(),
                None,
            ))
        })
    }
}

fn unexpected_tool_executor() -> RuntimeToolExecutorHandle {
    RuntimeToolExecutorHandle::new(Arc::new(UnexpectedToolExecutor))
}

#[tokio::test]
async fn approval_required_tool_does_not_emit_output_delta_before_approval() {
    let batch = execute_planned_tool_batch(
        ToolExecutionBatchInput {
            executor: unexpected_tool_executor(),
            session_id: "session-action-required".to_string(),
            working_directory: std::env::current_dir().unwrap_or_default(),
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
    assert!(
        !batch.events.iter().any(|event| matches!(
            event,
            RuntimeAgentEvent::ToolOutputDelta { tool_id, .. } if tool_id == "tool-approval"
        )),
        "approval-required tool must not emit output deltas before approval"
    );
    assert!(
        !batch.events.iter().any(|event| matches!(
            event,
            RuntimeAgentEvent::ToolEnd { tool_id, .. } if tool_id == "tool-approval"
        )),
        "approval-required tool must stay pending until the action is resolved"
    );
}

#[tokio::test]
async fn sandbox_blocked_tool_does_not_emit_output_delta_after_block() {
    let batch = execute_planned_tool_batch(
        ToolExecutionBatchInput {
            executor: unexpected_tool_executor(),
            session_id: "session-sandbox-blocked".to_string(),
            working_directory: std::env::current_dir().unwrap_or_default(),
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
    assert!(
        !batch.events.iter().any(|event| matches!(
            event,
            RuntimeAgentEvent::ToolOutputDelta { tool_id, .. } if tool_id == "tool-sandbox"
        )),
        "sandbox-blocked tool must not emit output deltas after block"
    );
    assert!(matches!(
        batch.events.last(),
        Some(RuntimeAgentEvent::ToolEnd { tool_id, result })
            if tool_id == "tool-sandbox"
                && !result.success
                && result.metadata.as_ref().and_then(|metadata| metadata.get("eventClass"))
                    == Some(&json!("sandbox.blocked"))
    ));
}
