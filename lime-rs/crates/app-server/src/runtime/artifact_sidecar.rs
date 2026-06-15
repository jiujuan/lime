use super::sidecar_store::{
    session_scoped_relative_path, SidecarRef, SidecarStore, SidecarWriteRequest,
};
use super::RuntimeCoreError;
use serde_json::{json, Map, Value};

pub(super) fn persist_artifact_snapshot_payload(
    event_type: &str,
    payload: &mut Value,
    session_id: &str,
    event_id: &str,
    sidecar_store: Option<&SidecarStore>,
) -> Result<(), RuntimeCoreError> {
    if !is_artifact_snapshot_event(event_type, payload) {
        return Ok(());
    }

    let Some(content) = artifact_content(payload) else {
        return Ok(());
    };

    let sidecar_store = sidecar_store.ok_or_else(|| {
        RuntimeCoreError::Backend(
            "artifact snapshot 含正文但缺少显式 sidecar root，不能写入 event payload".to_string(),
        )
    })?;
    let artifact_id = artifact_string(payload, &["artifactId", "artifact_id", "id", "artifactRef"])
        .unwrap_or_else(|| event_id.to_string());
    let relative_path = session_scoped_relative_path(
        session_id,
        &format!(
            "runtime-artifacts/{:016x}.json",
            stable_hash(format!("{artifact_id}:{event_id}").as_str())
        ),
    );
    let sidecar_ref = sidecar_store
        .write_text(&SidecarWriteRequest {
            session_id: session_id.to_string(),
            kind: "artifact_snapshot".to_string(),
            logical_id: artifact_id.clone(),
            relative_path,
            content,
        })
        .map_err(|error| {
            RuntimeCoreError::Backend(format!("保存 artifact snapshot 失败: {error}"))
        })?;

    attach_sidecar_ref(payload, &sidecar_ref);
    remove_artifact_content(payload);
    Ok(())
}

fn is_artifact_snapshot_event(event_type: &str, payload: &Value) -> bool {
    event_type == "artifact.snapshot" || payload.get("artifact").is_some()
}

fn artifact_content(payload: &Value) -> Option<String> {
    string_field(
        payload,
        &["content", "generatedContent", "generated_content"],
    )
    .or_else(|| {
        payload.get("artifact").and_then(|artifact| {
            string_field(
                artifact,
                &["content", "generatedContent", "generated_content"],
            )
        })
    })
    .filter(|content| !content.trim().is_empty())
}

fn attach_sidecar_ref(payload: &mut Value, sidecar_ref: &SidecarRef) {
    let sidecar_ref_value = serde_json::to_value(sidecar_ref).unwrap_or_else(|_| json!({}));
    if let Value::Object(object) = payload {
        object.insert("sidecarRef".to_string(), sidecar_ref_value.clone());
        object.insert(
            "contentStatus".to_string(),
            Value::String(sidecar_ref.content_status.clone()),
        );
        object.insert(
            "contentBytes".to_string(),
            Value::Number(serde_json::Number::from(sidecar_ref.bytes)),
        );
        object.insert(
            "contentSha256".to_string(),
            Value::String(sidecar_ref.sha256.clone()),
        );
        let artifact = object.entry("artifact").or_insert_with(|| json!({}));
        if let Value::Object(artifact_object) = artifact {
            artifact_object.insert("sidecarRef".to_string(), sidecar_ref_value);
            artifact_object.insert(
                "contentStatus".to_string(),
                Value::String(sidecar_ref.content_status.clone()),
            );
            artifact_object.insert(
                "contentBytes".to_string(),
                Value::Number(serde_json::Number::from(sidecar_ref.bytes)),
            );
            artifact_object.insert(
                "contentSha256".to_string(),
                Value::String(sidecar_ref.sha256.clone()),
            );
        }
    }
}

fn remove_artifact_content(payload: &mut Value) {
    if let Value::Object(object) = payload {
        remove_content_fields(object);
        if let Some(Value::Object(artifact)) = object.get_mut("artifact") {
            remove_content_fields(artifact);
        }
    }
}

fn remove_content_fields(object: &mut Map<String, Value>) {
    for key in [
        "content",
        "generatedContent",
        "generated_content",
        "body",
        "fullText",
        "full_text",
    ] {
        object.remove(key);
    }
}

fn artifact_string(value: &Value, keys: &[&str]) -> Option<String> {
    string_field(value, keys).or_else(|| {
        value
            .get("artifact")
            .and_then(|artifact| string_field(artifact, keys))
    })
}

fn string_field(value: &Value, keys: &[&str]) -> Option<String> {
    let object = value.as_object()?;
    keys.iter()
        .find_map(|key| object.get(*key))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn stable_hash(value: &str) -> u64 {
    let mut hash = 0xcbf29ce484222325u64;
    for byte in value.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn moves_inline_artifact_content_to_sidecar_ref() {
        let temp = tempfile::tempdir().expect("tempdir");
        let store = SidecarStore::new(temp.path()).expect("store");
        let mut payload = json!({
            "artifact": {
                "artifactId": "artifact-a",
                "path": ".lime/artifacts/a.md",
                "content": "# A"
            }
        });

        persist_artifact_snapshot_payload(
            "artifact.snapshot",
            &mut payload,
            "sess-a",
            "evt-a",
            Some(&store),
        )
        .expect("persist artifact");

        assert!(payload["artifact"]["content"].is_null());
        assert_eq!(
            payload["artifact"]["sidecarRef"]["kind"].as_str(),
            Some("artifact_snapshot")
        );
        assert!(payload["artifact"]["sidecarRef"]["sha256"]
            .as_str()
            .is_some_and(|value| value.starts_with("sha256:")));
        let relative_path = payload["artifact"]["sidecarRef"]["relativePath"]
            .as_str()
            .expect("relative path");
        assert_eq!(store.read_text(relative_path).as_deref(), Some("# A"));
    }
}
