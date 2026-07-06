use super::*;
use crate::AgentTurnContext;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;
use tool_runtime::tool_executor::{
    RuntimeToolExecutionFuture, RuntimeToolExecutionRequest, RuntimeToolExecutionResult,
    RuntimeToolExecutor, RuntimeToolExecutorHandle,
};

struct LargeOutputExecutor;

impl RuntimeToolExecutor for LargeOutputExecutor {
    fn execute<'a>(
        &'a self,
        request: RuntimeToolExecutionRequest<'a>,
    ) -> RuntimeToolExecutionFuture<'a> {
        Box::pin(async move {
            let output = request
                .params
                .get("text")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            Ok(RuntimeToolExecutionResult::new(
                true,
                output,
                None,
                HashMap::new(),
            ))
        })
    }
}

fn large_output_executor() -> RuntimeToolExecutorHandle {
    RuntimeToolExecutorHandle::new(Arc::new(LargeOutputExecutor))
}

#[tokio::test]
async fn execute_planned_tool_batch_applies_token_truncation_policy_to_registry_output() {
    let output = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda ".repeat(20);
    let turn_context = AgentTurnContext {
        metadata: HashMap::from([(
            "runtime_options".to_string(),
            json!({
                "harness": {
                    "model_request_policy": {
                        "truncation_policy": {
                            "mode": "tokens",
                            "limit": 12
                        }
                    }
                }
            }),
        )]),
        ..AgentTurnContext::default()
    };

    let batch = execute_planned_tool_batch(
        ToolExecutionBatchInput {
            executor: large_output_executor(),
            session_id: "session-registry-truncation".to_string(),
            working_directory: std::env::current_dir().unwrap_or_default(),
            cancel_token: None,
            turn_context: Some(turn_context),
            persisted_execution_policy: None,
            parallelism: 1,
            auto_mode: false,
            bypass_restrictions: false,
            live_process_registry: None,
        },
        vec![PlannedToolExecution {
            tool_name: "Echo".to_string(),
            tool_id: "tool-registry-truncation".to_string(),
            arguments: Some(r#"{"text":"large"}"#.to_string()),
            params: json!({ "text": output }),
        }],
    )
    .await;

    let outcome = batch.outcomes.first().expect("tool outcome");
    assert!(outcome.output.starts_with("Warning: truncated output"));
    assert!(outcome.output.contains("tokens truncated"));
    assert!(matches!(
        batch.events.last(),
        Some(RuntimeAgentEvent::ToolEnd { tool_id, result })
            if tool_id == "tool-registry-truncation"
                && result.output == outcome.output
                && result.success
    ));
}
