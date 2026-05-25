use super::*;

#[derive(Clone)]
pub(super) struct RuntimeStreamTiming {
    started_at: Instant,
    first_delta_emitted: Arc<AtomicBool>,
}

impl RuntimeStreamTiming {
    pub(super) fn new() -> Self {
        Self {
            started_at: Instant::now(),
            first_delta_emitted: Arc::new(AtomicBool::new(false)),
        }
    }

    fn elapsed_ms(&self) -> u64 {
        self.started_at
            .elapsed()
            .as_millis()
            .try_into()
            .unwrap_or(u64::MAX)
    }

    fn mark_direct_emit(&self, event_name: &str, event: &RuntimeAgentEvent) {
        let has_visible_delta = match event {
            RuntimeAgentEvent::TextDelta { text } | RuntimeAgentEvent::ThinkingDelta { text } => {
                !text.is_empty()
            }
            RuntimeAgentEvent::TextDeltaBatch { text, .. } => !text.is_empty(),
            _ => false,
        };
        if !has_visible_delta {
            return;
        }

        if self
            .first_delta_emitted
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_err()
        {
            return;
        }

        tracing::info!(
            "[AsterAgent][TTFT] 首个 runtime delta 已透传: event_name={}, elapsed_ms={}",
            event_name,
            self.started_at.elapsed().as_millis()
        );
    }
}

pub(crate) fn should_emit_runtime_stream_event_directly(event: &RuntimeAgentEvent) -> bool {
    !matches!(
        event,
        RuntimeAgentEvent::ItemStarted { .. }
            | RuntimeAgentEvent::ItemUpdated { .. }
            | RuntimeAgentEvent::ItemCompleted { .. }
            | RuntimeAgentEvent::ArtifactSnapshot { .. }
            | RuntimeAgentEvent::ContextCompactionStarted { .. }
            | RuntimeAgentEvent::ContextCompactionCompleted { .. }
            | RuntimeAgentEvent::Warning { .. }
            | RuntimeAgentEvent::Error { .. }
            | RuntimeAgentEvent::Message { .. }
    )
}

pub(crate) fn should_record_runtime_stream_event_on_timeline(event: &RuntimeAgentEvent) -> bool {
    matches!(
        event,
        RuntimeAgentEvent::TurnStarted { .. }
            | RuntimeAgentEvent::ItemStarted { .. }
            | RuntimeAgentEvent::ItemUpdated { .. }
            | RuntimeAgentEvent::ItemCompleted { .. }
            | RuntimeAgentEvent::ArtifactSnapshot { .. }
            | RuntimeAgentEvent::ContextCompactionStarted { .. }
            | RuntimeAgentEvent::ContextCompactionCompleted { .. }
            | RuntimeAgentEvent::Warning { .. }
            | RuntimeAgentEvent::Error { .. }
    )
}

pub(crate) fn timeline_recorder_emits_equivalent_runtime_event(event: &RuntimeAgentEvent) -> bool {
    matches!(
        event,
        RuntimeAgentEvent::ItemStarted { .. }
            | RuntimeAgentEvent::ItemUpdated { .. }
            | RuntimeAgentEvent::ItemCompleted { .. }
    )
}

fn emit_direct_runtime_stream_event(
    app: &AppHandle,
    event_name: &str,
    stream_timing: &RuntimeStreamTiming,
    event: &RuntimeAgentEvent,
) {
    stream_timing.mark_direct_emit(event_name, event);
    if let Err(error) = app.emit(event_name, event) {
        tracing::warn!(
            "[AsterAgent] 发送实时运行时事件失败: event_name={}, error={}",
            event_name,
            error
        );
    }
    emit_agent_app_runtime_event_projection(app, event_name, event);
}

#[derive(Default)]
pub(crate) struct RuntimeToolProfileState {
    tool_names: HashMap<String, String>,
    started_tool_call_ids: HashSet<String>,
    terminal_tool_call_ids: HashSet<String>,
}

fn runtime_tool_profile_key(tool_call_id: &str, tool_name: Option<&str>) -> String {
    let trimmed_id = tool_call_id.trim();
    if !trimmed_id.is_empty() {
        return trimmed_id.to_string();
    }

    let trimmed_name = tool_name.unwrap_or_default().trim();
    if trimmed_name.is_empty() {
        "tool_call_unavailable".to_string()
    } else {
        format!("tool_call_unavailable:{trimmed_name}")
    }
}

fn remember_runtime_tool_name(
    state: &mut RuntimeToolProfileState,
    tool_call_id: &str,
    tool_name: &str,
) {
    let normalized_name = tool_name.trim();
    if normalized_name.is_empty() {
        return;
    }

    let key = runtime_tool_profile_key(tool_call_id, Some(normalized_name));
    state
        .tool_names
        .entry(key)
        .and_modify(|current| {
            if current.trim().is_empty() || current == "unknown_tool" {
                *current = normalized_name.to_string();
            }
        })
        .or_insert_with(|| normalized_name.to_string());
}

pub(crate) fn runtime_tool_name_from_result_metadata(
    result: &lime_agent::AgentToolResult,
) -> Option<&str> {
    let metadata = result.metadata.as_ref()?;
    ["toolName", "tool_name", "name"]
        .iter()
        .find_map(|key| metadata.get(*key)?.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn emit_runtime_tool_started_profile_event(
    profile_stream: &AgentRuntimeProfileStream,
    state: &mut RuntimeToolProfileState,
    tool_call_id: &str,
    tool_name: &str,
) -> Option<AgentRuntimeProfileEvent> {
    remember_runtime_tool_name(state, tool_call_id, tool_name);
    let key = runtime_tool_profile_key(tool_call_id, Some(tool_name));
    if !state.started_tool_call_ids.insert(key) {
        return None;
    }

    Some(profile_stream.tool_started(tool_call_id, tool_name))
}

fn emit_runtime_tool_terminal_profile_event(
    profile_stream: &AgentRuntimeProfileStream,
    state: &mut RuntimeToolProfileState,
    tool_call_id: &str,
    tool_name_hint: Option<&str>,
    success: bool,
    error: Option<&str>,
) -> Option<AgentRuntimeProfileEvent> {
    if let Some(tool_name) = tool_name_hint {
        remember_runtime_tool_name(state, tool_call_id, tool_name);
    }

    let key = runtime_tool_profile_key(tool_call_id, tool_name_hint);
    if !state.terminal_tool_call_ids.insert(key.clone()) {
        return None;
    }

    let tool_name = tool_name_hint
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .or_else(|| state.tool_names.get(&key).cloned())
        .unwrap_or_else(|| "unknown_tool".to_string());

    if success {
        Some(profile_stream.tool_result(tool_call_id, tool_name.as_str(), true))
    } else {
        Some(profile_stream.tool_failed(
            tool_call_id,
            tool_name.as_str(),
            "tool_error",
            error.unwrap_or("tool failed"),
        ))
    }
}

pub(crate) fn project_runtime_tool_profile_events(
    profile_stream: &AgentRuntimeProfileStream,
    state: &mut RuntimeToolProfileState,
    event: &RuntimeAgentEvent,
) -> Vec<AgentRuntimeProfileEvent> {
    match event {
        RuntimeAgentEvent::ToolStart {
            tool_name, tool_id, ..
        } => emit_runtime_tool_started_profile_event(profile_stream, state, tool_id, tool_name)
            .into_iter()
            .collect(),
        RuntimeAgentEvent::ToolEnd { tool_id, result } => {
            let tool_name_hint = runtime_tool_name_from_result_metadata(result);
            emit_runtime_tool_terminal_profile_event(
                profile_stream,
                state,
                tool_id,
                tool_name_hint,
                result.success,
                result.error.as_deref(),
            )
            .into_iter()
            .collect()
        }
        RuntimeAgentEvent::ItemStarted { item } | RuntimeAgentEvent::ItemUpdated { item } => {
            if let AgentThreadItemPayload::ToolCall { tool_name, .. } = &item.payload {
                return emit_runtime_tool_started_profile_event(
                    profile_stream,
                    state,
                    item.id.as_str(),
                    tool_name.as_str(),
                )
                .into_iter()
                .collect();
            }
            Vec::new()
        }
        RuntimeAgentEvent::ItemCompleted { item } => {
            let AgentThreadItemPayload::ToolCall {
                tool_name,
                success,
                error,
                ..
            } = &item.payload
            else {
                return Vec::new();
            };
            let success =
                item.status == AgentThreadItemStatus::Completed && !matches!(success, Some(false));
            emit_runtime_tool_terminal_profile_event(
                profile_stream,
                state,
                item.id.as_str(),
                Some(tool_name.as_str()),
                success,
                error.as_deref(),
            )
            .into_iter()
            .collect()
        }
        _ => Vec::new(),
    }
}

fn emit_runtime_tool_profile_events(
    app: &AppHandle,
    event_name: &str,
    profile_stream: &AgentRuntimeProfileStream,
    tool_profile_state: &Arc<Mutex<RuntimeToolProfileState>>,
    event: &RuntimeAgentEvent,
) {
    let profile_events = {
        let mut state = match tool_profile_state.lock() {
            Ok(guard) => guard,
            Err(error) => {
                tracing::warn!(
                    "[AsterAgent][AgentRuntimeProfile] tool profile state lock poisoned"
                );
                error.into_inner()
            }
        };
        project_runtime_tool_profile_events(profile_stream, &mut state, event)
    };

    for event in profile_events {
        emit_agent_runtime_profile_event(app, event_name, event);
    }
}

#[allow(clippy::too_many_arguments)]
pub(super) fn record_runtime_stream_event(
    run_observation: &Arc<Mutex<ChatRunObservation>>,
    app: &AppHandle,
    event_name: &str,
    timeline_recorder: &Arc<Mutex<AgentTimelineRecorder>>,
    workspace_root: &str,
    request_metadata: Option<&serde_json::Value>,
    provider_continuation_capability: ProviderContinuationCapability,
    stream_timing: &RuntimeStreamTiming,
    profile_stream: &AgentRuntimeProfileStream,
    tool_profile_state: &Arc<Mutex<RuntimeToolProfileState>>,
    event: &RuntimeAgentEvent,
) -> bool {
    let emitted_directly = should_emit_runtime_stream_event_directly(event);
    if emitted_directly {
        emit_direct_runtime_stream_event(app, event_name, stream_timing, event);
    }

    let mut observation = match run_observation.lock() {
        Ok(guard) => guard,
        Err(error) => {
            tracing::warn!("[AsterAgent] run observation lock poisoned，继续复用内部状态");
            error.into_inner()
        }
    };
    observation.record_model_delta_timing(event, stream_timing.elapsed_ms());
    observation.record_event(
        event,
        workspace_root,
        request_metadata,
        provider_continuation_capability,
    );
    emit_runtime_tool_profile_events(app, event_name, profile_stream, tool_profile_state, event);

    if !should_record_runtime_stream_event_on_timeline(event) {
        return emitted_directly;
    }

    let mut recorder = match timeline_recorder.lock() {
        Ok(guard) => guard,
        Err(error) => error.into_inner(),
    };
    match recorder.record_runtime_event(app, event_name, event, workspace_root) {
        Ok(()) => emitted_directly || timeline_recorder_emits_equivalent_runtime_event(event),
        Err(error) => {
            tracing::warn!("[AsterAgent] 记录时间线事件失败（已降级继续）: {}", error);
            emitted_directly
        }
    }
}
