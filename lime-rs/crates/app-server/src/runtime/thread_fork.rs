use std::collections::{BTreeMap, HashSet};

use agent_protocol::{
    AgentInput, SessionId, Thread, ThreadHistoryChangeSet, ThreadId, ThreadItem, ThreadItemPayload,
    ThreadStatus, ThreadTurnsView, Turn,
};
use app_server_protocol::protocol::v2::ThreadForkParams;
use app_server_protocol::{
    AgentEvent, AgentSession, AgentSessionStatus, AgentTurn, AgentTurnStatus, BusinessObjectRef,
};
use chrono::TimeZone;
use serde_json::{Map, Value};
use thread_store::{ApplyThreadHistoryParams, CreateThreadParams, ReadThreadParams, ThreadStore};
use uuid::Uuid;

use super::{RuntimeCore, RuntimeCoreError, StoredSession};

#[cfg(test)]
mod tests;

pub(in crate::runtime) const FORK_CANONICAL_ITEM_EVENT_TYPE: &str = "thread.fork.canonical_item";

struct ForkHistory {
    turn_ids: HashSet<String>,
    changes: Option<ThreadHistoryChangeSet>,
}

impl RuntimeCore {
    pub(crate) async fn fork_thread(
        &self,
        params: ThreadForkParams,
    ) -> Result<Thread, RuntimeCoreError> {
        validate_fork_params(&params)?;
        let source_thread_id = ThreadId::new(params.thread_id.trim().to_string());
        let store = self.projection_store.as_deref().ok_or_else(|| {
            RuntimeCoreError::Backend("canonical thread store is unavailable".to_string())
        })?;
        let source = store
            .read_thread(ReadThreadParams {
                thread_id: source_thread_id.clone(),
                include_archived: true,
                turns_view: ThreadTurnsView::Full,
            })
            .await
            .map_err(store_error)?
            .ok_or_else(|| {
                RuntimeCoreError::Backend(format!("thread not found: {source_thread_id}"))
            })?;
        let source_session_id = source.session_id.as_str().to_string();
        self.ensure_current_session_hydrated(&source_session_id)
            .await?;
        let source_stored = self
            .state
            .lock()
            .expect("runtime core state mutex poisoned")
            .sessions
            .get(&source_session_id)
            .cloned()
            .ok_or_else(|| RuntimeCoreError::SessionNotFound(source_session_id.clone()))?;
        let target_session_id = format!("sess_{}", Uuid::new_v4().simple());
        let target_thread_id = format!("thread_{}", Uuid::new_v4().simple());
        let history = fork_history(&source, &params, &target_session_id, &target_thread_id)?;
        validate_fork_provider_history(&source_stored, &history)?;
        let history_sequence = history
            .changes
            .as_ref()
            .map(|changes| changes.sequence)
            .unwrap_or_default();
        let now_ms = chrono::Utc::now().timestamp_millis();
        let target = fork_thread_snapshot(
            source,
            &target_session_id,
            &target_thread_id,
            now_ms,
            &params,
            history_sequence,
        )?;

        store
            .create_thread(CreateThreadParams {
                thread: target.clone(),
            })
            .await
            .map_err(store_error)?;
        let persist_result = async {
            if let Some(changes) = history.changes.clone() {
                store
                    .apply_history(ApplyThreadHistoryParams {
                        session_id: SessionId::new(target_session_id.clone()),
                        thread_id: ThreadId::new(target_thread_id.clone()),
                        changes,
                    })
                    .await
                    .map_err(store_error)?;
            }
            if params.defer_goal_continuation {
                store
                    .inherit_thread_goal_for_fork_sync(source_thread_id.as_str(), &target_thread_id)
                    .map_err(|error| RuntimeCoreError::Backend(error.to_string()))?;
            }
            Ok::<(), RuntimeCoreError>(())
        }
        .await;
        if let Err(error) = persist_result {
            let _ = store.delete_session_data(&target_session_id);
            return Err(error);
        }

        let target_stored = fork_stored_session(
            source_stored,
            &target_session_id,
            &target_thread_id,
            &target.metadata,
            &history.turn_ids,
            history
                .changes
                .as_ref()
                .map(|changes| changes.changed_turns.as_slice())
                .unwrap_or_default(),
            history
                .changes
                .as_ref()
                .map(|changes| changes.changed_items.as_slice())
                .unwrap_or_default(),
            history_sequence,
        )?;
        self.state
            .lock()
            .expect("runtime core state mutex poisoned")
            .sessions
            .insert(target_session_id.clone(), target_stored);

        store
            .read_thread(ReadThreadParams {
                thread_id: ThreadId::new(target_thread_id.clone()),
                include_archived: false,
                turns_view: if params.exclude_turns {
                    ThreadTurnsView::NotLoaded
                } else {
                    ThreadTurnsView::Full
                },
            })
            .await
            .map_err(store_error)?
            .ok_or_else(|| {
                RuntimeCoreError::Backend(format!(
                    "forked thread disappeared after creation: {target_thread_id}"
                ))
            })
    }

    pub(in crate::runtime) fn hydrate_fork_session_from_canonical(
        &self,
        thread: &Thread,
    ) -> Result<(), RuntimeCoreError> {
        if thread.forked_from_id.is_none() {
            return Err(RuntimeCoreError::SessionNotFound(
                thread.session_id.as_str().to_string(),
            ));
        }
        let metadata = thread.metadata.as_object().ok_or_else(|| {
            RuntimeCoreError::Backend("forked thread metadata must be a JSON object".to_string())
        })?;
        let timestamp = |millis: i64| {
            chrono::Utc
                .timestamp_millis_opt(millis)
                .single()
                .map(|value| value.to_rfc3339())
                .unwrap_or_else(super::value_fields::timestamp)
        };
        let session_id = thread.session_id.as_str().to_string();
        let thread_id = thread.thread_id.as_str().to_string();
        let history_sequence = metadata
            .get("forkSequence")
            .and_then(Value::as_u64)
            .ok_or_else(|| {
                RuntimeCoreError::Backend(
                    "forked thread metadata omitted canonical forkSequence".to_string(),
                )
            })?;
        let mut stored = StoredSession {
            session: AgentSession {
                session_id: session_id.clone(),
                thread_id: thread_id.clone(),
                app_id: thread
                    .product
                    .clone()
                    .unwrap_or_else(|| "agent-chat".to_string()),
                workspace_id: metadata
                    .get("workspaceId")
                    .and_then(Value::as_str)
                    .map(ToString::to_string),
                business_object_ref: Some(BusinessObjectRef {
                    kind: "agent.thread".to_string(),
                    id: thread_id.clone(),
                    title: thread.name.clone(),
                    uri: None,
                    metadata: Some(thread.metadata.clone()),
                }),
                status: session_status(&thread.status),
                created_at: timestamp(thread.created_at_ms),
                updated_at: timestamp(thread.updated_at_ms),
            },
            turns: thread
                .turns
                .iter()
                .map(|turn| AgentTurn {
                    turn_id: turn.turn_id.as_str().to_string(),
                    session_id: session_id.clone(),
                    thread_id: thread_id.clone(),
                    status: turn_status(turn.status),
                    started_at: turn.started_at_ms.map(timestamp),
                    completed_at: turn.completed_at_ms.map(timestamp),
                })
                .collect(),
            turn_inputs: Default::default(),
            turn_runtime_options: Default::default(),
            events: Vec::new(),
            output_blobs: Default::default(),
        };
        let items = thread
            .turns
            .iter()
            .flat_map(|turn| turn.items.iter())
            .filter(|item| item.sequence <= history_sequence)
            .cloned()
            .collect::<Vec<_>>();
        let item_turn_ids = items
            .iter()
            .map(|item| item.turn_id.as_str())
            .collect::<HashSet<_>>();
        let turns = thread
            .turns
            .iter()
            .filter(|turn| item_turn_ids.contains(turn.turn_id.as_str()))
            .cloned()
            .collect::<Vec<_>>();
        stored.events =
            fork_history_seed_events(&stored.session, &turns, &items, history_sequence)?;
        let mut state = self
            .state
            .lock()
            .expect("runtime core state mutex poisoned");
        match state.sessions.entry(session_id) {
            std::collections::hash_map::Entry::Vacant(entry) => {
                entry.insert(stored);
            }
            std::collections::hash_map::Entry::Occupied(mut entry) => {
                merge_fork_history_seed(entry.get_mut(), stored.events)?;
            }
        }
        Ok(())
    }
}

fn validate_fork_provider_history(
    source: &StoredSession,
    history: &ForkHistory,
) -> Result<(), RuntimeCoreError> {
    for event in source.events.iter().filter(|event| {
        event
            .turn_id
            .as_ref()
            .is_some_and(|turn_id| history.turn_ids.contains(turn_id))
            && super::turn_input_events::is_provider_input_event(event)
    }) {
        let Some(input) = event.payload.get("input") else {
            continue;
        };
        let input = serde_json::from_value::<Vec<AgentInput>>(input.clone()).map_err(|error| {
            invalid(format!(
                "thread/fork cannot verify source input history at event {}: {error}",
                event.event_id
            ))
        })?;
        if input.iter().any(|part| {
            matches!(
                part,
                AgentInput::Image { .. } | AgentInput::LocalImage { .. }
            )
        }) {
            return Err(invalid(
                "thread/fork cannot preserve source image input from canonical history",
            ));
        }
    }

    for item in history
        .changes
        .iter()
        .flat_map(|changes| changes.changed_items.iter())
    {
        validate_fork_canonical_item(item)?;
    }
    Ok(())
}

fn validate_fork_canonical_item(item: &ThreadItem) -> Result<(), RuntimeCoreError> {
    match &item.payload {
        ThreadItemPayload::UserMessage { .. }
        | ThreadItemPayload::AgentMessage { .. }
        | ThreadItemPayload::Reasoning { .. }
        | ThreadItemPayload::Tool { .. }
        | ThreadItemPayload::McpToolCall { .. }
            if !item.status.is_terminal() =>
        {
            return Err(invalid(format!(
                "thread/fork cannot preserve non-terminal canonical item {}",
                item.item_id
            )));
        }
        ThreadItemPayload::AgentMessage { content_parts, .. }
            if content_parts
                .iter()
                .any(|part| matches!(part, agent_protocol::MessageContentPart::Media { .. })) =>
        {
            return Err(invalid(
                "thread/fork cannot preserve assistant media content from canonical history",
            ));
        }
        ThreadItemPayload::Tool { output, .. } | ThreadItemPayload::McpToolCall { output, .. }
            if output.is_none() =>
        {
            return Err(invalid(format!(
                "thread/fork cannot preserve tool item {} without a canonical result",
                item.item_id
            )));
        }
        ThreadItemPayload::CollabAgentToolCall { .. } => {
            return Err(invalid(
                "thread/fork cannot preserve collab tool arguments from canonical history",
            ));
        }
        ThreadItemPayload::Media { .. } => {
            return Err(invalid(
                "thread/fork cannot preserve media content from canonical history",
            ));
        }
        ThreadItemPayload::ContextCompaction { .. } => {
            return Err(invalid(
                "thread/fork cannot preserve compacted provider history from canonical history",
            ));
        }
        ThreadItemPayload::Extension { .. } => {
            return Err(invalid(
                "thread/fork cannot preserve extension provider history from canonical history",
            ));
        }
        _ => {}
    }
    Ok(())
}

fn validate_fork_params(params: &ThreadForkParams) -> Result<(), RuntimeCoreError> {
    if params.thread_id.trim().is_empty() {
        return Err(invalid("thread/fork requires a non-empty threadId"));
    }
    if params.last_turn_id.is_some() && params.before_turn_id.is_some() {
        return Err(invalid(
            "thread/fork beforeTurnId cannot be combined with lastTurnId",
        ));
    }
    if params.permissions.is_some() && params.sandbox.is_some() {
        return Err(invalid(
            "thread/fork permissions cannot be combined with sandbox",
        ));
    }
    if params
        .path
        .as_deref()
        .is_some_and(|path| !path.trim().is_empty())
    {
        return Err(invalid(
            "thread/fork path is not implemented by the current runtime boundary",
        ));
    }
    if params.ephemeral && params.defer_goal_continuation {
        return Err(invalid(
            "thread/fork deferGoalContinuation cannot be combined with ephemeral",
        ));
    }
    if params.ephemeral {
        return Err(invalid(
            "thread/fork ephemeral storage is not implemented by the current runtime boundary",
        ));
    }
    for (name, value) in [
        ("lastTurnId", params.last_turn_id.as_deref()),
        ("beforeTurnId", params.before_turn_id.as_deref()),
    ] {
        if value.is_some_and(|value| value.trim().is_empty()) {
            return Err(invalid(format!("thread/fork {name} must not be empty")));
        }
    }
    Ok(())
}

fn fork_history(
    source: &Thread,
    params: &ThreadForkParams,
    target_session_id: &str,
    target_thread_id: &str,
) -> Result<ForkHistory, RuntimeCoreError> {
    let end = if let Some(last_turn_id) = params.last_turn_id.as_deref() {
        source
            .turns
            .iter()
            .position(|turn| turn.turn_id.as_str() == last_turn_id.trim())
            .map(|index| index + 1)
            .ok_or_else(|| invalid(format!("turn not found: {}", last_turn_id.trim())))?
    } else if let Some(before_turn_id) = params.before_turn_id.as_deref() {
        source
            .turns
            .iter()
            .position(|turn| turn.turn_id.as_str() == before_turn_id.trim())
            .ok_or_else(|| invalid(format!("turn not found: {}", before_turn_id.trim())))?
    } else {
        source.turns.len()
    };
    let selected = &source.turns[..end];
    if let Some(turn) = selected.iter().find(|turn| !turn.is_terminal()) {
        return Err(invalid(format!(
            "cannot fork through in-progress turn: {}",
            turn.turn_id
        )));
    }
    let turn_ids = selected
        .iter()
        .map(|turn| turn.turn_id.as_str().to_string())
        .collect::<HashSet<_>>();
    if selected.is_empty() {
        return Ok(ForkHistory {
            turn_ids,
            changes: None,
        });
    }

    let target_session_id = SessionId::new(target_session_id);
    let target_thread_id = ThreadId::new(target_thread_id);
    let mut changed_turns = Vec::with_capacity(selected.len());
    let mut changed_items = Vec::new();
    let mut sequence = 1;
    for source_turn in selected {
        let mut turn = source_turn.clone();
        turn.session_id = target_session_id.clone();
        turn.thread_id = target_thread_id.clone();
        for source_item in std::mem::take(&mut turn.items) {
            let mut item = source_item;
            item.session_id = target_session_id.clone();
            item.thread_id = target_thread_id.clone();
            sequence = sequence.max(item.sequence);
            changed_items.push(item);
        }
        changed_turns.push(turn);
    }
    Ok(ForkHistory {
        turn_ids,
        changes: Some(ThreadHistoryChangeSet {
            sequence,
            changed_turns,
            changed_items,
            ..Default::default()
        }),
    })
}

fn fork_thread_snapshot(
    mut source: Thread,
    target_session_id: &str,
    target_thread_id: &str,
    now_ms: i64,
    params: &ThreadForkParams,
    history_sequence: u64,
) -> Result<Thread, RuntimeCoreError> {
    source.session_id = SessionId::new(target_session_id);
    source.thread_id = ThreadId::new(target_thread_id);
    source.status = ThreadStatus::Idle;
    source.created_at_ms = now_ms;
    source.updated_at_ms = now_ms;
    source.recency_at_ms = Some(now_ms);
    source.archived = false;
    source.parent_thread_id = None;
    source.agent_path = None;
    source.agent_nickname = None;
    source.agent_role = None;
    source.last_task_message = None;
    source.agent_state = None;
    source.forked_from_id = Some(ThreadId::new(params.thread_id.trim()));
    source.turns.clear();
    source.turns_view = ThreadTurnsView::NotLoaded;

    let metadata = source
        .metadata
        .as_object_mut()
        .ok_or_else(|| invalid("thread/fork source metadata must be a JSON object"))?;
    apply_fork_overrides(metadata, params);
    metadata.insert("forkSequence".to_string(), Value::from(history_sequence));
    if let Some(model_provider) = params.model_provider.as_deref() {
        source.model_provider = model_provider.to_string();
    }
    Ok(source)
}

fn apply_fork_overrides(metadata: &mut Map<String, Value>, params: &ThreadForkParams) {
    for (key, value) in [
        (
            "modelName",
            params
                .model
                .as_ref()
                .map(|value| Value::String(value.clone())),
        ),
        (
            "providerSelector",
            params
                .model_provider
                .as_ref()
                .map(|value| Value::String(value.clone())),
        ),
        (
            "providerName",
            params
                .model_provider
                .as_ref()
                .map(|value| Value::String(value.clone())),
        ),
        (
            "workingDir",
            params
                .cwd
                .as_ref()
                .map(|value| Value::String(value.clone())),
        ),
        (
            "runtimeWorkspaceRoots",
            params
                .runtime_workspace_roots
                .as_ref()
                .and_then(|value| serde_json::to_value(value).ok()),
        ),
        ("approvalPolicy", params.approval_policy.clone()),
        ("approvalsReviewer", params.approvals_reviewer.clone()),
        ("sandbox", params.sandbox.clone()),
        (
            "permissions",
            params
                .permissions
                .as_ref()
                .map(|value| Value::String(value.clone())),
        ),
        (
            "config",
            params
                .config
                .as_ref()
                .and_then(|value| serde_json::to_value(value).ok()),
        ),
        (
            "baseInstructions",
            params
                .base_instructions
                .as_ref()
                .map(|value| Value::String(value.clone())),
        ),
        (
            "developerInstructions",
            params
                .developer_instructions
                .as_ref()
                .map(|value| Value::String(value.clone())),
        ),
        (
            "threadSource",
            params
                .thread_source
                .as_ref()
                .map(|value| Value::String(value.clone())),
        ),
    ] {
        if let Some(value) = value {
            metadata.insert(key.to_string(), value);
        }
    }
    if let Some(service_tier) = params.service_tier.as_ref() {
        metadata.insert(
            "serviceTier".to_string(),
            service_tier
                .as_ref()
                .map(|value| Value::String(value.clone()))
                .unwrap_or(Value::Null),
        );
    }
    metadata.insert("ephemeral".to_string(), Value::Bool(false));
}

fn fork_stored_session(
    mut source: StoredSession,
    target_session_id: &str,
    target_thread_id: &str,
    metadata: &Value,
    turn_ids: &HashSet<String>,
    canonical_turns: &[Turn],
    canonical_items: &[ThreadItem],
    history_sequence: u64,
) -> Result<StoredSession, RuntimeCoreError> {
    source.session.session_id = target_session_id.to_string();
    source.session.thread_id = target_thread_id.to_string();
    source.session.status = AgentSessionStatus::Idle;
    source.session.created_at = super::value_fields::timestamp();
    source.session.updated_at = source.session.created_at.clone();
    if let Some(reference) = source.session.business_object_ref.as_mut() {
        reference.id = target_thread_id.to_string();
        reference.metadata = Some(metadata.clone());
    }
    source.turns.retain(|turn| turn_ids.contains(&turn.turn_id));
    for turn in &mut source.turns {
        turn.session_id = target_session_id.to_string();
        turn.thread_id = target_thread_id.to_string();
    }
    source
        .turn_inputs
        .retain(|turn_id, _| turn_ids.contains(turn_id));
    source
        .turn_runtime_options
        .retain(|turn_id, _| turn_ids.contains(turn_id));
    source.events.clear();
    source.events = fork_history_seed_events(
        &source.session,
        canonical_turns,
        canonical_items,
        history_sequence,
    )?;
    source.output_blobs.clear();
    Ok(source)
}

pub(in crate::runtime) fn fork_history_seed_events(
    session: &AgentSession,
    canonical_turns: &[Turn],
    canonical_items: &[ThreadItem],
    through_sequence: u64,
) -> Result<Vec<AgentEvent>, RuntimeCoreError> {
    let mut turns_by_id = BTreeMap::new();
    for turn in canonical_turns {
        if turns_by_id
            .insert(turn.turn_id.as_str().to_string(), turn)
            .is_some()
        {
            return Err(invalid(format!(
                "thread/fork canonical history has duplicate turn {}",
                turn.turn_id
            )));
        }
    }
    let mut items_by_sequence = BTreeMap::new();
    for item in canonical_items {
        validate_fork_canonical_item(item)?;
        if item.sequence == 0 || item.sequence > through_sequence {
            return Err(invalid(format!(
                "thread/fork canonical item {} has invalid sequence {} through {}",
                item.item_id, item.sequence, through_sequence
            )));
        }
        if items_by_sequence.insert(item.sequence, item).is_some() {
            return Err(invalid(format!(
                "thread/fork canonical history has duplicate item sequence {}",
                item.sequence
            )));
        }
        if !turns_by_id.contains_key(item.turn_id.as_str()) {
            return Err(invalid(format!(
                "thread/fork canonical item {} has no owning turn",
                item.item_id
            )));
        }
    }
    for turn in canonical_turns {
        if !canonical_items
            .iter()
            .any(|item| item.turn_id == turn.turn_id)
        {
            return Err(invalid(format!(
                "thread/fork cannot preserve turn {} without canonical items",
                turn.turn_id
            )));
        }
    }

    (1..=through_sequence)
        .map(|sequence| {
            let item = items_by_sequence.get(&sequence).copied();
            let timestamp = item
                .and_then(|item| {
                    chrono::Utc
                        .timestamp_millis_opt(item.updated_at_ms)
                        .single()
                        .map(|value| value.to_rfc3339())
                })
                .unwrap_or_else(|| session.updated_at.clone());
            let payload = item.map_or(Value::Null, |item| {
                let mut turn = (*turns_by_id
                    .get(item.turn_id.as_str())
                    .expect("canonical item turn was validated"))
                .clone();
                turn.items.clear();
                serde_json::json!({ "item": item, "forkTurn": turn })
            });
            Ok(AgentEvent {
                event_id: format!("evt-thread-fork-baseline-{}-{sequence}", session.session_id),
                sequence,
                session_id: session.session_id.clone(),
                thread_id: Some(session.thread_id.clone()),
                turn_id: item.map(|item| item.turn_id.as_str().to_string()),
                event_type: if item.is_some() {
                    FORK_CANONICAL_ITEM_EVENT_TYPE.to_string()
                } else {
                    "thread.fork.baseline".to_string()
                },
                timestamp,
                payload,
            })
        })
        .collect()
}

fn merge_fork_history_seed(
    stored: &mut StoredSession,
    seed: Vec<AgentEvent>,
) -> Result<(), RuntimeCoreError> {
    stored.events = merge_fork_history_events(seed, std::mem::take(&mut stored.events))?;
    Ok(())
}

pub(in crate::runtime) fn merge_fork_history_events(
    seed: Vec<AgentEvent>,
    mut existing: Vec<AgentEvent>,
) -> Result<Vec<AgentEvent>, RuntimeCoreError> {
    let prefix_len = seed.len();
    let mut merged = seed;
    existing.sort_by_key(|event| event.sequence);

    for event in existing {
        let sequence = usize::try_from(event.sequence)
            .map_err(|_| invalid("thread/fork event sequence does not fit in memory"))?;
        if sequence == 0 {
            return Err(invalid("thread/fork event sequence must start at one"));
        }
        if sequence <= prefix_len {
            let canonical = &merged[sequence - 1];
            if canonical.sequence != event.sequence
                || canonical.event_id != event.event_id
                || canonical.session_id != event.session_id
                || canonical.thread_id != event.thread_id
                || canonical.turn_id != event.turn_id
                || canonical.event_type != event.event_type
                || canonical.payload != event.payload
            {
                return Err(invalid(format!(
                    "thread/fork canonical seed conflicts at sequence {}: canonical={canonical:?}, existing={event:?}",
                    event.sequence,
                )));
            }
            continue;
        }
        let expected = merged.len() + 1;
        if sequence != expected {
            return Err(invalid(format!(
                "thread/fork target EventLog is not contiguous: expected {expected}, got {sequence}"
            )));
        }
        merged.push(event);
    }
    Ok(merged)
}

fn session_status(status: &ThreadStatus) -> AgentSessionStatus {
    match status {
        ThreadStatus::Active { .. } => AgentSessionStatus::Running,
        ThreadStatus::SystemError => AgentSessionStatus::Failed,
        ThreadStatus::NotLoaded | ThreadStatus::Idle => AgentSessionStatus::Idle,
    }
}

fn turn_status(status: agent_protocol::TurnStatus) -> AgentTurnStatus {
    match status {
        agent_protocol::TurnStatus::InProgress => AgentTurnStatus::Running,
        agent_protocol::TurnStatus::Completed => AgentTurnStatus::Completed,
        agent_protocol::TurnStatus::Interrupted => AgentTurnStatus::Canceled,
        agent_protocol::TurnStatus::Failed => AgentTurnStatus::Failed,
    }
}

fn invalid(message: impl Into<String>) -> RuntimeCoreError {
    RuntimeCoreError::Backend(message.into())
}

fn store_error(error: impl std::fmt::Display) -> RuntimeCoreError {
    RuntimeCoreError::Backend(error.to_string())
}
