use super::super::runtime_turn_stream::{
    build_runtime_run_finish_decision, execute_runtime_stream_with_strategy,
    finalize_runtime_turn_result, prepare_runtime_turn_prelude,
};
use super::*;

#[derive(Clone)]
pub(crate) struct RuntimeTurnStreamSessionConfigState {
    pub(super) session_id: String,
    pub(super) thread_id: String,
    pub(super) turn_id: String,
    pub(super) system_prompt: Option<String>,
    pub(super) system_prompt_override: bool,
    pub(super) include_context_trace: bool,
    pub(super) turn_context_override: Option<TurnContextOverride>,
}

impl RuntimeTurnStreamSessionConfigState {
    fn build(&self) -> aster::agents::types::SessionConfig {
        build_runtime_session_config(
            &self.session_id,
            &self.thread_id,
            &self.turn_id,
            self.system_prompt.as_deref(),
            self.system_prompt_override,
            Some(self.include_context_trace),
            self.turn_context_override.clone(),
        )
    }
}

pub(crate) struct RuntimeTurnExecutionContext {
    pub(super) run_start_metadata: serde_json::Map<String, serde_json::Value>,
    pub(super) run_observation: Arc<Mutex<ChatRunObservation>>,
    pub(super) timeline_recorder: Arc<Mutex<AgentTimelineRecorder>>,
    pub(super) profile_stream: AgentRuntimeProfileStream,
    pub(super) task_profile_refs: RuntimeTurnTaskProfileRefs,
    pub(super) runtime_status_session_config: aster::agents::types::SessionConfig,
    pub(super) stream_session_config_state: RuntimeTurnStreamSessionConfigState,
}

impl RuntimeTurnExecutionContext {
    fn build_run_finish_decision(&self, result: &Result<String, String>) -> RunFinishDecision {
        build_runtime_run_finish_decision(result, &self.run_start_metadata, &self.run_observation)
    }

    #[allow(clippy::too_many_arguments)]
    async fn execute_and_finalize(
        &self,
        tracker: &ExecutionTracker,
        agent: &Agent,
        app: &AppHandle,
        state: &AsterAgentState,
        db: &DbConnection,
        request: &AsterChatRequest,
        runtime_memory_config: &lime_core::config::MemoryConfig,
        session_id: &str,
        workspace_root: &str,
        workspace_id: &str,
        thread_id: &str,
        turn_id: &str,
        execution_profile: TurnExecutionProfile,
        request_metadata: Option<&serde_json::Value>,
        provider_continuation_capability: ProviderContinuationCapability,
        cancel_token: CancellationToken,
        request_tool_policy: &RequestToolPolicy,
        effective_strategy: AsterExecutionStrategy,
    ) -> Result<(), String> {
        let run_start_metadata = self.run_start_metadata.clone();
        let run_observation = self.run_observation.clone();
        let timeline_recorder = self.timeline_recorder.clone();
        let profile_stream = self.profile_stream.clone();
        let task_profile_refs = self.task_profile_refs.clone();
        let runtime_status_session_config = self.runtime_status_session_config.clone();
        let stream_session_config_state = self.stream_session_config_state.clone();

        let final_result = tracker
            .with_run_custom(
                RunSource::Chat,
                Some("agent_runtime_submit_turn".to_string()),
                Some(session_id.to_string()),
                Some(serde_json::Value::Object(run_start_metadata)),
                async move {
                    execute_runtime_stream_with_strategy(
                        agent,
                        app,
                        state,
                        db,
                        request,
                        &timeline_recorder,
                        &run_observation,
                        runtime_memory_config,
                        session_id,
                        workspace_root,
                        workspace_id,
                        thread_id,
                        turn_id,
                        execution_profile,
                        request_metadata,
                        provider_continuation_capability,
                        profile_stream.clone(),
                        cancel_token,
                        request_tool_policy,
                        effective_strategy,
                        || stream_session_config_state.build(),
                    )
                    .await
                },
                move |result| self.build_run_finish_decision(result),
            )
            .await;

        finalize_runtime_turn_result(
            agent,
            app,
            state,
            db,
            &request.event_name,
            &self.timeline_recorder,
            workspace_root,
            &runtime_status_session_config,
            &self.profile_stream,
            &task_profile_refs,
            session_id,
            request_metadata,
            final_result,
        )
        .await
    }
}

pub(crate) struct RuntimeTurnBuildArtifacts {
    pub(super) runtime_projection_snapshot: RuntimeProjectionSnapshot,
    pub(super) turn_state: TurnState,
    pub(super) turn_input_envelope: lime_agent::TurnInputEnvelope,
    pub(super) turn_input_diagnostics: lime_agent::TurnDiagnosticsSnapshot,
}

pub(crate) struct RuntimeTurnPreparedExecution {
    pub(super) service_skill_preload: Option<ServiceSkillLaunchPreloadExecution>,
    pub(super) runtime_turn_artifacts: RuntimeTurnBuildArtifacts,
    pub(super) runtime_turn_execution_context: RuntimeTurnExecutionContext,
}

impl RuntimeTurnPreparedExecution {
    pub(super) fn thread_id(&self) -> &str {
        self.runtime_turn_artifacts.turn_state.thread_id.as_str()
    }

    pub(super) fn turn_id(&self) -> &str {
        self.runtime_turn_artifacts.turn_state.turn_id.as_str()
    }

    pub(super) fn emit_profile_turn_submitted(&self, app: &AppHandle, event_name: &str) {
        emit_agent_runtime_profile_event(
            app,
            event_name,
            self.runtime_turn_execution_context
                .profile_stream
                .turn_submitted("workspace"),
        );
    }

    pub(super) fn emit_profile_task_started(&self, app: &AppHandle, event_name: &str) {
        for event in build_runtime_task_start_profile_events(
            &self.runtime_turn_execution_context.profile_stream,
            &self.runtime_turn_execution_context.task_profile_refs,
        ) {
            emit_agent_runtime_profile_event(app, event_name, event);
        }
    }

    pub(super) fn fail_before_model_execution(
        &self,
        app: &AppHandle,
        event_name: &str,
        error: &str,
    ) {
        fail_runtime_turn_before_model_execution(
            app,
            event_name,
            &self.runtime_turn_execution_context.timeline_recorder,
            &self.runtime_turn_execution_context.profile_stream,
            &self.runtime_turn_execution_context.task_profile_refs,
            error,
        );
    }

    fn emit_profile_turn_started(&self, app: &AppHandle, event_name: &str) {
        emit_agent_runtime_profile_event(
            app,
            event_name,
            self.runtime_turn_execution_context
                .profile_stream
                .turn_started(),
        );
    }

    async fn emit_prelude(
        &self,
        agent: &Agent,
        app: &AppHandle,
        request: &AsterChatRequest,
        workspace_root: &str,
        effective_strategy: AsterExecutionStrategy,
        request_tool_policy: &RequestToolPolicy,
        model_name: Option<&str>,
        session_recent_preferences: Option<&lime_agent::SessionExecutionRuntimePreferences>,
    ) -> Result<(), String> {
        self.emit_profile_turn_started(app, &request.event_name);
        prepare_runtime_turn_prelude(
            agent,
            app,
            request,
            &self.runtime_turn_execution_context.timeline_recorder,
            workspace_root,
            &self
                .runtime_turn_execution_context
                .runtime_status_session_config,
            effective_strategy,
            request_tool_policy,
            model_name,
            session_recent_preferences,
            self.service_skill_preload.as_ref(),
        )
        .await
    }

    async fn complete_status_before_model_execution(
        &self,
        agent: &Agent,
        app: &AppHandle,
        event_name: &str,
        workspace_root: &str,
    ) {
        complete_runtime_status_projection(
            agent,
            app,
            event_name,
            &self.runtime_turn_execution_context.timeline_recorder,
            workspace_root,
            &self
                .runtime_turn_execution_context
                .runtime_status_session_config,
        )
        .await;
    }

    async fn fail_after_status_completion(
        &self,
        agent: &Agent,
        app: &AppHandle,
        request: &AsterChatRequest,
        workspace_root: &str,
        error: &str,
    ) -> Result<(), String> {
        self.complete_status_before_model_execution(
            agent,
            app,
            &request.event_name,
            workspace_root,
        )
        .await;
        self.fail_before_model_execution(app, &request.event_name, error);
        Err(error.to_string())
    }

    #[allow(clippy::too_many_arguments)]
    pub(super) async fn emit_prelude_and_execute(
        &self,
        agent: &Agent,
        tracker: &ExecutionTracker,
        app: &AppHandle,
        state: &AsterAgentState,
        db: &DbConnection,
        request: &AsterChatRequest,
        runtime_memory_config: &lime_core::config::MemoryConfig,
        session_id: &str,
        workspace_root: &str,
        workspace_id: &str,
        execution_profile: TurnExecutionProfile,
        request_metadata: Option<&serde_json::Value>,
        provider_continuation_capability: ProviderContinuationCapability,
        cancel_token: CancellationToken,
        effective_strategy: AsterExecutionStrategy,
        request_tool_policy: &RequestToolPolicy,
        model_name: Option<&str>,
        session_recent_preferences: Option<&lime_agent::SessionExecutionRuntimePreferences>,
    ) -> Result<(), String> {
        self.emit_prelude(
            agent,
            app,
            request,
            workspace_root,
            effective_strategy,
            request_tool_policy,
            model_name,
            session_recent_preferences,
        )
        .await?;

        if let Some(permission_state) = extract_runtime_resolution_payload::<
            lime_agent::SessionExecutionRuntimePermissionState,
        >(request_metadata, "permission_state")
        {
            if permission_state_requires_turn_gating(&permission_state) {
                maybe_emit_runtime_permission_confirmation_request(
                    app,
                    request,
                    workspace_root,
                    self.thread_id(),
                    self.turn_id(),
                    &self.runtime_turn_execution_context.timeline_recorder,
                    &permission_state,
                );
                let error = format_permission_turn_gating_error(&permission_state);
                return self
                    .fail_after_status_completion(agent, app, request, workspace_root, &error)
                    .await;
            }
        }
        if let Some(limit_state) = extract_runtime_resolution_payload::<
            lime_agent::SessionExecutionRuntimeLimitState,
        >(request_metadata, "limit_state")
        {
            if limit_state_requires_user_lock_capability_gating(&limit_state) {
                let routing_decision = extract_runtime_resolution_payload::<
                    lime_agent::SessionExecutionRuntimeRoutingDecision,
                >(request_metadata, "routing_decision");
                let task_profile = extract_runtime_resolution_payload::<
                    lime_agent::SessionExecutionRuntimeTaskProfile,
                >(request_metadata, "task_profile");
                maybe_emit_runtime_user_lock_capability_request(
                    app,
                    request,
                    workspace_root,
                    self.thread_id(),
                    self.turn_id(),
                    &self.runtime_turn_execution_context.timeline_recorder,
                    &limit_state,
                    routing_decision.as_ref(),
                    task_profile.as_ref(),
                );
                let error = format_user_lock_capability_gating_error(
                    &limit_state,
                    routing_decision.as_ref(),
                    task_profile.as_ref(),
                );
                return self
                    .fail_after_status_completion(agent, app, request, workspace_root, &error)
                    .await;
            }
        }

        if let Err(error) = execute_agent_app_required_skill_contract(
            app,
            request,
            &self.runtime_turn_execution_context.timeline_recorder,
            workspace_root,
            session_id,
            self.thread_id(),
            self.turn_id(),
            request_metadata,
        )
        .await
        {
            return self
                .fail_after_status_completion(agent, app, request, workspace_root, &error)
                .await;
        }

        match execute_image_skill_launch_direct_task(
            app,
            request,
            &self.runtime_turn_execution_context.timeline_recorder,
            workspace_root,
            session_id,
            self.thread_id(),
            self.turn_id(),
            request_metadata,
        ) {
            Ok(true) => {
                return finalize_runtime_turn_result(
                    agent,
                    app,
                    state,
                    db,
                    &request.event_name,
                    &self.runtime_turn_execution_context.timeline_recorder,
                    workspace_root,
                    &self
                        .runtime_turn_execution_context
                        .runtime_status_session_config,
                    &self.runtime_turn_execution_context.profile_stream,
                    &self.runtime_turn_execution_context.task_profile_refs,
                    session_id,
                    request_metadata,
                    Ok(String::new()),
                )
                .await;
            }
            Ok(false) => {}
            Err(error) => {
                return finalize_runtime_turn_result(
                    agent,
                    app,
                    state,
                    db,
                    &request.event_name,
                    &self.runtime_turn_execution_context.timeline_recorder,
                    workspace_root,
                    &self
                        .runtime_turn_execution_context
                        .runtime_status_session_config,
                    &self.runtime_turn_execution_context.profile_stream,
                    &self.runtime_turn_execution_context.task_profile_refs,
                    session_id,
                    request_metadata,
                    Err(error),
                )
                .await;
            }
        }

        self.runtime_turn_execution_context
            .execute_and_finalize(
                tracker,
                agent,
                app,
                state,
                db,
                request,
                runtime_memory_config,
                session_id,
                workspace_root,
                workspace_id,
                self.thread_id(),
                self.turn_id(),
                execution_profile,
                request_metadata,
                provider_continuation_capability,
                cancel_token,
                request_tool_policy,
                effective_strategy,
            )
            .await
    }
}
