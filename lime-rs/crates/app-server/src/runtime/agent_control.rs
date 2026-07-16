//! Canonical parent/child graph control backed by RuntimeCore and ProjectionStore.
//!
//! The graph is deliberately independent of legacy session metadata and Team state. A child is
//! usable only after its canonical session/thread, identity, initial mailbox, and Open edge exist.

use super::agent_control_gateway_support::{
    required_agent_control_id, stable_agent_control_digest,
};
use super::*;
use agent_protocol::{
    ItemStatus, ThreadId, ThreadItemPayload, ThreadTurnsView, TurnQueueState, TurnStatus,
};
use app_server_protocol::{AgentSessionStartParams, AgentSessionStatus, AgentTurnStatus};
use serde_json::json;
use thread_store::{
    AgentGraphStore, ReadThreadParams, ThreadMetadataPatch, ThreadStore, UpdateThreadMetadataParams,
};
use tool_runtime::agent_control::SpawnAgentForkMode;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct AgentControlSpawnRequest {
    pub parent_session_id: String,
    pub child_session_id: Option<String>,
    pub child_thread_id: Option<String>,
    pub fork_mode: SpawnAgentForkMode,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct AgentControlSpawnResponse {
    pub session: AgentSession,
    pub parent_thread_id: String,
}

impl RuntimeCore {
    pub(in crate::runtime) fn is_pending_agent_control_thread(
        &self,
        thread_id: &str,
    ) -> Result<bool, RuntimeCoreError> {
        self.projection_store
            .as_ref()
            .map(|store| {
                store
                    .is_pending_thread_spawn_sync(&ThreadId::new(thread_id))
                    .map_err(|error| RuntimeCoreError::Backend(error.to_string()))
            })
            .transpose()
            .map(|pending| pending.unwrap_or(false))
    }

    /// Reserves a hidden durable intent and materializes the canonical child session/thread.
    ///
    /// A graph-enabled control path requires ProjectionStore. We fail before session creation
    /// when it is unavailable so an in-memory child cannot escape without durable topology.
    pub(crate) async fn stage_agent_control_spawn(
        &self,
        request: AgentControlSpawnRequest,
    ) -> Result<AgentControlSpawnResponse, RuntimeCoreError> {
        let AgentControlSpawnRequest {
            parent_session_id,
            child_session_id,
            child_thread_id,
            fork_mode,
        } = request;
        let parent_session_id = required_agent_control_id(
            parent_session_id,
            "parent session id is required for agent control spawn",
        )?;
        let projection_store = self.projection_store.as_ref().ok_or_else(|| {
            RuntimeCoreError::Backend(
                "agent control requires canonical ProjectionStore".to_string(),
            )
        })?;
        let parent = self.loaded_agent_control_parent(&parent_session_id)?;
        let child_session_id = child_session_id
            .map(|value| required_agent_control_id(value, "child session id is empty"))
            .transpose()?
            .unwrap_or_else(|| new_id("sess"));
        let child_thread_id = child_thread_id
            .map(|value| required_agent_control_id(value, "child thread id is empty"))
            .transpose()?
            .unwrap_or_else(|| new_id("thread"));
        let inherits_parent_history = fork_mode != SpawnAgentForkMode::None;
        let parent_thread = projection_store
            .read_thread_sync(ReadThreadParams {
                thread_id: ThreadId::new(parent.thread_id.clone()),
                include_archived: true,
                turns_view: ThreadTurnsView::Full,
            })
            .map_err(|error| {
                RuntimeCoreError::Backend(format!(
                    "failed to read canonical parent history for fork: {error}"
                ))
            })?
            .ok_or_else(|| {
                RuntimeCoreError::Backend(format!(
                    "canonical parent thread is missing: {}",
                    parent.thread_id
                ))
            })?;
        let forked_turns = {
            let state = self
                .state
                .lock()
                .expect("runtime core state mutex poisoned");
            let stored_parent = state
                .sessions
                .get(&parent_session_id)
                .ok_or_else(|| RuntimeCoreError::SessionNotFound(parent_session_id.to_string()))?;
            selected_agent_control_fork_turns(stored_parent, &parent_thread.turns, fork_mode)?
        };

        projection_store
            .create_pending_thread_spawn_edge(
                ThreadId::new(parent.thread_id.clone()),
                ThreadId::new(child_thread_id.clone()),
                child_session_id.clone(),
            )
            .await
            .map_err(|error| {
                RuntimeCoreError::Backend(format!(
                    "failed to reserve canonical child thread spawn: {error}"
                ))
            })?;

        let response = match self.start_session(AgentSessionStartParams {
            session_id: Some(child_session_id.clone()),
            thread_id: Some(child_thread_id.clone()),
            app_id: parent.app_id,
            workspace_id: parent.workspace_id,
            business_object_ref: None,
            locale: None,
        }) {
            Ok(response) => response,
            Err(error) => {
                return match projection_store
                    .delete_thread_spawn_edge(ThreadId::new(child_thread_id))
                    .await
                {
                    Ok(()) => Err(error),
                    Err(cleanup_error) => Err(RuntimeCoreError::Backend(format!(
                        "failed to create canonical child session: {error}; failed to remove pending spawn intent: {cleanup_error}"
                    ))),
                };
            }
        };
        if let Err(error) = self.append_runtime_events(
            &response.session.session_id,
            &response.session.thread_id,
            None,
            vec![RuntimeEvent::new(
                "session.created",
                json!({ "session": &response.session }),
            )],
        ) {
            return match self
                .rollback_staged_agent_control_spawn(&response.session)
                .await
            {
                Ok(()) => Err(error),
                Err(cleanup_error) => Err(RuntimeCoreError::Backend(format!(
                    "failed to persist canonical child session: {error}; failed to remove partial child session: {cleanup_error}"
                ))),
            };
        }
        if inherits_parent_history {
            if let Err(error) = projection_store
                .update_thread_metadata(UpdateThreadMetadataParams {
                    thread_id: ThreadId::new(response.session.thread_id.clone()),
                    patch: ThreadMetadataPatch {
                        forked_from_id: Some(ThreadId::new(parent.thread_id.clone())),
                        ..Default::default()
                    },
                    include_archived: false,
                })
                .await
            {
                return match self
                    .rollback_staged_agent_control_spawn(&response.session)
                    .await
                {
                    Ok(()) => Err(RuntimeCoreError::Backend(format!(
                        "failed to persist canonical fork lineage: {error}"
                    ))),
                    Err(cleanup_error) => Err(RuntimeCoreError::Backend(format!(
                        "failed to persist canonical fork lineage: {error}; failed to remove partial child session: {cleanup_error}"
                    ))),
                };
            }
        }
        if let Err(error) = self.fork_agent_control_history(&response.session, forked_turns) {
            return match self
                .rollback_staged_agent_control_spawn(&response.session)
                .await
            {
                Ok(()) => Err(error),
                Err(cleanup_error) => Err(RuntimeCoreError::Backend(format!(
                    "failed to fork canonical parent history: {error}; failed to remove partial child session: {cleanup_error}"
                ))),
            };
        }
        Ok(AgentControlSpawnResponse {
            session: response.session,
            parent_thread_id: parent.thread_id,
        })
    }

    pub(crate) async fn commit_agent_control_spawn(
        &self,
        child: &AgentSession,
    ) -> Result<(), RuntimeCoreError> {
        let projection_store = self.projection_store.as_ref().ok_or_else(|| {
            RuntimeCoreError::Backend(
                "agent control requires canonical ProjectionStore".to_string(),
            )
        })?;
        let committed = projection_store
            .commit_pending_thread_spawn_edge(
                ThreadId::new(child.thread_id.clone()),
                child.session_id.clone(),
            )
            .await
            .map_err(|error| {
                RuntimeCoreError::Backend(format!(
                    "failed to commit canonical child thread spawn: {error}"
                ))
            })?;
        if committed {
            Ok(())
        } else {
            Err(RuntimeCoreError::Backend(format!(
                "pending child thread spawn is missing or changed: {}",
                child.thread_id
            )))
        }
    }

    #[cfg(test)]
    pub(crate) async fn create_open_agent_control_child_for_test(
        &self,
        request: AgentControlSpawnRequest,
    ) -> Result<AgentControlSpawnResponse, RuntimeCoreError> {
        let response = self.stage_agent_control_spawn(request).await?;
        self.commit_agent_control_spawn(&response.session).await?;
        Ok(response)
    }

    async fn rollback_staged_agent_control_spawn(
        &self,
        child: &AgentSession,
    ) -> Result<(), String> {
        self.delete_agent_control_child_data(&child.session_id)?;
        let projection_store = self.projection_store.as_ref().ok_or_else(|| {
            "canonical ProjectionStore is missing during spawn rollback".to_string()
        })?;
        projection_store
            .delete_thread_spawn_edge(ThreadId::new(child.thread_id.clone()))
            .await
            .map_err(|error| format!("graph edge: {error}"))
    }

    fn loaded_agent_control_parent(
        &self,
        session_id: &str,
    ) -> Result<AgentSession, RuntimeCoreError> {
        self.state
            .lock()
            .expect("runtime core state mutex poisoned")
            .sessions
            .get(session_id)
            .map(|stored| stored.session.clone())
            .ok_or_else(|| RuntimeCoreError::SessionNotFound(session_id.to_string()))
    }

    fn fork_agent_control_history(
        &self,
        child: &AgentSession,
        forked_turns: Vec<ForkedAgentControlTurn>,
    ) -> Result<(), RuntimeCoreError> {
        for forked in forked_turns {
            let turn_id = format!(
                "fork-{}",
                stable_agent_control_digest(&[
                    child.thread_id.as_str(),
                    forked.source_thread_id.as_str(),
                    forked.source_turn_id.as_str(),
                ])
            );
            {
                let mut state = self
                    .state
                    .lock()
                    .expect("runtime core state mutex poisoned");
                let stored = state
                    .sessions
                    .get_mut(&child.session_id)
                    .ok_or_else(|| RuntimeCoreError::SessionNotFound(child.session_id.clone()))?;
                stored.session.status = AgentSessionStatus::Running;
                stored.session.updated_at = timestamp();
                stored.turn_inputs.insert(turn_id.clone(), forked.input);
                stored.turns.push(AgentTurn {
                    turn_id: turn_id.clone(),
                    session_id: child.session_id.clone(),
                    thread_id: child.thread_id.clone(),
                    status: AgentTurnStatus::Running,
                    started_at: None,
                    completed_at: None,
                });
            }

            let mut events = Vec::with_capacity(forked.assistant_messages.len() * 2 + 2);
            events.push(RuntimeEvent::new(
                "turn.started",
                json!({
                    "forked": true,
                    "forkedFromThreadId": forked.source_thread_id,
                    "forkedFromTurnId": forked.source_turn_id,
                }),
            ));
            for message in forked.assistant_messages {
                let item_id = format!(
                    "fork-{}",
                    stable_agent_control_digest(&[
                        child.thread_id.as_str(),
                        message.source_item_id.as_str(),
                    ])
                );
                let payload = json!({
                    "itemId": item_id,
                    "phase": "final_answer",
                    "text": message.text,
                    "contentParts": message.content_parts,
                    "metadata": {
                        "forkedFromThreadId": message.source_thread_id,
                        "forkedFromTurnId": message.source_turn_id,
                        "forkedFromItemId": message.source_item_id,
                    },
                });
                events.push(RuntimeEvent::new("message.delta", payload.clone()));
                events.push(RuntimeEvent::new(
                    "message.completed",
                    with_completed_message_status(payload),
                ));
            }
            events.push(RuntimeEvent::new(
                "turn.completed",
                json!({ "forked": true }),
            ));
            self.append_runtime_events(
                &child.session_id,
                &child.thread_id,
                Some(&turn_id),
                events,
            )?;
        }
        Ok(())
    }

    pub(in crate::runtime) fn delete_agent_control_child_data(
        &self,
        session_id: &str,
    ) -> Result<(), String> {
        let child_session_id = session_id.to_string();
        let mut cleanup_errors = Vec::new();
        if let Some(projection_store) = self.projection_store.as_ref() {
            if let Err(error) = projection_store.delete_session_data(&child_session_id) {
                cleanup_errors.push(format!("canonical projection: {error}"));
            }
        }
        if let Some(event_log_writer) = self.event_log_writer.as_ref() {
            if let Err(error) = event_log_writer.clear_session(&child_session_id) {
                cleanup_errors.push(format!("event log: {error}"));
            }
        }
        if let Some(sidecar_store) = self.sidecar_store.as_ref() {
            if let Err(error) = sidecar_store.clear_session(&child_session_id) {
                cleanup_errors.push(format!("sidecar: {error}"));
            }
        }
        let mut state = self
            .state
            .lock()
            .expect("runtime core state mutex poisoned");
        super::approval_cache::remove_session(&mut state.session_approval_cache, &child_session_id);
        state.sessions.remove(&child_session_id);
        if cleanup_errors.is_empty() {
            Ok(())
        } else {
            Err(cleanup_errors.join("; "))
        }
    }
}

#[derive(Debug, Clone)]
struct ForkedAgentControlTurn {
    source_thread_id: String,
    source_turn_id: String,
    input: AgentInput,
    assistant_messages: Vec<ForkedAgentControlMessage>,
}

#[derive(Debug, Clone)]
struct ForkedAgentControlMessage {
    source_thread_id: String,
    source_turn_id: String,
    source_item_id: String,
    text: String,
    content_parts: Vec<agent_protocol::MessageContentPart>,
}

fn selected_agent_control_fork_turns(
    parent: &StoredSession,
    canonical_turns: &[agent_protocol::Turn],
    fork_mode: SpawnAgentForkMode,
) -> Result<Vec<ForkedAgentControlTurn>, RuntimeCoreError> {
    if fork_mode == SpawnAgentForkMode::None {
        return Ok(Vec::new());
    }
    let mut turns = canonical_turns
        .iter()
        .filter(|turn| !matches!(turn.queue, TurnQueueState::Queued { .. }))
        .filter_map(|turn| {
            let mut canonical_inputs = turn.items.iter().filter_map(|item| {
                if item.status != ItemStatus::Completed {
                    return None;
                }
                match &item.payload {
                    ThreadItemPayload::UserMessage { .. } => Some(()),
                    _ => None,
                }
            });
            canonical_inputs.next()?;
            Some((turn, canonical_inputs.next().is_some()))
        })
        .map(|(turn, has_duplicate_input)| {
            if has_duplicate_input {
                return Err(RuntimeCoreError::Backend(format!(
                    "canonical fork source Turn {} contains multiple user inputs",
                    turn.turn_id
                )));
            }
            let input = parent
                .turn_inputs
                .get(turn.turn_id.as_str())
                .cloned()
                .ok_or_else(|| {
                    RuntimeCoreError::Backend(format!(
                        "canonical fork source Turn {} is missing durable input",
                        turn.turn_id
                    ))
                })?;
            let assistant_messages = if turn.status == TurnStatus::Completed {
                turn.items
                    .iter()
                    .filter(|item| item.status == ItemStatus::Completed)
                    .filter_map(|item| match &item.payload {
                        ThreadItemPayload::AgentMessage {
                            text,
                            phase,
                            content_parts,
                        } if phase.as_deref() == Some("final_answer") => {
                            Some(ForkedAgentControlMessage {
                                source_thread_id: turn.thread_id.as_str().to_string(),
                                source_turn_id: turn.turn_id.as_str().to_string(),
                                source_item_id: item.item_id.as_str().to_string(),
                                text: text.clone(),
                                content_parts: content_parts.clone(),
                            })
                        }
                        _ => None,
                    })
                    .collect()
            } else {
                Vec::new()
            };
            Ok(ForkedAgentControlTurn {
                source_thread_id: turn.thread_id.as_str().to_string(),
                source_turn_id: turn.turn_id.as_str().to_string(),
                input,
                assistant_messages,
            })
        })
        .collect::<Result<Vec<_>, _>>()?;
    if let SpawnAgentForkMode::LastNTurns(limit) = fork_mode {
        turns = turns.split_off(turns.len().saturating_sub(limit));
    }
    Ok(turns)
}

fn with_completed_message_status(mut payload: serde_json::Value) -> serde_json::Value {
    if let Some(payload) = payload.as_object_mut() {
        payload.insert("status".to_string(), json!("completed"));
    }
    payload
}

#[cfg(test)]
#[path = "tests/agent_control.rs"]
mod tests;
