use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct PreparedImageReference {
    pub(super) image_url: String,
}

pub(super) fn read_image_reference_images(
    payload: &Value,
) -> Result<Vec<PreparedImageReference>, String> {
    let Some(items) = payload
        .get("reference_images")
        .or_else(|| payload.get("referenceImages"))
        .and_then(Value::as_array)
    else {
        return Ok(Vec::new());
    };

    let mut references = Vec::new();
    for item in items {
        let Some(image_url) = read_reference_image_url(item) else {
            continue;
        };
        if !is_supported_openai_compatible_image_reference(&image_url) {
            return Err(format!(
                "图片参考图仅支持 http/https URL 或 data:image base64，当前不可直接传给图片 Provider: {image_url}"
            ));
        }
        references.push(PreparedImageReference { image_url });
    }
    references.dedup_by(|left, right| left.image_url == right.image_url);
    Ok(references)
}

fn is_supported_openai_compatible_image_reference(value: &str) -> bool {
    let normalized = value.trim();
    let lower = normalized.to_ascii_lowercase();
    lower.starts_with("http://")
        || lower.starts_with("https://")
        || (lower.starts_with("data:image/") && lower.contains(";base64,"))
}

fn read_reference_image_url(value: &Value) -> Option<String> {
    match value {
        Value::String(raw) => normalize_optional_text(raw),
        Value::Object(record) => ["url", "src", "image_url", "imageUrl"]
            .iter()
            .find_map(|key| record.get(*key))
            .and_then(Value::as_str)
            .and_then(normalize_optional_text),
        _ => None,
    }
}

fn normalize_optional_text(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}
