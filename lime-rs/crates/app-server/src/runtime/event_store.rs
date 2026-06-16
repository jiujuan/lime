use super::status::{agent_turn_is_terminal, session_status_from_turn_status};
use super::turn_input_events;
use super::*;
use crate::agent_ui_event_schema;
use crate::agent_ui_sequence_verifier;
use app_server_protocol::*;
use std::sync::{Arc, Mutex};

impl RuntimeCoreEventAppender {
    pub fn append_external_runtime_events(
        &self,
        session_id: &str,
        turn_id: Option<&str>,
        runtime_events: Vec<RuntimeEvent>,
    ) -> Result<Vec<AgentEvent>, RuntimeCoreError> {
        let mut state = self
            .state
            .lock()
            .expect("runtime core state mutex poisoned");
        let stored = state
            .sessions
            .get_mut(session_id)
            .ok_or_else(|| RuntimeCoreError::SessionNotFound(session_id.to_string()))?;
        if let Some(turn_id) = turn_id {
            if !stored.turns.iter().any(|turn| turn.turn_id == turn_id) {
                return Err(RuntimeCoreError::TurnNotActive(turn_id.to_string()));
            }
        }
        let thread_id = stored.session.thread_id.clone();

        append_runtime_events_to_stored_session(
            stored,
            self.file_checkpoint_snapshot_store.as_ref(),
            self.output_snapshot_store.as_ref(),
            self.sidecar_store.as_deref(),
            self.event_log_writer.as_deref(),
            self.projection_store.as_deref(),
            session_id,
            &thread_id,
            turn_id,
            runtime_events,
        )
    }
}

pub(in crate::runtime) fn append_runtime_events_to_state(
    state: &Arc<Mutex<RuntimeCoreState>>,
    file_checkpoint_snapshot_store: &dyn crate::file_checkpoint_snapshot::FileCheckpointSnapshotStore,
    output_snapshot_store: &dyn output_refs::OutputSnapshotStore,
    sidecar_store: Option<&SidecarStore>,
    event_log_writer: Option<&EventLogWriter>,
    projection_store: Option<&ProjectionStore>,
    session_id: &str,
    thread_id: &str,
    turn_id: Option<&str>,
    runtime_events: Vec<RuntimeEvent>,
) -> Result<Vec<AgentEvent>, RuntimeCoreError> {
    let mut state = state.lock().expect("runtime core state mutex poisoned");
    let stored = state
        .sessions
        .get_mut(session_id)
        .ok_or_else(|| RuntimeCoreError::SessionNotFound(session_id.to_string()))?;
    append_runtime_events_to_stored_session(
        stored,
        file_checkpoint_snapshot_store,
        output_snapshot_store,
        sidecar_store,
        event_log_writer,
        projection_store,
        session_id,
        thread_id,
        turn_id,
        runtime_events,
    )
}

fn append_runtime_events_to_stored_session(
    stored: &mut StoredSession,
    file_checkpoint_snapshot_store: &dyn crate::file_checkpoint_snapshot::FileCheckpointSnapshotStore,
    output_snapshot_store: &dyn output_refs::OutputSnapshotStore,
    sidecar_store: Option<&SidecarStore>,
    event_log_writer: Option<&EventLogWriter>,
    projection_store: Option<&ProjectionStore>,
    session_id: &str,
    thread_id: &str,
    turn_id: Option<&str>,
    runtime_events: Vec<RuntimeEvent>,
) -> Result<Vec<AgentEvent>, RuntimeCoreError> {
    if is_terminal_turn(stored, turn_id) {
        return Ok(Vec::new());
    }
    let runtime_events = runtime_events_with_turn_input(stored, turn_id, runtime_events);
    if runtime_events.is_empty() {
        return Ok(Vec::new());
    }
    let mut events = Vec::with_capacity(runtime_events.len());
    let mut output_records = Vec::new();
    let mut pending_terminal_for_turn = false;
    for runtime_event in runtime_events {
        let event_type = runtime_event.event_type;
        let event_class = normalized_runtime_event_class(&event_type);
        let needs_sequence_context =
            should_build_validation_context(event_class, pending_terminal_for_turn);
        let needs_policy_normalization = should_normalize_policy_event_payload_class(event_class);
        let needs_tool_lifecycle_validation =
            should_validate_tool_lifecycle_event_class(event_class);
        let validation_events = (needs_sequence_context
            || needs_policy_normalization
            || needs_tool_lifecycle_validation)
            .then(|| validation_context_for_event(stored, &events, turn_id));
        let payload = if needs_policy_normalization {
            let context = validation_events
                .as_ref()
                .expect("policy event validation context should be built");
            tool_lifecycle::normalize_policy_event_payload(
                context,
                turn_id,
                &event_type,
                runtime_event.payload,
            )
        } else {
            runtime_event.payload
        };
        let text_delta_event = is_text_delta_event_class(event_class);
        let turn_terminal_event = is_turn_terminal_event_class(event_class);
        let normalized = if text_delta_event {
            output_refs::NormalizedOutputPayload {
                payload,
                output_blob: None,
            }
        } else {
            output_refs::normalize_large_output_payload(&event_type, payload)
        };
        let mut event = AgentEvent {
            event_id: new_id("evt"),
            sequence: stored.events.len() as u64 + events.len() as u64 + 1,
            session_id: session_id.to_string(),
            thread_id: Some(thread_id.to_string()),
            turn_id: turn_id.map(str::to_string),
            event_type,
            timestamp: timestamp(),
            payload: normalized.payload,
        };
        if !text_delta_event {
            crate::file_checkpoint_snapshot::persist_runtime_file_checkpoint_snapshot(
                &mut event,
                session_id,
                file_checkpoint_snapshot_store,
            )
            .map_err(RuntimeCoreError::Backend)?;
            artifact_sidecar::persist_artifact_snapshot_payload(
                event.event_type.as_str(),
                &mut event.payload,
                session_id,
                event.event_id.as_str(),
                sidecar_store,
            )?;
        }
        attach_session_projection_metadata(&mut event, stored);
        agent_ui_event_schema::validate_agent_event(&event).map_err(RuntimeCoreError::Backend)?;
        if needs_sequence_context {
            let validation_events = validation_events
                .as_ref()
                .expect("sequence event validation context should be built");
            agent_ui_sequence_verifier::validate_agent_event_sequence(validation_events, &event)
                .map_err(RuntimeCoreError::Backend)?;
        }
        if needs_tool_lifecycle_validation {
            let context = validation_events
                .as_ref()
                .expect("tool lifecycle event validation context should be built");
            tool_lifecycle::validate_tool_lifecycle_event(&context, &event)
                .map_err(RuntimeCoreError::Backend)?;
        }
        if let Some(output_blob) = normalized.output_blob {
            let output = output_refs::record_output_blob(&event, output_blob);
            let output =
                output_refs::persist_output_record(output, session_id, output_snapshot_store)?;
            output_refs::attach_output_snapshot_ref(&mut event.payload, &output);
            output_records.push(output);
        }
        if event.turn_id.as_deref() == turn_id && turn_terminal_event {
            pending_terminal_for_turn = true;
        }
        events.push(event);
    }
    let appended_events = events.clone();
    if let Some(event_log_writer) = event_log_writer {
        for event in &appended_events {
            event_log_writer
                .append(event)
                .map_err(RuntimeCoreError::Backend)?;
        }
    }
    if let Some(projection_store) = projection_store {
        for event in &appended_events {
            if let Err(error) = projection_store.apply_event(event) {
                tracing::warn!(
                    "[projection-store] failed to apply event {} for session {}: {}",
                    event.event_id,
                    event.session_id,
                    error
                );
            }
        }
    }
    for event in events {
        apply_runtime_event_state_transition(stored, turn_id, event.event_type.as_str());
        stored.events.push(event);
    }
    for output in output_records {
        stored
            .output_blobs
            .insert(output.output_ref.clone(), output);
    }
    Ok(appended_events)
}

fn runtime_events_with_turn_input(
    stored: &StoredSession,
    turn_id: Option<&str>,
    runtime_events: Vec<RuntimeEvent>,
) -> Vec<RuntimeEvent> {
    let Some(turn_id) = turn_id else {
        return runtime_events;
    };
    if stored.events.iter().any(|event| {
        event.turn_id.as_deref() == Some(turn_id) && turn_input_events::is_turn_input_event(event)
    }) || runtime_events
        .iter()
        .any(|event| turn_input_events::is_turn_input_event_type(&event.event_type))
    {
        return runtime_events;
    }
    let Some(input) = stored.turn_inputs.get(turn_id) else {
        return runtime_events;
    };
    let Some(input_event) = turn_input_events::runtime_event_for_turn_input(input) else {
        return runtime_events;
    };

    let mut events = Vec::with_capacity(runtime_events.len() + 1);
    events.push(input_event);
    events.extend(runtime_events);
    events
}

fn attach_session_projection_metadata(event: &mut AgentEvent, stored: &StoredSession) {
    let Some(payload) = event.payload.as_object_mut() else {
        return;
    };
    let session_payload = payload
        .entry("session")
        .or_insert_with(|| serde_json::Value::Object(serde_json::Map::new()));
    if !session_payload.is_object() {
        *session_payload = serde_json::Value::Object(serde_json::Map::new());
    }
    let Some(session_payload) = session_payload.as_object_mut() else {
        return;
    };

    insert_session_projection_string(
        session_payload,
        "createdAt",
        Some(stored.session.created_at.as_str()),
    );
    insert_session_projection_string(
        session_payload,
        "updatedAt",
        Some(stored.session.updated_at.as_str()),
    );
    insert_session_projection_string(
        session_payload,
        "appId",
        Some(stored.session.app_id.as_str()),
    );
    insert_session_projection_string(
        session_payload,
        "workspaceId",
        stored.session.workspace_id.as_deref(),
    );
    insert_session_projection_string(
        session_payload,
        "title",
        session_business_object_title(stored).as_deref(),
    );
    insert_session_projection_string(
        session_payload,
        "model",
        session_business_object_metadata(stored, &["model", "modelName"]).as_deref(),
    );
    insert_session_projection_string(
        session_payload,
        "workingDir",
        session_business_object_metadata(stored, &["workingDir", "working_dir"]).as_deref(),
    );
    insert_session_projection_string(
        session_payload,
        "executionStrategy",
        session_business_object_metadata(stored, &["executionStrategy", "execution_strategy"])
            .as_deref(),
    );
    insert_session_projection_metadata(session_payload, stored);
}

fn insert_session_projection_string(
    payload: &mut serde_json::Map<String, serde_json::Value>,
    key: &str,
    value: Option<&str>,
) {
    let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return;
    };
    payload.insert(
        key.to_string(),
        serde_json::Value::String(value.to_string()),
    );
}

fn insert_session_projection_metadata(
    payload: &mut serde_json::Map<String, serde_json::Value>,
    stored: &StoredSession,
) {
    let Some(metadata) = stored
        .session
        .business_object_ref
        .as_ref()
        .and_then(|reference| reference.metadata.as_ref())
    else {
        return;
    };
    payload.insert("metadata".to_string(), metadata.clone());
}

fn session_business_object_title(stored: &StoredSession) -> Option<String> {
    stored
        .session
        .business_object_ref
        .as_ref()
        .and_then(|reference| reference.title.as_deref())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .or_else(|| session_business_object_metadata(stored, &["title"]))
}

fn session_business_object_metadata(stored: &StoredSession, keys: &[&str]) -> Option<String> {
    let metadata = stored
        .session
        .business_object_ref
        .as_ref()
        .and_then(|reference| reference.metadata.as_ref())?;
    keys.iter()
        .filter_map(|key| metadata.get(*key))
        .find_map(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn validation_context_for_event(
    stored: &StoredSession,
    pending_events: &[AgentEvent],
    turn_id: Option<&str>,
) -> Vec<AgentEvent> {
    stored
        .events
        .iter()
        .chain(pending_events.iter())
        .filter(|event| {
            event.turn_id.as_deref() == turn_id
                && should_include_in_validation_context(event.event_type.as_str())
        })
        .cloned()
        .collect()
}

fn should_build_validation_context(event_class: &str, pending_terminal_for_turn: bool) -> bool {
    requires_sequence_validation_context_class(event_class) || pending_terminal_for_turn
}

fn requires_sequence_validation_context_class(event_class: &str) -> bool {
    event_class.starts_with("tool.")
        || event_class.starts_with("action.")
        || event_class.starts_with("patch.")
        || event_class.starts_with("command.")
        || event_class.starts_with("test.")
        || event_class.starts_with("permission.")
        || event_class.starts_with("sandbox.")
        || matches!(
            event_class,
            "turn.completed" | "turn.failed" | "turn.canceled"
        )
}

fn should_include_in_validation_context(event_type: &str) -> bool {
    let event_class = normalized_runtime_event_class(event_type);
    requires_sequence_validation_context_class(event_class)
        || should_validate_tool_lifecycle_event_class(event_class)
        || should_normalize_policy_event_payload_class(event_class)
        || is_turn_terminal_event_class(event_class)
}

fn should_normalize_policy_event_payload_class(event_class: &str) -> bool {
    matches!(
        event_class,
        "action.required"
            | "action.resolved"
            | "action.cancelled"
            | "action.canceled"
            | "action.expired"
            | "permission.denied"
            | "sandbox.blocked"
    )
}

fn should_validate_tool_lifecycle_event_class(event_class: &str) -> bool {
    matches!(
        event_class,
        "tool.args"
            | "tool.args.delta"
            | "tool.output.delta"
            | "tool.result"
            | "tool.failed"
            | "action.required"
            | "action.resolved"
            | "action.cancelled"
            | "action.canceled"
            | "action.expired"
            | "permission.denied"
            | "sandbox.blocked"
    )
}

fn normalized_runtime_event_class(event_type: &str) -> &str {
    match event_type {
        "message.created" => "message.created",
        "tool_args" => "tool.args",
        "tool_args_delta" => "tool.args.delta",
        "tool_output_delta" => "tool.output.delta",
        "turn.canceled" => "turn.canceled",
        value => value,
    }
}

fn is_text_delta_event_class(event_class: &str) -> bool {
    matches!(
        event_class,
        "message.delta" | "message.delta_batch" | "message.batch" | "message.created"
    )
}

fn is_turn_terminal_event_class(event_class: &str) -> bool {
    matches!(
        event_class,
        "turn.completed" | "turn.failed" | "turn.canceled"
    )
}

fn is_terminal_turn(stored: &StoredSession, turn_id: Option<&str>) -> bool {
    let Some(turn_id) = turn_id else {
        return false;
    };
    stored
        .turns
        .iter()
        .find(|turn| turn.turn_id == turn_id)
        .is_some_and(|turn| agent_turn_is_terminal(turn.status))
}

fn apply_runtime_event_state_transition(
    stored: &mut StoredSession,
    turn_id: Option<&str>,
    event_type: &str,
) {
    let Some(turn_id) = turn_id else {
        return;
    };
    let Some(next_status) = turn_status_from_runtime_event(event_type) else {
        return;
    };
    let completed_at = matches!(
        next_status,
        AgentTurnStatus::Completed | AgentTurnStatus::Failed | AgentTurnStatus::Canceled
    )
    .then(timestamp);

    if let Some(turn) = stored.turns.iter_mut().find(|turn| turn.turn_id == turn_id) {
        turn.status = next_status;
        if let Some(completed_at) = completed_at.clone() {
            turn.completed_at = Some(completed_at);
        }
    }

    stored.session.status = session_status_from_turn_status(next_status);
    stored.session.updated_at = completed_at.unwrap_or_else(timestamp);
}

fn turn_status_from_runtime_event(event_type: &str) -> Option<AgentTurnStatus> {
    match event_type {
        "turn.started" => Some(AgentTurnStatus::Running),
        "turn.completed" => Some(AgentTurnStatus::Completed),
        "turn.failed" | "runtime.error" => Some(AgentTurnStatus::Failed),
        "turn.canceled" => Some(AgentTurnStatus::Canceled),
        "action.required" => Some(AgentTurnStatus::WaitingAction),
        "action.resolved" | "action.cancelled" | "action.canceled" | "action.expired" => {
            Some(AgentTurnStatus::Running)
        }
        _ => None,
    }
}
