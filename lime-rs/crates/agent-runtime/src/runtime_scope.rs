use agent_protocol::action_required::ActionRequiredScope;
use agent_protocol::turn_context::TurnContextOverride;
use futures::{Stream, StreamExt};
use model_provider::provider_stream::RuntimeReplyProviderResponseContext;
use serde_json::Value;
use std::cell::RefCell;
use std::collections::HashMap;
use tokio::task_local;

pub use agent_protocol::session_context::SESSION_ID_HEADER;

pub type ProviderResponseContext = RuntimeReplyProviderResponseContext;

task_local! {
    static SESSION_ID: Option<String>;
    static ACTION_SCOPE: ActionRequiredScope;
    static TURN_CONTEXT: Option<TurnContextOverride>;
    static PROVIDER_RESPONSE_CONTEXT: RefCell<Option<ProviderResponseContext>>;
}

pub async fn with_session_id<F>(session_id: Option<String>, future: F) -> F::Output
where
    F: std::future::Future,
{
    match session_id {
        Some(session_id) => SESSION_ID.scope(Some(session_id), future).await,
        None => future.await,
    }
}

pub fn current_session_id() -> Option<String> {
    SESSION_ID.try_with(Clone::clone).ok().flatten()
}

pub async fn with_action_scope<F>(scope: ActionRequiredScope, future: F) -> F::Output
where
    F: std::future::Future,
{
    match scope.session_id.clone() {
        Some(session_id) => {
            SESSION_ID
                .scope(Some(session_id), ACTION_SCOPE.scope(scope, future))
                .await
        }
        None => ACTION_SCOPE.scope(scope, future).await,
    }
}

pub async fn with_turn_context<F>(turn_context: Option<TurnContextOverride>, future: F) -> F::Output
where
    F: std::future::Future,
{
    TURN_CONTEXT
        .scope(
            turn_context,
            PROVIDER_RESPONSE_CONTEXT.scope(RefCell::new(None), future),
        )
        .await
}

pub async fn with_runtime_scope<F>(
    scope: ActionRequiredScope,
    turn_context: Option<TurnContextOverride>,
    future: F,
) -> F::Output
where
    F: std::future::Future,
{
    with_action_scope(scope, with_turn_context(turn_context, future)).await
}

pub fn current_action_scope() -> Option<ActionRequiredScope> {
    ACTION_SCOPE.try_with(Clone::clone).ok()
}

pub fn current_turn_context() -> Option<TurnContextOverride> {
    TURN_CONTEXT.try_with(Clone::clone).ok().flatten()
}

pub fn clear_current_provider_response_context() {
    let _ = PROVIDER_RESPONSE_CONTEXT.try_with(|context| *context.borrow_mut() = None);
}

pub fn current_provider_response_context() -> Option<ProviderResponseContext> {
    PROVIDER_RESPONSE_CONTEXT
        .try_with(|context| context.borrow().clone())
        .ok()
        .flatten()
}

pub fn current_request_correlation_context() -> RequestCorrelationContext {
    let action_scope = current_action_scope();
    let metadata = current_turn_context().map(|context| context.metadata);
    RequestCorrelationContext {
        session_id: action_scope
            .as_ref()
            .and_then(|scope| scope.session_id.clone())
            .or_else(current_session_id),
        thread_id: action_scope
            .as_ref()
            .and_then(|scope| scope.thread_id.clone()),
        turn_id: action_scope.and_then(|scope| scope.turn_id),
        pending_request_id: metadata.as_ref().and_then(|value| {
            find_metadata_string(value, &["pending_request_id", "pendingRequestId"])
        }),
        queued_turn_id: metadata
            .as_ref()
            .and_then(|value| find_metadata_string(value, &["queued_turn_id", "queuedTurnId"])),
        subagent_session_id: metadata.as_ref().and_then(|value| {
            find_metadata_string(value, &["subagent_session_id", "subagentSessionId"])
        }),
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RequestCorrelationContext {
    pub session_id: Option<String>,
    pub thread_id: Option<String>,
    pub turn_id: Option<String>,
    pub pending_request_id: Option<String>,
    pub queued_turn_id: Option<String>,
    pub subagent_session_id: Option<String>,
}

impl RequestCorrelationContext {
    pub fn header_values(&self) -> Vec<(&'static str, String)> {
        let mut headers = Vec::new();
        if let Some(value) = self.session_id.clone() {
            headers.push((agent_protocol::session_context::SESSION_ID_HEADER, value));
        }
        if let Some(value) = self.thread_id.clone() {
            headers.push((agent_protocol::session_context::THREAD_ID_HEADER, value));
        }
        if let Some(value) = self.turn_id.clone() {
            headers.push((agent_protocol::session_context::TURN_ID_HEADER, value));
        }
        if let Some(value) = self.pending_request_id.clone() {
            headers.push((
                agent_protocol::session_context::PENDING_REQUEST_ID_HEADER,
                value,
            ));
        }
        if let Some(value) = self.queued_turn_id.clone() {
            headers.push((
                agent_protocol::session_context::QUEUED_TURN_ID_HEADER,
                value,
            ));
        }
        if let Some(value) = self.subagent_session_id.clone() {
            headers.push((
                agent_protocol::session_context::SUBAGENT_SESSION_ID_HEADER,
                value,
            ));
        }
        headers
    }
}

pub fn scope_stream<S>(
    scope: ActionRequiredScope,
    turn_context: Option<TurnContextOverride>,
    stream: S,
) -> impl Stream<Item = S::Item> + Send
where
    S: Stream + Unpin + Send,
{
    futures::stream::unfold(
        (scope, turn_context, stream),
        |(scope, turn_context, mut stream)| async move {
            let next = with_runtime_scope(scope.clone(), turn_context.clone(), async {
                stream.next().await
            })
            .await;
            next.map(|item| (item, (scope, turn_context, stream)))
        },
    )
}

fn find_metadata_string(metadata: &HashMap<String, Value>, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| metadata.get(*key))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}
