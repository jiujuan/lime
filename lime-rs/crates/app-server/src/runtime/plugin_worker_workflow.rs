use super::timestamp;
use super::RuntimeEvent;
use serde_json::{json, Map, Value};
use std::collections::BTreeSet;

#[derive(Debug, Clone)]
pub(super) struct PluginWorkerWorkflowContext {
    pub(super) app_id: String,
    pub(super) output_artifact_kind: String,
    pub(super) pane_kind: Option<String>,
    pub(super) prompt: String,
    pub(super) session_id: String,
    pub(super) source: String,
    pub(super) source_object_ref: Option<Value>,
    pub(super) steps: Vec<PluginWorkerWorkflowStep>,
    pub(super) surface_kind: Option<String>,
    pub(super) task_id: String,
    pub(super) task_kind: String,
    pub(super) turn_id: String,
    pub(super) workflow_key: String,
    pub(super) workflow_title: Option<String>,
    pub(super) workspace_id: Option<String>,
}

#[derive(Debug, Clone)]
pub(super) struct PluginWorkerWorkflowContextInput<'a> {
    pub(super) app_id: &'a str,
    pub(super) output_artifact_kind: &'a str,
    pub(super) pane_kind: Option<&'a str>,
    pub(super) prompt: &'a str,
    pub(super) session_id: &'a str,
    pub(super) source: &'a str,
    pub(super) source_object_ref: Option<&'a Value>,
    pub(super) steps: Option<&'a Value>,
    pub(super) surface_kind: Option<&'a str>,
    pub(super) task_id: &'a str,
    pub(super) task_kind: &'a str,
    pub(super) turn_id: &'a str,
    pub(super) workflow_key: Option<&'a str>,
    pub(super) workflow_title: Option<&'a str>,
    pub(super) workspace_id: Option<&'a str>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct PluginWorkerWorkflowStep {
    id: String,
    title: String,
    subagent: Option<String>,
    skill_refs: Vec<String>,
    expected_output: Option<String>,
}

pub(super) fn build_plugin_worker_workflow_context(
    input: PluginWorkerWorkflowContextInput<'_>,
) -> Option<PluginWorkerWorkflowContext> {
    let workflow_key = input
        .workflow_key
        .map(str::trim)
        .filter(|value| !value.is_empty())?;
    let steps = workflow_steps_from_value(input.steps);
    if steps.is_empty() {
        return None;
    }

    Some(PluginWorkerWorkflowContext {
        app_id: input.app_id.to_string(),
        output_artifact_kind: input.output_artifact_kind.to_string(),
        pane_kind: input.pane_kind.map(ToString::to_string),
        prompt: input.prompt.to_string(),
        session_id: input.session_id.to_string(),
        source: input.source.to_string(),
        source_object_ref: input.source_object_ref.cloned(),
        steps,
        surface_kind: input.surface_kind.map(ToString::to_string),
        task_id: input.task_id.to_string(),
        task_kind: input.task_kind.to_string(),
        turn_id: input.turn_id.to_string(),
        workflow_key: workflow_key.to_string(),
        workflow_title: input.workflow_title.map(ToString::to_string),
        workspace_id: input.workspace_id.map(ToString::to_string),
    })
}

pub(super) fn workflow_started_events(context: &PluginWorkerWorkflowContext) -> Vec<RuntimeEvent> {
    let mut events = vec![RuntimeEvent::new(
        "workflow.run.started",
        context.run_payload("running"),
    )];
    if let Some(step) = context.steps.first() {
        events.push(RuntimeEvent::new(
            "workflow.step.started",
            context.step_payload(step, 0, "running", None),
        ));
    }
    events
}

pub(super) fn workflow_completed_events(
    context: &PluginWorkerWorkflowContext,
    completion: &Value,
) -> Vec<RuntimeEvent> {
    let mut events = context
        .steps
        .iter()
        .enumerate()
        .map(|(index, step)| {
            RuntimeEvent::new(
                "workflow.step.completed",
                context.step_payload(step, index, "completed", Some(completion.clone())),
            )
        })
        .collect::<Vec<_>>();
    let mut payload = context.run_payload("completed");
    insert_object_field(&mut payload, "completion", completion.clone());
    events.push(RuntimeEvent::new("workflow.run.completed", payload));
    events
}

pub(super) fn workflow_failed_events(
    context: &PluginWorkerWorkflowContext,
    failure: &Value,
) -> Vec<RuntimeEvent> {
    let mut events = Vec::new();
    if let Some(step) = context.steps.first() {
        events.push(RuntimeEvent::new(
            "workflow.step.failed",
            context.step_payload(step, 0, "failed", Some(failure.clone())),
        ));
    }
    let mut payload = context.run_payload("failed");
    insert_object_field(&mut payload, "failure", failure.clone());
    events.push(RuntimeEvent::new("workflow.run.failed", payload));
    events
}

pub(super) fn runtime_event_from_worker_progress_envelope(
    value: &Value,
) -> Result<Option<RuntimeEvent>, String> {
    let Some(kind) = string_field(value, &["kind", "type"]) else {
        return Ok(None);
    };
    if kind != "runtime.event" && kind != "runtime_event" {
        return Ok(None);
    }
    let event_type = string_field(value, &["eventType", "event_type"])
        .ok_or_else(|| "worker progress event missing eventType".to_string())?;
    if !is_allowed_worker_progress_event(event_type.as_str()) {
        return Err(format!(
            "worker progress event type is unsupported: {event_type}"
        ));
    }
    let payload = value
        .get("payload")
        .filter(|payload| payload.is_object())
        .cloned()
        .ok_or_else(|| "worker progress event payload must be an object".to_string())?;
    Ok(Some(RuntimeEvent::new(event_type, payload)))
}

impl PluginWorkerWorkflowContext {
    pub(super) fn bind_worker_progress_event(
        &self,
        event: RuntimeEvent,
    ) -> Result<RuntimeEvent, String> {
        self.bind_workflow_event(event, "worker_progress")
    }

    pub(super) fn bind_internal_workflow_event(
        &self,
        event: RuntimeEvent,
        event_source: &str,
    ) -> Result<RuntimeEvent, String> {
        self.bind_workflow_event(event, event_source)
    }

    pub(super) fn hook_step_id(&self, hook_scope: Option<&str>) -> Result<&str, String> {
        let step = match hook_scope {
            Some("task") | Some("task.complete") | Some("completion") => self.steps.last(),
            _ => self.steps.first(),
        };
        step.map(|step| step.id.as_str())
            .ok_or_else(|| "workflow hook event requires at least one workflow step".to_string())
    }

    pub(super) fn first_step_payload(&self, status: &str, detail: Option<Value>) -> Option<Value> {
        self.steps
            .first()
            .map(|step| self.step_payload(step, 0, status, detail))
    }

    pub(super) fn workflow_run_payload(&self, status: &str) -> Value {
        self.run_payload(status)
    }

    fn bind_workflow_event(
        &self,
        mut event: RuntimeEvent,
        event_source: &str,
    ) -> Result<RuntimeEvent, String> {
        if !event.event_type.starts_with("workflow.") {
            return Ok(event);
        }
        if !is_allowed_worker_progress_event(event.event_type.as_str()) {
            return Err(format!(
                "worker progress event type is unsupported: {}",
                event.event_type
            ));
        }
        if requires_step_binding(event.event_type.as_str()) {
            let step_id = string_field(&event.payload, &["stepId", "step_id"])
                .ok_or_else(|| format!("{} missing stepId", event.event_type))?;
            let (step_index, step) = self
                .steps
                .iter()
                .enumerate()
                .find(|(_, step)| step.id == step_id)
                .ok_or_else(|| {
                    format!(
                        "{} references unknown workflow step: {step_id}",
                        event.event_type
                    )
                })?;
            validate_required_progress_payload(event.event_type.as_str(), &event.payload)?;
            bind_common_workflow_payload(&mut event.payload, self, event_source)?;
            bind_step_workflow_payload(&mut event.payload, self, step, step_index, event_source)?;
        } else {
            bind_common_workflow_payload(&mut event.payload, self, event_source)?;
        }
        Ok(event)
    }

    fn workflow_run_id(&self) -> String {
        format!("{}:workflow", self.task_id)
    }

    fn run_payload(&self, status: &str) -> Value {
        json!({
            "source": "plugin_task_worker",
            "backend": "plugin_worker",
            "appId": self.app_id,
            "sessionId": self.session_id,
            "workspaceId": self.workspace_id,
            "turnId": self.turn_id,
            "taskId": self.task_id,
            "taskKind": self.task_kind,
            "workflowRunId": self.workflow_run_id(),
            "workflowKey": self.workflow_key,
            "workflowTitle": self.workflow_title,
            "status": status,
            "prompt": self.prompt,
            "sourceKind": self.source,
            "surfaceKind": self.surface_kind,
            "paneKind": self.pane_kind,
            "outputArtifactKind": self.output_artifact_kind,
            "selectedObjectRef": self.source_object_ref,
            "steps": self.step_values(status),
            "createdAt": timestamp(),
            "updatedAt": timestamp(),
            "metadata": {
                "pluginWorkflow": {
                    "source": "plugin_worker_workflow",
                    "appId": self.app_id,
                    "workflowRunId": self.workflow_run_id(),
                    "workflowKey": self.workflow_key,
                    "workflowTitle": self.workflow_title,
                    "taskId": self.task_id,
                    "taskKind": self.task_kind,
                    "status": status,
                    "stepCount": self.steps.len(),
                }
            }
        })
    }

    fn step_payload(
        &self,
        step: &PluginWorkerWorkflowStep,
        index: usize,
        status: &str,
        detail: Option<Value>,
    ) -> Value {
        json!({
            "source": "plugin_task_worker",
            "backend": "plugin_worker",
            "appId": self.app_id,
            "sessionId": self.session_id,
            "workspaceId": self.workspace_id,
            "turnId": self.turn_id,
            "taskId": self.task_id,
            "taskKind": self.task_kind,
            "workflowRunId": self.workflow_run_id(),
            "workflowKey": self.workflow_key,
            "workflowTitle": self.workflow_title,
            "stepId": step.id,
            "stepTitle": step.title,
            "stepIndex": index,
            "stepCount": self.steps.len(),
            "subagent": step.subagent,
            "skillRefs": step.skill_refs,
            "expectedOutput": step.expected_output,
            "status": status,
            "detail": detail,
            "updatedAt": timestamp(),
            "metadata": {
                "pluginWorkflow": {
                    "source": "plugin_worker_workflow",
                    "appId": self.app_id,
                    "workflowRunId": self.workflow_run_id(),
                    "workflowKey": self.workflow_key,
                    "workflowTitle": self.workflow_title,
                    "taskId": self.task_id,
                    "taskKind": self.task_kind,
                    "stepId": step.id,
                    "stepTitle": step.title,
                    "stepIndex": index,
                    "stepCount": self.steps.len(),
                    "status": status,
                }
            }
        })
    }

    fn step_values(&self, run_status: &str) -> Vec<Value> {
        self.steps
            .iter()
            .enumerate()
            .map(|(index, step)| {
                let status = if run_status == "completed" {
                    "completed"
                } else if run_status == "failed" && index == 0 {
                    "failed"
                } else if run_status == "running" && index == 0 {
                    "running"
                } else {
                    "pending"
                };
                json!({
                    "id": step.id,
                    "title": step.title,
                    "status": status,
                    "index": index,
                    "subagent": step.subagent,
                    "skillRefs": step.skill_refs,
                    "expectedOutput": step.expected_output,
                })
            })
            .collect()
    }
}

pub(super) fn workflow_connector_completed_events_from_artifact_events(
    context: &PluginWorkerWorkflowContext,
    events: &[RuntimeEvent],
) -> Result<Vec<RuntimeEvent>, String> {
    let mut seen = BTreeSet::new();
    let mut completed_events = Vec::new();
    for evidence in host_search_evidence_from_artifact_events(events) {
        let request_id = string_field(&evidence, &["requestId", "request_id"]);
        let tool_call_id = string_field(&evidence, &["toolCallId", "tool_call_id"]);
        let query = string_field(&evidence, &["query"]);
        let round_id = string_field(&evidence, &["roundId", "round_id"]);
        let purpose = string_field(&evidence, &["purpose"]);
        let summary = string_field(&evidence, &["summary"]);
        let key = format!(
            "{}\u{1f}{}\u{1f}{}",
            request_id.as_deref().unwrap_or_default(),
            tool_call_id.as_deref().unwrap_or_default(),
            query.as_deref().unwrap_or_default()
        );
        if !seen.insert(key) {
            continue;
        }

        let connector_ref = string_field(&evidence, &["connectorRef", "connector_ref"])
            .unwrap_or_else(|| "web-research".to_string());
        let tool_name = string_field(&evidence, &["tool", "toolName", "tool_name"])
            .unwrap_or_else(|| "WebSearch".to_string());
        let status =
            string_field(&evidence, &["status"]).unwrap_or_else(|| "completed".to_string());
        let mut payload = json!({
            "stepId": "research",
            "connectorRef": connector_ref,
            "toolName": tool_name,
            "status": status,
            "auditOnly": true,
            "result": evidence,
        });
        insert_optional_string(&mut payload, "requestId", request_id);
        insert_optional_string(&mut payload, "roundId", round_id);
        insert_optional_string(&mut payload, "toolCallId", tool_call_id);
        insert_optional_string(&mut payload, "query", query);
        insert_optional_string(&mut payload, "purpose", purpose);
        insert_optional_string(&mut payload, "summary", summary);

        completed_events.push(context.bind_workflow_event(
            RuntimeEvent::new("workflow.connector.completed", payload),
            "workspace_patch_host_search",
        )?);
    }
    Ok(completed_events)
}

fn workflow_steps_from_value(value: Option<&Value>) -> Vec<PluginWorkerWorkflowStep> {
    let Some(items) = value.and_then(Value::as_array) else {
        return Vec::new();
    };
    items
        .iter()
        .filter_map(workflow_step_from_value)
        .collect::<Vec<_>>()
}

fn workflow_step_from_value(value: &Value) -> Option<PluginWorkerWorkflowStep> {
    let id = string_field(value, &["id", "key"])?;
    Some(PluginWorkerWorkflowStep {
        title: string_field(value, &["title", "name"]).unwrap_or_else(|| id.clone()),
        subagent: string_field(value, &["subagent", "subAgent"]),
        skill_refs: string_list_field(value, &["skillRefs", "skill_refs"]),
        expected_output: string_field(value, &["expectedOutput", "expected_output"]),
        id,
    })
}

fn is_allowed_worker_progress_event(event_type: &str) -> bool {
    matches!(
        event_type,
        "workflow.step.progress"
            | "workflow.tool.started"
            | "workflow.tool.completed"
            | "workflow.connector.requested"
            | "workflow.connector.completed"
            | "workflow.hook.started"
            | "workflow.hook.completed"
            | "workflow.artifact.delta"
            | "artifact.snapshot"
    )
}

fn requires_step_binding(event_type: &str) -> bool {
    matches!(
        event_type,
        "workflow.step.progress"
            | "workflow.tool.started"
            | "workflow.tool.completed"
            | "workflow.connector.requested"
            | "workflow.connector.completed"
            | "workflow.hook.started"
            | "workflow.hook.completed"
            | "workflow.artifact.delta"
    )
}

fn validate_required_progress_payload(event_type: &str, payload: &Value) -> Result<(), String> {
    if event_type.starts_with("workflow.tool.")
        && string_field(payload, &["toolName", "tool_name", "name"]).is_none()
    {
        return Err(format!("{event_type} missing toolName"));
    }
    if event_type.starts_with("workflow.connector.")
        && string_field(payload, &["connectorRef", "connector_ref"]).is_none()
    {
        return Err(format!("{event_type} missing connectorRef"));
    }
    if event_type.starts_with("workflow.hook.")
        && string_field(payload, &["hookKey", "hook_key"]).is_none()
    {
        return Err(format!("{event_type} missing hookKey"));
    }
    Ok(())
}

fn bind_common_workflow_payload(
    payload: &mut Value,
    context: &PluginWorkerWorkflowContext,
    event_source: &str,
) -> Result<(), String> {
    ensure_object_field(payload, "source", json!("plugin_task_worker"))?;
    ensure_object_field(payload, "backend", json!("plugin_worker"))?;
    ensure_object_field(payload, "appId", json!(context.app_id))?;
    ensure_object_field(payload, "sessionId", json!(context.session_id))?;
    ensure_object_field(payload, "workspaceId", json!(context.workspace_id))?;
    ensure_object_field(payload, "turnId", json!(context.turn_id))?;
    ensure_object_field(payload, "taskId", json!(context.task_id))?;
    ensure_object_field(payload, "taskKind", json!(context.task_kind))?;
    ensure_object_field(payload, "workflowRunId", json!(context.workflow_run_id()))?;
    ensure_object_field(payload, "workflowKey", json!(context.workflow_key))?;
    ensure_object_field(payload, "workflowTitle", json!(context.workflow_title))?;
    ensure_plugin_workflow_metadata(payload, context, None, None, event_source)
}

fn bind_step_workflow_payload(
    payload: &mut Value,
    context: &PluginWorkerWorkflowContext,
    step: &PluginWorkerWorkflowStep,
    step_index: usize,
    event_source: &str,
) -> Result<(), String> {
    ensure_object_field(payload, "stepId", json!(step.id))?;
    ensure_object_field(payload, "stepTitle", json!(step.title))?;
    ensure_object_field(payload, "stepIndex", json!(step_index))?;
    ensure_object_field(payload, "stepCount", json!(context.steps.len()))?;
    ensure_object_field(payload, "subagent", json!(step.subagent))?;
    ensure_object_field(payload, "skillRefs", json!(step.skill_refs))?;
    ensure_object_field(payload, "expectedOutput", json!(step.expected_output))?;
    ensure_plugin_workflow_metadata(payload, context, Some(step), Some(step_index), event_source)
}

fn ensure_plugin_workflow_metadata(
    payload: &mut Value,
    context: &PluginWorkerWorkflowContext,
    step: Option<&PluginWorkerWorkflowStep>,
    step_index: Option<usize>,
    event_source: &str,
) -> Result<(), String> {
    let object = payload
        .as_object_mut()
        .ok_or_else(|| "worker progress event payload must be an object".to_string())?;
    let metadata = object.entry("metadata").or_insert_with(|| json!({}));
    if !metadata.is_object() {
        *metadata = json!({});
    }
    let metadata_object = metadata
        .as_object_mut()
        .ok_or_else(|| "worker progress metadata must be an object".to_string())?;
    let mut workflow_metadata = json!({
        "source": "plugin_worker_workflow",
        "eventSource": event_source,
        "appId": context.app_id,
        "workflowRunId": context.workflow_run_id(),
        "workflowKey": context.workflow_key,
        "workflowTitle": context.workflow_title,
        "taskId": context.task_id,
        "taskKind": context.task_kind,
        "stepCount": context.steps.len(),
    });
    if let (Some(step), Some(step_index)) = (step, step_index) {
        insert_object_field(&mut workflow_metadata, "stepId", json!(step.id));
        insert_object_field(&mut workflow_metadata, "stepTitle", json!(step.title));
        insert_object_field(&mut workflow_metadata, "stepIndex", json!(step_index));
    }
    metadata_object.insert("pluginWorkflow".to_string(), workflow_metadata);
    Ok(())
}

fn ensure_object_field(payload: &mut Value, key: &str, expected: Value) -> Result<(), String> {
    let object = payload
        .as_object_mut()
        .ok_or_else(|| "worker progress event payload must be an object".to_string())?;
    match object.get(key) {
        Some(existing) if field_is_empty(existing) => {
            object.insert(key.to_string(), expected);
            Ok(())
        }
        Some(existing) if existing == &expected => Ok(()),
        Some(existing) => Err(format!(
            "worker progress event field {key} conflicts with workflow context: expected {expected}, got {existing}"
        )),
        None => {
            object.insert(key.to_string(), expected);
            Ok(())
        }
    }
}

fn field_is_empty(value: &Value) -> bool {
    value.is_null() || value.as_str().map(str::trim).unwrap_or_default().is_empty()
}

fn string_field(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .filter_map(|key| value.get(*key))
        .find_map(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn string_list_field(value: &Value, keys: &[&str]) -> Vec<String> {
    keys.iter()
        .filter_map(|key| value.get(*key))
        .find_map(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToString::to_string)
                .fold(Vec::new(), |mut result, value| {
                    if !result.iter().any(|existing| existing == &value) {
                        result.push(value);
                    }
                    result
                })
        })
        .unwrap_or_default()
}

fn insert_object_field(value: &mut Value, key: &str, field: Value) {
    if let Some(object) = value.as_object_mut() {
        object.insert(key.to_string(), field);
        return;
    }
    let mut object = Map::new();
    object.insert(key.to_string(), field);
    *value = Value::Object(object);
}

fn insert_optional_string(value: &mut Value, key: &str, field: Option<String>) {
    if let Some(field) = field {
        insert_object_field(value, key, json!(field));
    }
}

fn host_search_evidence_from_artifact_events(events: &[RuntimeEvent]) -> Vec<Value> {
    events
        .iter()
        .filter(|event| event.event_type == "artifact.snapshot")
        .flat_map(|event| {
            let artifact = event.payload.get("artifact").unwrap_or(&event.payload);
            workspace_patch_from_artifact(artifact)
                .into_iter()
                .flat_map(|patch| host_search_evidence_from_workspace_patch(&patch))
                .collect::<Vec<_>>()
        })
        .collect()
}

fn workspace_patch_from_artifact(artifact: &Value) -> Option<Value> {
    artifact
        .get("metadata")
        .and_then(|metadata| metadata.get("contentFactoryWorkspacePatch"))
        .cloned()
        .or_else(|| {
            artifact
                .get("metadata")
                .and_then(|metadata| metadata.get("workspace_patch"))
                .cloned()
        })
        .or_else(|| artifact.get("contentFactoryWorkspacePatch").cloned())
        .or_else(|| artifact.get("workspace_patch").cloned())
}

fn host_search_evidence_from_workspace_patch(patch: &Value) -> Vec<Value> {
    patch
        .get("objects")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|object| object.get("source"))
        .filter_map(|source| source.get("hostSearchEvidence"))
        .filter_map(Value::as_array)
        .flat_map(|items| items.iter().filter(|item| item.is_object()).cloned())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_workflow_lifecycle_from_manifest_steps() {
        let steps = json!([
            {
                "id": "research",
                "title": "资料检索",
                "subagent": "content-researcher",
                "skillRefs": ["article-research"],
                "expectedOutput": "写作依据"
            },
            {
                "id": "draft",
                "title": "正文写作",
                "subagent": "article-writer",
                "skillRefs": ["article-writing"],
                "expectedOutput": "articleDraft"
            }
        ]);
        let context = build_plugin_worker_workflow_context(PluginWorkerWorkflowContextInput {
            app_id: "content-factory-app",
            output_artifact_kind: "content_factory.workspace_patch",
            pane_kind: Some("articleDraft"),
            prompt: "写一篇文章",
            session_id: "session-1",
            source: "plugin_activation_context",
            source_object_ref: None,
            steps: Some(&steps),
            surface_kind: Some("articleWorkspace"),
            task_id: "turn-1:content_article_generate",
            task_kind: "content.article.generate",
            turn_id: "turn-1",
            workflow_key: Some("content_article_workflow"),
            workflow_title: Some("写文章工作流"),
            workspace_id: Some("workspace-main"),
        })
        .expect("workflow context");

        let started = workflow_started_events(&context);
        assert_eq!(started[0].event_type, "workflow.run.started");
        assert_eq!(started[0].payload["steps"][0]["status"], "running");
        assert_eq!(started[1].event_type, "workflow.step.started");
        assert_eq!(started[1].payload["stepId"], "research");

        let completed = workflow_completed_events(&context, &json!({"artifactCount": 1}));
        assert_eq!(completed[0].event_type, "workflow.step.completed");
        assert_eq!(completed[1].payload["stepId"], "draft");
        assert_eq!(
            completed.last().expect("run completed").event_type,
            "workflow.run.completed"
        );
    }

    #[test]
    fn accepts_only_worker_progress_runtime_events() {
        let event = runtime_event_from_worker_progress_envelope(&json!({
            "kind": "runtime.event",
            "eventType": "workflow.step.progress",
            "payload": {
                "workflowRunId": "run-1",
                "stepId": "draft"
            }
        }))
        .expect("valid envelope")
        .expect("runtime event");

        assert_eq!(event.event_type, "workflow.step.progress");
        assert_eq!(event.payload["stepId"], "draft");

        let artifact_event = runtime_event_from_worker_progress_envelope(&json!({
            "kind": "runtime.event",
            "eventType": "artifact.snapshot",
            "payload": {
                "artifact": {
                    "artifactId": "artifact-workspace-patch",
                    "path": ".lime/artifacts/content-factory/workspace-patch.json"
                }
            }
        }))
        .expect("valid artifact envelope")
        .expect("artifact runtime event");

        assert_eq!(artifact_event.event_type, "artifact.snapshot");
        assert_eq!(
            artifact_event.payload["artifact"]["artifactId"],
            "artifact-workspace-patch"
        );

        assert!(runtime_event_from_worker_progress_envelope(&json!({
            "kind": "runtime.event",
            "eventType": "turn.completed",
            "payload": {}
        }))
        .is_err());
    }

    #[test]
    fn binds_worker_tool_progress_to_declared_workflow_step() {
        let steps = json!([
            {
                "id": "research",
                "title": "资料检索",
                "subagent": "content-researcher",
                "skillRefs": ["article-research"],
                "expectedOutput": "写作依据"
            }
        ]);
        let context = build_plugin_worker_workflow_context(PluginWorkerWorkflowContextInput {
            app_id: "content-factory-app",
            output_artifact_kind: "content_factory.workspace_patch",
            pane_kind: Some("articleDraft"),
            prompt: "写一篇文章",
            session_id: "session-1",
            source: "plugin_activation_context",
            source_object_ref: None,
            steps: Some(&steps),
            surface_kind: Some("articleWorkspace"),
            task_id: "turn-1:content_article_generate",
            task_kind: "content.article.generate",
            turn_id: "turn-1",
            workflow_key: Some("content_article_workflow"),
            workflow_title: Some("写文章工作流"),
            workspace_id: Some("workspace-main"),
        })
        .expect("workflow context");

        let event = context
            .bind_worker_progress_event(RuntimeEvent::new(
                "workflow.tool.completed",
                json!({
                    "stepId": "research",
                    "toolName": "WebSearch",
                    "query": "Go 学习路线"
                }),
            ))
            .expect("bound worker progress event");

        assert_eq!(
            event.payload["workflowRunId"],
            "turn-1:content_article_generate:workflow"
        );
        assert_eq!(event.payload["workflowKey"], "content_article_workflow");
        assert_eq!(event.payload["stepTitle"], "资料检索");
        assert_eq!(event.payload["stepIndex"], 0);
        assert_eq!(event.payload["stepCount"], 1);
        assert_eq!(
            event.payload["metadata"]["pluginWorkflow"]["eventSource"],
            "worker_progress"
        );
        assert_eq!(
            event.payload["metadata"]["pluginWorkflow"]["stepId"],
            "research"
        );
    }

    #[test]
    fn builds_connector_completed_audit_events_from_host_search_evidence() {
        let steps = json!([
            {
                "id": "research",
                "title": "资料检索",
                "subagent": "content-researcher",
                "skillRefs": ["article-research"],
                "expectedOutput": "写作依据"
            }
        ]);
        let context = build_plugin_worker_workflow_context(PluginWorkerWorkflowContextInput {
            app_id: "content-factory-app",
            output_artifact_kind: "content_factory.workspace_patch",
            pane_kind: Some("articleDraft"),
            prompt: "写一篇文章",
            session_id: "session-1",
            source: "plugin_activation_context",
            source_object_ref: None,
            steps: Some(&steps),
            surface_kind: Some("articleWorkspace"),
            task_id: "turn-1:content_article_generate",
            task_kind: "content.article.generate",
            turn_id: "turn-1",
            workflow_key: Some("content_article_workflow"),
            workflow_title: Some("写文章工作流"),
            workspace_id: Some("workspace-main"),
        })
        .expect("workflow context");
        let events = vec![RuntimeEvent::new(
            "artifact.snapshot",
            json!({
                "artifact": {
                    "metadata": {
                        "contentFactoryWorkspacePatch": {
                            "objects": [
                                {
                                    "ref": { "kind": "articleDraft" },
                                    "source": {
                                        "hostSearchEvidence": [
                                            {
                                                "requestId": "search-request-1",
                                                "roundId": "research-round-1",
                                                "connectorRef": "web-research",
                                                "tool": "WebSearch",
                                                "toolCallId": "content-factory-web-search-1",
                                                "status": "completed",
                                                "query": "Lime 写文章",
                                                "purpose": "确认主题",
                                                "summary": "found",
                                                "output": "result body"
                                            }
                                        ]
                                    }
                                },
                                {
                                    "ref": { "kind": "imageGenerationSet" },
                                    "source": {
                                        "hostSearchEvidence": [
                                            {
                                                "requestId": "search-request-1",
                                                "roundId": "research-round-1",
                                                "connectorRef": "web-research",
                                                "tool": "WebSearch",
                                                "toolCallId": "content-factory-web-search-1",
                                                "status": "completed",
                                                "query": "Lime 写文章",
                                                "summary": "duplicate object evidence"
                                            }
                                        ]
                                    }
                                }
                            ]
                        }
                    }
                }
            }),
        )];

        let audit_events =
            workflow_connector_completed_events_from_artifact_events(&context, &events)
                .expect("connector completed audit events");

        assert_eq!(audit_events.len(), 1);
        let event = &audit_events[0];
        assert_eq!(event.event_type, "workflow.connector.completed");
        assert_eq!(
            event.payload["workflowRunId"],
            "turn-1:content_article_generate:workflow"
        );
        assert_eq!(event.payload["stepId"], "research");
        assert_eq!(event.payload["stepTitle"], "资料检索");
        assert_eq!(event.payload["connectorRef"], "web-research");
        assert_eq!(event.payload["toolName"], "WebSearch");
        assert_eq!(event.payload["requestId"], "search-request-1");
        assert_eq!(event.payload["status"], "completed");
        assert_eq!(event.payload["auditOnly"], true);
        assert_eq!(event.payload["result"]["output"], "result body");
        assert_eq!(
            event.payload["metadata"]["pluginWorkflow"]["eventSource"],
            "workspace_patch_host_search"
        );
    }

    #[test]
    fn rejects_worker_tool_progress_without_declared_step() {
        let steps = json!([
            {
                "id": "research",
                "title": "资料检索"
            }
        ]);
        let context = build_plugin_worker_workflow_context(PluginWorkerWorkflowContextInput {
            app_id: "content-factory-app",
            output_artifact_kind: "content_factory.workspace_patch",
            pane_kind: Some("articleDraft"),
            prompt: "写一篇文章",
            session_id: "session-1",
            source: "plugin_activation_context",
            source_object_ref: None,
            steps: Some(&steps),
            surface_kind: Some("articleWorkspace"),
            task_id: "turn-1:content_article_generate",
            task_kind: "content.article.generate",
            turn_id: "turn-1",
            workflow_key: Some("content_article_workflow"),
            workflow_title: Some("写文章工作流"),
            workspace_id: Some("workspace-main"),
        })
        .expect("workflow context");

        let error = context
            .bind_worker_progress_event(RuntimeEvent::new(
                "workflow.tool.completed",
                json!({
                    "stepId": "unknown-step",
                    "toolName": "WebSearch"
                }),
            ))
            .expect_err("unknown step must fail closed");

        assert!(error.contains("unknown workflow step"));
    }

    #[test]
    fn does_not_create_workflow_context_without_plugin_declaration() {
        let steps = json!([]);
        let context = build_plugin_worker_workflow_context(PluginWorkerWorkflowContextInput {
            app_id: "content-factory-app",
            output_artifact_kind: "content_factory.workspace_patch",
            pane_kind: Some("articleDraft"),
            prompt: "写一篇文章",
            session_id: "session-1",
            source: "plugin_activation_context",
            source_object_ref: None,
            steps: Some(&steps),
            surface_kind: Some("articleWorkspace"),
            task_id: "turn-1:content_article_generate",
            task_kind: "content.article.generate",
            turn_id: "turn-1",
            workflow_key: None,
            workflow_title: None,
            workspace_id: Some("workspace-main"),
        });

        assert!(context.is_none());
    }
}
