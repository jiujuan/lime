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
    create_runtime_session_internal_with_runtime, AgentRuntimeInterruptTurnRequest,
    AgentRuntimeRespondActionRequest, AgentRuntimeThreadReadModel, AsterChatRequest,
    AsterExecutionStrategy, RuntimeCommandContext,
};
use crate::config::GlobalConfigManagerState;
use crate::database::DbConnection;
use crate::mcp::McpManagerState;
use crate::services::automation_service::AutomationServiceState;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use tauri::{AppHandle, State};
use uuid::Uuid;

const AGENT_APP_RUNTIME_EVENT_PREFIX: &str = "agent_app_runtime";
const AGENT_APP_RUNTIME_METADATA_KEY: &str = "agent_app_runtime";
const LIME_RUNTIME_METADATA_KEY: &str = "lime_runtime";
const AGENT_APP_RUNTIME_CAPABILITY_SOURCE: &str = "agent_app_runtime";

#[derive(Debug, Clone, Copy)]
struct AgentAppRuntimeCapabilityDescriptor {
    capability_id: &'static str,
    aliases: &'static [&'static str],
    launch_key: &'static str,
    context_key: &'static str,
    default_kind: &'static str,
    skill_name: &'static str,
}

const AGENT_APP_RUNTIME_CAPABILITY_DESCRIPTORS: &[AgentAppRuntimeCapabilityDescriptor] = &[
    AgentAppRuntimeCapabilityDescriptor {
        capability_id: "lime.capability.image.generate",
        aliases: &[
            "lime.capability.image.generate",
            "image.generate",
            "image_generation",
            "image",
            "asset.generate",
        ],
        launch_key: "image_skill_launch",
        context_key: "image_task",
        default_kind: "image_task",
        skill_name: "image_generate",
    },
    AgentAppRuntimeCapabilityDescriptor {
        capability_id: "lime.capability.cover.generate",
        aliases: &[
            "lime.capability.cover.generate",
            "cover.generate",
            "cover_generation",
            "cover",
        ],
        launch_key: "cover_skill_launch",
        context_key: "cover_task",
        default_kind: "cover_task",
        skill_name: "cover_generate",
    },
    AgentAppRuntimeCapabilityDescriptor {
        capability_id: "lime.capability.research.search",
        aliases: &[
            "lime.capability.research.search",
            "research.search",
            "research",
            "web_search",
            "search",
        ],
        launch_key: "research_skill_launch",
        context_key: "research_request",
        default_kind: "research_request",
        skill_name: "research",
    },
    AgentAppRuntimeCapabilityDescriptor {
        capability_id: "lime.capability.report.generate",
        aliases: &[
            "lime.capability.report.generate",
            "report.generate",
            "report",
            "competitor_report",
        ],
        launch_key: "report_skill_launch",
        context_key: "report_request",
        default_kind: "report_request",
        skill_name: "report_generate",
    },
    AgentAppRuntimeCapabilityDescriptor {
        capability_id: "lime.capability.pdf.read",
        aliases: &["lime.capability.pdf.read", "pdf.read", "pdf_extract", "pdf"],
        launch_key: "pdf_read_skill_launch",
        context_key: "pdf_read_request",
        default_kind: "pdf_read_request",
        skill_name: "pdf_read",
    },
    AgentAppRuntimeCapabilityDescriptor {
        capability_id: "lime.capability.summary.generate",
        aliases: &[
            "lime.capability.summary.generate",
            "summary.generate",
            "summary",
            "text_summary",
        ],
        launch_key: "summary_skill_launch",
        context_key: "summary_request",
        default_kind: "summary_request",
        skill_name: "summary",
    },
];

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

fn non_empty(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(str::to_string)
}

fn require_text(value: Option<&str>, label: &str) -> Result<String, String> {
    non_empty(value).ok_or_else(|| format!("{label} 不能为空"))
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

fn capability_match_token(value: &str) -> String {
    value
        .trim()
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

fn descriptor_matches_capability(
    descriptor: &AgentAppRuntimeCapabilityDescriptor,
    value: &str,
) -> bool {
    let token = capability_match_token(value);
    if token.is_empty() {
        return false;
    }

    descriptor
        .aliases
        .iter()
        .any(|alias| capability_match_token(alias) == token)
}

fn resolve_primary_capability_descriptor(
    request: &AgentAppRuntimeStartTaskRequest,
) -> Option<AgentAppRuntimeCapabilityDescriptor> {
    request
        .required_capabilities
        .iter()
        .chain(request.capability_hints.iter())
        .find_map(|value| {
            AGENT_APP_RUNTIME_CAPABILITY_DESCRIPTORS
                .iter()
                .copied()
                .find(|descriptor| descriptor_matches_capability(descriptor, value))
        })
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
            occurred_at: None,
            payload: serde_json::to_value(tool_call).ok(),
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
            occurred_at: incident.detected_at.clone(),
            payload: serde_json::to_value(incident).ok(),
        });
    }

    events
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

    let app_runtime = json!({
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
            lime_runtime.insert("task_kind".to_string(), json!(request.task_kind.trim()));
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
            }
        }
        if let Some(descriptor) = resolve_primary_capability_descriptor(request) {
            insert_agent_app_capability_launch_metadata(
                root, request, task_id, trace_id, descriptor,
            );
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
        .unwrap_or_else(|| format!("{AGENT_APP_RUNTIME_EVENT_PREFIX}:{app_id}:{task_id}"));
    let session_id = match non_empty(request.session_id.as_deref()) {
        Some(session_id) => session_id,
        None => {
            create_runtime_session_internal_with_runtime(
                db.inner(),
                state.inner(),
                mcp_manager.inner(),
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
    let metadata = build_agent_app_runtime_metadata(&request, &task_id, &trace_id);
    let message =
        non_empty(request.prompt.as_deref()).unwrap_or_else(|| default_task_message(&request));
    let runtime_request = AsterChatRequest {
        message,
        session_id: session_id.clone(),
        event_name: event_name.clone(),
        images: None,
        provider_config: None,
        provider_preference: None,
        model_preference: None,
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

    Ok(AgentAppRuntimeTaskSnapshot {
        app_id: request.app_id,
        task_id: request.task_id,
        session_id: request.session_id,
        status: "thread_read_available".to_string(),
        task_status,
        task_events,
        thread_read: thread_read_value,
    })
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
        AgentRuntimeThreadEvidenceSummary, AgentRuntimeThreadTelemetrySummary,
        AgentRuntimeThreadToolCallView,
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

        assert_eq!(harness.get("allow_model_skills"), Some(&json!(true)));
        assert!(harness.get("agent_app_runtime").is_some());
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
    }
}
