use serde_json::Value;
use std::path::PathBuf;

use super::plugin_manifest::resolve_plugin_package_manifest;
use super::read_json_string;
use super::seeded::migrate_seeded_plugin_installed_state;

pub(crate) fn migrate_plugin_installed_state_for_runtime(state: Value) -> Value {
    let state = migrate_seeded_plugin_installed_state(state);
    refresh_local_folder_manifest_projection(state)
}

fn refresh_local_folder_manifest_projection(mut state: Value) -> Value {
    if read_json_string(&state, &["identity", "sourceKind"]).as_deref() != Some("local_folder") {
        return state;
    }
    let Some(source_uri) = read_json_string(&state, &["identity", "sourceUri"]) else {
        return state;
    };
    let Ok(projection) = resolve_plugin_package_manifest(&PathBuf::from(source_uri)) else {
        return state;
    };
    if !projected_manifest_matches_state(&state, &projection.plugin_manifest) {
        return state;
    }
    let Some(object) = state.as_object_mut() else {
        return state;
    };
    object.insert("manifest".to_string(), projection.plugin_manifest);
    state
}

fn projected_manifest_matches_state(state: &Value, manifest: &Value) -> bool {
    let state_app_id = read_json_string(state, &["appId"])
        .or_else(|| read_json_string(state, &["identity", "appId"]))
        .or_else(|| read_json_string(state, &["manifest", "name"]))
        .or_else(|| read_json_string(state, &["manifest", "id"]));
    let projected_app_id = read_json_string(manifest, &["name"])
        .or_else(|| read_json_string(manifest, &["appId"]))
        .or_else(|| read_json_string(manifest, &["id"]));
    state_app_id.is_some() && state_app_id == projected_app_id
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::fs;

    #[test]
    fn local_folder_installed_state_uses_projected_runtime_manifest() {
        let temp = tempfile::tempdir().expect("temp dir");
        let app_dir = temp.path();
        fs::write(
            app_dir.join("plugin.json"),
            r#"{
  "schemaVersion": "lime.plugin.package.v1",
  "id": "content-factory-app",
  "version": "2.2.2",
  "displayName": "内容工厂",
  "contributions": {
    "runtime": "./app.runtime.yaml"
  }
}"#,
        )
        .expect("plugin.json");
        fs::write(
            app_dir.join("app.runtime.yaml"),
            r#"agentRuntime:
  worker:
    entrypoint: ./src/runtime/content-factory-worker.mjs
    outputArtifactKind: content_factory.workspace_patch
    hostManagedGeneration:
      enabled: true
      systemPrompt: 生成文章正文
      requests:
        - id: article-draft-document
          kind: markdown_document
          targetObjectKind: articleDraft
          outputField: documentText
  tasks:
    - kind: content.article.generate
"#,
        )
        .expect("runtime yaml");

        let state = migrate_plugin_installed_state_for_runtime(json!({
            "appId": "content-factory-app",
            "identity": {
                "appId": "content-factory-app",
                "sourceKind": "local_folder",
                "sourceUri": app_dir.to_string_lossy()
            },
            "manifest": {
                "schemaVersion": "lime.plugin.package.v1",
                "id": "content-factory-app",
                "version": "2.2.2",
                "contributions": {
                    "runtime": "./app.runtime.yaml"
                }
            }
        }));

        assert_eq!(
            state["manifest"]["agentRuntime"]["worker"]["hostManagedGeneration"]["enabled"],
            true
        );
        assert_eq!(
            state["manifest"]["runtimePackage"]["worker"]["hostManagedGeneration"]["requests"][0]
                ["outputField"],
            "documentText"
        );
    }
}
