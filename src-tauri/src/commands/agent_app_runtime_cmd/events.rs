use super::types::{AgentAppRuntimeTaskEvent, AgentAppRuntimeTaskSnapshot};
use super::{agent_app_runtime_event_name, CONTENT_FACTORY_WORKSPACE_PATCH_KIND};
use crate::commands::aster_agent_cmd::{
    AgentRuntimeThreadArtifactView, AgentRuntimeThreadReadModel,
};
use chrono::Utc;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

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

pub(super) fn extract_content_factory_workspace_patch_from_artifact_document(
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

pub(super) fn build_agent_app_runtime_task_events(
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
        let workspace_patch = payload.as_ref().and_then(|value| {
            value
                .get("contentFactoryWorkspacePatch")
                .or_else(|| value.get("workspacePatch"))
                .cloned()
        });
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
        if let Some(workspace_patch) = workspace_patch {
            let evidence_ref = format!("evidence:{}", artifact.path);
            events.push(AgentAppRuntimeTaskEvent {
                id: format!("evidence:recorded:{}", artifact.item_id),
                event_type: "evidence:recorded".to_string(),
                status: "recorded".to_string(),
                message: "内容工厂 workspace patch evidence 已记录".to_string(),
                severity: None,
                turn_id: Some(artifact.turn_id.clone()),
                request_id: None,
                tool_name: None,
                evidence_ref: Some(evidence_ref.clone()),
                artifact_ref: Some(artifact.path.clone()),
                occurred_at: artifact
                    .completed_at
                    .clone()
                    .or_else(|| artifact.updated_at.clone())
                    .or_else(|| artifact.created_at.clone()),
                payload: Some(json!({
                    "artifactRef": artifact.path.clone(),
                    "evidenceRef": evidence_ref,
                    "workspacePatch": workspace_patch.clone(),
                    "contentFactoryWorkspacePatch": workspace_patch,
                    "source": "agent_runtime_artifact_replay",
                })),
            });
        }
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

pub(super) fn build_agent_app_runtime_task_snapshot_event_payload(
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

pub(super) fn emit_agent_app_runtime_task_snapshot(
    app: &AppHandle,
    snapshot: &AgentAppRuntimeTaskSnapshot,
) {
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
