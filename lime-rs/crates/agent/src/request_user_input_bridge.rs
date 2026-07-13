//! request_user_input 工具桥接
//!
//! 将 current request_user_input callback 桥接到 session-scoped action state，
//! 通过 elicitation 事件把问题发送到前端并等待用户输入。

use crate::protocol::AgentEvent;
use agent_protocol::action_required::elicitation_action;
use agent_protocol::action_required::ActionRequiredScope as RuntimeActionRequiredScope;
use agent_protocol::action_required::ELICITATION_ACTION_TYPE;
use agent_runtime::action_required::ActionRequiredState;
use agent_runtime::request_user_input::{
    run_request_user_input, RequestUserInputAction, RequestUserInputCallback,
    RequestUserInputGateway, RequestUserInputRequest, RequestUserInputRunRequest,
    DEFAULT_REQUEST_USER_INPUT_TIMEOUT_SECS,
};
use futures::future::BoxFuture;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc::UnboundedSender;

struct RuntimeActionRequiredGateway {
    state: Arc<ActionRequiredState>,
    event_sender: UnboundedSender<AgentEvent>,
}

impl RequestUserInputGateway for RuntimeActionRequiredGateway {
    fn request_user_input<'a>(
        &'a self,
        action: RequestUserInputAction,
    ) -> BoxFuture<'a, anyhow::Result<serde_json::Value>> {
        Box::pin(async move {
            let event_sender = self.event_sender.clone();
            self.state
                .request_action_and_wait_with_notification(
                    ELICITATION_ACTION_TYPE,
                    None,
                    Vec::new(),
                    action.scope,
                    action.prompt,
                    action.requested_schema,
                    action.timeout,
                    move |queued| {
                        let mut projection = elicitation_action(
                            queued.id.clone(),
                            queued.message.clone(),
                            queued.requested_schema.clone(),
                            queued.scope.clone(),
                        );
                        if let Some(data) = projection.data.as_object_mut() {
                            data.insert(
                                "actionType".to_string(),
                                queued.action_type.clone().into(),
                            );
                            data.insert(
                                "availableDecisions".to_string(),
                                queued.available_decisions.clone().into(),
                            );
                            data.insert("createdAtMs".to_string(), queued.created_at_ms.into());
                            data.insert("deadlineAtMs".to_string(), queued.deadline_at_ms.into());
                        }
                        let _ = event_sender.send(AgentEvent::ActionRequired {
                            request_id: projection.id,
                            action_type: projection.action_type,
                            data: projection.data,
                            scope: projection.scope,
                        });
                    },
                )
                .await
        })
    }
}

/// 创建 request_user_input 回调
pub(crate) fn create_request_user_input_callback(
    state: Arc<ActionRequiredState>,
    scope: Option<RuntimeActionRequiredScope>,
    event_sender: UnboundedSender<AgentEvent>,
) -> RequestUserInputCallback {
    Arc::new(move |request: RequestUserInputRequest| {
        let state = Arc::clone(&state);
        let scope = scope.clone();
        let event_sender = event_sender.clone();
        Box::pin(async move {
            let run_request = RequestUserInputRunRequest::new(
                request,
                scope,
                Duration::from_secs(DEFAULT_REQUEST_USER_INPUT_TIMEOUT_SECS),
            );
            let gateway = RuntimeActionRequiredGateway {
                state,
                event_sender,
            };

            match run_request_user_input(&gateway, run_request).await {
                Ok(response) => response,
                Err(err) => {
                    tracing::warn!(
                        "[AgentRuntime][RequestUserInputBridge] 用户输入等待失败: prompt='{}', err={}",
                        err.prompt(),
                        err.message()
                    );
                    None
                }
            }
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_runtime::request_user_input::{RequestUserInputOption, RequestUserInputQuestion};
    use std::time::Duration;

    #[test]
    fn request_user_input_callback_uses_current_dto() {
        let request = RequestUserInputRequest {
            questions: vec![
                RequestUserInputQuestion::new("第一问"),
                RequestUserInputQuestion {
                    id: Some("mode".to_string()),
                    question: "第二问".to_string(),
                    header: Some("mode".to_string()),
                    options: vec![
                        RequestUserInputOption::with_label("auto", "自动执行"),
                        RequestUserInputOption::with_label("confirm", "确认后执行"),
                    ],
                    multi_select: false,
                },
            ],
        };

        assert_eq!(request.questions.len(), 2);
        assert_eq!(request.questions[0].question, "第一问");
        assert_eq!(request.questions[1].id.as_deref(), Some("mode"));
        assert_eq!(request.questions[1].header.as_deref(), Some("mode"));
        assert_eq!(request.questions[1].options[0].value, "auto");
        assert_eq!(
            request.questions[1].options[0].label.as_deref(),
            Some("自动执行")
        );
        assert!(!request.questions[1].multi_select);
    }

    #[tokio::test]
    async fn callback_emits_action_and_resumes_matching_pending_request() {
        let state = Arc::new(ActionRequiredState::default());
        let scope = RuntimeActionRequiredScope {
            session_id: Some("session-1".to_string()),
            thread_id: Some("thread-1".to_string()),
            turn_id: Some("turn-1".to_string()),
        };
        let (event_sender, mut event_receiver) = tokio::sync::mpsc::unbounded_channel();
        let callback = create_request_user_input_callback(
            Arc::clone(&state),
            Some(scope.clone()),
            event_sender,
        );
        let request = RequestUserInputRequest {
            questions: vec![RequestUserInputQuestion {
                id: Some("mode".to_string()),
                question: "请选择执行模式".to_string(),
                header: Some("mode".to_string()),
                options: vec![
                    RequestUserInputOption::with_label("auto", "自动执行"),
                    RequestUserInputOption::with_label("confirm", "确认后执行"),
                ],
                multi_select: false,
            }],
        };

        let pending = tokio::spawn(async move { callback(request).await });
        let event = tokio::time::timeout(Duration::from_secs(1), event_receiver.recv())
            .await
            .expect("action event timeout")
            .expect("action event");
        let AgentEvent::ActionRequired {
            request_id,
            action_type,
            scope: event_scope,
            ..
        } = event
        else {
            panic!("expected action_required event");
        };
        assert_eq!(action_type, "elicitation");
        assert_eq!(event_scope, Some(scope.clone()));

        let descriptors = state.pending_action_descriptors().await;
        assert_eq!(descriptors.len(), 1);
        assert_eq!(descriptors[0].request_id, request_id);
        assert_eq!(descriptors[0].action_type, ELICITATION_ACTION_TYPE);
        assert_eq!(descriptors[0].scope, Some(scope.clone()));

        state
            .submit_response(
                &request_id,
                Some(&scope),
                serde_json::json!({ "answer": "确认后执行" }),
            )
            .await
            .expect("submit response");
        let response = pending.await.expect("pending callback");
        assert!(response.is_some());
    }
}
