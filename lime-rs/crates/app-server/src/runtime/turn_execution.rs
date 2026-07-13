use super::event_store::{append_runtime_events_to_state, append_workflow_audit_runtime_events};
use super::plugin_worker_workflow_cancel::workflow_cancel_events_from_audit_records;
use super::status::{agent_turn_blocks_queue_resume, agent_turn_is_active, agent_turn_is_terminal};
use super::workflow::events::{WORKFLOW_RUN_RESUMING, WORKFLOW_STEP_RESUMING};
use super::*;
use app_server_protocol::*;
use serde_json::json;
use serde_json::Value;
use std::sync::{Arc, Mutex};

#[derive(Default)]
pub(in crate::runtime) struct CollectingRuntimeEventSink {
    events: Vec<RuntimeEvent>,
}

impl CollectingRuntimeEventSink {
    fn emitted_count(&self) -> usize {
        self.events.len()
    }

    fn has_turn_terminal_event(&self) -> bool {
        self.events
            .iter()
            .any(|event| runtime_event_is_turn_terminal(&event.event_type))
    }

    fn into_events(self) -> Vec<RuntimeEvent> {
        self.events
    }

    fn emit_failure(&mut self, error: &RuntimeCoreError) -> Result<(), RuntimeCoreError> {
        self.emit(RuntimeEvent::new(
            "turn.failed",
            json!({
                "message": error.to_string(),
            }),
        ))
    }
}

fn runtime_event_is_turn_terminal(event_type: &str) -> bool {
    matches!(
        event_type,
        "turn.completed" | "turn.failed" | "turn.canceled"
    )
}

fn app_server_action_resolved_event(request: &ActionRespondRequest) -> RuntimeEvent {
    let mut payload = json!({
        "backend": "runtime_core",
        "source": "runtime_preflight",
        "requestId": request.request_id,
        "actionId": request.request_id,
        "actionType": request.action_type,
        "confirmed": request.confirmed,
        "response": request.response,
        "userData": request.user_data,
        "scope": request.action_scope,
    });
    if let Some(decision) = request.decision {
        if let Some(object) = payload.as_object_mut() {
            object.insert("decision".to_string(), json!(decision.as_str()));
            object.insert("decisionScope".to_string(), json!(decision.scope()));
        }
    }
    RuntimeEvent::new("action.resolved", payload)
}

impl RuntimeEventSink for CollectingRuntimeEventSink {
    fn emit(&mut self, event: RuntimeEvent) -> Result<(), RuntimeCoreError> {
        self.events.push(event);
        Ok(())
    }
}

fn workflow_resume_audit_events_from_action_response(
    params: &AgentSessionActionRespondParams,
    decision: Option<AgentSessionApprovalDecision>,
    confirmed: bool,
) -> Vec<RuntimeEvent> {
    let Some(metadata) = params.metadata.as_ref() else {
        return Vec::new();
    };
    let Some(binding) = workflow_resume_binding_from_action_metadata(metadata) else {
        return Vec::new();
    };
    let decision_text = decision
        .map(|decision| decision.as_str())
        .unwrap_or_else(|| if confirmed { "approved" } else { "rejected" });
    let decision_scope = decision.map(|decision| decision.scope()).unwrap_or("once");
    let status_decision = if confirmed { "approved" } else { "rejected" };
    let base_payload = json!({
        "workflowRunId": binding.workflow_run_id,
        "workflowKey": binding.workflow_key,
        "stepId": binding.step_id,
        "actionId": params.request_id,
        "decision": decision_text,
        "decisionScope": decision_scope,
        "statusDecision": status_decision,
        "status": "resuming",
        "source": "agentSession/action/respond",
    });
    vec![
        RuntimeEvent::new(WORKFLOW_STEP_RESUMING, base_payload.clone()),
        RuntimeEvent::new(WORKFLOW_RUN_RESUMING, base_payload),
    ]
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct WorkflowResumeActionBinding {
    workflow_run_id: String,
    workflow_key: String,
    step_id: String,
}

fn workflow_resume_binding_from_action_metadata(
    metadata: &Value,
) -> Option<WorkflowResumeActionBinding> {
    for candidate in workflow_resume_action_metadata_candidates(metadata) {
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
        return Some(WorkflowResumeActionBinding {
            workflow_run_id,
            workflow_key,
            step_id,
        });
    }
    None
}

fn workflow_resume_action_metadata_candidates(metadata: &Value) -> Vec<&Value> {
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

struct TerminalDeferringRuntimeEventSink<'a> {
    inner: &'a mut dyn RuntimeEventSink,
    defer_turn_completed: bool,
    deferred_turn_completed: &'a mut Vec<RuntimeEvent>,
}

impl<'a> TerminalDeferringRuntimeEventSink<'a> {
    fn new(
        inner: &'a mut dyn RuntimeEventSink,
        defer_turn_completed: bool,
        deferred_turn_completed: &'a mut Vec<RuntimeEvent>,
    ) -> Self {
        Self {
            inner,
            defer_turn_completed,
            deferred_turn_completed,
        }
    }
}

impl RuntimeEventSink for TerminalDeferringRuntimeEventSink<'_> {
    fn emit(&mut self, event: RuntimeEvent) -> Result<(), RuntimeCoreError> {
        if self.defer_turn_completed && event.event_type == "turn.completed" {
            self.deferred_turn_completed.push(event);
            return Ok(());
        }
        self.inner.emit(event)
    }
}

pub(in crate::runtime) struct AppendingRuntimeEventSink<'a> {
    state: Arc<Mutex<RuntimeCoreState>>,
    file_checkpoint_snapshot_store: Arc<dyn FileCheckpointSnapshotStore>,
    output_snapshot_store: Arc<dyn output_refs::OutputSnapshotStore>,
    sidecar_store: Option<Arc<SidecarStore>>,
    event_log_writer: Option<Arc<EventLogWriter>>,
    trace_event_writer: Option<Arc<TraceEventWriter>>,
    projection_store: Option<Arc<ProjectionStore>>,
    session_id: String,
    thread_id: String,
    turn_id: String,
    callback: &'a mut RuntimeEventCallback<'a>,
    events: Vec<AgentEvent>,
}

impl<'a> AppendingRuntimeEventSink<'a> {
    fn new(
        state: Arc<Mutex<RuntimeCoreState>>,
        file_checkpoint_snapshot_store: Arc<dyn FileCheckpointSnapshotStore>,
        output_snapshot_store: Arc<dyn output_refs::OutputSnapshotStore>,
        sidecar_store: Option<Arc<SidecarStore>>,
        event_log_writer: Option<Arc<EventLogWriter>>,
        trace_event_writer: Option<Arc<TraceEventWriter>>,
        projection_store: Option<Arc<ProjectionStore>>,
        session_id: String,
        thread_id: String,
        turn_id: String,
        callback: &'a mut RuntimeEventCallback<'a>,
    ) -> Self {
        Self {
            state,
            file_checkpoint_snapshot_store,
            output_snapshot_store,
            sidecar_store,
            event_log_writer,
            trace_event_writer,
            projection_store,
            session_id,
            thread_id,
            turn_id,
            callback,
            events: Vec::new(),
        }
    }

    fn emitted_count(&self) -> usize {
        self.events.len()
    }

    fn into_events(self) -> Vec<AgentEvent> {
        self.events
    }

    fn emit_failure(&mut self, error: &RuntimeCoreError) -> Result<(), RuntimeCoreError> {
        self.emit(RuntimeEvent::new(
            "turn.failed",
            json!({
                "message": error.to_string(),
            }),
        ))
    }
}

impl RuntimeEventSink for AppendingRuntimeEventSink<'_> {
    fn emit(&mut self, event: RuntimeEvent) -> Result<(), RuntimeCoreError> {
        if self.is_duplicate_accepted_event(&event) {
            return Ok(());
        }
        let mut events = append_runtime_events_to_state(
            &self.state,
            self.file_checkpoint_snapshot_store.as_ref(),
            self.output_snapshot_store.as_ref(),
            self.sidecar_store.as_deref(),
            self.event_log_writer.as_deref(),
            self.trace_event_writer.as_deref(),
            self.projection_store.as_deref(),
            &self.session_id,
            &self.thread_id,
            Some(&self.turn_id),
            vec![event],
        )?;
        for event in events.drain(..) {
            (self.callback)(event.clone())?;
            self.events.push(event);
        }
        Ok(())
    }
}

impl AppendingRuntimeEventSink<'_> {
    fn is_duplicate_accepted_event(&self, event: &RuntimeEvent) -> bool {
        event.event_type == "turn.accepted"
            && self
                .events
                .iter()
                .any(|existing| existing.event_type == "turn.accepted")
    }
}

impl RuntimeCore {
    pub async fn start_turn(
        &self,
        params: AgentSessionTurnStartParams,
        host: RuntimeHostContext,
    ) -> Result<RuntimeCoreOutput<AgentSessionTurnStartResponse>, RuntimeCoreError> {
        self.start_turn_inner(params, host, None, true).await
    }

    pub(crate) async fn start_turn_with_event_callback(
        &self,
        params: AgentSessionTurnStartParams,
        host: RuntimeHostContext,
        event_callback: &mut RuntimeEventCallback<'_>,
    ) -> Result<RuntimeCoreOutput<AgentSessionTurnStartResponse>, RuntimeCoreError> {
        self.start_turn_inner(params, host, Some(event_callback), true)
            .await
    }

    pub(in crate::runtime) async fn start_turn_inner(
        &self,
        mut params: AgentSessionTurnStartParams,
        host: RuntimeHostContext,
        mut event_callback: Option<&mut RuntimeEventCallback<'_>>,
        enable_auto_continuation: bool,
    ) -> Result<RuntimeCoreOutput<AgentSessionTurnStartResponse>, RuntimeCoreError> {
        self.ensure_current_session_hydrated(&params.session_id)
            .await?;

        if let Some(defaults) = self.imported_session_runtime_options(&params.session_id)? {
            params.runtime_options =
                Some(super::imported_session_runtime::merge_with_request_options(
                    defaults,
                    params.runtime_options.take(),
                ));
        }
        let pre_turn_events = self
            .maybe_auto_compact_before_turn(&params.session_id, params.runtime_options.as_ref())
            .await?;
        if let Some(callback) = event_callback.as_deref_mut() {
            for event in pre_turn_events.iter().cloned() {
                callback(event)?;
            }
        }
        self.prepare_memory_prompt_context(&mut params).await;
        self.prepare_session_compaction_prompt_context(&mut params);
        self.prepare_media_prompt_context(&mut params);
        let session_approval_cache_entry = {
            let state = self
                .state
                .lock()
                .expect("runtime core state mutex poisoned");
            let session_workspace_id = state
                .sessions
                .get(&params.session_id)
                .and_then(|stored| stored.session.workspace_id.as_deref());
            super::approval_cache::apply_hint_to_turn_start(
                &state.session_approval_cache,
                &mut params,
                session_workspace_id,
            )
        };

        if let Some(capability_id) = params
            .runtime_options
            .as_ref()
            .and_then(|options| options.capability_id.as_deref())
        {
            let capability_context = self.capability_list_context(CapabilityListParams {
                session_id: Some(params.session_id.clone()),
                ..CapabilityListParams::default()
            })?;
            self.capability_source
                .prepare_turn_capabilities(&capability_context, params.runtime_options.as_ref());
            self.ensure_capability_allowed_with_context(&capability_context, capability_id)?;
        }

        let queued_turn = {
            let mut state = self
                .state
                .lock()
                .expect("runtime core state mutex poisoned");
            let stored = state
                .sessions
                .get_mut(&params.session_id)
                .ok_or_else(|| RuntimeCoreError::SessionNotFound(params.session_id.clone()))?;
            let turn_id = optional_id_or_new(params.turn_id.clone(), "turn");
            let active_turn_id = stored
                .turns
                .iter()
                .find(|turn| {
                    if params.skip_pre_submit_resume {
                        agent_turn_blocks_queue_resume(turn.status)
                    } else {
                        agent_turn_is_active(turn.status)
                    }
                })
                .map(|turn| turn.turn_id.clone());
            if params.queue_if_busy && active_turn_id.is_some() {
                if let Some(existing_turn) = stored
                    .turns
                    .iter()
                    .find(|turn| {
                        (agent_turn_is_active(turn.status)
                            || matches!(turn.status, AgentTurnStatus::Queued))
                            && stored
                                .turn_inputs
                                .get(&turn.turn_id)
                                .is_some_and(|input| input == &params.input)
                    })
                    .cloned()
                {
                    Some((stored.session.clone(), existing_turn, false))
                } else {
                    let turn = AgentTurn {
                        turn_id,
                        session_id: stored.session.session_id.clone(),
                        thread_id: stored.session.thread_id.clone(),
                        status: AgentTurnStatus::Queued,
                        started_at: Some(timestamp()),
                        completed_at: None,
                    };
                    stored.session.status = AgentSessionStatus::Running;
                    stored.session.updated_at = timestamp();
                    stored
                        .turn_inputs
                        .insert(turn.turn_id.clone(), params.input.clone());
                    if let Some(runtime_options) = params.runtime_options.clone() {
                        stored
                            .turn_runtime_options
                            .insert(turn.turn_id.clone(), runtime_options);
                    }
                    stored.turns.push(turn.clone());
                    Some((stored.session.clone(), turn, true))
                }
            } else {
                if let Some(active_turn_id) = active_turn_id {
                    return Err(RuntimeCoreError::TurnAlreadyActive(active_turn_id));
                }
                None
            }
        };
        if let Some((session, turn, append_queue_event)) = queued_turn {
            if !append_queue_event {
                return Ok(RuntimeCoreOutput {
                    response: AgentSessionTurnStartResponse { turn },
                    events: Vec::new(),
                });
            }
            let events = self.append_runtime_events(
                &session.session_id,
                &session.thread_id,
                Some(&turn.turn_id),
                vec![RuntimeEvent::new(
                    "queue.added",
                    json!({
                        "source": "agentSession/turn/start",
                        "queuedTurnId": params
                            .runtime_options
                            .as_ref()
                            .and_then(|options| options.queued_turn_id.clone())
                            .unwrap_or_else(|| turn.turn_id.clone()),
                    }),
                )],
            )?;
            return Ok(RuntimeCoreOutput {
                response: AgentSessionTurnStartResponse { turn },
                events,
            });
        }

        let (session, previous_session, turn, provider_history) = {
            let mut state = self
                .state
                .lock()
                .expect("runtime core state mutex poisoned");
            let stored = state
                .sessions
                .get_mut(&params.session_id)
                .ok_or_else(|| RuntimeCoreError::SessionNotFound(params.session_id.clone()))?;
            let turn_id = optional_id_or_new(params.turn_id.clone(), "turn");
            let previous_session = stored.session.clone();

            let turn = AgentTurn {
                turn_id,
                session_id: stored.session.session_id.clone(),
                thread_id: stored.session.thread_id.clone(),
                status: AgentTurnStatus::Accepted,
                started_at: Some(timestamp()),
                completed_at: None,
            };

            stored.session.status = AgentSessionStatus::Running;
            stored.session.updated_at = timestamp();
            stored
                .turn_inputs
                .insert(turn.turn_id.clone(), params.input.clone());
            if let Some(runtime_options) = params.runtime_options.clone() {
                stored
                    .turn_runtime_options
                    .insert(turn.turn_id.clone(), runtime_options);
            }
            stored.turns.push(turn.clone());

            let provider_history = super::provider_history::provider_history(
                stored,
                self.output_snapshot_store.as_ref(),
            );
            (
                stored.session.clone(),
                previous_session,
                turn,
                provider_history,
            )
        };

        let runtime_options = params.runtime_options.clone();
        let request_host = host.clone();
        let request = ExecutionRequest {
            host,
            session: session.clone(),
            turn: turn.clone(),
            input: params.input,
            event_name: params
                .runtime_options
                .as_ref()
                .and_then(|options| options.event_name.clone()),
            expected_output: runtime_options
                .as_ref()
                .and_then(|options| options.expected_output.clone()),
            structured_output: runtime_options
                .as_ref()
                .and_then(|options| options.structured_output.clone()),
            output_schema: runtime_options
                .as_ref()
                .and_then(|options| options.output_schema.clone()),
            queued_turn_id: params
                .runtime_options
                .as_ref()
                .and_then(|options| options.queued_turn_id.clone()),
            runtime_options: params.runtime_options,
            queue_if_busy: params.queue_if_busy,
            skip_pre_submit_resume: params.skip_pre_submit_resume,
        };

        let backend_events = if let Some(event_callback) = event_callback {
            let mut sink = AppendingRuntimeEventSink::new(
                self.state.clone(),
                self.file_checkpoint_snapshot_store.clone(),
                self.output_snapshot_store.clone(),
                self.sidecar_store.clone(),
                self.event_log_writer.clone(),
                self.trace_event_writer.clone(),
                self.projection_store.clone(),
                session.session_id.clone(),
                session.thread_id.clone(),
                turn.turn_id.clone(),
                event_callback,
            );
            sink.emit(RuntimeEvent::new(
                "turn.accepted",
                json!({
                    "backend": "app_server",
                    "source": "agentSession/turn/start",
                }),
            ))?;
            if let Some(event) = super::expert_role_switch::runtime_event_from_request_metadata(
                request.runtime_metadata(),
            ) {
                sink.emit(event)?;
            }
            if let Some(entry) = session_approval_cache_entry.as_ref() {
                sink.emit(RuntimeEvent::new(
                    "approval.session_cache.hit",
                    json!({
                        "backend": "runtime_core",
                        "decision": entry.decision.as_str(),
                        "decisionScope": entry.decision.scope(),
                        "sourceRequestId": &entry.request_id,
                        "key": super::approval_cache::entry_key_metadata(entry),
                    }),
                ))?;
            }
            let materialize_plugin_activation =
                self.should_materialize_plugin_activation_turn(&request);
            let mut deferred_turn_completed = Vec::new();
            let backend_result = {
                let mut backend_sink = TerminalDeferringRuntimeEventSink::new(
                    &mut sink,
                    materialize_plugin_activation,
                    &mut deferred_turn_completed,
                );
                match self
                    .maybe_run_plugin_worker_turn(&request, &mut backend_sink)
                    .await
                {
                    Ok(true) => Ok(()),
                    Ok(false) => {
                        self.backend
                            .start_turn_with_provider_history(
                                request.clone(),
                                provider_history.clone(),
                                &mut backend_sink,
                            )
                            .await
                    }
                    Err(error) => Err(error),
                }
            };
            if let Err(error) = backend_result {
                if sink.emitted_count() > 0 {
                    sink.emit_failure(&error)?;
                } else {
                    self.rollback_started_turn(
                        &session.session_id,
                        &turn.turn_id,
                        previous_session,
                    );
                }
                return Err(error);
            }
            if materialize_plugin_activation {
                if let Err(error) = self
                    .maybe_materialize_plugin_activation_artifacts(&request, &mut sink)
                    .await
                {
                    sink.emit_failure(&error)?;
                    return Err(error);
                }
            }
            for event in deferred_turn_completed {
                sink.emit(event)?;
            }
            let events = sink.into_events();
            events
        } else {
            let mut sink = CollectingRuntimeEventSink::default();
            if let Some(event) = super::expert_role_switch::runtime_event_from_request_metadata(
                request.runtime_metadata(),
            ) {
                sink.emit(event)?;
            }
            if let Some(entry) = session_approval_cache_entry.as_ref() {
                sink.emit(RuntimeEvent::new(
                    "approval.session_cache.hit",
                    json!({
                        "backend": "runtime_core",
                        "decision": entry.decision.as_str(),
                        "decisionScope": entry.decision.scope(),
                        "sourceRequestId": &entry.request_id,
                        "key": super::approval_cache::entry_key_metadata(entry),
                    }),
                ))?;
            }
            let materialize_plugin_activation =
                self.should_materialize_plugin_activation_turn(&request);
            let mut deferred_turn_completed = Vec::new();
            let backend_result = {
                let mut backend_sink = TerminalDeferringRuntimeEventSink::new(
                    &mut sink,
                    materialize_plugin_activation,
                    &mut deferred_turn_completed,
                );
                match self
                    .maybe_run_plugin_worker_turn(&request, &mut backend_sink)
                    .await
                {
                    Ok(true) => Ok(()),
                    Ok(false) => {
                        self.backend
                            .start_turn_with_provider_history(
                                request.clone(),
                                provider_history.clone(),
                                &mut backend_sink,
                            )
                            .await
                    }
                    Err(error) => Err(error),
                }
            };
            if let Err(error) = backend_result {
                if sink.emitted_count() > 0 {
                    sink.emit_failure(&error)?;
                    if let Err(append_error) = self.append_runtime_events(
                        &session.session_id,
                        &session.thread_id,
                        Some(&turn.turn_id),
                        sink.into_events(),
                    ) {
                        self.rollback_started_turn(
                            &session.session_id,
                            &turn.turn_id,
                            previous_session,
                        );
                        return Err(append_error);
                    }
                } else {
                    self.rollback_started_turn(
                        &session.session_id,
                        &turn.turn_id,
                        previous_session,
                    );
                }
                return Err(error);
            }
            if materialize_plugin_activation {
                if let Err(error) = self
                    .maybe_materialize_plugin_activation_artifacts(&request, &mut sink)
                    .await
                {
                    sink.emit_failure(&error)?;
                    if let Err(append_error) = self.append_runtime_events(
                        &session.session_id,
                        &session.thread_id,
                        Some(&turn.turn_id),
                        sink.into_events(),
                    ) {
                        self.rollback_started_turn(
                            &session.session_id,
                            &turn.turn_id,
                            previous_session,
                        );
                        return Err(append_error);
                    }
                    return Err(error);
                }
            }
            for event in deferred_turn_completed {
                sink.emit(event)?;
            }
            match self.append_runtime_events(
                &session.session_id,
                &session.thread_id,
                Some(&turn.turn_id),
                sink.into_events(),
            ) {
                Ok(backend_events) => backend_events,
                Err(error) => {
                    self.rollback_started_turn(
                        &session.session_id,
                        &turn.turn_id,
                        previous_session,
                    );
                    return Err(error);
                }
            }
        };
        let mut events = pre_turn_events;
        events.extend(backend_events);
        let response_turn = self
            .stored_turn(&session.session_id, &turn.turn_id)?
            .unwrap_or(turn);
        if enable_auto_continuation && agent_turn_is_terminal(response_turn.status) {
            self.maybe_submit_managed_objective_auto_continuation(
                &session.session_id,
                request_host,
            )
            .await;
        }

        Ok(RuntimeCoreOutput {
            response: AgentSessionTurnStartResponse {
                turn: response_turn,
            },
            events,
        })
    }

    pub async fn cancel_turn(
        &self,
        params: AgentSessionTurnCancelParams,
        host: RuntimeHostContext,
    ) -> Result<RuntimeCoreOutput<AgentSessionTurnCancelResponse>, RuntimeCoreError> {
        let (session, turn_snapshot) = {
            let state = self
                .state
                .lock()
                .expect("runtime core state mutex poisoned");
            let stored = state
                .sessions
                .get(&params.session_id)
                .ok_or_else(|| RuntimeCoreError::SessionNotFound(params.session_id.clone()))?;
            let turn = stored
                .turns
                .iter()
                .find(|turn| turn.turn_id == params.turn_id)
                .ok_or_else(|| RuntimeCoreError::TurnNotActive(params.turn_id.clone()))?;

            (stored.session.clone(), turn.clone())
        };

        let events = self.append_runtime_events(
            &session.session_id,
            &session.thread_id,
            Some(&turn_snapshot.turn_id),
            vec![RuntimeEvent::new(
                "turn.canceled",
                json!({
                    "source": "agentSession/turn/cancel",
                    "backend": "runtime_core",
                }),
            )],
        )?;
        {
            let mut state = self
                .state
                .lock()
                .expect("runtime core state mutex poisoned");
            super::approval_cache::remove_session(
                &mut state.session_approval_cache,
                &session.session_id,
            );
        }
        if !events.is_empty() {
            if let Some(event_log_writer) = self.event_log_writer.as_deref() {
                let workflow_audit_records = event_log_writer
                    .read_session_workflow_audit_events(&session.session_id)
                    .map_err(RuntimeCoreError::Backend)?;
                append_workflow_audit_runtime_events(
                    Some(event_log_writer),
                    &session.session_id,
                    &session.thread_id,
                    Some(&turn_snapshot.turn_id),
                    workflow_cancel_events_from_audit_records(
                        &workflow_audit_records,
                        &turn_snapshot.turn_id,
                    ),
                )?;
            }
        }

        if agent_turn_is_active(turn_snapshot.status) {
            let backend = self.backend.clone();
            tokio::spawn(async move {
                let mut sink = CollectingRuntimeEventSink::default();
                let _ = backend
                    .cancel_turn(
                        CancelExecutionRequest {
                            host,
                            session,
                            turn: turn_snapshot,
                        },
                        &mut sink,
                    )
                    .await;
            });
        }

        Ok(RuntimeCoreOutput {
            response: AgentSessionTurnCancelResponse {},
            events,
        })
    }

    pub async fn replay_action(
        &self,
        params: AgentSessionActionReplayParams,
    ) -> Result<RuntimeCoreOutput<AgentSessionActionReplayResponse>, RuntimeCoreError> {
        self.ensure_current_session_hydrated(&params.session_id)
            .await?;
        let action = {
            let state = self
                .state
                .lock()
                .expect("runtime core state mutex poisoned");
            let stored = state
                .sessions
                .get(&params.session_id)
                .ok_or_else(|| RuntimeCoreError::SessionNotFound(params.session_id.clone()))?;
            read_model::replayed_action_required_from_stored_session(stored, &params.request_id)
        };

        Ok(RuntimeCoreOutput {
            response: AgentSessionActionReplayResponse { action },
            events: Vec::new(),
        })
    }

    pub async fn respond_action(
        &self,
        params: AgentSessionActionRespondParams,
        host: RuntimeHostContext,
    ) -> Result<RuntimeCoreOutput<AgentSessionActionRespondResponse>, RuntimeCoreError> {
        self.ensure_current_session_hydrated(&params.session_id)
            .await?;
        let request_id = params.request_id.clone();
        let (session, turn_snapshot, pending_action_identity, pending_action_descriptor) = {
            let state = self
                .state
                .lock()
                .expect("runtime core state mutex poisoned");
            let stored = state
                .sessions
                .get(&params.session_id)
                .ok_or_else(|| RuntimeCoreError::SessionNotFound(params.session_id.clone()))?;
            let pending_action_identity =
                pending_action_descriptor::identity_from_stored_session(stored, &request_id)
                    .ok_or_else(|| RuntimeCoreError::ActionResponse {
                        code: "action_not_found".to_string(),
                        request_id: request_id.clone(),
                    })?;
            let turn_id = pending_action_identity
                .scope
                .turn_id
                .as_deref()
                .expect("pending action identity always has complete scope");
            let turn = stored
                .turns
                .iter()
                .find(|turn| turn.turn_id == turn_id)
                .expect("pending action identity always references a waiting turn")
                .clone();
            let pending_action_descriptor =
                pending_action_descriptor::from_stored_session(stored, &request_id);
            (
                stored.session.clone(),
                Some(turn),
                pending_action_identity,
                pending_action_descriptor,
            )
        };
        if params.action_type != pending_action_identity.action_type {
            return Err(RuntimeCoreError::ActionResponse {
                code: "action_type_mismatch".to_string(),
                request_id,
            });
        }
        match params.action_scope.as_ref() {
            None => {
                return Err(RuntimeCoreError::ActionResponse {
                    code: "action_scope_missing".to_string(),
                    request_id,
                });
            }
            Some(scope) if scope != &pending_action_identity.scope => {
                return Err(RuntimeCoreError::ActionResponse {
                    code: "action_scope_mismatch".to_string(),
                    request_id,
                });
            }
            Some(_) => {}
        }
        let decision = match pending_action_identity.action_type {
            AgentSessionActionType::ToolConfirmation => Some(params.decision.ok_or_else(|| {
                RuntimeCoreError::Backend(
                    "tool_confirmation action/respond requires decision".to_string(),
                )
            })?),
            AgentSessionActionType::AskUser | AgentSessionActionType::Elicitation => {
                if params.decision.is_some() {
                    return Err(RuntimeCoreError::Backend(
                        "approval decision is only valid for tool_confirmation action/respond"
                            .to_string(),
                    ));
                }
                None
            }
        };
        let confirmed = decision
            .map(AgentSessionApprovalDecision::confirmed)
            .unwrap_or_else(|| params.confirmed.unwrap_or(false));
        let workflow_resume_audit_events =
            workflow_resume_audit_events_from_action_response(&params, decision, confirmed);
        let (cancel_denied_permission_action, app_server_owned_permission_action) = {
            let state = self
                .state
                .lock()
                .expect("runtime core state mutex poisoned");
            let stored = state
                .sessions
                .get(&params.session_id)
                .ok_or_else(|| RuntimeCoreError::SessionNotFound(params.session_id.clone()))?;
            if let Some(decision) = decision {
                super::approval_decision_contract::validate_tool_confirmation_decision(
                    stored,
                    &request_id,
                    decision,
                )?;
            }
            let cancel_denied_permission_action =
                super::permission_state_projection::should_cancel_denied_permission_action(
                    stored,
                    &request_id,
                    decision.is_some_and(AgentSessionApprovalDecision::is_cancel),
                );
            let app_server_owned_permission_action =
                super::permission_state_projection::is_runtime_preflight_action(
                    stored,
                    &request_id,
                );
            (
                cancel_denied_permission_action,
                app_server_owned_permission_action,
            )
        };

        let session_approval_cache_entry = {
            let state = self
                .state
                .lock()
                .expect("runtime core state mutex poisoned");
            let stored = state
                .sessions
                .get(&params.session_id)
                .ok_or_else(|| RuntimeCoreError::SessionNotFound(params.session_id.clone()))?;
            super::approval_cache::entry_from_action_response(
                stored,
                &request_id,
                decision,
                params.action_scope.clone(),
                super::timestamp(),
            )
        };
        if decision == Some(AgentSessionApprovalDecision::AllowForSession)
            && session_approval_cache_entry.is_none()
        {
            return Err(RuntimeCoreError::Backend(format!(
                "allow_for_session requires session approval cache owner for tool_confirmation request '{}'",
                request_id
            )));
        }

        let mut sink = CollectingRuntimeEventSink::default();
        let action_response = ActionRespondRequest {
            host: host.clone(),
            session: session.clone(),
            turn: turn_snapshot.clone(),
            request_id: request_id.clone(),
            action_type: params.action_type,
            decision,
            confirmed,
            response: params.response,
            user_data: params.user_data,
            metadata: params.metadata,
            event_name: params.event_name,
            action_scope: params.action_scope,
            pending_action_descriptor,
        };
        if app_server_owned_permission_action {
            sink.emit(app_server_action_resolved_event(&action_response))?;
        } else {
            self.backend
                .respond_action(action_response, &mut sink)
                .await?;
        }
        let backend_cancel_requested = decision
            .is_some_and(AgentSessionApprovalDecision::is_cancel)
            && turn_snapshot
                .as_ref()
                .is_some_and(|turn| agent_turn_is_active(turn.status));
        if backend_cancel_requested && !sink.has_turn_terminal_event() {
            self.backend
                .cancel_turn(
                    CancelExecutionRequest {
                        host,
                        session: session.clone(),
                        turn: turn_snapshot
                            .clone()
                            .expect("active turn snapshot must exist for approval cancel"),
                    },
                    &mut sink,
                )
                .await?;
        }
        if cancel_denied_permission_action && !backend_cancel_requested {
            sink.emit(RuntimeEvent::new(
                "turn.canceled",
                json!({
                    "backend": "runtime",
                    "reason": "permission_denied",
                    "requestId": request_id,
                }),
            ))?;
        }
        let events = self.append_runtime_events(
            &session.session_id,
            &session.thread_id,
            turn_snapshot.as_ref().map(|turn| turn.turn_id.as_str()),
            sink.into_events(),
        )?;
        append_workflow_audit_runtime_events(
            self.event_log_writer.as_deref(),
            &session.session_id,
            &session.thread_id,
            turn_snapshot.as_ref().map(|turn| turn.turn_id.as_str()),
            workflow_resume_audit_events,
        )?;
        if let Some(entry) = session_approval_cache_entry {
            let mut state = self
                .state
                .lock()
                .expect("runtime core state mutex poisoned");
            super::approval_cache::insert_entry(
                &mut state.session_approval_cache,
                &params.session_id,
                entry,
            );
        }
        if decision.is_some_and(AgentSessionApprovalDecision::is_cancel) {
            let mut state = self
                .state
                .lock()
                .expect("runtime core state mutex poisoned");
            super::approval_cache::remove_session(
                &mut state.session_approval_cache,
                &params.session_id,
            );
        }

        Ok(RuntimeCoreOutput {
            response: AgentSessionActionRespondResponse {},
            events,
        })
    }

    pub fn events_for_session(
        &self,
        session_id: &str,
    ) -> Result<Vec<AgentEvent>, RuntimeCoreError> {
        let state = self
            .state
            .lock()
            .expect("runtime core state mutex poisoned");
        let stored = state
            .sessions
            .get(session_id)
            .ok_or_else(|| RuntimeCoreError::SessionNotFound(session_id.to_string()))?;
        Ok(stored.events.clone())
    }

    pub fn append_external_runtime_events(
        &self,
        session_id: &str,
        turn_id: Option<&str>,
        runtime_events: Vec<RuntimeEvent>,
    ) -> Result<Vec<AgentEvent>, RuntimeCoreError> {
        self.event_appender()
            .append_external_runtime_events(session_id, turn_id, runtime_events)
    }

    pub(in crate::runtime) fn append_runtime_events(
        &self,
        session_id: &str,
        thread_id: &str,
        turn_id: Option<&str>,
        runtime_events: Vec<RuntimeEvent>,
    ) -> Result<Vec<AgentEvent>, RuntimeCoreError> {
        append_runtime_events_to_state(
            &self.state,
            self.file_checkpoint_snapshot_store.as_ref(),
            self.output_snapshot_store.as_ref(),
            self.sidecar_store.as_deref(),
            self.event_log_writer.as_deref(),
            self.trace_event_writer.as_deref(),
            self.projection_store.as_deref(),
            session_id,
            thread_id,
            turn_id,
            runtime_events,
        )
    }
}
