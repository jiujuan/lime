use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use app_server::{
    run_json_lines, ActionRespondRequest, AppServer, CancelExecutionRequest, ExecutionBackend,
    ExecutionRequest, ProjectionStore, RuntimeCore, RuntimeCoreError, RuntimeEvent,
    RuntimeEventSink,
};
use app_server_protocol::protocol::v2::{
    METHOD_THREAD_GOAL_SET, METHOD_TURN_COMPLETED, METHOD_TURN_STARTED,
};
use app_server_protocol::{
    METHOD_INITIALIZE, METHOD_INITIALIZED, METHOD_THREAD_READ, METHOD_THREAD_START,
    METHOD_TURN_START,
};
use async_trait::async_trait;
use serde_json::{json, Value};
use tempfile::TempDir;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader, DuplexStream, Lines};
use tokio::sync::Notify;
use tokio::time::timeout;

#[derive(Clone, Debug)]
struct CapturedTurn {
    turn_id: String,
    agent_only: bool,
    text: String,
}

struct SequencedGoalBackend {
    calls: AtomicUsize,
    captured: Mutex<Vec<CapturedTurn>>,
    continuation_started: Notify,
    release_continuation: Notify,
}

impl SequencedGoalBackend {
    fn new() -> Self {
        Self {
            calls: AtomicUsize::new(0),
            captured: Mutex::new(Vec::new()),
            continuation_started: Notify::new(),
            release_continuation: Notify::new(),
        }
    }

    fn captured(&self) -> Vec<CapturedTurn> {
        self.captured
            .lock()
            .expect("thread goal backend capture mutex poisoned")
            .clone()
    }
}

#[async_trait]
impl ExecutionBackend for SequencedGoalBackend {
    async fn start_turn(
        &self,
        request: ExecutionRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        let call_index = self.calls.fetch_add(1, Ordering::SeqCst);
        self.captured
            .lock()
            .expect("thread goal backend capture mutex poisoned")
            .push(CapturedTurn {
                turn_id: request.turn.turn_id.clone(),
                agent_only: request.input.agent_only,
                text: request.input.concat_text(),
            });
        sink.emit(RuntimeEvent::new("turn.started", json!({})))?;

        match call_index {
            0 => sink.emit(RuntimeEvent::new("turn.completed", json!({}))),
            1 => {
                self.continuation_started.notify_one();
                self.release_continuation.notified().await;
                sink.emit(RuntimeEvent::new("turn.completed", json!({})))
            }
            _ => Err(RuntimeCoreError::Backend(format!(
                "thread goal continuation started more than once: call {}",
                call_index + 1
            ))),
        }
    }

    async fn cancel_turn(
        &self,
        _request: CancelExecutionRequest,
        _sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        self.release_continuation.notify_one();
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
async fn completed_turn_starts_one_agent_only_goal_continuation_over_public_jsonl() {
    let temp = TempDir::new().expect("thread goal continuation transport temp dir");
    let backend = Arc::new(SequencedGoalBackend::new());
    let runtime = RuntimeCore::with_backend(backend.clone()).with_projection_store(Arc::new(
        ProjectionStore::initialize(temp.path().join("projection.sqlite"))
            .expect("thread goal continuation projection store"),
    ));
    let server = AppServer::with_runtime(runtime);

    let (mut input_client, input_server) = tokio::io::duplex(32 * 1024);
    let (output_server, output_client) = tokio::io::duplex(32 * 1024);
    let runner = tokio::spawn(run_json_lines(server, input_server, output_server));
    let mut output_lines = BufReader::new(output_client).lines();

    write_message(
        &mut input_client,
        json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": METHOD_INITIALIZE,
            "params": {
                "clientInfo": {
                    "name": "thread-goal-continuation-jsonrpc-test",
                    "version": "1.0.0"
                }
            }
        }),
    )
    .await;
    assert_response_ok(&read_response(&mut output_lines, 1).await, "initialize");
    write_message(
        &mut input_client,
        json!({ "jsonrpc": "2.0", "method": METHOD_INITIALIZED, "params": {} }),
    )
    .await;

    write_message(
        &mut input_client,
        json!({
            "jsonrpc": "2.0",
            "id": 2,
            "method": METHOD_THREAD_START,
            "params": {
                "model": "fixture-model",
                "modelProvider": "fixture-provider",
                "cwd": temp.path()
            }
        }),
    )
    .await;
    let thread_start = read_response(&mut output_lines, 2).await;
    assert_response_ok(&thread_start, "thread/start");
    let thread_id = required_string(&thread_start, "/result/thread/id", "thread/start id");

    write_message(
        &mut input_client,
        json!({
            "jsonrpc": "2.0",
            "id": 3,
            "method": METHOD_THREAD_GOAL_SET,
            "params": {
                "threadId": thread_id,
                "objective": "finish the verified current owner",
                "tokenBudget": 500
            }
        }),
    )
    .await;
    let goal_set = read_response(&mut output_lines, 3).await;
    assert_response_ok(&goal_set, "thread/goal/set");
    assert_eq!(
        goal_set.pointer("/result/goal/status"),
        Some(&json!("active"))
    );

    write_message(
        &mut input_client,
        json!({
            "jsonrpc": "2.0",
            "id": 4,
            "method": METHOD_TURN_START,
            "params": {
                "threadId": thread_id,
                "input": [{"type": "text", "text": "complete the first turn"}],
                "model": "fixture-model",
                "approvalPolicy": "never",
                "sandboxPolicy": "workspace-write"
            }
        }),
    )
    .await;

    timeout(
        Duration::from_secs(3),
        backend.continuation_started.notified(),
    )
    .await
    .expect("active goal should start a continuation turn");
    let captured = backend.captured();
    assert_eq!(captured.len(), 2, "one user turn plus one continuation");
    let first_turn_id = captured[0].turn_id.clone();
    let continuation_turn_id = captured[1].turn_id.clone();

    let observed = wait_for_turn_admission_and_continuation(
        &mut output_lines,
        &thread_id,
        &first_turn_id,
        &continuation_turn_id,
    )
    .await;
    assert!(observed.turn_start_response);
    assert!(observed.first_turn_completed);
    assert!(observed.continuation_started);

    assert!(!captured[0].agent_only);
    assert!(captured[1].agent_only);
    assert!(captured[1]
        .text
        .contains("finish the verified current owner"));
    assert!(captured[1].text.contains("<objective>"));

    write_message(
        &mut input_client,
        json!({
            "jsonrpc": "2.0",
            "id": 5,
            "method": METHOD_THREAD_READ,
            "params": { "threadId": thread_id, "includeTurns": true }
        }),
    )
    .await;
    let read = read_response(&mut output_lines, 5).await;
    assert_response_ok(&read, "thread/read with active continuation");
    let continuation = find_turn(&read, &continuation_turn_id);
    assert_eq!(continuation.get("status"), Some(&json!("inProgress")));
    assert!(continuation
        .get("items")
        .and_then(Value::as_array)
        .is_some_and(|items| items
            .iter()
            .all(|item| item.get("type") != Some(&json!("userMessage")))));

    write_message(
        &mut input_client,
        json!({
            "jsonrpc": "2.0",
            "id": 6,
            "method": METHOD_THREAD_GOAL_SET,
            "params": { "threadId": thread_id, "status": "paused" }
        }),
    )
    .await;
    assert_response_ok(
        &read_response(&mut output_lines, 6).await,
        "pause thread goal",
    );
    backend.release_continuation.notify_one();

    let completed = read_turn_notification(
        &mut output_lines,
        METHOD_TURN_COMPLETED,
        &continuation_turn_id,
    )
    .await;
    assert_eq!(
        completed.pointer("/params/threadId"),
        Some(&json!(thread_id))
    );
    assert_eq!(
        completed.pointer("/params/turn/status"),
        Some(&json!("completed"))
    );

    write_message(
        &mut input_client,
        json!({
            "jsonrpc": "2.0",
            "id": 7,
            "method": METHOD_THREAD_READ,
            "params": { "threadId": thread_id, "includeTurns": true }
        }),
    )
    .await;
    let terminal_read = read_response(&mut output_lines, 7).await;
    assert_response_ok(&terminal_read, "thread/read after continuation");
    assert_eq!(backend.calls.load(Ordering::SeqCst), 2);
    assert_eq!(
        find_turn(&terminal_read, &continuation_turn_id).get("status"),
        Some(&json!("completed"))
    );

    drop(input_client);
    timeout(Duration::from_secs(2), runner)
        .await
        .expect("JSONL runner should stop after input closes")
        .expect("JSONL runner task")
        .expect("JSONL runner result");
}

struct ObservedContinuation {
    turn_start_response: bool,
    first_turn_completed: bool,
    continuation_started: bool,
}

async fn wait_for_turn_admission_and_continuation(
    lines: &mut Lines<BufReader<DuplexStream>>,
    thread_id: &str,
    first_turn_id: &str,
    continuation_turn_id: &str,
) -> ObservedContinuation {
    let mut observed = ObservedContinuation {
        turn_start_response: false,
        first_turn_completed: false,
        continuation_started: false,
    };
    for _ in 0..96 {
        let message = next_message(lines).await;
        if message.get("id") == Some(&json!(4)) {
            assert_response_ok(&message, "turn/start");
            assert_eq!(
                message.pointer("/result/turn/id"),
                Some(&json!(first_turn_id))
            );
            observed.turn_start_response = true;
        }
        if message.get("method") == Some(&json!(METHOD_TURN_COMPLETED))
            && message.pointer("/params/turn/id") == Some(&json!(first_turn_id))
        {
            assert_eq!(message.pointer("/params/threadId"), Some(&json!(thread_id)));
            observed.first_turn_completed = true;
        }
        if message.get("method") == Some(&json!(METHOD_TURN_STARTED))
            && message.pointer("/params/turn/id") == Some(&json!(continuation_turn_id))
        {
            assert_eq!(message.pointer("/params/threadId"), Some(&json!(thread_id)));
            observed.continuation_started = true;
        }
        if observed.turn_start_response
            && observed.first_turn_completed
            && observed.continuation_started
        {
            return observed;
        }
    }
    panic!("public JSONL did not expose the complete goal continuation sequence");
}

fn find_turn<'a>(read: &'a Value, turn_id: &str) -> &'a Value {
    read.pointer("/result/thread/turns")
        .and_then(Value::as_array)
        .and_then(|turns| {
            turns
                .iter()
                .find(|turn| turn.get("id") == Some(&json!(turn_id)))
        })
        .unwrap_or_else(|| panic!("turn {turn_id} missing from thread/read: {read:#?}"))
}

async fn write_message(client: &mut DuplexStream, message: Value) {
    client
        .write_all(format!("{message}\n").as_bytes())
        .await
        .expect("write JSON-RPC message");
    client.flush().await.expect("flush JSON-RPC message");
}

async fn read_response(lines: &mut Lines<BufReader<DuplexStream>>, id: u64) -> Value {
    for _ in 0..96 {
        let message = next_message(lines).await;
        if message.get("id") == Some(&json!(id)) {
            return message;
        }
    }
    panic!("missing JSON-RPC response id {id}");
}

async fn read_turn_notification(
    lines: &mut Lines<BufReader<DuplexStream>>,
    method: &str,
    turn_id: &str,
) -> Value {
    for _ in 0..96 {
        let message = next_message(lines).await;
        if message.get("method") == Some(&json!(method))
            && message.pointer("/params/turn/id") == Some(&json!(turn_id))
        {
            return message;
        }
    }
    panic!("missing {method} for turn {turn_id}");
}

async fn next_message(lines: &mut Lines<BufReader<DuplexStream>>) -> Value {
    let line = timeout(Duration::from_secs(3), lines.next_line())
        .await
        .expect("timed out waiting for JSON-RPC output")
        .expect("read JSON-RPC output")
        .expect("JSONL output closed");
    serde_json::from_str(&line)
        .unwrap_or_else(|error| panic!("invalid JSON-RPC output {line:?}: {error}"))
}

fn assert_response_ok(response: &Value, context: &str) {
    assert!(
        response.get("error").is_none(),
        "{context} failed: {response:#?}"
    );
}

fn required_string(message: &Value, pointer: &str, context: &str) -> String {
    message
        .pointer(pointer)
        .and_then(Value::as_str)
        .unwrap_or_else(|| panic!("{context} missing from {message:#?}"))
        .to_string()
}
