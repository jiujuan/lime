use crate::agent_tools::execution::{
    decide_tool_execution, persisted_tool_execution_policy_from_metadata,
    tool_execution_policy_metadata, ToolExecutionDecision, ToolExecutionDecisionInput,
    ToolExecutionDecisionKind, ToolExecutionResolverInput,
};
use crate::protocol::{AgentEvent as RuntimeAgentEvent, AgentToolResult};
use aster::session::TurnContextOverride;
use aster::tools::{ToolContext, ToolError, ToolRegistry};
use futures::{stream, StreamExt};
use lime_core::config::ToolExecutionPolicyConfig as ConfigToolExecutionPolicyConfig;
use serde_json::{json, Map as JsonMap, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio_util::sync::CancellationToken;

#[derive(Debug, Clone)]
pub struct PlannedToolExecution {
    pub tool_name: String,
    pub tool_id: String,
    pub arguments: Option<String>,
    pub params: Value,
}

#[derive(Debug, Clone)]
pub struct ToolExecutionOutcome {
    pub tool_name: String,
    pub tool_id: String,
    pub success: bool,
    pub output: String,
    pub error: Option<String>,
    pub metadata: Option<HashMap<String, Value>>,
}

#[derive(Debug, Clone)]
pub struct ToolExecutionBatch {
    pub events: Vec<RuntimeAgentEvent>,
    pub outcomes: Vec<ToolExecutionOutcome>,
}

#[derive(Clone)]
pub struct ToolExecutionBatchInput {
    pub registry: Arc<RwLock<ToolRegistry>>,
    pub session_id: String,
    pub working_directory: PathBuf,
    pub cancel_token: Option<CancellationToken>,
    pub turn_context: Option<TurnContextOverride>,
    pub persisted_execution_policy: Option<ConfigToolExecutionPolicyConfig>,
    pub parallelism: usize,
    pub auto_mode: bool,
    pub bypass_restrictions: bool,
}

#[derive(Debug, Clone)]
pub struct ToolTerminalEventUpdate {
    pub tool_id: String,
    pub success: bool,
    pub output: String,
    pub error: Option<String>,
    pub metadata: Option<HashMap<String, Value>>,
}

impl ToolTerminalEventUpdate {
    pub fn from_outcome(outcome: &ToolExecutionOutcome) -> Self {
        Self {
            tool_id: outcome.tool_id.clone(),
            success: outcome.success,
            output: outcome.output.clone(),
            error: outcome.error.clone(),
            metadata: outcome.metadata.clone(),
        }
    }
}

pub async fn execute_planned_tool_batch(
    input: ToolExecutionBatchInput,
    planned_tools: Vec<PlannedToolExecution>,
) -> ToolExecutionBatch {
    let mut events = planned_tools
        .iter()
        .map(|planned| RuntimeAgentEvent::ToolStart {
            tool_name: planned.tool_name.clone(),
            tool_id: planned.tool_id.clone(),
            arguments: planned.arguments.clone(),
        })
        .collect::<Vec<_>>();

    let parallelism = input.parallelism.max(1);
    #[allow(clippy::redundant_clone)]
    let mut indexed_outcomes = stream::iter(planned_tools.into_iter().enumerate().map(
        |(index, planned)| {
            let input = input.clone();
            async move { (index, execute_planned_tool(input, planned).await) }
        },
    ))
    .buffer_unordered(parallelism)
    .collect::<Vec<_>>()
    .await;

    indexed_outcomes.sort_by_key(|(index, _)| *index);
    let outcomes = indexed_outcomes
        .into_iter()
        .map(|(_, outcome)| outcome)
        .collect::<Vec<_>>();

    for outcome in &outcomes {
        if let Some(action_required) = action_required_event_from_outcome(outcome) {
            events.push(action_required);
        }
        events.push(RuntimeAgentEvent::ToolEnd {
            tool_id: outcome.tool_id.clone(),
            result: AgentToolResult {
                success: outcome.success,
                output: outcome.output.clone(),
                error: outcome.error.clone(),
                images: None,
                metadata: outcome.metadata.clone(),
            },
        });
    }

    ToolExecutionBatch { events, outcomes }
}

fn action_required_event_from_outcome(outcome: &ToolExecutionOutcome) -> Option<RuntimeAgentEvent> {
    let metadata = outcome.metadata.as_ref()?;
    if metadata.get("eventClass").and_then(Value::as_str) != Some("action.required") {
        return None;
    }

    Some(RuntimeAgentEvent::ActionRequired {
        request_id: outcome.tool_id.clone(),
        action_type: "tool_confirmation".to_string(),
        data: json!({
            "toolCallId": outcome.tool_id,
            "toolName": outcome.tool_name,
            "actionType": "tool_confirmation",
            "reasonCode": metadata.get("reasonCode").cloned(),
            "reason": metadata.get("reason").cloned(),
            "command": metadata.get("command").cloned(),
            "cwd": metadata.get("cwd").cloned(),
            "approvalPolicy": metadata.get("approvalPolicy").cloned(),
            "requestedSandboxPolicy": metadata.get("requestedSandboxPolicy").cloned(),
            "policy": metadata,
        }),
        scope: None,
    })
}

pub fn rewrite_tool_terminal_event(
    events: &mut [RuntimeAgentEvent],
    update: &ToolTerminalEventUpdate,
) -> bool {
    for event in events {
        let RuntimeAgentEvent::ToolEnd { tool_id, result } = event else {
            continue;
        };
        if tool_id != &update.tool_id {
            continue;
        }
        result.success = update.success;
        result.output = update.output.clone();
        result.error = update.error.clone();
        result.metadata = update.metadata.clone();
        return true;
    }
    false
}

async fn execute_planned_tool(
    input: ToolExecutionBatchInput,
    planned: PlannedToolExecution,
) -> ToolExecutionOutcome {
    let policy_decision = preflight_tool_execution_decision(&input, &planned);
    match policy_decision.kind {
        ToolExecutionDecisionKind::Allow => {}
        ToolExecutionDecisionKind::RequiresApproval => {
            return action_required_outcome(planned, policy_decision);
        }
        ToolExecutionDecisionKind::Deny => {
            return policy_denied_outcome(planned, policy_decision);
        }
        ToolExecutionDecisionKind::SandboxBlocked => {
            return sandbox_blocked_outcome(planned, policy_decision);
        }
    }

    let mut context =
        ToolContext::new(input.working_directory.clone()).with_session_id(input.session_id.clone());
    if let Some(token) = input.cancel_token {
        context = context.with_cancellation_token(token);
    }

    let result = aster::session_context::with_turn_context(input.turn_context.clone(), async {
        let registry = input.registry.read().await;
        registry
            .execute(&planned.tool_name, planned.params.clone(), &context, None)
            .await
    })
    .await;

    match result {
        Ok(tool_result) => ToolExecutionOutcome {
            tool_name: planned.tool_name,
            tool_id: planned.tool_id,
            success: tool_result.success,
            output: tool_result.output.unwrap_or_default(),
            error: tool_result.error,
            metadata: if tool_result.metadata.is_empty() {
                None
            } else {
                Some(tool_result.metadata)
            },
        },
        Err(error) => {
            let metadata = policy_error_metadata(
                &planned,
                &input.working_directory,
                input.turn_context.as_ref(),
                input.persisted_execution_policy.as_ref(),
                &error,
            );
            ToolExecutionOutcome {
                tool_name: planned.tool_name,
                tool_id: planned.tool_id,
                success: false,
                output: String::new(),
                error: Some(format!("执行工具失败: {error}")),
                metadata,
            }
        }
    }
}

fn preflight_tool_execution_decision(
    input: &ToolExecutionBatchInput,
    planned: &PlannedToolExecution,
) -> ToolExecutionDecision {
    let request_metadata = turn_context_metadata_value(input.turn_context.as_ref());
    let metadata_persisted_policy =
        persisted_tool_execution_policy_from_metadata(request_metadata.as_ref());
    let persisted_policy = input
        .persisted_execution_policy
        .as_ref()
        .or(metadata_persisted_policy.as_ref());
    decide_tool_execution(ToolExecutionDecisionInput {
        tool_name: &planned.tool_name,
        params: &planned.params,
        working_directory: &input.working_directory,
        surface: "runtime_tool",
        auto_mode: input.auto_mode,
        bypass_restrictions: input.bypass_restrictions,
        approval_policy: input
            .turn_context
            .as_ref()
            .and_then(|context| context.approval_policy.as_deref()),
        requested_sandbox_policy: input
            .turn_context
            .as_ref()
            .and_then(|context| context.sandbox_policy.as_deref()),
        resolver_input: ToolExecutionResolverInput {
            persisted_policy,
            request_metadata: request_metadata.as_ref(),
        },
    })
}

fn action_required_outcome(
    planned: PlannedToolExecution,
    decision: ToolExecutionDecision,
) -> ToolExecutionOutcome {
    let mut metadata = decision.metadata;
    metadata.insert("eventClass".to_string(), json!("action.required"));
    metadata.insert("failureCategory".to_string(), json!("action_required"));
    metadata.insert("actionType".to_string(), json!("tool_execution_approval"));

    ToolExecutionOutcome {
        tool_name: planned.tool_name,
        tool_id: planned.tool_id,
        success: false,
        output: String::new(),
        error: Some(decision.reason),
        metadata: Some(metadata),
    }
}

fn policy_denied_outcome(
    planned: PlannedToolExecution,
    decision: ToolExecutionDecision,
) -> ToolExecutionOutcome {
    let mut metadata = decision.metadata;
    metadata.insert("eventClass".to_string(), json!("permission.denied"));
    metadata.insert("failureCategory".to_string(), json!("permission_denied"));

    ToolExecutionOutcome {
        tool_name: planned.tool_name,
        tool_id: planned.tool_id,
        success: false,
        output: String::new(),
        error: Some(decision.reason),
        metadata: Some(metadata),
    }
}

fn sandbox_blocked_outcome(
    planned: PlannedToolExecution,
    decision: ToolExecutionDecision,
) -> ToolExecutionOutcome {
    let mut metadata = decision.metadata;
    metadata.insert("eventClass".to_string(), json!("sandbox.blocked"));
    metadata.insert("failureCategory".to_string(), json!("sandbox_blocked"));

    ToolExecutionOutcome {
        tool_name: planned.tool_name,
        tool_id: planned.tool_id,
        success: false,
        output: String::new(),
        error: Some(decision.reason),
        metadata: Some(metadata),
    }
}

fn policy_error_metadata(
    planned: &PlannedToolExecution,
    working_directory: &PathBuf,
    turn_context: Option<&TurnContextOverride>,
    persisted_execution_policy: Option<&ConfigToolExecutionPolicyConfig>,
    error: &ToolError,
) -> Option<HashMap<String, Value>> {
    let classification = classify_policy_error(error)?;
    let request_metadata = turn_context_metadata_value(turn_context);
    let metadata_persisted_policy =
        persisted_tool_execution_policy_from_metadata(request_metadata.as_ref());
    let persisted_policy = persisted_execution_policy.or(metadata_persisted_policy.as_ref());
    let mut metadata = tool_execution_policy_metadata(
        &planned.tool_name,
        "runtime_tool",
        ToolExecutionResolverInput {
            persisted_policy,
            request_metadata: request_metadata.as_ref(),
        },
    );

    metadata.insert("eventClass".to_string(), json!(classification.event_class));
    metadata.insert(
        "failureCategory".to_string(),
        json!(classification.failure_category),
    );
    metadata.insert("reasonCode".to_string(), json!(classification.reason_code));
    metadata.insert("reason".to_string(), json!(classification.reason));
    metadata.insert("platform".to_string(), json!(std::env::consts::OS));
    metadata.insert("arch".to_string(), json!(std::env::consts::ARCH));
    metadata.insert(
        "cwd".to_string(),
        json!(
            param_string(&planned.params, &["cwd", "workingDir", "working_dir"])
                .unwrap_or_else(|| working_directory.to_string_lossy().to_string())
        ),
    );

    if let Some(command) = param_string(&planned.params, &["command", "cmd", "script"]) {
        metadata.insert("command".to_string(), json!(command));
    }
    if let Some(approval_policy) = turn_context.and_then(|context| context.approval_policy.clone())
    {
        metadata.insert("approvalPolicy".to_string(), json!(approval_policy));
    }
    if let Some(sandbox_policy) = turn_context.and_then(|context| context.sandbox_policy.clone()) {
        metadata.insert("requestedSandboxPolicy".to_string(), json!(sandbox_policy));
    }

    Some(metadata)
}

#[derive(Debug, Clone, Copy)]
struct PolicyErrorClassification<'a> {
    event_class: &'static str,
    failure_category: &'static str,
    reason_code: &'static str,
    reason: &'a str,
}

fn classify_policy_error(error: &ToolError) -> Option<PolicyErrorClassification<'_>> {
    match error {
        ToolError::PermissionDenied(reason) => Some(PolicyErrorClassification {
            event_class: "permission.denied",
            failure_category: "permission_denied",
            reason_code: "permission_denied",
            reason,
        }),
        ToolError::SafetyCheckFailed(reason) => Some(PolicyErrorClassification {
            event_class: "permission.denied",
            failure_category: "policy_denied",
            reason_code: "safety_check_failed",
            reason,
        }),
        ToolError::ExecutionFailed(reason) if looks_like_sandbox_block(reason) => {
            Some(PolicyErrorClassification {
                event_class: "sandbox.blocked",
                failure_category: "sandbox_blocked",
                reason_code: "sandbox_blocked",
                reason,
            })
        }
        _ => None,
    }
}

fn looks_like_sandbox_block(reason: &str) -> bool {
    let normalized = reason.to_ascii_lowercase();
    normalized.contains("sandbox")
        && (normalized.contains("block")
            || normalized.contains("denied")
            || normalized.contains("not permitted"))
}

fn param_string(value: &Value, keys: &[&str]) -> Option<String> {
    let object = value.as_object()?;
    keys.iter()
        .filter_map(|key| object.get(*key))
        .find_map(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn turn_context_metadata_value(turn_context: Option<&TurnContextOverride>) -> Option<Value> {
    let metadata = &turn_context?.metadata;
    if metadata.is_empty() {
        return None;
    }
    let object = metadata
        .iter()
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect::<JsonMap<String, Value>>();
    Some(Value::Object(object))
}

#[cfg(test)]
mod tests {
    use super::*;
    use aster::tools::{PermissionCheckResult, Tool, ToolResult};
    use async_trait::async_trait;
    use lime_core::config::{
        ToolExecutionOverrideConfig as ConfigToolExecutionOverrideConfig,
        ToolExecutionPolicyConfig as ConfigToolExecutionPolicyConfig,
        ToolExecutionSandboxProfileConfig as ConfigToolExecutionSandboxProfileConfig,
        ToolExecutionWarningPolicyConfig as ConfigToolExecutionWarningPolicyConfig,
    };
    use serde_json::json;
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

        async fn execute(
            &self,
            params: Value,
            context: &ToolContext,
        ) -> Result<ToolResult, ToolError> {
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

        async fn execute(
            &self,
            params: Value,
            context: &ToolContext,
        ) -> Result<ToolResult, ToolError> {
            let command = params
                .get("command")
                .and_then(Value::as_str)
                .unwrap_or_default();
            Ok(ToolResult::success(format!(
                "{}:{}",
                context.session_id, command
            )))
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
                arguments: Some(r#"{"command":"cargo test"}"#.to_string()),
                params: json!({ "command": "cargo test" }),
            }],
        )
        .await;

        assert_eq!(batch.outcomes.len(), 1);
        assert!(batch.outcomes[0].success);
        assert_eq!(
            batch.outcomes[0].output,
            "session-persisted-policy:cargo test"
        );
        assert!(!batch
            .events
            .iter()
            .any(|event| matches!(event, RuntimeAgentEvent::ActionRequired { .. })));
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
}
