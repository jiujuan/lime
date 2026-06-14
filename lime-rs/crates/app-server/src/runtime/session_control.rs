use super::status::{agent_turn_blocks_queue_resume, agent_turn_is_active};
use super::*;
use app_server_protocol::*;
use serde_json::json;
use std::collections::HashSet;

fn validate_runtime_resume_contract(
    contract: Option<&RuntimeResumeContract>,
    session_id: &str,
) -> Result<(), RuntimeCoreError> {
    let Some(contract) = contract else {
        return Ok(());
    };
    if contract.schema_version != RUNTIME_RESUME_CONTRACT_SCHEMA_VERSION {
        return Err(RuntimeCoreError::CapabilityDenied(
            "runtime.resume_contract.schema_version".to_string(),
        ));
    }
    if contract.runtime_id.trim().is_empty()
        || contract.session_id.trim().is_empty()
        || contract.turn_id.trim().is_empty()
        || contract.resume_mode.trim().is_empty()
        || contract.created_at.trim().is_empty()
    {
        return Err(RuntimeCoreError::CapabilityDenied(
            "runtime.resume_contract.required_fields".to_string(),
        ));
    }
    if contract.session_id != session_id {
        return Err(RuntimeCoreError::CapabilityDenied(
            "runtime.resume_contract.session_mismatch".to_string(),
        ));
    }
    if contract.resume_mode == "all-open-actions" || contract.resume_mode == "selected-actions" {
        let decision_ids: HashSet<&str> = contract
            .decisions
            .iter()
            .map(|decision| decision.action_id.as_str())
            .filter(|action_id| !action_id.trim().is_empty())
            .collect();
        if contract
            .open_action_ids
            .iter()
            .any(|action_id| !decision_ids.contains(action_id.as_str()))
        {
            return Err(RuntimeCoreError::CapabilityDenied(
                "runtime.resume_contract.open_action_coverage".to_string(),
            ));
        }
    }
    Ok(())
}

fn normalize_session_control_id(value: &str, message: &str) -> Result<String, RuntimeCoreError> {
    let normalized = value.trim();
    if normalized.is_empty() {
        Err(RuntimeCoreError::Backend(message.to_string()))
    } else {
        Ok(normalized.to_string())
    }
}

impl RuntimeCore {
    pub async fn compact_agent_session(
        &self,
        params: AgentSessionCompactParams,
    ) -> Result<RuntimeCoreOutput<AgentSessionCompactResponse>, RuntimeCoreError> {
        let session_id = normalize_session_control_id(
            &params.session_id,
            "sessionId is required for agentSession/compact",
        )?;
        self.ensure_current_timeline_session_hydrated(&session_id)
            .await?;
        let (session, turns) = self.session_snapshot(&session_id)?;
        let event_name = params
            .event_name
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("agentSession/compact");
        let events = self.append_runtime_events(
            &session.session_id,
            &session.thread_id,
            None,
            vec![
                RuntimeEvent::new(
                    "context.compaction.started",
                    json!({
                        "source": "agentSession/compact",
                        "eventName": event_name,
                        "turnCount": turns.len(),
                        "trigger": "manual",
                    }),
                ),
                RuntimeEvent::new(
                    "context.compaction.completed",
                    json!({
                        "source": "agentSession/compact",
                        "eventName": event_name,
                        "turnCount": turns.len(),
                        "trigger": "manual",
                        "summary": "App Server current compaction checkpoint recorded.",
                    }),
                ),
            ],
        )?;
        let (session, turns) = self.session_snapshot(&session_id)?;

        Ok(RuntimeCoreOutput {
            response: AgentSessionCompactResponse {
                session,
                turns,
                compacted: true,
            },
            events,
        })
    }

    pub async fn resume_agent_session_thread(
        &self,
        params: AgentSessionThreadResumeParams,
        host: RuntimeHostContext,
    ) -> Result<RuntimeCoreOutput<AgentSessionThreadResumeResponse>, RuntimeCoreError> {
        let session_id = normalize_session_control_id(
            &params.session_id,
            "sessionId is required for agentSession/thread/resume",
        )?;
        validate_runtime_resume_contract(params.resume_contract.as_ref(), &session_id)?;
        self.ensure_current_timeline_session_hydrated(&session_id)
            .await?;
        let queued = {
            let mut state = self
                .state
                .lock()
                .expect("runtime core state mutex poisoned");
            let stored = state
                .sessions
                .get_mut(&session_id)
                .ok_or_else(|| RuntimeCoreError::SessionNotFound(session_id.clone()))?;
            if stored
                .turns
                .iter()
                .any(|turn| agent_turn_blocks_queue_resume(turn.status))
            {
                let session = stored.session.clone();
                let turns = stored.turns.clone();
                return Ok(RuntimeCoreOutput {
                    response: AgentSessionThreadResumeResponse {
                        session,
                        turns,
                        resumed: false,
                    },
                    events: Vec::new(),
                });
            }
            let Some(index) = stored
                .turns
                .iter()
                .position(|turn| matches!(turn.status, AgentTurnStatus::Queued))
            else {
                let session = stored.session.clone();
                let turns = stored.turns.clone();
                return Ok(RuntimeCoreOutput {
                    response: AgentSessionThreadResumeResponse {
                        session,
                        turns,
                        resumed: false,
                    },
                    events: Vec::new(),
                });
            };
            let turn = stored.turns.remove(index);
            let input = stored
                .turn_inputs
                .remove(&turn.turn_id)
                .unwrap_or_else(|| AgentInput {
                    text: String::new(),
                    attachments: Vec::new(),
                });
            (index, turn, input)
        };
        let output = match self
            .start_turn(
                AgentSessionTurnStartParams {
                    session_id: session_id.clone(),
                    turn_id: Some(queued.1.turn_id.clone()),
                    input: queued.2.clone(),
                    runtime_options: Some(app_server_protocol::RuntimeOptions {
                        queued_turn_id: Some(queued.1.turn_id.clone()),
                        ..app_server_protocol::RuntimeOptions::default()
                    }),
                    queue_if_busy: false,
                    skip_pre_submit_resume: true,
                },
                host,
            )
            .await
        {
            Ok(output) => output,
            Err(error) => {
                self.restore_queued_turn_if_missing(&session_id, queued.0, queued.1, queued.2);
                return Err(error);
            }
        };
        let (session, turns) = self.session_snapshot(&session_id)?;

        Ok(RuntimeCoreOutput {
            response: AgentSessionThreadResumeResponse {
                session,
                turns,
                resumed: true,
            },
            events: output.events,
        })
    }

    pub async fn remove_agent_session_queued_turn(
        &self,
        params: AgentSessionQueuedTurnRemoveParams,
    ) -> Result<RuntimeCoreOutput<AgentSessionQueuedTurnRemoveResponse>, RuntimeCoreError> {
        let session_id = normalize_session_control_id(
            &params.session_id,
            "sessionId is required for agentSession/queuedTurn/remove",
        )?;
        let queued_turn_id = normalize_session_control_id(
            &params.queued_turn_id,
            "queuedTurnId is required for agentSession/queuedTurn/remove",
        )?;
        self.ensure_current_timeline_session_hydrated(&session_id)
            .await?;
        let (session, removed) = {
            let mut state = self
                .state
                .lock()
                .expect("runtime core state mutex poisoned");
            let stored = state
                .sessions
                .get_mut(&session_id)
                .ok_or_else(|| RuntimeCoreError::SessionNotFound(session_id.clone()))?;
            let before = stored.turns.len();
            stored.turns.retain(|turn| {
                !(turn.turn_id == queued_turn_id && matches!(turn.status, AgentTurnStatus::Queued))
            });
            let removed = stored.turns.len() != before;
            if removed {
                stored.turn_inputs.remove(&queued_turn_id);
                stored.turn_runtime_options.remove(&queued_turn_id);
                stored.session.updated_at = timestamp();
                if !stored
                    .turns
                    .iter()
                    .any(|turn| agent_turn_is_active(turn.status))
                {
                    stored.session.status = AgentSessionStatus::Idle;
                }
            }
            (stored.session.clone(), removed)
        };
        let events = if removed {
            self.append_runtime_events(
                &session.session_id,
                &session.thread_id,
                None,
                vec![RuntimeEvent::new(
                    "queue.removed",
                    json!({
                        "source": "agentSession/queuedTurn/remove",
                        "queuedTurnId": queued_turn_id,
                    }),
                )],
            )?
        } else {
            Vec::new()
        };
        let (session, turns) = self.session_snapshot(&session_id)?;

        Ok(RuntimeCoreOutput {
            response: AgentSessionQueuedTurnRemoveResponse {
                session,
                turns,
                queued_turn_id,
                removed,
            },
            events,
        })
    }

    pub async fn promote_agent_session_queued_turn(
        &self,
        params: AgentSessionQueuedTurnPromoteParams,
    ) -> Result<RuntimeCoreOutput<AgentSessionQueuedTurnPromoteResponse>, RuntimeCoreError> {
        let session_id = normalize_session_control_id(
            &params.session_id,
            "sessionId is required for agentSession/queuedTurn/promote",
        )?;
        let queued_turn_id = normalize_session_control_id(
            &params.queued_turn_id,
            "queuedTurnId is required for agentSession/queuedTurn/promote",
        )?;
        self.ensure_current_timeline_session_hydrated(&session_id)
            .await?;
        let (session, promoted) = {
            let mut state = self
                .state
                .lock()
                .expect("runtime core state mutex poisoned");
            let stored = state
                .sessions
                .get_mut(&session_id)
                .ok_or_else(|| RuntimeCoreError::SessionNotFound(session_id.clone()))?;
            let Some(index) = stored.turns.iter().position(|turn| {
                turn.turn_id == queued_turn_id && matches!(turn.status, AgentTurnStatus::Queued)
            }) else {
                return Ok(RuntimeCoreOutput {
                    response: AgentSessionQueuedTurnPromoteResponse {
                        session: stored.session.clone(),
                        turns: stored.turns.clone(),
                        queued_turn_id,
                        promoted: false,
                    },
                    events: Vec::new(),
                });
            };
            let turn = stored.turns.remove(index);
            let insert_at = stored
                .turns
                .iter()
                .position(|turn| matches!(turn.status, AgentTurnStatus::Queued))
                .unwrap_or(stored.turns.len());
            stored.turns.insert(insert_at, turn);
            stored.session.updated_at = timestamp();
            (stored.session.clone(), true)
        };
        let events = if promoted {
            self.append_runtime_events(
                &session.session_id,
                &session.thread_id,
                None,
                vec![RuntimeEvent::new(
                    "queue.promoted",
                    json!({
                        "source": "agentSession/queuedTurn/promote",
                        "queuedTurnId": queued_turn_id,
                    }),
                )],
            )?
        } else {
            Vec::new()
        };
        let (session, turns) = self.session_snapshot(&session_id)?;

        Ok(RuntimeCoreOutput {
            response: AgentSessionQueuedTurnPromoteResponse {
                session,
                turns,
                queued_turn_id,
                promoted,
            },
            events,
        })
    }

    pub async fn list_agent_session_file_checkpoints(
        &self,
        params: AgentSessionFileCheckpointListParams,
    ) -> Result<AgentSessionFileCheckpointListResponse, RuntimeCoreError> {
        let detail = self
            .read_current_detail_for_file_checkpoint(&params.session_id)
            .await?;
        crate::file_checkpoint::list_file_checkpoints(&detail).map_err(RuntimeCoreError::Backend)
    }

    pub async fn get_agent_session_file_checkpoint(
        &self,
        params: AgentSessionFileCheckpointGetParams,
    ) -> Result<AgentSessionFileCheckpointDetail, RuntimeCoreError> {
        let detail = self
            .read_current_detail_for_file_checkpoint(&params.session_id)
            .await?;
        let workspace_root = crate::file_checkpoint::resolve_workspace_root(&detail)
            .map_err(RuntimeCoreError::Backend)?;
        crate::file_checkpoint::get_file_checkpoint(
            &detail,
            workspace_root.as_path(),
            self.file_checkpoint_snapshot_store.as_ref(),
            &params.checkpoint_id,
        )
        .map_err(RuntimeCoreError::Backend)
    }

    pub async fn diff_agent_session_file_checkpoint(
        &self,
        params: AgentSessionFileCheckpointDiffParams,
    ) -> Result<AgentSessionFileCheckpointDiffResponse, RuntimeCoreError> {
        let detail = self
            .read_current_detail_for_file_checkpoint(&params.session_id)
            .await?;
        crate::file_checkpoint::diff_file_checkpoint(&detail, &params.checkpoint_id)
            .map_err(RuntimeCoreError::Backend)
    }

    pub async fn restore_agent_session_file_checkpoint(
        &self,
        params: AgentSessionFileCheckpointRestoreParams,
    ) -> Result<AgentSessionFileCheckpointRestoreResponse, RuntimeCoreError> {
        let detail = self
            .read_current_detail_for_file_checkpoint(&params.session_id)
            .await?;
        let workspace_root = crate::file_checkpoint::resolve_workspace_root(&detail)
            .map_err(RuntimeCoreError::Backend)?;
        crate::file_checkpoint::restore_file_checkpoint(
            &detail,
            workspace_root.as_path(),
            self.file_checkpoint_snapshot_store.as_ref(),
            &params.checkpoint_id,
            params.confirm_restore,
            params.create_backup,
        )
        .map_err(RuntimeCoreError::Backend)
    }

    async fn read_current_detail_for_file_checkpoint(
        &self,
        session_id: &str,
    ) -> Result<serde_json::Value, RuntimeCoreError> {
        let normalized_session_id = session_id.trim();
        if normalized_session_id.is_empty() {
            return Err(RuntimeCoreError::Backend(
                "sessionId is required for agentSession/fileCheckpoint".to_string(),
            ));
        }
        let response = self
            .read_session_current(AgentSessionReadParams {
                session_id: normalized_session_id.to_string(),
                history_limit: Some(1_000),
                history_offset: None,
                history_before_message_id: None,
            })
            .await?;
        response.detail.ok_or_else(|| {
            RuntimeCoreError::Backend(
                "agentSession/fileCheckpoint requires current session detail".to_string(),
            )
        })
    }
}
