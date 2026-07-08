//! mcp request processor tests.

use super::super::*;
use app_server_protocol::{
    ClientCapabilities, JsonRpcMessage, METHOD_INITIALIZE, METHOD_INITIALIZED,
    METHOD_MCP_PROMPT_GET, METHOD_MCP_PROMPT_LIST, METHOD_MCP_RESOURCE_LIST,
    METHOD_MCP_RESOURCE_READ, METHOD_MCP_RESOURCE_SUBSCRIBE, METHOD_MCP_RESOURCE_UNSUBSCRIBE,
    METHOD_MCP_SERVER_CREATE, METHOD_MCP_SERVER_DELETE, METHOD_MCP_SERVER_ENABLED_SET,
    METHOD_MCP_SERVER_IMPORT_FROM_APP, METHOD_MCP_SERVER_LIST, METHOD_MCP_SERVER_START,
    METHOD_MCP_SERVER_STATUS_LIST, METHOD_MCP_SERVER_STOP, METHOD_MCP_SERVER_SYNC_ALL_TO_LIVE,
    METHOD_MCP_SERVER_UPDATE, METHOD_MCP_TOOL_CALL, METHOD_MCP_TOOL_CALL_WITH_CALLER,
    METHOD_MCP_TOOL_LIST, RequestId,
};
use serde_json::json;

#[tokio::test]
async fn mcp_list_methods_require_initialized_and_return_current_empty_state() {
    let processor = RequestProcessor::new(RuntimeCore::default());
    let blocked = processor
        .handle_request(JsonRpcRequest::new(
            RequestId::Integer(1),
            METHOD_MCP_TOOL_LIST,
            Some(json!({})),
        ))
        .await
        .expect("blocked response");
    assert!(matches!(
        &blocked[0],
        JsonRpcMessage::Error(error) if error.error.code == error_codes::NOT_INITIALIZED
    ));

    processor
        .handle_request(JsonRpcRequest::new(
            RequestId::Integer(2),
            METHOD_INITIALIZE,
            Some(
                serde_json::to_value(InitializeParams {
                    client_info: ClientInfo {
                        name: "test-client".to_string(),
                        title: None,
                        version: None,
                    },
                    capabilities: ClientCapabilities::default(),
                })
                .expect("initialize params"),
            ),
        ))
        .await
        .expect("initialize");
    processor.handle_notification(JsonRpcNotification::new(
        METHOD_INITIALIZED,
        Some(json!({})),
    ));

    let cases = [
        (RequestId::Integer(3), METHOD_MCP_SERVER_LIST, "servers"),
        (
            RequestId::Integer(4),
            METHOD_MCP_SERVER_STATUS_LIST,
            "servers",
        ),
        (RequestId::Integer(5), METHOD_MCP_TOOL_LIST, "tools"),
        (RequestId::Integer(6), METHOD_MCP_PROMPT_LIST, "prompts"),
        (RequestId::Integer(7), METHOD_MCP_RESOURCE_LIST, "resources"),
    ];

    for (id, method, field) in cases {
        let messages = processor
            .handle_request(JsonRpcRequest::new(id, method, Some(json!({}))))
            .await
            .expect("mcp list response");

        match &messages[0] {
            JsonRpcMessage::Response(response) => {
                assert_eq!(response.result[field], json!([]));
            }
            other => panic!("expected response, got {other:?}"),
        }
    }
}

#[tokio::test]
async fn mcp_runtime_methods_require_initialized_and_fail_closed_without_manager() {
    let processor = RequestProcessor::new(RuntimeCore::default());
    let blocked = processor
        .handle_request(JsonRpcRequest::new(
            RequestId::Integer(1),
            METHOD_MCP_TOOL_CALL,
            Some(json!({
                "toolName": "mcp__docs__search",
                "arguments": {},
            })),
        ))
        .await
        .expect("blocked response");
    assert!(matches!(
        &blocked[0],
        JsonRpcMessage::Error(error) if error.error.code == error_codes::NOT_INITIALIZED
    ));

    processor
        .handle_request(JsonRpcRequest::new(
            RequestId::Integer(2),
            METHOD_INITIALIZE,
            Some(
                serde_json::to_value(InitializeParams {
                    client_info: ClientInfo {
                        name: "test-client".to_string(),
                        title: None,
                        version: None,
                    },
                    capabilities: ClientCapabilities::default(),
                })
                .expect("initialize params"),
            ),
        ))
        .await
        .expect("initialize");
    processor.handle_notification(JsonRpcNotification::new(
        METHOD_INITIALIZED,
        Some(json!({})),
    ));

    let cases = [
        (
            RequestId::Integer(3),
            METHOD_MCP_SERVER_CREATE,
            json!({
                "server": {
                    "id": "server-1",
                    "name": "docs",
                    "server_config": { "command": "node" },
                    "enabled_lime": true,
                    "enabled_claude": false,
                    "enabled_codex": true,
                    "enabled_gemini": false,
                }
            }),
        ),
        (
            RequestId::Integer(4),
            METHOD_MCP_SERVER_UPDATE,
            json!({
                "server": {
                    "id": "server-1",
                    "name": "docs",
                    "server_config": { "command": "node" },
                    "enabled_lime": true,
                    "enabled_claude": false,
                    "enabled_codex": true,
                    "enabled_gemini": false,
                }
            }),
        ),
        (
            RequestId::Integer(5),
            METHOD_MCP_SERVER_DELETE,
            json!({ "id": "server-1" }),
        ),
        (
            RequestId::Integer(6),
            METHOD_MCP_SERVER_ENABLED_SET,
            json!({ "id": "server-1", "appType": "codex", "enabled": true }),
        ),
        (
            RequestId::Integer(7),
            METHOD_MCP_SERVER_IMPORT_FROM_APP,
            json!({ "appType": "codex" }),
        ),
        (
            RequestId::Integer(8),
            METHOD_MCP_SERVER_SYNC_ALL_TO_LIVE,
            json!({}),
        ),
        (
            RequestId::Integer(9),
            METHOD_MCP_SERVER_START,
            json!({ "name": "docs" }),
        ),
        (
            RequestId::Integer(10),
            METHOD_MCP_SERVER_STOP,
            json!({ "name": "docs" }),
        ),
        (
            RequestId::Integer(11),
            METHOD_MCP_TOOL_CALL,
            json!({ "toolName": "mcp__docs__search", "arguments": {} }),
        ),
        (
            RequestId::Integer(12),
            METHOD_MCP_TOOL_CALL_WITH_CALLER,
            json!({
                "toolName": "mcp__docs__search",
                "arguments": {},
                "caller": "assistant",
            }),
        ),
        (
            RequestId::Integer(13),
            METHOD_MCP_PROMPT_GET,
            json!({ "name": "docs_prompt", "arguments": {} }),
        ),
        (
            RequestId::Integer(14),
            METHOD_MCP_RESOURCE_READ,
            json!({ "uri": "docs://readme" }),
        ),
        (
            RequestId::Integer(15),
            METHOD_MCP_RESOURCE_SUBSCRIBE,
            json!({ "uri": "docs://readme" }),
        ),
        (
            RequestId::Integer(16),
            METHOD_MCP_RESOURCE_UNSUBSCRIBE,
            json!({ "uri": "docs://readme" }),
        ),
    ];

    for (id, method, params) in cases {
        let messages = processor
            .handle_request(JsonRpcRequest::new(id, method, Some(params)))
            .await
            .expect("mcp runtime response");

        match &messages[0] {
            JsonRpcMessage::Error(error) => {
                assert_eq!(error.error.code, error_codes::RUNTIME_ERROR);
            }
            other => panic!("expected runtime error, got {other:?}"),
        }
    }
}
