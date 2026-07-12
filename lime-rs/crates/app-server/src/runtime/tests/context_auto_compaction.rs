use super::*;
use serde_json::Value;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

struct AutoCompactionUsageBackend {
    requests: Mutex<Vec<ExecutionRequest>>,
    call_count: AtomicUsize,
}

#[async_trait]
impl ExecutionBackend for AutoCompactionUsageBackend {
    async fn start_turn(
        &self,
        request: ExecutionRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        let call_index = self.call_count.fetch_add(1, Ordering::SeqCst);
        self.requests
            .lock()
            .expect("test backend requests mutex poisoned")
            .push(request);
        sink.emit(RuntimeEvent::new("turn.started", json!({})))?;
        let input_tokens = if call_index == 0 { 91_000 } else { 1_000 };
        sink.emit(RuntimeEvent::new(
            "turn.completed",
            json!({
                "usage": {
                    "input_tokens": input_tokens,
                    "output_tokens": 200_000
                }
            }),
        ))
    }

    async fn cancel_turn(
        &self,
        _request: CancelExecutionRequest,
        _sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        Ok(())
    }

    async fn respond_action(
        &self,
        _request: ActionRespondRequest,
        _sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        Ok(())
    }
}

#[tokio::test]
async fn auto_compacts_before_turn_when_context_limit_is_due() {
    let backend = Arc::new(AutoCompactionUsageBackend {
        requests: Mutex::new(Vec::new()),
        call_count: AtomicUsize::new(0),
    });
    let core = RuntimeCore::with_backend(backend.clone());
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_auto_compact".to_string()),
        thread_id: Some("thread_auto_compact".to_string()),
        app_id: "agent-chat".to_string(),
        workspace_id: Some("workspace-current".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");

    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_auto_compact".to_string(),
            turn_id: Some("turn_auto_compact_1".to_string()),
            input: AgentInput {
                text: "第一轮".to_string(),
                attachments: Vec::new(),
            },
            runtime_options: None,
            queue_if_busy: false,
            skip_pre_submit_resume: false,
        },
        RuntimeHostContext::default(),
    )
    .await
    .expect("first turn");

    let metadata = json!({
        "harness": {
            "model_request_policy": {
                "context_policy": {
                    "model_context_window": 120_000,
                    "auto_compact_token_limit": 90_000
                }
            }
        }
    });
    let output = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: "sess_auto_compact".to_string(),
                turn_id: Some("turn_auto_compact_2".to_string()),
                input: AgentInput {
                    text: "继续".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: Some(RuntimeOptions {
                    runtime_request: Some(RuntimeRequest {
                        metadata: Some(metadata.clone()),
                        ..RuntimeRequest::default()
                    }),
                    ..RuntimeOptions::default()
                }),
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("second turn");

    let compact_index = output
        .events
        .iter()
        .position(|event| event.event_type == "context.compaction.completed")
        .expect("auto compact event");
    let turn_started_index = output
        .events
        .iter()
        .position(|event| {
            event.event_type == "turn.started"
                && event.turn_id.as_deref() == Some("turn_auto_compact_2")
        })
        .expect("turn started event");
    assert!(
        compact_index < turn_started_index,
        "auto compaction must run before backend sampling"
    );
    let completed = &output.events[compact_index];
    assert_eq!(
        completed.payload["trigger"].as_str(),
        Some("auto_context_limit")
    );
    assert_eq!(
        completed.payload["triggerContext"]["activeContextTokens"].as_u64(),
        Some(91_000)
    );
    assert_eq!(
        completed.payload["triggerContext"]["maxTokens"].as_u64(),
        Some(90_000)
    );
    assert!(completed.payload["triggerContext"]
        .get("outputTokens")
        .is_none());

    let requests = backend
        .requests
        .lock()
        .expect("test backend requests mutex poisoned");
    assert_eq!(requests.len(), 2);
    let second_metadata = requests[1]
        .runtime_options
        .as_ref()
        .and_then(app_server_protocol::RuntimeOptions::runtime_metadata)
        .expect("second turn metadata");
    assert_eq!(
        second_metadata
            .get(crate::runtime::memory_prompt::SESSION_COMPACTION_PROMPT_CONTEXT_KEY)
            .and_then(|value| value.get("contextEpoch"))
            .and_then(Value::as_u64),
        Some(1)
    );
    drop(requests);

    let third = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: "sess_auto_compact".to_string(),
                turn_id: Some("turn_auto_compact_3".to_string()),
                input: AgentInput {
                    text: "继续第二次".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: Some(RuntimeOptions {
                    runtime_request: Some(RuntimeRequest {
                        metadata: Some(metadata),
                        ..RuntimeRequest::default()
                    }),
                    ..RuntimeOptions::default()
                }),
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("third turn");
    assert!(
        third
            .events
            .iter()
            .all(|event| event.event_type != "context.compaction.completed"),
        "old usage before latest compaction must not retrigger auto compact"
    );
}
