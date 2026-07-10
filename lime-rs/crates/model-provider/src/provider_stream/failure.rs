use crate::runtime_provider::message_is_non_retryable_provider_rejection;
use agent_protocol::provider_trace::ProviderTraceFailure;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RuntimeReplyProviderFailureKind {
    Authentication,
    ContextLength,
    RateLimit,
    Server,
    Request,
    Execution,
    Usage,
    NotImplemented,
    Unknown,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct RuntimeReplyProviderFailure {
    pub kind: RuntimeReplyProviderFailureKind,
    pub retryable: bool,
    pub non_retryable_provider_rejection: bool,
}

impl RuntimeReplyProviderFailureKind {
    pub fn from_category(category: &str) -> Self {
        match category {
            "auth" => Self::Authentication,
            "context_length" => Self::ContextLength,
            "rate_limit" => Self::RateLimit,
            "server" => Self::Server,
            "request" => Self::Request,
            "execution" => Self::Execution,
            "usage" => Self::Usage,
            "not_implemented" => Self::NotImplemented,
            _ => Self::Unknown,
        }
    }

    pub fn as_category(self) -> &'static str {
        match self {
            Self::Authentication => "auth",
            Self::ContextLength => "context_length",
            Self::RateLimit => "rate_limit",
            Self::Server => "server",
            Self::Request => "request",
            Self::Execution => "execution",
            Self::Usage => "usage",
            Self::NotImplemented => "not_implemented",
            Self::Unknown => "unknown",
        }
    }
}

impl RuntimeReplyProviderFailure {
    pub fn new(
        kind: RuntimeReplyProviderFailureKind,
        retryable: bool,
        non_retryable_provider_rejection: bool,
    ) -> Self {
        Self {
            kind,
            retryable,
            non_retryable_provider_rejection,
        }
    }

    pub fn from_category(
        category: &str,
        retryable: bool,
        non_retryable_provider_rejection: bool,
    ) -> Self {
        Self::new(
            RuntimeReplyProviderFailureKind::from_category(category),
            retryable,
            non_retryable_provider_rejection,
        )
    }
}

pub fn provider_stream_failure_should_log_as_error(failure: RuntimeReplyProviderFailure) -> bool {
    !failure.non_retryable_provider_rejection
        && (matches!(
            failure.kind,
            RuntimeReplyProviderFailureKind::Server
                | RuntimeReplyProviderFailureKind::Execution
                | RuntimeReplyProviderFailureKind::Usage
        ) || failure.retryable)
}

pub fn provider_stream_failure_message_should_log_as_warning(message: impl AsRef<str>) -> bool {
    !message_is_non_retryable_provider_rejection(message.as_ref())
}

pub fn provider_stream_trace_failure(failure: RuntimeReplyProviderFailure) -> ProviderTraceFailure {
    ProviderTraceFailure::new(
        failure.kind.as_category(),
        failure.retryable,
        failure.non_retryable_provider_rejection,
    )
}
