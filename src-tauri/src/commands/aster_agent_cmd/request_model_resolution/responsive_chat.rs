use super::{
    build_provider_resolution_context, compare_release_date_desc, estimate_cost_class,
    estimated_cost_rank, is_runtime_candidate_model, load_model_registry_catalog,
    model_has_reasoning_capability, normalize_identifier, normalize_optional_text,
    resolve_request_thinking_enabled, routing_slot_model_capability_requirements,
    text_contains_any, RuntimeModelCapabilityRequirement,
};
use crate::commands::api_key_provider_cmd::ApiKeyProviderServiceState;
use crate::commands::aster_agent_cmd::AsterChatRequest;
use lime_core::database::dao::api_key_provider::{
    ApiProviderType, ProviderGroup, ProviderWithKeys,
};
use lime_core::database::DbConnection;
use lime_core::models::model_registry::EnhancedModelMetadata;
use std::collections::HashMap;
use tauri::AppHandle;

pub(super) const RESPONSIVE_CHAT_SERVICE_MODEL_SLOT: &str = "responsive_chat";
pub(super) const RESPONSIVE_CHAT_ROUTING_SLOT: &str = "responsive_chat_model";
const RESPONSIVE_CHAT_TARGET_FIRST_TEXT_MS: u64 = 1_500;
const RESPONSIVE_CHAT_SLOW_FIRST_TEXT_MS: u64 = 3_000;
const RESPONSIVE_CHAT_STALE_FIRST_TEXT_MS: u64 = 6_000;

#[derive(Debug, Clone)]
pub(super) struct ResponsiveChatAutoPreferenceContext {
    pub(super) provider_selector: String,
    pub(super) model_name: String,
    pub(super) compatible_candidate_count: u32,
}

#[derive(Debug, Clone)]
pub(super) struct ResponsiveChatAutoCandidate {
    pub(super) provider_selector: String,
    pub(super) model_name: String,
    pub(super) model: EnhancedModelMetadata,
    pub(super) compatible_candidate_count: u32,
    pub(super) provider_order: usize,
    pub(super) provider_group: Option<ProviderGroup>,
    pub(super) latency_hint: ResponsiveChatAutoLatencyHint,
}

pub(super) struct ResponsiveChatAutoRunMetadata {
    pub(super) provider_selector: String,
    pub(super) model_name: String,
    pub(super) turn_id: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub(super) struct ResponsiveChatAutoLatencyHint {
    pub(super) durations_ms: Vec<u64>,
    pub(super) first_text_durations_ms: Vec<u64>,
    pub(super) reasoning_sample_count: u32,
    pub(super) error_sample_count: u32,
    pub(super) unsupported_model_sample_count: u32,
}

impl ResponsiveChatAutoLatencyHint {
    fn p50_duration_ms(&self) -> Option<u64> {
        let samples = if self.first_text_durations_ms.is_empty() {
            &self.durations_ms
        } else {
            &self.first_text_durations_ms
        };
        if samples.is_empty() {
            return None;
        }

        let mut durations = samples.clone();
        durations.sort_unstable();
        durations.get(durations.len() / 2).copied()
    }
}

fn responsive_chat_speed_hint_rank(model: &EnhancedModelMetadata) -> u8 {
    let text = [
        normalize_identifier(&model.id),
        normalize_identifier(&model.display_name),
        model
            .family
            .as_deref()
            .map(normalize_identifier)
            .unwrap_or_default(),
        model
            .description
            .as_deref()
            .map(normalize_identifier)
            .unwrap_or_default(),
    ]
    .into_iter()
    .filter(|part| !part.is_empty())
    .collect::<Vec<_>>()
    .join(" ");

    if text_contains_any(&text, &["highspeed", "high-speed", "high speed"]) {
        return 6;
    }
    if text_contains_any(&text, &["flash", "instant"]) {
        return 5;
    }
    if text_contains_any(&text, &["turbo", "fast"]) {
        return 4;
    }
    if text_contains_any(&text, &["mini", "nano", "small", "lite", "haiku"]) {
        return 3;
    }
    if text_contains_any(&text, &["pro", "max", "opus", "ultra"]) {
        return 1;
    }

    2
}

pub(super) fn targets_responsive_chat(requirements: &[RuntimeModelCapabilityRequirement]) -> bool {
    requirements.iter().any(|requirement| {
        matches!(
            requirement,
            RuntimeModelCapabilityRequirement::ResponsiveChat
        )
    })
}

pub(super) fn responsive_chat_model_sort(
    left: &EnhancedModelMetadata,
    right: &EnhancedModelMetadata,
) -> std::cmp::Ordering {
    responsive_chat_model_quality_sort(left, right).then(left.id.cmp(&right.id))
}

#[cfg(test)]
pub(super) fn choose_responsive_chat_model_from_catalog(
    catalog: &[EnhancedModelMetadata],
    thinking_enabled: bool,
    has_images: bool,
    runtime_requirements: &[RuntimeModelCapabilityRequirement],
) -> Option<(String, EnhancedModelMetadata, u32)> {
    collect_responsive_chat_models_from_catalog(
        catalog,
        thinking_enabled,
        has_images,
        runtime_requirements,
    )
    .into_iter()
    .next()
}

pub(super) fn collect_responsive_chat_models_from_catalog(
    catalog: &[EnhancedModelMetadata],
    thinking_enabled: bool,
    has_images: bool,
    runtime_requirements: &[RuntimeModelCapabilityRequirement],
) -> Vec<(String, EnhancedModelMetadata, u32)> {
    let mut candidates = catalog
        .iter()
        .filter(|candidate| {
            is_runtime_candidate_model(
                candidate,
                thinking_enabled,
                has_images,
                runtime_requirements,
            ) && !responsive_chat_model_looks_specialized_for_code_agent(candidate)
        })
        .collect::<Vec<_>>();

    if candidates.is_empty() {
        return Vec::new();
    }

    candidates.sort_by(|left, right| responsive_chat_model_sort(left, right));
    let compatible_candidate_count = candidates.len() as u32;
    candidates
        .into_iter()
        .map(|candidate| {
            (
                candidate.id.clone(),
                (*candidate).clone(),
                compatible_candidate_count,
            )
        })
        .collect()
}

fn responsive_chat_model_quality_sort(
    left: &EnhancedModelMetadata,
    right: &EnhancedModelMetadata,
) -> std::cmp::Ordering {
    let left_reasoning = model_has_reasoning_capability(Some(left), &left.id);
    let right_reasoning = model_has_reasoning_capability(Some(right), &right.id);
    let left_speed = responsive_chat_speed_hint_rank(left);
    let right_speed = responsive_chat_speed_hint_rank(right);
    let left_cost = estimated_cost_rank(estimate_cost_class(&left.id, Some(left)).as_deref());
    let right_cost = estimated_cost_rank(estimate_cost_class(&right.id, Some(right)).as_deref());

    (!left_reasoning)
        .cmp(&(!right_reasoning))
        .reverse()
        .then(left_speed.cmp(&right_speed).reverse())
        .then(left_cost.cmp(&right_cost).reverse())
        .then(
            left.capabilities
                .streaming
                .cmp(&right.capabilities.streaming)
                .reverse(),
        )
        .then(left.is_latest.cmp(&right.is_latest).reverse())
        .then(compare_release_date_desc(left, right).cmp(&0))
}

fn responsive_chat_model_looks_specialized_for_code_agent(model: &EnhancedModelMetadata) -> bool {
    let text = [
        normalize_identifier(&model.id),
        normalize_identifier(&model.display_name),
        model
            .family
            .as_deref()
            .map(normalize_identifier)
            .unwrap_or_default(),
        model
            .description
            .as_deref()
            .map(normalize_identifier)
            .unwrap_or_default(),
    ]
    .into_iter()
    .filter(|part| !part.is_empty())
    .collect::<Vec<_>>()
    .join(" ");

    text_contains_any(
        &text,
        &[
            "code",
            "coding",
            "coder",
            "codex",
            "cli agent",
            "cli-agent",
            "agentic coding",
        ],
    )
}

fn responsive_chat_latency_rank(candidate: &ResponsiveChatAutoCandidate) -> (u8, u64) {
    let hint = &candidate.latency_hint;
    let provider_trust = responsive_chat_provider_trust_rank(candidate);
    let Some(p50_duration_ms) = hint.p50_duration_ms() else {
        if hint.unsupported_model_sample_count > 0 {
            return (7, u64::MAX);
        }
        if hint.error_sample_count > 0 {
            return (6, u64::MAX);
        }
        if provider_trust == 0 {
            return (1, u64::MAX);
        }
        if provider_trust == 1 {
            return (2, u64::MAX);
        }
        return (4, u64::MAX);
    };

    if hint.unsupported_model_sample_count > 0 {
        return (7, p50_duration_ms);
    }
    if hint.reasoning_sample_count > 0 {
        return (5, p50_duration_ms);
    }
    if p50_duration_ms > RESPONSIVE_CHAT_STALE_FIRST_TEXT_MS {
        return (5, p50_duration_ms);
    }
    if p50_duration_ms > RESPONSIVE_CHAT_SLOW_FIRST_TEXT_MS {
        return (3, p50_duration_ms);
    }
    if p50_duration_ms > RESPONSIVE_CHAT_TARGET_FIRST_TEXT_MS {
        return (2, p50_duration_ms);
    }
    if p50_duration_ms <= RESPONSIVE_CHAT_TARGET_FIRST_TEXT_MS {
        return (0, p50_duration_ms);
    }

    (2, p50_duration_ms)
}

fn responsive_chat_provider_trust_rank(candidate: &ResponsiveChatAutoCandidate) -> u8 {
    match candidate.provider_group {
        Some(ProviderGroup::Mainstream | ProviderGroup::Cloud) => 0,
        Some(ProviderGroup::Chinese | ProviderGroup::Aggregator) => 1,
        Some(ProviderGroup::Local) => 2,
        Some(ProviderGroup::Specialized) => 3,
        Some(ProviderGroup::Custom) => 4,
        None if lime_core::models::provider_type::is_custom_provider_id(
            &candidate.provider_selector,
        ) =>
        {
            4
        }
        None => 2,
    }
}

pub(super) fn responsive_chat_auto_candidate_sort(
    left: &ResponsiveChatAutoCandidate,
    right: &ResponsiveChatAutoCandidate,
) -> std::cmp::Ordering {
    responsive_chat_latency_rank(left)
        .cmp(&responsive_chat_latency_rank(right))
        .then(
            responsive_chat_provider_trust_rank(left)
                .cmp(&responsive_chat_provider_trust_rank(right)),
        )
        .then(responsive_chat_model_quality_sort(
            &left.model,
            &right.model,
        ))
        .then(left.provider_order.cmp(&right.provider_order))
        .then(left.provider_selector.cmp(&right.provider_selector))
        .then(left.model_name.cmp(&right.model_name))
}

fn responsive_chat_latency_fallback_reason(hint: &ResponsiveChatAutoLatencyHint) -> Option<String> {
    if hint.unsupported_model_sample_count > 0 {
        return Some("unsupported_model".to_string());
    }
    if hint.reasoning_sample_count > 0 {
        return Some("reasoning_output_observed".to_string());
    }
    if let Some(p50_duration_ms) = hint.p50_duration_ms() {
        if p50_duration_ms > RESPONSIVE_CHAT_SLOW_FIRST_TEXT_MS {
            return Some(format!("slow_first_text_p50_{p50_duration_ms}ms"));
        }
    }
    if hint.error_sample_count > 0 && hint.p50_duration_ms().is_none() {
        return Some("recent_error_without_success".to_string());
    }

    None
}

pub(super) fn responsive_chat_setting_fallback_reason(
    db: &DbConnection,
    provider_selector: &str,
    model_name: &str,
) -> Option<String> {
    let hints = load_responsive_chat_auto_latency_hints(db);
    let exact_key = (provider_selector.to_string(), model_name.to_string());
    let hint = hints.get(&exact_key).or_else(|| {
        let provider_key = normalize_identifier(provider_selector);
        let model_key = normalize_identifier(model_name);
        hints.iter().find_map(|((provider, model), hint)| {
            if normalize_identifier(provider) == provider_key
                && normalize_identifier(model) == model_key
            {
                Some(hint)
            } else {
                None
            }
        })
    })?;

    responsive_chat_latency_fallback_reason(hint)
}

fn responsive_chat_provider_type_supports_text_chat(provider_type: ApiProviderType) -> bool {
    matches!(
        provider_type,
        ApiProviderType::Openai
            | ApiProviderType::OpenaiResponse
            | ApiProviderType::Anthropic
            | ApiProviderType::AnthropicCompatible
            | ApiProviderType::Gemini
            | ApiProviderType::AzureOpenai
            | ApiProviderType::Vertexai
            | ApiProviderType::AwsBedrock
            | ApiProviderType::Ollama
            | ApiProviderType::NewApi
            | ApiProviderType::Gateway
    )
}

fn responsive_chat_provider_looks_non_chat_runtime(provider: &ProviderWithKeys) -> bool {
    let id = normalize_identifier(&provider.provider.id);
    let name = normalize_identifier(&provider.provider.name);
    let api_host = normalize_identifier(&provider.provider.api_host);

    provider.provider.effective_provider_type() == ApiProviderType::Fal
        || id == "fal"
        || name == "fal"
        || api_host.contains("fal.run")
        || api_host.contains("/fal-ai")
        || id.contains("codex")
        || name.contains("codex")
        || api_host.contains("codex")
        || id.contains("coding")
        || name.contains("coding")
        || api_host.contains("/coding")
}

pub(super) fn can_use_responsive_chat_provider(provider: &ProviderWithKeys) -> bool {
    if !provider.provider.enabled {
        return false;
    }

    if !responsive_chat_provider_type_supports_text_chat(
        provider.provider.effective_provider_type(),
    ) {
        return false;
    }
    if responsive_chat_provider_looks_non_chat_runtime(provider) {
        return false;
    }

    let has_enabled_key = provider.api_keys.iter().any(|key| key.enabled);
    if has_enabled_key {
        return true;
    }

    let has_local_endpoint = matches!(provider.provider.group, ProviderGroup::Local)
        && !provider.provider.api_host.trim().is_empty();
    has_local_endpoint || provider.provider.provider_type == ApiProviderType::Ollama
}

pub(super) async fn resolve_responsive_chat_auto_preference(
    app: &AppHandle,
    db: &DbConnection,
    api_key_provider_service: &ApiKeyProviderServiceState,
    request: &AsterChatRequest,
    task_profile: &lime_agent::SessionExecutionRuntimeTaskProfile,
) -> Result<Option<ResponsiveChatAutoPreferenceContext>, String> {
    let runtime_requirements =
        routing_slot_model_capability_requirements(task_profile.routing_slot.as_deref());
    if !targets_responsive_chat(&runtime_requirements) {
        return Ok(None);
    }

    let thinking_enabled = resolve_request_thinking_enabled(request).await?;
    let has_images = request
        .images
        .as_ref()
        .map(|images| !images.is_empty())
        .unwrap_or(false);
    let providers = api_key_provider_service.0.get_all_providers(db)?;
    let mut candidates = Vec::new();
    let latency_hints = load_responsive_chat_auto_latency_hints(db);

    for (provider_order, provider) in providers.iter().enumerate() {
        if !can_use_responsive_chat_provider(provider) {
            continue;
        }

        let context =
            build_provider_resolution_context(db, api_key_provider_service, &provider.provider.id)?;
        let (catalog, _alias_config) = load_model_registry_catalog(app, &context).await;
        let provider_candidates = collect_responsive_chat_models_from_catalog(
            &catalog,
            thinking_enabled,
            has_images,
            &runtime_requirements,
        );
        if provider_candidates.is_empty() {
            continue;
        }

        for (model_name, model, compatible_candidate_count) in provider_candidates {
            let latency_hint = latency_hints
                .get(&(context.provider_selector.clone(), model_name.clone()))
                .cloned()
                .unwrap_or_default();

            candidates.push(ResponsiveChatAutoCandidate {
                provider_selector: context.provider_selector.clone(),
                model_name,
                model,
                compatible_candidate_count,
                provider_order,
                provider_group: context.provider_group,
                latency_hint,
            });
        }
    }

    candidates.sort_by(responsive_chat_auto_candidate_sort);

    Ok(candidates
        .into_iter()
        .next()
        .map(|candidate| ResponsiveChatAutoPreferenceContext {
            provider_selector: candidate.provider_selector,
            model_name: candidate.model_name,
            compatible_candidate_count: candidate.compatible_candidate_count,
        }))
}

pub(super) fn parse_responsive_chat_latency_run_metadata(
    metadata: &str,
) -> Option<ResponsiveChatAutoRunMetadata> {
    let value: serde_json::Value = serde_json::from_str(metadata).ok()?;
    let routing_decision = value
        .pointer("/request_metadata/lime_runtime/routing_decision")
        .and_then(serde_json::Value::as_object)?;
    let decision_source = routing_decision
        .get("decisionSource")
        .and_then(serde_json::Value::as_str)
        .or_else(|| {
            routing_decision
                .get("decision_source")
                .and_then(serde_json::Value::as_str)
        })?;
    let service_model_slot = routing_decision
        .get("serviceModelSlot")
        .and_then(serde_json::Value::as_str)
        .or_else(|| {
            routing_decision
                .get("service_model_slot")
                .and_then(serde_json::Value::as_str)
        });
    let settings_source = routing_decision
        .get("settingsSource")
        .and_then(serde_json::Value::as_str)
        .or_else(|| {
            routing_decision
                .get("settings_source")
                .and_then(serde_json::Value::as_str)
        });
    let is_responsive_chat_run = decision_source == "responsive_chat_auto"
        || service_model_slot.map(normalize_identifier).as_deref()
            == Some(RESPONSIVE_CHAT_SERVICE_MODEL_SLOT)
        || settings_source.map(normalize_identifier).as_deref()
            == Some("service_models.responsive_chat");
    if !is_responsive_chat_run {
        return None;
    }

    let provider_selector = routing_decision
        .get("selectedProvider")
        .and_then(serde_json::Value::as_str)
        .or_else(|| {
            routing_decision
                .get("selected_provider")
                .and_then(serde_json::Value::as_str)
        })
        .and_then(|value| normalize_optional_text(Some(value.to_string())))?;
    let model_name = routing_decision
        .get("selectedModel")
        .and_then(serde_json::Value::as_str)
        .or_else(|| {
            routing_decision
                .get("selected_model")
                .and_then(serde_json::Value::as_str)
        })
        .and_then(|value| normalize_optional_text(Some(value.to_string())))?;
    let turn_id = value
        .pointer("/turn_state/turn_id")
        .and_then(serde_json::Value::as_str)
        .and_then(|value| normalize_optional_text(Some(value.to_string())));

    Some(ResponsiveChatAutoRunMetadata {
        provider_selector,
        model_name,
        turn_id,
    })
}

fn metadata_model_first_text_delta_ms(metadata: &str) -> Option<u64> {
    let value: serde_json::Value = serde_json::from_str(metadata).ok()?;
    value
        .get("model_first_text_delta_ms")
        .and_then(serde_json::Value::as_u64)
}

fn session_first_text_latency_ms(
    conn: &rusqlite::Connection,
    session_id: &str,
    turn_id: Option<&str>,
) -> Option<u64> {
    let user_started_at = conn
        .query_row(
            "SELECT started_at
             FROM agent_thread_items
             WHERE session_id = ?1
               AND item_type = 'user_message'
               AND (?2 IS NULL OR turn_id = ?2)
             ORDER BY sequence ASC
             LIMIT 1",
            rusqlite::params![session_id, turn_id],
            |row| row.get::<_, String>(0),
        )
        .ok()?;
    let agent_started_at = conn
        .query_row(
            "SELECT started_at
             FROM agent_thread_items
             WHERE session_id = ?1
               AND item_type = 'agent_message'
               AND (?2 IS NULL OR turn_id = ?2)
             ORDER BY sequence ASC
             LIMIT 1",
            rusqlite::params![session_id, turn_id],
            |row| row.get::<_, String>(0),
        )
        .ok()?;
    let user_started_at = chrono::DateTime::parse_from_rfc3339(&user_started_at).ok()?;
    let agent_started_at = chrono::DateTime::parse_from_rfc3339(&agent_started_at).ok()?;
    let latency_ms = agent_started_at
        .signed_duration_since(user_started_at)
        .num_milliseconds();
    u64::try_from(latency_ms).ok()
}

fn session_has_reasoning_item(
    conn: &rusqlite::Connection,
    session_id: &str,
    turn_id: Option<&str>,
) -> bool {
    conn.query_row(
        "SELECT EXISTS(
             SELECT 1 FROM agent_thread_items
             WHERE session_id = ?1
               AND item_type = 'reasoning'
               AND (?2 IS NULL OR turn_id = ?2)
             LIMIT 1
         )",
        rusqlite::params![session_id, turn_id],
        |row| row.get::<_, i64>(0),
    )
    .map(|value| value > 0)
    .unwrap_or(false)
}

pub(super) fn is_responsive_chat_unsupported_model_error(message: Option<&str>) -> bool {
    let Some(message) = message else {
        return false;
    };
    let normalized = normalize_identifier(message);
    text_contains_any(
        &normalized,
        &[
            "not supported model",
            "unsupported model",
            "model not supported",
            "model_not_found",
            "model not found",
            "invalid model",
        ],
    )
}

pub(super) fn responsive_chat_running_sample_is_stale(
    status: &str,
    started_at: Option<&str>,
) -> bool {
    if status != "running" {
        return false;
    }
    let Some(started_at) =
        started_at.and_then(|value| normalize_optional_text(Some(value.to_string())))
    else {
        return false;
    };
    let Ok(started_at) = chrono::DateTime::parse_from_rfc3339(&started_at) else {
        return false;
    };
    chrono::Utc::now()
        .signed_duration_since(started_at.with_timezone(&chrono::Utc))
        .num_milliseconds()
        > 120_000
}

pub(super) fn load_responsive_chat_auto_latency_hints(
    db: &DbConnection,
) -> HashMap<(String, String), ResponsiveChatAutoLatencyHint> {
    let Ok(conn) = db.lock() else {
        return HashMap::new();
    };
    let Ok(mut stmt) = conn.prepare(
        "SELECT session_id, status, duration_ms, error_message, metadata, started_at
         FROM agent_runs
         WHERE source = 'chat'
           AND source_ref = 'agent_runtime_submit_turn'
           AND metadata IS NOT NULL
         ORDER BY started_at DESC
         LIMIT 80",
    ) else {
        return HashMap::new();
    };
    let Ok(rows) = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, Option<i64>>(2)?,
            row.get::<_, Option<String>>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, Option<String>>(5)?,
        ))
    }) else {
        return HashMap::new();
    };

    let mut hints: HashMap<(String, String), ResponsiveChatAutoLatencyHint> = HashMap::new();
    for row in rows.flatten() {
        let (session_id, status, duration_ms, error_message, metadata, started_at) = row;
        let Some(run_metadata) = parse_responsive_chat_latency_run_metadata(&metadata) else {
            continue;
        };

        let entry = hints
            .entry((run_metadata.provider_selector, run_metadata.model_name))
            .or_default();
        if status == "success" {
            if let Some(duration_ms) = duration_ms.and_then(|value| u64::try_from(value).ok()) {
                entry.durations_ms.push(duration_ms);
            }
            if let Some(first_text_duration_ms) = metadata_model_first_text_delta_ms(&metadata)
                .or_else(|| {
                    session_first_text_latency_ms(
                        &conn,
                        &session_id,
                        run_metadata.turn_id.as_deref(),
                    )
                })
            {
                entry.first_text_durations_ms.push(first_text_duration_ms);
            }
        }
        if status != "success"
            || responsive_chat_running_sample_is_stale(&status, started_at.as_deref())
        {
            entry.error_sample_count += 1;
        }
        if is_responsive_chat_unsupported_model_error(error_message.as_deref()) {
            entry.unsupported_model_sample_count += 1;
        }
        if session_has_reasoning_item(&conn, &session_id, run_metadata.turn_id.as_deref()) {
            entry.reasoning_sample_count += 1;
        }
    }

    hints
}
