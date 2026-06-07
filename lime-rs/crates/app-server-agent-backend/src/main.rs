use anyhow::{anyhow, Context, Result};
use aster::session::TurnContextOverride;
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
use std::io::{self, Read, Write};
use std::str::FromStr;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExternalBackendEnvelope {
    kind: String,
    request: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TurnStartRequest {
    #[serde(default)]
    session: Option<AgentSessionSnapshot>,
    #[serde(default)]
    turn: Option<AgentTurnSnapshot>,
    input: AgentInput,
    #[serde(default)]
    runtime_options: Option<RuntimeOptions>,
    #[serde(default)]
    provider_preference: Option<String>,
    #[serde(default)]
    model_preference: Option<String>,
    #[serde(default)]
    metadata: Option<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentInput {
    text: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentSessionSnapshot {
    session_id: String,
    thread_id: String,
    #[serde(default)]
    workspace_id: Option<String>,
    #[serde(default)]
    business_object_ref: Option<BusinessObjectRefSnapshot>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BusinessObjectRefSnapshot {
    #[serde(default)]
    metadata: Option<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentTurnSnapshot {
    turn_id: String,
    #[serde(default)]
    session_id: Option<String>,
    #[serde(default)]
    thread_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeOptions {
    #[serde(default)]
    provider_preference: Option<String>,
    #[serde(default)]
    model_preference: Option<String>,
    #[serde(default)]
    metadata: Option<Value>,
    #[serde(default)]
    host_options: Option<Value>,
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeEventLine<'a> {
    #[serde(rename = "type")]
    event_type: &'a str,
    payload: Value,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            std::env::var("RUST_LOG")
                .unwrap_or_else(|_| "app_server_agent_backend=info,lime_agent=info".to_string()),
        )
        .with_writer(io::stderr)
        .init();

    let mut input = String::new();
    io::stdin()
        .read_to_string(&mut input)
        .context("failed to read external backend request from stdin")?;
    let envelope: ExternalBackendEnvelope =
        serde_json::from_str(&input).context("failed to decode external backend request")?;

    match envelope.kind.as_str() {
        "turnStart" => handle_turn_start(envelope.request).await,
        "turnCancel" => {
            emit_event("turn.canceled", json!({ "backend": "external" }))?;
            Ok(())
        }
        "actionRespond" => {
            emit_event("action.resolved", json!({ "backend": "external" }))?;
            Ok(())
        }
        other => Err(anyhow!(
            "unsupported external backend request kind: {other}"
        )),
    }
}

async fn handle_turn_start(request: Value) -> Result<()> {
    let request: TurnStartRequest =
        serde_json::from_value(request).context("failed to decode turnStart request")?;
    let session_scope = session_scope_from_request(&request)?;
    let host_request = aster_chat_request_from_request(&request);
    let db = database::init_database().map_err(|error| anyhow!(error))?;
    initialize_aster_runtime(db.clone()).map_err(|error| {
        anyhow!("failed to initialize Aster runtime for external backend: {error}")
    })?;
    let api_key_provider_service = ApiKeyProviderService::new();
    let selection = resolve_runtime_model_selection(&request)
        .await
        .context("failed to resolve runtime provider/model selection")?;
    let direct_provider_config = direct_provider_config_from_request(
        host_request.as_ref(),
        &selection,
        selection.reasoning_effort.clone(),
    );
    ensure_selection_provider_is_configured(
        &db,
        &api_key_provider_service,
        &selection,
        direct_provider_config.as_ref(),
    )
    .context("failed to validate runtime provider/model selection")?;

    emit_event(
        "routing.decision.made",
        json!({
            "backend": "external",
            "provider": selection.provider,
            "model": selection.model,
            "source": selection.source,
        }),
    )?;

    let agent_state = AsterAgentState::new();
    let provider_config = if let Some(provider_config) = direct_provider_config {
        agent_state
            .configure_provider(provider_config.clone(), &session_scope.session_id, &db)
            .await
            .map_err(|error| anyhow!(error))?;
        provider_config
    } else {
        provider_config_from_pool(
            &agent_state,
            &db,
            &selection.provider,
            &selection.model,
            &session_scope.session_id,
            selection.reasoning_effort.clone(),
        )
        .await
        .map_err(|error| anyhow!(error))?
    };
    let request_tool_policy = request_tool_policy_from_request(host_request.as_ref());
    let session_config = session_config_from_request(
        &request,
        host_request.as_ref(),
        &session_scope,
        &selection,
        &request_tool_policy,
    );
    let agent_arc = agent_state.get_agent_arc();
    let agent_guard = agent_arc.read().await;
    let agent = agent_guard
        .as_ref()
        .ok_or_else(|| anyhow!("App Server external backend failed to initialize Aster agent"))?;
    let execution = stream_reply_with_policy(
        agent,
        &request.input.text,
        None,
        session_config,
        None,
        &request_tool_policy,
        |event| {
            if let Err(error) = emit_runtime_agent_event(event) {
                tracing::error!(
                    "[app-server-agent-backend] failed to emit runtime event: {}",
                    error
                );
            }
        },
    )
    .await
    .map_err(|error| anyhow!(error.message))?;

    agent_state.mark_current_healthy(&db, Some(&provider_config.model_name));
    emit_event(
        "turn.final_done",
        json!({
            "backend": "external",
            "model": provider_config.model_name,
            "provider": provider_config.provider_selector.as_deref().unwrap_or(&selection.provider),
            "searchMode": request_tool_policy.search_mode.as_str(),
            "attempts": execution.attempts_summary,
        }),
    )?;

    Ok(())
}

async fn resolve_runtime_model_selection(
    request: &TurnStartRequest,
) -> Result<RuntimeModelSelection> {
    if let Some(selection) = selection_from_explicit_preferences(request) {
        return Ok(selection);
    }
    if let Some(selection) = selection_from_host_provider_config(request) {
        return Ok(selection);
    }
    if let Some(selection) = selection_from_session_default(request) {
        return Ok(selection);
    }

    Err(anyhow!(
        "App Server external backend requires provider/model selection. Submit runtimeOptions.providerPreference and runtimeOptions.modelPreference, hostOptions.asterChatRequest.provider_config, or persist a complete session provider/model default."
    ))
}

fn ensure_selection_provider_is_configured(
    db: &DbConnection,
    api_key_provider_service: &ApiKeyProviderService,
    selection: &RuntimeModelSelection,
    direct_provider_config: Option<&ProviderConfig>,
) -> Result<()> {
    if direct_provider_config.is_some() {
        return Ok(());
    }

    let providers = api_key_provider_service
        .get_all_providers(db)
        .map_err(|error| anyhow!(error))?;
    if providers.iter().any(|provider| {
        provider.provider.id == selection.provider && enabled_chat_provider_with_key(provider)
    }) {
        return Ok(());
    }

    if is_supported_builtin_runtime_provider(&selection.provider) {
        return Ok(());
    }

    Err(anyhow!(
        "App Server external backend provider '{}' is not configured as an enabled API Key Provider and is not a supported runtime provider type",
        selection.provider
    ))
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
    request: &TurnStartRequest,
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
    request: &TurnStartRequest,
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

fn selection_from_session_default(request: &TurnStartRequest) -> Option<RuntimeModelSelection> {
    let metadata = request
        .session
        .as_ref()?
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

fn reasoning_effort_from_request(request: &TurnStartRequest) -> Option<String> {
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

fn request_system_prompt(request: &TurnStartRequest) -> String {
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

fn session_scope_from_request(request: &TurnStartRequest) -> Result<RuntimeSessionScope> {
    let session = request
        .session
        .as_ref()
        .ok_or_else(|| anyhow!("App Server external backend turnStart requires session"))?;
    let turn = request
        .turn
        .as_ref()
        .ok_or_else(|| anyhow!("App Server external backend turnStart requires turn"))?;
    let session_id = non_empty(Some(&session.session_id))
        .ok_or_else(|| anyhow!("App Server external backend session.sessionId is empty"))?;
    let thread_id = non_empty(turn.thread_id.as_deref())
        .or_else(|| non_empty(Some(&session.thread_id)))
        .ok_or_else(|| anyhow!("App Server external backend session.threadId is empty"))?;
    let turn_id = non_empty(Some(&turn.turn_id))
        .or_else(|| {
            aster_chat_request_from_request(request)
                .and_then(|host| non_empty(host.turn_id.as_deref()))
        })
        .ok_or_else(|| anyhow!("App Server external backend turn.turnId is empty"))?;
    if let Some(turn_session_id) = non_empty(turn.session_id.as_deref()) {
        if turn_session_id != session_id {
            return Err(anyhow!(
                "App Server external backend turn session '{}' does not match session '{}'",
                turn_session_id,
                session_id
            ));
        }
    }
    Ok(RuntimeSessionScope {
        session_id,
        thread_id,
        turn_id,
        workspace_id: non_empty(session.workspace_id.as_deref()).or_else(|| {
            aster_chat_request_from_request(request)
                .and_then(|host| non_empty(host.workspace_id.as_deref()))
        }),
    })
}

fn aster_chat_request_from_request(request: &TurnStartRequest) -> Option<AsterChatRequestSnapshot> {
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
    request: &TurnStartRequest,
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
    request: &TurnStartRequest,
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
        "app_server_external_backend".to_string(),
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

fn emit_runtime_agent_event(event: &RuntimeAgentEvent) -> Result<()> {
    let runtime_event = serde_json::to_value(event)?;
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
        payload_object.insert("backend".to_string(), Value::String("external".to_string()));
        payload_object.insert("runtimeEvent".to_string(), runtime_event);
    }
    emit_event(runtime_event_type_from_raw(&raw_type), payload)
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

fn emit_event(event_type: &'static str, payload: Value) -> Result<()> {
    let mut stdout = io::stdout().lock();
    writeln!(
        stdout,
        "{}",
        serde_json::to_string(&RuntimeEventLine {
            event_type,
            payload,
        })?
    )?;
    stdout.flush()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request_for_test(
        message: &str,
        host_options: Option<Value>,
        metadata: Option<Value>,
    ) -> TurnStartRequest {
        TurnStartRequest {
            session: None,
            turn: None,
            input: AgentInput {
                text: message.to_string(),
            },
            runtime_options: Some(RuntimeOptions {
                provider_preference: None,
                model_preference: None,
                metadata,
                host_options,
            }),
            provider_preference: None,
            model_preference: None,
            metadata: None,
        }
    }

    fn request_with_session_metadata(metadata: Value) -> TurnStartRequest {
        TurnStartRequest {
            session: Some(AgentSessionSnapshot {
                session_id: "session-with-routing".to_string(),
                thread_id: "thread-with-routing".to_string(),
                workspace_id: Some("workspace-main".to_string()),
                business_object_ref: Some(BusinessObjectRefSnapshot {
                    metadata: Some(metadata),
                }),
            }),
            turn: None,
            input: AgentInput {
                text: "hello".to_string(),
            },
            runtime_options: None,
            provider_preference: None,
            model_preference: None,
            metadata: None,
        }
    }

    #[test]
    fn explicit_runtime_preferences_win() {
        let request = TurnStartRequest {
            session: None,
            turn: None,
            input: AgentInput {
                text: "hello".to_string(),
            },
            runtime_options: Some(RuntimeOptions {
                provider_preference: Some("deepseek".to_string()),
                model_preference: Some("deepseek-chat".to_string()),
                metadata: None,
                host_options: None,
            }),
            provider_preference: None,
            model_preference: None,
            metadata: None,
        };

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
    fn host_provider_config_is_used_when_preferences_are_omitted() {
        let request = request_for_test(
            "hello",
            Some(json!({
                "asterChatRequest": {
                    "turn_config": {
                        "provider_config": {
                            "provider_id": "custom-provider",
                            "provider_name": "Custom Provider",
                            "model_name": "custom-model"
                        },
                        "reasoning_effort": "high"
                    }
                }
            })),
            None,
        );

        let selection = selection_from_host_provider_config(&request).expect("selection");
        assert_eq!(selection.provider, "custom-provider");
        assert_eq!(selection.model, "custom-model");
        assert_eq!(selection.source, "host_options_provider_config");
        assert_eq!(selection.reasoning_effort.as_deref(), Some("high"));
    }

    #[test]
    fn flat_host_provider_config_is_used_for_current_frontend_projection() {
        let request = request_for_test(
            "hello",
            Some(json!({
                "asterChatRequest": {
                    "provider_config": {
                        "provider_id": "deepseek",
                        "provider_name": "deepseek",
                        "model_name": "deepseek-v4-pro"
                    },
                    "provider_preference": "deepseek",
                    "model_preference": "deepseek-v4-pro",
                    "reasoning_effort": "high"
                }
            })),
            None,
        );

        let selection = selection_from_host_provider_config(&request).expect("selection");
        assert_eq!(selection.provider, "deepseek");
        assert_eq!(selection.model, "deepseek-v4-pro");
        assert_eq!(selection.source, "host_options_provider_config");
        assert_eq!(selection.reasoning_effort.as_deref(), Some("high"));
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
    fn host_provider_config_without_direct_credentials_stays_database_backed() {
        let request = request_for_test(
            "hello",
            Some(json!({
                "asterChatRequest": {
                    "provider_config": {
                        "provider_id": "custom-provider",
                        "provider_name": "openai",
                        "model_name": "custom-model"
                    }
                }
            })),
            None,
        );
        let host_request = aster_chat_request_from_request(&request);
        let selection = selection_from_host_provider_config(&request).expect("selection");

        let direct_config =
            direct_provider_config_from_request(host_request.as_ref(), &selection, None);

        assert!(direct_config.is_none());
    }

    #[test]
    fn session_default_provider_model_is_used_after_frontend_compaction() {
        let request = request_with_session_metadata(json!({
            "providerSelector": "lime-hub",
            "providerName": "Lime Hub",
            "modelName": "gpt-5.5"
        }));

        let selection = selection_from_session_default(&request).expect("selection");

        assert_eq!(
            selection,
            RuntimeModelSelection {
                provider: "lime-hub".to_string(),
                model: "gpt-5.5".to_string(),
                source: "session_default",
                reasoning_effort: None,
            }
        );
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
    fn incomplete_session_default_is_not_a_runtime_selection() {
        let request = request_with_session_metadata(json!({
            "providerSelector": "lime-hub"
        }));

        assert!(selection_from_session_default(&request).is_none());
    }

    #[test]
    fn request_system_prompt_reads_host_turn_config() {
        let request = request_for_test(
            "hello",
            Some(json!({
                "asterChatRequest": {
                    "turn_config": {
                        "system_prompt": "只输出 JSON"
                    }
                }
            })),
            None,
        );

        assert_eq!(request_system_prompt(&request), "只输出 JSON");
    }

    #[test]
    fn flat_system_prompt_is_used_for_current_frontend_projection() {
        let request = request_for_test(
            "hello",
            Some(json!({
                "asterChatRequest": {
                    "system_prompt": "保留 Claw 原始系统提示"
                }
            })),
            None,
        );

        assert_eq!(request_system_prompt(&request), "保留 Claw 原始系统提示");
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

    #[test]
    fn session_scope_reads_app_server_session_and_turn() {
        let request = TurnStartRequest {
            session: Some(AgentSessionSnapshot {
                session_id: "session-1".to_string(),
                thread_id: "thread-1".to_string(),
                workspace_id: Some("workspace-1".to_string()),
                business_object_ref: None,
            }),
            turn: Some(AgentTurnSnapshot {
                turn_id: "turn-1".to_string(),
                session_id: Some("session-1".to_string()),
                thread_id: None,
            }),
            input: AgentInput {
                text: "hello".to_string(),
            },
            runtime_options: None,
            provider_preference: None,
            model_preference: None,
            metadata: None,
        };

        let scope = session_scope_from_request(&request).expect("scope");

        assert_eq!(
            scope,
            RuntimeSessionScope {
                session_id: "session-1".to_string(),
                thread_id: "thread-1".to_string(),
                turn_id: "turn-1".to_string(),
                workspace_id: Some("workspace-1".to_string()),
            }
        );
    }

    #[test]
    fn runtime_provider_type_validation_rejects_unknown_provider() {
        assert!(!is_supported_builtin_runtime_provider(
            "invalid-provider-for-probe"
        ));
    }

    #[test]
    fn custom_provider_ids_must_be_configured_provider_ids() {
        assert!(!is_supported_builtin_runtime_provider(
            "custom-ba4e7574-dd00-4784-945a-0f383dfa1272"
        ));
    }

    #[test]
    fn current_builtin_provider_aliases_remain_supported() {
        assert!(is_supported_builtin_runtime_provider("deepseek"));
        assert!(is_supported_builtin_runtime_provider("openai"));
    }
}
