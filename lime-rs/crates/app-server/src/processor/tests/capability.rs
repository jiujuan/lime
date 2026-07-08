//! capability request processor tests.

use super::super::*;
use super::tests_support::*;
use app_server_protocol::{
    ClientCapabilities, JsonRpcMessage, METHOD_AGENT_SESSION_START, METHOD_CAPABILITY_LIST,
    METHOD_INITIALIZE, METHOD_INITIALIZED, RequestId,
};
use serde_json::json;
use std::sync::Arc;

#[tokio::test]
async fn capability_list_requires_initialized_and_returns_minimal_descriptors() {
    let runtime = RuntimeCore::with_backend_and_capability_source(
        Arc::new(crate::MockBackend),
        Arc::new(ScopedCapabilitySource),
    );
    let processor = RequestProcessor::new(runtime);

    let blocked = processor
        .handle_request(JsonRpcRequest::new(
            RequestId::Integer(1),
            METHOD_CAPABILITY_LIST,
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

    let messages = processor
        .handle_request(JsonRpcRequest::new(
            RequestId::Integer(3),
            METHOD_CAPABILITY_LIST,
            Some(json!({
                "appId": "content-studio",
                "workspaceId": "workspace-main",
            })),
        ))
        .await
        .expect("capability list response");

    match &messages[0] {
        JsonRpcMessage::Response(response) => {
            assert_eq!(
                response.result["capabilities"][0]["id"],
                "scoped.content-studio"
            );
            assert_eq!(
                response.result["capabilities"][0]["description"],
                "workspace-main"
            );
            assert_eq!(
                response.result["capabilities"][0]["methods"][0],
                METHOD_AGENT_SESSION_START
            );
        }
        other => panic!("expected response, got {other:?}"),
    }
}
