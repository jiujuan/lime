use super::load_context::SessionLoadContext;
use super::thread_item_projection::media_result::{
    item_from_task_record, MediaTaskRecordProjectionInput,
};
use super::{metadata_string, string_field, RuntimeCore, StoredSession};
use app_server_protocol::{AgentSession, MediaTaskArtifactListParams, MediaTaskArtifactResponse};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::path::Path;

impl RuntimeCore {
    pub(in crate::runtime) async fn enrich_session_load_context_with_media_task_results(
        &self,
        context: &mut SessionLoadContext,
    ) {
        let Some(workspace_root) = workspace_root_for_session_detail(
            context.response.detail.as_ref(),
            &context.stored.session,
        ) else {
            return;
        };
        let Ok(response) = self
            .app_data_source
            .list_media_task_artifacts(MediaTaskArtifactListParams {
                project_root_path: workspace_root,
                status: None,
                task_family: None,
                task_type: Some("image_generate".to_string()),
                modality_contract_key: None,
                routing_outcome: None,
                limit: None,
            })
            .await
        else {
            return;
        };
        enrich_detail_with_media_tasks(
            &context.stored,
            context.response.detail.as_mut(),
            response.tasks,
        );
    }
}

fn enrich_detail_with_media_tasks(
    stored: &StoredSession,
    detail: Option<&mut Value>,
    tasks: Vec<MediaTaskArtifactResponse>,
) {
    let Some(detail) = detail else {
        return;
    };
    let Some(detail_object) = detail.as_object_mut() else {
        return;
    };
    let items = detail_object.entry("items").or_insert_with(|| json!([]));
    let Some(items) = items.as_array_mut() else {
        return;
    };
    let mut known_item_ids = items
        .iter()
        .filter_map(|item| string_field(item, &["id"]))
        .collect::<HashSet<_>>();
    let mut next_sequence = next_media_task_sequence(stored, items);

    for task in tasks {
        let Some(item) = media_task_item(stored, &task, next_sequence) else {
            continue;
        };
        let Some(item_id) = string_field(&item, &["id"]) else {
            continue;
        };
        if !known_item_ids.insert(item_id) {
            continue;
        }
        items.push(item);
        next_sequence = next_sequence.saturating_add(1);
    }
}

fn media_task_item(
    stored: &StoredSession,
    task: &MediaTaskArtifactResponse,
    sequence: u64,
) -> Option<Value> {
    if task.task_type != "image_generate" {
        return None;
    }
    if !matches!(task.normalized_status.as_str(), "partial" | "succeeded") {
        return None;
    }
    let payload = task.record.get("payload")?;
    if string_field(payload, &["sessionId", "session_id"]).as_deref()
        != Some(stored.session.session_id.as_str())
    {
        return None;
    }
    let thread_id = string_field(payload, &["threadId", "thread_id"])?;
    if thread_id != stored.session.thread_id {
        return None;
    }
    let turn_id = string_field(payload, &["turnId", "turn_id"])?;
    let timestamp = string_field(
        &task.record,
        &[
            "completed_at",
            "completedAt",
            "updated_at",
            "updatedAt",
            "created_at",
            "createdAt",
        ],
    )
    .unwrap_or_else(|| stored.session.updated_at.clone());

    item_from_task_record(
        stored,
        MediaTaskRecordProjectionInput {
            task_id: &task.task_id,
            task_type: &task.task_type,
            normalized_status: &task.normalized_status,
            artifact_path: Some(task.artifact_path.as_str()),
            record: &task.record,
            thread_id: Some(thread_id.as_str()),
            turn_id: Some(turn_id.as_str()),
            sequence,
            timestamp: &timestamp,
        },
    )
}

fn next_media_task_sequence(stored: &StoredSession, items: &[Value]) -> u64 {
    let item_sequence = items
        .iter()
        .filter_map(|item| item.get("sequence").and_then(Value::as_u64))
        .max()
        .unwrap_or(0);
    let event_sequence = stored
        .events
        .iter()
        .map(|event| event.sequence)
        .max()
        .unwrap_or(0);
    item_sequence.max(event_sequence).saturating_add(1)
}

fn workspace_root_for_session_detail(
    detail: Option<&Value>,
    session: &AgentSession,
) -> Option<String> {
    detail
        .and_then(workspace_root_from_detail)
        .or_else(|| workspace_root_from_session(session))
        .filter(|value| Path::new(value).is_absolute())
}

fn workspace_root_from_detail(detail: &Value) -> Option<String> {
    string_field(
        detail,
        &[
            "workspaceRoot",
            "workspace_root",
            "projectRootPath",
            "project_root_path",
            "projectRoot",
            "project_root",
            "workingDir",
            "working_dir",
            "cwd",
        ],
    )
    .or_else(|| {
        detail.get("execution_runtime").and_then(|runtime| {
            string_field(
                runtime,
                &[
                    "workspaceRoot",
                    "workspace_root",
                    "projectRootPath",
                    "project_root_path",
                    "projectRoot",
                    "project_root",
                    "workingDir",
                    "working_dir",
                    "cwd",
                ],
            )
        })
    })
}

fn workspace_root_from_session(session: &AgentSession) -> Option<String> {
    let metadata = session
        .business_object_ref
        .as_ref()
        .and_then(|reference| reference.metadata.as_ref());
    [
        "workspaceRoot",
        "workspace_root",
        "projectRootPath",
        "project_root_path",
        "projectRoot",
        "project_root",
        "workingDir",
        "working_dir",
        "cwd",
    ]
    .into_iter()
    .find_map(|key| metadata_string(metadata, key))
}
