use super::super::RequestProcessor;
use super::tests_support::initialize_processor;
use crate::{
    ActionRespondRequest, CancelExecutionRequest, ExecutionBackend, ExecutionRequest, RuntimeCore,
    RuntimeCoreError, RuntimeEvent, RuntimeEventSink, RuntimeHostContext,
};
use app_server_protocol::{
    AgentInput, AgentSessionActionRespondParams, AgentSessionActionScope, AgentSessionActionType,
    AgentSessionStartParams, AgentSessionTurnStartParams, JsonRpcMessage, JsonRpcRequest,
    RequestId, METHOD_AGENT_SESSION_ACTION_RESPOND,
};
use serde_json::json;
use std::sync::Arc;

struct ActionResponseErrorBackend;

#[async_trait::async_trait]
impl ExecutionBackend for ActionResponseErrorBackend {
    async fn start_turn(
        &self,
        _request: ExecutionRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        sink.emit(RuntimeEvent::new("turn.started", json!({})))?;
        sink.emit(RuntimeEvent::new(
            "action.required",
            json!({
                "requestId": "ask-jsonrpc-1",
                "actionType": "ask_user",
                "prompt": "Continue?",
                "deadlineAtMs": 1_999_999_999_999_u64,
            }),
        ))
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
        request: ActionRespondRequest,
        _sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        Err(RuntimeCoreError::ActionResponse {
            code: "action_not_resumable".to_string(),
            request_id: request.request_id,
        })
    }
}

#[tokio::test]
async fn action_respond_returns_structured_error_data() {
    let runtime = RuntimeCore::with_backend(Arc::new(ActionResponseErrorBackend));
    runtime
        .start_session(AgentSessionStartParams {
            session_id: Some("session-jsonrpc-action".to_string()),
            thread_id: Some("thread-jsonrpc-action".to_string()),
            app_id: "agent-chat".to_string(),
            workspace_id: Some("workspace-jsonrpc-action".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session");
    runtime
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: "session-jsonrpc-action".to_string(),
                turn_id: Some("turn-jsonrpc-action".to_string()),
                input: AgentInput {
                    text: "wait for response".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: None,
                queue_if_busy: false,
                skip_pre_submit_resume: true,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("pending action");

    let processor = RequestProcessor::new(runtime);
    initialize_processor(&processor).await;
    let request_id = RequestId::Integer(42);
    let params = AgentSessionActionRespondParams {
        session_id: "session-jsonrpc-action".to_string(),
        request_id: "ask-jsonrpc-1".to_string(),
        action_type: AgentSessionActionType::AskUser,
        decision: None,
        confirmed: Some(true),
        response: Some("continue".to_string()),
        user_data: Some(json!({ "answer": "continue" })),
        metadata: None,
        event_name: None,
        action_scope: Some(AgentSessionActionScope {
            session_id: Some("session-jsonrpc-action".to_string()),
            thread_id: Some("thread-jsonrpc-action".to_string()),
            turn_id: Some("turn-jsonrpc-action".to_string()),
        }),
    };
    let messages = processor
        .handle_request(JsonRpcRequest::new(
            request_id.clone(),
            METHOD_AGENT_SESSION_ACTION_RESPOND,
            Some(serde_json::to_value(params).expect("serialize params")),
        ))
        .await
        .expect("JSON-RPC response");

    let [JsonRpcMessage::Error(error)] = messages.as_slice() else {
        panic!("expected structured action response error: {messages:?}");
    };
    assert_eq!(error.id, request_id);
    assert_eq!(
        error.error.code,
        app_server_protocol::error_codes::RUNTIME_ERROR
    );
    assert_eq!(
        error.error.data,
        Some(json!({
            "code": "action_not_resumable",
            "requestId": "ask-jsonrpc-1",
        }))
    );
}
