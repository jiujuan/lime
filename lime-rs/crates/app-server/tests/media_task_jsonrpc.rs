use app_server::AppServer;
use app_server::LocalAppDataSource;
use app_server::MockBackend;
use app_server::RuntimeBackend;
use app_server::RuntimeCore;
use app_server_protocol::*;
use lime_core::database::schema::create_tables;
use rusqlite::Connection;
use serde_json::json;
use serde_json::Value;
use std::sync::Arc;
use tempfile::TempDir;

struct MediaTaskAppServer {
    _temp: TempDir,
    workspace_root: String,
    server: AppServer,
}

async fn media_task_app_server() -> MediaTaskAppServer {
    let temp = TempDir::new().expect("create media task fixture temp dir");
    let data_root = temp.path().join("app-server-data");
    let workspace_root = temp.path().join("workspace").to_string_lossy().to_string();
    std::fs::create_dir_all(&workspace_root).expect("create workspace root");

    let conn = Connection::open_in_memory().expect("open in-memory product db");
    create_tables(&conn).expect("create product schema");
    let app_data_source = LocalAppDataSource::initialize_with_db_and_data_root(
        Arc::new(std::sync::Mutex::new(conn)),
        data_root,
    )
    .await
    .expect("local app data source");
    let runtime = RuntimeCore::with_backend(Arc::new(MockBackend))
        .with_app_data_source(Arc::new(app_data_source));

    MediaTaskAppServer {
        _temp: temp,
        workspace_root,
        server: AppServer::with_runtime(runtime),
    }
}

#[tokio::test]
async fn image_task_complete_uses_current_jsonrpc_method() {
    let app = media_task_app_server().await;
    initialize_server(&app.server, 1, "media-task-image-complete-test").await;

    let created = request(
        &app.server,
        2,
        METHOD_MEDIA_TASK_ARTIFACT_IMAGE_CREATE,
        json!({
            "projectRootPath": app.workspace_root,
            "prompt": "给春日咖啡活动生成一张配图",
            "size": "1024x1024",
            "count": 1,
            "providerId": "provider-image",
            "model": "gpt-image-test",
            "threadId": "thread-image-complete",
            "turnId": "turn-image-complete",
            "entrySource": "at_image_command"
        }),
    )
    .await;
    let task_id = created
        .pointer("/result/task_id")
        .and_then(Value::as_str)
        .expect("created task id")
        .to_string();
    assert_eq!(
        created.pointer("/result/normalized_status"),
        Some(&json!("pending"))
    );

    let completed = request(
        &app.server,
        3,
        METHOD_MEDIA_TASK_ARTIFACT_IMAGE_COMPLETE,
        json!({
            "projectRootPath": app.workspace_root,
            "taskRef": task_id,
            "providerId": "provider-image",
            "model": "gpt-image-test",
            "responseId": "response-image-complete",
            "images": [{
                "url": "file:///tmp/lime-image-complete.png",
                "revisedPrompt": "春日咖啡活动插画",
                "slotId": "hero",
                "slotIndex": 1,
                "slotPrompt": "主视觉配图"
            }]
        }),
    )
    .await;

    assert_eq!(
        completed.pointer("/result/normalized_status"),
        Some(&json!("succeeded"))
    );
    assert_eq!(
        completed.pointer("/result/record/result/images/0/url"),
        Some(&json!("file:///tmp/lime-image-complete.png"))
    );
    assert_eq!(
        completed.pointer("/result/record/result/received_count"),
        Some(&json!(1))
    );
    assert_eq!(
        completed.pointer("/result/record/payload/received_count"),
        Some(&json!(1))
    );
    assert_eq!(
        completed.pointer("/result/record/progress/percent"),
        Some(&json!(100))
    );
    assert_eq!(
        completed.pointer("/result/record/progress/preview_slots/0/status"),
        Some(&json!("complete"))
    );
    assert_eq!(
        completed.pointer("/result/record/attempts/0/worker_id"),
        Some(&json!("app-server-image-output-writer"))
    );
    assert_eq!(
        completed.pointer("/result/record/attempts/0/result_snapshot/images/0/url"),
        Some(&json!("file:///tmp/lime-image-complete.png"))
    );

    let restored = request(
        &app.server,
        4,
        METHOD_MEDIA_TASK_ARTIFACT_GET,
        json!({
            "projectRootPath": app.workspace_root,
            "taskRef": completed.pointer("/result/task_id").and_then(Value::as_str).expect("completed task id")
        }),
    )
    .await;
    assert_eq!(
        restored.pointer("/result/record/result/images/0/url"),
        Some(&json!("file:///tmp/lime-image-complete.png"))
    );
}

#[tokio::test]
async fn image_task_complete_rejects_wrong_task_type() {
    let app = media_task_app_server().await;
    initialize_server(&app.server, 1, "media-task-image-complete-wrong-type-test").await;

    let created = request(
        &app.server,
        2,
        METHOD_MEDIA_TASK_ARTIFACT_AUDIO_CREATE,
        json!({
            "projectRootPath": app.workspace_root,
            "sourceText": "给春日咖啡活动生成一段播报",
            "voice": "narrator"
        }),
    )
    .await;
    let task_id = created
        .pointer("/result/task_id")
        .and_then(Value::as_str)
        .expect("created audio task id");

    let rejected = request_error(
        &app.server,
        3,
        METHOD_MEDIA_TASK_ARTIFACT_IMAGE_COMPLETE,
        json!({
            "projectRootPath": app.workspace_root,
            "taskRef": task_id,
            "images": [{
                "url": "file:///tmp/wrong-type.png"
            }]
        }),
    )
    .await;
    assert!(rejected
        .pointer("/error/message")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .contains("只能完成 image_generate 任务"));
}

#[tokio::test]
async fn image_task_complete_rejects_failed_or_cancelled_task() {
    let app = media_task_app_server().await;
    initialize_server(&app.server, 1, "media-task-image-complete-terminal-test").await;

    let created = request(
        &app.server,
        2,
        METHOD_MEDIA_TASK_ARTIFACT_IMAGE_CREATE,
        json!({
            "projectRootPath": app.workspace_root,
            "prompt": "生成一张会被取消的图片"
        }),
    )
    .await;
    let task_id = created
        .pointer("/result/task_id")
        .and_then(Value::as_str)
        .expect("created image task id");

    request(
        &app.server,
        3,
        METHOD_MEDIA_TASK_ARTIFACT_CANCEL,
        json!({
            "projectRootPath": app.workspace_root,
            "taskRef": task_id
        }),
    )
    .await;

    let rejected = request_error(
        &app.server,
        4,
        METHOD_MEDIA_TASK_ARTIFACT_IMAGE_COMPLETE,
        json!({
            "projectRootPath": app.workspace_root,
            "taskRef": task_id,
            "images": [{
                "url": "file:///tmp/cancelled.png"
            }]
        }),
    )
    .await;
    assert!(rejected
        .pointer("/error/message")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .contains("不能直接写回完成态"));
}

#[tokio::test]
async fn image_command_turn_start_creates_task_from_jsonrpc_metadata() {
    let app = image_command_app_server().await;
    initialize_server(&app.server, 1, "image-command-jsonrpc-test").await;

    request(
        &app.server,
        2,
        METHOD_AGENT_SESSION_START,
        json!({
            "sessionId": "sess-image-command-jsonrpc",
            "threadId": "thread-image-command-jsonrpc",
            "appId": "agent-runtime",
            "workspaceId": "workspace-image-command-jsonrpc"
        }),
    )
    .await;

    let messages = request_with_notifications(
        &app.server,
        3,
        METHOD_AGENT_SESSION_TURN_START,
        json!({
            "sessionId": "sess-image-command-jsonrpc",
            "turnId": "turn-image-command-jsonrpc",
            "input": {
                "text": "@配图 E2E 图片命令路由测试，请生成一张青柠插画",
                "attachments": []
            },
            "runtimeOptions": {
                "stream": true,
                "metadata": {
                    "harness": {
                        "image_command_intent": {
                            "kind": "image_task",
                            "image_task": {
                                "project_root_path": app.workspace_root,
                                "prompt": "E2E 图片命令路由测试，请生成一张青柠插画",
                                "raw_text": "@配图 E2E 图片命令路由测试，请生成一张青柠插画",
                                "mode": "generate",
                                "count": 1,
                                "provider_id": "provider-image",
                                "model": "gpt-image-test",
                                "executor_mode": "images_api",
                                "entry_source": "at_image_command"
                            }
                        }
                    }
                },
                "hostOptions": {
                    "asterChatRequest": {
                        "message": "@配图 E2E 图片命令路由测试，请生成一张青柠插画",
                        "metadata": {
                            "harness": {
                                "image_command_intent": {
                                    "kind": "image_task",
                                    "image_task": {
                                        "project_root_path": app.workspace_root,
                                        "prompt": "E2E 图片命令路由测试，请生成一张青柠插画",
                                        "raw_text": "@配图 E2E 图片命令路由测试，请生成一张青柠插画",
                                        "mode": "generate",
                                        "count": 1,
                                        "provider_id": "provider-image",
                                        "model": "gpt-image-test",
                                        "executor_mode": "images_api",
                                        "entry_source": "at_image_command"
                                    }
                                }
                            }
                        }
                    }
                }
            },
            "queueIfBusy": true
        }),
    )
    .await;

    let event_types = notification_event_types(&messages);
    assert!(
        event_types.contains(&"runtime.status"),
        "image command should emit accepted status: {event_types:?}"
    );
    assert!(
        event_types.contains(&"image_task.created"),
        "image command should create task: {event_types:?}"
    );
    assert!(
        event_types.contains(&"tool.result"),
        "image command should expose tool result: {event_types:?}"
    );
    assert!(
        !event_types.contains(&"routing.decision.made"),
        "image command must not fall through to ordinary chat routing: {event_types:?}"
    );

    let tasks = request(
        &app.server,
        4,
        METHOD_MEDIA_TASK_ARTIFACT_LIST,
        json!({
            "projectRootPath": app.workspace_root,
            "taskType": "image_generate",
            "limit": 20
        }),
    )
    .await;
    assert_eq!(
        tasks.pointer("/result/tasks/0/record/payload/prompt"),
        Some(&json!("E2E 图片命令路由测试，请生成一张青柠插画"))
    );
    assert_eq!(
        tasks.pointer("/result/tasks/0/record/payload/provider_id"),
        Some(&json!("provider-image"))
    );
    assert_eq!(
        tasks.pointer("/result/tasks/0/record/payload/entry_source"),
        Some(&json!("at_image_command"))
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

async fn image_command_app_server() -> MediaTaskAppServer {
    let temp = TempDir::new().expect("create image command fixture temp dir");
    let data_root = temp.path().join("app-server-data");
    let workspace_root = temp.path().join("workspace").to_string_lossy().to_string();
    std::fs::create_dir_all(&workspace_root).expect("create workspace root");

    let conn = Connection::open_in_memory().expect("open in-memory product db");
    create_tables(&conn).expect("create product schema");
    let db = Arc::new(std::sync::Mutex::new(conn));
    let app_data_source =
        LocalAppDataSource::initialize_with_db_and_data_root(db.clone(), data_root)
            .await
            .expect("local app data source");
    let runtime = RuntimeCore::with_backend(Arc::new(RuntimeBackend::with_db(db)))
        .with_app_data_source(Arc::new(app_data_source));

    MediaTaskAppServer {
        _temp: temp,
        workspace_root,
        server: AppServer::with_runtime(runtime),
    }
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

async fn request_with_notifications(
    server: &AppServer,
    id: u64,
    method: &str,
    params: Value,
) -> Vec<Value> {
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
    assert!(!lines.is_empty(), "{method} should return a response");
    let messages = lines
        .iter()
        .map(|line| serde_json::from_str::<Value>(line).expect("decode JSON-RPC message"))
        .collect::<Vec<_>>();
    let response = messages
        .iter()
        .find(|message| message.get("id") == Some(&json!(id)))
        .unwrap_or_else(|| panic!("{method} should include response id {id}"));
    if let Some(error) = response.get("error") {
        panic!("{method} failed: {error}");
    }
    messages
}

fn notification_event_types(messages: &[Value]) -> Vec<&str> {
    messages
        .iter()
        .filter(|message| message.get("method") == Some(&json!(METHOD_AGENT_SESSION_EVENT)))
        .filter_map(|message| {
            message
                .pointer("/params/event/type")
                .and_then(Value::as_str)
        })
        .collect()
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
