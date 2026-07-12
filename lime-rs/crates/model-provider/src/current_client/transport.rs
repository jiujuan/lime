use super::CurrentProviderError;
use reqwest::{header::HeaderMap, StatusCode};
use std::time::Duration;

pub(super) const MAX_STREAM_REQUEST_ATTEMPTS: u8 = 3;
const INITIAL_RETRY_DELAY: Duration = Duration::from_millis(250);
const MAX_RETRY_AFTER: Duration = Duration::from_secs(10);

pub(super) fn should_retry_stream_request_status(status: StatusCode) -> bool {
    matches!(
        status,
        StatusCode::REQUEST_TIMEOUT
            | StatusCode::CONFLICT
            | StatusCode::TOO_EARLY
            | StatusCode::TOO_MANY_REQUESTS
            | StatusCode::INTERNAL_SERVER_ERROR
            | StatusCode::BAD_GATEWAY
            | StatusCode::SERVICE_UNAVAILABLE
            | StatusCode::GATEWAY_TIMEOUT
    )
}

pub(super) fn retry_delay(headers: &HeaderMap, completed_attempts: u8) -> Duration {
    retry_after(headers).unwrap_or_else(|| exponential_backoff(completed_attempts))
}

pub(super) fn request_failure(url: &str, error: reqwest::Error) -> CurrentProviderError {
    CurrentProviderError::new(format!("Provider 请求失败 ({url}): {error}"))
}

fn retry_after(headers: &HeaderMap) -> Option<Duration> {
    let seconds = headers
        .get(reqwest::header::RETRY_AFTER)?
        .to_str()
        .ok()?
        .trim()
        .parse::<u64>()
        .ok()?;
    Some(Duration::from_secs(seconds).min(MAX_RETRY_AFTER))
}

fn exponential_backoff(completed_attempts: u8) -> Duration {
    INITIAL_RETRY_DELAY.saturating_mul(1_u32 << completed_attempts.saturating_sub(1))
}

#[cfg(test)]
mod tests {
    use super::*;
    use reqwest::header::{HeaderValue, RETRY_AFTER};

    #[test]
    fn retries_only_transient_statuses() {
        for status in [
            StatusCode::REQUEST_TIMEOUT,
            StatusCode::CONFLICT,
            StatusCode::TOO_EARLY,
            StatusCode::TOO_MANY_REQUESTS,
            StatusCode::INTERNAL_SERVER_ERROR,
            StatusCode::BAD_GATEWAY,
            StatusCode::SERVICE_UNAVAILABLE,
            StatusCode::GATEWAY_TIMEOUT,
        ] {
            assert!(should_retry_stream_request_status(status), "{status}");
        }
        for status in [
            StatusCode::BAD_REQUEST,
            StatusCode::UNAUTHORIZED,
            StatusCode::FORBIDDEN,
            StatusCode::NOT_FOUND,
        ] {
            assert!(!should_retry_stream_request_status(status), "{status}");
        }
    }

    #[test]
    fn retry_after_overrides_and_is_capped() {
        let mut headers = HeaderMap::new();
        headers.insert(RETRY_AFTER, HeaderValue::from_static("2"));
        assert_eq!(retry_delay(&headers, 1), Duration::from_secs(2));

        headers.insert(RETRY_AFTER, HeaderValue::from_static("120"));
        assert_eq!(retry_delay(&headers, 1), MAX_RETRY_AFTER);
    }

    #[test]
    fn retry_delay_uses_short_exponential_backoff() {
        assert_eq!(
            retry_delay(&HeaderMap::new(), 1),
            Duration::from_millis(250)
        );
        assert_eq!(
            retry_delay(&HeaderMap::new(), 2),
            Duration::from_millis(500)
        );
    }
}
