use super::*;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum ProviderConfigApplyMode {
    Direct,
    ApiKeyProvider,
}

pub(super) fn normalize_provider_identity(value: &str) -> String {
    value.trim().to_ascii_lowercase()
}

pub(super) fn should_use_compact_native_tool_surface(
    provider_config: &ConfigureProviderRequest,
) -> bool {
    if matches!(
        provider_config.tool_call_strategy,
        Some(RuntimeToolCallStrategy::ToolShim)
    ) {
        return false;
    }

    let Some(capabilities) = provider_config.model_capabilities.as_ref() else {
        return true;
    };

    capabilities.tools || capabilities.function_calling
}

pub(super) fn resolve_provider_config_apply_mode(
    provider_config: &ConfigureProviderRequest,
) -> ProviderConfigApplyMode {
    if provider_config.api_key.is_some() || provider_config.base_url.is_some() {
        return ProviderConfigApplyMode::Direct;
    }

    let provider_selector = provider_config
        .provider_id
        .as_deref()
        .unwrap_or(&provider_config.provider_name);
    let normalized_selector = normalize_provider_identity(provider_selector);
    let normalized_provider_name = normalize_provider_identity(&provider_config.provider_name);

    if normalized_selector == "ollama" || normalized_provider_name == "ollama" {
        return ProviderConfigApplyMode::Direct;
    }

    ProviderConfigApplyMode::ApiKeyProvider
}

pub(super) async fn apply_runtime_turn_provider_config(
    state: &AsterAgentState,
    db: &DbConnection,
    session_id: &str,
    provider_config: Option<&ConfigureProviderRequest>,
) -> Result<(), String> {
    let Some(provider_config) = provider_config else {
        return Ok(());
    };

    tracing::info!(
        "[AsterAgent] 收到 provider_config: provider_id={:?}, provider_name={}, model_name={}, has_api_key={}, base_url={:?}",
        provider_config.provider_id,
        provider_config.provider_name,
        provider_config.model_name,
        provider_config.api_key.is_some(),
        provider_config.base_url
    );
    let apply_mode = resolve_provider_config_apply_mode(provider_config);
    let config = ProviderConfig {
        provider_name: provider_config.provider_name.clone(),
        provider_selector: provider_config
            .provider_id
            .clone()
            .or_else(|| Some(provider_config.provider_name.clone())),
        model_name: provider_config.model_name.clone(),
        api_key: provider_config.api_key.clone(),
        base_url: provider_config.base_url.clone(),
        credential_uuid: None,
        force_responses_api: false,
        toolshim: matches!(
            provider_config.tool_call_strategy,
            Some(RuntimeToolCallStrategy::ToolShim)
        ),
        toolshim_model: provider_config.toolshim_model.clone(),
    };
    let provider_selector = provider_config
        .provider_id
        .as_deref()
        .unwrap_or(&provider_config.provider_name);
    tracing::info!(
        "[AsterAgent] provider_config 应用策略: provider_selector={}, mode={:?}, tool_call_strategy={:?}, toolshim_model={:?}",
        provider_selector,
        apply_mode,
        provider_config.tool_call_strategy,
        provider_config.toolshim_model
    );

    match apply_mode {
        ProviderConfigApplyMode::Direct => {
            state.configure_provider(config, session_id, db).await?;
        }
        ProviderConfigApplyMode::ApiKeyProvider => {
            state
                .configure_provider_from_pool(
                    db,
                    provider_selector,
                    &provider_config.model_name,
                    session_id,
                )
                .await?;
        }
    }
    persist_session_provider_routing(session_id, provider_selector).await
}
