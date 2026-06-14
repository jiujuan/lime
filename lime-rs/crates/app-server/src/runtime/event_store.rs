use super::status::{agent_turn_is_terminal, session_status_from_turn_status};
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
    session_id: &str,
    thread_id: &str,
    turn_id: Option<&str>,
    runtime_events: Vec<RuntimeEvent>,
) -> Result<Vec<AgentEvent>, RuntimeCoreError> {
    if runtime_events.is_empty() || is_terminal_turn(stored, turn_id) {
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
        }
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
            output_records.push(output_refs::record_output_blob(&event, output_blob));
        }
        if event.turn_id.as_deref() == turn_id && turn_terminal_event {
            pending_terminal_for_turn = true;
        }
        events.push(event);
    }
    let appended_events = events.clone();
    for event in events {
        apply_runtime_event_state_transition(stored, turn_id, event.event_type.as_str());
        stored.events.push(event);
    }
    for output in output_records {
        let output = output_refs::persist_output_record(output, session_id, output_snapshot_store)?;
        stored
            .output_blobs
            .insert(output.output_ref.clone(), output);
    }
    Ok(appended_events)
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
        "message.delta" | "message.delta_batch" | "message.batch"
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
