//! Ask 工具桥接
//!
//! 将 aster 的 AskTool 回调桥接到 ActionRequiredManager，
//! 通过 elicitation 事件把问题发送到前端并等待用户输入。

use agent_protocol::action_required::ActionRequiredScope as RuntimeActionRequiredScope;
use agent_runtime::ask::{
    run_request_user_input, AskOption as CurrentAskOption, AskQuestion as CurrentAskQuestion,
    AskRequest as CurrentAskRequest, RequestUserInputAction, RequestUserInputGateway,
    RequestUserInputRunRequest,
};
use aster::action_required_manager::ActionRequiredManager;
use aster::conversation::message::ActionRequiredScope as AsterActionRequiredScope;
use aster::session_context::{current_action_scope, current_session_id};
use aster::tools::ask::AskRequest;
use aster::tools::AskCallback;
use futures::future::BoxFuture;
use std::time::Duration;

const DEFAULT_ASK_TIMEOUT_SECS: u64 = 300;

struct AsterActionRequiredGateway;

impl RequestUserInputGateway for AsterActionRequiredGateway {
    fn request_user_input<'a>(
        &'a self,
        action: RequestUserInputAction,
    ) -> BoxFuture<'a, anyhow::Result<serde_json::Value>> {
        Box::pin(async move {
            ActionRequiredManager::global()
                .request_and_wait_scoped(
                    to_aster_action_scope(action.scope),
                    action.prompt,
                    action.requested_schema,
                    action.timeout,
                )
                .await
        })
    }
}

/// 创建 AskTool 回调
pub(crate) fn create_ask_callback() -> AskCallback {
    std::sync::Arc::new(|request: AskRequest| {
        Box::pin(async move {
            let current_request = project_ask_request(&request);
            let run_request = RequestUserInputRunRequest::new(
                current_request,
                resolve_action_scope(),
                Duration::from_secs(DEFAULT_ASK_TIMEOUT_SECS),
            );
            let gateway = AsterActionRequiredGateway;

            match run_request_user_input(&gateway, run_request).await {
                Ok(response) => response,
                Err(err) => {
                    tracing::warn!(
                        "[AgentRuntime][AskBridge] 用户输入等待失败: prompt='{}', err={}",
                        err.prompt(),
                        err.message()
                    );
                    None
                }
            }
        })
    })
}

fn to_aster_action_scope(scope: Option<RuntimeActionRequiredScope>) -> AsterActionRequiredScope {
    scope
        .map(|scope| AsterActionRequiredScope {
            session_id: scope.session_id,
            thread_id: scope.thread_id,
            turn_id: scope.turn_id,
        })
        .unwrap_or_default()
}

fn project_aster_action_scope(
    scope: AsterActionRequiredScope,
) -> Option<RuntimeActionRequiredScope> {
    RuntimeActionRequiredScope::from_parts(scope.session_id, scope.thread_id, scope.turn_id)
}

fn project_ask_request(request: &AskRequest) -> CurrentAskRequest {
    CurrentAskRequest {
        questions: request
            .questions
            .iter()
            .map(|question| CurrentAskQuestion {
                id: question.id.clone(),
                question: question.question.clone(),
                header: question.header.clone(),
                options: question
                    .options
                    .iter()
                    .map(|option| CurrentAskOption {
                        value: option.value.clone(),
                        label: option.label.clone(),
                        description: option.description.clone(),
                        preview: option.preview.clone(),
                    })
                    .collect(),
                multi_select: question.multi_select,
            })
            .collect(),
    }
}

fn resolve_action_scope() -> Option<RuntimeActionRequiredScope> {
    current_action_scope()
        .and_then(project_aster_action_scope)
        .or_else(|| {
            let session_id = current_session_id();
            RuntimeActionRequiredScope::from_parts(session_id.clone(), session_id, None)
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use aster::session_context::{with_action_scope, with_session_id};
    use aster::tools::ask::{AskOption, AskQuestion};

    #[tokio::test]
    async fn resolve_action_scope_prefers_runtime_scope() {
        let scope = AsterActionRequiredScope {
            session_id: Some("session-1".to_string()),
            thread_id: Some("thread-1".to_string()),
            turn_id: Some("turn-1".to_string()),
        };

        let resolved = with_action_scope(scope, async { resolve_action_scope() }).await;

        assert_eq!(
            resolved,
            Some(RuntimeActionRequiredScope {
                session_id: Some("session-1".to_string()),
                thread_id: Some("thread-1".to_string()),
                turn_id: Some("turn-1".to_string()),
            })
        );
    }

    #[tokio::test]
    async fn resolve_action_scope_falls_back_to_session_id() {
        let resolved = with_session_id(Some("session-2".to_string()), async {
            resolve_action_scope()
        })
        .await;

        assert_eq!(
            resolved,
            Some(RuntimeActionRequiredScope {
                session_id: Some("session-2".to_string()),
                thread_id: Some("session-2".to_string()),
                turn_id: None,
            })
        );
    }

    #[test]
    fn project_ask_request_preserves_aster_questions_for_current_runner() {
        let request = AskRequest {
            questions: vec![
                AskQuestion::new("第一问"),
                AskQuestion {
                    id: Some("mode".to_string()),
                    question: "第二问".to_string(),
                    header: Some("mode".to_string()),
                    options: vec![
                        AskOption::with_label("auto", "自动执行"),
                        AskOption::with_label("confirm", "确认后执行"),
                    ],
                    multi_select: false,
                },
            ],
        };

        let current = project_ask_request(&request);

        assert_eq!(current.questions.len(), 2);
        assert_eq!(current.questions[0].question, "第一问");
        assert_eq!(current.questions[1].id.as_deref(), Some("mode"));
        assert_eq!(current.questions[1].header.as_deref(), Some("mode"));
        assert_eq!(current.questions[1].options[0].value, "auto");
        assert_eq!(
            current.questions[1].options[0].label.as_deref(),
            Some("自动执行")
        );
        assert!(!current.questions[1].multi_select);
    }
}
