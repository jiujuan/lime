mod coding_events;
mod model_registry_metadata;
mod model_route_contract;
mod model_route_resolver;
mod model_routing;
mod tool_events;
mod tool_inventory;

use crate::runtime::ToolInventoryReadRequest;
use crate::ActionRespondRequest;
use crate::CancelExecutionRequest;
use crate::ExecutionBackend;
use crate::ExecutionRequest;
use crate::RuntimeCoreError;
use crate::RuntimeEvent;
use crate::RuntimeEventSink;
use app_server_protocol::{AgentSessionActionType, ProtocolKind};
use async_trait::async_trait;
use lime_agent::{
    initialize_aster_runtime, stream_reply_with_policy, AgentActionRequiredScope,
    AgentEvent as RuntimeAgentEvent, AsterAgentState, ProviderConfig,
};
use lime_agent::AsterProviderProtocol;
use lime_core::config::{load_config, ToolExecutionPolicyConfig, WorkspaceSandboxConfig};
use lime_core::database::{self, DbConnection};
use lime_services::api_key_provider_service::ApiKeyProviderService;
use serde_json::{json, Value};
use std::sync::Arc;

mod request_context;

use request_context::{
    aster_chat_request_from_request, direct_provider_config_from_request,
    request_tool_policy_from_request, resolve_runtime_model_selection, session_config_from_request,
    session_scope_from_request,
};

#[derive(Default)]
pub struct RuntimeBackend {
    agent_state: AsterAgentState,
    api_key_provider_service: ApiKeyProviderService,
    db: Option<DbConnection>,
}

impl RuntimeBackend {
    pub fn new() -> Self {
        Self {
            agent_state: AsterAgentState::new(),
            api_key_provider_service: ApiKeyProviderService::new(),
            db: None,
        }
    }

    pub fn with_db(db: DbConnection) -> Self {
        Self {
            agent_state: AsterAgentState::new(),
            api_key_provider_service: ApiKeyProviderService::new(),
            db: Some(db),
        }
    }

    async fn handle_turn_start(
        &self,
        request: ExecutionRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        let session_scope = session_scope_from_request(&request)?;
        let host_request = aster_chat_request_from_request(&request);
        let db = initialize_runtime_database(self.db.as_ref())?;
        let requested_selection = resolve_runtime_model_selection(&request)?;
        let direct_provider_config = direct_provider_config_from_request(
            host_request.as_ref(),
            &requested_selection,
            requested_selection.reasoning_effort.clone(),
        );
        let route_resolution = model_route_resolver::resolve_chat_model_route(
            &db,
            &self.api_key_provider_service,
            &request,
            &requested_selection,
            direct_provider_config.as_ref(),
        )
        .await
        .map_err(backend_error)?;
        let selection = route_resolution.selection.clone();

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

        let provider_config = if let Some(provider_config) = direct_provider_config {
            let provider_config = provider_config_with_route_protocol(
                provider_config,
                aster_provider_protocol_from_route(&route_resolution.resolved_route.protocol),
            );
            self.agent_state
                .configure_provider(provider_config.clone(), &session_scope.session_id, &db)
                .await
                .map_err(backend_error)?;
            provider_config
        } else {
            provider_config_from_pool(
                &self.agent_state,
                &db,
                &selection.provider,
                &selection.model,
                &session_scope.session_id,
                selection.reasoning_effort.clone(),
                aster_provider_protocol_from_route(&route_resolution.resolved_route.protocol),
            )
            .await
            .map_err(backend_error)?
        };
        let request_tool_policy = request_tool_policy_from_request(host_request.as_ref());
        let config_metadata = current_agent_runtime_config_metadata();
        let session_config = session_config_from_request(
            &request,
            host_request.as_ref(),
            &session_scope,
            &selection,
            &request_tool_policy,
            config_metadata,
        );
        let agent_arc = self.agent_state.get_agent_arc();
        let agent_guard = agent_arc.read().await;
        let agent = agent_guard.as_ref().ok_or_else(|| {
            RuntimeCoreError::Backend(
                "App Server runtime backend failed to initialize Aster agent".to_string(),
            )
        })?;
        let cancel_token = self
            .agent_state
            .create_cancel_token(&session_scope.session_id)
            .await;
        let mut emit_error = None;
        let mut coding_event_mirror = coding_events::CodingEventMirror::default();
        let execution_result = stream_reply_with_policy(
            agent,
            &request.input.text,
            None,
            session_config,
            Some(cancel_token),
            &request_tool_policy,
            |event| {
                if emit_error.is_some() {
                    return;
                }
                if let Err(error) = emit_runtime_agent_event_with_coding_mirror(
                    event,
                    sink,
                    &mut coding_event_mirror,
                ) {
                    emit_error = Some(error);
                }
            },
        )
        .await;
        self.agent_state
            .remove_cancel_token(&session_scope.session_id)
            .await;
        let execution =
            execution_result.map_err(|error| RuntimeCoreError::Backend(error.message))?;
        if let Some(error) = emit_error {
            return Err(error);
        }

        if execution.cancelled {
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

        self.agent_state
            .mark_current_healthy(&db, Some(&provider_config.model_name));
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
}

#[async_trait]
impl ExecutionBackend for RuntimeBackend {
    async fn start_turn(
        &self,
        request: ExecutionRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        self.handle_turn_start(request, sink).await
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
        self.handle_action_response(&request).await?;
        sink.emit(RuntimeEvent::new(
            "action.resolved",
            json!({
                "backend": "runtime",
                "requestId": request.request_id,
                "actionId": request.request_id,
                "actionType": request.action_type,
                "confirmed": request.confirmed,
                "decision": if request.confirmed { "approve" } else { "deny" },
                "response": request.response,
                "userData": request.user_data,
                "scope": request.action_scope,
            }),
        ))
    }

    async fn read_tool_inventory(
        &self,
        request: ToolInventoryReadRequest,
    ) -> Result<Value, RuntimeCoreError> {
        tool_inventory::read_tool_inventory(
            &self.agent_state,
            request,
            current_agent_runtime_config_metadata(),
        )
        .await
    }
}

impl RuntimeBackend {
    async fn handle_action_response(
        &self,
        request: &ActionRespondRequest,
    ) -> Result<(), RuntimeCoreError> {
        match request.action_type {
            AgentSessionActionType::ToolConfirmation => self
                .agent_state
                .confirm_tool_action(&request.request_id, request.confirmed)
                .await
                .map_err(backend_error),
            AgentSessionActionType::AskUser | AgentSessionActionType::Elicitation => {
                if !request.confirmed {
                    return Ok(());
                }
                let user_data = action_response_user_data(request);
                self.agent_state
                    .submit_elicitation_response(
                        &request.session.session_id,
                        &request.request_id,
                        user_data,
                        request
                            .action_scope
                            .clone()
                            .map(agent_action_required_scope_from_protocol),
                    )
                    .await
                    .map_err(backend_error)
            }
        }
    }
}

fn action_response_user_data(request: &ActionRespondRequest) -> Value {
    request
        .user_data
        .clone()
        .or_else(|| {
            request
                .response
                .as_ref()
                .map(|response| json!({ "answer": response }))
        })
        .unwrap_or_else(|| json!({}))
}

fn agent_action_required_scope_from_protocol(
    scope: app_server_protocol::AgentSessionActionScope,
) -> AgentActionRequiredScope {
    AgentActionRequiredScope {
        session_id: scope.session_id,
        thread_id: scope.thread_id,
        turn_id: scope.turn_id,
    }
}

fn current_agent_runtime_config_metadata() -> Option<Value> {
    let config = match load_config() {
        Ok(config) => config,
        Err(error) => {
            return Some(json!({
                "agent": {
                    "toolExecution": {
                        "loadError": error.to_string(),
                    }
                }
            }));
        }
    };
    let mut agent_config = serde_json::Map::new();
    if !WorkspaceSandboxConfig::is_default(&config.agent.workspace_sandbox) {
        agent_config.insert(
            "workspaceSandbox".to_string(),
            json!(config.agent.workspace_sandbox),
        );
    }
    if !ToolExecutionPolicyConfig::is_default(&config.agent.tool_execution) {
        agent_config.insert(
            "toolExecution".to_string(),
            json!(config.agent.tool_execution),
        );
    }
    if agent_config.is_empty() {
        return None;
    }

    Some(json!({
        "agent": agent_config,
    }))
}

fn initialize_runtime_database(
    db: Option<&DbConnection>,
) -> Result<DbConnection, RuntimeCoreError> {
    let db = if let Some(db) = db {
        Arc::clone(db)
    } else {
        database::init_database().map_err(|error| {
            RuntimeCoreError::Backend(format!("failed to initialize database: {error}"))
        })?
    };
    initialize_aster_runtime(db.clone()).map_err(|error| {
        RuntimeCoreError::Backend(format!(
            "failed to initialize Aster runtime for App Server runtime backend: {error}"
        ))
    })?;
    Ok(db)
}

async fn provider_config_from_pool(
    agent_state: &AsterAgentState,
    db: &DbConnection,
    provider: &str,
    model: &str,
    session_id: &str,
    reasoning_effort: Option<String>,
    protocol: Option<AsterProviderProtocol>,
) -> Result<ProviderConfig, String> {
    let aster_config = agent_state
        .configure_provider_from_pool(db, provider, model, session_id, reasoning_effort, protocol)
        .await?;
    Ok(ProviderConfig {
        provider_name: aster_config.provider_name,
        provider_selector: aster_config.provider_selector,
        model_name: aster_config.model_name,
        api_key: aster_config.api_key,
        base_url: aster_config.base_url,
        credential_uuid: Some(aster_config.credential_uuid),
        reasoning_effort: aster_config.reasoning_effort,
        protocol: aster_config.protocol,
        toolshim: aster_config.toolshim,
        toolshim_model: aster_config.toolshim_model,
    })
}

fn aster_provider_protocol_from_route(protocol: &ProtocolKind) -> Option<AsterProviderProtocol> {
    match protocol {
        ProtocolKind::OpenaiResponses | ProtocolKind::CodexResponses => {
            Some(AsterProviderProtocol::Responses)
        }
        ProtocolKind::OpenaiChat => Some(AsterProviderProtocol::ChatCompletions),
        _ => None,
    }
}

fn provider_config_with_route_protocol(
    mut config: ProviderConfig,
    protocol: Option<AsterProviderProtocol>,
) -> ProviderConfig {
    config.protocol = protocol.or(config.protocol);
    config
}

fn emit_runtime_agent_event_with_coding_mirror(
    event: &RuntimeAgentEvent,
    sink: &mut dyn RuntimeEventSink,
    coding_event_mirror: &mut coding_events::CodingEventMirror,
) -> Result<(), RuntimeCoreError> {
    let coding_events = coding_event_mirror.process_event(event);
    for event in coding_events.before_raw {
        sink.emit(event)?;
    }
    tool_events::emit_runtime_agent_event(event, sink)?;
    for event in coding_events.after_raw {
        sink.emit(event)?;
    }
    Ok(())
}

fn backend_error(error: impl std::fmt::Display) -> RuntimeCoreError {
    RuntimeCoreError::Backend(error.to_string())
}

#[cfg(test)]
mod tests;
