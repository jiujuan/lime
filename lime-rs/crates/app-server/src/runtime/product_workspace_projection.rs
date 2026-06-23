use app_server_protocol::AgentEvent;
use app_server_protocol::AgentSession;
use serde_json::{json, Map, Value};
use std::collections::BTreeMap;

const DEFAULT_SCHEMA_VERSION: &str = "product-workspace.v1";

pub(super) fn product_workspace_from_events(
    session: &AgentSession,
    events: &[AgentEvent],
) -> Option<Value> {
    let mut workspace = ProductWorkspaceBuilder::new(session);
    for event in events {
        for patch in workspace_patches_from_event(event) {
            workspace.apply_patch(event, &patch);
        }
    }
    workspace.into_value()
}

pub(super) fn apply_session_selection(
    product_workspace: Option<Value>,
    session: &AgentSession,
) -> Option<Value> {
    let mut product_workspace = product_workspace?;
    let Some(selected_object_ref) = session_product_workspace_selected_object_ref(session) else {
        return Some(product_workspace);
    };
    if !workspace_contains_object_ref(&product_workspace, &selected_object_ref) {
        return Some(product_workspace);
    }
    if let Some(object) = product_workspace.as_object_mut() {
        object.insert("selectedObjectRef".to_string(), selected_object_ref);
    }
    Some(product_workspace)
}

struct ProductWorkspaceBuilder<'a> {
    session: &'a AgentSession,
    app_id: Option<String>,
    objects: BTreeMap<String, Value>,
    object_order: Vec<String>,
    primary_object_ref: Option<Value>,
    selected_object_ref: Option<Value>,
    layout_state: Option<Value>,
    source_artifacts: Vec<Value>,
    updated_at: Option<String>,
}

impl<'a> ProductWorkspaceBuilder<'a> {
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
            let Some(key) = product_object_key(object) else {
                continue;
            };
            if !self.objects.contains_key(&key) {
                self.object_order.push(key.clone());
            }
            self.objects.insert(key, object.clone());
        }

        if let Some(source_artifact) = source_artifact_from_event(event) {
            self.source_artifacts.push(source_artifact);
        }
        self.updated_at = Some(event.timestamp.clone());
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
        if let Some(updated_at) = self.updated_at {
            value.insert("updatedAt".to_string(), json!(updated_at));
        }
        Some(Value::Object(value))
    }
}

fn workspace_patches_from_event(event: &AgentEvent) -> Vec<Value> {
    let payload = &event.payload;
    let artifact = payload.get("artifact");
    let metadata = payload.get("metadata");
    let artifact_metadata = artifact.and_then(|artifact| artifact.get("metadata"));

    let mut patches = Vec::new();
    for candidate in [
        payload.get("productWorkspace"),
        payload.get("product_workspace"),
        payload.get("workspacePatch"),
        payload.get("workspace_patch"),
        payload.get("contentFactoryWorkspacePatch"),
        metadata.and_then(|value| value.get("productWorkspace")),
        metadata.and_then(|value| value.get("product_workspace")),
        metadata.and_then(|value| value.get("workspacePatch")),
        metadata.and_then(|value| value.get("workspace_patch")),
        metadata.and_then(|value| value.get("contentFactoryWorkspacePatch")),
        artifact.and_then(|value| value.get("productWorkspace")),
        artifact.and_then(|value| value.get("product_workspace")),
        artifact.and_then(|value| value.get("workspacePatch")),
        artifact.and_then(|value| value.get("workspace_patch")),
        artifact.and_then(|value| value.get("contentFactoryWorkspacePatch")),
        artifact_metadata.and_then(|value| value.get("productWorkspace")),
        artifact_metadata.and_then(|value| value.get("product_workspace")),
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

fn product_object_key(object: &Value) -> Option<String> {
    let reference = object.get("ref").or_else(|| object.get("objectRef"))?;
    product_object_ref_key(reference)
}

fn product_object_ref_key(reference: &Value) -> Option<String> {
    let app_id = string_field(reference, &["appId", "app_id"])?;
    let kind = string_field(reference, &["kind"])?;
    let id = string_field(reference, &["id"])?;
    let session_id = string_field(reference, &["sessionId", "session_id"])?;
    Some(format!("{app_id}:{session_id}:{kind}:{id}"))
}

fn workspace_contains_object_ref(product_workspace: &Value, reference: &Value) -> bool {
    let Some(reference_key) = product_object_ref_key(reference) else {
        return false;
    };
    product_workspace
        .get("objects")
        .and_then(Value::as_array)
        .is_some_and(|objects| {
            objects
                .iter()
                .filter_map(product_object_key)
                .any(|object_key| object_key == reference_key)
        })
}

fn session_product_workspace_selected_object_ref(session: &AgentSession) -> Option<Value> {
    session
        .business_object_ref
        .as_ref()
        .and_then(|reference| reference.metadata.as_ref())
        .and_then(|metadata| {
            object_ref_field(
                metadata,
                &[
                    "productWorkspaceSelectedObjectRef",
                    "product_workspace_selected_object_ref",
                ],
            )
        })
}

fn object_ref_field(value: &Value, keys: &[&str]) -> Option<Value> {
    keys.iter()
        .find_map(|key| value.get(*key))
        .filter(|value| product_object_ref_is_valid(value))
        .cloned()
}

fn product_object_ref_is_valid(value: &Value) -> bool {
    string_field(value, &["appId", "app_id"]).is_some()
        && string_field(value, &["kind"]).is_some()
        && string_field(value, &["id"]).is_some()
        && string_field(value, &["sessionId", "session_id"]).is_some()
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

fn default_layout_state() -> Value {
    json!({
        "activeTabKind": "productProfile",
        "openTabKinds": ["productProfile"],
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
