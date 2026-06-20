use app_server::AppServer;
use app_server::EventLogWriter;
use app_server::LocalAppDataSource;
use app_server::MockBackend;
use app_server::ProjectionStore;
use app_server::RuntimeCore;
use app_server::StorageRoots;
use app_server_protocol::*;
use lime_core::database::schema::create_tables;
use rusqlite::Connection;
use serde_json::json;
use serde_json::Value;
use std::fs;
use std::sync::Arc;
use tempfile::TempDir;

const SESSION_ID: &str = "persisted-session";
const SECOND_SESSION_ID: &str = "persisted-session-second";
const THREAD_ID: &str = "persisted-thread";
const WORKSPACE_ID: &str = "workspace-current";

struct ProjectionAppServer {
    _temp: TempDir,
    roots: StorageRoots,
    event_log_writer: Arc<EventLogWriter>,
    server: AppServer,
}

async fn projection_app_server(sessions: &[(&str, &str, &str, &str)]) -> ProjectionAppServer {
    let temp = TempDir::new().expect("create projection fixture temp dir");
    let roots = StorageRoots::initialize(temp.path().join("app-server")).expect("storage roots");
    let event_log_writer = Arc::new(EventLogWriter::new(&roots.event_log_root).expect("event log"));
    let projection_store =
        Arc::new(ProjectionStore::initialize(&roots.projection_db_path).expect("projection"));
    for (session_id, thread_id, title, updated_at) in sessions {
        seed_projected_session(
            &projection_store,
            &event_log_writer,
            session_id,
            thread_id,
            title,
            updated_at,
        );
    }
    let app_data_source = Arc::new(local_app_data_source(&roots).await);
    let runtime = RuntimeCore::with_backend(Arc::new(MockBackend))
        .with_app_data_source(app_data_source)
        .with_event_log_writer(event_log_writer.clone())
        .with_projection_store(projection_store);
    ProjectionAppServer {
        _temp: temp,
        roots,
        event_log_writer,
        server: AppServer::with_runtime(runtime),
    }
}

async fn local_app_data_source(roots: &StorageRoots) -> LocalAppDataSource {
    let conn = Connection::open_in_memory().expect("open in-memory product db");
    create_tables(&conn).expect("create product schema");
    LocalAppDataSource::initialize_with_db_and_data_root(
        Arc::new(std::sync::Mutex::new(conn)),
        roots.data_root.clone(),
    )
    .await
    .expect("local app data source")
}

fn seed_projected_session(
    projection_store: &ProjectionStore,
    event_log_writer: &EventLogWriter,
    session_id: &str,
    thread_id: &str,
    title: &str,
    updated_at: &str,
) {
    let event = AgentEvent {
        event_id: format!("evt-{session_id}-accepted"),
        sequence: 1,
        session_id: session_id.to_string(),
        thread_id: Some(thread_id.to_string()),
        turn_id: Some(format!("{thread_id}-turn")),
        event_type: "turn.accepted".to_string(),
        timestamp: updated_at.to_string(),
        payload: json!({
            "session": {
                "title": title,
                "modelName": "gpt-5.4",
                "workspaceId": WORKSPACE_ID,
                "workingDir": "/tmp/workspace-current",
                "executionStrategy": "react"
            }
        }),
    };
    projection_store
        .apply_event(&event)
        .expect("seed projected session");
    event_log_writer.append(&event).expect("seed event log");
}

#[tokio::test]
async fn persisted_session_archive_and_unarchive_use_current_jsonrpc() {
    let app = projection_app_server(&[(
        SESSION_ID,
        THREAD_ID,
        "Persisted Session",
        "2026-06-07T00:00:00.000Z",
    )])
    .await;
    initialize_server(&app.server, 1, "session-archive-jsonrpc-test").await;

    let archive = request(
        &app.server,
        2,
        METHOD_AGENT_SESSION_UPDATE,
        json!({
            "sessionId": SESSION_ID,
            "archived": true
        }),
    )
    .await;
    let archived_at = archive
        .pointer("/result/session/archivedAt")
        .and_then(Value::as_str)
        .expect("archived persisted session should include archivedAt");
    assert!(!archived_at.is_empty());

    let recent = request(
        &app.server,
        3,
        METHOD_AGENT_SESSION_LIST,
        json!({
            "workspaceId": WORKSPACE_ID
        }),
    )
    .await;
    assert_eq!(session_ids(&recent), Vec::<String>::new());

    let archived = request(
        &app.server,
        4,
        METHOD_AGENT_SESSION_LIST,
        json!({
            "workspaceId": WORKSPACE_ID,
            "archivedOnly": true
        }),
    )
    .await;
    assert_eq!(session_ids(&archived), vec![SESSION_ID.to_string()]);

    let archived_read = request(
        &app.server,
        5,
        METHOD_AGENT_SESSION_READ,
        json!({
            "sessionId": SESSION_ID
        }),
    )
    .await;
    assert_eq!(
        archived_read.pointer("/result/detail/archived_at"),
        Some(&json!(archived_at)),
    );

    let unarchive = request(
        &app.server,
        104,
        METHOD_AGENT_SESSION_UPDATE,
        json!({
            "sessionId": SESSION_ID,
            "archived": false
        }),
    )
    .await;
    assert_eq!(unarchive.pointer("/result/session/archivedAt"), None);

    let restored_recent = request(
        &app.server,
        201,
        METHOD_AGENT_SESSION_LIST,
        json!({
            "workspaceId": WORKSPACE_ID
        }),
    )
    .await;
    assert_eq!(session_ids(&restored_recent), vec![SESSION_ID.to_string()]);

    let restored_archived = request(
        &app.server,
        202,
        METHOD_AGENT_SESSION_LIST,
        json!({
            "workspaceId": WORKSPACE_ID,
            "archivedOnly": true
        }),
    )
    .await;
    assert_eq!(session_ids(&restored_archived), Vec::<String>::new());
}

#[tokio::test]
async fn memory_store_reset_does_not_delete_persisted_session_history() {
    let app = projection_app_server(&[(
        SESSION_ID,
        THREAD_ID,
        "Persisted Session",
        "2026-06-07T00:00:00.000Z",
    )])
    .await;
    initialize_server(&app.server, 1, "memory-reset-history-jsonrpc-test").await;

    let note = request(
        &app.server,
        2,
        METHOD_MEMORY_STORE_ADD_NOTE,
        json!({
            "scope": "global",
            "title": "Reset isolation",
            "slug": "reset-isolation",
            "content": "This memory note should be removed by reset."
        }),
    )
    .await;
    let note_path = note
        .pointer("/result/path")
        .and_then(Value::as_str)
        .expect("memory note path");
    let memory_root = app.roots.memory_root.clone();
    fs::write(
        memory_root.join("memory_summary.md"),
        "summary that should be cleared",
    )
    .expect("write summary");
    let event_log_path = app
        .event_log_writer
        .read_session_events(SESSION_ID)
        .expect("seeded event log")
        .into_iter()
        .next()
        .expect("one event log record")
        .path;

    let reset = request(
        &app.server,
        3,
        METHOD_MEMORY_STORE_RESET,
        json!({
            "scope": "global"
        }),
    )
    .await;
    assert_eq!(reset.pointer("/result/preservedSoul"), Some(&json!(true)));
    assert!(!memory_root.join(note_path).exists());
    assert_eq!(
        fs::read_to_string(memory_root.join("memory_summary.md")).expect("reset summary"),
        ""
    );

    let recent = request(
        &app.server,
        4,
        METHOD_AGENT_SESSION_LIST,
        json!({
            "workspaceId": WORKSPACE_ID
        }),
    )
    .await;
    assert_eq!(session_ids(&recent), vec![SESSION_ID.to_string()]);

    let read = request(
        &app.server,
        5,
        METHOD_AGENT_SESSION_READ,
        json!({
            "sessionId": SESSION_ID
        }),
    )
    .await;
    assert_eq!(
        read.pointer("/result/session/sessionId"),
        Some(&json!(SESSION_ID)),
    );
    assert!(event_log_path.is_file());
    assert_eq!(
        app.event_log_writer
            .read_session_events(SESSION_ID)
            .expect("event log after reset")
            .len(),
        1
    );
}

#[tokio::test]
async fn persisted_session_archive_many_uses_current_jsonrpc() {
    let app = projection_app_server(&[
        (
            SESSION_ID,
            THREAD_ID,
            "Persisted Session",
            "2026-06-07T00:00:00.000Z",
        ),
        (
            SECOND_SESSION_ID,
            "persisted-thread-second",
            "Second Persisted Session",
            "2026-06-07T00:00:02.000Z",
        ),
    ])
    .await;
    initialize_server(&app.server, 1, "session-archive-many-jsonrpc-test").await;

    let archived = request(
        &app.server,
        2,
        METHOD_AGENT_SESSION_ARCHIVE_MANY,
        json!({
            "sessionIds": [
                format!(" {SESSION_ID} "),
                "",
                SECOND_SESSION_ID,
                SESSION_ID
            ]
        }),
    )
    .await;
    let mut archived_session_ids = session_ids(&archived);
    archived_session_ids.sort();
    assert_eq!(
        archived_session_ids,
        vec![SESSION_ID.to_string(), SECOND_SESSION_ID.to_string()]
    );
    assert!(
        session_archived_at(&archived, SESSION_ID).is_some(),
        "primary session should be archived"
    );
    assert!(
        session_archived_at(&archived, SECOND_SESSION_ID).is_some(),
        "second session should be archived"
    );

    let recent = request(
        &app.server,
        3,
        METHOD_AGENT_SESSION_LIST,
        json!({
            "workspaceId": WORKSPACE_ID
        }),
    )
    .await;
    assert_eq!(session_ids(&recent), Vec::<String>::new());

    let archived_only = request(
        &app.server,
        4,
        METHOD_AGENT_SESSION_LIST,
        json!({
            "workspaceId": WORKSPACE_ID,
            "archivedOnly": true
        }),
    )
    .await;
    let mut archived_only_session_ids = session_ids(&archived_only);
    archived_only_session_ids.sort();
    assert_eq!(
        archived_only_session_ids,
        vec![SESSION_ID.to_string(), SECOND_SESSION_ID.to_string()]
    );
}

#[tokio::test]
async fn persisted_session_archive_many_ignores_empty_request() {
    let app = projection_app_server(&[(
        SESSION_ID,
        THREAD_ID,
        "Persisted Session",
        "2026-06-07T00:00:00.000Z",
    )])
    .await;
    initialize_server(&app.server, 1, "session-archive-many-empty-test").await;

    let archived = request(
        &app.server,
        2,
        METHOD_AGENT_SESSION_ARCHIVE_MANY,
        json!({
            "sessionIds": ["", "   "]
        }),
    )
    .await;
    assert_eq!(session_ids(&archived), Vec::<String>::new());

    let recent = request(
        &app.server,
        3,
        METHOD_AGENT_SESSION_LIST,
        json!({
            "workspaceId": WORKSPACE_ID
        }),
    )
    .await;
    assert_eq!(session_ids(&recent), vec![SESSION_ID.to_string()]);
}

#[tokio::test]
async fn persisted_session_delete_clears_projection_and_event_log() {
    let app = projection_app_server(&[(
        SESSION_ID,
        THREAD_ID,
        "Persisted Session",
        "2026-06-07T00:00:00.000Z",
    )])
    .await;
    initialize_server(&app.server, 1, "session-delete-jsonrpc-test").await;
    assert_eq!(
        app.event_log_writer
            .read_session_events(SESSION_ID)
            .expect("seeded event log")
            .len(),
        1
    );

    let deleted = request(
        &app.server,
        2,
        METHOD_AGENT_SESSION_DELETE,
        json!({
            "sessionId": format!(" {SESSION_ID} ")
        }),
    )
    .await;
    assert_eq!(
        deleted.pointer("/result/sessionId"),
        Some(&json!(SESSION_ID))
    );
    assert_eq!(deleted.pointer("/result/deleted"), Some(&json!(true)));

    let recent = request(
        &app.server,
        3,
        METHOD_AGENT_SESSION_LIST,
        json!({
            "workspaceId": WORKSPACE_ID,
            "includeArchived": true
        }),
    )
    .await;
    assert_eq!(session_ids(&recent), Vec::<String>::new());
    assert!(app
        .event_log_writer
        .read_session_events(SESSION_ID)
        .expect("event log after delete")
        .is_empty());

    let read_missing = request_error(
        &app.server,
        4,
        METHOD_AGENT_SESSION_READ,
        json!({
            "sessionId": SESSION_ID
        }),
    )
    .await;
    assert_eq!(
        read_missing.pointer("/error/code"),
        Some(&json!(error_codes::SESSION_NOT_FOUND))
    );
}

async fn initialize_server(server: &AppServer, id: u64, client_name: &str) {
    let initialize = request(
        server,
        id,
        METHOD_INITIALIZE,
        json!({
            "clientInfo": {
                "name": client_name,
                "version": "1.0.0"
            }
        }),
    )
    .await;
    assert_eq!(
        initialize.pointer("/result/serverInfo/protocolVersion"),
        Some(&json!(PROTOCOL_VERSION)),
    );
    notify(server, METHOD_INITIALIZED, json!({})).await;
}

async fn request(server: &AppServer, id: u64, method: &str, params: Value) -> Value {
    let lines = server
        .handle_json_line(
            &json!({
                "jsonrpc": "2.0",
                "id": id,
                "method": method,
                "params": params,
            })
            .to_string(),
        )
        .await
        .expect("handle JSON-RPC request");
    assert_eq!(
        lines.len(),
        1,
        "{method} should return exactly one response"
    );
    let response: Value = serde_json::from_str(&lines[0]).expect("decode JSON-RPC response");
    if let Some(error) = response.get("error") {
        panic!("{method} failed: {error}");
    }
    assert_eq!(response.get("id"), Some(&json!(id)));
    response
}

async fn request_error(server: &AppServer, id: u64, method: &str, params: Value) -> Value {
    let lines = server
        .handle_json_line(
            &json!({
                "jsonrpc": "2.0",
                "id": id,
                "method": method,
                "params": params,
            })
            .to_string(),
        )
        .await
        .expect("handle JSON-RPC request");
    assert_eq!(
        lines.len(),
        1,
        "{method} should return exactly one response"
    );
    let response: Value = serde_json::from_str(&lines[0]).expect("decode JSON-RPC response");
    assert!(
        response.get("error").is_some(),
        "{method} should return an error response"
    );
    assert_eq!(response.get("id"), Some(&json!(id)));
    response
}

async fn notify(server: &AppServer, method: &str, params: Value) {
    let lines = server
        .handle_json_line(
            &json!({
                "jsonrpc": "2.0",
                "method": method,
                "params": params,
            })
            .to_string(),
        )
        .await
        .expect("handle JSON-RPC notification");
    assert!(
        lines.is_empty(),
        "{method} notification should not return responses"
    );
}

fn session_ids(response: &Value) -> Vec<String> {
    response
        .pointer("/result/sessions")
        .and_then(Value::as_array)
        .expect("result.sessions should be an array")
        .iter()
        .map(|session| {
            session
                .get("sessionId")
                .and_then(Value::as_str)
                .expect("sessionId should be a string")
                .to_string()
        })
        .collect()
}

fn session_archived_at<'a>(response: &'a Value, expected_session_id: &str) -> Option<&'a str> {
    response
        .pointer("/result/sessions")
        .and_then(Value::as_array)
        .expect("result.sessions should be an array")
        .iter()
        .find(|session| {
            session
                .get("sessionId")
                .and_then(Value::as_str)
                .is_some_and(|session_id| session_id == expected_session_id)
        })
        .and_then(|session| session.get("archivedAt"))
        .and_then(Value::as_str)
}
