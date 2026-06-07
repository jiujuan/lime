use crate::ActionRespondRequest;
use crate::CancelExecutionRequest;
use crate::ExecutionBackend;
use crate::ExecutionRequest;
use crate::RuntimeCoreError;
use crate::RuntimeEvent;
use crate::RuntimeEventSink;
use aster::session::TurnContextOverride;
use async_trait::async_trait;
use lime_agent::{
    initialize_aster_runtime, merge_system_prompt_with_request_tool_policy,
    resolve_request_tool_policy_with_mode, stream_reply_with_policy,
    AgentEvent as RuntimeAgentEvent, AsterAgentState, ProviderConfig, RequestToolPolicy,
    RequestToolPolicyMode, SessionConfigBuilder,
};
use lime_core::database::dao::api_key_provider::{ApiProviderType, ProviderWithKeys};
use lime_core::database::{self, DbConnection};
use lime_core::models::provider_type::is_custom_provider_id;
use lime_core::models::RuntimeProviderType;
use lime_services::api_key_provider_service::ApiKeyProviderService;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::str::FromStr;

#[derive(Default)]
pub struct RuntimeBackend {
    agent_state: AsterAgentState,
    api_key_provider_service: ApiKeyProviderService,
}

impl RuntimeBackend {
    pub fn new() -> Self {
        Self {
            agent_state: AsterAgentState::new(),
            api_key_provider_service: ApiKeyProviderService::new(),
        }
    }

    async fn handle_turn_start(
        &self,
        request: ExecutionRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        let session_scope = session_scope_from_request(&request)?;
        let host_request = aster_chat_request_from_request(&request);
        let db = initialize_runtime_database()?;
        let selection = resolve_runtime_model_selection(&request)?;
        let direct_provider_config = direct_provider_config_from_request(
            host_request.as_ref(),
            &selection,
            selection.reasoning_effort.clone(),
        );
        ensure_selection_provider_is_configured(
            &db,
            &self.api_key_provider_service,
            &selection,
            direct_provider_config.as_ref(),
        )?;

        sink.emit(RuntimeEvent::new(
            "routing.decision.made",
            json!({
                "backend": "runtime",
                "provider": selection.provider,
                "model": selection.model,
                "source": selection.source,
            }),
        ))?;

        let provider_config = if let Some(provider_config) = direct_provider_config {
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
            )
            .await
            .map_err(backend_error)?
        };
        let request_tool_policy = request_tool_policy_from_request(host_request.as_ref());
        let session_config = session_config_from_request(
            &request,
            host_request.as_ref(),
            &session_scope,
            &selection,
            &request_tool_policy,
        );
        let agent_arc = self.agent_state.get_agent_arc();
        let agent_guard = agent_arc.read().await;
        let agent = agent_guard.as_ref().ok_or_else(|| {
            RuntimeCoreError::Backend(
                "App Server runtime backend failed to initialize Aster agent".to_string(),
            )
        })?;
        let mut emit_error = None;
        let execution = stream_reply_with_policy(
            agent,
            &request.input.text,
            None,
            session_config,
            None,
            &request_tool_policy,
            |event| {
                if emit_error.is_some() {
                    return;
                }
                if let Err(error) = emit_runtime_agent_event(event, sink) {
                    emit_error = Some(error);
                }
            },
        )
        .await
        .map_err(|error| RuntimeCoreError::Backend(error.message))?;
        if let Some(error) = emit_error {
            return Err(error);
        }

        self.agent_state
            .mark_current_healthy(&db, Some(&provider_config.model_name));
        sink.emit(RuntimeEvent::new(
            "turn.final_done",
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
        _request: CancelExecutionRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        sink.emit(RuntimeEvent::new(
            "turn.canceled",
            json!({ "backend": "runtime" }),
        ))
    }

    async fn respond_action(
        &self,
        _request: ActionRespondRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        sink.emit(RuntimeEvent::new(
            "action.resolved",
            json!({ "backend": "runtime" }),
        ))
    }
}

fn initialize_runtime_database() -> Result<DbConnection, RuntimeCoreError> {
    let db = database::init_database()
        .map_err(|error| RuntimeCoreError::Backend(format!("failed to initialize database: {error}")))?;
    initialize_aster_runtime(db.clone()).map_err(|error| {
        RuntimeCoreError::Backend(format!(
            "failed to initialize Aster runtime for App Server runtime backend: {error}"
        ))
    })?;
    Ok(db)
}

fn resolve_runtime_model_selection(
    request: &ExecutionRequest,
) -> Result<RuntimeModelSelection, RuntimeCoreError> {
    if let Some(selection) = selection_from_explicit_preferences(request) {
        return Ok(selection);
    }
    if let Some(selection) = selection_from_host_provider_config(request) {
        return Ok(selection);
    }
    if let Some(selection) = selection_from_session_default(request) {
        return Ok(selection);
    }

    Err(RuntimeCoreError::Backend(
        "App Server runtime backend requires provider/model selection. Submit runtimeOptions.providerPreference and runtimeOptions.modelPreference, hostOptions.asterChatRequest.provider_config, or persist a complete session provider/model default.".to_string(),
    ))
}

fn ensure_selection_provider_is_configured(
    db: &DbConnection,
    api_key_provider_service: &ApiKeyProviderService,
    selection: &RuntimeModelSelection,
    direct_provider_config: Option<&ProviderConfig>,
) -> Result<(), RuntimeCoreError> {
    if direct_provider_config.is_some() {
        return Ok(());
    }

    let providers = api_key_provider_service
        .get_all_providers(db)
        .map_err(backend_error)?;
    if providers.iter().any(|provider| {
        provider.provider.id == selection.provider && enabled_chat_provider_with_key(provider)
    }) {
        return Ok(());
    }

    if is_supported_builtin_runtime_provider(&selection.provider) {
        return Ok(());
    }

    Err(RuntimeCoreError::Backend(format!(
        "App Server runtime backend provider '{}' is not configured as an enabled API Key Provider and is not a supported runtime provider type",
        selection.provider
    )))
}

fn is_supported_builtin_runtime_provider(provider: &str) -> bool {
    !is_custom_provider_id(provider) && RuntimeProviderType::from_str(provider).is_ok()
}

async fn provider_config_from_pool(
    agent_state: &AsterAgentState,
    db: &DbConnection,
    provider: &str,
    model: &str,
    session_id: &str,
    reasoning_effort: Option<String>,
) -> Result<ProviderConfig, String> {
    let aster_config = agent_state
        .configure_provider_from_pool(db, provider, model, session_id, reasoning_effort)
        .await?;
    Ok(ProviderConfig {
        provider_name: aster_config.provider_name,
        provider_selector: aster_config.provider_selector,
        model_name: aster_config.model_name,
        api_key: aster_config.api_key,
        base_url: aster_config.base_url,
        credential_uuid: Some(aster_config.credential_uuid),
        reasoning_effort: aster_config.reasoning_effort,
        force_responses_api: aster_config.force_responses_api,
        toolshim: aster_config.toolshim,
        toolshim_model: aster_config.toolshim_model,
    })
}

fn selection_from_explicit_preferences(
    request: &ExecutionRequest,
) -> Option<RuntimeModelSelection> {
    let provider = non_empty(request.provider_preference.as_deref().or_else(|| {
        request
            .runtime_options
            .as_ref()?
            .provider_preference
            .as_deref()
    }))?;
    let model = non_empty(request.model_preference.as_deref().or_else(|| {
        request
            .runtime_options
            .as_ref()?
            .model_preference
            .as_deref()
    }))?;
    Some(RuntimeModelSelection {
        provider,
        model,
        source: "runtime_options",
        reasoning_effort: reasoning_effort_from_request(request),
    })
}

fn selection_from_host_provider_config(
    request: &ExecutionRequest,
) -> Option<RuntimeModelSelection> {
    let host_request = aster_chat_request_from_request(request)?;
    let provider_config = host_provider_config(&host_request);
    let provider = non_empty(
        host_provider_preference(&host_request)
            .as_deref()
            .or_else(|| provider_config.and_then(|config| config.provider_id.as_deref()))
            .or_else(|| provider_config.and_then(|config| config.provider_name.as_deref())),
    )?;
    let model = non_empty(
        host_model_preference(&host_request)
            .as_deref()
            .or_else(|| provider_config.and_then(|config| config.model_name.as_deref())),
    )?;
    Some(RuntimeModelSelection {
        provider,
        model,
        source: "host_options_provider_config",
        reasoning_effort: host_reasoning_effort(&host_request)
            .or_else(|| reasoning_effort_from_request(request)),
    })
}

fn selection_from_session_default(request: &ExecutionRequest) -> Option<RuntimeModelSelection> {
    let metadata = request
        .session
        .business_object_ref
        .as_ref()?
        .metadata
        .as_ref()?;
    let provider = session_default_provider(metadata)?;
    let model = session_default_model(metadata)?;
    Some(RuntimeModelSelection {
        provider,
        model,
        source: "session_default",
        reasoning_effort: reasoning_effort_from_request(request),
    })
}

fn session_default_provider(metadata: &Value) -> Option<String> {
    json_pointer_string(
        metadata,
        &[
            "/providerSelector",
            "/provider_selector",
            "/executionRuntime/providerSelector",
            "/execution_runtime/provider_selector",
            "/extensionData/lime_provider_routing.v0/providerSelector",
            "/extensionData/lime_provider_routing.v0/provider_selector",
            "/providerName",
            "/provider_name",
            "/executionRuntime/providerName",
            "/execution_runtime/provider_name",
        ],
    )
}

fn session_default_model(metadata: &Value) -> Option<String> {
    json_pointer_string(
        metadata,
        &[
            "/modelName",
            "/model_name",
            "/model",
            "/executionRuntime/modelName",
            "/execution_runtime/model_name",
        ],
    )
}

fn enabled_chat_provider_with_key(provider: &ProviderWithKeys) -> bool {
    provider.provider.enabled
        && !provider.api_keys.iter().all(|key| !key.enabled)
        && !provider_looks_non_chat_candidate(provider)
}

fn provider_looks_non_chat_candidate(provider: &ProviderWithKeys) -> bool {
    matches!(provider.provider.provider_type, ApiProviderType::Fal)
}

fn reasoning_effort_from_request(request: &ExecutionRequest) -> Option<String> {
    if let Some(reasoning_effort) =
        aster_chat_request_from_request(request).and_then(|host| host_reasoning_effort(&host))
    {
        return Some(reasoning_effort);
    }
    request
        .runtime_options
        .as_ref()
        .and_then(|options| options.metadata.as_ref())
        .or(request.metadata.as_ref())
        .and_then(|metadata| {
            json_pointer_string(
                metadata,
                &[
                    "/turn_config/reasoning_effort",
                    "/turnConfig/reasoningEffort",
                    "/harness/reasoning_effort",
                    "/harness/reasoningEffort",
                ],
            )
        })
}

fn request_system_prompt(request: &ExecutionRequest) -> String {
    aster_chat_request_from_request(request)
        .and_then(|host| host_system_prompt(&host))
        .or_else(|| {
            request
                .runtime_options
                .as_ref()
                .and_then(|options| options.host_options.as_ref())
                .and_then(|host_options| host_options.get("asterChatRequest"))
                .and_then(|value| value.get("turn_config").or_else(|| value.get("turnConfig")))
                .and_then(|turn_config| {
                    turn_config
                        .get("system_prompt")
                        .or_else(|| turn_config.get("systemPrompt"))
                })
                .and_then(Value::as_str)
                .and_then(|value| non_empty(Some(value)))
        })
        .unwrap_or_else(|| {
            "你是 Lime 桌面端里的 AI 助手。请直接完成用户请求，保持回答清晰、准确、可执行。"
                .to_string()
        })
}

fn session_scope_from_request(request: &ExecutionRequest) -> Result<RuntimeSessionScope, RuntimeCoreError> {
    let session_id = non_empty(Some(&request.session.session_id)).ok_or_else(|| {
        RuntimeCoreError::Backend("App Server runtime backend session.sessionId is empty".to_string())
    })?;
    let thread_id = non_empty(Some(&request.turn.thread_id))
        .or_else(|| non_empty(Some(&request.session.thread_id)))
        .ok_or_else(|| {
            RuntimeCoreError::Backend(
                "App Server runtime backend session.threadId is empty".to_string(),
            )
        })?;
    let turn_id = non_empty(Some(&request.turn.turn_id))
        .or_else(|| {
            aster_chat_request_from_request(request)
                .and_then(|host| non_empty(host.turn_id.as_deref()))
        })
        .ok_or_else(|| {
            RuntimeCoreError::Backend("App Server runtime backend turn.turnId is empty".to_string())
        })?;
    if let Some(turn_session_id) = non_empty(Some(&request.turn.session_id)) {
        if turn_session_id != session_id {
            return Err(RuntimeCoreError::Backend(format!(
                "App Server runtime backend turn session '{}' does not match session '{}'",
                turn_session_id, session_id
            )));
        }
    }
    Ok(RuntimeSessionScope {
        session_id,
        thread_id,
        turn_id,
        workspace_id: non_empty(request.session.workspace_id.as_deref()).or_else(|| {
            aster_chat_request_from_request(request)
                .and_then(|host| non_empty(host.workspace_id.as_deref()))
        }),
    })
}

fn aster_chat_request_from_request(request: &ExecutionRequest) -> Option<AsterChatRequestSnapshot> {
    request
        .runtime_options
        .as_ref()
        .and_then(|options| options.host_options.as_ref())
        .and_then(|host_options| host_options.get("asterChatRequest"))
        .and_then(|value| serde_json::from_value::<AsterChatRequestSnapshot>(value.clone()).ok())
}

fn host_turn_config(host: &AsterChatRequestSnapshot) -> Option<&AgentTurnConfigSnapshot> {
    host.turn_config.as_ref()
}

fn host_provider_config(host: &AsterChatRequestSnapshot) -> Option<&ConfigureProviderRequest> {
    host_turn_config(host)
        .and_then(|turn_config| turn_config.provider_config.as_ref())
        .or(host.provider_config.as_ref())
}

fn direct_provider_config_from_request(
    host_request: Option<&AsterChatRequestSnapshot>,
    selection: &RuntimeModelSelection,
    reasoning_effort: Option<String>,
) -> Option<ProviderConfig> {
    let request = host_request.and_then(host_provider_config)?;
    if request.api_key.is_none() && request.base_url.is_none() {
        return None;
    }

    let provider_name =
        non_empty(request.provider_name.as_deref()).or_else(|| Some(selection.provider.clone()))?;
    let provider_selector =
        non_empty(request.provider_id.as_deref()).or_else(|| Some(selection.provider.clone()));
    let model_name =
        non_empty(request.model_name.as_deref()).or_else(|| Some(selection.model.clone()))?;

    Some(ProviderConfig {
        provider_name,
        provider_selector,
        model_name,
        api_key: request.api_key.clone(),
        base_url: request.base_url.clone(),
        credential_uuid: None,
        reasoning_effort,
        force_responses_api: false,
        toolshim: matches!(
            request.tool_call_strategy,
            Some(RuntimeToolCallStrategy::ToolShim)
        ),
        toolshim_model: request.toolshim_model.clone(),
    })
}

fn host_provider_preference(host: &AsterChatRequestSnapshot) -> Option<String> {
    host_turn_config(host)
        .and_then(|turn_config| non_empty(turn_config.provider_preference.as_deref()))
        .or_else(|| non_empty(host.provider_preference.as_deref()))
}

fn host_model_preference(host: &AsterChatRequestSnapshot) -> Option<String> {
    host_turn_config(host)
        .and_then(|turn_config| non_empty(turn_config.model_preference.as_deref()))
        .or_else(|| non_empty(host.model_preference.as_deref()))
}

fn host_reasoning_effort(host: &AsterChatRequestSnapshot) -> Option<String> {
    host_turn_config(host)
        .and_then(|turn_config| non_empty(turn_config.reasoning_effort.as_deref()))
        .or_else(|| non_empty(host.reasoning_effort.as_deref()))
}

fn host_approval_policy(host: &AsterChatRequestSnapshot) -> Option<String> {
    host_turn_config(host)
        .and_then(|turn_config| non_empty(turn_config.approval_policy.as_deref()))
        .or_else(|| non_empty(host.approval_policy.as_deref()))
}

fn host_sandbox_policy(host: &AsterChatRequestSnapshot) -> Option<String> {
    host_turn_config(host)
        .and_then(|turn_config| non_empty(turn_config.sandbox_policy.as_deref()))
        .or_else(|| non_empty(host.sandbox_policy.as_deref()))
}

fn host_system_prompt(host: &AsterChatRequestSnapshot) -> Option<String> {
    host_turn_config(host)
        .and_then(|turn_config| non_empty(turn_config.system_prompt.as_deref()))
        .or_else(|| non_empty(host.system_prompt.as_deref()))
}

fn host_web_search(host: &AsterChatRequestSnapshot) -> Option<bool> {
    host_turn_config(host)
        .and_then(|turn_config| turn_config.web_search)
        .or(host.web_search)
}

fn host_search_mode(host: &AsterChatRequestSnapshot) -> Option<RequestToolPolicyMode> {
    host_turn_config(host)
        .and_then(|turn_config| turn_config.search_mode)
        .or(host.search_mode)
}

fn request_tool_policy_from_request(
    host_request: Option<&AsterChatRequestSnapshot>,
) -> RequestToolPolicy {
    let web_search = host_request.and_then(host_web_search);
    let search_mode = host_request.and_then(host_search_mode);
    resolve_request_tool_policy_with_mode(web_search, search_mode, true)
}

fn session_config_from_request(
    request: &ExecutionRequest,
    host_request: Option<&AsterChatRequestSnapshot>,
    scope: &RuntimeSessionScope,
    selection: &RuntimeModelSelection,
    request_tool_policy: &RequestToolPolicy,
) -> aster::agents::SessionConfig {
    let system_prompt = merge_system_prompt_with_request_tool_policy(
        Some(request_system_prompt(request)),
        request_tool_policy,
    );
    let mut builder = SessionConfigBuilder::new(&scope.session_id)
        .thread_id(scope.thread_id.clone())
        .turn_id(scope.turn_id.clone())
        .include_context_trace(true);
    if let Some(system_prompt) = system_prompt {
        builder = builder.system_prompt(system_prompt);
    }
    if let Some(turn_context) = turn_context_from_request(request, host_request, scope, selection) {
        builder = builder.turn_context(turn_context);
    }
    builder.build()
}

fn turn_context_from_request(
    request: &ExecutionRequest,
    host_request: Option<&AsterChatRequestSnapshot>,
    scope: &RuntimeSessionScope,
    selection: &RuntimeModelSelection,
) -> Option<TurnContextOverride> {
    let mut context = TurnContextOverride {
        model: Some(selection.model.clone()),
        effort: selection.reasoning_effort.clone(),
        approval_policy: host_request.and_then(host_approval_policy),
        sandbox_policy: host_request.and_then(host_sandbox_policy),
        user_visible_input_text: non_empty(Some(&request.input.text)),
        ..TurnContextOverride::default()
    };
    let mut metadata = HashMap::new();
    metadata.insert(
        "app_server_runtime_backend".to_string(),
        json!({
            "sessionId": scope.session_id,
            "threadId": scope.thread_id,
            "turnId": scope.turn_id,
            "workspaceId": scope.workspace_id,
        }),
    );
    if let Some(host_metadata) = host_request.and_then(host_metadata_value) {
        metadata.insert("aster_chat_request".to_string(), host_metadata);
    }
    if let Some(runtime_metadata) = request
        .runtime_options
        .as_ref()
        .and_then(|options| options.metadata.clone())
        .or_else(|| request.metadata.clone())
    {
        metadata.insert("runtime_options".to_string(), runtime_metadata);
    }
    context.metadata = metadata;
    if context.approval_policy.is_none()
        && context.sandbox_policy.is_none()
        && context.user_visible_input_text.is_none()
        && context.metadata.is_empty()
    {
        None
    } else {
        Some(context)
    }
}

fn host_metadata_value(host: &AsterChatRequestSnapshot) -> Option<Value> {
    host_turn_config(host)
        .and_then(|turn_config| turn_config.metadata.clone())
        .or_else(|| host.metadata.clone())
}

fn runtime_event_type_from_raw(raw_type: &str) -> &'static str {
    match raw_type {
        "thread_started" => "thread.started",
        "turn_started" => "turn.started",
        "turn_completed" => "turn.completed",
        "turn_failed" => "turn.failed",
        "item_started" => "item.started",
        "item_updated" => "item.updated",
        "item_completed" => "item.completed",
        "text_delta" => "message.delta",
        "text_delta_batch" => "message.delta_batch",
        "thinking_delta" => "thinking.delta",
        "tool_start" => "tool.started",
        "tool_end" => "tool.result",
        "tool_progress" => "tool.progress",
        "tool_output_delta" => "tool.output.delta",
        "tool_input_delta" => "tool.input.delta",
        "artifact_snapshot" => "artifact.snapshot",
        "action_required" => "action.required",
        "action_resolved" => "action.resolved",
        "turn_context" => "turn.context",
        "model_change" => "model.changed",
        "context_trace" => "context.trace",
        "context_compaction_started" => "context.compaction.started",
        "context_compaction_completed" => "context.compaction.completed",
        "runtime_status" => "runtime.status",
        "task_profile_resolved" => "task.profile.resolved",
        "candidate_set_resolved" => "routing.candidates.resolved",
        "routing_decision_made" => "routing.decision.made",
        "routing_fallback_applied" => "routing.fallback.applied",
        "routing_not_possible" => "routing.not_possible",
        "limit_state_updated" => "limit.state.updated",
        "single_candidate_only" => "limit.single_candidate_only",
        "single_candidate_capability_gap" => "limit.single_candidate_capability_gap",
        "cost_estimated" => "cost.estimated",
        "cost_recorded" => "cost.recorded",
        "rate_limit_hit" => "rate_limit.hit",
        "quota_low" => "quota.low",
        "quota_blocked" => "quota.blocked",
        "queue_added" => "queue.added",
        "queue_removed" => "queue.removed",
        "queue_started" => "queue.started",
        "queue_cleared" => "queue.cleared",
        "done" => "turn.done",
        "final_done" => "turn.final_done",
        "error" => "turn.failed",
        "warning" => "runtime.warning",
        "message" => "message",
        _ => "runtime.event",
    }
}

fn emit_runtime_agent_event(
    event: &RuntimeAgentEvent,
    sink: &mut dyn RuntimeEventSink,
) -> Result<(), RuntimeCoreError> {
    let runtime_event = serde_json::to_value(event).map_err(backend_error)?;
    let raw_type = runtime_event
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or("runtime_event")
        .to_string();
    let mut payload = runtime_event
        .as_object()
        .cloned()
        .map(Value::Object)
        .unwrap_or_else(|| json!({ "value": runtime_event.clone() }));
    if let Some(payload_object) = payload.as_object_mut() {
        payload_object.insert("backend".to_string(), Value::String("runtime".to_string()));
        payload_object.insert("runtimeEvent".to_string(), runtime_event);
    }
    sink.emit(RuntimeEvent::new(runtime_event_type_from_raw(&raw_type), payload))
}

fn json_pointer_string(value: &Value, pointers: &[&str]) -> Option<String> {
    pointers.iter().find_map(|pointer| {
        value
            .pointer(pointer)
            .and_then(Value::as_str)
            .and_then(|value| non_empty(Some(value)))
    })
}

fn non_empty(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn backend_error(error: impl std::fmt::Display) -> RuntimeCoreError {
    RuntimeCoreError::Backend(error.to_string())
}

#[derive(Debug, Deserialize, Default)]
struct AsterChatRequestSnapshot {
    #[serde(default, alias = "turnConfig")]
    turn_config: Option<AgentTurnConfigSnapshot>,
    #[serde(default, alias = "providerConfig")]
    provider_config: Option<ConfigureProviderRequest>,
    #[serde(default, alias = "providerPreference")]
    provider_preference: Option<String>,
    #[serde(default, alias = "modelPreference")]
    model_preference: Option<String>,
    #[serde(default, alias = "reasoningEffort")]
    reasoning_effort: Option<String>,
    #[serde(default, alias = "approvalPolicy")]
    approval_policy: Option<String>,
    #[serde(default, alias = "sandboxPolicy")]
    sandbox_policy: Option<String>,
    #[serde(default, alias = "workspaceId")]
    workspace_id: Option<String>,
    #[serde(default, alias = "webSearch")]
    web_search: Option<bool>,
    #[serde(default, alias = "searchMode")]
    search_mode: Option<RequestToolPolicyMode>,
    #[serde(default, alias = "systemPrompt")]
    system_prompt: Option<String>,
    #[serde(default, alias = "turnId")]
    turn_id: Option<String>,
    #[serde(default)]
    metadata: Option<Value>,
}

#[derive(Debug, Deserialize, Default)]
struct AgentTurnConfigSnapshot {
    #[serde(default, alias = "providerConfig")]
    provider_config: Option<ConfigureProviderRequest>,
    #[serde(default, alias = "providerPreference")]
    provider_preference: Option<String>,
    #[serde(default, alias = "modelPreference")]
    model_preference: Option<String>,
    #[serde(default, alias = "reasoningEffort")]
    reasoning_effort: Option<String>,
    #[serde(default, alias = "approvalPolicy")]
    approval_policy: Option<String>,
    #[serde(default, alias = "sandboxPolicy")]
    sandbox_policy: Option<String>,
    #[serde(default, alias = "webSearch")]
    web_search: Option<bool>,
    #[serde(default, alias = "searchMode")]
    search_mode: Option<RequestToolPolicyMode>,
    #[serde(default, alias = "systemPrompt")]
    system_prompt: Option<String>,
    #[serde(default)]
    metadata: Option<Value>,
}

#[derive(Debug, Deserialize, Default)]
struct ConfigureProviderRequest {
    #[serde(default, alias = "providerId")]
    provider_id: Option<String>,
    #[serde(default, alias = "providerName")]
    provider_name: Option<String>,
    #[serde(default, alias = "modelName")]
    model_name: Option<String>,
    #[serde(default, alias = "apiKey")]
    api_key: Option<String>,
    #[serde(default, alias = "baseUrl")]
    base_url: Option<String>,
    #[serde(default, alias = "toolCallStrategy")]
    tool_call_strategy: Option<RuntimeToolCallStrategy>,
    #[serde(default, alias = "toolshimModel")]
    toolshim_model: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
enum RuntimeToolCallStrategy {
    Native,
    ToolShim,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct RuntimeModelSelection {
    provider: String,
    model: String,
    source: &'static str,
    reasoning_effort: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct RuntimeSessionScope {
    session_id: String,
    thread_id: String,
    turn_id: String,
    workspace_id: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use app_server_protocol::AgentInput;
    use app_server_protocol::AgentSession;
    use app_server_protocol::AgentSessionStatus;
    use app_server_protocol::AgentTurn;
    use app_server_protocol::AgentTurnStatus;
    use app_server_protocol::BusinessObjectRef;
    use app_server_protocol::RuntimeOptions;
    use crate::RuntimeHostContext;

    fn request_for_test(
        message: &str,
        host_options: Option<Value>,
        metadata: Option<Value>,
    ) -> ExecutionRequest {
        ExecutionRequest {
            host: RuntimeHostContext::default(),
            session: AgentSession {
                session_id: "session-1".to_string(),
                thread_id: "thread-1".to_string(),
                app_id: "content-studio".to_string(),
                workspace_id: Some("workspace-main".to_string()),
                business_object_ref: None,
                status: AgentSessionStatus::Running,
                created_at: "2026-06-07T00:00:00.000Z".to_string(),
                updated_at: "2026-06-07T00:00:00.000Z".to_string(),
            },
            turn: AgentTurn {
                turn_id: "turn-1".to_string(),
                session_id: "session-1".to_string(),
                thread_id: "thread-1".to_string(),
                status: AgentTurnStatus::Accepted,
                started_at: None,
                completed_at: None,
            },
            input: AgentInput {
                text: message.to_string(),
                attachments: Vec::new(),
            },
            runtime_options: Some(RuntimeOptions {
                capability_id: None,
                stream: true,
                event_name: None,
                provider_preference: None,
                model_preference: None,
                metadata,
                queued_turn_id: None,
                host_options,
            }),
            event_name: None,
            provider_preference: None,
            model_preference: None,
            metadata: None,
            queued_turn_id: None,
            queue_if_busy: false,
            skip_pre_submit_resume: false,
        }
    }

    fn request_with_session_metadata(metadata: Value) -> ExecutionRequest {
        let mut request = request_for_test("hello", None, None);
        request.session.business_object_ref = Some(BusinessObjectRef {
            kind: "current_timeline".to_string(),
            id: "session-1".to_string(),
            title: None,
            uri: None,
            metadata: Some(metadata),
        });
        request.runtime_options = None;
        request
    }

    #[test]
    fn explicit_runtime_preferences_win() {
        let mut request = request_for_test("hello", None, None);
        let options = request.runtime_options.as_mut().expect("runtime options");
        options.provider_preference = Some("deepseek".to_string());
        options.model_preference = Some("deepseek-chat".to_string());
        request.provider_preference = options.provider_preference.clone();
        request.model_preference = options.model_preference.clone();

        let selection = selection_from_explicit_preferences(&request).expect("selection");
        assert_eq!(
            selection,
            RuntimeModelSelection {
                provider: "deepseek".to_string(),
                model: "deepseek-chat".to_string(),
                source: "runtime_options",
                reasoning_effort: None,
            }
        );
    }

    #[test]
    fn direct_host_provider_config_allows_localhost_fixture_without_database_provider() {
        let request = request_for_test(
            "hello",
            Some(json!({
                "asterChatRequest": {
                    "provider_config": {
                        "provider_id": "fixture-openai",
                        "provider_name": "openai",
                        "model_name": "lime-fixture-chat",
                        "api_key": "fixture-key",
                        "base_url": "http://127.0.0.1:56599",
                        "tool_call_strategy": "native"
                    },
                    "provider_preference": "fixture-openai",
                    "model_preference": "lime-fixture-chat",
                    "reasoning_effort": "high"
                }
            })),
            None,
        );
        let host_request = aster_chat_request_from_request(&request);
        let selection = selection_from_host_provider_config(&request).expect("selection");

        let direct_config = direct_provider_config_from_request(
            host_request.as_ref(),
            &selection,
            selection.reasoning_effort.clone(),
        )
        .expect("direct provider config");

        assert_eq!(direct_config.provider_name, "openai");
        assert_eq!(
            direct_config.provider_selector.as_deref(),
            Some("fixture-openai")
        );
        assert_eq!(direct_config.model_name, "lime-fixture-chat");
        assert_eq!(direct_config.api_key.as_deref(), Some("fixture-key"));
        assert_eq!(
            direct_config.base_url.as_deref(),
            Some("http://127.0.0.1:56599")
        );
        assert_eq!(direct_config.reasoning_effort.as_deref(), Some("high"));
        assert!(!direct_config.toolshim);
    }

    #[test]
    fn current_timeline_extension_data_provider_routing_is_used_as_session_default() {
        let request = request_with_session_metadata(json!({
            "model": "claude-sonnet-4",
            "extensionData": {
                "lime_provider_routing.v0": {
                    "providerSelector": "lime-hub"
                }
            }
        }));

        let selection = selection_from_session_default(&request).expect("selection");

        assert_eq!(selection.provider, "lime-hub");
        assert_eq!(selection.model, "claude-sonnet-4");
        assert_eq!(selection.source, "session_default");
    }

    #[test]
    fn natural_language_news_turn_leaves_search_mode_to_model_tool_choice() {
        let request = request_for_test("整理今天的国际新闻", None, None);
        let host_request = aster_chat_request_from_request(&request);

        let policy = request_tool_policy_from_request(host_request.as_ref());

        assert!(policy.effective_web_search);
        assert_eq!(policy.search_mode, RequestToolPolicyMode::Allowed);
        assert!(!policy.requires_web_search());
    }

    #[test]
    fn explicit_web_search_false_keeps_search_disabled() {
        let request = request_for_test(
            "整理今天的国际新闻",
            Some(json!({
                "asterChatRequest": {
                    "web_search": false
                }
            })),
            None,
        );
        let host_request = aster_chat_request_from_request(&request);

        let policy = request_tool_policy_from_request(host_request.as_ref());

        assert!(!policy.effective_web_search);
        assert_eq!(policy.search_mode, RequestToolPolicyMode::Disabled);
    }
}
