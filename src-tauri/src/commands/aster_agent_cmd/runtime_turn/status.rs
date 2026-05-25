use super::*;

pub(super) fn is_runtime_model_permission_denied_error(message: &str) -> bool {
    let normalized = message.trim().to_ascii_lowercase();
    (normalized.contains("authentication failed")
        && normalized.contains("403")
        && normalized.contains("illegal access"))
        || normalized.contains("当前模型未在租户白名单中开放")
        || (normalized.contains("tenant")
            && normalized.contains("whitelist")
            && normalized.contains("model"))
        || (normalized.contains("model")
            && normalized.contains("not in")
            && normalized.contains("allowlist"))
}

pub(super) fn build_submit_accepted_runtime_status() -> AgentRuntimeStatus {
    AgentRuntimeStatus {
        phase: "preparing".to_string(),
        title: "已接收请求，正在准备执行".to_string(),
        detail: "系统正在初始化本轮执行环境并整理上下文，稍后会继续返回更详细进度。".to_string(),
        checkpoints: vec![
            "请求已进入运行时主链".to_string(),
            "正在准备工作区与会话上下文".to_string(),
            "等待后续详细执行事件".to_string(),
        ],
        metadata: Some(build_diagnostics_runtime_status_metadata()),
    }
}

pub(super) fn emit_submit_accepted_runtime_status(app: &AppHandle, event_name: &str) {
    if event_name.trim().is_empty() {
        return;
    }

    let event = RuntimeAgentEvent::RuntimeStatus {
        status: build_submit_accepted_runtime_status(),
    };
    if let Err(error) = app.emit(event_name, &event) {
        tracing::warn!(
            "[AsterAgent] 发送 submit accepted runtime_status 失败: event_name={}, error={}",
            event_name,
            error
        );
    }
    emit_agent_app_runtime_event_projection(app, event_name, &event);
}

pub(super) fn describe_provider_request_attempt(
    request: &AsterChatRequest,
) -> (String, String, String) {
    let Some(provider_config) = request.provider_config.as_ref() else {
        return (
            "unconfigured".to_string(),
            "unconfigured".to_string(),
            "unconfigured".to_string(),
        );
    };

    (
        provider_config
            .provider_id
            .as_deref()
            .unwrap_or(&provider_config.provider_name)
            .trim()
            .to_string(),
        provider_config.provider_name.trim().to_string(),
        provider_config.model_name.trim().to_string(),
    )
}

pub(super) fn build_runtime_model_permission_fallback_failure_message(
    primary_model: &str,
    fallback_model: &str,
    fallback_error: &str,
) -> String {
    if is_runtime_model_permission_denied_error(fallback_error) {
        return format!(
            "当前模型 `{primary_model}` 未在租户白名单中开放；自动切换到 `{fallback_model}` 后仍被同类权限策略拒绝。请在设置里切换到已授权模型，或把当前服务商的可用模型写入模型列表。"
        );
    }

    format!(
        "当前模型 `{primary_model}` 未在租户白名单中开放；自动切换到 `{fallback_model}` 后重试失败：{fallback_error}"
    )
}

pub(super) fn build_runtime_turn_keepalive_status(
    sequence: u64,
    elapsed: Duration,
) -> AgentRuntimeStatus {
    let elapsed_secs = elapsed.as_secs();
    let mut metadata = build_diagnostics_runtime_status_metadata();
    metadata.insert(
        "keepalive_kind".to_string(),
        serde_json::Value::String("runtime_turn_active".to_string()),
    );
    metadata.insert(
        "keepalive_sequence".to_string(),
        serde_json::Value::Number(sequence.into()),
    );
    metadata.insert(
        "keepalive_elapsed_ms".to_string(),
        serde_json::Value::Number((elapsed.as_millis() as u64).into()),
    );

    AgentRuntimeStatus {
        phase: "routing".to_string(),
        title: "仍在执行，等待下一步进度".to_string(),
        detail: format!(
            "运行时已连续处理约 {elapsed_secs} 秒，本轮可能正在等待模型或工具返回；收到新进度后会自动更新。"
        ),
        checkpoints: vec![
            "请求仍在后台执行".to_string(),
            "正在等待模型、工具或上下文准备返回".to_string(),
            "如果长时间无结果，可手动停止后重试".to_string(),
        ],
        metadata: Some(metadata),
    }
}

pub(super) struct RuntimeTurnKeepaliveGuard {
    stopped: Arc<AtomicBool>,
    handle: tokio::task::JoinHandle<()>,
}

impl RuntimeTurnKeepaliveGuard {
    pub(super) fn start(app: AppHandle, event_name: String) -> Option<Self> {
        if event_name.trim().is_empty() {
            return None;
        }

        let stopped = Arc::new(AtomicBool::new(false));
        let stopped_for_task = stopped.clone();
        let handle = tokio::spawn(async move {
            let started_at = Instant::now();
            let mut sequence = 0_u64;
            loop {
                tokio::time::sleep(RUNTIME_TURN_KEEPALIVE_INTERVAL).await;
                if stopped_for_task.load(Ordering::Relaxed) {
                    break;
                }
                sequence += 1;
                let status = build_runtime_turn_keepalive_status(sequence, started_at.elapsed());
                let event = RuntimeAgentEvent::RuntimeStatus { status };
                if let Err(error) = app.emit(&event_name, &event) {
                    tracing::warn!(
                        "[AsterAgent] 发送 runtime keepalive 失败: event_name={}, error={}",
                        event_name,
                        error
                    );
                }
            }
        });

        Some(Self { stopped, handle })
    }
}

impl Drop for RuntimeTurnKeepaliveGuard {
    fn drop(&mut self) {
        self.stopped.store(true, Ordering::Relaxed);
        self.handle.abort();
    }
}
