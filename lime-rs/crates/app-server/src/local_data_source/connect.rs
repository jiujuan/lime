use crate::RuntimeCoreError;
use app_server_protocol::ConnectCallbackSendParams;
use app_server_protocol::ConnectCallbackSendResponse;
use app_server_protocol::ConnectCallbackStatus;
use app_server_protocol::ConnectDeepLinkResolveParams;
use app_server_protocol::ConnectDeepLinkResolveResponse;
use app_server_protocol::ConnectOpenDeepLinkResolveParams;
use app_server_protocol::ConnectOpenDeepLinkResolveResponse;
use app_server_protocol::ConnectPayload;
use app_server_protocol::ConnectRelayApiKeySaveParams;
use app_server_protocol::ConnectRelayApiKeySaveResponse;
use app_server_protocol::OpenDeepLinkPayload;
use lime_core::app_paths;
use lime_core::connect as connect_core;
use lime_core::database::dao::api_key_provider::ApiProviderType;
use lime_core::database::DbConnection;
use lime_services::api_key_provider_service::ApiKeyProviderService;
use std::path::PathBuf;

pub(crate) async fn resolve_deep_link(
    params: ConnectDeepLinkResolveParams,
) -> Result<ConnectDeepLinkResolveResponse, RuntimeCoreError> {
    let payload = connect_core::parse_deep_link(&params.url).map_err(connect_deep_link_error)?;
    let relay_info = match load_connect_registry_best_effort().await {
        Some(registry) => registry.get(&payload.relay),
        None => None,
    };
    let is_verified = relay_info.is_some();
    Ok(ConnectDeepLinkResolveResponse {
        payload: connect_payload_to_protocol(payload),
        relay_info: relay_info
            .map(serde_json::to_value)
            .transpose()
            .map_err(data_error)?,
        is_verified,
    })
}

pub(crate) fn resolve_open_deep_link(
    params: ConnectOpenDeepLinkResolveParams,
) -> Result<ConnectOpenDeepLinkResolveResponse, RuntimeCoreError> {
    let payload =
        connect_core::parse_open_deep_link(&params.url).map_err(connect_deep_link_error)?;
    Ok(ConnectOpenDeepLinkResolveResponse {
        payload: open_deep_link_payload_to_protocol(payload),
    })
}

pub(crate) async fn save_relay_api_key(
    db: &DbConnection,
    api_key_provider_service: &ApiKeyProviderService,
    params: ConnectRelayApiKeySaveParams,
) -> Result<ConnectRelayApiKeySaveResponse, RuntimeCoreError> {
    let relay_id = params.relay_id.trim();
    if relay_id.is_empty() {
        return Err(RuntimeCoreError::Backend(
            "relayId is required for connectRelayApiKey/save".to_string(),
        ));
    }
    if params.api_key.trim().is_empty() {
        return Err(RuntimeCoreError::Backend(
            "apiKey is required for connectRelayApiKey/save".to_string(),
        ));
    }

    let registry = load_connect_registry_required().await?;
    let relay_info = registry
        .get(relay_id)
        .ok_or_else(|| RuntimeCoreError::Backend(format!("中转商 {relay_id} 不在注册表中")))?;
    let provider_type = connect_protocol_to_provider_type(&relay_info.api.protocol);
    let provider_id = format!("connect-{relay_id}");
    let existing_provider = api_key_provider_service
        .get_provider(db, &provider_id)
        .map_err(data_error)?;

    let (final_provider_id, is_new_provider) = if existing_provider.is_some() {
        (provider_id, false)
    } else {
        let provider_name = params
            .name
            .clone()
            .unwrap_or_else(|| format!("[Connect] {}", relay_info.name));
        let provider = api_key_provider_service
            .add_custom_provider(
                db,
                provider_name,
                provider_type,
                relay_info.api.base_url.clone(),
                None,
                None,
                None,
                None,
                None,
            )
            .map_err(data_error)?;
        (provider.id, true)
    };

    let key_alias = params
        .name
        .clone()
        .or_else(|| Some(format!("[Connect] {}", relay_info.name)));
    let api_key_entry = api_key_provider_service
        .add_api_key(
            db,
            &final_provider_id,
            &params.api_key,
            key_alias.clone(),
            false,
        )
        .map_err(data_error)?;

    Ok(ConnectRelayApiKeySaveResponse {
        provider_id: final_provider_id,
        key_id: api_key_entry.id,
        provider_name: key_alias.unwrap_or_else(|| relay_info.name.clone()),
        is_new_provider,
    })
}

pub(crate) async fn deliver_callback(
    params: ConnectCallbackSendParams,
) -> Result<ConnectCallbackSendResponse, RuntimeCoreError> {
    let relay_id = params.relay_id.trim();
    if relay_id.is_empty() || params.api_key.trim().is_empty() {
        return Ok(ConnectCallbackSendResponse { delivered: false });
    }

    let Some(registry) = load_connect_registry_best_effort().await else {
        return Ok(ConnectCallbackSendResponse { delivered: false });
    };
    let Some(relay_info) = registry.get(relay_id) else {
        return Ok(ConnectCallbackSendResponse { delivered: false });
    };
    let Some(webhook) = relay_info.webhook else {
        return Ok(ConnectCallbackSendResponse { delivered: false });
    };
    let Some(callback_url) = webhook.callback_url else {
        return Ok(ConnectCallbackSendResponse { delivered: false });
    };

    match params.status {
        ConnectCallbackStatus::Success => connect_core::send_success_callback(
            &callback_url,
            relay_id,
            &params.api_key,
            params.ref_code,
        ),
        ConnectCallbackStatus::Cancelled => connect_core::send_cancelled_callback(
            &callback_url,
            relay_id,
            &params.api_key,
            params.ref_code,
        ),
        ConnectCallbackStatus::Error => connect_core::send_error_callback(
            &callback_url,
            relay_id,
            &params.api_key,
            params.ref_code,
            params.error_code.as_deref().unwrap_or("UNKNOWN"),
            params.error_message.as_deref().unwrap_or("未知错误"),
        ),
    }

    Ok(ConnectCallbackSendResponse { delivered: true })
}

async fn load_connect_registry_best_effort() -> Option<connect_core::RelayRegistry> {
    let registry = connect_core::RelayRegistry::new(connect_registry_cache_path());
    if registry.load_from_cache().is_ok() {
        return Some(registry);
    }
    if registry.load_from_remote().await.is_ok() {
        return Some(registry);
    }
    None
}

async fn load_connect_registry_required() -> Result<connect_core::RelayRegistry, RuntimeCoreError> {
    load_connect_registry_best_effort()
        .await
        .ok_or_else(|| RuntimeCoreError::Backend("无法加载中转商注册表".to_string()))
}

fn connect_registry_cache_path() -> PathBuf {
    app_paths::best_effort_data_dir()
        .join("connect")
        .join("registry.json")
}

fn connect_payload_to_protocol(payload: connect_core::ConnectPayload) -> ConnectPayload {
    ConnectPayload {
        relay: payload.relay,
        key: payload.key,
        name: payload.name,
        ref_code: payload.ref_code,
    }
}

fn open_deep_link_payload_to_protocol(
    payload: connect_core::OpenDeepLinkPayload,
) -> OpenDeepLinkPayload {
    let kind = match payload.kind {
        connect_core::OpenDeepLinkKind::Skill => "skill",
        connect_core::OpenDeepLinkKind::Prompt => "prompt",
    };
    OpenDeepLinkPayload {
        kind: kind.to_string(),
        slug: payload.slug,
        source: payload.source,
        version: payload.version,
        action: payload.action,
    }
}

fn connect_protocol_to_provider_type(protocol: &str) -> ApiProviderType {
    match protocol.trim().to_ascii_lowercase().as_str() {
        "anthropic" | "claude" => ApiProviderType::Anthropic,
        _ => ApiProviderType::Openai,
    }
}

fn connect_deep_link_error(error: connect_core::DeepLinkError) -> RuntimeCoreError {
    RuntimeCoreError::Backend(error.to_string())
}

fn data_error(error: impl std::fmt::Display) -> RuntimeCoreError {
    RuntimeCoreError::Backend(error.to_string())
}
