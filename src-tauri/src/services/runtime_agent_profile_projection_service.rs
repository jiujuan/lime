//! AgentRuntime Profile 投影服务
//!
//! 将 current `SessionDetail + AgentRuntimeThreadReadModel` 投影为
//! evidence/replay/review 可复用的 AgentRuntime Profile JSON。

use crate::agent::SessionDetail;
use crate::commands::aster_agent_cmd::{
    attempt_id_from_turn_id, run_id_from_turn_id, task_id_from_thread_id, AgentRuntimeProfileEvent,
    AgentRuntimeProfileStream, AgentRuntimeThreadReadModel, LIME_AGENT_RUNTIME_ID,
    LIME_AGENT_RUNTIME_PROFILE_SCHEMA_VERSION,
};
use serde_json::{json, Value};

pub(crate) fn build_agent_runtime_profile_spine_json(
    detail: &SessionDetail,
    thread_read: &AgentRuntimeThreadReadModel,
) -> Value {
    json!({
        "schemaVersion": LIME_AGENT_RUNTIME_PROFILE_SCHEMA_VERSION,
        "runtimeId": LIME_AGENT_RUNTIME_ID,
        "sessionId": detail.id,
        "threadId": detail.thread_id,
        "profileStatus": thread_read.profile_status,
        "activeTurnId": thread_read.active_turn_id,
        "turns": thread_read.turns,
        "events": build_agent_runtime_profile_events_json(detail, thread_read),
        "actions": build_agent_runtime_profile_actions_json(thread_read),
        "toolCalls": thread_read.tool_calls,
        "modelRouting": thread_read.model_routing,
        "contextSummary": thread_read.context_summary,
        "evidenceSummary": thread_read.evidence_summary,
        "telemetrySummary": thread_read.telemetry_summary,
        "correlationRefs": {
            "turnIds": thread_read.turns.iter().map(|turn| turn.turn_id.clone()).collect::<Vec<_>>(),
            "toolCallIds": thread_read.tool_calls.iter().map(|tool| tool.tool_call_id.clone()).collect::<Vec<_>>(),
            "pendingRequestIds": thread_read.pending_requests.iter().map(|item| item.id.clone()).collect::<Vec<_>>(),
            "queuedTurnIds": thread_read.queued_turns.iter().map(|item| item.queued_turn_id.clone()).collect::<Vec<_>>(),
            "traceIds": thread_read.telemetry_summary.trace_ids,
            "evidenceRefs": thread_read.evidence_summary.evidence_refs
        },
        "source": "thread_read_model"
    })
}

fn build_agent_runtime_profile_events_json(
    detail: &SessionDetail,
    thread_read: &AgentRuntimeThreadReadModel,
) -> Vec<Value> {
    let mut events = build_agent_runtime_profile_policy_events_json(detail, thread_read);
    events.extend(build_agent_runtime_profile_tool_events_json(
        detail,
        thread_read,
    ));
    events.extend(build_agent_runtime_profile_routing_events_json(
        detail,
        thread_read,
    ));
    events.extend(build_agent_runtime_profile_task_events_json(
        detail,
        thread_read,
    ));
    events
}

fn build_agent_runtime_profile_policy_events_json(
    detail: &SessionDetail,
    thread_read: &AgentRuntimeThreadReadModel,
) -> Vec<Value> {
    thread_read
        .pending_requests
        .iter()
        .flat_map(|request| {
            let turn_id = request
                .turn_id
                .as_deref()
                .or(thread_read.active_turn_id.as_deref())
                .unwrap_or("turn_unavailable");
            let Ok(stream) = AgentRuntimeProfileStream::new(
                detail.id.as_str(),
                detail.thread_id.as_str(),
                turn_id,
            ) else {
                return Vec::new();
            };
            let scope = request.scope.clone().unwrap_or_else(|| {
                json!({
                    "threadId": request.thread_id,
                    "turnId": request.turn_id,
                    "itemId": request.item_id,
                })
            });
            let decision_kind = pending_request_decision_kind(request.request_type.as_str());
            let policy_decision_id = format!("policy_decision_{}", request.id);
            let permission = stream.permission_evaluated(
                policy_decision_id.as_str(),
                decision_kind,
                scope.clone(),
            );
            let action = stream.action_required(
                request.id.as_str(),
                None,
                request.request_type.as_str(),
                decision_kind,
                scope,
            );
            vec![
                serialize_profile_event_value(permission),
                serialize_profile_event_value(action),
            ]
        })
        .collect()
}

fn build_agent_runtime_profile_tool_events_json(
    detail: &SessionDetail,
    thread_read: &AgentRuntimeThreadReadModel,
) -> Vec<Value> {
    thread_read
        .tool_calls
        .iter()
        .flat_map(|tool| {
            let Ok(stream) = AgentRuntimeProfileStream::new(
                detail.id.as_str(),
                detail.thread_id.as_str(),
                tool.turn_id.as_str(),
            ) else {
                return Vec::new();
            };
            let started = stream.tool_started(tool.tool_call_id.as_str(), tool.tool_name.as_str());
            let terminal = if tool.status == "failed" || tool.success == Some(false) {
                stream.tool_failed(
                    tool.tool_call_id.as_str(),
                    tool.tool_name.as_str(),
                    "tool_error",
                    tool.error.as_deref().unwrap_or("tool failed"),
                )
            } else {
                stream.tool_result(
                    tool.tool_call_id.as_str(),
                    tool.tool_name.as_str(),
                    tool.success.unwrap_or(true),
                )
            };

            vec![
                serialize_profile_event_value(started),
                serialize_profile_event_value(terminal),
            ]
        })
        .collect()
}

fn build_agent_runtime_profile_routing_events_json(
    detail: &SessionDetail,
    thread_read: &AgentRuntimeThreadReadModel,
) -> Vec<Value> {
    let Some(model_routing) = thread_read.model_routing.as_ref() else {
        return Vec::new();
    };
    let turn_id = thread_read
        .active_turn_id
        .as_deref()
        .or_else(|| thread_read.turns.last().map(|turn| turn.turn_id.as_str()))
        .unwrap_or("turn_unavailable");
    let Ok(stream) =
        AgentRuntimeProfileStream::new(detail.id.as_str(), detail.thread_id.as_str(), turn_id)
    else {
        return Vec::new();
    };
    let task_kind = json_string_field(model_routing, "taskKind");
    let service_model_slot = json_string_field(model_routing, "serviceModelSlot");
    let routing_mode = json_string_field(model_routing, "routingMode");
    let candidate_count = json_u32_field(model_routing, "candidateCount");
    let selected_model = json_string_field(model_routing, "selectedModel");
    let decision_source = json_string_field(model_routing, "decisionSource");
    let estimated_cost_class = json_string_field(model_routing, "estimatedCostClass");
    let limit_status = thread_read
        .limit_state
        .as_ref()
        .map(|state| state.status.as_str());
    let single_candidate_only = json_bool_field(model_routing, "singleCandidateOnly");

    let mut events = vec![serialize_profile_event_value(stream.task_profile_resolved(
        task_kind.as_deref(),
        service_model_slot.as_deref(),
        routing_mode.as_deref(),
    ))];
    if routing_mode.as_deref() == Some("single_candidate")
        || candidate_count == Some(1)
        || single_candidate_only == Some(true)
    {
        events.push(serialize_profile_event_value(
            stream.routing_single_candidate(
                task_kind.as_deref(),
                candidate_count.unwrap_or(1),
                selected_model.as_deref(),
                decision_source.as_deref(),
            ),
        ));
    }
    if estimated_cost_class.is_some() {
        events.push(serialize_profile_event_value(
            stream.cost_estimated(estimated_cost_class.as_deref()),
        ));
    }
    if limit_status.is_some() || single_candidate_only.is_some() {
        events.push(serialize_profile_event_value(
            stream.limit_changed(limit_status, single_candidate_only),
        ));
    }
    events
}

fn build_agent_runtime_profile_task_events_json(
    detail: &SessionDetail,
    thread_read: &AgentRuntimeThreadReadModel,
) -> Vec<Value> {
    if thread_read.turns.is_empty() && thread_read.queued_turns.is_empty() {
        return Vec::new();
    }

    let task_id = task_id_from_thread_id(&detail.thread_id);
    let task_kind = thread_read
        .task_kind
        .as_deref()
        .or(Some("conversation_turn"));
    let first_turn_id = thread_read.turns.first().map(|turn| turn.turn_id.as_str());
    let stream_turn_id = thread_read
        .active_turn_id
        .as_deref()
        .or_else(|| thread_read.turns.last().map(|turn| turn.turn_id.as_str()))
        .or(first_turn_id)
        .unwrap_or("turn_unavailable");
    let Ok(stream) = AgentRuntimeProfileStream::new(
        detail.id.as_str(),
        detail.thread_id.as_str(),
        stream_turn_id,
    ) else {
        return Vec::new();
    };

    let mut events = Vec::new();
    events.push(serialize_profile_event_value(stream.task_created(
        task_id.as_str(),
        task_kind,
        Some("thread_read_model"),
    )));

    let mut latest_failed_attempt_id = None;
    let mut latest_failure_message = None;
    let mut latest_failure_category = None;

    for (index, turn) in thread_read.turns.iter().enumerate() {
        let attempt_index = index + 1;
        let run_id = run_id_from_turn_id(&turn.turn_id);
        let attempt_id = attempt_id_from_turn_id(&turn.turn_id);
        events.push(serialize_profile_event_value(stream.task_attempt_started(
            task_id.as_str(),
            run_id.as_str(),
            attempt_id.as_str(),
            attempt_index,
        )));

        match turn.status.as_str() {
            "completed" => {
                events.push(serialize_profile_event_value(stream.task_completed(
                    task_id.as_str(),
                    run_id.as_str(),
                    attempt_id.as_str(),
                    attempt_index,
                )));
            }
            "failed" | "cancelled" => {
                let failure_message =
                    task_failure_message_for_turn(detail, thread_read, &turn.turn_id);
                let failure_category = task_failure_category_for_status(
                    turn.status.as_str(),
                    failure_message.as_deref(),
                );
                let retryable = task_attempt_retryable(turn.status.as_str(), thread_read);
                events.push(serialize_profile_event_value(stream.task_attempt_failed(
                    task_id.as_str(),
                    run_id.as_str(),
                    attempt_id.as_str(),
                    attempt_index,
                    failure_category,
                    failure_message.as_deref(),
                    retryable,
                )));
                latest_failed_attempt_id = Some(attempt_id);
                latest_failure_message = failure_message;
                latest_failure_category = Some(failure_category.to_string());
            }
            _ => {}
        }
    }

    if !thread_read.queued_turns.is_empty() && latest_failed_attempt_id.is_some() {
        let failed_attempt_id = latest_failed_attempt_id.as_deref();
        let retry_reason = latest_failure_message
            .as_deref()
            .or_else(|| {
                thread_read
                    .diagnostics
                    .as_ref()
                    .and_then(|value| value.primary_blocking_summary.as_deref())
            })
            .or_else(|| latest_failure_category.as_deref());
        let next_attempt_index = thread_read.turns.len() + 1;
        events.extend(thread_read.queued_turns.iter().map(|queued_turn| {
            serialize_profile_event_value(stream.task_retrying(
                task_id.as_str(),
                failed_attempt_id,
                queued_turn.queued_turn_id.as_str(),
                next_attempt_index + queued_turn.position.saturating_sub(1),
                retry_reason,
            ))
        }));
    } else if let Some(last_turn) = thread_read.turns.last() {
        if matches!(last_turn.status.as_str(), "failed" | "cancelled") {
            let run_id = run_id_from_turn_id(&last_turn.turn_id);
            let attempt_id = latest_failed_attempt_id
                .clone()
                .unwrap_or_else(|| attempt_id_from_turn_id(&last_turn.turn_id));
            let attempt_index = thread_read.turns.len();
            let failure_message =
                task_failure_message_for_turn(detail, thread_read, &last_turn.turn_id);
            let failure_category = latest_failure_category.unwrap_or_else(|| {
                task_failure_category_for_status(
                    last_turn.status.as_str(),
                    failure_message.as_deref(),
                )
                .to_string()
            });
            events.push(serialize_profile_event_value(stream.task_failed(
                task_id.as_str(),
                run_id.as_str(),
                attempt_id.as_str(),
                attempt_index,
                failure_category.as_str(),
                failure_message.as_deref(),
                false,
            )));
        }
    }

    events
}

fn task_failure_message_for_turn(
    detail: &SessionDetail,
    thread_read: &AgentRuntimeThreadReadModel,
    turn_id: &str,
) -> Option<String> {
    detail
        .turns
        .iter()
        .rev()
        .find(|turn| turn.id == turn_id)
        .and_then(|turn| turn.error_message.clone())
        .or_else(|| {
            thread_read
                .last_outcome
                .as_ref()
                .filter(|outcome| outcome.turn_id.as_deref() == Some(turn_id))
                .and_then(|outcome| {
                    outcome
                        .primary_cause
                        .clone()
                        .or_else(|| outcome.summary.clone())
                })
        })
        .or_else(|| {
            thread_read
                .diagnostics
                .as_ref()
                .and_then(|diagnostics| diagnostics.primary_blocking_summary.clone())
        })
}

fn task_failure_category_for_status(status: &str, message: Option<&str>) -> &'static str {
    if status == "cancelled" {
        return "cancelled";
    }

    let normalized = message.map(str::to_ascii_lowercase).unwrap_or_default();
    if normalized.contains("rate limit")
        || normalized.contains("quota")
        || normalized.contains("provider")
        || normalized.contains("network")
        || normalized.contains("api")
    {
        "provider_error"
    } else if normalized.contains("permission") || normalized.contains("权限") {
        "permission"
    } else if normalized.contains("tool") || normalized.contains("工具") {
        "tool_error"
    } else {
        "runtime_error"
    }
}

fn task_attempt_retryable(status: &str, thread_read: &AgentRuntimeThreadReadModel) -> bool {
    if !thread_read.queued_turns.is_empty() {
        return true;
    }

    thread_read
        .last_outcome
        .as_ref()
        .map(|outcome| outcome.retryable)
        .unwrap_or(status != "cancelled")
}

fn json_string_field(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn json_u32_field(value: &Value, key: &str) -> Option<u32> {
    value
        .get(key)
        .and_then(Value::as_u64)
        .and_then(|value| u32::try_from(value).ok())
}

fn json_bool_field(value: &Value, key: &str) -> Option<bool> {
    value.get(key).and_then(Value::as_bool)
}

fn serialize_profile_event_value(event: AgentRuntimeProfileEvent) -> Value {
    serde_json::to_value(event).unwrap_or(Value::Null)
}

fn build_agent_runtime_profile_actions_json(
    thread_read: &AgentRuntimeThreadReadModel,
) -> Vec<Value> {
    thread_read
        .pending_requests
        .iter()
        .map(|request| {
            json!({
                "actionId": request.id,
                "requestType": request.request_type,
                "status": request.status,
                "turnId": request.turn_id,
                "itemId": request.item_id,
                "title": request.title,
                "decision": request.decision,
                "scope": request.scope,
                "policyRefs": {
                    "owner": "AgentPolicy",
                    "decisionKind": pending_request_decision_kind(request.request_type.as_str()),
                    "approvalRequestId": request.id,
                    "policyDecisionId": format!("policy_decision_{}", request.id),
                },
                "createdAt": request.created_at,
                "resolvedAt": request.resolved_at,
            })
        })
        .collect()
}

fn pending_request_decision_kind(request_type: &str) -> &'static str {
    match request_type {
        "tool_confirmation" | "permission_confirmation" | "approval" => "ask",
        "ask_user" | "elicitation" => "ask",
        _ => "ask",
    }
}
