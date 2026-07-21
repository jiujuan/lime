use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use app_server::{
    ActionRespondRequest, AppServer, CancelExecutionRequest, ExecutionBackend, ExecutionRequest,
    MockBackend, ProjectionStore, RuntimeCore, RuntimeCoreError, RuntimeEvent, RuntimeEventSink,
};
use app_server_protocol::protocol::v2::{
    METHOD_THREAD_ARCHIVE, METHOD_THREAD_GOAL_CLEAR, METHOD_THREAD_GOAL_CLEARED,
    METHOD_THREAD_GOAL_GET, METHOD_THREAD_GOAL_SET, METHOD_THREAD_GOAL_UPDATED, METHOD_THREAD_LIST,
    METHOD_THREAD_UNARCHIVE,
};
use app_server_protocol::{
    error_codes, METHOD_INITIALIZE, METHOD_INITIALIZED, METHOD_THREAD_READ, METHOD_THREAD_RESUME,
    METHOD_THREAD_START, METHOD_THREAD_TURNS_LIST, METHOD_TURN_START, PROTOCOL_VERSION,
};
use async_trait::async_trait;
use serde_json::{json, Value};
use tempfile::TempDir;
use tokio::sync::Notify;
use tokio::time::{sleep, timeout};

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
async fn thread_start_returns_the_v2_thread_envelope() {
    let (_temp, server) = test_server();
    initialize_server(&server).await;

    let lines = request_lines(
        &server,
        2,
        METHOD_THREAD_START,
        json!({
            "model": "gpt-5.4",
            "modelProvider": "openai",
            "cwd": "/tmp/lime-thread-v2",
            "historyMode": "paginated"
        }),
    )
    .await;
    let response = lines
        .iter()
        .find(|value| value.get("id") == Some(&json!(2)))
        .expect("thread/start response");
    let started = lines
        .iter()
        .find(|value| value.get("method") == Some(&json!("thread/started")))
        .unwrap_or_else(|| panic!("thread/started notification: {lines:#?}"));
    assert_eq!(
        started.pointer("/params/thread/id"),
        response.pointer("/result/thread/id")
    );

    let thread_id = response
        .pointer("/result/thread/id")
        .and_then(Value::as_str)
        .expect("thread/start must return a canonical thread id");
    assert!(!thread_id.is_empty());
    assert_eq!(response.pointer("/result/model"), Some(&json!("gpt-5.4")));
    assert_eq!(
        response.pointer("/result/modelProvider"),
        Some(&json!("openai"))
    );
    assert_eq!(
        response.pointer("/result/thread/historyMode"),
        Some(&json!("paginated"))
    );
    assert_eq!(
        response.pointer("/result/thread/cwd"),
        Some(&json!("/tmp/lime-thread-v2"))
    );
    assert!(response.pointer("/result/session").is_none());

    let read = request(
        &server,
        3,
        METHOD_THREAD_READ,
        json!({"threadId": thread_id, "includeTurns": false}),
    )
    .await;
    assert_eq!(read.pointer("/result/thread/id"), Some(&json!(thread_id)));
    assert_eq!(
        read.pointer("/result/thread/extra/providerName"),
        Some(&json!("openai"))
    );
    assert_eq!(
        read.pointer("/result/thread/extra/modelName"),
        Some(&json!("gpt-5.4"))
    );
    assert_eq!(
        read.pointer("/result/thread/extra/workingDir"),
        Some(&json!("/tmp/lime-thread-v2"))
    );
    assert_eq!(
        read.pointer("/result/thread/extra/historyMode"),
        Some(&json!("paginated"))
    );
}

#[tokio::test]
async fn thread_start_requires_an_explicit_model_and_provider() {
    let (_temp, server) = test_server();
    initialize_server(&server).await;

    for (id, params) in [
        (2, json!({"modelProvider": "openai"})),
        (3, json!({"model": "gpt-5.4"})),
        (4, json!({"model": " ", "modelProvider": "openai"})),
    ] {
        let response = request_raw(&server, id, METHOD_THREAD_START, params).await;
        assert_eq!(
            response.pointer("/error/code"),
            Some(&json!(error_codes::INVALID_PARAMS))
        );
        assert!(response.get("result").is_none());
    }
}

#[tokio::test]
async fn thread_goal_lifecycle_is_durable_and_emits_ordered_notifications() {
    let temp = TempDir::new().expect("thread goal temp dir");
    let projection_path = temp.path().join("projection.sqlite");
    let server = AppServer::with_runtime(RuntimeCore::default().with_projection_store(Arc::new(
        ProjectionStore::initialize(&projection_path).expect("thread goal projection store"),
    )));
    initialize_server(&server).await;

    let started = request(
        &server,
        2,
        METHOD_THREAD_START,
        json!({
            "model": "fixture-model",
            "modelProvider": "fixture-provider",
            "historyMode": "legacy"
        }),
    )
    .await;
    let thread_id = started
        .pointer("/result/thread/id")
        .and_then(Value::as_str)
        .expect("thread/start id")
        .to_string();

    let set_lines = request_lines(
        &server,
        3,
        METHOD_THREAD_GOAL_SET,
        json!({
            "threadId": thread_id,
            "objective": "finish the durable goal",
            "status": "active",
            "tokenBudget": 1_000
        }),
    )
    .await;
    let set = set_lines
        .iter()
        .find(|value| value.get("id") == Some(&json!(3)))
        .expect("thread/goal/set response");
    let updated = set_lines
        .iter()
        .find(|value| value.get("method") == Some(&json!(METHOD_THREAD_GOAL_UPDATED)))
        .unwrap_or_else(|| panic!("thread/goal/updated notification: {set_lines:#?}"));
    assert_eq!(updated.pointer("/params/goal"), set.pointer("/result/goal"));
    assert_eq!(set.pointer("/result/goal/tokensUsed"), Some(&json!(0)));
    assert_eq!(set.pointer("/result/goal/timeUsedSeconds"), Some(&json!(0)));
    let created_at = set
        .pointer("/result/goal/createdAt")
        .cloned()
        .expect("goal createdAt");

    let edit = request(
        &server,
        4,
        METHOD_THREAD_GOAL_SET,
        json!({
            "threadId": thread_id,
            "objective": "finish the edited durable goal",
            "status": "blocked",
            "tokenBudget": null
        }),
    )
    .await;
    assert_eq!(
        edit.pointer("/result/goal/objective"),
        Some(&json!("finish the edited durable goal"))
    );
    assert_eq!(edit.pointer("/result/goal/status"), Some(&json!("blocked")));
    assert_eq!(edit.pointer("/result/goal/tokenBudget"), Some(&Value::Null));
    assert_eq!(edit.pointer("/result/goal/createdAt"), Some(&created_at));

    drop(server);
    let restarted = AppServer::with_runtime(
        RuntimeCore::default().with_projection_store(Arc::new(
            ProjectionStore::initialize(&projection_path)
                .expect("reopen thread goal projection store"),
        )),
    );
    initialize_server(&restarted).await;

    let read = request(
        &restarted,
        5,
        METHOD_THREAD_GOAL_GET,
        json!({ "threadId": thread_id }),
    )
    .await;
    assert_eq!(
        read.pointer("/result/goal/objective"),
        Some(&json!("finish the edited durable goal"))
    );
    assert_eq!(read.pointer("/result/goal/status"), Some(&json!("blocked")));

    let clear_lines = request_lines(
        &restarted,
        6,
        METHOD_THREAD_GOAL_CLEAR,
        json!({ "threadId": thread_id }),
    )
    .await;
    assert_eq!(
        clear_lines
            .iter()
            .find(|value| value.get("id") == Some(&json!(6)))
            .and_then(|value| value.pointer("/result/cleared")),
        Some(&json!(true))
    );
    assert!(clear_lines
        .iter()
        .any(|value| value.get("method") == Some(&json!(METHOD_THREAD_GOAL_CLEARED))));

    let read_after_clear = request(
        &restarted,
        7,
        METHOD_THREAD_GOAL_GET,
        json!({ "threadId": thread_id }),
    )
    .await;
    assert_eq!(read_after_clear.pointer("/result/goal"), Some(&Value::Null));

    let clear_again = request_lines(
        &restarted,
        8,
        METHOD_THREAD_GOAL_CLEAR,
        json!({ "threadId": thread_id }),
    )
    .await;
    assert_eq!(
        clear_again
            .iter()
            .find(|value| value.get("id") == Some(&json!(8)))
            .and_then(|value| value.pointer("/result/cleared")),
        Some(&json!(false))
    );
    assert!(clear_again
        .iter()
        .all(|value| value.get("method") != Some(&json!(METHOD_THREAD_GOAL_CLEARED))));
}

#[tokio::test]
async fn thread_resume_rehydrates_the_same_identity_and_bootstraps_turns_page() {
    let (_temp, server) = test_server();
    initialize_server(&server).await;

    let started = request(
        &server,
        2,
        METHOD_THREAD_START,
        json!({
            "model": "gpt-5.4",
            "modelProvider": "openai",
            "cwd": "/tmp/lime-thread-resume-v2",
            "historyMode": "legacy"
        }),
    )
    .await;
    let thread_id = started
        .pointer("/result/thread/id")
        .and_then(Value::as_str)
        .expect("thread/start id");
    let session_id = started
        .pointer("/result/thread/sessionId")
        .and_then(Value::as_str)
        .expect("thread/start session id");

    let resumed_lines = request_lines(
        &server,
        3,
        METHOD_THREAD_RESUME,
        json!({
            "threadId": thread_id,
            "path": "",
            "excludeTurns": true,
            "initialTurnsPage": {
                "limit": 10,
                "sortDirection": "desc",
                "itemsView": "summary"
            }
        }),
    )
    .await;
    let resumed = resumed_lines
        .iter()
        .find(|value| value.get("id") == Some(&json!(3)))
        .expect("thread/resume response");
    assert_eq!(
        resumed.pointer("/result/thread/id"),
        Some(&json!(thread_id))
    );
    assert_eq!(
        resumed.pointer("/result/thread/sessionId"),
        Some(&json!(session_id))
    );
    assert_eq!(resumed.pointer("/result/model"), Some(&json!("gpt-5.4")));
    assert_eq!(
        resumed.pointer("/result/modelProvider"),
        Some(&json!("openai"))
    );
    assert_eq!(
        resumed.pointer("/result/cwd"),
        Some(&json!("/tmp/lime-thread-resume-v2"))
    );
    assert_eq!(resumed.pointer("/result/thread/turns"), Some(&json!([])));
    assert!(
        resumed_lines
            .iter()
            .all(|value| value.get("method") != Some(&json!("thread/started"))),
        "thread/resume must not emit thread/started: {resumed_lines:#?}"
    );

    let turns = request(
        &server,
        4,
        METHOD_THREAD_TURNS_LIST,
        json!({
            "threadId": thread_id,
            "limit": 10,
            "sortDirection": "desc",
            "itemsView": "summary"
        }),
    )
    .await;
    assert_eq!(
        resumed.pointer("/result/initialTurnsPage"),
        turns.get("result")
    );
}

#[tokio::test]
async fn thread_resume_projects_the_loaded_actor_active_turn() {
    let temp = TempDir::new().expect("loaded thread resume temp dir");
    let started = Arc::new(Notify::new());
    let release = Arc::new(Notify::new());
    let projection_store = Arc::new(
        ProjectionStore::initialize(temp.path().join("projection.sqlite"))
            .expect("loaded thread resume projection store"),
    );
    let runtime = RuntimeCore::with_backend(Arc::new(BlockingTurnBackend {
        started: Arc::clone(&started),
        release: Arc::clone(&release),
    }))
    .with_projection_store(projection_store);
    let server = AppServer::with_runtime(runtime);
    initialize_server(&server).await;

    let thread_start = request(
        &server,
        2,
        METHOD_THREAD_START,
        json!({
            "model": "fixture-model",
            "modelProvider": "fixture-provider",
            "historyMode": "legacy"
        }),
    )
    .await;
    let thread_id = thread_start
        .pointer("/result/thread/id")
        .and_then(Value::as_str)
        .expect("thread/start id")
        .to_string();
    let session_id = thread_start
        .pointer("/result/thread/sessionId")
        .and_then(Value::as_str)
        .expect("thread/start session id")
        .to_string();

    let turn_start = request(
        &server,
        3,
        METHOD_TURN_START,
        json!({
            "threadId": thread_id,
            "input": [{"type": "text", "text": "hold the active turn"}],
            "model": "fixture-model",
            "approvalPolicy": "never",
            "sandboxPolicy": "workspace-write"
        }),
    )
    .await;
    timeout(Duration::from_secs(2), started.notified())
        .await
        .expect("backend must hold an active turn");
    let turn_id = turn_start
        .pointer("/result/turn/id")
        .and_then(Value::as_str)
        .expect("turn/start id")
        .to_string();

    let resumed = request(
        &server,
        4,
        METHOD_THREAD_RESUME,
        json!({"threadId": thread_id}),
    )
    .await;
    assert_eq!(
        resumed.pointer("/result/thread/id"),
        Some(&json!(thread_id))
    );
    assert_eq!(
        resumed.pointer("/result/thread/sessionId"),
        Some(&json!(session_id))
    );
    assert_eq!(
        resumed.pointer("/result/thread/status/type"),
        Some(&json!("active"))
    );
    assert_eq!(
        resumed.pointer("/result/thread/turns/0/id"),
        Some(&json!(turn_id))
    );
    assert_eq!(
        resumed.pointer("/result/thread/turns/0/status"),
        Some(&json!("inProgress"))
    );

    release.notify_one();
    timeout(Duration::from_secs(2), async {
        let mut request_id = 5;
        loop {
            let read = request(
                &server,
                request_id,
                METHOD_THREAD_READ,
                json!({"threadId": thread_id, "includeTurns": true}),
            )
            .await;
            if read.pointer("/result/thread/turns/0/status") == Some(&json!("completed")) {
                break;
            }
            request_id += 1;
            sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("released turn must reach canonical completed state");
}

#[tokio::test]
async fn thread_resume_enforces_paginated_history_constraints() {
    let (_temp, server) = test_server();
    initialize_server(&server).await;
    let started = request(
        &server,
        2,
        METHOD_THREAD_START,
        json!({
            "model": "gpt-5.4",
            "modelProvider": "openai",
            "historyMode": "paginated"
        }),
    )
    .await;
    let thread_id = started
        .pointer("/result/thread/id")
        .and_then(Value::as_str)
        .expect("thread/start id");

    let full = request_raw(
        &server,
        3,
        METHOD_THREAD_RESUME,
        json!({"threadId": thread_id}),
    )
    .await;
    assert_eq!(
        full.pointer("/error/code"),
        Some(&json!(error_codes::INVALID_REQUEST))
    );

    let initial_page = request_raw(
        &server,
        4,
        METHOD_THREAD_RESUME,
        json!({
            "threadId": thread_id,
            "excludeTurns": true,
            "initialTurnsPage": {}
        }),
    )
    .await;
    assert_eq!(
        initial_page.pointer("/error/code"),
        Some(&json!(error_codes::INVALID_REQUEST))
    );

    let metadata_only = request(
        &server,
        5,
        METHOD_THREAD_RESUME,
        json!({"threadId": thread_id, "excludeTurns": true}),
    )
    .await;
    assert_eq!(
        metadata_only.pointer("/result/thread/historyMode"),
        Some(&json!("paginated"))
    );
}

#[tokio::test]
async fn thread_resume_rejects_legacy_shape_and_unimplemented_sources_or_overrides() {
    let (_temp, server) = test_server();
    initialize_server(&server).await;
    let started = request(
        &server,
        2,
        METHOD_THREAD_START,
        json!({"model": "gpt-5.4", "modelProvider": "openai"}),
    )
    .await;
    let thread_id = started
        .pointer("/result/thread/id")
        .and_then(Value::as_str)
        .expect("thread/start id");

    let legacy = request_raw(
        &server,
        3,
        METHOD_THREAD_RESUME,
        json!({"sessionId": "session-1"}),
    )
    .await;
    assert_eq!(
        legacy.pointer("/error/code"),
        Some(&json!(error_codes::INVALID_PARAMS))
    );

    for (id, params) in [
        (4, json!({"threadId": thread_id, "history": []})),
        (
            5,
            json!({"threadId": thread_id, "history": [{"type": "message"}]}),
        ),
        (6, json!({"threadId": thread_id, "path": "/tmp/rollout"})),
        (7, json!({"threadId": thread_id, "model": "gpt-5.4-mini"})),
    ] {
        let response = request_raw(&server, id, METHOD_THREAD_RESUME, params).await;
        assert_eq!(
            response.pointer("/error/code"),
            Some(&json!(error_codes::INVALID_REQUEST)),
            "request {id} must fail closed: {response:#?}"
        );
        assert!(response.get("result").is_none());
    }
}

#[tokio::test]
async fn thread_archive_moves_the_dated_rollout_and_unarchive_restores_it() {
    let (temp, server) = test_server();
    initialize_server(&server).await;
    let started = request(
        &server,
        2,
        METHOD_THREAD_START,
        json!({
            "model": "gpt-5.4",
            "modelProvider": "openai",
            "historyMode": "paginated"
        }),
    )
    .await;
    let thread_id = started
        .pointer("/result/thread/id")
        .and_then(Value::as_str)
        .expect("thread/start id")
        .to_string();
    let agent_root = temp.path().join("agent-root");
    let active_files = rollout_files(&agent_root.join("sessions"));
    assert_eq!(active_files.len(), 1, "one dated rollout must be created");
    let active_path = active_files[0].clone();
    assert_eq!(
        active_path
            .strip_prefix(agent_root.join("sessions"))
            .expect("dated rollout relative path")
            .components()
            .count(),
        4,
        "rollout path must be YYYY/MM/DD/<file>"
    );

    let archive_lines = request_lines(
        &server,
        3,
        METHOD_THREAD_ARCHIVE,
        json!({"threadId": thread_id}),
    )
    .await;
    assert_eq!(
        archive_lines
            .iter()
            .find(|line| line.get("id") == Some(&json!(3)))
            .and_then(|line| line.get("result")),
        Some(&json!({}))
    );
    assert_eq!(
        archive_lines
            .iter()
            .find(|line| line.get("method") == Some(&json!("thread/archived")))
            .and_then(|line| line.pointer("/params/threadId")),
        Some(&json!(thread_id))
    );
    assert!(!active_path.exists());
    let archived_files = rollout_files(&agent_root.join("archived_sessions"));
    assert_eq!(archived_files.len(), 1);
    assert_eq!(archived_files[0].file_name(), active_path.file_name());

    let active = request(&server, 4, METHOD_THREAD_LIST, json!({"archived": false})).await;
    assert_eq!(active.pointer("/result/data"), Some(&json!([])));
    let archived = request(&server, 5, METHOD_THREAD_LIST, json!({"archived": true})).await;
    assert_eq!(
        archived.pointer("/result/data/0/id"),
        Some(&json!(thread_id))
    );

    let duplicate_archive = request_lines(
        &server,
        6,
        METHOD_THREAD_ARCHIVE,
        json!({"threadId": thread_id}),
    )
    .await;
    assert!(duplicate_archive
        .iter()
        .all(|line| line.get("method") != Some(&json!("thread/archived"))));

    let unarchive_lines = request_lines(
        &server,
        7,
        METHOD_THREAD_UNARCHIVE,
        json!({"threadId": thread_id}),
    )
    .await;
    assert_eq!(
        unarchive_lines
            .iter()
            .find(|line| line.get("id") == Some(&json!(7)))
            .and_then(|line| line.pointer("/result/thread/id")),
        Some(&json!(thread_id))
    );
    assert_eq!(
        unarchive_lines
            .iter()
            .find(|line| line.get("method") == Some(&json!("thread/unarchived")))
            .and_then(|line| line.pointer("/params/threadId")),
        Some(&json!(thread_id))
    );
    assert!(active_path.exists());
    assert!(rollout_files(&agent_root.join("archived_sessions")).is_empty());
}

#[tokio::test]
async fn retired_agent_session_start_is_not_a_production_method() {
    let (_temp, server) = test_server();
    initialize_server(&server).await;

    let response = request_raw(
        &server,
        2,
        "agentSession/start",
        json!({
            "appId": "agent-chat"
        }),
    )
    .await;

    assert_eq!(
        response.pointer("/error/code"),
        Some(&json!(error_codes::METHOD_NOT_FOUND))
    );
    assert!(response.get("result").is_none());
}

fn test_server() -> (TempDir, AppServer) {
    let temp = TempDir::new().expect("thread v2 temp dir");
    let agent_root = temp.path().join("agent-root");
    let projection_store = Arc::new(
        ProjectionStore::initialize_with_agent_root(
            agent_root.join("runtime").join("projection.sqlite"),
            &agent_root,
        )
        .expect("thread v2 projection store"),
    );
    let runtime =
        RuntimeCore::with_backend(Arc::new(MockBackend)).with_projection_store(projection_store);
    (temp, AppServer::with_runtime(runtime))
}

fn rollout_files(root: &Path) -> Vec<PathBuf> {
    if !root.exists() {
        return Vec::new();
    }
    let mut pending = vec![root.to_path_buf()];
    let mut files = Vec::new();
    while let Some(path) = pending.pop() {
        for entry in fs::read_dir(&path).expect("read rollout directory") {
            let path = entry.expect("read rollout entry").path();
            if path.is_dir() {
                pending.push(path);
            } else if path.extension().and_then(|value| value.to_str()) == Some("jsonl") {
                files.push(path);
            }
        }
    }
    files.sort();
    files
}

async fn initialize_server(server: &AppServer) {
    let response = request(
        server,
        1,
        METHOD_INITIALIZE,
        json!({
            "clientInfo": {
                "name": "thread-v2-jsonrpc-test",
                "version": "1.0.0"
            }
        }),
    )
    .await;
    assert_eq!(
        response.pointer("/result/serverInfo/protocolVersion"),
        Some(&json!(PROTOCOL_VERSION))
    );

    let lines = server
        .handle_json_line(
            &json!({
                "jsonrpc": "2.0",
                "method": METHOD_INITIALIZED,
                "params": {}
            })
            .to_string(),
        )
        .await
        .expect("handle initialized notification");
    assert!(lines.is_empty());
}

async fn request(server: &AppServer, id: u64, method: &str, params: Value) -> Value {
    let response = request_raw(server, id, method, params).await;
    if let Some(error) = response.get("error") {
        panic!("{method} failed: {error}");
    }
    response
}

async fn request_raw(server: &AppServer, id: u64, method: &str, params: Value) -> Value {
    let lines = request_lines(server, id, method, params).await;
    lines
        .into_iter()
        .find(|value| value.get("id") == Some(&json!(id)))
        .expect("JSON-RPC response")
}

async fn request_lines(server: &AppServer, id: u64, method: &str, params: Value) -> Vec<Value> {
    let lines = server
        .handle_json_line(
            &json!({
                "jsonrpc": "2.0",
                "id": id,
                "method": method,
                "params": params
            })
            .to_string(),
        )
        .await
        .expect("handle JSON-RPC request");
    let values = lines
        .iter()
        .map(|line| serde_json::from_str(line).expect("decode JSON-RPC response"))
        .collect::<Vec<Value>>();
    assert_eq!(
        values
            .iter()
            .filter(|value| value.get("id") == Some(&json!(id)))
            .count(),
        1,
        "{method} must return exactly one response"
    );
    values
}
