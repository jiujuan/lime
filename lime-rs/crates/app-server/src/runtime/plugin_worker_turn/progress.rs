use super::super::plugin_worker_streaming::ensure_workspace_patch_artifact_paths;
use super::super::plugin_worker_workflow::PluginWorkerWorkflowContext;
use super::super::{ExecutionRequest, RuntimeCoreError, RuntimeEvent, RuntimeEventSink};
use super::json_helpers::json_string;
use super::PaneActionWorkerTurn;
use serde_json::{json, Value};
use std::time::Duration;

pub(super) fn worker_progress_events_for_sink(
    event: RuntimeEvent,
    workflow_context: Option<&PluginWorkerWorkflowContext>,
) -> Result<Vec<RuntimeEvent>, RuntimeCoreError> {
    if event.event_type.starts_with("workflow.") {
        let context = workflow_context.ok_or_else(|| {
            RuntimeCoreError::Backend(format!(
                "Plugin worker emitted {} without plugin workflow context",
                event.event_type
            ))
        })?;
        return context
            .bind_worker_progress_event(event)
            .map(|event| vec![event])
            .map_err(RuntimeCoreError::Backend);
    }
    if event.event_type != "artifact.snapshot" {
        return Ok(vec![event]);
    }
    let mut events = vec![event];
    ensure_workspace_patch_artifact_paths(events.as_mut_slice());
    Ok(events)
}

pub(super) fn emit_worker_progress_events(
    sink: &mut dyn RuntimeEventSink,
    events: Vec<RuntimeEvent>,
) -> Result<(), RuntimeCoreError> {
    let total = events.len();
    for (index, event) in events.into_iter().enumerate() {
        sink.emit(event)?;
        if total > 1 && index + 1 < total {
            std::thread::sleep(Duration::from_millis(80));
        }
    }
    Ok(())
}

pub(super) fn split_workflow_audit_events(
    events: Vec<RuntimeEvent>,
) -> (Vec<RuntimeEvent>, Vec<RuntimeEvent>) {
    let mut audit_events = Vec::new();
    let mut ui_events = Vec::new();
    for event in events {
        if is_workflow_audit_event_type(event.event_type.as_str()) {
            audit_events.push(event);
        } else {
            ui_events.push(event);
        }
    }
    (audit_events, ui_events)
}

fn is_workflow_audit_event_type(event_type: &str) -> bool {
    event_type.starts_with("workflow.")
}

pub(super) fn is_streaming_workspace_patch_snapshot(event: &RuntimeEvent) -> bool {
    if event.event_type != "artifact.snapshot" {
        return false;
    }
    let Some(artifact) = event.payload.get("artifact") else {
        return false;
    };
    artifact
        .get("metadata")
        .and_then(|metadata| metadata.get("complete"))
        .and_then(Value::as_bool)
        == Some(false)
        && (artifact
            .get("metadata")
            .and_then(|metadata| metadata.get("contentFactoryWorkspacePatch"))
            .is_some()
            || artifact
                .get("metadata")
                .and_then(|metadata| metadata.get("workspace_patch"))
                .is_some())
}

pub(super) fn worker_completion_context(events: &[RuntimeEvent]) -> Value {
    let artifact_refs = events
        .iter()
        .filter(|event| event.event_type == "artifact.snapshot")
        .filter_map(|event| {
            let artifact = event.payload.get("artifact").unwrap_or(&event.payload);
            json_string(
                artifact,
                &[
                    "artifactId",
                    "artifact_id",
                    "artifactRef",
                    "artifact_ref",
                    "path",
                ],
            )
        })
        .collect::<Vec<_>>();
    let artifact_count = artifact_refs.len();
    json!({
        "status": "completed",
        "artifactRefs": artifact_refs,
        "artifactCount": artifact_count,
    })
}

pub(super) fn assistant_message_events_from_worker_events(
    request: &ExecutionRequest,
    worker_turn: &PaneActionWorkerTurn,
    events: &[RuntimeEvent],
) -> Vec<RuntimeEvent> {
    let Some(text) = final_article_document_text_from_events(events) else {
        return Vec::new();
    };
    let task_id = worker_turn.task_id(request.turn.turn_id.as_str());
    vec![RuntimeEvent::new(
        "message.delta",
        json!({
            "backend": "plugin_worker",
            "source": "plugin_task_worker",
            "role": "assistant",
            "type": "text_delta",
            "text": text,
            "delta": text,
            "phase": "final_answer",
            "messagePhase": "final_answer",
            "message_phase": "final_answer",
            "itemId": format!("{}:plugin-worker:final-answer", request.turn.turn_id),
            "item_id": format!("{}:plugin-worker:final-answer", request.turn.turn_id),
            "sessionId": request.session.session_id,
            "session_id": request.session.session_id,
            "threadId": request.session.thread_id,
            "thread_id": request.session.thread_id,
            "turnId": request.turn.turn_id,
            "turn_id": request.turn.turn_id,
            "appId": worker_turn.app_id,
            "taskId": task_id,
            "taskKind": worker_turn.task_kind,
            "outputArtifactKind": worker_turn.output_artifact_kind(),
            "metadata": {
                "pluginWorker": {
                    "appId": worker_turn.app_id,
                    "taskId": task_id,
                    "taskKind": worker_turn.task_kind,
                    "turnId": request.turn.turn_id,
                    "source": worker_turn.source,
                    "surfaceKind": worker_turn.surface_kind,
                    "paneKind": worker_turn.pane_kind,
                    "outputArtifactKind": worker_turn.output_artifact_kind(),
                    "status": "completed",
                }
            },
        }),
    )]
}

fn final_article_document_text_from_events(events: &[RuntimeEvent]) -> Option<String> {
    events
        .iter()
        .rev()
        .filter(|event| event.event_type == "artifact.snapshot")
        .filter(|event| !is_streaming_workspace_patch_snapshot(event))
        .find_map(|event| {
            let artifact = event.payload.get("artifact").unwrap_or(&event.payload);
            let patch = workspace_patch_from_artifact(artifact)?;
            article_document_text_from_workspace_patch(patch)
        })
}

fn workspace_patch_from_artifact(artifact: &Value) -> Option<&Value> {
    artifact
        .get("metadata")
        .and_then(|metadata| metadata.get("contentFactoryWorkspacePatch"))
        .or_else(|| {
            artifact
                .get("metadata")
                .and_then(|metadata| metadata.get("workspace_patch"))
        })
        .or_else(|| artifact.get("contentFactoryWorkspacePatch"))
        .or_else(|| artifact.get("workspace_patch"))
}

fn article_document_text_from_workspace_patch(patch: &Value) -> Option<String> {
    patch
        .get("objects")
        .and_then(Value::as_array)?
        .iter()
        .filter(|object| {
            object
                .get("ref")
                .and_then(|ref_value| {
                    json_string(ref_value, &["kind", "object_kind", "objectKind"])
                })
                .as_deref()
                == Some("articleDraft")
        })
        .filter_map(|object| object.get("source"))
        .find_map(|source| {
            json_text_preserving(source, &["documentText", "document_text"])
                .or_else(|| json_text_preserving(source, &["finalMarkdown", "final_markdown"]))
        })
}

fn json_text_preserving(value: &Value, path: &[&str]) -> Option<String> {
    for key in path {
        let Some(raw) = value.get(*key).and_then(Value::as_str) else {
            continue;
        };
        if raw.trim().is_empty() {
            continue;
        }
        return Some(raw.to_string());
    }
    None
}
