use super::runtime_turn_context::insert_serialized_run_metadata;
use super::runtime_turn_request_resolution_permission::build_runtime_permission_review_status_from_state;
use super::runtime_turn_request_resolution_user_lock::build_runtime_user_lock_capability_status_from_state;
use super::*;

pub(super) fn merge_runtime_request_resolution_metadata(
    request_metadata: Option<serde_json::Value>,
    task_profile: &lime_agent::SessionExecutionRuntimeTaskProfile,
    routing_decision: &lime_agent::SessionExecutionRuntimeRoutingDecision,
    limit_state: &lime_agent::SessionExecutionRuntimeLimitState,
    cost_state: &lime_agent::SessionExecutionRuntimeCostState,
    permission_state: &lime_agent::SessionExecutionRuntimePermissionState,
    limit_event: Option<&lime_agent::SessionExecutionRuntimeLimitEvent>,
    oem_policy: Option<&lime_agent::SessionExecutionRuntimeOemPolicy>,
    runtime_summary: &lime_agent::SessionExecutionRuntimeSummary,
) -> Option<serde_json::Value> {
    let mut root = match request_metadata {
        Some(serde_json::Value::Object(object)) => object,
        Some(_) | None => serde_json::Map::new(),
    };
    let runtime_entry = root
        .entry(LIME_RUNTIME_METADATA_KEY.to_string())
        .or_insert_with(|| serde_json::Value::Object(serde_json::Map::new()));
    if !runtime_entry.is_object() {
        *runtime_entry = serde_json::Value::Object(serde_json::Map::new());
    }
    let runtime_object = runtime_entry
        .as_object_mut()
        .expect("lime_runtime metadata should be an object");
    insert_serialized_run_metadata(runtime_object, "task_profile", task_profile);
    insert_serialized_run_metadata(runtime_object, "routing_decision", routing_decision);
    insert_serialized_run_metadata(runtime_object, "limit_state", limit_state);
    insert_serialized_run_metadata(runtime_object, "cost_state", cost_state);
    insert_serialized_run_metadata(runtime_object, "permission_state", permission_state);
    insert_serialized_run_metadata(runtime_object, "runtime_summary", runtime_summary);
    if let Some(limit_event) = limit_event {
        insert_serialized_run_metadata(runtime_object, "limit_event", limit_event);
    }
    if let Some(oem_policy) = oem_policy {
        insert_serialized_run_metadata(runtime_object, "oem_policy", oem_policy);
    }

    Some(serde_json::Value::Object(root))
}

pub(super) fn extract_runtime_resolution_payload<T: serde::de::DeserializeOwned>(
    request_metadata: Option<&serde_json::Value>,
    key: &str,
) -> Option<T> {
    let root = request_metadata?.as_object()?;
    let runtime = root.get(LIME_RUNTIME_METADATA_KEY)?.as_object()?;
    serde_json::from_value(runtime.get(key)?.clone()).ok()
}

pub(super) fn collect_runtime_request_resolution_side_events(
    request_metadata: Option<&serde_json::Value>,
) -> Vec<RuntimeAgentEvent> {
    let mut events = Vec::new();

    if let Some(task_profile) = extract_runtime_resolution_payload::<
        lime_agent::SessionExecutionRuntimeTaskProfile,
    >(request_metadata, "task_profile")
    {
        events.push(RuntimeAgentEvent::TaskProfileResolved { task_profile });
    }

    let routing_decision = extract_runtime_resolution_payload::<
        lime_agent::SessionExecutionRuntimeRoutingDecision,
    >(request_metadata, "routing_decision");
    if let Some(routing_decision) = routing_decision.clone() {
        events.push(RuntimeAgentEvent::CandidateSetResolved {
            routing_decision: routing_decision.clone(),
        });
        events.push(RuntimeAgentEvent::RoutingDecisionMade {
            routing_decision: routing_decision.clone(),
        });

        if !routing_decision.fallback_chain.is_empty() {
            events.push(RuntimeAgentEvent::RoutingFallbackApplied {
                routing_decision: routing_decision.clone(),
            });
        }

        if routing_decision.routing_mode == "no_candidate" {
            events.push(RuntimeAgentEvent::RoutingNotPossible { routing_decision });
        }
    }

    let limit_state = extract_runtime_resolution_payload::<
        lime_agent::SessionExecutionRuntimeLimitState,
    >(request_metadata, "limit_state");
    if let Some(limit_state) = limit_state.clone() {
        events.push(RuntimeAgentEvent::LimitStateUpdated {
            limit_state: limit_state.clone(),
        });

        if limit_state.single_candidate_only {
            events.push(RuntimeAgentEvent::SingleCandidateOnly {
                limit_state: limit_state.clone(),
            });

            if limit_state.capability_gap.is_some() {
                events.push(RuntimeAgentEvent::SingleCandidateCapabilityGap {
                    limit_state: limit_state.clone(),
                });
            }
        }
        if let Some(status) = build_runtime_user_lock_capability_status_from_state(&limit_state) {
            events.push(RuntimeAgentEvent::RuntimeStatus { status });
        }
    }

    if let Some(cost_state) = extract_runtime_resolution_payload::<
        lime_agent::SessionExecutionRuntimeCostState,
    >(request_metadata, "cost_state")
    {
        events.push(RuntimeAgentEvent::CostEstimated { cost_state });
    }

    if let Some(permission_state) = extract_runtime_resolution_payload::<
        lime_agent::SessionExecutionRuntimePermissionState,
    >(request_metadata, "permission_state")
    {
        if let Some(status) = build_runtime_permission_review_status_from_state(&permission_state) {
            events.push(RuntimeAgentEvent::RuntimeStatus { status });
        }
    }

    if let Some(limit_event) = extract_runtime_resolution_payload::<
        lime_agent::SessionExecutionRuntimeLimitEvent,
    >(request_metadata, "limit_event")
    {
        events.push(map_runtime_limit_event_to_runtime_agent_event(limit_event));
    }

    events
}

pub(super) trait RuntimeTurnTerminalTimelinePort: Send + Sync {
    fn complete_turn_success(&self) -> Result<Vec<RuntimeAgentEvent>, String>;

    fn abort_turn(&self, error: &str) -> Result<Vec<RuntimeAgentEvent>, String>;

    fn fail_turn(&self, error: &str) -> Result<Vec<RuntimeAgentEvent>, String>;
}

pub(super) struct RecorderRuntimeTurnTerminalTimelinePort {
    timeline_recorder: Arc<Mutex<AgentTimelineRecorder>>,
}

impl RecorderRuntimeTurnTerminalTimelinePort {
    pub(super) fn new(timeline_recorder: Arc<Mutex<AgentTimelineRecorder>>) -> Self {
        Self { timeline_recorder }
    }
}

impl RuntimeTurnTerminalTimelinePort for RecorderRuntimeTurnTerminalTimelinePort {
    fn complete_turn_success(&self) -> Result<Vec<RuntimeAgentEvent>, String> {
        let mut recorder = match self.timeline_recorder.lock() {
            Ok(guard) => guard,
            Err(error) => error.into_inner(),
        };
        recorder.complete_turn_success()
    }

    fn abort_turn(&self, error: &str) -> Result<Vec<RuntimeAgentEvent>, String> {
        let mut recorder = match self.timeline_recorder.lock() {
            Ok(guard) => guard,
            Err(error) => error.into_inner(),
        };
        recorder.abort_turn(error)
    }

    fn fail_turn(&self, error: &str) -> Result<Vec<RuntimeAgentEvent>, String> {
        let mut recorder = match self.timeline_recorder.lock() {
            Ok(guard) => guard,
            Err(error) => error.into_inner(),
        };
        recorder.fail_turn(error)
    }
}

pub(super) fn fail_runtime_turn_before_model_execution(
    event_port: &dyn crate::agent::runtime_queue_service::RuntimeQueueEventPort,
    terminal_timeline_port: &dyn RuntimeTurnTerminalTimelinePort,
    app: &AppHandle,
    event_name: &str,
    profile_stream: &AgentRuntimeProfileStream,
    task_profile_refs: &RuntimeTurnTaskProfileRefs,
    message: &str,
) {
    let terminal_events = terminal_timeline_port.fail_turn(message);
    if let Err(error) = &terminal_events {
        tracing::warn!(
            "[AsterAgent] 记录运行时执行前阻断 turn 时间线失败（已降级继续）: {}",
            error
        );
    }
    if let Ok(events) = terminal_events {
        let projection_port = TauriRuntimeProjectionEventPort::new(app);
        emit_runtime_events(event_port, &projection_port, event_name, events);
    }

    let failure_category = profile_failure_category(message);
    let projection_port = TauriRuntimeProjectionEventPort::new(app);
    for event in build_runtime_task_failed_profile_events(
        profile_stream,
        task_profile_refs,
        failure_category,
        message,
        false,
    ) {
        emit_agent_runtime_profile_event_with_port(&projection_port, event_name, event);
    }
    emit_agent_runtime_profile_event_with_port(
        &projection_port,
        event_name,
        profile_stream.turn_failed(failure_category, message),
    );
    emit_agent_runtime_profile_event_with_port(
        &projection_port,
        event_name,
        profile_stream.snapshot_updated("failed"),
    );

    let error_event = RuntimeAgentEvent::Error {
        message: message.to_string(),
    };
    event_port.emit_runtime_queue_event(event_name, &error_event);
    emit_agent_app_runtime_event_projection_with_port(&projection_port, event_name, &error_event);
}

pub(super) fn emit_runtime_request_resolution_events(
    app: &AppHandle,
    event_name: &str,
    timeline_recorder: &Arc<Mutex<AgentTimelineRecorder>>,
    workspace_root: &str,
    request_metadata: Option<&serde_json::Value>,
) {
    let host = RuntimeSideEventHostContext::new(app, event_name, timeline_recorder, workspace_root);
    for event in collect_runtime_request_resolution_side_events(request_metadata) {
        host.emit_side_event(event);
    }
}

pub(super) fn map_runtime_limit_event_to_runtime_agent_event(
    limit_event: lime_agent::SessionExecutionRuntimeLimitEvent,
) -> RuntimeAgentEvent {
    match limit_event.event_kind.as_str() {
        "quota_blocked" => RuntimeAgentEvent::QuotaBlocked { limit_event },
        "quota_low" => RuntimeAgentEvent::QuotaLow { limit_event },
        "rate_limit_hit" => RuntimeAgentEvent::RateLimitHit { limit_event },
        _ => RuntimeAgentEvent::Warning {
            code: Some("runtime_limit_event_unknown".to_string()),
            message: limit_event.message,
        },
    }
}
