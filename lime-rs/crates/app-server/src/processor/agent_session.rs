//! agent_session domain handlers for the App Server processor.

use super::{
    dispatch_result, dispatch_result_with_events, parse_params,
    project_event_notifications_jsonrpc, to_jsonrpc_error,
    v2_notifications::V2NotificationProjector, RequestProcessor, RpcDispatch,
};
use crate::RuntimeEvent;
use app_server_protocol::{
    AgentSessionCompactParams, AgentSessionDeleteParams, AgentSessionFileCheckpointDiffParams,
    AgentSessionFileCheckpointGetParams, AgentSessionFileCheckpointListParams,
    AgentSessionFileCheckpointRestoreParams, AgentSessionMediaReadParams,
    AgentSessionObjectiveAuditParams, AgentSessionObjectiveClearParams,
    AgentSessionObjectiveContinueParams, AgentSessionObjectiveReadParams,
    AgentSessionObjectiveSetParams, AgentSessionObjectiveStatusUpdateParams,
    AgentSessionQueuedTurnPromoteParams, AgentSessionQueuedTurnRemoveParams,
    AgentSessionRuntimeEventAppendParams, AgentSessionRuntimeEventAppendResponse,
    AgentSessionToolInventoryReadParams, AgentSessionUpdateParams, JsonRpcError, JsonRpcMessage,
    RequestId,
};

impl RequestProcessor {
    pub(super) async fn handle_session_update_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionUpdateParams = parse_params(params)?;
        let response = self
            .runtime
            .update_session_current(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_session_delete_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionDeleteParams = parse_params(params)?;
        let response = self
            .runtime
            .delete_agent_session(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_session_media_read_impl(
        &self,
        request_id: &RequestId,
        params: Option<serde_json::Value>,
        event_callback: Option<&mut (dyn FnMut(JsonRpcMessage) + Send)>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionMediaReadParams = parse_params(params)?;
        let response = if params.stream {
            if let Some(event_callback) = event_callback {
                let mut event_projector = V2NotificationProjector::default();
                let mut runtime_event_callback = |event| {
                    let messages = project_event_notifications_jsonrpc(&mut event_projector, event)
                        .map_err(|error| {
                            crate::RuntimeCoreError::Backend(format!(
                                "failed to serialize media read streaming event: {}",
                                error.message
                            ))
                        })?;
                    for message in messages {
                        event_callback(message);
                    }
                    Ok(())
                };
                self.runtime
                    .read_agent_session_media_streaming_with_cancel(
                        params,
                        || self.is_request_canceled(request_id),
                        &mut runtime_event_callback,
                    )
                    .map_err(to_jsonrpc_error)?
            } else {
                self.runtime
                    .read_agent_session_media_with_cancel(params, || {
                        self.is_request_canceled(request_id)
                    })
                    .map_err(to_jsonrpc_error)?
            }
        } else {
            self.runtime
                .read_agent_session_media_with_cancel(params, || {
                    self.is_request_canceled(request_id)
                })
                .map_err(to_jsonrpc_error)?
        };
        dispatch_result(response)
    }

    pub(super) async fn handle_objective_read_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionObjectiveReadParams = parse_params(params)?;
        let response = self
            .runtime
            .read_agent_session_objective(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_objective_set_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionObjectiveSetParams = parse_params(params)?;
        let response = self
            .runtime
            .set_agent_session_objective(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_objective_status_update_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionObjectiveStatusUpdateParams = parse_params(params)?;
        let response = self
            .runtime
            .update_agent_session_objective_status(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_objective_clear_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionObjectiveClearParams = parse_params(params)?;
        let response = self
            .runtime
            .clear_agent_session_objective(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_objective_continue_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionObjectiveContinueParams = parse_params(params)?;
        let host = self.runtime_host_context();
        let output = self
            .runtime
            .continue_agent_session_objective(params, host)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result_with_events(output.response, output.events)
    }

    pub(super) async fn handle_objective_audit_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionObjectiveAuditParams = parse_params(params)?;
        let response = self
            .runtime
            .audit_agent_session_objective(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_session_compact_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionCompactParams = parse_params(params)?;
        let output = self
            .runtime
            .compact_agent_session(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result_with_events(output.response, output.events)
    }

    pub(super) async fn handle_session_queued_turn_remove_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionQueuedTurnRemoveParams = parse_params(params)?;
        let output = self
            .runtime
            .remove_agent_session_queued_turn(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result_with_events(output.response, output.events)
    }

    pub(super) async fn handle_session_queued_turn_promote_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionQueuedTurnPromoteParams = parse_params(params)?;
        let output = self
            .runtime
            .promote_agent_session_queued_turn(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result_with_events(output.response, output.events)
    }

    pub(super) async fn handle_file_checkpoint_list_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionFileCheckpointListParams = parse_params(params)?;
        let response = self
            .runtime
            .list_agent_session_file_checkpoints(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_file_checkpoint_get_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionFileCheckpointGetParams = parse_params(params)?;
        let response = self
            .runtime
            .get_agent_session_file_checkpoint(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_file_checkpoint_diff_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionFileCheckpointDiffParams = parse_params(params)?;
        let response = self
            .runtime
            .diff_agent_session_file_checkpoint(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_file_checkpoint_restore_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionFileCheckpointRestoreParams = parse_params(params)?;
        let response = self
            .runtime
            .restore_agent_session_file_checkpoint(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_tool_inventory_read_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionToolInventoryReadParams = parse_params(params)?;
        let response = self
            .runtime
            .read_agent_session_tool_inventory(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_runtime_events_append_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionRuntimeEventAppendParams = parse_params(params)?;
        let runtime_events = params
            .runtime_events
            .into_iter()
            .map(|event| RuntimeEvent::new(event.event_type, event.payload))
            .collect::<Vec<_>>();
        let events = self
            .runtime
            .append_external_runtime_events(
                &params.session_id,
                params.turn_id.as_deref(),
                runtime_events,
            )
            .map_err(to_jsonrpc_error)?;
        dispatch_result_with_events(
            AgentSessionRuntimeEventAppendResponse {
                events: events.clone(),
            },
            events,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime::sidecar_store::SidecarStore;
    use app_server_protocol::{
        AgentInput, AgentSessionStartParams, AgentSessionTurnStartParams, ClientCapabilities,
        ClientInfo, InitializeParams, JsonRpcMessage, JsonRpcNotification, JsonRpcRequest,
        RequestId, METHOD_AGENT_SESSION_RUNTIME_EVENTS_APPEND, METHOD_INITIALIZE,
        METHOD_INITIALIZED,
    };
    use serde_json::json;
    use std::sync::Arc;

    async fn initialize_processor(processor: &RequestProcessor) {
        processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(1),
                METHOD_INITIALIZE,
                Some(json!(InitializeParams {
                    client_info: ClientInfo {
                        name: "test-client".to_string(),
                        title: None,
                        version: None,
                    },
                    capabilities: ClientCapabilities::default(),
                })),
            ))
            .await
            .expect("initialize");
        processor.handle_notification(JsonRpcNotification::new(
            METHOD_INITIALIZED,
            Some(json!({})),
        ));
    }

    #[tokio::test]
    async fn runtime_events_append_writes_events_and_returns_notifications() {
        let sidecar_root = tempfile::tempdir().expect("sidecar root");
        let runtime = crate::RuntimeCore::default().with_sidecar_store(Arc::new(
            SidecarStore::new(sidecar_root.path()).expect("sidecar store"),
        ));
        runtime
            .start_session(AgentSessionStartParams {
                session_id: Some("sess_worker".to_string()),
                thread_id: Some("thread_worker".to_string()),
                app_id: "content-factory-app".to_string(),
                workspace_id: Some("workspace-main".to_string()),
                business_object_ref: None,
                locale: None,
            })
            .expect("session");
        let turn = runtime
            .start_turn(
                AgentSessionTurnStartParams {
                    session_id: "sess_worker".to_string(),
                    turn_id: Some("turn_worker".to_string()),
                    input: AgentInput {
                        text: "生成内容工厂工作区".to_string(),
                        attachments: Vec::new(),
                    },
                    runtime_options: None,
                    queue_if_busy: false,
                    skip_pre_submit_resume: false,
                },
                crate::RuntimeHostContext::default(),
            )
            .await
            .expect("turn")
            .response
            .turn;
        let processor = RequestProcessor::new(runtime);
        initialize_processor(&processor).await;

        let messages = processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(2),
                METHOD_AGENT_SESSION_RUNTIME_EVENTS_APPEND,
                Some(json!({
                    "sessionId": "sess_worker",
                    "turnId": turn.turn_id,
                    "runtimeEvents": [{
                        "type": "artifact.snapshot",
                        "payload": {
                            "artifactId": "artifact-worker",
                            "kind": "content_factory.workspace_patch",
                            "content": "{\"objects\":[]}"
                        }
                    }]
                })),
            ))
            .await
            .expect("append response");

        assert_eq!(messages.len(), 2);
        match &messages[0] {
            JsonRpcMessage::Response(response) => {
                assert_eq!(response.result["events"][0]["type"], "artifact.snapshot");
                assert_eq!(response.result["events"][0]["sessionId"], "sess_worker");
                assert_eq!(response.result["events"][0]["turnId"], "turn_worker");
                assert!(response.result["events"][0]["payload"]["content"].is_null());
                assert_eq!(
                    response.result["events"][0]["payload"]["sidecarRef"]["kind"],
                    "artifact_snapshot"
                );
            }
            other => panic!("expected response, got {other:?}"),
        }
        match &messages[1] {
            JsonRpcMessage::Notification(notification) => {
                assert_eq!(
                    notification.method,
                    app_server_protocol::METHOD_AGENT_SESSION_EVENT
                );
                assert_eq!(
                    notification.params.as_ref().expect("params")["event"]["type"],
                    "artifact.snapshot"
                );
                assert_eq!(
                    notification.params.as_ref().expect("params")["event"]["turnId"],
                    "turn_worker"
                );
            }
            other => panic!("expected notification, got {other:?}"),
        }
    }
}
