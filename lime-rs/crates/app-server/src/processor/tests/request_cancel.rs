use super::tests_support::initialize_processor;
use crate::RuntimeCore;
use crate::RuntimeEvent;
use crate::processor::RequestProcessor;
use crate::runtime::sidecar_store::{SidecarBytesWriteRequest, SidecarStore};
use app_server_protocol::AgentSessionStartParams;
use app_server_protocol::JsonRpcMessage;
use app_server_protocol::JsonRpcNotification;
use app_server_protocol::JsonRpcRequest;
use app_server_protocol::METHOD_AGENT_SESSION_MEDIA_READ;
use app_server_protocol::METHOD_AGENT_SESSION_LIST;
use app_server_protocol::METHOD_CANCEL_REQUEST;
use app_server_protocol::RequestId;
use app_server_protocol::error_codes;
use serde_json::json;
use std::sync::Arc;

#[tokio::test]
async fn cancel_request_notification_fails_matching_request_id_closed() {
    let processor = RequestProcessor::new(RuntimeCore::default());
    initialize_processor(&processor).await;

    processor.handle_notification(JsonRpcNotification::new(
        METHOD_CANCEL_REQUEST,
        Some(json!({ "id": 7 })),
    ));

    let messages = processor
        .handle_request(JsonRpcRequest::new(
            RequestId::Integer(7),
            METHOD_AGENT_SESSION_LIST,
            Some(json!({})),
        ))
        .await
        .expect("request");

    let [JsonRpcMessage::Error(error)] = messages.as_slice() else {
        panic!("expected canceled request error, got {messages:?}");
    };
    assert_eq!(error.id, RequestId::Integer(7));
    assert_eq!(error.error.code, error_codes::REQUEST_CANCELLED);
    assert_eq!(error.error.message, "request canceled");
}

#[tokio::test]
async fn cancel_request_notification_cancels_media_read_before_sidecar_io() {
    let temp = tempfile::tempdir().expect("sidecar tempdir");
    let sidecar_store = Arc::new(SidecarStore::new(temp.path()).expect("sidecar store"));
    let runtime = RuntimeCore::default().with_sidecar_store(sidecar_store.clone());
    runtime
        .start_session(AgentSessionStartParams {
            session_id: Some("sess-media-cancel".to_string()),
            thread_id: Some("thread-media-cancel".to_string()),
            app_id: "agent-chat".to_string(),
            workspace_id: Some("default".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session");
    let sidecar_ref = sidecar_store
        .write_bytes(&SidecarBytesWriteRequest {
            session_id: "sess-media-cancel".to_string(),
            kind: "media".to_string(),
            logical_id: "fixture-image".to_string(),
            relative_path: "sessions/sess-media-cancel/media/fixture-image.png".to_string(),
            content: vec![0x89, b'P', b'N', b'G'],
        })
        .expect("write media sidecar");
    runtime
        .append_runtime_events(
            "sess-media-cancel",
            "thread-media-cancel",
            Some("turn-media-cancel"),
            vec![RuntimeEvent::new(
                "message.delta",
                json!({
                    "contentPart": {
                        "type": "media",
                        "reference": {
                            "uri": sidecar_ref.ref_id,
                            "sidecarRef": sidecar_ref
                        }
                    }
                }),
            )],
        )
        .expect("append media ref");
    let processor = RequestProcessor::new(runtime);
    initialize_processor(&processor).await;

    processor.handle_notification(JsonRpcNotification::new(
        METHOD_CANCEL_REQUEST,
        Some(json!({ "id": 9 })),
    ));

    let messages = processor
        .handle_request(JsonRpcRequest::new(
            RequestId::Integer(9),
            METHOD_AGENT_SESSION_MEDIA_READ,
            Some(json!({
                "sessionId": "sess-media-cancel",
                "uri": sidecar_ref.ref_id,
                "maxBytes": 1024
            })),
        ))
        .await
        .expect("request");

    let [JsonRpcMessage::Error(error)] = messages.as_slice() else {
        panic!("expected canceled media read error, got {messages:?}");
    };
    assert_eq!(error.id, RequestId::Integer(9));
    assert_eq!(error.error.code, error_codes::REQUEST_CANCELLED);
    assert_eq!(error.error.message, "request canceled");
}
