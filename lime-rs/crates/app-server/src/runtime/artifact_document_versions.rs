use app_server_protocol::ArtifactSummary;
use serde_json::{json, Map, Value};
use std::collections::HashSet;

pub(super) fn merge_artifact_document_version_history(
    target: &mut ArtifactSummary,
    candidate: &ArtifactSummary,
) -> bool {
    let Some(mut target_document) = artifact_document_from_summary(target) else {
        return false;
    };
    let Some(candidate_document) = artifact_document_from_summary(candidate) else {
        return false;
    };
    if !same_artifact_document(&target_document, &candidate_document) {
        return false;
    }

    let merged_history = merged_version_history(&target_document, &candidate_document);
    if merged_history.is_empty() {
        return false;
    }
    if let Some(metadata) = target_document
        .get_mut("metadata")
        .and_then(Value::as_object_mut)
    {
        metadata.insert("versionHistory".to_string(), Value::Array(merged_history));
    } else if let Some(document) = target_document.as_object_mut() {
        document.insert(
            "metadata".to_string(),
            json!({ "versionHistory": merged_history }),
        );
    }

    write_artifact_document_to_summary(target, target_document);
    true
}

fn artifact_document_from_summary(summary: &ArtifactSummary) -> Option<Value> {
    summary
        .metadata
        .as_ref()
        .and_then(|metadata| metadata.get("artifactDocument"))
        .cloned()
        .or_else(|| {
            summary
                .content
                .as_deref()
                .and_then(|content| serde_json::from_str::<Value>(content).ok())
        })
        .filter(is_artifact_document)
}

fn is_artifact_document(value: &Value) -> bool {
    string_field(value, &["schemaVersion", "schema_version"]).as_deref()
        == Some("artifact_document.v1")
}

fn same_artifact_document(left: &Value, right: &Value) -> bool {
    let left_id = string_field(left, &["artifactId", "artifact_id"]);
    let right_id = string_field(right, &["artifactId", "artifact_id"]);
    left_id.is_some() && left_id == right_id
}

fn merged_version_history(target_document: &Value, candidate_document: &Value) -> Vec<Value> {
    let mut history = Vec::new();
    history.extend(version_history(candidate_document));
    history.extend(version_history(target_document));
    push_current_version_if_missing(&mut history, candidate_document);
    push_current_version_if_missing(&mut history, target_document);

    let mut seen = HashSet::new();
    let mut deduped = Vec::new();
    for item in history {
        let id = string_field(&item, &["id"]).unwrap_or_else(|| stable_version_key(&item));
        if seen.insert(id) {
            deduped.push(item);
        }
    }

    deduped.sort_by(|left, right| {
        version_no(left)
            .cmp(&version_no(right))
            .then_with(|| string_field(left, &["id"]).cmp(&string_field(right, &["id"])))
    });
    deduped
}

fn version_history(document: &Value) -> Vec<Value> {
    document
        .get("metadata")
        .and_then(|metadata| {
            metadata
                .get("versionHistory")
                .or_else(|| metadata.get("version_history"))
        })
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
}

fn push_current_version_if_missing(history: &mut Vec<Value>, document: &Value) {
    let Some(metadata) = document.get("metadata") else {
        return;
    };
    let Some(id) = string_field(metadata, &["currentVersionId", "current_version_id"]) else {
        return;
    };
    if history
        .iter()
        .any(|item| string_field(item, &["id"]).as_deref() == Some(id.as_str()))
    {
        return;
    }
    history.push(json!({
        "id": id,
        "artifactId": string_field(document, &["artifactId", "artifact_id"]),
        "versionNo": number_field(metadata, &["currentVersionNo", "current_version_no"]),
        "title": string_field(document, &["title"]),
        "kind": string_field(document, &["kind"]),
        "status": string_field(document, &["status"]),
        "summary": string_field(document, &["summary"]),
    }));
}

fn write_artifact_document_to_summary(summary: &mut ArtifactSummary, document: Value) {
    let mut metadata = summary
        .metadata
        .as_ref()
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    metadata.insert("artifactDocument".to_string(), document.clone());
    summary.metadata = Some(Value::Object(metadata));
    summary.content = serde_json::to_string_pretty(&document).ok();
}

fn stable_version_key(value: &Value) -> String {
    [
        string_field(value, &["artifactId", "artifact_id"]),
        number_field(value, &["versionNo", "version_no"]).map(|value| value.to_string()),
        string_field(value, &["title"]),
    ]
    .into_iter()
    .flatten()
    .collect::<Vec<_>>()
    .join(":")
}

fn version_no(value: &Value) -> u64 {
    number_field(value, &["versionNo", "version_no"]).unwrap_or(u64::MAX)
}

fn number_field(value: &Value, keys: &[&str]) -> Option<u64> {
    keys.iter().find_map(|key| {
        value.get(*key).and_then(|value| {
            value
                .as_u64()
                .or_else(|| value.as_str().and_then(|text| text.parse::<u64>().ok()))
        })
    })
}

fn string_field(value: &Value, keys: &[&str]) -> Option<String> {
    value
        .as_object()
        .and_then(|record| string_from_map(record, keys))
}

fn string_from_map(record: &Map<String, Value>, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        record
            .get(*key)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
    })
}
