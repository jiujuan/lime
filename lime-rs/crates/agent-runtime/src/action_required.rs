use agent_protocol::action_required::ActionRequiredScope;
use serde_json::Value;
use std::collections::{HashMap, VecDeque};
use std::time::Duration;
use tokio::sync::{oneshot, Mutex};
use tokio::time::timeout;
use uuid::Uuid;

struct PendingAction {
    response: Option<oneshot::Sender<Value>>,
    scope: Option<ActionRequiredScope>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct QueuedActionRequired {
    pub id: String,
    pub message: String,
    pub requested_schema: Value,
    pub scope: Option<ActionRequiredScope>,
}

/// 单个 Agent session runtime 的交互等待状态。
///
/// 对齐 Codex `TurnState.pending_user_input`：pending sender 归 session/turn
/// 实例所有，不使用进程级 singleton。队列仅用于 Agent reply adapter 退场期间投影事件。
#[derive(Default)]
pub struct ActionRequiredState {
    pending: Mutex<HashMap<String, PendingAction>>,
    queued: Mutex<VecDeque<QueuedActionRequired>>,
}

impl ActionRequiredState {
    pub async fn request_and_wait(
        &self,
        scope: Option<ActionRequiredScope>,
        message: String,
        requested_schema: Value,
        timeout_duration: Duration,
    ) -> anyhow::Result<Value> {
        self.request_and_wait_inner(
            scope,
            message,
            requested_schema,
            timeout_duration,
            None::<fn(&QueuedActionRequired)>,
        )
        .await
    }

    pub async fn request_and_wait_with_notification<F>(
        &self,
        scope: Option<ActionRequiredScope>,
        message: String,
        requested_schema: Value,
        timeout_duration: Duration,
        notify: F,
    ) -> anyhow::Result<Value>
    where
        F: FnOnce(&QueuedActionRequired),
    {
        self.request_and_wait_inner(
            scope,
            message,
            requested_schema,
            timeout_duration,
            Some(notify),
        )
        .await
    }

    async fn request_and_wait_inner<F>(
        &self,
        scope: Option<ActionRequiredScope>,
        message: String,
        requested_schema: Value,
        timeout_duration: Duration,
        notify: Option<F>,
    ) -> anyhow::Result<Value>
    where
        F: FnOnce(&QueuedActionRequired),
    {
        let id = Uuid::new_v4().to_string();
        let (response, receiver) = oneshot::channel();

        self.pending.lock().await.insert(
            id.clone(),
            PendingAction {
                response: Some(response),
                scope: scope.clone(),
            },
        );
        let action = QueuedActionRequired {
            id: id.clone(),
            message,
            requested_schema,
            scope,
        };
        if let Some(notify) = notify {
            notify(&action);
        } else {
            self.queued.lock().await.push_back(action);
        }

        let result = match timeout(timeout_duration, receiver).await {
            Ok(Ok(user_data)) => Ok(user_data),
            Ok(Err(_)) => Err(anyhow::anyhow!("Response channel closed")),
            Err(_) => Err(anyhow::anyhow!("Timeout waiting for user response")),
        };
        self.pending.lock().await.remove(&id);
        result
    }

    pub async fn submit_response(
        &self,
        request_id: &str,
        scope: Option<&ActionRequiredScope>,
        user_data: Value,
    ) -> anyhow::Result<()> {
        let response = {
            let mut pending = self.pending.lock().await;
            let action = pending
                .get_mut(request_id)
                .ok_or_else(|| anyhow::anyhow!("Request not found: {request_id}"))?;
            if let Some(scope) = scope {
                if !scope_matches(action.scope.as_ref(), Some(scope)) {
                    return Err(anyhow::anyhow!(
                        "Request scope mismatch for action required response: {request_id}"
                    ));
                }
            }
            action.response.take()
        };

        if let Some(response) = response {
            let _ = response.send(user_data);
        }
        Ok(())
    }

    pub async fn drain_for_scope(
        &self,
        scope: Option<&ActionRequiredScope>,
    ) -> Vec<QueuedActionRequired> {
        let mut queue = self.queued.lock().await;
        let mut drained = Vec::new();
        let mut remaining = VecDeque::new();

        while let Some(action) = queue.pop_front() {
            if scope_matches(action.scope.as_ref(), scope) {
                drained.push(action);
            } else {
                remaining.push_back(action);
            }
        }
        *queue = remaining;
        drained
    }
}

fn scope_matches(
    expected: Option<&ActionRequiredScope>,
    actual: Option<&ActionRequiredScope>,
) -> bool {
    let Some(expected) = expected else {
        return true;
    };
    let Some(actual) = actual else {
        return false;
    };

    field_matches(&expected.session_id, &actual.session_id)
        && field_matches(&expected.thread_id, &actual.thread_id)
        && field_matches(&expected.turn_id, &actual.turn_id)
}

fn field_matches(expected: &Option<String>, actual: &Option<String>) -> bool {
    expected
        .as_ref()
        .is_none_or(|expected| actual.as_ref() == Some(expected))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    fn scope(session_id: &str) -> ActionRequiredScope {
        ActionRequiredScope {
            session_id: Some(session_id.to_string()),
            thread_id: None,
            turn_id: None,
        }
    }

    #[tokio::test]
    async fn state_is_scoped_and_routes_response_to_pending_turn() {
        let state = Arc::new(ActionRequiredState::default());
        let requester = Arc::clone(&state);
        let task = tokio::spawn(async move {
            requester
                .request_and_wait(
                    Some(scope("session-1")),
                    "Choose".to_string(),
                    serde_json::json!({ "type": "string" }),
                    Duration::from_secs(1),
                )
                .await
        });

        tokio::task::yield_now().await;
        assert!(state
            .drain_for_scope(Some(&scope("session-2")))
            .await
            .is_empty());
        let queued = state.drain_for_scope(Some(&scope("session-1"))).await;
        assert_eq!(queued.len(), 1);
        state
            .submit_response(
                &queued[0].id,
                Some(&scope("session-1")),
                serde_json::json!({ "answer": "yes" }),
            )
            .await
            .expect("response should be accepted");

        assert_eq!(
            task.await.expect("task should finish").expect("response"),
            serde_json::json!({ "answer": "yes" })
        );
    }
}
