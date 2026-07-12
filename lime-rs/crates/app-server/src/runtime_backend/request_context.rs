use crate::ExecutionRequest;
use crate::RuntimeCoreError;
use app_server_protocol::{
    RuntimeProviderConfig, RuntimeRequest, RuntimeSearchMode, RuntimeToolCallStrategy,
};
use lime_agent::{
    request_tool_policy_with_additional_required_tools, resolve_request_tool_policy_with_mode,
    RequestToolPolicy, RequestToolPolicyMode, SessionProviderConfig,
};
pub(super) use runtime_core::RuntimeModelSelection;
use serde_json::Value;
use std::path::PathBuf;

const LIME_RUNTIME_DIRECT_ANSWER_TOOL_SURFACE: &str = "direct_answer";
const LIME_RUNTIME_COMPACT_TOOLS_TOOL_SURFACE: &str = "compact_tools";

mod session_config;
mod turn_context;
mod workspace_scope;

pub(super) use session_config::session_config_from_request;
pub(super) use turn_context::turn_context_from_request;
pub(super) use workspace_scope::request_workspace_scope;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum FastResponseToolSurface {
    Full,
    DirectAnswer,
    CompactTools,
}

impl FastResponseToolSurface {
    fn uses_light_session_prompt(self) -> bool {
        matches!(self, Self::DirectAnswer | Self::CompactTools)
    }

    fn metadata_tool_surface(self) -> Option<&'static str> {
        match self {
            Self::Full => None,
            Self::DirectAnswer => Some(LIME_RUNTIME_DIRECT_ANSWER_TOOL_SURFACE),
            Self::CompactTools => Some(LIME_RUNTIME_COMPACT_TOOLS_TOOL_SURFACE),
        }
    }
}

pub(super) fn selection_with_effective_reasoning(
    selection: &RuntimeModelSelection,
) -> RuntimeModelSelection {
    let Some(requested_reasoning_effort) = selection.reasoning_effort.as_deref() else {
        return RuntimeModelSelection {
            provider: selection.provider.clone(),
            model: selection.model.clone(),
            source: selection.source,
            reasoning_effort: None,
        };
    };
    let capability = super::model_capability::resolve_basic_model_capability(
        super::model_capability::ModelRef::new(selection.provider.clone(), selection.model.clone()),
    );
    let requested_level =
        super::model_capability::reasoning_level_from_str(requested_reasoning_effort);
    let policy = super::model_capability::resolve_reasoning_policy(&capability, requested_level);
    RuntimeModelSelection {
        provider: selection.provider.clone(),
        model: selection.model.clone(),
        source: selection.source,
        reasoning_effort: policy.effective_level.and_then(|level| match level {
            super::model_capability::ReasoningLevel::None => None,
            super::model_capability::ReasoningLevel::Minimal => Some("low".to_string()),
            super::model_capability::ReasoningLevel::Low => Some("low".to_string()),
            super::model_capability::ReasoningLevel::Medium => Some("medium".to_string()),
            super::model_capability::ReasoningLevel::High => Some("high".to_string()),
            super::model_capability::ReasoningLevel::Max => Some("max".to_string()),
            super::model_capability::ReasoningLevel::XHigh => Some("xhigh".to_string()),
        }),
    }
}

pub(super) fn resolve_runtime_model_selection(
    request: &ExecutionRequest,
) -> Result<RuntimeModelSelection, RuntimeCoreError> {
    if let Some(selection) = fast_response_selection_from_profile_model_slot(request) {
        return Ok(selection);
    }
    if let Some(selection) = selection_from_explicit_preferences(request) {
        return Ok(selection);
    }
    if let Some(selection) = selection_from_host_provider_config(request) {
        return Ok(selection);
    }
    if let Some(selection) = super::model_routing::selection_from_profile_model_slot(request) {
        return Ok(selection);
    }
    if let Some(selection) = selection_from_session_default(request) {
        return Ok(selection);
    }

    Err(RuntimeCoreError::Backend(
        "App Server runtime backend requires provider/model selection. Submit runtimeOptions.runtimeRequest.providerPreference and runtimeOptions.runtimeRequest.modelPreference, runtimeOptions.runtimeRequest.providerConfig, or persist a complete session provider/model default.".to_string(),
    ))
}

pub(super) fn fast_response_selection_from_profile_model_slot(
    request: &ExecutionRequest,
) -> Option<RuntimeModelSelection> {
    let metadata_values = runtime_model_metadata_values(request);
    let selection = runtime_core::selection_from_profile_model_slot(
        &metadata_values,
        reasoning_effort_from_request(request),
    )?;
    let routing = runtime_core::resolve_model_routing_for_candidate(&metadata_values, &selection);
    (routing.service_model_slot == "fast").then_some(selection)
}

pub(super) fn selection_from_explicit_preferences(
    request: &ExecutionRequest,
) -> Option<RuntimeModelSelection> {
    let runtime_request = request.runtime_request()?;
    let provider = non_empty(runtime_request.provider_preference.as_deref())?;
    let model = non_empty(runtime_request.model_preference.as_deref())?;
    Some(RuntimeModelSelection {
        provider,
        model,
        source: "runtime_request",
        reasoning_effort: reasoning_effort_from_request(request),
    })
}

pub(super) fn selection_from_host_provider_config(
    request: &ExecutionRequest,
) -> Option<RuntimeModelSelection> {
    let host_request = runtime_request_from_request(request)?;
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
        source: "runtime_request_provider_config",
        reasoning_effort: host_reasoning_effort(&host_request)
            .or_else(|| reasoning_effort_from_request(request)),
    })
}

pub(super) fn selection_from_session_default(
    request: &ExecutionRequest,
) -> Option<RuntimeModelSelection> {
    let business_object_ref = request.session.business_object_ref.as_ref()?;
    let metadata = business_object_ref.metadata.as_ref()?;
    let provider = session_default_provider(metadata)?;
    let model = session_default_model(metadata)?;
    if business_object_ref.kind == "conversation.import"
        && !session_default_has_current_provider_selector(metadata)
    {
        return None;
    }
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

fn session_default_has_current_provider_selector(metadata: &Value) -> bool {
    json_pointer_string(
        metadata,
        &[
            "/providerSelector",
            "/provider_selector",
            "/executionRuntime/providerSelector",
            "/execution_runtime/provider_selector",
            "/extensionData/lime_provider_routing.v0/providerSelector",
            "/extensionData/lime_provider_routing.v0/provider_selector",
        ],
    )
    .is_some()
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

pub(super) fn reasoning_effort_from_request(request: &ExecutionRequest) -> Option<String> {
    if let Some(reasoning_effort) =
        runtime_request_from_request(request).and_then(|host| host_reasoning_effort(&host))
    {
        return Some(reasoning_effort);
    }
    request
        .runtime_metadata()
        .and_then(metadata_reasoning_effort)
}

fn runtime_model_metadata_values(request: &ExecutionRequest) -> Vec<&Value> {
    request.runtime_metadata().into_iter().collect()
}

fn metadata_reasoning_effort(metadata: &Value) -> Option<String> {
    json_pointer_string(
        metadata,
        &[
            "/reasoning_effort",
            "/reasoningEffort",
            "/model_reasoning_effort",
            "/modelReasoningEffort",
            "/reasoning/effort",
            "/harness/reasoning_effort",
            "/harness/reasoningEffort",
            "/harness/model_reasoning_effort",
            "/harness/modelReasoningEffort",
            "/harness/reasoning/effort",
        ],
    )
    .or_else(|| metadata_model_request_policy_reasoning_effort(metadata))
}

fn metadata_model_request_policy_reasoning_effort(metadata: &Value) -> Option<String> {
    [
        "/harness/model_request_policy/reasoning_policy",
        "/harness/modelRequestPolicy/reasoningPolicy",
        "/model_request_policy/reasoning_policy",
        "/modelRequestPolicy/reasoningPolicy",
    ]
    .into_iter()
    .filter_map(|pointer| metadata.pointer(pointer))
    .find_map(|policy| {
        json_pointer_string(
            policy,
            &["/default_reasoning_level", "/defaultReasoningLevel"],
        )
    })
}

pub(super) fn session_scope_from_request(
    request: &ExecutionRequest,
) -> Result<RuntimeSessionScope, RuntimeCoreError> {
    let session_id = non_empty(Some(&request.session.session_id)).ok_or_else(|| {
        RuntimeCoreError::Backend(
            "App Server runtime backend session.sessionId is empty".to_string(),
        )
    })?;
    let thread_id = non_empty(Some(&request.turn.thread_id))
        .or_else(|| non_empty(Some(&request.session.thread_id)))
        .ok_or_else(|| {
            RuntimeCoreError::Backend(
                "App Server runtime backend session.threadId is empty".to_string(),
            )
        })?;
    let turn_id = non_empty(Some(&request.turn.turn_id)).ok_or_else(|| {
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
            runtime_request_from_request(request)
                .and_then(|host| non_empty(host.workspace_id.as_deref()))
        }),
    })
}

pub(super) fn runtime_request_from_request(request: &ExecutionRequest) -> Option<RuntimeRequest> {
    request.runtime_request().cloned()
}

fn host_provider_config(host: &RuntimeRequest) -> Option<&RuntimeProviderConfig> {
    host.provider_config.as_ref()
}

pub(super) fn direct_provider_config_from_request(
    host_request: Option<&RuntimeRequest>,
    selection: &RuntimeModelSelection,
    reasoning_effort: Option<String>,
) -> Option<SessionProviderConfig> {
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

    Some(SessionProviderConfig {
        provider_name,
        provider_selector,
        model_name,
        api_key: request.api_key.clone(),
        base_url: request.base_url.clone(),
        credential_uuid: None,
        reasoning_effort,
        route_protocol: None,
        toolshim: matches!(
            request.tool_call_strategy,
            Some(RuntimeToolCallStrategy::ToolShim)
        ),
        toolshim_model: request.toolshim_model.clone(),
        model_capabilities: request.model_capabilities.clone(),
    })
}

fn host_provider_preference(host: &RuntimeRequest) -> Option<String> {
    non_empty(host.provider_preference.as_deref())
}

fn host_model_preference(host: &RuntimeRequest) -> Option<String> {
    non_empty(host.model_preference.as_deref())
}

pub(super) fn host_reasoning_effort(host: &RuntimeRequest) -> Option<String> {
    non_empty(host.reasoning_effort.as_deref())
}

pub(super) fn host_thinking_enabled(host: &RuntimeRequest) -> Option<bool> {
    host.thinking_enabled
}

pub(super) fn host_approval_policy(host: &RuntimeRequest) -> Option<String> {
    non_empty(host.approval_policy.as_deref())
}

pub(super) fn host_sandbox_policy(host: &RuntimeRequest) -> Option<String> {
    non_empty(host.sandbox_policy.as_deref())
}

pub(super) fn host_system_prompt(host: &RuntimeRequest) -> Option<String> {
    non_empty(host.system_prompt.as_deref())
}

fn host_web_search(host: &RuntimeRequest) -> Option<bool> {
    host.web_search
}

fn host_request_search_mode(host: &RuntimeRequest) -> Option<RequestToolPolicyMode> {
    host.search_mode.map(|mode| match mode {
        RuntimeSearchMode::Disabled => RequestToolPolicyMode::Disabled,
        RuntimeSearchMode::Auto => RequestToolPolicyMode::Auto,
        RuntimeSearchMode::Required => RequestToolPolicyMode::Required,
    })
}

pub(super) fn request_tool_policy_from_request(
    host_request: Option<&RuntimeRequest>,
) -> RequestToolPolicy {
    let web_search = host_request.and_then(host_web_search);
    let search_mode = host_request.and_then(host_request_search_mode);
    let policy = resolve_request_tool_policy_with_mode(web_search, search_mode);
    if host_request.is_some_and(host_requests_research_web_fetch) {
        request_tool_policy_with_additional_required_tools(policy, &["WebFetch"])
    } else {
        policy
    }
}

pub(super) fn should_defer_tool_surface_for_fast_response(
    request: &ExecutionRequest,
    request_tool_policy: &RequestToolPolicy,
) -> bool {
    matches!(
        fast_response_tool_surface_for_request(request, request_tool_policy),
        FastResponseToolSurface::DirectAnswer
    )
}

pub(super) fn should_use_compact_tool_surface_for_fast_response(
    request: &ExecutionRequest,
    request_tool_policy: &RequestToolPolicy,
) -> bool {
    matches!(
        fast_response_tool_surface_for_request(request, request_tool_policy),
        FastResponseToolSurface::CompactTools
    )
}

fn fast_response_tool_surface_for_request(
    request: &ExecutionRequest,
    request_tool_policy: &RequestToolPolicy,
) -> FastResponseToolSurface {
    if request_tool_policy.requires_web_search() {
        return FastResponseToolSurface::Full;
    }
    let metadata_values = super::skill_runtime_enable::request_metadata_values(request);
    let fast_response_enabled = metadata_values
        .iter()
        .any(|metadata| fast_response_routing_enabled(metadata));
    if !fast_response_enabled
        || metadata_values
            .iter()
            .any(|metadata| metadata_requests_tool_surface(metadata))
    {
        return FastResponseToolSurface::Full;
    }
    if request_tool_policy.allows_web_search() {
        FastResponseToolSurface::CompactTools
    } else {
        FastResponseToolSurface::DirectAnswer
    }
}

pub(super) fn host_metadata_value(host: &RuntimeRequest) -> Option<Value> {
    host.metadata.clone()
}

fn host_requests_research_web_fetch(host: &RuntimeRequest) -> bool {
    host_metadata_value(host).is_some_and(|metadata| {
        metadata
            .pointer("/harness/research_skill_launch/research_request")
            .is_some()
    })
}

fn fast_response_routing_enabled(metadata: &Value) -> bool {
    let Some(routing) = metadata
        .pointer("/harness/fast_response_routing")
        .or_else(|| metadata.pointer("/harness/fastResponseRouting"))
        .or_else(|| metadata.pointer("/fast_response_routing"))
        .or_else(|| metadata.pointer("/fastResponseRouting"))
        .and_then(Value::as_object)
    else {
        return false;
    };

    routing
        .get("mode")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or("auto")
        != "off"
}

fn metadata_requests_tool_surface(metadata: &Value) -> bool {
    [
        "/harness/plugin_activation",
        "/harness/pluginActivation",
        "/plugin_activation",
        "/pluginActivation",
        "/harness/workspace_skill_runtime_enable",
        "/harness/workspaceSkillRuntimeEnable",
        "/workspace_skill_runtime_enable",
        "/workspaceSkillRuntimeEnable",
        "/harness/service_scene_launch",
        "/harness/serviceSceneLaunch",
        "/service_scene_launch",
        "/serviceSceneLaunch",
        "/harness/expert/skill_refs",
        "/harness/expert/skillRefs",
        "/expert/skill_refs",
        "/expert/skillRefs",
        "/harness/agent_skills",
        "/harness/agentSkills",
        "/agent_skills",
        "/agentSkills",
    ]
    .iter()
    .any(|pointer| metadata.pointer(pointer).is_some())
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

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct RuntimeSessionScope {
    pub(super) session_id: String,
    pub(super) thread_id: String,
    pub(super) turn_id: String,
    pub(super) workspace_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct RuntimeWorkspaceScope {
    pub(super) working_dir: Option<PathBuf>,
    pub(super) project_root: Option<PathBuf>,
}
