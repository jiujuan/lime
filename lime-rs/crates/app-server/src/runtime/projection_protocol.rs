use app_server_protocol::AgentSession;
use app_server_protocol::AgentTurn;
use app_server_protocol::BusinessObjectRef;
use serde_json::Value;

use super::projection_status::{
    agent_session_status_from_projection, agent_turn_status_from_projection,
};
use super::projection_store::{ProjectedSessionRow, ProjectedTurnRow};
use super::session_title;

const IMPORTED_CONVERSATION_KIND: &str = "conversation.import";

pub(super) fn projected_session_to_protocol(
    row: &ProjectedSessionRow,
    first_user_message: Option<String>,
) -> AgentSession {
    let title = session_title::resolve_session_title(row.title.clone(), first_user_message);
    let mut metadata = row
        .metadata_json
        .as_deref()
        .and_then(|value| serde_json::from_str::<serde_json::Map<String, Value>>(value).ok())
        .unwrap_or_default();
    metadata.insert(
        "projectionSource".to_string(),
        Value::String("runtime.projection_1".to_string()),
    );
    metadata.insert(
        "lastEventSequence".to_string(),
        Value::Number(serde_json::Number::from(row.last_event_sequence)),
    );
    metadata.insert("title".to_string(), title.clone().into());
    metadata.insert("model".to_string(), row.model.clone().into());
    metadata.insert("workingDir".to_string(), row.working_dir.clone().into());
    metadata.insert(
        "executionStrategy".to_string(),
        row.execution_strategy.clone().into(),
    );
    if let Some(archived_at) = row.archived_at.clone() {
        metadata.insert("archivedAt".to_string(), archived_at.clone().into());
        metadata.insert("archived_at".to_string(), archived_at.into());
    }
    let metadata = Value::Object(metadata);
    let business_object_ref =
        projected_import_reference_from_metadata_value(row, IMPORTED_CONVERSATION_KIND, &metadata)
            .unwrap_or_else(|| BusinessObjectRef {
                kind: "agent_session_projection".to_string(),
                id: row.session_id.clone(),
                title,
                uri: None,
                metadata: Some(metadata),
            });
    AgentSession {
        session_id: row.session_id.clone(),
        thread_id: row.thread_id.clone(),
        app_id: "agent-runtime".to_string(),
        workspace_id: row.workspace_id.clone(),
        business_object_ref: Some(business_object_ref),
        status: agent_session_status_from_projection(row.status.as_str()),
        created_at: row
            .created_at
            .clone()
            .unwrap_or_else(|| row.updated_at.clone()),
        updated_at: row.updated_at.clone(),
    }
}

pub(super) fn projected_import_reference_from_metadata(
    row: &ProjectedSessionRow,
    source_kind: &str,
    source_client: &str,
    source_thread_id: &str,
) -> Option<BusinessObjectRef> {
    let metadata = row
        .metadata_json
        .as_deref()
        .and_then(|value| serde_json::from_str::<Value>(value).ok())?;
    let reference = projected_import_reference_from_metadata_value(row, source_kind, &metadata)?;
    let source_client_value = metadata
        .get("sourceClient")
        .or_else(|| metadata.get("source_client"))
        .and_then(Value::as_str)
        .map(str::trim)?;
    let source_thread_id_value = metadata
        .get("sourceThreadId")
        .or_else(|| metadata.get("source_thread_id"))
        .and_then(Value::as_str)
        .map(str::trim)?;
    if source_client_value != source_client || source_thread_id_value != source_thread_id {
        return None;
    }
    Some(reference)
}

fn projected_import_reference_from_metadata_value(
    row: &ProjectedSessionRow,
    source_kind: &str,
    metadata: &Value,
) -> Option<BusinessObjectRef> {
    let source_thread_id = metadata
        .get("sourceThreadId")
        .or_else(|| metadata.get("source_thread_id"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())?;
    metadata
        .get("sourceClient")
        .or_else(|| metadata.get("source_client"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())?;

    Some(BusinessObjectRef {
        kind: source_kind.to_string(),
        id: source_thread_id.to_string(),
        title: row.title.clone(),
        uri: metadata
            .get("sourcePath")
            .or_else(|| metadata.get("source_path"))
            .and_then(Value::as_str)
            .map(str::to_string),
        metadata: Some(metadata.clone()),
    })
}

pub(super) fn projected_import_session_to_protocol(
    row: ProjectedSessionRow,
    business_object_ref: BusinessObjectRef,
) -> AgentSession {
    AgentSession {
        session_id: row.session_id,
        thread_id: row.thread_id,
        app_id: "agent-runtime".to_string(),
        workspace_id: row.workspace_id,
        business_object_ref: Some(business_object_ref),
        status: agent_session_status_from_projection(row.status.as_str()),
        created_at: row.created_at.unwrap_or_else(|| row.updated_at.clone()),
        updated_at: row.updated_at,
    }
}

pub(super) fn projected_turn_to_protocol(row: ProjectedTurnRow) -> AgentTurn {
    AgentTurn {
        turn_id: row.turn_id,
        session_id: row.session_id,
        thread_id: row.thread_id,
        status: agent_turn_status_from_projection(row.status.as_str()),
        started_at: row.started_at,
        completed_at: row.completed_at,
    }
}
