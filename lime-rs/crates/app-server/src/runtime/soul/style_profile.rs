use lime_core::config::{MemorySoulStyleIntensity, MemorySoulStyleProfileId};
use serde_json::{json, Value};
use std::sync::OnceLock;

pub(crate) const DEFAULT_STYLE_PROFILE_ID: &str = "cheeky_sassy_executor";
pub(crate) const SERIOUS_STYLE_PROFILE_ID: &str = "calm_professional_partner";
const DEFAULT_STYLE_INTENSITY: &str = "low";

const BUILT_IN_STYLE_PACK_SOURCES: [&str; 4] = [
    include_str!("../../../../../../src/lib/soul/style-profiles/packs/cheeky-sassy-executor.json"),
    include_str!(
        "../../../../../../src/lib/soul/style-profiles/packs/warm-supportive-companion.json"
    ),
    include_str!(
        "../../../../../../src/lib/soul/style-profiles/packs/cool-confident-operator.json"
    ),
    include_str!(
        "../../../../../../src/lib/soul/style-profiles/packs/calm-professional-partner.json"
    ),
];

#[derive(Clone)]
struct StyleProfileSeed {
    id: String,
    pack_id: String,
    tone: String,
    scopes: Vec<String>,
    response_contract: Vec<String>,
    voice_primitives: Vec<String>,
    surface_contracts: Vec<String>,
    allowed_moves: Vec<String>,
    forbidden_moves: Vec<String>,
    anti_repetition_rules: Vec<String>,
    few_shot_anchors: Vec<String>,
    default_use_cases: Vec<String>,
    risk_fallback_profile_id: String,
    risk_fallback_triggers: Vec<String>,
    serious_mode_fallback: String,
}

pub(crate) struct ResolvedStyleProfile {
    pub(crate) id: String,
    pub(crate) pack_id: String,
    pub(crate) tone: String,
    pub(crate) intensity: String,
    pub(crate) scopes: Vec<String>,
    pub(crate) response_contract: Vec<String>,
    pub(crate) voice_primitives: Vec<String>,
    pub(crate) surface_contracts: Vec<String>,
    pub(crate) allowed_moves: Vec<String>,
    pub(crate) forbidden_moves: Vec<String>,
    pub(crate) anti_repetition_rules: Vec<String>,
    pub(crate) few_shot_anchors: Vec<String>,
    pub(crate) default_use_cases: Vec<String>,
    pub(crate) risk_fallback_profile_id: String,
    pub(crate) risk_fallback_triggers: Vec<String>,
    pub(crate) serious_mode_fallback: String,
}

pub(crate) fn resolve_style_profile(
    profile_id: Option<&MemorySoulStyleProfileId>,
    intensity: Option<&MemorySoulStyleIntensity>,
) -> ResolvedStyleProfile {
    let requested_profile_id = profile_id
        .map(style_profile_id_as_str)
        .unwrap_or(DEFAULT_STYLE_PROFILE_ID);
    let seed = find_style_profile_seed(requested_profile_id)
        .or_else(|| find_style_profile_seed(DEFAULT_STYLE_PROFILE_ID))
        .expect("built-in Soul style registry must contain the default profile");

    ResolvedStyleProfile {
        id: seed.id.clone(),
        pack_id: seed.pack_id.clone(),
        tone: seed.tone.clone(),
        intensity: resolve_intensity(intensity),
        scopes: seed.scopes.clone(),
        response_contract: seed.response_contract.clone(),
        voice_primitives: seed.voice_primitives.clone(),
        surface_contracts: seed.surface_contracts.clone(),
        allowed_moves: seed.allowed_moves.clone(),
        forbidden_moves: seed.forbidden_moves.clone(),
        anti_repetition_rules: seed.anti_repetition_rules.clone(),
        few_shot_anchors: seed.few_shot_anchors.clone(),
        default_use_cases: seed.default_use_cases.clone(),
        risk_fallback_profile_id: seed.risk_fallback_profile_id.clone(),
        risk_fallback_triggers: seed.risk_fallback_triggers.clone(),
        serious_mode_fallback: seed.serious_mode_fallback.clone(),
    }
}

fn resolve_intensity(intensity: Option<&MemorySoulStyleIntensity>) -> String {
    match intensity {
        Some(MemorySoulStyleIntensity::Medium) => "medium".to_string(),
        Some(MemorySoulStyleIntensity::High) => "high".to_string(),
        _ => DEFAULT_STYLE_INTENSITY.to_string(),
    }
}

fn style_profile_id_as_str(profile_id: &MemorySoulStyleProfileId) -> &'static str {
    match profile_id {
        MemorySoulStyleProfileId::CheekySassyExecutor => "cheeky_sassy_executor",
        MemorySoulStyleProfileId::WarmSupportiveCompanion => "warm_supportive_companion",
        MemorySoulStyleProfileId::CoolConfidentOperator => "cool_confident_operator",
        MemorySoulStyleProfileId::CalmProfessionalPartner => "calm_professional_partner",
    }
}

fn find_style_profile_seed(profile_id: &str) -> Option<&'static StyleProfileSeed> {
    built_in_style_profile_seeds()
        .iter()
        .find(|profile| profile.id == profile_id)
}

fn built_in_style_profile_seeds() -> &'static [StyleProfileSeed] {
    static PROFILES: OnceLock<Vec<StyleProfileSeed>> = OnceLock::new();
    PROFILES.get_or_init(load_built_in_style_profile_seeds)
}

fn load_built_in_style_profile_seeds() -> Vec<StyleProfileSeed> {
    let profiles: Vec<StyleProfileSeed> = BUILT_IN_STYLE_PACK_SOURCES
        .iter()
        .flat_map(|source| style_profile_seeds_from_pack_source(source))
        .collect();

    assert!(
        profiles
            .iter()
            .any(|profile| profile.id == DEFAULT_STYLE_PROFILE_ID),
        "built-in Soul style registry is missing default profile"
    );
    assert!(
        profiles
            .iter()
            .any(|profile| profile.id == SERIOUS_STYLE_PROFILE_ID),
        "built-in Soul style registry is missing serious fallback profile"
    );

    profiles
}

fn style_profile_seeds_from_pack_source(source: &str) -> Vec<StyleProfileSeed> {
    let manifest: Value = serde_json::from_str(source).expect("parse built-in Soul style pack");
    let pack_id = required_string(&manifest, "id");
    let source = required_string(&manifest, "source");
    assert_eq!(
        source, "built_in",
        "Soul style pack source must be built_in"
    );
    let schema_version = manifest
        .get("compatibility")
        .and_then(|value| value.get("schemaVersion"))
        .and_then(Value::as_i64)
        .expect("Soul style pack schemaVersion");
    assert_eq!(
        schema_version, 1,
        "Soul style pack schemaVersion must remain 1"
    );

    let profiles = manifest
        .get("profiles")
        .and_then(Value::as_array)
        .expect("Soul style pack profiles");

    profiles
        .iter()
        .map(|profile| style_profile_seed_from_manifest_profile(&pack_id, profile))
        .collect()
}

fn style_profile_seed_from_manifest_profile(pack_id: &str, profile: &Value) -> StyleProfileSeed {
    let profile_pack_id = required_string(profile, "packId");
    assert_eq!(
        profile_pack_id, pack_id,
        "Soul style profile packId must match pack manifest id"
    );

    StyleProfileSeed {
        id: required_string(profile, "id"),
        pack_id: profile_pack_id,
        tone: required_string(profile, "tone"),
        scopes: required_string_array(profile, "scopes"),
        response_contract: required_string_array(profile, "responseContract"),
        voice_primitives: required_string_array(profile, "voicePrimitives"),
        surface_contracts: surface_contract_lines(
            profile
                .get("surfaceContracts")
                .expect("Soul style profile surfaceContracts"),
        ),
        allowed_moves: required_string_array(profile, "allowedMoves"),
        forbidden_moves: required_string_array(profile, "forbiddenMoves"),
        anti_repetition_rules: required_string_array(profile, "antiRepetitionRules"),
        few_shot_anchors: few_shot_anchor_lines(
            profile
                .get("fewShotAnchors")
                .expect("Soul style profile fewShotAnchors"),
        ),
        default_use_cases: required_string_array(profile, "defaultUseCases"),
        risk_fallback_profile_id: profile
            .get("riskFallback")
            .map(|fallback| required_string(fallback, "profileId"))
            .expect("Soul style profile riskFallback"),
        risk_fallback_triggers: profile
            .get("riskFallback")
            .map(|fallback| required_string_array(fallback, "triggers"))
            .expect("Soul style profile riskFallback triggers"),
        serious_mode_fallback: required_string(profile, "seriousModeFallback"),
    }
}

fn required_string(value: &Value, key: &str) -> String {
    value
        .get(key)
        .and_then(Value::as_str)
        .filter(|text| !text.trim().is_empty())
        .unwrap_or_else(|| panic!("Soul style manifest missing string field `{key}`"))
        .to_string()
}

fn required_string_array(value: &Value, key: &str) -> Vec<String> {
    let values = value
        .get(key)
        .and_then(Value::as_array)
        .unwrap_or_else(|| panic!("Soul style manifest missing array field `{key}`"));
    let result: Vec<String> = values
        .iter()
        .map(|item| {
            item.as_str()
                .filter(|text| !text.trim().is_empty())
                .unwrap_or_else(|| {
                    panic!("Soul style manifest array `{key}` contains a non-string item")
                })
                .to_string()
        })
        .collect();
    assert!(
        !result.is_empty(),
        "Soul style manifest array `{key}` cannot be empty"
    );
    result
}

fn surface_contract_lines(value: &Value) -> Vec<String> {
    let object = value
        .as_object()
        .expect("Soul style surfaceContracts must be an object");
    let mut lines = Vec::new();
    for surface in [
        "before_tool",
        "tool_running",
        "after_tool_success",
        "after_tool_partial_failure",
        "after_tool_failure",
        "body_detail",
        "closing_suggestion",
    ] {
        let rules = object
            .get(surface)
            .and_then(Value::as_array)
            .unwrap_or_else(|| panic!("Soul style surfaceContracts missing `{surface}`"));
        for rule in rules {
            let rule = rule
                .as_str()
                .filter(|text| !text.trim().is_empty())
                .unwrap_or_else(|| {
                    panic!("Soul style surfaceContracts `{surface}` contains non-string rule")
                });
            lines.push(format!("{surface}: {rule}"));
        }
    }
    lines
}

fn few_shot_anchor_lines(value: &Value) -> Vec<String> {
    let anchors = value
        .as_array()
        .expect("Soul style fewShotAnchors must be an array");
    let lines: Vec<String> = anchors
        .iter()
        .map(|anchor| {
            let surface = required_string(anchor, "surface");
            let intent = required_string(anchor, "intent");
            let example = required_string(anchor, "example");
            format!("{surface} / {intent}: {example}")
        })
        .collect();
    assert!(
        !lines.is_empty(),
        "Soul style fewShotAnchors cannot be empty"
    );
    lines
}

impl ResolvedStyleProfile {
    pub(crate) fn as_context_value(&self) -> Value {
        json!({
            "id": self.id,
            "packId": self.pack_id,
            "tone": self.tone,
            "intensity": self.intensity,
            "scopes": self.scopes,
            "responseContract": self.response_contract,
            "voicePrimitives": self.voice_primitives,
            "surfaceContracts": self.surface_contracts,
            "allowedMoves": self.allowed_moves,
            "forbiddenMoves": self.forbidden_moves,
            "antiRepetitionRules": self.anti_repetition_rules,
            "fewShotAnchors": self.few_shot_anchors,
            "defaultUseCases": self.default_use_cases,
            "riskFallback": {
                "profileId": self.risk_fallback_profile_id,
                "triggers": self.risk_fallback_triggers,
            },
            "seriousModeFallback": self.serious_mode_fallback,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeSet;

    const TRANSCRIPT_STYLE_SURFACES: [&str; 7] = [
        "before_tool:",
        "tool_running:",
        "after_tool_success:",
        "after_tool_partial_failure:",
        "after_tool_failure:",
        "body_detail:",
        "closing_suggestion:",
    ];
    const TRANSCRIPT_STYLE_ANCHOR_PREFIXES: [&str; 7] = [
        "before_tool /",
        "tool_running /",
        "after_tool_success /",
        "after_tool_partial_failure /",
        "after_tool_failure /",
        "body_detail /",
        "closing_suggestion /",
    ];

    #[test]
    fn built_in_profiles_are_loaded_from_manifest_registry() {
        let profiles = built_in_style_profile_seeds();

        assert_eq!(profiles.len(), BUILT_IN_STYLE_PACK_SOURCES.len());
        assert!(profiles
            .iter()
            .all(|profile| profile.pack_id.starts_with("com.lime.soul.")));
        assert!(!profiles
            .iter()
            .any(|profile| profile.pack_id == "com.lime.builtin.default"));
        assert!(profiles
            .iter()
            .all(|profile| !profile.response_contract.is_empty()));
    }

    #[test]
    fn built_in_profiles_cover_the_same_transcript_surface_contract() {
        let profiles = [
            MemorySoulStyleProfileId::CheekySassyExecutor,
            MemorySoulStyleProfileId::WarmSupportiveCompanion,
            MemorySoulStyleProfileId::CoolConfidentOperator,
            MemorySoulStyleProfileId::CalmProfessionalPartner,
        ];

        for profile_id in &profiles {
            let profile = resolve_style_profile(Some(profile_id), None);
            for surface in TRANSCRIPT_STYLE_SURFACES {
                assert!(
                    profile
                        .surface_contracts
                        .iter()
                        .any(|contract| contract.starts_with(surface)),
                    "{} missing {surface}",
                    profile.id
                );
            }
            assert_eq!(profile.serious_mode_fallback, SERIOUS_STYLE_PROFILE_ID);
            assert!(profile
                .risk_fallback_triggers
                .iter()
                .any(|trigger| trigger == "permission"));
        }
    }

    #[test]
    fn built_in_profiles_cover_transcript_few_shot_anchors() {
        let profiles = [
            MemorySoulStyleProfileId::CheekySassyExecutor,
            MemorySoulStyleProfileId::WarmSupportiveCompanion,
            MemorySoulStyleProfileId::CoolConfidentOperator,
            MemorySoulStyleProfileId::CalmProfessionalPartner,
        ];

        for profile_id in &profiles {
            let profile = resolve_style_profile(Some(profile_id), None);
            for prefix in TRANSCRIPT_STYLE_ANCHOR_PREFIXES {
                assert!(
                    profile
                        .few_shot_anchors
                        .iter()
                        .any(|anchor| anchor.starts_with(prefix)),
                    "{} missing anchor {prefix}",
                    profile.id
                );
            }
        }

        for prefix in TRANSCRIPT_STYLE_ANCHOR_PREFIXES {
            let mut examples = BTreeSet::new();
            for profile_id in &profiles {
                let profile = resolve_style_profile(Some(profile_id), None);
                let anchor = profile
                    .few_shot_anchors
                    .iter()
                    .find(|anchor| anchor.starts_with(prefix))
                    .expect("missing anchor");
                examples.insert(anchor.clone());
            }
            assert_eq!(
                examples.len(),
                profiles.len(),
                "{prefix} examples collapsed"
            );
        }
    }

    #[test]
    fn style_profile_context_contains_complete_transcript_surface_contract() {
        let profile = resolve_style_profile(
            Some(&MemorySoulStyleProfileId::CoolConfidentOperator),
            Some(&MemorySoulStyleIntensity::High),
        );
        let context = profile.as_context_value();
        let serialized = serde_json::to_string(&context).expect("serialize style profile");

        assert!(serialized.contains("cool_confident_operator"));
        assert!(serialized.contains("com.lime.soul.cool-confident-operator"));
        assert!(!serialized.contains("com.lime.builtin.default"));
        assert!(serialized.contains("responseContract"));
        for surface in TRANSCRIPT_STYLE_SURFACES {
            assert!(serialized.contains(surface), "missing {surface}");
        }
        for prefix in TRANSCRIPT_STYLE_ANCHOR_PREFIXES {
            assert!(serialized.contains(prefix), "missing {prefix}");
        }
        assert!(serialized.contains("calm_professional_partner"));
    }
}
