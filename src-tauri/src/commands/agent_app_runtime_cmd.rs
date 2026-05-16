//! Agent App Runtime surface 命令。
//!
//! 本模块只把 App-scoped task 适配到现有 AgentRuntime 主链；
//! 不在 Agent App 下创建第二套模型、工具、证据或队列运行时。

use crate::agent::AsterAgentState;
use crate::app::LogState;
use crate::commands::api_key_provider_cmd::ApiKeyProviderServiceState;
use crate::commands::aster_agent_cmd::action_runtime::agent_runtime_respond_action;
use crate::commands::aster_agent_cmd::{
    agent_runtime_get_thread_read, agent_runtime_interrupt_turn, build_queued_turn_task,
    create_runtime_session_internal_with_runtime_and_session_id, AgentRuntimeInterruptTurnRequest,
    AgentRuntimeRespondActionRequest, AgentRuntimeThreadArtifactView, AgentRuntimeThreadReadModel,
    AsterChatRequest, AsterExecutionStrategy, RuntimeCommandContext,
};
use crate::config::GlobalConfigManagerState;
use crate::database::DbConnection;
use crate::mcp::McpManagerState;
use crate::services::agent_app_runtime_capability_catalog_service::{
    resolve_capability_descriptors, AgentAppRuntimeCapabilityDescriptor,
};
use crate::services::automation_service::AutomationServiceState;
use chrono::Utc;
use lime_core::database::dao::agent_run::{AgentRun, AgentRunDao, AgentRunStatus};
use lime_core::database::dao::api_key_provider::ProviderWithKeys;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

const AGENT_APP_RUNTIME_EVENT_PREFIX: &str = "agent_app_runtime";
const AGENT_APP_RUNTIME_METADATA_KEY: &str = "agent_app_runtime";
const LIME_RUNTIME_METADATA_KEY: &str = "lime_runtime";
const AGENT_APP_RUNTIME_CAPABILITY_SOURCE: &str = "agent_app_runtime";
const CONTENT_FACTORY_WORKSPACE_PATCH_KIND: &str = "content_factory.workspace_patch";
const AGENT_APP_RUNTIME_SESSION_ID_PREFIX: &str = "agent-app-runtime-";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppRuntimeStartTaskRequest {
    pub app_id: String,
    #[serde(default)]
    pub entry_key: Option<String>,
    #[serde(default)]
    pub workspace_id: Option<String>,
    #[serde(default)]
    pub session_id: Option<String>,
    #[serde(default)]
    pub task_id: Option<String>,
    pub task_kind: String,
    #[serde(default)]
    pub idempotency_key: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub prompt: Option<String>,
    #[serde(default)]
    pub input: Option<Value>,
    #[serde(default)]
    pub expected_output: Option<Value>,
    #[serde(default)]
    pub required_capabilities: Vec<String>,
    #[serde(default)]
    pub capability_hints: Vec<String>,
    #[serde(default)]
    pub knowledge_bindings: Vec<Value>,
    #[serde(default)]
    pub human_review: Option<bool>,
    #[serde(default)]
    pub event_name: Option<String>,
    #[serde(default)]
    pub turn_id: Option<String>,
    #[serde(default)]
    pub provider_preference: Option<String>,
    #[serde(default)]
    pub model_preference: Option<String>,
    #[serde(default)]
    pub queue_if_busy: Option<bool>,
    #[serde(default)]
    pub skip_pre_submit_resume: Option<bool>,
    #[serde(default)]
    pub run_start_hooks: Option<bool>,
    #[serde(default)]
    pub metadata: Option<Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppRuntimeStartTaskResult {
    pub app_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entry_key: Option<String>,
    pub task_id: String,
    pub trace_id: String,
    pub task_kind: String,
    pub session_id: String,
    pub turn_id: String,
    pub event_name: String,
    pub status: String,
    pub submitted_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppRuntimeCancelTaskRequest {
    pub app_id: String,
    pub task_id: String,
    pub session_id: String,
    #[serde(default)]
    pub turn_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppRuntimeCancelTaskResult {
    pub app_id: String,
    pub task_id: String,
    pub session_id: String,
    pub cancelled: bool,
    pub status: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppRuntimeGetTaskRequest {
    pub app_id: String,
    pub task_id: String,
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppRuntimeTaskEvent {
    pub id: String,
    pub event_type: String,
    pub status: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub severity: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub evidence_ref: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub artifact_ref: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub occurred_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload: Option<Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppRuntimeTaskSnapshot {
    pub app_id: String,
    pub task_id: String,
    pub session_id: String,
    pub status: String,
    pub task_status: String,
    pub task_events: Vec<AgentAppRuntimeTaskEvent>,
    pub thread_read: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppRuntimeSubmitHostResponseRequest {
    pub app_id: String,
    pub task_id: String,
    pub runtime_request: AgentRuntimeRespondActionRequest,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppRuntimeSubmitHostResponseResult {
    pub app_id: String,
    pub task_id: String,
    pub status: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct AgentAppRuntimeModelPreference {
    provider_preference: String,
    model_preference: String,
    source: &'static str,
}

fn non_empty(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(str::to_string)
}

fn new_agent_app_runtime_session_id() -> String {
    format!("{}{}", AGENT_APP_RUNTIME_SESSION_ID_PREFIX, Uuid::new_v4())
}

fn agent_app_runtime_event_name(app_id: &str, task_id: &str) -> String {
    format!("{AGENT_APP_RUNTIME_EVENT_PREFIX}:{app_id}:{task_id}")
}

fn require_text(value: Option<&str>, label: &str) -> Result<String, String> {
    non_empty(value).ok_or_else(|| format!("{label} 不能为空"))
}

fn is_unconfigured_model_preference(value: &str) -> bool {
    matches!(
        value.trim().to_ascii_lowercase().as_str(),
        "" | "unconfigured" | "unknown" | "none" | "null"
    )
}

fn model_preference_from_values(
    provider_preference: Option<String>,
    model_preference: Option<String>,
    source: &'static str,
) -> Option<AgentAppRuntimeModelPreference> {
    let provider_preference = provider_preference
        .and_then(|value| non_empty(Some(value.as_str())))
        .filter(|value| !is_unconfigured_model_preference(value))?;
    let model_preference = model_preference
        .and_then(|value| non_empty(Some(value.as_str())))
        .filter(|value| !is_unconfigured_model_preference(value))?;

    Some(AgentAppRuntimeModelPreference {
        provider_preference,
        model_preference,
        source,
    })
}

fn json_pointer_string(value: &Value, pointers: &[&str]) -> Option<String> {
    pointers.iter().find_map(|pointer| {
        value
            .pointer(pointer)
            .and_then(Value::as_str)
            .and_then(|value| non_empty(Some(value)))
    })
}

fn model_preference_from_run_metadata(metadata: &Value) -> Option<AgentAppRuntimeModelPreference> {
    let provider_preference = json_pointer_string(
        metadata,
        &[
            "/turn_input/provider_routing/provider_selector",
            "/turnInput/providerRouting/providerSelector",
            "/request_metadata/lime_runtime/routing_decision/selected_provider",
            "/request_metadata/lime_runtime/routing_decision/selectedProvider",
            "/requestMetadata/limeRuntime/routingDecision/selectedProvider",
        ],
    );
    let model_preference = json_pointer_string(
        metadata,
        &[
            "/turn_input/provider_routing/model_name",
            "/turnInput/providerRouting/modelName",
            "/request_metadata/lime_runtime/routing_decision/selected_model",
            "/request_metadata/lime_runtime/routing_decision/selectedModel",
            "/requestMetadata/limeRuntime/routingDecision/selectedModel",
        ],
    );

    model_preference_from_values(
        provider_preference,
        model_preference,
        "recent_successful_agent_run",
    )
}

fn model_preference_from_recent_successful_runs(
    db: &DbConnection,
) -> Option<AgentAppRuntimeModelPreference> {
    let runs = {
        let conn = match db.lock() {
            Ok(conn) => conn,
            Err(error) => {
                tracing::warn!(
                    "[AgentAppRuntime] 读取最近模型偏好时数据库锁定失败: {}",
                    error
                );
                return None;
            }
        };
        match AgentRunDao::list_runs(&conn, 50, 0) {
            Ok(runs) => runs,
            Err(error) => {
                tracing::warn!(
                    "[AgentAppRuntime] 读取最近 agent_runs 失败，跳过模型偏好回填: {}",
                    error
                );
                return None;
            }
        }
    };

    runs.iter()
        .filter(|run| matches!(run.status, AgentRunStatus::Success))
        .find_map(model_preference_from_agent_run)
}

fn model_preference_from_agent_run(run: &AgentRun) -> Option<AgentAppRuntimeModelPreference> {
    let metadata = run.metadata.as_deref()?;
    let metadata: Value = serde_json::from_str(metadata).ok()?;
    model_preference_from_run_metadata(&metadata)
}

fn provider_looks_non_chat_agent_runtime_candidate(provider: &ProviderWithKeys) -> bool {
    let text = [
        provider.provider.id.as_str(),
        provider.provider.name.as_str(),
        provider.provider.api_host.as_str(),
    ]
    .join(" ")
    .to_ascii_lowercase();

    text.contains("fal")
        || text.contains("codex")
        || text.contains("coding")
        || text.contains("gpt-image")
        || text.contains("gpt_images")
}

fn model_preference_from_enabled_provider_catalog(
    db: &DbConnection,
    api_key_provider_service: &ApiKeyProviderServiceState,
) -> Option<AgentAppRuntimeModelPreference> {
    let providers = match api_key_provider_service.0.get_all_providers(db) {
        Ok(providers) => providers,
        Err(error) => {
            tracing::warn!(
                "[AgentAppRuntime] 读取 API Key Providers 失败，跳过模型偏好回填: {}",
                error
            );
            return None;
        }
    };

    providers.into_iter().find_map(|provider| {
        if !provider.provider.enabled {
            return None;
        }
        if provider_looks_non_chat_agent_runtime_candidate(&provider) {
            return None;
        }
        if !provider.api_keys.iter().any(|key| key.enabled) {
            return None;
        }
        let model = provider
            .provider
            .custom_models
            .iter()
            .find_map(|model| non_empty(Some(model.as_str())))?;
        model_preference_from_values(
            Some(provider.provider.id),
            Some(model),
            "enabled_provider_custom_model",
        )
    })
}

async fn resolve_agent_app_runtime_model_preference(
    state: &AsterAgentState,
    db: &DbConnection,
    api_key_provider_service: &ApiKeyProviderServiceState,
    request: &AgentAppRuntimeStartTaskRequest,
) -> Option<AgentAppRuntimeModelPreference> {
    if let Some(preference) = model_preference_from_values(
        request.provider_preference.clone(),
        request.model_preference.clone(),
        "request",
    ) {
        return Some(preference);
    }

    if let Some(preference) = model_preference_from_recent_successful_runs(db) {
        return Some(preference);
    }

    if let Some(preference) =
        model_preference_from_enabled_provider_catalog(db, api_key_provider_service)
    {
        return Some(preference);
    }

    if let Some(config) = state.get_provider_config().await {
        if let Some(preference) = model_preference_from_values(
            config
                .provider_selector
                .clone()
                .or_else(|| Some(config.provider_name.clone())),
            Some(config.model_name.clone()),
            "current_agent_state",
        ) {
            return Some(preference);
        }
    }

    None
}

fn insert_agent_app_runtime_model_preference_metadata(
    metadata: &mut Value,
    preference: &AgentAppRuntimeModelPreference,
) {
    let Some(root) = metadata.as_object_mut() else {
        return;
    };
    let preference_value = json!({
        "provider_preference": preference.provider_preference.clone(),
        "model_preference": preference.model_preference.clone(),
        "source": preference.source,
    });

    let harness = root
        .entry("harness".to_string())
        .or_insert_with(|| json!({}));
    if let Some(harness) = harness.as_object_mut() {
        harness.insert(
            "agent_app_runtime_model_preference".to_string(),
            preference_value.clone(),
        );
        if let Some(app_runtime) = harness
            .get_mut(AGENT_APP_RUNTIME_METADATA_KEY)
            .and_then(Value::as_object_mut)
        {
            app_runtime.insert("model_preference".to_string(), preference_value.clone());
        }
    }

    if let Some(app_runtime) = root
        .get_mut(AGENT_APP_RUNTIME_METADATA_KEY)
        .and_then(Value::as_object_mut)
    {
        app_runtime.insert("model_preference".to_string(), preference_value);
    }
}

fn default_task_message(request: &AgentAppRuntimeStartTaskRequest) -> String {
    let title = non_empty(request.title.as_deref())
        .or_else(|| non_empty(request.prompt.as_deref()))
        .unwrap_or_else(|| request.task_kind.trim().to_string());
    let input = request
        .input
        .as_ref()
        .map(|value| serde_json::to_string_pretty(value).unwrap_or_else(|_| value.to_string()))
        .unwrap_or_else(|| "{}".to_string());
    let expected_output = request
        .expected_output
        .as_ref()
        .map(|value| serde_json::to_string_pretty(value).unwrap_or_else(|_| value.to_string()))
        .unwrap_or_else(|| "{}".to_string());

    [
        "【Agent App Runtime Task】".to_string(),
        format!("App: {}", request.app_id.trim()),
        format!(
            "Entry: {}",
            request.entry_key.as_deref().unwrap_or("default").trim()
        ),
        format!("TaskKind: {}", request.task_kind.trim()),
        format!("Title: {title}"),
        "".to_string(),
        "请在 Lime AgentRuntime 主链中完成这个 App 业务任务。".to_string(),
        "不要要求用户跳回通用 Chat；如需补充上下文，请通过可审计的 action / request 机制表达。"
            .to_string(),
        "".to_string(),
        "Input JSON:".to_string(),
        input,
        "".to_string(),
        "Expected Output JSON:".to_string(),
        expected_output,
    ]
    .join("\n")
}

fn expected_artifact_kind(request: &AgentAppRuntimeStartTaskRequest) -> Option<String> {
    let expected_output = request.expected_output.as_ref()?.as_object()?;
    [
        "artifactKind",
        "artifact_type",
        "artifactType",
        "kind",
        "outputKind",
    ]
    .iter()
    .filter_map(|key| expected_output.get(*key).and_then(Value::as_str))
    .find_map(|value| non_empty(Some(value)))
}

fn is_content_factory_runtime_task(request: &AgentAppRuntimeStartTaskRequest) -> bool {
    request.app_id.trim() == "content-factory-app"
        || request.task_kind.trim().starts_with("content_factory.")
}

fn build_agent_app_output_contract(request: &AgentAppRuntimeStartTaskRequest) -> Option<Value> {
    if !is_content_factory_runtime_task(request) {
        return None;
    }
    let artifact_kind = expected_artifact_kind(request)?;
    Some(json!({
        "producer": "agent_runtime_artifact_metadata",
        "artifact_kind": artifact_kind,
        "artifact_metadata_kind": CONTENT_FACTORY_WORKSPACE_PATCH_KIND,
        "patch_metadata_keys": ["contentFactoryWorkspacePatch", "workspacePatch"],
        "required_patch_fields": ["kind", "projectId"],
        "accepted_patch_fields": [
            "workspace",
            "project",
            "sceneTable",
            "contentBatch",
            "scripts",
            "imagePrompts",
            "assetPack"
        ],
    }))
}

fn build_agent_app_runtime_task_message(request: &AgentAppRuntimeStartTaskRequest) -> String {
    let prompt = non_empty(request.prompt.as_deref())
        .or_else(|| non_empty(request.title.as_deref()))
        .unwrap_or_else(|| request.task_kind.trim().to_string());
    let input = request
        .input
        .as_ref()
        .map(|value| serde_json::to_string_pretty(value).unwrap_or_else(|_| value.to_string()))
        .unwrap_or_else(|| "{}".to_string());
    let expected_output = request
        .expected_output
        .as_ref()
        .map(|value| serde_json::to_string_pretty(value).unwrap_or_else(|_| value.to_string()))
        .unwrap_or_else(|| "{}".to_string());
    let mut lines = vec![
        "【Agent App Runtime Task】".to_string(),
        format!("App: {}", request.app_id.trim()),
        format!(
            "Entry: {}",
            request.entry_key.as_deref().unwrap_or("default").trim()
        ),
        format!("TaskKind: {}", request.task_kind.trim()),
        "".to_string(),
        "Business Prompt:".to_string(),
        prompt,
        "".to_string(),
        "Runtime Boundary:".to_string(),
        "- 请在 Lime AgentRuntime 主链中完成这个 App 业务任务。".to_string(),
        "- 不要要求用户跳回通用 Chat；如需补充上下文，请通过可审计的 action / request 机制表达。"
            .to_string(),
    ];

    if let Some(contract) = build_agent_app_output_contract(request) {
        let artifact_kind = contract
            .get("artifact_kind")
            .and_then(Value::as_str)
            .unwrap_or("content_batch");
        lines.extend([
            "".to_string(),
            "Content Factory Output Contract:".to_string(),
            format!(
                "- 如果任务产出可直接物化到内容工厂项目，必须创建 artifactKind={artifact_kind} 的 artifact。"
            ),
            format!(
                "- artifact metadata 必须包含 contentFactoryWorkspacePatch 或 workspacePatch；metadata.kind 可使用 {}。",
                CONTENT_FACTORY_WORKSPACE_PATCH_KIND
            ),
            "- 不要通过 Bash、shell、脚本或直接写 .lime/artifacts 文件来伪造 artifact；最终回答应直接输出结构化 JSON。"
                .to_string(),
            "- 最终回答的顶层 JSON 必须包含 contentFactoryWorkspacePatch 或 workspacePatch，方便 Host 自动回写当前 App 页面。"
                .to_string(),
            "- patch 至少包含 kind / projectId，并按结果类型填写 sceneTable、contentBatch、scripts、imagePrompts 或 assetPack。"
                .to_string(),
            "- tools / capabilityHints 只是可选能力提示，不能把复合内容工厂任务改写成单一 research / image Skill；除非任务明确要求真实搜索或生图，否则先直接产出 workspace patch。"
                .to_string(),
            "- 不要只返回自然语言总结；结构化 patch 是 App 自动回写当前页面的事实源。".to_string(),
        ]);
    }

    lines.extend([
        "".to_string(),
        "Input JSON:".to_string(),
        input,
        "".to_string(),
        "Expected Output JSON:".to_string(),
        expected_output,
    ]);

    lines.join("\n")
}

fn insert_string_if_some(map: &mut Map<String, Value>, key: &str, value: Option<String>) {
    if let Some(value) = value.map(|item| item.trim().to_string()) {
        if !value.is_empty() {
            map.insert(key.to_string(), json!(value));
        }
    }
}

fn app_task_prompt_summary(request: &AgentAppRuntimeStartTaskRequest) -> String {
    non_empty(request.prompt.as_deref())
        .or_else(|| non_empty(request.title.as_deref()))
        .unwrap_or_else(|| default_task_message(request))
}

fn build_agent_app_capability_request_context(
    request: &AgentAppRuntimeStartTaskRequest,
    task_id: &str,
    trace_id: &str,
    descriptor: AgentAppRuntimeCapabilityDescriptor,
) -> Map<String, Value> {
    let prompt = app_task_prompt_summary(request);
    let mut context = Map::new();

    context.insert(
        "source".to_string(),
        json!(AGENT_APP_RUNTIME_CAPABILITY_SOURCE),
    );
    context.insert("capability_id".to_string(), json!(descriptor.capability_id));
    context.insert("app_id".to_string(), json!(request.app_id.trim()));
    context.insert("task_id".to_string(), json!(task_id));
    context.insert("trace_id".to_string(), json!(trace_id));
    context.insert("task_kind".to_string(), json!(request.task_kind.trim()));
    context.insert(
        "entry_source".to_string(),
        json!(AGENT_APP_RUNTIME_CAPABILITY_SOURCE),
    );
    context.insert("raw_text".to_string(), json!(prompt.clone()));
    context.insert("prompt".to_string(), json!(prompt));
    context.insert(
        "required_capabilities".to_string(),
        json!(request.required_capabilities.clone()),
    );
    context.insert(
        "capability_hints".to_string(),
        json!(request.capability_hints.clone()),
    );
    context.insert(
        "human_review".to_string(),
        json!(request.human_review.unwrap_or(false)),
    );

    insert_string_if_some(
        &mut context,
        "entry_key",
        non_empty(request.entry_key.as_deref()),
    );
    insert_string_if_some(
        &mut context,
        "workspace_id",
        non_empty(request.workspace_id.as_deref()),
    );
    insert_string_if_some(
        &mut context,
        "idempotency_key",
        non_empty(request.idempotency_key.as_deref()),
    );

    if let Some(input) = request.input.clone() {
        context.insert("input".to_string(), input);
    }
    if let Some(expected_output) = request.expected_output.clone() {
        context.insert("expected_output".to_string(), expected_output);
    }
    if !request.knowledge_bindings.is_empty() {
        context.insert(
            "knowledge_bindings".to_string(),
            json!(request.knowledge_bindings.clone()),
        );
    }

    match descriptor.context_key {
        "image_task" | "cover_task" => {
            context.insert("mode".to_string(), json!("generate"));
        }
        "research_request" | "report_request" => {
            if !context.contains_key("query") {
                let query = context
                    .get("prompt")
                    .and_then(Value::as_str)
                    .unwrap_or("请根据当前 App 任务补齐资料")
                    .to_string();
                context.insert("query".to_string(), json!(query));
            }
        }
        _ => {}
    }

    context
}

fn resolve_agent_app_runtime_capability_descriptors(
    request: &AgentAppRuntimeStartTaskRequest,
) -> Vec<AgentAppRuntimeCapabilityDescriptor> {
    resolve_capability_descriptors(
        request
            .required_capabilities
            .iter()
            .map(String::as_str)
            .chain(request.capability_hints.iter().map(String::as_str)),
    )
}

fn capability_descriptor_metadata(descriptor: AgentAppRuntimeCapabilityDescriptor) -> Value {
    json!({
        "capability_id": descriptor.capability_id,
        "skill_name": descriptor.skill_name,
        "launch_key": descriptor.launch_key,
        "context_key": descriptor.context_key,
        "default_kind": descriptor.default_kind,
    })
}

fn build_agent_app_capability_workflow_metadata(
    request: &AgentAppRuntimeStartTaskRequest,
    descriptors: &[AgentAppRuntimeCapabilityDescriptor],
    output_contract: Option<&Value>,
    inserts_primary_launch: bool,
) -> Option<Value> {
    if descriptors.is_empty() {
        return None;
    }

    Some(json!({
        "source": AGENT_APP_RUNTIME_CAPABILITY_SOURCE,
        "mode": if output_contract.is_some() {
            "composite_output_contract"
        } else if descriptors.len() > 1 {
            "multi_capability"
        } else {
            "single_capability"
        },
        "launch_policy": if inserts_primary_launch {
            "primary_skill_launch"
        } else {
            "metadata_only"
        },
        "requested_capabilities": request.required_capabilities.clone(),
        "capability_hints": request.capability_hints.clone(),
        "descriptors": descriptors
            .iter()
            .copied()
            .map(capability_descriptor_metadata)
            .collect::<Vec<_>>(),
    }))
}

fn insert_agent_app_capability_launch_metadata(
    root: &mut Map<String, Value>,
    request: &AgentAppRuntimeStartTaskRequest,
    task_id: &str,
    trace_id: &str,
    descriptor: AgentAppRuntimeCapabilityDescriptor,
) {
    let launch_context =
        build_agent_app_capability_request_context(request, task_id, trace_id, descriptor);
    let harness = root
        .entry("harness".to_string())
        .or_insert_with(|| json!({}));
    let Some(harness) = harness.as_object_mut() else {
        return;
    };

    harness.insert("allow_model_skills".to_string(), json!(true));
    let mut launch = Map::new();
    launch.insert("skill_name".to_string(), json!(descriptor.skill_name));
    launch.insert("kind".to_string(), json!(descriptor.default_kind));
    launch.insert(
        descriptor.context_key.to_string(),
        Value::Object(launch_context),
    );
    harness.insert(descriptor.launch_key.to_string(), Value::Object(launch));
}

fn should_insert_agent_app_capability_launch_metadata(
    request: &AgentAppRuntimeStartTaskRequest,
    output_contract: Option<&Value>,
) -> bool {
    // 内容工厂这类复合业务任务的 tools/capabilityHints 表示“可用能力”，
    // 不能被提升为单一 Claw Skill 启动，否则会偏离 App 的 workspace patch 产物合同。
    if is_content_factory_runtime_task(request) && output_contract.is_some() {
        return false;
    }

    true
}

fn insert_agent_app_output_contract_runtime_hints(
    harness: &mut Map<String, Value>,
    request: &AgentAppRuntimeStartTaskRequest,
    output_contract: Option<&Value>,
) {
    if !is_content_factory_runtime_task(request) || output_contract.is_none() {
        return;
    }

    // 内容工厂 patch 产出优先走直接回答 + ArtifactDocument 自动落盘，
    // 避免复合业务任务被 FullRuntime 的通用工具链带偏成读文件 / Bash / 子代理循环。
    harness
        .entry("chat_mode".to_string())
        .or_insert_with(|| json!("general"));
    harness
        .entry("session_mode".to_string())
        .or_insert_with(|| json!("general_workbench"));
}

fn push_task_event(
    events: &mut Vec<AgentAppRuntimeTaskEvent>,
    event_type: &str,
    status: &str,
    message: impl Into<String>,
    occurred_at: Option<String>,
    payload: Option<Value>,
) {
    events.push(AgentAppRuntimeTaskEvent {
        id: format!("{}:{}", event_type, events.len() + 1),
        event_type: event_type.to_string(),
        status: status.to_string(),
        message: message.into(),
        severity: None,
        turn_id: None,
        request_id: None,
        tool_name: None,
        evidence_ref: None,
        artifact_ref: None,
        occurred_at,
        payload,
    });
}

fn outcome_event_type(outcome_type: &str) -> &'static str {
    let normalized = outcome_type.to_ascii_lowercase();
    if normalized.contains("cancel") || normalized.contains("interrupt") {
        "task:cancelled"
    } else if normalized.contains("fail")
        || normalized.contains("error")
        || normalized.contains("timeout")
    {
        "task:error"
    } else {
        "task:completed"
    }
}

fn has_missing_context(context_summary: Option<&Value>) -> Option<Value> {
    let summary = context_summary?.as_object()?;
    let missing_context = summary
        .get("missing_context")
        .or_else(|| summary.get("missingContext"))?;
    if missing_context
        .as_array()
        .is_some_and(|items| !items.is_empty())
    {
        Some(missing_context.clone())
    } else {
        None
    }
}

fn is_content_factory_workspace_patch_kind(value: &str) -> bool {
    matches!(
        value.trim(),
        CONTENT_FACTORY_WORKSPACE_PATCH_KIND
            | "contentFactoryWorkspacePatch"
            | "workspace_patch"
            | "workspacePatch"
    )
}

fn has_content_factory_workspace_patch_fields(value: &Value) -> bool {
    value.as_object().is_some_and(|object| {
        object.contains_key("workspace")
            || object.contains_key("project")
            || object.contains_key("sceneTable")
            || object.contains_key("contentBatch")
            || object.contains_key("scripts")
            || object.contains_key("imagePrompts")
            || object.contains_key("assetPack")
    })
}

fn extract_content_factory_workspace_patch(metadata: Option<&Value>) -> Option<Value> {
    let metadata = metadata?;
    for key in ["contentFactoryWorkspacePatch", "workspacePatch"] {
        if let Some(value) = metadata.get(key) {
            if has_content_factory_workspace_patch_fields(value) {
                return Some(value.clone());
            }
        }
    }

    let artifact_kind = metadata
        .get("artifactType")
        .or_else(|| metadata.get("artifact_type"))
        .or_else(|| metadata.get("kind"))
        .or_else(|| metadata.get("outputKind"))
        .and_then(Value::as_str);
    if artifact_kind.is_some_and(is_content_factory_workspace_patch_kind)
        && has_content_factory_workspace_patch_fields(metadata)
    {
        return Some(metadata.clone());
    }

    None
}

fn parse_json_object_from_markdown(value: &str) -> Option<Value> {
    let trimmed = value.trim();
    let candidate = if trimmed.starts_with("```") {
        let without_opening = trimmed.lines().skip(1).collect::<Vec<_>>().join("\n");
        without_opening
            .rsplit_once("```")
            .map(|(body, _)| body.trim().to_string())
            .unwrap_or(without_opening)
    } else {
        trimmed.to_string()
    };

    serde_json::from_str::<Value>(&candidate).ok().or_else(|| {
        let start = candidate.find('{')?;
        let end = candidate.rfind('}')?;
        serde_json::from_str::<Value>(&candidate[start..=end]).ok()
    })
}

fn extract_content_factory_workspace_patch_from_artifact_document(
    metadata: Option<&Value>,
) -> Option<Value> {
    let metadata = metadata?;
    let artifact_document = metadata
        .get("artifactDocument")
        .or_else(|| metadata.get("artifact_document"))?;
    let blocks = artifact_document.get("blocks")?.as_array()?;

    blocks.iter().find_map(|block| {
        let text = block
            .get("content")
            .or_else(|| block.get("markdown"))
            .and_then(Value::as_str)?;
        let parsed = parse_json_object_from_markdown(text)?;
        extract_content_factory_workspace_patch(Some(&parsed))
    })
}

fn build_artifact_event_payload(artifact: &AgentRuntimeThreadArtifactView) -> Option<Value> {
    let artifact_value = serde_json::to_value(artifact).ok()?;
    let workspace_patch = extract_content_factory_workspace_patch(artifact.metadata.as_ref())
        .or_else(|| {
            extract_content_factory_workspace_patch_from_artifact_document(
                artifact.metadata.as_ref(),
            )
        });
    if let Some(workspace_patch) = workspace_patch {
        return Some(json!({
            "artifact": artifact_value,
            "workspacePatch": workspace_patch,
            "contentFactoryWorkspacePatch": workspace_patch,
            "producer": "agent_runtime_artifact_metadata",
        }));
    }
    Some(artifact_value)
}

fn build_agent_app_runtime_task_events(
    thread_read: &AgentRuntimeThreadReadModel,
) -> Vec<AgentAppRuntimeTaskEvent> {
    let mut events = Vec::new();

    for queued_turn in &thread_read.queued_turns {
        push_task_event(
            &mut events,
            "task:queued",
            "queued",
            queued_turn.message_preview.clone(),
            None,
            serde_json::to_value(queued_turn).ok(),
        );
    }

    let status_message = match thread_read.profile_status.as_str() {
        "idle" => "任务已接收，等待 AgentRuntime 调度或回写进度".to_string(),
        "queued" => "任务已进入队列".to_string(),
        "running" => "任务正在执行".to_string(),
        "blocked" => "任务等待用户或权限响应".to_string(),
        "completed" => "任务已完成".to_string(),
        "failed" => "任务执行失败".to_string(),
        "cancelled" => "任务已取消".to_string(),
        _ => format!("任务状态：{}", thread_read.status),
    };
    push_task_event(
        &mut events,
        "task:progress",
        thread_read.profile_status.as_str(),
        status_message,
        thread_read.updated_at.clone(),
        Some(json!({
            "thread_id": thread_read.thread_id.clone(),
            "active_turn_id": thread_read.active_turn_id.clone(),
            "profile_status": thread_read.profile_status.clone(),
            "status": thread_read.status.clone(),
        })),
    );

    for pending_request in &thread_read.pending_requests {
        let message = pending_request
            .title
            .clone()
            .unwrap_or_else(|| "任务等待 Host / 用户响应".to_string());
        let mut event = AgentAppRuntimeTaskEvent {
            id: format!("task:reviewRequested:{}", pending_request.id),
            event_type: "task:reviewRequested".to_string(),
            status: pending_request.status.clone(),
            message,
            severity: None,
            turn_id: pending_request.turn_id.clone(),
            request_id: Some(pending_request.id.clone()),
            tool_name: None,
            evidence_ref: None,
            artifact_ref: None,
            occurred_at: pending_request.created_at.clone(),
            payload: serde_json::to_value(pending_request).ok(),
        };
        if matches!(
            pending_request.request_type.as_str(),
            "missing_context" | "ask_user" | "elicitation"
        ) {
            event.event_type = "task:missingContextRequested".to_string();
        }
        events.push(event);
    }

    if let Some(missing_context) = has_missing_context(thread_read.context_summary.as_ref()) {
        push_task_event(
            &mut events,
            "task:missingContextRequested",
            "blocked",
            "任务需要补齐上下文",
            thread_read.updated_at.clone(),
            Some(json!({ "missing_context": missing_context })),
        );
    }

    for tool_call in &thread_read.tool_calls {
        events.push(AgentAppRuntimeTaskEvent {
            id: format!("task:toolCall:{}", tool_call.tool_call_id),
            event_type: "task:toolCall".to_string(),
            status: tool_call.status.clone(),
            message: format!("工具 {} {}", tool_call.tool_name, tool_call.status),
            severity: if tool_call.success == Some(false) {
                Some("warning".to_string())
            } else {
                None
            },
            turn_id: Some(tool_call.turn_id.clone()),
            request_id: None,
            tool_name: Some(tool_call.tool_name.clone()),
            evidence_ref: None,
            artifact_ref: None,
            occurred_at: None,
            payload: serde_json::to_value(tool_call).ok(),
        });
    }

    for artifact in &thread_read.artifacts {
        let payload = build_artifact_event_payload(artifact);
        events.push(AgentAppRuntimeTaskEvent {
            id: format!("artifact:created:{}", artifact.item_id),
            event_type: "artifact:created".to_string(),
            status: artifact.status.clone(),
            message: artifact
                .title
                .clone()
                .unwrap_or_else(|| format!("Artifact 已创建：{}", artifact.path)),
            severity: (artifact.status == "failed").then(|| "error".to_string()),
            turn_id: Some(artifact.turn_id.clone()),
            request_id: None,
            tool_name: None,
            evidence_ref: None,
            artifact_ref: Some(artifact.path.clone()),
            occurred_at: artifact
                .completed_at
                .clone()
                .or_else(|| artifact.updated_at.clone())
                .or_else(|| artifact.created_at.clone()),
            payload,
        });
    }

    for evidence_ref in &thread_read.evidence_summary.evidence_refs {
        events.push(AgentAppRuntimeTaskEvent {
            id: format!("evidence:recorded:{evidence_ref}"),
            event_type: "evidence:recorded".to_string(),
            status: "recorded".to_string(),
            message: "运行证据已记录".to_string(),
            severity: None,
            turn_id: None,
            request_id: None,
            tool_name: None,
            evidence_ref: Some(evidence_ref.clone()),
            artifact_ref: None,
            occurred_at: thread_read.updated_at.clone(),
            payload: None,
        });
    }

    for (index, outcome) in thread_read
        .evidence_summary
        .verification_outcomes
        .iter()
        .enumerate()
    {
        push_task_event(
            &mut events,
            "evidence:verified",
            "verified",
            "运行证据已验证",
            thread_read.updated_at.clone(),
            Some(json!({ "index": index, "outcome": outcome })),
        );
    }

    if let Some(outcome) = &thread_read.last_outcome {
        let event_type = outcome_event_type(&outcome.outcome_type);
        events.push(AgentAppRuntimeTaskEvent {
            id: format!(
                "{}:{}",
                event_type,
                outcome.turn_id.as_deref().unwrap_or("latest")
            ),
            event_type: event_type.to_string(),
            status: outcome.outcome_type.clone(),
            message: outcome
                .summary
                .clone()
                .or_else(|| outcome.primary_cause.clone())
                .unwrap_or_else(|| "任务回合已结束".to_string()),
            severity: (event_type == "task:error").then(|| "error".to_string()),
            turn_id: outcome.turn_id.clone(),
            request_id: None,
            tool_name: None,
            evidence_ref: None,
            artifact_ref: None,
            occurred_at: outcome.ended_at.clone(),
            payload: serde_json::to_value(outcome).ok(),
        });
    }

    for incident in &thread_read.incidents {
        events.push(AgentAppRuntimeTaskEvent {
            id: format!("task:incident:{}", incident.id),
            event_type: "task:incident".to_string(),
            status: incident.status.clone(),
            message: incident.title.clone(),
            severity: Some(incident.severity.clone()),
            turn_id: incident.turn_id.clone(),
            request_id: None,
            tool_name: None,
            evidence_ref: None,
            artifact_ref: None,
            occurred_at: incident.detected_at.clone(),
            payload: serde_json::to_value(incident).ok(),
        });
    }

    events
}

fn build_agent_app_runtime_task_snapshot_event_payload(
    snapshot: &AgentAppRuntimeTaskSnapshot,
) -> Value {
    let snapshot_value = serde_json::to_value(snapshot).unwrap_or_else(|_| json!({}));
    json!({
        "type": "agent_app_runtime:taskSnapshot",
        "eventType": "task:update",
        "appId": snapshot.app_id.clone(),
        "taskId": snapshot.task_id.clone(),
        "sessionId": snapshot.session_id.clone(),
        "taskStatus": snapshot.task_status.clone(),
        "status": snapshot.status.clone(),
        "task": snapshot_value.clone(),
        "snapshot": snapshot_value,
        "taskEvents": snapshot.task_events.clone(),
        "threadRead": snapshot.thread_read.clone(),
        "emittedAt": Utc::now().to_rfc3339(),
    })
}

fn emit_agent_app_runtime_task_snapshot(app: &AppHandle, snapshot: &AgentAppRuntimeTaskSnapshot) {
    let event_name = agent_app_runtime_event_name(&snapshot.app_id, &snapshot.task_id);
    let payload = build_agent_app_runtime_task_snapshot_event_payload(snapshot);
    if let Err(error) = app.emit(&event_name, payload) {
        tracing::warn!(
            "[AgentAppRuntime] 发送 App task projection event 失败: event_name={}, error={}",
            event_name,
            error
        );
    }
}

fn build_agent_app_runtime_metadata(
    request: &AgentAppRuntimeStartTaskRequest,
    task_id: &str,
    trace_id: &str,
) -> Value {
    let mut metadata = request.metadata.clone().unwrap_or_else(|| json!({}));
    if !metadata.is_object() {
        metadata = json!({});
    }

    let mut app_runtime = json!({
        "surface": "agent_app",
        "app_id": request.app_id.trim(),
        "entry_key": request.entry_key.as_deref().unwrap_or("").trim(),
        "task_id": task_id,
        "trace_id": trace_id,
        "task_kind": request.task_kind.trim(),
        "idempotency_key": request.idempotency_key.as_deref().unwrap_or("").trim(),
        "required_capabilities": request.required_capabilities.clone(),
        "capability_hints": request.capability_hints.clone(),
        "knowledge_bindings": request.knowledge_bindings.clone(),
        "human_review": request.human_review.unwrap_or(false),
    });
    let output_contract = build_agent_app_output_contract(request);
    let capability_descriptors = resolve_agent_app_runtime_capability_descriptors(request);
    let should_insert_primary_capability_launch =
        should_insert_agent_app_capability_launch_metadata(request, output_contract.as_ref())
            && !capability_descriptors.is_empty();
    let capability_workflow = build_agent_app_capability_workflow_metadata(
        request,
        &capability_descriptors,
        output_contract.as_ref(),
        should_insert_primary_capability_launch,
    );
    if let (Some(app_runtime), Some(output_contract)) =
        (app_runtime.as_object_mut(), output_contract.clone())
    {
        app_runtime.insert("output_contract".to_string(), output_contract);
    }
    if let (Some(app_runtime), Some(capability_workflow)) =
        (app_runtime.as_object_mut(), capability_workflow.clone())
    {
        app_runtime.insert("capability_workflow".to_string(), capability_workflow);
    }

    if let Some(root) = metadata.as_object_mut() {
        root.insert(
            AGENT_APP_RUNTIME_METADATA_KEY.to_string(),
            app_runtime.clone(),
        );
        let lime_runtime = root
            .entry(LIME_RUNTIME_METADATA_KEY.to_string())
            .or_insert_with(|| json!({}));
        if let Some(lime_runtime) = lime_runtime.as_object_mut() {
            lime_runtime.insert("surface".to_string(), json!("agent_app"));
            lime_runtime.insert("app_id".to_string(), json!(request.app_id.trim()));
            lime_runtime.insert("task_id".to_string(), json!(task_id));
            lime_runtime.insert("trace_id".to_string(), json!(trace_id));
            lime_runtime.insert("task_kind".to_string(), json!(request.task_kind.trim()));
            let runtime_summary = lime_runtime
                .entry("runtime_summary".to_string())
                .or_insert_with(|| json!({}));
            if let Some(runtime_summary) = runtime_summary.as_object_mut() {
                runtime_summary.insert("surface".to_string(), json!("agent_app"));
                runtime_summary.insert("app_id".to_string(), json!(request.app_id.trim()));
                runtime_summary.insert("task_id".to_string(), json!(task_id));
                runtime_summary.insert("trace_id".to_string(), json!(trace_id));
                runtime_summary.insert("task_kind".to_string(), json!(request.task_kind.trim()));
            }
        }
        {
            let harness = root
                .entry("harness".to_string())
                .or_insert_with(|| json!({}));
            if let Some(harness) = harness.as_object_mut() {
                harness.insert(
                    AGENT_APP_RUNTIME_METADATA_KEY.to_string(),
                    app_runtime.clone(),
                );
                if let Some(output_contract) = output_contract.clone() {
                    harness.insert(
                        "agent_app_runtime_output_contract".to_string(),
                        output_contract,
                    );
                }
                insert_agent_app_output_contract_runtime_hints(
                    harness,
                    request,
                    output_contract.as_ref(),
                );
                if let Some(capability_workflow) = capability_workflow.clone() {
                    harness.insert(
                        "agent_app_runtime_capability_workflow".to_string(),
                        capability_workflow,
                    );
                }
            }
        }
        if should_insert_primary_capability_launch {
            if let Some(descriptor) = capability_descriptors.first().copied() {
                insert_agent_app_capability_launch_metadata(
                    root, request, task_id, trace_id, descriptor,
                );
            }
        }
    }

    metadata
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn agent_app_runtime_start_task(
    app: AppHandle,
    state: State<'_, AsterAgentState>,
    db: State<'_, DbConnection>,
    api_key_provider_service: State<'_, ApiKeyProviderServiceState>,
    logs: State<'_, LogState>,
    config_manager: State<'_, GlobalConfigManagerState>,
    mcp_manager: State<'_, McpManagerState>,
    automation_state: State<'_, AutomationServiceState>,
    request: AgentAppRuntimeStartTaskRequest,
) -> Result<AgentAppRuntimeStartTaskResult, String> {
    let app_id = require_text(Some(request.app_id.as_str()), "appId")?;
    let task_kind = require_text(Some(request.task_kind.as_str()), "taskKind")?;
    let workspace_id = require_text(request.workspace_id.as_deref(), "workspaceId")?;
    let task_id = non_empty(request.task_id.as_deref())
        .unwrap_or_else(|| format!("agent-app-task-{}", Uuid::new_v4()));
    let trace_id = format!("agent-app-trace-{}", Uuid::new_v4());
    let turn_id =
        non_empty(request.turn_id.as_deref()).unwrap_or_else(|| Uuid::new_v4().to_string());
    let event_name = non_empty(request.event_name.as_deref())
        .unwrap_or_else(|| agent_app_runtime_event_name(&app_id, &task_id));
    let requested_session_id = non_empty(request.session_id.as_deref());
    let model_preference = resolve_agent_app_runtime_model_preference(
        state.inner(),
        db.inner(),
        api_key_provider_service.inner(),
        &request,
    )
    .await;
    if requested_session_id.is_none() && model_preference.is_none() {
        return Err(
            "Agent App Runtime 无法解析可用模型，请先在 Lime 配置可用 AI 服务商，或由 App 传入 providerPreference / modelPreference。"
                .to_string(),
        );
    }
    let session_id = match requested_session_id {
        Some(session_id) => session_id,
        None => {
            create_runtime_session_internal_with_runtime_and_session_id(
                db.inner(),
                state.inner(),
                mcp_manager.inner(),
                new_agent_app_runtime_session_id(),
                None,
                workspace_id.clone(),
                non_empty(request.title.as_deref())
                    .or_else(|| Some(format!("Agent App · {task_kind}"))),
                Some(AsterExecutionStrategy::Auto),
                request.run_start_hooks.unwrap_or(true),
            )
            .await?
        }
    };
    let mut metadata = build_agent_app_runtime_metadata(&request, &task_id, &trace_id);
    if let Some(model_preference) = model_preference.as_ref() {
        insert_agent_app_runtime_model_preference_metadata(&mut metadata, model_preference);
    }
    let message = build_agent_app_runtime_task_message(&request);
    let runtime_request = AsterChatRequest {
        message,
        session_id: session_id.clone(),
        event_name: event_name.clone(),
        images: None,
        provider_config: None,
        provider_preference: model_preference
            .as_ref()
            .map(|preference| preference.provider_preference.clone()),
        model_preference: model_preference
            .as_ref()
            .map(|preference| preference.model_preference.clone()),
        thinking_enabled: None,
        approval_policy: None,
        sandbox_policy: None,
        project_id: None,
        workspace_id,
        web_search: None,
        search_mode: None,
        execution_strategy: Some(AsterExecutionStrategy::Auto),
        auto_continue: None,
        system_prompt: None,
        metadata: Some(metadata),
        turn_id: Some(turn_id.clone()),
        queue_if_busy: Some(request.queue_if_busy.unwrap_or(true)),
        queued_turn_id: Some(format!("agent-app-queued-{task_id}")),
    };

    let queued_task = build_queued_turn_task(runtime_request)?;
    let runtime = RuntimeCommandContext::new(
        app,
        state.inner(),
        db.inner(),
        api_key_provider_service.inner(),
        logs.inner(),
        config_manager.inner(),
        mcp_manager.inner(),
        automation_state.inner(),
    );
    runtime
        .submit_runtime_turn(
            queued_task,
            request.queue_if_busy.unwrap_or(true),
            request.skip_pre_submit_resume.unwrap_or(false),
        )
        .await?;

    Ok(AgentAppRuntimeStartTaskResult {
        app_id,
        entry_key: request
            .entry_key
            .and_then(|value| non_empty(Some(value.as_str()))),
        task_id,
        trace_id,
        task_kind,
        session_id,
        turn_id,
        event_name,
        status: "accepted".to_string(),
        submitted_at: Utc::now().to_rfc3339(),
    })
}

#[tauri::command]
pub async fn agent_app_runtime_cancel_task(
    app: AppHandle,
    state: State<'_, AsterAgentState>,
    request: AgentAppRuntimeCancelTaskRequest,
) -> Result<AgentAppRuntimeCancelTaskResult, String> {
    let cancelled = agent_runtime_interrupt_turn(
        app,
        state,
        AgentRuntimeInterruptTurnRequest {
            session_id: request.session_id.clone(),
            turn_id: request.turn_id.clone(),
        },
    )
    .await?;

    Ok(AgentAppRuntimeCancelTaskResult {
        app_id: request.app_id,
        task_id: request.task_id,
        session_id: request.session_id,
        cancelled,
        status: (if cancelled {
            "cancelled"
        } else {
            "not_running"
        })
        .to_string(),
    })
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn agent_app_runtime_get_task(
    app: AppHandle,
    state: State<'_, AsterAgentState>,
    db: State<'_, DbConnection>,
    api_key_provider_service: State<'_, ApiKeyProviderServiceState>,
    logs: State<'_, LogState>,
    config_manager: State<'_, GlobalConfigManagerState>,
    mcp_manager: State<'_, McpManagerState>,
    automation_state: State<'_, AutomationServiceState>,
    request: AgentAppRuntimeGetTaskRequest,
) -> Result<AgentAppRuntimeTaskSnapshot, String> {
    let app_handle = app.clone();
    let thread_read = agent_runtime_get_thread_read(
        app,
        state,
        db,
        api_key_provider_service,
        logs,
        config_manager,
        mcp_manager,
        automation_state,
        request.session_id.clone(),
    )
    .await?;
    let task_status = thread_read.profile_status.clone();
    let task_events = build_agent_app_runtime_task_events(&thread_read);
    let thread_read_value = serde_json::to_value(&thread_read)
        .map_err(|error| format!("序列化 AgentRuntimeThreadReadModel 失败: {error}"))?;

    let snapshot = AgentAppRuntimeTaskSnapshot {
        app_id: request.app_id,
        task_id: request.task_id,
        session_id: request.session_id,
        status: "thread_read_available".to_string(),
        task_status,
        task_events,
        thread_read: thread_read_value,
    };
    emit_agent_app_runtime_task_snapshot(&app_handle, &snapshot);
    Ok(snapshot)
}

#[tauri::command]
pub async fn agent_app_runtime_submit_host_response(
    app: AppHandle,
    state: State<'_, AsterAgentState>,
    db: State<'_, DbConnection>,
    request: AgentAppRuntimeSubmitHostResponseRequest,
) -> Result<AgentAppRuntimeSubmitHostResponseResult, String> {
    agent_runtime_respond_action(app, state, db, request.runtime_request).await?;

    Ok(AgentAppRuntimeSubmitHostResponseResult {
        app_id: request.app_id,
        task_id: request.task_id,
        status: "submitted".to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::QueuedTurnSnapshot;
    use crate::commands::aster_agent_cmd::{
        AgentRuntimeIncidentView, AgentRuntimeOutcomeView, AgentRuntimeRequestView,
        AgentRuntimeThreadArtifactView, AgentRuntimeThreadEvidenceSummary,
        AgentRuntimeThreadTelemetrySummary, AgentRuntimeThreadToolCallView,
    };

    fn runtime_request(
        required_capabilities: Vec<&str>,
        capability_hints: Vec<&str>,
    ) -> AgentAppRuntimeStartTaskRequest {
        AgentAppRuntimeStartTaskRequest {
            app_id: "content-factory-app".to_string(),
            entry_key: Some("content_factory".to_string()),
            workspace_id: Some("workspace-1".to_string()),
            session_id: None,
            task_id: None,
            task_kind: "content_factory.copy.generate".to_string(),
            idempotency_key: None,
            title: Some("生成小红书种草文案".to_string()),
            prompt: Some("围绕春季护肤新品生成文案，并补齐资料来源".to_string()),
            input: Some(json!({
                "platform": "xiaohongshu",
                "audience": "敏感肌用户"
            })),
            expected_output: Some(json!({
                "artifacts": ["copy", "assetBrief"]
            })),
            required_capabilities: required_capabilities
                .into_iter()
                .map(str::to_string)
                .collect(),
            capability_hints: capability_hints.into_iter().map(str::to_string).collect(),
            knowledge_bindings: Vec::new(),
            human_review: Some(true),
            event_name: None,
            turn_id: None,
            provider_preference: None,
            model_preference: None,
            queue_if_busy: None,
            skip_pre_submit_resume: None,
            run_start_hooks: None,
            metadata: None,
        }
    }

    fn base_thread_read() -> AgentRuntimeThreadReadModel {
        AgentRuntimeThreadReadModel {
            thread_id: "thread-1".to_string(),
            status: "running".to_string(),
            profile_status: "running".to_string(),
            active_turn_id: Some("turn-1".to_string()),
            turns: Vec::new(),
            pending_requests: Vec::new(),
            last_outcome: None,
            incidents: Vec::new(),
            queued_turns: Vec::new(),
            tool_calls: Vec::new(),
            artifacts: Vec::new(),
            model_routing: None,
            evidence_summary: AgentRuntimeThreadEvidenceSummary::default(),
            telemetry_summary: AgentRuntimeThreadTelemetrySummary::default(),
            context_summary: None,
            interrupt_state: None,
            updated_at: Some("2026-05-16T00:00:00.000Z".to_string()),
            latest_compaction_boundary: None,
            file_checkpoint_summary: None,
            diagnostics: None,
            task_kind: None,
            service_model_slot: None,
            routing_mode: None,
            decision_source: None,
            decision_reason: None,
            candidate_count: None,
            fallback_chain: None,
            capability_gap: None,
            estimated_cost_class: None,
            single_candidate_only: None,
            oem_policy: None,
            runtime_summary: None,
            auxiliary_task_runtime: None,
            limit_state: None,
            cost_state: None,
            permission_state: None,
            limit_event: None,
        }
    }

    #[test]
    fn test_agent_app_runtime_session_id_uses_hidden_prefix() {
        assert!(new_agent_app_runtime_session_id().starts_with(AGENT_APP_RUNTIME_SESSION_ID_PREFIX));
    }

    #[test]
    fn test_agent_app_runtime_model_preference_reads_recent_successful_routing_metadata() {
        let metadata = json!({
            "request_metadata": {
                "lime_runtime": {
                    "routing_decision": {
                        "selected_provider": "deepseek",
                        "selected_model": "deepseek-v4-flash"
                    }
                }
            }
        });

        let preference =
            model_preference_from_run_metadata(&metadata).expect("recent run preference");

        assert_eq!(preference.provider_preference, "deepseek");
        assert_eq!(preference.model_preference, "deepseek-v4-flash");
        assert_eq!(preference.source, "recent_successful_agent_run");
    }

    #[test]
    fn test_agent_app_runtime_metadata_maps_research_capability_to_claw_launch() {
        let request = runtime_request(
            vec!["text_generation", "lime.capability.research.search"],
            Vec::new(),
        );
        let metadata = build_agent_app_runtime_metadata(&request, "task-1", "trace-1");
        let harness = metadata
            .get("harness")
            .and_then(Value::as_object)
            .expect("harness metadata");
        let launch = harness
            .get("research_skill_launch")
            .and_then(Value::as_object)
            .expect("research launch");
        let research_request = launch
            .get("research_request")
            .and_then(Value::as_object)
            .expect("research request");
        let runtime_summary = metadata
            .get("lime_runtime")
            .and_then(|value| value.get("runtime_summary"))
            .and_then(Value::as_object)
            .expect("agent app runtime summary");

        assert_eq!(harness.get("allow_model_skills"), Some(&json!(true)));
        assert!(harness.get("agent_app_runtime").is_some());
        assert_eq!(runtime_summary.get("surface"), Some(&json!("agent_app")));
        assert_eq!(
            runtime_summary.get("app_id"),
            Some(&json!("content-factory-app"))
        );
        assert_eq!(runtime_summary.get("task_id"), Some(&json!("task-1")));
        assert_eq!(runtime_summary.get("trace_id"), Some(&json!("trace-1")));
        assert_eq!(launch.get("skill_name"), Some(&json!("research")));
        assert_eq!(launch.get("kind"), Some(&json!("research_request")));
        assert_eq!(
            research_request.get("source"),
            Some(&json!("agent_app_runtime"))
        );
        assert_eq!(
            research_request.get("app_id"),
            Some(&json!("content-factory-app"))
        );
        assert_eq!(
            research_request.get("capability_id"),
            Some(&json!("lime.capability.research.search"))
        );
        assert!(research_request.get("query").is_some());
    }

    #[test]
    fn test_agent_app_runtime_metadata_maps_image_alias_to_claw_launch() {
        let request = runtime_request(Vec::new(), vec!["image_generation"]);
        let metadata = build_agent_app_runtime_metadata(&request, "task-1", "trace-1");
        let launch = metadata
            .get("harness")
            .and_then(Value::as_object)
            .and_then(|harness| harness.get("image_skill_launch"))
            .and_then(Value::as_object)
            .expect("image launch");
        let image_task = launch
            .get("image_task")
            .and_then(Value::as_object)
            .expect("image task");

        assert_eq!(launch.get("skill_name"), Some(&json!("image_generate")));
        assert_eq!(launch.get("kind"), Some(&json!("image_task")));
        assert_eq!(image_task.get("mode"), Some(&json!("generate")));
        assert_eq!(
            image_task.get("entry_source"),
            Some(&json!("agent_app_runtime"))
        );
    }

    #[test]
    fn test_agent_app_runtime_metadata_ignores_unknown_capability_without_fake_launch() {
        let request = runtime_request(vec!["text_generation"], Vec::new());
        let metadata = build_agent_app_runtime_metadata(&request, "task-1", "trace-1");
        let harness = metadata
            .get("harness")
            .and_then(Value::as_object)
            .expect("harness metadata");

        assert!(harness.get("agent_app_runtime").is_some());
        assert!(harness.get("allow_model_skills").is_none());
        assert!(harness.get("image_skill_launch").is_none());
        assert!(harness.get("research_skill_launch").is_none());
    }

    #[test]
    fn test_agent_app_runtime_content_factory_output_contract_is_machine_readable() {
        let mut request = runtime_request(Vec::new(), Vec::new());
        request.expected_output = Some(json!({
            "artifactKind": "content_batch",
            "includes": ["copy", "script", "image_brief"]
        }));

        let metadata = build_agent_app_runtime_metadata(&request, "task-1", "trace-1");
        let harness = metadata
            .get("harness")
            .and_then(Value::as_object)
            .expect("harness metadata");
        let output_contract = harness
            .get("agent_app_runtime_output_contract")
            .and_then(Value::as_object)
            .expect("output contract");
        assert_eq!(
            output_contract.get("artifact_kind"),
            Some(&json!("content_batch"))
        );
        assert_eq!(
            output_contract.get("artifact_metadata_kind"),
            Some(&json!(CONTENT_FACTORY_WORKSPACE_PATCH_KIND))
        );
        assert!(output_contract
            .get("patch_metadata_keys")
            .and_then(Value::as_array)
            .is_some_and(|items| items.contains(&json!("contentFactoryWorkspacePatch"))));

        let message = build_agent_app_runtime_task_message(&request);
        assert!(message.contains("Content Factory Output Contract"));
        assert!(message.contains("contentFactoryWorkspacePatch"));
        assert!(message.contains("artifactKind=content_batch"));
        assert!(message.contains("不要通过 Bash"));
        assert!(message.contains("不能把复合内容工厂任务改写成单一 research / image Skill"));
    }

    #[test]
    fn test_agent_app_runtime_content_factory_output_contract_does_not_force_single_skill_launch() {
        let mut request = runtime_request(Vec::new(), vec!["research.search", "image_generation"]);
        request.expected_output = Some(json!({
            "artifactKind": "content_batch",
            "includes": ["copy", "script", "image_brief"]
        }));

        let metadata = build_agent_app_runtime_metadata(&request, "task-1", "trace-1");
        let harness = metadata
            .get("harness")
            .and_then(Value::as_object)
            .expect("harness metadata");

        assert!(harness.get("agent_app_runtime_output_contract").is_some());
        assert_eq!(harness.get("chat_mode"), Some(&json!("general")));
        assert_eq!(
            harness.get("session_mode"),
            Some(&json!("general_workbench"))
        );
        let workflow = harness
            .get("agent_app_runtime_capability_workflow")
            .and_then(Value::as_object)
            .expect("capability workflow");
        assert_eq!(
            workflow.get("mode"),
            Some(&json!("composite_output_contract"))
        );
        assert_eq!(workflow.get("launch_policy"), Some(&json!("metadata_only")));
        let descriptors = workflow
            .get("descriptors")
            .and_then(Value::as_array)
            .expect("workflow descriptors");
        assert_eq!(descriptors.len(), 2);
        assert!(descriptors
            .iter()
            .any(|descriptor| descriptor.get("capability_id")
                == Some(&json!("lime.capability.research.search"))));
        assert!(descriptors
            .iter()
            .any(|descriptor| descriptor.get("capability_id")
                == Some(&json!("lime.capability.image.generate"))));
        assert!(harness.get("allow_model_skills").is_none());
        assert!(harness.get("research_skill_launch").is_none());
        assert!(harness.get("image_skill_launch").is_none());
    }

    #[test]
    fn test_agent_app_runtime_extracts_workspace_patch_from_artifact_document_blocks() {
        let metadata = json!({
            "artifactDocument": {
                "blocks": [
                    {
                        "type": "rich_text",
                        "content": "```json\n{\"contentFactoryWorkspacePatch\":{\"kind\":\"content_batch\",\"projectId\":\"project-1\",\"contentBatch\":{\"items\":[{\"title\":\"示例文案\"}]}}}\n```"
                    }
                ]
            }
        });

        let patch = extract_content_factory_workspace_patch_from_artifact_document(Some(&metadata))
            .expect("workspace patch");

        assert_eq!(patch.get("kind"), Some(&json!("content_batch")));
        assert_eq!(patch.get("projectId"), Some(&json!("project-1")));
        assert!(patch.get("contentBatch").is_some());
    }

    #[test]
    fn test_agent_app_runtime_task_events_project_thread_read_facts() {
        let mut thread_read = base_thread_read();
        thread_read.queued_turns = vec![QueuedTurnSnapshot {
            queued_turn_id: "queued-1".to_string(),
            message_preview: "排队任务".to_string(),
            message_text: "排队任务完整文本".to_string(),
            created_at: 1_789_000_000,
            image_count: 0,
            position: 0,
        }];
        thread_read.pending_requests = vec![AgentRuntimeRequestView {
            id: "request-1".to_string(),
            thread_id: "thread-1".to_string(),
            turn_id: Some("turn-1".to_string()),
            item_id: None,
            request_type: "ask_user".to_string(),
            status: "pending".to_string(),
            title: Some("需要确认素材方向".to_string()),
            payload: Some(json!({ "question": "是否继续？" })),
            decision: None,
            scope: None,
            created_at: Some("2026-05-16T00:00:01.000Z".to_string()),
            resolved_at: None,
        }];
        thread_read.context_summary = Some(json!({
            "missing_context": [{ "field": "target_audience" }]
        }));
        thread_read.tool_calls = vec![AgentRuntimeThreadToolCallView {
            tool_call_id: "tool-1".to_string(),
            turn_id: "turn-1".to_string(),
            tool_name: "Skill(research)".to_string(),
            status: "completed".to_string(),
            success: Some(true),
            error: None,
        }];
        thread_read.artifacts = vec![AgentRuntimeThreadArtifactView {
            item_id: "artifact-item-1".to_string(),
            turn_id: "turn-1".to_string(),
            path: ".lime/artifacts/content-batch.json".to_string(),
            source: "agent_runtime".to_string(),
            status: "created".to_string(),
            artifact_type: Some("content_batch".to_string()),
            title: Some("内容批次".to_string()),
            created_at: Some("2026-05-16T00:00:01.500Z".to_string()),
            completed_at: Some("2026-05-16T00:00:01.800Z".to_string()),
            updated_at: Some("2026-05-16T00:00:01.800Z".to_string()),
            metadata: Some(json!({
                "artifactType": "content_batch",
                "workspacePatch": {
                    "kind": "content_batch",
                    "projectId": "project-1",
                    "contentBatch": { "count": 20 }
                }
            })),
        }];
        thread_read.evidence_summary = AgentRuntimeThreadEvidenceSummary {
            evidence_refs: vec!["evidence-1".to_string()],
            verification_outcomes: vec![json!({ "status": "passed" })],
        };
        thread_read.last_outcome = Some(AgentRuntimeOutcomeView {
            thread_id: "thread-1".to_string(),
            turn_id: Some("turn-1".to_string()),
            outcome_type: "completed".to_string(),
            summary: Some("任务完成".to_string()),
            primary_cause: None,
            retryable: false,
            ended_at: Some("2026-05-16T00:00:02.000Z".to_string()),
        });
        thread_read.incidents = vec![AgentRuntimeIncidentView {
            id: "incident-1".to_string(),
            thread_id: "thread-1".to_string(),
            turn_id: Some("turn-1".to_string()),
            item_id: None,
            incident_type: "provider_warning".to_string(),
            severity: "medium".to_string(),
            status: "open".to_string(),
            title: "Provider warning".to_string(),
            details: None,
            detected_at: Some("2026-05-16T00:00:03.000Z".to_string()),
            cleared_at: None,
        }];

        let events = build_agent_app_runtime_task_events(&thread_read);
        let event_types = events
            .iter()
            .map(|event| event.event_type.as_str())
            .collect::<Vec<_>>();

        assert!(event_types.contains(&"task:queued"));
        assert!(event_types.contains(&"task:progress"));
        assert!(event_types.contains(&"task:missingContextRequested"));
        assert!(event_types.contains(&"task:toolCall"));
        assert!(event_types.contains(&"artifact:created"));
        assert!(event_types.contains(&"evidence:recorded"));
        assert!(event_types.contains(&"evidence:verified"));
        assert!(event_types.contains(&"task:completed"));
        assert!(event_types.contains(&"task:incident"));
        assert!(events
            .iter()
            .any(|event| event.request_id.as_deref() == Some("request-1")));
        assert!(events
            .iter()
            .any(|event| event.evidence_ref.as_deref() == Some("evidence-1")));
        assert!(events.iter().any(
            |event| event.artifact_ref.as_deref() == Some(".lime/artifacts/content-batch.json")
        ));
        let artifact_event = events
            .iter()
            .find(|event| event.event_type == "artifact:created")
            .expect("artifact event");
        assert_eq!(
            artifact_event
                .payload
                .as_ref()
                .and_then(|payload| payload.get("contentFactoryWorkspacePatch"))
                .and_then(|patch| patch.get("contentBatch"))
                .and_then(|content_batch| content_batch.get("count")),
            Some(&json!(20))
        );
    }

    #[test]
    fn test_agent_app_runtime_task_snapshot_event_payload_is_canonical() {
        let mut thread_read = base_thread_read();
        thread_read.profile_status = "running".to_string();
        let task_events = build_agent_app_runtime_task_events(&thread_read);
        let snapshot = AgentAppRuntimeTaskSnapshot {
            app_id: "content-factory-app".to_string(),
            task_id: "task-1".to_string(),
            session_id: "session-1".to_string(),
            status: "thread_read_available".to_string(),
            task_status: thread_read.profile_status.clone(),
            task_events,
            thread_read: serde_json::to_value(&thread_read).expect("thread read value"),
        };

        let payload = build_agent_app_runtime_task_snapshot_event_payload(&snapshot);

        assert_eq!(
            payload.get("type"),
            Some(&json!("agent_app_runtime:taskSnapshot"))
        );
        assert_eq!(payload.get("eventType"), Some(&json!("task:update")));
        assert_eq!(payload.get("taskId"), Some(&json!("task-1")));
        assert_eq!(
            payload
                .get("taskEvents")
                .and_then(Value::as_array)
                .map(Vec::len),
            Some(snapshot.task_events.len())
        );
        assert!(payload.get("threadRead").is_some());
        assert!(payload.get("task").is_some());
    }

    #[test]
    fn test_agent_app_runtime_idle_status_uses_business_progress_copy() {
        let mut thread_read = base_thread_read();
        thread_read.status = "idle".to_string();
        thread_read.profile_status = "idle".to_string();
        thread_read.active_turn_id = None;

        let events = build_agent_app_runtime_task_events(&thread_read);
        let progress = events
            .iter()
            .find(|event| event.event_type == "task:progress")
            .expect("progress event");

        assert_eq!(
            progress.message,
            "任务已接收，等待 AgentRuntime 调度或回写进度"
        );
        assert_ne!(progress.message, "任务状态：idle");
    }
}
