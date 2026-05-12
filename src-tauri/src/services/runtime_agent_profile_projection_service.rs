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
use lime_core::database::dao::agent_run::{AgentRun, AgentRunStatus};
use serde_json::{json, Value};
use std::collections::BTreeSet;

pub(crate) fn build_agent_runtime_profile_spine_json(
    detail: &SessionDetail,
    thread_read: &AgentRuntimeThreadReadModel,
    owner_runs: &[AgentRun],
) -> Value {
    json!({
        "schemaVersion": LIME_AGENT_RUNTIME_PROFILE_SCHEMA_VERSION,
        "runtimeId": LIME_AGENT_RUNTIME_ID,
        "sessionId": detail.id,
        "threadId": detail.thread_id,
        "profileStatus": thread_read.profile_status,
        "activeTurnId": thread_read.active_turn_id,
        "turns": thread_read.turns,
        "events": build_agent_runtime_profile_events_json(detail, thread_read, owner_runs),
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
    owner_runs: &[AgentRun],
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
    events.extend(build_agent_runtime_profile_subagent_events_json(
        detail,
        thread_read,
    ));
    events.extend(build_agent_runtime_profile_job_events_json(
        detail,
        thread_read,
        owner_runs,
    ));
    events.extend(build_agent_runtime_profile_remote_channel_events_json(
        detail,
        thread_read,
        owner_runs,
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
    let capability_gap = json_string_field(model_routing, "capabilityGap");
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
    } else if routing_mode.as_deref() == Some("no_candidate") || candidate_count == Some(0) {
        events.push(serialize_profile_event_value(stream.routing_not_possible(
            task_kind.as_deref(),
            routing_mode.as_deref(),
            candidate_count.unwrap_or(0),
            decision_source.as_deref(),
            capability_gap.as_deref().or(Some("no_candidate")),
        )));
    } else if candidate_count.is_some_and(|value| value > 1) {
        events.push(serialize_profile_event_value(stream.routing_decided(
            task_kind.as_deref(),
            routing_mode.as_deref(),
            candidate_count.unwrap_or_default(),
            selected_model.as_deref(),
            decision_source.as_deref(),
        )));
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

fn build_agent_runtime_profile_subagent_events_json(
    detail: &SessionDetail,
    thread_read: &AgentRuntimeThreadReadModel,
) -> Vec<Value> {
    let parent_task_id = task_id_from_thread_id(&detail.thread_id);
    detail
        .child_subagent_sessions
        .iter()
        .flat_map(|session| {
            let turn_id = session
                .created_from_turn_id
                .as_deref()
                .or(thread_read.active_turn_id.as_deref())
                .or_else(|| thread_read.turns.last().map(|turn| turn.turn_id.as_str()))
                .unwrap_or("turn_unavailable");
            let Ok(stream) = AgentRuntimeProfileStream::new(
                detail.id.as_str(),
                detail.thread_id.as_str(),
                turn_id,
            ) else {
                return Vec::new();
            };

            let mut events = vec![serialize_profile_event_value(stream.subagent_spawned(
                session.id.as_str(),
                session.created_from_turn_id.as_deref(),
                Some(parent_task_id.as_str()),
                session.origin_tool.as_deref(),
                session.role_key.as_deref(),
            ))];

            if let Some(status) = child_subagent_runtime_status_label(
                session.runtime_status.or(session.latest_turn_status),
            ) {
                events.push(serialize_profile_event_value(stream.subagent_status(
                    session.id.as_str(),
                    status,
                    Some(parent_task_id.as_str()),
                )));
                match status {
                    "completed" => events.push(serialize_profile_event_value(
                        stream
                            .subagent_completed(session.id.as_str(), Some(parent_task_id.as_str())),
                    )),
                    "failed" => events.push(serialize_profile_event_value(stream.subagent_failed(
                        session.id.as_str(),
                        "runtime_error",
                        Some(parent_task_id.as_str()),
                    ))),
                    "aborted" => {
                        events.push(serialize_profile_event_value(stream.subagent_failed(
                            session.id.as_str(),
                            "aborted",
                            Some(parent_task_id.as_str()),
                        )))
                    }
                    "closed" => events.push(serialize_profile_event_value(
                        stream.subagent_closed(session.id.as_str(), Some(parent_task_id.as_str())),
                    )),
                    _ => {}
                }
            }

            events
        })
        .collect()
}

fn child_subagent_runtime_status_label(
    status: Option<lime_agent::ChildSubagentRuntimeStatus>,
) -> Option<&'static str> {
    match status? {
        lime_agent::ChildSubagentRuntimeStatus::Idle => Some("idle"),
        lime_agent::ChildSubagentRuntimeStatus::Queued => Some("queued"),
        lime_agent::ChildSubagentRuntimeStatus::Running => Some("running"),
        lime_agent::ChildSubagentRuntimeStatus::Completed => Some("completed"),
        lime_agent::ChildSubagentRuntimeStatus::Failed => Some("failed"),
        lime_agent::ChildSubagentRuntimeStatus::Aborted => Some("aborted"),
        lime_agent::ChildSubagentRuntimeStatus::Closed => Some("closed"),
    }
}

fn build_agent_runtime_profile_job_events_json(
    detail: &SessionDetail,
    thread_read: &AgentRuntimeThreadReadModel,
    owner_runs: &[AgentRun],
) -> Vec<Value> {
    if owner_runs.is_empty() {
        return Vec::new();
    }

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

    owner_runs
        .iter()
        .flat_map(|run| {
            let metadata = parse_agent_run_metadata_value(run);
            let job_item_id = agent_run_job_item_id(run, metadata.as_ref());
            let item_kind = agent_run_job_item_kind(metadata.as_ref());
            let mut events = vec![
                serialize_profile_event_value(stream.job_created(
                    run.id.as_str(),
                    run.source.as_str(),
                    run.source_ref.as_deref(),
                )),
                serialize_profile_event_value(
                    stream.job_status(run.id.as_str(), run.status.as_str()),
                ),
                serialize_profile_event_value(stream.job_item_started(
                    run.id.as_str(),
                    job_item_id.as_str(),
                    item_kind.as_deref(),
                    run.source_ref.as_deref(),
                )),
            ];

            match run.status {
                AgentRunStatus::Success => events.push(serialize_profile_event_value(
                    stream.job_completed(run.id.as_str()),
                )),
                AgentRunStatus::Error | AgentRunStatus::Canceled | AgentRunStatus::Timeout => {
                    events.push(serialize_profile_event_value(stream.job_item_failed(
                        run.id.as_str(),
                        job_item_id.as_str(),
                        agent_run_failure_category(&run.status),
                        run.error_code.as_deref(),
                        !matches!(run.status, AgentRunStatus::Canceled),
                    )));
                    events.push(serialize_profile_event_value(stream.job_failed(
                        run.id.as_str(),
                        agent_run_failure_category(&run.status),
                        run.error_code.as_deref(),
                    )));
                }
                AgentRunStatus::Queued | AgentRunStatus::Running => {}
            }

            events
        })
        .collect()
}

fn agent_run_failure_category(status: &AgentRunStatus) -> &'static str {
    match status {
        AgentRunStatus::Timeout => "timeout",
        AgentRunStatus::Canceled => "canceled",
        AgentRunStatus::Error => "runtime_error",
        AgentRunStatus::Queued | AgentRunStatus::Running | AgentRunStatus::Success => "unknown",
    }
}

fn agent_run_job_item_id(run: &AgentRun, metadata: Option<&Value>) -> String {
    metadata
        .and_then(|value| {
            read_json_string_from_paths(
                value,
                &[
                    &["job_item_id"][..],
                    &["jobItemId"][..],
                    &["item_id"][..],
                    &["itemId"][..],
                    &["harness", "managed_objective", "item_id"][..],
                    &["harness", "managedObjective", "itemId"][..],
                ],
            )
        })
        .unwrap_or_else(|| format!("{}:execution", run.id))
}

fn agent_run_job_item_kind(metadata: Option<&Value>) -> Option<String> {
    metadata
        .and_then(|value| {
            read_json_string_from_paths(
                value,
                &[
                    &["job_item_kind"][..],
                    &["jobItemKind"][..],
                    &["item_kind"][..],
                    &["itemKind"][..],
                    &["payload_kind"][..],
                    &["payloadKind"][..],
                    &["harness", "managed_objective", "owner_type"][..],
                    &["harness", "managedObjective", "ownerType"][..],
                ],
            )
        })
        .or_else(|| Some("agent_run_execution".to_string()))
}

fn read_json_string_from_paths(value: &Value, paths: &[&[&str]]) -> Option<String> {
    paths.iter().find_map(|path| {
        let current = path.iter().try_fold(value, |current, segment| {
            current.get(*segment).filter(|value| !value.is_null())
        })?;
        current
            .as_str()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
    })
}

pub(crate) fn agent_runtime_remote_task_ids(owner_runs: &[AgentRun]) -> Vec<String> {
    collect_remote_channel_facts(owner_runs)
        .into_iter()
        .map(|fact| fact.remote_task_id)
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}

pub(crate) fn build_agent_runtime_remote_channels_json(owner_runs: &[AgentRun]) -> Value {
    let facts = collect_remote_channel_facts(owner_runs);
    let remote_task_ids = facts
        .iter()
        .map(|fact| fact.remote_task_id.clone())
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();
    let channels = facts
        .iter()
        .filter_map(|fact| fact.channel.clone())
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();

    json!({
        "source": "agent_runs.source_metadata.remote_task",
        "count": facts.len(),
        "remoteTaskIds": remote_task_ids,
        "channels": channels,
        "tasks": facts.iter().map(|fact| {
            json!({
                "runId": fact.run_id,
                "source": fact.source,
                "sourceRef": fact.source_ref,
                "sessionId": fact.session_id,
                "runStatus": fact.run_status,
                "remoteTaskId": fact.remote_task_id,
                "channel": fact.channel,
                "accountId": fact.account_id,
                "remoteEvent": fact.remote_event,
                "remoteStatus": fact.remote_status,
                "snapshotStatus": fact.snapshot_status,
                "snapshotRef": fact.snapshot_ref,
                "replayRef": fact.replay_ref,
                "disconnected": fact.disconnected,
                "resumed": fact.resumed,
                "snapshotRepaired": fact.snapshot_repaired,
            })
        }).collect::<Vec<_>>()
    })
}

fn build_agent_runtime_profile_remote_channel_events_json(
    detail: &SessionDetail,
    thread_read: &AgentRuntimeThreadReadModel,
    owner_runs: &[AgentRun],
) -> Vec<Value> {
    let facts = collect_remote_channel_facts(owner_runs);
    if facts.is_empty() {
        return Vec::new();
    }

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

    facts
        .iter()
        .flat_map(|fact| {
            let mut events = vec![serialize_profile_event_value(stream.channel_connected(
                fact.remote_task_id.as_str(),
                fact.channel.as_deref(),
                fact.account_id.as_deref(),
                Some(fact.run_id.as_str()),
                fact.source.as_deref(),
            ))];
            if fact.disconnected {
                events.push(serialize_profile_event_value(stream.channel_disconnected(
                    fact.remote_task_id.as_str(),
                    fact.channel.as_deref(),
                    fact.account_id.as_deref(),
                    fact.disconnect_reason_code.as_deref(),
                    fact.disconnect_retryable,
                )));
            }
            if fact.resumed {
                events.push(serialize_profile_event_value(stream.channel_resumed(
                    fact.remote_task_id.as_str(),
                    fact.channel.as_deref(),
                    fact.account_id.as_deref(),
                    fact.snapshot_ref.as_deref(),
                    fact.replay_ref.as_deref(),
                )));
            }
            if fact.snapshot_repaired {
                events.push(serialize_profile_event_value(stream.snapshot_repaired(
                    "remote_channel_snapshot",
                    Some(fact.remote_task_id.as_str()),
                    fact.channel.as_deref(),
                    fact.account_id.as_deref(),
                    fact.repair_status.as_deref(),
                    fact.snapshot_stale,
                )));
            }
            events
        })
        .collect()
}

#[derive(Debug, Clone)]
struct RemoteChannelFact {
    run_id: String,
    source: Option<String>,
    source_ref: Option<String>,
    session_id: Option<String>,
    run_status: String,
    remote_task_id: String,
    channel: Option<String>,
    account_id: Option<String>,
    remote_event: Option<String>,
    remote_status: Option<String>,
    snapshot_status: Option<String>,
    snapshot_ref: Option<String>,
    replay_ref: Option<String>,
    disconnected: bool,
    disconnect_reason_code: Option<String>,
    disconnect_retryable: bool,
    resumed: bool,
    repair_status: Option<String>,
    snapshot_repaired: bool,
    snapshot_stale: bool,
}

fn collect_remote_channel_facts(owner_runs: &[AgentRun]) -> Vec<RemoteChannelFact> {
    owner_runs
        .iter()
        .filter_map(remote_channel_fact_from_agent_run)
        .collect()
}

fn remote_channel_fact_from_agent_run(run: &AgentRun) -> Option<RemoteChannelFact> {
    let metadata = parse_agent_run_metadata_value(run)?;
    let candidates = remote_task_metadata_candidates(&metadata);
    if candidates.is_empty() {
        return None;
    }

    let remote_task_id = first_json_string_from_candidates(
        &candidates,
        &["remoteTaskId", "remote_task_id", "taskId", "task_id"],
    )?;
    let channel = first_json_string_from_candidates(&candidates, &["channel", "provider"]);
    let account_id = first_json_string_from_candidates(&candidates, &["accountId", "account_id"]);
    let source = first_json_string_from_candidates(&candidates, &["source"])
        .or_else(|| Some(run.source.clone()));
    let remote_event = first_json_string_from_candidates(
        &candidates,
        &[
            "event",
            "remoteEvent",
            "remote_event",
            "taskEvent",
            "task_event",
            "lifecycleEvent",
            "lifecycle_event",
        ],
    );
    let remote_status = first_json_string_from_candidates(
        &candidates,
        &[
            "runtimeStatus",
            "runtime_status",
            "taskStatus",
            "task_status",
            "remoteStatus",
            "remote_status",
            "status",
            "state",
            "phase",
        ],
    );
    let snapshot_status = first_json_string_from_candidates(
        &candidates,
        &[
            "snapshotStatus",
            "snapshot_status",
            "snapshotRepairStatus",
            "snapshot_repair_status",
            "repairStatus",
            "repair_status",
        ],
    );
    let snapshot_ref = first_json_string_from_candidates(
        &candidates,
        &["snapshotRef", "snapshot_ref", "snapshotUri", "snapshot_uri"],
    );
    let replay_ref = first_json_string_from_candidates(&candidates, &["replayRef", "replay_ref"]);
    let repair_status = first_json_string_from_candidates(
        &candidates,
        &[
            "repairStatus",
            "repair_status",
            "snapshotRepairStatus",
            "snapshot_repair_status",
        ],
    )
    .or_else(|| snapshot_status.clone());
    let disconnected = remote_channel_disconnected(run, &candidates);
    let resumed = remote_channel_resumed(&candidates);
    let snapshot_repaired = remote_channel_snapshot_repaired(&candidates);

    Some(RemoteChannelFact {
        run_id: run.id.clone(),
        source,
        source_ref: run.source_ref.clone(),
        session_id: run.session_id.clone(),
        run_status: run.status.as_str().to_string(),
        remote_task_id,
        channel,
        account_id,
        remote_event,
        remote_status,
        snapshot_status,
        snapshot_ref,
        replay_ref,
        disconnected,
        disconnect_reason_code: remote_channel_disconnect_reason(run, &candidates),
        disconnect_retryable: !matches!(run.status, AgentRunStatus::Canceled),
        resumed,
        repair_status,
        snapshot_repaired,
        snapshot_stale: remote_channel_snapshot_stale(&candidates),
    })
}

fn parse_agent_run_metadata_value(run: &AgentRun) -> Option<Value> {
    run.metadata
        .as_deref()
        .and_then(|metadata| serde_json::from_str::<Value>(metadata).ok())
        .filter(Value::is_object)
}

fn remote_task_metadata_candidates(metadata: &Value) -> Vec<&Value> {
    [
        "/source_metadata/remote_task",
        "/source_metadata/remoteTask",
        "/sourceMetadata/remote_task",
        "/sourceMetadata/remoteTask",
        "/remote_task",
        "/remoteTask",
    ]
    .iter()
    .filter_map(|path| metadata.pointer(path))
    .filter(|value| value.is_object())
    .collect()
}

fn first_json_string_from_candidates(candidates: &[&Value], keys: &[&str]) -> Option<String> {
    candidates.iter().find_map(|candidate| {
        keys.iter()
            .find_map(|key| json_string_field(candidate, key.as_ref()))
    })
}

fn first_json_bool_from_candidates(candidates: &[&Value], keys: &[&str]) -> Option<bool> {
    candidates
        .iter()
        .find_map(|candidate| keys.iter().find_map(|key| json_bool_field(candidate, key)))
}

fn remote_channel_tokens(candidates: &[&Value]) -> Vec<String> {
    let token_keys = [
        "event",
        "remoteEvent",
        "remote_event",
        "taskEvent",
        "task_event",
        "lifecycleEvent",
        "lifecycle_event",
        "runtimeStatus",
        "runtime_status",
        "taskStatus",
        "task_status",
        "remoteStatus",
        "remote_status",
        "status",
        "state",
        "phase",
        "snapshotStatus",
        "snapshot_status",
        "snapshotRepairStatus",
        "snapshot_repair_status",
        "repairStatus",
        "repair_status",
    ];
    candidates
        .iter()
        .flat_map(|candidate| {
            token_keys
                .iter()
                .filter_map(|key| json_string_field(candidate, key))
        })
        .map(|value| normalize_remote_channel_token(value.as_str()))
        .collect()
}

fn normalize_remote_channel_token(value: &str) -> String {
    value
        .trim()
        .to_ascii_lowercase()
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '_' })
        .collect::<String>()
        .split('_')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("_")
}

fn remote_channel_has_any_token(candidates: &[&Value], expected: &[&str]) -> bool {
    let tokens = remote_channel_tokens(candidates);
    tokens
        .iter()
        .any(|token| expected.iter().any(|expected| token == expected))
}

fn remote_channel_disconnected(run: &AgentRun, candidates: &[&Value]) -> bool {
    matches!(
        run.status,
        AgentRunStatus::Error | AgentRunStatus::Canceled | AgentRunStatus::Timeout
    ) || first_json_bool_from_candidates(
        candidates,
        &[
            "disconnected",
            "channelDisconnected",
            "channel_disconnected",
            "connectionLost",
            "connection_lost",
        ],
    )
    .unwrap_or(false)
        || remote_channel_has_any_token(
            candidates,
            &[
                "disconnected",
                "disconnect",
                "connection_lost",
                "transport_disconnected",
                "offline",
                "stale",
            ],
        )
}

fn remote_channel_disconnect_reason(run: &AgentRun, candidates: &[&Value]) -> Option<String> {
    first_json_string_from_candidates(
        candidates,
        &[
            "reasonCode",
            "reason_code",
            "disconnectReason",
            "disconnect_reason",
        ],
    )
    .or_else(|| run.error_code.clone())
    .or_else(|| match run.status {
        AgentRunStatus::Timeout => Some("timeout".to_string()),
        AgentRunStatus::Canceled => Some("canceled".to_string()),
        AgentRunStatus::Error => Some("remote_run_error".to_string()),
        AgentRunStatus::Queued | AgentRunStatus::Running | AgentRunStatus::Success => None,
    })
}

fn remote_channel_resumed(candidates: &[&Value]) -> bool {
    first_json_bool_from_candidates(
        candidates,
        &[
            "resumed",
            "channelResumed",
            "channel_resumed",
            "snapshotResumed",
            "snapshot_resumed",
        ],
    )
    .unwrap_or(false)
        || remote_channel_has_any_token(
            candidates,
            &[
                "resumed",
                "resume",
                "reconnected",
                "reconnect",
                "channel_resumed",
            ],
        )
}

fn remote_channel_snapshot_repaired(candidates: &[&Value]) -> bool {
    first_json_bool_from_candidates(
        candidates,
        &[
            "snapshotRepaired",
            "snapshot_repaired",
            "repaired",
            "snapshotRecovered",
            "snapshot_recovered",
        ],
    )
    .unwrap_or(false)
        || remote_channel_has_any_token(
            candidates,
            &[
                "snapshot_repaired",
                "repaired",
                "repair_completed",
                "snapshot_recovered",
                "recovered",
            ],
        )
}

fn remote_channel_snapshot_stale(candidates: &[&Value]) -> bool {
    first_json_bool_from_candidates(candidates, &["stale", "snapshotStale", "snapshot_stale"])
        .unwrap_or(false)
        || remote_channel_has_any_token(candidates, &["stale", "snapshot_stale"])
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
