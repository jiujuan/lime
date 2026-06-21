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
        memory_backend: Arc::new(LocalMemoryBackend::new(
            std::env::temp_dir().join("app-server-local-data-source-test-memory"),
        )),
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
    assert_eq!(
        resources.pointer("/result/resourceTemplates/0/uri_template"),
        Some(&json!("fixture://item/{id}"))
    );
    assert_eq!(
        resources.pointer("/result/resourceTemplates/0/server_name"),
        Some(&json!("fixture"))
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

  if (method === "resources/templates/list") {
    result(id, {
      resourceTemplates: [
        {
          uriTemplate: "fixture://item/{id}",
          name: "fixture-item",
          title: "Fixture Item",
          description: "Current MCP fixture resource template",
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
