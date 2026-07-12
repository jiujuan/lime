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
    CurrentProvider, CurrentProviderContent, CurrentProviderEvent, CurrentProviderMessage,
    CurrentProviderRequest, CurrentProviderTool, CurrentProviderToolCall,
    CurrentProviderToolResult, CurrentProviderUsage,
};
use model_provider::provider_stream::RuntimeReplyModelRequestPolicy;
use std::path::PathBuf;
use std::sync::Arc;
use tokio_util::sync::CancellationToken;
use tool_runtime::tool_definition::RuntimeToolDefinition;
use tool_runtime::tool_executor::{
    RuntimeToolExecutionContext, RuntimeToolExecutionContextInput, RuntimeToolExecutionRequest,
    RuntimeToolExecutorHandle,
};

#[derive(Clone)]
pub struct CurrentProviderTurnInput {
    pub provider: Arc<dyn CurrentProvider>,
    pub session_config: AgentSessionConfig,
    pub initial_messages: Vec<CurrentProviderMessage>,
    pub tool_definitions: Vec<RuntimeToolDefinition>,
    pub model_request_policy: Option<RuntimeReplyModelRequestPolicy>,
    pub tool_executor: RuntimeToolExecutorHandle,
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
    ToolStart {
        tool_id: String,
        tool_name: String,
        arguments: serde_json::Value,
    },
    ToolEnd {
        tool_id: String,
        tool_name: String,
        success: bool,
        output: String,
        error: Option<String>,
        metadata: std::collections::HashMap<String, serde_json::Value>,
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
        tool_definitions,
        model_request_policy,
        tool_executor,
        working_directory,
        cancel_token,
    } = input;
    let tools = tool_definitions
        .into_iter()
        .map(|definition| CurrentProviderTool {
            name: definition.name,
            description: definition.description,
            input_schema: definition.input_schema,
        })
        .collect::<Vec<_>>();
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
                CurrentProviderEvent::TextDelta(text) => {
                    emitted_any = true;
                    text_output.push_str(&text);
                    assistant_content.push(CurrentProviderContent::Text(text.clone()));
                    on_event(CurrentProviderTurnEvent::TextDelta { text });
                }
                CurrentProviderEvent::ReasoningDelta(text) => {
                    emitted_any = true;
                    assistant_content.push(CurrentProviderContent::Reasoning(text.clone()));
                    on_event(CurrentProviderTurnEvent::ReasoningDelta { text });
                }
                CurrentProviderEvent::ToolCallInputDelta {
                    call_id,
                    tool_name,
                    delta,
                    accumulated_arguments,
                } => {
                    emitted_any = true;
                    on_event(CurrentProviderTurnEvent::ToolInputDelta {
                        tool_id: call_id,
                        tool_name,
                        delta,
                        accumulated_arguments,
                    });
                }
                CurrentProviderEvent::ToolCall(call) => {
                    emitted_any = true;
                    assistant_content.push(CurrentProviderContent::ToolCall(call.clone()));
                    calls.push(call);
                }
                CurrentProviderEvent::Usage(usage) => {
                    on_event(CurrentProviderTurnEvent::Usage { usage });
                }
                CurrentProviderEvent::Completed { .. } => completed = true,
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
            &tool_executor,
            &session_config,
            &working_directory,
            cancel_token.clone(),
            calls,
            model_request_policy
                .as_ref()
                .and_then(RuntimeReplyModelRequestPolicy::parallel_tool_calls)
                .unwrap_or(false),
            &mut on_event,
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

async fn execute_calls<F>(
    executor: &RuntimeToolExecutorHandle,
    session_config: &AgentSessionConfig,
    working_directory: &PathBuf,
    cancel_token: Option<CancellationToken>,
    calls: Vec<CurrentProviderToolCall>,
    allow_parallel: bool,
    on_event: &mut F,
) -> Vec<CurrentProviderToolResult>
where
    F: FnMut(CurrentProviderTurnEvent) + Send,
{
    for call in &calls {
        on_event(CurrentProviderTurnEvent::ToolStart {
            tool_id: call.id.clone(),
            tool_name: call.name.clone(),
            arguments: call.arguments.clone(),
        });
    }

    let execute = |call: CurrentProviderToolCall| {
        execute_call(
            executor.clone(),
            session_config.id.clone(),
            session_config.turn_context.clone(),
            working_directory.clone(),
            cancel_token.clone(),
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
    for CompletedToolCall {
        call,
        success,
        output,
        error,
        metadata,
    } in completed
    {
        on_event(CurrentProviderTurnEvent::ToolEnd {
            tool_id: call.id.clone(),
            tool_name: call.name.clone(),
            success,
            output: output.clone(),
            error: error.clone(),
            metadata,
        });
        results.push(CurrentProviderToolResult {
            call_id: call.id,
            name: call.name,
            success,
            output,
            error,
        });
    }
    results
}

struct CompletedToolCall {
    call: CurrentProviderToolCall,
    success: bool,
    output: String,
    error: Option<String>,
    metadata: std::collections::HashMap<String, serde_json::Value>,
}

async fn execute_call(
    executor: RuntimeToolExecutorHandle,
    session_id: String,
    turn_context: Option<agent_protocol::turn_context::TurnContextOverride>,
    working_directory: PathBuf,
    cancel_token: Option<CancellationToken>,
    call: CurrentProviderToolCall,
) -> CompletedToolCall {
    let context = RuntimeToolExecutionContext::new(RuntimeToolExecutionContextInput {
        working_directory,
        session_id,
        cancel_token,
        workspace_sandbox: None,
    });
    let result = if serde_json::from_str::<serde_json::Value>(&call.raw_arguments).is_err() {
        Err(tool_runtime::tool_executor::RuntimeToolExecutionError::new(
            "Provider returned invalid JSON tool arguments",
            Some(
                tool_runtime::tool_executor::RuntimeToolPolicyErrorKind::ExecutionFailed(
                    "invalid_tool_arguments".to_string(),
                ),
            ),
        ))
    } else {
        executor
            .execute(RuntimeToolExecutionRequest {
                tool_name: &call.name,
                params: &call.arguments,
                context: &context,
                turn_context: turn_context.as_ref(),
            })
            .await
    };
    let (success, output, error, metadata) = match result {
        Ok(result) => (result.success, result.output, result.error, result.metadata),
        Err(error) => (
            false,
            String::new(),
            Some(error.message().to_string()),
            Default::default(),
        ),
    };
    CompletedToolCall {
        call,
        success,
        output,
        error,
        metadata,
    }
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
mod tests {
    use super::*;
    use futures::future::BoxFuture;
    use futures::stream;
    use model_provider::current_client::CurrentProviderRole;
    use model_provider::current_client::{CurrentProviderError, CurrentProviderStream};
    use std::collections::VecDeque;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Mutex;
    use tool_runtime::tool_executor::{
        RuntimeToolExecutionFuture, RuntimeToolExecutionResult, RuntimeToolExecutor,
    };

    #[derive(Clone)]
    struct ScriptedProvider {
        streams: Arc<Mutex<VecDeque<Vec<Result<CurrentProviderEvent, CurrentProviderError>>>>>,
        requests: Arc<Mutex<Vec<CurrentProviderRequest>>>,
    }

    impl ScriptedProvider {
        fn new(streams: Vec<Vec<Result<CurrentProviderEvent, CurrentProviderError>>>) -> Self {
            Self {
                streams: Arc::new(Mutex::new(VecDeque::from(streams))),
                requests: Arc::new(Mutex::new(Vec::new())),
            }
        }
    }

    impl CurrentProvider for ScriptedProvider {
        fn stream<'a>(
            &'a self,
            request: CurrentProviderRequest,
        ) -> BoxFuture<'a, Result<CurrentProviderStream, CurrentProviderError>> {
            self.requests.lock().expect("record request").push(request);
            let stream = self
                .streams
                .lock()
                .expect("take stream")
                .pop_front()
                .unwrap_or_else(|| {
                    vec![Ok(CurrentProviderEvent::Completed {
                        response_id: None,
                        end_turn: true,
                    })]
                });
            Box::pin(async move {
                let stream: CurrentProviderStream = Box::pin(stream::iter(stream));
                Ok(stream)
            })
        }
    }

    // The production client owns HTTP. This fake only documents turn-loop behavior below.
    struct EchoTool;

    impl RuntimeToolExecutor for EchoTool {
        fn execute<'a>(
            &'a self,
            request: RuntimeToolExecutionRequest<'a>,
        ) -> RuntimeToolExecutionFuture<'a> {
            Box::pin(async move {
                Ok(RuntimeToolExecutionResult::new(
                    true,
                    format!("executed {}", request.tool_name),
                    None,
                    Default::default(),
                ))
            })
        }
    }

    #[derive(Default)]
    struct ParallelProbe {
        active: AtomicUsize,
        max_active: AtomicUsize,
    }

    impl RuntimeToolExecutor for ParallelProbe {
        fn execute<'a>(
            &'a self,
            _request: RuntimeToolExecutionRequest<'a>,
        ) -> RuntimeToolExecutionFuture<'a> {
            Box::pin(async move {
                let active = self.active.fetch_add(1, Ordering::SeqCst) + 1;
                self.max_active.fetch_max(active, Ordering::SeqCst);
                tokio::time::sleep(std::time::Duration::from_millis(20)).await;
                self.active.fetch_sub(1, Ordering::SeqCst);
                Ok(RuntimeToolExecutionResult::new(
                    true,
                    "done".to_string(),
                    None,
                    Default::default(),
                ))
            })
        }
    }

    #[tokio::test]
    async fn turn_executes_tool_then_continues_with_tool_result_transcript() {
        let provider = Arc::new(ScriptedProvider::new(vec![
            vec![
                Ok(CurrentProviderEvent::ToolCallInputDelta {
                    call_id: "call-1".to_string(),
                    tool_name: Some("Read".to_string()),
                    delta: "{\"path\":\"README.md\"}".to_string(),
                    accumulated_arguments: "{\"path\":\"README.md\"}".to_string(),
                }),
                Ok(CurrentProviderEvent::ToolCall(
                    CurrentProviderToolCall::new(
                        "call-1",
                        "Read",
                        serde_json::json!({ "path": "README.md" }),
                    ),
                )),
                Ok(CurrentProviderEvent::Completed {
                    response_id: Some("response-1".to_string()),
                    end_turn: false,
                }),
            ],
            vec![
                Ok(CurrentProviderEvent::TextDelta("done".to_string())),
                Ok(CurrentProviderEvent::Completed {
                    response_id: Some("response-2".to_string()),
                    end_turn: true,
                }),
            ],
        ]));
        let requests = Arc::clone(&provider.requests);
        let mut events = Vec::new();
        let execution = run_current_provider_turn(
            CurrentProviderTurnInput {
                provider,
                session_config: crate::session_config::SessionConfigBuilder::new("session-1")
                    .max_turns(3)
                    .build(),
                initial_messages: vec![CurrentProviderMessage::user(vec![
                    CurrentProviderContent::Text("read it".to_string()),
                ])],
                tool_definitions: vec![RuntimeToolDefinition::new(
                    "Read",
                    "read files",
                    serde_json::json!({ "type": "object" }),
                )],
                model_request_policy: None,
                tool_executor: RuntimeToolExecutorHandle::new(Arc::new(EchoTool)),
                working_directory: PathBuf::from("."),
                cancel_token: None,
            },
            |event| events.push(event),
        )
        .await
        .expect("turn execution");

        assert_eq!(execution.text_output, "done");
        assert_eq!(execution.attempts_summary, "attempts=2");
        assert!(events.iter().any(|event| matches!(
            event,
            CurrentProviderTurnEvent::ToolStart { tool_id, tool_name, .. }
                if tool_id == "call-1" && tool_name == "Read"
        )));
        assert!(events.iter().any(|event| matches!(
            event,
            CurrentProviderTurnEvent::ToolEnd { success: true, .. }
        )));

        let requests = requests.lock().expect("recorded requests");
        assert_eq!(requests.len(), 2);
        assert!(matches!(
            requests[1].messages.last(),
            Some(CurrentProviderMessage {
                role: CurrentProviderRole::Tool,
                content,
            }) if matches!(content.as_slice(), [CurrentProviderContent::ToolResult(result)]
                if result.call_id == "call-1" && result.output == "executed Read")
        ));
    }

    #[tokio::test]
    async fn turn_executes_same_response_tool_batch_in_parallel_when_policy_allows() {
        let provider = Arc::new(ScriptedProvider::new(vec![
            vec![
                Ok(CurrentProviderEvent::ToolCall(
                    CurrentProviderToolCall::new(
                        "call-1",
                        "Read",
                        serde_json::json!({ "path": "README.md" }),
                    ),
                )),
                Ok(CurrentProviderEvent::ToolCall(
                    CurrentProviderToolCall::new(
                        "call-2",
                        "Glob",
                        serde_json::json!({ "pattern": "*.rs" }),
                    ),
                )),
                Ok(CurrentProviderEvent::Completed {
                    response_id: Some("response-1".to_string()),
                    end_turn: false,
                }),
            ],
            vec![Ok(CurrentProviderEvent::Completed {
                response_id: Some("response-2".to_string()),
                end_turn: true,
            })],
        ]));
        let probe = Arc::new(ParallelProbe::default());
        let policy = RuntimeReplyModelRequestPolicy {
            responses: None,
            tool_call: Some(
                model_provider::provider_stream::RuntimeReplyToolCallPolicy {
                    supports_parallel_tool_calls: true,
                    parallel_tool_calls: true,
                },
            ),
            reasoning_output: None,
        };

        run_current_provider_turn(
            CurrentProviderTurnInput {
                provider,
                session_config: crate::session_config::SessionConfigBuilder::new("session-1")
                    .max_turns(3)
                    .build(),
                initial_messages: vec![CurrentProviderMessage::user(vec![
                    CurrentProviderContent::Text("inspect it".to_string()),
                ])],
                tool_definitions: vec![
                    RuntimeToolDefinition::new("Read", "read files", serde_json::json!({})),
                    RuntimeToolDefinition::new("Glob", "find files", serde_json::json!({})),
                ],
                model_request_policy: Some(policy),
                tool_executor: RuntimeToolExecutorHandle::new(probe.clone()),
                working_directory: PathBuf::from("."),
                cancel_token: None,
            },
            |_| {},
        )
        .await
        .expect("parallel tool turn");

        assert_eq!(probe.max_active.load(Ordering::SeqCst), 2);
    }
}
