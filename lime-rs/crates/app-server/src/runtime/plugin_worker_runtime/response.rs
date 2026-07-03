use super::RuntimeCoreError;
use super::RuntimeEvent;
use app_server_protocol::PluginTaskRuntimeContract;
use serde_json::json;
use serde_json::Map;
use serde_json::Value;

pub(super) fn worker_response_to_runtime_events(
    response: Value,
    request: &Value,
    task_runtime: &PluginTaskRuntimeContract,
    persist_inline_artifact_content: bool,
) -> Result<Vec<RuntimeEvent>, RuntimeCoreError> {
    if response.get("status").and_then(Value::as_str) != Some("completed") {
        return Err(RuntimeCoreError::Backend(format!(
            "Plugin worker did not complete: {}",
            response
                .pointer("/error/code")
                .and_then(Value::as_str)
                .unwrap_or("WORKER_FAILED")
        )));
    }
    let artifacts = response
        .get("artifacts")
        .and_then(Value::as_array)
        .ok_or_else(|| {
            RuntimeCoreError::Backend("Plugin worker response missing artifacts.".to_string())
        })?;
    let mut events = Vec::new();
    for artifact in artifacts {
        if artifact.get("kind").and_then(Value::as_str) != Some("artifact.snapshot") {
            continue;
        }
        let mut artifact = artifact.clone();
        attach_worker_metadata(&mut artifact, request, task_runtime);
        if !persist_inline_artifact_content {
            remove_inline_artifact_content(&mut artifact);
        }
        events.push(RuntimeEvent::new(
            "artifact.snapshot",
            json!({
                "artifact": artifact
            }),
        ));
    }
    if events.is_empty() {
        return Err(RuntimeCoreError::Backend(
            "Plugin worker response did not include artifact.snapshot.".to_string(),
        ));
    }
    Ok(events)
}

fn remove_inline_artifact_content(artifact: &mut Value) {
    if let Some(object) = artifact.as_object_mut() {
        object.remove("content");
        object.remove("generatedContent");
        object.remove("generated_content");
    }
}

fn attach_worker_metadata(
    artifact: &mut Value,
    request: &Value,
    task_runtime: &PluginTaskRuntimeContract,
) {
    let metadata = ensure_object_field(artifact, "metadata");
    let workspace_patch = metadata
        .get("contentFactoryWorkspacePatch")
        .or_else(|| metadata.get("workspace_patch"));
    let output_object_count = workspace_patch
        .and_then(|patch| patch.get("objects"))
        .and_then(Value::as_array)
        .and_then(|objects| u64::try_from(objects.len()).ok());
    let output_summary = output_object_count.map(|count| format!("{count} product objects"));
    let plugin_worker = metadata
        .entry("pluginWorker".to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    if !plugin_worker.is_object() {
        *plugin_worker = Value::Object(Map::new());
    }
    let plugin_worker = plugin_worker
        .as_object_mut()
        .expect("pluginWorker metadata is object");
    insert_missing_metadata_field(
        plugin_worker,
        "appId",
        json!(string_field(request, &["appId", "app_id"])),
    );
    insert_missing_metadata_field(
        plugin_worker,
        "taskId",
        json!(string_field(request, &["taskId", "task_id"])),
    );
    insert_missing_metadata_field(
        plugin_worker,
        "taskKind",
        json!(string_field(request, &["taskKind", "task_kind"])),
    );
    insert_missing_metadata_field(
        plugin_worker,
        "turnId",
        json!(string_field(request, &["turnId", "turn_id"])),
    );
    insert_missing_metadata_field(plugin_worker, "status", json!("completed"));
    insert_missing_metadata_field(
        plugin_worker,
        "workerEntrypoint",
        json!(task_runtime.worker_entrypoint.as_deref()),
    );
    insert_missing_metadata_field(
        plugin_worker,
        "inputSummary",
        json!(string_field(request, &["prompt"])
            .map(|prompt| format!("prompt={}", truncate_chars(&prompt, 80)))),
    );
    insert_missing_metadata_field(plugin_worker, "outputSummary", json!(output_summary));
    insert_missing_metadata_field(
        plugin_worker,
        "outputObjectCount",
        json!(output_object_count),
    );
    insert_missing_metadata_field(
        plugin_worker,
        "outputArtifactKind",
        json!(task_runtime.output_artifact_kind.as_deref()),
    );
    insert_missing_metadata_field(
        plugin_worker,
        "workflowKey",
        request
            .get("workflowKey")
            .or_else(|| request.get("workflow_key"))
            .cloned()
            .unwrap_or(Value::Null),
    );
    insert_missing_metadata_field(
        plugin_worker,
        "subagents",
        request
            .get("subagents")
            .or_else(|| request.get("sub_agents"))
            .cloned()
            .unwrap_or(Value::Null),
    );
    insert_missing_metadata_field(
        plugin_worker,
        "skillRefs",
        request
            .get("skillRefs")
            .or_else(|| request.get("skill_refs"))
            .cloned()
            .unwrap_or(Value::Null),
    );
    insert_missing_metadata_field(
        plugin_worker,
        "cliRefs",
        request
            .get("cliRefs")
            .or_else(|| request.get("cli_refs"))
            .cloned()
            .unwrap_or(Value::Null),
    );
    insert_missing_metadata_field(
        plugin_worker,
        "connectorRefs",
        request
            .get("connectorRefs")
            .or_else(|| request.get("connector_refs"))
            .cloned()
            .unwrap_or(Value::Null),
    );
    insert_missing_metadata_field(
        plugin_worker,
        "hookPolicy",
        request
            .get("hookPolicy")
            .or_else(|| request.get("hook_policy"))
            .cloned()
            .unwrap_or(Value::Null),
    );
    insert_missing_metadata_field(
        plugin_worker,
        "orchestration",
        request.get("orchestration").cloned().unwrap_or(Value::Null),
    );
}

fn ensure_object_field<'a>(value: &'a mut Value, key: &str) -> &'a mut Map<String, Value> {
    if !value.is_object() {
        *value = Value::Object(Map::new());
    }
    let object = value.as_object_mut().expect("value is object");
    let entry = object
        .entry(key.to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    if !entry.is_object() {
        *entry = Value::Object(Map::new());
    }
    entry.as_object_mut().expect("field is object")
}

fn insert_missing_metadata_field(object: &mut Map<String, Value>, key: &str, value: Value) {
    if !metadata_value_is_meaningful(&value) {
        return;
    }
    let should_insert = object
        .get(key)
        .map(|current| !metadata_value_is_meaningful(current))
        .unwrap_or(true);
    if should_insert {
        object.insert(key.to_string(), value);
    }
}

fn metadata_value_is_meaningful(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::String(value) => !value.trim().is_empty(),
        Value::Array(value) => !value.is_empty(),
        Value::Object(value) => !value.is_empty(),
        Value::Bool(_) | Value::Number(_) => true,
    }
}

fn truncate_chars(value: &str, max_chars: usize) -> String {
    let mut result = String::new();
    for (index, ch) in value.chars().enumerate() {
        if index >= max_chars {
            result.push_str("...");
            break;
        }
        result.push(ch);
    }
    result
}

fn string_field(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .filter_map(|key| value.get(*key))
        .find_map(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}
