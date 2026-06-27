use crate::agent_tools::execution::{
    decide_tool_execution, persisted_tool_execution_policy_from_metadata,
    start_local_execution_process, tool_execution_policy_metadata, ExecutionOutputDelta,
    ExecutionProcessSnapshot, LocalExecutionProcessControlHandle, LocalExecutionRequest,
    ToolExecutionDecision, ToolExecutionDecisionInput, ToolExecutionDecisionKind,
    ToolExecutionResolverInput,
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
    pub stream_events: Vec<RuntimeAgentEvent>,
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
    pub live_process_registry: Option<Arc<dyn LiveExecutionProcessRegistry>>,
}

pub trait LiveExecutionProcessRegistry: Send + Sync {
    fn register_live_process(
        &self,
        handle: LocalExecutionProcessControlHandle,
        snapshot: ExecutionProcessSnapshot,
    ) -> Result<(), String>;

    fn record_live_process_output(&self, delta: ExecutionOutputDelta) -> Result<(), String>;

    fn finish_live_process(&self, snapshot: ExecutionProcessSnapshot) -> Result<(), String>;
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
        events.extend(outcome.stream_events.clone());
        events.push(RuntimeAgentEvent::ToolEnd {
            tool_id: outcome.tool_id.clone(),
            result: AgentToolResult {
                success: outcome.success,
                output: outcome.output.clone(),
                error: outcome.error.clone(),
                structured_content: None,
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

fn process_id_for_tool(tool_id: &str) -> String {
    format!("process-{tool_id}")
}

fn is_shell_tool_name(tool_name: &str) -> bool {
    matches!(
        normalized_tool_name(tool_name).as_str(),
        "bash" | "powershell" | "bashtool" | "powershelltool" | "shellcommand" | "execcommand"
    )
}

fn normalized_tool_name(tool_name: &str) -> String {
    tool_name
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .map(|character| character.to_ascii_lowercase())
        .collect()
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
    if let Some(token) = input.cancel_token.clone() {
        context = context.with_cancellation_token(token);
    }
    if should_attach_workspace_sandbox(&policy_decision) {
        context = context.with_workspace_sandbox(workspace_sandbox_config(
            &policy_decision,
            &input.working_directory,
        ));
    }

    if can_start_live_shell_process(&planned, &policy_decision, &context) {
        let mut metadata = policy_decision.metadata;
        return execute_live_shell_process(input, planned, context, &mut metadata).await;
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
            let output = tool_result.output.unwrap_or_default();
            ToolExecutionOutcome {
                tool_name: planned.tool_name,
                tool_id: planned.tool_id,
                success: tool_result.success,
                output,
                error: tool_result.error,
                metadata: if metadata.is_empty() {
                    None
                } else {
                    Some(metadata)
                },
                stream_events: Vec::new(),
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
                stream_events: Vec::new(),
            }
        }
    }
}

async fn execute_live_shell_process(
    input: ToolExecutionBatchInput,
    planned: PlannedToolExecution,
    context: ToolContext,
    metadata: &mut HashMap<String, Value>,
) -> ToolExecutionOutcome {
    let permission_result = {
        let registry = input.registry.read().await;
        registry
            .check_tool_permissions(&planned.tool_name, planned.params.clone(), &context, None)
            .await
    };
    let params = match permission_result {
        Ok(params) => params,
        Err(error) => {
            let error_metadata = policy_error_metadata(
                &planned,
                &input.working_directory,
                input.turn_context.as_ref(),
                input.persisted_execution_policy.as_ref(),
                &error,
            )
            .unwrap_or_default();
            metadata.extend(error_metadata);
            return ToolExecutionOutcome {
                tool_name: planned.tool_name,
                tool_id: planned.tool_id,
                success: false,
                output: String::new(),
                error: Some(format!("执行工具失败: {error}")),
                metadata: Some(metadata.clone()),
                stream_events: Vec::new(),
            };
        }
    };
    let Some(command) = param_string(&params, &["command", "cmd", "script"]) else {
        metadata.insert(
            "executionSurface".to_string(),
            json!("registry_fallback_missing_command"),
        );
        return execute_registry_tool_after_live_process_skip(input, planned, context, metadata)
            .await;
    };

    let cwd = context.working_directory.clone();
    let mut env = context.environment.clone();
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
            return execute_registry_tool_after_live_process_skip(
                input, planned, context, metadata,
            )
            .await;
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
    stream_events.push(live_process_lifecycle_event(
        &planned.tool_id,
        start_metadata,
    ));
    while let Some(delta) = handle.recv_output().await {
        if let Some(registry) = live_process_registry.as_ref() {
            if let Err(error) = registry.record_live_process_output(delta.clone()) {
                record_live_process_registry_error(metadata, "record_output", error);
            }
        }
        let metadata = delta.metadata();
        stream_events.push(RuntimeAgentEvent::ToolOutputDelta {
            tool_id: planned.tool_id.clone(),
            delta: delta.delta,
            output_kind: Some(delta.kind.label().to_string()),
            metadata: Some(metadata),
        });
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
            stream_events.push(live_process_lifecycle_event(
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
    stream_events.push(live_process_lifecycle_event(
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
    let output = final_snapshot.retained_output;
    let exit_code = final_snapshot.exit_code.unwrap_or(-1);
    let success = exit_code == 0
        && matches!(
            final_snapshot.status,
            crate::agent_tools::execution::ExecutionProcessStatus::Exited
        );

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

fn live_process_lifecycle_event(
    tool_id: &str,
    mut metadata: HashMap<String, Value>,
) -> RuntimeAgentEvent {
    metadata.insert("executionSurface".to_string(), json!("live_process"));
    RuntimeAgentEvent::ToolOutputDelta {
        tool_id: tool_id.to_string(),
        delta: String::new(),
        output_kind: Some("process".to_string()),
        metadata: Some(metadata),
    }
}

fn can_start_live_shell_process(
    planned: &PlannedToolExecution,
    decision: &ToolExecutionDecision,
    context: &ToolContext,
) -> bool {
    if !is_shell_tool_name(&planned.tool_name) {
        return false;
    }
    if context.workspace_sandbox.is_some() {
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
    param_string(&planned.params, &["command", "cmd", "script"]).is_some()
}

fn shell_command_for_tool(tool_name: &str, command: &str) -> Vec<String> {
    if normalized_tool_name(tool_name).contains("powershell") {
        return powershell_command(command);
    }
    default_shell_command(command)
}

fn default_shell_command(command: &str) -> Vec<String> {
    if cfg!(windows) {
        vec![
            "cmd".to_string(),
            "/D".to_string(),
            "/S".to_string(),
            "/C".to_string(),
            command.to_string(),
        ]
    } else {
        vec!["sh".to_string(), "-c".to_string(), command.to_string()]
    }
}

fn powershell_command(command: &str) -> Vec<String> {
    if cfg!(windows) {
        vec![
            "powershell.exe".to_string(),
            "-NoProfile".to_string(),
            "-NonInteractive".to_string(),
            "-Command".to_string(),
            command.to_string(),
        ]
    } else {
        default_shell_command(command)
    }
}

async fn execute_registry_tool_after_live_process_skip(
    input: ToolExecutionBatchInput,
    planned: PlannedToolExecution,
    context: ToolContext,
    metadata: &mut HashMap<String, Value>,
) -> ToolExecutionOutcome {
    let result = aster::session_context::with_turn_context(input.turn_context.clone(), async {
        let registry = input.registry.read().await;
        registry
            .execute(&planned.tool_name, planned.params.clone(), &context, None)
            .await
    })
    .await;

    match result {
        Ok(tool_result) => {
            metadata.extend(tool_result.metadata);
            ToolExecutionOutcome {
                tool_name: planned.tool_name,
                tool_id: planned.tool_id,
                success: tool_result.success,
                output: tool_result.output.unwrap_or_default(),
                error: tool_result.error,
                metadata: Some(metadata.clone()),
                stream_events: Vec::new(),
            }
        }
        Err(error) => ToolExecutionOutcome {
            tool_name: planned.tool_name,
            tool_id: planned.tool_id,
            success: false,
            output: String::new(),
            error: Some(format!("执行工具失败: {error}")),
            metadata: Some(metadata.clone()),
            stream_events: Vec::new(),
        },
    }
}

fn should_attach_workspace_sandbox(decision: &ToolExecutionDecision) -> bool {
    decision.workspace_sandbox_backend_enforced()
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
        Some("restricted_token") => SandboxType::RestrictedToken,
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
