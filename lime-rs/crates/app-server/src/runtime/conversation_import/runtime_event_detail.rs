use crate::{RuntimeCore, RuntimeCoreError};
use app_server_protocol::{
    AgentSessionReadParams, ConversationImportRuntimeEventDetail,
    ConversationImportThreadRuntimeEventsReadParams,
    ConversationImportThreadRuntimeEventsReadResponse,
};
use serde::Deserialize;
use serde_json::Value;

const DEFAULT_LIMIT: usize = 200;
const MAX_LIMIT: usize = 1_000;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredRuntimeEventDetail {
    turn_index: usize,
    event_index: usize,
    event_type: String,
    payload: Value,
}

pub(super) async fn read_conversation_import_runtime_events(
    core: &RuntimeCore,
    params: ConversationImportThreadRuntimeEventsReadParams,
) -> Result<ConversationImportThreadRuntimeEventsReadResponse, RuntimeCoreError> {
    let session_id = params.session_id.trim().to_string();
    if session_id.is_empty() {
        return Err(RuntimeCoreError::Backend(
            "sessionId is required for conversation import runtime event detail read".to_string(),
        ));
    }

    let context = core
        .load_session_current(AgentSessionReadParams {
            session_id: session_id.clone(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .await?;
    let projection = imported_runtime_projection(&context.response.session)?;
    let relative_path = projection_sidecar_relative_path(&projection)?;
    let Some(sidecar_store) = core.sidecar_store.as_ref() else {
        return Err(RuntimeCoreError::Backend(
            "imported runtime event sidecar store is not available".to_string(),
        ));
    };
    let content = sidecar_store.read_text(relative_path).ok_or_else(|| {
        RuntimeCoreError::Backend("imported runtime event sidecar is not available".to_string())
    })?;

    let limit = params.limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT);
    let offset = params.offset.unwrap_or(0);
    let event_type_filter = params
        .event_type
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);

    let mut filtered_total = 0usize;
    let mut events = Vec::new();
    for (source_event_index, line) in content.lines().enumerate() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let detail: StoredRuntimeEventDetail = serde_json::from_str(line).map_err(|error| {
            RuntimeCoreError::Backend(format!(
                "unable to parse imported runtime event sidecar line {}: {error}",
                source_event_index + 1
            ))
        })?;
        if params
            .turn_index
            .is_some_and(|turn_index| turn_index != detail.turn_index)
        {
            continue;
        }
        if event_type_filter
            .as_deref()
            .is_some_and(|event_type| event_type != detail.event_type)
        {
            continue;
        }

        if filtered_total >= offset && events.len() < limit {
            events.push(ConversationImportRuntimeEventDetail {
                source_event_index,
                turn_index: detail.turn_index,
                event_index: detail.event_index,
                event_type: detail.event_type,
                payload: detail.payload,
            });
        }
        filtered_total += 1;
    }

    let next_offset = (offset + events.len() < filtered_total).then_some(offset + events.len());
    let source_runtime_events =
        projection_usize(&projection, "sourceRuntimeEvents").unwrap_or(filtered_total);
    let materialized_runtime_events =
        projection_usize(&projection, "materializedRuntimeEvents").unwrap_or(0);
    let sidecar_runtime_events = projection_usize(&projection, "sidecarRuntimeEvents")
        .unwrap_or_else(|| source_runtime_events.saturating_sub(materialized_runtime_events));

    Ok(ConversationImportThreadRuntimeEventsReadResponse {
        session_id,
        offset,
        limit,
        total_events: filtered_total,
        next_offset,
        source_runtime_events,
        materialized_runtime_events,
        sidecar_runtime_events,
        projection: Some(projection),
        events,
    })
}

fn imported_runtime_projection(
    session: &app_server_protocol::AgentSession,
) -> Result<Value, RuntimeCoreError> {
    session
        .business_object_ref
        .as_ref()
        .and_then(|reference| reference.metadata.as_ref())
        .and_then(|metadata| metadata.get("importedRuntimeProjection"))
        .cloned()
        .filter(Value::is_object)
        .ok_or_else(|| {
            RuntimeCoreError::Backend(
                "session does not contain imported runtime event projection metadata".to_string(),
            )
        })
}

fn projection_sidecar_relative_path(projection: &Value) -> Result<&str, RuntimeCoreError> {
    projection
        .get("sidecar")
        .and_then(|sidecar| sidecar.get("relativePath"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            RuntimeCoreError::Backend(
                "imported runtime event projection does not contain a sidecar relative path"
                    .to_string(),
            )
        })
}

fn projection_usize(projection: &Value, key: &str) -> Option<usize> {
    projection
        .get(key)
        .and_then(Value::as_u64)
        .and_then(|value| usize::try_from(value).ok())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn projection_sidecar_relative_path_reads_internal_ref_only() {
        let projection = json!({
            "sidecar": {
                "relativePath": "sessions/sess/conversation-import/runtime-events.jsonl"
            }
        });

        assert_eq!(
            projection_sidecar_relative_path(&projection).expect("path"),
            "sessions/sess/conversation-import/runtime-events.jsonl"
        );
    }
}
