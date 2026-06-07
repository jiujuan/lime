//! 网关统一错误模型
//!
//! 为 Lime 网关层提供稳定的错误语义，便于客户端统一处理。

use serde::{Deserialize, Serialize};

/// 网关错误码
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum GatewayErrorCode {
    InvalidRequest,
    AuthenticationFailed,
    RequestConflict,
    RateLimited,
    NoCredentials,
    UpstreamTimeout,
    UpstreamUnavailable,
    UpstreamError,
    InternalError,
}

impl GatewayErrorCode {
    /// 根据状态码和错误消息推断错误码
    pub fn infer(status_code: u16, message: &str) -> Self {
        let normalized = message.to_lowercase();

        if normalized.contains("no available credentials")
            || normalized.contains("no credential")
            || normalized.contains("凭证")
        {
            return Self::NoCredentials;
        }

        if normalized.contains("timeout") || normalized.contains("超时") {
            return Self::UpstreamTimeout;
        }

        if normalized.contains("rate limit")
            || normalized.contains("too many requests")
            || normalized.contains("请求过于频繁")
        {
            return Self::RateLimited;
        }

        match status_code {
            400 | 404 | 422 => Self::InvalidRequest,
            401 | 403 => Self::AuthenticationFailed,
            409 => Self::RequestConflict,
            429 => Self::RateLimited,
            408 | 504 => Self::UpstreamTimeout,
            502 | 503 => Self::UpstreamUnavailable,
            500..=599 => Self::UpstreamError,
            _ => Self::InternalError,
        }
    }

    /// 默认错误文案
    pub fn default_message(self) -> &'static str {
        match self {
            Self::InvalidRequest => "请求参数无效",
            Self::AuthenticationFailed => "认证失败",
            Self::RequestConflict => "请求冲突",
            Self::RateLimited => "请求过于频繁，请稍后重试",
            Self::NoCredentials => "当前没有可用凭证",
            Self::UpstreamTimeout => "上游请求超时",
            Self::UpstreamUnavailable => "上游服务暂不可用",
            Self::UpstreamError => "上游服务返回错误",
            Self::InternalError => "服务内部错误",
        }
    }

    /// 是否可重试
    pub fn retryable(self) -> bool {
        matches!(
            self,
            Self::RateLimited
                | Self::UpstreamTimeout
                | Self::UpstreamUnavailable
                | Self::UpstreamError
        )
    }
}

/// 上游信息
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GatewayErrorUpstream {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub endpoint: Option<String>,
}

/// 网关错误详情
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GatewayError {
    pub code: GatewayErrorCode,
    pub message: String,
    pub retryable: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub upstream: Option<GatewayErrorUpstream>,
}

impl GatewayError {
    /// 创建错误详情
    pub fn new(code: GatewayErrorCode, message: impl Into<String>) -> Self {
        let message = message.into();
        let final_message = if message.trim().is_empty() {
            code.default_message().to_string()
        } else {
            message
        };

        Self {
            code,
            message: final_message,
            retryable: code.retryable(),
            request_id: None,
            upstream: None,
        }
    }

    /// 设置请求 ID
    pub fn with_request_id(mut self, request_id: Option<&str>) -> Self {
        self.request_id = request_id.map(ToString::to_string);
        self
    }

    /// 设置上游 provider
    pub fn with_upstream_provider(mut self, provider: Option<&str>) -> Self {
        if let Some(provider) = provider {
            self.upstream = Some(GatewayErrorUpstream {
                provider: Some(provider.to_string()),
                endpoint: None,
            });
        }
        self
    }
}

/// 网关错误响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GatewayErrorResponse {
    pub error: GatewayError,
}

impl GatewayErrorResponse {
    /// 创建响应
    pub fn new(error: GatewayError) -> Self {
        Self { error }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_infer_no_credentials() {
        let code = GatewayErrorCode::infer(503, "No available credentials");
        assert_eq!(code, GatewayErrorCode::NoCredentials);
        assert!(!code.default_message().is_empty());
    }

    #[test]
    fn test_retryable_codes() {
        assert!(GatewayErrorCode::RateLimited.retryable());
        assert!(GatewayErrorCode::UpstreamTimeout.retryable());
        assert!(!GatewayErrorCode::AuthenticationFailed.retryable());
    }

    #[test]
    fn test_gateway_error_with_request_id_and_upstream() {
        let err = GatewayError::new(GatewayErrorCode::UpstreamError, "upstream failed")
            .with_request_id(Some("req_123"))
            .with_upstream_provider(Some("kiro"));

        assert_eq!(err.request_id.as_deref(), Some("req_123"));
        assert_eq!(
            err.upstream.as_ref().and_then(|u| u.provider.as_deref()),
            Some("kiro")
        );
        assert!(err.retryable);
    }
}
