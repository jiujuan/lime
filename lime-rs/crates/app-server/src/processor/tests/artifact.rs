//! artifact request processor tests.

use super::super::*;
use crate::SidecarStore;
use app_server_protocol::{
    AgentSessionStartParams, ClientCapabilities, JsonRpcMessage, METHOD_ARTIFACT_READ,
    METHOD_INITIALIZE, METHOD_INITIALIZED, RequestId,
};
use serde_json::json;
use std::sync::Arc;

#[tokio::test]
async fn artifact_read_requires_initialized_and_returns_artifact_summaries() {
    let sidecar_root = tempfile::tempdir().expect("sidecar root");
    let runtime = RuntimeCore::default().with_sidecar_store(Arc::new(
        SidecarStore::new(sidecar_root.path()).expect("sidecar store"),
    ));
    runtime
        .start_session(AgentSessionStartParams {
            session_id: Some("sess_artifact".to_string()),
            thread_id: Some("thread_artifact".to_string()),
            app_id: "content-studio".to_string(),
            workspace_id: Some("workspace-main".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session");
    runtime
        .append_external_runtime_events(
            "sess_artifact",
            None,
            vec![crate::RuntimeEvent::new(
                "artifact.snapshot",
                json!({
                    "artifactId": "artifact-report",
                    "filePath": ".app-server/artifacts/report.md",
                    "title": "Report",
                    "kind": "markdown",
                    "status": "ready",
                    "content": "# Report",
                }),
            )],
        )
        .expect("artifact event");

    let processor = RequestProcessor::new(runtime);
    let blocked = processor
        .handle_request(JsonRpcRequest::new(
            RequestId::Integer(1),
            METHOD_ARTIFACT_READ,
            Some(json!({ "sessionId": "sess_artifact" })),
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
            METHOD_ARTIFACT_READ,
            Some(json!({
                "sessionId": "sess_artifact",
                "artifactRef": "artifact-report",
            })),
        ))
        .await
        .expect("artifact read response");

    match &messages[0] {
        JsonRpcMessage::Response(response) => {
            assert_eq!(
                response.result["artifacts"][0]["artifactRef"],
                "artifact-report"
            );
            assert_eq!(
                response.result["artifacts"][0]["path"],
                ".app-server/artifacts/report.md"
            );
            assert_eq!(response.result["artifacts"][0]["title"], "Report");
            assert_eq!(
                response.result["artifacts"][0]["contentStatus"],
                "notRequested"
            );
            assert!(response.result["artifacts"][0].get("content").is_none());
        }
        other => panic!("expected response, got {other:?}"),
    }
}
