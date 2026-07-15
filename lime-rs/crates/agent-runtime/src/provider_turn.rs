//! 固定 provider 的 current Turn executor。
//!
//! 参考 Codex 的 response item 生命周期：每次 provider response 先 materialize 成
//! text/reasoning/tool-call event，所有工具调用完成后把 tool result 追加到同一个
//! transcript，再开始下一次 sampling。provider wire lowering 留在 model-provider，
//! 工具执行留在 tool-runtime；本模块不接触 Agent。

use crate::provider_trace::RuntimeProviderTraceAttempt;
use crate::reply_execution::{RuntimeReplyAttemptError, RuntimeReplyExecution};
use crate::reply_loop::{RuntimeReplyLoop, RuntimeReplyLoopStep, MAX_REPLY_TURNS_REACHED_MESSAGE};
use crate::session_config::AgentSessionConfig;
use agent_protocol::provider_trace::{ProviderTraceEvent, ProviderTraceFailure};
use futures::future::join_all;
use futures::StreamExt;
use model_provider::current_client::{
    CanonicalLlmEvent, CurrentProvider, CurrentProviderContent, CurrentProviderError,
    CurrentProviderMessage, CurrentProviderRequest, CurrentProviderStream, CurrentProviderTool,
    CurrentProviderToolCall, CurrentProviderToolResult, CurrentProviderUsage, Usage,
};
use model_provider::provider_stream::RuntimeReplyModelRequestPolicy;
use model_provider::provider_stream::RuntimeReplyProviderTraceMetadata;
use std::collections::HashMap;
use std::future::Future;
use std::path::PathBuf;
use std::pin::Pin;
use std::sync::Arc;
use tokio_util::sync::CancellationToken;
use tool_runtime::tool_call::{ToolCall, ToolEnvironment};
use tool_runtime::tool_definition::{RuntimeToolDefinition, RuntimeToolExposure};
use tool_runtime::tool_executor::{
    RuntimeToolExecutionContext, RuntimeToolExecutionContextInput, RuntimeToolExecutionError,
    RuntimeToolExecutionFuture, RuntimeToolExecutionRequest, RuntimeToolExecutor,
    RuntimeToolExecutorHandle, RuntimeToolPolicyErrorKind,
};
use tool_runtime::tool_lifecycle::ToolLifecycleEmitter;

mod output_lifecycle;
use output_lifecycle::{
    end_output_item, finish_active_output_items, provider_output_item_id, start_output_item,
    ProviderOutputFamily,
};
use tool_runtime::tool_result_projection::NormalizedToolOutput;

const LOCAL_TOOL_ENVIRONMENT_ID: &str = "local";

#[derive(Clone)]
pub struct RuntimeToolStepSnapshot {
    pub definitions: Vec<RuntimeToolDefinition>,
    pub executor: RuntimeToolExecutorHandle,
}

impl RuntimeToolStepSnapshot {
    pub fn new(
        definitions: Vec<RuntimeToolDefinition>,
        executor: RuntimeToolExecutorHandle,
    ) -> Self {
        Self {
            definitions,
            executor,
        }
    }
}

pub type RuntimeToolStepSnapshotFuture<'a> =
    Pin<Box<dyn Future<Output = Result<RuntimeToolStepSnapshot, String>> + Send + 'a>>;

pub trait RuntimeToolStepSnapshotSource: Send + Sync {
    fn capture(&self) -> RuntimeToolStepSnapshotFuture<'_>;
}

#[derive(Clone)]
pub struct RuntimeToolStepSnapshotSourceHandle(Arc<dyn RuntimeToolStepSnapshotSource>);

impl RuntimeToolStepSnapshotSourceHandle {
    pub fn new(source: Arc<dyn RuntimeToolStepSnapshotSource>) -> Self {
        Self(source)
    }

    pub fn fixed(snapshot: RuntimeToolStepSnapshot) -> Self {
        Self::new(Arc::new(FixedRuntimeToolStepSnapshotSource { snapshot }))
    }

    async fn capture(&self) -> Result<RuntimeToolStepSnapshot, String> {
        self.0.capture().await
    }
}

struct FixedRuntimeToolStepSnapshotSource {
    snapshot: RuntimeToolStepSnapshot,
}

impl RuntimeToolStepSnapshotSource for FixedRuntimeToolStepSnapshotSource {
    fn capture(&self) -> RuntimeToolStepSnapshotFuture<'_> {
        Box::pin(async move { Ok(self.snapshot.clone()) })
    }
}

#[derive(Clone)]
pub struct CurrentProviderTurnInput {
    pub provider: Arc<dyn CurrentProvider>,
    pub provider_trace_metadata: Option<RuntimeReplyProviderTraceMetadata>,
    pub session_config: AgentSessionConfig,
    pub initial_messages: Vec<CurrentProviderMessage>,
    pub tool_step_snapshot_source: RuntimeToolStepSnapshotSourceHandle,
    pub model_request_policy: Option<RuntimeReplyModelRequestPolicy>,
    pub tool_lifecycle_emitter: Arc<dyn ToolLifecycleEmitter>,
    pub working_directory: PathBuf,
    pub cancel_token: Option<CancellationToken>,
}

#[derive(Clone, Debug, PartialEq)]
pub enum CurrentProviderTurnEvent {
    ProviderTrace {
        event: ProviderTraceEvent,
    },
    TextStart {
        item_id: String,
    },
    TextDelta {
        item_id: String,
        text: String,
    },
    TextEnd {
        item_id: String,
    },
    ReasoningStart {
        item_id: String,
    },
    ReasoningDelta {
        item_id: String,
        text: String,
    },
    ReasoningEnd {
        item_id: String,
    },
    ToolInputDelta {
        tool_id: String,
        tool_name: Option<String>,
        delta: String,
        accumulated_arguments: String,
    },
    Usage {
        usage: CurrentProviderUsage,
    },
}

pub async fn run_current_provider_turn<F>(
    input: CurrentProviderTurnInput,
    mut on_event: F,
) -> Result<RuntimeReplyExecution, RuntimeReplyAttemptError>
where
    F: FnMut(CurrentProviderTurnEvent) + Send,
{
    let CurrentProviderTurnInput {
        provider,
        provider_trace_metadata,
        session_config,
        mut initial_messages,
        tool_step_snapshot_source,
        model_request_policy,
        tool_lifecycle_emitter,
        working_directory,
        cancel_token,
    } = input;
    let turn_id = session_config
        .turn_id
        .clone()
        .filter(|turn_id| !turn_id.trim().is_empty())
        .ok_or_else(|| {
            RuntimeReplyAttemptError::new(
                "Current provider turn requires a canonical turn_id",
                false,
            )
        })?;
    let mut loop_state = RuntimeReplyLoop::new(session_config.max_turns);
    let mut text_output = String::new();
    let mut errors = Vec::new();
    let mut emitted_any = false;
    let mut emitted_tool_call = false;

    loop {
        if is_cancelled(&cancel_token) {
            return Ok(RuntimeReplyExecution::new(
                text_output,
                errors,
                emitted_any,
                attempts_summary(&loop_state),
                true,
            ));
        }
        let attempt = match loop_state.next_attempt() {
            RuntimeReplyLoopStep::Continue { attempt } => attempt,
            RuntimeReplyLoopStep::MaxTurnsReached { .. } => {
                if !text_output.is_empty() {
                    text_output.push('\n');
                }
                text_output.push_str(MAX_REPLY_TURNS_REACHED_MESSAGE);
                let item_id = format!("text-{turn_id}-max-turns");
                on_event(CurrentProviderTurnEvent::TextStart {
                    item_id: item_id.clone(),
                });
                on_event(CurrentProviderTurnEvent::TextDelta {
                    item_id: item_id.clone(),
                    text: MAX_REPLY_TURNS_REACHED_MESSAGE.to_string(),
                });
                on_event(CurrentProviderTurnEvent::TextEnd { item_id });
                return Ok(RuntimeReplyExecution::new(
                    text_output,
                    errors,
                    true,
                    attempts_summary(&loop_state),
                    false,
                ));
            }
        };

        let tool_step_snapshot = tool_step_snapshot_source
            .capture()
            .await
            .map_err(|message| RuntimeReplyAttemptError::new(message, emitted_any))?;
        let tools = tool_step_snapshot
            .definitions
            .iter()
            .map(|definition| CurrentProviderTool {
                name: definition.name.clone(),
                description: definition.description.clone(),
                input_schema: definition.input_schema.clone(),
            })
            .collect::<Vec<_>>();

        let request = CurrentProviderRequest::new(initial_messages.clone())
            .with_system_prompt(session_config.system_prompt.clone())
            .with_tools(tools.clone())
            .with_model_request_policy(model_request_policy.clone());
        let mut provider_trace_attempt = provider_trace_metadata.as_ref().map(|metadata| {
            RuntimeProviderTraceAttempt::new(
                metadata.provider_name.clone(),
                metadata.model_name.clone(),
                attempt,
            )
        });
        if let Some(trace) = provider_trace_attempt.as_ref() {
            emit_provider_trace(
                &mut on_event,
                provider_trace_metadata.as_ref(),
                trace.request_started(),
            );
        }
        let mut stream =
            match start_provider_stream(&provider, request, cancel_token.as_ref()).await {
                Ok(Some(stream)) => stream,
                Ok(None) => {
                    if let Some(trace) = provider_trace_attempt.as_ref() {
                        emit_provider_trace(
                            &mut on_event,
                            provider_trace_metadata.as_ref(),
                            trace.canceled("turn_canceled"),
                        );
                    }
                    return Ok(RuntimeReplyExecution::new(
                        text_output,
                        errors,
                        emitted_any,
                        attempts_summary(&loop_state),
                        true,
                    ));
                }
                Err(error) => {
                    if let Some(trace) = provider_trace_attempt.as_ref() {
                        emit_provider_trace(
                            &mut on_event,
                            provider_trace_metadata.as_ref(),
                            trace.failed(ProviderTraceFailure::new(
                                "provider_request_failed",
                                false,
                                false,
                            )),
                        );
                    }
                    return Err(RuntimeReplyAttemptError::new(error.message, emitted_any));
                }
            };
        let mut assistant_content = Vec::new();
        let mut calls = Vec::new();
        let mut completed = false;
        let mut tool_arguments = HashMap::<String, String>::new();
        let mut active_text_item_id = None;
        let mut active_reasoning_item_id = None;

        loop {
            let event = next_provider_event(&mut stream, cancel_token.as_ref()).await;
            if is_cancelled(&cancel_token) {
                if let Some(trace) = provider_trace_attempt.as_ref() {
                    emit_provider_trace(
                        &mut on_event,
                        provider_trace_metadata.as_ref(),
                        trace.canceled("turn_canceled"),
                    );
                }
                return Ok(RuntimeReplyExecution::new(
                    text_output,
                    errors,
                    emitted_any,
                    attempts_summary(&loop_state),
                    true,
                ));
            }
            let Some(event) = event else {
                break;
            };
            let event = match event {
                Ok(event) => event,
                Err(error) => {
                    if let Some(trace) = provider_trace_attempt.as_ref() {
                        emit_provider_trace(
                            &mut on_event,
                            provider_trace_metadata.as_ref(),
                            trace.failed(ProviderTraceFailure::new(
                                "provider_stream_failed",
                                false,
                                false,
                            )),
                        );
                    }
                    return Err(RuntimeReplyAttemptError::new(error.message, emitted_any));
                }
            };
            if let Some(event) = provider_trace_attempt
                .as_mut()
                .and_then(RuntimeProviderTraceAttempt::first_event_received)
            {
                emit_provider_trace(&mut on_event, provider_trace_metadata.as_ref(), event);
            }
            match event {
                CanonicalLlmEvent::TextStart { id } => {
                    let id =
                        provider_output_item_id(&turn_id, attempt, ProviderOutputFamily::Text, &id);
                    start_output_item(
                        &mut active_text_item_id,
                        id,
                        ProviderOutputFamily::Text,
                        &mut on_event,
                        emitted_any,
                    )?;
                }
                CanonicalLlmEvent::TextDelta { id, text } => {
                    let id =
                        provider_output_item_id(&turn_id, attempt, ProviderOutputFamily::Text, &id);
                    if let Some(event) = provider_trace_attempt
                        .as_mut()
                        .and_then(|trace| trace.first_text_delta_received(text.chars().count()))
                    {
                        emit_provider_trace(&mut on_event, provider_trace_metadata.as_ref(), event);
                    }
                    emitted_any = true;
                    text_output.push_str(&text);
                    assistant_content.push(CurrentProviderContent::Text(text.clone()));
                    start_output_item(
                        &mut active_text_item_id,
                        id.clone(),
                        ProviderOutputFamily::Text,
                        &mut on_event,
                        emitted_any,
                    )?;
                    on_event(CurrentProviderTurnEvent::TextDelta { item_id: id, text });
                }
                CanonicalLlmEvent::TextEnd { id } => {
                    let id =
                        provider_output_item_id(&turn_id, attempt, ProviderOutputFamily::Text, &id);
                    end_output_item(
                        &mut active_text_item_id,
                        id,
                        ProviderOutputFamily::Text,
                        &mut on_event,
                        emitted_any,
                    )?;
                }
                CanonicalLlmEvent::ReasoningStart { id } => {
                    let id = provider_output_item_id(
                        &turn_id,
                        attempt,
                        ProviderOutputFamily::Reasoning,
                        &id,
                    );
                    start_output_item(
                        &mut active_reasoning_item_id,
                        id,
                        ProviderOutputFamily::Reasoning,
                        &mut on_event,
                        emitted_any,
                    )?;
                }
                CanonicalLlmEvent::ReasoningDelta { id, text } => {
                    let id = provider_output_item_id(
                        &turn_id,
                        attempt,
                        ProviderOutputFamily::Reasoning,
                        &id,
                    );
                    emitted_any = true;
                    assistant_content.push(CurrentProviderContent::Reasoning(text.clone()));
                    start_output_item(
                        &mut active_reasoning_item_id,
                        id.clone(),
                        ProviderOutputFamily::Reasoning,
                        &mut on_event,
                        emitted_any,
                    )?;
                    on_event(CurrentProviderTurnEvent::ReasoningDelta { item_id: id, text });
                }
                CanonicalLlmEvent::ReasoningEnd { id } => {
                    let id = provider_output_item_id(
                        &turn_id,
                        attempt,
                        ProviderOutputFamily::Reasoning,
                        &id,
                    );
                    end_output_item(
                        &mut active_reasoning_item_id,
                        id,
                        ProviderOutputFamily::Reasoning,
                        &mut on_event,
                        emitted_any,
                    )?;
                }
                CanonicalLlmEvent::ToolInputDelta { id, name, text } => {
                    emitted_any = true;
                    let accumulated_arguments = tool_arguments.entry(id.clone()).or_default();
                    accumulated_arguments.push_str(&text);
                    on_event(CurrentProviderTurnEvent::ToolInputDelta {
                        tool_id: id,
                        tool_name: Some(name),
                        delta: text,
                        accumulated_arguments: accumulated_arguments.clone(),
                    });
                }
                CanonicalLlmEvent::ToolCall {
                    id, name, input, ..
                } => {
                    emitted_any = true;
                    emitted_tool_call = true;
                    let call = CurrentProviderToolCall::new(id, name, input);
                    assistant_content.push(CurrentProviderContent::ToolCall(call.clone()));
                    calls.push(call);
                }
                CanonicalLlmEvent::Usage { usage } => {
                    on_event(CurrentProviderTurnEvent::Usage {
                        usage: current_provider_usage(usage),
                    });
                }
                CanonicalLlmEvent::Finish { .. } => {
                    finish_active_output_items(
                        &mut active_reasoning_item_id,
                        &mut active_text_item_id,
                        &mut on_event,
                    );
                    completed = true;
                }
                CanonicalLlmEvent::ProviderError { message, .. } => {
                    if let Some(trace) = provider_trace_attempt.as_ref() {
                        emit_provider_trace(
                            &mut on_event,
                            provider_trace_metadata.as_ref(),
                            trace.failed(ProviderTraceFailure::new(
                                "provider_event_failed",
                                false,
                                false,
                            )),
                        );
                    }
                    return Err(RuntimeReplyAttemptError::new(message, emitted_any));
                }
                CanonicalLlmEvent::StepStart { .. }
                | CanonicalLlmEvent::ToolInputStart { .. }
                | CanonicalLlmEvent::ToolInputEnd { .. }
                | CanonicalLlmEvent::ToolResult { .. }
                | CanonicalLlmEvent::ToolError { .. }
                | CanonicalLlmEvent::StepFinish { .. } => {}
            }
        }
        finish_active_output_items(
            &mut active_reasoning_item_id,
            &mut active_text_item_id,
            &mut on_event,
        );

        if !assistant_content.is_empty() {
            initial_messages.push(CurrentProviderMessage::assistant(assistant_content));
        }
        if calls.is_empty() {
            if !completed {
                errors.push("Provider stream ended without completion event".to_string());
            }
            if text_output.trim().is_empty() && !emitted_tool_call {
                return Err(RuntimeReplyAttemptError::new(
                    "Provider completed without user-visible output",
                    emitted_any,
                ));
            }
            return Ok(RuntimeReplyExecution::new(
                text_output,
                errors,
                emitted_any,
                attempts_summary(&loop_state),
                false,
            ));
        }

        let results = execute_calls(
            &tool_step_snapshot.executor,
            &tool_step_snapshot.definitions,
            &turn_id,
            &session_config.id,
            session_config.turn_context.as_ref(),
            &working_directory,
            cancel_token.clone(),
            tool_lifecycle_emitter.clone(),
            calls,
            model_request_policy
                .as_ref()
                .and_then(RuntimeReplyModelRequestPolicy::parallel_tool_calls)
                .unwrap_or(false),
        )
        .await;
        initial_messages.push(CurrentProviderMessage::tool(
            results
                .into_iter()
                .map(CurrentProviderContent::ToolResult)
                .collect(),
        ));
    }
}

async fn start_provider_stream(
    provider: &Arc<dyn CurrentProvider>,
    request: CurrentProviderRequest,
    cancel_token: Option<&CancellationToken>,
) -> Result<Option<CurrentProviderStream>, CurrentProviderError> {
    match cancel_token {
        Some(cancel_token) => {
            tokio::select! {
                _ = cancel_token.cancelled() => Ok(None),
                result = provider.stream(request) => result.map(Some),
            }
        }
        None => provider.stream(request).await.map(Some),
    }
}

async fn next_provider_event(
    stream: &mut CurrentProviderStream,
    cancel_token: Option<&CancellationToken>,
) -> Option<Result<CanonicalLlmEvent, CurrentProviderError>> {
    match cancel_token {
        Some(cancel_token) => {
            tokio::select! {
                _ = cancel_token.cancelled() => None,
                event = stream.next() => event,
            }
        }
        None => stream.next().await,
    }
}

fn emit_provider_trace<F>(
    on_event: &mut F,
    metadata: Option<&RuntimeReplyProviderTraceMetadata>,
    mut event: ProviderTraceEvent,
) where
    F: FnMut(CurrentProviderTurnEvent),
{
    if let Some(metadata) = metadata {
        metadata.apply_to_provider_trace_event(&mut event);
    }
    on_event(CurrentProviderTurnEvent::ProviderTrace { event });
}

fn current_provider_usage(usage: Usage) -> CurrentProviderUsage {
    CurrentProviderUsage {
        input_tokens: usage.input_tokens.unwrap_or_default().min(u32::MAX as u64) as u32,
        output_tokens: usage.output_tokens.unwrap_or_default().min(u32::MAX as u64) as u32,
        cached_input_tokens: usage
            .cache_read_input_tokens
            .map(|value| value.min(u32::MAX as u64) as u32),
        cache_creation_input_tokens: usage
            .cache_write_input_tokens
            .map(|value| value.min(u32::MAX as u64) as u32),
    }
}

async fn execute_calls(
    executor: &RuntimeToolExecutorHandle,
    tool_definitions: &[RuntimeToolDefinition],
    turn_id: &str,
    session_id: &str,
    turn_context: Option<&agent_protocol::turn_context::TurnContextOverride>,
    working_directory: &PathBuf,
    cancel_token: Option<CancellationToken>,
    lifecycle_emitter: Arc<dyn ToolLifecycleEmitter>,
    calls: Vec<CurrentProviderToolCall>,
    allow_parallel: bool,
) -> Vec<CurrentProviderToolResult> {
    let execute = |call: CurrentProviderToolCall| {
        let (definition, step_executor) =
            match runtime_tool_definition_for_call(tool_definitions, &call) {
                Some(definition) => (definition, executor.clone()),
                None => (
                    unavailable_runtime_tool_definition(&call),
                    RuntimeToolExecutorHandle::new(Arc::new(UnavailableStepToolExecutor)),
                ),
            };
        execute_call(
            step_executor,
            definition,
            turn_id.to_string(),
            session_id.to_string(),
            turn_context.cloned(),
            working_directory.clone(),
            cancel_token.clone(),
            lifecycle_emitter.clone(),
            call,
        )
    };
    let completed = if allow_parallel && calls.len() > 1 {
        join_all(calls.into_iter().map(execute)).await
    } else {
        let mut completed = Vec::with_capacity(calls.len());
        for call in calls {
            completed.push(execute(call).await);
        }
        completed
    };

    let mut results = Vec::with_capacity(completed.len());
    for CompletedToolCall { call, output } in completed {
        results.push(CurrentProviderToolResult {
            call_id: call.id,
            name: call.name,
            success: output.success,
            output: output.text,
            error: output.error,
        });
    }
    results
}

fn runtime_tool_definition_for_call(
    definitions: &[RuntimeToolDefinition],
    call: &CurrentProviderToolCall,
) -> Option<RuntimeToolDefinition> {
    definitions
        .iter()
        .find(|definition| definition.name == call.name)
        .cloned()
}

fn unavailable_runtime_tool_definition(call: &CurrentProviderToolCall) -> RuntimeToolDefinition {
    RuntimeToolDefinition::new(
        call.name.clone(),
        "Provider requested a tool that was unavailable for this sampling step",
        serde_json::json!({ "type": "object" }),
    )
}

struct UnavailableStepToolExecutor;

impl RuntimeToolExecutor for UnavailableStepToolExecutor {
    fn execute<'a>(
        &'a self,
        request: RuntimeToolExecutionRequest<'a>,
    ) -> RuntimeToolExecutionFuture<'a> {
        Box::pin(async move {
            let message = format!(
                "tool '{}' was not advertised for this sampling step",
                request.tool_name
            );
            Err(RuntimeToolExecutionError::new(
                message.clone(),
                Some(RuntimeToolPolicyErrorKind::PermissionDenied(message)),
            ))
        })
    }
}

struct CompletedToolCall {
    call: CurrentProviderToolCall,
    output: NormalizedToolOutput,
}

async fn execute_call(
    executor: RuntimeToolExecutorHandle,
    definition: RuntimeToolDefinition,
    turn_id: String,
    session_id: String,
    turn_context: Option<agent_protocol::turn_context::TurnContextOverride>,
    working_directory: PathBuf,
    cancel_token: Option<CancellationToken>,
    lifecycle_emitter: Arc<dyn ToolLifecycleEmitter>,
    call: CurrentProviderToolCall,
) -> CompletedToolCall {
    let context = RuntimeToolExecutionContext::new(RuntimeToolExecutionContextInput {
        working_directory: working_directory.clone(),
        session_id,
        cancel_token,
        workspace_sandbox: None,
    });
    let tool_call = ToolCall::new(
        turn_id,
        call.id.clone(),
        call.name.clone(),
        call.arguments.clone(),
        vec![ToolEnvironment::new(
            LOCAL_TOOL_ENVIRONMENT_ID,
            working_directory,
        )],
        lifecycle_emitter,
    );
    let runtime_tool = executor.bind(definition, RuntimeToolExposure::Direct);
    let output = runtime_tool
        .execute_call(&tool_call, &context, turn_context.as_ref())
        .await;
    CompletedToolCall { call, output }
}

fn is_cancelled(cancel_token: &Option<CancellationToken>) -> bool {
    cancel_token
        .as_ref()
        .is_some_and(CancellationToken::is_cancelled)
}

fn attempts_summary(loop_state: &RuntimeReplyLoop) -> String {
    format!("attempts={}", loop_state.attempts_taken())
}

#[cfg(test)]
#[path = "provider_turn/tests.rs"]
mod tests;
