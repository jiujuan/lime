//! Ask 工具桥接
//!
//! 将 aster 的 AskTool 回调桥接到 ActionRequiredManager，
//! 通过 elicitation 事件把问题发送到前端并等待用户输入。

use agent_runtime::ask::{
    build_requested_schema, extract_response as extract_current_ask_response,
    resolve_request_prompt, AskOption as CurrentAskOption, AskQuestion as CurrentAskQuestion,
    AskRequest as CurrentAskRequest,
};
use aster::action_required_manager::ActionRequiredManager;
use aster::conversation::message::ActionRequiredScope;
use aster::session_context::{current_action_scope, current_session_id};
use aster::tools::ask::AskRequest;
use aster::tools::AskCallback;
#[cfg(test)]
use serde_json::Value;
use std::time::Duration;

const DEFAULT_ASK_TIMEOUT_SECS: u64 = 300;

/// 创建 AskTool 回调
pub(crate) fn create_ask_callback() -> AskCallback {
    std::sync::Arc::new(|request: AskRequest| {
        Box::pin(async move {
            let current_request = project_ask_request(&request);
            let prompt = resolve_request_prompt(&current_request);
            let requested_schema = build_requested_schema(&current_request);
            let scope = resolve_action_scope();

            match ActionRequiredManager::global()
                .request_and_wait_scoped(
                    scope,
                    prompt.clone(),
                    requested_schema,
                    Duration::from_secs(DEFAULT_ASK_TIMEOUT_SECS),
                )
                .await
            {
                Ok(user_data) => extract_current_ask_response(&current_request, &user_data),
                Err(err) => {
                    tracing::warn!(
                        "[AgentRuntime][AskBridge] 用户输入等待失败: prompt='{}', err={}",
                        prompt,
                        err
                    );
                    None
                }
            }
        })
    })
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

fn resolve_action_scope() -> ActionRequiredScope {
    current_action_scope().unwrap_or_else(|| {
        let session_id = current_session_id();
        ActionRequiredScope {
            session_id: session_id.clone(),
            thread_id: session_id,
            turn_id: None,
        }
    })
}

/// 从前端回传的 user_data 中提取 AskTool 可消费的结构化答案。
#[cfg(test)]
fn extract_response(request: &AskRequest, user_data: &Value) -> Option<Value> {
    extract_current_ask_response(&project_ask_request(request), user_data)
}

#[cfg(test)]
mod tests {
    use super::*;
    use aster::session_context::{with_action_scope, with_session_id};
    use aster::tools::ask::AskQuestion;

    #[tokio::test]
    async fn resolve_action_scope_prefers_runtime_scope() {
        let scope = ActionRequiredScope {
            session_id: Some("session-1".to_string()),
            thread_id: Some("thread-1".to_string()),
            turn_id: Some("turn-1".to_string()),
        };

        let resolved = with_action_scope(scope.clone(), async { resolve_action_scope() }).await;

        assert_eq!(resolved, scope);
    }

    #[tokio::test]
    async fn resolve_action_scope_falls_back_to_session_id() {
        let resolved = with_session_id(Some("session-2".to_string()), async {
            resolve_action_scope()
        })
        .await;

        assert_eq!(
            resolved,
            ActionRequiredScope {
                session_id: Some("session-2".to_string()),
                thread_id: Some("session-2".to_string()),
                turn_id: None,
            }
        );
    }

    #[test]
    fn extract_response_projects_aster_request_to_current_ask_response() {
        let request = AskRequest {
            questions: vec![
                AskQuestion::new("第一问"),
                AskQuestion {
                    id: Some("mode".to_string()),
                    question: "第二问".to_string(),
                    header: Some("mode".to_string()),
                    options: vec![
                        aster::tools::AskOption::with_label("auto", "自动执行"),
                        aster::tools::AskOption::with_label("confirm", "确认后执行"),
                    ],
                    multi_select: false,
                },
            ],
        };

        let response = extract_response(
            &request,
            &serde_json::json!({
                "question_1": "先看结构",
                "mode": "确认后执行"
            }),
        )
        .expect("expected normalized response");

        assert_eq!(
            response,
            serde_json::json!({
                "answers": {
                    "第一问": "先看结构",
                    "第二问": "confirm"
                }
            })
        );
    }
}
