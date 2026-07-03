use super::{dispatch_result, parse_params, to_jsonrpc_error, RequestProcessor, RpcDispatch};
use app_server_protocol::{JsonRpcError, WorkflowReadParams};

impl RequestProcessor {
    pub(super) async fn handle_workflow_read_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: WorkflowReadParams = parse_params(params)?;
        let response = self
            .runtime
            .read_workflow_current(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{RuntimeCore, RuntimeEvent};
    use app_server_protocol::{
        AgentSessionStartParams, ClientCapabilities, ClientInfo, InitializeParams, JsonRpcMessage,
        JsonRpcNotification, JsonRpcRequest, RequestId, METHOD_INITIALIZE, METHOD_INITIALIZED,
        METHOD_WORKFLOW_READ,
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
    async fn workflow_read_dispatches_current_read_model() {
        let event_log_root = tempfile::tempdir().expect("event log root");
        let runtime = RuntimeCore::default().with_event_log_writer(Arc::new(
            crate::EventLogWriter::new(event_log_root.path()).expect("event log writer"),
        ));
        runtime
            .start_session(AgentSessionStartParams {
                session_id: Some("sess_workflow_rpc".to_string()),
                thread_id: Some("thread_workflow_rpc".to_string()),
                app_id: "content-factory-app".to_string(),
                workspace_id: Some("workspace-main".to_string()),
                business_object_ref: None,
                locale: None,
            })
            .expect("session");
        runtime
            .append_external_runtime_events(
                "sess_workflow_rpc",
                None,
                vec![RuntimeEvent::new(
                    "workflow.run.started",
                    json!({
                        "workflowRunId": "task-1:workflow",
                        "workflowKey": "content_article_workflow",
                        "workflowTitle": "写文章工作流",
                        "status": "running",
                        "steps": [{
                            "stepId": "draft",
                            "stepTitle": "正文写作",
                            "status": "queued"
                        }]
                    }),
                )],
            )
            .expect("workflow event");

        let processor = RequestProcessor::new(runtime);
        initialize_processor(&processor).await;
        let messages = processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(2),
                METHOD_WORKFLOW_READ,
                Some(json!({ "sessionId": "sess_workflow_rpc" })),
            ))
            .await
            .expect("workflow read response");

        match &messages[0] {
            JsonRpcMessage::Response(response) => {
                assert_eq!(response.result["sessionId"], "sess_workflow_rpc");
                assert_eq!(
                    response.result["workflowRuns"][0]["workflowRunId"],
                    "task-1:workflow"
                );
                assert_eq!(response.result["workflowSteps"][0]["stepId"], "draft");
            }
            other => panic!("expected response, got {other:?}"),
        }
    }
}
