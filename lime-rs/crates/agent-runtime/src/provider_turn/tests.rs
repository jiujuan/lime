use super::*;
use futures::future::BoxFuture;
use futures::stream;
use model_provider::current_client::CurrentProviderRole;
use model_provider::current_client::FinishReason;
use model_provider::current_client::{CurrentProviderError, CurrentProviderStream};
use std::collections::VecDeque;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;
use tool_runtime::tool_executor::{
    RuntimeToolExecutionFuture, RuntimeToolExecutionRequest, RuntimeToolExecutionResult,
    RuntimeToolExecutor,
};
use tool_runtime::tool_lifecycle::{
    ToolLifecycleEmissionFuture, ToolLifecycleEvent, ToolLifecyclePhase,
};

#[derive(Clone)]
struct ScriptedProvider {
    streams: Arc<Mutex<VecDeque<Vec<Result<CanonicalLlmEvent, CurrentProviderError>>>>>,
    requests: Arc<Mutex<Vec<CurrentProviderRequest>>>,
}

impl ScriptedProvider {
    fn new(streams: Vec<Vec<Result<CanonicalLlmEvent, CurrentProviderError>>>) -> Self {
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
                vec![Ok(CanonicalLlmEvent::Finish {
                    reason: FinishReason::Stop,
                    usage: None,
                    response_id: None,
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

struct TaggedTool(&'static str);

impl RuntimeToolExecutor for TaggedTool {
    fn execute<'a>(
        &'a self,
        _request: RuntimeToolExecutionRequest<'a>,
    ) -> RuntimeToolExecutionFuture<'a> {
        Box::pin(async move {
            Ok(RuntimeToolExecutionResult::new(
                true,
                self.0.to_string(),
                None,
                Default::default(),
            ))
        })
    }
}

#[derive(Default)]
struct CountingTool {
    calls: AtomicUsize,
}

impl RuntimeToolExecutor for CountingTool {
    fn execute<'a>(
        &'a self,
        request: RuntimeToolExecutionRequest<'a>,
    ) -> RuntimeToolExecutionFuture<'a> {
        Box::pin(async move {
            self.calls.fetch_add(1, Ordering::SeqCst);
            Ok(RuntimeToolExecutionResult::new(
                true,
                format!("executed {}", request.tool_name),
                None,
                Default::default(),
            ))
        })
    }
}

struct SequencedToolStepSnapshotSource {
    snapshots: Mutex<VecDeque<RuntimeToolStepSnapshot>>,
}

impl RuntimeToolStepSnapshotSource for SequencedToolStepSnapshotSource {
    fn capture(&self) -> RuntimeToolStepSnapshotFuture<'_> {
        Box::pin(async move {
            self.snapshots
                .lock()
                .expect("take tool step snapshot")
                .pop_front()
                .ok_or_else(|| "missing tool step snapshot".to_string())
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

#[derive(Default)]
struct RecordingLifecycleEmitter {
    events: Mutex<Vec<ToolLifecycleEvent>>,
}

impl RecordingLifecycleEmitter {
    fn events(&self) -> Vec<ToolLifecycleEvent> {
        self.events.lock().expect("lifecycle events").clone()
    }
}

impl ToolLifecycleEmitter for RecordingLifecycleEmitter {
    fn emit<'a>(&'a self, event: ToolLifecycleEvent) -> ToolLifecycleEmissionFuture<'a> {
        Box::pin(async move {
            self.events
                .lock()
                .expect("record lifecycle event")
                .push(event);
        })
    }
}

#[tokio::test]
async fn turn_executes_tool_then_continues_with_tool_result_transcript() {
    let provider = Arc::new(ScriptedProvider::new(vec![
        vec![
            Ok(CanonicalLlmEvent::ToolInputDelta {
                id: "call-1".to_string(),
                name: "Read".to_string(),
                text: "{\"path\":\"README.md\"}".to_string(),
            }),
            Ok(CanonicalLlmEvent::ToolCall {
                id: "call-1".to_string(),
                name: "Read".to_string(),
                input: serde_json::json!({ "path": "README.md" }),
                provider_executed: None,
            }),
            Ok(CanonicalLlmEvent::Finish {
                reason: FinishReason::ToolCall,
                usage: None,
                response_id: Some("response-1".to_string()),
            }),
        ],
        vec![
            Ok(CanonicalLlmEvent::TextDelta {
                id: "text-0".to_string(),
                text: "done".to_string(),
            }),
            Ok(CanonicalLlmEvent::Finish {
                reason: FinishReason::Stop,
                usage: None,
                response_id: Some("response-2".to_string()),
            }),
        ],
    ]));
    let requests = Arc::clone(&provider.requests);
    let lifecycle_emitter = Arc::new(RecordingLifecycleEmitter::default());
    let mut events = Vec::new();
    let execution = run_current_provider_turn(
        CurrentProviderTurnInput {
            provider,
            session_config: crate::session_config::SessionConfigBuilder::new("session-1")
                .turn_id("turn-1")
                .max_turns(3)
                .build(),
            initial_messages: vec![CurrentProviderMessage::user(vec![
                CurrentProviderContent::Text("read it".to_string()),
            ])],
            tool_step_snapshot_source: RuntimeToolStepSnapshotSourceHandle::fixed(
                RuntimeToolStepSnapshot::new(
                    vec![RuntimeToolDefinition::new(
                        "Read",
                        "read files",
                        serde_json::json!({ "type": "object" }),
                    )],
                    RuntimeToolExecutorHandle::new(Arc::new(EchoTool)),
                ),
            ),
            model_request_policy: None,
            tool_lifecycle_emitter: lifecycle_emitter.clone(),
            working_directory: PathBuf::from("."),
            cancel_token: None,
        },
        |event| events.push(event),
    )
    .await
    .expect("turn execution");

    assert_eq!(execution.text_output, "done");
    assert_eq!(execution.attempts_summary, "attempts=2");
    let lifecycle_events = lifecycle_emitter.events();
    assert_eq!(lifecycle_events.len(), 2);
    assert_eq!(lifecycle_events[0].phase, ToolLifecyclePhase::Started);
    assert_eq!(lifecycle_events[0].turn_id, "turn-1");
    assert_eq!(lifecycle_events[0].call_id, "call-1");
    assert_eq!(lifecycle_events[0].tool_name, "Read");
    assert_eq!(lifecycle_events[0].environments.len(), 1);
    assert_eq!(lifecycle_events[0].environments[0].environment_id, "local");
    assert_eq!(lifecycle_events[0].environments[0].cwd, PathBuf::from("."));
    assert_eq!(lifecycle_events[1].phase, ToolLifecyclePhase::Completed);
    assert_eq!(
        lifecycle_events[1]
            .output
            .as_ref()
            .map(|output| output.text.as_str()),
        Some("executed Read")
    );
    assert!(events.iter().any(|event| matches!(
        event,
        CurrentProviderTurnEvent::ToolInputDelta { tool_id, .. } if tool_id == "call-1"
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
async fn each_sampling_step_uses_a_fresh_definition_and_executor_snapshot() {
    let provider = Arc::new(ScriptedProvider::new(vec![
        vec![
            Ok(CanonicalLlmEvent::ToolCall {
                id: "call-1".to_string(),
                name: "FirstTool".to_string(),
                input: serde_json::json!({}),
                provider_executed: None,
            }),
            Ok(CanonicalLlmEvent::Finish {
                reason: FinishReason::ToolCall,
                usage: None,
                response_id: Some("response-1".to_string()),
            }),
        ],
        vec![Ok(CanonicalLlmEvent::Finish {
            reason: FinishReason::Stop,
            usage: None,
            response_id: Some("response-2".to_string()),
        })],
    ]));
    let requests = Arc::clone(&provider.requests);
    let source =
        RuntimeToolStepSnapshotSourceHandle::new(Arc::new(SequencedToolStepSnapshotSource {
            snapshots: Mutex::new(VecDeque::from([
                RuntimeToolStepSnapshot::new(
                    vec![RuntimeToolDefinition::new(
                        "FirstTool",
                        "first step",
                        serde_json::json!({}),
                    )],
                    RuntimeToolExecutorHandle::new(Arc::new(TaggedTool("first-executor"))),
                ),
                RuntimeToolStepSnapshot::new(
                    vec![RuntimeToolDefinition::new(
                        "SecondTool",
                        "second step",
                        serde_json::json!({}),
                    )],
                    RuntimeToolExecutorHandle::new(Arc::new(TaggedTool("second-executor"))),
                ),
            ])),
        }));

    run_current_provider_turn(
        CurrentProviderTurnInput {
            provider,
            session_config: crate::session_config::SessionConfigBuilder::new("session-1")
                .turn_id("turn-1")
                .max_turns(3)
                .build(),
            initial_messages: vec![CurrentProviderMessage::user(vec![
                CurrentProviderContent::Text("run it".to_string()),
            ])],
            tool_step_snapshot_source: source,
            model_request_policy: None,
            tool_lifecycle_emitter: Arc::new(RecordingLifecycleEmitter::default()),
            working_directory: PathBuf::from("."),
            cancel_token: None,
        },
        |_| {},
    )
    .await
    .expect("step snapshot turn");

    let requests = requests.lock().expect("recorded requests");
    assert_eq!(requests.len(), 2);
    assert_eq!(requests[0].tools[0].name, "FirstTool");
    assert_eq!(requests[1].tools[0].name, "SecondTool");
    assert!(matches!(
        requests[1].messages.last(),
        Some(CurrentProviderMessage {
            role: CurrentProviderRole::Tool,
            content,
        }) if matches!(content.as_slice(), [CurrentProviderContent::ToolResult(result)]
            if result.output == "first-executor")
    ));
}

#[tokio::test]
async fn unadvertised_native_and_mcp_calls_fail_without_reaching_step_executor() {
    let provider = Arc::new(ScriptedProvider::new(vec![
        vec![
            Ok(CanonicalLlmEvent::ToolCall {
                id: "call-native".to_string(),
                name: "apply_patch".to_string(),
                input: serde_json::json!({ "patch": "hidden" }),
                provider_executed: None,
            }),
            Ok(CanonicalLlmEvent::ToolCall {
                id: "call-mcp".to_string(),
                name: "mcp__hidden__unknown".to_string(),
                input: serde_json::json!({}),
                provider_executed: None,
            }),
            Ok(CanonicalLlmEvent::Finish {
                reason: FinishReason::ToolCall,
                usage: None,
                response_id: Some("response-1".to_string()),
            }),
        ],
        vec![Ok(CanonicalLlmEvent::Finish {
            reason: FinishReason::Stop,
            usage: None,
            response_id: Some("response-2".to_string()),
        })],
    ]));
    let requests = Arc::clone(&provider.requests);
    let step_executor = Arc::new(CountingTool::default());
    let lifecycle_emitter = Arc::new(RecordingLifecycleEmitter::default());

    run_current_provider_turn(
        CurrentProviderTurnInput {
            provider,
            session_config: crate::session_config::SessionConfigBuilder::new("session-1")
                .turn_id("turn-1")
                .max_turns(3)
                .build(),
            initial_messages: vec![CurrentProviderMessage::user(vec![
                CurrentProviderContent::Text("guess hidden tools".to_string()),
            ])],
            tool_step_snapshot_source: RuntimeToolStepSnapshotSourceHandle::fixed(
                RuntimeToolStepSnapshot::new(
                    vec![RuntimeToolDefinition::new(
                        "Read",
                        "visible tool",
                        serde_json::json!({}),
                    )],
                    RuntimeToolExecutorHandle::new(step_executor.clone()),
                ),
            ),
            model_request_policy: None,
            tool_lifecycle_emitter: lifecycle_emitter.clone(),
            working_directory: PathBuf::from("."),
            cancel_token: None,
        },
        |_| {},
    )
    .await
    .expect("unadvertised tool calls should become failed tool results");

    assert_eq!(step_executor.calls.load(Ordering::SeqCst), 0);
    let lifecycle_events = lifecycle_emitter.events();
    assert_eq!(lifecycle_events.len(), 4);
    for completed in lifecycle_events
        .iter()
        .filter(|event| event.phase == ToolLifecyclePhase::Completed)
    {
        let output = completed.output.as_ref().expect("completed output");
        assert!(!output.success);
        assert!(output
            .error
            .as_deref()
            .is_some_and(|error| error.contains("not advertised")));
    }

    let requests = requests.lock().expect("recorded requests");
    assert_eq!(requests.len(), 2);
    assert_eq!(requests[0].tools.len(), 1);
    assert_eq!(requests[0].tools[0].name, "Read");
    assert!(matches!(
        requests[1].messages.last(),
        Some(CurrentProviderMessage {
            role: CurrentProviderRole::Tool,
            content,
        }) if content.len() == 2 && content.iter().all(|part| matches!(
            part,
            CurrentProviderContent::ToolResult(result)
                if !result.success
                    && result.error.as_deref().is_some_and(|error| error.contains("not advertised"))
        ))
    ));
}

#[tokio::test]
async fn turn_executes_same_response_tool_batch_in_parallel_when_policy_allows() {
    let provider = Arc::new(ScriptedProvider::new(vec![
        vec![
            Ok(CanonicalLlmEvent::ToolCall {
                id: "call-1".to_string(),
                name: "Read".to_string(),
                input: serde_json::json!({ "path": "README.md" }),
                provider_executed: None,
            }),
            Ok(CanonicalLlmEvent::ToolCall {
                id: "call-2".to_string(),
                name: "Glob".to_string(),
                input: serde_json::json!({ "pattern": "*.rs" }),
                provider_executed: None,
            }),
            Ok(CanonicalLlmEvent::Finish {
                reason: FinishReason::ToolCall,
                usage: None,
                response_id: Some("response-1".to_string()),
            }),
        ],
        vec![Ok(CanonicalLlmEvent::Finish {
            reason: FinishReason::Stop,
            usage: None,
            response_id: Some("response-2".to_string()),
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
                .turn_id("turn-1")
                .max_turns(3)
                .build(),
            initial_messages: vec![CurrentProviderMessage::user(vec![
                CurrentProviderContent::Text("inspect it".to_string()),
            ])],
            tool_step_snapshot_source: RuntimeToolStepSnapshotSourceHandle::fixed(
                RuntimeToolStepSnapshot::new(
                    vec![
                        RuntimeToolDefinition::new("Read", "read files", serde_json::json!({})),
                        RuntimeToolDefinition::new("Glob", "find files", serde_json::json!({})),
                    ],
                    RuntimeToolExecutorHandle::new(probe.clone()),
                ),
            ),
            model_request_policy: Some(policy),
            tool_lifecycle_emitter: Arc::new(RecordingLifecycleEmitter::default()),
            working_directory: PathBuf::from("."),
            cancel_token: None,
        },
        |_| {},
    )
    .await
    .expect("parallel tool turn");

    assert_eq!(probe.max_active.load(Ordering::SeqCst), 2);
}

#[tokio::test]
async fn turn_propagates_canonical_provider_error() {
    let provider = Arc::new(ScriptedProvider::new(vec![vec![Ok(
        CanonicalLlmEvent::ProviderError {
            message: "stream truncated".to_string(),
            classification: None,
            retryable: Some(true),
        },
    )]]));

    let error = run_current_provider_turn(
        CurrentProviderTurnInput {
            provider,
            session_config: crate::session_config::SessionConfigBuilder::new("session-1")
                .turn_id("turn-1")
                .build(),
            initial_messages: vec![CurrentProviderMessage::user(vec![
                CurrentProviderContent::Text("hello".to_string()),
            ])],
            tool_step_snapshot_source: RuntimeToolStepSnapshotSourceHandle::fixed(
                RuntimeToolStepSnapshot::new(
                    Vec::new(),
                    RuntimeToolExecutorHandle::new(Arc::new(EchoTool)),
                ),
            ),
            model_request_policy: None,
            tool_lifecycle_emitter: Arc::new(RecordingLifecycleEmitter::default()),
            working_directory: PathBuf::from("."),
            cancel_token: None,
        },
        |_| {},
    )
    .await
    .expect_err("provider error must fail the turn");

    assert_eq!(error.message, "stream truncated");
    assert!(!error.emitted_any);
}

#[tokio::test]
async fn turn_requires_canonical_turn_id_before_provider_sampling() {
    let provider = Arc::new(ScriptedProvider::new(Vec::new()));
    let requests = Arc::clone(&provider.requests);

    let error = run_current_provider_turn(
        CurrentProviderTurnInput {
            provider,
            session_config: crate::session_config::SessionConfigBuilder::new("session-1").build(),
            initial_messages: Vec::new(),
            tool_step_snapshot_source: RuntimeToolStepSnapshotSourceHandle::fixed(
                RuntimeToolStepSnapshot::new(
                    Vec::new(),
                    RuntimeToolExecutorHandle::new(Arc::new(EchoTool)),
                ),
            ),
            model_request_policy: None,
            tool_lifecycle_emitter: Arc::new(RecordingLifecycleEmitter::default()),
            working_directory: PathBuf::from("."),
            cancel_token: None,
        },
        |_| {},
    )
    .await
    .expect_err("missing canonical turn id must fail closed");

    assert_eq!(
        error.message,
        "Current provider turn requires a canonical turn_id"
    );
    assert!(requests.lock().expect("provider requests").is_empty());
}
