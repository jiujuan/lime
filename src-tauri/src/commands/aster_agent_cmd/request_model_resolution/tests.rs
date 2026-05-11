use super::responsive_chat::{
    can_use_responsive_chat_provider, choose_responsive_chat_model_from_catalog,
    is_responsive_chat_unsupported_model_error, responsive_chat_auto_candidate_sort,
    responsive_chat_running_sample_is_stale, ResponsiveChatAutoCandidate,
    ResponsiveChatAutoLatencyHint,
};
use super::*;
use lime_core::database::dao::api_key_provider::{
    ApiKeyEntry, ApiKeyProvider, ApiProviderType, ProviderGroup, ProviderWithKeys,
};

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
            "gpt-5.4-mini",
            Some("gpt-5.4"),
            false,
            false,
            true,
            ModelTier::Mini,
            Some("2026-01-01"),
        ),
        build_model(
            "gpt-5.4",
            Some("gpt-5.4"),
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
        resolve_vision_model_id("gpt-5.4-mini", &models).unwrap(),
        "gpt-5.4"
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
        configured_api_host: Some("https://api.openai.com/v1".to_string()),
        has_credentials: true,
    };

    assert_eq!(
        resolve_provider_model_compatibility(&context, "gpt-5.3-codex"),
        "gpt-5.2-codex"
    );
}

#[test]
fn xiaomi_compatibility_canonicalizes_display_name_and_legacy_alias() {
    let context = ProviderResolutionContext {
        provider_selector: "custom-mimo".to_string(),
        aster_provider_name: "anthropic".to_string(),
        compatibility_provider_key: "anthropic-compatible".to_string(),
        registry_provider_ids: vec!["xiaomi".to_string()],
        alias_key: "custom-mimo".to_string(),
        custom_models: vec![],
        is_custom_provider: true,
        provider_type: Some(ApiProviderType::AnthropicCompatible),
        provider_group: None,
        configured_api_host: Some("https://token-plan-cn.xiaomimimo.com/anthropic".to_string()),
        has_credentials: true,
    };

    assert_eq!(
        resolve_provider_model_compatibility(&context, "MiMo-V2.5-Pro"),
        "mimo-v2.5-pro"
    );
    assert_eq!(
        resolve_provider_model_compatibility(&context, "mimo-v2-pro"),
        "mimo-v2.5-pro"
    );
    assert_eq!(
        canonicalize_provider_custom_models(
            &context,
            &[
                "MiMo-V2.5-Pro".to_string(),
                "mimo-v2-pro".to_string(),
                "mimo-v2-flash".to_string(),
            ],
        ),
        vec!["mimo-v2.5-pro".to_string(), "mimo-v2-flash".to_string()]
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
        "Request failed: Bad request (400): Not supported model mimo-v2-flash"
    )));
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
    let provider =
        build_provider_with_key("fal", ApiProviderType::Openai, "https://fal.run/fal-ai");

    assert!(!can_use_responsive_chat_provider(&provider));

    let fal_typed_provider =
        build_provider_with_key("custom-media", ApiProviderType::Fal, "https://fal.run");
    assert!(!can_use_responsive_chat_provider(&fal_typed_provider));

    let codex_provider = build_provider_with_key(
        "custom-codex",
        ApiProviderType::Codex,
        "https://api.example.com",
    );
    assert!(!can_use_responsive_chat_provider(&codex_provider));

    let coding_provider = build_provider_with_key(
        "kimi-coding",
        ApiProviderType::AnthropicCompatible,
        "https://api.kimi.com/coding",
    );
    assert!(!can_use_responsive_chat_provider(&coding_provider));
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
            "https://api.example.com/v1",
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
            "gpt-5.4-mini",
            Some("gpt-5.4"),
            false,
            false,
            true,
            ModelTier::Mini,
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

    assert_eq!(
        choose_best_multi_candidate_model("gpt-5.4-mini", &models, false, true, &[]).as_deref(),
        Some("gpt-5.4")
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
        provider_selector: "custom-mimo".to_string(),
        aster_provider_name: "anthropic".to_string(),
        compatibility_provider_key: "anthropic-compatible".to_string(),
        registry_provider_ids: vec!["xiaomi".to_string()],
        alias_key: "custom-mimo".to_string(),
        custom_models: vec!["mimo-v2.5-pro".to_string(), "mimo-v2-flash".to_string()],
        is_custom_provider: true,
        provider_type: Some(ApiProviderType::AnthropicCompatible),
        provider_group: None,
        configured_api_host: Some("https://token-plan-cn.xiaomimimo.com/anthropic".to_string()),
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
        configured_api_host: Some("https://api.deepseek.com".to_string()),
        has_credentials: true,
    };

    assert!(!should_auto_reselect_multi_candidate_model(&context));
}

#[test]
fn xiaomi_permission_recovery_prefers_non_flash_candidate() {
    let context = ProviderResolutionContext {
        provider_selector: "custom-mimo".to_string(),
        aster_provider_name: "anthropic".to_string(),
        compatibility_provider_key: "anthropic-compatible".to_string(),
        registry_provider_ids: vec!["xiaomi".to_string()],
        alias_key: "custom-mimo".to_string(),
        custom_models: vec!["mimo-v2.5-pro".to_string(), "mimo-v2-flash".to_string()],
        is_custom_provider: true,
        provider_type: Some(ApiProviderType::AnthropicCompatible),
        provider_group: None,
        configured_api_host: Some("https://token-plan-cn.xiaomimimo.com/anthropic".to_string()),
        has_credentials: true,
    };
    let models = vec![
        build_model(
            "mimo-v2.5-pro",
            Some("mimo-v2"),
            false,
            false,
            true,
            ModelTier::Pro,
            Some("2026-04-01"),
        ),
        build_model(
            "mimo-v2-flash",
            Some("mimo-v2"),
            false,
            false,
            true,
            ModelTier::Mini,
            Some("2026-04-02"),
        ),
    ];

    assert_eq!(
        choose_provider_permission_recovery_model(&context, "mimo-v2-flash", &models, false, false)
            .as_deref(),
        Some("mimo-v2.5-pro")
    );
}

#[test]
fn permission_recovery_prefers_configured_model_for_system_provider() {
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
        configured_api_host: Some("https://api.deepseek.com".to_string()),
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
        choose_provider_permission_recovery_model(&context, "gpt-5.5", &models, false, false)
            .as_deref(),
        Some("deepseek-chat")
    );
}

#[test]
fn permission_recovery_falls_back_to_known_openai_fast_model() {
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
        choose_provider_permission_recovery_model(&context, "gpt-4o", &models, false, false)
            .as_deref(),
        Some("gpt-4o-mini")
    );
}

#[test]
fn permission_recovery_can_use_uncataloged_configured_model() {
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
        configured_api_host: Some("https://api.siliconflow.cn/v1".to_string()),
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
        choose_provider_permission_recovery_model(&context, "gpt-5.5", &models, false, false)
            .as_deref(),
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
fn runtime_task_profile_marks_oem_runtime_from_harness_oem_routing() {
    let request = AsterChatRequest {
        message: "继续处理".to_string(),
        session_id: "session-1".to_string(),
        event_name: "agent-event".to_string(),
        images: None,
        provider_config: None,
        provider_preference: None,
        model_preference: None,
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
        configured_api_host: Some("http://127.0.0.1:11434".to_string()),
        has_credentials: false,
    };

    assert_eq!(
        resolve_runtime_provider_configuration_strategy(&context),
        RuntimeProviderConfigurationStrategy::Manual {
            base_url: Some("http://127.0.0.1:11434".to_string()),
        }
    );
}

#[test]
fn normalize_runtime_provider_base_url_strips_ollama_v1_suffix() {
    assert_eq!(
        normalize_runtime_provider_base_url(
            Some(ApiProviderType::Ollama),
            Some("http://127.0.0.1:11434/v1/".to_string()),
        ),
        Some("http://127.0.0.1:11434".to_string())
    );
}

#[test]
fn canonical_provider_selector_maps_legacy_mimo_ids() {
    assert_eq!(canonical_provider_selector("mimo"), "xiaomi");
    assert_eq!(canonical_provider_selector("xiaomimimo"), "xiaomi");
    assert_eq!(canonical_provider_selector("xiaomi"), "xiaomi");
}
