use anyhow::{anyhow, Context, Result};
use aster::conversation::message::Message;
use lime_agent::{create_aster_provider, AsterProviderConfig, CredentialBridge};
use lime_core::database::dao::api_key_provider::{ApiProviderType, ProviderWithKeys};
use lime_core::database::{self, DbConnection};
use lime_core::models::provider_type::is_custom_provider_id;
use lime_core::models::RuntimeProviderType;
use lime_services::api_key_provider_service::ApiKeyProviderService;
use lime_services::model_registry_service::ModelRegistryService;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::{self, Read, Write};
use std::str::FromStr;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExternalBackendEnvelope {
    kind: String,
    request: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TurnStartRequest {
    input: AgentInput,
    #[serde(default)]
    runtime_options: Option<RuntimeOptions>,
    #[serde(default)]
    provider_preference: Option<String>,
    #[serde(default)]
    model_preference: Option<String>,
    #[serde(default)]
    metadata: Option<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentInput {
    text: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeOptions {
    #[serde(default)]
    provider_preference: Option<String>,
    #[serde(default)]
    model_preference: Option<String>,
    #[serde(default)]
    metadata: Option<Value>,
    #[serde(default)]
    host_options: Option<Value>,
}

#[derive(Debug, Deserialize)]
struct AsterChatRequestHostOptions {
    #[serde(default, alias = "turnConfig")]
    turn_config: Option<AgentTurnConfigSnapshot>,
}

#[derive(Debug, Deserialize)]
struct AgentTurnConfigSnapshot {
    #[serde(default, alias = "providerConfig")]
    provider_config: Option<ConfigureProviderRequest>,
    #[serde(default, alias = "providerPreference")]
    provider_preference: Option<String>,
    #[serde(default, alias = "modelPreference")]
    model_preference: Option<String>,
    #[serde(default, alias = "reasoningEffort")]
    reasoning_effort: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ConfigureProviderRequest {
    #[serde(default, alias = "providerId")]
    provider_id: Option<String>,
    #[serde(alias = "providerName")]
    provider_name: String,
    #[serde(alias = "modelName")]
    model_name: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct RuntimeModelSelection {
    provider: String,
    model: String,
    source: &'static str,
    reasoning_effort: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeEventLine<'a> {
    #[serde(rename = "type")]
    event_type: &'a str,
    payload: Value,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            std::env::var("RUST_LOG")
                .unwrap_or_else(|_| "app_server_agent_backend=info,lime_agent=info".to_string()),
        )
        .with_writer(io::stderr)
        .init();

    let mut input = String::new();
    io::stdin()
        .read_to_string(&mut input)
        .context("failed to read external backend request from stdin")?;
    let envelope: ExternalBackendEnvelope =
        serde_json::from_str(&input).context("failed to decode external backend request")?;

    match envelope.kind.as_str() {
        "turnStart" => handle_turn_start(envelope.request).await,
        "turnCancel" => {
            emit_event("turn.canceled", json!({ "backend": "external" }))?;
            Ok(())
        }
        "actionRespond" => {
            emit_event("action.resolved", json!({ "backend": "external" }))?;
            Ok(())
        }
        other => Err(anyhow!(
            "unsupported external backend request kind: {other}"
        )),
    }
}

async fn handle_turn_start(request: Value) -> Result<()> {
    let request: TurnStartRequest =
        serde_json::from_value(request).context("failed to decode turnStart request")?;
    let db = database::init_database().map_err(|error| anyhow!(error))?;
    let api_key_provider_service = ApiKeyProviderService::new();
    let selection = resolve_runtime_model_selection(&db, &api_key_provider_service, &request)
        .await
        .context("failed to resolve runtime provider/model selection")?;
    ensure_selection_provider_is_configured(&db, &api_key_provider_service, &selection)
        .context("failed to validate runtime provider/model selection")?;

    emit_event(
        "routing.decision.made",
        json!({
            "backend": "external",
            "provider": selection.provider,
            "model": selection.model,
            "source": selection.source,
        }),
    )?;

    let credential_bridge = CredentialBridge::new();
    let mut provider_config = credential_bridge
        .select_and_configure(&db, &selection.provider, &selection.model)
        .await
        .map_err(|error| anyhow!(error.to_string()))?;
    apply_turn_selection(&mut provider_config, &selection);

    let provider = create_aster_provider(&provider_config)
        .await
        .map_err(|error| anyhow!(error.to_string()))?;
    let system = request_system_prompt(&request);
    let messages = vec![Message::user().with_text(request.input.text)];
    let (message, usage) = provider
        .complete(&system, &messages, &[])
        .await
        .map_err(|error| anyhow!(error.to_string()))?;
    let text = message.as_concat_text();

    if !text.trim().is_empty() {
        emit_event(
            "message.delta",
            json!({
                "text": text,
                "backend": "external",
                "provider": provider_config.provider_selector.as_deref().unwrap_or(&selection.provider),
                "model": usage.model,
            }),
        )?;
    }

    let _ = credential_bridge.record_usage(&db, &provider_config.credential_uuid);
    let _ =
        credential_bridge.mark_healthy(&db, &provider_config.credential_uuid, Some(&usage.model));

    emit_event(
        "turn.final_done",
        json!({
            "backend": "external",
            "usage": usage.usage,
            "model": usage.model,
            "provider": provider_config.provider_selector.as_deref().unwrap_or(&selection.provider),
        }),
    )?;

    Ok(())
}

async fn resolve_runtime_model_selection(
    db: &DbConnection,
    api_key_provider_service: &ApiKeyProviderService,
    request: &TurnStartRequest,
) -> Result<RuntimeModelSelection> {
    if let Some(selection) = selection_from_explicit_preferences(request) {
        return Ok(selection);
    }
    if let Some(selection) = selection_from_host_provider_config(request) {
        return Ok(selection);
    }
    if let Some(selection) = selection_from_enabled_provider_catalog(api_key_provider_service, db) {
        return Ok(selection);
    }
    if let Some(selection) =
        selection_from_cached_provider_models(api_key_provider_service, db).await
    {
        return Ok(selection);
    }

    Err(anyhow!(
        "App Server external backend requires provider/model selection. Configure an enabled API Key Provider with custom_models, fetch provider models once, or submit runtimeOptions.providerPreference and runtimeOptions.modelPreference."
    ))
}

fn ensure_selection_provider_is_configured(
    db: &DbConnection,
    api_key_provider_service: &ApiKeyProviderService,
    selection: &RuntimeModelSelection,
) -> Result<()> {
    let providers = api_key_provider_service
        .get_all_providers(db)
        .map_err(|error| anyhow!(error))?;
    if providers.iter().any(|provider| {
        provider.provider.id == selection.provider && enabled_chat_provider_with_key(provider)
    }) {
        return Ok(());
    }

    if is_supported_builtin_runtime_provider(&selection.provider) {
        return Ok(());
    }

    Err(anyhow!(
        "App Server external backend provider '{}' is not configured as an enabled API Key Provider and is not a supported runtime provider type",
        selection.provider
    ))
}

fn is_supported_builtin_runtime_provider(provider: &str) -> bool {
    !is_custom_provider_id(provider) && RuntimeProviderType::from_str(provider).is_ok()
}

fn selection_from_explicit_preferences(
    request: &TurnStartRequest,
) -> Option<RuntimeModelSelection> {
    let provider = non_empty(request.provider_preference.as_deref().or_else(|| {
        request
            .runtime_options
            .as_ref()?
            .provider_preference
            .as_deref()
    }))?;
    let model = non_empty(request.model_preference.as_deref().or_else(|| {
        request
            .runtime_options
            .as_ref()?
            .model_preference
            .as_deref()
    }))?;
    Some(RuntimeModelSelection {
        provider,
        model,
        source: "runtime_options",
        reasoning_effort: reasoning_effort_from_request(request),
    })
}

fn selection_from_host_provider_config(
    request: &TurnStartRequest,
) -> Option<RuntimeModelSelection> {
    let host_request = request
        .runtime_options
        .as_ref()
        .and_then(|options| options.host_options.as_ref())
        .and_then(|host_options| host_options.get("asterChatRequest"))
        .and_then(|value| {
            serde_json::from_value::<AsterChatRequestHostOptions>(value.clone()).ok()
        })?;
    let turn_config = host_request.turn_config?;
    let provider_config = turn_config.provider_config.as_ref();
    let provider = non_empty(
        turn_config
            .provider_preference
            .as_deref()
            .or_else(|| provider_config.and_then(|config| config.provider_id.as_deref()))
            .or_else(|| provider_config.map(|config| config.provider_name.as_str())),
    )?;
    let model = non_empty(
        turn_config
            .model_preference
            .as_deref()
            .or_else(|| provider_config.map(|config| config.model_name.as_str())),
    )?;
    Some(RuntimeModelSelection {
        provider,
        model,
        source: "host_options_provider_config",
        reasoning_effort: non_empty(turn_config.reasoning_effort.as_deref())
            .or_else(|| reasoning_effort_from_request(request)),
    })
}

fn selection_from_enabled_provider_catalog(
    api_key_provider_service: &ApiKeyProviderService,
    db: &DbConnection,
) -> Option<RuntimeModelSelection> {
    let providers = api_key_provider_service.get_all_providers(db).ok()?;
    providers
        .into_iter()
        .filter(enabled_chat_provider_with_key)
        .find_map(|provider| {
            let model = provider
                .provider
                .custom_models
                .iter()
                .find_map(|model| non_empty(Some(model.as_str())))?;
            Some(RuntimeModelSelection {
                provider: provider.provider.id,
                model,
                source: "enabled_provider_custom_model",
                reasoning_effort: None,
            })
        })
}

async fn selection_from_cached_provider_models(
    api_key_provider_service: &ApiKeyProviderService,
    db: &DbConnection,
) -> Option<RuntimeModelSelection> {
    let providers = api_key_provider_service.get_all_providers(db).ok()?;
    let model_registry = ModelRegistryService::new(db.clone());
    for provider in providers.into_iter().filter(enabled_chat_provider_with_key) {
        let provider_type = provider.provider.provider_type;
        let api_host = provider.provider.api_host.clone();
        let Ok(Some(cached)) = model_registry.get_cached_provider_models(
            &provider.provider.id,
            &api_host,
            Some(provider_type),
        ) else {
            continue;
        };
        if let Some(model) = cached.models.iter().find_map(|model| {
            non_empty(
                model
                    .provider_model_id
                    .as_deref()
                    .or(model.canonical_model_id.as_deref())
                    .or(Some(model.id.as_str())),
            )
        }) {
            return Some(RuntimeModelSelection {
                provider: provider.provider.id,
                model,
                source: "cached_provider_models",
                reasoning_effort: None,
            });
        }
    }
    None
}

fn enabled_chat_provider_with_key(provider: &ProviderWithKeys) -> bool {
    provider.provider.enabled
        && !provider.api_keys.iter().all(|key| !key.enabled)
        && !provider_looks_non_chat_candidate(provider)
}

fn provider_looks_non_chat_candidate(provider: &ProviderWithKeys) -> bool {
    matches!(provider.provider.provider_type, ApiProviderType::Fal)
}

fn reasoning_effort_from_request(request: &TurnStartRequest) -> Option<String> {
    request
        .runtime_options
        .as_ref()
        .and_then(|options| options.metadata.as_ref())
        .or(request.metadata.as_ref())
        .and_then(|metadata| {
            json_pointer_string(
                metadata,
                &[
                    "/turn_config/reasoning_effort",
                    "/turnConfig/reasoningEffort",
                    "/harness/reasoning_effort",
                    "/harness/reasoningEffort",
                ],
            )
        })
}

fn request_system_prompt(request: &TurnStartRequest) -> String {
    request
        .runtime_options
        .as_ref()
        .and_then(|options| options.host_options.as_ref())
        .and_then(|host_options| host_options.get("asterChatRequest"))
        .and_then(|value| value.get("turn_config").or_else(|| value.get("turnConfig")))
        .and_then(|turn_config| {
            turn_config
                .get("system_prompt")
                .or_else(|| turn_config.get("systemPrompt"))
        })
        .and_then(Value::as_str)
        .and_then(|value| non_empty(Some(value)))
        .unwrap_or_else(|| {
            "你是 Lime 桌面端里的 AI 助手。请直接完成用户请求，保持回答清晰、准确、可执行。"
                .to_string()
        })
}

fn apply_turn_selection(config: &mut AsterProviderConfig, selection: &RuntimeModelSelection) {
    config.provider_selector = Some(selection.provider.clone());
    config.model_name = selection.model.clone();
    config.reasoning_effort = selection.reasoning_effort.clone();
}

fn json_pointer_string(value: &Value, pointers: &[&str]) -> Option<String> {
    pointers.iter().find_map(|pointer| {
        value
            .pointer(pointer)
            .and_then(Value::as_str)
            .and_then(|value| non_empty(Some(value)))
    })
}

fn non_empty(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn emit_event(event_type: &'static str, payload: Value) -> Result<()> {
    let mut stdout = io::stdout().lock();
    writeln!(
        stdout,
        "{}",
        serde_json::to_string(&RuntimeEventLine {
            event_type,
            payload,
        })?
    )?;
    stdout.flush()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn explicit_runtime_preferences_win() {
        let request = TurnStartRequest {
            input: AgentInput {
                text: "hello".to_string(),
            },
            runtime_options: Some(RuntimeOptions {
                provider_preference: Some("deepseek".to_string()),
                model_preference: Some("deepseek-chat".to_string()),
                metadata: None,
                host_options: None,
            }),
            provider_preference: None,
            model_preference: None,
            metadata: None,
        };

        let selection = selection_from_explicit_preferences(&request).expect("selection");
        assert_eq!(
            selection,
            RuntimeModelSelection {
                provider: "deepseek".to_string(),
                model: "deepseek-chat".to_string(),
                source: "runtime_options",
                reasoning_effort: None,
            }
        );
    }

    #[test]
    fn host_provider_config_is_used_when_preferences_are_omitted() {
        let request = TurnStartRequest {
            input: AgentInput {
                text: "hello".to_string(),
            },
            runtime_options: Some(RuntimeOptions {
                provider_preference: None,
                model_preference: None,
                metadata: None,
                host_options: Some(json!({
                    "asterChatRequest": {
                        "turn_config": {
                            "provider_config": {
                                "provider_id": "custom-provider",
                                "provider_name": "Custom Provider",
                                "model_name": "custom-model"
                            },
                            "reasoning_effort": "high"
                        }
                    }
                })),
            }),
            provider_preference: None,
            model_preference: None,
            metadata: None,
        };

        let selection = selection_from_host_provider_config(&request).expect("selection");
        assert_eq!(selection.provider, "custom-provider");
        assert_eq!(selection.model, "custom-model");
        assert_eq!(selection.source, "host_options_provider_config");
        assert_eq!(selection.reasoning_effort.as_deref(), Some("high"));
    }

    #[test]
    fn request_system_prompt_reads_host_turn_config() {
        let request = TurnStartRequest {
            input: AgentInput {
                text: "hello".to_string(),
            },
            runtime_options: Some(RuntimeOptions {
                provider_preference: None,
                model_preference: None,
                metadata: None,
                host_options: Some(json!({
                    "asterChatRequest": {
                        "turn_config": {
                            "system_prompt": "只输出 JSON"
                        }
                    }
                })),
            }),
            provider_preference: None,
            model_preference: None,
            metadata: None,
        };

        assert_eq!(request_system_prompt(&request), "只输出 JSON");
    }

    #[test]
    fn runtime_provider_type_validation_rejects_unknown_provider() {
        assert!(!is_supported_builtin_runtime_provider(
            "invalid-provider-for-probe"
        ));
    }

    #[test]
    fn custom_provider_ids_must_be_configured_provider_ids() {
        assert!(!is_supported_builtin_runtime_provider(
            "custom-ba4e7574-dd00-4784-945a-0f383dfa1272"
        ));
    }

    #[test]
    fn current_builtin_provider_aliases_remain_supported() {
        assert!(is_supported_builtin_runtime_provider("deepseek"));
        assert!(is_supported_builtin_runtime_provider("openai"));
    }
}
