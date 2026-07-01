use crate::RuntimeEvent;
use serde_json::{json, Value};

pub(super) const CONTENT_FACTORY_WORKSPACE_PATCH_PATH: &str =
    ".lime/artifacts/content-factory/workspace-patch.json";

pub(super) fn ensure_workspace_patch_artifact_paths(events: &mut [RuntimeEvent]) {
    for event in events {
        if event.event_type != "artifact.snapshot" {
            continue;
        }
        let Some(artifact) = event.payload.get_mut("artifact") else {
            continue;
        };
        if !is_workspace_patch_artifact(artifact) {
            continue;
        }
        ensure_artifact_path_fields(artifact);
    }
}

pub(super) fn streaming_workspace_patch_events(events: &[RuntimeEvent]) -> Vec<RuntimeEvent> {
    events
        .iter()
        .filter(|event| event.event_type == "artifact.snapshot")
        .filter_map(streaming_workspace_patch_event)
        .collect()
}

fn streaming_workspace_patch_event(event: &RuntimeEvent) -> Option<RuntimeEvent> {
    let artifact = event.payload.get("artifact")?;
    let mut streaming_artifact = artifact.clone();
    let content = {
        let metadata = streaming_artifact
            .get_mut("metadata")
            .and_then(Value::as_object_mut)?;
        let patch = if let Some(patch) = metadata.get_mut("contentFactoryWorkspacePatch") {
            patch
        } else {
            metadata.get_mut("workspace_patch")?
        };
        mark_patch_streaming(patch);
        let content = serde_json::to_string(patch).ok();
        metadata.insert("complete".to_string(), json!(false));
        metadata.insert("writePhase".to_string(), json!("streaming"));
        metadata.insert("contentStatus".to_string(), json!("streaming"));
        content
    };
    if let Some(content) = content {
        if let Some(artifact_object) = streaming_artifact.as_object_mut() {
            artifact_object.insert("content".to_string(), Value::String(content));
        }
    }
    if let Some(artifact_object) = streaming_artifact.as_object_mut() {
        artifact_object.insert("status".to_string(), json!("streaming"));
    }
    ensure_artifact_path_fields(&mut streaming_artifact);
    Some(RuntimeEvent::new(
        "artifact.snapshot",
        json!({ "artifact": streaming_artifact }),
    ))
}

fn is_workspace_patch_artifact(artifact: &Value) -> bool {
    artifact
        .get("metadata")
        .and_then(|metadata| metadata.get("contentFactoryWorkspacePatch"))
        .is_some()
        || artifact
            .get("metadata")
            .and_then(|metadata| metadata.get("workspace_patch"))
            .is_some()
        || artifact.get("contentFactoryWorkspacePatch").is_some()
}

fn ensure_artifact_path_fields(artifact: &mut Value) {
    let Some(artifact_object) = artifact.as_object_mut() else {
        return;
    };
    artifact_object
        .entry("path".to_string())
        .or_insert_with(|| json!(CONTENT_FACTORY_WORKSPACE_PATCH_PATH));
    artifact_object
        .entry("filePath".to_string())
        .or_insert_with(|| json!(CONTENT_FACTORY_WORKSPACE_PATCH_PATH));
    artifact_object
        .entry("file_path".to_string())
        .or_insert_with(|| json!(CONTENT_FACTORY_WORKSPACE_PATCH_PATH));
}

fn mark_patch_streaming(patch: &mut Value) {
    let Some(objects) = patch.get_mut("objects").and_then(Value::as_array_mut) else {
        return;
    };
    for object in objects {
        if article_object_kind(object).as_deref() != Some("articleDraft") {
            continue;
        }
        if let Some(object_map) = object.as_object_mut() {
            object_map.insert("status".to_string(), json!("generating"));
            object_map
                .entry("summary".to_string())
                .or_insert_with(|| json!("正在检索资料并生成文章草稿"));
        }
        if let Some(source) = object.get_mut("source").and_then(Value::as_object_mut) {
            source.insert("hostSearchStatus".to_string(), json!("running"));
        }
    }
}

fn article_object_kind(object: &Value) -> Option<String> {
    value_string(object, &["kind"])
        .map(ToString::to_string)
        .or_else(|| {
            object
                .get("ref")
                .or_else(|| object.get("objectRef"))
                .and_then(|reference| value_string(reference, &["kind"]))
                .map(ToString::to_string)
        })
}

fn value_string<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a str> {
    keys.iter()
        .find_map(|key| value.get(*key))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn builds_streaming_content_factory_workspace_snapshot() {
        let events = vec![RuntimeEvent::new(
            "artifact.snapshot",
            json!({
                "artifact": {
                    "artifactId": "artifact-article-workspace",
                    "kind": "content_factory.workspace_patch",
                    "status": "ready",
                    "metadata": {
                        "contentFactoryWorkspacePatch": {
                            "appId": "content-factory-app",
                            "objects": [
                                {
                                    "ref": {
                                        "appId": "content-factory-app",
                                        "kind": "articleDraft",
                                        "id": "article-draft-1",
                                        "sessionId": "session-1"
                                    },
                                    "title": "公众号文章草稿",
                                    "status": "ready",
                                    "source": {
                                        "markdown": "# 草稿"
                                    }
                                }
                            ]
                        }
                    }
                }
            }),
        )];

        let streaming = streaming_workspace_patch_events(&events);

        assert_eq!(streaming.len(), 1);
        let artifact = &streaming[0].payload["artifact"];
        assert_eq!(artifact["status"], "streaming");
        assert_eq!(artifact["filePath"], CONTENT_FACTORY_WORKSPACE_PATCH_PATH);
        assert_eq!(artifact["metadata"]["complete"], false);
        assert_eq!(artifact["metadata"]["writePhase"], "streaming");
        let patch = &artifact["metadata"]["contentFactoryWorkspacePatch"];
        assert_eq!(patch["objects"][0]["status"], "generating");
        assert_eq!(patch["objects"][0]["source"]["hostSearchStatus"], "running");
        assert!(artifact["content"]
            .as_str()
            .expect("content")
            .contains("hostSearchStatus"));
    }
}
