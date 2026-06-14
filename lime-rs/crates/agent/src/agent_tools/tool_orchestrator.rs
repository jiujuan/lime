use crate::agent_tools::execution::{
    decide_tool_execution, persisted_tool_execution_policy_from_metadata,
    tool_execution_policy_metadata, ToolExecutionDecision, ToolExecutionDecisionInput,
    ToolExecutionDecisionKind, ToolExecutionResolverInput,
};
use crate::protocol::{AgentEvent as RuntimeAgentEvent, AgentToolResult};
use aster::sandbox::{SandboxConfig, SandboxType};
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
    if should_attach_workspace_sandbox(&policy_decision) {
        context = context.with_workspace_sandbox(workspace_sandbox_config(
            &policy_decision,
            &input.working_directory,
        ));
    }

    let result = aster::session_context::with_turn_context(input.turn_context.clone(), async {
        let registry = input.registry.read().await;
        registry
            .execute(&planned.tool_name, planned.params.clone(), &context, None)
            .await
    })
    .await;

    match result {
        Ok(tool_result) => {
            let mut metadata = policy_decision.metadata;
            metadata.extend(tool_result.metadata);
            ToolExecutionOutcome {
                tool_name: planned.tool_name,
                tool_id: planned.tool_id,
                success: tool_result.success,
                output: tool_result.output.unwrap_or_default(),
                error: tool_result.error,
                metadata: if metadata.is_empty() {
                    None
                } else {
                    Some(metadata)
                },
            }
        }
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

fn should_attach_workspace_sandbox(decision: &ToolExecutionDecision) -> bool {
    decision
        .metadata
        .get("sandboxBackendEnforced")
        .and_then(Value::as_bool)
        == Some(true)
}

fn workspace_sandbox_config(
    decision: &ToolExecutionDecision,
    working_directory: &PathBuf,
) -> SandboxConfig {
    let sandbox_type = match decision
        .metadata
        .get("sandboxBackend")
        .and_then(Value::as_str)
    {
        Some("seatbelt") => SandboxType::Seatbelt,
        Some("linux_sandbox") => SandboxType::Bubblewrap,
        _ => SandboxType::None,
    };
    let requested_policy = decision
        .metadata
        .get("requestedSandboxPolicy")
        .and_then(Value::as_str)
        .unwrap_or("workspace-write");
    let mut config = SandboxConfig::default();
    config.enabled = sandbox_type != SandboxType::None;
    config.sandbox_type = sandbox_type;
    config.network_access = true;
    if requested_policy != "read-only" {
        config.writable_paths.push(working_directory.clone());
    }
    config.read_only_paths.push(working_directory.clone());
    config
        .environment_variables
        .insert("ASTER_WORKSPACE_SANDBOX".to_string(), "1".to_string());
    config
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
mod tests;
