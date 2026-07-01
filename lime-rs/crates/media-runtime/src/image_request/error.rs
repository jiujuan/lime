use chrono::Utc;
use reqwest::StatusCode;
use serde_json::Value;

use crate::TaskErrorRecord;

pub(super) fn build_image_task_error(
    code: &str,
    message: impl Into<String>,
    retryable: bool,
    stage: &str,
) -> TaskErrorRecord {
    build_image_task_provider_error(code, message, retryable, stage, None)
}

pub(super) fn build_image_provider_http_error(
    status: StatusCode,
    upstream_code: Option<String>,
    message: impl Into<String>,
    stage: &str,
    code_override: Option<&str>,
) -> TaskErrorRecord {
    let classification = classify_provider_http_status(status);
    build_image_task_provider_error(
        code_override.unwrap_or(classification.code),
        message,
        classification.retryable,
        stage,
        Some(provider_code_or_status(status, upstream_code)),
    )
}

pub(super) fn read_response_error_code(value: &Value, paths: &[&[&str]]) -> Option<String> {
    paths.iter().find_map(|path| {
        let value = read_nested_value(value, path)?;
        value
            .as_str()
            .map(str::trim)
            .filter(|item| !item.is_empty())
            .map(ToString::to_string)
            .or_else(|| value.as_i64().map(|number| number.to_string()))
            .or_else(|| value.as_u64().map(|number| number.to_string()))
    })
}

pub(super) fn read_response_error_message(value: &Value, paths: &[&[&str]]) -> Option<String> {
    paths.iter().find_map(|path| {
        read_nested_value(value, path)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|item| !item.is_empty())
            .map(ToString::to_string)
    })
}

fn build_image_task_provider_error(
    code: &str,
    message: impl Into<String>,
    retryable: bool,
    stage: &str,
    provider_code: Option<String>,
) -> TaskErrorRecord {
    TaskErrorRecord {
        code: code.to_string(),
        message: message.into(),
        retryable,
        stage: Some(stage.to_string()),
        provider_code,
        occurred_at: Some(Utc::now().to_rfc3339()),
    }
}

fn provider_code_or_status(status: StatusCode, upstream_code: Option<String>) -> String {
    upstream_code
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| format!("http_{}", status.as_u16()))
}

fn read_nested_value<'a>(value: &'a Value, path: &[&str]) -> Option<&'a Value> {
    let mut current = value;
    for key in path {
        current = current.get(*key)?;
    }
    Some(current)
}

struct ProviderHttpClassification {
    code: &'static str,
    retryable: bool,
}

fn classify_provider_http_status(status: StatusCode) -> ProviderHttpClassification {
    let code = match status {
        StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => "auth_failed",
        StatusCode::TOO_MANY_REQUESTS => "rate_limited",
        _ if status.is_server_error() => "provider_unavailable",
        _ => "provider_request_failed",
    };
    ProviderHttpClassification {
        code,
        retryable: status == StatusCode::TOO_MANY_REQUESTS
            || status == StatusCode::REQUEST_TIMEOUT
            || status.is_server_error(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_http_error_classifies_auth_rate_limit_and_server_errors() {
        let auth = build_image_provider_http_error(
            StatusCode::UNAUTHORIZED,
            Some("invalid_api_key".to_string()),
            "key rejected",
            "request",
            None,
        );
        assert_eq!(auth.code, "auth_failed");
        assert_eq!(auth.provider_code.as_deref(), Some("invalid_api_key"));
        assert!(!auth.retryable);

        let rate_limited = build_image_provider_http_error(
            StatusCode::TOO_MANY_REQUESTS,
            None,
            "rate limited",
            "request",
            None,
        );
        assert_eq!(rate_limited.code, "rate_limited");
        assert_eq!(rate_limited.provider_code.as_deref(), Some("http_429"));
        assert!(rate_limited.retryable);

        let unavailable = build_image_provider_http_error(
            StatusCode::SERVICE_UNAVAILABLE,
            Some("UNAVAILABLE".to_string()),
            "try later",
            "request",
            None,
        );
        assert_eq!(unavailable.code, "provider_unavailable");
        assert_eq!(unavailable.provider_code.as_deref(), Some("UNAVAILABLE"));
        assert!(unavailable.retryable);
    }
}
