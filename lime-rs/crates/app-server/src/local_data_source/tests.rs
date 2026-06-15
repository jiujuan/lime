use super::*;
use crate::AppServer;
use crate::MockBackend;
use crate::RuntimeCore;
use app_server_protocol::METHOD_INITIALIZE;
use app_server_protocol::METHOD_INITIALIZED;
use app_server_protocol::METHOD_MCP_RESOURCE_LIST;
use app_server_protocol::METHOD_MCP_RESOURCE_READ;
use app_server_protocol::METHOD_MCP_SERVER_CREATE;
use app_server_protocol::METHOD_MCP_SERVER_START;
use app_server_protocol::METHOD_MCP_SERVER_STATUS_LIST;
use app_server_protocol::METHOD_MCP_SERVER_STOP;
use app_server_protocol::METHOD_MCP_TOOL_CALL;
use app_server_protocol::METHOD_MCP_TOOL_LIST;
use app_server_protocol::SERVER_NAME;
use app_server_transport::decode_message;
use lime_core::database::dao::agent_timeline::AgentThreadItem;
use lime_core::database::dao::agent_timeline::AgentThreadItemPayload;
use lime_core::database::dao::agent_timeline::AgentThreadItemStatus;
use lime_core::database::dao::agent_timeline::AgentThreadTurn;
use lime_core::database::dao::agent_timeline::AgentThreadTurnStatus;
use lime_core::database::dao::agent_timeline::AgentTimelineDao;
use lime_core::database::schema::create_tables;
use rusqlite::params;
use rusqlite::Connection;
use serde_json::json;
use serde_json::Value;
use std::fs;
use std::path::Path;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::Mutex;
use tempfile::TempDir;

const WORKSPACE_ID: &str = "workspace-current";
const WORKSPACE_ROOT: &str = "/tmp/lime-current-workspace";
const NOW: &str = "2026-03-13T01:00:00Z";

fn setup_data_source() -> LocalAppDataSource {
    let conn = Connection::open_in_memory().expect("open in-memory db");
    create_tables(&conn).expect("create schema");
    conn.execute(
        "INSERT INTO workspaces (
                id, name, workspace_type, root_path, is_default, settings_json,
                created_at, updated_at, icon, color, is_favorite, is_archived,
                tags_json, default_persona_id
             )
             VALUES (?1, '当前工作区', 'persistent', ?2, 1, '{}', 1, 1,
                     NULL, NULL, 0, 0, '[]', NULL)",
        params![WORKSPACE_ID, WORKSPACE_ROOT],
    )
    .expect("insert workspace");
    LocalAppDataSource {
        db: Arc::new(Mutex::new(conn)),
        logs: Arc::new(tokio::sync::RwLock::new(lime_core::logger::LogStore::new())),
        api_key_provider_service: ApiKeyProviderService::new(),
        model_registry_service: ModelRegistryService::new(Arc::new(Mutex::new(
            Connection::open_in_memory().expect("open model db"),
        ))),
        mcp_manager: Arc::new(TokioMutex::new(McpClientManager::new(None))),
        telegram_gateway_state: TelegramGatewayState::default(),
        feishu_gateway_state: FeishuGatewayState::default(),
        discord_gateway_state: DiscordGatewayState::default(),
        wechat_gateway_state: WechatGatewayState::default(),
        gateway_tunnel_state: GatewayTunnelState::default(),
        wechat_login_state: WechatLoginState::default(),
    }
}

#[tokio::test]
async fn mcp_current_jsonrpc_starts_real_stdio_server_and_reads_tool_resource() {
    let temp_dir = TempDir::new().expect("create mcp fixture temp dir");
    let server_path = write_mcp_stdio_fixture(temp_dir.path());
    let server = AppServer::with_runtime(
        RuntimeCore::with_backend(Arc::new(MockBackend))
            .with_app_data_source(Arc::new(setup_data_source())),
    );

    let init = app_server_request(
        &server,
        1,
        METHOD_INITIALIZE,
        json!({
            "clientInfo": {
                "name": "mcp-current-fixture",
                "version": "test"
            },
            "capabilities": {
                "experimental": true
            }
        }),
    )
    .await;
    assert_eq!(
        init.pointer("/result/serverInfo/name"),
        Some(&json!(SERVER_NAME))
    );
    app_server_notification(&server, METHOD_INITIALIZED, json!({})).await;

    let create = app_server_request(
        &server,
        2,
        METHOD_MCP_SERVER_CREATE,
        json!({
            "server": {
                "id": "fixture",
                "name": "fixture",
                "description": "Current MCP JSON-RPC fixture",
                "server_config": {
                    "command": "node",
                    "args": [server_path.to_string_lossy()],
                    "cwd": temp_dir.path().to_string_lossy(),
                    "timeout": 3
                },
                "enabled_lime": true,
                "enabled_claude": false,
                "enabled_codex": false,
                "enabled_gemini": false,
                "created_at": 1
            }
        }),
    )
    .await;
    assert_eq!(
        create.pointer("/result/servers/0/name"),
        Some(&json!("fixture"))
    );

    let start = app_server_request(
        &server,
        3,
        METHOD_MCP_SERVER_START,
        json!({ "name": "fixture" }),
    )
    .await;
    assert!(start.get("result").is_some(), "{start:?}");

    let status = app_server_request(&server, 4, METHOD_MCP_SERVER_STATUS_LIST, json!({})).await;
    assert_eq!(
        status.pointer("/result/servers/0/is_running"),
        Some(&json!(true))
    );
    assert_eq!(
        status.pointer("/result/servers/0/server_info/supports_tools"),
        Some(&json!(true))
    );
    assert_eq!(
        status.pointer("/result/servers/0/server_info/supports_resources"),
        Some(&json!(true))
    );

    let tools = app_server_request(&server, 5, METHOD_MCP_TOOL_LIST, json!({})).await;
    assert_eq!(
        tools.pointer("/result/tools/0/name"),
        Some(&json!("mcp__fixture__echo"))
    );

    let tool_result = app_server_request(
        &server,
        6,
        METHOD_MCP_TOOL_CALL,
        json!({
            "toolName": "mcp__fixture__echo",
            "arguments": {
                "message": "hello current MCP"
            }
        }),
    )
    .await;
    assert_eq!(
        tool_result.pointer("/result/content/0/text"),
        Some(&json!("echo: hello current MCP"))
    );

    let resources = app_server_request(&server, 7, METHOD_MCP_RESOURCE_LIST, json!({})).await;
    assert_eq!(
        resources.pointer("/result/resources/0/uri"),
        Some(&json!("fixture://status"))
    );

    let resource = app_server_request(
        &server,
        8,
        METHOD_MCP_RESOURCE_READ,
        json!({
            "uri": "fixture://status"
        }),
    )
    .await;
    assert_eq!(
        resource.pointer("/result/uri"),
        Some(&json!("fixture://status"))
    );
    assert_eq!(
        resource.pointer("/result/text"),
        Some(&json!("fixture resource ok"))
    );

    let stop = app_server_request(
        &server,
        9,
        METHOD_MCP_SERVER_STOP,
        json!({ "name": "fixture" }),
    )
    .await;
    assert!(stop.get("result").is_some(), "{stop:?}");
}

fn write_mcp_stdio_fixture(root: &Path) -> PathBuf {
    let path = root.join("mcp-current-fixture.mjs");
    fs::write(
        &path,
        r#"
import readline from "node:readline";

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function result(id, value) {
  send({ jsonrpc: "2.0", id, result: value });
}

function error(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

rl.on("line", (line) => {
  if (!line.trim()) return;
  const message = JSON.parse(line);
  const { id, method, params } = message;

  if (method === "initialize") {
    result(id, {
      protocolVersion: "2025-03-26",
      capabilities: {
        tools: {},
        resources: {},
      },
      serverInfo: {
        name: "fixture-mcp",
        version: "1.0.0",
      },
    });
    return;
  }

  if (method === "notifications/initialized") return;

  if (method === "tools/list") {
    result(id, {
      tools: [
        {
          name: "echo",
          description: "Echo a message for current MCP tests",
          inputSchema: {
            type: "object",
            properties: {
              message: { type: "string" },
            },
          },
        },
      ],
    });
    return;
  }

  if (method === "tools/call") {
    result(id, {
      content: [
        {
          type: "text",
          text: `echo: ${params?.arguments?.message ?? ""}`,
        },
      ],
      isError: false,
    });
    return;
  }

  if (method === "resources/list") {
    result(id, {
      resources: [
        {
          uri: "fixture://status",
          name: "status",
          description: "Current MCP fixture status",
          mimeType: "text/plain",
        },
      ],
    });
    return;
  }

  if (method === "resources/read") {
    result(id, {
      contents: [
        {
          uri: params?.uri ?? "fixture://status",
          mimeType: "text/plain",
          text: "fixture resource ok",
        },
      ],
    });
    return;
  }

  error(id, -32601, `unsupported fixture method: ${method}`);
});
"#,
    )
    .expect("write mcp fixture");
    path
}

async fn app_server_request(server: &AppServer, id: u64, method: &str, params: Value) -> Value {
    let line = json!({
        "jsonrpc": "2.0",
        "id": id,
        "method": method,
        "params": params,
    })
    .to_string();
    let responses = server
        .handle_json_line(&line)
        .await
        .expect("handle app-server request");
    assert_eq!(responses.len(), 1, "{responses:?}");
    let message = decode_message(&responses[0]).expect("decode app-server response");
    serde_json::to_value(message).expect("serialize app-server response")
}

async fn app_server_notification(server: &AppServer, method: &str, params: Value) {
    let line = json!({
        "jsonrpc": "2.0",
        "method": method,
        "params": params,
    })
    .to_string();
    let responses = server
        .handle_json_line(&line)
        .await
        .expect("handle app-server notification");
    assert!(responses.is_empty(), "{responses:?}");
}

fn insert_session(conn: &Connection, id: &str, title: &str, updated_at: &str) {
    conn.execute(
        "INSERT INTO agent_sessions (
                id, model, system_prompt, title, created_at, updated_at,
                working_dir, execution_strategy
             )
             VALUES (?1, 'agent:default', NULL, ?2, ?3, ?4, ?5, 'react')",
        params![id, title, NOW, updated_at, WORKSPACE_ROOT],
    )
    .expect("insert session");
}

fn insert_legacy_message_only_session(conn: &Connection) {
    insert_session(conn, "legacy-session", "旧消息会话", "2026-03-13T01:00:01Z");
    conn.execute(
        "INSERT INTO agent_messages (
                session_id, role, content_json, timestamp
             )
             VALUES ('legacy-session', 'user', '[{\"type\":\"text\",\"text\":\"旧消息\"}]', ?1)",
        params![NOW],
    )
    .expect("insert legacy message");
    conn.execute(
        "INSERT INTO agent_messages (
                session_id, role, content_json, timestamp
             )
             VALUES ('legacy-session', 'assistant', '[{\"type\":\"text\",\"text\":\"旧回复\"}]', ?1)",
        params!["2026-03-13T01:00:02Z"],
    )
    .expect("insert legacy assistant message");
}

fn insert_current_timeline_session(conn: &Connection) {
    insert_session(
        conn,
        "current-session",
        "Current Timeline 会话",
        "2026-03-13T01:00:03Z",
    );
    let turn = AgentThreadTurn {
        id: "turn-current".to_string(),
        thread_id: "current-session".to_string(),
        prompt_text: "帮我检查 current timeline".to_string(),
        status: AgentThreadTurnStatus::Completed,
        started_at: "2026-03-13T01:00:02Z".to_string(),
        completed_at: Some("2026-03-13T01:00:03Z".to_string()),
        error_message: None,
        created_at: "2026-03-13T01:00:02Z".to_string(),
        updated_at: "2026-03-13T01:00:03Z".to_string(),
    };
    AgentTimelineDao::create_turn(conn, &turn).expect("insert turn");
    AgentTimelineDao::upsert_item(
        conn,
        &AgentThreadItem {
            id: "item-user".to_string(),
            thread_id: "current-session".to_string(),
            turn_id: "turn-current".to_string(),
            sequence: 1,
            status: AgentThreadItemStatus::Completed,
            started_at: "2026-03-13T01:00:02Z".to_string(),
            completed_at: Some("2026-03-13T01:00:02Z".to_string()),
            updated_at: "2026-03-13T01:00:02Z".to_string(),
            payload: AgentThreadItemPayload::UserMessage {
                content: "帮我检查 current timeline".to_string(),
            },
        },
    )
    .expect("insert user item");
    AgentTimelineDao::upsert_item(
        conn,
        &AgentThreadItem {
            id: "item-agent".to_string(),
            thread_id: "current-session".to_string(),
            turn_id: "turn-current".to_string(),
            sequence: 2,
            status: AgentThreadItemStatus::Completed,
            started_at: "2026-03-13T01:00:03Z".to_string(),
            completed_at: Some("2026-03-13T01:00:03Z".to_string()),
            updated_at: "2026-03-13T01:00:03Z".to_string(),
            payload: AgentThreadItemPayload::AgentMessage {
                text: "已完成".to_string(),
                phase: None,
            },
        },
    )
    .expect("insert agent item");
}

fn table_exists_for_test(conn: &Connection, table_name: &str) -> bool {
    conn.query_row(
        "SELECT EXISTS(
            SELECT 1 FROM sqlite_master
            WHERE type = 'table' AND name = ?1
        )",
        params![table_name],
        |row| row.get::<_, bool>(0),
    )
    .expect("check table existence")
}

fn insert_hidden_harness_timeline_session(conn: &Connection) {
    insert_session(
        conn,
        "hidden-harness-session",
        "内部 Smoke 会话",
        "2026-03-13T01:00:04Z",
    );
    conn.execute(
        "UPDATE agent_sessions
             SET extension_data_json = ?1
             WHERE id = 'hidden-harness-session'",
        params![json!({
            "lime_harness.v0": {
                "hiddenFromUserRecents": true,
                "source": "smoke-fixture"
            }
        })
        .to_string()],
    )
    .expect("mark hidden harness session");
    let turn = AgentThreadTurn {
        id: "turn-hidden-harness".to_string(),
        thread_id: "hidden-harness-session".to_string(),
        prompt_text: "内部 smoke".to_string(),
        status: AgentThreadTurnStatus::Completed,
        started_at: "2026-03-13T01:00:04Z".to_string(),
        completed_at: Some("2026-03-13T01:00:05Z".to_string()),
        error_message: None,
        created_at: "2026-03-13T01:00:04Z".to_string(),
        updated_at: "2026-03-13T01:00:05Z".to_string(),
    };
    AgentTimelineDao::create_turn(conn, &turn).expect("insert hidden turn");
}

fn insert_smoke_title_timeline_session(conn: &Connection) {
    insert_session(
        conn,
        "smoke-title-session",
        "Code runtime fixture 2026-03-13T01:00:06Z",
        "2026-03-13T01:00:06Z",
    );
    let turn = AgentThreadTurn {
        id: "turn-smoke-title".to_string(),
        thread_id: "smoke-title-session".to_string(),
        prompt_text: "历史 smoke 标题".to_string(),
        status: AgentThreadTurnStatus::Completed,
        started_at: "2026-03-13T01:00:06Z".to_string(),
        completed_at: Some("2026-03-13T01:00:07Z".to_string()),
        error_message: None,
        created_at: "2026-03-13T01:00:06Z".to_string(),
        updated_at: "2026-03-13T01:00:07Z".to_string(),
    };
    AgentTimelineDao::create_turn(conn, &turn).expect("insert smoke title turn");
}

#[tokio::test]
async fn list_current_timeline_sessions_excludes_legacy_message_only_sessions() {
    let data_source = setup_data_source();
    {
        let conn = database::lock_db(&data_source.db).expect("lock db");
        insert_legacy_message_only_session(&conn);
        insert_current_timeline_session(&conn);
    }

    let response = data_source
        .list_current_timeline_sessions(AgentSessionListParams {
            workspace_id: Some(WORKSPACE_ID.to_string()),
            limit: Some(20),
            ..AgentSessionListParams::default()
        })
        .await
        .expect("list sessions");

    assert_eq!(response.sessions.len(), 1);
    assert_eq!(response.sessions[0].session_id, "current-session");
    assert_eq!(
        response.sessions[0].title.as_deref(),
        Some("Current Timeline 会话")
    );
    assert_eq!(
        response.sessions[0].workspace_id.as_deref(),
        Some(WORKSPACE_ID)
    );
    assert_eq!(response.sessions[0].messages_count, 2);
}

#[tokio::test]
async fn legacy_message_only_transcripts_can_be_read_for_backfill() {
    let data_source = setup_data_source();
    {
        let conn = database::lock_db(&data_source.db).expect("lock db");
        insert_legacy_message_only_session(&conn);
        insert_current_timeline_session(&conn);
    }

    let transcripts = data_source
        .list_legacy_agent_message_transcripts(AgentSessionListParams {
            workspace_id: Some(WORKSPACE_ID.to_string()),
            limit: Some(20),
            ..AgentSessionListParams::default()
        })
        .await
        .expect("list legacy transcripts");

    assert_eq!(transcripts.len(), 1);
    assert_eq!(transcripts[0].session_id, "legacy-session");
    assert_eq!(transcripts[0].messages.len(), 2);
    assert_eq!(transcripts[0].messages[0].text, "旧消息");
    assert_eq!(transcripts[0].messages[1].text, "旧回复");
}

#[tokio::test]
async fn clear_legacy_agent_message_sessions_removes_migrated_rows() {
    let data_source = setup_data_source();
    {
        let conn = database::lock_db(&data_source.db).expect("lock db");
        insert_legacy_message_only_session(&conn);
    }

    let deleted = data_source
        .clear_legacy_agent_message_sessions(vec!["legacy-session".to_string()])
        .await
        .expect("clear legacy rows");

    assert_eq!(deleted, 3);
    {
        let conn = database::lock_db(&data_source.db).expect("lock db");
        let message_count: i64 = conn
            .query_row(
                "SELECT COUNT(1) FROM agent_messages WHERE session_id = 'legacy-session'",
                [],
                |row| row.get(0),
            )
            .expect("message count");
        let session_count: i64 = conn
            .query_row(
                "SELECT COUNT(1) FROM agent_sessions WHERE id = 'legacy-session'",
                [],
                |row| row.get(0),
            )
            .expect("session count");
        assert_eq!(message_count, 0);
        assert_eq!(session_count, 0);
    }
}

#[tokio::test]
async fn clear_legacy_agent_message_sessions_keeps_current_timeline_rows() {
    let data_source = setup_data_source();
    {
        let conn = database::lock_db(&data_source.db).expect("lock db");
        insert_legacy_message_only_session(&conn);
        insert_current_timeline_session(&conn);
        conn.execute(
            "INSERT INTO agent_messages (
                 session_id, role, content_json, timestamp, tool_calls_json, tool_call_id
             )
             VALUES ('current-session', 'user', '[{\"type\":\"text\",\"text\":\"仍在 current timeline 的旧消息\"}]', ?1, NULL, NULL)",
            params![NOW],
        )
        .expect("insert current timeline legacy message");
    }

    let deleted = data_source
        .clear_legacy_agent_message_sessions(vec![
            "legacy-session".to_string(),
            "current-session".to_string(),
        ])
        .await
        .expect("clear legacy rows");

    assert_eq!(deleted, 3);
    {
        let conn = database::lock_db(&data_source.db).expect("lock db");
        let legacy_message_count: i64 = conn
            .query_row(
                "SELECT COUNT(1) FROM agent_messages WHERE session_id = 'legacy-session'",
                [],
                |row| row.get(0),
            )
            .expect("legacy message count");
        let current_message_count: i64 = conn
            .query_row(
                "SELECT COUNT(1) FROM agent_messages WHERE session_id = 'current-session'",
                [],
                |row| row.get(0),
            )
            .expect("current message count");
        let current_session_count: i64 = conn
            .query_row(
                "SELECT COUNT(1) FROM agent_sessions WHERE id = 'current-session'",
                [],
                |row| row.get(0),
            )
            .expect("current session count");
        assert_eq!(legacy_message_count, 0);
        assert_eq!(current_message_count, 1);
        assert_eq!(current_session_count, 1);
    }
}

#[tokio::test]
async fn drop_empty_legacy_agent_message_tables_drops_only_empty_legacy_tables() {
    let data_source = setup_data_source();
    {
        let conn = database::lock_db(&data_source.db).expect("lock db");
        insert_legacy_message_only_session(&conn);
    }

    data_source
        .clear_legacy_agent_message_sessions(vec!["legacy-session".to_string()])
        .await
        .expect("clear legacy rows");
    let dropped = data_source
        .drop_empty_legacy_agent_message_tables()
        .await
        .expect("drop empty legacy tables");

    assert_eq!(dropped, 2);
    {
        let conn = database::lock_db(&data_source.db).expect("lock db");
        assert!(!table_exists_for_test(&conn, "agent_messages"));
        assert!(!table_exists_for_test(&conn, "a2ui_forms"));
        assert!(table_exists_for_test(&conn, "agent_sessions"));
    }
}

#[tokio::test]
async fn legacy_message_backfill_noops_after_legacy_tables_are_dropped() {
    let data_source = setup_data_source();
    {
        let conn = database::lock_db(&data_source.db).expect("lock db");
        insert_legacy_message_only_session(&conn);
    }

    data_source
        .clear_legacy_agent_message_sessions(vec!["legacy-session".to_string()])
        .await
        .expect("clear legacy rows");
    data_source
        .drop_empty_legacy_agent_message_tables()
        .await
        .expect("drop empty legacy tables");

    let transcripts = data_source
        .list_legacy_agent_message_transcripts(AgentSessionListParams {
            workspace_id: Some(WORKSPACE_ID.to_string()),
            ..AgentSessionListParams::default()
        })
        .await
        .expect("list legacy transcripts after drop");
    let transcript = data_source
        .read_legacy_agent_message_transcript("legacy-session".to_string())
        .await
        .expect("read legacy transcript after drop");
    let cleared = data_source
        .clear_legacy_agent_message_sessions(vec!["legacy-session".to_string()])
        .await
        .expect("clear legacy rows after drop");

    assert!(transcripts.is_empty());
    assert!(transcript.is_none());
    assert_eq!(cleared, 0);
}

#[tokio::test]
async fn drop_empty_legacy_agent_message_tables_fails_when_rows_remain() {
    let data_source = setup_data_source();
    {
        let conn = database::lock_db(&data_source.db).expect("lock db");
        insert_legacy_message_only_session(&conn);
    }

    let result = data_source.drop_empty_legacy_agent_message_tables().await;

    assert!(
        matches!(result, Err(crate::RuntimeCoreError::Backend(ref message)) if message.contains("refuse to drop agent_messages")),
        "{result:?}"
    );
    {
        let conn = database::lock_db(&data_source.db).expect("lock db");
        assert!(table_exists_for_test(&conn, "agent_messages"));
        assert!(table_exists_for_test(&conn, "a2ui_forms"));
    }
}

#[tokio::test]
async fn list_current_timeline_sessions_orders_by_latest_timeline_activity() {
    let data_source = setup_data_source();
    {
        let conn = database::lock_db(&data_source.db).expect("lock db");
        insert_session(
            &conn,
            "older-metadata-newer-timeline",
            "Timeline 最新",
            "2026-03-13T01:00:00Z",
        );
        let turn = AgentThreadTurn {
            id: "turn-newer".to_string(),
            thread_id: "older-metadata-newer-timeline".to_string(),
            prompt_text: "新 timeline".to_string(),
            status: AgentThreadTurnStatus::Completed,
            started_at: "2026-03-13T02:00:00Z".to_string(),
            completed_at: Some("2026-03-13T02:00:01Z".to_string()),
            error_message: None,
            created_at: "2026-03-13T02:00:00Z".to_string(),
            updated_at: "2026-03-13T02:00:01Z".to_string(),
        };
        AgentTimelineDao::create_turn(&conn, &turn).expect("insert newer turn");
        AgentTimelineDao::upsert_item(
            &conn,
            &AgentThreadItem {
                id: "item-newer".to_string(),
                thread_id: "older-metadata-newer-timeline".to_string(),
                turn_id: "turn-newer".to_string(),
                sequence: 1,
                status: AgentThreadItemStatus::Completed,
                started_at: "2026-03-13T02:00:00Z".to_string(),
                completed_at: Some("2026-03-13T02:00:01Z".to_string()),
                updated_at: "2026-03-13T02:00:01Z".to_string(),
                payload: AgentThreadItemPayload::AgentMessage {
                    text: "新结果".to_string(),
                    phase: None,
                },
            },
        )
        .expect("insert newer item");

        insert_session(
            &conn,
            "newer-metadata-older-timeline",
            "元数据更新但 timeline 更旧",
            "2026-03-13T03:00:00Z",
        );
        let older_turn = AgentThreadTurn {
            id: "turn-older".to_string(),
            thread_id: "newer-metadata-older-timeline".to_string(),
            prompt_text: "旧 timeline".to_string(),
            status: AgentThreadTurnStatus::Completed,
            started_at: "2026-03-13T01:30:00Z".to_string(),
            completed_at: Some("2026-03-13T01:30:01Z".to_string()),
            error_message: None,
            created_at: "2026-03-13T01:30:00Z".to_string(),
            updated_at: "2026-03-13T01:30:01Z".to_string(),
        };
        AgentTimelineDao::create_turn(&conn, &older_turn).expect("insert older turn");
    }

    let response = data_source
        .list_current_timeline_sessions(AgentSessionListParams {
            workspace_id: None,
            limit: Some(20),
            ..AgentSessionListParams::default()
        })
        .await
        .expect("list sessions");

    assert_eq!(
        response.sessions[0].session_id,
        "older-metadata-newer-timeline"
    );
    assert_eq!(response.sessions[0].updated_at, "2026-03-13T02:00:01Z");
}

#[tokio::test]
async fn list_current_timeline_sessions_excludes_harness_hidden_sessions() {
    let data_source = setup_data_source();
    {
        let conn = database::lock_db(&data_source.db).expect("lock db");
        insert_current_timeline_session(&conn);
        insert_hidden_harness_timeline_session(&conn);
        insert_smoke_title_timeline_session(&conn);
    }

    let response = data_source
        .list_current_timeline_sessions(AgentSessionListParams {
            workspace_id: Some(WORKSPACE_ID.to_string()),
            limit: Some(20),
            ..AgentSessionListParams::default()
        })
        .await
        .expect("list sessions");

    let ids = response
        .sessions
        .iter()
        .map(|session| session.session_id.as_str())
        .collect::<Vec<_>>();
    assert_eq!(ids, vec!["current-session"]);

    let hidden = data_source
        .read_current_timeline_session(AgentSessionReadParams {
            session_id: "hidden-harness-session".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .await
        .expect("read hidden session")
        .expect("hidden session remains readable by id");
    assert_eq!(hidden.session.session_id, "hidden-harness-session");
}

#[tokio::test]
async fn update_current_timeline_session_updates_title_and_archive_state() {
    let data_source = setup_data_source();
    {
        let conn = database::lock_db(&data_source.db).expect("lock db");
        insert_current_timeline_session(&conn);
    }

    let updated = data_source
        .update_current_timeline_session(AgentSessionUpdateParams {
            session_id: "current-session".to_string(),
            title: Some("更新后的对话".to_string()),
            archived: Some(true),
            provider_selector: Some("custom-provider".to_string()),
            provider_name: Some("OpenAI Compatible".to_string()),
            model_name: Some("gpt-5.4".to_string()),
            execution_strategy: Some("react".to_string()),
            recent_access_mode: Some("full-access".to_string()),
            recent_preferences: Some(json!({
                "task": true,
                "subagent": false
            })),
            recent_team_selection: Some(json!({
                "disabled": true
            })),
            ..AgentSessionUpdateParams::default()
        })
        .await
        .expect("update current session");

    assert_eq!(updated.session.session_id, "current-session");
    assert_eq!(updated.session.title.as_deref(), Some("更新后的对话"));
    assert!(updated.session.archived_at.is_some());

    let recent = data_source
        .list_current_timeline_sessions(AgentSessionListParams {
            workspace_id: Some(WORKSPACE_ID.to_string()),
            limit: Some(20),
            ..AgentSessionListParams::default()
        })
        .await
        .expect("list recent sessions");
    assert!(recent.sessions.is_empty());

    let archived = data_source
        .list_current_timeline_sessions(AgentSessionListParams {
            archived_only: Some(true),
            workspace_id: Some(WORKSPACE_ID.to_string()),
            limit: Some(20),
            ..AgentSessionListParams::default()
        })
        .await
        .expect("list archived sessions");
    assert_eq!(archived.sessions.len(), 1);
    assert_eq!(archived.sessions[0].session_id, "current-session");
    assert_eq!(archived.sessions[0].model, "gpt-5.4");
    assert_eq!(
        archived.sessions[0].execution_strategy.as_deref(),
        Some("react")
    );

    let detail = data_source
        .read_current_timeline_session(AgentSessionReadParams {
            session_id: "current-session".to_string(),
            history_limit: Some(10),
            history_offset: Some(0),
            history_before_message_id: None,
        })
        .await
        .expect("read updated session")
        .expect("updated session detail")
        .detail
        .expect("compat detail");
    assert_eq!(
        detail.pointer("/execution_runtime/provider_selector"),
        Some(&json!("custom-provider"))
    );
    assert_eq!(
        detail.pointer("/execution_runtime/provider_name"),
        Some(&json!("OpenAI Compatible"))
    );
    assert_eq!(
        detail.pointer("/execution_runtime/model_name"),
        Some(&json!("gpt-5.4"))
    );
    assert_eq!(
        detail.pointer("/execution_runtime/recent_access_mode"),
        Some(&json!("full-access"))
    );
    assert_eq!(
        detail.pointer("/execution_runtime/recent_preferences/task"),
        Some(&json!(true))
    );
    assert_eq!(
        detail.pointer("/execution_runtime/recent_team_selection/disabled"),
        Some(&json!(true))
    );
}

#[tokio::test]
async fn read_current_timeline_session_returns_compat_detail_with_turns_and_items() {
    let data_source = setup_data_source();
    {
        let conn = database::lock_db(&data_source.db).expect("lock db");
        insert_legacy_message_only_session(&conn);
        insert_current_timeline_session(&conn);
    }

    let missing_legacy = data_source
        .read_current_timeline_session(AgentSessionReadParams {
            session_id: "legacy-session".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .await
        .expect("read legacy session");
    assert!(missing_legacy.is_none());

    let response = data_source
        .read_current_timeline_session(AgentSessionReadParams {
            session_id: "current-session".to_string(),
            history_limit: Some(10),
            history_offset: Some(0),
            history_before_message_id: None,
        })
        .await
        .expect("read current session")
        .expect("current session detail");

    assert_eq!(response.session.session_id, "current-session");
    assert_eq!(response.turns.len(), 1);
    assert_eq!(response.turns[0].turn_id, "turn-current");
    let detail = response.detail.expect("compat detail");
    assert_eq!(detail["id"], "current-session");
    assert_eq!(detail["messages_count"], 2);
    assert_eq!(detail["messages"].as_array().expect("messages").len(), 0);
    assert_eq!(detail["turns"].as_array().expect("turns").len(), 1);
    assert_eq!(detail["items"].as_array().expect("items").len(), 2);
    assert_eq!(detail["history_cursor"]["loaded_count"], 2);
}
