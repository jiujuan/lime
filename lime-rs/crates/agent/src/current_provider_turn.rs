//! 配置 provider 的 current 回合适配器。
//!
//! provider 网络协议由 `model-provider` lower，采样和 tool-result transcript 由
//! `agent-runtime::provider_turn` 维护；本模块只连接 Lime 的动态工具注册表、MCP
//! registry 和 App Server 已消费的事件协议。这里不依赖 Agent。

use crate::agent_tools::execution::{
    decide_tool_execution, persisted_tool_execution_policy_from_metadata,
    ToolExecutionDecisionInput, ToolExecutionDecisionKind, ToolExecutionResolverInput,
};
use crate::credential_bridge::ConfiguredReplyProvider;
use crate::model_request_policy::{
    input_modality_policy_allows_image_input, input_modality_policy_from_turn_context,
    native_tool_policy_disallowed_tool_names, native_tool_policy_from_turn_context,
    runtime_reply_model_request_policy_from_turn_context,
};
use crate::protocol::{AgentEvent, AgentTokenUsage, AgentToolResult};
use crate::request_tool_policy::{
    is_same_tool, merge_system_prompt_with_request_tool_policy, ReplyAttemptError,
    RequestToolPolicy, StreamReplyExecution, WebSearchExecutionTracker,
};
use crate::runtime_state::AgentRuntimeState;
use crate::write_artifact_events::WriteArtifactEventEmitter;
use agent_protocol::action_required::tool_confirmation_action;
use agent_runtime::provider_turn::{
    run_current_provider_turn, CurrentProviderTurnEvent, CurrentProviderTurnInput,
};
use agent_runtime::reply_input::RuntimeReplyInput;
use agent_runtime::session_config::AgentSessionConfig;
use rmcp::model::{CallToolRequestParam, CallToolResult, ErrorData};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc::{self, UnboundedSender};
use tokio_util::sync::CancellationToken;
use tool_runtime::gateway_dispatch_execution::{
    execute_runtime_gateway_dispatch_tool, RuntimeGatewayDispatchToolRequest,
};
use tool_runtime::native_dispatch::runtime_native_dispatch_definitions;
use tool_runtime::native_dispatch_execution::{
    execute_runtime_native_dispatch_tool, RuntimeNativeDispatchToolRequest,
};
use tool_runtime::tool_definition::RuntimeToolDefinition;
use tool_runtime::tool_executor::{
    RuntimeToolExecutionError, RuntimeToolExecutionFuture, RuntimeToolExecutionRequest,
    RuntimeToolExecutionResult, RuntimeToolExecutor, RuntimeToolExecutorHandle,
    RuntimeToolPolicyErrorKind, TOOL_APPROVAL_GRANTED_METADATA_KEY,
};

const TOOL_CONFIRMATION_TIMEOUT: Duration = Duration::from_secs(300);

pub(crate) async fn stream_current_provider_turn<F>(
    state: &AgentRuntimeState,
    provider: ConfiguredReplyProvider,
    input: RuntimeReplyInput,
    mut initial_messages: Vec<model_provider::current_client::CurrentProviderMessage>,
    working_directory: Option<&Path>,
    mut session_config: AgentSessionConfig,
    cancel_token: Option<CancellationToken>,
    policy: &RequestToolPolicy,
    mut on_event: F,
) -> Result<StreamReplyExecution, ReplyAttemptError>
where
    F: FnMut(&AgentEvent) + Send,
{
    if !input.images.is_empty()
        && !input_modality_policy_allows_image_input(
            input_modality_policy_from_turn_context(session_config.turn_context.as_ref()).as_ref(),
        )
    {
        return Err(ReplyAttemptError {
            message: "当前选中模型的 input_modality_policy 不支持图片输入，已拒绝把 image 内容发送到 provider；请切换支持 image 的模型或移除图片。".to_string(),
            emitted_any: false,
        });
    }
    session_config.system_prompt =
        merge_system_prompt_with_request_tool_policy(session_config.system_prompt.take(), policy);
    let model_request_policy =
        runtime_reply_model_request_policy_from_turn_context(session_config.turn_context.as_ref());
    let tool_definitions =
        tool_definitions(state, policy, session_config.turn_context.as_ref()).await;
    initial_messages.push(user_message(input));
    let provider_name = provider.runtime_handle().provider_name().to_string();
    let mut artifact_events = WriteArtifactEventEmitter::new(session_config.id.clone());
    let mut usage = None;
    let mut web_search_tracker = WebSearchExecutionTracker::default();
    let (provider_event_sender, mut provider_event_receiver) = mpsc::unbounded_channel();
    let (agent_event_sender, mut agent_event_receiver) = mpsc::unbounded_channel();
    let executor = RuntimeToolExecutorHandle::new(Arc::new(CurrentTurnToolExecutor {
        state: state.clone(),
        policy: policy.clone(),
        event_sender: agent_event_sender,
    }));

    let turn_future = run_current_provider_turn(
        CurrentProviderTurnInput {
            provider: provider.client(),
            session_config,
            initial_messages,
            tool_definitions,
            model_request_policy,
            tool_executor: executor,
            working_directory: working_directory
                .map(Path::to_path_buf)
                .unwrap_or_else(default_working_directory),
            cancel_token,
        },
        move |event| {
            let _ = provider_event_sender.send(event);
        },
    );
    tokio::pin!(turn_future);
    let execution = loop {
        tokio::select! {
            result = &mut turn_future => {
                while let Ok(event) = provider_event_receiver.try_recv() {
                    handle_provider_event(event, &provider_name, policy, &mut artifact_events, &mut web_search_tracker, &mut usage, &mut on_event);
                }
                while let Ok(event) = agent_event_receiver.try_recv() {
                    on_event(&event);
                }
                break result;
            }
            Some(event) = provider_event_receiver.recv() => {
                handle_provider_event(event, &provider_name, policy, &mut artifact_events, &mut web_search_tracker, &mut usage, &mut on_event);
            }
            Some(event) = agent_event_receiver.recv() => on_event(&event),
        }
    }
    .map_err(|error| ReplyAttemptError {
        message: error.message,
        emitted_any: error.emitted_any,
    })?;

    if !execution.cancelled {
        web_search_tracker
            .validate_web_search_requirement(policy)
            .map_err(|message| ReplyAttemptError {
                message,
                emitted_any: execution.emitted_any,
            })?;
        on_event(&AgentEvent::Done {
            usage: usage.map(project_usage),
        });
    }
    Ok(execution)
}

fn handle_provider_event<F>(
    event: CurrentProviderTurnEvent,
    provider_name: &str,
    policy: &RequestToolPolicy,
    artifact_events: &mut WriteArtifactEventEmitter,
    web_search_tracker: &mut WebSearchExecutionTracker,
    usage: &mut Option<model_provider::current_client::CurrentProviderUsage>,
    on_event: &mut F,
) where
    F: FnMut(&AgentEvent),
{
    match event {
        CurrentProviderTurnEvent::TextDelta { text } => {
            emit_with_artifacts(artifact_events, AgentEvent::TextDelta { text }, on_event)
        }
        CurrentProviderTurnEvent::ReasoningDelta { text } => emit_with_artifacts(
            artifact_events,
            AgentEvent::ThinkingDelta { text },
            on_event,
        ),
        CurrentProviderTurnEvent::ToolInputDelta {
            tool_id,
            tool_name,
            delta,
            accumulated_arguments,
        } => on_event(&AgentEvent::ToolInputDelta {
            tool_id,
            tool_name,
            delta,
            accumulated_arguments: Some(accumulated_arguments),
            provider: Some(provider_name.to_string()),
        }),
        CurrentProviderTurnEvent::ToolStart {
            tool_id,
            tool_name,
            arguments,
        } => {
            web_search_tracker.record_tool_start(policy, &tool_id, &tool_name);
            let arguments = serde_json::to_string(&arguments).ok();
            emit_with_artifacts(
                artifact_events,
                AgentEvent::ToolStart {
                    tool_name,
                    tool_id,
                    arguments,
                },
                on_event,
            );
        }
        CurrentProviderTurnEvent::ToolEnd {
            tool_id,
            success,
            output,
            error,
            metadata,
            ..
        } => {
            web_search_tracker.record_tool_end(policy, &tool_id, success, error.as_deref());
            emit_with_artifacts(
                artifact_events,
                AgentEvent::ToolEnd {
                    tool_id,
                    result: AgentToolResult {
                        success,
                        output,
                        error,
                        structured_content: None,
                        images: None,
                        metadata: (!metadata.is_empty()).then_some(metadata),
                    },
                },
                on_event,
            );
        }
        CurrentProviderTurnEvent::Usage { usage: value } => *usage = Some(value),
    }
}

fn emit_with_artifacts<F>(
    artifact_events: &mut WriteArtifactEventEmitter,
    mut event: AgentEvent,
    on_event: &mut F,
) where
    F: FnMut(&AgentEvent),
{
    for extra in artifact_events.process_event(&mut event) {
        on_event(&extra);
    }
    on_event(&event);
}

async fn tool_definitions(
    state: &AgentRuntimeState,
    policy: &RequestToolPolicy,
    turn_context: Option<&agent_protocol::turn_context::TurnContextOverride>,
) -> Vec<RuntimeToolDefinition> {
    let native_policy = native_tool_policy_from_turn_context(turn_context);
    let blocked_by_model = native_tool_policy_disallowed_tool_names(native_policy.as_ref())
        .into_iter()
        .map(str::to_string)
        .collect::<HashSet<_>>();
    let mut definitions = runtime_native_dispatch_definitions();
    definitions.push(tool_runtime::request_user_input::request_user_input_tool_definition());
    definitions.extend(state.gateway_tools().definitions());
    if let Ok(mcp_tools) = state.mcp_connections().list_tools(None).await {
        definitions.extend(mcp_tools.into_iter().map(|tool| {
            RuntimeToolDefinition {
                name: tool.name.to_string(),
                description: tool
                    .description
                    .map(|value| value.to_string())
                    .unwrap_or_default(),
                input_schema: Value::Object((*tool.input_schema).clone()),
            }
        }));
    }

    let mut seen = HashSet::new();
    definitions.retain(|definition| {
        let key = definition.name.to_ascii_lowercase();
        seen.insert(key)
            && !blocked_by_model
                .iter()
                .any(|name| is_same_tool(name, &definition.name))
            && !policy.matches_any_disallowed_tool(&definition.name)
            && (policy.allows_web_search() || !is_web_tool(&definition.name))
    });
    definitions.sort_by(|left, right| left.name.cmp(&right.name));
    definitions
}

fn is_web_tool(name: &str) -> bool {
    is_same_tool(name, "WebSearch") || is_same_tool(name, "WebFetch")
}

fn user_message(
    input: RuntimeReplyInput,
) -> model_provider::current_client::CurrentProviderMessage {
    use model_provider::current_client::{CurrentProviderContent, CurrentProviderMessage};

    let mut content = vec![CurrentProviderContent::Text(input.text)];
    content.extend(
        input
            .images
            .into_iter()
            .map(|image| CurrentProviderContent::Image {
                data: image.data,
                media_type: image.media_type,
            }),
    );
    CurrentProviderMessage::user(content)
}

fn project_usage(usage: model_provider::current_client::CurrentProviderUsage) -> AgentTokenUsage {
    AgentTokenUsage {
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cached_input_tokens: usage.cached_input_tokens,
        cache_creation_input_tokens: usage.cache_creation_input_tokens,
    }
}

fn default_working_directory() -> PathBuf {
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

#[derive(Clone)]
struct CurrentTurnToolExecutor {
    state: AgentRuntimeState,
    policy: RequestToolPolicy,
    event_sender: UnboundedSender<AgentEvent>,
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
                ));
            }
            if !self.policy.allows_web_search() && is_web_tool(request.tool_name) {
                return Err(RuntimeToolExecutionError::new(
                    format!("当前请求未启用联网工具: {}", request.tool_name),
                    Some(RuntimeToolPolicyErrorKind::PermissionDenied(
                        "web_search_disabled".to_string(),
                    )),
                ));
            }

            if tool_runtime::request_user_input::request_user_input_canonical_tool_name(
                request.tool_name,
            )
            .is_some()
            {
                let callback = crate::request_user_input_bridge::create_request_user_input_callback(
                    self.state.action_required_state(),
                    action_scope(request),
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
                        decision.reason,
                    )
                    .await?;
                }
                ToolExecutionDecisionKind::Deny => {
                    return Err(RuntimeToolExecutionError::new(
                        decision.reason,
                        Some(RuntimeToolPolicyErrorKind::PermissionDenied(
                            decision.reason_code,
                        )),
                    ));
                }
                ToolExecutionDecisionKind::SandboxBlocked => {
                    return Err(RuntimeToolExecutionError::new(
                        decision.reason,
                        Some(RuntimeToolPolicyErrorKind::ExecutionFailed(
                            decision.reason_code,
                        )),
                    ));
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

            if let Some(result) = execute_runtime_gateway_dispatch_tool(
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
                return project_call_result(result);
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
                return project_call_result(result);
            }

            let cancel_token = request_cancel_token(request.context.cancel_token());
            let mcp_request = CallToolRequestParam {
                name: request.tool_name.to_string().into(),
                arguments: request.params.as_object().cloned(),
            };
            let call = self
                .state
                .mcp_connections()
                .dispatch(mcp_request, cancel_token)
                .await
                .map_err(project_mcp_error)?;
            project_call_result(call.response.await)
        })
    }
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
    prompt: String,
) -> Result<(), RuntimeToolExecutionError> {
    let scope = action_scope(request);
    let tool_name = request.tool_name.to_string();
    let arguments = request.params.clone();
    let response = state
        .action_required_state()
        .request_and_wait_with_notification(
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
                    let projection = tool_confirmation_action(
                        queued.id.clone(),
                        tool_name,
                        arguments,
                        Some(prompt),
                        queued.scope.clone(),
                    );
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

fn action_scope(
    request: RuntimeToolExecutionRequest<'_>,
) -> Option<agent_protocol::action_required::ActionRequiredScope> {
    let session_id = request.context.session_id().to_string();
    let metadata = request.turn_context.map(|context| &context.metadata);
    let thread_id = metadata
        .and_then(|metadata| {
            metadata
                .get("thread_id")
                .or_else(|| metadata.get("threadId"))
        })
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| Some(session_id.clone()));
    let turn_id = metadata
        .and_then(|metadata| metadata.get("turn_id").or_else(|| metadata.get("turnId")))
        .and_then(Value::as_str)
        .map(str::to_string);
    agent_protocol::action_required::ActionRequiredScope::from_parts(
        Some(session_id),
        thread_id,
        turn_id,
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

fn project_call_result(
    result: Result<CallToolResult, ErrorData>,
) -> Result<RuntimeToolExecutionResult, RuntimeToolExecutionError> {
    let result = result.map_err(project_mcp_error)?;
    let mut metadata = HashMap::new();
    if let Some(content) = result.structured_content.clone() {
        metadata.insert("structured_content".to_string(), content);
    }
    if let Some(meta) = result.meta.clone() {
        metadata.insert("meta".to_string(), Value::Object(meta.0));
    }
    let output = call_result_text(&result);
    let success = !result.is_error.unwrap_or(false);
    let error = (!success)
        .then(|| output.clone())
        .filter(|value| !value.is_empty());
    Ok(RuntimeToolExecutionResult::new(
        success, output, error, metadata,
    ))
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
    use rmcp::model::{CallToolResult, Content};

    #[test]
    fn tool_result_projection_keeps_text_and_structured_content() {
        let result = project_call_result(Ok(CallToolResult {
            content: vec![Content::text("workspace result")],
            structured_content: Some(serde_json::json!({ "path": "README.md" })),
            is_error: Some(false),
            meta: None,
        }))
        .expect("tool result");

        assert!(result.success);
        assert_eq!(result.output, "workspace result");
        assert_eq!(
            result.metadata.get("structured_content"),
            Some(&serde_json::json!({ "path": "README.md" }))
        );
    }

    #[test]
    fn request_policy_hides_disallowed_tools() {
        let policy = RequestToolPolicy {
            search_mode: crate::request_tool_policy::RequestToolPolicyMode::Disabled,
            effective_web_search: false,
            required_tools: Vec::new(),
            allowed_tools: Vec::new(),
            disallowed_tools: vec!["WebSearch".to_string()],
        };

        assert!(policy.matches_any_disallowed_tool("web_search"));
    }
}
