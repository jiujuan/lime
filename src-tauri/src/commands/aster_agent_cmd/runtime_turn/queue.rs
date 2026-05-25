use super::runtime_turn_stream::execute_aster_chat_request;
use super::*;

fn build_queued_turn_preview(message: &str) -> String {
    let compact = message.split_whitespace().collect::<Vec<_>>().join(" ");
    if compact.is_empty() {
        return "空白输入".to_string();
    }

    let preview = compact.chars().take(80).collect::<String>();
    if compact.chars().count() > 80 {
        format!("{preview}...")
    } else {
        preview
    }
}

fn extract_subagent_parent_session_id(metadata: Option<&serde_json::Value>) -> Option<String> {
    metadata
        .and_then(|value| value.get("subagent"))
        .and_then(serde_json::Value::as_object)
        .and_then(|subagent| {
            subagent
                .get("parent_session_id")
                .or_else(|| subagent.get("parentSessionId"))
        })
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

async fn resolve_team_runtime_provider_group_for_request(request: &AsterChatRequest) -> String {
    if let Some(provider_config) = request.provider_config.as_ref() {
        if let Some(provider_selector) = provider_config
            .provider_id
            .as_deref()
            .filter(|value| !value.trim().is_empty())
        {
            return normalize_team_runtime_provider_group(provider_selector);
        }
        return normalize_team_runtime_provider_group(&provider_config.provider_name);
    }

    match read_session(&request.session_id, false, "读取 provider 会话上下文失败").await {
        Ok(session) => {
            let provider_selector = resolve_session_provider_selector(&session)
                .or_else(|| normalize_optional_text(session.provider_name.clone()));
            provider_selector
                .map(|value| normalize_team_runtime_provider_group(&value))
                .unwrap_or_else(|| "default".to_string())
        }
        Err(_) => "default".to_string(),
    }
}

fn should_apply_provider_runtime_guard(provider_group: &str) -> bool {
    resolve_provider_runtime_parallel_budget(provider_group).is_some()
}

fn build_provider_runtime_guard_lease_id(request: &AsterChatRequest) -> String {
    format!("provider-runtime-guard:{}", request.session_id)
}

fn build_provider_runtime_status_metadata(
    snapshot: &ProviderRuntimeGovernorSnapshot,
) -> std::collections::HashMap<String, serde_json::Value> {
    let mut metadata = build_diagnostics_runtime_status_metadata();
    metadata.insert(
        "concurrency_phase".to_string(),
        serde_json::Value::String(snapshot.provider_phase.clone()),
    );
    metadata.insert(
        "concurrency_scope".to_string(),
        serde_json::Value::String("provider_global".to_string()),
    );
    metadata.insert(
        "concurrency_active_count".to_string(),
        serde_json::Value::Number(snapshot.provider_active_count.into()),
    );
    metadata.insert(
        "concurrency_queued_count".to_string(),
        serde_json::Value::Number(snapshot.provider_queued_count.into()),
    );
    metadata.insert(
        "concurrency_budget".to_string(),
        serde_json::Value::Number(snapshot.provider_parallel_budget.into()),
    );
    metadata.insert(
        "provider_concurrency_group".to_string(),
        serde_json::Value::String(snapshot.provider_concurrency_group.clone()),
    );
    metadata.insert(
        "provider_parallel_budget".to_string(),
        serde_json::Value::Number(snapshot.provider_parallel_budget.into()),
    );
    if let Some(queue_reason) = snapshot.queue_reason.as_ref() {
        metadata.insert(
            "queue_reason".to_string(),
            serde_json::Value::String(queue_reason.clone()),
        );
    }
    metadata.insert(
        "retryable_overload".to_string(),
        serde_json::Value::Bool(snapshot.retryable_overload),
    );
    metadata
}

fn build_provider_waiting_runtime_status(
    snapshot: &ProviderRuntimeGovernorSnapshot,
    is_team_member: bool,
) -> AgentRuntimeStatus {
    let target_label = if is_team_member {
        "这位协作成员"
    } else {
        "这条请求"
    };
    let mut checkpoints = vec![format!(
        "当前服务仅同时处理 {} 条此类请求",
        snapshot.provider_parallel_budget
    )];
    if snapshot.provider_active_count > 0 {
        checkpoints.push(format!(
            "前面还有 {} 条请求正在处理",
            snapshot.provider_active_count
        ));
    }
    if snapshot.provider_queued_count > 0 {
        checkpoints.push(format!(
            "还有 {} 条请求在等待顺序处理",
            snapshot.provider_queued_count
        ));
    }

    AgentRuntimeStatus {
        phase: "routing".to_string(),
        title: "当前服务较忙，稍后开始处理".to_string(),
        detail: snapshot
            .queue_reason
            .clone()
            .unwrap_or_else(|| format!("为了保证稳定性，{target_label}会在前一项完成后自动继续。")),
        checkpoints,
        metadata: Some(build_provider_runtime_status_metadata(snapshot)),
    }
}

fn build_provider_running_runtime_status(
    snapshot: &ProviderRuntimeGovernorSnapshot,
    is_team_member: bool,
) -> AgentRuntimeStatus {
    let detail = if is_team_member {
        "已轮到这位协作成员，系统会按更稳妥的节奏继续处理。".to_string()
    } else {
        "已轮到这条请求，系统会按更稳妥的节奏开始处理。".to_string()
    };

    AgentRuntimeStatus {
        phase: "routing".to_string(),
        title: if is_team_member {
            "协作成员开始处理".to_string()
        } else {
            "开始处理这条请求".to_string()
        },
        detail,
        checkpoints: vec![
            format!("当前服务同时处理上限 {}", snapshot.provider_parallel_budget),
            "系统会继续保持稳妥处理，尽量避免直接失败".to_string(),
        ],
        metadata: Some(build_provider_runtime_status_metadata(snapshot)),
    }
}

fn build_team_runtime_status_metadata(
    snapshot: &TeamRuntimeGovernorSnapshot,
) -> std::collections::HashMap<String, serde_json::Value> {
    let mut metadata = build_diagnostics_runtime_status_metadata();
    metadata.insert(
        "team_phase".to_string(),
        serde_json::Value::String(snapshot.team_phase.clone()),
    );
    metadata.insert(
        "team_parallel_budget".to_string(),
        serde_json::Value::Number(snapshot.team_parallel_budget.into()),
    );
    metadata.insert(
        "team_active_count".to_string(),
        serde_json::Value::Number(snapshot.team_active_count.into()),
    );
    metadata.insert(
        "team_queued_count".to_string(),
        serde_json::Value::Number(snapshot.team_queued_count.into()),
    );
    metadata.insert(
        "provider_concurrency_group".to_string(),
        serde_json::Value::String(snapshot.provider_concurrency_group.clone()),
    );
    metadata.insert(
        "provider_parallel_budget".to_string(),
        serde_json::Value::Number(snapshot.provider_parallel_budget.into()),
    );
    if let Some(queue_reason) = snapshot.queue_reason.as_ref() {
        metadata.insert(
            "queue_reason".to_string(),
            serde_json::Value::String(queue_reason.clone()),
        );
    }
    metadata.insert(
        "retryable_overload".to_string(),
        serde_json::Value::Bool(snapshot.retryable_overload),
    );
    metadata
}

fn build_team_waiting_runtime_status(snapshot: &TeamRuntimeGovernorSnapshot) -> AgentRuntimeStatus {
    let mut checkpoints = vec![format!(
        "当前已有 {}/{} 位协作成员在处理",
        snapshot.team_active_count, snapshot.team_parallel_budget
    )];
    if snapshot.team_queued_count > 0 {
        checkpoints.push(format!(
            "还有 {} 位协作成员在等待执行",
            snapshot.team_queued_count
        ));
    }
    if snapshot.provider_parallel_budget == 1 {
        checkpoints.push("当前服务较忙，已切换为更稳妥的顺序处理".to_string());
    }

    AgentRuntimeStatus {
        phase: "routing".to_string(),
        title: "等待执行窗口".to_string(),
        detail: snapshot
            .queue_reason
            .clone()
            .unwrap_or_else(|| "系统正在安排可用的处理窗口，稍后会自动继续。".to_string()),
        checkpoints,
        metadata: Some(build_team_runtime_status_metadata(snapshot)),
    }
}

fn build_team_running_runtime_status(snapshot: &TeamRuntimeGovernorSnapshot) -> AgentRuntimeStatus {
    let mut checkpoints = vec![format!(
        "当前并发预算 {}/{}",
        snapshot.team_active_count, snapshot.team_parallel_budget
    )];
    if snapshot.provider_parallel_budget == 1 {
        checkpoints.push("当前服务使用稳妥处理模式".to_string());
    }

    AgentRuntimeStatus {
        phase: "routing".to_string(),
        title: "开始处理".to_string(),
        detail: "已获得可用执行窗口，这位协作成员正在接手当前任务。".to_string(),
        checkpoints,
        metadata: Some(build_team_runtime_status_metadata(snapshot)),
    }
}

fn emit_transient_runtime_status(app: &AppHandle, event_name: &str, status: AgentRuntimeStatus) {
    if event_name.trim().is_empty() {
        return;
    }
    let event = RuntimeAgentEvent::RuntimeStatus { status };
    if let Err(error) = app.emit(event_name, &event) {
        tracing::warn!(
            "[AsterAgent] 发送 team runtime 状态失败: event_name={}, error={}",
            event_name,
            error
        );
    }
}

async fn execute_queued_request_with_team_runtime_governor(
    context: &crate::agent::runtime_queue_service::AgentRuntimeQueueContext,
    request: AsterChatRequest,
) -> Result<(), String> {
    let request_session_id = request.session_id.clone();
    let provider_group = resolve_team_runtime_provider_group_for_request(&request).await;
    let parent_session_id = extract_subagent_parent_session_id(request.metadata.as_ref());
    let is_team_member = parent_session_id.is_some();
    let provider_guard_lease_id = build_provider_runtime_guard_lease_id(&request);
    let provider_guard_permit = if should_apply_provider_runtime_guard(&provider_group) {
        if let Some(waiting_snapshot) =
            preview_provider_runtime_wait_snapshot(&provider_group).await
        {
            emit_transient_runtime_status(
                &context.app,
                &request.event_name,
                build_provider_waiting_runtime_status(&waiting_snapshot, is_team_member),
            );
            if is_team_member {
                emit_subagent_status_changed_events(&context.app, &request_session_id).await;
            }
        }

        let permit = acquire_provider_runtime_permit(
            provider_guard_lease_id.clone(),
            provider_group.clone(),
        )
        .await;
        if let Some(running_snapshot) =
            snapshot_provider_runtime_lease(&provider_guard_lease_id).await
        {
            emit_transient_runtime_status(
                &context.app,
                &request.event_name,
                build_provider_running_runtime_status(&running_snapshot, is_team_member),
            );
        }
        if is_team_member {
            emit_subagent_status_changed_events(&context.app, &request_session_id).await;
        }
        Some(permit)
    } else {
        None
    };

    let result = if let Some(parent_session_id) = parent_session_id {
        if let Some(waiting_snapshot) =
            preview_team_runtime_wait_snapshot(&parent_session_id, &provider_group).await
        {
            emit_transient_runtime_status(
                &context.app,
                &request.event_name,
                build_team_waiting_runtime_status(&waiting_snapshot),
            );
            emit_subagent_status_changed_events(&context.app, &request_session_id).await;
        }

        let permit = acquire_team_runtime_permit(
            request_session_id.clone(),
            parent_session_id,
            provider_group,
        )
        .await;
        if let Some(running_snapshot) = snapshot_team_runtime_session(&request_session_id).await {
            emit_transient_runtime_status(
                &context.app,
                &request.event_name,
                build_team_running_runtime_status(&running_snapshot),
            );
        }
        emit_subagent_status_changed_events(&context.app, &request_session_id).await;

        let result = execute_aster_chat_request(
            &context.app,
            &context.state,
            &context.db,
            &context.api_key_provider_service,
            &context.logs,
            &context.config_manager,
            &context.mcp_manager,
            &context.automation_state,
            request.clone(),
        )
        .await;

        release_team_runtime_permit(permit).await;
        emit_subagent_status_changed_events(&context.app, &request_session_id).await;
        result
    } else {
        execute_aster_chat_request(
            &context.app,
            &context.state,
            &context.db,
            &context.api_key_provider_service,
            &context.logs,
            &context.config_manager,
            &context.mcp_manager,
            &context.automation_state,
            request,
        )
        .await
    };

    if let Some(permit) = provider_guard_permit {
        release_provider_runtime_permit(permit).await;
        if is_team_member {
            emit_subagent_status_changed_events(&context.app, &request_session_id).await;
        }
    }
    if result.is_ok() {
        match crate::commands::aster_agent_cmd::command_api::objective_continuation::maybe_submit_managed_objective_auto_continuation(
            context,
            &request_session_id,
        )
        .await
        {
            Ok(Some(queued_turn_id)) => {
                tracing::info!(
                    "[AsterAgent][Objective] 已提交目标自动续跑: session_id={}, queued_turn_id={}",
                    request_session_id,
                    queued_turn_id
                );
            }
            Ok(None) => {}
            Err(error) => {
                tracing::warn!(
                    "[AsterAgent][Objective] 目标自动续跑 guard 失败，已跳过: session_id={}, error={}",
                    request_session_id,
                    error
                );
            }
        }
    }
    result
}

pub(crate) fn build_queued_turn_task(
    mut request: AsterChatRequest,
) -> Result<QueuedTurnTask<serde_json::Value>, String> {
    let resolved_turn_id = request
        .turn_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    request.turn_id = Some(resolved_turn_id);

    let queued_turn_id = request
        .queued_turn_id
        .clone()
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    request.queued_turn_id = Some(queued_turn_id.clone());

    let image_count = request
        .images
        .as_ref()
        .map(|images| images.len())
        .unwrap_or(0);
    let payload =
        serde_json::to_value(&request).map_err(|e| format!("序列化排队 turn 失败: {e}"))?;

    Ok(QueuedTurnTask {
        queued_turn_id,
        session_id: request.session_id.clone(),
        event_name: request.event_name.clone(),
        message_preview: build_queued_turn_preview(&request.message),
        message_text: request.message.clone(),
        created_at: chrono::Utc::now().timestamp_millis(),
        image_count,
        payload,
    })
}

fn deserialize_queued_turn_request(payload: serde_json::Value) -> Result<AsterChatRequest, String> {
    serde_json::from_value(payload).map_err(|e| format!("反序列化排队 turn 失败: {e}"))
}

pub(crate) fn build_runtime_queue_executor() -> RuntimeQueueExecutor {
    Arc::new(|context, payload| {
        async move {
            let request = deserialize_queued_turn_request(payload)?;
            execute_queued_request_with_team_runtime_governor(&context, request).await
        }
        .boxed()
    })
}
