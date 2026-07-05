use super::event_store;
use super::status::{agent_turn_blocks_queue_resume, agent_turn_is_active};
use super::workflow::events::{WORKFLOW_RUN_RESUMING, WORKFLOW_STEP_RESUMING};
use super::*;
use app_server_protocol::*;
use serde_json::json;
use serde_json::Map;
use serde_json::Value;
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

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct WorkflowResumeAuditBinding {
    workflow_run_id: String,
    workflow_key: String,
    step_id: String,
    action_id: String,
    decision: String,
}

fn workflow_resume_audit_events_from_contract(
    contract: Option<&RuntimeResumeContract>,
    queued_turn_id: &str,
) -> Vec<RuntimeEvent> {
    let Some(contract) = contract else {
        return Vec::new();
    };
    let mut seen = HashSet::new();
    let mut events = Vec::new();
    for decision in &contract.decisions {
        let Some(metadata) = decision.metadata.as_ref() else {
            continue;
        };
        let Some(binding) = workflow_resume_binding_from_metadata(metadata, decision) else {
            continue;
        };
        if !seen.insert(binding.clone()) {
            continue;
        }
        let base_payload = json!({
            "workflowRunId": binding.workflow_run_id,
            "workflowKey": binding.workflow_key,
            "stepId": binding.step_id,
            "actionId": binding.action_id,
            "decision": binding.decision,
            "status": "resuming",
            "resumeMode": contract.resume_mode,
            "runtimeId": contract.runtime_id,
            "contractTurnId": contract.turn_id,
            "queuedTurnId": queued_turn_id,
            "schemaVersion": contract.schema_version,
            "source": "agentSession/thread/resume",
        });
        events.push(RuntimeEvent::new(
            WORKFLOW_STEP_RESUMING,
            base_payload.clone(),
        ));
        events.push(RuntimeEvent::new(WORKFLOW_RUN_RESUMING, base_payload));
    }
    events
}

fn workflow_resume_binding_from_metadata(
    metadata: &Value,
    decision: &RuntimeResumeActionDecision,
) -> Option<WorkflowResumeAuditBinding> {
    let action_id = decision.action_id.trim();
    let decision_value = decision.decision.trim();
    if action_id.is_empty() || decision_value.is_empty() {
        return None;
    }
    for candidate in workflow_resume_metadata_candidates(metadata) {
        let Some(workflow_run_id) = string_field(
            candidate,
            &["workflowRunId", "workflow_run_id", "runId", "run_id"],
        ) else {
            continue;
        };
        let Some(workflow_key) = string_field(
            candidate,
            &["workflowKey", "workflow_key", "key", "workflow"],
        ) else {
            continue;
        };
        let Some(step_id) = string_field(candidate, &["stepId", "step_id", "id"]) else {
            continue;
        };
        return Some(WorkflowResumeAuditBinding {
            workflow_run_id,
            workflow_key,
            step_id,
            action_id: action_id.to_string(),
            decision: decision_value.to_string(),
        });
    }
    None
}

fn workflow_resume_metadata_candidates(metadata: &Value) -> Vec<&Value> {
    let mut candidates = vec![metadata];
    for key in [
        "workflowResume",
        "workflow_resume",
        "workflowResumeLifecycle",
        "workflow_resume_lifecycle",
        "workerLifecycle",
        "worker_lifecycle",
        "pluginWorkflow",
        "plugin_workflow",
    ] {
        if let Some(candidate) = metadata.get(key) {
            candidates.push(candidate);
        }
    }
    candidates
}

fn string_field(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .filter_map(|key| value.get(*key))
        .find_map(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
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
        self.ensure_current_session_hydrated(&session_id).await?;
        let (session, turns) = self.session_snapshot(&session_id)?;
        let existing_events = self.events_for_session(&session_id)?;
        let compaction = super::context_compaction::build_session_context_compaction(
            &session,
            &turns,
            &existing_events,
            self.sidecar_store.as_deref(),
        )?;
        let event_name = params
            .event_name
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("agentSession/compact");
        let mut completed_payload = Map::new();
        completed_payload.insert("source".to_string(), json!("agentSession/compact"));
        completed_payload.insert("eventName".to_string(), json!(event_name));
        completed_payload.insert("compactionId".to_string(), json!(compaction.compaction_id));
        completed_payload.insert("contextEpoch".to_string(), json!(compaction.context_epoch));
        completed_payload.insert(
            "tailStartTurnId".to_string(),
            json!(compaction.tail_start_turn_id),
        );
        completed_payload.insert("turnCount".to_string(), json!(turns.len()));
        completed_payload.insert("trigger".to_string(), json!("manual"));
        completed_payload.insert("summary".to_string(), json!(compaction.summary));
        completed_payload.insert("artifact".to_string(), json!(compaction.artifact));
        completed_payload.insert(
            output_refs::SIDECAR_REF_FIELD.to_string(),
            json!(compaction.sidecar_ref),
        );

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
                        "compactionId": compaction.compaction_id,
                        "contextEpoch": compaction.context_epoch,
                        "tailStartTurnId": compaction.tail_start_turn_id,
                        "turnCount": turns.len(),
                        "trigger": "manual",
                    }),
                ),
                RuntimeEvent::new(
                    "context.compaction.completed",
                    Value::Object(completed_payload),
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
        self.ensure_current_session_hydrated(&session_id).await?;
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
            let runtime_options = stored.turn_runtime_options.remove(&turn.turn_id);
            (index, turn, input, runtime_options)
        };
        let queued_turn_id = queued.1.turn_id.clone();
        let workflow_resume_audit_events = workflow_resume_audit_events_from_contract(
            params.resume_contract.as_ref(),
            &queued_turn_id,
        );
        let mut resumed_runtime_options = queued.3.clone().unwrap_or_default();
        resumed_runtime_options.queued_turn_id = Some(queued_turn_id.clone());
        let output = match self
            .start_turn(
                AgentSessionTurnStartParams {
                    session_id: session_id.clone(),
                    turn_id: Some(queued_turn_id.clone()),
                    input: queued.2.clone(),
                    runtime_options: Some(resumed_runtime_options),
                    queue_if_busy: false,
                    skip_pre_submit_resume: true,
                },
                host,
            )
            .await
        {
            Ok(output) => output,
            Err(error) => {
                self.restore_queued_turn_if_missing(
                    &session_id,
                    queued.0,
                    queued.1,
                    queued.2,
                    queued.3,
                );
                return Err(error);
            }
        };
        let (session, turns) = self.session_snapshot(&session_id)?;
        event_store::append_workflow_audit_runtime_events(
            self.event_log_writer.as_deref(),
            &session.session_id,
            &session.thread_id,
            Some(&queued_turn_id),
            workflow_resume_audit_events,
        )?;

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
        self.ensure_current_session_hydrated(&session_id).await?;
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
        self.ensure_current_session_hydrated(&session_id).await?;
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
