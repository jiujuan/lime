use super::event_store::append_runtime_events_to_state;
use super::status::{agent_turn_is_active, agent_turn_is_terminal};
use super::*;
use app_server_protocol::*;
use serde_json::json;
use std::sync::{Arc, Mutex};

#[derive(Default)]
pub(in crate::runtime) struct CollectingRuntimeEventSink {
    events: Vec<RuntimeEvent>,
}

impl CollectingRuntimeEventSink {
    fn emitted_count(&self) -> usize {
        self.events.len()
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

impl RuntimeEventSink for CollectingRuntimeEventSink {
    fn emit(&mut self, event: RuntimeEvent) -> Result<(), RuntimeCoreError> {
        self.events.push(event);
        Ok(())
    }
}

pub(in crate::runtime) struct AppendingRuntimeEventSink<'a> {
    state: Arc<Mutex<RuntimeCoreState>>,
    file_checkpoint_snapshot_store: Arc<dyn FileCheckpointSnapshotStore>,
    output_snapshot_store: Arc<dyn output_refs::OutputSnapshotStore>,
    sidecar_store: Option<Arc<SidecarStore>>,
    event_log_writer: Option<Arc<EventLogWriter>>,
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

    fn extend_events(&mut self, events: Vec<AgentEvent>) {
        self.events.extend(events);
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
        let mut events = append_runtime_events_to_state(
            &self.state,
            self.file_checkpoint_snapshot_store.as_ref(),
            self.output_snapshot_store.as_ref(),
            self.sidecar_store.as_deref(),
            self.event_log_writer.as_deref(),
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
        params: AgentSessionTurnStartParams,
        host: RuntimeHostContext,
        event_callback: Option<&mut RuntimeEventCallback<'_>>,
        enable_auto_continuation: bool,
    ) -> Result<RuntimeCoreOutput<AgentSessionTurnStartResponse>, RuntimeCoreError> {
        self.ensure_current_session_hydrated(&params.session_id)
            .await?;

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
                .find(|turn| agent_turn_is_active(turn.status))
                .map(|turn| turn.turn_id.clone());
            if params.queue_if_busy && active_turn_id.is_some() {
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
                Some((stored.session.clone(), turn))
            } else {
                if let Some(active_turn_id) = active_turn_id {
                    return Err(RuntimeCoreError::TurnAlreadyActive(active_turn_id));
                }
                None
            }
        };
        if let Some((session, turn)) = queued_turn {
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

        let (session, previous_session, turn) = {
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

            (stored.session.clone(), previous_session, turn)
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
            provider_preference: params
                .runtime_options
                .as_ref()
                .and_then(|options| options.provider_preference.clone()),
            model_preference: params
                .runtime_options
                .as_ref()
                .and_then(|options| options.model_preference.clone()),
            metadata: params
                .runtime_options
                .as_ref()
                .and_then(|options| options.metadata.clone()),
            queued_turn_id: params
                .runtime_options
                .as_ref()
                .and_then(|options| options.queued_turn_id.clone()),
            runtime_options: params.runtime_options,
            queue_if_busy: params.queue_if_busy,
            skip_pre_submit_resume: params.skip_pre_submit_resume,
        };

        let events = if let Some(event_callback) = event_callback {
            let initial_events = self.append_runtime_events(
                &session.session_id,
                &session.thread_id,
                Some(&turn.turn_id),
                Vec::new(),
            )?;
            let initial_events_persisted = !initial_events.is_empty();
            for event in &initial_events {
                event_callback(event.clone())?;
            }
            let mut sink = AppendingRuntimeEventSink::new(
                self.state.clone(),
                self.file_checkpoint_snapshot_store.clone(),
                self.output_snapshot_store.clone(),
                self.sidecar_store.clone(),
                self.event_log_writer.clone(),
                self.projection_store.clone(),
                session.session_id.clone(),
                session.thread_id.clone(),
                turn.turn_id.clone(),
                event_callback,
            );
            sink.extend_events(initial_events);
            let backend_result = self.backend.start_turn(request, &mut sink).await;
            if let Err(error) = backend_result {
                if initial_events_persisted || sink.emitted_count() > 0 {
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
            let events = sink.into_events();
            events
        } else {
            let mut events = self.append_runtime_events(
                &session.session_id,
                &session.thread_id,
                Some(&turn.turn_id),
                Vec::new(),
            )?;
            let initial_events_persisted = !events.is_empty();
            let mut sink = CollectingRuntimeEventSink::default();
            let backend_result = self.backend.start_turn(request, &mut sink).await;
            if let Err(error) = backend_result {
                if initial_events_persisted || sink.emitted_count() > 0 {
                    sink.emit_failure(&error)?;
                    if let Err(append_error) = self.append_runtime_events(
                        &session.session_id,
                        &session.thread_id,
                        Some(&turn.turn_id),
                        sink.into_events(),
                    ) {
                        if !initial_events_persisted {
                            self.rollback_started_turn(
                                &session.session_id,
                                &turn.turn_id,
                                previous_session,
                            );
                        }
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
            match self.append_runtime_events(
                &session.session_id,
                &session.thread_id,
                Some(&turn.turn_id),
                sink.into_events(),
            ) {
                Ok(mut backend_events) => {
                    events.append(&mut backend_events);
                    events
                }
                Err(error) => return Err(error),
            }
        };
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
        let action_turn_id = params
            .action_scope
            .as_ref()
            .and_then(|scope| scope.turn_id.clone());
        let (session, turn_snapshot) = {
            let state = self
                .state
                .lock()
                .expect("runtime core state mutex poisoned");
            let stored = state
                .sessions
                .get(&params.session_id)
                .ok_or_else(|| RuntimeCoreError::SessionNotFound(params.session_id.clone()))?;
            let turn = match action_turn_id.as_deref() {
                Some(turn_id) => Some(
                    stored
                        .turns
                        .iter()
                        .find(|turn| turn.turn_id == turn_id)
                        .ok_or_else(|| RuntimeCoreError::TurnNotActive(turn_id.to_string()))?
                        .clone(),
                ),
                None => None,
            };
            (stored.session.clone(), turn)
        };

        let mut sink = CollectingRuntimeEventSink::default();
        self.backend
            .respond_action(
                ActionRespondRequest {
                    host,
                    session: session.clone(),
                    turn: turn_snapshot.clone(),
                    request_id: params.request_id,
                    action_type: params.action_type,
                    confirmed: params.confirmed,
                    response: params.response,
                    user_data: params.user_data,
                    metadata: params.metadata,
                    event_name: params.event_name,
                    action_scope: params.action_scope,
                },
                &mut sink,
            )
            .await?;
        let events = self.append_runtime_events(
            &session.session_id,
            &session.thread_id,
            turn_snapshot.as_ref().map(|turn| turn.turn_id.as_str()),
            sink.into_events(),
        )?;

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
            self.projection_store.as_deref(),
            session_id,
            thread_id,
            turn_id,
            runtime_events,
        )
    }
}
