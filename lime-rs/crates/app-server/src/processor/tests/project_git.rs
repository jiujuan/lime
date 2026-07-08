//! project git request processor tests.

use super::super::*;
use app_server_protocol::{
    ClientCapabilities, JsonRpcMessage, RequestId, METHOD_INITIALIZE, METHOD_INITIALIZED,
    METHOD_PROJECT_GIT_STATUS,
};
use serde_json::json;

#[tokio::test]
async fn project_git_status_requires_initialized_and_returns_local_mode_for_plain_directory() {
    let processor = RequestProcessor::new(RuntimeCore::default());
    let blocked = processor
        .handle_request(JsonRpcRequest::new(
            RequestId::Integer(1),
            METHOD_PROJECT_GIT_STATUS,
            Some(json!({ "rootPath": "." })),
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

    let temp_dir = tempfile::tempdir().expect("temp dir");
    let messages = processor
        .handle_request(JsonRpcRequest::new(
            RequestId::Integer(3),
            METHOD_PROJECT_GIT_STATUS,
            Some(json!({ "rootPath": temp_dir.path() })),
        ))
        .await
        .expect("project git status response");

    match &messages[0] {
        JsonRpcMessage::Response(response) => {
            assert_eq!(response.result["hasGitRepository"], false);
            assert_eq!(response.result["branches"], serde_json::json!([]));
            assert_eq!(response.result["uncommittedFileCount"], 0);
            assert!(response.result.get("currentBranch").is_none());
            assert!(response.result.get("repositoryRoot").is_none());
        }
        other => panic!("expected response, got {other:?}"),
    }
}
