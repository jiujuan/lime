use lime_core::env_compat;
use std::time::Duration;

const PROVIDER_STREAM_IDLE_TIMEOUT_ENV_KEYS: &[&str] = &[
    "LIME_PROVIDER_STREAM_IDLE_TIMEOUT_MS",
    "PROXYCAST_PROVIDER_STREAM_IDLE_TIMEOUT_MS",
];
const DEFAULT_PROVIDER_STREAM_IDLE_TIMEOUT_MS: u64 = 120_000;
const MIN_PROVIDER_STREAM_IDLE_TIMEOUT_MS: u64 = 1_000;
const MAX_PROVIDER_STREAM_IDLE_TIMEOUT_MS: u64 = 15 * 60 * 1_000;

pub(crate) fn resolve_provider_stream_idle_timeout() -> Option<Duration> {
    let Some(raw) = env_compat::var(PROVIDER_STREAM_IDLE_TIMEOUT_ENV_KEYS) else {
        return Some(Duration::from_millis(
            DEFAULT_PROVIDER_STREAM_IDLE_TIMEOUT_MS,
        ));
    };
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Some(Duration::from_millis(
            DEFAULT_PROVIDER_STREAM_IDLE_TIMEOUT_MS,
        ));
    }

    match trimmed.to_ascii_lowercase().as_str() {
        "0" | "false" | "no" | "off" | "disabled" => None,
        _ => trimmed.parse::<u64>().ok().map(|value| {
            Duration::from_millis(value.clamp(
                MIN_PROVIDER_STREAM_IDLE_TIMEOUT_MS,
                MAX_PROVIDER_STREAM_IDLE_TIMEOUT_MS,
            ))
        }),
    }
    .or_else(|| {
        Some(Duration::from_millis(
            DEFAULT_PROVIDER_STREAM_IDLE_TIMEOUT_MS,
        ))
    })
}

pub(crate) fn provider_stream_idle_timeout_message(timeout: Duration) -> String {
    format!(
        "Agent provider execution failed: stream idle timeout after {}ms without provider event",
        timeout.as_millis()
    )
}
