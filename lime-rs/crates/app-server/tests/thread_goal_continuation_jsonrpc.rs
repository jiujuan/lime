use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use app_server::{
    run_json_lines, ActionRespondRequest, AppServer, CancelExecutionRequest, EventLogWriter,
    ExecutionBackend, ExecutionRequest, ProjectionStore, RuntimeCore, RuntimeCoreError,
    RuntimeEvent, RuntimeEventSink,
};
use app_server_protocol::protocol::v2::{
    METHOD_THREAD_GOAL_SET, METHOD_TURN_COMPLETED, METHOD_TURN_STARTED,
};
use app_server_protocol::{
    METHOD_INITIALIZE, METHOD_INITIALIZED, METHOD_THREAD_READ, METHOD_THREAD_RESUME,
    METHOD_THREAD_START, METHOD_TURN_START,
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
    user_started: Notify,
    release_user: Notify,
    continuation_started: Notify,
    release_continuation: Notify,
}

impl SequencedGoalBackend {
    fn new() -> Self {
        Self {
            calls: AtomicUsize::new(0),
            captured: Mutex::new(Vec::new()),
            user_started: Notify::new(),
            release_user: Notify::new(),
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
            0 => {
                self.user_started.notify_one();
                self.release_user.notified().await;
                sink.emit(RuntimeEvent::new("turn.completed", json!({})))
            }
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
        self.release_user.notify_one();
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

#[derive(Default)]
struct ResumedGoalBackend {
    captured: Mutex<Vec<CapturedTurn>>,
    started: Notify,
    release: Notify,
}

#[async_trait]
impl ExecutionBackend for ResumedGoalBackend {
    async fn start_turn(
        &self,
        request: ExecutionRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        self.captured
            .lock()
            .expect("resumed goal backend capture mutex poisoned")
            .push(CapturedTurn {
                turn_id: request.turn.turn_id.clone(),
                agent_only: request.input.agent_only,
                text: request.input.concat_text(),
            });
        sink.emit(RuntimeEvent::new("turn.started", json!({})))?;
        self.started.notify_one();
        self.release.notified().await;
        sink.emit(RuntimeEvent::new("turn.completed", json!({})))
    }

    async fn cancel_turn(
        &self,
        _request: CancelExecutionRequest,
        _sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        self.release.notify_one();
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

struct DurableHistoryBackend;

#[async_trait]
impl ExecutionBackend for DurableHistoryBackend {
    async fn start_turn(
        &self,
        _request: ExecutionRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        sink.emit(RuntimeEvent::new("turn.started", json!({})))?;
        sink.emit(RuntimeEvent::new(
            "turn.failed",
            json!({ "reason": "cold_resume_fixture_history" }),
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
    let turn_start = read_response(&mut output_lines, 3).await;
    assert_response_ok(&turn_start, "turn/start");
    let first_turn_id = required_string(&turn_start, "/result/turn/id", "turn/start id");
    timeout(Duration::from_secs(3), backend.user_started.notified())
        .await
        .expect("user turn should start before setting the goal");

    write_message(
        &mut input_client,
        json!({
            "jsonrpc": "2.0",
            "id": 4,
            "method": METHOD_THREAD_GOAL_SET,
            "params": {
                "threadId": thread_id,
                "objective": "finish the verified current owner",
                "tokenBudget": 500
            }
        }),
    )
    .await;
    let goal_set = read_response(&mut output_lines, 4).await;
    assert_response_ok(&goal_set, "thread/goal/set during active turn");
    assert_eq!(
        goal_set.pointer("/result/goal/status"),
        Some(&json!("active"))
    );
    backend.release_user.notify_one();

    timeout(
        Duration::from_secs(3),
        backend.continuation_started.notified(),
    )
    .await
    .expect("active goal should start a continuation turn");
    let captured = backend.captured();
    assert_eq!(captured.len(), 2, "one user turn plus one continuation");
    assert_eq!(captured[0].turn_id, first_turn_id);
    let continuation_turn_id = captured[1].turn_id.clone();

    let observed = wait_for_turn_admission_and_continuation(
        &mut output_lines,
        &thread_id,
        &first_turn_id,
        &continuation_turn_id,
    )
    .await;
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

#[tokio::test]
async fn cold_resume_starts_goal_continuation_after_public_response() {
    let temp = TempDir::new().expect("cold resume goal continuation temp dir");
    let projection_path = temp.path().join("projection.sqlite");
    let event_log_root = temp.path().join("event-log");
    let initial_runtime = RuntimeCore::with_backend(Arc::new(DurableHistoryBackend))
        .with_projection_store(Arc::new(
            ProjectionStore::initialize(&projection_path)
                .expect("initial cold resume projection store"),
        ))
        .with_event_log_writer(Arc::new(
            EventLogWriter::new(&event_log_root).expect("initial cold resume event log"),
        ));
    let initial_server = AppServer::with_runtime(initial_runtime);
    let (mut initial_input, initial_input_server) = tokio::io::duplex(32 * 1024);
    let (initial_output_server, initial_output) = tokio::io::duplex(32 * 1024);
    let initial_runner = tokio::spawn(run_json_lines(
        initial_server,
        initial_input_server,
        initial_output_server,
    ));
    let mut initial_lines = BufReader::new(initial_output).lines();
    initialize_jsonl(
        &mut initial_input,
        &mut initial_lines,
        1,
        "goal-resume-initial",
    )
    .await;
    write_message(
        &mut initial_input,
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
    let started = read_response(&mut initial_lines, 2).await;
    assert_response_ok(&started, "initial thread/start");
    let thread_id = required_string(&started, "/result/thread/id", "initial thread id");
    write_message(
        &mut initial_input,
        json!({
            "jsonrpc": "2.0",
            "id": 3,
            "method": METHOD_TURN_START,
            "params": {
                "threadId": thread_id,
                "input": [{"type": "text", "text": "persist resume history"}],
                "model": "fixture-model",
                "approvalPolicy": "never",
                "sandboxPolicy": "workspace-write"
            }
        }),
    )
    .await;
    let initial_turn = read_response(&mut initial_lines, 3).await;
    assert_response_ok(&initial_turn, "initial turn/start");
    let initial_turn_id = required_string(&initial_turn, "/result/turn/id", "initial turn id");
    let terminal =
        read_turn_notification(&mut initial_lines, METHOD_TURN_COMPLETED, &initial_turn_id).await;
    assert_eq!(
        terminal.pointer("/params/turn/status"),
        Some(&json!("failed"))
    );
    drop(initial_input);
    timeout(Duration::from_secs(2), initial_runner)
        .await
        .expect("initial JSONL runner should stop")
        .expect("initial JSONL runner task")
        .expect("initial JSONL runner result");

    let connection =
        rusqlite::Connection::open(&projection_path).expect("open cold resume projection database");
    connection
        .execute(
            r#"INSERT INTO thread_goals (
                   thread_id, goal_id, objective, status, token_budget,
                   tokens_used, time_used_seconds, created_at_ms, updated_at_ms
               ) VALUES (?1, 'goal-cold-resume', ?2, 'active', 500, 0, 0, 1, 1)"#,
            rusqlite::params![thread_id, "continue after reconnect"],
        )
        .expect("seed durable active goal before cold resume");
    drop(connection);

    let backend = Arc::new(ResumedGoalBackend::default());
    let restarted_runtime = RuntimeCore::with_backend(backend.clone())
        .with_projection_store(Arc::new(
            ProjectionStore::initialize(&projection_path)
                .expect("restarted cold resume projection store"),
        ))
        .with_event_log_writer(Arc::new(
            EventLogWriter::new(&event_log_root).expect("restarted cold resume event log"),
        ));
    let restarted_server = AppServer::with_runtime(restarted_runtime);
    let (mut input_client, input_server) = tokio::io::duplex(32 * 1024);
    let (output_server, output_client) = tokio::io::duplex(32 * 1024);
    let runner = tokio::spawn(run_json_lines(
        restarted_server,
        input_server,
        output_server,
    ));
    let mut output_lines = BufReader::new(output_client).lines();
    initialize_jsonl(
        &mut input_client,
        &mut output_lines,
        10,
        "goal-resume-restarted",
    )
    .await;

    write_message(
        &mut input_client,
        json!({
            "jsonrpc": "2.0",
            "id": 11,
            "method": METHOD_THREAD_RESUME,
            "params": { "threadId": thread_id }
        }),
    )
    .await;
    let mut resume_response_seen = false;
    let continuation_turn_id = loop {
        let message = next_message(&mut output_lines).await;
        if message.get("id") == Some(&json!(11)) {
            assert_response_ok(&message, "thread/resume");
            assert_eq!(
                message.pointer("/result/thread/id"),
                Some(&json!(thread_id))
            );
            resume_response_seen = true;
        }
        if message.get("method") == Some(&json!(METHOD_TURN_STARTED)) {
            assert!(
                resume_response_seen,
                "continuation notification must remain behind the resume response"
            );
            break required_string(&message, "/params/turn/id", "resumed continuation turn id");
        }
    };
    timeout(Duration::from_secs(3), backend.started.notified())
        .await
        .expect("cold-resumed goal continuation should reach the backend");
    let captured = backend
        .captured
        .lock()
        .expect("resumed goal capture mutex poisoned")
        .clone();
    assert_eq!(captured.len(), 1);
    assert_eq!(captured[0].turn_id, continuation_turn_id);
    assert!(captured[0].agent_only);
    assert!(captured[0].text.contains("continue after reconnect"));

    write_message(
        &mut input_client,
        json!({
            "jsonrpc": "2.0",
            "id": 12,
            "method": METHOD_THREAD_GOAL_SET,
            "params": { "threadId": thread_id, "status": "paused" }
        }),
    )
    .await;
    assert_response_ok(
        &read_response(&mut output_lines, 12).await,
        "pause cold-resumed goal",
    );
    backend.release.notify_one();
    read_turn_notification(
        &mut output_lines,
        METHOD_TURN_COMPLETED,
        &continuation_turn_id,
    )
    .await;

    drop(input_client);
    timeout(Duration::from_secs(2), runner)
        .await
        .expect("restarted JSONL runner should stop")
        .expect("restarted JSONL runner task")
        .expect("restarted JSONL runner result");
}

struct ObservedContinuation {
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
        first_turn_completed: false,
        continuation_started: false,
    };
    for _ in 0..96 {
        let message = next_message(lines).await;
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
        if observed.first_turn_completed && observed.continuation_started {
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

async fn initialize_jsonl(
    input: &mut DuplexStream,
    output: &mut Lines<BufReader<DuplexStream>>,
    id: u64,
    name: &str,
) {
    write_message(
        input,
        json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": METHOD_INITIALIZE,
            "params": { "clientInfo": { "name": name, "version": "1.0.0" } }
        }),
    )
    .await;
    assert_response_ok(&read_response(output, id).await, "initialize");
    write_message(
        input,
        json!({ "jsonrpc": "2.0", "method": METHOD_INITIALIZED, "params": {} }),
    )
    .await;
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
