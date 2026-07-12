mod action_response;
mod agent_skills_context;
mod agent_skills_telemetry;
mod coding_events;
mod event_mapper;
mod image_command;
mod image_tools;
pub(crate) mod knowledge_builder_runtime;
mod live_execution_process;
mod mcp_bridges;
mod mcp_resource_tools;
mod memory_tools;
mod model_capability;
mod model_registry_metadata;
mod model_route_contract;
mod model_route_resolver;
mod model_routing;
mod native_tools;
mod permission_preflight;
mod plan_events;
mod plugin_activation_context;
mod plugin_runtime_context;
mod plugin_worker_generation;
mod proposed_plan_parser;
mod provider_config;
mod reasoning_events;
mod skill_runtime_enable;
mod tool_events;
mod tool_inventory;
pub(crate) mod tool_process_external_metadata;
mod tool_process_kind_metadata;
pub(crate) mod tool_process_metadata;
mod tool_process_risk_metadata;
mod tool_process_runtime_metadata;
mod tool_search_tools;
mod workspace_patch_host_execution;
mod workspace_patch_host_tools;

use crate::execution_process::ExecutionProcessServer;
use crate::runtime::ToolInventoryReadRequest;
use crate::ActionRespondRequest;
use crate::AppDataSource;
use crate::CancelExecutionRequest;
use crate::ExecutionBackend;
use crate::ExecutionRequest;
use crate::RuntimeCoreError;
use crate::RuntimeEvent;
use crate::RuntimeEventSink;
use async_trait::async_trait;
use lime_agent::{
    run_agent_turn_with_policy, AgentRuntimeState, AgentTurnExecutionRequest,
    AgentTurnProviderConfiguration,
};
use lime_core::database::DbConnection;
use lime_services::api_key_provider_service::ApiKeyProviderService;
use model_provider::current_client::CurrentProviderMessage;
use serde_json::{json, Value};
use std::sync::Arc;
use std::sync::RwLock;

mod request_context;

pub(crate) use provider_config::current_agent_runtime_config_metadata;
use provider_config::{initialize_runtime_database, model_effective_event_from_runtime};
use request_context::{
    direct_provider_config_from_request, request_tool_policy_from_request,
    resolve_runtime_model_selection, runtime_request_from_request,
    selection_with_effective_reasoning, session_config_from_request, session_scope_from_request,
    should_defer_tool_surface_for_fast_response, should_use_compact_tool_surface_for_fast_response,
};

#[cfg(test)]
use app_server_protocol::AgentSessionActionType;
#[cfg(test)]
use event_mapper::emit_runtime_agent_event_with_coding_mirror;
use event_mapper::{
    emit_proposed_plan_parser_flush, emit_reasoning_finish,
    emit_runtime_agent_event_with_coding_mirror_and_plan_parser_with_soul_style,
};

#[derive(Default)]
pub struct RuntimeBackend {
    agent_state: AgentRuntimeState,
    api_key_provider_service: ApiKeyProviderService,
    db: Option<DbConnection>,
    app_data_source: Arc<RwLock<Option<Arc<dyn AppDataSource>>>>,
    live_execution_process: Option<ExecutionProcessServer>,
}

impl RuntimeBackend {
    pub fn new() -> Self {
        Self::build(None, None)
    }

    pub fn with_db(db: DbConnection) -> Self {
        Self::build(Some(db), None)
    }

    pub(crate) fn with_execution_process_server(execution_process: ExecutionProcessServer) -> Self {
        Self::build(None, Some(execution_process))
    }

    pub(crate) fn with_db_and_execution_process_server(
        db: DbConnection,
        execution_process: ExecutionProcessServer,
    ) -> Self {
        Self::build(Some(db), Some(execution_process))
    }

    fn build(
        db: Option<DbConnection>,
        live_execution_process: Option<ExecutionProcessServer>,
    ) -> Self {
        Self {
            agent_state: AgentRuntimeState::new(),
            api_key_provider_service: ApiKeyProviderService::new(),
            db,
            app_data_source: Arc::new(RwLock::new(None)),
            live_execution_process,
        }
    }

    async fn install_live_execution_process_hook_if_available(
        &self,
    ) -> Result<(), RuntimeCoreError> {
        let Some(execution_process) = self.live_execution_process.clone() else {
            return Ok(());
        };
        self.agent_state
            .install_live_execution_process_gateway(Arc::new(execution_process))
            .await
            .map_err(backend_error)
    }

    async fn register_current_native_tools_if_available(&self) -> Result<(), RuntimeCoreError> {
        native_tools::register_current_native_tools_if_available(
            &self.agent_state,
            &self.app_data_source,
        )
        .await
    }

    async fn ensure_agent_initialized(&self, db: &DbConnection) -> Result<(), RuntimeCoreError> {
        self.agent_state
            .init_agent_with_db(db)
            .await
            .map_err(backend_error)
    }

    async fn handle_turn_start(
        &self,
        request: ExecutionRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        self.handle_turn_start_with_provider_history(request, Vec::new(), sink)
            .await
    }

    async fn handle_turn_start_with_provider_history(
        &self,
        request: ExecutionRequest,
        provider_history: Vec<CurrentProviderMessage>,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        let session_scope = session_scope_from_request(&request)?;
        if image_command::handle_image_command_turn_if_present(
            Some(self),
            &request,
            &session_scope,
            self.current_app_data_source()?,
            sink,
        )
        .await?
        {
            return Ok(());
        }
        let host_request = runtime_request_from_request(&request);
        let request_tool_policy = request_tool_policy_from_request(host_request.as_ref());
        let defer_tool_surface =
            should_defer_tool_surface_for_fast_response(&request, &request_tool_policy);
        let compact_tool_surface =
            should_use_compact_tool_surface_for_fast_response(&request, &request_tool_policy);
        let _skill_runtime_enable_guard = if defer_tool_surface {
            skill_runtime_enable::clear_workspace_skill_runtime_enable(&session_scope.session_id)
        } else {
            skill_runtime_enable::apply_workspace_skill_runtime_enable(
                &request,
                &session_scope.session_id,
            )
        };
        if !defer_tool_surface {
            for event in agent_skills_telemetry::runtime_status_events_for_agent_skills(&request) {
                sink.emit(event)?;
            }
        }
        if let Some(event) = permission_preflight::browser_control_permission_event(
            &request,
            host_request.as_ref(),
            &session_scope,
        ) {
            match event {
                permission_preflight::PermissionPreflightOutcome::Required(event) => {
                    sink.emit(event)?;
                    return Ok(());
                }
                permission_preflight::PermissionPreflightOutcome::Cached(event) => {
                    sink.emit(event)?;
                }
            }
        }
        let db = initialize_runtime_database(self.db.as_ref())?;
        let requested_selection = resolve_runtime_model_selection(&request)?;
        let effective_requested_selection =
            selection_with_effective_reasoning(&requested_selection);
        let direct_provider_config = direct_provider_config_from_request(
            host_request.as_ref(),
            &effective_requested_selection,
            effective_requested_selection.reasoning_effort.clone(),
        );
        let route_resolution = model_route_resolver::resolve_chat_model_route(
            &db,
            &self.api_key_provider_service,
            &request,
            &effective_requested_selection,
            direct_provider_config.as_ref(),
        )
        .await
        .map_err(backend_error)?;
        let selection = selection_with_effective_reasoning(&route_resolution.selection);

        sink.emit(RuntimeEvent::new(
            "routing.decision.made",
            route_resolution.decision_payload.clone(),
        ))?;
        if let Some(payload) = route_resolution.fallback_payload.as_ref() {
            sink.emit(RuntimeEvent::new(
                "routing.fallback.applied",
                payload.clone(),
            ))?;
        }
        if let Some(route_failure) = route_resolution.resolved_route.failure.as_ref() {
            sink.emit(RuntimeEvent::new(
                "routing.not_possible",
                route_resolution
                    .not_possible_payload
                    .clone()
                    .unwrap_or_else(|| route_resolution.decision_payload.clone()),
            ))?;
            let route_blocker = route_failure
                .capability_gap
                .as_deref()
                .unwrap_or(&route_failure.reason_code);
            return Err(RuntimeCoreError::Backend(format!(
                "App Server runtime backend route '{}' is not executable for provider '{}' and coding model slot '{}'",
                route_blocker,
                selection.provider,
                route_resolution.service_model_slot()
            )));
        }

        self.ensure_agent_initialized(&db).await?;
        self.install_live_execution_process_hook_if_available()
            .await?;
        if !defer_tool_surface && !compact_tool_surface {
            self.register_current_native_tools_if_available().await?;
            mcp_bridges::sync_mcp_bridges_if_available(&self.agent_state, &self.app_data_source)
                .await?;
        }
        let config_metadata = current_agent_runtime_config_metadata();
        let soul_style = tool_process_metadata::SoulStyleMetadata::from_config_metadata(
            config_metadata.as_ref(),
        );
        let session_config = session_config_from_request(
            &request,
            host_request.as_ref(),
            &session_scope,
            &selection,
            &request_tool_policy,
            config_metadata,
        );
        let mut emit_error = None;
        let mut coding_event_mirror = coding_events::CodingEventMirror::default();
        let mut proposed_plan_parser = proposed_plan_parser::ProposedPlanParser::default();
        let mut reasoning_event_state = reasoning_events::ReasoningEventState::default();
        let execution_result = run_agent_turn_with_policy(
            &self.agent_state,
            AgentTurnExecutionRequest {
                session_id: &session_scope.session_id,
                input: crate::runtime::provider_history::reply_input_from_agent_input(
                    &request.input,
                ),
                initial_messages: provider_history,
                session_config,
                request_tool_policy: &request_tool_policy,
                provider_configuration: Some(AgentTurnProviderConfiguration {
                    db: &db,
                    session_id: &session_scope.session_id,
                    route_configuration: model_route_contract::provider_configuration_from_runtime(
                        &selection,
                        &route_resolution.resolved_route,
                        direct_provider_config,
                    ),
                }),
            },
            |event| {
                if emit_error.is_some() {
                    return;
                }
                if let Err(error) =
                    emit_runtime_agent_event_with_coding_mirror_and_plan_parser_with_soul_style(
                        event,
                        sink,
                        &mut coding_event_mirror,
                        &mut proposed_plan_parser,
                        &mut reasoning_event_state,
                        soul_style.as_ref(),
                    )
                {
                    emit_error = Some(error);
                }
            },
        )
        .await;
        let turn_execution =
            execution_result.map_err(|error| RuntimeCoreError::Backend(error.message))?;
        let provider_config = turn_execution.provider_config.ok_or_else(|| {
            RuntimeCoreError::Backend(
                "App Server runtime backend expected provider configuration for main turn"
                    .to_string(),
            )
        })?;
        let execution = turn_execution.stream;
        if let Some(error) = emit_error {
            return Err(error);
        }
        sink.emit(model_effective_event_from_runtime(
            &requested_selection,
            &selection,
            &provider_config,
            route_resolution.service_model_slot(),
            &route_resolution.resolved_route.capability_snapshot,
        ))?;
        emit_proposed_plan_parser_flush(&mut proposed_plan_parser, sink)?;

        if execution.cancelled {
            emit_reasoning_finish(&mut reasoning_event_state, "canceled", sink)?;
            sink.emit(RuntimeEvent::new(
                "turn.canceled",
                json!({
                    "backend": "runtime",
                    "model": provider_config.model_name,
                    "provider": provider_config
                        .provider_selector
                        .as_deref()
                        .unwrap_or(&selection.provider),
                    "searchMode": request_tool_policy.search_mode.as_str(),
                    "attempts": execution.attempts_summary,
                }),
            ))?;
            return Ok(());
        }

        emit_reasoning_finish(&mut reasoning_event_state, "completed", sink)?;
        sink.emit(RuntimeEvent::new(
            "turn.completed",
            json!({
                "backend": "runtime",
                "model": provider_config.model_name,
                "provider": provider_config
                    .provider_selector
                    .as_deref()
                    .unwrap_or(&selection.provider),
                "searchMode": request_tool_policy.search_mode.as_str(),
                "attempts": execution.attempts_summary,
            }),
        ))?;

        Ok(())
    }

    fn current_app_data_source(&self) -> Result<Option<Arc<dyn AppDataSource>>, RuntimeCoreError> {
        self.app_data_source
            .read()
            .map_err(|_| {
                RuntimeCoreError::Backend(
                    "runtime backend app data source lock poisoned".to_string(),
                )
            })
            .map(|guard| guard.clone())
    }
}

#[async_trait]
impl ExecutionBackend for RuntimeBackend {
    fn set_app_data_source(
        &self,
        app_data_source: Arc<dyn AppDataSource>,
    ) -> Result<(), RuntimeCoreError> {
        let mut guard = self.app_data_source.write().map_err(|_| {
            RuntimeCoreError::Backend("memory tool app data source lock poisoned".to_string())
        })?;
        *guard = Some(app_data_source);
        Ok(())
    }

    async fn start_turn(
        &self,
        request: ExecutionRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        self.handle_turn_start(request, sink).await
    }

    async fn start_turn_with_provider_history(
        &self,
        request: ExecutionRequest,
        provider_history: Vec<CurrentProviderMessage>,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        self.handle_turn_start_with_provider_history(request, provider_history, sink)
            .await
    }

    async fn cancel_turn(
        &self,
        request: CancelExecutionRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        self.agent_state
            .cancel_session(&request.session.session_id)
            .await;
        sink.emit(RuntimeEvent::new(
            "turn.canceled",
            json!({ "backend": "runtime" }),
        ))
    }

    async fn respond_action(
        &self,
        request: ActionRespondRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        let db = initialize_runtime_database(self.db.as_ref())?;
        self.ensure_agent_initialized(&db).await?;
        action_response::handle_action_response(&self.agent_state, &request).await?;
        sink.emit(action_response::action_resolved_event(&request))
    }

    async fn read_tool_inventory(
        &self,
        request: ToolInventoryReadRequest,
    ) -> Result<Value, RuntimeCoreError> {
        self.register_current_native_tools_if_available().await?;
        mcp_bridges::sync_mcp_bridges_if_available(&self.agent_state, &self.app_data_source)
            .await?;
        let app_data_source = self
            .app_data_source
            .read()
            .map_err(|_| {
                RuntimeCoreError::Backend(
                    "tool inventory app data source lock poisoned".to_string(),
                )
            })?
            .clone();
        tool_inventory::read_tool_inventory(
            &self.agent_state,
            request,
            current_agent_runtime_config_metadata(),
            app_data_source,
        )
        .await
    }

    async fn prepare_runtime_worker_artifact_events(
        &self,
        request: &ExecutionRequest,
        events: &mut Vec<RuntimeEvent>,
    ) -> Result<(), RuntimeCoreError> {
        workspace_patch_host_execution::prepare_runtime_worker_artifact_events(
            self, request, events,
        )
        .await
    }

    async fn prepare_plugin_worker_request(
        &self,
        request: &ExecutionRequest,
        worker_request: &mut Value,
    ) -> Result<(), RuntimeCoreError> {
        plugin_worker_generation::prepare_plugin_worker_request(self, request, worker_request).await
    }
}

fn backend_error(error: impl std::fmt::Display) -> RuntimeCoreError {
    RuntimeCoreError::Backend(error.to_string())
}

#[cfg(test)]
mod initialization_tests;
#[cfg(test)]
mod tests;
