use super::responsive_chat::{
    can_use_responsive_chat_provider, choose_responsive_chat_model_from_catalog,
    collect_responsive_chat_models_from_catalog, is_responsive_chat_provider_unavailable_error,
    is_responsive_chat_unsupported_model_error, load_responsive_chat_auto_latency_hints,
    parse_responsive_chat_latency_run_metadata, responsive_chat_auto_candidate_sort,
    responsive_chat_running_sample_is_stale, responsive_chat_setting_fallback_reason,
    ResponsiveChatAutoCandidate, ResponsiveChatAutoLatencyHint,
};
use super::*;
use lime_core::database::dao::api_key_provider::{
    ApiKeyEntry, ApiKeyProvider, ApiProviderType, ProviderGroup, ProviderWithKeys,
};
use lime_core::database::{schema::create_tables, DbConnection};
use rusqlite::{params, Connection};
use std::sync::{Arc, Mutex};

const TEST_CLOUD_API_HOST: &str = "cloud-api-host";
const TEST_OPENAI_COMPATIBLE_API_HOST: &str = "openai-compatible-api-host";
const TEST_ANTHROPIC_COMPATIBLE_API_HOST: &str = "anthropic-compatible-api-host";
const TEST_PROVIDER_UNAVAILABLE_API_HOST: &str = "provider-unavailable-api-host";
const TEST_CUSTOM_MODEL_API_HOST: &str = "custom-model-api-host";
const TEST_TEXT_CHAT_API_HOST: &str = "text-chat-api-host";
const TEST_MEDIA_RUNTIME_HOST: &str = "media-runtime-host/fal-ai";
const TEST_CODE_RUNTIME_HOST: &str = "code-runtime-host/coding";
const TEST_LOCAL_OLLAMA_BASE_URL: &str = "http://127.0.0.1:11434";

fn build_model(
    id: &str,
    family: Option<&str>,
    reasoning: bool,
    vision: bool,
    is_latest: bool,
    tier: ModelTier,
    release_date: Option<&str>,
) -> EnhancedModelMetadata {
    EnhancedModelMetadata {
        id: id.to_string(),
        display_name: id.to_string(),
        provider_id: "openai".to_string(),
        provider_name: "openai".to_string(),
        family: family.map(ToString::to_string),
        tier,
        capabilities: ModelCapabilities {
            vision,
            tools: true,
            streaming: true,
            json_mode: true,
            function_calling: true,
            reasoning,
            reasoning_effort: None,
        },
        task_families: {
            let mut families = vec![ModelTaskFamily::Chat];
            if reasoning {
                families.push(ModelTaskFamily::Reasoning);
            }
            if vision {
                families.push(ModelTaskFamily::VisionUnderstanding);
            }
            families
        },
        input_modalities: if vision {
            vec![ModelModality::Text, ModelModality::Image]
        } else {
            vec![ModelModality::Text]
        },
        output_modalities: vec![ModelModality::Text, ModelModality::Json],
        runtime_features: vec![
            ModelRuntimeFeature::Streaming,
            ModelRuntimeFeature::ToolCalling,
            ModelRuntimeFeature::JsonSchema,
        ],
        deployment_source: ModelDeploymentSource::UserCloud,
        management_plane: ModelManagementPlane::LocalSettings,
        canonical_model_id: None,
        provider_model_id: Some(id.to_string()),
        alias_source: None,
        pricing: None,
        limits: Default::default(),
        status: Default::default(),
        release_date: release_date.map(ToString::to_string),
        is_latest,
        description: None,
        source: ModelSource::Embedded,
        created_at: 0,
        updated_at: 0,
    }
}

fn build_provider_with_key(
    id: &str,
    provider_type: ApiProviderType,
    api_host: &str,
) -> ProviderWithKeys {
    let now = chrono::Utc::now();
    ProviderWithKeys {
        provider: ApiKeyProvider {
            id: id.to_string(),
            name: id.to_string(),
            provider_type,
            api_host: api_host.to_string(),
            is_system: false,
            group: ProviderGroup::Aggregator,
            enabled: true,
            sort_order: 0,
            api_version: None,
            project: None,
            location: None,
            region: None,
            custom_models: Vec::new(),
            prompt_cache_mode: None,
            created_at: now,
            updated_at: now,
        },
        api_keys: vec![ApiKeyEntry {
            id: format!("{id}-key"),
            provider_id: id.to_string(),
            api_key_encrypted: "encrypted".to_string(),
            alias: None,
            enabled: true,
            usage_count: 0,
            error_count: 0,
            last_used_at: None,
            created_at: now,
        }],
    }
}

fn setup_responsive_chat_latency_db() -> DbConnection {
    let conn = Connection::open_in_memory().expect("创建内存数据库失败");
    create_tables(&conn).expect("创建测试表失败");
    Arc::new(Mutex::new(conn))
}

fn insert_agent_run_latency_sample(
    db: &DbConnection,
    id: &str,
    session_id: &str,
    status: &str,
    duration_ms: Option<i64>,
    error_message: Option<&str>,
    metadata: &str,
    started_at: &str,
) {
    let conn = db.lock().expect("获取测试数据库失败");
    conn.execute(
        "INSERT INTO agent_runs (
            id, source, source_ref, session_id, status, started_at, finished_at,
            duration_ms, error_code, error_message, metadata, created_at, updated_at
        ) VALUES (?1, 'chat', 'agent_runtime_submit_turn', ?2, ?3, ?4, ?5, ?6, NULL, ?7, ?8, ?4, ?4)",
        params![
            id,
            session_id,
            status,
            started_at,
            started_at,
            duration_ms,
            error_message,
            metadata
        ],
    )
    .expect("写入测试 agent_run 失败");
}

fn insert_agent_thread_item_latency_sample(
    db: &DbConnection,
    session_id: &str,
    turn_id: &str,
    id: &str,
    sequence: i64,
    item_type: &str,
    started_at: &str,
) {
    let conn = db.lock().expect("获取测试数据库失败");
    conn.execute(
        "INSERT OR IGNORE INTO agent_sessions (id, model, created_at, updated_at)
         VALUES (?1, 'test:model', ?2, ?2)",
        params![session_id, started_at],
    )
    .expect("写入测试 agent_session 失败");
    conn.execute(
        "INSERT OR IGNORE INTO agent_thread_turns (
            id, session_id, prompt_text, status, started_at, completed_at,
            error_message, created_at, updated_at
        ) VALUES (?1, ?2, 'hello', 'completed', ?3, ?3, NULL, ?3, ?3)",
        params![turn_id, session_id, started_at],
    )
    .expect("写入测试 agent_thread_turn 失败");
    conn.execute(
        "INSERT INTO agent_thread_items (
            id, session_id, turn_id, sequence, item_type, status, started_at,
            completed_at, updated_at, payload_json
        ) VALUES (?1, ?2, ?3, ?4, ?5, 'completed', ?6, ?6, ?6, '{}')",
        params![id, session_id, turn_id, sequence, item_type, started_at],
    )
    .expect("写入测试 agent_thread_item 失败");
}

#[test]
fn thinking_on_prefers_reasoning_variant() {
    let models = vec![
        build_model(
            "gpt-5.4-mini",
            Some("gpt-5.4"),
            false,
            false,
            true,
            ModelTier::Mini,
            Some("2026-01-01"),
        ),
        build_model(
            "gpt-5.4-mini-thinking",
            Some("gpt-5.4"),
            true,
            false,
            true,
            ModelTier::Mini,
            Some("2026-01-02"),
        ),
    ];

    assert_eq!(
        resolve_thinking_model_id("gpt-5.4-mini", &models),
        "gpt-5.4-mini-thinking"
    );
}

#[test]
fn thinking_off_restores_base_variant() {
    let models = vec![
        build_model(
            "gpt-5.4-mini",
            Some("gpt-5.4"),
            false,
            false,
            true,
            ModelTier::Mini,
            Some("2026-01-01"),
        ),
        build_model(
            "gpt-5.4-mini-thinking",
            Some("gpt-5.4"),
            true,
            false,
            true,
            ModelTier::Mini,
            Some("2026-01-02"),
        ),
    ];

    assert_eq!(
        resolve_base_model_on_thinking_off("gpt-5.4-mini-thinking", &models),
        "gpt-5.4-mini"
    );
}

#[test]
fn vision_resolution_prefers_same_family_candidate() {
    let models = vec![
        build_model(
            "text-chat-mini",
            Some("text-chat"),
            false,
            false,
            true,
            ModelTier::Mini,
            Some("2026-01-01"),
        ),
        build_model(
            "text-chat-vision",
            Some("text-chat"),
            true,
            true,
            true,
            ModelTier::Pro,
            Some("2026-01-03"),
        ),
        build_model(
            "gemini-2.5-pro",
            Some("gemini-2.5"),
            true,
            true,
            true,
            ModelTier::Pro,
            Some("2026-01-02"),
        ),
    ];

    assert_eq!(
        resolve_vision_model_id("text-chat-mini", &models).unwrap(),
        "text-chat-vision"
    );
}

#[test]
fn vision_resolution_keeps_unknown_model_when_name_implies_vision() {
    let models = vec![build_model(
        "gpt-5.4",
        Some("gpt-5.4"),
        true,
        true,
        true,
        ModelTier::Pro,
        Some("2026-01-03"),
    )];

    assert_eq!(
        resolve_vision_model_id("gpt-5.4-mini", &models).unwrap(),
        "gpt-5.4-mini"
    );
}

#[test]
fn vision_resolution_keeps_modern_unknown_vision_model_names() {
    let models = vec![build_model(
        "gpt-5.4",
        Some("gpt-5.4"),
        true,
        true,
        true,
        ModelTier::Pro,
        Some("2026-01-03"),
    )];

    for model_id in ["o3", "o4-mini", "grok-4.3", "qwen3.5-27b"] {
        assert_eq!(
            resolve_vision_model_id(model_id, &models).unwrap(),
            model_id,
            "{model_id} should stay selected when the name implies image input"
        );
    }
}

#[test]
fn vision_resolution_keeps_stale_catalog_model_when_name_implies_vision() {
    let models = vec![
        build_model(
            "o3",
            Some("o3"),
            false,
            false,
            true,
            ModelTier::Pro,
            Some("2026-01-03"),
        ),
        build_model(
            "gpt-5.4",
            Some("gpt-5.4"),
            true,
            true,
            true,
            ModelTier::Pro,
            Some("2026-01-04"),
        ),
    ];

    assert_eq!(resolve_vision_model_id("o3", &models).unwrap(), "o3");
}

#[test]
fn vision_resolution_does_not_keep_non_vision_sibling_names() {
    let models = vec![build_model(
        "gpt-5.4",
        Some("gpt-5.4"),
        true,
        true,
        true,
        ModelTier::Pro,
        Some("2026-01-03"),
    )];

    assert_eq!(
        resolve_vision_model_id("o3-mini", &models).unwrap(),
        "gpt-5.4"
    );
    assert_eq!(
        resolve_vision_model_id("grok-3-mini", &models).unwrap(),
        "gpt-5.4"
    );
}

#[test]
fn vision_resolution_keeps_model_when_input_modality_declares_image() {
    let mut model = build_model(
        "provider-vlm-chat",
        Some("provider-vlm"),
        false,
        false,
        true,
        ModelTier::Pro,
        Some("2026-01-03"),
    );
    model.input_modalities = vec![ModelModality::Text, ModelModality::Image];

    let models = vec![model];

    assert_eq!(
        resolve_vision_model_id("provider-vlm-chat", &models).unwrap(),
        "provider-vlm-chat"
    );
}

#[test]
fn vision_resolution_does_not_keep_pure_image_model_for_chat_images() {
    let mut image_model = build_model(
        "gpt-image-1",
        Some("gpt-image"),
        false,
        false,
        true,
        ModelTier::Pro,
        Some("2026-01-04"),
    );
    image_model.capabilities.tools = false;
    image_model.capabilities.function_calling = false;
    image_model.capabilities.json_mode = false;
    image_model.task_families = vec![ModelTaskFamily::ImageGeneration];
    image_model.input_modalities = vec![ModelModality::Text, ModelModality::Image];
    image_model.output_modalities = vec![ModelModality::Image];

    let models = vec![
        image_model,
        build_model(
            "gpt-5.4",
            Some("gpt-5.4"),
            true,
            true,
            true,
            ModelTier::Pro,
            Some("2026-01-03"),
        ),
    ];

    assert_eq!(
        resolve_vision_model_id("gpt-image-1", &models).unwrap(),
        "gpt-5.4"
    );
}

#[test]
fn codex_compatibility_falls_back_to_supported_model() {
    let context = ProviderResolutionContext {
        provider_selector: "codex".to_string(),
        aster_provider_name: "openai".to_string(),
        compatibility_provider_key: "codex".to_string(),
        registry_provider_ids: vec!["codex".to_string()],
        alias_key: "codex".to_string(),
        custom_models: vec![],
        is_custom_provider: false,
        provider_type: Some(ApiProviderType::Codex),
        provider_group: None,
        configured_api_host: Some(TEST_CLOUD_API_HOST.to_string()),
        has_credentials: true,
    };

    assert_eq!(
        resolve_provider_model_compatibility(&context, "gpt-5.3-codex"),
        "gpt-5.2-codex"
    );
}

#[test]
fn provider_custom_model_canonicalization_keeps_declared_model_ids() {
    let context = ProviderResolutionContext {
        provider_selector: "custom-provider".to_string(),
        aster_provider_name: "anthropic".to_string(),
        compatibility_provider_key: "anthropic-compatible".to_string(),
        registry_provider_ids: vec!["custom-provider".to_string()],
        alias_key: "custom-provider".to_string(),
        custom_models: vec![],
        is_custom_provider: true,
        provider_type: Some(ApiProviderType::AnthropicCompatible),
        provider_group: None,
        configured_api_host: Some(TEST_ANTHROPIC_COMPATIBLE_API_HOST.to_string()),
        has_credentials: true,
    };

    assert_eq!(
        resolve_provider_model_compatibility(&context, "Provider-Chat-Pro"),
        "Provider-Chat-Pro"
    );
    assert_eq!(
        resolve_provider_model_compatibility(&context, "provider-chat-flash"),
        "provider-chat-flash"
    );
    assert_eq!(
        canonicalize_provider_custom_models(
            &context,
            &[
                "Provider-Chat-Pro".to_string(),
                "provider-chat-flash".to_string(),
                "provider-chat-flash".to_string(),
            ],
        ),
        vec![
            "Provider-Chat-Pro".to_string(),
            "provider-chat-flash".to_string()
        ]
    );
}

#[test]
fn catalog_fallback_prefers_latest_same_lineage_chat_model_for_unknown_session_model() {
    let models = vec![
        build_model(
            "embedding-3",
            Some("embedding"),
            false,
            false,
            true,
            ModelTier::Pro,
            Some("2026-01-05"),
        ),
        build_model(
            "glm-4v",
            Some("glm"),
            false,
            true,
            true,
            ModelTier::Pro,
            Some("2026-01-04"),
        ),
        build_model(
            "glm-4.6",
            Some("glm"),
            false,
            false,
            false,
            ModelTier::Pro,
            Some("2026-01-03"),
        ),
        build_model(
            "glm-4.7",
            Some("glm"),
            false,
            false,
            true,
            ModelTier::Pro,
            Some("2026-01-04"),
        ),
    ];

    assert_eq!(
        resolve_catalog_fallback_model_id("glm-5.1", &models, false, false, &[]),
        "glm-4.7"
    );
}

#[test]
fn multi_candidate_selection_prefers_same_family_lower_cost_model() {
    let models = vec![
        build_model(
            "gpt-5.4",
            Some("gpt-5.4"),
            false,
            false,
            true,
            ModelTier::Pro,
            Some("2026-01-03"),
        ),
        build_model(
            "gpt-5.4-mini",
            Some("gpt-5.4"),
            false,
            false,
            true,
            ModelTier::Mini,
            Some("2026-01-04"),
        ),
        build_model(
            "gemini-2.5-pro",
            Some("gemini-2.5"),
            false,
            false,
            true,
            ModelTier::Pro,
            Some("2026-01-05"),
        ),
    ];

    assert_eq!(
        choose_best_multi_candidate_model("gpt-5.4", &models, false, false, &[]).as_deref(),
        Some("gpt-5.4-mini")
    );
}

#[test]
fn responsive_chat_routing_prefers_low_cost_non_reasoning_model() {
    let mut models = vec![
        build_model(
            "gpt-5.4",
            Some("gpt-5.4"),
            false,
            false,
            true,
            ModelTier::Pro,
            Some("2026-01-05"),
        ),
        build_model(
            "gpt-5.4-mini-thinking",
            Some("gpt-5.4"),
            false,
            false,
            true,
            ModelTier::Mini,
            Some("2026-01-06"),
        ),
        build_model(
            "gpt-5.4-mini",
            Some("gpt-5.4"),
            false,
            false,
            true,
            ModelTier::Mini,
            Some("2026-01-04"),
        ),
    ];
    models[1].capabilities.reasoning = true;
    models[1].task_families.push(ModelTaskFamily::Reasoning);

    let requirements = routing_slot_model_capability_requirements(Some("responsive_chat_model"));

    assert_eq!(
        choose_best_multi_candidate_model("gpt-5.4", &models, false, false, &requirements,)
            .as_deref(),
        Some("gpt-5.4-mini")
    );
}

#[test]
fn responsive_chat_catalog_auto_selection_uses_metadata_not_provider_list() {
    let mut models = vec![
        build_model(
            "provider-a-pro",
            Some("provider-a"),
            false,
            false,
            true,
            ModelTier::Pro,
            Some("2026-01-05"),
        ),
        build_model(
            "provider-b-flash",
            Some("provider-b"),
            false,
            false,
            true,
            ModelTier::Mini,
            Some("2026-01-04"),
        ),
        build_model(
            "provider-c-mini-thinking",
            Some("provider-c"),
            true,
            false,
            true,
            ModelTier::Mini,
            Some("2026-01-06"),
        ),
    ];
    models[2].capabilities.reasoning = true;
    models[2].task_families.push(ModelTaskFamily::Reasoning);

    let requirements = routing_slot_model_capability_requirements(Some("responsive_chat_model"));
    let selected = choose_responsive_chat_model_from_catalog(&models, false, false, &requirements)
        .expect("responsive chat candidate");

    assert_eq!(selected.0, "provider-b-flash");
    assert_eq!(selected.2, 3);
}

#[test]
fn responsive_chat_catalog_prefers_speed_hints_before_lexicographic_order() {
    let models = vec![
        build_model(
            "MiniMax-M2.7",
            Some("MiniMax"),
            false,
            false,
            true,
            ModelTier::Pro,
            None,
        ),
        build_model(
            "sensenova-6.7-flash-lite",
            Some("sensenova"),
            false,
            false,
            true,
            ModelTier::Pro,
            None,
        ),
        build_model(
            "deepseek-v4-flash",
            Some("deepseek"),
            false,
            false,
            true,
            ModelTier::Pro,
            None,
        ),
    ];

    let requirements = routing_slot_model_capability_requirements(Some("responsive_chat_model"));
    let selected = choose_responsive_chat_model_from_catalog(&models, false, false, &requirements)
        .expect("responsive chat candidate");

    assert_eq!(selected.0, "deepseek-v4-flash");
    assert_eq!(selected.2, 3);
}

#[test]
fn responsive_chat_catalog_excludes_code_agent_models() {
    let models = vec![
        build_model(
            "astron-code-latest",
            Some("astron-code"),
            false,
            false,
            true,
            ModelTier::Pro,
            None,
        ),
        build_model(
            "general-chat-mini",
            Some("general-chat"),
            false,
            false,
            true,
            ModelTier::Mini,
            None,
        ),
    ];
    let requirements = routing_slot_model_capability_requirements(Some("responsive_chat_model"));
    let selected = choose_responsive_chat_model_from_catalog(&models, false, false, &requirements)
        .expect("responsive chat candidate");

    assert_eq!(selected.0, "general-chat-mini");
    assert_eq!(selected.2, 1);
}

#[test]
fn responsive_chat_auto_expands_all_provider_models_before_global_sort() {
    let requirements = routing_slot_model_capability_requirements(Some("responsive_chat_model"));
    let deepseek_models = vec![
        build_model(
            "deepseek-v4-flash",
            Some("deepseek"),
            false,
            false,
            true,
            ModelTier::Pro,
            None,
        ),
        build_model(
            "deepseek-chat",
            Some("deepseek"),
            false,
            false,
            true,
            ModelTier::Pro,
            None,
        ),
    ];
    let provider_models =
        collect_responsive_chat_models_from_catalog(&deepseek_models, false, false, &requirements);

    assert_eq!(
        provider_models
            .iter()
            .map(|(model_name, _, _)| model_name.as_str())
            .collect::<Vec<_>>(),
        vec!["deepseek-v4-flash", "deepseek-chat"]
    );

    let mut candidates = provider_models
        .into_iter()
        .map(
            |(model_name, model, compatible_candidate_count)| ResponsiveChatAutoCandidate {
                provider_selector: "deepseek".to_string(),
                latency_hint: if model_name == "deepseek-v4-flash" {
                    ResponsiveChatAutoLatencyHint {
                        durations_ms: vec![1_800],
                        reasoning_sample_count: 1,
                        ..Default::default()
                    }
                } else {
                    ResponsiveChatAutoLatencyHint::default()
                },
                model_name,
                model,
                compatible_candidate_count,
                provider_order: 4,
                provider_group: Some(ProviderGroup::Mainstream),
            },
        )
        .collect::<Vec<_>>();
    candidates.push(ResponsiveChatAutoCandidate {
        provider_selector: "custom-minimax".to_string(),
        model_name: "MiniMax-M2.7".to_string(),
        model: build_model(
            "MiniMax-M2.7",
            Some("MiniMax"),
            false,
            false,
            true,
            ModelTier::Pro,
            None,
        ),
        compatible_candidate_count: 1,
        provider_order: 12,
        provider_group: Some(ProviderGroup::Custom),
        latency_hint: ResponsiveChatAutoLatencyHint {
            durations_ms: vec![2_200],
            reasoning_sample_count: 1,
            ..Default::default()
        },
    });

    candidates.sort_by(responsive_chat_auto_candidate_sort);

    assert_eq!(candidates[0].provider_selector, "deepseek");
    assert_eq!(candidates[0].model_name, "deepseek-chat");
    assert_eq!(candidates[0].compatible_candidate_count, 2);
}

#[test]
fn responsive_chat_auto_candidate_uses_provider_order_before_model_name_tiebreaker() {
    let mut candidates = vec![
        ResponsiveChatAutoCandidate {
            provider_selector: "late-provider".to_string(),
            model_name: "aaa-flash".to_string(),
            model: build_model(
                "aaa-flash",
                Some("aaa"),
                false,
                false,
                true,
                ModelTier::Pro,
                None,
            ),
            compatible_candidate_count: 1,
            provider_order: 10,
            provider_group: Some(ProviderGroup::Mainstream),
            latency_hint: ResponsiveChatAutoLatencyHint::default(),
        },
        ResponsiveChatAutoCandidate {
            provider_selector: "early-provider".to_string(),
            model_name: "zzz-flash".to_string(),
            model: build_model(
                "zzz-flash",
                Some("zzz"),
                false,
                false,
                true,
                ModelTier::Pro,
                None,
            ),
            compatible_candidate_count: 1,
            provider_order: 1,
            provider_group: Some(ProviderGroup::Mainstream),
            latency_hint: ResponsiveChatAutoLatencyHint::default(),
        },
    ];

    candidates.sort_by(responsive_chat_auto_candidate_sort);

    assert_eq!(candidates[0].provider_selector, "early-provider");
    assert_eq!(candidates[0].model_name, "zzz-flash");
}

#[test]
fn responsive_chat_auto_candidate_demotes_slow_or_reasoning_history() {
    let mut candidates = vec![
        ResponsiveChatAutoCandidate {
            provider_selector: "known-slow-reasoning".to_string(),
            model_name: "fast-looking-flash".to_string(),
            model: build_model(
                "fast-looking-flash",
                Some("fast-looking"),
                false,
                false,
                true,
                ModelTier::Pro,
                None,
            ),
            compatible_candidate_count: 1,
            provider_order: 1,
            provider_group: Some(ProviderGroup::Mainstream),
            latency_hint: ResponsiveChatAutoLatencyHint {
                durations_ms: vec![5_500],
                reasoning_sample_count: 1,
                ..Default::default()
            },
        },
        ResponsiveChatAutoCandidate {
            provider_selector: "unknown-flash-lite".to_string(),
            model_name: "flash-lite".to_string(),
            model: build_model(
                "flash-lite",
                Some("flash-lite"),
                false,
                false,
                true,
                ModelTier::Pro,
                None,
            ),
            compatible_candidate_count: 1,
            provider_order: 99,
            provider_group: Some(ProviderGroup::Custom),
            latency_hint: ResponsiveChatAutoLatencyHint::default(),
        },
    ];

    candidates.sort_by(responsive_chat_auto_candidate_sort);

    assert_eq!(candidates[0].provider_selector, "unknown-flash-lite");
    assert_eq!(candidates[0].model_name, "flash-lite");
}

#[test]
fn responsive_chat_auto_candidate_prefers_first_text_latency_over_total_duration() {
    let mut candidates = vec![
        ResponsiveChatAutoCandidate {
            provider_selector: "total-fast-text-slow".to_string(),
            model_name: "slow-first-text".to_string(),
            model: build_model(
                "slow-first-text",
                Some("provider-a"),
                false,
                false,
                true,
                ModelTier::Mini,
                None,
            ),
            compatible_candidate_count: 1,
            provider_order: 1,
            provider_group: Some(ProviderGroup::Mainstream),
            latency_hint: ResponsiveChatAutoLatencyHint {
                durations_ms: vec![900],
                first_text_durations_ms: vec![4_200],
                ..Default::default()
            },
        },
        ResponsiveChatAutoCandidate {
            provider_selector: "total-slow-text-fast".to_string(),
            model_name: "fast-first-text".to_string(),
            model: build_model(
                "fast-first-text",
                Some("provider-b"),
                false,
                false,
                true,
                ModelTier::Mini,
                None,
            ),
            compatible_candidate_count: 1,
            provider_order: 2,
            provider_group: Some(ProviderGroup::Mainstream),
            latency_hint: ResponsiveChatAutoLatencyHint {
                durations_ms: vec![5_000],
                first_text_durations_ms: vec![850],
                ..Default::default()
            },
        },
    ];

    candidates.sort_by(responsive_chat_auto_candidate_sort);

    assert_eq!(candidates[0].provider_selector, "total-slow-text-fast");
    assert_eq!(candidates[0].model_name, "fast-first-text");
}

#[test]
fn responsive_chat_latency_metadata_accepts_service_model_setting_samples() {
    let metadata = serde_json::json!({
        "request_metadata": {
            "lime_runtime": {
                "routing_decision": {
                    "decisionSource": "service_model_setting",
                    "selectedProvider": "deepseek",
                    "selectedModel": "deepseek-v4-pro",
                    "settingsSource": "service_models.responsive_chat",
                    "serviceModelSlot": "responsive_chat"
                }
            }
        },
        "turn_state": {
            "turn_id": "turn-1"
        },
        "model_first_text_delta_ms": 4200
    })
    .to_string();

    let parsed = parse_responsive_chat_latency_run_metadata(&metadata).expect("sample metadata");

    assert_eq!(parsed.provider_selector, "deepseek");
    assert_eq!(parsed.model_name, "deepseek-v4-pro");
    assert_eq!(parsed.turn_id.as_deref(), Some("turn-1"));
}

#[test]
fn responsive_chat_latency_hints_prefer_recorded_first_text_over_timeline() {
    let db = setup_responsive_chat_latency_db();
    let metadata = serde_json::json!({
        "request_metadata": {
            "lime_runtime": {
                "routing_decision": {
                    "decisionSource": "responsive_chat_auto",
                    "selectedProvider": "openai",
                    "selectedModel": "gpt-5.4-mini",
                    "serviceModelSlot": "responsive_chat"
                }
            }
        },
        "turn_state": {
            "turn_id": "turn-recorded"
        },
        "model_first_text_delta_ms": 900
    })
    .to_string();

    insert_agent_thread_item_latency_sample(
        &db,
        "session-recorded",
        "turn-recorded",
        "user-recorded",
        1,
        "user_message",
        "2026-05-12T00:00:00Z",
    );
    insert_agent_thread_item_latency_sample(
        &db,
        "session-recorded",
        "turn-recorded",
        "agent-recorded",
        2,
        "agent_message",
        "2026-05-12T00:00:05Z",
    );
    insert_agent_run_latency_sample(
        &db,
        "run-recorded",
        "session-recorded",
        "success",
        Some(12_000),
        None,
        &metadata,
        "2026-05-12T00:00:00Z",
    );

    let hints = load_responsive_chat_auto_latency_hints(&db);
    let hint = hints
        .get(&("openai".to_string(), "gpt-5.4-mini".to_string()))
        .expect("应读取 responsive_chat latency hint");

    assert_eq!(hint.durations_ms, vec![12_000]);
    assert_eq!(hint.first_text_durations_ms, vec![900]);
}

#[test]
fn responsive_chat_latency_hints_fallback_to_timeline_first_text() {
    let db = setup_responsive_chat_latency_db();
    let metadata = serde_json::json!({
        "request_metadata": {
            "lime_runtime": {
                "routing_decision": {
                    "decisionSource": "responsive_chat_auto",
                    "selectedProvider": "openai",
                    "selectedModel": "gpt-5.4-mini",
                    "serviceModelSlot": "responsive_chat"
                }
            }
        },
        "turn_state": {
            "turn_id": "turn-timeline"
        }
    })
    .to_string();

    insert_agent_thread_item_latency_sample(
        &db,
        "session-timeline",
        "turn-timeline",
        "user-timeline",
        1,
        "user_message",
        "2026-05-12T00:00:00Z",
    );
    insert_agent_thread_item_latency_sample(
        &db,
        "session-timeline",
        "turn-timeline",
        "agent-timeline",
        2,
        "agent_message",
        "2026-05-12T00:00:02.500Z",
    );
    insert_agent_run_latency_sample(
        &db,
        "run-timeline",
        "session-timeline",
        "success",
        Some(9_000),
        None,
        &metadata,
        "2026-05-12T00:00:00Z",
    );

    let hints = load_responsive_chat_auto_latency_hints(&db);
    let hint = hints
        .get(&("openai".to_string(), "gpt-5.4-mini".to_string()))
        .expect("应读取 responsive_chat latency hint");

    assert_eq!(hint.durations_ms, vec![9_000]);
    assert_eq!(hint.first_text_durations_ms, vec![2_500]);
}

#[test]
fn responsive_chat_setting_fallback_reason_reads_slow_service_model_history() {
    let db = setup_responsive_chat_latency_db();
    let metadata = serde_json::json!({
        "request_metadata": {
            "lime_runtime": {
                "routing_decision": {
                    "decisionSource": "service_model_setting",
                    "selectedProvider": "deepseek",
                    "selectedModel": "deepseek-v4-pro",
                    "settingsSource": "service_models.responsive_chat",
                    "serviceModelSlot": "responsive_chat"
                }
            }
        },
        "turn_state": {
            "turn_id": "turn-slow-setting"
        },
        "model_first_text_delta_ms": 4200
    })
    .to_string();

    insert_agent_run_latency_sample(
        &db,
        "run-slow-setting",
        "session-slow-setting",
        "success",
        Some(900),
        None,
        &metadata,
        "2026-05-12T00:00:00Z",
    );

    assert_eq!(
        responsive_chat_setting_fallback_reason(&db, "deepseek", "deepseek-v4-pro"),
        Some("slow_first_text_p50_4200ms".to_string())
    );
}

#[test]
fn responsive_chat_setting_fallback_reason_reads_reasoning_service_model_history() {
    let db = setup_responsive_chat_latency_db();
    let metadata = serde_json::json!({
        "request_metadata": {
            "lime_runtime": {
                "routing_decision": {
                    "decisionSource": "service_model_setting",
                    "selectedProvider": "deepseek",
                    "selectedModel": "deepseek-v4-reasoner",
                    "settingsSource": "service_models.responsive_chat",
                    "serviceModelSlot": "responsive_chat"
                }
            }
        },
        "turn_state": {
            "turn_id": "turn-reasoning-setting"
        },
        "model_first_text_delta_ms": 900
    })
    .to_string();

    insert_agent_thread_item_latency_sample(
        &db,
        "session-reasoning-setting",
        "turn-reasoning-setting",
        "reasoning-reasoning-setting",
        1,
        "reasoning",
        "2026-05-12T00:00:00Z",
    );
    insert_agent_run_latency_sample(
        &db,
        "run-reasoning-setting",
        "session-reasoning-setting",
        "success",
        Some(1200),
        None,
        &metadata,
        "2026-05-12T00:00:00Z",
    );

    assert_eq!(
        responsive_chat_setting_fallback_reason(&db, "deepseek", "deepseek-v4-reasoner"),
        Some("reasoning_output_observed".to_string())
    );
}

#[test]
fn responsive_chat_setting_fallback_reason_reads_unsupported_service_model_history() {
    let db = setup_responsive_chat_latency_db();
    let metadata = serde_json::json!({
        "request_metadata": {
            "lime_runtime": {
                "routing_decision": {
                    "decisionSource": "service_model_setting",
                    "selectedProvider": "openrouter",
                    "selectedModel": "unsupported-chat-model",
                    "settingsSource": "service_models.responsive_chat",
                    "serviceModelSlot": "responsive_chat"
                }
            }
        },
        "turn_state": {
            "turn_id": "turn-unsupported-setting"
        }
    })
    .to_string();

    insert_agent_run_latency_sample(
        &db,
        "run-unsupported-setting",
        "session-unsupported-setting",
        "failed",
        None,
        Some("unsupported model for chat completions"),
        &metadata,
        "2026-05-12T00:00:00Z",
    );

    assert_eq!(
        responsive_chat_setting_fallback_reason(&db, "openrouter", "unsupported-chat-model"),
        Some("unsupported_model".to_string())
    );
}

#[test]
fn responsive_chat_setting_fallback_reason_reads_recent_error_without_success() {
    let db = setup_responsive_chat_latency_db();
    let metadata = serde_json::json!({
        "request_metadata": {
            "lime_runtime": {
                "routing_decision": {
                    "decisionSource": "service_model_setting",
                    "selectedProvider": "openai",
                    "selectedModel": "gpt-slow-edge",
                    "settingsSource": "service_models.responsive_chat",
                    "serviceModelSlot": "responsive_chat"
                }
            }
        },
        "turn_state": {
            "turn_id": "turn-error-setting"
        }
    })
    .to_string();

    insert_agent_run_latency_sample(
        &db,
        "run-error-setting",
        "session-error-setting",
        "failed",
        None,
        Some("upstream timeout"),
        &metadata,
        "2026-05-12T00:00:00Z",
    );

    assert_eq!(
        responsive_chat_setting_fallback_reason(&db, "openai", "gpt-slow-edge"),
        Some("recent_error_without_success".to_string())
    );
}

#[test]
fn responsive_chat_latency_hints_mark_latest_provider_unavailable_error() {
    let db = setup_responsive_chat_latency_db();
    let metadata = serde_json::json!({
        "request_metadata": {
            "lime_runtime": {
                "routing_decision": {
                    "decisionSource": "responsive_chat_auto",
                    "selectedProvider": "deepseek",
                    "selectedModel": "deepseek-v4-flash",
                    "serviceModelSlot": "responsive_chat",
                    "settingsSource": "service_models.responsive_chat:auto"
                }
            }
        },
        "turn_state": {
            "turn_id": "turn-deepseek-402"
        },
        "model_first_text_delta_ms": 720
    })
    .to_string();

    insert_agent_run_latency_sample(
        &db,
        "run-deepseek-success",
        "session-deepseek-success",
        "success",
        Some(1_400),
        None,
        &metadata,
        "2026-05-12T00:00:00Z",
    );
    insert_agent_run_latency_sample(
        &db,
        "run-deepseek-402",
        "session-deepseek-402",
        "error",
        None,
        Some("402 Payment Required: Insufficient Balance"),
        &metadata,
        "2026-05-12T00:01:00Z",
    );

    let hints = load_responsive_chat_auto_latency_hints(&db);
    let hint = hints
        .get(&("deepseek".to_string(), "deepseek-v4-flash".to_string()))
        .expect("应读取 DeepSeek responsive_chat latency hint");

    assert_eq!(hint.sample_count, 2);
    assert_eq!(hint.durations_ms, vec![1_400]);
    assert_eq!(hint.first_text_durations_ms, vec![720]);
    assert_eq!(hint.error_sample_count, 1);
    assert_eq!(hint.provider_unavailable_sample_count, 1);
    assert!(hint.latest_provider_unavailable_error);
    assert_eq!(
        responsive_chat_setting_fallback_reason(&db, "deepseek", "deepseek-v4-flash"),
        Some("provider_unavailable_recent_error".to_string())
    );
}

#[test]
fn responsive_chat_latency_hints_clear_latest_provider_unavailable_after_success() {
    let db = setup_responsive_chat_latency_db();
    let metadata = serde_json::json!({
        "request_metadata": {
            "lime_runtime": {
                "routing_decision": {
                    "decisionSource": "responsive_chat_auto",
                    "selectedProvider": "deepseek",
                    "selectedModel": "deepseek-v4-flash",
                    "serviceModelSlot": "responsive_chat"
                }
            }
        },
        "turn_state": {
            "turn_id": "turn-deepseek-recovered"
        },
        "model_first_text_delta_ms": 680
    })
    .to_string();

    insert_agent_run_latency_sample(
        &db,
        "run-deepseek-402-old",
        "session-deepseek-402-old",
        "failed",
        None,
        Some("402 Payment Required: Insufficient Balance"),
        &metadata,
        "2026-05-12T00:00:00Z",
    );
    insert_agent_run_latency_sample(
        &db,
        "run-deepseek-recovered",
        "session-deepseek-recovered",
        "success",
        Some(1_200),
        None,
        &metadata,
        "2026-05-12T00:01:00Z",
    );

    let hints = load_responsive_chat_auto_latency_hints(&db);
    let hint = hints
        .get(&("deepseek".to_string(), "deepseek-v4-flash".to_string()))
        .expect("应读取 DeepSeek recovered latency hint");

    assert_eq!(hint.sample_count, 2);
    assert_eq!(hint.provider_unavailable_sample_count, 1);
    assert!(!hint.latest_provider_unavailable_error);
    assert_eq!(
        responsive_chat_setting_fallback_reason(&db, "deepseek", "deepseek-v4-flash"),
        None
    );
}

#[test]
fn responsive_chat_auto_explores_trusted_unknown_before_above_target_latency() {
    let mut candidates = vec![
        ResponsiveChatAutoCandidate {
            provider_selector: "known-aggregator".to_string(),
            model_name: "known-above-target".to_string(),
            model: build_model(
                "known-above-target",
                Some("known"),
                false,
                false,
                true,
                ModelTier::Mini,
                None,
            ),
            compatible_candidate_count: 1,
            provider_order: 99,
            provider_group: Some(ProviderGroup::Aggregator),
            latency_hint: ResponsiveChatAutoLatencyHint {
                durations_ms: vec![1_200],
                first_text_durations_ms: vec![2_400],
                ..Default::default()
            },
        },
        ResponsiveChatAutoCandidate {
            provider_selector: "trusted-mainstream".to_string(),
            model_name: "unmeasured-chat".to_string(),
            model: build_model(
                "unmeasured-chat",
                Some("trusted"),
                false,
                false,
                true,
                ModelTier::Pro,
                None,
            ),
            compatible_candidate_count: 1,
            provider_order: 1,
            provider_group: Some(ProviderGroup::Mainstream),
            latency_hint: ResponsiveChatAutoLatencyHint::default(),
        },
        ResponsiveChatAutoCandidate {
            provider_selector: "custom-new-fast-looking".to_string(),
            model_name: "new-flash-lite".to_string(),
            model: build_model(
                "new-flash-lite",
                Some("new"),
                false,
                false,
                true,
                ModelTier::Mini,
                None,
            ),
            compatible_candidate_count: 1,
            provider_order: 2,
            provider_group: Some(ProviderGroup::Custom),
            latency_hint: ResponsiveChatAutoLatencyHint::default(),
        },
    ];

    candidates.sort_by(responsive_chat_auto_candidate_sort);

    assert_eq!(candidates[0].provider_selector, "trusted-mainstream");
    assert_eq!(candidates[0].model_name, "unmeasured-chat");
}

#[test]
fn responsive_chat_auto_candidate_demotes_known_unsupported_model() {
    let mut candidates = vec![
        ResponsiveChatAutoCandidate {
            provider_selector: "unsupported-provider".to_string(),
            model_name: "fast-looking-flash".to_string(),
            model: build_model(
                "fast-looking-flash",
                Some("fast-looking"),
                false,
                false,
                true,
                ModelTier::Pro,
                None,
            ),
            compatible_candidate_count: 1,
            provider_order: 1,
            provider_group: Some(ProviderGroup::Mainstream),
            latency_hint: ResponsiveChatAutoLatencyHint {
                durations_ms: vec![800],
                error_sample_count: 1,
                unsupported_model_sample_count: 1,
                ..Default::default()
            },
        },
        ResponsiveChatAutoCandidate {
            provider_selector: "unknown-provider".to_string(),
            model_name: "flash-lite".to_string(),
            model: build_model(
                "flash-lite",
                Some("flash-lite"),
                false,
                false,
                true,
                ModelTier::Pro,
                None,
            ),
            compatible_candidate_count: 1,
            provider_order: 99,
            provider_group: Some(ProviderGroup::Custom),
            latency_hint: ResponsiveChatAutoLatencyHint::default(),
        },
    ];

    candidates.sort_by(responsive_chat_auto_candidate_sort);

    assert_eq!(candidates[0].provider_selector, "unknown-provider");
    assert_eq!(candidates[0].model_name, "flash-lite");
    assert!(is_responsive_chat_unsupported_model_error(Some(
        "Request failed: Bad request (400): Not supported model stale-chat"
    )));
}

#[test]
fn responsive_chat_auto_demotes_latest_provider_unavailable_with_success_history() {
    let mut candidates = vec![
        ResponsiveChatAutoCandidate {
            provider_selector: "deepseek".to_string(),
            model_name: "deepseek-v4-flash".to_string(),
            model: build_model(
                "deepseek-v4-flash",
                Some("deepseek"),
                false,
                false,
                true,
                ModelTier::Mini,
                None,
            ),
            compatible_candidate_count: 1,
            provider_order: 1,
            provider_group: Some(ProviderGroup::Mainstream),
            latency_hint: ResponsiveChatAutoLatencyHint {
                sample_count: 2,
                durations_ms: vec![900],
                first_text_durations_ms: vec![720],
                error_sample_count: 1,
                provider_unavailable_sample_count: 1,
                latest_provider_unavailable_error: true,
                ..Default::default()
            },
        },
        ResponsiveChatAutoCandidate {
            provider_selector: "healthy-mainstream".to_string(),
            model_name: "healthy-mini".to_string(),
            model: build_model(
                "healthy-mini",
                Some("healthy"),
                false,
                false,
                true,
                ModelTier::Mini,
                None,
            ),
            compatible_candidate_count: 1,
            provider_order: 2,
            provider_group: Some(ProviderGroup::Mainstream),
            latency_hint: ResponsiveChatAutoLatencyHint {
                sample_count: 1,
                durations_ms: vec![1_500],
                first_text_durations_ms: vec![1_100],
                ..Default::default()
            },
        },
        ResponsiveChatAutoCandidate {
            provider_selector: "trusted-unmeasured".to_string(),
            model_name: "trusted-flash".to_string(),
            model: build_model(
                "trusted-flash",
                Some("trusted"),
                false,
                false,
                true,
                ModelTier::Mini,
                None,
            ),
            compatible_candidate_count: 1,
            provider_order: 3,
            provider_group: Some(ProviderGroup::Mainstream),
            latency_hint: ResponsiveChatAutoLatencyHint::default(),
        },
    ];

    candidates.sort_by(responsive_chat_auto_candidate_sort);

    assert_eq!(candidates[0].provider_selector, "healthy-mainstream");
    assert_ne!(candidates[0].provider_selector, "deepseek");
    assert!(is_responsive_chat_provider_unavailable_error(Some(
        "402 Payment Required: Insufficient Balance"
    )));
}

#[test]
fn responsive_chat_auto_skips_latest_provider_unavailable_candidates() {
    let healthy_model = build_model(
        "healthy-mini",
        Some("healthy"),
        false,
        false,
        true,
        ModelTier::Mini,
        None,
    );
    let unavailable_model = build_model(
        "deepseek-v4-flash",
        Some("deepseek"),
        false,
        false,
        true,
        ModelTier::Mini,
        None,
    );
    let mut candidates = vec![
        ResponsiveChatAutoCandidate {
            provider_selector: "deepseek".to_string(),
            model_name: "deepseek-v4-flash".to_string(),
            model: unavailable_model.clone(),
            compatible_candidate_count: 1,
            provider_order: 1,
            provider_group: Some(ProviderGroup::Mainstream),
            latency_hint: ResponsiveChatAutoLatencyHint {
                sample_count: 2,
                durations_ms: vec![900],
                first_text_durations_ms: vec![720],
                error_sample_count: 1,
                provider_unavailable_sample_count: 1,
                latest_provider_unavailable_error: true,
                ..Default::default()
            },
        },
        ResponsiveChatAutoCandidate {
            provider_selector: "healthy-mainstream".to_string(),
            model_name: "healthy-mini".to_string(),
            model: healthy_model.clone(),
            compatible_candidate_count: 1,
            provider_order: 2,
            provider_group: Some(ProviderGroup::Mainstream),
            latency_hint: ResponsiveChatAutoLatencyHint {
                sample_count: 1,
                durations_ms: vec![1_500],
                first_text_durations_ms: vec![1_100],
                ..Default::default()
            },
        },
    ];

    candidates.retain(|candidate| !candidate.latency_hint.latest_provider_unavailable_error);
    candidates.sort_by(responsive_chat_auto_candidate_sort);

    assert_eq!(candidates.len(), 1);
    assert_eq!(candidates[0].provider_selector, "healthy-mainstream");
    assert_eq!(candidates[0].model_name, "healthy-mini");
}

#[test]
fn responsive_chat_auto_candidate_prefers_known_success_before_unproven_custom_flash() {
    let mut candidates = vec![
        ResponsiveChatAutoCandidate {
            provider_selector: "custom-new-fast-looking".to_string(),
            model_name: "new-flash-lite".to_string(),
            model: build_model(
                "new-flash-lite",
                Some("new"),
                false,
                false,
                true,
                ModelTier::Mini,
                None,
            ),
            compatible_candidate_count: 1,
            provider_order: 1,
            provider_group: Some(ProviderGroup::Custom),
            latency_hint: ResponsiveChatAutoLatencyHint::default(),
        },
        ResponsiveChatAutoCandidate {
            provider_selector: "known-streaming".to_string(),
            model_name: "known-mini".to_string(),
            model: build_model(
                "known-mini",
                Some("known"),
                false,
                false,
                true,
                ModelTier::Mini,
                None,
            ),
            compatible_candidate_count: 1,
            provider_order: 99,
            provider_group: Some(ProviderGroup::Mainstream),
            latency_hint: ResponsiveChatAutoLatencyHint {
                durations_ms: vec![3_300],
                ..Default::default()
            },
        },
    ];

    candidates.sort_by(responsive_chat_auto_candidate_sort);

    assert_eq!(candidates[0].provider_selector, "known-streaming");
    assert_eq!(candidates[0].model_name, "known-mini");
}

#[test]
fn responsive_chat_auto_candidate_keeps_known_success_ahead_of_unknown_after_stale_error() {
    let mut candidates = vec![
        ResponsiveChatAutoCandidate {
            provider_selector: "custom-unknown".to_string(),
            model_name: "unknown-fast".to_string(),
            model: build_model(
                "unknown-fast",
                Some("unknown"),
                false,
                false,
                true,
                ModelTier::Mini,
                None,
            ),
            compatible_candidate_count: 1,
            provider_order: 1,
            provider_group: Some(ProviderGroup::Custom),
            latency_hint: ResponsiveChatAutoLatencyHint::default(),
        },
        ResponsiveChatAutoCandidate {
            provider_selector: "known-aggregator".to_string(),
            model_name: "known-flash".to_string(),
            model: build_model(
                "known-flash",
                Some("known"),
                false,
                false,
                true,
                ModelTier::Mini,
                None,
            ),
            compatible_candidate_count: 1,
            provider_order: 99,
            provider_group: Some(ProviderGroup::Aggregator),
            latency_hint: ResponsiveChatAutoLatencyHint {
                durations_ms: vec![4_800],
                error_sample_count: 1,
                ..Default::default()
            },
        },
    ];

    candidates.sort_by(responsive_chat_auto_candidate_sort);

    assert_eq!(candidates[0].provider_selector, "known-aggregator");
    assert_eq!(candidates[0].model_name, "known-flash");
}

#[test]
fn responsive_chat_provider_filter_rejects_media_only_fal_provider() {
    let provider = build_provider_with_key("fal", ApiProviderType::Openai, TEST_MEDIA_RUNTIME_HOST);

    assert!(!can_use_responsive_chat_provider(&provider));

    let fal_typed_provider = build_provider_with_key(
        "custom-media",
        ApiProviderType::Fal,
        TEST_MEDIA_RUNTIME_HOST,
    );
    assert!(!can_use_responsive_chat_provider(&fal_typed_provider));

    let codex_provider = build_provider_with_key(
        "custom-codex",
        ApiProviderType::Codex,
        TEST_OPENAI_COMPATIBLE_API_HOST,
    );
    assert!(!can_use_responsive_chat_provider(&codex_provider));

    let coding_provider = build_provider_with_key(
        "kimi-coding",
        ApiProviderType::AnthropicCompatible,
        TEST_CODE_RUNTIME_HOST,
    );
    assert!(!can_use_responsive_chat_provider(&coding_provider));
}

#[test]
fn responsive_chat_provider_filter_keeps_openai_compatible_provider_named_codex() {
    let mut provider = build_provider_with_key(
        "custom-openai-compatible",
        ApiProviderType::Openai,
        TEST_OPENAI_COMPATIBLE_API_HOST,
    );
    provider.provider.name = "Custom Codex Compatible".to_string();
    provider.provider.custom_models = vec!["gpt-5.5".to_string()];

    assert!(can_use_responsive_chat_provider(&provider));
}

#[test]
fn responsive_chat_provider_filter_keeps_text_protocols() {
    for provider_type in [
        ApiProviderType::Openai,
        ApiProviderType::OpenaiResponse,
        ApiProviderType::Anthropic,
        ApiProviderType::AnthropicCompatible,
        ApiProviderType::Gemini,
        ApiProviderType::AzureOpenai,
        ApiProviderType::Vertexai,
        ApiProviderType::AwsBedrock,
        ApiProviderType::Ollama,
        ApiProviderType::NewApi,
        ApiProviderType::Gateway,
    ] {
        let provider = build_provider_with_key(
            &format!("text-{provider_type}"),
            provider_type,
            TEST_TEXT_CHAT_API_HOST,
        );

        assert!(
            can_use_responsive_chat_provider(&provider),
            "provider type {provider_type} should remain eligible"
        );
    }
}

#[test]
fn responsive_chat_running_sample_is_stale_after_two_minutes() {
    let stale_started_at = (chrono::Utc::now() - chrono::Duration::seconds(180))
        .to_rfc3339_opts(chrono::SecondsFormat::Micros, true);
    let fresh_started_at = (chrono::Utc::now() - chrono::Duration::seconds(30))
        .to_rfc3339_opts(chrono::SecondsFormat::Micros, true);

    assert!(responsive_chat_running_sample_is_stale(
        "running",
        Some(&stale_started_at)
    ));
    assert!(!responsive_chat_running_sample_is_stale(
        "running",
        Some(&fresh_started_at)
    ));
    assert!(!responsive_chat_running_sample_is_stale(
        "success",
        Some(&stale_started_at)
    ));
}

#[test]
fn multi_candidate_selection_prefers_reasoning_model_when_thinking_enabled() {
    let mut models = vec![
        build_model(
            "gpt-5.4-mini",
            Some("gpt-5.4"),
            false,
            false,
            true,
            ModelTier::Mini,
            Some("2026-01-03"),
        ),
        build_model(
            "gpt-5.4-mini-thinking",
            Some("gpt-5.4"),
            false,
            false,
            true,
            ModelTier::Mini,
            Some("2026-01-04"),
        ),
    ];
    models[1].capabilities.reasoning = true;
    models[1].task_families.push(ModelTaskFamily::Reasoning);

    assert_eq!(
        choose_best_multi_candidate_model("gpt-5.4-mini", &models, true, false, &[]).as_deref(),
        Some("gpt-5.4-mini-thinking")
    );
}

#[test]
fn multi_candidate_selection_prefers_vision_candidate_when_images_present() {
    let models = vec![
        build_model(
            "text-chat-mini",
            Some("text-chat"),
            false,
            false,
            true,
            ModelTier::Mini,
            Some("2026-01-03"),
        ),
        build_model(
            "text-chat-vision",
            Some("text-chat"),
            true,
            true,
            true,
            ModelTier::Pro,
            Some("2026-01-04"),
        ),
    ];

    assert_eq!(
        choose_best_multi_candidate_model("text-chat-mini", &models, false, true, &[]).as_deref(),
        Some("text-chat-vision")
    );
}

#[test]
fn runtime_routing_slot_filters_candidate_count_by_model_role() {
    let mut models = vec![
        build_model(
            "gpt-5.4-mini",
            Some("gpt-5.4"),
            false,
            false,
            true,
            ModelTier::Mini,
            Some("2026-01-03"),
        ),
        build_model(
            "gpt-5.4-mini-thinking",
            Some("gpt-5.4"),
            true,
            false,
            true,
            ModelTier::Mini,
            Some("2026-01-04"),
        ),
    ];
    models[1].capabilities.reasoning = true;
    models[1].task_families.push(ModelTaskFamily::Reasoning);
    let requirements = routing_slot_model_capability_requirements(Some("browser_reasoning_model"));

    assert_eq!(
        count_compatible_candidate_models(&models, false, false, &requirements),
        1
    );
    assert_eq!(
        choose_best_multi_candidate_model("gpt-5.4-mini", &models, false, false, &requirements)
            .as_deref(),
        Some("gpt-5.4-mini-thinking")
    );
}

#[test]
fn runtime_routing_slot_keeps_specialized_image_candidate_in_pool() {
    let mut image_model = build_model(
        "gpt-image-1",
        Some("gpt-image"),
        false,
        true,
        true,
        ModelTier::Pro,
        Some("2026-01-04"),
    );
    image_model.task_families = vec![ModelTaskFamily::ImageGeneration];
    image_model.output_modalities = vec![ModelModality::Image];
    image_model.input_modalities = vec![ModelModality::Text, ModelModality::Image];
    let models = vec![
        build_model(
            "gpt-5.4-mini",
            Some("gpt-5.4"),
            false,
            false,
            true,
            ModelTier::Mini,
            Some("2026-01-03"),
        ),
        image_model,
    ];
    let requirements = routing_slot_model_capability_requirements(Some("image_generation_model"));

    assert_eq!(
        count_compatible_candidate_models(&models, false, false, &requirements),
        1
    );
    assert_eq!(
        choose_best_multi_candidate_model("gpt-5.4-mini", &models, false, false, &requirements)
            .as_deref(),
        Some("gpt-image-1")
    );
}

#[test]
fn runtime_vision_requirement_accepts_declared_image_input_modality() {
    let mut model = build_model(
        "provider-vlm-chat",
        Some("provider-vlm"),
        false,
        false,
        true,
        ModelTier::Pro,
        Some("2026-01-03"),
    );
    model.input_modalities = vec![ModelModality::Text, ModelModality::Image];
    let requirements = routing_slot_model_capability_requirements(Some("vision_input_model"));

    assert!(model_satisfies_runtime_capability_requirement(
        &model,
        RuntimeModelCapabilityRequirement::VisionInput
    ));
    assert_eq!(
        missing_runtime_model_capability_requirements(&model, &requirements),
        Vec::<RuntimeModelCapabilityRequirement>::new()
    );
}

#[test]
fn runtime_vision_requirement_accepts_known_vision_name_from_stale_catalog() {
    let model = build_model(
        "o3",
        Some("o3"),
        false,
        false,
        true,
        ModelTier::Pro,
        Some("2026-01-03"),
    );
    let requirements = routing_slot_model_capability_requirements(Some("vision_input_model"));

    assert!(model_satisfies_runtime_capability_requirement(
        &model,
        RuntimeModelCapabilityRequirement::VisionInput
    ));
    assert_eq!(
        missing_runtime_model_capability_requirements(&model, &requirements),
        Vec::<RuntimeModelCapabilityRequirement>::new()
    );
}

#[test]
fn runtime_routing_slot_reselects_only_when_user_lock_allows_it() {
    let models = vec![build_model(
        "gpt-5.4-mini",
        Some("gpt-5.4"),
        false,
        false,
        true,
        ModelTier::Mini,
        Some("2026-01-03"),
    )];
    let requirements = routing_slot_model_capability_requirements(Some("browser_reasoning_model"));
    let model = find_model_meta("gpt-5.4-mini", &models);

    assert!(should_reselect_for_runtime_capability_gap(
        model,
        1,
        &requirements,
        false
    ));
    assert!(!should_reselect_for_runtime_capability_gap(
        model,
        1,
        &requirements,
        true
    ));
}

#[test]
fn user_locked_model_reports_execution_profile_capability_gap() {
    let models = vec![build_model(
        "gpt-5.4-mini",
        Some("gpt-5.4"),
        false,
        false,
        true,
        ModelTier::Mini,
        Some("2026-01-03"),
    )];
    let requirements = routing_slot_model_capability_requirements(Some("browser_reasoning_model"));
    let model = find_model_meta("gpt-5.4-mini", &models).expect("model");
    let locked_model_capability_gap =
        missing_runtime_model_capability_requirements(model, &requirements)
            .first()
            .map(|requirement| requirement.gap_code().to_string());

    assert_eq!(
        locked_model_capability_gap.as_deref(),
        Some("browser_reasoning_candidate_missing")
    );
    assert_eq!(
        runtime_model_capability_gap_for_catalog(&models, &requirements).as_deref(),
        Some("browser_reasoning_candidate_missing")
    );
}

#[test]
fn user_locked_capability_gap_should_use_blocking_limit_status() {
    let selection = ResolvedRuntimeProviderSelection {
        provider_config: ConfigureProviderRequest {
            provider_id: Some("openai".to_string()),
            provider_name: "openai".to_string(),
            model_name: "gpt-5.4-mini".to_string(),
            api_key: None,
            base_url: None,
            model_capabilities: None,
            tool_call_strategy: None,
            toolshim_model: None,
        },
        provider_selector: "openai".to_string(),
        requested_model: "gpt-5.4-mini".to_string(),
        resolved_model: "gpt-5.4-mini".to_string(),
        candidate_count: 1,
        estimated_cost_class: Some("low".to_string()),
        pricing: None,
        capability_gap: Some("browser_reasoning_candidate_missing".to_string()),
        capability_gap_source: Some("explicit_model_lock".to_string()),
        fallback_chain: Vec::new(),
    };

    assert_eq!(
        runtime_limit_status_for_selection(&selection),
        "user_locked_capability_gap"
    );
}

#[test]
fn custom_provider_multi_candidate_reselection_is_disabled() {
    let context = ProviderResolutionContext {
        provider_selector: "custom-provider".to_string(),
        aster_provider_name: "anthropic".to_string(),
        compatibility_provider_key: "anthropic-compatible".to_string(),
        registry_provider_ids: vec!["custom-provider".to_string()],
        alias_key: "custom-provider".to_string(),
        custom_models: vec![
            "provider-chat-pro".to_string(),
            "provider-chat-lite".to_string(),
        ],
        is_custom_provider: true,
        provider_type: Some(ApiProviderType::AnthropicCompatible),
        provider_group: None,
        configured_api_host: Some(TEST_ANTHROPIC_COMPATIBLE_API_HOST.to_string()),
        has_credentials: true,
    };

    assert!(!should_auto_reselect_multi_candidate_model(&context));
}

#[test]
fn configured_model_allowlist_disables_system_provider_auto_reselection() {
    let context = ProviderResolutionContext {
        provider_selector: "deepseek".to_string(),
        aster_provider_name: "openai".to_string(),
        compatibility_provider_key: "deepseek".to_string(),
        registry_provider_ids: vec!["deepseek".to_string()],
        alias_key: "deepseek".to_string(),
        custom_models: vec!["deepseek-chat".to_string()],
        is_custom_provider: false,
        provider_type: Some(ApiProviderType::Openai),
        provider_group: None,
        configured_api_host: Some(TEST_PROVIDER_UNAVAILABLE_API_HOST.to_string()),
        has_credentials: true,
    };

    assert!(!should_auto_reselect_multi_candidate_model(&context));
}

#[test]
fn model_recovery_prefers_configured_candidate_without_model_name_hardcode() {
    let context = ProviderResolutionContext {
        provider_selector: "custom-provider".to_string(),
        aster_provider_name: "anthropic".to_string(),
        compatibility_provider_key: "anthropic-compatible".to_string(),
        registry_provider_ids: vec!["custom-provider".to_string()],
        alias_key: "custom-provider".to_string(),
        custom_models: vec!["stable-chat".to_string(), "stale-chat".to_string()],
        is_custom_provider: true,
        provider_type: Some(ApiProviderType::AnthropicCompatible),
        provider_group: None,
        configured_api_host: Some(TEST_ANTHROPIC_COMPATIBLE_API_HOST.to_string()),
        has_credentials: true,
    };
    let models = vec![
        build_model(
            "stable-chat",
            Some("provider-chat"),
            false,
            false,
            true,
            ModelTier::Pro,
            Some("2026-04-01"),
        ),
        build_model(
            "stale-chat",
            Some("provider-chat"),
            false,
            false,
            true,
            ModelTier::Mini,
            Some("2026-04-02"),
        ),
    ];

    assert_eq!(
        choose_provider_model_recovery_model(&context, "stale-chat", &models, false, false)
            .as_deref(),
        Some("stable-chat")
    );
}

#[test]
fn model_recovery_prefers_configured_model_for_system_provider() {
    let context = ProviderResolutionContext {
        provider_selector: "deepseek".to_string(),
        aster_provider_name: "openai".to_string(),
        compatibility_provider_key: "deepseek".to_string(),
        registry_provider_ids: vec!["deepseek".to_string()],
        alias_key: "deepseek".to_string(),
        custom_models: vec!["deepseek-chat".to_string(), "deepseek-reasoner".to_string()],
        is_custom_provider: false,
        provider_type: Some(ApiProviderType::Openai),
        provider_group: None,
        configured_api_host: Some(TEST_PROVIDER_UNAVAILABLE_API_HOST.to_string()),
        has_credentials: true,
    };
    let models = vec![
        build_model(
            "deepseek-chat",
            Some("deepseek"),
            false,
            false,
            true,
            ModelTier::Mini,
            Some("2026-04-01"),
        ),
        build_model(
            "deepseek-reasoner",
            Some("deepseek"),
            true,
            false,
            true,
            ModelTier::Pro,
            Some("2026-04-02"),
        ),
        build_model(
            "gpt-5.5",
            Some("gpt"),
            true,
            false,
            true,
            ModelTier::Max,
            Some("2026-05-01"),
        ),
    ];

    assert_eq!(
        choose_provider_model_recovery_model(&context, "gpt-5.5", &models, false, false).as_deref(),
        Some("deepseek-chat")
    );
}

#[test]
fn model_recovery_falls_back_to_catalog_candidate_without_provider_allowlist() {
    let context = ProviderResolutionContext {
        provider_selector: "openai".to_string(),
        aster_provider_name: "openai".to_string(),
        compatibility_provider_key: "openai".to_string(),
        registry_provider_ids: vec!["openai".to_string()],
        alias_key: "openai".to_string(),
        custom_models: vec![],
        is_custom_provider: false,
        provider_type: Some(ApiProviderType::Openai),
        provider_group: None,
        configured_api_host: None,
        has_credentials: true,
    };
    let models = vec![
        build_model(
            "gpt-4o",
            Some("gpt-4o"),
            false,
            true,
            true,
            ModelTier::Pro,
            Some("2024-05-13"),
        ),
        build_model(
            "gpt-4o-mini",
            Some("gpt-4o"),
            false,
            true,
            true,
            ModelTier::Mini,
            Some("2024-07-18"),
        ),
    ];

    assert_eq!(
        choose_provider_model_recovery_model(&context, "gpt-4o", &models, false, false).as_deref(),
        Some("gpt-4o-mini")
    );
}

#[test]
fn model_recovery_can_use_uncataloged_configured_model() {
    let context = ProviderResolutionContext {
        provider_selector: "siliconflow-cn".to_string(),
        aster_provider_name: "openai".to_string(),
        compatibility_provider_key: "openai".to_string(),
        registry_provider_ids: vec!["siliconflow-cn".to_string()],
        alias_key: "siliconflow-cn".to_string(),
        custom_models: vec!["deepseek-ai/DeepSeek-V4-Flash".to_string()],
        is_custom_provider: false,
        provider_type: Some(ApiProviderType::Openai),
        provider_group: None,
        configured_api_host: Some(TEST_CUSTOM_MODEL_API_HOST.to_string()),
        has_credentials: true,
    };
    let models = vec![build_model(
        "gpt-5.5",
        Some("gpt"),
        true,
        false,
        true,
        ModelTier::Max,
        Some("2026-05-01"),
    )];

    assert_eq!(
        choose_provider_model_recovery_model(&context, "gpt-5.5", &models, false, false).as_deref(),
        Some("deepseek-ai/DeepSeek-V4-Flash")
    );
}

#[test]
fn model_preference_falls_back_to_session_model_when_provider_matches() {
    let resolved = resolve_model_preference_with_session_fallback(
        None,
        "openai",
        Some(&SessionProviderModelContext {
            provider_selector: Some("openai".to_string()),
            provider_name: Some("OpenAI".to_string()),
            model_name: Some("gpt-5.4-mini".to_string()),
        }),
    )
    .unwrap();

    assert_eq!(
        resolved,
        ("gpt-5.4-mini".to_string(), RequestPreferenceSource::Session)
    );
}

#[test]
fn model_preference_requires_explicit_value_when_provider_changes() {
    let error = resolve_model_preference_with_session_fallback(
        None,
        "gemini",
        Some(&SessionProviderModelContext {
            provider_selector: Some("openai".to_string()),
            provider_name: Some("OpenAI".to_string()),
            model_name: Some("gpt-5.4-mini".to_string()),
        }),
    )
    .unwrap_err();

    assert!(
        error.contains("切换 provider"),
        "unexpected error message: {error}"
    );
}

#[test]
fn explicit_model_preference_wins_over_session_fallback() {
    let resolved = resolve_model_preference_with_session_fallback(
        Some("gpt-5.4".to_string()),
        "openai",
        Some(&SessionProviderModelContext {
            provider_selector: Some("openai".to_string()),
            provider_name: Some("OpenAI".to_string()),
            model_name: Some("gpt-5.4-mini".to_string()),
        }),
    )
    .unwrap();

    assert_eq!(
        resolved,
        ("gpt-5.4".to_string(), RequestPreferenceSource::Request)
    );
}

#[test]
fn provider_preference_falls_back_to_session_provider_when_request_missing() {
    let resolved = resolve_provider_preference_with_session_fallback(
        None,
        Some(&SessionProviderModelContext {
            provider_selector: Some("openai".to_string()),
            provider_name: Some("OpenAI".to_string()),
            model_name: Some("gpt-5.4-mini".to_string()),
        }),
    )
    .unwrap();

    assert_eq!(
        resolved,
        ("openai".to_string(), RequestPreferenceSource::Session)
    );
}

#[test]
fn explicit_provider_preference_wins_over_session_fallback() {
    let resolved = resolve_provider_preference_with_session_fallback(
        Some("gemini".to_string()),
        Some(&SessionProviderModelContext {
            provider_selector: Some("openai".to_string()),
            provider_name: Some("OpenAI".to_string()),
            model_name: Some("gpt-5.4-mini".to_string()),
        }),
    )
    .unwrap();

    assert_eq!(
        resolved,
        ("gemini".to_string(), RequestPreferenceSource::Request)
    );
}

#[test]
fn explicit_request_preference_disables_cross_provider_runtime_fallback() {
    assert!(!should_allow_cross_provider_runtime_fallback(
        RequestPreferenceSource::Request,
        RequestPreferenceSource::Session,
    ));
    assert!(!should_allow_cross_provider_runtime_fallback(
        RequestPreferenceSource::Session,
        RequestPreferenceSource::Request,
    ));
    assert!(!should_allow_cross_provider_runtime_fallback(
        RequestPreferenceSource::Request,
        RequestPreferenceSource::Request,
    ));
}

#[test]
fn session_recovered_preference_can_keep_runtime_fallback() {
    assert!(should_allow_cross_provider_runtime_fallback(
        RequestPreferenceSource::Session,
        RequestPreferenceSource::Session,
    ));
}

#[test]
fn service_scene_model_preference_reads_complete_preference() {
    let metadata = serde_json::json!({
        "harness": {
            "service_scene_launch": {
                "kind": "local_service_skill",
                "service_scene_run": {
                    "skill_id": "voice-runtime",
                    "preferred_provider_id": "openai-tts",
                    "preferred_model_id": "gpt-4o-mini-tts",
                    "allow_fallback": false,
                }
            }
        }
    });

    let resolved = resolve_service_scene_model_preference(Some(&metadata));

    assert_eq!(
        resolved,
        Some(ServiceSceneModelPreferenceContext {
            provider_selector: "openai-tts".to_string(),
            model_name: "gpt-4o-mini-tts".to_string(),
            allow_fallback: false,
        })
    );
}

#[test]
fn service_scene_model_preference_ignores_provider_only_selection() {
    let metadata = serde_json::json!({
        "harness": {
            "service_scene_launch": {
                "kind": "local_service_skill",
                "service_scene_run": {
                    "skill_id": "voice-runtime",
                    "preferred_provider_id": "openai-tts"
                }
            }
        }
    });

    assert!(resolve_service_scene_model_preference(Some(&metadata)).is_none());
}

#[test]
fn runtime_task_profile_marks_translation_service_slot() {
    let request = AsterChatRequest {
        message: "翻译这段内容".to_string(),
        session_id: "session-1".to_string(),
        event_name: "agent-event".to_string(),
        images: None,
        provider_config: None,
        provider_preference: None,
        model_preference: None,
        reasoning_effort: None,
        thinking_enabled: None,
        approval_policy: None,
        sandbox_policy: None,
        project_id: None,
        workspace_id: "workspace-1".to_string(),
        web_search: None,
        search_mode: None,
        execution_strategy: None,
        auto_continue: None,
        system_prompt: None,
        metadata: Some(serde_json::json!({
            "harness": {
                "translation_skill_launch": {
                    "source_text": "hello"
                }
            }
        })),
        turn_id: None,
        queue_if_busy: None,
        queued_turn_id: None,
    };

    let profile = build_runtime_task_profile(&request);

    assert_eq!(profile.kind, "translation");
    assert_eq!(profile.source, "translation_skill_launch");
    assert_eq!(profile.service_model_slot.as_deref(), Some("translation"));
    assert!(profile
        .traits
        .iter()
        .any(|value| value == "service_model_slot"));
}

#[test]
fn runtime_task_profile_maps_more_service_model_slots() {
    let base_request = AsterChatRequest {
        message: "继续处理".to_string(),
        session_id: "session-1".to_string(),
        event_name: "agent-event".to_string(),
        images: None,
        provider_config: None,
        provider_preference: None,
        model_preference: None,
        reasoning_effort: None,
        thinking_enabled: None,
        approval_policy: None,
        sandbox_policy: None,
        project_id: None,
        workspace_id: "workspace-1".to_string(),
        web_search: None,
        search_mode: None,
        execution_strategy: None,
        auto_continue: None,
        system_prompt: None,
        metadata: None,
        turn_id: None,
        queue_if_busy: None,
        queued_turn_id: None,
    };

    let mut resource_request = base_request.clone();
    resource_request.metadata = Some(serde_json::json!({
        "harness": {
            "resource_search_skill_launch": {
                "kind": "resource_search_task",
                "resource_search_task": {
                    "query": "找几张产品图"
                }
            }
        }
    }));
    let resource_profile = build_runtime_task_profile(&resource_request);
    assert_eq!(resource_profile.kind, "resource_search");
    assert_eq!(resource_profile.source, "resource_search_skill_launch");
    assert_eq!(
        resource_profile.service_model_slot.as_deref(),
        Some("resource_prompt_rewrite")
    );

    let mut summary_request = base_request.clone();
    summary_request.metadata = Some(serde_json::json!({
        "harness": {
            "summary_skill_launch": {
                "kind": "summary_request",
                "summary_request": {
                    "content": "总结这段内容"
                }
            }
        }
    }));
    let summary_profile = build_runtime_task_profile(&summary_request);
    assert_eq!(summary_profile.kind, "summary");
    assert_eq!(summary_profile.source, "summary_skill_launch");
    assert_eq!(summary_profile.service_model_slot, None);

    let mut topic_request = base_request.clone();
    topic_request.metadata = Some(serde_json::json!({
        "harness": {
            "topic_skill_launch": {
                "kind": "topic_request"
            }
        }
    }));
    let topic_profile = build_runtime_task_profile(&topic_request);
    assert_eq!(topic_profile.kind, "topic");
    assert_eq!(topic_profile.source, "auxiliary_topic");
    assert_eq!(topic_profile.service_model_slot.as_deref(), Some("topic"));

    let mut generation_topic_request = base_request.clone();
    generation_topic_request.metadata = Some(serde_json::json!({
        "harness": {
            "generation_topic_skill_launch": {
                "kind": "generation_topic_request"
            }
        }
    }));
    let generation_topic_profile = build_runtime_task_profile(&generation_topic_request);
    assert_eq!(generation_topic_profile.kind, "generation_topic");
    assert_eq!(
        generation_topic_profile.source,
        "auxiliary_generation_topic"
    );
    assert_eq!(
        generation_topic_profile.service_model_slot.as_deref(),
        Some("generation_topic")
    );

    let mut agent_meta_request = base_request.clone();
    agent_meta_request.metadata = Some(serde_json::json!({
        "harness": {
            "agent_meta_skill_launch": {
                "kind": "agent_meta_request"
            }
        }
    }));
    let agent_meta_profile = build_runtime_task_profile(&agent_meta_request);
    assert_eq!(agent_meta_profile.kind, "agent_meta");
    assert_eq!(agent_meta_profile.source, "auxiliary_agent_meta");
    assert_eq!(
        agent_meta_profile.service_model_slot.as_deref(),
        Some("agent_meta")
    );

    let mut rewrite_request = base_request;
    rewrite_request.metadata = Some(serde_json::json!({
        "harness": {
            "turn_purpose": "style_rewrite"
        }
    }));
    let rewrite_profile = build_runtime_task_profile(&rewrite_request);
    assert_eq!(rewrite_profile.kind, "prompt_rewrite");
    assert_eq!(rewrite_profile.source, "turn_purpose");
    assert_eq!(
        rewrite_profile.service_model_slot.as_deref(),
        Some("prompt_rewrite")
    );
}

#[test]
fn runtime_task_profile_maps_fast_response_to_responsive_chat_slot() {
    let request = AsterChatRequest {
        message: "只回答一个字：好".to_string(),
        session_id: "session-1".to_string(),
        event_name: "agent-event".to_string(),
        images: None,
        provider_config: None,
        provider_preference: None,
        model_preference: None,
        reasoning_effort: None,
        thinking_enabled: None,
        approval_policy: None,
        sandbox_policy: None,
        project_id: None,
        workspace_id: "workspace-1".to_string(),
        web_search: None,
        search_mode: None,
        execution_strategy: None,
        auto_continue: None,
        system_prompt: None,
        metadata: Some(serde_json::json!({
            "harness": {
                "fast_response_routing": {
                    "mode": "auto",
                    "service_model_slot": "responsive_chat",
                    "routing_slot": "responsive_chat_model"
                }
            }
        })),
        turn_id: None,
        queue_if_busy: None,
        queued_turn_id: None,
    };

    let profile = build_runtime_task_profile(&request);

    assert_eq!(profile.kind, "chat");
    assert_eq!(profile.source, "fast_response_routing");
    assert_eq!(
        profile.service_model_slot.as_deref(),
        Some("responsive_chat")
    );
    assert_eq!(
        profile.routing_slot.as_deref(),
        Some("responsive_chat_model")
    );
    assert!(profile
        .traits
        .iter()
        .any(|value| value == "fast_response_routing"));
}

#[test]
fn fast_response_fallback_preference_reads_workspace_selection() {
    let metadata = serde_json::json!({
        "harness": {
            "fast_response_routing": {
                "service_model_slot": "responsive_chat",
                "routing_slot": "responsive_chat_model",
                "fallback_provider_preference": "deepseek",
                "fallback_model_preference": "deepseek-v4-pro"
            }
        }
    });

    let preference =
        extract_fast_response_fallback_preference(Some(&metadata)).expect("fallback preference");

    assert_eq!(preference.provider_selector, "deepseek");
    assert_eq!(preference.model_name, "deepseek-v4-pro");
}

#[test]
fn fast_response_custom_fallback_selection_locks_current_provider_and_model() {
    let custom_preference = FastResponseFallbackPreference {
        provider_selector: "custom-cb381b4f-d2fa-4eff-ba22-c867c38ba8d3".to_string(),
        model_name: "gpt-5.5".to_string(),
    };
    let builtin_preference = FastResponseFallbackPreference {
        provider_selector: "deepseek".to_string(),
        model_name: "deepseek-v4-flash".to_string(),
    };
    let task_profile = lime_agent::SessionExecutionRuntimeTaskProfile {
        kind: "chat".to_string(),
        source: "fast_response_routing".to_string(),
        traits: vec!["fast_response_routing".to_string()],
        modality_contract_key: None,
        routing_slot: Some("responsive_chat_model".to_string()),
        execution_profile_key: None,
        executor_adapter_key: None,
        executor_kind: None,
        executor_binding_key: None,
        permission_profile_keys: Vec::new(),
        user_lock_policy: None,
        service_model_slot: Some("responsive_chat".to_string()),
        scene_kind: None,
        scene_skill_id: None,
        entry_source: None,
    };

    assert!(should_lock_fast_response_fallback_selection(
        &custom_preference
    ));
    assert!(!should_lock_fast_response_fallback_selection(
        &builtin_preference
    ));
    assert!(honors_explicit_model_lock_with_capability_check(
        &task_profile,
        RequestPreferenceSource::FastResponseFallback
    ));
}

#[test]
fn runtime_task_profile_marks_oem_runtime_from_harness_oem_routing() {
    let request = AsterChatRequest {
        message: "继续处理".to_string(),
        session_id: "session-1".to_string(),
        event_name: "agent-event".to_string(),
        images: None,
        provider_config: None,
        provider_preference: None,
        model_preference: None,
        reasoning_effort: None,
        thinking_enabled: None,
        approval_policy: None,
        sandbox_policy: None,
        project_id: None,
        workspace_id: "workspace-1".to_string(),
        web_search: None,
        search_mode: None,
        execution_strategy: None,
        auto_continue: None,
        system_prompt: None,
        metadata: Some(serde_json::json!({
            "harness": {
                "oem_routing": {
                    "tenant_id": "tenant-1",
                    "provider_source": "oem_cloud",
                    "provider_key": "lime-hub",
                    "config_mode": "managed",
                    "offer_state": "available_quota_low",
                    "quota_status": "low",
                    "fallback_to_local_allowed": false,
                }
            }
        })),
        turn_id: None,
        queue_if_busy: None,
        queued_turn_id: None,
    };

    let profile = build_runtime_task_profile(&request);
    let oem_routing = resolve_request_oem_routing_context(request.metadata.as_ref());

    assert!(profile.traits.iter().any(|value| value == "oem_runtime"));
    assert!(request_oem_routing_is_locked(oem_routing.as_ref()));
    assert_eq!(
        build_request_oem_limit_event(oem_routing.as_ref()),
        Some(lime_agent::SessionExecutionRuntimeLimitEvent {
            event_kind: "quota_low".to_string(),
            message: "OEM 云端 provider lime-hub 当前额度偏低，后续请求可能触发配额风险。"
                .to_string(),
            retryable: true,
        })
    );
}

#[test]
fn runtime_task_profile_merges_modality_execution_profile_from_runtime_contract() {
    let request = AsterChatRequest {
        message: "打开这个页面并检查登录态".to_string(),
        session_id: "session-1".to_string(),
        event_name: "agent-event".to_string(),
        images: None,
        provider_config: None,
        provider_preference: None,
        model_preference: None,
        reasoning_effort: None,
        thinking_enabled: None,
        approval_policy: None,
        sandbox_policy: None,
        project_id: None,
        workspace_id: "workspace-1".to_string(),
        web_search: None,
        search_mode: None,
        execution_strategy: None,
        auto_continue: None,
        system_prompt: None,
        metadata: Some(serde_json::json!({
            "harness": {
                "browser_assist": {
                    "runtime_contract": {
                        "contract_key": "browser_control",
                        "routing_slot": "browser_reasoning_model",
                        "execution_profile": {
                            "profile_key": "browser_control_profile"
                        },
                        "executor_adapter": {
                            "adapter_key": "browser:browser_assist"
                        },
                        "executor_binding": {
                            "executor_kind": "browser",
                            "binding_key": "browser_assist"
                        }
                    }
                }
            }
        })),
        turn_id: None,
        queue_if_busy: None,
        queued_turn_id: None,
    };

    let profile = build_runtime_task_profile(&request);

    assert_eq!(profile.kind, "chat");
    assert_eq!(
        profile.modality_contract_key.as_deref(),
        Some("browser_control")
    );
    assert_eq!(
        profile.routing_slot.as_deref(),
        Some("browser_reasoning_model")
    );
    assert_eq!(
        profile.execution_profile_key.as_deref(),
        Some("browser_control_profile")
    );
    assert_eq!(
        profile.executor_adapter_key.as_deref(),
        Some("browser:browser_assist")
    );
    assert_eq!(profile.executor_kind.as_deref(), Some("browser"));
    assert_eq!(
        profile.executor_binding_key.as_deref(),
        Some("browser_assist")
    );
    assert_eq!(
        profile.permission_profile_keys,
        vec![
            "browser_control".to_string(),
            "web_search".to_string(),
            "ask_user_question".to_string()
        ]
    );
    assert_eq!(
        profile.user_lock_policy.as_deref(),
        Some("honor_explicit_model_lock_with_capability_check")
    );
    assert!(profile
        .traits
        .iter()
        .any(|value| value == "modality_runtime_contract"));
    assert!(profile
        .traits
        .iter()
        .any(|value| value == "execution_profile"));
    assert!(profile
        .traits
        .iter()
        .any(|value| value == "executor_adapter"));
}

#[test]
fn runtime_permission_state_summarizes_declared_profile_keys_without_blocking() {
    let task_profile = lime_agent::SessionExecutionRuntimeTaskProfile {
        kind: "browser_control".to_string(),
        source: "browser_assist".to_string(),
        traits: vec!["modality_runtime_contract".to_string()],
        modality_contract_key: Some("browser_control".to_string()),
        routing_slot: Some("browser_reasoning_model".to_string()),
        execution_profile_key: Some("browser_control_profile".to_string()),
        executor_adapter_key: Some("browser:browser_assist".to_string()),
        executor_kind: Some("browser".to_string()),
        executor_binding_key: Some("browser_assist".to_string()),
        permission_profile_keys: vec![
            "browser_control".to_string(),
            "web_search".to_string(),
            "ask_user_question".to_string(),
            "browser_control".to_string(),
        ],
        user_lock_policy: Some("honor_explicit_model_lock_with_capability_check".to_string()),
        service_model_slot: None,
        scene_kind: None,
        scene_skill_id: None,
        entry_source: None,
    };

    let permission_state = build_permission_state(&task_profile, None);

    assert_eq!(permission_state.status, "requires_confirmation");
    assert_eq!(
        permission_state.required_profile_keys,
        vec![
            "browser_control".to_string(),
            "web_search".to_string(),
            "ask_user_question".to_string()
        ]
    );
    assert_eq!(
        permission_state.ask_profile_keys,
        vec!["browser_control".to_string(), "web_search".to_string()]
    );
    assert!(permission_state.blocking_profile_keys.is_empty());
    assert_eq!(
        permission_state.decision_scope,
        "declared_permission_profiles_only"
    );
    assert_eq!(
        permission_state.confirmation_status.as_deref(),
        Some("not_requested")
    );
    assert!(permission_state.confirmation_request_id.is_none());
    assert_eq!(
        permission_state.confirmation_source.as_deref(),
        Some("declared_profile_only")
    );
}

#[test]
fn runtime_permission_state_full_access_resolves_declared_profiles_without_extra_confirmation() {
    let task_profile = lime_agent::SessionExecutionRuntimeTaskProfile {
        kind: "image_generation".to_string(),
        source: "image_skill_launch".to_string(),
        traits: vec!["modality_runtime_contract".to_string()],
        modality_contract_key: Some("image_generation".to_string()),
        routing_slot: Some("image_generation_model".to_string()),
        execution_profile_key: Some("image_generation_profile".to_string()),
        executor_adapter_key: Some("skill:image_generate".to_string()),
        executor_kind: Some("skill".to_string()),
        executor_binding_key: Some("image_generate".to_string()),
        permission_profile_keys: vec![
            "write_artifacts".to_string(),
            "media_upload".to_string(),
            "ask_user_question".to_string(),
        ],
        user_lock_policy: None,
        service_model_slot: None,
        scene_kind: None,
        scene_skill_id: None,
        entry_source: None,
    };

    let permission_state = build_permission_state(
        &task_profile,
        Some(lime_agent::SessionExecutionRuntimeAccessMode::FullAccess),
    );

    assert_eq!(permission_state.status, "declared_only");
    assert_eq!(
        permission_state.required_profile_keys,
        vec![
            "write_artifacts".to_string(),
            "media_upload".to_string(),
            "ask_user_question".to_string(),
        ]
    );
    assert!(permission_state.ask_profile_keys.is_empty());
    assert_eq!(
        permission_state.decision_scope,
        "declared_permission_profiles_resolved_by_full_access"
    );
    assert_eq!(
        permission_state.confirmation_status.as_deref(),
        Some("resolved")
    );
    assert_eq!(
        permission_state.confirmation_source.as_deref(),
        Some("access_mode_full_access")
    );
    assert!(permission_state
        .notes
        .iter()
        .any(|note| note.contains("full-access")));
}

#[test]
fn explicit_provider_config_resolution_reports_single_candidate_routing() {
    let task_profile = lime_agent::SessionExecutionRuntimeTaskProfile {
        kind: "chat".to_string(),
        source: "default_chat".to_string(),
        traits: Vec::new(),
        modality_contract_key: None,
        routing_slot: None,
        execution_profile_key: None,
        executor_adapter_key: None,
        executor_kind: None,
        executor_binding_key: None,
        permission_profile_keys: Vec::new(),
        user_lock_policy: None,
        service_model_slot: None,
        scene_kind: None,
        scene_skill_id: None,
        entry_source: None,
    };
    let base_decision = build_routing_decision(
        &task_profile,
        "provider_config",
        "请求已显式传入 provider_config，运行时仅补齐能力与工具策略。".to_string(),
        None,
        Some("openai".to_string()),
        Some("gpt-5.4-mini".to_string()),
        None,
    );

    let resolved = lime_agent::SessionExecutionRuntimeRoutingDecision {
        routing_mode: "single_candidate".to_string(),
        selected_provider: Some("openai".to_string()),
        selected_model: Some("gpt-5.4-mini".to_string()),
        candidate_count: 1,
        estimated_cost_class: Some("low".to_string()),
        ..base_decision
    };

    assert_eq!(resolved.routing_mode, "single_candidate");
    assert_eq!(resolved.candidate_count, 1);
    assert_eq!(resolved.selected_provider.as_deref(), Some("openai"));
    assert_eq!(resolved.selected_model.as_deref(), Some("gpt-5.4-mini"));
}

#[test]
fn build_cost_state_should_capture_pricing_snapshot() {
    let selection = ResolvedRuntimeProviderSelection {
        provider_config: ConfigureProviderRequest {
            provider_id: Some("openai".to_string()),
            provider_name: "openai".to_string(),
            model_name: "gpt-5.4-mini".to_string(),
            api_key: None,
            base_url: None,
            model_capabilities: None,
            tool_call_strategy: None,
            toolshim_model: None,
        },
        provider_selector: "openai".to_string(),
        requested_model: "gpt-5.4-mini".to_string(),
        resolved_model: "gpt-5.4-mini".to_string(),
        candidate_count: 1,
        estimated_cost_class: Some("low".to_string()),
        pricing: Some(ModelPricing {
            input_per_million: Some(0.8),
            output_per_million: Some(3.2),
            cache_read_per_million: Some(0.08),
            cache_write_per_million: Some(1.0),
            currency: "USD".to_string(),
        }),
        capability_gap: None,
        capability_gap_source: None,
        fallback_chain: Vec::new(),
    };

    let cost_state = build_cost_state(Some(&selection), None, "estimated");

    assert_eq!(cost_state.status, "estimated");
    assert_eq!(cost_state.estimated_cost_class.as_deref(), Some("low"));
    assert_eq!(cost_state.input_per_million, Some(0.8));
    assert_eq!(cost_state.output_per_million, Some(3.2));
    assert_eq!(cost_state.cache_read_per_million, Some(0.08));
    assert_eq!(cost_state.cache_write_per_million, Some(1.0));
    assert_eq!(cost_state.currency.as_deref(), Some("USD"));
    assert!(cost_state.estimated_total_cost.is_none());
}

#[test]
fn runtime_provider_strategy_prefers_manual_mode_for_credentialless_local_provider() {
    let context = ProviderResolutionContext {
        provider_selector: "ollama".to_string(),
        aster_provider_name: "ollama".to_string(),
        compatibility_provider_key: "ollama".to_string(),
        registry_provider_ids: vec!["ollama".to_string()],
        alias_key: "ollama".to_string(),
        custom_models: vec![],
        is_custom_provider: false,
        provider_type: Some(ApiProviderType::Ollama),
        provider_group: Some(ProviderGroup::Local),
        configured_api_host: Some(TEST_LOCAL_OLLAMA_BASE_URL.to_string()),
        has_credentials: false,
    };

    assert_eq!(
        resolve_runtime_provider_configuration_strategy(&context),
        RuntimeProviderConfigurationStrategy::Manual {
            base_url: Some(TEST_LOCAL_OLLAMA_BASE_URL.to_string()),
        }
    );
}

#[test]
fn normalize_runtime_provider_base_url_strips_ollama_v1_suffix() {
    assert_eq!(
        normalize_runtime_provider_base_url(
            Some(ApiProviderType::Ollama),
            Some(format!("{TEST_LOCAL_OLLAMA_BASE_URL}/v1/")),
        ),
        Some(TEST_LOCAL_OLLAMA_BASE_URL.to_string())
    );
}

#[test]
fn canonical_provider_selector_maps_legacy_mimo_ids() {
    assert_eq!(canonical_provider_selector("mimo"), "xiaomi");
    assert_eq!(canonical_provider_selector("xiaomimimo"), "xiaomi");
    assert_eq!(canonical_provider_selector("xiaomi"), "xiaomi");
}
