use crate::conversation::message::ActionRequiredScope;
use crate::session::TurnContextOverride;
use futures::{Stream, StreamExt};
use model_provider::provider_stream::{
    provider_stream_response_context_from_header_pairs, RuntimeReplyProviderResponseContext,
};
use reqwest::header::HeaderMap;
use serde_json::Value;
use std::cell::RefCell;
use std::collections::HashMap;
use tokio::task_local;

pub const SESSION_ID_HEADER: &str = "aster-session-id";
pub const THREAD_ID_HEADER: &str = "aster-thread-id";
pub const TURN_ID_HEADER: &str = "aster-turn-id";
pub const PENDING_REQUEST_ID_HEADER: &str = "aster-pending-request-id";
pub const QUEUED_TURN_ID_HEADER: &str = "aster-queued-turn-id";
pub const SUBAGENT_SESSION_ID_HEADER: &str = "aster-subagent-session-id";
pub const TRACEPARENT_HEADER: &str = "traceparent";
pub const TRACESTATE_HEADER: &str = "tracestate";

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RequestCorrelationContext {
    pub session_id: Option<String>,
    pub thread_id: Option<String>,
    pub turn_id: Option<String>,
    pub pending_request_id: Option<String>,
    pub queued_turn_id: Option<String>,
    pub subagent_session_id: Option<String>,
    pub traceparent: Option<String>,
    pub tracestate: Option<String>,
}

pub type ProviderResponseContext = RuntimeReplyProviderResponseContext;

impl RequestCorrelationContext {
    pub fn header_values(&self) -> Vec<(&'static str, String)> {
        let mut headers = Vec::new();

        if let Some(value) = self.session_id.clone() {
            headers.push((SESSION_ID_HEADER, value));
        }
        if let Some(value) = self.thread_id.clone() {
            headers.push((THREAD_ID_HEADER, value));
        }
        if let Some(value) = self.turn_id.clone() {
            headers.push((TURN_ID_HEADER, value));
        }
        if let Some(value) = self.pending_request_id.clone() {
            headers.push((PENDING_REQUEST_ID_HEADER, value));
        }
        if let Some(value) = self.queued_turn_id.clone() {
            headers.push((QUEUED_TURN_ID_HEADER, value));
        }
        if let Some(value) = self.subagent_session_id.clone() {
            headers.push((SUBAGENT_SESSION_ID_HEADER, value));
        }
        if let Some(value) = self.traceparent.clone() {
            headers.push((TRACEPARENT_HEADER, value));
        }
        if let Some(value) = self.tracestate.clone() {
            headers.push((TRACESTATE_HEADER, value));
        }

        headers
    }
}

task_local! {
    pub static SESSION_ID: Option<String>;
}

task_local! {
    pub static ACTION_SCOPE: ActionRequiredScope;
}

task_local! {
    pub static TURN_CONTEXT: Option<TurnContextOverride>;
}

task_local! {
    static PROVIDER_RESPONSE_CONTEXT: RefCell<Option<ProviderResponseContext>>;
}

pub async fn with_session_id<F>(session_id: Option<String>, f: F) -> F::Output
where
    F: std::future::Future,
{
    if let Some(id) = session_id {
        SESSION_ID.scope(Some(id), f).await
    } else {
        f.await
    }
}

pub fn current_session_id() -> Option<String> {
    SESSION_ID.try_with(|id| id.clone()).ok().flatten()
}

pub async fn with_action_scope<F>(scope: ActionRequiredScope, f: F) -> F::Output
where
    F: std::future::Future,
{
    let session_id = scope.session_id.clone();
    if let Some(id) = session_id {
        SESSION_ID
            .scope(Some(id), ACTION_SCOPE.scope(scope, f))
            .await
    } else {
        ACTION_SCOPE.scope(scope, f).await
    }
}

pub async fn with_turn_context<F>(turn_context: Option<TurnContextOverride>, f: F) -> F::Output
where
    F: std::future::Future,
{
    TURN_CONTEXT
        .scope(
            turn_context,
            PROVIDER_RESPONSE_CONTEXT.scope(RefCell::new(None), f),
        )
        .await
}

pub async fn with_runtime_scope<F>(
    scope: ActionRequiredScope,
    turn_context: Option<TurnContextOverride>,
    f: F,
) -> F::Output
where
    F: std::future::Future,
{
    with_action_scope(scope, with_turn_context(turn_context, f)).await
}

pub fn current_action_scope() -> Option<ActionRequiredScope> {
    ACTION_SCOPE.try_with(|scope| scope.clone()).ok()
}

pub fn current_turn_context() -> Option<TurnContextOverride> {
    TURN_CONTEXT
        .try_with(|turn_context| turn_context.clone())
        .ok()
        .flatten()
}

pub fn current_request_correlation_context() -> RequestCorrelationContext {
    let action_scope = current_action_scope();
    let turn_context = current_turn_context();
    let metadata = turn_context.as_ref().map(|context| &context.metadata);
    let traceparent = metadata.and_then(find_w3c_traceparent);
    let tracestate = traceparent
        .as_ref()
        .and_then(|_| metadata.and_then(find_w3c_tracestate));

    RequestCorrelationContext {
        session_id: action_scope
            .as_ref()
            .and_then(|scope| scope.session_id.clone())
            .or_else(current_session_id),
        thread_id: action_scope
            .as_ref()
            .and_then(|scope| scope.thread_id.clone()),
        turn_id: action_scope
            .as_ref()
            .and_then(|scope| scope.turn_id.clone()),
        pending_request_id: metadata.and_then(|value| {
            find_metadata_string(value, &["pending_request_id", "pendingRequestId"])
        }),
        queued_turn_id: metadata
            .and_then(|value| find_metadata_string(value, &["queued_turn_id", "queuedTurnId"])),
        subagent_session_id: metadata
            .and_then(|value| {
                find_metadata_string(value, &["subagent_session_id", "subagentSessionId"])
            })
            .or_else(|| metadata.and_then(find_subagent_session_id)),
        traceparent,
        tracestate,
    }
}

pub fn clear_current_provider_response_context() {
    let _ = PROVIDER_RESPONSE_CONTEXT.try_with(|context| {
        *context.borrow_mut() = None;
    });
}

pub fn current_provider_response_context() -> Option<ProviderResponseContext> {
    PROVIDER_RESPONSE_CONTEXT
        .try_with(|context| context.borrow().clone())
        .ok()
        .flatten()
}

pub fn record_provider_response_headers(headers: &HeaderMap) {
    let context = provider_response_context_from_headers(headers);
    let _ = PROVIDER_RESPONSE_CONTEXT.try_with(|slot| {
        *slot.borrow_mut() = context;
    });
}

fn find_metadata_string(metadata: &HashMap<String, Value>, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| metadata.get(*key))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn find_subagent_session_id(metadata: &HashMap<String, Value>) -> Option<String> {
    metadata
        .get("subagent")
        .and_then(Value::as_object)
        .and_then(|subagent| {
            subagent
                .get("session_id")
                .or_else(|| subagent.get("sessionId"))
        })
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn find_w3c_traceparent(metadata: &HashMap<String, Value>) -> Option<String> {
    let value = find_w3c_trace_context_string(metadata, &["traceparent"])?;
    normalize_traceparent(&value)
}

fn find_w3c_tracestate(metadata: &HashMap<String, Value>) -> Option<String> {
    find_w3c_trace_context_string(metadata, &["tracestate"])
        .filter(|value| value.len() <= 256)
        .filter(|value| value.bytes().all(|byte| matches!(byte, b' '..=b'~')))
}

fn find_w3c_trace_context_string(
    metadata: &HashMap<String, Value>,
    keys: &[&str],
) -> Option<String> {
    ["w3c_trace_context", "w3cTraceContext"]
        .iter()
        .filter_map(|key| metadata.get(*key))
        .filter_map(Value::as_object)
        .find_map(|trace| {
            keys.iter()
                .filter_map(|key| trace.get(*key))
                .find_map(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToString::to_string)
        })
}

fn normalize_traceparent(value: &str) -> Option<String> {
    let normalized = value.trim().to_ascii_lowercase();
    let mut parts = normalized.split('-');
    let version = parts.next()?;
    let trace_id = parts.next()?;
    let parent_span_id = parts.next()?;
    let trace_flags = parts.next()?;
    if parts.next().is_some()
        || version != "00"
        || trace_id.len() != 32
        || parent_span_id.len() != 16
        || trace_flags.len() != 2
        || !is_non_zero_hex(trace_id)
        || !is_non_zero_hex(parent_span_id)
        || !is_lowercase_hex(trace_flags)
    {
        return None;
    }
    Some(format!(
        "{version}-{trace_id}-{parent_span_id}-{trace_flags}"
    ))
}

fn is_non_zero_hex(value: &str) -> bool {
    is_lowercase_hex(value) && value.bytes().any(|byte| byte != b'0')
}

fn is_lowercase_hex(value: &str) -> bool {
    value
        .bytes()
        .all(|byte| byte.is_ascii_digit() || matches!(byte, b'a'..=b'f'))
}

fn provider_response_context_from_headers(headers: &HeaderMap) -> Option<ProviderResponseContext> {
    provider_stream_response_context_from_header_pairs(
        headers
            .iter()
            .filter_map(|(name, value)| value.to_str().ok().map(|value| (name.as_str(), value))),
    )
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
