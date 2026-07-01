mod agent_skills_context;
mod agent_skills_telemetry;
mod coding_events;
mod image_tools;
mod live_execution_process;
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
mod proposed_plan_parser;
mod reasoning_events;
mod skill_runtime_enable;
mod tool_events;
mod tool_inventory;

use crate::execution_process::ExecutionProcessServer;
use crate::runtime::memory_prompt::memory_soul_prompt_context_from_config;
use crate::runtime::ToolInventoryReadRequest;
use crate::runtime::{
    content_factory_final_article_streaming_events,
    ensure_content_factory_workspace_patch_artifact_paths,
};
use crate::ActionRespondRequest;
use crate::AppDataSource;
use crate::CancelExecutionRequest;
use crate::ExecutionBackend;
use crate::ExecutionRequest;
use crate::RuntimeCoreError;
use crate::RuntimeEvent;
use crate::RuntimeEventSink;
use app_server_protocol::{AgentSessionActionType, McpServerStartParams, ProtocolKind};
use aster::session::TurnContextOverride;
use async_trait::async_trait;
use lime_agent::agent_tools::tool_orchestrator::{
    execute_planned_tool_batch, PlannedToolExecution, ToolExecutionBatchInput, ToolExecutionOutcome,
};
use lime_agent::AsterProviderProtocol;
use lime_agent::{
    initialize_aster_runtime, stream_reply_with_policy, AgentActionRequiredScope,
    AgentEvent as RuntimeAgentEvent, AsterAgentState, ProviderConfig,
};
use lime_core::config::{load_config, ToolExecutionPolicyConfig, WorkspaceSandboxConfig};
use lime_core::database::{self, DbConnection};
use lime_services::api_key_provider_service::ApiKeyProviderService;
use serde_json::{json, Value};
use std::collections::BTreeSet;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::RwLock;

mod request_context;

use request_context::{
    aster_chat_request_from_request, direct_provider_config_from_request,
    request_tool_policy_from_request, resolve_runtime_model_selection,
    selection_with_effective_reasoning, session_config_from_request, session_scope_from_request,
    should_defer_tool_surface_for_fast_response, should_use_compact_tool_surface_for_fast_response,
    RuntimeModelSelection,
};

#[derive(Default)]
pub struct RuntimeBackend {
    agent_state: AsterAgentState,
    api_key_provider_service: ApiKeyProviderService,
    db: Option<DbConnection>,
    app_data_source: Arc<RwLock<Option<Arc<dyn AppDataSource>>>>,
    live_execution_process: Option<ExecutionProcessServer>,
}

#[derive(Debug, Clone)]
struct ContentFactorySearchPlan {
    requests: Vec<ContentFactorySearchRequest>,
}

#[derive(Debug, Clone)]
struct ContentFactorySearchRequest {
    id: String,
    round_id: Option<String>,
    connector_ref: Option<String>,
    purpose: Option<String>,
    query: String,
    tool_id: String,
}

const CONTENT_FACTORY_SEARCH_EVENT_SOURCE: &str = "content_factory_search_requests";
const CONTENT_FACTORY_ARTICLE_WORKFLOW_KEY: &str = "content_article_workflow";

impl ContentFactorySearchPlan {
    fn from_events(events: &[RuntimeEvent]) -> Option<Self> {
        let patch = content_factory_workspace_patch_from_events(events)?;
        let requests = content_factory_article_search_requests(&patch)
            .into_iter()
            .enumerate()
            .filter_map(|(index, value)| ContentFactorySearchRequest::from_value(index, value))
            .collect::<Vec<_>>();
        (!requests.is_empty()).then_some(Self { requests })
    }
}

impl ContentFactorySearchRequest {
    fn from_value(index: usize, value: Value) -> Option<Self> {
        let query = value_string(&value, &["query"])?.to_string();
        let id = value_string(&value, &["id"])
            .map(ToString::to_string)
            .unwrap_or_else(|| format!("search-request-{}", index + 1));
        let round_id = value_string(&value, &["roundId", "round_id"]).map(ToString::to_string);
        let connector_ref =
            value_string(&value, &["connectorRef", "connector_ref"]).map(ToString::to_string);
        let purpose = value_string(&value, &["purpose"]).map(ToString::to_string);
        Some(Self {
            tool_id: format!("content-factory-web-search-{}", sanitize_tool_id(&id)),
            id,
            round_id,
            connector_ref,
            purpose,
            query,
        })
    }
}

fn content_factory_search_turn_context(
    request: &ExecutionRequest,
    host_request: Option<&request_context::AsterChatRequestSnapshot>,
    scope: &request_context::RuntimeSessionScope,
    selection: &RuntimeModelSelection,
) -> TurnContextOverride {
    let mut context = request_context::turn_context_from_request(
        request,
        host_request,
        scope,
        selection,
        current_agent_runtime_config_metadata(),
    )
    .unwrap_or_default();
    context
        .metadata
        .insert("web_search_enabled".to_string(), json!(true));
    context
        .metadata
        .insert("webSearchEnabled".to_string(), json!(true));
    context.user_visible_input_text = Some(request.input.text.clone());
    context
}

fn enrich_content_factory_search_tool_event(event: &mut RuntimeEvent) {
    if !matches!(
        event.event_type.as_str(),
        "tool.started" | "tool.args" | "tool.result" | "tool.failed"
    ) {
        return;
    }
    let Some(payload) = event.payload.as_object_mut() else {
        return;
    };
    payload.insert(
        "source".to_string(),
        Value::String(CONTENT_FACTORY_SEARCH_EVENT_SOURCE.to_string()),
    );
    payload.insert(
        "workflowKey".to_string(),
        Value::String(CONTENT_FACTORY_ARTICLE_WORKFLOW_KEY.to_string()),
    );
    payload.insert(
        "workflow_key".to_string(),
        Value::String(CONTENT_FACTORY_ARTICLE_WORKFLOW_KEY.to_string()),
    );
    let metadata = payload
        .entry("metadata")
        .or_insert_with(|| json!({}))
        .as_object_mut();
    let Some(metadata) = metadata else {
        return;
    };
    metadata.insert(
        "source".to_string(),
        Value::String(CONTENT_FACTORY_SEARCH_EVENT_SOURCE.to_string()),
    );
    metadata.insert(
        "workflowKey".to_string(),
        Value::String(CONTENT_FACTORY_ARTICLE_WORKFLOW_KEY.to_string()),
    );
    metadata.insert(
        "workflow_key".to_string(),
        Value::String(CONTENT_FACTORY_ARTICLE_WORKFLOW_KEY.to_string()),
    );
}

fn content_factory_workspace_patch_from_events(events: &[RuntimeEvent]) -> Option<Value> {
    events.iter().find_map(|event| {
        if event.event_type != "artifact.snapshot" {
            return None;
        }
        let artifact = event.payload.get("artifact")?;
        artifact
            .get("metadata")
            .and_then(|metadata| metadata.get("contentFactoryWorkspacePatch"))
            .cloned()
            .or_else(|| artifact.get("contentFactoryWorkspacePatch").cloned())
            .or_else(|| {
                artifact
                    .get("metadata")
                    .and_then(|metadata| metadata.get("workspace_patch"))
                    .cloned()
            })
    })
}

fn content_factory_article_search_requests(patch: &Value) -> Vec<Value> {
    patch
        .get("objects")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|object| value_string(object, &["kind"]).is_none_or(|kind| kind == "articleDraft"))
        .filter(|object| article_object_kind(object).as_deref() == Some("articleDraft"))
        .filter_map(|object| object.get("source"))
        .filter_map(|source| source.get("searchRequests").and_then(Value::as_array))
        .flat_map(|requests| requests.iter().cloned())
        .collect()
}

fn build_content_factory_search_evidence(
    requests: &[ContentFactorySearchRequest],
    outcomes: &[ToolExecutionOutcome],
) -> Vec<Value> {
    let outcomes_by_tool_id = outcomes
        .iter()
        .map(|outcome| (outcome.tool_id.as_str(), outcome))
        .collect::<HashMap<_, _>>();
    requests
        .iter()
        .filter_map(|request| {
            let outcome = outcomes_by_tool_id.get(request.tool_id.as_str())?;
            Some(json!({
                "id": format!("host-search-evidence-{}", sanitize_tool_id(&request.id)),
                "requestId": request.id,
                "roundId": request.round_id,
                "connectorRef": request.connector_ref,
                "tool": "WebSearch",
                "toolCallId": outcome.tool_id,
                "status": if outcome.success { "completed" } else { "failed" },
                "query": request.query,
                "purpose": request.purpose,
                "summary": content_factory_search_output_summary(&outcome.output),
                "output": outcome.output,
                "error": outcome.error,
                "metadata": outcome.metadata,
                "confidence": if outcome.success { "host_verified" } else { "needs_review" },
            }))
        })
        .collect()
}

fn update_content_factory_artifact_events(events: &mut [RuntimeEvent], search_evidence: &[Value]) {
    for event in events {
        if event.event_type != "artifact.snapshot" {
            continue;
        }
        let Some(artifact) = event.payload.get_mut("artifact") else {
            continue;
        };
        let Some(metadata) = artifact.get_mut("metadata").and_then(Value::as_object_mut) else {
            continue;
        };
        let patch = if let Some(patch) = metadata.get_mut("contentFactoryWorkspacePatch") {
            patch
        } else if let Some(patch) = metadata.get_mut("workspace_patch") {
            patch
        } else {
            continue;
        };
        update_content_factory_workspace_patch_search_evidence(patch, search_evidence);
        if let Some(content) = serde_json::to_string(patch).ok() {
            artifact
                .as_object_mut()
                .map(|object| object.insert("content".to_string(), Value::String(content)));
        }
    }
}

fn update_content_factory_workspace_patch_search_evidence(
    patch: &mut Value,
    search_evidence: &[Value],
) {
    let evidence = Value::Array(search_evidence.to_vec());
    let host_search_status = if search_evidence
        .iter()
        .all(|evidence| evidence.get("status").and_then(Value::as_str) == Some("completed"))
    {
        "completed"
    } else if search_evidence
        .iter()
        .all(|evidence| evidence.get("status").and_then(Value::as_str) == Some("failed"))
    {
        "failed"
    } else {
        "partial"
    };
    let Some(objects) = patch.get_mut("objects").and_then(Value::as_array_mut) else {
        return;
    };
    for object in objects {
        let Some(kind) = article_object_kind(object) else {
            continue;
        };
        if kind != "articleDraft" && kind != "imageGenerationSet" {
            continue;
        }
        {
            let Some(source) = object.get_mut("source").and_then(Value::as_object_mut) else {
                continue;
            };
            source.insert("searchEvidence".to_string(), evidence.clone());
            source.insert("hostSearchEvidence".to_string(), evidence.clone());
            source.insert("hostSearchStatus".to_string(), json!(host_search_status));
        }
        if kind == "articleDraft" && host_search_status == "failed" {
            if let Some(object_map) = object.as_object_mut() {
                object_map.insert("status".to_string(), json!("failed"));
                object_map.insert(
                    "summary".to_string(),
                    json!("检索失败，文章草稿未达到可交付状态"),
                );
            }
        }
    }
}

fn content_factory_search_output_summary(output: &str) -> String {
    let normalized = output
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .take(8)
        .collect::<Vec<_>>()
        .join("\n");
    if normalized.chars().count() <= 1_200 {
        normalized
    } else {
        normalized.chars().take(1_200).collect::<String>()
    }
}

fn article_object_kind(object: &Value) -> Option<String> {
    value_string(object, &["kind"])
        .map(ToString::to_string)
        .or_else(|| {
            object
                .get("ref")
                .or_else(|| object.get("objectRef"))
                .and_then(|reference| value_string(reference, &["kind"]))
                .map(ToString::to_string)
        })
}

fn value_string<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a str> {
    keys.iter()
        .find_map(|key| value.get(*key))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn sanitize_tool_id(value: &str) -> String {
    let sanitized = value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '-' || character == '_' {
                character
            } else {
                '-'
            }
        })
        .collect::<String>();
    sanitized.trim_matches('-').to_string()
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
            agent_state: AsterAgentState::new(),
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
        let hook = live_execution_process::RuntimeLiveExecutionProcessHook::new(execution_process);
        self.agent_state
            .with_agent_mut(|agent| agent.set_native_tool_execution_hook(Some(Arc::new(hook))))
            .await
            .map(|_| ())
            .map_err(backend_error)
    }

    async fn register_current_native_tools_if_available(&self) -> Result<(), RuntimeCoreError> {
        native_tools::register_current_native_tools_if_available(
            &self.agent_state,
            &self.app_data_source,
        )
        .await
    }

    async fn sync_mcp_bridges_if_available(&self) -> Result<(), RuntimeCoreError> {
        if !self.agent_state.is_initialized().await {
            return Ok(());
        }
        let app_data_source = self
            .app_data_source
            .read()
            .map_err(|_| {
                RuntimeCoreError::Backend("MCP bridge app data source lock poisoned".to_string())
            })?
            .clone();
        let Some(app_data_source) = app_data_source else {
            return Ok(());
        };
        self.start_enabled_lime_mcp_servers_if_needed(app_data_source.clone())
            .await;
        let snapshots = app_data_source.list_mcp_bridge_snapshots().await?;
        self.agent_state
            .sync_mcp_bridges(snapshots)
            .await
            .map_err(backend_error)
    }

    async fn start_enabled_lime_mcp_servers_if_needed(
        &self,
        app_data_source: Arc<dyn AppDataSource>,
    ) {
        let response = match app_data_source.list_mcp_servers_with_status().await {
            Ok(response) => response,
            Err(error) => {
                tracing::warn!(
                    error = %error,
                    "[RuntimeBackend] 读取 MCP 运行状态失败，跳过 Agent turn MCP 自动启动"
                );
                return;
            }
        };

        for server_name in enabled_lime_mcp_servers_to_start(&response.servers) {
            match app_data_source
                .start_mcp_server(McpServerStartParams {
                    name: server_name.clone(),
                })
                .await
            {
                Ok(_) => {
                    tracing::info!(
                        server_name = %server_name,
                        "[RuntimeBackend] 已为 Agent turn 启动 Lime MCP server"
                    );
                }
                Err(error) => {
                    tracing::warn!(
                        server_name = %server_name,
                        error = %error,
                        "[RuntimeBackend] Agent turn 启动 Lime MCP server 失败，继续使用当前可用工具面"
                    );
                }
            }
        }
    }

    async fn handle_turn_start(
        &self,
        request: ExecutionRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        let session_scope = session_scope_from_request(&request)?;
        let host_request = aster_chat_request_from_request(&request);
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
            sink.emit(event)?;
            return Ok(());
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
        sink.emit(model_effective_event_from_runtime(
            &requested_selection,
            &selection,
            &provider_config,
            route_resolution.service_model_slot(),
        ))?;
        self.install_live_execution_process_hook_if_available()
            .await?;
        if !defer_tool_surface && !compact_tool_surface {
            self.register_current_native_tools_if_available().await?;
            self.sync_mcp_bridges_if_available().await?;
        }
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
        let mut proposed_plan_parser = proposed_plan_parser::ProposedPlanParser::default();
        let mut reasoning_event_state = reasoning_events::ReasoningEventState::default();
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
                if let Err(error) = emit_runtime_agent_event_with_coding_mirror_and_plan_parser(
                    event,
                    sink,
                    &mut coding_event_mirror,
                    &mut proposed_plan_parser,
                    &mut reasoning_event_state,
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

        self.agent_state
            .mark_current_healthy(&db, Some(&provider_config.model_name));
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
        self.register_current_native_tools_if_available().await?;
        self.sync_mcp_bridges_if_available().await?;
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
        ensure_content_factory_workspace_patch_artifact_paths(events.as_mut_slice());
        let Some(search_plan) = ContentFactorySearchPlan::from_events(events.as_slice()) else {
            return Ok(());
        };
        if search_plan.requests.is_empty() {
            return Ok(());
        }

        let db = initialize_runtime_database(self.db.as_ref())?;
        self.agent_state
            .init_agent_with_db(&db)
            .await
            .map_err(backend_error)?;
        self.install_live_execution_process_hook_if_available()
            .await?;
        self.register_current_native_tools_if_available().await?;
        self.sync_mcp_bridges_if_available().await?;

        let host_request = aster_chat_request_from_request(request);
        let scope = session_scope_from_request(request)?;
        let selection = resolve_runtime_model_selection(request)
            .map(|selection| selection_with_effective_reasoning(&selection))
            .unwrap_or(RuntimeModelSelection {
                provider: "host-web-search".to_string(),
                model: "host-web-search".to_string(),
                source: "content_factory_search_requests",
                reasoning_effort: None,
            });
        let turn_context =
            content_factory_search_turn_context(request, host_request.as_ref(), &scope, &selection);
        let registry = {
            let agent_arc = self.agent_state.get_agent_arc();
            let agent_guard = agent_arc.read().await;
            let agent = agent_guard.as_ref().ok_or_else(|| {
                RuntimeCoreError::Backend(
                    "App Server runtime backend failed to initialize Aster agent for content factory search".to_string(),
                )
            })?;
            agent.tool_registry().clone()
        };
        let working_directory = turn_context
            .cwd
            .clone()
            .or_else(|| std::env::current_dir().ok())
            .unwrap_or_else(|| PathBuf::from("."));
        let planned_tools = search_plan
            .requests
            .iter()
            .map(|request| PlannedToolExecution {
                tool_name: "WebSearch".to_string(),
                tool_id: request.tool_id.clone(),
                arguments: Some(json!({ "query": request.query }).to_string()),
                params: json!({ "query": request.query }),
            })
            .collect::<Vec<_>>();
        let batch = execute_planned_tool_batch(
            ToolExecutionBatchInput {
                registry,
                session_id: request.session.session_id.clone(),
                working_directory,
                cancel_token: None,
                turn_context: Some(turn_context),
                persisted_execution_policy: None,
                parallelism: 2,
                auto_mode: true,
                bypass_restrictions: false,
                live_process_registry: None,
            },
            planned_tools,
        )
        .await;
        let search_evidence =
            build_content_factory_search_evidence(&search_plan.requests, batch.outcomes.as_slice());
        if search_evidence.is_empty() {
            return Ok(());
        }
        let search_completed = search_evidence
            .iter()
            .all(|evidence| evidence.get("status").and_then(Value::as_str) == Some("completed"));
        update_content_factory_artifact_events(events, &search_evidence);
        ensure_content_factory_workspace_patch_artifact_paths(events.as_mut_slice());
        let streaming_artifact_events = if search_completed {
            content_factory_final_article_streaming_events(events.as_slice())
        } else {
            Vec::new()
        };
        let mut tool_runtime_events = Vec::new();
        for event in &batch.events {
            let mut runtime_events = tool_events::runtime_events_from_agent_event(event)?;
            for runtime_event in &mut runtime_events {
                enrich_content_factory_search_tool_event(runtime_event);
            }
            tool_runtime_events.extend(runtime_events);
        }
        let insert_at = events
            .iter()
            .position(|event| event.event_type == "artifact.snapshot")
            .unwrap_or(events.len());
        events.splice(
            insert_at..insert_at,
            tool_runtime_events
                .into_iter()
                .chain(streaming_artifact_events.into_iter()),
        );
        Ok(())
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
    let soul_context = memory_soul_prompt_context_from_config(config.memory.soul.as_ref());
    if agent_config.is_empty() && soul_context.is_none() {
        return None;
    }

    let mut metadata = serde_json::Map::new();
    if !agent_config.is_empty() {
        metadata.insert("agent".to_string(), Value::Object(agent_config));
    }
    if let Some(soul_context) = soul_context {
        metadata.insert(
            "memory".to_string(),
            json!({
                "soul": soul_context,
            }),
        );
    }

    Some(Value::Object(metadata))
}

fn enabled_lime_mcp_servers_to_start(servers: &[Value]) -> Vec<String> {
    let mut names = BTreeSet::new();
    for server in servers {
        if !value_bool_field(server, &["enabled_lime", "enabledLime"]) {
            continue;
        }
        if mcp_status_is_running(server) {
            continue;
        }
        if let Some(name) = value_string_field(server, &["name"]) {
            names.insert(name.to_string());
        }
    }
    names.into_iter().collect()
}

fn mcp_status_is_running(server: &Value) -> bool {
    value_bool_field(server, &["is_running", "isRunning"])
        || server
            .get("runtime_status")
            .is_some_and(|status| value_bool_field(status, &["is_running", "isRunning"]))
        || server
            .get("runtimeStatus")
            .is_some_and(|status| value_bool_field(status, &["is_running", "isRunning"]))
}

fn value_bool_field(value: &Value, keys: &[&str]) -> bool {
    keys.iter()
        .any(|key| value.get(*key).and_then(Value::as_bool).unwrap_or(false))
}

fn value_string_field<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a str> {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(Value::as_str))
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn model_effective_event_from_runtime(
    requested_selection: &RuntimeModelSelection,
    selection: &RuntimeModelSelection,
    provider_config: &ProviderConfig,
    service_model_slot: &str,
) -> RuntimeEvent {
    let provider_id = provider_config
        .provider_selector
        .as_deref()
        .unwrap_or(&selection.provider)
        .to_string();
    let model_ref =
        model_capability::ModelRef::new(provider_id.clone(), provider_config.model_name.clone());
    let capability = model_capability::resolve_basic_model_capability(model_ref);
    let requested_reasoning_effort = requested_selection.reasoning_effort.as_deref();
    let effective_reasoning_effort = provider_config
        .reasoning_effort
        .as_deref()
        .or(selection.reasoning_effort.as_deref());
    let reasoning_policy = model_capability::resolve_reasoning_policy(
        &capability,
        requested_reasoning_effort.and_then(model_capability::reasoning_level_from_str),
    );
    let mut payload = model_capability::model_effective_payload(&capability, &reasoning_policy);
    if let Some(payload_object) = payload.as_object_mut() {
        payload_object.insert("provider".to_string(), json!(provider_id));
        payload_object.insert(
            "modelName".to_string(),
            json!(provider_config.model_name.clone()),
        );
        payload_object.insert(
            "model_name".to_string(),
            json!(provider_config.model_name.clone()),
        );
        payload_object.insert("source".to_string(), json!(selection.source));
        payload_object.insert("serviceModelSlot".to_string(), json!(service_model_slot));
        payload_object.insert("service_model_slot".to_string(), json!(service_model_slot));
        if let Some(reasoning_effort) = requested_reasoning_effort {
            payload_object.insert(
                "requestedReasoningEffort".to_string(),
                json!(reasoning_effort),
            );
            payload_object.insert(
                "requested_reasoning_effort".to_string(),
                json!(reasoning_effort),
            );
        }
        if let Some(reasoning_effort) = effective_reasoning_effort {
            payload_object.insert(
                "effectiveReasoningEffort".to_string(),
                json!(reasoning_effort),
            );
            payload_object.insert(
                "effective_reasoning_effort".to_string(),
                json!(reasoning_effort),
            );
        }
    }
    RuntimeEvent::new("model.effective", payload)
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

#[cfg(test)]
fn emit_runtime_agent_event_with_coding_mirror(
    event: &RuntimeAgentEvent,
    sink: &mut dyn RuntimeEventSink,
    coding_event_mirror: &mut coding_events::CodingEventMirror,
) -> Result<(), RuntimeCoreError> {
    let mut proposed_plan_parser = proposed_plan_parser::ProposedPlanParser::default();
    let mut reasoning_event_state = reasoning_events::ReasoningEventState::default();
    emit_runtime_agent_event_with_coding_mirror_and_plan_parser(
        event,
        sink,
        coding_event_mirror,
        &mut proposed_plan_parser,
        &mut reasoning_event_state,
    )
}

fn emit_runtime_agent_event_with_coding_mirror_and_plan_parser(
    event: &RuntimeAgentEvent,
    sink: &mut dyn RuntimeEventSink,
    coding_event_mirror: &mut coding_events::CodingEventMirror,
    proposed_plan_parser: &mut proposed_plan_parser::ProposedPlanParser,
    reasoning_event_state: &mut reasoning_events::ReasoningEventState,
) -> Result<(), RuntimeCoreError> {
    let coding_events = coding_event_mirror.process_event(event);
    for event in coding_events.before_raw {
        sink.emit(event)?;
    }
    if let RuntimeAgentEvent::ThinkingDelta { text } = event {
        for event in reasoning_event_state.observe_delta(text) {
            sink.emit(event)?;
        }
    }
    for event in tool_events::runtime_events_from_agent_event(event)? {
        for event in proposed_plan_parser::split_runtime_event(event, proposed_plan_parser) {
            sink.emit(event)?;
        }
    }
    for event in coding_events.after_raw {
        sink.emit(event)?;
    }
    Ok(())
}

fn emit_reasoning_finish(
    reasoning_event_state: &mut reasoning_events::ReasoningEventState,
    status: &str,
    sink: &mut dyn RuntimeEventSink,
) -> Result<(), RuntimeCoreError> {
    for event in reasoning_event_state.finish(status) {
        sink.emit(event)?;
    }
    Ok(())
}

fn emit_proposed_plan_parser_flush(
    proposed_plan_parser: &mut proposed_plan_parser::ProposedPlanParser,
    sink: &mut dyn RuntimeEventSink,
) -> Result<(), RuntimeCoreError> {
    for event in proposed_plan_parser::finish_runtime_events(proposed_plan_parser) {
        sink.emit(event)?;
    }
    Ok(())
}

fn backend_error(error: impl std::fmt::Display) -> RuntimeCoreError {
    RuntimeCoreError::Backend(error.to_string())
}

#[cfg(test)]
mod tests;
