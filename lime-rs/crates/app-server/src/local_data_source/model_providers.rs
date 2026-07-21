use super::data_error;
use super::model_projection::model_info_from_value;
use super::model_projection::provider_info_from_value;
use super::model_projection::provider_key_info_from_value;
use super::values_from_serializable_vec;
use crate::RuntimeCoreError;
use app_server_protocol::ModelListParams;
use app_server_protocol::ModelListResponse;
use app_server_protocol::ModelPreferencesListResponse;
use app_server_protocol::ModelProviderAliasListResponse;
use app_server_protocol::ModelProviderAliasReadParams;
use app_server_protocol::ModelProviderAliasReadResponse;
use app_server_protocol::ModelProviderCatalogListResponse;
use app_server_protocol::ModelProviderConfigExportParams;
use app_server_protocol::ModelProviderConfigExportResponse;
use app_server_protocol::ModelProviderConfigImportParams;
use app_server_protocol::ModelProviderConfigImportResponse;
use app_server_protocol::ModelProviderCreateParams;
use app_server_protocol::ModelProviderDeleteParams;
use app_server_protocol::ModelProviderDeleteResponse;
use app_server_protocol::ModelProviderFetchModelsParams;
use app_server_protocol::ModelProviderFetchModelsResponse;
use app_server_protocol::ModelProviderKeyCreateParams;
use app_server_protocol::ModelProviderKeyDeleteParams;
use app_server_protocol::ModelProviderKeyDeleteResponse;
use app_server_protocol::ModelProviderKeyEventParams;
use app_server_protocol::ModelProviderKeyNextParams;
use app_server_protocol::ModelProviderKeyNextResponse;
use app_server_protocol::ModelProviderKeyUpdateParams;
use app_server_protocol::ModelProviderKeyWriteResponse;
use app_server_protocol::ModelProviderListResponse;
use app_server_protocol::ModelProviderMutationResponse;
use app_server_protocol::ModelProviderReadParams;
use app_server_protocol::ModelProviderReadResponse;
use app_server_protocol::ModelProviderSortOrdersUpdateParams;
use app_server_protocol::ModelProviderTestChatParams;
use app_server_protocol::ModelProviderTestChatResponse;
use app_server_protocol::ModelProviderTestConnectionParams;
use app_server_protocol::ModelProviderTestConnectionResponse;
use app_server_protocol::ModelProviderUiStateReadParams;
use app_server_protocol::ModelProviderUiStateReadResponse;
use app_server_protocol::ModelProviderUiStateWriteParams;
use app_server_protocol::ModelProviderUpdateParams;
use app_server_protocol::ModelProviderWriteResponse;
use app_server_protocol::ModelSyncStateReadResponse;
use lime_core::database::dao::api_key_provider::ApiKeyEntry;
use lime_core::database::dao::api_key_provider::ApiKeyProvider;
use lime_core::database::dao::api_key_provider::ApiProviderPromptCacheMode;
use lime_core::database::dao::api_key_provider::ApiProviderType;
use lime_core::database::dao::api_key_provider::ProviderWithKeys;
use lime_core::database::dao::route_state::RouteStateDao;
use lime_core::database::system_providers::get_system_providers;
use lime_core::database::system_providers::SystemProviderDef;
use lime_core::database::DbConnection;
use lime_core::models::model_registry::EnhancedModelMetadata;
use lime_core::models::model_registry::ModelTier;
use lime_services::api_key_provider_service::ApiKeyProviderService;
use lime_services::model_registry_service::FetchModelsResult;
use lime_services::model_registry_service::ModelRegistryService;
use serde_json::json;
use serde_json::Map;
use serde_json::Value;
use std::collections::HashSet;

pub(crate) fn read_model_route_generation(db: &DbConnection) -> Result<u64, RuntimeCoreError> {
    let conn = lime_core::database::lock_db(db).map_err(data_error)?;
    RouteStateDao::read_generation(&conn).map_err(data_error)
}

pub(crate) async fn list_models(
    db: &DbConnection,
    api_key_provider_service: &ApiKeyProviderService,
    model_registry_service: &ModelRegistryService,
    params: ModelListParams,
) -> Result<ModelListResponse, RuntimeCoreError> {
    let provider_filter = params
        .provider_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let tier_filter = params
        .tier
        .as_deref()
        .map(|tier| tier.parse::<ModelTier>().map_err(data_error))
        .transpose()?;

    let mut models = if let Some(provider_id) = provider_filter {
        model_registry_service
            .get_models_by_provider(provider_id)
            .await
    } else if let Some(tier) = tier_filter.clone() {
        model_registry_service.get_models_by_tier(tier).await
    } else {
        model_registry_service.get_all_models().await
    };

    append_provider_models(
        db,
        api_key_provider_service,
        model_registry_service,
        provider_filter,
        tier_filter.as_ref(),
        &mut models,
    )?;

    Ok(ModelListResponse {
        models: values_from_serializable_vec(models)?
            .iter()
            .map(model_info_from_value)
            .collect(),
    })
}

fn append_provider_models(
    db: &DbConnection,
    api_key_provider_service: &ApiKeyProviderService,
    model_registry_service: &ModelRegistryService,
    provider_filter: Option<&str>,
    tier_filter: Option<&ModelTier>,
    models: &mut Vec<EnhancedModelMetadata>,
) -> Result<(), RuntimeCoreError> {
    let mut seen = models
        .iter()
        .map(model_dedupe_key)
        .collect::<HashSet<(String, String)>>();
    let providers = api_key_provider_service
        .get_all_providers(db)
        .map_err(data_error)?;

    for provider in providers {
        if !provider.provider.enabled {
            continue;
        }
        let provider_id = provider.provider.id.as_str();
        if provider_filter.is_some_and(|filter| filter != provider_id) {
            continue;
        }

        for model_id in &provider.provider.custom_models {
            append_model_if_visible(
                models,
                &mut seen,
                tier_filter,
                model_registry_service.build_declared_model_metadata(provider_id, model_id),
            );
        }

        let provider_type = provider.provider.effective_provider_type();
        match model_registry_service.get_cached_provider_models(
            provider_id,
            &provider.provider.api_host,
            Some(provider_type),
        ) {
            Ok(Some(result)) => {
                for model in result.models {
                    append_model_if_visible(models, &mut seen, tier_filter, model);
                }
            }
            Ok(None) => {}
            Err(error) => {
                tracing::warn!(
                    "[ModelProvider] 读取 Provider 模型缓存失败，跳过缓存模型: provider={}, error={}",
                    provider_id,
                    error
                );
            }
        }
    }

    Ok(())
}

fn append_model_if_visible(
    models: &mut Vec<EnhancedModelMetadata>,
    seen: &mut HashSet<(String, String)>,
    tier_filter: Option<&ModelTier>,
    model: EnhancedModelMetadata,
) {
    if tier_filter.is_some_and(|tier| &model.tier != tier) {
        return;
    }
    let key = model_dedupe_key(&model);
    if seen.insert(key) {
        models.push(model);
    }
}

fn model_dedupe_key(model: &EnhancedModelMetadata) -> (String, String) {
    (
        model.provider_id.trim().to_ascii_lowercase(),
        model.id.trim().to_ascii_lowercase(),
    )
}

pub(crate) async fn list_model_preferences(
    model_registry_service: &ModelRegistryService,
) -> Result<ModelPreferencesListResponse, RuntimeCoreError> {
    let preferences = model_registry_service
        .get_all_preferences()
        .await
        .map_err(data_error)?;
    Ok(ModelPreferencesListResponse {
        preferences: values_from_serializable_vec(preferences)?,
    })
}

pub(crate) async fn read_model_sync_state(
    model_registry_service: &ModelRegistryService,
) -> Result<ModelSyncStateReadResponse, RuntimeCoreError> {
    Ok(ModelSyncStateReadResponse {
        sync_state: serde_json::to_value(model_registry_service.get_sync_state().await)
            .map_err(data_error)?,
    })
}

pub(crate) fn list_model_providers(
    db: &DbConnection,
    api_key_provider_service: &ApiKeyProviderService,
) -> Result<ModelProviderListResponse, RuntimeCoreError> {
    let providers = api_key_provider_service
        .get_all_providers(db)
        .map_err(data_error)?
        .iter()
        .map(|provider| provider_with_keys_to_value(provider, api_key_provider_service))
        .map(|provider| provider_info_from_value(&provider))
        .collect();
    Ok(ModelProviderListResponse { providers })
}

pub(crate) fn list_model_provider_catalog(
) -> Result<ModelProviderCatalogListResponse, RuntimeCoreError> {
    let providers: Vec<Value> = get_system_providers()
        .into_iter()
        .map(system_provider_to_value)
        .collect();
    Ok(ModelProviderCatalogListResponse {
        providers: providers.iter().map(provider_info_from_value).collect(),
    })
}

pub(crate) fn read_model_provider(
    db: &DbConnection,
    api_key_provider_service: &ApiKeyProviderService,
    params: ModelProviderReadParams,
) -> Result<ModelProviderReadResponse, RuntimeCoreError> {
    let provider = api_key_provider_service
        .get_provider(db, &params.provider_id)
        .map_err(data_error)?
        .map(|provider| provider_with_keys_to_value(&provider, api_key_provider_service))
        .map(|provider| provider_info_from_value(&provider));
    Ok(ModelProviderReadResponse { provider })
}

pub(crate) fn create_model_provider(
    db: &DbConnection,
    api_key_provider_service: &ApiKeyProviderService,
    params: ModelProviderCreateParams,
) -> Result<ModelProviderWriteResponse, RuntimeCoreError> {
    let provider_type = params
        .provider_type
        .parse::<ApiProviderType>()
        .map_err(data_error)?;
    let provider = api_key_provider_service
        .add_custom_provider(
            db,
            params.name,
            provider_type,
            params.api_host,
            params.api_version,
            params.project,
            params.location,
            params.region,
            parse_prompt_cache_mode(params.prompt_cache_mode)?,
        )
        .map_err(data_error)?;
    let provider = provider_to_value(&provider, 0);
    Ok(ModelProviderWriteResponse {
        provider: provider_info_from_value(&provider),
    })
}

pub(crate) fn update_model_provider(
    db: &DbConnection,
    api_key_provider_service: &ApiKeyProviderService,
    params: ModelProviderUpdateParams,
) -> Result<ModelProviderWriteResponse, RuntimeCoreError> {
    let provider_type = params
        .provider_type
        .map(|value| value.parse::<ApiProviderType>())
        .transpose()
        .map_err(data_error)?;
    let provider = api_key_provider_service
        .update_provider(
            db,
            &params.provider_id,
            params.name,
            provider_type,
            params.api_host,
            params.enabled,
            params.sort_order,
            params.api_version,
            params.project,
            params.location,
            params.region,
            parse_prompt_cache_mode(params.prompt_cache_mode)?,
            params.custom_models,
        )
        .map_err(data_error)?;
    let api_key_count = api_key_provider_service
        .get_provider(db, &params.provider_id)
        .map_err(data_error)?
        .map(|provider| provider.api_keys.len())
        .unwrap_or(0);
    let provider = provider_to_value(&provider, api_key_count);
    Ok(ModelProviderWriteResponse {
        provider: provider_info_from_value(&provider),
    })
}

pub(crate) fn delete_model_provider(
    db: &DbConnection,
    api_key_provider_service: &ApiKeyProviderService,
    params: ModelProviderDeleteParams,
) -> Result<ModelProviderDeleteResponse, RuntimeCoreError> {
    let deleted = api_key_provider_service
        .delete_custom_provider(db, &params.provider_id)
        .map_err(data_error)?;
    Ok(ModelProviderDeleteResponse { deleted })
}

pub(crate) fn update_model_provider_sort_orders(
    db: &DbConnection,
    api_key_provider_service: &ApiKeyProviderService,
    params: ModelProviderSortOrdersUpdateParams,
) -> Result<ModelProviderMutationResponse, RuntimeCoreError> {
    let sort_orders = params
        .sort_orders
        .into_iter()
        .map(|item| (item.provider_id, item.sort_order))
        .collect();
    api_key_provider_service
        .update_provider_sort_orders(db, sort_orders)
        .map_err(data_error)?;
    Ok(ModelProviderMutationResponse::default())
}

pub(crate) fn export_model_provider_config(
    db: &DbConnection,
    api_key_provider_service: &ApiKeyProviderService,
    params: ModelProviderConfigExportParams,
) -> Result<ModelProviderConfigExportResponse, RuntimeCoreError> {
    let config = api_key_provider_service
        .export_config(db, params.include_keys.unwrap_or(false))
        .map_err(data_error)?;
    let config_json = serde_json::to_string_pretty(&config).map_err(data_error)?;
    Ok(ModelProviderConfigExportResponse { config_json })
}

pub(crate) fn import_model_provider_config(
    db: &DbConnection,
    api_key_provider_service: &ApiKeyProviderService,
    params: ModelProviderConfigImportParams,
) -> Result<ModelProviderConfigImportResponse, RuntimeCoreError> {
    let result = api_key_provider_service
        .import_config(db, &params.config_json)
        .map_err(data_error)?;
    Ok(ModelProviderConfigImportResponse {
        success: result.success,
        imported_providers: result.imported_providers,
        imported_api_keys: result.imported_api_keys,
        skipped_providers: result.skipped_providers,
        errors: result.errors,
    })
}

pub(crate) async fn test_model_provider_connection(
    db: &DbConnection,
    api_key_provider_service: &ApiKeyProviderService,
    params: ModelProviderTestConnectionParams,
) -> Result<ModelProviderTestConnectionResponse, RuntimeCoreError> {
    let result = api_key_provider_service
        .test_connection_with_fallback_models(
            db,
            &params.provider_id,
            params.model_name,
            Vec::new(),
        )
        .await
        .map_err(data_error)?;
    Ok(ModelProviderTestConnectionResponse {
        success: result.success,
        latency_ms: result.latency_ms,
        error: result.error,
        models: result.models,
    })
}

pub(crate) async fn test_model_provider_chat(
    db: &DbConnection,
    api_key_provider_service: &ApiKeyProviderService,
    params: ModelProviderTestChatParams,
) -> Result<ModelProviderTestChatResponse, RuntimeCoreError> {
    let result = api_key_provider_service
        .test_chat_with_fallback_models(
            db,
            &params.provider_id,
            params.model_name,
            params.prompt,
            Vec::new(),
        )
        .await
        .map_err(data_error)?;
    Ok(ModelProviderTestChatResponse {
        success: result.success,
        latency_ms: result.latency_ms,
        error: result.error,
        content: result.content,
        raw: result.raw,
    })
}

pub(crate) async fn fetch_model_provider_models(
    db: &DbConnection,
    api_key_provider_service: &ApiKeyProviderService,
    model_registry_service: &ModelRegistryService,
    params: ModelProviderFetchModelsParams,
) -> Result<ModelProviderFetchModelsResponse, RuntimeCoreError> {
    let provider = api_key_provider_service
        .get_provider(db, &params.provider_id)
        .map_err(data_error)?
        .ok_or_else(|| data_error(format!("Provider 不存在: {}", params.provider_id)))?;
    let api_host = provider.provider.api_host.clone();
    if api_host.trim().is_empty() {
        return Err(data_error("Provider 没有配置 API Host"));
    }
    let provider_type = provider.provider.effective_provider_type();
    let requires_api_key = ModelRegistryService::requires_api_key_for_model_fetch(
        &params.provider_id,
        &api_host,
        provider_type,
    );
    let api_key = if requires_api_key {
        api_key_provider_service
            .get_next_api_key(db, &params.provider_id)
            .map_err(data_error)?
            .ok_or_else(|| {
                data_error(format!(
                    "Provider {} 没有可用的 API Key",
                    params.provider_id
                ))
            })?
    } else {
        api_key_provider_service
            .get_next_api_key(db, &params.provider_id)
            .map_err(data_error)?
            .unwrap_or_default()
    };
    let result = model_registry_service
        .fetch_models_from_api_with_hints(
            &params.provider_id,
            &api_host,
            &api_key,
            Some(provider_type),
            &provider.provider.custom_models,
        )
        .await
        .map_err(data_error)?;
    fetch_models_result_to_response(result)
}

pub(crate) fn create_model_provider_key(
    db: &DbConnection,
    api_key_provider_service: &ApiKeyProviderService,
    params: ModelProviderKeyCreateParams,
) -> Result<ModelProviderKeyWriteResponse, RuntimeCoreError> {
    let key = api_key_provider_service
        .add_api_key(
            db,
            &params.provider_id,
            &params.api_key,
            params.alias,
            params.replace_existing.unwrap_or(false),
        )
        .map_err(data_error)?;
    Ok(ModelProviderKeyWriteResponse {
        key: provider_key_info_from_value(&api_key_to_value(&key, api_key_provider_service)),
    })
}

pub(crate) fn update_model_provider_key(
    db: &DbConnection,
    api_key_provider_service: &ApiKeyProviderService,
    params: ModelProviderKeyUpdateParams,
) -> Result<ModelProviderKeyWriteResponse, RuntimeCoreError> {
    let key = if let Some(enabled) = params.enabled {
        api_key_provider_service
            .toggle_api_key(db, &params.key_id, enabled)
            .map_err(data_error)?
    } else {
        api_key_provider_service
            .update_api_key_alias(db, &params.key_id, params.alias.clone())
            .map_err(data_error)?
    };
    let key = if params.enabled.is_some() && params.alias.is_some() {
        api_key_provider_service
            .update_api_key_alias(db, &params.key_id, params.alias)
            .map_err(data_error)?
    } else {
        key
    };
    Ok(ModelProviderKeyWriteResponse {
        key: provider_key_info_from_value(&api_key_to_value(&key, api_key_provider_service)),
    })
}

pub(crate) fn delete_model_provider_key(
    db: &DbConnection,
    api_key_provider_service: &ApiKeyProviderService,
    params: ModelProviderKeyDeleteParams,
) -> Result<ModelProviderKeyDeleteResponse, RuntimeCoreError> {
    let deleted = api_key_provider_service
        .delete_api_key(db, &params.key_id)
        .map_err(data_error)?;
    Ok(ModelProviderKeyDeleteResponse { deleted })
}

pub(crate) fn read_next_model_provider_key(
    db: &DbConnection,
    api_key_provider_service: &ApiKeyProviderService,
    params: ModelProviderKeyNextParams,
) -> Result<ModelProviderKeyNextResponse, RuntimeCoreError> {
    let next = api_key_provider_service
        .get_next_api_key_entry(db, &params.provider_id)
        .map_err(data_error)?;
    Ok(match next {
        Some((key_id, api_key)) => ModelProviderKeyNextResponse {
            api_key: Some(api_key),
            key_id: Some(key_id),
        },
        None => ModelProviderKeyNextResponse::default(),
    })
}

pub(crate) fn record_model_provider_key_usage(
    db: &DbConnection,
    api_key_provider_service: &ApiKeyProviderService,
    params: ModelProviderKeyEventParams,
) -> Result<ModelProviderMutationResponse, RuntimeCoreError> {
    api_key_provider_service
        .record_usage(db, &params.key_id)
        .map_err(data_error)?;
    Ok(ModelProviderMutationResponse::default())
}

pub(crate) fn record_model_provider_key_error(
    db: &DbConnection,
    api_key_provider_service: &ApiKeyProviderService,
    params: ModelProviderKeyEventParams,
) -> Result<ModelProviderMutationResponse, RuntimeCoreError> {
    api_key_provider_service
        .record_error(db, &params.key_id)
        .map_err(data_error)?;
    Ok(ModelProviderMutationResponse::default())
}

pub(crate) fn read_model_provider_ui_state(
    db: &DbConnection,
    api_key_provider_service: &ApiKeyProviderService,
    params: ModelProviderUiStateReadParams,
) -> Result<ModelProviderUiStateReadResponse, RuntimeCoreError> {
    let value = api_key_provider_service
        .get_ui_state(db, &params.key)
        .map_err(data_error)?;
    Ok(ModelProviderUiStateReadResponse { value })
}

pub(crate) fn write_model_provider_ui_state(
    db: &DbConnection,
    api_key_provider_service: &ApiKeyProviderService,
    params: ModelProviderUiStateWriteParams,
) -> Result<ModelProviderMutationResponse, RuntimeCoreError> {
    api_key_provider_service
        .set_ui_state(db, &params.key, &params.value)
        .map_err(data_error)?;
    Ok(ModelProviderMutationResponse::default())
}

pub(crate) async fn read_model_provider_alias(
    model_registry_service: &ModelRegistryService,
    params: ModelProviderAliasReadParams,
) -> Result<ModelProviderAliasReadResponse, RuntimeCoreError> {
    Ok(ModelProviderAliasReadResponse {
        config: model_registry_service
            .get_provider_alias_config(&params.provider)
            .await
            .map(serde_json::to_value)
            .transpose()
            .map_err(data_error)?,
    })
}

pub(crate) async fn list_model_provider_aliases(
    model_registry_service: &ModelRegistryService,
) -> Result<ModelProviderAliasListResponse, RuntimeCoreError> {
    let mut configs = Map::new();
    for (provider, config) in model_registry_service.get_all_alias_configs().await {
        configs.insert(provider, serde_json::to_value(config).map_err(data_error)?);
    }
    Ok(ModelProviderAliasListResponse { configs })
}

fn provider_with_keys_to_value(
    provider_with_keys: &ProviderWithKeys,
    service: &ApiKeyProviderService,
) -> Value {
    let provider = &provider_with_keys.provider;
    let api_keys: Vec<Value> = provider_with_keys
        .api_keys
        .iter()
        .map(|api_key| api_key_to_value(api_key, service))
        .collect();
    json!({
        "id": provider.id,
        "name": provider.name,
        "type": provider.effective_provider_type().to_string(),
        "api_host": provider.api_host,
        "is_system": provider.is_system,
        "group": provider.group.to_string(),
        "enabled": provider.enabled,
        "sort_order": provider.sort_order,
        "api_version": provider.api_version,
        "project": provider.project,
        "location": provider.location,
        "region": provider.region,
        "custom_models": provider.custom_models,
        "prompt_cache_mode": provider.effective_prompt_cache_mode().map(|mode| mode.to_string()),
        "api_key_count": provider_with_keys.api_keys.len(),
        "created_at": provider.created_at.to_rfc3339(),
        "updated_at": provider.updated_at.to_rfc3339(),
        "api_keys": api_keys,
    })
}

fn provider_to_value(provider: &ApiKeyProvider, api_key_count: usize) -> Value {
    json!({
        "id": provider.id,
        "name": provider.name,
        "type": provider.effective_provider_type().to_string(),
        "api_host": provider.api_host,
        "is_system": provider.is_system,
        "group": provider.group.to_string(),
        "enabled": provider.enabled,
        "sort_order": provider.sort_order,
        "api_version": provider.api_version,
        "project": provider.project,
        "location": provider.location,
        "region": provider.region,
        "custom_models": provider.custom_models,
        "prompt_cache_mode": provider.effective_prompt_cache_mode().map(|mode| mode.to_string()),
        "api_key_count": api_key_count,
        "created_at": provider.created_at.to_rfc3339(),
        "updated_at": provider.updated_at.to_rfc3339(),
    })
}

fn api_key_to_value(api_key: &ApiKeyEntry, service: &ApiKeyProviderService) -> Value {
    let api_key_masked = service
        .decrypt_api_key(&api_key.api_key_encrypted)
        .map(|decrypted| mask_api_key(&decrypted))
        .unwrap_or_else(|_| "****".to_string());
    json!({
        "id": api_key.id,
        "provider_id": api_key.provider_id,
        "api_key_masked": api_key_masked,
        "alias": api_key.alias,
        "enabled": api_key.enabled,
        "usage_count": api_key.usage_count,
        "error_count": api_key.error_count,
        "last_used_at": api_key.last_used_at.map(|value| value.to_rfc3339()),
        "created_at": api_key.created_at.to_rfc3339(),
    })
}

fn fetch_models_result_to_response(
    result: FetchModelsResult,
) -> Result<ModelProviderFetchModelsResponse, RuntimeCoreError> {
    let models = values_from_serializable_vec(result.models)?;
    Ok(ModelProviderFetchModelsResponse {
        models: models.iter().map(model_info_from_value).collect(),
        source: serde_json::to_value(result.source)
            .map_err(data_error)?
            .as_str()
            .unwrap_or("Error")
            .to_string(),
        error: result.error,
        request_url: result.request_url,
        diagnostic_hint: result.diagnostic_hint,
        error_kind: result
            .error_kind
            .map(serde_json::to_value)
            .transpose()
            .map_err(data_error)?
            .and_then(|value| value.as_str().map(str::to_string)),
        should_prompt_error: result.should_prompt_error,
        from_cache: result.from_cache,
    })
}

fn parse_prompt_cache_mode(
    value: Option<String>,
) -> Result<Option<ApiProviderPromptCacheMode>, RuntimeCoreError> {
    value
        .map(|mode| {
            mode.parse::<ApiProviderPromptCacheMode>()
                .map_err(data_error)
        })
        .transpose()
}

fn mask_api_key(key: &str) -> String {
    let chars: Vec<char> = key.chars().collect();
    if chars.len() <= 12 {
        "****".to_string()
    } else {
        let prefix: String = chars[..6].iter().collect();
        let suffix: String = chars[chars.len() - 4..].iter().collect();
        format!("{prefix}****{suffix}")
    }
}

fn system_provider_to_value(provider: SystemProviderDef) -> Value {
    json!({
        "id": provider.id,
        "name": provider.name,
        "type": provider.provider_type.to_string(),
        "api_host": provider.api_host,
        "group": provider.group.to_string(),
        "sort_order": provider.sort_order,
        "api_version": provider.api_version,
        "legacy_ids": legacy_provider_ids(provider.id),
    })
}

fn legacy_provider_ids(provider_id: &str) -> Vec<String> {
    match provider_id {
        "lime-hub" => vec![format!("{}{}", "lobe", "hub")],
        "google" => vec!["gemini".to_string()],
        "zhipuai" => vec!["zhipu".to_string()],
        "alibaba" => vec!["dashscope".to_string(), "qwen".to_string()],
        "moonshotai" => vec!["moonshot".to_string()],
        "xai" => vec!["grok".to_string()],
        "github-models" => vec!["github".to_string()],
        "github-copilot" => vec!["copilot".to_string()],
        "google-vertex" => vec!["vertexai".to_string()],
        "azure-openai" => vec!["azure".to_string()],
        "amazon-bedrock" => vec!["aws-bedrock".to_string(), "bedrock".to_string()],
        "togetherai" => vec!["together".to_string()],
        "fireworks-ai" => vec!["fireworks".to_string(), "fireworksai".to_string()],
        "xiaomi" => vec!["mimo".to_string(), "xiaomimimo".to_string()],
        "siliconflow" => vec!["silicon".to_string(), "siliconcloud".to_string()],
        "302ai" => vec!["ai302".to_string()],
        "new-api" => vec!["newapi".to_string()],
        "vercel-gateway" => vec!["vercelaigateway".to_string()],
        "fal" => vec!["falai".to_string()],
        "yi" => vec!["zeroone".to_string()],
        "infini" => vec!["infiniai".to_string()],
        "doubao" => vec!["volcengine".to_string()],
        "airgate-openai-images" => vec!["airgate".to_string(), "k8ray".to_string()],
        "baidu-cloud" => vec!["wenxin".to_string()],
        "tencent-cloud-ti" => vec!["tencentcloud".to_string()],
        _ => vec![],
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use lime_core::database::schema;
    use rusqlite::{params, Connection};
    use std::sync::{Arc, Mutex};

    fn setup_model_provider_db() -> DbConnection {
        let conn = Connection::open_in_memory().expect("open db");
        schema::create_tables(&conn).expect("create schema");
        Arc::new(Mutex::new(conn))
    }

    fn insert_provider(
        db: &DbConnection,
        provider_id: &str,
        enabled: bool,
        custom_models: &[&str],
    ) {
        let custom_models = serde_json::to_string(custom_models).expect("serialize models");
        let conn = db.lock().expect("lock db");
        conn.execute(
            "INSERT INTO api_key_providers (
                id, name, type, api_host, is_system, group_name, enabled, sort_order,
                custom_models, created_at, updated_at
             ) VALUES (?1, ?2, 'openai', ?3, 0, 'cloud', ?4, 0, ?5, ?6, ?6)",
            params![
                provider_id,
                provider_id,
                "https://llm.limeai.run#lime_tenant_id=tenant-0001",
                if enabled { 1 } else { 0 },
                custom_models,
                "2026-07-06T00:00:00Z",
            ],
        )
        .expect("insert provider");
    }

    #[tokio::test]
    async fn list_models_includes_enabled_provider_declared_models() {
        let db = setup_model_provider_db();
        insert_provider(&db, "lime-hub", true, &["gpt-5.1", "gpt-5.1"]);
        let api_key_provider_service = ApiKeyProviderService::new();
        let model_registry_service = ModelRegistryService::new(db.clone());

        let response = list_models(
            &db,
            &api_key_provider_service,
            &model_registry_service,
            ModelListParams {
                provider_id: Some("lime-hub".to_string()),
                tier: None,
            },
        )
        .await
        .expect("list models");

        assert_eq!(response.models.len(), 1);
        assert_eq!(response.models[0].id, "gpt-5.1");
        assert_eq!(response.models[0].provider_id, "lime-hub");
    }

    #[tokio::test]
    async fn list_models_skips_disabled_provider_declared_models() {
        let db = setup_model_provider_db();
        insert_provider(&db, "disabled-hub", false, &["gpt-disabled"]);
        let api_key_provider_service = ApiKeyProviderService::new();
        let model_registry_service = ModelRegistryService::new(db.clone());

        let response = list_models(
            &db,
            &api_key_provider_service,
            &model_registry_service,
            ModelListParams::default(),
        )
        .await
        .expect("list models");

        assert!(response.models.is_empty());
    }
}
