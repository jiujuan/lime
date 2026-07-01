use app_server_protocol::AgentEvent;
use app_server_protocol::AgentSession;
use serde_json::{json, Map, Value};
use std::collections::BTreeMap;

const DEFAULT_SCHEMA_VERSION: &str = "article-workspace.v1";

pub(super) fn article_workspace_from_events(
    session: &AgentSession,
    events: &[AgentEvent],
) -> Option<Value> {
    let mut workspace = ArticleWorkspaceBuilder::new(session);
    for event in events {
        for patch in workspace_patches_from_event(event) {
            workspace.apply_patch(event, &patch);
        }
        workspace.apply_worker_evidence(event);
    }
    workspace.into_value()
}

pub(super) fn apply_session_selection(
    article_workspace: Option<Value>,
    session: &AgentSession,
) -> Option<Value> {
    let mut article_workspace = article_workspace?;
    let Some(selected_object_ref) = session_article_workspace_selected_object_ref(session) else {
        return Some(article_workspace);
    };
    if !workspace_contains_object_ref(&article_workspace, &selected_object_ref) {
        return Some(article_workspace);
    }
    if let Some(object) = article_workspace.as_object_mut() {
        object.insert("selectedObjectRef".to_string(), selected_object_ref);
    }
    Some(article_workspace)
}

pub(super) fn apply_session_edited_draft(
    article_workspace: Option<Value>,
    session: &AgentSession,
) -> Option<Value> {
    let mut article_workspace = article_workspace?;
    let Some(edited_draft) = session_article_workspace_edited_draft(session) else {
        return Some(article_workspace);
    };
    let Some(edited_ref) = edited_draft
        .get("objectRef")
        .or_else(|| edited_draft.get("object_ref"))
    else {
        return Some(article_workspace);
    };
    let Some(edited_key) = article_object_ref_key(edited_ref) else {
        return Some(article_workspace);
    };
    let Some(markdown) = string_field(&edited_draft, &["markdown"]) else {
        return Some(article_workspace);
    };
    if markdown.trim().is_empty() {
        return Some(article_workspace);
    }

    let updated_at = string_field(&edited_draft, &["updatedAt", "updated_at"]);
    let Some(objects) = article_workspace
        .as_object_mut()
        .and_then(|workspace| workspace.get_mut("objects"))
        .and_then(Value::as_array_mut)
    else {
        return Some(article_workspace);
    };

    let mut changed = false;
    for object in objects {
        let Some(object_key) = article_object_key(object) else {
            continue;
        };
        if object_key != edited_key
            || article_object_kind(object).as_deref() != Some("articleDraft")
        {
            continue;
        }
        apply_markdown_to_article_object(object, &markdown, updated_at.as_deref());
        changed = true;
    }

    if changed {
        if let Some(workspace) = article_workspace.as_object_mut() {
            workspace.insert("editedDraft".to_string(), edited_draft.clone());
            workspace.insert("edited_draft".to_string(), edited_draft);
            if let Some(updated_at) = updated_at {
                workspace.insert("updatedAt".to_string(), json!(updated_at));
            }
        }
    }
    Some(article_workspace)
}

struct ArticleWorkspaceBuilder<'a> {
    session: &'a AgentSession,
    app_id: Option<String>,
    objects: BTreeMap<String, Value>,
    object_order: Vec<String>,
    primary_object_ref: Option<Value>,
    selected_object_ref: Option<Value>,
    layout_state: Option<Value>,
    source_artifacts: Vec<Value>,
    worker_evidence: Vec<Value>,
    article_generation_task_statuses: BTreeMap<String, String>,
    updated_at: Option<String>,
}

impl<'a> ArticleWorkspaceBuilder<'a> {
    fn new(session: &'a AgentSession) -> Self {
        Self {
            session,
            app_id: Some(session.app_id.clone()),
            objects: BTreeMap::new(),
            object_order: Vec::new(),
            primary_object_ref: None,
            selected_object_ref: None,
            layout_state: None,
            source_artifacts: Vec::new(),
            worker_evidence: Vec::new(),
            article_generation_task_statuses: BTreeMap::new(),
            updated_at: None,
        }
    }

    fn apply_patch(&mut self, event: &AgentEvent, patch: &Value) {
        let Some(objects) = patch.get("objects").and_then(Value::as_array) else {
            return;
        };
        if objects.is_empty() {
            return;
        }

        if let Some(app_id) = string_field(patch, &["appId", "app_id"]) {
            self.app_id = Some(app_id);
        }
        if let Some(primary_object_ref) =
            object_ref_field(patch, &["primaryObjectRef", "primary_object_ref"])
        {
            self.primary_object_ref = Some(primary_object_ref);
        }
        if let Some(selected_object_ref) =
            object_ref_field(patch, &["selectedObjectRef", "selected_object_ref"])
        {
            self.selected_object_ref = Some(selected_object_ref);
        }
        if let Some(layout_state) = patch
            .get("layoutState")
            .or_else(|| patch.get("layout_state"))
            .filter(|value| value.is_object())
            .cloned()
        {
            self.layout_state = Some(layout_state);
        }

        for object in objects {
            let Some(key) = article_object_key(object) else {
                continue;
            };
            if !self.objects.contains_key(&key) {
                self.object_order.push(key.clone());
            }
            let next_object = self
                .objects
                .get(&key)
                .map(|current| merge_article_object(current, object))
                .unwrap_or_else(|| object.clone());
            self.objects.insert(key, next_object);
        }

        if let Some(source_artifact) = source_artifact_from_event(event) {
            self.source_artifacts.push(source_artifact);
        }
        self.updated_at = Some(event.timestamp.clone());
    }

    fn apply_worker_evidence(&mut self, event: &AgentEvent) {
        if let Some(worker_evidence) = worker_evidence_from_event(event) {
            self.record_article_generation_task_status(&worker_evidence);
            self.worker_evidence.push(worker_evidence);
            self.updated_at = Some(event.timestamp.clone());
        }
    }

    fn into_value(self) -> Option<Value> {
        if self.objects.is_empty() {
            return None;
        }

        let objects = self
            .object_order
            .iter()
            .filter_map(|key| self.objects.get(key).cloned())
            .collect::<Vec<_>>();
        let mut objects = objects;
        apply_article_generation_task_statuses(
            &mut objects,
            &self.article_generation_task_statuses,
        );
        let layout_state = self.layout_state.unwrap_or_else(default_layout_state);
        let mut value = Map::new();
        value.insert("schemaVersion".to_string(), json!(DEFAULT_SCHEMA_VERSION));
        value.insert(
            "appId".to_string(),
            json!(self.app_id.unwrap_or_else(|| self.session.app_id.clone())),
        );
        value.insert("sessionId".to_string(), json!(self.session.session_id));
        if let Some(workspace_id) = self.session.workspace_id.clone() {
            value.insert("workspaceId".to_string(), json!(workspace_id));
        }
        if let Some(primary_object_ref) = self.primary_object_ref {
            value.insert("primaryObjectRef".to_string(), primary_object_ref);
        }
        if let Some(selected_object_ref) = self.selected_object_ref {
            value.insert("selectedObjectRef".to_string(), selected_object_ref);
        }
        value.insert("objects".to_string(), Value::Array(objects));
        value.insert("objectCount".to_string(), json!(self.objects.len()));
        value.insert("layoutState".to_string(), layout_state);
        value.insert(
            "sourceArtifacts".to_string(),
            Value::Array(self.source_artifacts),
        );
        if !self.worker_evidence.is_empty() {
            value.insert(
                "workerEvidence".to_string(),
                Value::Array(self.worker_evidence),
            );
        }
        if let Some(updated_at) = self.updated_at {
            value.insert("updatedAt".to_string(), json!(updated_at));
        }
        Some(Value::Object(value))
    }

    fn record_article_generation_task_status(&mut self, worker_evidence: &Value) {
        let Some(task_id) = article_generation_task_id_from_worker_evidence(worker_evidence) else {
            return;
        };
        let Some(status) = string_field(worker_evidence, &["status"]) else {
            return;
        };
        if !matches!(status.as_str(), "completed" | "failed") {
            return;
        }
        self.article_generation_task_statuses
            .insert(task_id, status);
    }
}

fn workspace_patches_from_event(event: &AgentEvent) -> Vec<Value> {
    let payload = &event.payload;
    let artifact = payload.get("artifact");
    let metadata = payload.get("metadata");
    let artifact_metadata = artifact.and_then(|artifact| artifact.get("metadata"));

    let mut patches = Vec::new();
    for candidate in [
        payload.get("articleWorkspace"),
        payload.get("article_workspace"),
        payload.get("workspacePatch"),
        payload.get("workspace_patch"),
        payload.get("contentFactoryWorkspacePatch"),
        metadata.and_then(|value| value.get("articleWorkspace")),
        metadata.and_then(|value| value.get("article_workspace")),
        metadata.and_then(|value| value.get("workspacePatch")),
        metadata.and_then(|value| value.get("workspace_patch")),
        metadata.and_then(|value| value.get("contentFactoryWorkspacePatch")),
        artifact.and_then(|value| value.get("articleWorkspace")),
        artifact.and_then(|value| value.get("article_workspace")),
        artifact.and_then(|value| value.get("workspacePatch")),
        artifact.and_then(|value| value.get("workspace_patch")),
        artifact.and_then(|value| value.get("contentFactoryWorkspacePatch")),
        artifact_metadata.and_then(|value| value.get("articleWorkspace")),
        artifact_metadata.and_then(|value| value.get("article_workspace")),
        artifact_metadata.and_then(|value| value.get("workspacePatch")),
        artifact_metadata.and_then(|value| value.get("workspace_patch")),
        artifact_metadata.and_then(|value| value.get("contentFactoryWorkspacePatch")),
    ]
    .into_iter()
    .flatten()
    {
        if candidate.get("objects").and_then(Value::as_array).is_some() {
            patches.push(candidate.clone());
        }
    }

    if let Some(content_patch) = artifact_content_patch(artifact) {
        patches.push(content_patch);
    }

    patches
}

fn artifact_content_patch(artifact: Option<&Value>) -> Option<Value> {
    let content = artifact?.get("content")?.as_str()?;
    let value: Value = serde_json::from_str(content).ok()?;
    value.get("objects").and_then(Value::as_array)?;
    Some(value)
}

fn article_object_key(object: &Value) -> Option<String> {
    let reference = object.get("ref").or_else(|| object.get("objectRef"))?;
    article_object_ref_key(reference)
}

fn merge_article_object(current: &Value, next: &Value) -> Value {
    let (Some(current_object), Some(next_object)) = (current.as_object(), next.as_object()) else {
        return next.clone();
    };
    let mut merged = current_object.clone();
    for (key, value) in next_object {
        if key == "source" {
            let source = merge_json_object(current_object.get("source"), value);
            merged.insert(key.clone(), source);
            continue;
        }
        if key == "ref" || key == "objectRef" {
            let reference = merge_json_object(
                current_object
                    .get(key)
                    .or_else(|| current_object.get("ref"))
                    .or_else(|| current_object.get("objectRef")),
                value,
            );
            merged.insert(key.clone(), reference);
            continue;
        }
        merged.insert(key.clone(), value.clone());
    }
    Value::Object(merged)
}

fn merge_json_object(current: Option<&Value>, next: &Value) -> Value {
    let (Some(current_object), Some(next_object)) =
        (current.and_then(Value::as_object), next.as_object())
    else {
        return next.clone();
    };
    let mut merged = current_object.clone();
    for (key, value) in next_object {
        merged.insert(key.clone(), value.clone());
    }
    Value::Object(merged)
}

fn article_object_ref_key(reference: &Value) -> Option<String> {
    let app_id = string_field(reference, &["appId", "app_id"])?;
    let kind = string_field(reference, &["kind"])?;
    let id = string_field(reference, &["id"])?;
    let session_id = string_field(reference, &["sessionId", "session_id"])?;
    Some(format!("{app_id}:{session_id}:{kind}:{id}"))
}

fn article_object_task_id(object: &Value) -> Option<String> {
    object
        .get("source")
        .and_then(|source| string_field(source, &["taskId", "task_id"]))
        .or_else(|| {
            object
                .get("ref")
                .or_else(|| object.get("objectRef"))
                .and_then(|reference| string_field(reference, &["sourceTaskId", "source_task_id"]))
        })
}

fn article_generation_task_id_from_worker_evidence(worker_evidence: &Value) -> Option<String> {
    if string_field(worker_evidence, &["taskKind"]).as_deref() != Some("content.article.generate") {
        return None;
    }
    string_field(worker_evidence, &["taskId"])
}

fn apply_article_generation_task_statuses(
    objects: &mut [Value],
    task_statuses: &BTreeMap<String, String>,
) {
    for object in objects {
        let Some(task_id) = article_object_task_id(object) else {
            continue;
        };
        if task_statuses.get(&task_id).map(String::as_str) != Some("failed") {
            continue;
        }
        if article_object_kind(object).as_deref() != Some("articleDraft") {
            continue;
        }
        if let Some(object_map) = object.as_object_mut() {
            object_map.insert("status".to_string(), json!("failed"));
            object_map.insert(
                "summary".to_string(),
                json!("写作失败，文章草稿未达到可交付状态"),
            );
        }
    }
}

fn workspace_contains_object_ref(article_workspace: &Value, reference: &Value) -> bool {
    let Some(reference_key) = article_object_ref_key(reference) else {
        return false;
    };
    article_workspace
        .get("objects")
        .and_then(Value::as_array)
        .is_some_and(|objects| {
            objects
                .iter()
                .filter_map(article_object_key)
                .any(|object_key| object_key == reference_key)
        })
}

fn session_article_workspace_selected_object_ref(session: &AgentSession) -> Option<Value> {
    session
        .business_object_ref
        .as_ref()
        .and_then(|reference| reference.metadata.as_ref())
        .and_then(|metadata| {
            object_ref_field(
                metadata,
                &[
                    "articleWorkspaceSelectedObjectRef",
                    "article_workspace_selected_object_ref",
                ],
            )
        })
}

fn object_ref_field(value: &Value, keys: &[&str]) -> Option<Value> {
    keys.iter()
        .find_map(|key| value.get(*key))
        .filter(|value| article_object_ref_is_valid(value))
        .cloned()
}

fn article_object_ref_is_valid(value: &Value) -> bool {
    string_field(value, &["appId", "app_id"]).is_some()
        && string_field(value, &["kind"]).is_some()
        && string_field(value, &["id"]).is_some()
        && string_field(value, &["sessionId", "session_id"]).is_some()
}

fn article_object_kind(object: &Value) -> Option<String> {
    string_field(object, &["kind"]).or_else(|| {
        object
            .get("ref")
            .or_else(|| object.get("objectRef"))
            .and_then(|reference| string_field(reference, &["kind"]))
    })
}

fn session_article_workspace_edited_draft(session: &AgentSession) -> Option<Value> {
    session
        .business_object_ref
        .as_ref()
        .and_then(|reference| reference.metadata.as_ref())
        .and_then(|metadata| {
            metadata
                .get("articleWorkspaceEditedDraft")
                .or_else(|| metadata.get("article_workspace_edited_draft"))
        })
        .filter(|value| value.is_object())
        .cloned()
}

fn apply_markdown_to_article_object(object: &mut Value, markdown: &str, updated_at: Option<&str>) {
    let Some(object_map) = object.as_object_mut() else {
        return;
    };
    let source = object_map
        .entry("source".to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    if !source.is_object() {
        *source = Value::Object(Map::new());
    }
    if let Some(source_map) = source.as_object_mut() {
        source_map.insert("documentText".to_string(), json!(markdown));
        source_map.insert("finalMarkdown".to_string(), json!(markdown));
        source_map.insert("edited".to_string(), json!(true));
        if let Some(updated_at) = updated_at {
            source_map.insert("updatedAt".to_string(), json!(updated_at));
            source_map.insert("updated_at".to_string(), json!(updated_at));
        }
    }
}

fn source_artifact_from_event(event: &AgentEvent) -> Option<Value> {
    let artifact = event.payload.get("artifact").unwrap_or(&event.payload);
    let artifact_ref = string_field(artifact, &["artifactId", "artifact_id", "id"])
        .or_else(|| string_field(artifact, &["artifactRef", "artifact_ref", "path"]))?;
    Some(json!({
        "artifactRef": artifact_ref,
        "eventId": event.event_id,
        "turnId": event.turn_id,
        "kind": string_field(artifact, &["kind", "artifactKind", "artifact_kind"]),
        "title": string_field(artifact, &["title", "artifactTitle", "artifact_title"]),
        "updatedAt": event.timestamp,
    }))
}

fn worker_evidence_from_event(event: &AgentEvent) -> Option<Value> {
    let worker_metadata = worker_metadata_from_event(event);
    let payload_source = string_field(&event.payload, &["source"]);
    let is_worker_event =
        worker_metadata.is_some() || payload_source.as_deref() == Some("agent_app_task_worker");
    if !is_worker_event {
        return None;
    }

    let artifact = event.payload.get("artifact").unwrap_or(&event.payload);
    let status = match event.event_type.as_str() {
        "agent_app_worker.retry" | "runtime.error" | "turn.failed" => "failed",
        "artifact.snapshot" => "completed",
        _ => "unknown",
    };
    let message = string_field(
        &event.payload,
        &[
            "message",
            "errorMessage",
            "error_message",
            "error",
            "reason",
        ],
    );

    Some(json!({
        "id": format!("{}:workerEvidence", event.event_id),
        "eventId": event.event_id,
        "turnId": event.turn_id,
        "status": status,
        "source": "agent_app_task_worker",
        "eventType": event.event_type,
        "appId": worker_string_field(worker_metadata, &["appId", "app_id"])
            .or_else(|| string_field(&event.payload, &["appId", "app_id"])),
        "taskId": worker_string_field(worker_metadata, &["taskId", "task_id"])
            .or_else(|| string_field(&event.payload, &["taskId", "task_id"])),
        "taskKind": worker_string_field(worker_metadata, &["taskKind", "task_kind"])
            .or_else(|| string_field(&event.payload, &["taskKind", "task_kind"])),
        "workerEntrypoint": worker_string_field(worker_metadata, &["workerEntrypoint", "worker_entrypoint"]),
        "inputSummary": worker_string_field(worker_metadata, &["inputSummary", "input_summary"]),
        "outputSummary": worker_string_field(worker_metadata, &["outputSummary", "output_summary"]),
        "outputObjectCount": worker_number_field(worker_metadata, &["outputObjectCount", "output_object_count"]),
        "artifactRef": string_field(artifact, &["artifactId", "artifact_id", "id", "artifactRef", "artifact_ref", "path"]),
        "artifactKind": worker_string_field(worker_metadata, &["outputArtifactKind", "output_artifact_kind"])
            .or_else(|| string_field(artifact, &["kind", "artifactKind", "artifact_kind"])),
        "title": string_field(artifact, &["title", "artifactTitle", "artifact_title"]),
        "errorCode": string_field(&event.payload, &["errorCode", "error_code"])
            .or_else(|| worker_string_field(worker_metadata, &["errorCode", "error_code"])),
        "errorMessage": message,
        "failureCategory": string_field(&event.payload, &["failureCategory", "failure_category"])
            .or_else(|| worker_string_field(worker_metadata, &["failureCategory", "failure_category"])),
        "retryable": event.payload.get("retryable").and_then(Value::as_bool)
            .or_else(|| worker_bool_field(worker_metadata, &["retryable"])),
        "retryAdvice": string_field(&event.payload, &["retryAdvice", "retry_advice"])
            .or_else(|| worker_string_field(worker_metadata, &["retryAdvice", "retry_advice"])),
        "retryAttempt": event.payload.get("retryAttempt").or_else(|| event.payload.get("retry_attempt")).and_then(Value::as_u64)
            .or_else(|| worker_number_field(worker_metadata, &["retryAttempt", "retry_attempt"])),
        "retryMaxAttempts": event.payload.get("retryMaxAttempts").or_else(|| event.payload.get("retry_max_attempts")).and_then(Value::as_u64)
            .or_else(|| worker_number_field(worker_metadata, &["retryMaxAttempts", "retry_max_attempts"])),
        "updatedAt": event.timestamp,
    }))
}

fn worker_metadata_from_event(event: &AgentEvent) -> Option<&Value> {
    let payload = &event.payload;
    let artifact = payload.get("artifact");
    payload
        .get("agentAppWorker")
        .or_else(|| payload.get("agent_app_worker"))
        .or_else(|| {
            payload
                .get("metadata")
                .and_then(|metadata| metadata.get("agentAppWorker"))
        })
        .or_else(|| {
            payload
                .get("metadata")
                .and_then(|metadata| metadata.get("agent_app_worker"))
        })
        .or_else(|| {
            artifact
                .and_then(|artifact| artifact.get("metadata"))
                .and_then(|metadata| metadata.get("agentAppWorker"))
        })
        .or_else(|| {
            artifact
                .and_then(|artifact| artifact.get("metadata"))
                .and_then(|metadata| metadata.get("agent_app_worker"))
        })
        .filter(|value| value.is_object())
}

fn worker_string_field(value: Option<&Value>, keys: &[&str]) -> Option<String> {
    value.and_then(|value| string_field(value, keys))
}

fn worker_number_field(value: Option<&Value>, keys: &[&str]) -> Option<u64> {
    value.and_then(|value| keys.iter().find_map(|key| value.get(*key)?.as_u64()))
}

fn worker_bool_field(value: Option<&Value>, keys: &[&str]) -> Option<bool> {
    value.and_then(|value| keys.iter().find_map(|key| value.get(*key)?.as_bool()))
}

fn default_layout_state() -> Value {
    json!({
        "activeTabKind": "articleWorkspace",
        "openTabKinds": ["articleWorkspace"],
        "splitMode": "chat-right-dock",
    })
}

fn string_field(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| value.get(*key))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}
