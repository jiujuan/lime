use super::runtime_turn_stream::runtime_tool_name_from_result_metadata;
use super::*;

#[path = "event_projection/primary_task.rs"]
mod primary_task;

use self::primary_task::build_agent_app_runtime_event_primary_task_event;

pub(crate) trait RuntimeProjectionEventPort {
    fn emit_profile_event(
        &self,
        event_name: &str,
        event: &AgentRuntimeProfileEvent,
    ) -> Result<(), String>;

    fn emit_projection_payload(&self, event_name: &str, payload: Value) -> Result<(), String>;
}

#[derive(Clone, Copy)]
pub(crate) struct TauriRuntimeProjectionEventPort<'a> {
    app: &'a AppHandle,
}

impl<'a> TauriRuntimeProjectionEventPort<'a> {
    pub(crate) fn new(app: &'a AppHandle) -> Self {
        Self { app }
    }
}

impl RuntimeProjectionEventPort for TauriRuntimeProjectionEventPort<'_> {
    fn emit_profile_event(
        &self,
        event_name: &str,
        event: &AgentRuntimeProfileEvent,
    ) -> Result<(), String> {
        self.app
            .emit(event_name, event)
            .map_err(|error| error.to_string())
    }

    fn emit_projection_payload(&self, event_name: &str, payload: Value) -> Result<(), String> {
        self.app
            .emit(event_name, payload)
            .map_err(|error| error.to_string())
    }
}

pub(super) fn emit_runtime_events(
    event_port: &dyn crate::agent::runtime_queue_service::RuntimeQueueEventPort,
    projection_port: &dyn RuntimeProjectionEventPort,
    event_name: &str,
    events: Vec<RuntimeAgentEvent>,
) {
    for event in events {
        event_port.emit_runtime_queue_event(event_name, &event);
        emit_agent_app_runtime_event_projection_with_port(projection_port, event_name, &event);
    }
}

pub(crate) fn emit_agent_runtime_profile_event_with_port(
    projection_port: &dyn RuntimeProjectionEventPort,
    event_name: &str,
    event: AgentRuntimeProfileEvent,
) {
    if let Err(error) = projection_port.emit_profile_event(event_name, &event) {
        tracing::warn!(
            "[AsterAgent][AgentRuntimeProfile] 发送 profile 事件失败: type={}, event_name={}, error={}",
            event.event_type,
            event_name,
            error
        );
    }
    emit_agent_app_runtime_profile_projection_event_with_port(projection_port, event_name, &event);
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct AgentAppRuntimeProjectionScope {
    pub(super) app_id: String,
    pub(super) task_id: String,
}

pub(super) fn non_empty_projection_text(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

pub(super) fn parse_agent_app_runtime_projection_scope(
    event_name: &str,
) -> Option<AgentAppRuntimeProjectionScope> {
    let remainder = event_name
        .trim()
        .strip_prefix(AGENT_APP_RUNTIME_EVENT_PREFIX)?;
    let (app_id, task_id) = remainder.split_once(':')?;
    Some(AgentAppRuntimeProjectionScope {
        app_id: non_empty_projection_text(Some(app_id))?,
        task_id: non_empty_projection_text(Some(task_id))?,
    })
}

pub(super) fn agent_app_runtime_projection_event_name(
    scope: &AgentAppRuntimeProjectionScope,
) -> String {
    format!(
        "{}{}:{}",
        AGENT_APP_RUNTIME_EVENT_PREFIX, scope.app_id, scope.task_id
    )
}

pub(super) fn profile_event_payload_string(
    event: &AgentRuntimeProfileEvent,
    keys: &[&str],
) -> Option<String> {
    keys.iter().find_map(|key| {
        event
            .payload
            .get(*key)
            .and_then(Value::as_str)
            .and_then(|value| non_empty_projection_text(Some(value)))
    })
}

pub(super) fn agent_app_task_event_type_for_profile_event(event_type: &str) -> &'static str {
    match event_type {
        "turn.submitted" | "task.retrying" => "task:queued",
        "tool.started" | "tool.result" | "tool.failed" => "task:toolCall",
        "action.required" => "task:reviewRequested",
        "action.resolved" => "task:reviewResolved",
        "turn.completed" | "task.completed" => "task:completed",
        "turn.failed" | "task.failed" | "model.failed" | "routing.not_possible" => "task:error",
        _ => "task:progress",
    }
}

pub(super) fn agent_app_task_status_for_profile_event(event: &AgentRuntimeProfileEvent) -> String {
    profile_event_payload_string(event, &["status"]).unwrap_or_else(|| {
        match event.event_type.as_str() {
            "turn.submitted" | "task.retrying" => "queued",
            "turn.started" | "tool.started" | "model.requested" | "task.attempt.started" => {
                "running"
            }
            "turn.completed" | "task.completed" | "tool.result" | "model.completed" => "completed",
            "turn.failed" | "task.failed" | "tool.failed" | "model.failed" => "failed",
            _ => "updated",
        }
        .to_string()
    })
}

pub(super) fn agent_app_task_message_for_profile_event(event: &AgentRuntimeProfileEvent) -> String {
    if let Some(message) = profile_event_payload_string(event, &["message", "detail", "title"]) {
        return message;
    }

    match event.event_type.as_str() {
        "turn.submitted" => "AgentRuntime 已接收 App 任务",
        "turn.started" => "AgentRuntime 正在执行 App 任务",
        "turn.completed" => "AgentRuntime App 任务已完成",
        "turn.failed" => "AgentRuntime App 任务执行失败",
        "tool.started" => "AgentRuntime 工具调用开始",
        "tool.result" => "AgentRuntime 工具调用完成",
        "tool.failed" => "AgentRuntime 工具调用失败",
        "action.required" => "AgentRuntime 等待 Host / 用户响应",
        "action.resolved" => "Host / 用户响应已提交到 AgentRuntime",
        "snapshot.updated" => "AgentRuntime 线程读模型已更新",
        _ => "AgentRuntime App 任务状态已更新",
    }
    .to_string()
}

pub(super) fn build_agent_app_runtime_profile_task_event(
    event: &AgentRuntimeProfileEvent,
) -> Value {
    let status = agent_app_task_status_for_profile_event(event);
    let mut task_event = serde_json::Map::new();
    task_event.insert(
        "id".to_string(),
        json!(format!("profile:{}:{}", event.event_type, event.sequence)),
    );
    task_event.insert(
        "eventType".to_string(),
        json!(agent_app_task_event_type_for_profile_event(
            &event.event_type
        )),
    );
    task_event.insert("status".to_string(), json!(status));
    task_event.insert(
        "message".to_string(),
        json!(agent_app_task_message_for_profile_event(event)),
    );
    task_event.insert("turnId".to_string(), json!(event.turn_id.clone()));
    task_event.insert("occurredAt".to_string(), json!(event.timestamp.clone()));
    task_event.insert("payload".to_string(), json!(event));

    if let Some(tool_name) = profile_event_payload_string(event, &["toolName", "tool_name"]) {
        task_event.insert("toolName".to_string(), json!(tool_name));
    }
    if let Some(request_id) =
        profile_event_payload_string(event, &["actionId", "requestId", "decisionId"])
    {
        task_event.insert("requestId".to_string(), json!(request_id));
    }
    if matches!(
        agent_app_task_event_type_for_profile_event(&event.event_type),
        "task:error"
    ) {
        task_event.insert("severity".to_string(), json!("error"));
    }

    Value::Object(task_event)
}

pub(super) fn build_agent_app_runtime_profile_projection_payload(
    event_name: &str,
    event: &AgentRuntimeProfileEvent,
) -> Option<Value> {
    let scope = parse_agent_app_runtime_projection_scope(event_name)?;
    let status = agent_app_task_status_for_profile_event(event);
    let task_event = build_agent_app_runtime_profile_task_event(event);
    let projection_event_name = agent_app_runtime_projection_event_name(&scope);

    Some(json!({
        "type": "agent_app_runtime:profileProjection",
        "eventType": "task:runtimeEvent",
        "appId": scope.app_id.clone(),
        "taskId": scope.task_id.clone(),
        "sessionId": event.session_id,
        "threadId": event.thread_id,
        "turnId": event.turn_id,
        "status": status,
        "profileEvent": event,
        "runtimeEvent": event,
        "taskEvents": [task_event],
        "runtimeEventName": projection_event_name,
        "emittedAt": chrono::Utc::now().to_rfc3339(),
    }))
}

pub(super) fn emit_agent_app_runtime_profile_projection_event_with_port(
    projection_port: &dyn RuntimeProjectionEventPort,
    event_name: &str,
    event: &AgentRuntimeProfileEvent,
) {
    let Some(scope) = parse_agent_app_runtime_projection_scope(event_name) else {
        return;
    };
    let Some(payload) = build_agent_app_runtime_profile_projection_payload(event_name, event)
    else {
        return;
    };
    let projection_event_name = agent_app_runtime_projection_event_name(&scope);
    if let Err(error) = projection_port.emit_projection_payload(&projection_event_name, payload) {
        tracing::warn!(
            "[AsterAgent][AgentRuntimeProfile] 发送 Agent App task projection 失败: event_name={}, profile_type={}, error={}",
            projection_event_name,
            event.event_type,
            error
        );
    }
}

pub(super) fn runtime_event_payload_value(event: &RuntimeAgentEvent) -> Value {
    serde_json::to_value(event).unwrap_or_else(|_| json!({ "type": "runtime_event" }))
}

pub(super) fn runtime_workspace_patch_from_metadata_value(
    metadata: Option<&Value>,
) -> Option<Value> {
    let metadata = metadata?.as_object()?;
    ["contentFactoryWorkspacePatch", "workspacePatch"]
        .iter()
        .filter_map(|key| metadata.get(*key))
        .find(|value| value.is_object())
        .cloned()
}

pub(super) fn runtime_workspace_patch_from_metadata_map(
    metadata: Option<&HashMap<String, Value>>,
) -> Option<Value> {
    let metadata = metadata?;
    ["contentFactoryWorkspacePatch", "workspacePatch"]
        .iter()
        .filter_map(|key| metadata.get(*key))
        .find(|value| value.is_object())
        .cloned()
}

pub(super) fn build_runtime_projection_task_event(
    id: String,
    event_type: &'static str,
    status: impl Into<String>,
    message: impl Into<String>,
    payload: Value,
) -> serde_json::Map<String, Value> {
    let mut task_event = serde_json::Map::new();
    task_event.insert("id".to_string(), json!(id));
    task_event.insert("eventType".to_string(), json!(event_type));
    task_event.insert("status".to_string(), json!(status.into()));
    task_event.insert("message".to_string(), json!(message.into()));
    task_event.insert("payload".to_string(), payload);
    task_event
}

pub(super) fn runtime_projection_stream_event_id(prefix: &str, text: &str) -> String {
    let mut hasher = DefaultHasher::new();
    prefix.hash(&mut hasher);
    text.hash(&mut hasher);
    chrono::Utc::now()
        .timestamp_nanos_opt()
        .unwrap_or_default()
        .hash(&mut hasher);
    format!("{prefix}:{:x}", hasher.finish())
}

pub(super) fn build_runtime_projection_stream_task_event(
    id_prefix: &'static str,
    event_type: &'static str,
    stream_kind: &'static str,
    status: &'static str,
    text: &str,
    runtime_event: Value,
) -> Option<Value> {
    if text.is_empty() {
        return None;
    }
    let mut payload = serde_json::Map::new();
    payload.insert("streamKind".to_string(), json!(stream_kind));
    payload.insert("delta".to_string(), json!(text));
    payload.insert("runtimeEvent".to_string(), runtime_event);
    let mut task_event = build_runtime_projection_task_event(
        runtime_projection_stream_event_id(id_prefix, text),
        event_type,
        status,
        text,
        Value::Object(payload),
    );
    task_event.insert("streamKind".to_string(), json!(stream_kind));
    Some(Value::Object(task_event))
}

pub(super) fn build_runtime_projection_artifact_task_event(
    id: String,
    status: impl Into<String>,
    message: impl Into<String>,
    artifact_ref: String,
    artifact_payload: Value,
    workspace_patch: Option<Value>,
) -> Value {
    let mut payload = serde_json::Map::new();
    payload.insert("artifact".to_string(), artifact_payload);
    if let Some(workspace_patch) = workspace_patch {
        payload.insert("workspacePatch".to_string(), workspace_patch.clone());
        payload.insert("contentFactoryWorkspacePatch".to_string(), workspace_patch);
    }

    let mut task_event = build_runtime_projection_task_event(
        id,
        "artifact:created",
        status,
        message,
        Value::Object(payload),
    );
    task_event.insert("artifactRef".to_string(), json!(artifact_ref));
    Value::Object(task_event)
}

pub(super) fn build_runtime_projection_tool_task_event(
    id: String,
    status: impl Into<String>,
    message: impl Into<String>,
    tool_name: Option<String>,
    payload: Value,
    failed: bool,
) -> Value {
    let mut task_event =
        build_runtime_projection_task_event(id, "task:toolCall", status, message, payload);
    if let Some(tool_name) = tool_name {
        task_event.insert("toolName".to_string(), json!(tool_name));
    }
    if failed {
        task_event.insert("severity".to_string(), json!("error"));
    }
    Value::Object(task_event)
}

pub(super) fn build_runtime_projection_evidence_task_events(runtime_event: &Value) -> Vec<Value> {
    let summary = collect_runtime_evidence_projection_summary_from_value(runtime_event);
    build_runtime_projection_evidence_task_events_from_summary(runtime_event, summary)
}

pub(super) fn build_runtime_projection_evidence_task_events_from_summary(
    runtime_event: &Value,
    summary: RuntimeEvidenceProjectionSummary,
) -> Vec<Value> {
    let mut events = Vec::new();
    for evidence_ref in summary.evidence_refs {
        let evidence_ref_for_payload = evidence_ref.clone();
        let mut task_event = build_runtime_projection_task_event(
            format!("runtime:evidence:recorded:{evidence_ref}"),
            "evidence:recorded",
            "recorded",
            "运行证据已记录",
            json!({
                "evidenceRef": evidence_ref_for_payload,
                "runtimeEvent": runtime_event,
            }),
        );
        task_event.insert("evidenceRef".to_string(), json!(evidence_ref));
        events.push(Value::Object(task_event));
    }

    for (index, outcome) in summary.verification_outcomes.into_iter().enumerate() {
        let status = outcome
            .get("status")
            .or_else(|| outcome.get("outcome"))
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .unwrap_or("verified")
            .to_string();
        let mut task_event = build_runtime_projection_task_event(
            format!("runtime:evidence:verified:{index}"),
            "evidence:verified",
            status.clone(),
            "运行证据已验证",
            json!({
                "outcome": outcome,
                "runtimeEvent": runtime_event,
            }),
        );
        let normalized_status = status.to_ascii_lowercase();
        if normalized_status.contains("fail")
            || normalized_status.contains("blocking")
            || normalized_status.contains("error")
        {
            task_event.insert("severity".to_string(), json!("error"));
        }
        events.push(Value::Object(task_event));
    }

    events
}

pub(super) fn build_agent_app_runtime_event_task_events(event: &RuntimeAgentEvent) -> Vec<Value> {
    let runtime_event = runtime_event_payload_value(event);
    let mut task_events = Vec::new();
    if let Some(task_event) =
        build_agent_app_runtime_event_primary_task_event(event, runtime_event.clone())
    {
        task_events.push(task_event);
    }
    task_events.extend(build_runtime_projection_evidence_task_events(
        &runtime_event,
    ));
    task_events
}

pub(super) fn build_agent_app_runtime_event_projection_payload(
    event_name: &str,
    event: &RuntimeAgentEvent,
) -> Option<Value> {
    let scope = parse_agent_app_runtime_projection_scope(event_name)?;
    let task_events = build_agent_app_runtime_event_task_events(event);
    if task_events.is_empty() {
        return None;
    }
    let status = task_events
        .first()
        .and_then(|task_event| task_event.get("status").and_then(Value::as_str))
        .unwrap_or("updated")
        .to_string();
    let projection_event_name = agent_app_runtime_projection_event_name(&scope);

    Some(json!({
        "type": "agent_app_runtime:runtimeEventProjection",
        "eventType": "task:runtimeEvent",
        "appId": scope.app_id.clone(),
        "taskId": scope.task_id.clone(),
        "status": status,
        "runtimeEvent": event,
        "taskEvents": task_events,
        "runtimeEventName": projection_event_name,
        "emittedAt": chrono::Utc::now().to_rfc3339(),
    }))
}

pub(super) fn emit_agent_app_runtime_event_projection_with_port(
    projection_port: &dyn RuntimeProjectionEventPort,
    event_name: &str,
    event: &RuntimeAgentEvent,
) {
    let Some(scope) = parse_agent_app_runtime_projection_scope(event_name) else {
        return;
    };
    let Some(payload) = build_agent_app_runtime_event_projection_payload(event_name, event) else {
        return;
    };
    let projection_event_name = agent_app_runtime_projection_event_name(&scope);
    if let Err(error) = projection_port.emit_projection_payload(&projection_event_name, payload) {
        tracing::warn!(
            "[AsterAgent] 发送 Agent App runtime event projection 失败: event_name={}, error={}",
            projection_event_name,
            error
        );
    }
}
