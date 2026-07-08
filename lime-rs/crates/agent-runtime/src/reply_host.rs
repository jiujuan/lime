use crate::reply_backend::RuntimeReplyBackend;
use crate::reply_request::RuntimeReplyRequest;
use crate::reply_stream::RuntimeReplyStreamEvent;
use crate::session_config::AgentSessionConfig;
use futures::future::BoxFuture;
use futures::stream::BoxStream;
use model_provider::provider_stream::RuntimeReplyProviderWireSupportIssue;
use tokio_util::sync::CancellationToken;

pub type RuntimeReplyStream<'a, E> = BoxStream<'a, anyhow::Result<RuntimeReplyStreamEvent<E>>>;

pub type RuntimeReplyStartResult<'a, E> =
    Result<(RuntimeReplyStream<'a, E>, usize), RuntimeReplyStartError>;

pub struct RuntimeReplyStartRequest {
    pub request: RuntimeReplyRequest,
    pub session_config: AgentSessionConfig,
    pub cancel_token: Option<CancellationToken>,
    pub emitted_any: bool,
}

impl RuntimeReplyStartRequest {
    pub fn new(
        request: RuntimeReplyRequest,
        session_config: AgentSessionConfig,
        cancel_token: Option<CancellationToken>,
        emitted_any: bool,
    ) -> Self {
        Self {
            request,
            session_config,
            cancel_token,
            emitted_any,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuntimeReplyStartError {
    pub message: String,
    pub emitted_any: bool,
}

impl RuntimeReplyStartError {
    pub fn new(message: impl Into<String>, emitted_any: bool) -> Self {
        Self {
            message: message.into(),
            emitted_any,
        }
    }

    pub fn from_provider_wire_support_issue(
        issue: &RuntimeReplyProviderWireSupportIssue,
        emitted_any: bool,
    ) -> Self {
        Self::new(issue.message(), emitted_any)
    }
}

pub trait RuntimeReplyStreamHost<E> {
    type Backend: RuntimeReplyBackend<E>;

    fn reply_backend(&self) -> &Self::Backend;
}

pub trait RuntimeReplyPolicyHost<E, S>: RuntimeReplyStreamHost<E> {
    fn emit_runtime_status<'a, F>(
        &'a self,
        session_config: &'a AgentSessionConfig,
        status: S,
        on_event: &'a mut F,
    ) -> BoxFuture<'a, ()>
    where
        F: FnMut(&E) + Send + 'a,
        S: Send + 'a;

    fn persist_cancelled_turn_context_marker<'a>(
        &'a self,
        session_id: &'a str,
    ) -> BoxFuture<'a, ()>;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn runtime_reply_start_error_carries_policy_state() {
        let error = RuntimeReplyStartError::new("stream failed", true);

        assert_eq!(error.message, "stream failed");
        assert!(error.emitted_any);
    }

    #[test]
    fn runtime_reply_start_error_maps_provider_wire_support_issue() {
        use model_provider::provider_stream::{
            RuntimeProviderBackend, RuntimeReplyProviderRequestWireShape,
            RuntimeReplyProviderWireSupportIssue,
        };

        let issue = RuntimeReplyProviderWireSupportIssue {
            provider_backend: Some(RuntimeProviderBackend::AsterCompat),
            provider_name: Some("openai".to_string()),
            model_name: Some("gpt-5.3-codex".to_string()),
            wire_shape: RuntimeReplyProviderRequestWireShape {
                use_responses_lite: true,
                ..Default::default()
            },
        };
        let error = RuntimeReplyStartError::from_provider_wire_support_issue(&issue, true);

        assert_eq!(error.message, RuntimeReplyProviderWireSupportIssue::MESSAGE);
        assert!(error.emitted_any);
    }

    #[test]
    fn runtime_reply_start_request_carries_execution_boundary_input() {
        use crate::reply_input::RuntimeReplyInput;

        let request = RuntimeReplyRequest::from_attempt_input(
            "session-1",
            RuntimeReplyInput::text("hello").into(),
            None,
            None,
        );
        let session_config = crate::session_config::SessionConfigBuilder::new("session-1").build();
        let start_request = RuntimeReplyStartRequest::new(request, session_config, None, true);

        assert_eq!(start_request.request.stream_request.session_id, "session-1");
        assert_eq!(start_request.session_config.id, "session-1");
        assert!(start_request.cancel_token.is_none());
        assert!(start_request.emitted_any);
    }
}
