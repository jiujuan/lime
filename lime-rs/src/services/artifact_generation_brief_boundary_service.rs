//! Artifact Generation Brief 声线边界服务
//!
//! 统一维护正式产物声线默认隔离规则，避免 metadata normalize 与 prompt
//! composition 各自维护一份别名解析和默认值。

use serde_json::{Map, Value};

const DEFAULT_VOICE_SOURCE: &str = "none";
const DEFAULT_VOICE_GUARD: &str = "generation_brief_only";
const DEFAULT_GLOBAL_SOUL_SCOPE: &str = "interaction_only";
const DEFAULT_EXPERT_PERSONA_SCOPE: &str = "current_expert_session";
const DEFAULT_FORMAL_ARTIFACT_VOICE_SOURCE: &str = "generation_brief_only";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ArtifactGenerationBriefBoundary {
    pub voice_source: String,
    pub voice_guard: String,
    pub global_soul_scope: String,
    pub expert_persona_scope: String,
    pub formal_artifact_voice_source: String,
    pub inherits_global_soul: bool,
    pub inherits_expert_persona: bool,
}

impl Default for ArtifactGenerationBriefBoundary {
    fn default() -> Self {
        Self {
            voice_source: DEFAULT_VOICE_SOURCE.to_string(),
            voice_guard: DEFAULT_VOICE_GUARD.to_string(),
            global_soul_scope: DEFAULT_GLOBAL_SOUL_SCOPE.to_string(),
            expert_persona_scope: DEFAULT_EXPERT_PERSONA_SCOPE.to_string(),
            formal_artifact_voice_source: DEFAULT_FORMAL_ARTIFACT_VOICE_SOURCE.to_string(),
            inherits_global_soul: false,
            inherits_expert_persona: false,
        }
    }
}

impl ArtifactGenerationBriefBoundary {
    pub fn from_request_metadata(request_metadata: Option<&Value>) -> Option<Self> {
        let artifact = extract_artifact_object(request_metadata)?;
        let generation_brief = extract_generation_brief_object(artifact)?;
        Some(Self::from_generation_brief_object(generation_brief))
    }

    fn from_generation_brief_object(generation_brief: &Map<String, Value>) -> Self {
        Self {
            voice_source: read_voice_source_alias(generation_brief),
            voice_guard: read_string_alias(generation_brief, &["voice_guard", "voiceGuard"])
                .unwrap_or_else(|| DEFAULT_VOICE_GUARD.to_string()),
            global_soul_scope: read_string_alias(
                generation_brief,
                &["global_soul_scope", "globalSoulScope"],
            )
            .unwrap_or_else(|| DEFAULT_GLOBAL_SOUL_SCOPE.to_string()),
            expert_persona_scope: read_string_alias(
                generation_brief,
                &["expert_persona_scope", "expertPersonaScope"],
            )
            .unwrap_or_else(|| DEFAULT_EXPERT_PERSONA_SCOPE.to_string()),
            formal_artifact_voice_source: read_string_alias(
                generation_brief,
                &["formal_artifact_voice_source", "formalArtifactVoiceSource"],
            )
            .unwrap_or_else(|| DEFAULT_FORMAL_ARTIFACT_VOICE_SOURCE.to_string()),
            inherits_global_soul: read_bool_alias(
                generation_brief,
                &["inherits_global_soul", "inheritsGlobalSoul"],
            )
            .unwrap_or(false),
            inherits_expert_persona: read_bool_alias(
                generation_brief,
                &["inherits_expert_persona", "inheritsExpertPersona"],
            )
            .unwrap_or(false),
        }
    }

    fn write_into_object(&self, generation_brief: &mut Map<String, Value>) {
        generation_brief.insert(
            "voice_source".to_string(),
            Value::String(self.voice_source.clone()),
        );
        generation_brief.insert(
            "voice_guard".to_string(),
            Value::String(self.voice_guard.clone()),
        );
        generation_brief.insert(
            "global_soul_scope".to_string(),
            Value::String(self.global_soul_scope.clone()),
        );
        generation_brief.insert(
            "expert_persona_scope".to_string(),
            Value::String(self.expert_persona_scope.clone()),
        );
        generation_brief.insert(
            "formal_artifact_voice_source".to_string(),
            Value::String(self.formal_artifact_voice_source.clone()),
        );
        generation_brief.insert(
            "inherits_global_soul".to_string(),
            Value::Bool(self.inherits_global_soul),
        );
        generation_brief.insert(
            "inherits_expert_persona".to_string(),
            Value::Bool(self.inherits_expert_persona),
        );
    }
}

pub fn normalize_generation_brief_boundary_in_artifact(artifact: &mut Map<String, Value>) {
    let mut generation_brief =
        take_nested_object_alias(artifact, &["generation_brief", "generationBrief"]);
    let boundary = ArtifactGenerationBriefBoundary::from_generation_brief_object(&generation_brief);

    normalize_voice_identity_fields(&mut generation_brief, boundary.voice_source.as_str());
    remove_generation_brief_aliases(&mut generation_brief);
    boundary.write_into_object(&mut generation_brief);
    artifact.insert(
        "generation_brief".to_string(),
        Value::Object(generation_brief),
    );
}

pub fn artifact_has_generation_brief_boundary(artifact: &Map<String, Value>) -> bool {
    extract_generation_brief_object(artifact).is_some()
}

fn normalize_text(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn extract_artifact_object(
    request_metadata: Option<&Value>,
) -> Option<&serde_json::Map<String, Value>> {
    let metadata = request_metadata?;
    let object = metadata.as_object()?;
    if let Some(artifact) = object.get("artifact").and_then(Value::as_object) {
        return Some(artifact);
    }
    Some(object)
}

fn extract_generation_brief_object(
    artifact: &Map<String, Value>,
) -> Option<&serde_json::Map<String, Value>> {
    artifact
        .get("generation_brief")
        .or_else(|| artifact.get("generationBrief"))
        .and_then(Value::as_object)
}

fn read_string_alias(object: &Map<String, Value>, keys: &[&str]) -> Option<String> {
    keys.iter()
        .filter_map(|key| object.get(*key))
        .find_map(Value::as_str)
        .and_then(|value| normalize_text(Some(value)))
}

fn read_bool_alias(object: &Map<String, Value>, keys: &[&str]) -> Option<bool> {
    keys.iter()
        .filter_map(|key| object.get(*key))
        .find_map(Value::as_bool)
}

fn read_voice_source_alias(object: &Map<String, Value>) -> String {
    match read_string_alias(object, &["voice_source", "voiceSource"]).as_deref() {
        Some("creator_voice") => "creator_voice".to_string(),
        Some("brand_voice") => "brand_voice".to_string(),
        Some("none") => "none".to_string(),
        Some(_) | None => DEFAULT_VOICE_SOURCE.to_string(),
    }
}

fn normalize_voice_identity_fields(generation_brief: &mut Map<String, Value>, voice_source: &str) {
    let creator_voice_id =
        read_string_alias(generation_brief, &["creator_voice_id", "creatorVoiceId"]);
    let brand_voice_id = read_string_alias(generation_brief, &["brand_voice_id", "brandVoiceId"]);

    for key in [
        "creator_voice_id",
        "creatorVoiceId",
        "brand_voice_id",
        "brandVoiceId",
    ] {
        generation_brief.remove(key);
    }

    match voice_source {
        "creator_voice" => {
            if let Some(value) = creator_voice_id {
                generation_brief.insert("creator_voice_id".to_string(), Value::String(value));
            }
        }
        "brand_voice" => {
            if let Some(value) = brand_voice_id {
                generation_brief.insert("brand_voice_id".to_string(), Value::String(value));
            }
        }
        _ => {}
    }
}

fn take_nested_object_alias(
    artifact: &mut Map<String, Value>,
    keys: &[&str],
) -> Map<String, Value> {
    for key in keys {
        if let Some(Value::Object(object)) = artifact.remove(*key) {
            return object;
        }
    }
    Map::new()
}

fn remove_generation_brief_aliases(generation_brief: &mut Map<String, Value>) {
    for key in [
        "voiceSource",
        "voiceGuard",
        "globalSoulScope",
        "expertPersonaScope",
        "formalArtifactVoiceSource",
        "inheritsGlobalSoul",
        "inheritsExpertPersona",
    ] {
        generation_brief.remove(key);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn should_normalize_empty_generation_brief_boundary() {
        let mut artifact = Map::new();
        artifact.insert(
            "artifact_kind".to_string(),
            Value::String("brief".to_string()),
        );

        normalize_generation_brief_boundary_in_artifact(&mut artifact);

        assert_eq!(
            artifact
                .get("generation_brief")
                .and_then(Value::as_object)
                .and_then(|value| value.get("voice_source"))
                .and_then(Value::as_str),
            Some("none")
        );
        assert_eq!(
            artifact
                .get("generation_brief")
                .and_then(Value::as_object)
                .and_then(|value| value.get("inherits_global_soul"))
                .and_then(Value::as_bool),
            Some(false)
        );
    }

    #[test]
    fn should_preserve_explicit_voice_boundary_and_remove_aliases() {
        let mut artifact = json!({
            "generationBrief": {
                "voiceSource": "brand_voice",
                "voiceGuard": "user_explicit",
                "globalSoulScope": "interaction_only",
                "expertPersonaScope": "current_expert_session",
                "formalArtifactVoiceSource": "generation_brief_only",
                "inheritsGlobalSoul": true,
                "inheritsExpertPersona": false,
                "evidence_pack_id": "voice-pack-1"
            }
        })
        .as_object()
        .expect("artifact object")
        .clone();

        normalize_generation_brief_boundary_in_artifact(&mut artifact);

        assert!(artifact.get("generationBrief").is_none());
        let generation_brief = artifact
            .get("generation_brief")
            .and_then(Value::as_object)
            .expect("generation brief");
        assert_eq!(
            generation_brief.get("voice_source").and_then(Value::as_str),
            Some("brand_voice")
        );
        assert_eq!(
            generation_brief
                .get("inherits_global_soul")
                .and_then(Value::as_bool),
            Some(true)
        );
        assert_eq!(
            generation_brief
                .get("evidence_pack_id")
                .and_then(Value::as_str),
            Some("voice-pack-1")
        );
        assert!(generation_brief.get("voiceSource").is_none());
    }

    #[test]
    fn should_remove_stale_voice_identity_when_voice_source_changes() {
        let mut artifact = json!({
            "generationBrief": {
                "voiceSource": "creator_voice",
                "creatorVoiceId": "creator-voice-1",
                "brand_voice_id": "stale-brand-voice"
            }
        })
        .as_object()
        .expect("artifact object")
        .clone();

        normalize_generation_brief_boundary_in_artifact(&mut artifact);

        let generation_brief = artifact
            .get("generation_brief")
            .and_then(Value::as_object)
            .expect("generation brief");
        assert_eq!(
            generation_brief
                .get("creator_voice_id")
                .and_then(Value::as_str),
            Some("creator-voice-1")
        );
        assert!(generation_brief.get("brand_voice_id").is_none());
        assert!(generation_brief.get("creatorVoiceId").is_none());
    }

    #[test]
    fn should_default_unknown_voice_source_to_none_and_remove_voice_identity() {
        let mut artifact = json!({
            "generationBrief": {
                "voiceSource": "legacy_voice",
                "creatorVoiceId": "creator-voice-1",
                "brand_voice_id": "brand-voice-1"
            }
        })
        .as_object()
        .expect("artifact object")
        .clone();

        normalize_generation_brief_boundary_in_artifact(&mut artifact);

        let generation_brief = artifact
            .get("generation_brief")
            .and_then(Value::as_object)
            .expect("generation brief");
        assert_eq!(
            generation_brief.get("voice_source").and_then(Value::as_str),
            Some("none")
        );
        assert!(generation_brief.get("creator_voice_id").is_none());
        assert!(generation_brief.get("brand_voice_id").is_none());
    }

    #[test]
    fn should_read_boundary_from_request_metadata() {
        let metadata = json!({
            "artifact": {
                "generation_brief": {
                    "voice_source": "none",
                    "inherits_expert_persona": false
                }
            }
        });

        let boundary = ArtifactGenerationBriefBoundary::from_request_metadata(Some(&metadata))
            .expect("boundary");

        assert_eq!(boundary.voice_source, "none");
        assert_eq!(boundary.voice_guard, "generation_brief_only");
        assert!(!boundary.inherits_expert_persona);
    }

    #[test]
    fn should_detect_generation_brief_boundary_alias() {
        let artifact = json!({
            "generationBrief": {}
        })
        .as_object()
        .expect("artifact object")
        .clone();

        assert!(artifact_has_generation_brief_boundary(&artifact));
    }
}
