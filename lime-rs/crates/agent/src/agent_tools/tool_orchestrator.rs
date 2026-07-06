use crate::agent_tools::execution::{
    decide_tool_execution, persisted_tool_execution_policy_from_metadata,
    tool_execution_policy_metadata, ToolExecutionDecision, ToolExecutionDecisionInput,
    ToolExecutionDecisionKind, ToolExecutionResolverInput,
};
use crate::agent_tools::tool_lifecycle::{
    tool_end_event_from_update, tool_output_delta_event_from_process_delta,
    tool_process_lifecycle_event_from_metadata, ToolExecutionLifecycleEvents,
};
use crate::protocol::AgentEvent as RuntimeAgentEvent;
use crate::tool_output_truncation::{
    format_tool_output_for_model, tool_output_truncation_policy_from_turn_context,
};
use crate::turn_context_configuration::AgentTurnContext;
use futures::{stream, StreamExt};
use lime_core::config::ToolExecutionPolicyConfig as ConfigToolExecutionPolicyConfig;
use serde_json::{json, Map as JsonMap, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio_util::sync::CancellationToken;
use tool_runtime::execution_process::{
    start_local_execution_process, ExecutionProcessStatus, LiveExecutionProcessRegistry,
    LocalExecutionRequest,
};
use tool_runtime::shell::{
    is_shell_tool_name, param_string, process_id_for_tool, shell_command_for_tool,
    SHELL_COMMAND_PARAM_KEYS, WORKING_DIRECTORY_PARAM_KEYS,
};
use tool_runtime::shell_permission::{check_shell_command_permission, ShellPermissionDecision};
pub use tool_runtime::tool_batch::{PlannedToolExecution, ToolTerminalEventUpdate};
use tool_runtime::tool_executor::{
    RuntimeToolExecutionContext, RuntimeToolExecutionContextInput, RuntimeToolExecutionRequest,
    RuntimeToolExecutorHandle, RuntimeToolPolicyErrorKind, RuntimeWorkspaceSandboxInput,
};

pub type ToolExecutionOutcome = tool_runtime::tool_batch::ToolExecutionOutcome<RuntimeAgentEvent>;
pub type ToolExecutionBatch = tool_runtime::tool_batch::ToolExecutionBatch<RuntimeAgentEvent>;

const TOOL_OUTPUT_DEFAULT_MAX_BYTES: u64 = 64 * 1024;

#[derive(Clone)]
pub struct ToolExecutionBatchInput {
    pub executor: RuntimeToolExecutorHandle,
    pub session_id: String,
    pub working_directory: PathBuf,
    pub cancel_token: Option<CancellationToken>,
    pub turn_context: Option<AgentTurnContext>,
    pub persisted_execution_policy: Option<ConfigToolExecutionPolicyConfig>,
    pub parallelism: usize,
    pub auto_mode: bool,
    pub bypass_restrictions: bool,
    pub live_process_registry: Option<Arc<dyn LiveExecutionProcessRegistry>>,
}

pub async fn execute_planned_tool_batch(
    input: ToolExecutionBatchInput,
    planned_tools: Vec<PlannedToolExecution>,
) -> ToolExecutionBatch {
    let mut lifecycle_events = ToolExecutionLifecycleEvents::default();
    let mut events = planned_tools
        .iter()
        .map(|planned| lifecycle_events.start_event(planned))
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
        events.extend(lifecycle_events.outcome_events(outcome));
    }

    ToolExecutionBatch { events, outcomes }
}

pub fn rewrite_tool_terminal_event(
    events: &mut [RuntimeAgentEvent],
    update: &ToolTerminalEventUpdate,
) -> bool {
    let updated_event = tool_end_event_from_update(update);
    for event in events {
        let RuntimeAgentEvent::ToolEnd { tool_id, result } = event else {
            continue;
        };
        if tool_id != &update.tool_id {
            continue;
        }
        let RuntimeAgentEvent::ToolEnd {
            result: updated, ..
        } = updated_event.clone()
        else {
            return false;
        };
        *result = updated;
        return true;
    }
    false
}

pub fn canonical_shell_tool_name(tool_name: &str) -> Option<&'static str> {
    match crate::agent_tools::catalog::tool_catalog_entry(tool_name).map(|entry| entry.name) {
        Some("Bash") => Some("Bash"),
        Some("PowerShell") => Some("PowerShell"),
        _ => None,
    }
}

pub async fn check_shell_tool_permissions(
    tool_name: &str,
    command_text: &str,
    working_directory: PathBuf,
) -> Result<(), String> {
    let canonical_tool_name = canonical_shell_tool_name(tool_name)
        .ok_or_else(|| format!("Unsupported shell tool: {tool_name}"))?;
    check_shell_command_permission(canonical_tool_name, command_text, &working_directory)
        .into_result_without_confirmation()
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

    let workspace_sandbox = should_attach_workspace_sandbox(&policy_decision)
        .then(|| RuntimeWorkspaceSandboxInput::from_policy_metadata(&policy_decision.metadata));
    let context = RuntimeToolExecutionContext::new(RuntimeToolExecutionContextInput {
        working_directory: input.working_directory.clone(),
        session_id: input.session_id.clone(),
        cancel_token: input.cancel_token.clone(),
        workspace_sandbox,
    });

    let mut metadata = policy_decision.metadata.clone();
    if let Some(outcome) = shell_permission_error_outcome(&input, &planned, &context, &mut metadata)
    {
        return outcome;
    }

    if can_start_live_shell_process(&planned, &policy_decision, &context) {
        return execute_live_shell_process(&input, planned, context, &mut metadata).await;
    }

    execute_registry_tool(&input, planned, &context, &mut metadata).await
}

fn shell_permission_error_outcome(
    input: &ToolExecutionBatchInput,
    planned: &PlannedToolExecution,
    context: &RuntimeToolExecutionContext,
    metadata: &mut HashMap<String, Value>,
) -> Option<ToolExecutionOutcome> {
    if !is_shell_tool_name(&planned.tool_name) {
        return None;
    }
    let command = param_string(&planned.params, SHELL_COMMAND_PARAM_KEYS)?;
    let reason = match check_shell_command_permission(
        &planned.tool_name,
        &command,
        context.working_directory(),
    ) {
        ShellPermissionDecision::Allow => return None,
        ShellPermissionDecision::Deny(reason)
        | ShellPermissionDecision::RequiresConfirmation(reason) => reason,
    };
    let policy_error = RuntimeToolPolicyErrorKind::PermissionDenied(reason.clone());
    let error_metadata = policy_error_metadata(
        planned,
        context.working_directory(),
        input.turn_context.as_ref(),
        input.persisted_execution_policy.as_ref(),
        Some(&policy_error),
    )
    .unwrap_or_default();
    metadata.extend(error_metadata);

    Some(ToolExecutionOutcome {
        tool_name: planned.tool_name.clone(),
        tool_id: planned.tool_id.clone(),
        success: false,
        output: String::new(),
        error: Some(format!("执行工具失败: {reason}")),
        metadata: Some(metadata.clone()),
        stream_events: Vec::new(),
    })
}

async fn execute_live_shell_process(
    input: &ToolExecutionBatchInput,
    planned: PlannedToolExecution,
    context: RuntimeToolExecutionContext,
    metadata: &mut HashMap<String, Value>,
) -> ToolExecutionOutcome {
    let Some(command) = param_string(&planned.params, SHELL_COMMAND_PARAM_KEYS) else {
        metadata.insert(
            "executionSurface".to_string(),
            json!("registry_fallback_missing_command"),
        );
        return execute_registry_tool(input, planned, &context, metadata).await;
    };

    let cwd = context.working_directory().clone();
    let mut env = context.environment().clone();
    env.insert("ASTER_TERMINAL".to_string(), "1".to_string());
    let request = LocalExecutionRequest {
        process_id: process_id_for_tool(&planned.tool_id),
        tool_id: planned.tool_id.clone(),
        tool_name: planned.tool_name.clone(),
        command: shell_command_for_tool(&planned.tool_name, &command),
        cwd: Some(cwd.clone()),
        env,
    };
    metadata.insert("executionSurface".to_string(), json!("live_process"));

    let mut handle = match start_local_execution_process(request) {
        Ok(handle) => handle,
        Err(error) => {
            metadata.insert(
                "executionSurface".to_string(),
                json!("registry_fallback_live_process_start_failed"),
            );
            metadata.insert(
                "liveProcessStartError".to_string(),
                json!(error.to_string()),
            );
            return execute_registry_tool(input, planned, &context, metadata).await;
        }
    };

    let mut stream_events = Vec::new();
    let start_snapshot = handle.status();
    let live_process_registry = input.live_process_registry.clone();
    if let Some(registry) = live_process_registry.as_ref() {
        match registry.register_live_process(handle.control_handle(), start_snapshot.clone()) {
            Ok(()) => {
                metadata.insert(
                    "executionProcessControlStatus".to_string(),
                    json!("registered"),
                );
                metadata.insert(
                    "execution_process_control_status".to_string(),
                    json!("registered"),
                );
            }
            Err(error) => {
                record_live_process_registry_error(metadata, "register", error);
            }
        }
    }
    let mut start_metadata = start_snapshot.metadata();
    copy_live_process_control_metadata(metadata, &mut start_metadata);
    stream_events.push(tool_process_lifecycle_event_from_metadata(
        &planned.tool_id,
        start_metadata,
    ));
    while let Some(delta) = handle.recv_output().await {
        if let Some(registry) = live_process_registry.as_ref() {
            if let Err(error) = registry.record_live_process_output(delta.clone()) {
                record_live_process_registry_error(metadata, "record_output", error);
            }
        }
        stream_events.push(tool_output_delta_event_from_process_delta(delta));
    }

    let final_snapshot = match handle.wait().await {
        Ok(snapshot) => snapshot,
        Err(error) => {
            metadata.insert("executionProcessStatus".to_string(), json!("failed"));
            metadata.insert(
                "failureCategory".to_string(),
                json!("process_supervisor_failed"),
            );
            let mut failure_metadata = handle.status().metadata();
            failure_metadata.insert("executionProcessStatus".to_string(), json!("failed"));
            failure_metadata.insert(
                "failureCategory".to_string(),
                json!("process_supervisor_failed"),
            );
            if let Some(registry) = live_process_registry.as_ref() {
                if let Err(error) = registry.finish_live_process(handle.status()) {
                    record_live_process_registry_error(metadata, "finish_failed", error);
                }
            }
            copy_live_process_control_metadata(metadata, &mut failure_metadata);
            stream_events.push(tool_process_lifecycle_event_from_metadata(
                &planned.tool_id,
                failure_metadata,
            ));
            return ToolExecutionOutcome {
                tool_name: planned.tool_name,
                tool_id: planned.tool_id,
                success: false,
                output: String::new(),
                error: Some(format!("执行进程失败: {error:?}")),
                metadata: Some(metadata.clone()),
                stream_events,
            };
        }
    };
    let mut terminal_metadata = final_snapshot.metadata();
    copy_live_process_control_metadata(metadata, &mut terminal_metadata);
    stream_events.push(tool_process_lifecycle_event_from_metadata(
        &planned.tool_id,
        terminal_metadata,
    ));
    if let Some(registry) = live_process_registry.as_ref() {
        if let Err(error) = registry.finish_live_process(final_snapshot.clone()) {
            record_live_process_registry_error(metadata, "finish", error);
        }
    }
    metadata.extend(final_snapshot.metadata());
    metadata.insert("command".to_string(), json!(command));
    metadata.insert("cwd".to_string(), json!(cwd.to_string_lossy().to_string()));
    let output =
        model_formatted_tool_output(&final_snapshot.retained_output, input.turn_context.as_ref());
    let exit_code = final_snapshot.exit_code.unwrap_or(-1);
    let success = exit_code == 0 && matches!(final_snapshot.status, ExecutionProcessStatus::Exited);

    ToolExecutionOutcome {
        tool_name: planned.tool_name,
        tool_id: planned.tool_id,
        success,
        output: output.clone(),
        error: if success {
            None
        } else {
            Some(format!("process exited with code {exit_code}"))
        },
        metadata: Some(metadata.clone()),
        stream_events,
    }
}

fn record_live_process_registry_error(
    metadata: &mut HashMap<String, Value>,
    phase: &str,
    error: String,
) {
    metadata.insert(
        "executionProcessControlStatus".to_string(),
        json!("registration_error"),
    );
    metadata.insert(
        "execution_process_control_status".to_string(),
        json!("registration_error"),
    );
    metadata.insert(
        "executionProcessControlErrorPhase".to_string(),
        json!(phase),
    );
    metadata.insert(
        "execution_process_control_error_phase".to_string(),
        json!(phase),
    );
    metadata.insert("executionProcessControlError".to_string(), json!(error));
    metadata.insert("execution_process_control_error".to_string(), json!(error));
}

fn copy_live_process_control_metadata(
    source: &HashMap<String, Value>,
    target: &mut HashMap<String, Value>,
) {
    for key in [
        "executionProcessControlStatus",
        "execution_process_control_status",
        "executionProcessControlErrorPhase",
        "execution_process_control_error_phase",
        "executionProcessControlError",
        "execution_process_control_error",
    ] {
        if let Some(value) = source.get(key) {
            target.insert(key.to_string(), value.clone());
        }
    }
}

fn can_start_live_shell_process(
    planned: &PlannedToolExecution,
    decision: &ToolExecutionDecision,
    context: &RuntimeToolExecutionContext,
) -> bool {
    if !is_shell_tool_name(&planned.tool_name) {
        return false;
    }
    if context.has_workspace_sandbox() {
        return false;
    }
    if decision.requires_sandboxed_execution() {
        return false;
    }
    if planned
        .params
        .get("background")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        return false;
    }
    param_string(&planned.params, SHELL_COMMAND_PARAM_KEYS).is_some()
}

async fn execute_registry_tool(
    input: &ToolExecutionBatchInput,
    planned: PlannedToolExecution,
    context: &RuntimeToolExecutionContext,
    metadata: &mut HashMap<String, Value>,
) -> ToolExecutionOutcome {
    let result = input
        .executor
        .execute(RuntimeToolExecutionRequest {
            tool_name: &planned.tool_name,
            params: &planned.params,
            context,
            turn_context: input.turn_context.as_ref(),
        })
        .await;

    match result {
        Ok(tool_result) => {
            metadata.extend(tool_result.metadata);
            let output =
                model_formatted_tool_output(&tool_result.output, input.turn_context.as_ref());
            ToolExecutionOutcome {
                tool_name: planned.tool_name,
                tool_id: planned.tool_id,
                success: tool_result.success,
                output,
                error: tool_result.error,
                metadata: Some(metadata.clone()),
                stream_events: Vec::new(),
            }
        }
        Err(error) => {
            let outcome_metadata = policy_error_metadata(
                &planned,
                &input.working_directory,
                input.turn_context.as_ref(),
                input.persisted_execution_policy.as_ref(),
                error.policy_kind(),
            )
            .or_else(|| Some(metadata.clone()));
            ToolExecutionOutcome {
                tool_name: planned.tool_name,
                tool_id: planned.tool_id,
                success: false,
                output: String::new(),
                error: Some(format!("执行工具失败: {}", error.message())),
                metadata: outcome_metadata,
                stream_events: Vec::new(),
            }
        }
    }
}

fn should_attach_workspace_sandbox(decision: &ToolExecutionDecision) -> bool {
    decision.workspace_sandbox_backend_enforced()
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
        stream_events: Vec::new(),
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
        stream_events: Vec::new(),
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
        stream_events: Vec::new(),
    }
}

fn policy_error_metadata(
    planned: &PlannedToolExecution,
    working_directory: &PathBuf,
    turn_context: Option<&AgentTurnContext>,
    persisted_execution_policy: Option<&ConfigToolExecutionPolicyConfig>,
    error: Option<&RuntimeToolPolicyErrorKind>,
) -> Option<HashMap<String, Value>> {
    let classification = error?.classification()?;
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
        json!(param_string(&planned.params, WORKING_DIRECTORY_PARAM_KEYS)
            .unwrap_or_else(|| working_directory.to_string_lossy().to_string())),
    );

    if let Some(command) = param_string(&planned.params, SHELL_COMMAND_PARAM_KEYS) {
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

fn turn_context_metadata_value(turn_context: Option<&AgentTurnContext>) -> Option<Value> {
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

fn model_formatted_tool_output(output: &str, turn_context: Option<&AgentTurnContext>) -> String {
    let policy = tool_output_truncation_policy_from_turn_context(
        turn_context,
        TOOL_OUTPUT_DEFAULT_MAX_BYTES,
    );
    format_tool_output_for_model(output, policy)
}

#[cfg(test)]
mod lifecycle_gate_tests;
#[cfg(test)]
mod tests;
#[cfg(test)]
mod truncation_tests;
