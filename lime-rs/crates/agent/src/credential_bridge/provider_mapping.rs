use lime_core::database::dao::api_key_provider::ApiProviderType;

pub(super) fn normalize_provider_selector(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

pub(super) fn resolve_runtime_provider_name_from_selector(provider_type: &str) -> &'static str {
    if let Ok(api_type) = provider_type.parse::<ApiProviderType>() {
        return api_type.runtime_spec().runtime_provider_name;
    }

    match provider_type {
        "openai" => "openai",
        "anthropic" | "claude" => "anthropic",
        "google" | "gemini" => "google",
        "bedrock" => "bedrock",
        "gcpvertexai" | "vertex" => "gcpvertexai",
        "codex" => "openai",
        "azure" | "azure-openai" => "azure",
        "ollama" => "ollama",
        "deepseek" | "custom_deepseek" => "openai",
        "groq" => "openai",
        "mistral" => "openai",
        "openrouter" => "openrouter",
        _ => "openai",
    }
}

pub(super) fn resolve_runtime_provider_name_with_api_type(
    provider_type: &str,
    resolved_api_type: Option<ApiProviderType>,
) -> &'static str {
    if let Some(api_type) = resolved_api_type {
        // Codex API Key 在 runtime provider 中走 OpenAI provider（支持标准 tools + responses 转换逻辑），
        // 避免误走 codex CLI provider 导致工具事件丢失。
        if api_type == ApiProviderType::Codex {
            return "openai";
        }
        return api_type.runtime_spec().runtime_provider_name;
    }
    resolve_runtime_provider_name_from_selector(provider_type)
}

pub(super) fn resolve_runtime_provider_name(
    provider_type: &str,
    resolved_api_type: Option<ApiProviderType>,
) -> &'static str {
    resolve_runtime_provider_name_with_api_type(provider_type, resolved_api_type)
}

#[cfg(test)]
mod tests {
    use super::resolve_runtime_provider_name_with_api_type;
    use lime_core::database::dao::api_key_provider::ApiProviderType;

    #[test]
    fn test_resolve_runtime_provider_name_with_api_type() {
        assert_eq!(
            resolve_runtime_provider_name_with_api_type(
                "custom-a32774c6-6fd0-433b-8b81-e95340e08793",
                Some(ApiProviderType::Codex),
            ),
            "openai"
        );
        assert_eq!(
            resolve_runtime_provider_name_with_api_type(
                "custom-a32774c6-6fd0-433b-8b81-e95340e08793",
                Some(ApiProviderType::AnthropicCompatible),
            ),
            "anthropic"
        );
        assert_eq!(
            resolve_runtime_provider_name_with_api_type("deepseek", None),
            "openai"
        );
    }
}
