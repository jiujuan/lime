use super::*;
use lime_agent::{
    build_diagnostics_runtime_status_metadata, project_runtime_event,
    AgentEvent as RuntimeAgentEvent,
};

fn execution_strategy_label(strategy: AsterExecutionStrategy) -> &'static str {
    let _ = strategy;
    "对话执行"
}

pub(super) async fn build_turn_runtime_statuses(
    request: &AsterChatRequest,
    effective_strategy: AsterExecutionStrategy,
    request_tool_policy: &RequestToolPolicy,
    _model_name: Option<&str>,
    _session_recent_preferences: Option<&lime_agent::SessionExecutionRuntimePreferences>,
) -> Result<(AgentRuntimeStatus, AgentRuntimeStatus), String> {
    let browser_task_requirement = extract_browser_task_requirement(request.metadata.as_ref());

    let initial_checkpoints = vec![
        execution_strategy_label(effective_strategy).to_string(),
        if request_tool_policy.requires_web_search() {
            "当前任务需要先联网核实".to_string()
        } else if request_tool_policy.allows_web_search() {
            "搜索工具已在工具面中，是否调用由模型判断".to_string()
        } else {
            "本轮搜索工具未启用".to_string()
        },
        if matches!(
            browser_task_requirement,
            Some(BrowserTaskRequirement::Required | BrowserTaskRequirement::RequiredWithUserStep)
        ) {
            "当前任务要求真实浏览器执行，不允许退化为联网检索".to_string()
        } else {
            "浏览器能力保持候选状态".to_string()
        },
        "推理强度与工具调用由模型按任务复杂度判断".to_string(),
    ];

    let decided = if request_tool_policy.requires_web_search() {
        (
            "正在准备联网核实".to_string(),
            "本轮策略要求搜索工具参与，运行时会把搜索结果交给模型继续整理。".to_string(),
            vec![
                "搜索工具可用".to_string(),
                "搜索结果会作为模型上下文".to_string(),
            ],
        )
    } else {
        (
            "正在交给模型处理".to_string(),
            "运行时已准备当前工具面，模型会根据上下文自行判断是否需要搜索、浏览器或其他工具。".to_string(),
            vec![
                "普通输入已进入 Agent 主链".to_string(),
                "前端不再预选搜索、思考或编程策略".to_string(),
            ],
        )
    };

    Ok((
        AgentRuntimeStatus {
            phase: "preparing".to_string(),
            title: "正在准备处理".to_string(),
            detail: "正在整理当前会话上下文和可用工具面。".to_string(),
            checkpoints: initial_checkpoints,
            metadata: Some(build_diagnostics_runtime_status_metadata()),
        },
        AgentRuntimeStatus {
            phase: "routing".to_string(),
            title: decided.0,
            detail: decided.1,
            checkpoints: decided.2,
            metadata: Some(build_diagnostics_runtime_status_metadata()),
        },
    ))
}

pub(super) fn should_project_runtime_status_to_timeline(
    request_metadata: Option<&serde_json::Value>,
) -> bool {
    let Some(fast_response_routing) = extract_harness_nested_object(
        request_metadata,
        &["fast_response_routing", "fastResponseRouting"],
    ) else {
        return true;
    };

    let presentation = fast_response_routing
        .get("runtime_status_presentation")
        .or_else(|| fast_response_routing.get("runtimeStatusPresentation"))
        .and_then(serde_json::Value::as_str)
        .map(str::trim);

    !matches!(presentation, Some("transient"))
}

fn emit_transient_runtime_status(app: &AppHandle, event_name: &str, status: AgentRuntimeStatus) {
    let runtime_event = RuntimeAgentEvent::RuntimeStatus { status };
    if let Err(error) = app.emit(event_name, &runtime_event) {
        tracing::warn!("[AsterAgent] 发送 runtime_status 失败: {}", error);
    }
}

fn emit_projected_runtime_item_event(
    app: &AppHandle,
    event_name: &str,
    timeline_recorder: &Arc<Mutex<AgentTimelineRecorder>>,
    workspace_root: &str,
    event: RuntimeAgentEvent,
) {
    if let Err(error) = app.emit(event_name, &event) {
        tracing::warn!("[AsterAgent] 发送 runtime item 投影事件失败: {}", error);
    }

    let mut recorder = match timeline_recorder.lock() {
        Ok(guard) => guard,
        Err(error) => error.into_inner(),
    };
    if let Err(error) = recorder.record_runtime_event(app, event_name, &event, workspace_root) {
        tracing::warn!(
            "[AsterAgent] 记录 runtime item 投影事件失败（已降级继续）: {}",
            error
        );
    }
}

pub(super) async fn emit_runtime_status_with_projection(
    agent: &Agent,
    app: &AppHandle,
    event_name: &str,
    timeline_recorder: &Arc<Mutex<AgentTimelineRecorder>>,
    workspace_root: &str,
    session_config: &aster::agents::SessionConfig,
    status: AgentRuntimeStatus,
    project_to_timeline: bool,
) {
    if project_to_timeline {
        match agent
            .upsert_runtime_status_item(
                session_config,
                status.phase.clone(),
                status.title.clone(),
                status.detail.clone(),
                status.checkpoints.clone(),
            )
            .await
        {
            Ok(agent_event) => {
                for event in project_runtime_event(agent_event) {
                    emit_projected_runtime_item_event(
                        app,
                        event_name,
                        timeline_recorder,
                        workspace_root,
                        event,
                    );
                }
            }
            Err(error) => {
                tracing::warn!(
                    "[AsterAgent] 写入 runtime_status item 失败，降级仅发送 transient 事件: {}",
                    error
                );
            }
        }
    }

    emit_transient_runtime_status(app, event_name, status);
}

pub(super) async fn complete_runtime_status_projection(
    agent: &Agent,
    app: &AppHandle,
    event_name: &str,
    timeline_recorder: &Arc<Mutex<AgentTimelineRecorder>>,
    workspace_root: &str,
    session_config: &aster::agents::SessionConfig,
) {
    match agent.complete_runtime_status_item(session_config).await {
        Ok(Some(agent_event)) => {
            for event in project_runtime_event(agent_event) {
                emit_projected_runtime_item_event(
                    app,
                    event_name,
                    timeline_recorder,
                    workspace_root,
                    event,
                );
            }
        }
        Ok(None) => {}
        Err(error) => {
            tracing::warn!("[AsterAgent] 完成 runtime_status item 失败: {}", error);
        }
    }
}

pub(super) async fn stream_reply_once<F>(
    agent: &Agent,
    app: &AppHandle,
    event_name: &str,
    user_message: Message,
    working_directory: Option<&Path>,
    session_config: aster::agents::SessionConfig,
    cancel_token: CancellationToken,
    request_tool_policy: &RequestToolPolicy,
    mut on_event: F,
) -> Result<StreamReplyExecution, ReplyAttemptError>
where
    F: FnMut(&RuntimeAgentEvent) -> bool,
{
    stream_message_reply_with_policy(
        agent,
        user_message,
        working_directory,
        session_config,
        Some(cancel_token),
        request_tool_policy,
        |event| {
            let already_emitted = on_event(event);
            if !already_emitted {
                if let Err(error) = app.emit(event_name, event) {
                    tracing::error!("[AsterAgent] 发送事件失败: {}", error);
                }
            }
            let app = app.clone();
            let event_name = event_name.to_string();
            let event = event.clone();
            tokio::spawn(async move {
                maybe_emit_subagent_status_for_runtime_event(&app, &event_name, &event).await;
            });
        },
    )
    .await
}

pub(super) fn build_runtime_user_message(
    message_text: &str,
    images: Option<&[ImageInput]>,
) -> Message {
    let mut message = Message::user();

    if !message_text.is_empty() {
        message = message.with_text(message_text);
    }

    if let Some(images) = images {
        for image in images {
            if image.data.trim().is_empty() || image.media_type.trim().is_empty() {
                continue;
            }
            message = message.with_image(image.data.clone(), image.media_type.clone());
        }
    }

    if message.content.is_empty() {
        return Message::user().with_text(message_text);
    }

    message
}
