use crate::ExecutionRequest;
use crate::RuntimeCoreError;
use aster::session::{TurnContextOverride, TurnOutputSchemaSource};
use lime_agent::{
    merge_system_prompt_with_request_tool_policy,
    merge_system_prompt_with_runtime_agents_for_project, resolve_request_tool_policy_with_mode,
    ProviderConfig, RequestToolPolicy, RequestToolPolicyMode, SessionConfigBuilder,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;

pub(super) fn resolve_runtime_model_selection(
    request: &ExecutionRequest,
) -> Result<RuntimeModelSelection, RuntimeCoreError> {
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
        "App Server runtime backend requires provider/model selection. Submit runtimeOptions.providerPreference and runtimeOptions.modelPreference, hostOptions.asterChatRequest.provider_config, or persist a complete session provider/model default.".to_string(),
    ))
}

pub(super) fn selection_from_explicit_preferences(
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

pub(super) fn selection_from_host_provider_config(
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

pub(super) fn selection_from_session_default(
    request: &ExecutionRequest,
) -> Option<RuntimeModelSelection> {
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

pub(super) fn reasoning_effort_from_request(request: &ExecutionRequest) -> Option<String> {
    if let Some(reasoning_effort) =
        aster_chat_request_from_request(request).and_then(|host| host_reasoning_effort(&host))
    {
        return Some(reasoning_effort);
    }
    [
        request
            .runtime_options
            .as_ref()
            .and_then(|options| options.metadata.as_ref()),
        request.metadata.as_ref(),
    ]
    .into_iter()
    .flatten()
    .find_map(metadata_reasoning_effort)
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
            "/turn_config/reasoning_effort",
            "/turnConfig/reasoningEffort",
            "/turn_config/model_reasoning_effort",
            "/turnConfig/modelReasoningEffort",
            "/turn_config/reasoning/effort",
            "/turnConfig/reasoning/effort",
            "/harness/reasoning_effort",
            "/harness/reasoningEffort",
            "/harness/model_reasoning_effort",
            "/harness/modelReasoningEffort",
            "/harness/reasoning/effort",
        ],
    )
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

pub(super) fn aster_chat_request_from_request(
    request: &ExecutionRequest,
) -> Option<AsterChatRequestSnapshot> {
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

pub(super) fn direct_provider_config_from_request(
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

pub(super) fn host_reasoning_effort(host: &AsterChatRequestSnapshot) -> Option<String> {
    host_turn_config(host)
        .and_then(|turn_config| non_empty(turn_config.reasoning_effort.as_deref()))
        .or_else(|| non_empty(host.reasoning_effort.as_deref()))
}

pub(super) fn host_thinking_enabled(host: &AsterChatRequestSnapshot) -> Option<bool> {
    host_turn_config(host)
        .and_then(|turn_config| turn_config.thinking_enabled)
        .or(host.thinking_enabled)
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

pub(super) fn request_tool_policy_from_request(
    host_request: Option<&AsterChatRequestSnapshot>,
) -> RequestToolPolicy {
    let web_search = host_request.and_then(host_web_search);
    let search_mode = host_request.and_then(host_search_mode);
    resolve_request_tool_policy_with_mode(web_search, search_mode, true)
}

pub(super) fn session_config_from_request(
    request: &ExecutionRequest,
    host_request: Option<&AsterChatRequestSnapshot>,
    scope: &RuntimeSessionScope,
    selection: &RuntimeModelSelection,
    request_tool_policy: &RequestToolPolicy,
    config_metadata: Option<Value>,
) -> aster::agents::SessionConfig {
    let workspace_scope = request_workspace_scope(request, host_request);
    let system_prompt = merge_system_prompt_with_runtime_agents_for_project(
        Some(request_system_prompt(request)),
        workspace_scope.working_dir.as_deref(),
        workspace_scope.project_root.as_deref(),
    );
    let system_prompt =
        merge_system_prompt_with_request_tool_policy(system_prompt, request_tool_policy);
    let mut builder = SessionConfigBuilder::new(&scope.session_id)
        .thread_id(scope.thread_id.clone())
        .turn_id(scope.turn_id.clone())
        .include_context_trace(true);
    if let Some(system_prompt) = system_prompt {
        builder = builder.system_prompt(system_prompt);
    }
    if let Some(turn_context) =
        turn_context_from_request(request, host_request, scope, selection, config_metadata)
    {
        builder = builder.turn_context(turn_context);
    }
    builder.build()
}

pub(super) fn request_workspace_scope(
    request: &ExecutionRequest,
    host_request: Option<&AsterChatRequestSnapshot>,
) -> RuntimeWorkspaceScope {
    let working_dir = host_request
        .and_then(host_working_dir)
        .or_else(|| {
            metadata_working_dir(
                request
                    .runtime_options
                    .as_ref()
                    .and_then(|options| options.metadata.as_ref()),
            )
        })
        .or_else(|| metadata_working_dir(request.metadata.as_ref()))
        .filter(|path| path.is_absolute());
    let project_root = host_request
        .and_then(host_project_root)
        .or_else(|| {
            metadata_project_root(
                request
                    .runtime_options
                    .as_ref()
                    .and_then(|options| options.metadata.as_ref()),
            )
        })
        .or_else(|| metadata_project_root(request.metadata.as_ref()))
        .filter(|path| path.is_absolute());

    RuntimeWorkspaceScope {
        working_dir: working_dir.or_else(|| project_root.clone()),
        project_root,
    }
}

fn host_working_dir(host: &AsterChatRequestSnapshot) -> Option<PathBuf> {
    host_turn_config(host)
        .and_then(|turn_config| non_empty(turn_config.working_dir.as_deref()))
        .or_else(|| non_empty(host.working_dir.as_deref()))
        .map(PathBuf::from)
}

fn host_project_root(host: &AsterChatRequestSnapshot) -> Option<PathBuf> {
    host_turn_config(host)
        .and_then(|turn_config| {
            non_empty(turn_config.project_root.as_deref())
                .or_else(|| non_empty(turn_config.workspace_root.as_deref()))
        })
        .or_else(|| {
            non_empty(host.project_root.as_deref())
                .or_else(|| non_empty(host.workspace_root.as_deref()))
        })
        .map(PathBuf::from)
}

fn metadata_working_dir(metadata: Option<&Value>) -> Option<PathBuf> {
    let metadata = metadata?;
    json_pointer_string(
        metadata,
        &[
            "/workingDir",
            "/working_dir",
            "/workingDirectory",
            "/working_directory",
            "/cwd",
            "/harness/workingDir",
            "/harness/working_dir",
            "/harness/workingDirectory",
            "/harness/working_directory",
            "/harness/cwd",
            "/turn_config/workingDir",
            "/turn_config/working_dir",
            "/turnConfig/workingDir",
            "/turnConfig/workingDirectory",
        ],
    )
    .map(PathBuf::from)
}

fn metadata_project_root(metadata: Option<&Value>) -> Option<PathBuf> {
    let metadata = metadata?;
    json_pointer_string(
        metadata,
        &[
            "/workspaceRoot",
            "/workspace_root",
            "/projectRoot",
            "/project_root",
            "/harness/workspaceRoot",
            "/harness/workspace_root",
            "/harness/projectRoot",
            "/harness/project_root",
            "/harness/workspace_skill_runtime_enable/workspace_root",
            "/harness/workspaceSkillRuntimeEnable/workspaceRoot",
            "/harness/workspace_skill_bindings/workspace_root",
            "/harness/workspaceSkillBindings/workspaceRoot",
        ],
    )
    .map(PathBuf::from)
}

pub(super) fn turn_context_from_request(
    request: &ExecutionRequest,
    host_request: Option<&AsterChatRequestSnapshot>,
    scope: &RuntimeSessionScope,
    selection: &RuntimeModelSelection,
    config_metadata: Option<Value>,
) -> Option<TurnContextOverride> {
    let workspace_scope = request_workspace_scope(request, host_request);
    let mut context = TurnContextOverride {
        cwd: workspace_scope.working_dir.clone(),
        model: Some(selection.model.clone()),
        effort: selection.reasoning_effort.clone(),
        approval_policy: host_request.and_then(host_approval_policy),
        sandbox_policy: host_request.and_then(host_sandbox_policy),
        collaboration_mode: collaboration_mode_from_request(request, host_request),
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
            "workingDir": workspace_scope
                .working_dir
                .as_ref()
                .map(|path| path.to_string_lossy().to_string()),
            "projectRoot": workspace_scope
                .project_root
                .as_ref()
                .map(|path| path.to_string_lossy().to_string()),
            "thinkingEnabled": host_request.and_then(host_thinking_enabled),
        }),
    );
    if let Some(host_metadata) = host_request.and_then(host_metadata_value) {
        metadata.insert("aster_chat_request".to_string(), host_metadata);
    }
    if request_tool_policy_from_request(host_request).allows_web_search() {
        metadata.insert("web_search_enabled".to_string(), json!(true));
        metadata.insert("webSearchEnabled".to_string(), json!(true));
    }
    if let Some(runtime_metadata) = request
        .runtime_options
        .as_ref()
        .and_then(|options| options.metadata.clone())
        .or_else(|| request.metadata.clone())
    {
        metadata.insert("runtime_options".to_string(), runtime_metadata);
    }
    if let Some(config_metadata) = config_metadata {
        metadata.insert("config".to_string(), config_metadata);
    }
    if let Some(output_schema) = output_schema_from_request(request, host_request) {
        context.output_schema = Some(output_schema);
        context.output_schema_source = Some(TurnOutputSchemaSource::Turn);
    }
    context.metadata = metadata;
    if context.approval_policy.is_none()
        && context.sandbox_policy.is_none()
        && context.user_visible_input_text.is_none()
        && context.output_schema.is_none()
        && context.collaboration_mode.is_none()
        && context.metadata.is_empty()
    {
        None
    } else {
        Some(context)
    }
}

fn output_schema_from_request(
    request: &ExecutionRequest,
    host_request: Option<&AsterChatRequestSnapshot>,
) -> Option<Value> {
    request
        .output_schema
        .clone()
        .or_else(|| {
            request
                .structured_output
                .as_ref()
                .and_then(|value| value.schema.clone())
        })
        .or_else(|| output_schema_from_expected_output(request.expected_output.as_ref()))
        .or_else(|| {
            request
                .runtime_options
                .as_ref()
                .and_then(|options| options.output_schema.clone())
        })
        .or_else(|| {
            request
                .runtime_options
                .as_ref()
                .and_then(|options| options.structured_output.as_ref())
                .and_then(|value| value.schema.clone())
        })
        .or_else(|| {
            request.runtime_options.as_ref().and_then(|options| {
                output_schema_from_expected_output(options.expected_output.as_ref())
            })
        })
        .or_else(|| host_request.and_then(host_output_schema).cloned())
}

fn collaboration_mode_from_request(
    request: &ExecutionRequest,
    host_request: Option<&AsterChatRequestSnapshot>,
) -> Option<String> {
    host_request
        .and_then(host_turn_config)
        .and_then(|turn_config| collaboration_mode_from_metadata(turn_config.metadata.as_ref()))
        .or_else(|| {
            host_request.and_then(|host| collaboration_mode_from_metadata(host.metadata.as_ref()))
        })
        .or_else(|| {
            request
                .runtime_options
                .as_ref()
                .and_then(|options| collaboration_mode_from_metadata(options.metadata.as_ref()))
        })
        .or_else(|| collaboration_mode_from_metadata(request.metadata.as_ref()))
}

fn collaboration_mode_from_metadata(metadata: Option<&Value>) -> Option<String> {
    let metadata = metadata?;
    json_pointer_string(
        metadata,
        &[
            "/collaboration_mode",
            "/collaborationMode",
            "/harness/collaboration_mode/mode",
            "/harness/collaborationMode/mode",
            "/harness/collaboration_mode",
            "/harness/collaborationMode",
            "/turn_config/collaboration_mode",
            "/turnConfig/collaborationMode",
        ],
    )
    .map(|value| match value.as_str() {
        "planning" => "plan".to_string(),
        _ => value,
    })
}

fn host_output_schema(host: &AsterChatRequestSnapshot) -> Option<&Value> {
    host_turn_config(host)
        .and_then(|turn_config| turn_config.output_schema.as_ref())
        .or_else(|| {
            host_turn_config(host)
                .and_then(|turn_config| turn_config.structured_output.as_ref())
                .and_then(output_schema_from_structured_output_value)
        })
        .or_else(|| {
            host_turn_config(host)
                .and_then(|turn_config| turn_config.expected_output.as_ref())
                .and_then(output_schema_from_expected_output_value)
        })
        .or(host.output_schema.as_ref())
        .or_else(|| {
            host.structured_output
                .as_ref()
                .and_then(output_schema_from_structured_output_value)
        })
        .or_else(|| {
            host.expected_output
                .as_ref()
                .and_then(output_schema_from_expected_output_value)
        })
}

fn output_schema_from_structured_output_value(value: &Value) -> Option<&Value> {
    value
        .get("schema")
        .or_else(|| value.get("outputSchema"))
        .or_else(|| value.get("output_schema"))
}

fn output_schema_from_expected_output(value: Option<&Value>) -> Option<Value> {
    output_schema_from_expected_output_value(value?).cloned()
}

fn output_schema_from_expected_output_value(value: &Value) -> Option<&Value> {
    if let Some(schema) = value
        .get("outputFormat")
        .or_else(|| value.get("output_format"))
        .and_then(output_schema_from_output_format)
    {
        return Some(schema);
    }
    output_schema_from_output_format(value)
}

fn output_schema_from_output_format(value: &Value) -> Option<&Value> {
    value
        .get("schema")
        .or_else(|| value.get("outputSchema"))
        .or_else(|| value.get("output_schema"))
}

fn host_metadata_value(host: &AsterChatRequestSnapshot) -> Option<Value> {
    host_turn_config(host)
        .and_then(|turn_config| turn_config.metadata.clone())
        .or_else(|| host.metadata.clone())
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

#[derive(Debug, Deserialize, Default)]
pub(super) struct AsterChatRequestSnapshot {
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
    #[serde(default, alias = "thinkingEnabled")]
    thinking_enabled: Option<bool>,
    #[serde(default, alias = "approvalPolicy")]
    approval_policy: Option<String>,
    #[serde(default, alias = "sandboxPolicy")]
    sandbox_policy: Option<String>,
    #[serde(default, alias = "workspaceId")]
    workspace_id: Option<String>,
    #[serde(default, alias = "workingDir")]
    working_dir: Option<String>,
    #[serde(default, alias = "workspaceRoot")]
    workspace_root: Option<String>,
    #[serde(default, alias = "projectRoot")]
    project_root: Option<String>,
    #[serde(default, alias = "webSearch")]
    web_search: Option<bool>,
    #[serde(default, alias = "searchMode")]
    search_mode: Option<RequestToolPolicyMode>,
    #[serde(default, alias = "systemPrompt")]
    system_prompt: Option<String>,
    #[serde(default, alias = "expectedOutput")]
    expected_output: Option<Value>,
    #[serde(default, alias = "structuredOutput")]
    structured_output: Option<Value>,
    #[serde(default, alias = "outputSchema")]
    output_schema: Option<Value>,
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
    #[serde(default, alias = "thinkingEnabled")]
    thinking_enabled: Option<bool>,
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
    #[serde(default, alias = "workingDir")]
    working_dir: Option<String>,
    #[serde(default, alias = "workspaceRoot")]
    workspace_root: Option<String>,
    #[serde(default, alias = "projectRoot")]
    project_root: Option<String>,
    #[serde(default, alias = "expectedOutput")]
    expected_output: Option<Value>,
    #[serde(default, alias = "structuredOutput")]
    structured_output: Option<Value>,
    #[serde(default, alias = "outputSchema")]
    output_schema: Option<Value>,
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
pub(super) struct RuntimeModelSelection {
    pub(super) provider: String,
    pub(super) model: String,
    pub(super) source: &'static str,
    pub(super) reasoning_effort: Option<String>,
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
