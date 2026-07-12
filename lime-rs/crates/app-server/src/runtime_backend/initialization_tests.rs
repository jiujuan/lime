use super::*;
use crate::execution_process::ExecutionProcessServer;
use crate::runtime::RuntimeHostContext;
use app_server_protocol::{
    AgentInput, AgentSession, AgentSessionActionType, AgentSessionApprovalDecision,
    AgentSessionStatus, AgentTurn, AgentTurnStatus, RuntimeOptions,
};
use lime_core::database::schema::create_tables;
use rusqlite::Connection;
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};
use tempfile::TempDir;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::mpsc;
use tokio::task::JoinHandle;
use tokio::time::{timeout, Duration};

#[derive(Default)]
struct TestRuntimeEventSink {
    events: Vec<RuntimeEvent>,
}

impl RuntimeEventSink for TestRuntimeEventSink {
    fn emit(&mut self, event: RuntimeEvent) -> Result<(), RuntimeCoreError> {
        self.events.push(event);
        Ok(())
    }
}

struct BridgeRuntimeEventSink {
    events: Arc<Mutex<Vec<RuntimeEvent>>>,
    approval_tx: mpsc::UnboundedSender<String>,
}

impl RuntimeEventSink for BridgeRuntimeEventSink {
    fn emit(&mut self, event: RuntimeEvent) -> Result<(), RuntimeCoreError> {
        if event.event_type == "action.required" {
            if let Some(request_id) = event
                .payload
                .get("request_id")
                .or_else(|| event.payload.get("requestId"))
                .and_then(Value::as_str)
            {
                let _ = self.approval_tx.send(request_id.to_string());
            }
        }
        self.events
            .lock()
            .expect("record runtime event")
            .push(event);
        Ok(())
    }
}

struct OpenAiEnvSnapshot {
    values: Vec<(&'static str, Option<String>)>,
}

impl OpenAiEnvSnapshot {
    fn capture() -> Self {
        Self {
            values: [
                "OPENAI_API_KEY",
                "OPENAI_HOST",
                "OPENAI_BASE_PATH",
                "OPENAI_FORCE_RESPONSES_API",
                "OPENAI_CUSTOM_HEADERS",
                "LIME_AGENT_RUNTIME_ROOT",
            ]
            .into_iter()
            .map(|key| (key, std::env::var(key).ok()))
            .collect(),
        }
    }

    fn capture_and_clear() -> Self {
        let snapshot = Self::capture();
        for (key, _) in &snapshot.values {
            std::env::remove_var(key);
        }
        snapshot
    }
}

impl Drop for OpenAiEnvSnapshot {
    fn drop(&mut self) {
        for (key, value) in &self.values {
            match value {
                Some(value) => std::env::set_var(key, value),
                None => std::env::remove_var(key),
            }
        }
    }
}

struct LocalOpenAiFixture {
    base_url: String,
    requests: Arc<Mutex<Vec<Value>>>,
    server_task: JoinHandle<()>,
}

impl LocalOpenAiFixture {
    async fn start() -> Self {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind local OpenAI fixture");
        let addr = listener.local_addr().expect("fixture local addr");
        let requests = Arc::new(Mutex::new(Vec::new()));
        let server_requests = requests.clone();
        let server_task = tokio::spawn(async move {
            loop {
                let Ok((stream, _)) = listener.accept().await else {
                    break;
                };
                let requests = server_requests.clone();
                tokio::spawn(async move {
                    let _ = handle_openai_fixture_connection(stream, requests).await;
                });
            }
        });

        Self {
            base_url: format!("http://{addr}/v1"),
            requests,
            server_task,
        }
    }
}

impl Drop for LocalOpenAiFixture {
    fn drop(&mut self) {
        self.server_task.abort();
    }
}

fn test_db() -> DbConnection {
    let conn = Connection::open_in_memory().expect("open in-memory db");
    create_tables(&conn).expect("create schema");
    Arc::new(Mutex::new(conn))
}

#[tokio::test]
async fn main_turn_initializes_agent_before_live_execution_hook() {
    let db = test_db();
    let db = provider_config::initialize_runtime_database(Some(&db)).expect("runtime database");
    let backend = RuntimeBackend::with_db_and_execution_process_server(
        db.clone(),
        ExecutionProcessServer::default(),
    );

    assert!(!backend.agent_state.is_initialized().await);

    backend
        .ensure_agent_initialized(&db)
        .await
        .expect("main turn should initialize agent before hook installation");
    backend
        .install_live_execution_process_hook_if_available()
        .await
        .expect("live execution hook should install after agent initialization");

    assert!(backend.agent_state.is_initialized().await);
}

#[tokio::test]
async fn respond_action_initializes_agent_before_runtime_resume() {
    let db = test_db();
    let db = provider_config::initialize_runtime_database(Some(&db)).expect("runtime database");
    let backend = RuntimeBackend::with_db(db.clone());
    let mut sink = TestRuntimeEventSink::default();

    assert!(!backend.agent_state.is_initialized().await);

    ExecutionBackend::respond_action(
        &backend,
        ActionRespondRequest {
            host: RuntimeHostContext::default(),
            session: AgentSession {
                session_id: "session-respond-init".to_string(),
                thread_id: "thread-respond-init".to_string(),
                app_id: "agent".to_string(),
                workspace_id: None,
                business_object_ref: None,
                status: AgentSessionStatus::Running,
                created_at: chrono::Utc::now().to_rfc3339(),
                updated_at: chrono::Utc::now().to_rfc3339(),
            },
            turn: None,
            request_id: "ask-respond-init".to_string(),
            action_type: AgentSessionActionType::AskUser,
            decision: None,
            confirmed: false,
            response: None,
            user_data: None,
            metadata: None,
            event_name: None,
            action_scope: None,
        },
        &mut sink,
    )
    .await
    .expect("respond_action should initialize agent and emit resolved fact");

    assert!(backend.agent_state.is_initialized().await);
}

#[tokio::test]
async fn respond_action_tool_confirmation_resumes_pending_agent_tool_future() {
    let _env_snapshot = OpenAiEnvSnapshot::capture_and_clear();
    let workspace = TempDir::new().expect("workspace");
    std::env::set_var("LIME_AGENT_RUNTIME_ROOT", workspace.path().join("agent"));
    let provider = LocalOpenAiFixture::start().await;
    let db = test_db();
    let db = provider_config::initialize_runtime_database(Some(&db)).expect("runtime database");
    let backend = Arc::new(RuntimeBackend::with_db_and_execution_process_server(
        db,
        ExecutionProcessServer::default(),
    ));
    let run_id = uuid::Uuid::new_v4().simple().to_string();
    let request = execution_request_for_tool_confirmation_bridge_test(
        &provider.base_url,
        workspace.path().to_string_lossy().as_ref(),
        &run_id,
    );
    let action_session = request.session.clone();
    let (approval_tx, mut approval_rx) = mpsc::unbounded_channel::<String>();
    let stream_events = Arc::new(Mutex::new(Vec::new()));
    let stream_backend = backend.clone();
    let stream_events_for_sink = stream_events.clone();
    let mut stream_task = tokio::spawn(async move {
        let mut sink = BridgeRuntimeEventSink {
            events: stream_events_for_sink,
            approval_tx,
        };
        ExecutionBackend::start_turn(&*stream_backend, request, &mut sink).await
    });

    let request_id = tokio::select! {
        request_id = approval_rx.recv() => match request_id {
            Some(request_id) => request_id,
            None => {
                let detail = if stream_task.is_finished() {
                    match stream_task.await.expect("runtime task should join") {
                        Ok(()) => "runtime turn finished successfully".to_string(),
                        Err(error) => format!("runtime turn failed: {error:?}"),
                    }
                } else {
                    "approval channel closed before runtime turn finished".to_string()
                };
                panic!(
                    "tool confirmation request channel closed before request id; detail={detail}; events={:?}; provider_requests={:?}",
                    stream_events.lock().expect("read stream events"),
                    provider.requests.lock().expect("read provider requests")
                );
            }
        },
        result = &mut stream_task => {
            panic!(
                "runtime turn finished before tool confirmation; result={:?}; events={:?}",
                result,
                stream_events.lock().expect("read stream events")
            );
        }
        _ = tokio::time::sleep(Duration::from_secs(10)) => {
            stream_task.abort();
            panic!(
                "timed out waiting for tool confirmation; events={:?}; provider_requests={:?}",
                stream_events.lock().expect("read stream events"),
                provider.requests.lock().expect("read provider requests")
            );
        }
    };
    assert!(!request_id.trim().is_empty());

    let mut action_sink = TestRuntimeEventSink::default();
    ExecutionBackend::respond_action(
        &*backend,
        ActionRespondRequest {
            host: RuntimeHostContext::default(),
            session: action_session,
            turn: None,
            request_id: request_id.clone(),
            action_type: AgentSessionActionType::ToolConfirmation,
            decision: Some(AgentSessionApprovalDecision::AllowOnce),
            confirmed: true,
            response: None,
            user_data: None,
            metadata: None,
            event_name: None,
            action_scope: None,
        },
        &mut action_sink,
    )
    .await
    .expect("respond_action should release pending tool confirmation");

    timeout(Duration::from_secs(20), stream_task)
        .await
        .expect("runtime turn should finish after confirmation")
        .expect("runtime task should join")
        .expect("runtime turn should succeed");

    assert_eq!(action_sink.events.len(), 1);
    assert_eq!(action_sink.events[0].event_type, "action.resolved");
    assert_eq!(
        action_sink.events[0].payload["requestId"].as_str(),
        Some(request_id.as_str())
    );

    let events = stream_events.lock().expect("read stream events");
    assert!(events.iter().any(|event| {
        event.event_type == "tool.result"
            && event.payload["toolCallId"].as_str() == Some("req-runtime-confirm")
            && event.payload["result"]["success"].as_bool() == Some(true)
            && event.payload["result"]["output"]
                .as_str()
                .is_some_and(|output| output.contains("runtime-confirmed"))
    }));
    assert!(events.iter().any(|event| {
        event.event_type == "message.delta"
            && event.payload["text"]
                .as_str()
                .is_some_and(|text| text.contains("provider observed resumed tool"))
    }));
    assert!(events
        .iter()
        .any(|event| event.event_type == "turn.completed"));
    assert!(provider
        .requests
        .lock()
        .expect("read provider requests")
        .iter()
        .any(request_contains_tool_response));
}

fn execution_request_for_tool_confirmation_bridge_test(
    base_url: &str,
    workspace: &str,
    run_id: &str,
) -> ExecutionRequest {
    let session_id = format!("session-bridge-tool-confirm-{run_id}");
    let thread_id = format!("thread-bridge-tool-confirm-{run_id}");
    let turn_id = format!("turn-bridge-tool-confirm-{run_id}");
    ExecutionRequest {
        host: RuntimeHostContext::default(),
        session: AgentSession {
            session_id: session_id.clone(),
            thread_id: thread_id.clone(),
            app_id: "agent".to_string(),
            workspace_id: None,
            business_object_ref: None,
            status: AgentSessionStatus::Running,
            created_at: chrono::Utc::now().to_rfc3339(),
            updated_at: chrono::Utc::now().to_rfc3339(),
        },
        turn: AgentTurn {
            turn_id,
            session_id,
            thread_id,
            status: AgentTurnStatus::Accepted,
            started_at: None,
            completed_at: None,
        },
        input: AgentInput {
            text: "run the runtime confirmation command".to_string(),
            attachments: Vec::new(),
        },
        runtime_options: Some(RuntimeOptions {
            stream: true,
            runtime_request: Some(app_server_protocol::RuntimeRequest {
                approval_policy: Some("on-request".to_string()),
                sandbox_policy: Some("workspace-write".to_string()),
                metadata: Some(json!({
                    "harness": {
                        "projectRoot": workspace,
                        "cwd": workspace
                    }
                })),
                provider_config: Some(app_server_protocol::RuntimeProviderConfig {
                    provider_id: Some("fixture-openai".to_string()),
                    provider_name: Some("openai".to_string()),
                    model_name: Some("fixture-model".to_string()),
                    api_key: Some("fixture-key".to_string()),
                    base_url: Some(base_url.to_string()),
                    model_capabilities: Some(json!({
                        "capabilities": {
                            "tools": true,
                            "streaming": true,
                            "jsonMode": true,
                            "functionCalling": true
                        },
                        "taskFamilies": ["chat"],
                        "inputModalities": ["text"],
                        "outputModalities": ["text"],
                        "runtimeFeatures": ["streaming", "tool_calling"]
                    })),
                    ..app_server_protocol::RuntimeProviderConfig::default()
                }),
                ..app_server_protocol::RuntimeRequest::default()
            }),
            ..RuntimeOptions::default()
        }),
        event_name: None,
        expected_output: None,
        structured_output: None,
        output_schema: None,
        queued_turn_id: None,
        queue_if_busy: false,
        skip_pre_submit_resume: false,
    }
}

async fn handle_openai_fixture_connection(
    mut stream: TcpStream,
    requests: Arc<Mutex<Vec<Value>>>,
) -> std::io::Result<()> {
    let body = read_http_json_body(&mut stream).await?;
    requests
        .lock()
        .expect("record provider request")
        .push(body.clone());
    let response_body = if body.get("stream").and_then(Value::as_bool) == Some(true) {
        streaming_response_for_request(&body)
    } else {
        json_response_for_request(&body)
    };
    let content_type = if body.get("stream").and_then(Value::as_bool) == Some(true) {
        "text/event-stream"
    } else {
        "application/json"
    };
    let response = format!(
        "HTTP/1.1 200 OK\r\ncontent-type: {content_type}\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{response_body}",
        response_body.len()
    );
    stream.write_all(response.as_bytes()).await
}

async fn read_http_json_body(stream: &mut TcpStream) -> std::io::Result<Value> {
    let mut buffer = Vec::new();
    let header_end = loop {
        let mut chunk = [0_u8; 1024];
        let read = stream.read(&mut chunk).await?;
        if read == 0 {
            return Ok(json!({}));
        }
        buffer.extend_from_slice(&chunk[..read]);
        if let Some(header_end) = find_header_end(&buffer) {
            break header_end;
        }
    };
    let headers = String::from_utf8_lossy(&buffer[..header_end]);
    let content_length = headers
        .lines()
        .find_map(|line| {
            let (name, value) = line.split_once(':')?;
            name.eq_ignore_ascii_case("content-length")
                .then(|| value.trim().parse::<usize>().ok())
                .flatten()
        })
        .unwrap_or(0);
    let body_start = header_end + 4;
    while buffer.len().saturating_sub(body_start) < content_length {
        let mut chunk = vec![0_u8; content_length - (buffer.len() - body_start)];
        let read = stream.read(&mut chunk).await?;
        if read == 0 {
            break;
        }
        buffer.extend_from_slice(&chunk[..read]);
    }
    serde_json::from_slice(&buffer[body_start..body_start + content_length])
        .map_err(std::io::Error::other)
}

fn find_header_end(buffer: &[u8]) -> Option<usize> {
    buffer.windows(4).position(|window| window == b"\r\n\r\n")
}

fn streaming_response_for_request(body: &Value) -> String {
    if request_contains_tool_response(body) {
        return sse(&[
            json!({
                "id": "chatcmpl-final",
                "object": "chat.completion.chunk",
                "created": 0,
                "model": "fixture-model",
                "choices": [{
                    "index": 0,
                    "delta": {
                        "role": "assistant",
                        "content": "provider observed resumed tool"
                    },
                    "finish_reason": "stop"
                }],
                "usage": {
                    "prompt_tokens": 10,
                    "completion_tokens": 4,
                    "total_tokens": 14
                }
            })
            .to_string(),
            "[DONE]".to_string(),
        ]);
    }

    sse(&[
        json!({
            "id": "chatcmpl-tool",
            "object": "chat.completion.chunk",
            "created": 0,
            "model": "fixture-model",
            "choices": [{
                "index": 0,
                "delta": {
                    "role": "assistant",
                    "tool_calls": [{
                        "index": 0,
                        "id": "req-runtime-confirm",
                        "type": "function",
                        "function": {
                            "name": "Bash",
                            "arguments": ""
                        }
                    }]
                },
                "finish_reason": null
            }]
        })
        .to_string(),
        json!({
            "id": "chatcmpl-tool",
            "object": "chat.completion.chunk",
            "created": 0,
            "model": "fixture-model",
            "choices": [{
                "index": 0,
                "delta": {
                    "tool_calls": [{
                        "index": 0,
                        "function": {
                            "arguments": "{\"command\":\"printf runtime-confirmed\"}"
                        }
                    }]
                },
                "finish_reason": null
            }]
        })
        .to_string(),
        json!({
            "id": "chatcmpl-tool",
            "object": "chat.completion.chunk",
            "created": 0,
            "model": "fixture-model",
            "choices": [{
                "index": 0,
                "delta": {},
                "finish_reason": "tool_calls"
            }],
            "usage": null
        })
        .to_string(),
        json!({
            "id": "chatcmpl-tool",
            "object": "chat.completion.chunk",
            "created": 0,
            "model": "fixture-model",
            "choices": [],
            "usage": {
                "prompt_tokens": 10,
                "completion_tokens": 4,
                "total_tokens": 14
            }
        })
        .to_string(),
        "[DONE]".to_string(),
    ])
}

fn json_response_for_request(_body: &Value) -> String {
    json!({
        "id": "chatcmpl-title",
        "object": "chat.completion",
        "created": 0,
        "model": "fixture-model",
        "choices": [{
            "index": 0,
            "message": {
                "role": "assistant",
                "content": "approval resume"
            },
            "finish_reason": "stop"
        }],
        "usage": {
            "prompt_tokens": 1,
            "completion_tokens": 1,
            "total_tokens": 2
        }
    })
    .to_string()
}

fn sse(lines: &[String]) -> String {
    lines
        .iter()
        .map(|line| format!("data: {line}\n\n"))
        .collect::<String>()
}

fn request_contains_tool_response(body: &Value) -> bool {
    body.get("messages")
        .and_then(Value::as_array)
        .is_some_and(|messages| {
            messages.iter().any(|message| {
                message.get("role").and_then(Value::as_str) == Some("tool")
                    || message
                        .get("tool_call_id")
                        .and_then(Value::as_str)
                        .is_some_and(|id| id == "req-runtime-confirm")
            })
        })
}
