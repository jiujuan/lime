use super::*;

pub(super) fn sanitized_connector_input(value: &serde_json::Value) -> serde_json::Value {
    match value {
        serde_json::Value::Object(map) => serde_json::Value::Object(
            map.iter()
                .map(|(key, value)| {
                    let normalized = key.to_ascii_lowercase();
                    let redacted = if normalized.contains("token")
                        || normalized.contains("secret")
                        || normalized.contains("credential")
                        || normalized.contains("password")
                        || normalized.contains("apikey")
                        || normalized.contains("api_key")
                        || normalized == "authorization"
                    {
                        serde_json::json!("[redacted:host_managed_secret]")
                    } else if normalized == "evidenceref" || normalized == "evidence_ref" {
                        serde_json::json!("[redacted:host_owned_evidence]")
                    } else if normalized.contains("path") || normalized.ends_with("root") {
                        match value.as_str() {
                            Some(text) if Path::new(text).is_absolute() => {
                                serde_json::json!("[redacted:absolute_local_path]")
                            }
                            _ => sanitized_connector_input(value),
                        }
                    } else {
                        sanitized_connector_input(value)
                    };
                    (key.clone(), redacted)
                })
                .collect(),
        ),
        serde_json::Value::Array(values) => serde_json::Value::Array(
            values
                .iter()
                .map(sanitized_connector_input)
                .collect::<Vec<_>>(),
        ),
        _ => value.clone(),
    }
}
