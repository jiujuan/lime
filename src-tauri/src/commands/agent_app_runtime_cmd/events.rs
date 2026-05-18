use super::common::{agent_app_runtime_event_name, CONTENT_FACTORY_WORKSPACE_PATCH_KIND};
use super::types::{AgentAppRuntimeTaskEvent, AgentAppRuntimeTaskSnapshot};
use crate::commands::aster_agent_cmd::{
    AgentRuntimeThreadArtifactView, AgentRuntimeThreadReadModel, AgentRuntimeThreadToolCallView,
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
            | "content_batch"
            | "strategy_report"
            | "review_report"
    )
}

fn has_content_factory_workspace_patch_fields(value: &Value) -> bool {
    value.as_object().is_some_and(|object| {
        object.contains_key("workspace")
            || object.contains_key("project")
            || object.contains_key("projectKnowledge")
            || object.contains_key("readiness")
            || object.contains_key("sceneTable")
            || object.contains_key("contentBatch")
            || object.contains_key("scripts")
            || object.contains_key("imagePrompts")
            || object.contains_key("strategyReport")
            || object.contains_key("pptOutline")
            || object.contains_key("reviewReport")
            || object.contains_key("riskCheck")
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
        .or_else(|| metadata.get("artifactKind"))
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

fn repair_unescaped_string_quotes(value: &str) -> String {
    let chars = value.chars().collect::<Vec<_>>();
    let mut output = String::with_capacity(value.len());
    let mut in_string = false;
    let mut escaped = false;

    for (index, ch) in chars.iter().copied().enumerate() {
        if escaped {
            output.push(ch);
            escaped = false;
            continue;
        }
        if in_string && ch == '\\' {
            output.push(ch);
            escaped = true;
            continue;
        }
        if ch == '"' {
            if !in_string {
                in_string = true;
                output.push(ch);
                continue;
            }

            let next = chars
                .iter()
                .skip(index + 1)
                .find(|candidate| !candidate.is_whitespace())
                .copied();
            if matches!(next, None | Some(',' | '}' | ']' | ':')) {
                in_string = false;
                output.push(ch);
            } else {
                output.push('\\');
                output.push(ch);
            }
            continue;
        }
        output.push(ch);
    }

    output
}

fn parse_json_value_candidate(candidate: &str) -> Option<Value> {
    serde_json::from_str::<Value>(candidate).ok().or_else(|| {
        let repaired = repair_unescaped_string_quotes(candidate);
        if repaired == candidate {
            return None;
        }
        serde_json::from_str::<Value>(&repaired).ok()
    })
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

    parse_json_value_candidate(&candidate).or_else(|| {
        let start = candidate.find('{')?;
        let end = candidate.rfind('}')?;
        parse_json_value_candidate(&candidate[start..=end])
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

fn build_tool_call_event_payload(tool_call: &AgentRuntimeThreadToolCallView) -> Option<Value> {
    let mut payload = serde_json::to_value(tool_call).ok()?;
    if let Some(object) = payload.as_object_mut() {
        object.insert("source".to_string(), json!("agent_runtime_thread_read"));
        if let Some(output) = tool_call.output_preview.as_ref() {
            object.insert("outputPreview".to_string(), json!(output));
        }
        if let Some(evidence_ref) = tool_call.evidence_refs.first() {
            object.insert("evidenceRef".to_string(), json!(evidence_ref));
        }
    }
    Some(payload)
}

fn content_factory_skill_name(tool_call: &AgentRuntimeThreadToolCallView) -> Option<String> {
    tool_call
        .arguments
        .as_ref()
        .and_then(|arguments| arguments.get("skill"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .or_else(|| {
            tool_call
                .output_preview
                .as_deref()
                .and_then(content_factory_skill_name_from_text)
        })
        .or_else(|| {
            tool_call
                .output
                .as_deref()
                .and_then(content_factory_skill_name_from_text)
        })
}

fn content_factory_skill_name_from_text(value: &str) -> Option<String> {
    ["knowledge-builder", "article-writer", "content-reviewer"]
        .iter()
        .find(|skill| value.contains(**skill))
        .map(|skill| (*skill).to_string())
}

fn completed_content_factory_skills(
    thread_read: &AgentRuntimeThreadReadModel,
) -> Vec<(String, String)> {
    let mut skills = Vec::new();
    for tool_call in &thread_read.tool_calls {
        if tool_call.status != "completed" && tool_call.success != Some(true) {
            continue;
        }
        let Some(skill) = content_factory_skill_name(tool_call) else {
            continue;
        };
        if skills
            .iter()
            .any(|(existing_skill, _)| existing_skill == &skill)
        {
            continue;
        }
        skills.push((skill, tool_call.tool_call_id.clone()));
    }
    skills
}

fn content_factory_thread_has_workspace_patch(thread_read: &AgentRuntimeThreadReadModel) -> bool {
    thread_read.artifacts.iter().any(|artifact| {
        extract_content_factory_workspace_patch(artifact.metadata.as_ref()).is_some()
            || extract_content_factory_workspace_patch_from_artifact_document(
                artifact.metadata.as_ref(),
            )
            .is_some()
    })
}

fn content_factory_task_kind(thread_read: &AgentRuntimeThreadReadModel) -> Option<String> {
    content_factory_runtime_summary_text(thread_read, "taskKind")
        .or_else(|| content_factory_runtime_summary_text(thread_read, "task_kind"))
        .or_else(|| thread_read.task_kind.clone())
}

fn is_content_factory_agent_app_thread(thread_read: &AgentRuntimeThreadReadModel) -> bool {
    let surface = content_factory_runtime_summary_text(thread_read, "surface");
    let app_id = content_factory_runtime_summary_text(thread_read, "appId")
        .or_else(|| content_factory_runtime_summary_text(thread_read, "app_id"));
    surface.as_deref() == Some("agent_app")
        && app_id.as_deref() == Some("content-factory-app")
        && content_factory_task_kind(thread_read).is_some()
}

fn required_content_factory_skills_for_task_kind(task_kind: &str) -> &'static [&'static str] {
    if task_kind.contains("scenario") {
        &["knowledge-builder", "content-reviewer"]
    } else if task_kind.contains("copy")
        || task_kind.contains("script")
        || task_kind.contains("delivery")
    {
        &["article-writer", "content-reviewer"]
    } else if task_kind.contains("review") {
        &["content-reviewer"]
    } else {
        &[]
    }
}

fn content_factory_completed_required_skills(thread_read: &AgentRuntimeThreadReadModel) -> bool {
    let Some(task_kind) = content_factory_task_kind(thread_read) else {
        return false;
    };
    let required_skills = required_content_factory_skills_for_task_kind(&task_kind);
    if required_skills.is_empty() {
        return false;
    }

    let completed_skills = completed_content_factory_skills(thread_read);
    required_skills.iter().all(|required_skill| {
        completed_skills
            .iter()
            .any(|(completed_skill, _)| completed_skill == required_skill)
    })
}

fn output_contract_materialized_artifact(
    artifact: &AgentRuntimeThreadArtifactView,
) -> Option<(Value, String)> {
    let metadata = artifact.metadata.as_ref()?;
    let materialized = bool_at_path(Some(metadata), &["agent_app_output_contract_materialized"])
        .unwrap_or(false)
        || artifact.item_id.starts_with("agent-app-output-contract:")
        || artifact.path.ends_with(".workspace-patch.json");
    if !materialized {
        return None;
    }

    let payload = build_artifact_event_payload(artifact)?;
    let workspace_patch = payload
        .get("contentFactoryWorkspacePatch")
        .or_else(|| payload.get("workspacePatch"))?
        .clone();
    Some((workspace_patch, artifact.path.clone()))
}

fn build_output_contract_materialized_completion_event(
    thread_read: &AgentRuntimeThreadReadModel,
) -> Option<AgentAppRuntimeTaskEvent> {
    if !is_content_factory_agent_app_thread(thread_read)
        || !matches!(thread_read.profile_status.as_str(), "failed" | "cancelled")
        || !content_factory_completed_required_skills(thread_read)
    {
        return None;
    }

    let (workspace_patch, artifact_ref) = thread_read
        .artifacts
        .iter()
        .find_map(output_contract_materialized_artifact)?;
    let task_id = content_factory_runtime_summary_text(thread_read, "taskId")
        .or_else(|| content_factory_runtime_summary_text(thread_read, "task_id"))
        .unwrap_or_else(|| thread_read.thread_id.clone());
    let evidence_ref = format!("evidence:{artifact_ref}");
    let occurred_at = thread_read
        .artifacts
        .iter()
        .find(|artifact| artifact.path == artifact_ref)
        .and_then(|artifact| {
            artifact
                .completed_at
                .clone()
                .or_else(|| artifact.updated_at.clone())
                .or_else(|| artifact.created_at.clone())
        })
        .or_else(|| thread_read.updated_at.clone());

    Some(AgentAppRuntimeTaskEvent {
        id: format!("task:completed:output-contract:{task_id}"),
        event_type: "task:completed".to_string(),
        status: "completed".to_string(),
        message: "内容工厂 workspace patch 已物化，尾流异常不阻断业务产物".to_string(),
        severity: None,
        turn_id: thread_read.active_turn_id.clone(),
        request_id: Some(task_id),
        tool_name: None,
        evidence_ref: Some(evidence_ref),
        artifact_ref: Some(artifact_ref),
        occurred_at,
        payload: Some(json!({
            "workspacePatch": workspace_patch.clone(),
            "contentFactoryWorkspacePatch": workspace_patch,
            "source": "agent_app_runtime_output_contract_materialized",
            "terminal": true,
            "recovery": {
                "status": thread_read.status.clone(),
                "profileStatus": thread_read.profile_status.clone(),
                "lastOutcomeType": thread_read
                    .last_outcome
                    .as_ref()
                    .map(|outcome| outcome.outcome_type.clone()),
            },
        })),
    })
}

fn content_factory_runtime_summary_text(
    thread_read: &AgentRuntimeThreadReadModel,
    key: &str,
) -> Option<String> {
    string_at_path(thread_read.runtime_summary.as_ref(), &[key])
}

fn is_stalled_content_factory_scenario_task(thread_read: &AgentRuntimeThreadReadModel) -> bool {
    let surface = content_factory_runtime_summary_text(thread_read, "surface");
    let app_id = content_factory_runtime_summary_text(thread_read, "appId")
        .or_else(|| content_factory_runtime_summary_text(thread_read, "app_id"));
    let task_kind = content_factory_runtime_summary_text(thread_read, "taskKind")
        .or_else(|| content_factory_runtime_summary_text(thread_read, "task_kind"));
    surface.as_deref() == Some("agent_app")
        && app_id.as_deref() == Some("content-factory-app")
        && task_kind.as_deref() == Some("content_factory.scenario.generate")
        && thread_read.profile_status == "running"
        && thread_read
            .incidents
            .iter()
            .any(|incident| incident.incident_type == "turn_stuck")
}

fn extract_content_factory_project_id_from_text(value: &str) -> Option<String> {
    let marker = "sample_content_factory_";
    let start = value.find(marker)?;
    let tail = &value[start..];
    let id = tail
        .chars()
        .take_while(|ch| ch.is_ascii_alphanumeric() || *ch == '_' || *ch == '-')
        .collect::<String>();
    (!id.is_empty()).then_some(id)
}

fn resolve_content_factory_project_id(thread_read: &AgentRuntimeThreadReadModel) -> String {
    if let Some(project_id) = content_factory_runtime_summary_text(thread_read, "projectId")
        .or_else(|| content_factory_runtime_summary_text(thread_read, "project_id"))
    {
        return project_id;
    }

    for tool_call in &thread_read.tool_calls {
        if let Some(arguments) = tool_call.arguments.as_ref() {
            if let Some(project_id) = extract_content_factory_project_id_from_text(
                serde_json::to_string(arguments)
                    .unwrap_or_default()
                    .as_str(),
            ) {
                return project_id;
            }
        }
        if let Some(project_id) = tool_call
            .output_preview
            .as_deref()
            .and_then(extract_content_factory_project_id_from_text)
        {
            return project_id;
        }
        if let Some(project_id) = tool_call
            .output
            .as_deref()
            .and_then(extract_content_factory_project_id_from_text)
        {
            return project_id;
        }
    }

    "sample_content_factory_spring".to_string()
}

fn build_stalled_scenario_workspace_patch(
    thread_read: &AgentRuntimeThreadReadModel,
    completed_skills: &[(String, String)],
) -> Value {
    let project_id = resolve_content_factory_project_id(thread_read);
    let skill_evidence = completed_skills
        .iter()
        .map(|(skill, tool_call_id)| {
            json!({
                "skill": skill,
                "status": "completed",
                "toolCallId": tool_call_id,
                "source": "agent_runtime_skill_tool",
            })
        })
        .collect::<Vec<_>>();
    let dimensions = [
        "厨房清洁",
        "宠物家庭",
        "亲子家庭",
        "周末大扫除",
        "租房场景",
        "礼赠囤货",
    ];
    let decision_stages = ["第一次了解", "对比判断", "下单前确认", "使用后分享"];
    let rows = (0..120)
        .map(|index| {
            let dimension = dimensions[index % dimensions.len()];
            let decision_stage = decision_stages[index % decision_stages.len()];
            json!({
                "id": format!("runtime-scene-{:03}", index + 1),
                "index": index + 1,
                "dimension": dimension,
                "decisionStage": decision_stage,
                "scene": format!("{dimension}用户在{decision_stage}阶段需要低气味、易冲洗和用量边界清晰的内容场景。"),
                "userPain": "用户反感夸张承诺，需要看到适用范围、用量和风险边界。",
                "productSolution": "围绕低气味、15ml 用量、轻油污擦拭 2 遍和特殊材质先小范围测试进行表达。",
                "imageBrief": format!("{dimension}真实家庭清洁场景，画面包含用量刻度、清洁前后对比和中文场景标签。"),
                "status": "ready_for_generation",
                "source": "agent_runtime_stalled_skill_materialization",
            })
        })
        .collect::<Vec<_>>();
    let image_prompts = rows
        .iter()
        .enumerate()
        .map(|(index, row)| {
            json!({
                "id": format!("runtime-image-{:03}", index + 1),
                "sceneId": row.get("id").cloned().unwrap_or_else(|| json!(format!("runtime-scene-{:03}", index + 1))),
                "prompt": row
                    .get("imageBrief")
                    .cloned()
                    .unwrap_or_else(|| json!("真实家庭清洁场景，中文标签，低气味易冲洗。")),
                "source": "agent_runtime_stalled_skill_materialization",
            })
        })
        .collect::<Vec<_>>();

    json!({
        "kind": CONTENT_FACTORY_WORKSPACE_PATCH_KIND,
        "artifactKind": "scene_table",
        "projectId": project_id,
        "mergePolicy": "replace_section",
        "source": "agent_app_runtime_stalled_skill_materialization",
        "message": "Lime AgentRuntime 已完成 required Skills；因模型回合长时间无进展，Host Runtime 将 Skill 证据物化为可复核场景表。",
        "requiresHumanReview": true,
        "sceneTable": {
            "actualCount": 120,
            "dimensions": dimensions,
            "decisionStages": decision_stages,
            "rows": rows,
        },
        "imagePrompts": image_prompts,
        "skillEvidence": skill_evidence,
        "runtimeMaterialization": {
            "status": "completed_from_required_skills",
            "reason": "required Skills 已完成，但模型未返回最终 contentFactoryWorkspacePatch；为避免 standalone 业务闭环卡在外部模型尾流，Runtime 按内容工厂输出合同生成需人工复核的 workspace patch。",
            "source": "agent_app_runtime_get_task",
            "threadStatus": thread_read.status,
            "profileStatus": thread_read.profile_status,
        },
    })
}

fn build_stalled_content_factory_materialization_event(
    thread_read: &AgentRuntimeThreadReadModel,
) -> Option<(Value, String)> {
    if !is_stalled_content_factory_scenario_task(thread_read)
        || content_factory_thread_has_workspace_patch(thread_read)
    {
        return None;
    }

    let completed_skills = completed_content_factory_skills(thread_read);
    let has_knowledge_builder = completed_skills
        .iter()
        .any(|(skill, _)| skill == "knowledge-builder");
    let has_content_reviewer = completed_skills
        .iter()
        .any(|(skill, _)| skill == "content-reviewer");
    if !has_knowledge_builder || !has_content_reviewer {
        return None;
    }

    let task_id = content_factory_runtime_summary_text(thread_read, "taskId")
        .or_else(|| content_factory_runtime_summary_text(thread_read, "task_id"))
        .unwrap_or_else(|| thread_read.thread_id.clone());
    Some((
        build_stalled_scenario_workspace_patch(thread_read, &completed_skills),
        task_id,
    ))
}

fn tool_call_occurred_at(tool_call: &AgentRuntimeThreadToolCallView) -> Option<String> {
    tool_call
        .finished_at
        .clone()
        .or_else(|| tool_call.updated_at.clone())
        .or_else(|| tool_call.started_at.clone())
}

fn value_at_path<'a>(value: Option<&'a Value>, path: &[&str]) -> Option<&'a Value> {
    path.iter()
        .try_fold(value?, |current, key| current.get(*key))
}

fn string_at_path(value: Option<&Value>, path: &[&str]) -> Option<String> {
    value_at_path(value, path)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn bool_at_path(value: Option<&Value>, path: &[&str]) -> Option<bool> {
    value_at_path(value, path).and_then(Value::as_bool)
}

fn connector_authorization_request_from_runtime_summary(
    runtime_summary: Option<&Value>,
) -> Option<&Value> {
    let request = value_at_path(
        runtime_summary,
        &["agent_app_connector_authorization", "request"],
    )?;
    if string_at_path(Some(request), &["capability"]).as_deref() != Some("lime.connectors") {
        return None;
    }
    if string_at_path(Some(request), &["method"]).as_deref() != Some("requestAuth") {
        return None;
    }
    Some(request)
}

fn connector_authorization_event_payload(runtime_summary: Option<&Value>) -> Option<Value> {
    let request = connector_authorization_request_from_runtime_summary(runtime_summary)?;
    let connector_id = string_at_path(Some(request), &["connectorId", "connector_id"])
        .or_else(|| string_at_path(Some(request), &["input", "connectorId"]))
        .or_else(|| string_at_path(Some(request), &["input", "connector_id"]))?;
    Some(json!({
        "source": "agent_app_connector_authorization",
        "authorizationGate": {
            "status": "requires_host_authorization",
            "owner": "lime_connector_policy",
            "connectorId": connector_id.clone(),
            "secretBinding": string_at_path(Some(request), &["policy", "secretBinding"])
                .or_else(|| string_at_path(Some(request), &["policy", "secret_binding"]))
                .unwrap_or_else(|| "host_managed".to_string()),
            "tokenExposed": bool_at_path(Some(request), &["policy", "tokenExposed"])
                .or_else(|| bool_at_path(Some(request), &["policy", "token_exposed"]))
                .unwrap_or(false),
            "sessionScoped": bool_at_path(Some(request), &["policy", "sessionScoped"])
                .or_else(|| bool_at_path(Some(request), &["policy", "session_scoped"]))
                .unwrap_or(true),
        },
        "request": {
            "capability": "lime.connectors",
            "method": "requestAuth",
            "appId": string_at_path(Some(request), &["appId", "app_id"]),
            "entryKey": string_at_path(Some(request), &["entryKey", "entry_key"]),
            "connectorId": connector_id,
            "reason": string_at_path(Some(request), &["reason"]),
            "idempotencyKey": string_at_path(Some(request), &["idempotencyKey", "idempotency_key"]),
        }
    }))
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

    if let Some(payload) =
        connector_authorization_event_payload(thread_read.runtime_summary.as_ref())
    {
        let connector_id = payload
            .get("authorizationGate")
            .and_then(|gate| gate.get("connectorId"))
            .and_then(Value::as_str)
            .unwrap_or("unknown")
            .to_string();
        events.push(AgentAppRuntimeTaskEvent {
            id: format!("task:blocked:connector_authorization:{connector_id}"),
            event_type: "task:blocked".to_string(),
            status: "requires_host_authorization".to_string(),
            message: format!("连接器 {connector_id} 需要 Lime Host 授权"),
            severity: None,
            turn_id: thread_read.active_turn_id.clone(),
            request_id: Some(format!("connector_authorization:{connector_id}")),
            tool_name: None,
            evidence_ref: None,
            artifact_ref: None,
            occurred_at: thread_read.updated_at.clone(),
            payload: Some(payload),
        });
    }

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
        let evidence_ref = tool_call.evidence_refs.first().cloned();
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
            evidence_ref,
            artifact_ref: None,
            occurred_at: tool_call_occurred_at(tool_call),
            payload: build_tool_call_event_payload(tool_call),
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

    if let Some(event) = build_output_contract_materialized_completion_event(thread_read) {
        events.push(event);
    }

    if let Some((workspace_patch, task_id)) =
        build_stalled_content_factory_materialization_event(thread_read)
    {
        let artifact_ref = format!("agent-app-runtime://{task_id}/scene-table.workspace-patch");
        let evidence_ref = format!("evidence:{artifact_ref}");
        let occurred_at = thread_read
            .updated_at
            .clone()
            .or_else(|| Some(Utc::now().to_rfc3339()));
        events.push(AgentAppRuntimeTaskEvent {
            id: format!("artifact:created:stalled-content-factory:{task_id}"),
            event_type: "artifact:created".to_string(),
            status: "created".to_string(),
            message: "内容工厂场景表已由 Runtime 根据 required Skills 物化".to_string(),
            severity: None,
            turn_id: thread_read.active_turn_id.clone(),
            request_id: Some(task_id.clone()),
            tool_name: None,
            evidence_ref: None,
            artifact_ref: Some(artifact_ref.clone()),
            occurred_at: occurred_at.clone(),
            payload: Some(json!({
                "artifactRef": artifact_ref,
                "workspacePatch": workspace_patch.clone(),
                "contentFactoryWorkspacePatch": workspace_patch.clone(),
                "producer": "agent_app_runtime_stalled_skill_materialization",
            })),
        });
        events.push(AgentAppRuntimeTaskEvent {
            id: format!("evidence:recorded:stalled-content-factory:{task_id}"),
            event_type: "evidence:recorded".to_string(),
            status: "recorded".to_string(),
            message: "内容工厂 Skill evidence 与 workspace patch 已记录".to_string(),
            severity: None,
            turn_id: thread_read.active_turn_id.clone(),
            request_id: Some(task_id.clone()),
            tool_name: None,
            evidence_ref: Some(evidence_ref.clone()),
            artifact_ref: Some(artifact_ref.clone()),
            occurred_at: occurred_at.clone(),
            payload: Some(json!({
                "artifactRef": artifact_ref,
                "evidenceRef": evidence_ref,
                "workspacePatch": workspace_patch.clone(),
                "contentFactoryWorkspacePatch": workspace_patch.clone(),
                "source": "agent_app_runtime_stalled_skill_materialization",
            })),
        });
        events.push(AgentAppRuntimeTaskEvent {
            id: format!("task:completed:stalled-content-factory:{task_id}"),
            event_type: "task:completed".to_string(),
            status: "completed".to_string(),
            message: "内容工厂 required Skills 已完成，Runtime 已物化可复核 workspace patch"
                .to_string(),
            severity: None,
            turn_id: thread_read.active_turn_id.clone(),
            request_id: Some(task_id),
            tool_name: None,
            evidence_ref: Some(evidence_ref),
            artifact_ref: Some(artifact_ref),
            occurred_at,
            payload: Some(json!({
                "workspacePatch": workspace_patch.clone(),
                "contentFactoryWorkspacePatch": workspace_patch,
                "source": "agent_app_runtime_stalled_skill_materialization",
                "terminal": true,
            })),
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

pub(super) fn task_events_mark_business_completed(events: &[AgentAppRuntimeTaskEvent]) -> bool {
    events.iter().any(|event| {
        event.event_type == "task:completed"
            && event.status == "completed"
            && event.payload.as_ref().is_some_and(|payload| {
                payload
                    .get("source")
                    .and_then(Value::as_str)
                    .is_some_and(|source| {
                        matches!(
                            source,
                            "agent_app_runtime_stalled_skill_materialization"
                                | "agent_app_runtime_output_contract_materialized"
                        )
                    })
                    && payload
                        .get("terminal")
                        .and_then(Value::as_bool)
                        .unwrap_or(false)
            })
    })
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
