use reqwest::StatusCode;
use std::time::Duration;
use thiserror::Error;

#[derive(Error, Debug, PartialEq)]
pub enum ProviderError {
    #[error("Authentication error: {0}")]
    Authentication(String),

    #[error("Context length exceeded: {0}")]
    ContextLengthExceeded(String),

    #[error("Rate limit exceeded: {details}")]
    RateLimitExceeded {
        details: String,
        retry_delay: Option<Duration>,
    },

    #[error("Server error: {0}")]
    ServerError(String),

    #[error("Request failed: {0}")]
    RequestFailed(String),

    #[error("Execution error: {0}")]
    ExecutionError(String),

    #[error("Usage data error: {0}")]
    UsageError(String),

    #[error("Unsupported operation: {0}")]
    NotImplemented(String),
}

impl ProviderError {
    pub fn telemetry_type(&self) -> &'static str {
        match self {
            ProviderError::Authentication(_) => "auth",
            ProviderError::ContextLengthExceeded(_) => "context_length",
            ProviderError::RateLimitExceeded { .. } => "rate_limit",
            ProviderError::ServerError(_) => "server",
            ProviderError::RequestFailed(_) => "request",
            ProviderError::ExecutionError(_) => "execution",
            ProviderError::UsageError(_) => "usage",
            ProviderError::NotImplemented(_) => "not_implemented",
        }
    }

    pub fn is_retryable(&self) -> bool {
        match self {
            ProviderError::RateLimitExceeded { .. } | ProviderError::ServerError(_) => true,
            ProviderError::RequestFailed(message) => is_retryable_request_failed_message(message),
            ProviderError::Authentication(_)
            | ProviderError::ContextLengthExceeded(_)
            | ProviderError::ExecutionError(_)
            | ProviderError::UsageError(_)
            | ProviderError::NotImplemented(_) => false,
        }
    }

    pub fn is_non_retryable_provider_rejection(&self) -> bool {
        match self {
            ProviderError::Authentication(_) => true,
            ProviderError::RequestFailed(message) => {
                Self::message_is_non_retryable_provider_rejection(message)
            }
            ProviderError::ContextLengthExceeded(_)
            | ProviderError::RateLimitExceeded { .. }
            | ProviderError::ServerError(_)
            | ProviderError::ExecutionError(_)
            | ProviderError::UsageError(_)
            | ProviderError::NotImplemented(_) => false,
        }
    }

    pub fn message_is_non_retryable_provider_rejection(message: &str) -> bool {
        let normalized = message.to_ascii_lowercase();
        normalized.contains("authentication error")
            || normalized.contains("unauthorized")
            || normalized.contains("forbidden")
            || !is_retryable_request_failed_message(message)
    }
}

fn is_retryable_request_failed_message(message: &str) -> bool {
    let normalized = message.to_ascii_lowercase();
    let non_retryable_markers = [
        "bad request (400)",
        "resource not found (404)",
        "invalid_request_error",
        "status: 400",
        "status: 401",
        "status: 403",
        "status: 404",
        "status 400",
        "status 401",
        "status 403",
        "status 404",
    ];

    !non_retryable_markers
        .iter()
        .any(|marker| normalized.contains(marker))
}

#[cfg(test)]
mod tests {
    use super::ProviderError;

    #[test]
    fn bad_request_provider_errors_are_not_retryable() {
        let error = ProviderError::RequestFailed(
            "Bad request (400): 当前模型未在租户白名单中开放".to_string(),
        );

        assert!(!error.is_retryable());
    }

    #[test]
    fn transient_request_failures_remain_retryable() {
        let error = ProviderError::RequestFailed("connection failed".to_string());

        assert!(error.is_retryable());
    }

    #[test]
    fn client_side_provider_rejections_are_classified() {
        let bad_request = ProviderError::RequestFailed(
            "Bad request (400): 当前模型未在租户白名单中开放".to_string(),
        );
        let auth = ProviderError::Authentication("invalid key".to_string());
        let server = ProviderError::ServerError("server unavailable".to_string());

        assert!(bad_request.is_non_retryable_provider_rejection());
        assert!(auth.is_non_retryable_provider_rejection());
        assert!(!server.is_non_retryable_provider_rejection());
    }

    #[test]
    fn wrapped_bad_request_messages_are_classified() {
        assert!(ProviderError::message_is_non_retryable_provider_rejection(
            "Request failed: Bad request (400): 当前模型未在租户白名单中开放"
        ));
    }
}

impl From<anyhow::Error> for ProviderError {
    fn from(error: anyhow::Error) -> Self {
        if let Some(reqwest_err) = error.downcast_ref::<reqwest::Error>() {
            let mut details = vec![];

            if let Some(status) = reqwest_err.status() {
                details.push(format!("status: {}", status));
            }
            if reqwest_err.is_timeout() {
                details.push("timeout".to_string());
            }
            if reqwest_err.is_connect() {
                if let Some(url) = reqwest_err.url() {
                    if let Some(host) = url.host_str() {
                        let port_info = url.port().map(|p| format!(":{}", p)).unwrap_or_default();

                        details.push(format!("failed to connect to {}{}", host, port_info));

                        if url.port().is_some() {
                            details.push("check that the port is correct".to_string());
                        }
                    }
                } else {
                    details.push("connection failed".to_string());
                }
            }
            let msg = if details.is_empty() {
                reqwest_err.to_string()
            } else {
                format!("{} ({})", reqwest_err, details.join(", "))
            };
            return ProviderError::RequestFailed(msg);
        }
        ProviderError::ExecutionError(error.to_string())
    }
}

impl From<reqwest::Error> for ProviderError {
    fn from(error: reqwest::Error) -> Self {
        ProviderError::RequestFailed(error.to_string())
    }
}

#[derive(Debug)]
pub enum GoogleErrorCode {
    BadRequest = 400,
    Unauthorized = 401,
    Forbidden = 403,
    NotFound = 404,
    TooManyRequests = 429,
    InternalServerError = 500,
    ServiceUnavailable = 503,
}

impl GoogleErrorCode {
    pub fn to_status_code(&self) -> StatusCode {
        match self {
            Self::BadRequest => StatusCode::BAD_REQUEST,
            Self::Unauthorized => StatusCode::UNAUTHORIZED,
            Self::Forbidden => StatusCode::FORBIDDEN,
            Self::NotFound => StatusCode::NOT_FOUND,
            Self::TooManyRequests => StatusCode::TOO_MANY_REQUESTS,
            Self::InternalServerError => StatusCode::INTERNAL_SERVER_ERROR,
            Self::ServiceUnavailable => StatusCode::SERVICE_UNAVAILABLE,
        }
    }

    pub fn from_code(code: u64) -> Option<Self> {
        match code {
            400 => Some(Self::BadRequest),
            401 => Some(Self::Unauthorized),
            403 => Some(Self::Forbidden),
            404 => Some(Self::NotFound),
            429 => Some(Self::TooManyRequests),
            500 => Some(Self::InternalServerError),
            503 => Some(Self::ServiceUnavailable),
            _ => Some(Self::InternalServerError),
        }
    }
}
