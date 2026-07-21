//! 当前 provider sampling step 的工具执行适配器。

use super::{is_web_tool, mcp_step_snapshot};
use crate::agent_tools::execution::{
    decide_tool_execution, persisted_tool_execution_policy_from_metadata,
    ToolExecutionDecisionInput, ToolExecutionDecisionKind, ToolExecutionResolverInput,
};
use crate::protocol::AgentEvent;
use crate::request_tool_policy::{is_same_tool, RequestToolPolicy};
use crate::runtime_state::AgentRuntimeState;
use agent_protocol::action_required::tool_confirmation_action;
use agent_protocol::ThreadId;
use agent_runtime::session_loop::{RuntimeSessionInputHandle, RuntimeSessionResponseKind};
use rmcp::model::{CallToolRequestParam, CallToolResult, ErrorData};
use serde_json::Value;
use std::collections::HashMap;
use std::time::Duration;
use tokio::sync::mpsc::UnboundedSender;
use tokio_util::sync::CancellationToken;
use tool_runtime::gateway_dispatch_execution::{
    execute_runtime_gateway_dispatch_tool, RuntimeGatewayDispatchToolRequest,
};
use tool_runtime::native_dispatch_execution::{
    execute_runtime_native_dispatch_tool, RuntimeNativeDispatchToolRequest,
};
use tool_runtime::tool_executor::{
    RuntimeToolExecutionError, RuntimeToolExecutionFuture, RuntimeToolExecutionRequest,
    RuntimeToolExecutionResult, RuntimeToolExecutor, RuntimeToolPolicyErrorKind,
    TOOL_APPROVAL_GRANTED_METADATA_KEY,
};

const TOOL_CONFIRMATION_TIMEOUT: Duration = Duration::from_secs(300);

#[derive(Clone)]
pub(super) struct CurrentTurnToolExecutor {
    pub(super) state: AgentRuntimeState,
    pub(super) policy: RequestToolPolicy,
    pub(super) event_sender: UnboundedSender<AgentEvent>,
    pub(super) thread_id: ThreadId,
    pub(super) mcp_snapshot: tool_runtime::mcp_connection::McpStepSnapshot,
    pub(super) deferred_tools: mcp_step_snapshot::DeferredToolSelections,
    pub(super) agent_control_gateway:
        Option<tool_runtime::agent_control::AgentControlGatewayHandle>,
    pub(super) pending_input: Option<RuntimeSessionInputHandle>,
}

impl RuntimeToolExecutor for CurrentTurnToolExecutor {
    fn execute<'a>(
        &'a self,
        request: RuntimeToolExecutionRequest<'a>,
    ) -> RuntimeToolExecutionFuture<'a> {
        Box::pin(async move {
            if self.policy.matches_any_disallowed_tool(request.tool_name) {
                return Err(RuntimeToolExecutionError::new(
                    format!("当前请求策略禁止工具调用: {}", request.tool_name),
                    Some(RuntimeToolPolicyErrorKind::PermissionDenied(
                        "request_tool_policy".to_string(),
                    )),
                )
                .before_handler());
            }
            if !self.policy.allows_web_search() && is_web_tool(request.tool_name) {
                return Err(RuntimeToolExecutionError::new(
                    format!("当前请求未启用联网工具: {}", request.tool_name),
                    Some(RuntimeToolPolicyErrorKind::PermissionDenied(
                        "web_search_disabled".to_string(),
                    )),
                )
                .before_handler());
            }

            if tool_runtime::request_user_input::request_user_input_canonical_tool_name(
                request.tool_name,
            )
            .is_some()
            {
                let (scope, request_call_id) = action_scope(request, &self.thread_id)
                    .map_err(RuntimeToolExecutionError::before_handler)?;
                let response_handle = self.pending_input.clone().ok_or_else(|| {
                    RuntimeToolExecutionError::new(
                        "request_user_input requires the active session response owner",
                        Some(RuntimeToolPolicyErrorKind::ExecutionFailed(
                            "session_response_owner_missing".to_string(),
                        )),
                    )
                    .before_handler()
                })?;
                let callback = crate::request_user_input_bridge::create_request_user_input_callback(
                    self.state.action_required_state(),
                    response_handle,
                    request_call_id,
                    scope,
                    self.event_sender.clone(),
                );
                let projection = tool_runtime::request_user_input::execute_request_user_input(
                    request.params.clone(),
                    Some(&callback),
                    Duration::from_secs(
                        tool_runtime::request_user_input::DEFAULT_REQUEST_USER_INPUT_TIMEOUT_SECS,
                    ),
                )
                .await
                .map_err(|error| {
                    RuntimeToolExecutionError::new(
                        error.to_string(),
                        Some(RuntimeToolPolicyErrorKind::ExecutionFailed(
                            "request_user_input".to_string(),
                        )),
                    )
                })?;
                return Ok(RuntimeToolExecutionResult::new(
                    true,
                    projection.output,
                    None,
                    projection.metadata.into_iter().collect(),
                ));
            }

            let decision = current_tool_execution_decision(request);
            match decision.kind {
                ToolExecutionDecisionKind::Allow => {}
                ToolExecutionDecisionKind::RequiresApproval => {
                    wait_for_tool_approval(
                        &self.state,
                        &self.event_sender,
                        request,
                        &self.thread_id,
                        self.pending_input.as_ref(),
                        decision.reason,
                    )
                    .await
                    .map_err(RuntimeToolExecutionError::before_handler)?;
                }
                ToolExecutionDecisionKind::Deny => {
                    return Err(RuntimeToolExecutionError::new(
                        decision.reason,
                        Some(RuntimeToolPolicyErrorKind::PermissionDenied(
                            decision.reason_code,
                        )),
                    )
                    .before_handler());
                }
                ToolExecutionDecisionKind::SandboxBlocked => {
                    return Err(RuntimeToolExecutionError::new(
                        decision.reason,
                        Some(RuntimeToolPolicyErrorKind::ExecutionFailed(
                            decision.reason_code,
                        )),
                    )
                    .before_handler());
                }
            }

            let mut approved_turn_context = request.turn_context.cloned();
            if decision.kind == ToolExecutionDecisionKind::RequiresApproval {
                approved_turn_context
                    .get_or_insert_with(Default::default)
                    .metadata
                    .insert(
                        TOOL_APPROVAL_GRANTED_METADATA_KEY.to_string(),
                        Value::Bool(true),
                    );
            }
            let request = RuntimeToolExecutionRequest {
                turn_context: approved_turn_context.as_ref().or(request.turn_context),
                ..request
            };

            if tool_runtime::unified_exec::is_unified_exec_tool_name(request.tool_name) {
                let identity = request.context.tool_identity().ok_or_else(|| {
                    RuntimeToolExecutionError::new(
                        "unified exec requires canonical tool identity",
                        Some(RuntimeToolPolicyErrorKind::ExecutionFailed(
                            "unified_exec_identity_missing".to_string(),
                        )),
                    )
                    .before_handler()
                })?;
                let gateway = self
                    .state
                    .live_execution_process_gateway()
                    .await
                    .ok_or_else(|| {
                        RuntimeToolExecutionError::new(
                            "unified exec process gateway is unavailable",
                            Some(RuntimeToolPolicyErrorKind::ExecutionFailed(
                                "unified_exec_gateway_unavailable".to_string(),
                            )),
                        )
                        .before_handler()
                    })?;
                return tool_runtime::unified_exec::execute_runtime_unified_exec_tool(
                    gateway,
                    tool_runtime::unified_exec::RuntimeUnifiedExecToolRequest {
                        tool_name: request.tool_name,
                        params: request.params,
                        working_directory: request.context.working_directory().clone(),
                        environment: request.context.environment().clone(),
                        tool_call_id: identity.call_id().to_string(),
                        cancel_token: request.context.cancel_token().cloned(),
                        turn_context: request.turn_context,
                    },
                )
                .await;
            }

            if let Some(agent_control_gateway) = self.agent_control_gateway.as_ref() {
                if let Some(result) = tool_runtime::agent_control::execute_agent_control_tool(
                    agent_control_gateway.gateway(),
                    self.thread_id.as_str(),
                    request,
                )
                .await
                {
                    return result;
                }
            }

            if let Some(mut result) = execute_runtime_gateway_dispatch_tool(
                self.state.gateway_tools(),
                RuntimeGatewayDispatchToolRequest {
                    tool_name: request.tool_name,
                    params: request.params,
                    working_directory: request.context.working_directory().clone(),
                    session_id: request.context.session_id().to_string(),
                    cancel_token: request.context.cancel_token().cloned(),
                    turn_context: request.turn_context,
                },
            )
            .await
            {
                if is_same_tool(
                    request.tool_name,
                    tool_runtime::tool_search::TOOL_SEARCH_TOOL_NAME,
                ) {
                    if let Ok(result) = &mut result {
                        self.deferred_tools
                            .activate_from_tool_search_result(result)
                            .await;
                    }
                }
                return project_runtime_dispatch_result(result);
            }

            if let Some(result) =
                execute_runtime_native_dispatch_tool(RuntimeNativeDispatchToolRequest {
                    tool_name: request.tool_name,
                    params: request.params,
                    working_directory: request.context.working_directory().clone(),
                    session_id: request.context.session_id().to_string(),
                    cancel_token: request.context.cancel_token().cloned(),
                    turn_context: request.turn_context,
                })
                .await
            {
                return project_runtime_dispatch_result(result);
            }

            let cancel_token = request_cancel_token(request.context.cancel_token());
            let mcp_request = CallToolRequestParam {
                name: request.tool_name.to_string().into(),
                arguments: request.params.as_object().cloned(),
            };
            let mcp_scope =
                mcp_call_scope(request).map_err(RuntimeToolExecutionError::before_handler)?;
            let call = self
                .mcp_snapshot
                .dispatch(mcp_request, mcp_scope, cancel_token)
                .await
                .map_err(|error| project_mcp_error(error).before_handler())?;
            project_call_result(call.response.await)
        })
    }
}

pub(super) fn mcp_call_scope(
    request: RuntimeToolExecutionRequest<'_>,
) -> Result<tool_runtime::mcp_connection::McpCallScope, RuntimeToolExecutionError> {
    let identity = request
        .context
        .tool_identity()
        .ok_or_else(|| mcp_identity_error("tool identity"))?;
    let turn_id = mcp_identity_value(identity.turn_id(), "turn_id")?;
    tool_runtime::mcp_connection::McpCallScope::new(Some(turn_id)).map_err(mcp_identity_error)
}

fn mcp_identity_value(value: &str, field: &str) -> Result<String, RuntimeToolExecutionError> {
    (!value.trim().is_empty())
        .then(|| value.to_string())
        .ok_or_else(|| mcp_identity_error(field))
}

fn mcp_identity_error(field: &str) -> RuntimeToolExecutionError {
    RuntimeToolExecutionError::new(
        format!("MCP call requires canonical {field}"),
        Some(RuntimeToolPolicyErrorKind::ExecutionFailed(
            "mcp_call_scope_missing".to_string(),
        )),
    )
}

fn current_tool_execution_decision(
    request: RuntimeToolExecutionRequest<'_>,
) -> crate::agent_tools::execution::ToolExecutionDecision {
    let request_metadata = request
        .turn_context
        .map(|context| serde_json::to_value(&context.metadata).unwrap_or(Value::Null));
    let persisted_policy = persisted_tool_execution_policy_from_metadata(request_metadata.as_ref());
    decide_tool_execution(ToolExecutionDecisionInput {
        tool_name: request.tool_name,
        params: request.params,
        working_directory: request.context.working_directory(),
        surface: "current_provider_turn",
        auto_mode: false,
        bypass_restrictions: false,
        approval_policy: request
            .turn_context
            .and_then(|context| context.approval_policy.as_deref()),
        requested_sandbox_policy: request
            .turn_context
            .and_then(|context| context.sandbox_policy.as_deref()),
        resolver_input: ToolExecutionResolverInput {
            persisted_policy: persisted_policy.as_ref(),
            request_metadata: request_metadata.as_ref(),
        },
    })
}

async fn wait_for_tool_approval(
    state: &AgentRuntimeState,
    event_sender: &UnboundedSender<AgentEvent>,
    request: RuntimeToolExecutionRequest<'_>,
    thread_id: &ThreadId,
    pending_input: Option<&RuntimeSessionInputHandle>,
    prompt: String,
) -> Result<(), RuntimeToolExecutionError> {
    let response_handle = pending_input.cloned().ok_or_else(|| {
        RuntimeToolExecutionError::new(
            "tool approval requires the active session response owner",
            Some(RuntimeToolPolicyErrorKind::ExecutionFailed(
                "session_response_owner_missing".to_string(),
            )),
        )
    })?;
    let (scope, tool_call_id) = action_scope(request, thread_id)?;
    let tool_name = request.tool_name.to_string();
    let arguments = request.params.clone();
    let response = state
        .action_required_state()
        .request_action_and_wait_with_notification(
            response_handle,
            RuntimeSessionResponseKind::Approval,
            agent_protocol::action_required::TOOL_CONFIRMATION_ACTION_TYPE,
            Some(tool_call_id),
            tool_approval_decisions(),
            scope,
            prompt.clone(),
            serde_json::json!({
                "type": "object",
                "properties": {
                    "confirmed": { "type": "boolean" }
                },
                "required": ["confirmed"]
            }),
            TOOL_CONFIRMATION_TIMEOUT,
            {
                let event_sender = event_sender.clone();
                move |queued| {
                    let mut projection = tool_confirmation_action(
                        queued.id.clone(),
                        tool_name,
                        arguments,
                        Some(prompt),
                        queued.scope.clone(),
                    );
                    if let Some(data) = projection.data.as_object_mut() {
                        data.insert("actionType".to_string(), queued.action_type.clone().into());
                        data.insert("toolCallId".to_string(), queued.tool_id.clone().into());
                        data.insert(
                            "availableDecisions".to_string(),
                            queued.available_decisions.clone().into(),
                        );
                        data.insert("createdAtMs".to_string(), queued.created_at_ms.into());
                        data.insert("deadlineAtMs".to_string(), queued.deadline_at_ms.into());
                    }
                    let _ = event_sender.send(AgentEvent::ActionRequired {
                        request_id: projection.id,
                        action_type: projection.action_type,
                        data: projection.data,
                        scope: projection.scope,
                    });
                }
            },
        )
        .await
        .map_err(|error| {
            RuntimeToolExecutionError::new(
                format!("工具审批等待失败: {error}"),
                Some(RuntimeToolPolicyErrorKind::ExecutionFailed(
                    "tool_approval_wait_failed".to_string(),
                )),
            )
        })?;

    if response.get("confirmed").and_then(Value::as_bool) == Some(true) {
        return Ok(());
    }
    Err(RuntimeToolExecutionError::new(
        "用户拒绝工具执行",
        Some(RuntimeToolPolicyErrorKind::PermissionDenied(
            "tool_approval_declined".to_string(),
        )),
    ))
}

fn tool_approval_decisions() -> Vec<String> {
    ["allow_once", "decline", "cancel"]
        .into_iter()
        .map(str::to_string)
        .collect()
}

pub(super) fn action_scope(
    request: RuntimeToolExecutionRequest<'_>,
    thread_id: &ThreadId,
) -> Result<
    (
        Option<agent_protocol::action_required::ActionRequiredScope>,
        String,
    ),
    RuntimeToolExecutionError,
> {
    let session_id = canonical_identity_value(request.context.session_id(), "session_id")?;
    let thread_id = canonical_identity_value(thread_id.as_str(), "thread_id")?;
    let identity = request
        .context
        .tool_identity()
        .ok_or_else(|| approval_identity_error("tool identity"))?;
    let turn_id = canonical_identity_value(identity.turn_id(), "turn_id")?;
    let tool_call_id = canonical_identity_value(identity.call_id(), "call_id")?;
    Ok((
        agent_protocol::action_required::ActionRequiredScope::from_parts(
            Some(session_id),
            Some(thread_id),
            Some(turn_id),
        ),
        tool_call_id,
    ))
}

fn canonical_identity_value(value: &str, field: &str) -> Result<String, RuntimeToolExecutionError> {
    (!value.trim().is_empty())
        .then(|| value.to_string())
        .ok_or_else(|| approval_identity_error(field))
}

fn approval_identity_error(field: &str) -> RuntimeToolExecutionError {
    RuntimeToolExecutionError::new(
        format!("tool approval requires canonical {field}"),
        Some(RuntimeToolPolicyErrorKind::ExecutionFailed(
            "tool_approval_identity_missing".to_string(),
        )),
    )
}

fn request_cancel_token(token: Option<&CancellationToken>) -> CancellationToken {
    token.cloned().unwrap_or_default()
}

fn project_mcp_error(error: ErrorData) -> RuntimeToolExecutionError {
    RuntimeToolExecutionError::new(
        error.message.to_string(),
        Some(RuntimeToolPolicyErrorKind::ExecutionFailed(
            "mcp_dispatch".to_string(),
        )),
    )
}

pub(super) fn project_call_result(
    result: Result<CallToolResult, ErrorData>,
) -> Result<RuntimeToolExecutionResult, RuntimeToolExecutionError> {
    let result = result.map_err(project_mcp_error)?;
    let mut metadata = HashMap::new();
    if let Some(meta) = result.meta.clone() {
        metadata.insert("meta".to_string(), Value::Object(meta.0));
    }
    let output = call_result_text(&result);
    let success = !result.is_error.unwrap_or(false);
    let error = (!success)
        .then(|| output.clone())
        .filter(|value| !value.is_empty());
    let projection = RuntimeToolExecutionResult::new(success, output, error, metadata);
    Ok(match result.structured_content {
        Some(content) => projection.with_structured_content(content),
        None => projection,
    })
}

fn project_runtime_dispatch_result(
    result: Result<CallToolResult, ErrorData>,
) -> Result<RuntimeToolExecutionResult, RuntimeToolExecutionError> {
    result
        .map_err(project_runtime_dispatch_error)
        .and_then(|result| project_call_result(Ok(result)))
}

fn project_runtime_dispatch_error(error: ErrorData) -> RuntimeToolExecutionError {
    let handler_executed = error
        .data
        .as_ref()
        .and_then(|data| {
            data.get(tool_runtime::tool_result_projection::TOOL_HANDLER_EXECUTED_METADATA_KEY)
        })
        .and_then(Value::as_bool)
        .unwrap_or(true);
    let error = project_mcp_error(error);
    if handler_executed {
        error
    } else {
        error.before_handler()
    }
}

fn call_result_text(result: &CallToolResult) -> String {
    let value = serde_json::to_value(result).unwrap_or(Value::Null);
    let mut text = Vec::new();
    collect_text_fields(&value, &mut text);
    if text.is_empty() {
        serde_json::to_string(&value).unwrap_or_default()
    } else {
        text.join("\n")
    }
}

fn collect_text_fields(value: &Value, target: &mut Vec<String>) {
    match value {
        Value::Object(object) => {
            if object.get("type").and_then(Value::as_str) == Some("text") {
                if let Some(text) = object.get("text").and_then(Value::as_str) {
                    target.push(text.to_string());
                    return;
                }
            }
            for value in object.values() {
                collect_text_fields(value, target);
            }
        }
        Value::Array(values) => {
            for value in values {
                collect_text_fields(value, target);
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tool_approval_exposes_cancel_without_session_grant() {
        assert_eq!(
            tool_approval_decisions(),
            vec![
                "allow_once".to_string(),
                "decline".to_string(),
                "cancel".to_string(),
            ]
        );
    }
}
