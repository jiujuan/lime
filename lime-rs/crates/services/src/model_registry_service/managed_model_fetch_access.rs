fn parse_api_host_url(api_host: &str) -> Option<reqwest::Url> {
    let trimmed = api_host.trim();
    if trimmed.is_empty() {
        return None;
    }

    reqwest::Url::parse(trimmed)
        .or_else(|_| reqwest::Url::parse(&format!("https://{trimmed}")))
        .ok()
}

pub(super) fn is_lime_managed_api_host(api_host: &str) -> bool {
    let Some(url) = parse_api_host_url(api_host) else {
        return false;
    };
    let Some(host) = url.host_str() else {
        return false;
    };
    let host = host.trim_end_matches('.').to_ascii_lowercase();

    host == "limeai.run"
        || host.ends_with(".limeai.run")
        || host == "lime.ai"
        || host.ends_with(".lime.ai")
}

#[cfg(test)]
mod tests {
    use super::is_lime_managed_api_host;

    #[test]
    fn recognizes_lime_managed_hosts() {
        assert!(is_lime_managed_api_host("https://llm.limeai.run"));
        assert!(is_lime_managed_api_host(
            "https://gateway-api.limeai.run/root#lime_tenant_id=tenant-0001"
        ));
        assert!(is_lime_managed_api_host("hub.lime.ai/v1"));
    }

    #[test]
    fn rejects_non_lime_hosts() {
        assert!(!is_lime_managed_api_host("https://api.openai.com"));
        assert!(!is_lime_managed_api_host("https://limeai.run.evil.test"));
    }
}
