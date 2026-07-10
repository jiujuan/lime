use anyhow::Result;
use serde_json::Value;
use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{Mutex, RwLock};
use tokio::time::timeout;
use tracing::warn;
use uuid::Uuid;

use crate::conversation::message::{
    ActionRequired, ActionRequiredData, ActionRequiredScope, Message, MessageContent,
};

struct PendingRequest {
    response_tx: Option<tokio::sync::oneshot::Sender<Value>>,
    scope: ActionRequiredScope,
}

struct QueuedActionRequiredMessage {
    scope: ActionRequiredScope,
    message: Message,
}

pub struct ActionRequiredManager {
    pending: Arc<RwLock<HashMap<String, Arc<Mutex<PendingRequest>>>>>,
    queued_messages: Arc<Mutex<VecDeque<QueuedActionRequiredMessage>>>,
}

impl ActionRequiredManager {
    fn new() -> Self {
        Self {
            pending: Arc::new(RwLock::new(HashMap::new())),
            queued_messages: Arc::new(Mutex::new(VecDeque::new())),
        }
    }

    pub fn global() -> &'static Self {
        static INSTANCE: once_cell::sync::Lazy<ActionRequiredManager> =
            once_cell::sync::Lazy::new(ActionRequiredManager::new);
        &INSTANCE
    }

    pub async fn request_and_wait(
        &self,
        message: String,
        schema: Value,
        timeout_duration: Duration,
    ) -> Result<Value> {
        self.request_and_wait_scoped(
            ActionRequiredScope::default(),
            message,
            schema,
            timeout_duration,
        )
        .await
    }

    pub async fn request_and_wait_scoped(
        &self,
        scope: ActionRequiredScope,
        message: String,
        schema: Value,
        timeout_duration: Duration,
    ) -> Result<Value> {
        let id = Uuid::new_v4().to_string();
        let (tx, rx) = tokio::sync::oneshot::channel();
        let pending_request = PendingRequest {
            response_tx: Some(tx),
            scope: scope.clone(),
        };

        self.pending
            .write()
            .await
            .insert(id.clone(), Arc::new(Mutex::new(pending_request)));

        let action_required_message =
            Message::assistant().with_content(MessageContent::ActionRequired(ActionRequired {
                data: ActionRequiredData::Elicitation {
                    id: id.clone(),
                    message,
                    requested_schema: schema,
                },
                scope: (!Self::scope_is_empty(&scope)).then_some(scope.clone()),
            }));
        self.queued_messages
            .lock()
            .await
            .push_back(QueuedActionRequiredMessage {
                scope,
                message: action_required_message,
            });

        let result = match timeout(timeout_duration, rx).await {
            Ok(Ok(user_data)) => Ok(user_data),
            Ok(Err(_)) => {
                warn!("Response channel closed for request: {}", id);
                Err(anyhow::anyhow!("Response channel closed"))
            }
            Err(_) => {
                warn!("Timeout waiting for response: {}", id);
                Err(anyhow::anyhow!("Timeout waiting for user response"))
            }
        };

        self.pending.write().await.remove(&id);

        result
    }

    pub async fn submit_response(&self, request_id: String, user_data: Value) -> Result<()> {
        self.submit_response_scoped(request_id, None, user_data)
            .await
    }

    pub async fn submit_response_scoped(
        &self,
        request_id: String,
        scope: Option<&ActionRequiredScope>,
        user_data: Value,
    ) -> Result<()> {
        let pending_arc = {
            let pending = self.pending.read().await;
            pending
                .get(&request_id)
                .cloned()
                .ok_or_else(|| anyhow::anyhow!("Request not found: {}", request_id))?
        };

        let mut pending = pending_arc.lock().await;
        if let Some(scope) = scope {
            if !Self::scope_matches(&pending.scope, scope) {
                return Err(anyhow::anyhow!(
                    "Request scope mismatch for action required response: {}",
                    request_id
                ));
            }
        }
        if let Some(tx) = pending.response_tx.take() {
            if tx.send(user_data).is_err() {
                warn!("Failed to send response through oneshot channel");
            }
        }

        Ok(())
    }

    pub async fn drain_messages_for_scope(&self, scope: &ActionRequiredScope) -> Vec<Message> {
        let mut queue = self.queued_messages.lock().await;
        let mut drained = Vec::new();
        let mut remaining = VecDeque::new();

        while let Some(entry) = queue.pop_front() {
            if Self::scope_matches(&entry.scope, scope) {
                drained.push(entry.message);
            } else {
                remaining.push_back(entry);
            }
        }

        *queue = remaining;
        drained
    }

    fn scope_matches(
        message_scope: &ActionRequiredScope,
        runtime_scope: &ActionRequiredScope,
    ) -> bool {
        if Self::scope_is_empty(message_scope) {
            return true;
        }

        Self::field_matches(&message_scope.session_id, &runtime_scope.session_id)
            && Self::field_matches(&message_scope.thread_id, &runtime_scope.thread_id)
            && Self::field_matches(&message_scope.turn_id, &runtime_scope.turn_id)
    }

    fn field_matches(expected: &Option<String>, actual: &Option<String>) -> bool {
        match expected {
            Some(expected) => actual.as_ref() == Some(expected),
            None => true,
        }
    }

    fn scope_is_empty(scope: &ActionRequiredScope) -> bool {
        scope.session_id.is_none() && scope.thread_id.is_none() && scope.turn_id.is_none()
    }
}
