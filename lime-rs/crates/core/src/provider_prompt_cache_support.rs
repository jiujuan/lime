use serde::Deserialize;
use std::sync::OnceLock;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PromptCacheCatalog {
    #[serde(default)]
    automatic_anthropic_compatible_hosts: Vec<PromptCacheHostRule>,
}

#[derive(Debug, Deserialize)]
struct PromptCacheHostRule {
    provider: String,
    contains: String,
}

fn normalize_api_host(value: &str) -> String {
    value
        .trim()
        .to_lowercase()
        .trim_end_matches('/')
        .to_string()
}

fn load_prompt_cache_catalog() -> &'static PromptCacheCatalog {
    static CATALOG: OnceLock<PromptCacheCatalog> = OnceLock::new();

    CATALOG.get_or_init(|| {
        serde_json::from_str(include_str!(
            "../../../../src/lib/model/anthropicCompatiblePromptCacheCatalog.json"
        ))
        .expect("prompt cache catalog should be valid json")
    })
}

pub fn is_known_automatic_anthropic_compatible_host(api_host: Option<&str>) -> bool {
    resolve_known_automatic_anthropic_compatible_provider(api_host).is_some()
}

pub fn resolve_known_automatic_anthropic_compatible_provider(
    api_host: Option<&str>,
) -> Option<&'static str> {
    let normalized_api_host = normalize_api_host(api_host.unwrap_or_default());
    if normalized_api_host.is_empty() {
        return None;
    }

    load_prompt_cache_catalog()
        .automatic_anthropic_compatible_hosts
        .iter()
        .find(|rule| {
            let needle = rule.contains.trim().to_lowercase();
            !needle.is_empty() && normalized_api_host.contains(&needle)
        })
        .and_then(|rule| {
            let provider = rule.provider.trim();
            (!provider.is_empty()).then_some(provider)
        })
}

#[cfg(test)]
mod tests {
    use super::{
        is_known_automatic_anthropic_compatible_host, load_prompt_cache_catalog,
        resolve_known_automatic_anthropic_compatible_provider,
    };

    #[test]
    fn catalog_rules_should_resolve_to_declared_provider() {
        let catalog = load_prompt_cache_catalog();

        assert!(
            !catalog.automatic_anthropic_compatible_hosts.is_empty(),
            "prompt cache catalog should declare known official compatible hosts"
        );

        for rule in &catalog.automatic_anthropic_compatible_hosts {
            let host = format!("https://{}", rule.contains.trim());
            assert_eq!(
                resolve_known_automatic_anthropic_compatible_provider(Some(&host)),
                Some(rule.provider.trim()),
                "expected catalog host {} to resolve provider {}",
                rule.contains,
                rule.provider
            );
        }
    }

    #[test]
    fn known_official_anthropic_compatible_hosts_should_match() {
        let cases = [
            ("https://open.bigmodel.cn/api/anthropic", "zhipuai"),
            ("https://api.z.ai/api/anthropic", "zai"),
            ("https://api.moonshot.cn/anthropic", "moonshotai"),
            ("https://api.moonshot.ai/anthropic", "moonshotai"),
            ("https://api.kimi.com/coding/", "kimi-for-coding"),
            ("https://api.minimaxi.com/anthropic", "minimax"),
            ("https://api.minimax.io/anthropic", "minimax"),
            (
                "https://coding.dashscope.aliyuncs.com/apps/anthropic",
                "alibaba-cn",
            ),
            (
                "https://coding-intl.dashscope.aliyuncs.com/apps/anthropic",
                "alibaba",
            ),
            ("https://token-plan-cn.xiaomimimo.com/anthropic", "xiaomi"),
            ("https://token-plan-sgp.xiaomimimo.com/anthropic", "xiaomi"),
        ];

        for (host, provider) in cases {
            assert!(
                is_known_automatic_anthropic_compatible_host(Some(host)),
                "expected host to be treated as automatic prompt cache: {host}"
            );
            assert_eq!(
                resolve_known_automatic_anthropic_compatible_provider(Some(host)),
                Some(provider)
            );
        }
    }

    #[test]
    fn unknown_host_should_not_match() {
        assert!(!is_known_automatic_anthropic_compatible_host(Some(
            "https://example.com/anthropic"
        )));
        assert_eq!(
            resolve_known_automatic_anthropic_compatible_provider(Some(
                "https://example.com/anthropic"
            )),
            None
        );
    }
}
