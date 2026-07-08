use super::{RequestProcessor, RpcDispatch, dispatch_result, parse_params, to_jsonrpc_error};
use app_server_protocol::{
    JsonRpcError, WorkflowCancelParams, WorkflowReadParams, WorkflowRespondParams,
    WorkflowRetryParams,
};

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

    pub(super) async fn handle_workflow_cancel_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: WorkflowCancelParams = parse_params(params)?;
        let response = self
            .runtime
            .cancel_workflow_current(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_workflow_retry_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: WorkflowRetryParams = parse_params(params)?;
        let host = self.runtime_host_context();
        let response = self
            .runtime
            .retry_workflow_current(params, host)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_workflow_respond_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: WorkflowRespondParams = parse_params(params)?;
        let host = self.runtime_host_context();
        let response = self
            .runtime
            .respond_workflow_current(params, host)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        ActionRespondRequest, CancelExecutionRequest, ExecutionBackend, ExecutionRequest,
        RuntimeCore, RuntimeCoreError, RuntimeEvent, RuntimeEventSink,
    };
    use app_server_protocol::{
        AgentInput, AgentSessionStartParams, AgentSessionTurnStartParams, ClientCapabilities,
        ClientInfo, InitializeParams, JsonRpcMessage, JsonRpcNotification, JsonRpcRequest,
        METHOD_INITIALIZE, METHOD_INITIALIZED, METHOD_WORKFLOW_CANCEL, METHOD_WORKFLOW_READ,
        METHOD_WORKFLOW_RESPOND, METHOD_WORKFLOW_RETRY, RequestId,
    };
    use async_trait::async_trait;
    use serde_json::json;
    use std::sync::{Arc, Mutex};

    #[derive(Default)]
    struct RecordingBackend {
        requests: Mutex<Vec<ExecutionRequest>>,
    }

    #[async_trait]
    impl ExecutionBackend for RecordingBackend {
        async fn start_turn(
            &self,
            request: ExecutionRequest,
            sink: &mut dyn RuntimeEventSink,
        ) -> Result<(), RuntimeCoreError> {
            self.requests
                .lock()
                .expect("recording backend requests mutex poisoned")
                .push(request);
            sink.emit(RuntimeEvent::new("turn.started", json!({})))?;
            sink.emit(RuntimeEvent::new("turn.completed", json!({})))
        }

        async fn cancel_turn(
            &self,
            _request: CancelExecutionRequest,
            _sink: &mut dyn RuntimeEventSink,
        ) -> Result<(), RuntimeCoreError> {
            Ok(())
        }

        async fn respond_action(
            &self,
            _request: ActionRespondRequest,
            _sink: &mut dyn RuntimeEventSink,
        ) -> Result<(), RuntimeCoreError> {
            Ok(())
        }
    }

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

    #[tokio::test]
    async fn workflow_cancel_appends_audit_events_and_returns_updated_read_model() {
        let event_log_root = tempfile::tempdir().expect("event log root");
        let runtime = RuntimeCore::default().with_event_log_writer(Arc::new(
            crate::EventLogWriter::new(event_log_root.path()).expect("event log writer"),
        ));
        runtime
            .start_session(AgentSessionStartParams {
                session_id: Some("sess_workflow_cancel_rpc".to_string()),
                thread_id: Some("thread_workflow_cancel_rpc".to_string()),
                app_id: "content-factory-app".to_string(),
                workspace_id: Some("workspace-main".to_string()),
                business_object_ref: None,
                locale: None,
            })
            .expect("session");
        runtime
            .append_external_runtime_events(
                "sess_workflow_cancel_rpc",
                None,
                vec![
                    RuntimeEvent::new(
                        "action.required",
                        json!({
                            "requestId": "ask-review-1",
                            "actionType": "ask_user",
                            "prompt": "请确认是否发布"
                        }),
                    ),
                    RuntimeEvent::new(
                        "workflow.run.started",
                        json!({
                            "workflowRunId": "task-1:workflow",
                            "workflowKey": "content_article_workflow",
                            "workflowTitle": "写文章工作流",
                            "status": "running"
                        }),
                    ),
                    RuntimeEvent::new(
                        "workflow.step.started",
                        json!({
                            "workflowRunId": "task-1:workflow",
                            "stepId": "draft",
                            "stepTitle": "正文写作",
                            "status": "running"
                        }),
                    ),
                ],
            )
            .expect("workflow events");

        let processor = RequestProcessor::new(runtime);
        initialize_processor(&processor).await;
        let messages = processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(2),
                METHOD_WORKFLOW_CANCEL,
                Some(json!({
                    "sessionId": "sess_workflow_cancel_rpc",
                    "workflowRunId": "task-1:workflow",
                    "reasonCode": "user_requested",
                    "reason": "用户取消"
                })),
            ))
            .await
            .expect("workflow cancel response");

        match &messages[0] {
            JsonRpcMessage::Response(response) => {
                assert_eq!(response.result["sessionId"], "sess_workflow_cancel_rpc");
                assert_eq!(response.result["workflowRuns"][0]["status"], "canceled");
                assert_eq!(response.result["workflowSteps"][0]["status"], "canceled");
                assert_eq!(
                    response.result["workflow"]["workflowRuns"][0]["workflowRunId"],
                    "task-1:workflow"
                );
            }
            other => panic!("expected response, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn workflow_retry_appends_audit_events_and_returns_updated_read_model() {
        let event_log_root = tempfile::tempdir().expect("event log root");
        let backend = Arc::new(RecordingBackend::default());
        let runtime = RuntimeCore::with_backend(backend.clone()).with_event_log_writer(Arc::new(
            crate::EventLogWriter::new(event_log_root.path()).expect("event log writer"),
        ));
        runtime
            .start_session(AgentSessionStartParams {
                session_id: Some("sess_workflow_retry_rpc".to_string()),
                thread_id: Some("thread_workflow_retry_rpc".to_string()),
                app_id: "content-factory-app".to_string(),
                workspace_id: Some("workspace-main".to_string()),
                business_object_ref: None,
                locale: None,
            })
            .expect("session");
        runtime
            .start_turn(
                AgentSessionTurnStartParams {
                    session_id: "sess_workflow_retry_rpc".to_string(),
                    turn_id: Some("turn_workflow_retry_source".to_string()),
                    input: AgentInput {
                        text: "生成一篇产品文章".to_string(),
                        attachments: Vec::new(),
                    },
                    runtime_options: None,
                    queue_if_busy: false,
                    skip_pre_submit_resume: true,
                },
                crate::RuntimeHostContext::default(),
            )
            .await
            .expect("source turn");
        runtime
            .append_external_runtime_events(
                "sess_workflow_retry_rpc",
                None,
                vec![
                    RuntimeEvent::new(
                        "workflow.run.started",
                        json!({
                            "workflowRunId": "task-1:workflow",
                            "workflowKey": "content_article_workflow",
                            "workflowTitle": "写文章工作流",
                            "turnId": "turn_workflow_retry_source",
                            "status": "running"
                        }),
                    ),
                    RuntimeEvent::new(
                        "workflow.step.failed",
                        json!({
                            "workflowRunId": "task-1:workflow",
                            "stepId": "draft",
                            "stepTitle": "正文写作",
                            "turnId": "turn_workflow_retry_source",
                            "attempt": 1,
                            "status": "failed",
                            "failure": {
                                "reason": "model_error"
                            }
                        }),
                    ),
                    RuntimeEvent::new(
                        "workflow.run.failed",
                        json!({
                            "workflowRunId": "task-1:workflow",
                            "workflowKey": "content_article_workflow",
                            "workflowTitle": "写文章工作流",
                            "turnId": "turn_workflow_retry_source",
                            "status": "failed",
                            "failure": {
                                "reason": "model_error"
                            }
                        }),
                    ),
                ],
            )
            .expect("workflow events");

        let processor = RequestProcessor::new(runtime);
        initialize_processor(&processor).await;

        let retry_messages = processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(2),
                METHOD_WORKFLOW_RETRY,
                Some(json!({
                    "sessionId": "sess_workflow_retry_rpc",
                    "workflowRunId": "task-1:workflow",
                    "stepId": "draft",
                    "reasonCode": "user_requested",
                    "reason": "重试正文"
                })),
            ))
            .await
            .expect("retry response");

        match &retry_messages[0] {
            JsonRpcMessage::Response(response) => {
                assert_eq!(response.result["sessionId"], "sess_workflow_retry_rpc");
                let rescheduled_turn_id = response.result["rescheduledTurnId"]
                    .as_str()
                    .expect("rescheduled turn id");
                assert_ne!(rescheduled_turn_id, "turn_workflow_retry_source");
                assert_eq!(response.result["workflowRuns"][0]["status"], "retrying");
                assert_eq!(
                    response.result["workflowRuns"][0]["failure"],
                    serde_json::Value::Null
                );
                assert_eq!(
                    response.result["workflowRuns"][0]["retry"]["sourceTurnId"],
                    "turn_workflow_retry_source"
                );
                assert_eq!(
                    response.result["workflowRuns"][0]["retry"]["rescheduledTurnId"],
                    rescheduled_turn_id
                );
                assert_eq!(response.result["workflowSteps"][0]["status"], "retrying");
                assert_eq!(response.result["workflowSteps"][0]["attempt"], 2);
                assert_eq!(
                    response.result["workflowSteps"][0]["failure"],
                    serde_json::Value::Null
                );
                assert_eq!(
                    response.result["workflow"]["workflowRuns"][0]["stepCounts"]["retrying"],
                    1
                );
                let requests = backend
                    .requests
                    .lock()
                    .expect("recording backend requests mutex poisoned");
                assert_eq!(requests.len(), 2);
                let retry_request = requests.last().expect("retry request");
                assert_eq!(retry_request.turn.turn_id, rescheduled_turn_id);
                assert_eq!(retry_request.input.text, "生成一篇产品文章");
                assert_eq!(
                    retry_request
                        .runtime_options
                        .as_ref()
                        .and_then(|options| options.metadata.as_ref())
                        .and_then(|metadata| metadata.get("workflowRetry"))
                        .and_then(|retry| retry.get("stepId"))
                        .and_then(serde_json::Value::as_str),
                    Some("draft")
                );
            }
            other => panic!("expected response, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn workflow_respond_submits_waiting_action_and_returns_updated_read_model() {
        let event_log_root = tempfile::tempdir().expect("event log root");
        let runtime = RuntimeCore::default().with_event_log_writer(Arc::new(
            crate::EventLogWriter::new(event_log_root.path()).expect("event log writer"),
        ));
        runtime
            .start_session(AgentSessionStartParams {
                session_id: Some("sess_workflow_respond_rpc".to_string()),
                thread_id: Some("thread_workflow_respond_rpc".to_string()),
                app_id: "content-factory-app".to_string(),
                workspace_id: Some("workspace-main".to_string()),
                business_object_ref: None,
                locale: None,
            })
            .expect("session");
        runtime
            .start_turn(
                AgentSessionTurnStartParams {
                    session_id: "sess_workflow_respond_rpc".to_string(),
                    turn_id: Some("turn_workflow_respond_rpc".to_string()),
                    input: AgentInput {
                        text: "等待人工复核".to_string(),
                        attachments: Vec::new(),
                    },
                    runtime_options: None,
                    queue_if_busy: false,
                    skip_pre_submit_resume: true,
                },
                crate::RuntimeHostContext::default(),
            )
            .await
            .expect("turn");
        runtime
            .append_external_runtime_events(
                "sess_workflow_respond_rpc",
                Some("turn_workflow_respond_rpc"),
                vec![
                    RuntimeEvent::new(
                        "action.required",
                        json!({
                            "requestId": "ask-review-1",
                            "actionType": "ask_user",
                            "prompt": "请确认是否发布"
                        }),
                    ),
                    RuntimeEvent::new(
                        "workflow.run.started",
                        json!({
                            "workflowRunId": "task-1:workflow",
                            "workflowKey": "content_article_workflow",
                            "workflowTitle": "写文章工作流",
                            "turnId": "turn_workflow_respond_rpc",
                            "status": "running"
                        }),
                    ),
                    RuntimeEvent::new(
                        "workflow.step.progress",
                        json!({
                            "workflowRunId": "task-1:workflow",
                            "stepId": "review",
                            "stepTitle": "人工复核",
                            "status": "waiting",
                            "requestId": "ask-review-1",
                            "actionType": "ask_user"
                        }),
                    ),
                ],
            )
            .expect("workflow events");

        let processor = RequestProcessor::new(runtime);
        initialize_processor(&processor).await;

        let respond_messages = processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(2),
                METHOD_WORKFLOW_RESPOND,
                Some(json!({
                    "sessionId": "sess_workflow_respond_rpc",
                    "workflowRunId": "task-1:workflow",
                    "stepId": "review",
                    "response": { "answer": "同意发布" }
                })),
            ))
            .await
            .expect("respond response");

        match &respond_messages[0] {
            JsonRpcMessage::Response(response) => {
                assert_eq!(response.result["sessionId"], "sess_workflow_respond_rpc");
                assert_eq!(response.result["workflowRuns"][0]["status"], "running");
                assert_eq!(response.result["workflowSteps"][0]["status"], "running");
                assert_eq!(
                    response.result["workflowSteps"][0]["requestId"],
                    "ask-review-1"
                );
                assert_eq!(
                    response.result["workflowSteps"][0]["agentActionType"],
                    "ask_user"
                );
            }
            other => panic!("expected response, got {other:?}"),
        }
    }
}
