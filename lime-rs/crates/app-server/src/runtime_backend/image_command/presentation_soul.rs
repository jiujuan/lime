use crate::runtime_backend::tool_process_metadata::SoulStyleMetadata;
use serde_json::{json, Map, Value};

const PRESENTATION_CONTRACT_SCHEMA_VERSION: &str = "lime.image_generation.presentation.v1";
const PRESENTATION_BOUNDARY_SCHEMA_VERSION: &str = "lime.image_generation.boundary.v1";

pub(super) fn insert_image_generation_soul_payload_fields(
    payload: &mut Map<String, Value>,
    source: &str,
    provider: Option<&str>,
    model: Option<&str>,
    language_code: &str,
    soul_style: Option<&SoulStyleMetadata>,
) {
    payload.insert(
        "schemaVersion".to_string(),
        json!(PRESENTATION_CONTRACT_SCHEMA_VERSION),
    );
    payload.insert("surface".to_string(), json!("image_generation"));
    payload.insert("status".to_string(), json!("presentation_generated"));

    let lifecycle = image_generation_lifecycle("presentation_generated", soul_style);
    payload.insert(
        "styleLevels".to_string(),
        image_generation_style_levels(&lifecycle),
    );
    payload.insert(
        "generationBriefBoundary".to_string(),
        image_generation_brief_boundary(),
    );
    payload.insert(
        "image_generation_presentation_facts".to_string(),
        image_generation_presentation_facts(source, provider, model, language_code, &lifecycle),
    );
    payload.insert(
        "soul_lifecycle".to_string(),
        Value::Object(lifecycle.clone()),
    );
    payload.insert("soulSurface".to_string(), json!("image_generation"));
    payload.insert("soul_surface".to_string(), json!("image_generation"));

    insert_lifecycle_top_level_aliases(payload, &lifecycle);
    if let Some(soul_style) = soul_style {
        soul_style.insert_top_level_fields(payload);
    }
}

fn insert_lifecycle_top_level_aliases(
    payload: &mut Map<String, Value>,
    lifecycle: &Map<String, Value>,
) {
    if let Some(phase) = lifecycle.get("phase").and_then(Value::as_str) {
        payload.insert("soulPhase".to_string(), json!(phase));
        payload.insert("soul_phase".to_string(), json!(phase));
    }
    if let Some(style_level) = lifecycle.get("styleLevel").and_then(Value::as_str) {
        payload.insert("styleLevel".to_string(), json!(style_level));
        payload.insert("style_level".to_string(), json!(style_level));
    }
    if let Some(risk_level) = lifecycle.get("riskLevel").and_then(Value::as_str) {
        payload.insert("riskLevel".to_string(), json!(risk_level));
        payload.insert("risk_level".to_string(), json!(risk_level));
    }
    if let Some(tone_variant) = lifecycle.get("toneVariant").and_then(Value::as_str) {
        payload.insert("toneVariant".to_string(), json!(tone_variant));
    }
    if let Some(profile_id) = lifecycle.get("profileId").and_then(Value::as_str) {
        payload.insert("profileId".to_string(), json!(profile_id));
    }
    if let Some(pack_id) = lifecycle.get("packId").and_then(Value::as_str) {
        payload.insert("packId".to_string(), json!(pack_id));
    }
}

fn image_generation_lifecycle(
    status: &str,
    soul_style: Option<&SoulStyleMetadata>,
) -> Map<String, Value> {
    let mut lifecycle = Map::from_iter([
        ("surface".to_string(), json!("image_generation")),
        ("phase".to_string(), json!("image_generation_presentation")),
        ("status".to_string(), json!(status)),
        ("styleLevel".to_string(), json!("L2")),
        ("riskLevel".to_string(), json!("normal")),
    ]);
    if let Some(soul_style) = soul_style {
        soul_style.insert_lifecycle_fields(&mut lifecycle);
    }
    lifecycle
}

fn image_generation_style_levels(lifecycle: &Map<String, Value>) -> Value {
    json!({
        "title": {
            "styleLevel": "L0",
            "source": "product_i18n"
        },
        "parameterSummary": {
            "styleLevel": "L0",
            "source": "task_payload_facts"
        },
        "runningStatus": {
            "styleLevel": "L1",
            "source": "runtime_status"
        },
        "assistantIntro": {
            "styleLevel": lifecycle.get("styleLevel").and_then(Value::as_str).unwrap_or("L2"),
            "soulPhase": "before_image"
        },
        "completionCaption": {
            "styleLevel": lifecycle.get("styleLevel").and_then(Value::as_str).unwrap_or("L2"),
            "soulPhase": "after_image"
        },
        "mediaArtifact": {
            "styleLevel": "L3",
            "source": "provider_result_and_generation_brief_only"
        }
    })
}

fn image_generation_brief_boundary() -> Value {
    json!({
        "schemaVersion": PRESENTATION_BOUNDARY_SCHEMA_VERSION,
        "artifactBodyStyleLevel": "L3",
        "mediaArtifactStyleLevel": "L3",
        "formalArtifactVoiceSource": "generation_brief_only",
        "productSoulDefault": "interaction_only",
        "rules": [
            "Image block title and parameter summary are L0 product facts.",
            "Running status may use L1 Interaction Soul only for short process narration.",
            "Assistant intro and completion caption may follow Interaction Soul at L2.",
            "Generated media artifact and formal artifact body are L3 and must not be rewritten by Product Soul."
        ],
    })
}

fn image_generation_presentation_facts(
    source: &str,
    provider: Option<&str>,
    model: Option<&str>,
    language_code: &str,
    lifecycle: &Map<String, Value>,
) -> Value {
    json!({
        "source": "app_server_runtime_backend",
        "presentationSource": source,
        "surface": "image_generation",
        "status": lifecycle.get("status").and_then(Value::as_str).unwrap_or("presentation_generated"),
        "language": language_code,
        "provider": provider,
        "model": model,
        "titleStyleLevel": "L0",
        "parameterSummaryStyleLevel": "L0",
        "runningStatusStyleLevel": "L1",
        "assistantIntroStyleLevel": "L2",
        "completionCaptionStyleLevel": "L2",
        "mediaArtifactStyleLevel": "L3",
        "artifactBodyStyleLevel": "L3",
        "productSoulDefault": "interaction_only",
        "formalArtifactVoiceSource": "generation_brief_only",
    })
}
