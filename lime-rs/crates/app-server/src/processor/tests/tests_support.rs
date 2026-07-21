//! Shared helpers for request processor tests.

use super::super::*;
use app_server_protocol::CapabilityDescriptor;
use app_server_protocol::ClientCapabilities;
use app_server_protocol::RequestId;
use app_server_protocol::METHOD_INITIALIZE;
use app_server_protocol::METHOD_INITIALIZED;
use app_server_protocol::METHOD_THREAD_START;
use app_server_protocol::METHOD_WORKSPACE_RIGHT_SURFACE_PENDING_CHANGED;
use serde_json::json;

pub(super) struct ScopedCapabilitySource;

impl crate::CapabilitySource for ScopedCapabilitySource {
    fn list_capabilities(
        &self,
        context: &crate::CapabilityListContext,
    ) -> Vec<CapabilityDescriptor> {
        vec![CapabilityDescriptor {
            id: format!("scoped.{}", context.app_id.as_deref().unwrap_or("unscoped")),
            title: "Scoped Capability".to_string(),
            description: context.workspace_id.clone(),
            methods: vec![METHOD_THREAD_START.to_string()],
        }]
    }
}

pub(super) async fn initialize_processor(processor: &RequestProcessor) {
    processor
        .handle_request(JsonRpcRequest::new(
            RequestId::Integer(1),
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
}

pub(super) fn assert_right_surface_pending_changed_notification(
    message: &JsonRpcMessage,
    change_type: &str,
    request_ids: serde_json::Value,
) {
    match message {
        JsonRpcMessage::Notification(notification) => {
            assert_eq!(
                notification.method,
                METHOD_WORKSPACE_RIGHT_SURFACE_PENDING_CHANGED
            );
            let params = notification.params.as_ref().expect("notification params");
            assert_eq!(params["changeType"], change_type);
            assert_eq!(params["requestIds"], request_ids);
        }
        other => panic!("expected right surface notification, got {other:?}"),
    }
}
