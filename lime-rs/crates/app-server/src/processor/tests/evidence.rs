//! evidence request processor tests.

use super::super::*;
use crate::SidecarStore;
use app_server_protocol::{
    AgentSessionStartParams, ClientCapabilities, JsonRpcMessage, RequestId, METHOD_EVIDENCE_EXPORT,
    METHOD_INITIALIZE, METHOD_INITIALIZED,
};
use serde_json::json;
use std::sync::Arc;

#[tokio::test]
async fn evidence_export_requires_initialized_and_returns_read_model_snapshot() {
    let sidecar_root = tempfile::tempdir().expect("sidecar root");
    let runtime = RuntimeCore::default().with_sidecar_store(Arc::new(
        SidecarStore::new(sidecar_root.path()).expect("sidecar store"),
    ));
    runtime
        .start_session(AgentSessionStartParams {
            session_id: Some("sess_evidence".to_string()),
            thread_id: Some("thread_evidence".to_string()),
            app_id: "content-studio".to_string(),
            workspace_id: Some("workspace-main".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session");
    runtime
        .start_turn(
            app_server_protocol::AgentSessionTurnStartParams {
                session_id: "sess_evidence".to_string(),
                turn_id: Some("turn_evidence".to_string()),
                input: app_server_protocol::AgentInput {
                    text: "draft".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: None,
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("turn");
    runtime
        .append_external_runtime_events(
            "sess_evidence",
            Some("turn_evidence"),
            vec![
                crate::RuntimeEvent::new(
                    "message.delta",
                    json!({
                        "text": "draft",
                        "evidenceRefs": ["evidence://sess_evidence/runtime"]
                    }),
                ),
                crate::RuntimeEvent::new(
                    "artifact.snapshot",
                    json!({
                        "artifactId": "artifact-report",
                        "path": ".app-server/artifacts/report.md",
                        "content": "# Report"
                    }),
                ),
            ],
        )
        .expect("evidence events");

    let processor = RequestProcessor::new(runtime);
    let blocked = processor
        .handle_request(JsonRpcRequest::new(
            RequestId::Integer(1),
            METHOD_EVIDENCE_EXPORT,
            Some(json!({ "sessionId": "sess_evidence" })),
        ))
        .await
        .expect("blocked response");
    assert!(matches!(
        &blocked[0],
        JsonRpcMessage::Error(error) if error.error.code == error_codes::NOT_INITIALIZED
    ));

    let initialize = processor
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
    match &initialize[0] {
        JsonRpcMessage::Response(response) => {
            assert_eq!(response.result["capabilities"]["evidence"], true);
        }
        other => panic!("expected initialize response, got {other:?}"),
    }
    processor.handle_notification(JsonRpcNotification::new(
        METHOD_INITIALIZED,
        Some(json!({})),
    ));

    let messages = processor
        .handle_request(JsonRpcRequest::new(
            RequestId::Integer(3),
            METHOD_EVIDENCE_EXPORT,
            Some(json!({
                "sessionId": "sess_evidence",
                "turnId": "turn_evidence",
                "includeEvents": true,
                "includeArtifacts": true
            })),
        ))
        .await
        .expect("evidence export response");

    match &messages[0] {
        JsonRpcMessage::Response(response) => {
            assert_eq!(response.result["session"]["sessionId"], "sess_evidence");
            assert_eq!(response.result["events"].as_array().unwrap().len(), 4);
            assert_eq!(
                response.result["artifacts"][0]["artifactRef"],
                "artifact-report"
            );
            assert!(response.result["artifacts"][0].get("content").is_none());
            assert!(!response.result["exportedAt"].as_str().unwrap().is_empty());
            assert!(response.result.get("threadStatus").is_none());
            assert!(response.result.get("completionAuditSummary").is_none());
        }
        other => panic!("expected response, got {other:?}"),
    }
}
