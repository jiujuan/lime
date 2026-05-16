use super::types::AgentAppRuntimeStartTaskRequest;
use super::{non_empty, AGENT_APP_RUNTIME_METADATA_KEY};
use crate::agent::AsterAgentState;
use crate::commands::api_key_provider_cmd::ApiKeyProviderServiceState;
use crate::database::DbConnection;
use lime_core::database::dao::agent_run::{AgentRun, AgentRunDao, AgentRunStatus};
use lime_core::database::dao::api_key_provider::ProviderWithKeys;
use serde_json::{json, Value};

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct AgentAppRuntimeModelPreference {
    pub(super) provider_preference: String,
    pub(super) model_preference: String,
    pub(super) source: &'static str,
}

fn is_unconfigured_model_preference(value: &str) -> bool {
    matches!(
        value.trim().to_ascii_lowercase().as_str(),
        "" | "unconfigured" | "unknown" | "none" | "null"
    )
}

fn model_preference_from_values(
    provider_preference: Option<String>,
    model_preference: Option<String>,
    source: &'static str,
) -> Option<AgentAppRuntimeModelPreference> {
    let provider_preference = provider_preference
        .and_then(|value| non_empty(Some(value.as_str())))
        .filter(|value| !is_unconfigured_model_preference(value))?;
    let model_preference = model_preference
        .and_then(|value| non_empty(Some(value.as_str())))
        .filter(|value| !is_unconfigured_model_preference(value))?;

    Some(AgentAppRuntimeModelPreference {
        provider_preference,
        model_preference,
        source,
    })
}

fn json_pointer_string(value: &Value, pointers: &[&str]) -> Option<String> {
    pointers.iter().find_map(|pointer| {
        value
            .pointer(pointer)
            .and_then(Value::as_str)
            .and_then(|value| non_empty(Some(value)))
    })
}

pub(super) fn model_preference_from_run_metadata(
    metadata: &Value,
) -> Option<AgentAppRuntimeModelPreference> {
    let provider_preference = json_pointer_string(
        metadata,
        &[
            "/turn_input/provider_routing/provider_selector",
            "/turnInput/providerRouting/providerSelector",
            "/request_metadata/lime_runtime/routing_decision/selected_provider",
            "/request_metadata/lime_runtime/routing_decision/selectedProvider",
            "/requestMetadata/limeRuntime/routingDecision/selectedProvider",
        ],
    );
    let model_preference = json_pointer_string(
        metadata,
        &[
            "/turn_input/provider_routing/model_name",
            "/turnInput/providerRouting/modelName",
            "/request_metadata/lime_runtime/routing_decision/selected_model",
            "/request_metadata/lime_runtime/routing_decision/selectedModel",
            "/requestMetadata/limeRuntime/routingDecision/selectedModel",
        ],
    );

    model_preference_from_values(
        provider_preference,
        model_preference,
        "recent_successful_agent_run",
    )
}

fn model_preference_from_recent_successful_runs(
    db: &DbConnection,
) -> Option<AgentAppRuntimeModelPreference> {
    let runs = {
        let conn = match db.lock() {
            Ok(conn) => conn,
            Err(error) => {
                tracing::warn!(
                    "[AgentAppRuntime] 读取最近模型偏好时数据库锁定失败: {}",
                    error
                );
                return None;
            }
        };
        match AgentRunDao::list_runs(&conn, 50, 0) {
            Ok(runs) => runs,
            Err(error) => {
                tracing::warn!(
                    "[AgentAppRuntime] 读取最近 agent_runs 失败，跳过模型偏好回填: {}",
                    error
                );
                return None;
            }
        }
    };

    runs.iter()
        .filter(|run| matches!(run.status, AgentRunStatus::Success))
        .find_map(model_preference_from_agent_run)
}

fn model_preference_from_agent_run(run: &AgentRun) -> Option<AgentAppRuntimeModelPreference> {
    let metadata = run.metadata.as_deref()?;
    let metadata: Value = serde_json::from_str(metadata).ok()?;
    model_preference_from_run_metadata(&metadata)
}

fn provider_looks_non_chat_agent_runtime_candidate(provider: &ProviderWithKeys) -> bool {
    let text = [
        provider.provider.id.as_str(),
        provider.provider.name.as_str(),
        provider.provider.api_host.as_str(),
    ]
    .join(" ")
    .to_ascii_lowercase();

    text.contains("fal")
        || text.contains("codex")
        || text.contains("coding")
        || text.contains("gpt-image")
        || text.contains("gpt_images")
}

fn model_preference_from_enabled_provider_catalog(
    db: &DbConnection,
    api_key_provider_service: &ApiKeyProviderServiceState,
) -> Option<AgentAppRuntimeModelPreference> {
    let providers = match api_key_provider_service.0.get_all_providers(db) {
        Ok(providers) => providers,
        Err(error) => {
            tracing::warn!(
                "[AgentAppRuntime] 读取 API Key Providers 失败，跳过模型偏好回填: {}",
                error
            );
            return None;
        }
    };

    providers.into_iter().find_map(|provider| {
        if !provider.provider.enabled {
            return None;
        }
        if provider_looks_non_chat_agent_runtime_candidate(&provider) {
            return None;
        }
        if !provider.api_keys.iter().any(|key| key.enabled) {
            return None;
        }
        let model = provider
            .provider
            .custom_models
            .iter()
            .find_map(|model| non_empty(Some(model.as_str())))?;
        model_preference_from_values(
            Some(provider.provider.id),
            Some(model),
            "enabled_provider_custom_model",
        )
    })
}

pub(super) async fn resolve_agent_app_runtime_model_preference(
    state: &AsterAgentState,
    db: &DbConnection,
    api_key_provider_service: &ApiKeyProviderServiceState,
    request: &AgentAppRuntimeStartTaskRequest,
) -> Option<AgentAppRuntimeModelPreference> {
    if let Some(preference) = model_preference_from_values(
        request.provider_preference.clone(),
        request.model_preference.clone(),
        "request",
    ) {
        return Some(preference);
    }

    if let Some(preference) = model_preference_from_recent_successful_runs(db) {
        return Some(preference);
    }

    if let Some(preference) =
        model_preference_from_enabled_provider_catalog(db, api_key_provider_service)
    {
        return Some(preference);
    }

    if let Some(config) = state.get_provider_config().await {
        if let Some(preference) = model_preference_from_values(
            config
                .provider_selector
                .clone()
                .or_else(|| Some(config.provider_name.clone())),
            Some(config.model_name.clone()),
            "current_agent_state",
        ) {
            return Some(preference);
        }
    }

    None
}

pub(super) fn insert_agent_app_runtime_model_preference_metadata(
    metadata: &mut Value,
    preference: &AgentAppRuntimeModelPreference,
) {
    let Some(root) = metadata.as_object_mut() else {
        return;
    };
    let preference_value = json!({
        "provider_preference": preference.provider_preference.clone(),
        "model_preference": preference.model_preference.clone(),
        "source": preference.source,
    });

    let harness = root
        .entry("harness".to_string())
        .or_insert_with(|| json!({}));
    if let Some(harness) = harness.as_object_mut() {
        harness.insert(
            "agent_app_runtime_model_preference".to_string(),
            preference_value.clone(),
        );
        if let Some(app_runtime) = harness
            .get_mut(AGENT_APP_RUNTIME_METADATA_KEY)
            .and_then(Value::as_object_mut)
        {
            app_runtime.insert("model_preference".to_string(), preference_value.clone());
        }
    }

    if let Some(app_runtime) = root
        .get_mut(AGENT_APP_RUNTIME_METADATA_KEY)
        .and_then(Value::as_object_mut)
    {
        app_runtime.insert("model_preference".to_string(), preference_value);
    }
}
