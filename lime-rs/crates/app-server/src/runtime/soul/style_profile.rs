use lime_core::config::MemorySoulStyleIntensity;
use serde_json::{json, Value};
use std::sync::OnceLock;

use super::style_pack_registry::load_installed_style_profile_seeds;

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

#[derive(Clone, Debug)]
pub(super) struct StyleProfileSeed {
    pub(super) id: String,
    pub(super) pack_id: String,
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
    profile_id: Option<&str>,
    intensity: Option<&MemorySoulStyleIntensity>,
) -> ResolvedStyleProfile {
    let requested_profile_id = profile_id
        .map(str::trim)
        .filter(|id| !id.is_empty())
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

fn find_style_profile_seed(profile_id: &str) -> Option<StyleProfileSeed> {
    built_in_style_profile_seeds()
        .iter()
        .find(|profile| profile.id == profile_id)
        .cloned()
        .or_else(|| {
            load_installed_style_profile_seeds()
                .into_iter()
                .find(|profile| profile.id == profile_id)
        })
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
    style_profile_seeds_from_pack_source_result(source, StylePackSourceMode::BuiltIn)
        .expect("parse built-in Soul style pack")
}

pub(super) fn installed_style_profile_seeds_from_manifest_source(
    source: &str,
) -> Result<Vec<StyleProfileSeed>, String> {
    style_profile_seeds_from_pack_source_result(source, StylePackSourceMode::Installed)
}

#[derive(Clone, Copy)]
enum StylePackSourceMode {
    BuiltIn,
    Installed,
}

fn style_profile_seeds_from_pack_source_result(
    source: &str,
    source_mode: StylePackSourceMode,
) -> Result<Vec<StyleProfileSeed>, String> {
    let manifest: Value = serde_json::from_str(source)
        .map_err(|error| format!("parse Soul style pack manifest: {error}"))?;
    let pack_id = required_string_result(&manifest, "id")?;
    let source = required_string_result(&manifest, "source")?;
    match source_mode {
        StylePackSourceMode::BuiltIn if source != "built_in" => {
            return Err("Soul style pack source must be built_in".to_string());
        }
        StylePackSourceMode::Installed
            if source != "local_import" && source != "cloud_download" =>
        {
            return Err(
                "Installed Soul style pack source must be local_import or cloud_download"
                    .to_string(),
            );
        }
        _ => {}
    }
    if matches!(source_mode, StylePackSourceMode::Installed) {
        let digest = manifest
            .get("integrity")
            .and_then(|value| value.get("digest"))
            .and_then(Value::as_str)
            .filter(|text| !text.trim().is_empty());
        if digest.is_none() {
            return Err("Installed Soul style pack must include integrity.digest".to_string());
        }
    }
    let schema_version = manifest
        .get("compatibility")
        .and_then(|value| value.get("schemaVersion"))
        .and_then(Value::as_i64)
        .ok_or_else(|| "Soul style pack schemaVersion".to_string())?;
    if schema_version != 1 {
        return Err("Soul style pack schemaVersion must remain 1".to_string());
    }

    let profiles = manifest
        .get("profiles")
        .and_then(Value::as_array)
        .ok_or_else(|| "Soul style pack profiles".to_string())?;
    if profiles.is_empty() {
        return Err("Soul style pack profiles cannot be empty".to_string());
    }

    profiles
        .iter()
        .map(|profile| style_profile_seed_from_manifest_profile(&pack_id, profile))
        .collect()
}

fn style_profile_seed_from_manifest_profile(
    pack_id: &str,
    profile: &Value,
) -> Result<StyleProfileSeed, String> {
    let profile_pack_id = required_string_result(profile, "packId")?;
    if profile_pack_id != pack_id {
        return Err("Soul style profile packId must match pack manifest id".to_string());
    }

    Ok(StyleProfileSeed {
        id: required_string_result(profile, "id")?,
        pack_id: profile_pack_id,
        tone: required_string_result(profile, "tone")?,
        scopes: required_string_array_result(profile, "scopes")?,
        response_contract: required_string_array_result(profile, "responseContract")?,
        voice_primitives: required_string_array_result(profile, "voicePrimitives")?,
        surface_contracts: surface_contract_lines(
            profile
                .get("surfaceContracts")
                .ok_or_else(|| "Soul style profile surfaceContracts".to_string())?,
        )?,
        allowed_moves: required_string_array_result(profile, "allowedMoves")?,
        forbidden_moves: required_string_array_result(profile, "forbiddenMoves")?,
        anti_repetition_rules: required_string_array_result(profile, "antiRepetitionRules")?,
        few_shot_anchors: few_shot_anchor_lines(
            profile
                .get("fewShotAnchors")
                .ok_or_else(|| "Soul style profile fewShotAnchors".to_string())?,
        )?,
        default_use_cases: required_string_array_result(profile, "defaultUseCases")?,
        risk_fallback_profile_id: profile
            .get("riskFallback")
            .map(|fallback| required_string_result(fallback, "profileId"))
            .ok_or_else(|| "Soul style profile riskFallback".to_string())??,
        risk_fallback_triggers: profile
            .get("riskFallback")
            .map(|fallback| required_string_array_result(fallback, "triggers"))
            .ok_or_else(|| "Soul style profile riskFallback triggers".to_string())??,
        serious_mode_fallback: required_string_result(profile, "seriousModeFallback")?,
    })
}

fn required_string_result(value: &Value, key: &str) -> Result<String, String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .filter(|text| !text.trim().is_empty())
        .map(str::to_string)
        .ok_or_else(|| format!("Soul style manifest missing string field `{key}`"))
}

fn required_string_array_result(value: &Value, key: &str) -> Result<Vec<String>, String> {
    let values = value
        .get(key)
        .and_then(Value::as_array)
        .ok_or_else(|| format!("Soul style manifest missing array field `{key}`"))?;
    let result: Result<Vec<String>, String> = values
        .iter()
        .map(|item| {
            item.as_str()
                .filter(|text| !text.trim().is_empty())
                .map(str::to_string)
                .ok_or_else(|| {
                    format!("Soul style manifest array `{key}` contains a non-string item")
                })
        })
        .collect();
    let result = result?;
    if result.is_empty() {
        return Err(format!("Soul style manifest array `{key}` cannot be empty"));
    }
    Ok(result)
}

fn surface_contract_lines(value: &Value) -> Result<Vec<String>, String> {
    let object = value
        .as_object()
        .ok_or_else(|| "Soul style surfaceContracts must be an object".to_string())?;
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
            .ok_or_else(|| format!("Soul style surfaceContracts missing `{surface}`"))?;
        for rule in rules {
            let rule = rule
                .as_str()
                .filter(|text| !text.trim().is_empty())
                .ok_or_else(|| {
                    format!("Soul style surfaceContracts `{surface}` contains non-string rule")
                })?;
            lines.push(format!("{surface}: {rule}"));
        }
    }
    Ok(lines)
}

fn few_shot_anchor_lines(value: &Value) -> Result<Vec<String>, String> {
    let anchors = value
        .as_array()
        .ok_or_else(|| "Soul style fewShotAnchors must be an array".to_string())?;
    let lines: Result<Vec<String>, String> = anchors
        .iter()
        .map(|anchor| {
            let surface = required_string_result(anchor, "surface")?;
            let intent = required_string_result(anchor, "intent")?;
            let example = required_string_result(anchor, "example")?;
            Ok(format!("{surface} / {intent}: {example}"))
        })
        .collect();
    let lines = lines?;
    if lines.is_empty() {
        return Err("Soul style fewShotAnchors cannot be empty".to_string());
    }
    Ok(lines)
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
        let profiles = built_in_style_profile_seeds();

        for profile_seed in profiles {
            let profile = resolve_style_profile(Some(profile_seed.id.as_str()), None);
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
        let profiles = built_in_style_profile_seeds();

        for profile_seed in profiles {
            let profile = resolve_style_profile(Some(profile_seed.id.as_str()), None);
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
            for profile_seed in profiles {
                let profile = resolve_style_profile(Some(profile_seed.id.as_str()), None);
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
            Some("cool_confident_operator"),
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

    #[test]
    fn unresolved_profile_id_falls_back_to_default_without_alias_mapping() {
        let profile = resolve_style_profile(Some("sassy_cute_executor"), None);

        assert_eq!(profile.id, DEFAULT_STYLE_PROFILE_ID);
        assert_ne!(profile.id, "sassy_cute_executor");
    }
}
