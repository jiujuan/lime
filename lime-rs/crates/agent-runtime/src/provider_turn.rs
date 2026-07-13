//! 固定 provider 的 current Turn executor。
//!
//! 参考 Codex 的 response item 生命周期：每次 provider response 先 materialize 成
//! text/reasoning/tool-call event，所有工具调用完成后把 tool result 追加到同一个
//! transcript，再开始下一次 sampling。provider wire lowering 留在 model-provider，
//! 工具执行留在 tool-runtime；本模块不接触 Agent。

use crate::reply_execution::{RuntimeReplyAttemptError, RuntimeReplyExecution};
use crate::reply_loop::{RuntimeReplyLoop, RuntimeReplyLoopStep, MAX_REPLY_TURNS_REACHED_MESSAGE};
use crate::session_config::AgentSessionConfig;
use futures::future::join_all;
use futures::StreamExt;
use model_provider::current_client::{
    CanonicalLlmEvent, CurrentProvider, CurrentProviderContent, CurrentProviderMessage,
    CurrentProviderRequest, CurrentProviderTool, CurrentProviderToolCall,
    CurrentProviderToolResult, CurrentProviderUsage, Usage,
};
use model_provider::provider_stream::RuntimeReplyModelRequestPolicy;
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
    TextDelta {
        text: String,
    },
    ReasoningDelta {
        text: String,
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
        match loop_state.next_attempt() {
            RuntimeReplyLoopStep::Continue { .. } => {}
            RuntimeReplyLoopStep::MaxTurnsReached { .. } => {
                if !text_output.is_empty() {
                    text_output.push('\n');
                }
                text_output.push_str(MAX_REPLY_TURNS_REACHED_MESSAGE);
                on_event(CurrentProviderTurnEvent::TextDelta {
                    text: MAX_REPLY_TURNS_REACHED_MESSAGE.to_string(),
                });
                return Ok(RuntimeReplyExecution::new(
                    text_output,
                    errors,
                    true,
                    attempts_summary(&loop_state),
                    false,
                ));
            }
        }

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
        let mut stream = provider
            .stream(request)
            .await
            .map_err(|error| RuntimeReplyAttemptError::new(error.message, emitted_any))?;
        let mut assistant_content = Vec::new();
        let mut calls = Vec::new();
        let mut completed = false;
        let mut tool_arguments = HashMap::<String, String>::new();

        while let Some(event) = stream.next().await {
            if is_cancelled(&cancel_token) {
                return Ok(RuntimeReplyExecution::new(
                    text_output,
                    errors,
                    emitted_any,
                    attempts_summary(&loop_state),
                    true,
                ));
            }
            match event
                .map_err(|error| RuntimeReplyAttemptError::new(error.message, emitted_any))?
            {
                CanonicalLlmEvent::TextDelta { text, .. } => {
                    emitted_any = true;
                    text_output.push_str(&text);
                    assistant_content.push(CurrentProviderContent::Text(text.clone()));
                    on_event(CurrentProviderTurnEvent::TextDelta { text });
                }
                CanonicalLlmEvent::ReasoningDelta { text, .. } => {
                    emitted_any = true;
                    assistant_content.push(CurrentProviderContent::Reasoning(text.clone()));
                    on_event(CurrentProviderTurnEvent::ReasoningDelta { text });
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
                    let call = CurrentProviderToolCall::new(id, name, input);
                    assistant_content.push(CurrentProviderContent::ToolCall(call.clone()));
                    calls.push(call);
                }
                CanonicalLlmEvent::Usage { usage } => {
                    on_event(CurrentProviderTurnEvent::Usage {
                        usage: current_provider_usage(usage),
                    });
                }
                CanonicalLlmEvent::Finish { .. } => completed = true,
                CanonicalLlmEvent::ProviderError { message, .. } => {
                    return Err(RuntimeReplyAttemptError::new(message, emitted_any));
                }
                CanonicalLlmEvent::StepStart { .. }
                | CanonicalLlmEvent::TextStart { .. }
                | CanonicalLlmEvent::TextEnd { .. }
                | CanonicalLlmEvent::ReasoningStart { .. }
                | CanonicalLlmEvent::ReasoningEnd { .. }
                | CanonicalLlmEvent::ToolInputStart { .. }
                | CanonicalLlmEvent::ToolInputEnd { .. }
                | CanonicalLlmEvent::ToolResult { .. }
                | CanonicalLlmEvent::ToolError { .. }
                | CanonicalLlmEvent::StepFinish { .. } => {}
            }
        }

        if !assistant_content.is_empty() {
            initial_messages.push(CurrentProviderMessage::assistant(assistant_content));
        }
        if calls.is_empty() {
            if !completed {
                errors.push("Provider stream ended without completion event".to_string());
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
