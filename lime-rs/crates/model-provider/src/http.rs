pub fn should_bypass_system_proxy(input: &str) -> bool {
    let host = url::Url::parse(input)
        .ok()
        .and_then(|url| url.host_str().map(str::to_owned))
        .unwrap_or_else(|| input.trim().to_string());

    matches!(host.as_str(), "localhost" | "127.0.0.1" | "0.0.0.0" | "::1")
        || host.starts_with("127.")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bypasses_proxy_for_loopback_hosts() {
        assert!(should_bypass_system_proxy("http://127.0.0.1:11434"));
        assert!(should_bypass_system_proxy("http://localhost:11434/api"));
        assert!(should_bypass_system_proxy("http://0.0.0.0:1234"));
        assert!(should_bypass_system_proxy("127.0.0.2"));
        assert!(should_bypass_system_proxy("::1"));
    }

    #[test]
    fn keeps_proxy_for_remote_hosts() {
        assert!(!should_bypass_system_proxy("https://api.openai.com/v1"));
        assert!(!should_bypass_system_proxy("https://example.com"));
    }
}
