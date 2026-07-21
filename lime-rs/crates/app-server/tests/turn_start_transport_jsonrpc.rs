use std::sync::Arc;
use std::time::Duration;

use app_server::{
    run_json_lines, ActionRespondRequest, AppServer, AppServerRuntimeFactory,
    CancelExecutionRequest, ExecutionBackend, ExecutionRequest, ExternalBackendConfig,
    ProjectionStore, RuntimeCore, RuntimeCoreError, RuntimeEvent, RuntimeEventSink,
};
use app_server_protocol::protocol::v2::{
    METHOD_AGENT_MESSAGE_DELTA, METHOD_ITEM_COMPLETED, METHOD_ITEM_STARTED, METHOD_TURN_COMPLETED,
};
use app_server_protocol::{
    METHOD_INITIALIZE, METHOD_INITIALIZED, METHOD_THREAD_START, METHOD_TURN_START,
};
use async_trait::async_trait;
use serde_json::{json, Value};
use tempfile::TempDir;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader, DuplexStream, Lines};
use tokio::sync::Notify;
use tokio::time::timeout;

struct BlockingTurnBackend {
    started: Arc<Notify>,
    release: Arc<Notify>,
}

#[async_trait]
impl ExecutionBackend for BlockingTurnBackend {
    async fn start_turn(
        &self,
        _request: ExecutionRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
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
async fn turn_start_transport_responds_before_backend_completion() {
    let temp = TempDir::new().expect("transport fixture temp dir");
    let started = Arc::new(Notify::new());
    let release = Arc::new(Notify::new());
    let runtime = RuntimeCore::with_backend(Arc::new(BlockingTurnBackend {
        started: Arc::clone(&started),
        release: Arc::clone(&release),
    }))
    .with_projection_store(Arc::new(
        ProjectionStore::initialize(temp.path().join("projection.sqlite"))
            .expect("projection store"),
    ));
    let server = AppServer::with_runtime(runtime);

    let (mut input_client, input_server) = tokio::io::duplex(16 * 1024);
    let (output_server, output_client) = tokio::io::duplex(16 * 1024);
    let runner = tokio::spawn(run_json_lines(server, input_server, output_server));
    let mut output_lines = BufReader::new(output_client).lines();

    write_request(
        &mut input_client,
        json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": METHOD_INITIALIZE,
            "params": {
                "clientInfo": {
                    "name": "turn-start-transport-jsonrpc-test",
                    "version": "1.0.0"
                }
            }
        }),
    )
    .await;
    let initialize = read_response(&mut output_lines, 1).await;
    assert!(initialize.get("error").is_none(), "{initialize:#?}");

    write_request(
        &mut input_client,
        json!({
            "jsonrpc": "2.0",
            "method": METHOD_INITIALIZED,
            "params": {}
        }),
    )
    .await;
    write_request(
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
    let thread_id = thread_start
        .pointer("/result/thread/id")
        .and_then(Value::as_str)
        .expect("thread/start canonical thread id")
        .to_string();

    write_request(
        &mut input_client,
        json!({
            "jsonrpc": "2.0",
            "id": 3,
            "method": METHOD_TURN_START,
            "params": {
                "threadId": thread_id,
                "input": [{"type": "text", "text": "hold backend completion"}],
                "model": "fixture-model",
                "approvalPolicy": "never",
                "sandboxPolicy": "workspace-write"
            }
        }),
    )
    .await;

    timeout(Duration::from_secs(2), started.notified())
        .await
        .expect("backend should start after actor admission");
    let turn_start = timeout(
        Duration::from_millis(500),
        read_response(&mut output_lines, 3),
    )
    .await
    .expect("turn/start response must not wait for backend completion");
    assert!(turn_start.get("error").is_none(), "{turn_start:#?}");
    assert_eq!(
        turn_start.pointer("/result/turn/status"),
        Some(&json!("inProgress"))
    );
    let turn_id = turn_start
        .pointer("/result/turn/id")
        .and_then(Value::as_str)
        .expect("turn/start canonical turn id")
        .to_string();

    release.notify_one();
    let completed = read_notification(&mut output_lines, METHOD_TURN_COMPLETED).await;
    assert_eq!(
        completed.pointer("/params/threadId"),
        Some(&json!(thread_id))
    );
    assert_eq!(completed.pointer("/params/turn/id"), Some(&json!(turn_id)));
    assert_eq!(
        completed.pointer("/params/turn/status"),
        Some(&json!("completed"))
    );

    drop(input_client);
    timeout(Duration::from_secs(2), runner)
        .await
        .expect("JSON lines runner should stop after input closes")
        .expect("JSON lines runner task")
        .expect("JSON lines runner result");
}

#[tokio::test]
async fn external_backend_transport_canonicalizes_delta_after_immediate_admission() {
    let Some(node) = node_binary() else {
        return;
    };
    let temp = TempDir::new().expect("external transport fixture temp dir");
    let script_path = temp.path().join("external-backend-v2-notifications.mjs");
    let started_path = temp.path().join("backend-started");
    let release_path = temp.path().join("release-backend");
    std::fs::write(
        &script_path,
        r#"
          import { access, writeFile } from 'node:fs/promises';
          import { setTimeout as delay } from 'node:timers/promises';

          const startedPath = process.argv[2];
          const releasePath = process.argv[3];
          for await (const _chunk of process.stdin) {}
          await writeFile(startedPath, 'started');
          for (;;) {
            try {
              await access(releasePath);
              break;
            } catch {
              await delay(10);
            }
          }

          const emit = (type, payload) => {
            console.log(JSON.stringify({ type, payload }));
          };
          emit('message.delta', {
            itemId: 'assistant-1',
            role: 'assistant',
            text: 'external hello'
          });
          emit('item.started', {
            item: {
              id: 'command-1',
              type: 'command_execution',
              command: 'printf external',
              status: 'in_progress'
            }
          });
          emit('item.completed', {
            item: {
              id: 'command-1',
              type: 'command_execution',
              command: 'printf external',
              output: 'external',
              exitCode: 0,
              status: 'completed'
            }
          });
          emit('turn.completed', { status: 'completed' });
        "#,
    )
    .expect("write external backend fixture");

    let runtime = AppServerRuntimeFactory::external_runtime_core(
        ExternalBackendConfig::new(node)
            .with_args([
                script_path.to_string_lossy().to_string(),
                started_path.to_string_lossy().to_string(),
                release_path.to_string_lossy().to_string(),
            ])
            .with_timeout_ms(10_000),
    )
    .with_projection_store(Arc::new(
        ProjectionStore::initialize(temp.path().join("external-projection.sqlite"))
            .expect("external projection store"),
    ));
    let server = AppServer::with_runtime(runtime);

    let (mut input_client, input_server) = tokio::io::duplex(16 * 1024);
    let (output_server, output_client) = tokio::io::duplex(16 * 1024);
    let runner = tokio::spawn(run_json_lines(server, input_server, output_server));
    let mut output_lines = BufReader::new(output_client).lines();

    write_request(
        &mut input_client,
        json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": METHOD_INITIALIZE,
            "params": {
                "clientInfo": {
                    "name": "external-turn-transport-jsonrpc-test",
                    "version": "1.0.0"
                }
            }
        }),
    )
    .await;
    let initialize = read_response(&mut output_lines, 1).await;
    assert!(initialize.get("error").is_none(), "{initialize:#?}");

    write_request(
        &mut input_client,
        json!({
            "jsonrpc": "2.0",
            "method": METHOD_INITIALIZED,
            "params": {}
        }),
    )
    .await;
    write_request(
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
    let thread_id = thread_start
        .pointer("/result/thread/id")
        .and_then(Value::as_str)
        .expect("thread/start canonical thread id")
        .to_string();

    write_request(
        &mut input_client,
        json!({
            "jsonrpc": "2.0",
            "id": 3,
            "method": METHOD_TURN_START,
            "params": {
                "threadId": thread_id,
                "input": [{"type": "text", "text": "stream external backend"}],
                "model": "fixture-model",
                "approvalPolicy": "never",
                "sandboxPolicy": "workspace-write"
            }
        }),
    )
    .await;

    wait_for_path(&started_path).await;
    let turn_start = timeout(
        Duration::from_millis(500),
        read_response(&mut output_lines, 3),
    )
    .await
    .expect("turn/start response must not wait for external backend output");
    assert!(turn_start.get("error").is_none(), "{turn_start:#?}");
    assert_eq!(
        turn_start.pointer("/result/turn/status"),
        Some(&json!("inProgress"))
    );
    let turn_id = turn_start
        .pointer("/result/turn/id")
        .and_then(Value::as_str)
        .expect("turn/start canonical turn id")
        .to_string();

    std::fs::write(&release_path, b"release").expect("release external backend");
    let direct = read_direct_turn_notifications(&mut output_lines, &thread_id, &turn_id).await;
    assert_eq!(
        direct
            .iter()
            .filter_map(|value| value.get("method").and_then(Value::as_str))
            .collect::<Vec<_>>(),
        vec![
            METHOD_ITEM_STARTED,
            METHOD_AGENT_MESSAGE_DELTA,
            METHOD_ITEM_STARTED,
            METHOD_ITEM_COMPLETED,
            METHOD_TURN_COMPLETED,
        ]
    );
    assert_eq!(
        direct[0].pointer("/params/item/id"),
        Some(&json!("item_assistant-1"))
    );
    assert_eq!(
        direct[0].pointer("/params/item/type"),
        Some(&json!("agentMessage"))
    );
    assert_eq!(
        direct[1].pointer("/params/itemId"),
        Some(&json!("item_assistant-1"))
    );
    assert_eq!(
        direct[1].pointer("/params/delta"),
        Some(&json!("external hello"))
    );
    assert_eq!(
        direct[2].pointer("/params/item/id"),
        Some(&json!("item_command-1"))
    );
    assert_eq!(
        direct[2].pointer("/params/item/type"),
        Some(&json!("commandExecution"))
    );
    assert_eq!(
        direct[3].pointer("/params/item/id"),
        Some(&json!("item_command-1"))
    );
    assert_eq!(
        direct[3].pointer("/params/item/status"),
        Some(&json!("completed"))
    );
    assert_eq!(direct[4].pointer("/params/turn/id"), Some(&json!(turn_id)));
    assert_eq!(
        direct[4].pointer("/params/turn/status"),
        Some(&json!("completed"))
    );

    drop(input_client);
    timeout(Duration::from_secs(2), runner)
        .await
        .expect("JSON lines runner should stop after input closes")
        .expect("JSON lines runner task")
        .expect("JSON lines runner result");
}

async fn write_request(writer: &mut DuplexStream, value: Value) {
    let mut line = serde_json::to_vec(&value).expect("encode JSON-RPC message");
    line.push(b'\n');
    writer.write_all(&line).await.expect("write JSON-RPC line");
    writer.flush().await.expect("flush JSON-RPC line");
}

async fn read_response(lines: &mut Lines<BufReader<DuplexStream>>, id: u64) -> Value {
    timeout(Duration::from_secs(2), async {
        loop {
            let value = read_message(lines).await;
            if value.get("id") == Some(&json!(id)) {
                return value;
            }
        }
    })
    .await
    .unwrap_or_else(|_| panic!("timed out waiting for JSON-RPC response id={id}"))
}

async fn read_notification(lines: &mut Lines<BufReader<DuplexStream>>, method: &str) -> Value {
    timeout(Duration::from_secs(2), async {
        loop {
            let value = read_message(lines).await;
            if value.get("method") == Some(&json!(method)) {
                return value;
            }
        }
    })
    .await
    .unwrap_or_else(|_| panic!("timed out waiting for JSON-RPC notification {method}"))
}

async fn read_direct_turn_notifications(
    lines: &mut Lines<BufReader<DuplexStream>>,
    thread_id: &str,
    turn_id: &str,
) -> Vec<Value> {
    timeout(Duration::from_secs(2), async {
        let mut direct = Vec::new();
        loop {
            let value = read_message(lines).await;
            let notification_turn_id = value
                .pointer("/params/turnId")
                .or_else(|| value.pointer("/params/turn/id"))
                .and_then(Value::as_str);
            if value.pointer("/params/threadId").and_then(Value::as_str) != Some(thread_id)
                || notification_turn_id != Some(turn_id)
            {
                continue;
            }
            let method = value.get("method").and_then(Value::as_str);
            let item_id = value
                .pointer("/params/item/id")
                .or_else(|| value.pointer("/params/itemId"))
                .and_then(Value::as_str);
            let relevant = match method {
                Some(METHOD_ITEM_STARTED | METHOD_ITEM_COMPLETED) => {
                    matches!(item_id, Some("item_assistant-1" | "item_command-1"))
                }
                Some(METHOD_AGENT_MESSAGE_DELTA) => item_id == Some("item_assistant-1"),
                Some(METHOD_TURN_COMPLETED) => true,
                _ => false,
            };
            if relevant {
                let completed = method == Some(METHOD_TURN_COMPLETED);
                direct.push(value);
                if completed {
                    return direct;
                }
            }
        }
    })
    .await
    .expect("timed out waiting for direct v2 turn notifications")
}

async fn wait_for_path(path: &std::path::Path) {
    timeout(Duration::from_secs(2), async {
        while !path.exists() {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("external backend should start");
}

fn node_binary() -> Option<String> {
    let candidates = std::env::var("NODE")
        .ok()
        .into_iter()
        .chain(["node".to_string()]);
    candidates.into_iter().find(|candidate| {
        std::process::Command::new(candidate)
            .arg("--version")
            .output()
            .is_ok_and(|output| output.status.success())
    })
}

async fn read_message(lines: &mut Lines<BufReader<DuplexStream>>) -> Value {
    let line = lines
        .next_line()
        .await
        .expect("read JSON-RPC line")
        .expect("JSON-RPC output closed");
    serde_json::from_str(&line).expect("decode JSON-RPC message")
}
